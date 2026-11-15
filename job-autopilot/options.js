const $ = (id) => document.getElementById(id);
let store = {};

const SETTING_LABELS = {
  handsFree: "Hands-free: on a job page, tailor the resume, count down, then apply by itself",
  tailorResume: "Tailor my resume to every JD (same layout, one page)",
  autoSubmit: "Press the final Submit automatically when every field is answered",
  autoAccount: "Create accounts / sign in on career sites with the password template",
  autoPanel: "Open the panel by itself on job pages",
  uploadResumeOnLinkedIn: "On LinkedIn Easy Apply, upload this resume instead of LinkedIn's saved one",
  dailyCap: "Daily cap, all sites",
  linkedinDailyCap: "Daily cap, LinkedIn",
  naukriDailyCap: "Daily cap, Naukri",
  stepDelayMs: "Pause between steps, ms (min,max)",
  handsFreeDelaySec: "Hands-free countdown, seconds",
  handsFreeMinMatch: "Hands-free: skip jobs whose resume match is below (%)",
  handsFreeMaxYears: "Hands-free: skip jobs asking more years than",
  batchDelaySec: "Batch: pause between jobs, seconds (min,max)"
};

function toast(t) { const e = $("toast"); e.textContent = t; e.style.display = "block"; setTimeout(() => (e.style.display = "none"), 2200); }
function el(tag, attrs, ...kids) { const e = document.createElement(tag); Object.assign(e, attrs || {}); kids.forEach((k) => e.append(k)); return e; }

function passwordFor(token, template) {
  const t = token.toLowerCase(), cap = t[0].toUpperCase() + t.slice(1);
  return template.replace(/\{company\}/g, t).replace(/\{Company\}/g, cap).replace(/\{COMPANY\}/g, t.toUpperCase()).replace(/\{c\}/g, t[0]).replace(/\{C\}/g, t[0].toUpperCase());
}
function updatePreview() {
  const tpl = $("pw").value;
  const p = tpl ? passwordFor("amazon", tpl) : "";
  $("pwPreview").textContent = p ? ($("pw").type === "password" ? p.replace(/./g, "•") : p) : "—";
  const issues = [];
  if (tpl && !/\{(company|Company|COMPANY|c|C)\}/.test(tpl)) issues.push("no company token, so every site gets the same password");
  if (p && !/[A-Z]/.test(p)) issues.push("no capital letter — most Workday sites reject that (try {Company})");
  if (p && !/[^A-Za-z0-9]/.test(p)) issues.push("no special character");
  if (p && p.length < 8) issues.push("shorter than 8 characters");
  $("pwWarn").style.display = issues.length ? "block" : "none";
  $("pwWarn").textContent = issues.length ? "Heads-up: " + issues.join("; ") + "." : "";
}

async function load() {
  store = await chrome.storage.local.get(null);
  const s = Object.assign({}, JA_DEFAULTS.settings, store.settings);
  $("autopilotId").textContent = chrome.runtime.id;
  $("collectorId").value = store.socialCollectorId || "";
  $("pw").value = s.passwordTemplate || "";
  $("driveClientId").value = s.driveClientId || "";
  $("aiKey").value = s.aiApiKey || "";
  $("aiModel").value = s.aiModel || "claude-opus-5-5";
  $("aiUsePlan").checked = s.aiUsePlan !== false;
  $("driveRedirect").textContent = chrome.identity.getRedirectURL("google-drive");
  updatePreview();

  const box = $("settings"); box.replaceChildren();
  for (const [k, label] of Object.entries(SETTING_LABELS)) {
    const v = s[k];
    if (typeof v === "boolean") box.append(el("label", { className: "chk" }, el("input", { type: "checkbox", checked: v, id: "set_" + k }), label));
    else box.append(el("div", { style: "margin-top:8px;max-width:340px" }, el("label", { textContent: label }), el("input", { type: "text", id: "set_" + k, value: Array.isArray(v) ? v.join(",") : v })));
  }

  const p = Object.assign({}, JA_DEFAULTS.profile, store.profile);
  const grid = $("profile"); grid.replaceChildren();
  for (const [k, v] of Object.entries(p)) {
    grid.append(el("div", {}, el("label", { textContent: k }), el("input", { type: "text", id: "pf_" + k, value: Array.isArray(v) ? v.join(", ") : v })));
  }

  $("skillYears").value = JSON.stringify(store.skillYears || JA_DEFAULTS.skillYears, null, 1);
  $("knownSkills").value = (store.knownSkills || JA_DEFAULTS.knownSkills).join(", ");
  $("techStack").value = (store.techStack || JA_DEFAULTS.techStack).join(", ");
  $("customKeywords").value = (store.customKeywords || []).join(", ");
  $("learned").value = JSON.stringify(store.learned || {}, null, 1);
  $("accounts").value = JSON.stringify(store.accounts || {}, null, 1);
  $("resumeBase").value = JSON.stringify(store.resumeBase || {}, null, 1);

  const r = store.resume;
  $("resName").textContent = r ? r.name : "none";
  $("resDate").textContent = r && r.updatedAt ? "· updated " + new Date(r.updatedAt).toLocaleString() : "";
  $("resText").value = r ? r.text : "";
  renderLog();
}

function renderLog() {
  const log = store.log || [];
  $("logCount").textContent = `${log.filter((e) => e.status === "applied").length} applied · ${log.length} entries`;
  const body = $("logBody"); body.replaceChildren();
  for (const e of log.slice().reverse().slice(0, 300)) {
    const a = el("a", { href: e.url, target: "_blank", rel: "noopener", textContent: e.title || "(untitled)" });
    const del = el("button", { textContent: "✕", title: "Delete this entry (e.g. a wrong 'applied')" });
    del.addEventListener("click", async () => {
      if (!confirm(`Delete this log entry?\n${e.status} · ${e.company} · ${e.title}`)) return;
      store.log = (store.log || []).filter((x) => x.ts !== e.ts);
      await chrome.storage.local.set({ log: store.log });
      renderLog();
    });
    body.append(el("tr", {}, el("td", {}, del),
      el("td", { textContent: new Date(e.ts).toLocaleString() }), el("td", { textContent: e.status }), el("td", { textContent: e.site }),
      el("td", { textContent: e.company || "" }), el("td", {}, a), el("td", { textContent: e.match == null ? "" : e.match + "%" }),
      el("td", { textContent: e.reason || (e.missing && e.missing.length ? "missing: " + e.missing.slice(0, 6).join(", ") : "") })));
  }
}

function parseJSON(id, label) {
  try { return JSON.parse($(id).value || "{}"); } catch (e) { throw new Error(`${label} isn't valid JSON: ${e.message}`); }
}

async function save() {
  try {
    const s = Object.assign({}, JA_DEFAULTS.settings, store.settings);
    s.passwordTemplate = $("pw").value;
    s.driveClientId = $("driveClientId").value.trim();
    s.aiApiKey = $("aiKey").value.trim();
    s.aiModel = $("aiModel").value.trim() || "claude-opus-5-5";
    s.aiUsePlan = $("aiUsePlan").checked;
    if (s.aiApiKey && !/^sk-ant-[\w-]{20,}$/.test(s.aiApiKey)) throw new Error("That doesn't look like a Claude API key (sk-ant-…).");
    for (const k of Object.keys(SETTING_LABELS)) {
      const inp = $("set_" + k);
      if (typeof s[k] === "boolean") s[k] = inp.checked;
      else if (Array.isArray(s[k])) s[k] = inp.value.split(",").map((x) => +x.trim()).filter((x) => !isNaN(x));
      else s[k] = isNaN(+inp.value) ? inp.value : +inp.value;
    }
    const p = Object.assign({}, JA_DEFAULTS.profile, store.profile);
    for (const k of Object.keys(p)) {
      const v = $("pf_" + k).value;
      if (Array.isArray(p[k])) p[k] = v.split(",").map((x) => x.trim()).filter(Boolean);
      else if (typeof p[k] === "number") p[k] = v === "" ? p[k] : +v;
      else p[k] = v;
    }
    const data = {
      settings: s, profile: p,
      skillYears: parseJSON("skillYears", "Years per skill"),
      knownSkills: $("knownSkills").value.split(",").map((x) => x.trim()).filter(Boolean),
      techStack: $("techStack").value.split(",").map((x) => x.trim()).filter(Boolean),
      customKeywords: $("customKeywords").value.split(",").map((x) => x.trim()).filter(Boolean),
      learned: parseJSON("learned", "Remembered answers"),
      accounts: parseJSON("accounts", "Accounts"),
      resumeBase: parseJSON("resumeBase", "Resume content")
    };
    if (!data.resumeBase.summaries || !data.resumeBase.experience || !data.resumeBase.skills) throw new Error("Resume content is missing summaries / experience / skills");
    await chrome.storage.local.set(data);
    store = Object.assign(store, data);
    $("saveStatus").textContent = "Saved " + new Date().toLocaleTimeString();
    toast("Saved");
  } catch (e) { $("saveStatus").textContent = e.message; toast("Not saved"); }
}

function download(name, text, type) {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const csvCell = (v) => '"' + String(v == null ? "" : Array.isArray(v) ? v.join("; ") : v).replace(/"/g, '""') + '"';

$("pw").addEventListener("input", updatePreview);
$("pwShow").addEventListener("click", () => { $("pw").type = $("pw").type === "password" ? "text" : "password"; $("pwShow").textContent = $("pw").type === "password" ? "Show" : "Hide"; updatePreview(); });
$("aiShow").addEventListener("click", () => { $("aiKey").type = $("aiKey").type === "password" ? "text" : "password"; $("aiShow").textContent = $("aiKey").type === "password" ? "Show" : "Hide"; });
$("save").addEventListener("click", save);
$("saveCollector").addEventListener("click", async () => {
  const id = $("collectorId").value.trim();
  if (id && !/^[a-p]{32}$/.test(id)) { $("collectorStatus").textContent = "Enter a 32-letter extension ID."; return; }
  try { await chrome.storage.local.set({ socialCollectorId: id }); store.socialCollectorId = id; $("collectorStatus").textContent = "Connection saved."; }
  catch (e) { $("collectorStatus").textContent = "Could not save: " + e.message; }
});
$("aiTest").addEventListener("click", () => {
  $("aiStatus").textContent = "Checking…";
  chrome.runtime.sendMessage({ type: "aiPing" }, (r) => {
    void chrome.runtime.lastError;
    $("aiStatus").textContent = r && r.ok ? (r.claude ? "Connected: Claude Code found at " + r.claude : "Helper works, but the claude command wasn't found.")
      : "Not connected: " + ((r && r.error) || "no reply") + ". Run bash native/install.sh, then reload the extension.";
  });
});
$("resFile").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  $("resStatus").textContent = "Reading…";
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const r = await chrome.runtime.sendMessage({ type: "uploadResume", name: f.name, b64: btoa(bin), makeDefault: true });
  if (!r || r.error) { $("resStatus").textContent = "Couldn't read it: " + ((r && r.error) || "no reply"); return; }
  $("resStatus").textContent = `Saved (${r.chars} characters of text found).`;
  await load();
});
$("exportCsv").addEventListener("click", () => {
  const cols = ["ts", "status", "site", "company", "title", "url", "applyUrl", "match", "missing", "resume", "reason"];
  const rows = [cols.join(",")].concat((store.log || []).map((e) => cols.map((c) => csvCell(c === "ts" ? new Date(e.ts).toISOString() : e[c])).join(",")));
  download(`job-autopilot-${new Date().toISOString().slice(0, 10)}.csv`, rows.join("\n"), "text/csv");
});
$("exportJson").addEventListener("click", () => download(`job-autopilot-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.log || [], null, 1), "application/json"));
$("clearLog").addEventListener("click", async () => {
  if (!confirm("Clear the application log? Export it first if you want to keep it. (It's also what stops double-applying.)")) return;
  await chrome.storage.local.set({ log: [] });
  store.log = []; renderLog();
});
chrome.storage.onChanged.addListener((ch) => { if (ch.log) { store.log = ch.log.newValue; renderLog(); } });
load();
