// Work history, education and skills as structured data, read from your resume content
// (Settings → Resume content, i.e. resumeBase), and the filler for the repeatable
// "Work Experience N" / "Education N" blocks that Workday and many other ATSs use:
// adds one block per job, fills title/company/location/dates/description, ticks
// "I currently work here", fills school/degree/field/years, and adds skills to skill pickers.
// Nothing is invented: a value that isn't in your resume is asked once in the panel.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, "0");
  const plain = (s) => String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

  // The panel asks this once (answer is remembered) when a form needs the degree's start year.
  JA.EDU_START_Q = "Year you started your degree (education From date)";

  JA.parseDate = function (s) {
    s = String(s || "").trim();
    if (!s) return null;
    if (/present|current|now|till date|ongoing|today/i.test(s)) return { current: true };
    let m = s.match(/([A-Za-z]{3,9})\.?,?\s*((?:19|20)\d\d)/);
    if (m && MON[m[1].toLowerCase().slice(0, 3)]) return { y: +m[2], m: MON[m[1].toLowerCase().slice(0, 3)] };
    m = s.match(/\b(\d{1,2})[/.-]((?:19|20)\d\d)\b/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return { y: +m[2], m: +m[1] };
    m = s.match(/\b((?:19|20)\d\d)[/.-](\d{1,2})\b/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] };
    m = s.match(/\b((?:19|20)\d\d)\b/);
    return m ? { y: +m[1], m: null } : null;
  };

  function range(text) {
    const parts = String(text || "").split(/\s+(?:–|—|-|to|till|until)\s+|\s*[–—]\s*/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { start: JA.parseDate(parts[0]), end: JA.parseDate(parts[parts.length - 1]) };
    return { start: null, end: JA.parseDate(parts[0]) };
  }

  const DEGREES = [
    [/^b\.?\s?tech/i, "Bachelor of Technology"], [/^b\.?\s?e\.?$/i, "Bachelor of Engineering"], [/^m\.?\s?tech/i, "Master of Technology"],
    [/^m\.?\s?e\.?$/i, "Master of Engineering"], [/^b\.?\s?sc/i, "Bachelor of Science"], [/^m\.?\s?sc/i, "Master of Science"],
    [/^bca$/i, "Bachelor of Computer Applications"], [/^mca$/i, "Master of Computer Applications"], [/^b\.?\s?com/i, "Bachelor of Commerce"],
    [/^mba$/i, "Master of Business Administration"], [/^b\.?\s?a\.?$/i, "Bachelor of Arts"], [/^ph\.?\s?d/i, "Doctor of Philosophy"]
  ];
  function degreeAlts(short) {
    const long = (DEGREES.find(([rx]) => rx.test(short || "")) || [])[1] || short;
    const bachelor = /^bachelor/i.test(long), master = /^master/i.test(long);
    const alts = [long, short, String(short || "").replace(/\./g, ""), String(short || "").replace(/\.\s*/g, ". ")];
    if (/technology/i.test(long)) alts.push("B.Tech", "BTech", "B Tech", "Bachelor of Technology (B.Tech)", "B.Tech/B.E.");
    if (bachelor) alts.push("Bachelor's Degree", "Bachelors Degree", "Bachelor's", "Bachelors", "Bachelor Degree", "Bachelor", "Undergraduate Degree", "Undergraduate", "Graduate");
    if (/technology/i.test(long)) alts.push("Bachelor of Engineering", "B.E.", "BE"); // closest equivalent when the list has no B.Tech
    if (master) alts.push("Master's Degree", "Masters Degree", "Master's", "Masters", "Postgraduate");
    return { long, alts: [...new Set(alts.filter(Boolean))] };
  }

  // {jobs:[{title, company, location, start, end, current, description}], schools:[{school, degree, degreeLong, degreeAlts, field, start, end, grade}]}
  const cache = new WeakMap();
  JA.history = function (cfg) {
    if (cache.has(cfg)) return cache.get(cfg);
    const P = cfg.profile || {};
    const base = cfg.resumeBase || {};
    const cityLine = (loc) => {
      if (!loc) return "";
      if (P.city && JA.norm(loc) === JA.norm(P.city)) return [P.city, P.state, P.country].filter(Boolean).join(", ");
      return loc;
    };
    const jobs = (base.experience || []).map((e) => {
      const left = plain(e.left);
      let [title, rest] = left.includes(" | ") ? left.split(" | ") : left.split(/\s+(?:at|@|–|—)\s+/);
      rest = rest || "";
      let company = rest, location = "";
      const lastComma = rest.lastIndexOf(", ");
      if (lastComma > 0 && !/[()]/.test(rest.slice(lastComma))) { company = rest.slice(0, lastComma).trim(); location = rest.slice(lastComma + 2).trim(); }
      const r = range(e.right);
      const bullets = (e.bullets || []).map(plain).filter(Boolean);
      return {
        title: (title || "").trim(), company: company.trim(), location: cityLine(location),
        start: r.start && !r.start.current ? r.start : null, end: r.end && !r.end.current ? r.end : null, current: !!(r.end && r.end.current),
        description: bullets.map((b) => "• " + b).join("\n")
      };
    }).filter((j) => j.title || j.company);

    const learned = cfg.learned || {};
    const schools = (base.education || []).map((e) => {
      const left = plain(e.left);
      const right = plain(e.right);
      const [school, prog] = left.split(/\s+[–—-]\s+|,\s+/);
      let degree = P.degree || "", field = P.major || "";
      if (prog) { const m = prog.match(/^(.+?)\s+(?:in|of)\s+(.+)$/i); if (m) { degree = m[1].trim(); field = m[2].trim(); } else degree = prog.trim(); }
      const [dates, ...rest] = right.split("|").map((x) => x.trim());
      const r = range(dates);
      const grade = (rest.join(" ").match(/\d+(?:\.\d+)?\s*%|\d(?:\.\d+)?\s*\/\s*10|\d\.\d+\s*(?:cgpa|gpa)/i) || [])[0] || P.percentage || "";
      const told = JA.parseDate(P.eduStartYear || learned[JA.qkey(JA.EDU_START_Q)] || "");
      const startYear = (r.start && r.start.y) || (told && told.y) || null;
      const d = degreeAlts(degree);
      return { school: (school || P.university || "").trim(), degree, degreeLong: d.long, degreeAlts: d.alts, field,
        start: startYear ? { y: startYear, m: (r.start && r.start.m) || (told && told.m) || null } : null, end: r.end && !r.end.current ? r.end : null, grade: String(grade).trim() };
    }).filter((s) => s.school);
    if (!schools.length && P.university) {
      const d = degreeAlts(P.degree);
      const told = JA.parseDate(P.eduStartYear || learned[JA.qkey(JA.EDU_START_Q)] || "");
      const sy = told && told.y ? told : null;
      schools.push({ school: P.university, degree: P.degree, degreeLong: d.long, degreeAlts: d.alts, field: P.major, start: sy, end: P.gradYear ? { y: +P.gradYear, m: null } : null, grade: P.percentage || "" });
    }
    const h = { jobs, schools };
    cache.set(cfg, h);
    return h;
  };

  // ---------- finding the repeatable blocks ----------
  const HEAD = /^(work experience|professional experience|experience|employment(?: history)?|work history|employer|job|position|education|school|academic(?: qualifications?)?|qualification)s?\s*#?\s*(\d{1,2})$/i;
  const kindOf = (t) => (/educat|school|academ|qualif/i.test(t) ? "edu" : "work");
  const FIELD_SEL = "input:not([type=hidden]), select, textarea, button[aria-haspopup]";
  const HEAD_SEL = "h1, h2, h3, h4, h5, h6, legend, [role=heading], [data-automation-id*='title' i], [class*='title' i], [class*='heading' i], [class*='header' i], strong";

  // Un-numbered blocks under one "Work Experience" / "Education" heading (Phenom career sites and
  // others): one block per Job title / School field, the widest wrapper holding only that one.
  const REAL_HEAD = "h1, h2, h3, h4, h5, h6, legend, [role=heading]";
  const ANCHOR = { work: /\bjob ?title\b|\bposition\b|designation/, edu: /school|universit|college|institut/ };
  const secKind = (t) => { t = (t || "").replace(/[*:]/g, "").trim(); return t.length > 40 ? null : SECTION.edu.test(t) ? "edu" : SECTION.work.test(t) ? "work" : null; };
  const pageHeads = () => [...document.querySelectorAll(HEAD_SEL)].filter((h) => !JA.inPanel(h) && JA.visible(h) && !h.querySelector(FIELD_SEL) && (h.matches(REAL_HEAD) || secKind(JA.text(h))));
  // which section the nearest heading above el names ("work", "edu" or null)
  const sectionAbove = (el, heads) => {
    let last = null;
    for (const h of heads || pageHeads()) { if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) last = h; else break; }
    return last ? secKind(JA.text(last)) : null;
  };
  function looseEntries(k) {
    const heads = pageHeads();
    const secs = heads.filter((h) => secKind(JA.text(h)));
    if (!secs.some((h) => secKind(JA.text(h)) === k)) return [];
    const anchors = [...document.querySelectorAll(FIELD_SEL)].filter((f) => f.type !== "checkbox" && f.type !== "radio" && !JA.inPanel(f) && JA.visible(f)
      && ANCHOR[k].test(JA.norm(JA.labelOf(f) + " " + (f.id || "") + " " + (f.name || ""))) && sectionAbove(f, heads) === k);
    const list = anchors.map((a, i) => {
      let c = a;
      for (let n = 0; n < 8 && c.parentElement; n++) {
        const p = c.parentElement;
        if (p.matches("form, body") || secs.some((h) => p.contains(h)) || anchors.some((x) => x !== a && p.contains(x)) || p.querySelectorAll(FIELD_SEL).length > 16) break;
        c = p;
      }
      return c.querySelectorAll(FIELD_SEL).length >= 3 ? { container: c, title: `${k === "work" ? "Work Experience" : "Education"} ${i + 1}` } : null;
    });
    return list.every(Boolean) ? list : []; // a flat layout can't be split safely: single-block answering handles it
  }

  let entryCache = { at: 0, val: null };
  JA.historyEntries = function (root, fresh) {
    if (!fresh && entryCache.val && Date.now() - entryCache.at < 800) return entryCache.val;
    const out = { work: [], edu: [] };
    const heads = JA.deepAll(document, HEAD_SEL).filter((h) => !JA.inPanel(h) && JA.text(h).length < 40 && HEAD.test(JA.text(h)) && !h.querySelector(FIELD_SEL));
    const seen = new Set();
    for (const h of heads) {
      let c = null;
      if (h.id) c = [...document.querySelectorAll("[role=group][aria-labelledby]")].find((g) => g.getAttribute("aria-labelledby").split(/\s+/).includes(h.id) && g.querySelector(FIELD_SEL));
      if (!c) {
        for (let p = h.parentElement, i = 0; p && i < 6; p = p.parentElement, i++) {
          if (!p.querySelector(FIELD_SEL)) continue;
          if (heads.filter((x) => x !== h && p.contains(x)).length) break; // grew into a sibling entry
          c = p; break;
        }
      }
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out[kindOf(JA.text(h))].push({ container: c, title: JA.text(h) });
    }
    for (const k of ["work", "edu"]) if (!out[k].length) out[k] = looseEntries(k);
    for (const k of ["work", "edu"]) out[k].sort((a, b) => (a.container.compareDocumentPosition(b.container) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    entryCache = { at: Date.now(), val: out };
    return out;
  };

  JA.historyEntryOf = function (el) {
    if (!el || !el.closest) return null;
    const E = JA.historyEntries(document);
    for (const kind of ["work", "edu"]) {
      const i = E[kind].findIndex((e) => e.container.contains(el));
      if (i >= 0) return { kind, index: i, title: E[kind][i].title, container: E[kind][i].container };
    }
    return null;
  };

  // ---------- what goes in each field ----------
  function identity(unit) {
    const el = unit.el || {};
    const attr = (n) => (el.getAttribute && el.getAttribute(n)) || "";
    return JA.norm([unit.label, el.id, el.name, attr("data-automation-id"), el.placeholder, attr("aria-label")].filter(Boolean).join(" | "));
  }

  const START = /\bstart|startdate|\bfrom\b|\bbegin|first ?year|date joined|commence/;
  const END = /\bend\b|enddate|\bto\b|until|last ?year|leaving|graduat|complet|expected|finish/;
  function isDateField(unit, id) {
    const el = unit.el || {};
    if (unit.datePart || el.type === "date" || el.type === "month") return true;
    const opts = unit.options || [];
    if (opts.some((o) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i.test(String(o).trim())) || opts.filter((o) => /^(19|20)\d\d$/.test(String(o).trim())).length > 3) return true;
    return /\b(date|month|year|yyyy|mm)\b|\bfrom\b|\bto\b|\bstart|startdate|\bend\b|enddate|graduat/.test(id) && !/describ|title|company|employer|school|degree|location/.test(JA.norm(unit.label || ""));
  }

  function dateWant(unit, d) {
    if (!d || !d.y) return null;
    const el = unit.el || {};
    const id = identity(unit);
    const monthName = d.m ? MONTHS[d.m - 1] : null;
    const monthAlts = d.m ? [monthName.slice(0, 3), pad(d.m), String(d.m), monthName.slice(0, 3) + "."] : [];
    const part = unit.datePart || (() => {
      const opts = unit.options || [];
      if (opts.some((o) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(String(o).trim()))) return "month";
      if (opts.filter((o) => /^(19|20)\d\d$/.test(String(o).trim())).length > 3) return "year";
      if (/\bmonth\b/.test(id) && !/\byear\b/.test(id)) return "month";
      if (/\byear\b/.test(id) && !/\bmonth\b|mm/.test(id)) return "year";
      return null;
    })();
    if (part === "month") return d.m ? { text: unit.datePart ? pad(d.m) : monthName, alt: monthAlts, type: true } : null;
    if (part === "year") return { text: String(d.y), num: d.y, type: true };
    if (part === "day") return { text: "01", type: true };
    if (el.type === "month") return { text: `${d.y}-${pad(d.m || 1)}` };
    if (el.type === "date") return { text: `${d.y}-${pad(d.m || 1)}-01` };
    const fmt = JA.norm((el.placeholder || "") + " " + (el.getAttribute && el.getAttribute("data-date-format") || "") + " " + (unit.label || ""));
    if (!d.m && !/^\s*yyyy\s*$/.test(fmt) && /mm/.test(fmt)) return null; // a month is needed but the resume only has a year
    if (/yyyy-mm-dd/.test(fmt)) return { text: `${d.y}-${pad(d.m)}-01`, type: true };
    if (/yyyy-mm/.test(fmt)) return { text: `${d.y}-${pad(d.m)}`, type: true };
    if (/dd\/mm\/yyyy|dd-mm-yyyy|dd\.mm\.yyyy/.test(fmt)) return { text: `01${fmt.match(/dd(.)mm/)[1]}${pad(d.m)}${fmt.match(/dd(.)mm/)[1]}${d.y}`, type: true };
    if (/mm\/dd\/yyyy|mm-dd-yyyy/.test(fmt)) { const s = fmt.match(/mm(.)dd/)[1]; return { text: `${pad(d.m)}${s}01${s}${d.y}`, type: true }; }
    if (/mm\/yyyy|mm-yyyy|mm\.yyyy|mm yyyy/.test(fmt)) { const s = (fmt.match(/mm(.)yyyy/) || [, "/"])[1]; return { text: `${pad(d.m)}${s}${d.y}`, type: true }; }
    if (/^\s*yyyy\s*$/.test(el.placeholder || "")) return { text: String(d.y), type: true };
    if (unit.kind === "select" || unit.kind === "combobox") return { text: monthName ? `${monthName} ${d.y}` : String(d.y), alt: monthName ? [`${monthName.slice(0, 3)} ${d.y}`, `${pad(d.m)}/${d.y}`] : [] };
    return { text: d.m ? `${pad(d.m)}/${d.y}` : String(d.y), type: true };
  }

  // The nearest block that is clearly an Education / Employment section (by its legend or
  // heading, or a class/id that is exactly such a name). A form-wide wrapper like
  // "employment-application" doesn't count.
  const EDU_TOKEN = /^(education|educations|education-?section|education-?history|academics?)(--?(container|block|section|item))?$/;
  const WORK_TOKEN = /^(employment|employments|employment-?history|work-?experience|experience|work-?history|previous-?employment)(--?(container|block|section|item))?$/;
  function contextKind(el) {
    for (let p = el && el.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
      const tokens = [p.id, typeof p.className === "string" ? p.className : "", p.getAttribute("data-automation-id") || ""].join(" ").toLowerCase().split(/\s+/).filter(Boolean);
      const hEl = p.matches("fieldset, section, [role=group]") ? p.querySelector(":scope > legend, :scope > h2, :scope > h3, :scope > h4, :scope > h5") : null;
      const head = hEl ? JA.norm(JA.text(hEl)) : "";
      if (tokens.some((k) => EDU_TOKEN.test(k)) || /^(education|academic)/.test(head)) return "edu";
      if (tokens.some((k) => WORK_TOKEN.test(k)) || /^(employment|work experience|experience|work history|previous employment|professional experience)/.test(head)) return "work";
      if (p.matches("form, body")) break;
    }
    return sectionAbove(el); // a flat block straight under a "Work Experience" / "Education" heading
  }

  // undefined = not a work-history/education field (normal answering applies);
  // null = it is one, but the resume has no value (the panel asks, without remembering);
  // otherwise a "want" like the rest of answers.js.
  JA.historyWant = function (unit, cfg) {
    const el = unit.el;
    if (!el || !el.closest) return undefined;
    const id = identity(unit);
    let kind, idx;
    const entry = JA.historyEntryOf(el);
    const single = !entry; // one un-numbered Education / Employment block (Greenhouse, many career sites)
    if (entry) { kind = entry.kind; idx = entry.index; }
    else {
      if (isDateField(unit, id) && !START.test(id) && !END.test(id)) return undefined;
      if (/availab|earliest|notice|joining|join|relocat|today|signature|birth|dob/.test(id)) return undefined;
      kind = contextKind(el);
      if (!kind) return undefined;
      idx = 0;
    }
    const H = JA.history(cfg);
    const date = isDateField(unit, id) ? (START.test(id) ? "start" : END.test(id) ? "end" : null) : null;

    if (kind === "work") {
      const j = H.jobs[idx];
      if (!j) return null;
      if (unit.kind === "checkbox") return /current|present|still|till date/.test(id) ? { yes: j.current } : null;
      if (date === "start") return dateWant(unit, j.start);
      if (date === "end") {
        if (!j.current) return dateWant(unit, j.end);
        const cb = [...(entry ? entry.container : document).querySelectorAll("input[type=checkbox]")].some((c) => /current|present|still/.test(JA.norm(JA.labelOf(c) + " " + c.id + " " + (c.getAttribute("data-automation-id") || ""))));
        if (cb) return { skip: true, optionalSkip: true };
        return (unit.kind === "text" && !unit.datePart && !/mm|yyyy/.test(JA.norm(el.placeholder || ""))) ? { text: "Present" } : null;
      }
      // single block: only an obvious "Role description", not "Describe your experience with X"
      if (/descri|responsibilit|duties|summary|achievement/.test(id) && (!single || /^((role|job|position) )?(description|responsibilities|duties)/.test(JA.norm(unit.label || "")))) {
        const max = el.maxLength > 0 ? el.maxLength : 4000;
        return j.description ? { text: j.description.slice(0, max) } : { skip: true, optionalSkip: true };
      }
      if (/job ?title|position|designation|\brole\b|\btitle\b/.test(id)) return j.title ? { text: j.title } : null;
      if (/company|employer|organi[sz]ation|\bfirm\b/.test(id)) return j.company ? { text: j.company, typed: j.company } : null;
      if (single) return undefined; // not clearly a history field: normal answering
      if (/location|\bcity\b/.test(id)) return j.location ? { text: j.location, alt: [j.location.split(",")[0]], typed: j.location.split(",")[0] } : { skip: true };
      return null;
    }

    const s = H.schools[idx];
    if (!s) return null;
    if (date === "start") {
      if (!s.start) return unit.required && unit.datePart !== "month" ? { ask: JA.EDU_START_Q } : (unit.required ? null : { skip: true, optionalSkip: true });
      return dateWant(unit, s.start);
    }
    if (date === "end") return dateWant(unit, s.end);
    if (/school|universit|college|institut/.test(id)) return { text: s.school, alt: [s.school.replace(/ university$/i, "")], typed: s.school.split(/\s+/).slice(0, 2).join(" ") };
    if (/field ?of ?study|major|disciplin|speciali[sz]|branch|stream|subject/.test(id)) {
      const first = (s.field || "").split(/\s+/)[0];
      // "Electrical & Electronics Engineering": accepted by you on 2026-11-12 when a list has no plain Electronics option
      return s.field ? { text: s.field, alt: [s.field.replace(/s\b/, ""), first, "Electrical & Electronics Engineering", "Electrical and Electronics Engineering", first.replace(/s$/, ""), "Engineering"].filter(Boolean), typed: first } : null;
    }
    if (/degree|qualification|level of education|program/.test(id)) return { text: s.degreeLong, alt: s.degreeAlts, typed: s.degree };
    if (/gpa|grade|result|percent|cgpa|score|marks/.test(id)) {
      if (!unit.required) return { skip: true, optionalSkip: true };
      if (/gpa|cgpa/.test(id) && /%/.test(s.grade)) return null; // a percentage isn't a GPA
      return s.grade ? { text: s.grade.replace(/\s*%$/, "") } : null;
    }
    if (single) return undefined;
    if (/location|\bcity\b/.test(id)) return { skip: true };
    return null;
  };

  // ---------- adding blocks, ticking "currently work here", skills ----------
  const SECTION = {
    work: /^(work experience|professional experience|experience|employment history|employment|work history|previous employment)$/i,
    edu: /^(education|educational (background|qualifications?|details)|academic (background|qualifications?|details)|qualifications?)$/i
  };
  const ADD = /^(\+\s*)?add( another| new| more)?( work experience| experience| employment| job| education| school| degree| qualification)?$/i;
  const addLabel = (b) => JA.btnText(b).replace(/\s+/g, " ").trim();
  const addAria = (b, kind) => kind === "work" ? /add.*(work|experience|employment|job)/i.test(b.getAttribute("aria-label") || "") : /add.*(educat|school|degree)/i.test(b.getAttribute("aria-label") || "");

  function addButton(kind, entries) {
    const inEntry = (b) => entries.work.concat(entries.edu).some((e) => e.container.contains(b));
    const pick = (scope) => JA.buttons(scope).filter((b) => !JA.inPanel(b) && !inEntry(b) && (ADD.test(addLabel(b)) || addAria(b, kind)));
    const own = entries[kind];
    const other = kind === "work" ? SECTION.edu : SECTION.work;
    let starts = [];
    if (own.length) starts = [own[own.length - 1].container];
    else {
      const sec = document.querySelector(kind === "work" ? "[data-automation-id='workExperienceSection']" : "[data-automation-id='educationSection']");
      if (sec) { const b = pick(sec)[0]; if (b) return b; }
      starts = pageHeads().filter((h) => secKind(JA.text(h)) === kind);
    }
    for (const s of starts) {
      for (let p = s.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
        const hasOther = [...p.querySelectorAll(HEAD_SEL)].some((h) => other.test(JA.text(h).replace(/[*:]/g, "").trim()));
        if (hasOther) break;
        const b = pick(p)[0];
        if (b) return b;
      }
    }
    // flat layout (heading, blocks and button side by side in the form): the Add under this heading
    const heads = pageHeads();
    return pick(document).find((b) => sectionAbove(b, heads) === kind) || null;
  }

  JA.fillHistory = async function (root, cfg, ctx, log) {
    const H = JA.history(cfg);
    let n = 0;
    for (const kind of ["work", "edu"]) {
      const want = kind === "work" ? H.jobs.length : H.schools.length;
      if (!want) continue;
      for (let guard = 0; guard < 10; guard++) {
        const E = JA.historyEntries(document, true);
        const have = E[kind].length;
        // only grow a section the page already shows (a numbered block or its heading + Add)
        if (have >= want) break;
        const b = addButton(kind, E);
        if (!b) break;
        log(`Adding ${kind === "work" ? "work experience" : "education"} ${have + 1} of ${want}…`);
        JA.click(b);
        const grew = await JA.waitFor(() => JA.historyEntries(document, true)[kind].length > have, 5000, 250);
        if (!grew) break;
        n++;
        await JA.sleep(500);
      }
    }
    // "I currently work here" before the dates: ticking it hides the To date.
    const E = JA.historyEntries(document, true);
    E.work.forEach((e, i) => {
      const j = H.jobs[i];
      if (!j) return;
      for (const cb of JA.deepAll(e.container, "input[type=checkbox]")) {
        const t = JA.norm(JA.labelOf(cb) + " " + cb.id + " " + (cb.getAttribute("data-automation-id") || ""));
        if (!/current|present|still|till date/.test(t) || cb.checked === !!j.current) continue;
        JA.click((cb.labels && cb.labels[0]) || cb);
        if (cb.checked !== !!j.current) cb.click();
        n++;
      }
    });
    if (n) await JA.sleep(600);
    return n;
  };

  // Skill pickers ("Type to Add Skills"): adds your on-record skills, JD-relevant first, exact matches only.
  const skillDone = new WeakSet();
  JA.fillSkills = async function (root, cfg, ctx, log) {
    const units = JA.collectUnits(root).filter((u) => u.kind === "combobox" && u.el.tagName === "INPUT"
      && /\bskills?\b/.test(JA.norm(u.label + " " + (u.el.id || "") + " " + (u.el.getAttribute("data-automation-id") || "")))
      && !/years|rate|rating|level|proficien|experience/.test(JA.norm(u.label)));
    let added = 0;
    for (const u of units) {
      if (skillDone.has(u.el)) continue;
      skillDone.add(u.el);
      const box = (u.el.closest("[data-automation-id^='formField']") || u.wrap || u.el.parentElement);
      const have = () => [...(box || document).querySelectorAll("[data-automation-id='selectedItem'], [class*='multiValue'], [class*='multi-value'], [class*='chip' i], [class*='tag' i], [class*='pill' i]")].map(JA.text);
      for (const s of JA.stackForJob(cfg, ctx).slice(0, 15)) {
        if (have().some((h) => JA.sameSkill(h, s))) continue;
        if (await JA.fillCombobox(u, { text: s, typed: s, exact: true })) added++;
        await JA.sleep(150);
      }
    }
    if (added) log(`Added ${added} skill${added > 1 ? "s" : ""} to the skills box.`);
    return added;
  };
})();
