import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { bead, FAST, GLIDE, presence, SPRING, swap } from "./motion";

// A guided walkthrough, borrowed from the interactive-examples Kafka demo: the
// page dims, a spotlight glides between panels tagged `data-tour`, and a card
// beside each one says what it is and why it matters. Clicks pass through the
// dimmed page, so a step can ask the user to try something for real.

export type Step = { target?: string; title: string; body: React.ReactNode };

// Remembered per browser. Storage can be missing or blocked, so every access is guarded.
export function tourSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(key, "done");
  } catch {
    // Not remembered; the tour will offer itself again next visit.
  }
}

const PAD = 8;
const GAP = 14;
const CARD_W = 360;

type Box = { top: number; left: number; width: number; height: number };

// Tracks the target's viewport box, following scrolls, resizes and layout changes
function useTargetBox(target: string | undefined, open: boolean) {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (!open || !target) { setBox(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { setBox(null); return; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    // Follow the smooth scroll as it settles
    let raf = 0;
    const until = performance.now() + 900;
    const follow = () => { measure(); if (performance.now() < until) raf = requestAnimationFrame(follow); };
    raf = requestAnimationFrame(follow);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, open]);
  return box;
}

// Beside the target: below if it fits, else above, else inside its top edge (tall panels)
function place(box: Box | null, cardH: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - 32);
  if (!box) return { top: Math.max(16, (vh - cardH) / 2), left: (vw - width) / 2, width };
  const left = Math.min(Math.max(16, box.left + box.width / 2 - width / 2), vw - width - 16);
  if (box.top + box.height + GAP + cardH < vh - 16) return { top: box.top + box.height + GAP, left, width };
  if (box.top - GAP - cardH > 16) return { top: box.top - GAP - cardH, left, width };
  return { top: Math.max(16, box.top + GAP), left: Math.min(box.left + box.width - width - GAP, vw - width - 16), width };
}

type Props = {
  steps: Step[];
  storageKey: string;
  open: boolean;
  onClose: () => void;
  /** While the spotlight is on `advanceOn`, a change in `nudge` moves to the next step. */
  advanceOn?: string;
  nudge?: number;
};

export function Tour({ steps, storageKey, open, onClose, advanceOn, nudge = 0 }: Props) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const box = useTargetBox(step.target, open);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);
  const last = i === steps.length - 1;

  useEffect(() => { if (open) setI(0); }, [open]);
  // Doing the thing the step asks for moves the spotlight on
  const nudgedAt = useRef(nudge);
  useEffect(() => {
    if (nudge !== nudgedAt.current && open && advanceOn && step.target === advanceOn && !last) setI((n) => n + 1);
    nudgedAt.current = nudge;
  }, [nudge, open, advanceOn, step.target, last]);
  // One size for the whole tour: the body is as tall as the tallest step, measured
  // off-screen at the card's width, so the card never resizes as it moves
  const measurer = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState<number>();
  const width = Math.min(CARD_W, window.innerWidth - 32);
  useLayoutEffect(() => {
    if (!open || !measurer.current) return;
    setBodyH(Math.max(...[...measurer.current.children].map((c) => (c as HTMLElement).offsetHeight)));
  }, [open, width]);
  useLayoutEffect(() => { if (open && card.current) setCardH(card.current.offsetHeight); }, [open, bodyH]);

  const close = useCallback(() => { markSeen(storageKey); onClose(); }, [onClose, storageKey]);
  const next = useCallback(() => (last ? close() : setI((n) => n + 1)), [last, close]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Let the user type into inputs (the agent chat) while a step is open
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, back]);

  const pos = place(box, cardH);
  // With no target (the welcome), the spotlight shrinks to the centre and only dims
  const spot = box ?? { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="tour" className="tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: FAST }}>
          <motion.div className="tour-spot" initial={false} animate={spot} transition={SPRING} />
          <motion.div ref={card} className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title"
                      // Enter already placed and sized; only the fade and lift animate in
                      initial={{ opacity: 0, y: 12, scale: 0.96, top: pos.top, left: pos.left, width: pos.width }}
                      animate={{ opacity: 1, y: 0, scale: 1, top: pos.top, left: pos.left, width: pos.width, transition: GLIDE }}>
            <div className="tour-head">
              <span className="tour-count">{i + 1} / {steps.length}</span>
              <button aria-label="Close tour" onClick={close}><X size={14} /></button>
            </div>
            <div className="tour-body" style={{ height: bodyH }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={i} variants={swap} {...presence}>
                  <h3 id="tour-title">{step.title}</h3>
                  <p>{step.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="tour-foot">
              <div className="tour-dots" aria-hidden>
                {steps.map((_, n) => (
                  <motion.span key={n} variants={bead} initial="hidden" animate="shown"
                               transition={{ delay: n * 0.03 }} className={n === i ? "on" : n < i ? "seen" : ""} />
                ))}
              </div>
              {i > 0 && <button className="tour-back" onClick={back}><ArrowLeft size={14} /> Back</button>}
              <motion.button className="tour-next" onClick={next} whileTap={{ scale: 0.96 }}>
                {i === 0 ? "Show me" : last ? "Done" : "Next"} {!last && <ArrowRight size={14} />}
              </motion.button>
            </div>
            {/* Keeps its space on every step so the card's height never changes */}
            <button className="tour-skip" onClick={close} style={{ visibility: i === 0 ? "visible" : "hidden" }}
                    tabIndex={i === 0 ? 0 : -1} aria-hidden={i !== 0}>Skip the tour</button>
          </motion.div>
          {/* Every step's body at the card's inner width, invisibly, to find the tallest */}
          <div ref={measurer} className="tour-measure" aria-hidden style={{ width: width - 36 }}>
            {steps.map((s, n) => <div key={n}><h3>{s.title}</h3><p>{s.body}</p></div>)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
