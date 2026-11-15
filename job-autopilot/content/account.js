// Career-site accounts: create one (or sign in) with your email and the password template.
// Stops — never works around — CAPTCHAs, OTPs and email-verification steps.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  const pwFields = () => [...document.querySelectorAll("input[type=password]")].filter((e) => JA.visible(e) && !JA.inPanel(e) && !JA.isHoneypot(e, JA.labelOf(e)));
  const SIGNUP_BTN = /\b(create (an |your |my )?(account|profile)|sign ?up|register( now)?|join( now)?|create)\b/i;
  const SIGNIN_BTN = /^(sign ?in|log ?in|login|continue|next|submit)\b/i;
  const NOT_FORM_BTN = /google|linkedin|facebook|apple|microsoft|indeed|forgot|reset|privacy|terms/i;
  // Only real error messages count — not the password rules a sign-up page always shows.
  const errorText = () => JA.norm([...document.querySelectorAll("[role=alert], [aria-live=assertive], [aria-live=polite], [class*='error' i], [class*='invalid' i], [data-automation-id='errorMessage'], [data-automation-id='errorBanner']")]
    .filter((e) => JA.visible(e) && !JA.inPanel(e)).map(JA.text).join(" | ").slice(0, 3000));
  const SIGNUP_LINK = /create (an |your )?account|sign ?up|register|new (user|candidate)|don'?t have an account/i;
  const SIGNIN_LINK = /^(sign ?in|log ?in|already have an account.*|existing (user|candidate).*)$/i;

  JA.passwordFor = (token, template) => {
    const t = String(token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cap = t ? t[0].toUpperCase() + t.slice(1) : "";
    return String(template || "")
      .replace(/\{company\}/g, t).replace(/\{Company\}/g, cap).replace(/\{COMPANY\}/g, t.toUpperCase())
      .replace(/\{c\}/g, t.slice(0, 1)).replace(/\{C\}/g, t.slice(0, 1).toUpperCase());
  };

  JA.accountPage = () => {
    const p = pwFields();
    if (!p.length) return null;
    const btns = JA.buttons(document).map(JA.btnText);
    if (p.length >= 2) return "signup";
    if (btns.some((b) => SIGNIN_BTN.test(b) && !/continue|next/i.test(b))) return "signin";
    if (btns.some((b) => SIGNUP_BTN.test(b))) return "signup";
    return "signin";
  };

  function clickWorkday(id) {
    const b = document.querySelector(`[data-automation-id='${id}']`);
    if (!b) return false;
    const overlay = b.parentElement && b.parentElement.querySelector("[data-automation-id='click_filter']");
    JA.click(overlay || b);
    return true;
  }

  function linkMatching(rx) {
    return [...document.querySelectorAll("a, button, [role=button], [data-automation-id='createAccountLink'], [data-automation-id='signInLink']")]
      .find((a) => JA.visible(a) && !JA.inPanel(a) && rx.test(JA.btnText(a)));
  }

  // Returns {again:true} to re-run the loop, or {stop:"reason"}.
  JA.handleAccount = async function (cfg, ctx, log) {
    const s = cfg.settings;
    if (!s.autoAccount) return { stop: "This site wants you to sign in. Automatic accounts are off in Settings." };
    if (!s.passwordTemplate) return { stop: "Add your password template on the extension's Settings page first." };
    const host = location.hostname;
    const acct = (cfg.accounts || {})[host];
    const token = (acct && acct.company) || ctx.companyToken;
    if (!token) return { stop: "Couldn't tell the company name for the password. Type it in the panel's Company box." };
    ctx.accountTries = (ctx.accountTries || 0) + 1;
    if (ctx.accountTries > 4) return { stop: "Account step keeps repeating. Please finish signing in yourself, then press Auto-apply again." };
    const kind = JA.accountPage();
    const pass = JA.passwordFor(token, s.passwordTemplate);

    if (kind === "signin" && !acct && !ctx.triedCreate) {
      ctx.triedCreate = true;
      const link = document.querySelector("[data-automation-id='createAccountLink']") || linkMatching(SIGNUP_LINK);
      if (link) { log(`New site: opening "Create account" (company: ${token})`); JA.click(link); await JA.sleep(2200); return { again: true }; }
    }

    const texty = [...document.querySelectorAll("input:not([type]), input[type=email], input[type=text], input[type=tel]")].filter((e) => JA.visible(e) && !JA.inPanel(e) && !JA.isHoneypot(e, JA.labelOf(e)));
    const email = texty.find((e) => e.type === "email" || /email|username/.test((e.getAttribute("autocomplete") || "") + " " + (e.getAttribute("data-automation-id") || "") + " " + e.name + " " + e.id))
      || texty.find((e) => /e-?mail|user ?name|user ?id|login id/i.test(JA.labelOf(e)));
    if (email && email.value.trim().toLowerCase() !== cfg.profile.email.toLowerCase()) JA.setValue(email, cfg.profile.email);
    // a sign-up form may also ask for name / phone / confirm-email: fill what we know
    for (const e of texty) {
      if (e === email || e.value) continue;
      const l = JA.norm([JA.labelOf(e), e.name, e.id, e.autocomplete].join(" "));
      const v = /confirm.*e-?mail|e-?mail.*(again|confirm)|retype.*e-?mail/.test(l) ? cfg.profile.email : /first ?name|given name/.test(l) ? cfg.profile.firstName
        : /last ?name|surname|family name/.test(l) ? cfg.profile.lastName : /country.?code|tel-country-code|dial.?code|calling.?code|phone.?prefix|mobile.?prefix/.test(l) ? cfg.profile.phoneCountryCode : /phone|mobile|tel-national/.test(l) ? cfg.profile.phone : null;
      if (v) JA.setValue(e, v);
    }
    for (const e of document.querySelectorAll("select")) {
      if (!JA.visible(e) || e.disabled || e.value) continue;
      const l = JA.norm([JA.labelOf(e), e.name, e.id, e.autocomplete].join(" "));
      if (!/country.?code|dial.?code|calling.?code|phone.?country|mobile.?country|phone.?prefix|mobile.?prefix/.test(l)) continue;
      const want = JA.resolve({ kind: "select", label: l, match: l, options: [...e.options].map((o) => o.text) }, cfg, ctx);
      const i = want ? JA.chooseOption([...e.options].map((o) => o.text), want) : -1;
      if (i >= 0) JA.setValue(e, e.options[i].value);
    }
    for (const p of pwFields()) JA.setValue(p, pass);
    for (const cb of [...document.querySelectorAll("input[type=checkbox]")].filter((c) => JA.visibleChoice(c) && !c.checked && !JA.inPanel(c))) {
      const t = JA.norm(JA.labelOf(cb) + " " + (cb.getAttribute("data-automation-id") || ""));
      if ((JA.isConsent(t) || /createaccountcheckbox/.test(t)) && !JA.isMarketing(t)) JA.click((cb.labels && cb.labels[0]) || cb);
    }
    await JA.sleep(400);
    const block = JA.blocker();
    if (block) return { stop: block + " — please complete it, then press Auto-apply again." };

    // the button that submits the same form as the password field
    const pwForm = (pwFields()[0] || {}).form;
    const pick = (rx) => {
      const pool = JA.buttons(pwForm || document).concat(pwForm ? JA.buttons(document) : []).filter((b) => !NOT_FORM_BTN.test(JA.btnText(b)) && !JA.inPanel(b));
      return pool.find((b) => rx.test(JA.btnText(b))) || (pwForm && pool.find((b) => pwForm.contains(b) && (b.type === "submit" || b.tagName === "INPUT")));
    };
    const before = errorText();
    if (kind === "signup") {
      log(`Creating account for ${cfg.profile.email} (company: ${token})`);
      if (!clickWorkday("createAccountSubmitButton")) {
        const b = pick(SIGNUP_BTN);
        if (!b) return { stop: "Filled the sign-up form but couldn't find its button. Click the Register / Create account button." };
        JA.click(b);
      }
    } else {
      log(`Signing in as ${cfg.profile.email} (company: ${token})`);
      if (!clickWorkday("signInSubmitButton")) {
        const b = pick(SIGNIN_BTN);
        if (!b) return { stop: "Filled the sign-in form but couldn't find its button. Click Sign in." };
        JA.click(b);
      }
    }
    // Wait for the outcome (new error, a verify/CAPTCHA step, or the form gone) rather than a fixed pause:
    // Workday's "account exists" error can take longer than 3.5 s, and a missed one got saved as a new account.
    const startUrl = location.href, firstPw = pwFields()[0];
    await JA.sleep(1500);
    await JA.waitFor(() => errorText() !== before || JA.blocker() || location.href !== startUrl || !firstPw || !firstPw.isConnected || !JA.visible(firstPw), 12000, 300);
    await JA.sleep(500);
    const errs = errorText();
    const page = errs !== before ? errs : "";
    if (/already (exists|registered|in use|have an account|been registered)|account with this email/.test(page) && kind === "signup") {
      log("An account already exists: switching to sign in with the same password.");
      await JA.send({ type: "saveAccount", host, company: token });
      const link = document.querySelector("[data-automation-id='signInLink']") || linkMatching(SIGNIN_LINK);
      if (link) { JA.click(link); await JA.sleep(2000); }
      return { again: true };
    }
    if (/(incorrect|invalid|wrong) (email|password|credentials|username)|(email|password) (is )?(incorrect|invalid)|unable to sign in|login failed/.test(page)) {
      if (ctx.justCreated === host) return { stop: `I created the account a moment ago, but the site refused the sign-in. Workday usually holds a new account until you verify it: open the "verify your account" email sent to ${cfg.profile.email}, click its link, then press Done — Continue. No email after a few minutes? This address probably had an account here already with another password: use "Forgot your password?" and set it to the template password.` };
      return { stop: `Sign-in failed with the template password for "${token}". Sign in yourself, or fix the Company box in the panel.` };
    }
    if (/password (must|should|requirements)|at least one (upper|lower|special|number|digit)|password is too (weak|short)/.test(page)) {
      return { stop: "The site rejected the password format. Adjust the template in Settings (many Workday sites need a capital letter, e.g. {Company})." };
    }
    if (kind === "signup") { ctx.justCreated = host; await JA.send({ type: "saveAccount", host, company: token }); }
    const after = JA.blocker();
    if (after) return { stop: after + " — please complete it, then press Auto-apply again." };
    return { again: true };
  };

  // Anything only you can do. Returns a short reason or null.
  JA.blocker = function () {
    for (const f of document.querySelectorAll("iframe")) {
      if (!JA.visible(f)) continue;
      const s = (f.src || "") + " " + (f.title || "");
      const r = f.getBoundingClientRect();
      if (f.closest(".grecaptcha-badge")) continue; // invisible reCAPTCHA badge
      if (/recaptcha\/(api2|enterprise)\/bframe|hcaptcha.*challenge|arkoselabs|funcaptcha|challenge/i.test(s) && r.width > 150 && r.height > 150) return "A CAPTCHA challenge appeared";
      if (/recaptcha\/(api2|enterprise)\/anchor/.test(s) && r.width > 150) {
        const resp = document.querySelector("textarea[name='g-recaptcha-response']");
        if (!resp || !resp.value) return "There's an \"I'm not a robot\" CAPTCHA";
      }
      if (/hcaptcha/.test(s) && r.width > 150 && r.height > 40) {
        const resp = document.querySelector("textarea[name='h-captcha-response']");
        if (!resp || !resp.value) return "There's an hCaptcha to solve";
      }
      if (/challenges\.cloudflare\.com/.test(s)) {
        const resp = document.querySelector("input[name='cf-turnstile-response']");
        if (!resp || !resp.value) return "There's a Cloudflare human check";
      }
    }
    const otp = [...document.querySelectorAll("input[autocomplete='one-time-code'], input[name*=otp i], input[id*=otp i]")].find((e) => JA.visible(e) && !JA.inPanel(e));
    if (otp) return "An OTP / verification code is needed";
    const t = JA.norm(JA.bodyText().slice(0, 30000));
    if (/(enter|type) (the )?(otp|verification code|security code|\d-character code|code (we )?sent)|verify your (email( address)?|account)|check your (email|inbox)|we('ve| have) sent (you )?(an? )?(email|code|link|otp)|activate your account|confirm your email (address )?(by|to (continue|activate|complete)|before|using|via|link)/.test(t)) return "The site wants an email verification / code";
    return null;
  };
})();
