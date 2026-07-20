import { Elysia } from "elysia";
import clients from "./clients.json";

const KEYCLOAK = process.env.KEYCLOAK_URL!;
const REALM = "tenants";

const resolve = () => ({
  host: process.env.SNOWFLAKE_HOST!,
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
});

const mint = async (tenant: string, cls: string): Promise<string> => {
  const key = `${tenant}:${cls}`;
  const creds = (clients as Record<string, { clientId: string; clientSecret: string }>)[key];
  if (!creds) throw new Error(`unknown tenant/class: ${key}`);
  const res = await fetch(`${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`keycloak ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
};

new Elysia()
  .get("/healthcheck", () => "ok")
  .get("/session/:tenant/:cls", async ({ params, set }) => {
    try {
      return { token: await mint(params.tenant, params.cls), ...resolve() };
    } catch (err) {
      set.status = 400;
      return { error: err instanceof Error ? err.message : String(err) };
    }
  })
  .listen({ port: 8090, hostname: "0.0.0.0" });
console.log("broker on 8090");
