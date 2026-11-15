// Shared helpers. All content scripts share one isolated world, so they hang off globalThis.JA.
(() => {
  const JA = (globalThis.JA = globalThis.JA || {});

  JA.norm = (s) => (s || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\(required\)|\brequired\b|\(optional\)|\*/g, " ")
    .replace(/[_:?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  JA.esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  JA.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  JA.pace = (cfg) => {
    const [a, b] = (cfg && cfg.settings && cfg.settings.stepDelayMs) || [700, 1600];
    return JA.sleep(a + Math.random() * Math.max(0, b - a));
  };

  JA.text = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();

  JA.visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  // Radios/checkboxes are often styled as invisible inputs behind a visible label.
  JA.visibleChoice = (el) => {
    if (JA.visible(el) && getComputedStyle(el).opacity !== "0") return true;
    const lab = (el.labels && el.labels[0]) || el.closest("label");
    if (lab && JA.visible(lab)) return true;
    return !!(el.parentElement && JA.visible(el.parentElement));
  };

  JA.setValue = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    try { el.focus({ preventScroll: true }); } catch (_) {}
    setter.call(el, v); // native setter, so React/Vue controlled inputs see the change
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur"));
  };

  // Types like a person would: the browser's own editing command fires trusted beforeinput/input
  // events, which custom widgets (Workday date sections, masked inputs) accept when a plain
  // value assignment is ignored. Falls back to setValue.
  JA.typeInto = (el, v) => {
    v = String(v);
    try { el.focus({ preventScroll: true }); } catch (_) {}
    try { if (el.select) el.select(); } catch (_) {}
    let ok = false;
    try { ok = document.execCommand("insertText", false, v); } catch (_) {}
    if (!ok || (el.value !== undefined && el.value !== v && !String(el.value).endsWith(v))) {
      JA.setValue(el, v);
      return;
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur"));
  };

  // Segmented date boxes (Workday "MM / YYYY" spinbuttons) ignore plain value assignment and often
  // react only to key presses. Read back what the widget shows, not just input.value.
  JA.dateShown = (el) => {
    const disp = el.parentElement && el.parentElement.querySelector("[data-automation-id$='-display']");
    const own = (el.getAttribute("data-automation-id") || "").replace(/-input$/, "-display");
    const d = (own && el.parentElement && el.parentElement.querySelector(`[data-automation-id='${own}']`)) || disp;
    return [el.getAttribute("aria-valuenow"), el.getAttribute("aria-valuetext"), d && JA.text(d), el.value];
  };
  const committed = (el, v) => {
    const n = parseInt(v, 10);
    const [now, txt, disp, val] = JA.dateShown(el);
    if (now != null || txt != null || disp) return [now, txt, disp].some((x) => x != null && x !== "" && parseInt(x, 10) === n);
    return parseInt(val, 10) === n;
  };
  JA.typeKeys = (el, text) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    for (const ch of String(text)) {
      const kc = ch.toUpperCase().charCodeAt(0);
      const o = { key: ch, code: /\d/.test(ch) ? "Digit" + ch : "Key" + ch.toUpperCase(), keyCode: kc, which: kc, charCode: kc, bubbles: true, cancelable: true, composed: true };
      const free = el.dispatchEvent(new KeyboardEvent("keydown", o));
      el.dispatchEvent(new KeyboardEvent("keypress", o));
      if (free && el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: ch, bubbles: true, cancelable: true, composed: true }))) {
        setter.call(el, (el.value || "") + ch);
        el.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: ch, bubbles: true, composed: true }));
      }
      el.dispatchEvent(new KeyboardEvent("keyup", o));
    }
  };
  // Returns true once the widget shows the value. Tries key presses, the editing command, then a plain set.
  JA.fillDatePart = async (el, v) => {
    const disp = el.parentElement && el.parentElement.querySelector("[data-automation-id$='-display']");
    if (disp && JA.visible(disp)) JA.click(disp);
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const clear = () => { try { if (el.select) el.select(); } catch (_) {} JA.key(el, "Backspace"); };
    const tries = [() => JA.typeKeys(el, v), () => { clear(); JA.typeInto(el, v); }, () => JA.setValue(el, v)];
    for (const t of tries) {
      if (committed(el, v)) return true;
      t();
      await JA.sleep(180);
    }
    if (committed(el, v)) return true;
    el.dispatchEvent(new FocusEvent("blur"));
    return false;
  };

  // querySelectorAll that also looks inside open shadow roots (SmartRecruiters and other
  // web-component forms). Hosts are cached briefly: walking the whole tree is the slow part.
  let hostCache = { at: 0, root: null, hosts: [] };
  function shadowHosts(root) {
    if (hostCache.root === root && Date.now() - hostCache.at < 1200) return hostCache.hosts;
    const hosts = [];
    const walk = (r) => { for (const e of r.querySelectorAll("*")) if (e.shadowRoot && e.id !== "ja-panel-host") { hosts.push(e); walk(e.shadowRoot); } };
    try { walk(root); } catch (_) {}
    hostCache = { at: Date.now(), root, hosts };
    return hosts;
  }
  JA.deepAll = (root, sel) => {
    root = root || document;
    const out = [...root.querySelectorAll(sel)];
    for (const h of shadowHosts(root)) out.push(...h.shadowRoot.querySelectorAll(sel));
    return out;
  };

  JA.setEditable = (el, v) => {
    el.focus();
    el.textContent = v;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: v, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  JA.click = (el) => {
    if (!el) return;
    try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (_) {}
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.click();
  };

  JA.key = (el, key) => {
    const o = { key, code: key, bubbles: true, cancelable: true, keyCode: key === "Enter" ? 13 : key === "Escape" ? 27 : key === "ArrowDown" ? 40 : 0 };
    el.dispatchEvent(new KeyboardEvent("keydown", o));
    el.dispatchEvent(new KeyboardEvent("keyup", o));
  };

  // Closes an open dropdown list. Inside an application pop-up (Ceipal/PrimeNG, LinkedIn) Escape
  // closes the whole pop-up, so there the field just loses focus instead.
  const MODAL = "[role=dialog], [aria-modal='true'], dialog, .p-dialog, .modal, .artdeco-modal";
  JA.closeList = (el) => {
    if (el.closest && el.closest(MODAL)) {
      try { el.blur(); } catch (_) {}
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      return;
    }
    JA.key(el, "Escape");
  };

  JA.waitFor = async (fn, timeout = 8000, step = 200) => {
    const end = Date.now() + timeout;
    for (;;) {
      let v = null;
      try { v = fn(); } catch (_) {}
      if (v) return v;
      if (Date.now() > end) return null;
      await JA.sleep(step);
    }
  };

  JA.btnText = (b) => (JA.text(b) || b.value || b.getAttribute("aria-label") || "").trim();

  JA.buttons = (root) => JA.deepAll(root || document, 'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]')
    .filter((b) => JA.visible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true");

  JA.findButton = (root, rx) => JA.buttons(root).find((b) => rx.test(JA.btnText(b)));

  JA.send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r); });
    } catch (_) { resolve(null); }
  });

  // Page text including open shadow roots (confirmation messages of web-component forms live there).
  JA.bodyText = () => {
    let t = document.body ? document.body.innerText || "" : "";
    if (t.length < 60000) for (const h of shadowHosts(document)) {
      for (const c of h.shadowRoot.children) if (c.tagName !== "STYLE" && c.tagName !== "SCRIPT") t += "\n" + (c.innerText || c.textContent || "");
      if (t.length > 60000) break;
    }
    return t.slice(0, 60000);
  };

  JA.today = () => new Date().toISOString().slice(0, 10);
})();
