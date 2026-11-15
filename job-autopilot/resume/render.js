// Draws a resume in the exact layout of Resume_1page_ATS.pdf (measured from the original):
// A4, Liberation Sans, 45.685pt side margins, 9.4pt body on 11.28pt leading, 10.4pt section
// headings with a 0.6pt rule, Helvetica "•" bullets with a 10pt indent, right-aligned dates.
// Works in the extension (globals PDFLib/fontkit) and in Node (for tests).
(function (root) {
  const PAGE_W = 595.2756, PAGE_H = 841.8898;
  const L = 45.685, R = 549.5905, W = R - L;
  const LEAD = 11.28;
  const MAX_BASELINE = 806; // last text line must sit above this to keep one page with the original bottom margin
  const POS = { name: 54.18, headline: 66.58, contact: [76.86, 88.14], firstHeading: 105.42 };
  const GAP = { afterHeadingPara: 14.0, afterHeadingEntry: 15.0, beforeEntry: 15.28, beforeHeading: 16.28 };
  const SIZE = { name: 17, headline: 9.4, contact: 8.4, heading: 10.4, body: 9.4, bullet: 10 };

  // "**bold** plain" -> [{t, b}]
  function segments(s) {
    const out = [];
    String(s).split(/(\*\*[^*]+\*\*)/).forEach((p) => {
      if (!p) return;
      if (p.startsWith("**") && p.endsWith("**")) out.push({ t: p.slice(2, -2), b: true });
      else out.push({ t: p, b: false });
    });
    return out;
  }

  // words with their bold flag; a word may be split across segments ("**Rspack**," -> Rspack + ,)
  function words(s) {
    const ws = [];
    let cur = null;
    for (const seg of segments(s)) {
      const parts = seg.t.split(/( +)/);
      for (const p of parts) {
        if (p === "") continue;
        if (/^ +$/.test(p)) { if (cur) { ws.push(cur); cur = null; } continue; }
        if (!cur) cur = { pieces: [] };
        cur.pieces.push({ t: p, b: seg.b });
      }
    }
    if (cur) ws.push(cur);
    return ws;
  }

  function plain(s) { return String(s).replace(/\*\*/g, ""); }

  async function render(doc, fonts, PDFLib, fontkit) {
    const pdf = await PDFLib.PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const reg = await pdf.embedFont(fonts.regular, { subset: true });
    const bold = await pdf.embedFont(fonts.bold, { subset: true });
    const helv = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    pdf.setTitle(`${doc.name} Resume`);
    pdf.setAuthor(doc.name);
    pdf.setCreator("Job Autopilot");
    pdf.setProducer("Job Autopilot");
    const black = PDFLib.rgb(0, 0, 0);
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    const textLines = [];

    const wWidth = (w, size) => w.pieces.reduce((n, p) => n + (p.b ? bold : reg).widthOfTextAtSize(p.t, size), 0);
    const space = (size) => reg.widthOfTextAtSize(" ", size);

    // ReportLab's ParagraphStyle.spaceShrinkage (0.05): a line may overrun by up to 5% of its
    // spaces' width; the spaces are then squeezed so the line ends exactly at the margin.
    const SHRINK = 0.05;
    function wrap(s, width, size) {
      const ws = words(s);
      const lines = [];
      let line = [], lw = 0;
      for (const w of ws) {
        const ww = wWidth(w, size);
        const add = line.length ? space(size) + ww : ww;
        const allowance = SHRINK * space(size) * line.length; // spaces after adding w
        if (line.length && lw + add > width + allowance + 1e-6) { lines.push({ words: line, width: lw }); line = [w]; lw = ww; }
        else { line.push(w); lw += add; }
      }
      if (line.length) lines.push({ words: line, width: lw });
      lines.forEach((l) => { l.max = width; });
      return lines;
    }

    function drawLine(lineObj, x, y, size) {
      const line = lineObj.words || lineObj;
      const gaps = line.length - 1;
      const squeeze = lineObj.max && lineObj.width > lineObj.max && gaps > 0 ? (lineObj.max - lineObj.width) / gaps : 0;
      let cx = x;
      line.forEach((w, i) => {
        if (i) cx += space(size) + squeeze;
        for (const p of w.pieces) {
          const f = p.b ? bold : reg;
          page.drawText(p.t, { x: cx, y: PAGE_H - y, size, font: f, color: black });
          cx += f.widthOfTextAtSize(p.t, size);
        }
      });
      textLines.push(line.map((w) => w.pieces.map((p) => p.t).join("")).join(" "));
    }

    function centered(s, y, size) {
      const line = words(s);
      const width = line.reduce((n, w, i) => n + wWidth(w, size) + (i ? space(size) : 0), 0);
      drawLine(line, (PAGE_W - width) / 2, y, size);
    }

    centered(`**${doc.name}**`, POS.name, SIZE.name);
    centered(`**${doc.headline}**`, POS.headline, SIZE.headline);
    doc.contact.forEach((c, i) => centered(c, POS.contact[i], SIZE.contact));

    let y = null; // baseline of the last drawn line
    for (const sec of doc.sections) {
      y = y === null ? POS.firstHeading : y + GAP.beforeHeading;
      page.drawText(sec.title, { x: L, y: PAGE_H - y, size: SIZE.heading, font: bold, color: black });
      textLines.push(sec.title);
      page.drawLine({ start: { x: L, y: PAGE_H - (y + 2.6) }, end: { x: R, y: PAGE_H - (y + 2.6) }, thickness: 0.6, color: black });
      let first = true;
      for (const it of sec.items) {
        if (it.type === "entry") {
          y += first ? GAP.afterHeadingEntry : GAP.beforeEntry;
          drawLine(words(`**${it.left}**`), L, y, SIZE.body);
          if (it.right) {
            const rw = bold.widthOfTextAtSize(it.right, SIZE.body);
            page.drawText(it.right, { x: R - rw, y: PAGE_H - y, size: SIZE.body, font: bold, color: black });
            textLines[textLines.length - 1] += "  " + it.right;
          }
        } else {
          const bullet = it.type === "bullet";
          const lines = wrap(it.text, bullet ? W - 10 : W, SIZE.body);
          lines.forEach((ln, i) => {
            y += first && i === 0 ? GAP.afterHeadingPara : LEAD;
            if (bullet && i === 0) page.drawText("•", { x: L, y: PAGE_H - y, size: SIZE.bullet, font: helv, color: black });
            drawLine(ln, bullet ? L + 10 : L, y, SIZE.body);
          });
        }
        first = false;
      }
    }
    const bytes = await pdf.save();
    return { bytes, lastBaseline: y, fits: y <= MAX_BASELINE, text: textLines.join("\n") };
  }

  // Measure without drawing (for fitting): same wrapping rules, returns last baseline.
  async function measure(doc, fonts, PDFLib, fontkit) {
    const r = await render(doc, fonts, PDFLib, fontkit);
    return { lastBaseline: r.lastBaseline, fits: r.fits };
  }

  const api = { render, measure, plain, MAX_BASELINE };
  if (typeof module !== "undefined") module.exports = api;
  root.JAResumeRender = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
