// JD keyword gap analysis: which skills the JD asks for, which your resume shows,
// and which are missing (split into "on your record" vs "not on your record").
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  // [name, category, pattern]. String patterns get letter/digit boundaries and the i flag.
  const DICT = [
    ["JavaScript", "Languages", "javascript|es6\\+?|es20\\d\\d|ecmascript"],
    ["TypeScript", "Languages", "typescript"],
    ["Python", "Languages", "python"],
    ["Java", "Languages", "java|j2ee|jvm"],
    ["Go", "Languages", /(?<![A-Za-z])(?:Go(?=\s*(?:,|\/|\)|\s+or\s|\s+and\s|lang\b|\s+(?:developer|programming|microservices|services|backend)))|[Gg]olang)/g],
    ["Kotlin", "Languages", "kotlin"],
    ["Swift", "Languages", "swiftui|swift(?=\\s*(?:,|/|\\)|and|or|developer|programming))"],
    ["Rust", "Languages", "rust(?=\\s*(?:,|/|\\)|and|or|developer|programming|language))"],
    ["Ruby", "Languages", "ruby"],
    ["PHP", "Languages", "php"],
    ["C++", "Languages", "c\\+\\+|cpp"],
    ["C#", "Languages", "c#|c sharp"],
    [".NET", "Languages", "\\.net(?: core)?|dotnet|asp\\.net"],
    ["Scala", "Languages", "scala"],
    ["Dart", "Languages", "dart"],
    ["Shell scripting", "Languages", "bash|shell script(?:ing|s)?"],
    ["HTML", "Frontend", "html5?"],
    ["CSS", "Frontend", "css3?"],
    ["Sass", "Frontend", "sass|scss"],
    ["React", "Frontend", "react(?:\\.?js)?|reactjs"],
    ["React Native", "Mobile", "react native"],
    ["Next.js", "Frontend", "next\\.?js|nextjs"],
    ["Vue", "Frontend", "vue(?:\\.?js)?|vuejs|nuxt(?:\\.?js)?"],
    ["Angular", "Frontend", "angular(?:js)?"],
    ["Svelte", "Frontend", "svelte(?:kit)?"],
    ["Redux", "Frontend", "redux(?: toolkit)?|rtk"],
    ["Zustand", "Frontend", "zustand"],
    ["React Query", "Frontend", "react query|tanstack(?: query)?"],
    ["Context API", "Frontend", "context api"],
    ["Tailwind CSS", "Frontend", "tailwind(?: ?css)?"],
    ["Material UI", "Frontend", "material[- ]?ui|mui"],
    ["Bootstrap", "Frontend", "bootstrap"],
    ["Styled Components", "Frontend", "styled[- ]components|css[- ]in[- ]js|emotion"],
    ["Webpack", "Frontend", "webpack"],
    ["Vite", "Frontend", "vite"],
    ["Rspack", "Frontend", "rspack"],
    ["Babel", "Frontend", "babel"],
    ["Storybook", "Frontend", "storybook"],
    ["jQuery", "Frontend", "jquery"],
    ["D3", "Frontend", "d3(?:\\.js)?"],
    ["Micro-frontends", "Frontend", "micro[- ]?frontends?|module federation"],
    ["SSR", "Frontend", "server[- ]side rendering|ssr"],
    ["PWA", "Frontend", "pwa|progressive web apps?"],
    ["Web performance", "Frontend", "core web vitals|lighthouse|web performance|frontend performance"],
    ["Accessibility", "Frontend", "accessibility|wcag|a11y|aria"],
    ["Responsive design", "Frontend", "responsive (?:web )?design|responsive (?:ui|uis|layouts?|web|websites?|interfaces?)|mobile[- ]first"],
    ["Design systems", "Frontend", "design systems?|component librar(?:y|ies)"],
    ["Figma", "Frontend", "figma"],
    ["SEO", "Frontend", "seo"],
    ["Flutter", "Mobile", "flutter"],
    ["Android", "Mobile", "android"],
    ["iOS", "Mobile", "ios"],
    ["Node.js", "Backend", "node\\.?js|nodejs|node(?=\\s*(?:/|,|\\)|backend|developer|engineer|services))"],
    ["Express", "Backend", "express\\.?js|expressjs|express(?=\\s*(?:,|/|\\)|framework))"],
    ["NestJS", "Backend", "nest\\.?js|nestjs"],
    ["Fastify", "Backend", "fastify"],
    ["Koa", "Backend", "koa(?:\\.?js)?"],
    ["Django", "Backend", "django"],
    ["Flask", "Backend", "flask"],
    ["FastAPI", "Backend", "fastapi"],
    ["Spring Boot", "Backend", "spring(?: ?boot)?"],
    ["Ruby on Rails", "Backend", "ruby on rails|rails"],
    ["Laravel", "Backend", "laravel"],
    ["GraphQL", "Backend", "graphql|apollo"],
    ["REST APIs", "Backend", "restful|rest ?apis?|rest services|rest-based|rest/|api development|apis"],
    ["OpenAPI", "Backend", "openapi|swagger"],
    ["gRPC", "Backend", "grpc|protobuf"],
    ["WebSockets", "Backend", "websockets?|socket\\.io|web sockets"],
    ["Microservices", "Backend", "micro[- ]?services?"],
    ["Event-driven architecture", "Backend", "event[- ]driven|pub/?sub"],
    ["Kafka", "Backend", "kafka"],
    ["RabbitMQ", "Backend", "rabbitmq|rabbit mq"],
    ["SQS", "Backend", "sqs"],
    ["BullMQ", "Backend", "bullmq|bull queue"],
    ["Message queues", "Backend", "message queues?|message brokers?|queues?"],
    ["Redis", "Backend", "redis"],
    ["Memcached", "Backend", "memcached?"],
    ["Elasticsearch", "Backend", "elastic ?search|opensearch|elk"],
    ["JWT", "Backend", "jwt|json web tokens?"],
    ["OAuth", "Backend", "oauth ?2?(?:\\.0)?|openid|oidc|sso"],
    ["Authentication", "Backend", "authentication|authori[sz]ation|auth flows?"],
    ["RBAC", "Backend", "rbac|role[- ]based access"],
    ["Serverless", "Cloud", "serverless"],
    ["System design", "Backend", "system design|distributed systems|high[- ]level design|low[- ]level design|hld|lld"],
    ["Scalability", "Backend", "scalab(?:le|ility)|high[- ]traffic|high availability"],
    ["Caching", "Backend", "caching|cache"],
    ["Design patterns", "Backend", "design patterns|solid principles|solid"],
    ["OOP", "Backend", "object[- ]oriented|oops?"],
    ["Data structures & algorithms", "Backend", "data structures|algorithms|dsa"],
    ["SQL", "Databases", "sql|t-sql|pl/sql"],
    ["MongoDB", "Databases", "mongo(?:db)?|mongoose"],
    ["PostgreSQL", "Databases", "postgres(?:ql)?"],
    ["MySQL", "Databases", "mysql|mariadb"],
    ["SQL Server", "Databases", "sql server|mssql"],
    ["DynamoDB", "Databases", "dynamo ?db"],
    ["Cassandra", "Databases", "cassandra"],
    ["Firebase", "Databases", "firebase|firestore"],
    ["Supabase", "Databases", "supabase"],
    ["Prisma", "Databases", "prisma"],
    ["TypeORM", "Databases", "typeorm"],
    ["Sequelize", "Databases", "sequelize"],
    ["NoSQL", "Databases", "nosql"],
    ["Database design", "Databases", "schema design|database design|data model(?:l)?ing"],
    ["AWS", "Cloud", "aws|amazon web services"],
    ["GCP", "Cloud", "gcp|google cloud"],
    ["Azure", "Cloud", "azure"],
    ["S3", "Cloud", "s3"],
    ["EC2", "Cloud", "ec2"],
    ["AWS Lambda", "Cloud", "aws lambda|lambda functions?"],
    ["ECS/EKS", "Cloud", "ecs|eks|fargate"],
    ["CloudFront", "Cloud", "cloudfront|cdn"],
    ["Vercel", "Cloud", "vercel|netlify"],
    ["Docker", "DevOps", "docker|containers?|containeri[sz]ation"],
    ["Kubernetes", "DevOps", "kubernetes|k8s|helm"],
    ["Terraform", "DevOps", "terraform|infrastructure as code|iac|cloudformation"],
    ["Ansible", "DevOps", "ansible"],
    ["Jenkins", "DevOps", "jenkins"],
    ["GitHub Actions", "DevOps", "github actions"],
    ["GitLab CI", "DevOps", "gitlab(?: ci)?"],
    ["CI/CD", "DevOps", "ci ?/ ?cd|ci-cd|cicd|continuous integration|continuous (?:delivery|deployment)"],
    ["Linux", "DevOps", "linux|unix"],
    ["Nginx", "DevOps", "nginx"],
    ["Git", "DevOps", "git|github|version control"],
    ["Bitbucket", "DevOps", "bitbucket"],
    ["Monitoring", "DevOps", "observability|monitoring|prometheus|grafana|datadog|new relic|sentry"],
    ["Jest", "Testing", "jest"],
    ["Vitest", "Testing", "vitest"],
    ["Mocha", "Testing", "mocha|chai"],
    ["Cypress", "Testing", "cypress"],
    ["Playwright", "Testing", "playwright"],
    ["Selenium", "Testing", "selenium"],
    ["React Testing Library", "Testing", "react testing library|testing library|rtl"],
    ["Unit testing", "Testing", "unit test(?:s|ing)?|unit-test(?:s|ing)?"],
    ["Integration testing", "Testing", "integration test(?:s|ing)?"],
    ["E2E testing", "Testing", "e2e|end[- ]to[- ]end test(?:s|ing)?"],
    ["TDD", "Testing", "tdd|test[- ]driven"],
    ["Agile", "Practices", "agile"],
    ["Scrum", "Practices", "scrum|sprint planning"],
    ["Code review", "Practices", "code reviews?|peer reviews?"],
    ["Security", "Practices", "owasp|web security|application security|secure coding|security best practices"],
    ["Performance optimization", "Practices", "performance (?:optimi[sz]ation|tuning)|optimi[sz]e performance"],
    ["LLMs", "AI", "llms?|large language models?|gpt|openai|anthropic|claude|gemini"],
    ["LangChain", "AI", "langchain|llamaindex"],
    ["RAG", "AI", "rag|retrieval[- ]augmented"],
    ["Prompt engineering", "AI", "prompt engineering"],
    ["Machine learning", "AI", "machine learning|ml|deep learning"],
    ["Generative AI", "AI", "generative ai|gen ?ai"],
    ["AI-assisted development", "AI", "copilot|cursor|ai[- ]assisted|ai pair programming|claude code"],
    ["Vector databases", "AI", "vector (?:db|databases?|search)|pinecone|pgvector|weaviate"],
    ["Data pipelines", "Data", "etl|data pipelines?|airflow|spark|kafka streams"],
    ["Pandas", "Data", "pandas|numpy"]
  ];

  const compiled = new Map();
  function rxFor(entry) {
    const [name, , pat] = entry;
    if (compiled.has(name)) return compiled.get(name);
    const rx = pat instanceof RegExp
      ? new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g")
      : new RegExp("(?<![a-z0-9])(?:" + pat + ")(?![a-z0-9])", "gi");
    compiled.set(name, rx);
    return rx;
  }
  const count = (rx, text) => { rx.lastIndex = 0; const m = (text || "").match(rx); return m ? m.length : 0; };

  function dict(custom) {
    const extra = (custom || []).filter(Boolean).map((n) => [n, "Custom", JA.esc(n.toLowerCase())]);
    return DICT.concat(extra);
  }

  // Skills named in a piece of text (used to read questions like "years of experience with React").
  JA.skillsIn = (text, custom) => dict(custom).filter((e) => count(rxFor(e), text) > 0).map((e) => e[0]);

  const REQ = /requirement|qualification|must.?have|what (you'?ll|you will) need|what we('re| are) looking for|who you are|skills? (required|needed)|you (have|bring|should have)|eligibility|desired (profile|candidate|skills)|key skills|technical skills|experience required|about you|skills (&|and) experience|skills required|mandatory/;
  const PREF = /nice.?to.?have|good.?to.?have|preferred|bonus|plus points?|desirable|added advantage|it'?s a plus|would be a plus|optional skills/;
  const GEN = /responsibilit|what you'?ll do|what you will do|role overview|about the role|the role|your role|job description|day to day|key result/;
  const SKIP = /benefits|perks|why join|about (us|the company|company)|what we offer|equal opportunity|our values|compensation & benefits/;

  function sections(text) {
    const out = { required: [], preferred: [], general: [] };
    let cur = "general";
    for (const raw of (text || "").split(/\n+/)) {
      const line = raw.trim();
      if (!line) continue;
      const low = line.toLowerCase();
      const heading = line.length <= 60 || /:$/.test(line);
      if (heading && line.length <= 90) {
        if (SKIP.test(low)) { cur = "skip"; continue; }
        if (PREF.test(low)) { cur = "preferred"; if (line.length <= 45 || /:$/.test(line)) continue; }
        else if (REQ.test(low)) { cur = "required"; if (line.length <= 45 || /:$/.test(line)) continue; }
        else if (GEN.test(low)) { cur = "general"; continue; }
      }
      let sec = cur;
      if (sec !== "skip" && /\b(nice to have|good to have|is a plus|a plus|preferred|bonus|optional)\b/.test(low)) sec = "preferred";
      if (sec !== "skip") out[sec].push(line);
    }
    return out;
  }

  function extractYears(t) {
    const rx = /(\d{1,2}(?:\.\d)?)\s*(?:\+|plus)?\s*(?:(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?)\s*)?\+?\s*(?:years?|yrs?)/gi;
    let m, first = null;
    while ((m = rx.exec(t || ""))) {
      const ctx = t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).toLowerCase();
      if (/experience|\bexp\b/.test(ctx)) return m[0].replace(/\s+/g, " ").trim();
      if (!first) first = m[0].replace(/\s+/g, " ").trim();
    }
    return first;
  }

  function extractSalary(t) {
    const m = (t || "").match(/(?:₹|rs\.?|inr)\s*[\d,.]+\s*(?:lpa|lakhs?|lacs?|l|k)?\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*[\d,.]+\s*(?:lpa|lakhs?|lacs?|l\b|cr|k)?(?:\s*(?:per annum|p\.?a\.?|\/year|per year))?|[\d.]+\s*(?:-|–|to)\s*[\d.]+\s*(?:lpa|lakhs?|lacs?)/i);
    return m ? m[0].trim() : null;
  }

  JA.analyzeJD = function (jd, resumeText, knownSkills, custom) {
    const secs = sections(jd);
    const joined = { required: secs.required.join("\n"), preferred: secs.preferred.join("\n"), general: secs.general.join("\n") };
    const known = new Set((knownSkills || []).map((s) => s.toLowerCase()));
    const W = { required: 3, general: 2, preferred: 1 };
    const found = [];
    for (const e of dict(custom)) {
      const rx = rxFor(e);
      const c = { required: count(rx, joined.required), general: count(rx, joined.general), preferred: count(rx, joined.preferred) };
      const total = c.required + c.general + c.preferred;
      if (!total) continue;
      const section = c.required ? "required" : c.general ? "general" : "preferred";
      const inResume = count(rx, resumeText) > 0;
      found.push({ name: e[0], cat: e[1], count: total, section, inResume, onRecord: inResume || known.has(e[0].toLowerCase()) });
    }
    let tot = 0, got = 0;
    for (const f of found) { tot += W[f.section]; if (f.inResume) got += W[f.section]; }
    const order = (a, b) => W[b.section] - W[a.section] || b.count - a.count;
    const missing = found.filter((f) => !f.inResume).sort(order);
    return {
      score: tot ? Math.round((got * 100) / tot) : null,
      found,
      matched: found.filter((f) => f.inResume).sort(order),
      missingOnRecord: missing.filter((f) => f.onRecord),
      missingNew: missing.filter((f) => !f.onRecord),
      years: extractYears(jd),
      salary: extractSalary(jd)
    };
  };

  JA._kwInternals = { sections, extractYears, extractSalary, DICT };
})();
