import { Check, Copy, LogIn, X } from "lucide-react";
import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import { useEffect, useState } from "react";
import { bead, button as landing, GLIDE, pop, presence, stage, swap } from "./motion";

// Small pieces shared by the page, borrowed from the interactive-examples Kafka demo.

// Catppuccin Mocha, mirrored from index.css for Recharts (SVG attributes don't reliably resolve CSS variables)
export const CTP = {
  crust: "#11111b", mantle: "#181825", base: "#1e1e2e", surface0: "#313244", surface1: "#45475a",
  overlay0: "#6c7086", overlay1: "#7f849c", subtext0: "#a6adc8", text: "#cdd6f4",
  blue: "#89b4fa", lavender: "#b4befe", sapphire: "#74c7ec", sky: "#89dceb", teal: "#94e2d5",
  green: "#a6e3a1", yellow: "#f9e2af", peach: "#fab387", red: "#f38ba8", mauve: "#cba6f7",
};
export const SHADES = [CTP.blue, CTP.sapphire, CTP.sky, CTP.teal, CTP.lavender];
export const tooltip = {
  contentStyle: { background: CTP.mantle, border: "none", borderRadius: 8, color: CTP.text },
  itemStyle: { color: CTP.text }, labelStyle: { color: CTP.subtext0 },
};

// Swaps its content when `k` changes: the old value leaves up, the new rises in
export function Swap({ k, as = "span", className, children }:
  { k: React.Key; as?: "span" | "p"; className?: string; children: React.ReactNode }) {
  const M = as === "p" ? motion.p : motion.span;
  return (
    <span className="swap">
      <AnimatePresence mode="wait" initial={false}>
        <M key={k} variants={swap} {...presence} className={className}>{children}</M>
      </AnimatePresence>
    </span>
  );
}

export function Stat(p: { tour?: string; label: string; icon?: React.ReactNode; value: React.ReactNode; vkey?: React.Key;
                          caption: React.ReactNode; tone?: "ok" | "warn" | "bad"; react?: TargetAndTransition; reactKey?: React.Key }) {
  return (
    <motion.div className="stat" variants={pop} data-tour={p.tour}>
      <span className="stat-label">{p.icon}{p.label}</span>
      {/* Remount on reactKey so a nod or shake replays */}
      <motion.span key={p.reactKey} className={`stat-value ${p.tone ?? ""}`} animate={p.react}>
        <Swap k={p.vkey ?? String(p.value)}>{p.value}</Swap>
      </motion.span>
      <span className="stat-caption">{p.caption}</span>
    </motion.div>
  );
}

export function Card(p: { tour?: string; icon: React.ReactNode; title: string; meta?: React.ReactNode; error?: string | null;
                          wide?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <motion.div className={`card ${p.wide ? "wide" : ""} ${p.className ?? ""}`} variants={pop} data-tour={p.tour}>
      <div className="card-head"><h2>{p.icon} {p.title}</h2><span className="muted small">{p.meta}</span></div>
      {p.error ? <p className="error">{p.error}</p> : p.children}
    </motion.div>
  );
}

// A short message that says what just happened and what to try next, then leaves
export function Toast({ children, onClose, after = 9000 }: { children: React.ReactNode; onClose: () => void; after?: number }) {
  const open = children !== null && children !== undefined && children !== false;
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, after);
    return () => window.clearTimeout(t);
  }, [open, onClose, after, children]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div role="status" className="toast"
                    initial={{ opacity: 0, y: 24, scale: 0.96, x: "-50%" }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: "-50%", transition: GLIDE }}
                    exit={{ opacity: 0, y: 12, x: "-50%", transition: { duration: 0.18 } }}>
          <div>{children}</div>
          <button aria-label="Close" onClick={onClose}><X size={14} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A command to paste into a terminal, with a copy button that nods
export function Cmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="cmd">
      <code>{text}</code>
      <motion.button onClick={copy} whileTap={{ scale: 0.92 }} aria-label="Copy command">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={copied ? "y" : "n"} variants={bead} {...presence}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </motion.span>
        </AnimatePresence>
        {copied ? "Copied" : "Copy"}
      </motion.button>
    </div>
  );
}

// The title, one word at a time
export function Title({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <motion.h1 variants={stage(0.05, 0)}>
      <motion.span variants={pop} className="word">{icon}</motion.span>
      {text.split(" ").map((w, i) => <motion.span key={i} variants={pop} className="word">{w}</motion.span>)}
    </motion.h1>
  );
}

export function SignIn({ icon, title, blurb, users }:
  { icon: React.ReactNode; title: string; blurb: React.ReactNode; users: [string, string, string][] }) {
  return (
    <motion.div className="signin" variants={stage(0.08, 0.05)} {...presence}>
      <Title icon={icon} text={title} />
      <motion.p variants={pop} className="lede">{blurb}</motion.p>
      <motion.a variants={landing} className="primary" href="/auth/login" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
        <LogIn size={16} /> Sign in
      </motion.a>
      <motion.table variants={pop} className="logins">
        <thead><tr><th>User</th><th>Password</th><th>Who</th></tr></thead>
        <tbody>{users.map(([u, p, w]) => <tr key={u}><td className="mono">{u}</td><td className="mono">{p}</td><td>{w}</td></tr>)}</tbody>
      </motion.table>
    </motion.div>
  );
}
