/* Shared matching and CSV helpers. */
const Social = (() => {
  function key(raw) {
    try { const u = new URL(raw); if (!/^https?:$/.test(u.protocol)) return ''; u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^(utm_.+|trk|trackingId|ref|source|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k); u.hostname = u.hostname.toLowerCase().replace(/^www\./, ''); u.pathname = u.pathname.replace(/\/$/, '') || '/'; return u.href; } catch { return ''; }
  }
  function date(raw, now = new Date()) {
    if (!raw) return '';
    const s = raw.trim(); if (/^now$/i.test(s)) return localDate(now); const relative = s.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|[mhdwy])\b/i);
    if (relative) { const unit = relative[2].toLowerCase(); const days = unit.startsWith('y') ? 365 : unit.startsWith('mo') ? 30 : unit.startsWith('w') ? 7 : unit.startsWith('d') ? 1 : 0; const d = new Date(now); d.setDate(d.getDate() - Number(relative[1]) * days); return localDate(d); }
    const d = new Date(s); return Number.isNaN(d.valueOf()) ? '' : localDate(d);
  }
  function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function relevant(s) { return /\b(hir(?:e|es|ed|ing)|openings?|vacanc(?:y|ies)|recruit(?:ing|ment)?|apply|join (?:our|my|the) team|looking for)\b/i.test(s) && /\b(full[ -]?stack|front[ -]?end|back[ -]?end|sde(?:\s*[- ]?\s*(?:i{1,2}|2))?|software (?:development |developer |engineer)|react(?:\.js)?|node(?:\.js)?|web (?:engineer|developer)|product engineer)\b/i.test(s); }
  function csv(text) { const rows=[]; let row=[], field='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"' && text[i+1]==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c;} else if(c==='"' && !field) quoted=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field.replace(/\r$/, ''));rows.push(row);row=[];field='';} else field+=c;} if(quoted) throw Error('Unclosed quoted field in CSV'); if(field || row.length){row.push(field.replace(/\r$/, ''));rows.push(row);} return rows; }
  function encode(rows) { return rows.map(r => r.map(v => '"'+String(v ?? '').replace(/"/g,'""')+'"').join(',')).join('\r\n'); }
  return {key,date,relevant,csv,encode};
})();
if (typeof module !== 'undefined') module.exports = Social;
