import { Elysia } from "elysia";
import { authorizeUrl, challenge, exchangeCode, logoutUrl, pkceVerifier } from "./oidc";
import * as store from "./session";
import { query, decodeClaims } from "./db";

const SID = "opt_sid";
const BASE = process.env.APP_BASE_URL!;
const port = Number(process.env.SERVER_PORT) || 8001;
const to = (set: any, url: string) => { set.status = 302; set.headers["Location"] = url; return ""; };
const sid = (req: Request) => store.readCookie(req.headers.get("cookie"), SID);

new Elysia()
  .onRequest(({ request }) => {
    console.log(`--> ${request.method} ${new URL(request.url).pathname}`);
  })
  .onError(({ code, error, request }) => {
    const path = new URL(request.url).pathname;
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[error] ${request.method} ${path} (${code}): ${detail}`);
  })
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
  .get("/auth/me", ({ request, set }) => {
    const s = store.getSession(sid(request));
    if (!s) { set.status = 401; return { error: "anonymous" }; }
    const c = decodeClaims(s.tokens.access_token);
    return { user: c.preferred_username ?? c.name, scp: c.scp, snowflake_user: c.snowflake_user };
  })
  .post("/auth/logout", ({ request, set }) => {
    const id = sid(request);
    const s = store.getSession(id);
    if (id) store.dropSession(id);
    set.headers["Set-Cookie"] = store.cookie(SID, "", 0);
    return { logoutUrl: s ? String(logoutUrl(s.tokens.id_token)) : BASE };
  })
  .get("/api/view", async ({ request, set }) => {
    const s = store.getSession(sid(request));
    if (!s) { set.status = 401; return { error: "anonymous" }; }
    try {
      const token = await store.freshToken(s);
      const claims = decodeClaims(token);
      const [identity] = await query(token,
        `SELECT CURRENT_USER() AS "USER", CURRENT_ROLE() AS "ROLE", CURRENT_WAREHOUSE() AS "WAREHOUSE",`);
      const regions = await query(token,
        `SELECT region AS "REGION", COUNT(*) AS "ORDERS", ROUND(SUM(amount),2) AS "REVENUE"
         FROM serving.sales GROUP BY region ORDER BY "ORDERS" DESC`);
      return {
        user: claims.preferred_username ?? claims.name,
        claims: { snowflake_user: claims.snowflake_user, scp: claims.scp, aud: claims.aud },
        identity, regions,
      };
    } catch (err) {
      console.error("[/api/view]", err instanceof Error ? err.stack ?? err.message : err);
      set.status = 500;
      return { error: err instanceof Error ? err.message : String(err) };
    }
  })
  .listen({ port, hostname: "0.0.0.0" });
console.log(`bff on ${port}`);
