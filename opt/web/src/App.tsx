import { useEffect, useState } from "react";

type Me = { user: string; scp: string; snowflake_user: string };
type View = {
  user: string;
  claims: { snowflake_user: string; scp: string; aud: string };
  identity: { USER: string; ROLE: string; WAREHOUSE: string };
  regions: { REGION: string; ORDERS: number; REVENUE: number | null }[];
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!me) return;
    fetch("/api/view").then((r) => r.json()).then(setView);
  }, [me]);

  const signOut = async () => {
    const { logoutUrl } = await fetch("/auth/logout", { method: "POST" }).then((r) => r.json());
    window.location.href = logoutUrl; // end the Keycloak SSO session too
  };

  if (!ready) return null;

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 760 }}>
      {!me ? (
        <a href="/auth/login">Sign in</a>
      ) : (
        <>
          <p>
            Signed in as <strong>{me.user}</strong> · <button onClick={signOut}>Sign out</button>
          </p>
          {view && (
            <>
              <h3>Token asserts</h3>
              <pre style={{ background: "#f4f4f4", padding: "1rem" }}>{JSON.stringify(view.claims, null, 2)}</pre>
              <h3>Snowflake resolved</h3>
              <p>
                User <strong>{view.identity.USER}</strong>, role <strong>{view.identity.ROLE}</strong>.
              </p>
              <h3>Revenue by region</h3>
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Region", "Orders", "Revenue"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {view.regions.map((r) => (
                    <tr key={r.REGION}>
                      <td style={cell}>{r.REGION}</td>
                      <td style={cell}>{r.ORDERS.toLocaleString()}</td>
                      <td style={cell}>{r.REVENUE === null ? "— restricted —" : `$${r.REVENUE.toLocaleString()}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </main>
  );
}
const cell = { border: "1px solid #ccc", padding: "6px 10px", textAlign: "left" as const };
