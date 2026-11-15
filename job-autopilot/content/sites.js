// Per-site knowledge: where the JD is, how to start applying, which button moves forward,
// what success looks like. Unknown career sites use the generic adapter.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});
  const q = (sel, root) => [...(root || document).querySelectorAll(sel)].find((e) => JA.visible(e) && !JA.inPanel(e));
  // like q, but also inside open shadow roots (LinkedIn's 2025 layout renders Easy Apply in #interop-outlet's)
  const dq = (sel) => JA.deepAll(document, sel).find((e) => JA.visible(e) && !JA.inPanel(e));
  const txt = (sel, root) => { const e = q(sel, root); return e ? (e.innerText || "").trim() : ""; };
  const seg = (i) => location.pathname.split("/").filter(Boolean)[i] || "";

  // Button words are matched loosely ("Apply Now (Opens in a new tab)", "Save & Continue →"),
  // with exclusions for the look-alikes that would take us somewhere else.
  const NEXT = /\b(next|continue|save (and|&) (continue|next)|proceed|review( (and|&) submit| your application| application)?|next step|go to next)\b/i;
  const SUBMIT = /\b(submit|send( my)? application|finish( application)?|complete( my)? application|apply( now)?)\b/i;
  const NAV_EXCLUDE = /\b(back|previous|cancel|sign ?in|log ?in|login|linkedin|indeed|google|seek|facebook|xing|draft|later|alerts?|search|filter|subscribe|newsletter|feedback|cookie|share|refer|similar|saved jobs|save job|withdraw|upload|remove|delete|add another|edit)\b/i;
  const APPLY = /\b(apply( now| online| for (this )?(job|position|role|opening))?|i'?m interested|start (your |an |my )?application|begin (your )?application|apply manually|manual(ly)? apply|continue to apply|easy apply|quick apply)\b/i;
  const APPLY_EXCLUDE = /\b(job alerts?|sign up for|save|share|refer|similar|log ?in|sign ?in|with (linkedin|indeed|seek|google|facebook|xing)|withdraw|applied|how to apply)\b/i;
  const SUCCESS = /thank you for (applying|your application|submitting)|application (has been |was )?(submitted|received|sent|complete)|successfully applied|you('ve| have) (successfully )?applied|we('ve| have) received your application|your application was sent|application submitted/g;
  const HONEYPOT = /robots? only|do not (enter|fill|type|complete)|leave (this )?(field )?(blank|empty)|honeypot|bot trap|anti-?spam/i;
  const SEARCHY = /\b(search|keyword|query)\b|^q$/i;

  JA.isHoneypot = (el, label) => HONEYPOT.test(label || "") || !!el.closest("[aria-hidden='true']") || (el.tabIndex === -1 && el.type !== "file" && !JA.visible(el.parentElement));
  JA.isSearchField = (el, label) => !!el.closest("[role=search], header form, nav form, form[action*='search' i]") || SEARCHY.test(label || "") || SEARCHY.test(el.name || "") || el.type === "search";

  function fieldCount(root) {
    return JA.deepAll(root || document, "input:not([type=hidden]):not([type=search]), select, textarea")
      .filter((e) => !JA.inPanel(e) && (JA.visible(e) || e.type === "file" || JA.visibleChoice(e)) && !JA.isSearchField(e, "")).length;
  }
  JA.fieldCount = fieldCount;

  // Text that already says "applied/submitted" before we click anything must not count as success.
  JA.successPhrases = () => new Set((JA.norm(JA.bodyText().slice(0, 20000)).match(SUCCESS) || []));
  JA.newSuccess = (baseline) => [...JA.successPhrases()].some((p) => !(baseline || new Set()).has(p));

  // Cookie banners block clicks on many career sites. Prefer the least-consent option.
  JA.dismissCookies = function () {
    const bs = JA.buttons(document).filter((b) => !JA.inPanel(b));
    const inBanner = (b) => /cookie|privacy|consent/i.test(JA.text(b.closest("[class*='cookie' i], [id*='cookie' i], [class*='consent' i], [id*='consent' i], [role=dialog], [aria-modal=true]") || document.createElement("i")));
    const reject = bs.find((b) => inBanner(b) && /^(reject( all)?|decline( all)?|(use )?(only )?(necessary|essential)( cookies)?( only)?|deny)$/i.test(JA.btnText(b)));
    const accept = bs.find((b) => inBanner(b) && /^(accept( all)?( cookies)?|i agree|agree|got it|ok|allow( all)?)$/i.test(JA.btnText(b)));
    const b = reject || accept;
    if (b) { JA.click(b); return true; }
    return false;
  };

  function clickables(root) {
    return JA.deepAll(root || document, "button, input[type=submit], input[type=button], a, [role=button], [data-automation-id$='Button'], [data-automation-id*='button' i]")
      .filter((b) => JA.visible(b) && !JA.inPanel(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true");
  }

  function genericJDText() {
    const cands = [...document.querySelectorAll("[class*='description' i], [id*='description' i], [class*='job-details' i], [class*='jobdetail' i], [class*='posting' i], [class*='job-content' i], article, main, section")]
      .filter((e) => JA.visible(e) && !JA.inPanel(e));
    let best = null, bestScore = 0;
    for (const c of cands) {
      const t = c.innerText || "";
      if (t.length < 200 || t.length > 40000) continue;
      const kw = /responsibilit|requirement|qualification|what you|skills|experience/i.test(t) ? 2 : 1;
      const s = kw * Math.min(t.length, 8000) - c.querySelectorAll("input, select, textarea").length * 400;
      if (s > bestScore) { best = c; bestScore = s; }
    }
    return best ? best.innerText.trim() : "";
  }

  function domainToken() {
    const junk = new Set(["www", "careers", "career", "jobs", "job", "apply", "recruiting", "recruitment", "talent", "hire", "hiring", "join", "work", "boards", "people", "en", "in"]);
    const parts = location.hostname.toLowerCase().split(".");
    while (parts.length > 2 && (["co", "com", "org", "net", "gov", "ac"].includes(parts[parts.length - 2]))) parts.splice(parts.length - 2, 1);
    const core = parts.slice(0, -1).filter((p) => !junk.has(p));
    const t = core.length ? core[core.length - 1] : parts[0];
    return t.replace(/^careers-|-careers$|^jobs-|-jobs$/g, "");
  }

  // A link that leaves the page isn't a form button unless it's the form's own (#, javascript:, no href).
  const isNavLink = (b) => b.tagName === "A" && b.getAttribute("href") && !/^(#|javascript:)/i.test(b.getAttribute("href")) && b.getAttribute("role") !== "button";

  function genericNext(root) {
    const scope = [root, document].filter(Boolean);
    for (const r of scope) {
      const bs = clickables(r).filter((b) => r !== document || !isNavLink(b));
      const label = (b) => JA.btnText(b).slice(0, 80);
      const nx = bs.find((b) => NEXT.test(label(b)) && !NAV_EXCLUDE.test(label(b)) && !isNavLink(b));
      if (nx) return { el: nx, kind: /submit/i.test(label(nx)) ? "submit" : "next" };
      const sb = bs.find((b) => SUBMIT.test(label(b)) && !NAV_EXCLUDE.test(label(b)) && !APPLY_EXCLUDE.test(label(b)) && !isNavLink(b));
      if (sb) return { el: sb, kind: "submit" };
    }
    return null;
  }

  // How much a form looks like a job application (not a search box or newsletter sign-up).
  function appScore(root) {
    const els = JA.deepAll(root, "input:not([type=hidden]), select, textarea").filter((e) => !JA.inPanel(e) && (JA.visible(e) || e.type === "file" || JA.visibleChoice(e)));
    let s = 0, real = 0;
    for (const e of els) {
      const lab = JA.norm((e.labels && e.labels[0] ? e.labels[0].innerText : "") + " " + (e.name || "") + " " + (e.id || "") + " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || ""));
      if (JA.isSearchField(e, lab) || JA.isHoneypot(e, lab)) continue;
      real++;
      if (e.type === "file") s += 3;
      else if (e.type === "email" || /e-?mail/.test(lab)) s += 2;
      else if (e.type === "tel" || /phone|mobile/.test(lab)) s += 2;
      else if (/name|resume|cv|experience|notice|salary|ctc|linkedin|cover/.test(lab)) s += 1;
    }
    return { s, real };
  }

  function genericRoot() {
    const forms = [...document.forms].filter((f) => !JA.inPanel(f));
    let best = null, bestS = 0;
    for (const f of forms) { const { s, real } = appScore(f); const sc = s + real * 0.5; if ((s >= 2 || real >= 3) && sc > bestS) { best = f; bestS = sc; } }
    if (best) return best;
    const { s, real } = appScore(document.body);
    return s >= 2 || real >= 3 ? document.body : null;
  }

  function genericErrors(root) {
    return JA.deepAll(root || document, "[role=alert], [aria-live=assertive], [class*='error' i]:not(input):not(form), [class*='invalid' i]:not(input)")
      .filter((e) => JA.visible(e) && !JA.inPanel(e)).map(JA.text).filter((t) => t && t.length < 200).slice(0, 6);
  }

  // success = a confirmation phrase that wasn't on the page before this run (baseline set by main.js)
  const success = (extra) => () => {
    if (JA.newSuccess(JA.successBaseline)) return true;
    if (!extra) return false;
    const t = JA.norm(JA.bodyText().slice(0, 15000));
    return extra.test(t) && !(JA.successBaselineText || "").match(extra);
  };

  function applyButtons() {
    const rank = (t) => /manual/i.test(t) ? 0 : /start|begin/i.test(t) ? 1 : /apply now|apply online|apply for/i.test(t) ? 2 : 3;
    return clickables(document)
      .map((b) => ({ b, t: JA.btnText(b).slice(0, 80) }))
      .filter((x) => APPLY.test(x.t) && !APPLY_EXCLUDE.test(x.t) && x.t.length < 60)
      .sort((a, b) => rank(a.t) - rank(b.t));
  }

  async function genericStart(log) {
    if (genericRoot()) return "has-form";
    const found = applyButtons()[0];
    if (!found) {
      // an interstitial: "Continue", "Get started", "Proceed"
      const c = clickables(document).find((b) => /^(continue|get started|proceed|start|next|i agree|accept and continue)\b/i.test(JA.btnText(b)) && !NAV_EXCLUDE.test(JA.btnText(b)) && !isNavLink(b));
      if (c) { log(`Clicking "${JA.btnText(c).slice(0, 30)}"…`); JA.click(c); return "started"; }
      return "none";
    }
    const b = found.b;
    const href = b.getAttribute("href") || "";
    const newTab = b.target === "_blank" || /new (tab|window)/i.test(found.t);
    if (b.tagName === "A" && newTab) { log(`Opening "${found.t.slice(0, 40)}" in a new tab…`); return { external: b }; }
    log(`Clicking "${found.t.slice(0, 40)}"…`);
    JA.click(b);
    return b.tagName === "A" && href && !/^(#|javascript:)/i.test(href) ? "navigating" : "started";
  }

  const ATS_FRAME = /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs|smartrecruiters|icims\.com|jobvite|recruitee|zohorecruit|freshteam|keka\.com|darwinbox|workable\.com|breezy\.hr|teamtailor/i;
  const base = {
    id: "generic", source: "company",
    isJobPage: () => [...document.querySelectorAll("iframe")].some((f) => ATS_FRAME.test(f.src || ""))
      || /(?:^|[\/._-])(job|jobs|career|careers|position|opening|vacanc\w*|apply|application|recruit\w*)(?:[\/._?&#=-]|$)/i.test(location.hostname + location.pathname)
        && (!!genericRoot() || genericJDText().length > 150 || applyButtons().length > 0),
    jd: () => {
      const ROLE = /engineer|developer|programmer|architect|analyst|designer|scientist|manager|lead|intern|consultant|specialist|sde|swe/i;
      const heads = [...document.querySelectorAll("h1, h2, [class*='job-title' i], [class*='jobTitle' i], [data-automation-id='jobPostingHeader']")].filter((e) => JA.visible(e) && !JA.inPanel(e)).map(JA.text);
      const fromTitle = document.title.split(/\s[|\-–]\s/)[0].replace(/,.*$/, "").trim();
      const title = heads.find((t) => ROLE.test(t) && t.length < 120) || (ROLE.test(fromTitle) ? fromTitle : heads[0] || fromTitle);
      return { title, company: "", location: "", text: genericJDText() };
    },
    jobKey: () => location.origin + location.pathname,
    applied: () => false,
    start: genericStart,
    root: genericRoot,
    next: genericNext,
    errors: genericErrors,
    success: success(),
    token: domainToken
  };

  const SITES = [
    {
      id: "linkedin", source: "linkedin", noAccount: true,
      match: () => /(^|\.)linkedin\.com$/.test(location.hostname),
      jdEl: () => q("#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text, [class*='jobs-description']")
        || (() => { const h = [...document.querySelectorAll("h2, h3")].find((x) => /^about the job$/i.test(JA.text(x))); return h ? h.parentElement : null; })(),
      isJobPage() { return /\/jobs\//.test(location.pathname) && !!this.jdEl(); },
      jd() {
        return {
          title: txt(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .t-24.t-bold, h1"),
          company: txt(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name"),
          location: txt(".job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__tertiary-description-container"),
          text: (this.jdEl() || {}).innerText || ""
        };
      },
      jobKey() {
        const id = new URLSearchParams(location.search).get("currentJobId") || (location.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1];
        return id ? "linkedin:" + id : location.href;
      },
      applied() {
        const card = q(".job-details-jobs-unified-top-card__container--two-pane, .jobs-unified-top-card, .jobs-details__main-content, .job-view-layout");
        const t = card ? JA.text(card) : "";
        return /\bApplied\b.{0,25}\bago\b|Application submitted|You applied/i.test(t);
      },
      async start(log) {
        // 2025+ layout (/jobs/search-results/): Apply is a plain <a> link; the filter bar also has an
        // "Easy Apply" pill, so prefer the Apply that shares a row with the job's Save button.
        const isApply = (x) => /^(easy apply|apply)$/i.test(JA.btnText(x)) || /^(easy apply|apply)( to\b| on\b|$)/i.test(x.getAttribute("aria-label") || "");
        const pool = [...document.querySelectorAll("button, a")].filter((x) => JA.visible(x) && !JA.inPanel(x) && isApply(x)
          && !x.hasAttribute("aria-pressed") && !x.closest("[class*='filter' i], [class*='search-reusables' i], [role=toolbar], [role=listitem], li"));
        const besideSave = (x) => [x.parentElement, x.parentElement && x.parentElement.parentElement, x.parentElement && x.parentElement.parentElement && x.parentElement.parentElement.parentElement]
          .some((p) => p && [...p.querySelectorAll("button, a")].some((y) => /^save$/i.test(JA.btnText(y))));
        const b = q(".jobs-apply-button, button[aria-label*='Easy Apply'], button[aria-label^='Apply']")
          || pool.find(besideSave) || (pool.length === 1 ? pool[0] : null);
        if (!b) return "none";
        const t = JA.btnText(b) + " " + (b.getAttribute("aria-label") || "");
        if (/easy apply/i.test(t)) {
          log("Opening Easy Apply…");
          JA.click(b);
          await JA.waitFor(() => this.root(), 6000);
          return "started";
        }
        log("This job applies on the company site: opening it in a new tab.");
        return { external: b };
      },
      root: () => dq(".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal'], .artdeco-modal[role=dialog] form, .artdeco-modal[role=dialog]")
        || JA.deepAll(document, "[role=dialog]").find((d) => JA.visible(d) && !JA.inPanel(d) && /apply to|contact info|easy apply|resume|additional questions|review your application/i.test(JA.text(d).slice(0, 400))),
      next(root) {
        const by = (rx) => JA.buttons(root).find((b) => rx.test(b.getAttribute("aria-label") || "") || rx.test(JA.btnText(b)));
        const s = by(/^submit application$/i);
        if (s) return { el: s, kind: "submit" };
        const r = by(/^review( your application)?$/i);
        if (r) return { el: r, kind: "next" };
        const n = by(/^(continue to next step|next)$/i);
        if (n) return { el: n, kind: "next" };
        return genericNext(root);
      },
      async beforeSubmit(root) {
        const f = (root || document).querySelector("#follow-company-checkbox, input[id*='follow-company']");
        if (f && f.checked) { JA.click((f.labels && f.labels[0]) || f); if (f.checked) f.click(); }
      },
      errors: (root) => [...(root || document).querySelectorAll(".artdeco-inline-feedback--error, [data-test-form-element-error-messages]")].filter(JA.visible).map(JA.text),
      success() {
        const m = dq(".artdeco-modal, [role=dialog], .artdeco-toast-item");
        const t = m ? JA.text(m) : "";
        return /application (was )?sent|your application was sent|applied to/i.test(t) && !/submit application/i.test(t);
      },
      async afterSuccess() {
        await JA.sleep(800);
        const d = dq("button[aria-label='Dismiss'], .artdeco-modal__dismiss");
        if (d) JA.click(d);
      },
      token: () => "linkedin"
    },
    {
      id: "naukri", source: "naukri", noAccount: true,
      match: () => /(^|\.)naukri\.com$/.test(location.hostname),
      isJobPage: () => /job-listings-/.test(location.pathname) || !!q("[class*='jd-header'], [class*='dang-inner-html']"),
      jd() {
        const skills = [...document.querySelectorAll("[class*='key-skill'] a, [class*='key-skill'] span, [class*='keySkill'] a")].map(JA.text).filter(Boolean);
        return {
          title: txt("h1"),
          company: txt("[class*='jd-header-comp-name'] a, [class*='jd-header-comp-name'], [class*='comp-name']"),
          location: txt("[class*='location'] a, [class*='loc'] a, [class*='location']"),
          text: (txt("[class*='dang-inner-html'], [class*='job-desc'], section[class*='JDC']") || "") + (skills.length ? "\nKey skills:\n" + [...new Set(skills)].join(", ") : "")
        };
      },
      jobKey: () => { const m = location.pathname.match(/-(\d{6,})\/?$/) || location.href.match(/-(\d{6,})(?:\?|$)/); return m ? "naukri:" + m[1] : location.origin + location.pathname; },
      applied: () => !!q("#already-applied") || JA.buttons(document).some((b) => /^applied$/i.test(JA.btnText(b))),
      async start(log) {
        const b = q("#apply-button") || JA.buttons(document).find((x) => /^apply$/i.test(JA.btnText(x)));
        const ext = q("#company-site-button") || JA.buttons(document).find((x) => /apply on company site/i.test(JA.btnText(x)));
        if (!b && ext) { log("This job applies on the company site: opening it in a new tab."); return { external: ext }; }
        if (!b) return "none";
        log("Clicking Apply on Naukri…");
        JA.click(b);
        await JA.waitFor(() => this.chat.active() || this.success(), 6000);
        return "started";
      },
      chat: {
        drawer: () => q("[class*='chatbot_Drawer'], [class*='chatbot_drawer'], [class*='chatbot-drawer'], [class*='chatbot_DrawerContentWrapper'], [class*='chatbot']"),
        active() { const d = this.drawer(); return !!(d && JA.visible(d) && /question|answer|save|recruiter/i.test(JA.text(d))); },
        async step(cfg, ctx, log) {
          const d = this.drawer();
          const msgs = [...d.querySelectorAll("[class*='botMsg'], [class*='bot-msg'], li[class*='botItem'], [class*='botItem']")].filter(JA.visible);
          const question = msgs.length ? JA.text(msgs[msgs.length - 1]) : "";
          if (!question) return { none: true };
          const radios = [...d.querySelectorAll("input[type=radio]")].filter(JA.visibleChoice);
          const chips = [...d.querySelectorAll("[class*='chip' i]:not([class*='chipsContainer' i]), [class*='suggestion' i] span")].filter(JA.visible);
          const checks = [...d.querySelectorAll("input[type=checkbox]")].filter(JA.visibleChoice);
          const input = q("[contenteditable='true'], input[type=text], input:not([type]), textarea", d);
          let unit;
          if (radios.length) unit = { kind: "radio", els: radios, options: radios.map((r) => JA.text(r.labels && r.labels[0] || r.parentElement) || r.value) };
          else if (checks.length) unit = { kind: "checkboxes", els: checks, options: checks.map((r) => JA.text(r.labels && r.labels[0] || r.parentElement) || r.value) };
          else if (chips.length) unit = { kind: "buttons", els: chips, options: chips.map(JA.text) };
          else if (input) unit = { kind: "text", el: input };
          else return { none: true };
          unit.label = question; unit.match = JA.norm(question); unit.required = true; unit.el = unit.el || (unit.els && unit.els[0]);
          if (this.lastQ === question && (this.repeat = (this.repeat || 0) + 1) > 2) return { ask: unit };
          if (this.lastQ !== question) this.repeat = 0;
          this.lastQ = question;
          const want = JA.resolve(unit, cfg, ctx);
          if (!want || want.skip) return { ask: unit };
          if (unit.kind === "text") {
            const v = JA.textValue(want, unit);
            if (v === null) return { ask: unit };
            if (input.isContentEditable) JA.setEditable(input, v); else JA.setValue(input, v);
          } else {
            const i = JA.chooseOption(unit.options, want);
            if (i < 0) return { ask: unit };
            const t = unit.els[i];
            JA.click(unit.kind === "radio" || unit.kind === "checkboxes" ? ((t.labels && t.labels[0]) || t) : t);
          }
          log(`Naukri question: "${question.slice(0, 60)}" answered`);
          await JA.sleep(500);
          const save = q("[class*='sendMsg' i], [class*='send-msg' i], [class*='saveBtn' i]", d) || JA.buttons(d).find((b) => /^(save|submit|send|next|done)$/i.test(JA.btnText(b)));
          if (save) JA.click(save);
          await JA.sleep(1600);
          return { answered: true };
        },
        async answer(unit, text) {
          if (unit.kind === "text") { if (unit.el.isContentEditable) JA.setEditable(unit.el, text); else JA.setValue(unit.el, text); }
          else { const i = JA.chooseOption(unit.options, { text, learned: true }); if (i >= 0) JA.click(unit.els[i].labels ? unit.els[i].labels[0] || unit.els[i] : unit.els[i]); }
          await JA.sleep(400);
          const d = this.drawer();
          const save = q("[class*='sendMsg' i], [class*='send-msg' i], [class*='saveBtn' i]", d) || JA.buttons(d).find((b) => /^(save|submit|send|next|done)$/i.test(JA.btnText(b)));
          if (save) JA.click(save);
        }
      },
      root: () => null,
      next: () => null,
      errors: genericErrors,
      success: success(/you have successfully applied|applied successfully|application sent successfully/),
      token: () => "naukri"
    },
    {
      id: "greenhouse",
      match: () => /greenhouse\.io$/.test(location.hostname),
      isJobPage: () => !!q("#application-form, #application_form, form[action*='applications'], .job__description, #content"),
      jd: () => ({ title: txt(".job__title h1, .app-title, h1"), company: txt(".company-name"), location: txt(".job__location, .location"), text: txt(".job__description, #content .body, #content") }),
      jobKey: () => { const m = location.href.match(/jobs\/(\d+)|gh_jid=(\d+)/); return m ? "greenhouse:" + (m[1] || m[2]) : location.href; },
      root: () => q("#application-form, #application_form, form[action*='applications']") || genericRoot(),
      token: () => new URLSearchParams(location.search).get("for") || seg(0)
    },
    {
      id: "lever",
      match: () => /(^|\.)lever\.co$/.test(location.hostname),
      isJobPage: () => location.pathname.split("/").filter(Boolean).length >= 2,
      jd: () => ({ title: txt(".posting-headline h2, h2"), company: "", location: txt(".posting-categories .location, .sort-by-time"), text: txt("[data-qa='job-description'], .section-wrapper.page-full-width, .content") }),
      jobKey: () => "lever:" + seg(1),
      async start(log) {
        if (/\/apply/.test(location.pathname) || genericRoot()) return "has-form";
        const b = q("a.postings-btn, a[href$='/apply']");
        if (!b) return "none";
        log("Opening the Lever application…");
        JA.click(b);
        return "navigating";
      },
      root: () => q("#application-form, form[action*='apply'], .application-form form, form") || genericRoot(),
      token: () => seg(0)
    },
    {
      id: "ashby",
      match: () => /ashbyhq\.com$/.test(location.hostname),
      isJobPage: () => location.pathname.split("/").filter(Boolean).length >= 2,
      jd: () => ({ title: txt("h1"), company: "", location: "", text: txt("[class*='_descriptionText'], [class*='description'], #overview") }),
      jobKey: () => "ashby:" + seg(1),
      async start(log) {
        if (/\/application/.test(location.pathname) && genericRoot()) return "has-form";
        const b = [...document.querySelectorAll("a, button")].find((a) => JA.visible(a) && /^(apply for this job|application|apply)$/i.test(JA.text(a)));
        if (!b) return "none";
        log("Opening the Ashby application…");
        JA.click(b);
        await JA.waitFor(() => genericRoot(), 5000);
        return "started";
      },
      token: () => seg(0)
    },
    {
      id: "workday",
      match: () => /myworkdayjobs\.com$|myworkdaysite\.com$|workday\.com$/.test(location.hostname),
      isJobPage: () => !!q("[data-automation-id='jobPostingDescription'], [data-automation-id='applyFlowPage'], [data-automation-id='bottom-navigation-next-button'], [data-automation-id='pageFooterNextButton'], [data-automation-id='createAccountSubmitButton'], [data-automation-id='signInSubmitButton']") || /\/apply(\/|$)/.test(location.pathname),
      jd: () => ({ title: txt("[data-automation-id='jobPostingHeader'], h2"), company: "", location: txt("[data-automation-id='locations']"), text: txt("[data-automation-id='jobPostingDescription']") }),
      jobKey: () => { const m = location.pathname.match(/_(JR?-?\d+[\w-]*|R-?\d+)/i); return "workday:" + location.hostname.split(".")[0] + ":" + (m ? m[1] : location.pathname); },
      async start(log) {
        const choose = () => q("[data-automation-id='useMyLastApplication']") || q("[data-automation-id='applyManually']");
        // Workday renders slowly: wait for one of its known states before deciding
        const adv = () => q("[data-automation-id='adventureButton'], a[data-automation-id='adventureButton']");
        await JA.waitFor(() => choose() || adv() || this.root() || JA.accountPage(), 12000, 400);
        const c = choose();
        if (c) { log(`Choosing "${JA.btnText(c)}"…`); JA.click(c); return "started"; }
        const b = adv();
        if (!b) return this.root() || JA.accountPage() ? "has-form" : "none";
        log("Clicking Apply on Workday…");
        JA.click(b);
        const m = await JA.waitFor(choose, 7000);
        if (m) { log(`Choosing "${JA.btnText(m)}"…`); JA.click(m); }
        return "started";
      },
      nextBtn: () => q("[data-automation-id='pageFooterNextButton'], [data-automation-id='bottom-navigation-next-button']"),
      root() { return this.nextBtn() ? (q("[data-automation-id='applyFlowPage']") || document.body) : null; },
      next() {
        const b = this.nextBtn();
        if (!b) return null;
        return { el: b, kind: /submit/i.test(JA.btnText(b)) ? "submit" : "next" };
      },
      errors: () => [...document.querySelectorAll("[data-automation-id='errorMessage'], [data-automation-id='errorBanner'] li, [data-automation-id='inputAlert']")].filter(JA.visible).map(JA.text),
      success: success(/application submitted|congratulations|your application has been/),
      token: () => location.hostname.split(".")[0]
    },
    { id: "smartrecruiters", match: () => /smartrecruiters\.com$/.test(location.hostname), token: () => seg(0), jobKey: () => "smartrecruiters:" + location.pathname },
    { id: "icims", match: () => /icims\.com$/.test(location.hostname), token: () => location.hostname.split(".")[0].replace(/^careers-|-careers$|^jobs-/, "") },
    { id: "successfactors", match: () => /successfactors\.(com|eu)$|sapsf\.com$/.test(location.hostname), token: () => new URLSearchParams(location.search).get("company") || domainToken() },
    { id: "taleo", match: () => /taleo\.net$/.test(location.hostname), token: () => location.hostname.split(".")[0] }
  ];

  JA.detectSite = function () {
    const s = SITES.find((x) => x.match());
    const site = Object.assign({}, base, s || {});
    site.tokenClean = () => String(site.token() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return site;
  };
  JA.SUCCESS_RX = SUCCESS;
})();
