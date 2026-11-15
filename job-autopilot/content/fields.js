// Finds every question in a form "root", answers it, and reports what it couldn't answer.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});
  const TEXT_TYPES = new Set(["", "text", "email", "tel", "number", "url"]);
  const PLACEHOLDER = /^(select|choose|please select|--|select one|select\.\.\.|none selected|search)/i;

  function ownText(el) {
    return JA.text(el);
  }

  // Human label for a field.
  // ids resolve inside the element's own shadow root first (LinkedIn's Easy Apply lives in one)
  const byId = (el, id) => { const rn = el.getRootNode && el.getRootNode(); return (rn && rn.getElementById && rn.getElementById(id)) || document.getElementById(id); };

  JA.labelOf = function (el) {
    let t = "";
    if (el.labels && el.labels.length) t = [...el.labels].map(ownText).join(" ");
    if (!t) {
      const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      t = ids.map((id) => ownText(byId(el, id))).join(" ");
    }
    if (!t) { const al = el.getAttribute("aria-label") || ""; if (!PLACEHOLDER.test(al.trim()) || al.trim().length > 20) t = al; } // PrimeNG: aria-label="Select"
    if (!t) {
      for (let p = el.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
        const inputs = p.querySelectorAll("input:not([type=hidden]), select, textarea, button[aria-haspopup]").length;
        if (inputs > 3) break;
        const lab = [...p.querySelectorAll("label, legend, [class*='label'], [class*='Label'], [class*='question'], [class*='title'], h3, h4, h5")]
          .find((n) => !n.contains(el) && ownText(n) && !n.querySelector("input, select, textarea"));
        if (lab) { t = ownText(lab); break; }
      }
    }
    if (!t) {
      // inside a web component: the host element carries the label
      const rn = el.getRootNode && el.getRootNode();
      const host = rn && rn.host;
      if (host) t = host.getAttribute("label") || host.getAttribute("aria-label") || host.getAttribute("placeholder") || JA.labelOf(host);
    }
    if (!t) t = el.placeholder || el.title || el.name || "";
    return t.replace(/\s+/g, " ").trim().slice(0, 300);
  };

  function matchText(el, label) {
    return JA.norm([label, el.getAttribute("aria-label"), el.placeholder, el.name, el.id, el.getAttribute("autocomplete"), el.getAttribute("data-automation-id")].filter(Boolean).join(" | "));
  }

  function required(el, label, container) {
    if (el.required || el.getAttribute("aria-required") === "true") return true;
    if (/\*\s*$|\*|\(required\)|\brequired\b/i.test(label || "")) return true;
    if (container && container.querySelector("[aria-required='true'], [required]")) return true;
    return false;
  }

  function groupQuestion(container, optionLabels) {
    const lg = container.querySelector("legend, [role=radiogroup][aria-label], [class*='label'], [class*='question'], [class*='title']");
    let t = "";
    if (container.matches("[role=radiogroup][aria-labelledby], [role=group][aria-labelledby]")) {
      t = (container.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => ownText(byId(container, id))).join(" ");
    }
    if (!t && container.getAttribute("aria-label")) t = container.getAttribute("aria-label");
    if (!t && lg && !optionLabels.includes(ownText(lg))) t = ownText(lg);
    if (!t) {
      t = ownText(container);
      for (const o of optionLabels) t = t.replace(o, " ");
    }
    if (!t || t.length < 3) {
      const prev = container.previousElementSibling;
      if (prev) t = ownText(prev);
    }
    return t.replace(/\s+/g, " ").trim().slice(0, 300);
  }

  function commonAncestor(els) {
    let a = els[0].parentElement;
    while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
    // widen to include the question text sitting next to the options
    for (let i = 0; a && i < 2 && JA.text(a).length < 25; i++) a = a.parentElement;
    return a || document.body;
  }

  const choiceLabel = (inp) => {
    const lab = (inp.labels && inp.labels[0]) || inp.closest("label");
    let t = lab ? JA.text(lab) : "";
    if (!t) { const n = inp.nextElementSibling; t = n ? JA.text(n) : ""; }
    if (!t) t = inp.getAttribute("aria-label") || inp.value || "";
    return t.trim();
  };

  JA.inPanel = (el) => !!(el.closest && el.closest("#ja-panel-host"));

  JA.collectUnits = function (root) {
    root = root || document;
    const units = [];
    const all = (sel) => JA.deepAll(root, sel).filter((e) => !JA.inPanel(e));

    // text-like inputs and textareas
    for (const el of all("input, textarea")) {
      if (el.tagName === "INPUT" && !TEXT_TYPES.has((el.type || "").toLowerCase())) continue;
      if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") continue;
      if (el.closest("[data-automation-id='multiselectInputContainer']")) continue;
      const datePart = ((el.getAttribute("data-automation-id") || "") + " " + (el.id || "")).match(/dateSection(Month|Day|Year)/i);
      // Workday's month/year inputs can be zero-size behind their "MM"/"YYYY" display: judge the wrapper instead
      if (!(datePart ? JA.visible(el.closest("[data-automation-id='dateInputWrapper']") || el.parentElement) : JA.visible(el)) || el.disabled || el.readOnly) continue;
      if (datePart) {
        // the date's own field wrapper, not the whole Workday entry (which is also role=group)
        const group = el.closest("[data-automation-id^='formField'], fieldset") || el.closest("[data-automation-id='dateInputWrapper']")?.parentElement || el.closest("[role=group]");
        const lab = group && [...group.querySelectorAll("label, legend, [data-automation-id='formLabel']")].find((n) => !/^(month|day|year)$/i.test(JA.text(n)));
        const groupLabel = lab ? JA.text(lab) : "";
        const label = [groupLabel || JA.labelOf(el) || "Date", datePart[1]].join(" — ");
        const empty = () => {
          const [now, txt, disp, val] = JA.dateShown(el);
          const num = (x) => x != null && /^\s*\d+\s*$/.test(String(x));
          // a widget that shows its own state (aria / display) is judged by that, not by input.value
          return now != null || txt != null || disp ? ![now, txt, disp].some(num) : !num(val);
        };
        units.push({ kind: "text", el, label, match: JA.norm(label + " | " + (el.id || "") + " | " + (el.getAttribute("data-automation-id") || "")), required: required(el, label, group), datePart: datePart[1].toLowerCase(), noRemember: true,
          filled: () => !empty() });
        continue;
      }
      const label = JA.labelOf(el);
      if (JA.isHoneypot(el, label) || JA.isSearchField(el, label)) continue;
      units.push({ kind: el.tagName === "TEXTAREA" ? "textarea" : "text", el, label, match: matchText(el, label), required: required(el, label),
        filled: () => !!el.value.trim() });
    }

    // native selects
    for (const el of all("select")) {
      if (!JA.visible(el) || el.disabled) continue;
      const label = JA.labelOf(el);
      if (JA.isHoneypot(el, label) || JA.isSearchField(el, label)) continue;
      const opts = [...el.options];
      units.push({ kind: "select", el, label, match: matchText(el, label), required: required(el, label),
        options: opts.map((o) => o.text.trim()),
        filled: () => el.selectedIndex > -1 && !!el.value && !PLACEHOLDER.test((el.options[el.selectedIndex] || {}).text || "") });
    }

    // radio groups
    const radios = all("input[type=radio]").filter(JA.visibleChoice);
    const groups = new Map();
    for (const r of radios) {
      const k = r.name ? "n:" + r.name : (r.closest("[role=radiogroup], fieldset") || r.parentElement);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const [, rs] of groups) {
      const container = rs[0].closest("fieldset, [role=radiogroup]") || commonAncestor(rs);
      const optionLabels = rs.map(choiceLabel);
      let label = groupQuestion(container, optionLabels), qbox = container;
      if (!label || label.length < 3) {
        // the question sits a few levels up (PrimeNG: <label>Question *</label><div>…radios…</div>)
        const own = (n) => rs.some((r) => n.contains(r) || (r.labels && [...r.labels].includes(n)));
        for (let p = container.parentElement, i = 0; p && i < 6 && !p.matches("form, body"); p = p.parentElement, i++) {
          if (p.querySelectorAll("input:not([type=hidden]), select, textarea").length > rs.length) break; // reached a neighbour's field
          const q = [...p.querySelectorAll("label, legend, [class*='label' i], [class*='question' i]")].find((n) => !own(n) && ownText(n) && !n.querySelector("input, select, textarea"));
          if (q) { label = ownText(q); qbox = p; break; }
        }
      }
      units.push({ kind: "radio", els: rs, el: rs[0], container, label, match: JA.norm(label + " | " + (rs[0].name || "")), options: optionLabels,
        required: rs.some((r) => r.required) || required(rs[0], label, qbox),
        filled: () => rs.some((r) => r.checked) });
    }

    // checkboxes: single consent boxes vs. multi-choice groups
    const boxes = all("input[type=checkbox]").filter(JA.visibleChoice);
    const used = new Set();
    for (const b of boxes) {
      if (used.has(b)) continue;
      const fs = b.closest("fieldset, [role=group]");
      const peers = fs ? boxes.filter((x) => fs.contains(x)) : [b];
      peers.forEach((x) => used.add(x));
      if (peers.length >= 2 && fs) {
        const optionLabels = peers.map(choiceLabel);
        const label = groupQuestion(fs, optionLabels);
        units.push({ kind: "checkboxes", els: peers, el: peers[0], container: fs, label, match: JA.norm(label), options: optionLabels,
          required: required(peers[0], label, fs), filled: () => peers.some((x) => x.checked) });
      } else {
        for (const x of peers) {
          const label = choiceLabel(x) || JA.labelOf(x);
          units.push({ kind: "checkbox", el: x, label, match: JA.norm(label + " | " + (x.name || "") + " | " + (x.id || "")), required: x.required || /\*/.test(label),
            filled: () => x.checked });
        }
      }
    }

    // custom dropdowns: react-select / Ashby / Workday
    for (const el of all("input[role=combobox], input[aria-autocomplete=list], button[aria-haspopup=listbox], div[role=combobox][tabindex], span[role=combobox][tabindex], [data-automation-id='multiselectInputContainer'] input")) {
      if (!JA.visible(el) || el.disabled) continue;
      const label = JA.labelOf(el);
      const wrap = el.closest("[class*='select__control'], [class*='-control'], [data-automation-id='multiselectInputContainer'], [class*='container']") || el.parentElement;
      units.push({ kind: "combobox", el, wrap, label, match: matchText(el, label), required: required(el, label, el.closest("[class*='field'], [data-automation-id^='formField']")),
        options: null,
        filled: () => {
          if (el.tagName !== "INPUT") return !PLACEHOLDER.test(JA.text(el)) && !!JA.text(el);
          const box = el.closest("[class*='select__control'], [class*='-control'], [data-automation-id^='formField'], [class*='container']") || el.parentElement;
          if (box && box.querySelector("[class*='singleValue'], [class*='single-value'], [class*='multiValue'], [class*='multi-value'], [data-automation-id='selectedItem']")) return true;
          return !!(el.value && el.value.trim()) && el.getAttribute("aria-expanded") !== "true";
        } });
    }

    // yes/no button pairs (Ashby)
    const parents = new Set(all("button, [role=button]").filter((b) => /^(yes|no)$/i.test(JA.btnText(b))).map((b) => b.parentElement).filter(Boolean));
    for (const grp of parents) {
      const bs = [...grp.children].filter((c) => c.matches("button, [role=button]"));
      if (bs.length !== 2) continue;
      const t = bs.map((b) => JA.btnText(b).toLowerCase());
      if (!(t.includes("yes") && t.includes("no"))) continue;
      if (!bs.every(JA.visible)) continue;
      const container = commonAncestor(bs);
      const label = groupQuestion(container, bs.map(JA.btnText));
      units.push({ kind: "buttons", els: bs, el: bs[0], container, label, match: JA.norm(label), options: bs.map(JA.btnText), required: required(bs[0], label, container),
        filled: () => bs.some((b) => b.getAttribute("aria-pressed") === "true" || /active|selected|checked/i.test(b.className)) });
    }
    return units;
  };

  // ---------- custom dropdown driving ----------
  function listOptions(el) {
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const scope = id && byId(el, id);
    const pool = scope ? scope.querySelectorAll("[role=option]") : JA.deepAll(document, "[role=option], [class*='select__option'], [data-automation-id='promptOption']");
    // tags already in a tag box (PrimeNG marks them role=option too) aren't choices
    return [...pool].filter((o) => JA.visible(o) && !JA.inPanel(o) && !o.querySelector("input") && !o.closest("[class*='input-multiple' i]"));
  }

  // Skill pickers: "React" must not become "React Native". Same skill = same canonical form,
  // ignoring ".js", punctuation, a plural "s" and a parenthetical ("JavaScript (Programming Language)").
  const canon = (s) => JA.norm(s).replace(/\.?js\b/g, "").replace(/[^a-z0-9+#]/g, "").replace(/s$/, "");
  JA.sameSkill = (opt, want) => {
    const o = String(opt || ""), w = String(want || "");
    if (!o.trim() || o.length > 60) return false;
    const bare = o.replace(/\(.*?\)/g, " ");
    const paren = (o.match(/\(([^)]*)\)/) || [])[1] || "";
    if (canon(bare) === canon(w) || (paren && canon(paren) === canon(w))) return true;
    const a = JA.skillsIn ? JA.skillsIn(o) : [], b = JA.skillsIn ? JA.skillsIn(w) : [];
    return a.length === 1 && b.length === 1 && a[0] === b[0] && bare.trim().split(/\s+/).length <= 4;
  };
  const pick = (texts, want) => want.exact ? texts.findIndex((t) => JA.sameSkill(t, want.text)) : JA.chooseOption(texts, want);

  // React-style widgets act on where the click lands: hit the innermost element showing the
  // option's text, so handlers on any ancestor (Workday's prompt leaf, the option row) fire too.
  const leaf = (o) => {
    const inner = o.querySelector("[data-automation-id='promptOption']");
    if (inner && JA.visible(inner)) return inner;
    for (let t = o; ;) { const c = [...t.children].find((x) => JA.visible(x) && JA.text(x) === JA.text(o)); if (!c) return t; t = c; }
  };

  async function fillCombobox(unit, want) {
    const el = unit.el;
    // multiselects (Workday skills/prompts) show a pill per pick: count them to know a click took
    const multi = el.tagName === "INPUT" && el.closest("[data-automation-id='multiselectInputContainer']");
    const box = multi && (el.closest("[data-automation-id^='formField']") || multi.parentElement);
    const chosen = () => box ? box.querySelectorAll("[data-automation-id='selectedItem']").length : 0;
    const before = chosen();
    const typed = want.typed || (want.text !== undefined ? String(want.text) : null);
    const ctrl = el.tagName === "INPUT" ? (el.closest("[class*='select__control'], [class*='-control']") || el) : el;
    const searchFirst = el.tagName === "INPUT" && typed && (want.exact || el.closest("[data-automation-id='multiselectInputContainer']"));
    JA.click(ctrl);
    if (el.tagName === "INPUT") { el.focus(); JA.key(el, "ArrowDown"); }
    // search boxes (Workday prompts, skill pickers) list nothing useful until you type
    let opts = await JA.waitFor(() => { const o = listOptions(el); return o.length ? o : null; }, searchFirst ? 300 : 2500);
    const texts = () => (opts || []).map((o) => JA.text(o));
    let idx = opts ? pick(texts(), want) : -1;
    if (idx < 0 && el.tagName === "INPUT" && typed) {
      JA.setValue(el, typed);
      if (el.closest("[data-automation-id='multiselectInputContainer']")) JA.key(el, "Enter");
      await JA.sleep(searchFirst ? 350 : 700);
      opts = await JA.waitFor(() => { const o = listOptions(el); return o.length ? o : null; }, searchFirst ? 2500 : 3500);
      idx = opts ? pick(texts(), want) : -1;
      if (idx < 0 && !want.exact && opts && opts.length && (want.typed || want.text) && opts.length <= 8) {
        // typed search narrowed the list: take the first option that starts with what we typed
        const t0 = JA.norm(typed);
        idx = texts().findIndex((x) => JA.norm(x).startsWith(t0));
      }
    }
    if (idx < 0 && want.exact && el.tagName === "INPUT" && typed && !(opts && opts.length)) {
      // free-typing tag box (PrimeNG chips, "Type the skill and hit enter"): no list appears;
      // Enter, a comma or leaving the box turns the text into a tag. Counted only once the tag shows.
      const chips = el.closest("[class*='input-multiple' i], [class*='chips' i], [class*='tags' i], ul[role=listbox]");
      if (chips || /\benter\b|comma/i.test(el.placeholder || "")) {
        const box = chips || el.parentElement.parentElement;
        const tagged = () => [...box.querySelectorAll("*")].some((x) => x !== el && !x.contains(el) && !x.children.length && JA.sameSkill(JA.text(x), typed));
        for (const go of [() => JA.key(el, "Enter"), () => JA.setValue(el, typed + ","), () => { JA.setValue(el, typed); el.dispatchEvent(new FocusEvent("blur")); }]) {
          if (el.value !== typed && !el.value.startsWith(typed)) JA.setValue(el, typed);
          go();
          await JA.sleep(250);
          if (tagged()) { if (el.value) JA.setValue(el, ""); return true; }
        }
      }
    }
    if (idx < 0) {
      if (el.tagName === "INPUT" && typed) JA.setValue(el, "");
      JA.closeList(el);
      return false;
    }
    const row = opts[idx], tgt = leaf(row);
    JA.click(tgt);
    await JA.sleep(350);
    if (box) {
      for (const alt of [row, row.querySelector("input[type=checkbox]")]) {
        if (chosen() > before) break;
        if (alt && alt !== tgt && alt.isConnected) { JA.click(alt); await JA.sleep(350); }
      }
      if (listOptions(el).length) JA.closeList(el);
      if (chosen() <= before) { if (typed) JA.setValue(el, ""); return false; }
    }
    return true;
  }
  JA.fillCombobox = fillCombobox;

  // Answer every unanswered question in root. Returns {filled, needs:[unit], skipped}
  // Workday-style split date boxes (MM / DD / YYYY) for "today's date" on self-identification pages.
  function fillDates(root) {
    let n = 0;
    const now = new Date();
    const parts = { Month: String(now.getMonth() + 1).padStart(2, "0"), Day: String(now.getDate()).padStart(2, "0"), Year: String(now.getFullYear()) };
    for (const el of root.querySelectorAll("input[data-automation-id*='dateSection']")) {
      const m = (el.getAttribute("data-automation-id") || "").match(/dateSection(Month|Day|Year)/i);
      if (!m || !JA.visible(el) || el.value || (JA.historyEntryOf && JA.historyEntryOf(el))) continue;
      const ctxText = JA.norm(JA.text(el.closest("[data-automation-id^='formField'], fieldset, [role=group]") || el.parentElement));
      if (!/\b(today'?s date|current date|date signed|signature date)\b/.test(ctxText) || /birth|dob|employment|education|\bfrom\b|\bto\b/.test(ctxText)) continue;
      JA.setValue(el, parts[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()]);
      n++;
    }
    return n;
  }

  JA.fillRoot = async function (root, cfg, ctx, log) {
    const units = JA.collectUnits(root);
    const out = { filled: fillDates(root) ? 1 : 0, needs: [], units };
    for (const u of units) {
      try {
        const entry = JA.historyEntryOf ? JA.historyEntryOf(u.el) : null;
        if (u.kind === "checkbox" && entry) continue; // "I currently work here" belongs to JA.fillHistory
        if (u.kind === "checkbox" && JA.historyWant) {
          // "Current role" in a single Employment block
          const h = JA.historyWant(u, cfg, ctx);
          if (h && h.yes !== undefined) {
            if (u.el.checked !== h.yes) { JA.click((u.el.labels && u.el.labels[0]) || u.el); if (u.el.checked !== h.yes) u.el.click(); out.filled++; }
            continue;
          }
        }
        if (u.kind === "checkbox") {
          const t = u.match;
          if (JA.isMarketing(t)) { if (u.el.checked) { JA.click((u.el.labels && u.el.labels[0]) || u.el); if (u.el.checked) u.el.click(); } continue; }
          if (u.el.checked) continue;
          const learned = cfg.learned && cfg.learned[JA.qkey(u.label)];
          if (JA.isConsent(t) || /^(yes|true|checked|tick)$/i.test(learned || "")) {
            JA.click((u.el.labels && u.el.labels[0]) || u.el);
            if (!u.el.checked) u.el.click();
            if (u.el.checked) { out.filled++; mark(u.el, true); }
          } else if (u.required) out.needs.push(u);
          continue;
        }
        let want;
        if (u.filled()) {
          // Kept as typed, except where earlier values are known to go wrong: résumé-parser or
          // stale values inside work/education entries ("3" as a job title) and LinkedIn URLs a
          // site rejects. Those are compared with what we would type and replaced if different.
          if (!(u.kind === "text" || u.kind === "textarea") || !(entry || /linkedin/.test(u.match))) continue;
          if (u.el.dataset.jaAi === "1") continue; // Claude corrected it after the site rejected ours
          want = JA.resolve(u, cfg, ctx);
          if (entry && want && want.skip && /^\s*\d+(\.\d+)?\s*$/.test(u.el.value) && !u.datePart) {
            // résumé-parse junk ("3") in a field your resume has no value for: clear it
            const old = u.el.value; JA.setValue(u.el, ""); if (log) log(`Cleared "${old}" from ${entry.title} — ${(u.label || "").slice(0, 30)}`);
            if (u.required) out.needs.push(Object.assign({}, u, { label: entry.title + " — " + u.label, noRemember: true }));
            continue;
          }
          const v = want && !want.skip && !want.ask ? JA.textValue(want, u) : null;
          if (!v || sameValue(u.el.value, v, u)) continue;
          if (log) log(`Replacing "${String(u.el.value).slice(0, 30)}" in ${(u.label || "a field").slice(0, 40)}`);
        } else want = JA.resolve(u, cfg, ctx);
        if (want && want.ask) { out.needs.push(Object.assign({}, u, { label: want.ask, noRemember: false })); continue; }
        if (!want || want.skip) {
          if (u.required && !(want && want.skip && (/middle name|referr/.test(u.match) || want.optionalSkip))) out.needs.push(entry ? Object.assign({}, u, { label: entry.title + " — " + u.label, noRemember: true }) : u);
          continue;
        }
        let ok = false;
        if (u.kind === "text" || u.kind === "textarea") {
          const v = JA.textValue(want, u);
          if (v !== null && v !== "") {
            if (u.datePart) {
              ok = await JA.fillDatePart(u.el, v);
              // what the box looked like, so a site that still refuses dates can be fixed from the log
              if (!ok && ctx) (ctx.diag = ctx.diag || []).push(`date "${v}" refused: ` + u.el.outerHTML.slice(0, 260) + " shown=" + JSON.stringify(JA.dateShown(u.el)));
            } else { if (want.type) JA.typeInto(u.el, v); else JA.setValue(u.el, v); ok = true; }
          }
        } else if (u.kind === "select") {
          const i = JA.chooseOption(u.options, want);
          if (i >= 0) { JA.setValue(u.el, u.el.options[i].value); ok = true; }
        } else if (u.kind === "radio" || u.kind === "buttons") {
          const i = JA.chooseOption(u.options, want);
          if (i >= 0) {
            const target = u.kind === "radio" ? ((u.els[i].labels && u.els[i].labels[0]) || u.els[i]) : u.els[i];
            JA.click(target);
            if (u.kind === "radio" && !u.els[i].checked) u.els[i].click();
            ok = true;
          }
        } else if (u.kind === "checkboxes") {
          // multi-choice: tick the skills you have / the option matching the answer
          let n = 0;
          u.options.forEach((o, i) => {
            const skill = JA.skillsIn(o, cfg.customKeywords)[0];
            const yes = skill ? ctx.resumeSkills.has(skill) || (cfg.knownSkills || []).includes(skill) : JA.chooseOption([o], want) === 0;
            if (yes && !u.els[i].checked) { JA.click((u.els[i].labels && u.els[i].labels[0]) || u.els[i]); n++; }
          });
          ok = n > 0;
        } else if (u.kind === "combobox") {
          ok = await fillCombobox(u, want);
        }
        if (ok) { out.filled++; mark(u.el, true); await JA.sleep(120); }
        else if (u.required) out.needs.push(u);
      } catch (e) {
        if (log) log("Skipped a field after an error: " + (u.label || "").slice(0, 60));
        if (u.required) out.needs.push(u);
      }
    }
    for (const u of out.needs) mark(u.el, false);
    return out;
  };

  function sameValue(cur, v, u) {
    if (u.datePart) return parseInt(cur, 10) === parseInt(v, 10);
    return JA.norm(cur) === JA.norm(v) || String(cur).trim() === String(v).trim();
  }

  function mark(el, ok) {
    const t = el && (el.closest("label") || el);
    if (t && t.style) t.style.outline = ok ? "2px solid #16a34a" : "2px solid #f59e0b";
  }

  // Apply a user-typed answer directly (from the panel), used before re-running.
  JA.applyAnswer = async function (u, answer, cfg, ctx) {
    const want = { text: answer, learned: true };
    if (u.kind === "text" || u.kind === "textarea") { if (u.datePart) return JA.fillDatePart(u.el, answer); JA.setValue(u.el, answer); return true; }
    if (u.kind === "select") { const i = JA.chooseOption(u.options, want); if (i >= 0) { JA.setValue(u.el, u.el.options[i].value); return true; } return false; }
    if (u.kind === "radio" || u.kind === "buttons") { const i = JA.chooseOption(u.options, want); if (i >= 0) { JA.click(u.kind === "radio" ? ((u.els[i].labels && u.els[i].labels[0]) || u.els[i]) : u.els[i]); return true; } return false; }
    if (u.kind === "checkbox") { if (/^(yes|true|tick|checked|agree)/i.test(answer) && !u.el.checked) JA.click((u.el.labels && u.el.labels[0]) || u.el); return true; }
    if (u.kind === "combobox") return fillCombobox(u, want);
    return false;
  };

  // ---------- resume upload ----------
  JA.attachResume = async function (root, resume, log, replace, strict) {
    if (!resume || !resume.b64) return false;
    const inputs = JA.deepAll(root || document, "input[type=file]").filter((i) => !JA.inPanel(i) && !i.disabled);
    if (!inputs.length) return false;
    const desc = (i) => JA.norm([JA.labelOf(i), i.name, i.id, i.getAttribute("accept"), i.getAttribute("data-automation-id"), JA.text(i.closest("[class*='field'], [class*='upload'], section, fieldset") || i.parentElement).slice(0, 200)].join(" "));
    const cover = /cover|letter|photo|picture|image|avatar|transcript|portfolio|certificate/;
    const target = inputs.find((i) => /resume|\bcv\b|curriculum|from device|upload a file|autofill/.test(desc(i)) && !/cover/.test(JA.norm(JA.labelOf(i))))
      || (!strict && inputs.find((i) => !cover.test(desc(i)) && /pdf|doc|\*/.test((i.getAttribute("accept") || "*") + "*"))) // first non-cover upload
      || null;
    if (!target || (!replace && (target.dataset.jaDone === "1" || (target.files && target.files.length)))) return false;
    // Workday re-renders a fresh, empty file input after an upload: don't attach a second copy.
    const box = target.closest("[data-automation-id*='attachments' i], [data-automation-id*='resume' i], [data-automation-id^='formField'], fieldset, section") || target.parentElement;
    const listed = document.querySelector("[data-automation-id='file-upload-successful'], [data-automation-id='file-upload-item'], [data-automation-id='fileUploadSuccessful']")
      || (box && /\w\.(pdf|docx?)\b/i.test(JA.text(box)));
    if (!replace && listed) return false;
    const bin = atob(resume.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], resume.name || "Resume.pdf", { type: "application/pdf", lastModified: Date.now() }));
    target.files = dt.files;
    target.dataset.jaDone = "1";
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    if (log) log(`Attached resume: ${resume.name}`);
    return true;
  };
})();
