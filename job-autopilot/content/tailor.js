// Resume tailoring: picks the summary for the JD's role family, re-orders and trims skills to
// what the JD asks for, adds JD skills that are on your record, and builds the headline.
// Experience bullets, dates and education are never changed. Skills that aren't on your record
// are never added (the panel's "I've used this" button puts them on your record first).
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  // extra mappings for resume items the keyword dictionary doesn't name
  const ITEM_ALIASES = {
    "Code Splitting": ["Web performance", "Performance optimization"], "Lazy Loading": ["Web performance", "Performance optimization"],
    "Keyboard Navigation": ["Accessibility"], "Semantic HTML": ["HTML", "Accessibility"], "Secure AI Usage": ["AI-assisted development"],
    "Human Code Review of AI Output": ["Code review", "AI-assisted development"], "Context API": ["React", "Context API"], "OpenAPI": ["OpenAPI", "REST APIs"]
  };
  const HEADLINE_CATS = new Set(["Languages", "Frontend", "Backend", "Databases", "Mobile"]);
  // never in the headline: protocols/practices, and AWS (your record is AWS SSM only)
  const HEADLINE_SKIP = new Set(["REST APIs", "OpenAPI", "Authentication", "JWT", "OAuth", "RBAC", "Scalability", "Caching", "Microservices", "System design",
    "Responsive design", "Web performance", "Accessibility", "Message queues", "Event-driven architecture", "Design patterns", "OOP", "Data structures & algorithms",
    "Context API", "CSS", "HTML", "SSR", "SEO", "BullMQ", "Database design", "NoSQL", "Serverless"]);
  const HEADLINE_NAME = { Express: "Express.js" };

  JA.roleFamily = function (jd) {
    const t = JA.norm(jd.title || "");
    const x = JA.norm(jd.text || "").slice(0, 6000);
    if (/full[- ]?stack|fullstack|\bmern\b|\bmean\b/.test(t)) return "fullstack";
    if (/front[- ]?end|frontend|\bui\b|react(\.?js)? (engineer|developer)|web developer|angular|vue/.test(t)) return "frontend";
    if (/back[- ]?end|backend|node(\.?js)? (engineer|developer)|api (engineer|developer)|server|platform engineer|java|python|golang|\.net/.test(t)) return "backend";
    const n = (rx) => (x.match(rx) || []).length;
    if (n(/full[- ]?stack/g) >= 2) return "fullstack";
    const fe = n(/front[- ]?end|react|\bui\b|\bcss\b|next\.?js|redux|accessibility|web performance/g);
    const be = n(/back[- ]?end|node|\bapis?\b|microservice|database|server|sql|kafka|redis/g);
    if (fe > be * 1.6 && fe >= 3) return "frontend";
    if (be > fe * 1.6 && be >= 3) return "backend";
    return fe && be ? "fullstack" : "sde";
  };

  function itemSkills(item, custom) {
    return new Set(JA.skillsIn(item, custom).concat(ITEM_ALIASES[item] || []));
  }

  // level 0 = fullest; higher levels compact to keep one page
  JA.tailorResume = function (base, jd, analysis, cfg, level) {
    level = level || 0;
    const custom = cfg.customKeywords || [];
    const W = { required: 3, general: 2, preferred: 1 };
    const jdW = new Map((analysis ? analysis.found : []).map((f) => [f.name, W[f.section]]));
    const family = cfg.forceFamily || JA.roleFamily(jd);
    const changes = [];

    // --- skills
    const baseText = JA.resumePlainText(base, family);
    const addable = (analysis ? analysis.missingOnRecord : [])
      .filter((f) => !JA.skillsIn(baseText, custom).includes(f.name))
      .filter((f) => level < 3 || f.section !== "preferred");
    const adds = new Map(); // category label -> [names]
    for (const f of addable) {
      const home = base.skillHome[f.cat] || "Backend & Databases";
      if (!adds.has(home)) adds.set(home, []);
      adds.get(home).push(f.name);
    }
    const minKeep = level >= 2 ? 3 : level === 1 ? 4 : 5;
    const cats = base.skills.map((c, idx) => {
      const scored = c.items.map((it, i) => {
        let s = 0;
        for (const k of itemSkills(it, custom)) s = Math.max(s, jdW.get(k) || 0);
        return { it, s, i };
      });
      const rel = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
      const keep = rel.map((x) => x.it);
      for (const coreItem of c.core) if (!keep.includes(coreItem)) keep.push(coreItem);
      for (const x of scored) { if (keep.length >= minKeep) break; if (!keep.includes(x.it)) keep.push(x.it); }
      const added = adds.get(c.label) || [];
      let items = keep.concat(added.filter((a) => !keep.some((k) => JA.norm(k) === JA.norm(a))));
      if (level >= 3) items = items.slice(0, 7);
      const removed = c.items.filter((it) => !items.includes(it));
      const score = rel.reduce((n, x) => n + x.s, 0) + added.length * 3;
      return { label: c.label, items, added, removed, score, idx, hasCore: c.core.length > 0 };
    });
    const firstCat = { frontend: "Frontend", backend: "Backend & Databases" }[family];
    let kept = cats.filter((c) => c.score > 0 || (c.hasCore && level < 2) || (c.hasCore && ["Frontend", "Backend & Databases"].includes(c.label)));
    kept.sort((a, b) => (b.label === firstCat) - (a.label === firstCat) || (family === "fullstack" || family === "sde" ? a.idx - b.idx : b.score - a.score || a.idx - b.idx));
    for (const c of kept) {
      if (c.added.length) changes.push(`Skills + ${c.added.join(", ")} (${c.label})`);
      if (c.removed.length) changes.push(`Skills − ${c.removed.join(", ")}`);
    }
    for (const c of cats) if (!kept.includes(c)) changes.push(`Skills line removed: ${c.label} (not in this JD)`);

    // --- summary
    let summary = base.summaries[family] || base.summaries.fullstack;
    const sumAdds = addable.filter((f) => f.section !== "preferred" && !JA.skillsIn(JA.resumePlain(summary), custom).includes(f.name)).slice(0, 4).map((f) => f.name);
    if (sumAdds.length && level < 1) {
      const list = sumAdds.length === 1 ? `**${sumAdds[0]}**` : `**${sumAdds.slice(0, -1).join(", ")}** and **${sumAdds[sumAdds.length - 1]}**`;
      summary += ` Also experienced with ${list}.`;
      changes.unshift(`Summary + "Also experienced with ${sumAdds.join(", ")}"`);
    }
    if (family !== "fullstack") changes.unshift(`Summary: ${family === "sde" ? "general SDE" : family} version`);

    // --- headline
    const pool = (analysis ? analysis.found : [])
      .filter((f) => (f.inResume || f.onRecord) && HEADLINE_CATS.has(f.cat) && !HEADLINE_SKIP.has(f.name))
      .sort((a, b) => W[b.section] - W[a.section] || b.count - a.count)
      .map((f) => HEADLINE_NAME[f.name] || f.name);
    const head = [];
    const fill = { backend: ["Node.js", "NestJS", "Express.js", "MongoDB", "Redis", "TypeScript"], frontend: ["React", "TypeScript", "Next.js", "Redux", "JavaScript"] }[family] || base.headlineSkills;
    for (const s of pool.concat(fill)) { if (head.length >= 5) break; if (!head.includes(s)) head.push(s); }
    const headline = [base.roles[family]].concat(head).join(" | ");
    if (headline !== [base.roles.fullstack].concat(base.headlineSkills).join(" | ")) changes.unshift(`Headline → ${headline}`);

    const doc = {
      name: base.name, headline, contact: base.contact,
      sections: [
        { title: "PROFESSIONAL SUMMARY", items: [{ type: "p", text: summary }] },
        { title: "EXPERIENCE", items: base.experience.flatMap((e) => [{ type: "entry", left: e.left, right: e.right }].concat(e.bullets.map((b) => ({ type: "bullet", text: b })))) },
        { title: "TECHNICAL SKILLS", items: kept.map((c) => ({ type: "p", text: `**${c.label}:** ${c.items.join(", ")}` })) },
        { title: "EDUCATION", items: base.education.map((e) => ({ type: "entry", left: e.left, right: e.right })) }
      ]
    };
    return { doc, family, changes, level };
  };

  // The untouched original, for checking the renderer against Resume_1page_ATS.pdf.
  JA.baseLayout = function (base) {
    return {
      name: base.name, headline: [base.roles.fullstack].concat(base.headlineSkills).join(" | "), contact: base.contact,
      sections: [
        { title: "PROFESSIONAL SUMMARY", items: [{ type: "p", text: base.summaries.fullstack }] },
        { title: "EXPERIENCE", items: base.experience.flatMap((e) => [{ type: "entry", left: e.left, right: e.right }].concat(e.bullets.map((b) => ({ type: "bullet", text: b })))) },
        { title: "TECHNICAL SKILLS", items: base.skills.map((c) => ({ type: "p", text: `**${c.label}:** ${c.items.join(", ")}` })) },
        { title: "EDUCATION", items: base.education.map((e) => ({ type: "entry", left: e.left, right: e.right })) }
      ]
    };
  };

  JA.resumePlain = (s) => String(s).replace(/\*\*/g, "");
  JA.resumePlainText = function (base, family) {
    return [base.name, base.summaries[family || "fullstack"], ...base.experience.flatMap((e) => [e.left, ...e.bullets]), ...base.skills.map((c) => c.label + ": " + c.items.join(", ")), ...base.education.map((e) => e.left)]
      .map(JA.resumePlain).join("\n");
  };
  JA.docPlainText = (doc) => [doc.name, doc.headline, ...doc.contact, ...doc.sections.flatMap((s) => [s.title, ...s.items.map((i) => i.type === "entry" ? `${i.left} ${i.right || ""}` : i.text)])].map(JA.resumePlain).join("\n");
})();
