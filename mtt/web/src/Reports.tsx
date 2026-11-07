import {
  Braces, Check, CircleAlert, Database, Download, Ellipsis, FileBarChart, LayoutTemplate, Lightbulb, LoaderCircle, Play, Save, Send, Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { bead, EASE, pop, presence, rise, stage } from "./motion";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { readSSE } from "./sse";
import { Card, CTP, Swap, tooltip } from "./ui";

type Section = {
  heading: string; subtitle: string; question: string; display: "kpi" | "table" | "bar" | "line" | "map";
  role: "hero" | "supporting" | "detail"; span: 1 | 2 | 3;
  format: "currency" | "count" | "percent"; emphasis: "top" | "max" | "latest" | "none";
  sort: "desc" | "asc" | "none"; limit: number; sql: string;
  columns: string[]; rows: Record<string, unknown>[]; insight?: string; error?: string;
};
type Report = { title: string; summary?: string; sections: Section[]; revenueMasked: boolean; draftId?: string; skipped?: string[] };
type Saved = { ID: string; TITLE: string; CREATED: string };
type PhaseId = "plan" | "sql" | "data" | "insight";
type Phase = { id: PhaseId; state: "active" | "done" | "error"; detail?: string };

const PHASES: Record<PhaseId, { icon: typeof Database; label: string }> = {
  plan: { icon: LayoutTemplate, label: "Designing the layout" },
  sql: { icon: Braces, label: "Writing SQL" },
  data: { icon: Database, label: "Gathering data" },
  insight: { icon: Lightbulb, label: "Writing takeaways" },
};

const SAMPLES = [
  "Quarterly business review: revenue trend, top products, and regional mix",
  "Units sold by product and month for 2024",
];

// Cortex writes the layout and SQL once; "Run" re-executes the saved SQL as you,
// so the same report shows each user only what the policies allow.
export function Reports({ user }: { user: string }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);

  const json = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? r.statusText);
    return body;
  };
  const refresh = useCallback(() => json("/api/reports").then((b) => setSaved(b.reports)).catch((e) => setErr(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);

  // Each phase mounts the first time the server mentions it, then updates in place.
  const stream = async (url: string, init?: RequestInit) => {
    setBusy(true); setErr(null); setReport(null); setPhases([]); setSaving("idle");
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      await readSSE(r.body, (event, data) => {
        if (event === "phase")
          setPhases((ps) => ps.some((p) => p.id === data.id) ? ps.map((p) => (p.id === data.id ? data : p)) : [...ps, data]);
        else if (event === "report") setReport(data);
        else if (event === "error") setErr(data.message);
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const generate = (p: string) => p.trim() && !busy && stream("/api/reports/draft", { method: "POST", body: JSON.stringify({ prompt: p }) });
  const open = (id: string) => !busy && stream(`/api/reports/${id}/run`);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const save = async () => {
    if (!report?.draftId || saving === "saving") return;
    setSaving("saving"); setErr(null);
    try {
      // Only an id means a row was written; anything else is a failed save.
      const { id } = await json("/api/reports", { method: "POST", body: JSON.stringify({ draftId: report.draftId }) });
      if (typeof id !== "string") throw new Error("Save didn't return a report id");
      setSaving("saved"); setReport({ ...report, draftId: undefined }); refresh();
    } catch (e) { setSaving("idle"); setErr(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const drop = async (id: string) => {
    try { await json(`/api/reports/${id}`, { method: "DELETE" }); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Card wide icon={<FileBarChart size={16} />} title="Custom reports" meta="AI_COMPLETE structured output · Cortex Analyst">
      <form className="composer" onSubmit={(e) => { e.preventDefault(); generate(prompt); }}>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the report you want…" disabled={busy} />
        <button className="primary" disabled={busy || !prompt.trim()} aria-label="Generate"><Send size={16} /></button>
      </form>
      <div className="report-picks">
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="chip" disabled={busy} onClick={() => { setPrompt(s); generate(s); }}>{s}</button>
        ))}
        <AnimatePresence initial={false}>
          {saved.map((s) => (
            <motion.span key={s.ID} className="chip saved" variants={bead} {...presence} layout>
              <button type="button" disabled={busy} onClick={() => open(s.ID)} title={`Saved ${s.CREATED}`}><Play size={12} /> {s.TITLE}</button>
              <button type="button" disabled={busy} onClick={() => drop(s.ID)} aria-label={`Delete ${s.TITLE}`}><Trash2 size={12} /></button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {busy && phases.length > 0 ? <PhaseTrack key="phases" phases={phases} />
          : report ? <ReportView key={report.title} r={report} onSave={save} saving={saving} user={user} />
          : null}
      </AnimatePresence>
      <AnimatePresence>{err && <motion.p key="err" className="error" variants={rise} {...presence}>{err}</motion.p>}</AnimatePresence>
    </Card>
  );
}

function PhaseTrack({ phases }: { phases: Phase[] }) {
  return (
    <motion.ol className="phases" variants={stage(0.05, 0)} {...presence}>
      <AnimatePresence initial={false}>
        {phases.map((p) => {
          const { icon: Icon, label } = PHASES[p.id];
          return (
            <motion.li key={p.id} className={`phase ${p.state}`} variants={pop} {...presence} layout="position">
              <span className="phase-icon">
                <AnimatePresence mode="popLayout" initial={false}>
                  {p.state === "active" ? (
                    <motion.span key="active" variants={bead} {...presence}>
                      <motion.span className="phase-glyph" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.2, repeat: Infinity, ease: EASE }}>
                        <Icon size={16} />
                      </motion.span>
                      <LoaderCircle className="phase-ring" size={34} strokeWidth={1.25} />
                    </motion.span>
                  ) : (
                    <motion.span key={p.state} variants={bead} {...presence}>
                      {p.state === "done" ? <Check size={16} /> : <CircleAlert size={16} />}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="phase-label">{label}</span>
              {p.detail && <span className="phase-detail"><Swap k={p.detail}>{p.detail}</Swap></span>}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ol>
  );
}

function ReportView({ r, onSave, saving, user }: { r: Report; onSave: () => void; saving: "idle" | "saving" | "saved"; user: string }) {
  const el = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState<"idle" | "busy" | "failed">("idle");
  const exportPdf = async () => {
    if (!el.current || exporting === "busy") return;
    setExporting("busy");
    try {
      const { exportReportPdf } = await import("./pdf");
      await exportReportPdf(el.current, { title: r.title, user, background: CTP.surface0, ink: CTP.overlay1 });
      setExporting("idle");
    } catch (e) {
      console.error(e); setExporting("failed");
    }
  };
  const hero = r.sections.filter((s) => s.role === "hero" && !s.error && s.rows.length === 1);
  const rest = r.sections.filter((s) => !hero.includes(s));
  return (
    <motion.article ref={el} className="report" variants={stage(0.07, 0.02)} {...presence}>
      <motion.header className="report-head" variants={rise} data-pdf-block>
        <div>
          <h3>{r.title}</h3>
          {r.summary && <p className="report-summary">{r.summary}</p>}
        </div>
        <div className="report-actions no-pdf">
          <button className="ghost" onClick={exportPdf} disabled={exporting === "busy"}>
            <Swap k={exporting}>
              {exporting === "busy" ? <><LoaderCircle size={14} className="spin" /> Exporting</>
                : exporting === "failed" ? <><CircleAlert size={14} /> Export failed, retry</>
                : <><Download size={14} /> Export PDF</>}
            </Swap>
          </button>
        <AnimatePresence>
          {(r.draftId || saving === "saved") && (
            <motion.button key="save" className="primary" variants={bead} {...presence} onClick={onSave} disabled={saving !== "idle"}>
              <Swap k={saving}>
                {saving === "saving" ? <><LoaderCircle size={14} className="spin" /> Saving</>
                  : saving === "saved" ? <><Check size={14} /> Saved</>
                  : <><Save size={14} /> Save report</>}
              </Swap>
            </motion.button>
          )}
        </AnimatePresence>
        </div>
      </motion.header>
      {r.skipped?.map((s) => <motion.p key={s} className="dim small" variants={rise} data-pdf-block>Skipped {s}</motion.p>)}
      {hero.length > 0 && (
        <div className="report-hero" data-pdf-block style={{ gridTemplateColumns: `repeat(${Math.min(hero.length, 4)}, minmax(0, 1fr))` }}>
          {hero.map((s, i) => <Kpi key={i} s={s} masked={r.revenueMasked} />)}
        </div>
      )}
      <div className="report-grid">
        {rest.map((s, i) => <Panel key={i} s={s} masked={r.revenueMasked} />)}
      </div>
      {r.revenueMasked && <motion.p className="dim small" variants={rise} data-pdf-block>Revenue is masked for your access level, so it reads as restricted.</motion.p>}
    </motion.article>
  );
}

// ---------- formatting: the renderer, not the model, decides how numbers read ----------

type Fmt = Section["format"];
const isNum = (v: unknown): v is number => typeof v === "number";
const colFormat = (col: string, fallback: Fmt): Fmt =>
  /REVENUE|AMOUNT|SALES_VALUE|AOV|ORDER_VALUE/i.test(col) ? "currency"
    : /PCT|PERCENT|SHARE|RATE|RATIO/i.test(col) ? "percent"
    : /COUNT|ORDERS|UNITS|QUANTITY/i.test(col) ? "count" : fallback;
const fmt = (v: number, f: Fmt, compact = false) => {
  const c = compact && Math.abs(v) >= 10_000;
  if (f === "percent") return `${(Math.abs(v) <= 1 ? v * 100 : v).toFixed(1)}%`;
  const n = Intl.NumberFormat("en", c ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: f === "currency" ? 0 : 1 }).format(v);
  return f === "currency" ? `$${n}` : n;
};
const label = (col: string) => col.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const Masked = ({ masked }: { masked: boolean }) => (masked ? <span className="restricted">Restricted</span> : <span className="dim">—</span>);

function Kpi({ s, masked }: { s: Section; masked: boolean }) {
  const col = s.columns.find((c) => isNum(s.rows[0][c]) || s.rows[0][c] === null) ?? s.columns[0];
  const v = s.rows[0][col];
  return (
    <motion.div className="kpi-card" variants={pop}>
      <span className="kpi-label">{s.heading}</span>
      <span className="kpi-value">{isNum(v) ? fmt(v, colFormat(col, s.format), true) : v === null ? <Masked masked={masked} /> : String(v)}</span>
      <span className="kpi-sub">{s.insight ?? s.subtitle}</span>
      <SqlPeek sql={s.sql} />
    </motion.div>
  );
}

function Panel({ s, masked }: { s: Section; masked: boolean }) {
  // Columns come from the result, not the model, so a chart can't point at a column that doesn't exist.
  const x = s.columns.find((c) => !s.rows.every((r) => isNum(r[c]) || r[c] === null)) ?? s.columns[0];
  const ys = s.columns.filter((c) => c !== x && s.rows.some((r) => isNum(r[c])));
  const chart = (s.display === "bar" || s.display === "line") && ys.length > 0 && s.rows.length > 1;
  // A map only draws when the result really is one row per known region; otherwise it's a bar chart.
  const map = s.display === "map" && ys.length > 0 && s.rows.length > 0 && s.rows.every((r) => regionOf(r[x]));
  const span = s.display === "kpi" ? 1 : s.role === "detail" ? 3 : s.span;
  return (
    <motion.section className="panel" style={{ gridColumn: `span ${span}` }} variants={pop} data-pdf-block>
      <header className="panel-head">
        <div>
          <h4>{s.heading}</h4>
          {s.subtitle && <p className="panel-sub">{s.subtitle}</p>}
        </div>
        <SqlPeek sql={s.sql} />
      </header>
      {s.insight && <p className="panel-insight"><Lightbulb size={13} /> {s.insight}</p>}
      {s.error ? <p className="error">{s.error}</p>
        : s.rows.length === 0 ? <p className="dim">No rows in this range.</p>
        : map ? <RegionMap s={s} x={x} y={ys[0]} />
        : s.display === "map" && ys.length > 0 && s.rows.length > 1 ? <Bars s={{ ...s, sort: "desc" }} x={x} y={ys[0]} />
        : chart && s.display === "bar" ? <Bars s={s} x={x} y={ys[0]} />
        : chart ? <Lines s={s} x={x} ys={ys} />
        : <Table s={s} masked={masked} />}
    </motion.section>
  );
}

// Gray by default; the one accent color only marks what the model asked to emphasise.
const MUTED = CTP.surface1;
const ACCENT = CTP.blue;
const axis = { stroke: CTP.overlay0, fontSize: 12, tickLine: false, axisLine: false } as const;

function Bars({ s, x, y }: { s: Section; x: string; y: string }) {
  const f = colFormat(y, s.format);
  let data = s.rows.map((r) => ({ name: String(r[x]), value: isNum(r[y]) ? r[y] : 0 }));
  if (s.sort !== "none") data.sort((a, b) => (s.sort === "desc" ? b.value - a.value : a.value - b.value));
  const limit = s.limit > 0 ? s.limit : 8;
  if (data.length > limit) {
    const other = data.slice(limit - 1).reduce((n, d) => n + d.value, 0);
    data = [...data.slice(0, limit - 1), { name: "Other", value: other }];
  }
  const max = Math.max(...data.map((d) => d.value));
  const cutoff = [...data].map((d) => d.value).sort((a, b) => b - a)[Math.min(3, Math.ceil(data.length / 3)) - 1];
  const accent = (d: { name: string; value: number }, i: number) =>
    s.emphasis === "top" ? d.name !== "Other" && d.value >= cutoff
      : s.emphasis === "max" ? d.value === max
      : s.emphasis === "latest" ? i === data.length - 1 : true;
  const horizontal = data.length > 5 || data.some((d) => d.name.length > 10);
  return (
    <ResponsiveContainer width="100%" height={horizontal ? Math.max(180, data.length * 34) : 220}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 18, right: 48, left: 0, bottom: 0 }}>
        {horizontal ? (
          <><XAxis type="number" hide /><YAxis type="category" dataKey="name" {...axis} width={96} /></>
        ) : (
          <><CartesianGrid vertical={false} stroke={CTP.surface0} /><XAxis dataKey="name" {...axis} /><YAxis hide /></>
        )}
        <Tooltip cursor={{ fill: CTP.surface0 }} {...tooltip} formatter={(v: number) => fmt(v, f)} />
        <Bar dataKey="value" radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} animationDuration={700} animationEasing="ease-out">
          {data.map((d, i) => <Cell key={i} fill={accent(d, i) ? ACCENT : MUTED} />)}
          <LabelList dataKey="value" position={horizontal ? "right" : "top"} formatter={(v: number) => fmt(v, f, true)}
                     style={{ fill: CTP.subtext0, fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Lines({ s, x, ys }: { s: Section; x: string; ys: string[] }) {
  const f = colFormat(ys[0], s.format);
  // Time runs left to right no matter how the SQL ordered it.
  const data = s.rows.map((r) => ({ ...r, [x]: String(r[x]).slice(0, 10) })).sort((a, b) => String(a[x]).localeCompare(String(b[x])));
  const first = ys[0];
  const vals = data.map((d) => (isNum(d[first]) ? (d[first] as number) : 0));
  const mark = s.emphasis === "max" ? vals.indexOf(Math.max(...vals)) : s.emphasis === "latest" ? vals.length - 1 : -1;
  // Monthly buckets (every date is the 1st) read as "Jan 24"; other dates stay as-is.
  const monthly = data.every((d) => /^\d{4}-\d{2}-01$/.test(String(d[x])));
  const tick = (v: unknown) => {
    const t = String(v);
    return monthly ? new Date(`${t}T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" }) : t;
  };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 18, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CTP.surface0} />
        <XAxis dataKey={x} {...axis} minTickGap={24} tickFormatter={tick} />
        <YAxis {...axis} width={56} tickFormatter={(v) => fmt(v, f, true)} />
        <Tooltip {...tooltip} formatter={(v: number) => fmt(v, f)} labelFormatter={tick} />
        {ys.slice(0, 3).map((y, i) => (
          <Line key={y} type="monotone" dataKey={y} name={label(y)} stroke={i === 0 ? ACCENT : CTP.overlay0} strokeWidth={i === 0 ? 3 : 2}
                animationDuration={1000}
                dot={(p: { cx: number; cy: number; index: number }) =>
                  i === 0 && p.index === mark
                    ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={ACCENT} stroke={CTP.base} strokeWidth={2} />
                    : <g key={p.index} />} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Table({ s, masked }: { s: Section; masked: boolean }) {
  const rows = s.limit > 0 ? s.rows.slice(0, s.limit) : s.rows.slice(0, 25);
  return (
    <table className="report-table">
      <thead><tr>{s.columns.map((c) => <th key={c} className={rows.some((r) => isNum(r[c])) ? "num" : ""}>{label(c)}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>{s.columns.map((c) => {
          const v = r[c];
          return <td key={c} className={isNum(v) ? "num" : ""}>{v === null ? <Masked masked={masked} /> : isNum(v) ? fmt(v, colFormat(c, s.format)) : String(v)}</td>;
        })}</tr>
      ))}</tbody>
    </table>
  );
}

// A real world map: every country takes the color of the sales region it
// belongs to, shaded by that region's value. The data only has four regions,
// so countries within a region always share one shade.
type RegionKey = "NA" | "LATAM" | "EMEA" | "APAC";
const REGION_NAMES: Record<RegionKey, string> = {
  NA: "North America", LATAM: "Latin America", EMEA: "Europe, Middle East & Africa", APAC: "Asia Pacific",
};
const ALIASES: Record<string, RegionKey> = {
  NA: "NA", "NORTH AMERICA": "NA", AMER: "NA", EMEA: "EMEA", EUROPE: "EMEA",
  APAC: "APAC", "ASIA PACIFIC": "APAC", ASIA: "APAC", LATAM: "LATAM", "LATIN AMERICA": "LATAM", "SOUTH AMERICA": "LATAM",
};
const regionOf = (v: unknown) => (typeof v === "string" ? ALIASES[v.trim().toUpperCase()] : undefined);

// Region from the country's centroid, with the few cases the rule gets wrong
// pinned by ISO 3166 numeric id. Antarctica and the French Southern Lands are dropped.
const PINNED: Record<string, RegionKey | null> = { "643": "EMEA", "044": "LATAM", "010": null, "260": null };
const countryRegion = (f: Feature<Geometry, { name: string }>): RegionKey | null => {
  const id = String(f.id);
  if (id in PINNED) return PINNED[id];
  const [lon, lat] = geoCentroid(f);
  if (lon < -25) return lat > 25 ? "NA" : "LATAM";
  return lon < 60 ? "EMEA" : "APAC";
};

const W = 960, H = 470;
const COUNTRIES = (() => {
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const regions = fc.features.map(countryRegion);
  const kept = fc.features.map((f, i) => ({ f, region: regions[i] })).filter((c): c is { f: Feature<Geometry, { name: string }>; region: RegionKey } => !!c.region);
  const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "FeatureCollection", features: kept.map((c) => c.f) });
  const path = geoPath(projection);
  // One merged outline per region, so regions read as regions even when their values are equal.
  const geoms = topo.objects.countries.geometries;
  const outline = (k: RegionKey) => path(merge(topo, geoms.filter((_, i) => regions[i] === k) as never)) ?? "";
  return {
    projection,
    shapes: kept.map((c) => ({ id: String(c.f.id), name: c.f.properties.name, region: c.region, d: path(c.f) ?? "" })),
    outlines: { NA: outline("NA"), LATAM: outline("LATAM"), EMEA: outline("EMEA"), APAC: outline("APAC") } as Record<RegionKey, string>,
  };
})();
// Where each region's label sits, in lon/lat, over open-ish land.
const LABEL_AT: Record<RegionKey, [number, number]> = { NA: [-102, 47], LATAM: [-60, -12], EMEA: [18, 8], APAC: [104, 32] };

function RegionMap({ s, x, y }: { s: Section; x: string; y: string }) {
  const f = colFormat(y, s.format);
  const values = new Map<RegionKey, number>();
  for (const r of s.rows) { const k = regionOf(r[x]); if (k && isNum(r[y])) values.set(k, r[y] as number); }
  const nums = [...values.values()];
  const max = Math.max(...nums), total = nums.reduce((a, b) => a + b, 0);
  // Shade from zero, not from the spread, so near-equal regions look near-equal.
  const shade = (v: number) => 0.2 + 0.8 * (v / max);
  const order: RegionKey[] = ["NA", "LATAM", "EMEA", "APAC"];
  const lead = s.emphasis === "max" || s.emphasis === "top" ? order.find((k) => values.get(k) === max) : undefined;
  const [hover, setHover] = useState<RegionKey | null>(null);

  return (
    <div className="region-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.heading} on a world map`} onMouseLeave={() => setHover(null)}>
        {order.map((k, i) => {
          const v = values.get(k);
          return (
            <motion.g key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 * i, duration: 0.5, ease: EASE }}
                      onMouseEnter={() => setHover(k)}>
              {COUNTRIES.shapes.filter((c) => c.region === k).map((c) => (
                <path key={c.id} d={c.d} fill={v === undefined ? CTP.surface0 : ACCENT}
                      fillOpacity={v === undefined ? 1 : hover && hover !== k ? shade(v) * 0.4 : shade(v)}
                      stroke={CTP.mantle} strokeOpacity={0.35} strokeWidth={0.4}>
                  <title>{`${c.name} · ${REGION_NAMES[k]}: ${v === undefined ? "no data" : fmt(v, f)}`}</title>
                </path>
              ))}
              {/* The gap between regions: a thick outline in the card's own color. */}
              <path d={COUNTRIES.outlines[k]} fill="none" stroke={CTP.mantle} strokeWidth={3} strokeLinejoin="round" pointerEvents="none" />
            </motion.g>
          );
        })}
        {lead && (
          <motion.path d={COUNTRIES.outlines[lead]} fill="none" stroke={CTP.text} strokeWidth={1.5} strokeLinejoin="round" pointerEvents="none"
                       initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 1.1, ease: EASE }} />
        )}
        {order.map((k, i) => {
          const v = values.get(k);
          const [px, py] = COUNTRIES.projection(LABEL_AT[k]) ?? [0, 0];
          return (
            <motion.g key={`l-${k}`} className="region-label" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + 0.08 * i, duration: 0.35, ease: EASE }}>
              {/* Styling as SVG attributes, not CSS classes, so the PDF capture keeps it. */}
              <rect x={px - 50} y={py - 30} width={100} height={64} rx={10} fill={CTP.crust} fillOpacity={0.88} />
              <text x={px} y={py - 12} textAnchor="middle" fill={CTP.overlay1} fontSize={11} fontWeight={700} letterSpacing="0.1em">{k}</text>
              <text x={px} y={py + 12} textAnchor="middle" fill={CTP.text} fontSize={22} fontWeight={700}>{v === undefined ? "—" : fmt(v, f, true)}</text>
              {v !== undefined && total > 0 && (
                <text x={px} y={py + 27} textAnchor="middle" fill={CTP.subtext0} fontSize={11}>{`${((v / total) * 100).toFixed(1)}% of total`}</text>
              )}
            </motion.g>
          );
        })}
      </svg>
      <div className="region-legend">
        {order.filter((k) => values.has(k)).map((k) => (
          <span key={k} className={hover === k ? "on" : ""} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: ACCENT, opacity: shade(values.get(k)!) }} />{REGION_NAMES[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

// The SQL stays one click away instead of competing with the content.
function SqlPeek({ sql }: { sql: string }) {
  const [openSql, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sql-peek no-pdf" onClick={() => setOpen((o) => !o)} aria-label="Show SQL" aria-expanded={openSql}><Ellipsis size={16} /></button>
      <AnimatePresence>
        {openSql && (
          <motion.pre className="sql-pop no-pdf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: EASE }}>{sql}</motion.pre>
        )}
      </AnimatePresence>
    </>
  );
}
