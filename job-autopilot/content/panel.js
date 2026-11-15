// The floating panel (top frame only), in a shadow root so page CSS can't touch it.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});
  if (window !== window.top) return;

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:52px;height:52px;border-radius:26px;border:0;background:#1d4ed8;color:#fff;font:700 15px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer}
  .card{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:370px;max-width:calc(100vw - 32px);max-height:84vh;overflow:auto;background:#fff;color:#111827;border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.35);font-size:13px;line-height:1.45}
  .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1d4ed8;color:#fff;position:sticky;top:0;z-index:1}
  .hd b{flex:1;font-size:14px}
  .hd button{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1}
  .sec{padding:10px 12px;border-bottom:1px solid #e5e7eb}
  .muted{color:#6b7280}
  .title{font-weight:600;font-size:14px}
  .score{display:flex;align-items:center;gap:8px;margin-top:6px}
  .bar{flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden}
  .bar i{display:block;height:100%;background:#16a34a}
  .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
  .chip{padding:2px 7px;border-radius:10px;font-size:12px;border:1px solid}
  .ok{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
  .safe{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a}
  .new{background:#fffbeb;border-color:#fde68a;color:#92400e}
  .req{font-weight:600}
  .h{font-weight:600;margin-top:8px}
  button.b{border:1px solid #d1d5db;background:#f9fafb;color:#111827;border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer}
  button.p{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
  button.s{background:#fee2e2;border-color:#fecaca;color:#991b1b}
  button:disabled{opacity:.5;cursor:default}
  .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
  .status{padding:8px 10px;border-radius:8px;margin-top:6px;background:#f3f4f6}
  .status.info{background:#eff6ff;color:#1e3a8a}
  .status.good{background:#ecfdf5;color:#065f46}
  .status.warn{background:#fffbeb;color:#92400e}
  .status.bad{background:#fef2f2;color:#991b1b}
  .log{max-height:110px;overflow:auto;font-size:12px;color:#374151;margin-top:6px}
  .q{margin-top:8px}
  .q label{display:block;font-weight:600;margin-bottom:3px}
  .q input,.q select,.tok{width:100%;padding:5px 7px;border:1px solid #d1d5db;border-radius:6px;font-size:13px}
  .tok{width:140px}
  details summary{cursor:pointer;color:#374151;margin-top:6px}
  a{color:#1d4ed8}
  .chip button{border:0;background:transparent;color:inherit;font:700 12px system-ui;cursor:pointer;padding:0 0 0 4px}
  .need{margin-top:8px;padding:10px;border-radius:10px;background:#fff7ed;border:2px solid #fb923c;color:#7c2d12}
  .need b{display:block;font-size:14px;margin-bottom:4px}
  .tail{margin-top:6px;padding:8px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0}
  .tail ul{margin:4px 0 0 16px;padding:0;font-size:12px}
  .count{margin-top:6px;padding:8px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-weight:600;display:flex;justify-content:space-between;align-items:center}
  `;

  let host, root, els = {}, onAction = () => {}, collapsed = false, askState = null;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : String(k));
    return e;
  }

  JA.panel = {
    mounted: () => !!host && host.isConnected,
    mount(handler) {
      onAction = handler || onAction;
      if (host && host.isConnected) return;
      host = document.createElement("div");
      host.id = "ja-panel-host";
      root = host.attachShadow({ mode: "open" });
      root.append(h("style", {}, CSS));
      els.fab = h("button", { class: "fab", title: "Job Autopilot", onclick: () => JA.panel.expand() }, "JA");
      els.job = h("div", { class: "sec" }, h("span", { class: "muted" }, "Reading the job description…"));
      els.gap = h("div", { class: "sec" });
      els.fileIn = h("input", { type: "file", accept: "application/pdf", style: "display:none", onchange: (e) => onAction("resumeFile", e.target.files[0], els.mkDefault.checked) });
      els.mkDefault = h("input", { type: "checkbox" });
      els.resume = h("span", { class: "muted" }, "…");
      els.token = h("input", { class: "tok", placeholder: "company", title: "Company name used in your password template on this site" });
      els.tokenRow = h("div", { class: "row" }, h("span", { class: "muted" }, "Company (password):"), els.token);
      els.ask = h("div");
      els.need = h("div");
      els.count = h("div");
      els.tail = h("div");
      els.batch = h("div", { class: "row" });
      els.status = h("div", { class: "status" }, "Ready.");
      els.log = h("div", { class: "log" });
      els.btnFill = h("button", { class: "b", onclick: () => onAction("fill") }, "Fill only");
      els.btnApply = h("button", { class: "b p", onclick: () => onAction("apply") }, "Auto-apply");
      els.btnStop = h("button", { class: "b s", onclick: () => onAction("stop"), disabled: "" }, "Stop");
      els.counts = h("span", { class: "muted" });
      els.card = h("div", { class: "card" },
        h("div", { class: "hd" }, h("b", {}, "Job Autopilot"), h("button", { title: "Minimise", onclick: () => JA.panel.collapse() }, "–")),
        els.job,
        els.gap,
        h("div", { class: "sec" },
          h("div", {}, h("b", {}, "Resume: "), els.resume),
          els.tail,
          h("div", { class: "row" },
            h("button", { class: "b", onclick: () => els.fileIn.click() }, "Upload my own PDF"),
            h("label", { class: "muted" }, els.mkDefault, " keep as default"), els.fileIn),
          h("div", { class: "row" }, h("button", { class: "b", onclick: () => { if (confirm("Upload the current tailored resume to Google Drive and allow anyone with the link to view it?")) onAction("createDriveLink"); } }, "Create Google Drive link")),
          els.tokenRow),
        h("div", { class: "sec" },
          els.need,
          h("div", { class: "row" }, els.btnApply, els.btnFill, els.btnStop),
          els.count, els.batch,
          els.status, els.ask, els.log,
          h("div", { class: "row" }, els.counts, h("a", { href: "#", onclick: (e) => { e.preventDefault(); onAction("options"); } }, "Settings"))));
      root.append(els.card);
      document.documentElement.append(host);
    },
    collapse() { collapsed = true; els.card.remove(); root.append(els.fab); },
    expand() { collapsed = false; els.fab.remove(); root.append(els.card); },
    toggle() { if (!JA.panel.mounted()) return; collapsed ? JA.panel.expand() : JA.panel.collapse(); },
    showToken(show, value) { els.tokenRow.style.display = show ? "" : "none"; if (value !== undefined && !els.token.value) els.token.value = value; },
    token: () => (els.token ? els.token.value.trim() : ""),
    setResume(meta) { els.resume.textContent = meta ? `${meta.name}${meta.tailored ? " (tailored)" : meta.perTab ? " (this tab only)" : ""}` : "none — upload one in Settings"; },
    showResumeLink(url) { els.tail.append(h("div", { class: "row" }, h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "Open resume link"), h("button", { class: "b", onclick: async (e) => { try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied"; } catch (_) { e.target.textContent = "Copy failed"; } } }, "Copy link"))); },
    setCounts(c, s) { els.counts.textContent = c ? `Today: ${c.total}/${s.dailyCap} applied · LinkedIn ${c.linkedin}/${s.linkedinDailyCap} · Naukri ${c.naukri}/${s.naukriDailyCap}  ` : ""; },
    running(on) { els.btnApply.disabled = on; els.btnFill.disabled = on; els.btnStop.disabled = !on; },
    status(msg, kind) { els.status.className = "status " + (kind || ""); els.status.textContent = msg; JA.panel.log(msg); },
    log(msg) {
      if (!els.log) return;
      const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      els.log.prepend(h("div", {}, `${t}  ${msg}`));
      while (els.log.childNodes.length > 40) els.log.lastChild.remove();
    },
    setJob(jd, a, meta) {
      els.job.replaceChildren(
        h("div", { class: "title" }, jd.title || "(title not found)"),
        h("div", { class: "muted" }, [jd.company, jd.location].filter(Boolean).join(" · ") || (meta && meta.fromTab ? "JD carried over from the previous tab" : "")),
        h("div", { class: "muted" }, [a && a.years ? "Asks: " + a.years : null, a && a.salary ? "Pay: " + a.salary : null, meta && meta.applied ? "⚠ You already applied to this job" : null].filter(Boolean).join(" · "))
      );
      if (!a || !a.found.length) { els.gap.replaceChildren(h("span", { class: "muted" }, jd.text ? "No known skill keywords found in this JD." : "No JD on this page. Open the job post first so the gap check can run.")); return; }
      const chip = (f, cls) => h("span", { class: `chip ${cls}${f.section === "required" ? " req" : ""}`, title: `${f.section} · mentioned ${f.count}×` },
        f.name + (f.section === "preferred" ? " (nice)" : ""),
        cls === "new" ? h("button", { title: `I've really used ${f.name}: add it to my record and to tailored resumes`, onclick: () => onAction("addSkill", f.name) }, "+") : null);
      const copyText = a.missingOnRecord.concat(a.missingNew).map((f) => f.name).join(", ");
      const missing = a.missingOnRecord.concat(a.missingNew);
      const checks = missing.map((f) => {
        const input = h("input", { type: "checkbox", value: f.name, onchange: () => onAction("pauseCountdown") });
        return { input, label: h("label", { class: `chip ${f.onRecord ? "safe" : "new"}` }, input, " ", f.name) };
      });
      els.gap.replaceChildren(...[
        h("div", { class: "score" }, h("b", {}, `Resume match ${a.score === null ? "–" : a.score + "%"}`), h("div", { class: "bar" }, h("i", { style: `width:${a.score || 0}%` }))),
        a.missingOnRecord.length ? h("div", { class: "h" }, "Missing from resume, but on your record — safe to add:") : null,
        a.missingOnRecord.length ? h("div", { class: "chips" }, a.missingOnRecord.map((f) => chip(f, "safe"))) : null,
        a.missingNew.length ? h("div", { class: "h" }, "Not on your record — press + only if you've really used it (it's added to your resume then):") : null,
        a.missingNew.length ? h("div", { class: "chips" }, a.missingNew.map((f) => chip(f, "new"))) : null,
        !a.missingOnRecord.length && !a.missingNew.length ? h("div", { class: "h" }, "Every skill keyword in this JD is on your resume.") : null,
        h("details", {}, h("summary", {}, `Matched (${a.matched.length})`), h("div", { class: "chips" }, a.matched.map((f) => chip(f, "ok")))),
        missing.length ? h("div", { class: "h" }, "Select only skills you have actually used:") : null,
        missing.length ? h("div", { class: "chips" }, checks.map((c) => c.label)) : null,
        missing.length ? h("div", { class: "row" },
          h("button", { class: "b", onclick: () => { onAction("pauseCountdown"); checks.forEach((c) => { c.input.checked = true; }); } }, "Select all"),
          h("button", { class: "b p", onclick: () => onAction("addSkillsAndFill", checks.filter((c) => c.input.checked).map((c) => c.input.value)) }, "Update resume & fill")) : null,
        h("div", { class: "row" },
          copyText ? h("button", { class: "b", onclick: async (e) => { try { await navigator.clipboard.writeText(copyText); e.target.textContent = "Copied"; } catch (_) { e.target.textContent = "Copy failed"; } } }, "Copy missing keywords") : null,
          h("span", { class: "muted" }, "Bold = in the JD's requirements."))
      ].filter(Boolean));
    },
    // units: [{label, options|null, kind}] ; done(answers[], remember)
    ask(units, done) {
      askState = { units, done };
      const rows = units.map((u, i) => {
        let input;
        if (u.options && u.options.length && u.kind !== "text" && u.kind !== "textarea") {
          input = h("select", { "data-i": i }, h("option", { value: "" }, "— choose —"), u.options.filter((o) => o && !/^(select|choose|--)/i.test(o)).map((o) => h("option", { value: o }, o)));
        } else input = h("input", { "data-i": i, placeholder: u.kind === "checkbox" ? "yes / no" : "your answer" });
        return h("div", { class: "q" }, h("label", {}, u.label || "(unlabelled required field)"), input);
      });
      const remember = h("input", { type: "checkbox", checked: "" });
      els.status.className = "status warn"; els.status.textContent = "Waiting for your answer (below).";
      els.ask.replaceChildren(h("div", { class: "need" }, h("b", {}, `Please answer ${units.length > 1 ? "these" : "this"} to move on`), `I don't have ${units.length > 1 ? "these" : "this"} on record. I'll remember your answer.`), ...rows,
        h("div", { class: "row" }, h("label", { class: "muted" }, remember, " remember for next time"),
          h("button", { class: "b p", onclick: () => {
            const vals = units.map((_, i) => { const e = els.ask.querySelector(`[data-i="${i}"]`); return e ? e.value.trim() : ""; });
            els.ask.replaceChildren();
            const st = askState; askState = null;
            st.done(vals, remember.checked);
          } }, "Save & continue")));
      if (collapsed) JA.panel.expand();
    },
    clearAsk() { askState = null; if (els.ask) els.ask.replaceChildren(); },

    setTailored(t) {
      if (!els.tail) return;
      if (!t) { els.tail.replaceChildren(); return; }
      if (t.busy) { els.tail.replaceChildren(h("div", { class: "tail" }, "Tailoring your resume to this JD…")); return; }
      if (t.error) { els.tail.replaceChildren(h("div", { class: "tail" }, "Couldn't tailor: " + t.error)); return; }
      const fam = { fullstack: "Full Stack", frontend: "Frontend", backend: "Backend", sde: "Software Engineer" }[t.family] || t.family;
      els.tail.replaceChildren(h("div", { class: "tail" },
        h("div", {}, h("b", {}, `Tailored for this job (${fam})`), ` · match ${t.scoreBefore ?? "–"}% → ${t.scoreAfter ?? "–"}% · 1 page`),
        t.savedAs ? h("div", { class: "muted" }, "Saved: Downloads/" + t.savedAs) : null,
        h("details", {}, h("summary", {}, `What changed (${(t.changes || []).length})`), h("ul", {}, (t.changes || []).map((c) => h("li", {}, c)))),
        h("div", { class: "row" },
          h("button", { class: "b", onclick: () => onAction("preview") }, "Preview"),
          h("button", { class: "b", onclick: () => onAction("retailor") }, "Re-tailor"),
          h("button", { class: "b", onclick: () => onAction("original") }, "Use original"))));
    },

    // the rare thing only you can do
    needYou(msg) {
      if (!els.need) return;
      els.need.replaceChildren(h("div", { class: "need" },
        h("b", {}, "Please do this to move on:"), msg,
        h("div", { class: "row" },
          h("button", { class: "b p", onclick: () => onAction("continue") }, "Done — Continue"),
          h("button", { class: "b", onclick: () => onAction("skip") }, "Skip this job"))));
      els.status.className = "status warn"; els.status.textContent = "Waiting for you (see above).";
      JA.panel.log("NEEDS YOU: " + msg);
      if (!/^⚠/.test(document.title)) document.title = "⚠ " + document.title;
      if (collapsed) JA.panel.expand();
    },
    clearNeedYou() { if (els.need) els.need.replaceChildren(); document.title = document.title.replace(/^⚠ /, ""); },

    countdown(sec, cancel) {
      if (!els.count) return;
      if (sec === null) { els.count.replaceChildren(); return; }
      els.count.replaceChildren(h("div", { class: "count" }, `Hands-free: applying in ${sec}s…`, h("button", { class: "b", onclick: cancel }, "Cancel")));
    },

    setBatch(b, candidates) {
      if (!els.batch) return;
      if (b && b.active) {
        els.batch.replaceChildren(h("span", { class: "muted" }, `Batch: job ${Math.min(b.i + 1, b.urls.length)} of ${b.urls.length} · ${b.results.filter((r) => r.result === "applied").length} applied`),
          h("button", { class: "b s", onclick: () => onAction("batchStop") }, "Stop batch"));
      } else if (candidates) {
        els.batch.replaceChildren(h("button", { class: "b p", onclick: () => onAction("batch") }, `Apply to all ${candidates} jobs on this page`));
      } else els.batch.replaceChildren();
    }
  };
})();
