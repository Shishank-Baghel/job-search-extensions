(async () => {
  const tab = new URLSearchParams(location.search).get("tab");
  const r = await chrome.runtime.sendMessage({ type: "getResumeForTab", tabId: tab });
  if (!r) { document.getElementById("t").textContent = "No resume found for that tab."; return; }
  const bin = atob(r.b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  document.getElementById("f").src = url;
  document.getElementById("dl").href = url;
  const t = r.tailored;
  document.getElementById("t").textContent = t ? `Tailored resume — ${t.title || "job"}${t.company ? " · " + t.company : ""}` : `Resume — ${r.name}`;
  if (t) {
    document.getElementById("m").textContent = `${t.family} version · match ${t.scoreBefore}% → ${t.scoreAfter}%${t.savedAs ? " · saved to Downloads/" + t.savedAs : ""}`;
    const ul = document.createElement("ul");
    for (const c of t.changes || []) { const li = document.createElement("li"); li.textContent = c; ul.append(li); }
    document.getElementById("changes").append(ul);
  }
})();
