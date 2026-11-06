import {
  BarChart3, CircleHelp, Database, Eye, EyeOff, KeyRound, LogOut, Server, ShieldCheck, Table2, UserRound, Warehouse,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nod, pop, presence, rise, stage } from "./motion";
import { Tour, tourSeen, type Step } from "./Tour";
import { Card, CTP, SHADES, SignIn, Stat, Swap, Title, tooltip } from "./ui";

type Me = { user: string; scp: string; snowflake_user: string };
type View = {
  user: string;
  claims: { snowflake_user: string; scp: string; aud: string };
  identity: { USER: string; ROLE: string; WAREHOUSE: string; DATABASE: string };
  regions: { REGION: string; ORDERS: number; REVENUE: number | null }[];
};

const TITLE = "A database per tenant.";
const USERS: [string, string, string][] = [
  ["barney", "duff123", "Duff Beer · admin"],
  ["moe", "duff123", "Duff Beer · viewer"],
  ["marge", "krusty123", "Krusty Burger · admin"],
  ["homer", "krusty123", "Krusty Burger · viewer"],
];
const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
const compact = (v: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

const STEPS: Step[] = [
  {
    title: "Isolation by structure",
    body: (
      <>
        Each tenant gets its <b>own database and warehouse</b>, stood up by a stored procedure. There's no shared table
        and no entitlements join to get wrong. Here's how a login lands in the right one.
      </>
    ),
  },
  {
    target: "token",
    title: "The token picks the role",
    body: (
      <>
        Keycloak signs your token with <code>snowflake_user</code> and <code>scp</code>. Snowflake verifies it over
        External OAuth and activates exactly the role in <code>scp</code>.
      </>
    ),
  },
  {
    target: "role",
    title: "One role per tenant and level",
    body: (
      <>
        The role has grants on <b>its tenant's database only</b>. Other tenants' databases aren't filtered out; they're
        simply unreachable from this role.
      </>
    ),
  },
  {
    target: "database",
    title: "Its own database and compute",
    body: (
      <>
        The backend routes the session to this tenant's database and warehouse, so a heavy tenant can't slow down its
        neighbors and its compute is billed on its own.
      </>
    ),
  },
  {
    target: "revenue",
    title: "Admins vs viewers",
    body: (
      <>
        A <b>masking policy</b> in each tenant's database returns <code>amount</code> only for roles ending in{" "}
        <code>_ADMIN</code>. Viewers see the same rows with revenue hidden.
      </>
    ),
  },
  {
    target: "regions",
    title: "Same query, different database",
    body: (
      <>
        This is a plain <code>GROUP BY</code> over <code>serving.sales</code>. Run as another tenant, the identical SQL
        reads a different database entirely.
      </>
    ),
  },
  {
    target: "replay",
    title: "You're set",
    body: <>Sign out and in as a user from the other tenant, or as a viewer, to compare. Replay this tour from here any time.</>,
  },
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { setMe(m); if (m && !tourSeen("opt.tour")) setTouring(true); })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!me) return;
    fetch("/api/view").then(async (r) => {
      const body = await r.json();
      r.ok ? setView(body) : setErr(body.error ?? r.statusText);
    }).catch((e: Error) => setErr(e.message));
  }, [me]);

  const signOut = async () => {
    const { logoutUrl } = await fetch("/auth/logout", { method: "POST" }).then((r) => r.json());
    window.location.href = logoutUrl; // end the Keycloak SSO session too
  };

  if (!ready) return null;
  if (!me)
    return (
      <SignIn icon={<Database size={22} />} title={TITLE} users={USERS}
              blurb={<>Sign in as any user below. Each tenant has <b>its own database and warehouse</b>; your token selects a
                role that can reach only yours, and viewers have revenue masked.</>} />
    );

  const masked = !!view && view.regions.length > 0 && view.regions.every((r) => r.REVENUE === null);
  const role = view?.identity.ROLE ?? me.scp?.replace(/^session:role:/, "") ?? "…";
  const orders = view?.regions.reduce((s, r) => s + r.ORDERS, 0) ?? 0;

  return (
    <motion.div className="app" variants={stage(0.09, 0.05)} {...presence}>
      <header>
        <Title icon={<Database size={22} />} text={TITLE} />
        <motion.div className="header-actions" variants={pop}>
          <span className="who"><UserRound size={14} /> <b>{me.user}</b></span>
          <button className="ghost" onClick={() => setTouring(true)} data-tour="replay"><CircleHelp size={16} /> Take the tour</button>
          <button className="ghost" onClick={signOut}><LogOut size={16} /> Sign out</button>
        </motion.div>
      </header>

      <motion.section className="hero" variants={stage(0.08, 0)}>
        <Stat tour="role" icon={<ShieldCheck size={13} />} label="Active role" value={<span className="stat-value small-value">{role}</span>}
              vkey={role} react={view ? nod : undefined} reactKey={view ? "loaded" : "loading"} caption={<>Chosen by the token's <b>scp</b> claim</>} />
        <Stat tour="database" icon={<Database size={13} />} label="Database" value={view?.identity.DATABASE ?? "…"}
              caption={<>Only database this role can reach</>} />
        <Stat icon={<Warehouse size={13} />} label="Warehouse" value={view?.identity.WAREHOUSE ?? "…"}
              caption={<>Dedicated compute · {view ? compact(orders) : "…"} orders</>} />
        <Stat tour="revenue" icon={masked ? <EyeOff size={13} /> : <Eye size={13} />} label="Revenue"
              value={!view ? "…" : masked ? "Restricted" : "Visible"} tone={!view ? undefined : masked ? "warn" : "ok"}
              caption={masked ? <>Masked to <b>NULL</b> for viewers</> : <>Unmasked for <b>_ADMIN</b> roles</>} />
      </motion.section>

      {err ? (
        <motion.div variants={pop}><Card wide icon={<Server size={16} />} title="Couldn't load the view" error={err}>{null}</Card></motion.div>
      ) : (
        <motion.main className="grid" variants={stage(0.1, 0)}>
          <Card tour="token" icon={<KeyRound size={16} />} title="Token asserts" meta="decoded by the BFF · verified by Snowflake">
            <dl className="facts">
              <dt>snowflake_user</dt><dd className="mono">{view?.claims.snowflake_user ?? me.snowflake_user}</dd>
              <dt>scp</dt><dd className="mono">{view?.claims.scp ?? me.scp}</dd>
              <dt>aud</dt><dd className="mono">{view ? String(view.claims.aud) : "…"}</dd>
            </dl>
          </Card>
          <Card icon={<Server size={16} />} title="Snowflake resolved" meta="CURRENT_USER() · CURRENT_ROLE()">
            <dl className="facts">
              <dt>User</dt><dd className="mono">{view?.identity.USER ?? "…"}</dd>
              <dt>Role</dt><dd className="mono">{view?.identity.ROLE ?? "…"}</dd>
              <dt>Database</dt><dd className="mono">{view?.identity.DATABASE ?? "…"}</dd>
              <dt>Warehouse</dt><dd className="mono">{view?.identity.WAREHOUSE ?? "…"}</dd>
            </dl>
          </Card>
          <Card tour="regions" wide icon={<BarChart3 size={16} />} title={`${masked ? "Orders" : "Revenue"} by region`}
                meta={<Swap k={String(masked)}>{masked ? <span className="state warn"><EyeOff size={11} /> revenue masked</span>
                  : <span className="state ok"><Eye size={11} /> revenue</span>}</Swap>}>
            {!view ? <p className="muted">Querying Snowflake…</p> : <Regions v={view} masked={masked} />}
          </Card>
        </motion.main>
      )}

      <motion.footer variants={pop}>
        <span className="muted"><KeyRound size={12} /> External OAuth · token-scoped session per request</span>
        <span className="muted">Per-tenant objects created by <code>opt_admin_db</code> stored procedures</span>
      </motion.footer>
      <Tour steps={STEPS} storageKey="opt.tour" open={touring} onClose={() => setTouring(false)} />
    </motion.div>
  );
}

function Regions({ v, masked }: { v: View; masked: boolean }) {
  const key = masked ? "ORDERS" : "REVENUE";
  const axis = { stroke: CTP.overlay1, fontSize: 12, tickLine: false, axisLine: false } as const;
  return (
    <div className="grid">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={v.regions}>
          <CartesianGrid vertical={false} stroke={CTP.surface1} />
          <XAxis dataKey="REGION" {...axis} />
          <YAxis {...axis} width={56} tickFormatter={(x) => (masked ? compact(x) : `$${compact(x)}`)} />
          <Tooltip cursor={{ fill: CTP.surface1 }} {...tooltip} formatter={(x: number) => (masked ? x.toLocaleString() : money(x))} />
          <Bar dataKey={key} radius={[6, 6, 0, 0]} animationDuration={700} animationEasing="ease-out">
            {v.regions.map((_, i) => <Cell key={i} fill={SHADES[i % SHADES.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table>
        <thead><tr><th><Table2 size={12} /> Region</th><th className="num">Orders</th><th className="num">Revenue</th></tr></thead>
        <motion.tbody variants={stage(0.05, 0.15)} initial="hidden" animate="shown">
          <AnimatePresence>
            {v.regions.map((r) => (
              <motion.tr key={r.REGION} variants={rise}>
                <td>{r.REGION}</td>
                <td className="num">{r.ORDERS.toLocaleString()}</td>
                <td className="num">{r.REVENUE === null ? <span className="restricted"><EyeOff size={11} /> restricted</span> : money(r.REVENUE)}</td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
}
