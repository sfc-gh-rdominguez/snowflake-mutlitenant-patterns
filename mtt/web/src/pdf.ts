// PDF export, loaded only when someone clicks Export. The report is captured as
// one high-resolution image, then cut into pages at section boundaries
// ([data-pdf-block]) so no chart or KPI is ever split across two pages.

const PAGE = { w: 792, h: 612 }; // US Letter, landscape, in points
const MARGIN = 32;
const FOOTER = 22;

export async function exportReportPdf(el: HTMLElement, opts: { title: string; user: string; background: string; ink: string }) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const ratio = 2;
  // Interactive bits (save button, SQL toggles) don't belong in a document.
  const canvas = await toCanvas(el, {
    pixelRatio: ratio,
    backgroundColor: opts.background,
    // The clone keeps the report's own margin, which would shift every block
    // down relative to the positions measured below.
    style: { margin: "0" },
    filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-pdf")),
  });

  // Block edges in CSS px from the top of the report.
  const top = el.getBoundingClientRect().top;
  const blocks = [...el.querySelectorAll<HTMLElement>("[data-pdf-block]")].map((b) => {
    const r = b.getBoundingClientRect();
    return { top: r.top - top, bottom: r.bottom - top };
  });
  const height = canvas.height / ratio;
  const scale = (PAGE.w - 2 * MARGIN) / el.offsetWidth; // CSS px -> pt
  const room = (PAGE.h - 2 * MARGIN - FOOTER) / scale; // CSS px that fit on one page

  // Greedy pagination: fill a page, then back up to the top of the first block
  // that would cross the bottom edge. A block taller than a page gets cut.
  const cuts: [number, number][] = [];
  for (let start = 0; start < height - 1; ) {
    let end = Math.min(start + room, height);
    if (end < height) {
      const crossing = blocks.filter((b) => b.top > start + 1 && b.top < end && b.bottom > end).map((b) => b.top);
      if (crossing.length) end = Math.min(...crossing) - 8;
    }
    cuts.push([start, end]);
    start = end;
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const stamp = new Date().toLocaleString();
  cuts.forEach(([a, b], i) => {
    if (i > 0) pdf.addPage();
    pdf.setFillColor(opts.background);
    pdf.rect(0, 0, PAGE.w, PAGE.h, "F");
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.ceil((b - a) * ratio);
    slice.getContext("2d")!.drawImage(canvas, 0, -a * ratio);
    // JPEG keeps a multi-page report to a few MB; flat UI colors survive it well at this quality.
    pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", MARGIN, MARGIN, PAGE.w - 2 * MARGIN, (b - a) * scale, undefined, "FAST");
    pdf.setFontSize(8);
    pdf.setTextColor(opts.ink);
    pdf.text(`${opts.title} · generated ${stamp} for ${opts.user} · data filtered by this user's access policies`, MARGIN, PAGE.h - MARGIN + 8);
    pdf.text(`${i + 1} / ${cuts.length}`, PAGE.w - MARGIN, PAGE.h - MARGIN + 8, { align: "right" });
  });

  const slug = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
  pdf.save(`${slug}.pdf`);
}
