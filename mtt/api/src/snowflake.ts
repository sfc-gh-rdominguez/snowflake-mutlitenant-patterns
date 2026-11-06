import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

// The BFF is the only thing that talks to Snowflake, always as one service user
// (MTT_APP_SVC) with a key pair. End users never get a Snowflake identity; the
// BFF names them in an immutable session attribute and the policies do the rest.
const HOST = process.env.SNOWFLAKE_HOST!;
const ACCOUNT = process.env.SNOWFLAKE_ACCOUNT!.toUpperCase().replace(/\..*$/, "");
const USER = (process.env.SNOWFLAKE_USER ?? "MTT_APP_SVC").toUpperCase();
const WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE ?? "MTT_WH";
const DATABASE = process.env.SNOWFLAKE_DATABASE ?? "MTT_DB";
const SCHEMA = process.env.SNOWFLAKE_SCHEMA ?? "SERVING";
const ROLE = process.env.SNOWFLAKE_ROLE ?? "MTT_APP_ROLE";

const key = createPrivateKey(readFileSync(process.env.SNOWFLAKE_PRIVATE_KEY_PATH ?? "/run/secrets/app_svc.p8"));
const fingerprint = "SHA256:" + createHash("sha256")
  .update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("base64");

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
let cached: { jwt: string; exp: number } | undefined;
const jwt = () => {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.jwt;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({
    iss: `${ACCOUNT}.${USER}.${fingerprint}`, sub: `${ACCOUNT}.${USER}`, iat: now, exp: now + 3600,
  }));
  const sig = b64url(sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key));
  cached = { jwt: `${head}.${body}.${sig}`, exp: now + 3600 };
  return cached.jwt;
};

const headers = () => ({
  Authorization: `Bearer ${jwt()}`,
  "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  "Content-Type": "application/json",
  Accept: "application/json",
});

// end_user_id always comes from the server-side session, but it's still spliced
// into SQL below (SQL API multi-statement requests can't bind), so allowlist it.
const SAFE_ID = /^[A-Za-z0-9._@-]{1,128}$/;
export const assertEndUser = (id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("invalid end user id");
  return id;
};

type RowType = { name: string; type: string };
type Result = { resultSetMetaData?: { rowType: RowType[] }; data?: (string | null)[][]; statementHandles?: string[] };
const coerce = (raw: string | null, t: string) =>
  raw === null ? null : t === "fixed" || t === "real" ? Number(raw) : t === "boolean" ? raw === "true" : raw;
const rows = <T>(p: Result): T[] => {
  const rt = p.resultSetMetaData?.rowType ?? [];
  return (p.data ?? []).map((row) => {
    const o: Record<string, unknown> = {};
    rt.forEach((c, i) => (o[c.name] = coerce(row[i] ?? null, c.type)));
    return o as T;
  });
};

const api = async (path: string, init?: RequestInit): Promise<Result> => {
  const res = await fetch(`https://${HOST}${path}`, { ...init, headers: headers() });
  if (res.status !== 200) throw new Error(`SQL API ${res.status}: ${await res.text()}`);
  return (await res.json()) as Result;
};

// Each call is one SQL API request = one fresh Snowflake session: set the
// attribute, then run the query. Nothing is pooled across end users.
export const queryAs = async <T = Record<string, unknown>>(endUserId: string, statement: string): Promise<T[]> => {
  const id = assertEndUser(endUserId);
  const p = await api("/api/v2/statements", {
    method: "POST",
    body: JSON.stringify({
      statement: `CALL SET_SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id', '${id}');\n${statement}`,
      timeout: 60, role: ROLE, warehouse: WAREHOUSE, database: DATABASE, schema: SCHEMA,
      parameters: { MULTI_STATEMENT_COUNT: "2" },
    }),
  });
  const last = p.statementHandles?.at(-1);
  return rows<T>(last ? await api(`/api/v2/statements/${last}`) : p);
};

// Cortex Agent REST run. The attribute is immutable for the run, so neither the
// generated SQL nor any tool can change who the policies think the user is.
export const runAgent = (endUserId: string, messages: unknown[]) =>
  fetch(`https://${HOST}/api/v2/databases/${DATABASE}/schemas/${SCHEMA}/agents/SALES_AGENT:run`, {
    method: "POST",
    headers: { ...headers(), Accept: "text/event-stream" },
    body: JSON.stringify({
      messages, stream: true,
      variables: {
        end_user_id: { value: assertEndUser(endUserId), type: "string", is_immutable_session_attribute: true },
      },
    }),
  });

export const whoami = () => ({ account: ACCOUNT, user: USER, role: ROLE });
