// Turns a form question into an answer from your profile, or null when there's no sourced answer
// (then the panel asks you once and remembers). A "want" is an intent such as {yes:true},
// {num:3}, {days:25}, {lpa:15}, {text:"Noida"}, {decline:true}; it is matched to the field's options later.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  JA.qkey = (label) => JA.norm(label).replace(/^\d+[.)]\s*/, "").slice(0, 160);

  const NEVER = /captcha|one.?time|\botp\b|verification code|security code|password|passcode|\bpin\b(?! ?code)/;
  const EEO = /\brace\b|ethnic|veteran|disabilit|sexual orientation|transgender|lgbt|pronoun|hispanic|latino|caste|religio/;
  const OTHER_COUNTRY = /united states|\busa\b|\bu\.s\.a?\b|\bus (citizen|person|based|work)|in the us\b|united kingdom|\buk\b|canada|european union|\beu\b|australia|singapore|germany|\buae\b|dubai|ireland|netherlands|philippines|japan|malaysia/;
  const NCR = /delhi|\bncr\b|noida|gurgaon|gurugram|ghaziabad|faridabad/;
  const OTHER_CITY = /bangalore|bengaluru|mumbai|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|chandigarh|kochi|indore|coimbatore/;
  const MARKETING = /marketing|newsletter|promotion|sms|whatsapp (updates|messages|notifications)|text messages|email communications?.{0,120}job opportunit|job alerts?|talent (community|pool|network)|future (opportunit|openings|roles|vacanc)|keep me (updated|informed|posted)|\bfollow\b|subscribe|similar (jobs|roles|opportunit)/;
  const CONSENT = /agree|consent|acknowledge|accept|certify|confirm|declare|attest|terms|privacy|policy|true and (complete|accurate|correct)|i understand|authori[sz]e .{0,40}(process|verify|contact)|data protection|gdpr/;

  JA.isMarketing = (t) => MARKETING.test(t);
  JA.isConsent = (t) => CONSENT.test(t) && !MARKETING.test(t);

  const hasYesNo = (opts) => !!opts && opts.some((o) => /^(yes|y)\b/i.test(o.trim())) && opts.some((o) => /^(no|n)\b/i.test(o.trim()));

  function lpaWant(P, m) {
    if (/fixed/.test(m)) return { lpa: P.currentFixedLpa };
    if (/variable|bonus|incentive/.test(m)) return { lpa: P.currentVariableLpa };
    return { lpa: P.currentCtcLpa };
  }

  function skillAnswer(m, unit, cfg, ctx, yesNoQ) {
    const skills = JA.skillsIn(m, cfg.customKeywords).filter((s) => !["REST APIs", "Message queues", "Caching", "Docker"].includes(s) || /\b(api|queue|cach|docker)/.test(m));
    if (!skills.length) return undefined;
    const years = (s) => {
      if (Object.prototype.hasOwnProperty.call(cfg.skillYears || {}, s)) return cfg.skillYears[s];
      return ctx.resumeSkills.has(s) ? null : 0; // on resume but unknown duration -> ask; not on resume -> 0
    };
    const has = (s) => ctx.resumeSkills.has(s) || (cfg.knownSkills || []).includes(s) || (years(s) || 0) > 0;
    const anyOf = /\bor\b|\/|any (one|of)|either/.test(m);
    if (/how many|number of|years?|yrs|how long|duration|months/.test(m) && !yesNoQ) {
      const ys = skills.map(years);
      if (ys.some((y) => y === null)) return null;
      const n = anyOf ? Math.max(...ys) : Math.min(...ys);
      if (/months/.test(m) && !/years?/.test(m)) return { num: n * 12 };
      return { num: n };
    }
    const atLeast = m.match(/(?:at least|minimum|min\.?|over|more than)\s*(\d+)|(\d+)\s*\+?\s*(?:years?|yrs)/);
    if (atLeast) {
      const need = +(atLeast[1] || atLeast[2]);
      const ys = skills.map(years);
      if (ys.some((y) => y === null)) return null;
      const n = anyOf ? Math.max(...ys) : Math.min(...ys);
      return { yes: n >= need };
    }
    if (/experience|worked|work with|familiar|proficien|comfortable|knowledge|hands.on|used|expertise|skilled/.test(m)) {
      if (/rate|scale|level|1-10|1 to 10|out of/.test(m)) return null; // self-ratings: yours to give
      return { yes: anyOf ? skills.some(has) : skills.every(has) };
    }
    return undefined;
  }

  // Your tech-stack list with the skills this JD mentions first.
  JA.stackForJob = function (cfg, ctx) {
    const stack = Array.isArray(cfg.techStack) ? cfg.techStack.filter((s) => typeof s === "string" && s.trim()) : [];
    const relevant = new Set((ctx && ctx.jdSkills) || []);
    return stack.map((s, i) => ({ s, i, relevant: JA.skillsIn(s, cfg.customKeywords).some((name) => relevant.has(name)) }))
      .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.i - b.i).map((x) => x.s);
  };

  // An answer you gave to a question worded almost the same way ("related to any current GLG
  // employees" ≈ "related to any current PwC employees"). Numbers must match exactly, so
  // "3+ years of React" never reuses the answer for "5+ years of React".
  const STOP = new Set("a an the you your are is am do does have has had to of in on for with any or and please this that be we our will would can could what which how if as at by from it its i me my there their they them been being was were should shall may".split(" "));
  const toks = (s) => JA.qkey(s).replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  JA.similarLearned = function (label, learned) {
    const a = toks(label);
    if (a.length < 2) return null;
    const nums = (t) => t.filter((w) => /^\d/.test(w)).sort().join(",");
    const A = new Set(a);
    let best = null, bestS = 0;
    for (const [k, v] of Object.entries(learned || {})) {
      if (v == null || v === "") continue;
      const b = toks(k);
      if (b.length < 2 || nums(a) !== nums(b)) continue;
      const B = new Set(b);
      let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
      const sc = inter / (A.size + B.size - inter);
      if (sc > bestS) { bestS = sc; best = v; }
    }
    return bestS >= 0.7 ? String(best) : null;
  };

  // unit: {kind, label, match, options, el}
  JA.resolve = function (unit, cfg, ctx) {
    const r = resolveCore(unit, cfg, ctx);
    if (r !== null || unit.datePart || (JA.historyEntryOf && JA.historyEntryOf(unit.el))) return r;
    const sim = JA.similarLearned(unit.label, cfg.learned);
    return sim ? { text: sim, learned: true, similar: true } : null;
  };

  function resolveCore(unit, cfg, ctx) {
    const P = cfg.profile;
    const m = unit.match || JA.norm(unit.label);
    const key = JA.qkey(unit.label);
    // Fields inside a "Work Experience N" / "Education N" block (or a job/degree date) come from
    // your resume's history, never from generic answers ("3" years must not land in Job Title).
    if (JA.historyWant) { const h = JA.historyWant(unit, cfg, ctx); if (h !== undefined) return h; }
    if (unit.datePart) return null;
    if (key && cfg.learned && cfg.learned[key] != null && cfg.learned[key] !== "") return { text: String(cfg.learned[key]), learned: true };
    if (NEVER.test(m)) return { skip: true };

    // Only answer explicit stack-list questions, never individual experience or years questions.
    if (["text", "textarea"].includes(unit.kind) && !/years?|experience|proficien|how (many|long)|rating|rate|specific|primary|main|current/.test(m)
        && (/\b(?:tech(?:nology|nical)? stack|technologies (?:you (?:use|know|have used)|used|known|you are familiar with)|(?:list|your) (?:technical )?(?:skills|technologies))\b/.test(m)
          || /^(?:key |technical |core |top )?skills?(?: ?set)?$|^skillset$/.test(JA.norm(unit.label)))) {
      const sorted = JA.stackForJob(cfg, ctx);
      if (!sorted.length) return null;
      const max = unit.el && unit.el.maxLength > 0 ? unit.el.maxLength : Infinity;
      const chosen = [];
      for (const s of sorted) if (chosen.concat(s).join(", ").length <= max) chosen.push(s);
      return chosen.length ? { text: chosen.join(", ") } : null;
    }

    if (["text", "textarea"].includes(unit.kind) && /\b(?:resume|r[eé]sum[eé]|cv)\b.{0,30}\b(?:url|link)\b|\b(?:url|link)\b.{0,30}\b(?:resume|r[eé]sum[eé]|cv)\b/.test(m)) {
      return /^https:\/\//i.test(P.resumeLink || "") ? { text: P.resumeLink } : null;
    }

    const choice = ["select", "radio", "buttons", "combobox", "checkboxes"].includes(unit.kind);
    const yesNoQ = (choice && hasYesNo(unit.options)) || /^(do|does|are|is|have|has|will|would|can|could|did|were|was)\b/.test(JA.norm(unit.label));

    if (EEO.test(m)) return { decline: true };
    if (/\bgender\b|\bsex\b/.test(m)) return { text: P.gender };

    if (/sponsor|\bvisa\b/.test(m)) return OTHER_COUNTRY.test(m) ? null : { yes: false };
    if (/(authori[sz]ed|eligible|permitted|legally|lawfully|right|able) to work|work (authori[sz]ation|permit|eligibility)|legally (able|allowed)|employment (authori[sz]ation|eligibility)/.test(m)) {
      return OTHER_COUNTRY.test(m) ? null : { yes: true };
    }
    if (/nationality|citizenship/.test(m) && !yesNoQ) return { text: P.nationality, alt: ["India", "Indian"] };
    if (/citizen/.test(m)) return OTHER_COUNTRY.test(m) ? { yes: false } : { yes: true };
    if (/18 years|over 18|at least 18|age of 18|legal (working )?age|of legal age/.test(m)) return { yes: true };

    if (/relocat|commut|work from (the )?office|\bwfo\b|onsite|on-site|in-office|in office|hybrid|work location|comfortable (working|to work)|open to work(ing)? (from|in|at)|willing to work (from|in|at)|report to (the )?office/.test(m)) {
      if (NCR.test(m) || /remote|work from home|wfh/.test(m)) return { yes: true };
      if (OTHER_CITY.test(m) || OTHER_COUNTRY.test(m)) return null;
      if (ctx.jobLocation && NCR.test(JA.norm(ctx.jobLocation)) && !/relocat/.test(m)) return { yes: true };
      return null;
    }
    if (/resid(e|ent|ing|ence)|currently (live|living|based|located|staying)|based (in|out of)|located in|where do you (live|stay)/.test(m)) {
      if (!yesNoQ) {
        if (/country/.test(m)) return { text: P.country };
        if (/state/.test(m)) return { text: P.state };
        if (/city/.test(m)) return { text: P.city };
        return { text: P.location, alt: [P.city] };
      }
      if (OTHER_COUNTRY.test(m) || OTHER_CITY.test(m)) return { yes: false };
      return { yes: true };
    }

    const notice = ctx.site === "naukri" ? P.naukriNoticeDays : P.noticeDays;
    if (/notice|serving|how soon can you (join|start)|earliest (start|joining|date|possible)|when can you (join|start)|joining (time|period|availability|date)|availability to (join|start)|days to join|can (you )?join|immediate(ly)? (joiner|join|start|available)|join immediately|start date/.test(m)) {
      if (/last working day|\blwd\b|date/.test(m) && !/how soon|days|period/.test(m)) return null;
      if (/are you (currently )?serving|serving (your )?notice/.test(m) && yesNoQ) return { yes: false };
      const within = m.match(/within\s*(\d+|a|one|two)\s*(day|week|month)/);
      if (within && yesNoQ) {
        const n = { a: 1, one: 1, two: 2 }[within[1]] || +within[1];
        const days = n * (within[2] === "week" ? 7 : within[2] === "month" ? 30 : 1);
        return { yes: notice <= days };
      }
      if (/immediate/.test(m) && yesNoQ) return { yes: notice === 0 };
      if (/negotiable|buy ?out|early release/.test(m)) return null;
      return { days: notice };
    }

    if (/negotiable/.test(m) && /ctc|salary|compensation|notice/.test(m)) return { yes: true };
    if (/expect|desired|\bectc\b|salary (requirement|expectation)|compensation expectation|expected/.test(m) && /ctc|salary|compensation|package|pay|lpa|\bectc\b/.test(m)) return { lpa: P.expectedCtcLpa };
    if (/(current|present|existing|last drawn|annual|latest) .{0,25}(ctc|salary|compensation|package|pay|cost to company)|\bcctc\b|ctc.{0,12}current|current ctc/.test(m)) return lpaWant(P, m);

    const sk = skillAnswer(m, unit, cfg, ctx, yesNoQ);
    if (sk !== undefined) return sk;

    const question = JA.norm(unit.label || "");
    if (/experience|\bexp\b|years|yrs/.test(question) && !/^(work |professional )?experience\s*\d+$/.test(question) && /(total|overall|relevant|professional|work|industry|\bit\b|software|full[- ]time|how many|years of|number of years|in years|in months|\(years\)|\(months\)|^experience|experience$)/.test(question) && !/describe|tell us|summary|details|explain/.test(question)) {
      const need = m.match(/(?:at least|minimum|min\.?|more than|over)\s*(\d+)|(\d+)\s*\+\s*(?:years?|yrs)/);
      if (need && yesNoQ) return { yes: P.totalYears >= +(need[1] || need[2]) };
      if (/month/.test(m) && !/year/.test(m)) return { num: /in months|total|overall|experience/.test(m) ? P.totalYears * 12 : 0 };
      return { num: P.totalYears };
    }

    if (/currently (employed|working)|are you (currently )?(employed|working)/.test(m)) return { yes: true };
    if (/(previously|ever|formerly|before|in the past) .{0,40}(worked|employed|been an? (employee|contractor|worker|intern))|former employee|previous (worker|employee)|ex-?employee|worked (for|at|with) (us|this company)/.test(m)) {
      const co = JA.norm(ctx.company || "");
      return { yes: !!co && (P.pastEmployers || []).some((e) => co.includes(JA.norm(e)) || JA.norm(e).includes(co)) };
    }
    if (/(previously|already|ever|before) .{0,20}applied|applied .{0,30}(before|previously|in the (last|past))/.test(m)) return { yes: !!ctx.appliedBefore };
    if (/referred|referral|refer(r)?ed by|employee referral/.test(m)) return yesNoQ ? { yes: false } : { skip: true };
    if (/current (company|employer|organi[sz]ation)|present (company|employer|organi[sz]ation)|employer name|^company name|company name$|current workplace/.test(m)) return { text: P.currentCompany };
    if (/current (job )?(title|role|designation|position)|^designation|designation$|^job title|job title$/.test(m)) return { text: P.currentTitle };

    if (/how did you (hear|find|learn|come)|source of (application|hire)|where did you (hear|find|see|learn)|^source$|job source|referral source|heard about/.test(m)) {
      const src = ctx.source === "linkedin" ? "LinkedIn" : ctx.source === "naukri" ? "Naukri" : "Company website";
      return { text: src, alt: ["LinkedIn", "Company website", "Career site", "Careers page", "Job board", "Website", "Online", "Other"], typed: src };
    }

    if (/(highest|level of|education) (level|qualification|degree|education)|^qualification|education level|^degree|degree type|which degree|highest education/.test(m)) {
      return { text: P.degree, alt: ["Bachelor of Technology", "B.Tech", "BTech", "Bachelor's Degree", "Bachelor's", "Bachelors", "Bachelor", "Graduate", "Undergraduate", "UG", "B.E"] };
    }
    if (/master'?s|post ?grad|m\.?tech|\bmba\b|\bphd\b|doctorate/.test(m) && yesNoQ) return { yes: false };
    if (/bachelor|undergraduate|b\.?\s?tech|graduate degree|engineering degree|\bdegree\b/.test(m) && yesNoQ) {
      if (/computer science|\bcs\b|\bcse\b|information technology|\bit\b|computer (application|engineering)/.test(m)) return null; // Electronics: your call, asked once
      return { yes: true };
    }
    if (/university|college|institut|alma mater|school name/.test(m) && !/high school|10th|12th|secondary/.test(m)) return { text: P.university };
    if (/field of study|major|speciali[sz]ation|branch|discipline|stream|course name/.test(m)) return { text: P.major, alt: ["Electronics", "Electronics Engineering", "Electronics and Communication", "Engineering"] };
    if (/graduation (year|date)|year of (passing|graduation|completion)|passing year|pass(ed)? ?out year|batch|completion year/.test(m)) return { text: P.gradYear, num: +P.gradYear };
    if (/percentage|marks|aggregate|score in (graduation|b\.?tech)/.test(m)) return { text: P.percentage };
    if (/cgpa|\bgpa\b|grade point|high school|10th|12th|secondary/.test(m)) return null;

    if (/linkedin/.test(m)) {
      const path = String(P.linkedin || "").replace(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\//i, "").replace(/\/+$/, "");
      if (!path) return null;
      // Workday and others validate the format; after "Invalid LinkedIn URL" the next run tries the next form.
      const forms = [`https://www.linkedin.com/${path}`, `https://linkedin.com/${path}`, `www.linkedin.com/${path}`, `linkedin.com/${path}`, `https://www.linkedin.com/${path}/`];
      const url = forms[(ctx.linkedinTry || 0) % forms.length];
      if (unit.el && unit.el.maxLength > 0 && url.length > unit.el.maxLength) return null;
      return { text: url };
    }
    if (/github/.test(m)) return { text: P.github };
    if (/twitter|facebook|instagram|x\.com|stack ?overflow|leetcode|kaggle/.test(m)) return { skip: true };
    if (/portfolio|personal (site|website)|website|blog|^url$/.test(m) && unit.kind === "text") return { text: P.portfolio };
    if (/e-?mail/.test(m)) return { text: P.email };
    if (/phone (device|type)|device type/.test(m)) return { text: "Mobile", alt: ["Mobile", "Cell", "Personal"] };
    if (/country.?code|country (phone )?code|dial(l?ing)?.?code|phone.?code|\bisd\b|calling.?code|tel-country-code|phone.?country|mobile.?country|phone.?prefix|mobile.?prefix/.test(m)) return { text: P.phoneCountryCode, alt: P.phoneCountryCode === "+91" ? ["India (+91)", "+91", "India", "IN +91", "91"] : [P.phoneCountryCode, String(P.phoneCountryCode || "").replace(/^\+/, "")], typed: P.phoneCountryCode === "+91" ? "India" : P.phoneCountryCode };
    if (/extension|\bext\b/.test(m) && /phone/.test(m)) return { skip: true };
    if (/phone|mobile|contact (no|number)|whatsapp|\bcell\b|telephone/.test(m)) return { text: P.phone };

    if (/signature|sign (your )?name|type your (full )?name|e-?sign/.test(m)) return { text: P.fullName };
    if (/first ?name|given name|\bfname\b|forename/.test(m)) return { text: P.firstName };
    if (/middle name/.test(m)) return { skip: true };
    if (/last ?name|surname|family name|\blname\b/.test(m)) return { text: P.lastName };
    if (/preferred (first )?name|nick ?name/.test(m)) return { text: P.firstName };
    if (/full ?name|your name|legal name|candidate name|applicant name|^name$|^name |\bname$/.test(m)) return { text: P.fullName };

    if (/address|street|house|flat|apartment|pin ?code|zip|postal/.test(m)) return null;
    if (/preferred (work |job )?location|location preference|preferred cit/.test(m)) return { text: P.preferredLocation, alt: ["Noida", "Delhi", "Delhi NCR", "Gurugram", "Gurgaon", "Remote"] };
    if (/\bcity\b|\btown\b/.test(m)) return { text: P.city, typed: P.city };
    if (/\bstate\b|province|region/.test(m)) return { text: P.state, typed: P.state };
    if (/country/.test(m)) return { text: P.country, typed: P.country };
    if (/current location|^location$|^location |where are you (based|located)|your location/.test(m)) return { text: P.location, alt: [P.city, "Noida", "Delhi"], typed: P.city };

    if (/background (check|verification)|\bbgv\b|drug (test|screen)/.test(m)) return { yes: true };
    if (yesNoQ && MARKETING.test(m)) return { yes: false };
    if (yesNoQ && CONSENT.test(m)) return { yes: true };

    if (/cover letter|why (do you|are you|would you|should we)|tell us|about yourself|additional information|anything else|summary|motivation|message to|note to/.test(m)) {
      return P.coverNote ? { text: P.coverNote } : null;
    }
    return null;
  }

  // ---------- turning a "want" into a field value / option ----------

  function parseRange(s, unit) {
    const t = JA.norm(s);
    if (/fresher|no experience|^none$|less than (a|one|1) (year|month)|<\s*1\b/.test(t)) return { min: 0, max: unit === "days" ? 0 : 1 };
    if (unit === "days" && /immediate/.test(t)) return { min: 0, max: 0 };
    const mm = t.match(/(\d+(?:\.\d+)?)\s*(?:\+|plus|or more|and above|above)?\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?/);
    if (!mm) return null;
    let mult = 1;
    if (unit === "days") mult = /month/.test(t) ? 30 : /week/.test(t) ? 7 : 1;
    let a = +mm[1] * mult;
    let b = mm[2] ? +mm[2] * mult : (/\+|plus|or more|above|more than|over/.test(t) ? Infinity : a);
    if (!mm[2] && /less than|under|below|up ?to|<|within|or less|max/.test(t)) { b = a; a = 0; }
    if (!mm[2] && /more than|over|>/.test(t)) { b = Infinity; }
    return { min: a, max: b };
  }

  function pickRange(options, v, unit) {
    let best = -1, bestMin = -Infinity;
    options.forEach((o, i) => {
      if (unit === "days" && /serving/.test(JA.norm(o))) return;
      const r = parseRange(o, unit);
      if (r && r.min <= v && v <= r.max && r.min >= bestMin) { best = i; bestMin = r.min; }
    });
    if (best >= 0 || unit !== "days") return best;
    let up = -1, upVal = Infinity; // notice: smallest option that is >= your notice
    options.forEach((o, i) => { const r = parseRange(o, unit); if (r && r.min >= v && r.min < upVal) { up = i; upVal = r.min; } });
    return up;
  }

  function pickText(options, wanted) {
    const W = (Array.isArray(wanted) ? wanted : [wanted]).filter((w) => w !== undefined && w !== null && w !== "").map((w) => JA.norm(String(w)));
    const O = options.map((o) => JA.norm(o));
    for (const w of W) { const i = O.findIndex((o) => o === w); if (i >= 0) return i; }
    for (const w of W) { const i = O.findIndex((o) => o.startsWith(w + " ") || o.startsWith(w + "(") || w.startsWith(o + " ")); if (i >= 0) return i; }
    for (const w of W) {
      const rx = new RegExp("(^|[^a-z0-9])" + JA.esc(w) + "([^a-z0-9]|$)");
      const i = O.findIndex((o) => rx.test(o));
      if (i >= 0) return i;
    }
    return -1;
  }

  const YES_RX = /^(yes|y|true)\b|^i (am|do|have|can|will|agree|consent|confirm)\b(?!.{0,3}not)/;
  const NO_RX = /^(no|n|false)\b|^i (am|do|have|can|will) not\b|^i don'?t\b|^i do not\b/;
  const DECLINE_RX = /decline|prefer not|don'?t wish|do not wish|not (to )?(say|answer|disclose|self.?identify|specify)|choose not|rather not|do not want to answer|don'?t want to answer|not declared/;

  JA.chooseOption = function (options, want, cfgProfile) {
    if (!options || !options.length || !want) return -1;
    const O = options.map((o) => JA.norm(o));
    if (want.decline) return O.findIndex((o) => DECLINE_RX.test(o));
    if (want.yes !== undefined) {
      const i = O.findIndex((o) => (want.yes ? YES_RX : NO_RX).test(o));
      if (i >= 0) return i;
    }
    if (want.days !== undefined) return pickRange(options, want.days, "days");
    if (want.num !== undefined && want.text === undefined) return pickRange(options, want.num, "years");
    if (want.lpa !== undefined) {
      const big = options.some((o) => /\d{5,}/.test(o.replace(/,/g, "")));
      const v = big ? want.lpa * 100000 : want.lpa;
      return pickRange(options.map((o) => o.replace(/,/g, "")), v, "years");
    }
    if (want.text !== undefined) {
      const txt = String(want.text);
      if (want.learned) {
        const yn = JA.norm(txt);
        if (/^(yes|no)$/.test(yn)) { const i = O.findIndex((o) => (yn === "yes" ? YES_RX : NO_RX).test(o)); if (i >= 0) return i; }
      }
      let i = pickText(options, [txt].concat(want.alt || []));
      if (i < 0 && want.num !== undefined) i = pickRange(options, want.num, "years");
      return i;
    }
    return -1;
  };

  // Value for a free-text / number field, or null when it can't be given honestly.
  JA.textValue = function (want, unit) {
    if (!want || want.skip || want.decline) return null;
    const el = unit.el;
    const isNum = el && el.type === "number";
    const wholeOnly = isNum && (!el.step || el.step === "1");
    const m = unit.match || "";
    if (want.text !== undefined) return String(want.text);
    if (want.yes !== undefined) return want.yes ? "Yes" : "No";
    if (want.num !== undefined) return String(want.num);
    if (want.days !== undefined) {
      if (/month/.test(m)) return isNum ? String(wholeOnly ? Math.ceil(want.days / 30) : Math.round((want.days / 30) * 10) / 10) : `${want.days} days`;
      if (/week/.test(m)) return String(Math.ceil(want.days / 7));
      return isNum || /days|\(d\)/.test(m) ? String(want.days) : `${want.days} days`;
    }
    if (want.lpa !== undefined) {
      if (/lpa|lakh|lac|\blpa\b|in l\b|\(l\)/.test(m)) return String(wholeOnly ? Math.floor(want.lpa) : want.lpa); // round DOWN
      if (/inr|rupee|₹|annual|per annum|yearly|\bp\.?a\.?\b|absolute|in numbers/.test(m)) return String(Math.floor(want.lpa * 100000));
      if (/month/.test(m)) return null;
      if (!isNum) return `${want.lpa} LPA`;
      return null; // a bare number box with no unit: yours to answer once
    }
    return null;
  };
})();
