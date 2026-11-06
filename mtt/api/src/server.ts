import { Elysia } from "elysia";
import { authorizeUrl, challenge, exchangeCode, logoutUrl, pkceVerifier } from "./oidc";
import * as store from "./session";
import { queryAs, runAgent, whoami } from "./snowflake";

const SID = "mtt_sid";
const BASE = process.env.APP_BASE_URL!;
const port = Number(process.env.SERVER_PORT) || 8001;
const to = (set: any, url: string) => { set.status = 302; set.headers["Location"] = url; return ""; };
const sid = (req: Request) => store.readCookie(req.headers.get("cookie"), SID);
const decodeClaims = (token: string): Record<string, unknown> => {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()); } catch { return {}; }
};

// The end user is whoever Keycloak authenticated for this server-side session.
// Never read it from the request body, query string, or the prompt.
const endUser = async (request: Request) => {
  const s = store.getSession(sid(request));
  if (!s) return undefined;
  const c = decodeClaims(await store.freshToken(s));
  return String(c.preferred_username ?? "");
};

new Elysia()
  .get("/healthcheck", () => "ok")
  .get("/auth/login", async ({ set }) => {
    const state = crypto.randomUUID();
    const verifier = pkceVerifier();
    store.putPending(state, verifier);
    return to(set, String(authorizeUrl(state, await challenge(verifier))));
  })
  .get("/auth/callback", async ({ query: q, set }) => {
    const verifier = store.takePending(String(q.state ?? ""));
    if (!verifier || !q.code) return to(set, `${BASE}/?error=login`);
    const tokens = await exchangeCode(String(q.code), verifier);
    const id = crypto.randomUUID();
    store.putSession(id, tokens);
    set.headers["Set-Cookie"] = store.cookie(SID, id);
    return to(set, BASE);
  })
  .get("/auth/me", async ({ request, set }) => {
    const user = await endUser(request);
    if (!user) { set.status = 401; return { error: "anonymous" }; }
    return { user };
  })
  .post("/auth/logout", ({ request, set }) => {
    const id = sid(request);
    const s = store.getSession(id);
    if (id) store.dropSession(id);
    set.headers["Set-Cookie"] = store.cookie(SID, "", 0);
    return { logoutUrl: s ? String(logoutUrl(s.tokens.id_token)) : BASE };
  })
  .get("/api/dashboard", async ({ request, set }) => {
    const user = await endUser(request);
    if (!user) { set.status = 401; return { error: "anonymous" }; }
    try {
      // Plain SQL with no tenant filter -- the row access policy supplies it.
      const [identity, regions, monthly, products] = await Promise.all([
        queryAs(user, `SELECT CURRENT_USER() AS "USER", CURRENT_ROLE() AS "ROLE",
          SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id') AS "END_USER",
          (SELECT LISTAGG(DISTINCT tenant_id, ',') FROM mtt_db.base.sales) AS "TENANT"`),
        queryAs(user, `SELECT region AS "REGION", COUNT(*) AS "ORDERS", ROUND(SUM(amount), 2) AS "REVENUE"
          FROM mtt_db.base.sales GROUP BY region ORDER BY region`),
        queryAs(user, `SELECT TO_CHAR(DATE_TRUNC('month', sale_ts), 'YYYY-MM') AS "MONTH",
          COUNT(*) AS "ORDERS", ROUND(SUM(amount), 2) AS "REVENUE"
          FROM mtt_db.base.sales GROUP BY 1 ORDER BY 1`),
        queryAs(user, `SELECT product AS "PRODUCT", SUM(quantity) AS "UNITS", ROUND(SUM(amount), 2) AS "REVENUE"
          FROM mtt_db.base.sales GROUP BY product ORDER BY "UNITS" DESC`),
      ]);
      return { user, snowflake: whoami(), identity: identity[0], regions, monthly, products };
    } catch (err) {
      set.status = 500;
      return { error: err instanceof Error ? err.message : String(err) };
    }
  })
  .post("/api/agent", async ({ request, body, set }) => {
    const user = await endUser(request);
    if (!user) { set.status = 401; return { error: "anonymous" }; }
    const messages = (body as { messages?: unknown[] })?.messages;
    if (!Array.isArray(messages) || messages.length === 0) { set.status = 400; return { error: "messages required" }; }
    const res = await runAgent(user, messages);
    // Per-user attribution: usage history only sees MTT_APP_SVC.
    console.log(JSON.stringify({ end_user_id: user, request_id: res.headers.get("x-snowflake-request-id"), status: res.status }));
    if (!res.ok || !res.body) { set.status = res.status || 502; return { error: await res.text() }; }
    return new Response(res.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  })
  .listen({ port, hostname: "0.0.0.0" });
console.log(`bff on ${port}`);
