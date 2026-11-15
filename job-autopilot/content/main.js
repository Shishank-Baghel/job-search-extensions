// Orchestrator. Top frame: panel, JD analysis, resume tailoring, hands-free + batch apply, the step loop.
// Sub-frames: fill an embedded application form when asked.
(async () => {
  const JA = globalThis.JA;
  if (!JA || window.__JA_main) return;
  window.__JA_main = true;
  const isTop = window === window.top;
  const site = (JA.site = JA.detectSite());
  const state = { running: false, stop: false, jd: null, analysis: null, url: location.href, frameUnits: null, autoTried: new Set(), countdown: null, tailoredFor: null };
  let cfg = null;
  const ctx = {};

  // After the extension is reloaded, copies already running in open tabs are cut off from it
  // (chrome.runtime.id disappears). They go quiet and point to a refresh instead of erroring.
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const STALE = "Job Autopilot was updated. Refresh this page (F5) to use it here.";

  async function loadCfg() {
    if (!alive()) throw new Error(STALE);
    let response = await JA.send({ type: "getConfig" });
    if (!response && alive()) { await JA.sleep(700); response = await JA.send({ type: "getConfig" }); } // service worker still waking up
    if (!response || response.error || !response.settings || !response.profile) {
      cfg = null;
      throw new Error(response && response.error ? "Could not load extension settings: " + response.error : "The extension is unavailable or was reloaded. Refresh this page (F5) and try again.");
    }
    cfg = response;
    ctx.resumeSkills = new Set(JA.skillsIn(cfg.resumeText || "", cfg.customKeywords));
    return cfg;
  }
  const log = (m) => { if (isTop && JA.panel && JA.panel.mounted()) JA.panel.log(m); else JA.send({ type: "relay", payload: { type: "log", msg: m } }); };

  function looksLikeJobPage() {
    return site.isJobPage();
  }

  // ---------- JD + gap analysis + tailoring ----------
  async function analyze() {
    if (!cfg) await loadCfg();
    let jd = site.jd();
    let fromTab = false;
    const carried = cfg.tabJD && cfg.tabJD.text && Date.now() - (cfg.tabJD.at || 0) < 45 * 60 * 1000 && cfg.tabJD.url !== location.href;
    if ((!jd.text || jd.text.length < 200) && carried) { jd = Object.assign({}, cfg.tabJD); fromTab = true; }
    if (!jd.company && cfg.tabJD && cfg.tabJD.company) jd.company = cfg.tabJD.company;
    state.jd = jd;
    state.analysis = jd.text ? JA.analyzeJD(jd.text, cfg.resumeText || "", cfg.knownSkills, cfg.customKeywords) : null;
    const key = site.jobKey();
    const applied = site.applied() || (cfg.appliedKeys || []).includes(key);
    if (JA.panel && JA.panel.mounted()) {
      JA.panel.setJob(jd, state.analysis, { fromTab, applied });
      JA.panel.setResume(cfg.resumeMeta);
      JA.panel.setCounts(cfg.counts, cfg.settings);
      const acct = (cfg.accounts || {})[location.hostname];
      JA.panel.showToken(!site.noAccount, (acct && acct.company) || site.tokenClean());
      JA.panel.setBatch(cfg.batch, batchCandidates().length);
    }
    if (!fromTab && jd.text && jd.text.length >= 200) {
      await JA.send({ type: "setJD", jd: { title: jd.title, company: jd.company, location: jd.location, text: jd.text.slice(0, 30000), url: location.href, jobKey: key, source: site.source || site.id, at: Date.now() } });
    }
    if (site.isJobPage() && jd.text && jd.text.length >= 200 && cfg.settings.tailorResume) await tailor(false);
    return { applied };
  }

  async function tailor(force, requiredSkills) {
    const key = (cfg.tabJD && cfg.tabJD.jobKey) || site.jobKey();
    if (!force && (state.tailoredFor === key || (cfg.resumeMeta && cfg.resumeMeta.manual))) return;
    if (!force && cfg.resumeMeta && cfg.resumeMeta.tailoredFor === key) { state.tailoredFor = key; JA.panel.setTailored(cfg.resumeMeta.tailored); return; }
    state.tailoredFor = key;
    JA.panel.setTailored({ busy: true });
    const r = await JA.send({ type: "tailorResume", jd: { title: state.jd.title, company: state.jd.company, text: state.jd.text }, jobKey: key, requiredSkills });
    if (!r || r.error) { state.tailoredFor = null; JA.panel.setTailored({ error: (r && r.error) || "no reply" }); return false; }
    await loadCfg();
    state.analysis = JA.analyzeJD(state.jd.text, cfg.resumeText || "", cfg.knownSkills, cfg.customKeywords);
    JA.panel.setJob(state.jd, state.analysis, {});
    JA.panel.setResume(cfg.resumeMeta);
    JA.panel.setTailored(r);
    return true;
  }

  function ensurePanel(force) {
    if (!isTop) return;
    if (!JA.panel.mounted()) {
      if (!force && cfg && cfg.settings && cfg.settings.autoPanel === false) return;
      JA.panel.mount(onAction);
    } else if (force) JA.panel.toggle();
  }

  // ---------- batch: every job on a LinkedIn / Naukri results page ----------
  function batchCandidates() {
    const urls = new Set();
    if (site.id === "linkedin" && /\/jobs\/(search|collections)/.test(location.pathname)) {
      document.querySelectorAll("a[href*='/jobs/view/']").forEach((a) => { const m = a.href.match(/\/jobs\/view\/(\d+)/); if (m) urls.add(`https://www.linkedin.com/jobs/view/${m[1]}/`); });
      document.querySelectorAll("a[href*='currentJobId=']").forEach((a) => { const m = a.href.match(/currentJobId=(\d+)/); if (m) urls.add(`https://www.linkedin.com/jobs/view/${m[1]}/`); });
      document.querySelectorAll("[data-job-id], [data-occludable-job-id]").forEach((e) => { const id = e.getAttribute("data-job-id") || e.getAttribute("data-occludable-job-id"); if (/^\d+$/.test(id || "")) urls.add(`https://www.linkedin.com/jobs/view/${id}/`); });
    }
    if (site.id === "naukri" && !/job-listings-/.test(location.pathname)) {
      document.querySelectorAll("a[href*='/job-listings-']").forEach((a) => urls.add(a.href.split("?")[0]));
    }
    const done = new Set(cfg ? cfg.appliedKeys || [] : []);
    return [...urls].filter((u) => {
      const m = u.match(/\/jobs\/view\/(\d+)/) || u.match(/-(\d{6,})\/?$/);
      return !m || !(done.has("linkedin:" + m[1]) || done.has("naukri:" + m[1]));
    });
  }

  // ---------- panel actions ----------
  async function onAction(what, a, b) {
    if (what === "pauseCountdown") { cancelCountdown(); return; }
    if (what === "stop") { state.stop = true; cancelCountdown(); JA.panel.status("Stopping after this step…", "warn"); return; }
    if (what === "options") { JA.send({ type: "openOptions" }); return; }
    if (what === "preview") { JA.send({ type: "previewResume" }); return; }
    if (what === "createDriveLink") {
      cancelCountdown();
      JA.panel.status("Creating a Google Drive link for the tailored resume…", "info");
      const result = await JA.send({ type: "createDriveLink" });
      if (!result || result.error) { JA.panel.status("Could not create the link: " + ((result && result.error) || "no reply"), "bad"); return; }
      await loadCfg();
      JA.panel.showResumeLink(result.url);
      JA.panel.status("Google Drive link created. Anyone with the link can view this resume.", "good");
      return;
    }
    if (what === "retailor") { await tailor(true); return; }
    if (what === "original") { await JA.send({ type: "useOriginalResume" }); await loadCfg(); state.tailoredFor = "manual"; JA.panel.setTailored(null); JA.panel.setResume(cfg.resumeMeta); return; }
    if (what === "addSkillsAndFill") {
      cancelCountdown();
      if (state.running) { JA.panel.status("Stop the current application before updating the resume.", "warn"); return; }
      const available = state.analysis ? state.analysis.missingOnRecord.concat(state.analysis.missingNew).map((f) => f.name) : [];
      const selected = (a || []).filter((name) => available.includes(name));
      if (!selected.length) { JA.panel.status("Select the skills you have used first.", "warn"); return; }
      const added = await JA.send({ type: "addKnownSkills", names: selected });
      if (!added || added.error) { JA.panel.status("Could not save skills: " + ((added && added.error) || "no reply"), "bad"); return; }
      await loadCfg();
      JA.panel.status("Building one updated resume…", "info");
      if (!(await tailor(true, selected))) return;
      ctx.replaceResume = true;
      await run("fill");
      return;
    }
    if (what === "addSkill") {
      cancelCountdown();
      await JA.send({ type: "addKnownSkill", name: a });
      await loadCfg();
      JA.panel.status(`Added "${a}" to your record. Re-tailoring…`, "info");
      if (cfg.settings.tailorResume) await tailor(true); else await analyze();
      return;
    }
    if (what === "batch") {
      const urls = batchCandidates();
      if (!urls.length) { JA.panel.status("No new jobs found on this page (already-applied ones are skipped).", "info"); return; }
      JA.panel.status(`Batch: applying to ${urls.length} jobs, one by one…`, "info");
      await JA.send({ type: "batchStart", urls, from: location.href });
      return;
    }
    if (what === "batchStop") { await JA.send({ type: "batchStop" }); await loadCfg(); JA.panel.setBatch(null, batchCandidates().length); JA.panel.status("Batch stopped.", "warn"); return; }
    if (what === "continue") { JA.panel.clearNeedYou(); run(state.lastMode || "apply", { startedAt: Date.now(), submitted: ctx.submitted }); return; }
    if (what === "skip") { JA.panel.clearNeedYou(); await batchAdvance("skipped"); return; }
    if (what === "resumeFile") {
      if (!a) return;
      JA.panel.status(`Reading ${a.name}…`, "info");
      const buf = new Uint8Array(await a.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const r = await JA.send({ type: "uploadResume", name: a.name, b64: btoa(bin), makeDefault: !!b });
      if (!r || r.error) { JA.panel.status("Couldn't read that PDF: " + ((r && r.error) || "no reply"), "bad"); return; }
      await loadCfg();
      state.tailoredFor = "manual";
      await analyze();
      JA.panel.setTailored(null);
      JA.panel.status(`Using ${a.name}${b ? " (saved as default)" : " for this tab"}. Gap check updated.`, "good");
      return;
    }
    if (what === "fill" || what === "apply") { cancelCountdown(); run(what); }
  }

  // ---------- hands-free ----------
  function cancelCountdown() { if (state.countdown) { clearInterval(state.countdown); state.countdown = null; JA.panel.countdown(null); } }

  function handsFreeCheck() {
    const s = cfg.settings, a = state.analysis;
    if (!state.jd || !state.jd.text) return "no JD";
    if (a && a.score !== null && a.score < s.handsFreeMinMatch) return `match ${a.score}% is below your ${s.handsFreeMinMatch}% minimum`;
    const minYears = a && a.years ? parseFloat(a.years) : null;
    if (minYears !== null && minYears > s.handsFreeMaxYears) return `asks ${a.years}, above your ${s.handsFreeMaxYears}-year limit`;
    return null;
  }

  async function maybeHandsFree(applied) {
    if (!isTop || state.running) return;
    const key = site.jobKey();
    const batchOn = cfg.batch && cfg.batch.active;
    if (!batchOn && !cfg.settings.handsFree) return;
    if (!site.isJobPage() || state.autoTried.has(key)) return;
    state.autoTried.add(key);
    if (applied) { if (batchOn) await batchAdvance("already applied"); return; }
    const why = handsFreeCheck();
    if (why) {
      JA.panel.status(`Hands-free skipped this job: ${why}. Press Auto-apply to apply anyway.`, "info");
      if (batchOn) await batchAdvance("skipped: " + why);
      return;
    }
    if (batchOn) { run("apply"); return; }
    let left = cfg.settings.handsFreeDelaySec;
    JA.panel.countdown(left, () => cancelCountdown());
    state.countdown = setInterval(() => {
      left--;
      if (left <= 0) { cancelCountdown(); if (location.href === state.url) run("apply"); }
      else JA.panel.countdown(left, () => cancelCountdown());
    }, 1000);
  }

  async function batchAdvance(result) {
    if (!cfg || !cfg.batch || !cfg.batch.active) return;
    await JA.send({ type: "batchNext", result: { url: location.href, title: state.jd ? state.jd.title : "", result } });
  }

  // ---------- the loop ----------
  function signature(root) {
    const r = root || document;
    const heads = [...r.querySelectorAll("h1, h2, h3, legend, [data-automation-id='pageHeaderTitleText']")].filter(JA.visible).slice(0, 4).map(JA.text).join("|");
    return location.href + "#" + JA.fieldCount(r) + "#" + heads;
  }

  function capReached() {
    const c = cfg.counts || {}, s = cfg.settings;
    if (c.total >= s.dailyCap) return `Daily cap reached (${c.total}/${s.dailyCap}). Change it in Settings if you want more.`;
    if (site.id === "linkedin" && c.linkedin >= s.linkedinDailyCap) return `LinkedIn daily cap reached (${c.linkedin}/${s.linkedinDailyCap}). LinkedIn restricts accounts that apply in bursts.`;
    if (site.id === "naukri" && c.naukri >= s.naukriDailyCap) return `Naukri daily cap reached (${c.naukri}/${s.naukriDailyCap}).`;
    return null;
  }

  async function markSubmitted() {
    ctx.submitted = true;
    await JA.send({ type: "patchAutopilot", patch: { submitted: true } });
  }

  async function finish(kind, reason) {
    state.running = false;
    JA.panel.running(false);
    const jd = state.jd || {};
    const a = state.analysis;
    const entry = { site: site.id, company: jd.company || ctx.companyToken || "", title: jd.title || document.title, url: (cfg && cfg.tabJD && cfg.tabJD.url) || location.href,
      applyUrl: location.href, jobKey: ctx.jobKey, match: a ? a.score : null, missing: a ? a.missingOnRecord.concat(a.missingNew).map((f) => f.name) : [],
      resume: cfg && cfg.resumeMeta ? cfg.resumeMeta.name : null, aiAnswers: ctx.aiAnswers && ctx.aiAnswers.length ? ctx.aiAnswers.slice(-30) : undefined, diag: ctx.diag && ctx.diag.length ? ctx.diag.slice(-6) : undefined, tailored: cfg && cfg.resumeMeta && cfg.resumeMeta.tailored ? cfg.resumeMeta.tailored.family : null };
    if (kind === "applied") {
      JA.panel.status("Submitted — confirmation seen. Logged.", "good");
      const r = await JA.send({ type: "logApp", entry: Object.assign(entry, { status: "applied" }) });
      if (r && r.counts) JA.panel.setCounts(r.counts, cfg.settings);
      await JA.send({ type: "setAutopilot", ap: null });
      if (site.afterSuccess) await site.afterSuccess();
      await batchAdvance("applied");
      return;
    }
    if (kind === "needs_user") {
      JA.panel.needYou(reason);
      JA.send({ type: "notify", title: "Please do this", message: `${reason}\n${jd.title || ""} ${jd.company ? "· " + jd.company : ""}` });
      await JA.send({ type: "logApp", entry: Object.assign(entry, { status: "needs_user", reason }) });
      await JA.send({ type: "setAutopilot", ap: null });
      return;
    }
    if (kind === "ask") return; // waiting for answers in the panel
    if (kind === "handoff") { JA.panel.status(reason, "info"); await batchAdvance("continued in a new tab"); return; }
    JA.panel.status(reason, kind === "stopped" ? "warn" : "info");
    await JA.send({ type: "setAutopilot", ap: null });
    if (kind === "stopped" || kind === "skip") await batchAdvance(reason);
  }

  async function run(mode, resumed) {
    if (state.running) return;
    state.running = true; state.stop = false; state.lastMode = mode;
    JA.panel.running(true);
    JA.panel.clearAsk();
    JA.panel.clearNeedYou();
    try {
      await loadCfg();
      if (!state.jd) await analyze();
      ctx.site = site.id;
      ctx.source = (cfg.tabJD && cfg.tabJD.source) || site.source || site.id;
      ctx.company = (state.jd && state.jd.company) || (cfg.tabJD && cfg.tabJD.company) || "";
      ctx.jobLocation = (state.jd && state.jd.location) || "";
      ctx.jdSkills = JA.skillsIn((state.jd && state.jd.text) || "", cfg.customKeywords);
      const acct = (cfg.accounts || {})[location.hostname];
      ctx.companyToken = JA.panel.token() || (acct && acct.company) || site.tokenClean();
      ctx.jobKey = (cfg.tabJD && cfg.tabJD.jobKey) || site.jobKey();
      ctx.submitted = !!(resumed && resumed.submitted);
      if (!resumed) { ctx.linkedinTry = 0; ctx.aiAnswers = []; ctx.triggerTried = false; ctx.diag = []; ctx.fixLog = []; ctx.aiDown = false; }
      ctx.appliedBefore = (cfg.log || []).some((e) => e.status === "applied" && ctx.company && JA.norm(e.company) === JA.norm(ctx.company));
      if (mode === "apply" && !resumed) {
        if (site.applied() || (cfg.appliedKeys || []).includes(site.jobKey())) return finish("skip", "Already applied to this job — not sending it twice.");
        const cap = capReached();
        if (cap) return finish("info", cap);
      }
      if (mode === "apply" && cfg.settings.tailorResume && state.jd && state.jd.text) await tailor(false);
      // after a submit that navigated here, any confirmation on this page is new
      JA.successBaseline = ctx.submitted ? new Set() : JA.successPhrases();
      JA.successBaselineText = ctx.submitted ? "" : JA.norm(JA.bodyText().slice(0, 15000));
      await JA.send({ type: "setAutopilot", ap: { mode, startedAt: (resumed && resumed.startedAt) || Date.now(), steps: (resumed && resumed.steps) || 0, submitted: ctx.submitted } });
      JA.panel.status(mode === "apply" ? "Auto-applying…" : "Filling…", "info");
      const r = await loop(mode);
      if (r) await finish(r.kind, r.reason);
    } catch (e) {
      await finish("needs_user", "Something broke: " + (e && e.message ? e.message : e) + ". Refresh the page and press Auto-apply.");
    }
  }

  // "applied" needs both: we pressed the final submit in this flow, and a confirmation appeared
  const done = () => (ctx.submitted && site.success() ? { kind: "applied" } : null);

  const OPENS_FORM = new Set(["lever", "ashby", "workday", "linkedin"]);
  async function loop(mode) {
    let started = 0, stuck = 0, resumeDone = false, filledOnce = false, uploadTried = false, settle = 0, fixTries = 0;
    for (let step = 0; step < 40; step++) {
      if (state.stop) return { kind: "stopped", reason: "Stopped. Nothing else was clicked." };
      await JA.pace(cfg);
      await JA.send({ type: "bumpAutopilot" });
      const fin = done();
      if (fin) return fin;
      if (!ctx.submitted && site.success()) return { kind: "info", reason: "This page already shows a confirmation from earlier — not logging it as a new application." };
      if (JA.dismissCookies()) { log("Closed a cookie banner."); await JA.sleep(600); }
      const blk = JA.blocker();
      if (blk) return { kind: "needs_user", reason: `${blk}. Do it in the page, then press Continue.` };

      if (!site.noAccount && JA.accountPage()) {
        const r = await JA.handleAccount(cfg, ctx, log);
        if (r.stop) return { kind: "needs_user", reason: r.stop };
        continue;
      }

      if (site.chat && site.chat.active()) {
        const r = await site.chat.step(cfg, ctx, log);
        if (r.ask) {
          const chatApply = async (u, v) => site.chat.answer(u, v);
          const left = await aiAssist([r.ask], chatApply);
          if (left.length) return askUser(left, mode, chatApply);
        }
        if (r.none) { await JA.sleep(1200); const confirmed = done(); if (confirmed) return confirmed; }
        continue;
      }

      let root = site.root();
      if (!root && filledOnce && site.next(document.body)) root = document.body; // e.g. a review page with only a Submit button
      const hasForm = !!root && (JA.fieldCount(root) >= 1 || (filledOnce || site.id === "workday") && !!site.next(root));
      if (!hasForm) {
        // Fill only may open the form where Apply just opens it; on Naukri and unknown boards Apply can submit.
        if ((mode === "apply" || OPENS_FORM.has(site.id)) && started < 3) {
          const s = await site.start(log);
          if (s && s.external) {
            await JA.send({ type: "followNewTab", ap: { mode } });
            // a real link opens through the extension: a click from here would hit Chrome's popup blocker
            const href = s.external.tagName === "A" && /^https?:\/\//i.test(s.external.href) ? s.external.href : null;
            if (href) await JA.send({ type: "openTab", url: href }); else JA.click(s.external);
            return { kind: "handoff", reason: "Opened the company's apply page in a new tab — the panel continues there." };
          }
          if (s === "started" || s === "navigating") {
            started++;
            if (site.id === "naukri") await markSubmitted(); // Naukri's Apply button is the submission
            await JA.sleep(2500);
            continue;
          }
        }
        if (document.querySelector("iframe")) {
          const fr = await JA.send({ type: "runFrames", mode, replaceResume: !!ctx.replaceResume });
          if (fr && fr.handled) ctx.replaceResume = false;
          if (fr && fr.handled) return frameResult(fr, mode);
        }
        if (site.id === "naukri" && started) { await JA.sleep(1500); const confirmed = done(); if (confirmed) return confirmed; }
        if (settle++ < 4) { await JA.sleep(2500); continue; } // slow page still rendering: look again
        return { kind: "needs_user", reason: mode === "fill" ? "No application form on this page yet. Press Auto-apply to open it." : "I can't find the application form or an Apply button on this page. Click Apply (or open the form) yourself, then press Continue." };
      }

      if (!resumeDone || site.id === "workday" || site.id === "linkedin") {
        const res = await getResume();
        if (site.id !== "linkedin" || cfg.settings.uploadResumeOnLinkedIn) {
          // HPE renders its required resume importer outside the application <form>.
          const hpe = /(^|\.)careers\.hpe\.com$/i.test(location.hostname);
          const hpeButton = hpe && JA.buttons(document).find((b) => /^upload\s+(?:resume|cv)$/i.test(JA.btnText(b)));
          const uploadRoot = hpeButton ? document : root;
          const uploaded = () => {
            const text = JA.bodyText().toLowerCase();
            const displayedFile = [...document.querySelectorAll("input[type=file]")].filter((i) => !JA.inPanel(i)).some((i) => [...(i.files || [])].some((f) => f.name && text.includes(f.name.toLowerCase())));
            return displayedFile || !!(res && res.name && text.includes(res.name.toLowerCase())) || /(?:resume|cv)\s+(?:successfully\s+)?uploaded|(?:successfully\s+)?uploaded\s+(?:your\s+)?(?:resume|cv)/i.test(text);
          };
          if (hpeButton && !res) return { kind: "needs_user", reason: "HPE requires a resume. Select one in the panel, then press Continue." };
          if (hpeButton && res && Math.floor(res.b64.length * 3 / 4) > 1000000) return { kind: "needs_user", reason: "HPE accepts resumes up to 1 MB. Choose a smaller PDF, then press Continue." };
          if (hpeButton && uploaded()) { resumeDone = true; }
          else if (await JA.attachResume(uploadRoot, res, log, !!ctx.replaceResume, !!hpeButton)) { ctx.replaceResume = false; await JA.sleep(2500); } // let the site parse it before we fill
          else if (!uploadTried && !resumeDone && !uploaded()) { // the page already showing the file means it took (PrimeNG clears its input)
            // upload buttons that create their file input only when clicked
            const up = uploadTrigger(uploadRoot);
            if (up && res) {
              uploadTried = true;
              await JA.send({ type: "armUpload", name: res.name, b64: res.b64 });
              JA.click(up);
              await JA.sleep(2500);
              log("Tried the site's upload button; check that the resume appeared.");
            }
          }
          if (hpeButton && !uploaded() && !(await JA.waitFor(uploaded, 8000, 400))) return { kind: "needs_user", reason: "HPE has not confirmed the resume upload. Use its Upload Resume button, select the PDF, wait until the filename appears, then press Continue." };
        }
        resumeDone = true;
      }
      // work history / education blocks and skill pickers first, then every other question
      const added = await JA.fillHistory(root, cfg, ctx, log);
      if (added) log(`Prepared ${added} work/education entr${added > 1 ? "ies" : "y"}.`);
      await JA.fillSkills(root, cfg, ctx, log);
      const fill = await JA.fillRoot(root, cfg, ctx, log);
      filledOnce = true;
      if (fill.filled) log(`Filled ${fill.filled} field${fill.filled > 1 ? "s" : ""}.`);
      if (fill.needs.length) {
        const left = await aiAssist(fill.needs);
        // work/education block fields need the whole form to answer (which job? which format?): Claude
        // fills them from your facts, then we look again. Plain questions Claude already declined go to you.
        if (left.some((u) => u.noRemember && !NEVER_AI.test(u.label)) && fixTries < 3) { fixTries++; if (await aiFix(root, left, [])) continue; }
        if (left.length) return askUser(left, mode);
      }
      if (mode === "fill") return { kind: "info", reason: "Filled what I could. Review, then submit yourself or press Auto-apply." };

      const nb = site.next(root);
      if (!nb) {
        const f2 = done(); if (f2) return f2;
        // Avature-style pages: the file input and its Continue button sit in a hidden section that
        // only the site's own "From Device" button reveals. Press it once and answer its file picker.
        const up = !ctx.triggerTried && uploadTrigger(document);
        if (up) {
          const res = await getResume();
          if (res) {
            ctx.triggerTried = true;
            await JA.send({ type: "armUpload", name: res.name, b64: res.b64 });
            log(`Pressing "${JA.btnText(up).slice(0, 30)}" to load the resume…`);
            JA.click(up);
            await JA.sleep(2500);
            continue;
          }
        }
        return { kind: "needs_user", reason: "I filled what I could, but couldn't find an enabled Next/Submit button. Check that the resume was uploaded and all required fields are complete, then use the button on the page." };
      }
      if (nb.kind === "submit") {
        if (!cfg.settings.autoSubmit) return { kind: "info", reason: "Everything is filled. Auto-submit is off, so press Submit yourself." };
        if (site.beforeSubmit) await site.beforeSubmit(root);
        const b2 = JA.blocker();
        if (b2) return { kind: "needs_user", reason: `${b2}. Complete it, then press Continue.` };
        log("Submitting…");
        await markSubmitted();
      } else log(`Step ${step + 1}: ${JA.btnText(nb.el).slice(0, 40) || "Next"}…`);
      const before = signature(root);
      JA.click(nb.el);
      await JA.waitFor(() => site.success() || signature(site.root()) !== before || !nb.el.isConnected, 10000, 300);
      await JA.sleep(900);
      const f3 = done(); if (f3) return f3;
      if (signature(site.root()) === before) {
        const errs = site.errors(site.root() || document);
        const liRetry = errs.some((e) => /linkedin/i.test(e)) && (ctx.linkedinTry || 0) < 4;
        if (liRetry) { ctx.linkedinTry = (ctx.linkedinTry || 0) + 1; log("The site rejected the LinkedIn URL format: trying another form of it."); }
        const again = await JA.fillRoot(site.root() || document, cfg, ctx, log);
        let left = again.needs.length ? await aiAssist(again.needs) : [];
        // the page refused to move on: let Claude read the errors and correct the fields, then press again
        if (!liRetry && (errs.length || left.length || stuck) && fixTries < 3) { fixTries++; if (await aiFix(site.root() || document, left, errs)) continue; }
        if (left.length) return askUser(left, mode);
        if (!liRetry && ++stuck >= 2) {
          if (nb.kind === "submit" && !errs.length) return { kind: "needs_user", reason: "I pressed Submit but saw no confirmation. Check the page (a CAPTCHA or hidden field?), finish it, then press Continue." };
          return { kind: "needs_user", reason: "The form won't move on: " + (errs.slice(0, 3).join("; ") || "no error shown") + ". Fix it in the page, then press Continue." };
        }
      } else { stuck = 0; fixTries = 0; }
    }
    return { kind: "needs_user", reason: "Stopped after 40 steps without finishing. Please finish this one yourself." };
  }

  // Before asking you: let Claude answer never-seen questions from your facts (only when a key is
  // set in Settings). Returns the units that are still unanswered.
  // consents are your decision: asked once, then your remembered answer is reused
  const NEVER_AI = /captcha|one.?time|\botp\b|verification code|security code|password|passcode|signature|sign (your )?name|date of birth|\bdob\b|aadhaar|\bpan\b|passport|social security|\bssn\b|consent/i;
  async function aiAssist(units, applyFn) {
    // sites fill some boxes themselves a moment later (Ceipal: the zip code after the city): re-check
    if (units.length && !applyFn) { await JA.sleep(800); units = units.filter((u) => { try { return !(u.filled && u.filled()); } catch (_) { return true; } }); }
    if (!cfg || !cfg.settings || !cfg.settings.aiEnabled || ctx.aiDown || !units.length) return units;
    // work/education block fields depend on which block they're in: those go to aiFix, which sees the whole form
    const pool = units.filter((u) => u.label && u.label.length > 1 && !NEVER_AI.test(u.label) && u.label !== JA.EDU_START_Q && u.kind !== "checkbox" && !(u.noRemember && !applyFn));
    if (!pool.length) return units;
    log(`Asking Claude about ${pool.length} new question${pool.length > 1 ? "s" : ""} (answers only from your facts)…`);
    const r = await JA.send({ type: "aiAnswer", job: { title: state.jd && state.jd.title, company: ctx.company || ctx.companyToken, location: ctx.jobLocation },
      questions: pool.map((u) => ({ label: u.label, kind: u.kind, options: u.options || null, required: !!u.required, maxLength: u.el && u.el.maxLength > 0 ? u.el.maxLength : null })) });
    if (!r) return units;
    if (r.error) { log("Claude: " + r.error); if (r.down) ctx.aiDown = true; }
    const done = new Set();
    for (const a of r.answers || []) {
      const u = pool[a.i];
      if (!u) continue;
      try {
        const ok = applyFn ? (await applyFn(u, a.answer), true) : await JA.applyAnswer(u, a.answer, cfg, ctx);
        await JA.sleep(200);
        if (ok && (applyFn || !u.filled || u.filled())) {
          done.add(u);
          (ctx.aiAnswers = ctx.aiAnswers || []).push({ q: u.label.slice(0, 120), a: a.answer.slice(0, 200), basis: a.basis });
          log(`AI answered "${u.label.slice(0, 50)}" → "${a.answer.slice(0, 60)}" (${a.basis || "from your facts"})`);
        }
      } catch (_) { /* leave it for you */ }
    }
    return units.filter((u) => !done.has(u));
  }

  // A stuck page: send Claude every field (label, value, options, the error beside it, its
  // work/education block), the page errors and the in-form buttons; apply the actions it returns.
  // Returns how many actions took. Values it sets are kept on later passes (data-ja-ai).
  const NAV_BTN = /submit|apply|next|continue|review|back|previous|cancel|close|remove|delete|withdraw|save|sign ?(in|out)|log ?(in|out)|upload|attach|browse|^\W*[-x×]\W*$/i;
  const ERR_SEL = "[role=alert], [class*='error' i], [id*='error' i], [data-automation-id*='error' i], [class*='invalid' i]";
  const fieldCount = (p) => p.querySelectorAll("input:not([type=hidden]), select, textarea").length;
  function errNear(el) {
    for (let p = el.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
      if (fieldCount(p) > 3) break;
      const e = [...p.querySelectorAll(ERR_SEL)].find((x) => !x.contains(el) && !x.querySelector("input, select, textarea") && JA.visible(x) && JA.text(x));
      if (e) return JA.text(e).slice(0, 160);
    }
    return el.getAttribute("aria-invalid") === "true" ? "marked invalid" : "";
  }
  function shown(u) {
    const el = u.el;
    if (u.kind === "select") return el.selectedIndex >= 0 && el.value ? JA.text(el.options[el.selectedIndex]) : "";
    if (u.kind === "radio" || u.kind === "checkboxes") return (u.els || []).map((x, i) => (x.checked ? u.options[i] : null)).filter(Boolean).join(" | ");
    if (u.kind === "checkbox") return el.checked ? "ticked" : "not ticked";
    if (u.kind === "buttons") return (u.els || []).filter((b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true").map(JA.btnText).join(" | ");
    if (u.kind === "combobox") {
      const box = el.closest("[data-automation-id^='formField']") || u.wrap || el.parentElement;
      const pills = box ? [...box.querySelectorAll("[data-automation-id='selectedItem'], [class*='multiValue'], [class*='chip' i]")].map(JA.text).filter(Boolean) : [];
      return [el.tagName === "BUTTON" ? JA.btnText(el) : el.value, ...pills].filter(Boolean).join(" | ");
    }
    if (u.datePart) { const [now, txt, disp, val] = JA.dateShown(el); return String(val || now || txt || disp || ""); }
    return String(el.value || "");
  }
  async function aiFix(root, needs, errs) {
    if (!cfg || !cfg.settings || !cfg.settings.aiEnabled || ctx.aiDown) return 0;
    const units = JA.collectUnits(root).filter((u) => u.kind !== "file" && !JA.inPanel(u.el));
    if (!units.length) return 0;
    const open = new Set(needs.map((n) => n.el));
    const fields = units.map((u, i) => {
      const entry = JA.historyEntryOf(u.el);
      const secret = NEVER_AI.test(u.label);
      return { ref: i, label: (u.label || "").slice(0, 150), type: u.kind + (u.datePart ? " (" + u.datePart + ")" : ""), required: !!u.required || undefined,
        value: secret ? "[hidden]" : shown(u).slice(0, 300), placeholder: u.el.placeholder || undefined, options: u.options && !secret ? u.options.slice(0, 80) : undefined,
        block: entry ? entry.title : undefined, error: errNear(u.el) || undefined, still_empty: open.has(u.el) || undefined, do_not_touch: secret || undefined };
    });
    const btns = JA.buttons(root).filter((b) => !JA.inPanel(b) && !NAV_BTN.test(JA.btnText(b)) && JA.btnText(b)).slice(0, 30);
    log(`Asking Claude to fix this page${errs.length ? " (" + errs.slice(0, 2).join("; ").slice(0, 80) + ")" : ""}…`);
    const r = await JA.send({ type: "aiFix", job: { title: state.jd && state.jd.title, company: ctx.company || ctx.companyToken }, page: { host: location.hostname, title: document.title.slice(0, 120) },
      history: JA.history(cfg), errors: errs.slice(0, 10), fields, buttons: btns.map((b, i) => ({ ref: i, text: JA.btnText(b).slice(0, 60) })), tried: (ctx.fixLog || []).slice(-20) });
    if (!r || r.off) return 0;
    if (r.error) { log("Claude: " + r.error + ". Asking you instead."); if (r.down) ctx.aiDown = true; return 0; }
    let n = 0;
    const acts = (r.actions || []).slice(0, 40);
    for (const a of acts.filter((x) => x.field >= 0)) { // fields first: a button press can re-render them
      const u = units[a.field];
      if (!u || !u.el.isConnected || NEVER_AI.test(u.label) || typeof a.value !== "string" || !a.value.trim()) continue;
      let ok = false;
      try {
        if (u.kind === "checkbox") { const want = /^(yes|true|tick|checked)/i.test(a.value); if (u.el.checked !== want) JA.click((u.el.labels && u.el.labels[0]) || u.el); if (u.el.checked !== want) u.el.click(); ok = u.el.checked === want; }
        else ok = await JA.applyAnswer(u, a.value.trim(), cfg, ctx);
      } catch (_) {}
      await JA.sleep(200);
      if (!ok) continue;
      u.el.dataset.jaAi = "1";
      n++;
      (ctx.fixLog = ctx.fixLog || []).push({ field: u.label.slice(0, 80), value: a.value.slice(0, 80) });
      (ctx.aiAnswers = ctx.aiAnswers || []).push({ q: (fields[a.field].block ? fields[a.field].block + " — " : "") + u.label.slice(0, 100), a: a.value.slice(0, 200), basis: String(a.basis || "").slice(0, 120) });
      log(`Claude fixed "${u.label.slice(0, 40)}" → "${a.value.slice(0, 50)}" (${String(a.basis || "from your facts").slice(0, 60)})`);
    }
    for (const a of acts.filter((x) => x.field < 0 && x.button >= 0)) {
      const b = btns[a.button];
      if (!b || !b.isConnected || NAV_BTN.test(JA.btnText(b))) continue;
      log(`Claude pressed "${JA.btnText(b).slice(0, 40)}" (${String(a.basis || "").slice(0, 60)})`);
      (ctx.fixLog = ctx.fixLog || []).push({ pressed: JA.btnText(b).slice(0, 60) });
      JA.click(b); n++;
      await JA.sleep(800);
    }
    if (!n && r.cannot) log("Claude: " + String(r.cannot).slice(0, 200));
    return n;
  }

  function askUser(units, mode, applyFn) {
    JA.send({ type: "notify", title: "Please answer", message: units.map((u) => u.label).join("\n").slice(0, 200) });
    JA.panel.ask(units.map((u) => ({ label: u.label, options: u.options, kind: u.kind })), async (vals, remember) => {
      for (let i = 0; i < units.length; i++) {
        const v = vals[i];
        if (!v) continue;
        if (remember && !units[i].noRemember) await JA.send({ type: "saveLearned", key: JA.qkey(units[i].label), answer: v });
        if (applyFn) await applyFn(units[i], v); else await JA.applyAnswer(units[i], v, cfg, ctx);
      }
      run(mode, { startedAt: Date.now(), submitted: ctx.submitted });
    });
    return { kind: "ask", reason: "" };
  }

  function frameResult(fr, mode) {
    if (fr.applied) { ctx.submitted = true; return { kind: "applied" }; }
    if (fr.needs && fr.needs.length) {
      JA.panel.ask(fr.needs.map((n) => ({ label: n.label, options: n.options, kind: n.kind })), async (vals, remember) => {
        const answers = {};
        fr.needs.forEach((n, i) => { if (vals[i]) answers[n.key] = vals[i]; });
        if (remember) for (const [k, v] of Object.entries(answers)) await JA.send({ type: "saveLearned", key: k, answer: v });
        await JA.send({ type: "frameAnswer", answers });
        run(mode, { startedAt: Date.now() });
      });
      return { kind: "ask", reason: "" };
    }
    return { kind: fr.kind || "info", reason: fr.reason || "Filled the embedded form." };
  }

  async function getResume() { return JA.send({ type: "getResume" }); }

  // A site's own upload button (its file input is hidden or created on click).
  const UPLOAD_BTN = /\b(upload|attach|choose file|browse|select file)\b.*\b(resume|cv|file)\b|^(upload|attach)( resume| cv)?$|^(upload )?from (device|computer|my computer|this device|desktop)$|^(my )?(device|computer)$/i;
  const uploadTrigger = (root) => JA.buttons(root).concat(JA.deepAll(root || document, "a[data-registermethod='file'], a[class*='upload' i]").filter(JA.visible))
    .find((b) => !JA.inPanel(b) && UPLOAD_BTN.test(JA.btnText(b)) && !/cover|dropbox|google drive|linkedin|indeed/i.test(JA.btnText(b)));

  // ---------- sub-frame worker ----------
  async function frameRun(mode, replaceResume) {
    await loadCfg();
    const root = site.root();
    if (!root || JA.fieldCount(root) < 2) return null;
    Object.assign(ctx, { site: site.id, source: (cfg.tabJD && cfg.tabJD.source) || "company", company: (cfg.tabJD && cfg.tabJD.company) || "", companyToken: site.tokenClean() });
    ctx.jdSkills = JA.skillsIn((cfg.tabJD && cfg.tabJD.text) || "", cfg.customKeywords);
    const blk = JA.blocker();
    if (blk) return { handled: true, kind: "needs_user", reason: blk };
    if (await JA.attachResume(root, await getResume(), log, replaceResume)) await JA.sleep(2200);
    await JA.fillHistory(root, cfg, ctx, log);
    await JA.fillSkills(root, cfg, ctx, log);
    const fill = await JA.fillRoot(root, cfg, ctx, log);
    if (fill.needs.length) {
      state.frameUnits = fill.needs;
      return { handled: true, needs: fill.needs.map((u) => ({ key: JA.qkey(u.label), label: u.label, options: u.options, kind: u.kind })) };
    }
    if (mode === "fill" || !cfg.settings.autoSubmit) return { handled: true, kind: "info", reason: "Embedded form filled. Review and submit it yourself." };
    const nb = site.next(root);
    if (!nb) return { handled: true, kind: "needs_user", reason: "Embedded form filled; I can't find its Submit button. Click it, then press Continue." };
    const b2 = JA.blocker();
    if (b2) return { handled: true, kind: "needs_user", reason: b2 };
    const baseline = JA.successPhrases();
    JA.click(nb.el);
    const ok = await JA.waitFor(() => JA.newSuccess(baseline), 12000, 400);
    return ok ? { handled: true, applied: true } : { handled: true, kind: "needs_user", reason: "Submitted the embedded form but saw no confirmation. Check it, then press Continue." };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === "togglePanel" && isTop) {
      (async () => { if (!cfg) await loadCfg().catch(() => {}); ensurePanel(true); if (!state.analysis) await analyze().catch(() => {}); })();
      reply({ ok: true });
      return;
    }
    if (msg.type === "log" && isTop) { if (JA.panel.mounted()) JA.panel.log(msg.msg); return; }
    if (msg.type === "frameRun" && !isTop) {
      if (!site.root() || JA.fieldCount(site.root()) < 2) return;
      frameRun(msg.mode, msg.replaceResume).then(reply);
      return true;
    }
    if (msg.type === "frameAnswer" && !isTop && state.frameUnits) {
      (async () => {
        for (const u of state.frameUnits) { const v = msg.answers[JA.qkey(u.label)]; if (v) await JA.applyAnswer(u, v, cfg, ctx); }
        reply({ ok: true });
      })();
      return true;
    }
  });

  if (!isTop) return;

  // ---------- top frame start-up ----------
  async function boot() {
    const ap = await JA.send({ type: "getAutopilot" });
    const fresh = ap && ap.mode && Date.now() - ap.startedAt < 20 * 60 * 1000 && (ap.steps || 0) < 80;
    await loadCfg();
    const batchPage = cfg && cfg.batch && cfg.batch.active;
    if (!fresh && !batchPage && !looksLikeJobPage() && !batchCandidates().length) return false;
    ensurePanel(!!fresh || !!batchPage);
    if (!JA.panel.mounted()) return true;
    state.jd = null;
    const { applied } = await analyze();
    if (fresh && !state.running) { JA.panel.log("Continuing the application from the previous page…"); await JA.sleep(1500); run(ap.mode, ap); }
    else await maybeHandsFree(applied);
    return true;
  }

  // Slow single-page career sites (Workday, SuccessFactors) render seconds after load: keep looking.
  let booted = false;
  for (const wait of [900, 1500, 2500, 4000, 5000, 6000]) {
    await JA.sleep(wait);
    if (!alive()) break;
    booted = await boot().catch((e) => { if (alive()) console.warn("Job Autopilot:", e); return false; });
    if (booted) break;
  }

  // single-page apps (LinkedIn, Naukri, Workday): re-check when the URL changes
  const watch = setInterval(async () => {
    if (!alive()) {
      clearInterval(watch);
      if (JA.panel.mounted()) { try { JA.panel.running(false); JA.panel.status(STALE, "warn"); } catch (_) {} }
      return;
    }
    if (location.href === state.url) return;
    state.url = location.href;
    if (state.running) return;
    cancelCountdown();
    await JA.sleep(1500);
    state.jd = null; state.analysis = null;
    if (JA.panel.mounted() && looksLikeJobPage()) {
      try { const r = await analyze(); await maybeHandsFree(r.applied); }
      catch (e) { JA.panel.status((e && e.message) || "Could not load extension settings. Refresh this page.", "bad"); }
    }
    else if (!booted) booted = await boot().catch(() => false);
  }, 1500);
})();
