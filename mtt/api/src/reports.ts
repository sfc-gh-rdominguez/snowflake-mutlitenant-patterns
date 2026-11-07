import { analystSql, lit, queryAs } from "./snowflake";

// A report is layout plus SQL, never data. Cortex writes it once; re-running it
// is plain queryAs calls, so the policies decide what each run returns.
export type Display = "kpi" | "table" | "bar" | "line" | "map";
export type Section = {
  heading: string; subtitle: string; question: string; display: Display;
  // Layout vocabulary only: the renderer owns every pixel, the model picks from these.
  role: "hero" | "supporting" | "detail"; span: 1 | 2 | 3;
  format: "currency" | "count" | "percent"; emphasis: "top" | "max" | "latest" | "none";
  sort: "desc" | "asc" | "none"; limit: number;
  sql: string;
};
export type Spec = { title: string; sections: Section[] };
export type Ran = Section & { columns: string[]; rows: Record<string, unknown>[]; insight?: string; error?: string };
export type Result = { title: string; summary?: string; sections: Ran[]; revenueMasked: boolean };

// Progress is streamed so the UI can show each phase as it happens.
export type PhaseId = "plan" | "sql" | "data" | "insight";
export type Emit = (event: "phase", data: { id: PhaseId; state: "active" | "done" | "error"; detail?: string }) => void;

const MODEL = "claude-sonnet-4-6";
const MAX_SECTIONS = 6;

// Structured output: AI_COMPLETE must return exactly this shape, so the BFF
// never parses free text. additionalProperties/required on every node keeps the
// schema valid for every model AI_COMPLETE supports.
const obj = (properties: Record<string, unknown>) =>
  ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const enumOf = (...v: (string | number)[]) => ({ type: typeof v[0] === "number" ? "integer" : "string", enum: v });

const PLAN_SCHEMA = {
  type: "json",
  schema: obj({
    title: { type: "string" },
    sections: {
      type: "array",
      items: obj({
        heading: { type: "string" },
        subtitle: { type: "string" },
        question: { type: "string" },
        display: enumOf("kpi", "table", "bar", "line", "map"),
        role: enumOf("hero", "supporting", "detail"),
        span: enumOf(1, 2, 3),
        format: enumOf("currency", "count", "percent"),
        emphasis: enumOf("top", "max", "latest", "none"),
        sort: enumOf("desc", "asc", "none"),
        limit: { type: "integer" },
      }),
    },
  }),
};

const PLAN_PROMPT = `You design executive sales reports in the style of Refactoring UI: strong hierarchy,
few elements, every element earns its place. Return at most ${MAX_SECTIONS} sections.

Data: one sales table with region (NA, EMEA, APAC, LATAM), product, sale date/month,
quantity (units), amount (revenue in USD), and a count of orders.

Each section:
- question: one standalone, specific analytics question a text-to-SQL tool can answer.
  KPI questions must return exactly one row.
- heading: 2-5 words, what it is ("Revenue by region"), never the question restated.
- subtitle: the scope in under 60 chars, e.g. "Jan–Dec 2024 · all regions".
- display: "kpi" single number; "line" trend over time; "bar" comparison across categories; "table" for detail;
  "map" for one measure per region when the request asks for a map or geography (the question must
  group by region and return one row per region).
- role: "hero" for 2-4 headline KPIs (always first), "supporting" for the main charts, "detail" for tables (last).
- span (grid columns of 3): hero KPIs 1; supporting charts 2 or 3 (a trend over time or a map gets 3); detail 3.
  Lay rows out so spans add up to 3.
- format: how the main measure reads.
- emphasis: "top" to accent the leading bars, "max" for the peak, "latest" for the most recent point, "none" otherwise.
- sort/limit: bar charts usually "desc" with a limit of 5-8; time series "none" with limit 0 (no limit).
Never include data values.

The data covers only the date range below, which may be far from today. Never use relative
dates ("this quarter", "last 12 months", "YTD"); rewrite them as explicit dates inside that range,
treating its end as "now". With no time frame in the request, use the whole range.
`;

const INSIGHT_SCHEMA = {
  type: "json",
  schema: obj({
    summary: { type: "string" },
    insights: { type: "array", items: obj({ index: { type: "integer" }, text: { type: "string" } }) },
  }),
};

const INSIGHT_PROMPT = `Write the takeaways for a sales report. Use only the numbers in the results below.
- summary: the single most important takeaway for the whole report, under 120 chars.
- insights: one per section index (skip errored or empty ones), under 110 chars, saying what the
  reader should notice (leader, gap, trend, outlier), not what the chart is.
NULL revenue means it's masked for this user: never call it zero or missing; talk about orders or units instead.
`;

// Stored SQL is untrusted text we'll run again later. queryAs already caps the
// request at two statements (SET_SYS_CONTEXT + this), so a second statement
// fails outright; this also keeps it to a read.
const READ_ONLY = /^\s*(WITH|SELECT)\b/i;
const WRITES = /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|EXECUTE|COPY|PUT|USE|SET|UNSET)\b/i;
export const assertReadOnly = (sql: string) => {
  const s = sql.trim().replace(/;\s*$/, "");
  if (!READ_ONLY.test(s) || s.includes(";") || WRITES.test(s)) throw new Error("report SQL must be a single SELECT");
  return s;
};

const complete = async <T>(user: string, prompt: string, schema: unknown): Promise<T> => {
  const [r] = await queryAs<{ OUT: string }>(user, `SELECT AI_COMPLETE(
    model => ${lit(MODEL)},
    prompt => ${lit(prompt)},
    response_format => PARSE_JSON(${lit(JSON.stringify(schema))})
  )::STRING AS "OUT"`);
  return JSON.parse(r.OUT) as T;
};

// The tenant's own date range (the policies scope it), so "this quarter" means
// the latest quarter of real data rather than CURRENT_DATE.
const dateRange = async (user: string) => {
  const [r] = await queryAs<{ LO: string | null; HI: string | null }>(user,
    `SELECT TO_CHAR(MIN(sale_ts), 'YYYY-MM-DD') AS "LO", TO_CHAR(MAX(sale_ts), 'YYYY-MM-DD') AS "HI" FROM mtt_db.base.sales`);
  return r?.LO ? `${r.LO} to ${r.HI}` : "no data";
};

// Older saved specs predate the layout fields; give them sensible defaults.
const withDefaults = (s: Partial<Section> & Pick<Section, "heading" | "question" | "display" | "sql">): Section => ({
  subtitle: "", role: s.display === "kpi" ? "hero" : s.display === "table" ? "detail" : "supporting",
  span: s.display === "kpi" ? 1 : 3, format: "count", emphasis: "none", sort: "none", limit: 0, ...s,
});

export const draft = async (user: string, request: string, emit: Emit): Promise<{ spec: Spec; skipped: string[] }> => {
  emit("phase", { id: "plan", state: "active", detail: "Designing the layout" });
  const p = await complete<{ title: string; sections: Omit<Section, "sql">[] }>(user,
    `${PLAN_PROMPT}Data date range: ${await dateRange(user)}\n\nRequest: ${request}`, PLAN_SCHEMA);
  const planned = p.sections.slice(0, MAX_SECTIONS);
  emit("phase", { id: "plan", state: "done", detail: `${planned.length} sections` });

  emit("phase", { id: "sql", state: "active", detail: `0 of ${planned.length} queries` });
  let written = 0;
  const skipped: string[] = [];
  const sections = (await Promise.all(planned.map(async (s) => {
    const a = await analystSql(s.question).catch((e: Error) => ({ sql: undefined, text: e.message }));
    emit("phase", { id: "sql", state: "active", detail: `${++written} of ${planned.length} queries` });
    try { return withDefaults({ ...s, sql: assertReadOnly(a.sql ?? "") }); }
    catch { skipped.push(`${s.heading}: ${a.text || "no SQL returned"}`); return undefined; }
  }))).filter((s): s is Section => !!s);
  emit("phase", { id: "sql", state: "done", detail: `${sections.length} queries` });
  return { spec: { title: p.title, sections }, skipped };
};

export const run = async (user: string, spec: Spec, emit: Emit): Promise<Result> => {
  const specs = spec.sections.map(withDefaults);
  emit("phase", { id: "data", state: "active", detail: "Running as you, under your policies" });
  // NULL can mean "masked" or just "no rows to aggregate"; ask the masking
  // policy once per run so the UI only says "restricted" when it is.
  const [[m], sections] = await Promise.all([
    queryAs<{ M: boolean }>(user, `SELECT COUNT(*) > 0 AND COUNT(amount) = 0 AS "M" FROM mtt_db.base.sales`),
    Promise.all(specs.map(async (s): Promise<Ran> => {
      try {
        const rows = await queryAs(user, assertReadOnly(s.sql));
        return { ...s, columns: Object.keys(rows[0] ?? {}), rows };
      } catch (e) {
        return { ...s, columns: [], rows: [], error: e instanceof Error ? e.message : String(e) };
      }
    })),
  ]);
  const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);
  emit("phase", { id: "data", state: "done", detail: `${rowCount.toLocaleString()} rows` });

  // Insights are written from the actual results on every run, so the words
  // always match the numbers on screen. A failure here never sinks the report.
  emit("phase", { id: "insight", state: "active", detail: "Reading the results" });
  let summary: string | undefined;
  try {
    const results = sections.map((s, index) => ({
      index, heading: s.heading, error: !!s.error, columns: s.columns, rows: s.rows.slice(0, 25),
    }));
    const out = await complete<{ summary: string; insights: { index: number; text: string }[] }>(user,
      `${INSIGHT_PROMPT}\nRevenue masked for this user: ${!!m?.M}\n\nResults:\n${JSON.stringify(results)}`, INSIGHT_SCHEMA);
    summary = out.summary;
    for (const i of out.insights) if (sections[i.index] && !sections[i.index].error) sections[i.index].insight = i.text;
    emit("phase", { id: "insight", state: "done" });
  } catch (e) {
    emit("phase", { id: "insight", state: "error", detail: "Skipped takeaways" });
  }
  return { title: spec.title, summary, sections, revenueMasked: !!m?.M };
};

// Drafts stay server-side, so the browser saves a draft by id and never sends SQL.
const drafts = new Map<string, { user: string; spec: Spec; at: number }>();
const DRAFT_TTL = 30 * 60_000;
export const keepDraft = (user: string, spec: Spec) => {
  const now = Date.now();
  for (const [k, v] of drafts) if (now - v.at > DRAFT_TTL) drafts.delete(k);
  const id = crypto.randomUUID();
  drafts.set(id, { user, spec, at: now });
  return id;
};
export const takeDraft = (user: string, id: string) => {
  const d = drafts.get(id);
  if (!d || d.user !== user) return undefined;
  drafts.delete(id);
  return d.spec;
};

const UUID = /^[0-9a-f-]{36}$/i;
const assertId = (id: string) => { if (!UUID.test(id)) throw new Error("invalid report id"); return id; };

// The row access policy on saved_reports scopes every statement below to the
// session's end user; end_user_id is written from SYS_CONTEXT, not the request.
export const save = async (user: string, spec: Spec) => {
  const id = crypto.randomUUID();
  await queryAs(user, `INSERT INTO mtt_db.serving.saved_reports (report_id, end_user_id, app_user, title, spec)
    SELECT ${lit(id)}, SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id'), CURRENT_USER(),
      ${lit(spec.title)}, PARSE_JSON(${lit(JSON.stringify(spec))})`);
  return id;
};

export const list = (user: string) =>
  queryAs<{ ID: string; TITLE: string; CREATED: string }>(user, `SELECT report_id AS "ID", title AS "TITLE",
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS "CREATED"
    FROM mtt_db.serving.saved_reports ORDER BY created_at DESC`);

export const load = async (user: string, id: string): Promise<Spec | undefined> => {
  const [r] = await queryAs<{ SPEC: string }>(user,
    `SELECT spec::STRING AS "SPEC" FROM mtt_db.serving.saved_reports WHERE report_id = ${lit(assertId(id))}`);
  return r ? (JSON.parse(r.SPEC) as Spec) : undefined;
};

export const remove = (user: string, id: string) =>
  queryAs(user, `DELETE FROM mtt_db.serving.saved_reports WHERE report_id = ${lit(assertId(id))}`);
