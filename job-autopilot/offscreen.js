// PDF worker (offscreen page): reads text out of resume PDFs (pdf.js) and builds tailored
// resume PDFs (pdf-lib + Liberation Sans, same layout as your original). All local.
import * as pdfjs from "./lib/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.mjs");

const JA = globalThis.JA;
let fonts = null;
async function loadFonts() {
  if (fonts) return fonts;
  const get = async (f) => new Uint8Array(await (await fetch(chrome.runtime.getURL("fonts/" + f))).arrayBuffer());
  fonts = { regular: await get("LiberationSans-Regular.ttf"), bold: await get("LiberationSans-Bold.ttf") };
  return fonts;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function extract(b64) {
  const doc = await pdfjs.getDocument({ data: b64ToBytes(b64), isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let line = "", out = [];
    for (const it of tc.items) { line += it.str; if (it.hasEOL) { out.push(line); line = ""; } else if (it.str && !/\s$/.test(it.str)) line += " "; }
    if (line) out.push(line);
    pages.push(out.join("\n"));
  }
  return pages.join("\n\n").replace(/[ \t]+/g, " ");
}

async function tailor(m) {
  const f = await loadFonts();
  const before = JA.analyzeJD(m.jd.text, JA.resumePlainText(m.base, "fullstack"), m.knownSkills, m.customKeywords);
  let best = null;
  for (let level = 0; level < 4; level++) {
    const t = JA.tailorResume(m.base, m.jd, before, { customKeywords: m.customKeywords }, level);
    const r = await JAResumeRender.render(t.doc, f, PDFLib, fontkit);
    best = { t, r };
    if (r.fits) break;
  }
  const after = JA.analyzeJD(m.jd.text, best.r.text, m.knownSkills, m.customKeywords);
  const missing = (m.requiredSkills || []).filter((name) => !JA.skillsIn(best.r.text, m.customKeywords).includes(name));
  if (!best.r.fits || missing.length) throw new Error("Could not fit the selected skills on one page" + (missing.length ? ": " + missing.join(", ") : "") + ". Review the resume before filling.");
  return { b64: bytesToB64(best.r.bytes), text: best.r.text, family: best.t.family, changes: best.t.changes, level: best.t.level, fits: best.r.fits, scoreBefore: before.score, scoreAfter: after.score };
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || typeof m.type !== "string" || !m.type.startsWith("offscreen:")) return false;
  const job = m.type === "offscreen:pdfText" ? extract(m.b64).then((text) => ({ text })) : m.type === "offscreen:tailor" ? tailor(m) : null;
  if (!job) return false;
  job.then(reply, (e) => reply({ error: String(e && e.message ? e.message : e) }));
  return true;
});
