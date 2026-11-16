/* Shared matching and CSV helpers. */
const Social = (() => {
  function key(raw) {
    try { const u = new URL(raw); if (!/^https?:$/.test(u.protocol)) return ''; u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^(utm_.+|trk|trackingId|ref|source|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k); u.hostname = u.hostname.toLowerCase().replace(/^www\./, ''); u.pathname = u.pathname.replace(/\/$/, '') || '/'; return u.href; } catch { return ''; }
  }
  function date(raw, now = new Date()) {
    if (!raw) return '';
    const s = raw.trim(); if (/^now$/i.test(s)) return localDate(now); const relative = s.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|mo|years?|[mhdwy])\b/i);
    if (relative) { const unit = relative[2].toLowerCase(); const days = unit.startsWith('y') ? 365 : unit.startsWith('mo') ? 30 : unit.startsWith('w') ? 7 : unit.startsWith('d') ? 1 : 0; const d = new Date(now); d.setDate(d.getDate() - Number(relative[1]) * days); return localDate(d); }
    const d = new Date(s); return Number.isNaN(d.valueOf()) ? '' : localDate(d);
  }
  function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function relevant(s) { return /\b(hir(?:e|es|ed|ing)|openings?|vacanc(?:y|ies)|recruit(?:ing|ment)?|apply|join (?:our|my|the) team|looking for)\b/i.test(s) && /\b(full[ -]?stack|front[ -]?end|back[ -]?end|sde(?:\s*[- ]?\s*(?:i{1,2}|2))?|software (?:development |developer |engineer)|react(?:\.js)?|node(?:\.js)?|web (?:engineer|developer)|product engineer)\b/i.test(s); }
  function experience(text) {
    const t=text.replace(/[–—]/g,'-');
    const pattern=/\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/gi;
    const ranges=[...t.matchAll(pattern)];
    const singles=[...t.replace(pattern,'').matchAll(/\b(\d+(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?)\b/gi)];
    if(!ranges.length && !singles.length) return '';
    if(ranges.some(m=>+m[1]<2 || +m[2]>4 || +m[1]>+m[2]) || singles.some(m=>+m[1]<2 || +m[1]>4 || m[2])) return '';
    return [...ranges,...singles].map(m=>m[0]).join('; ');
  }
  function context(text, label, href) {
    const needle=(label || '').replace(/^Open /i,'').trim();
    let i=needle ? text.indexOf(needle) : -1;
    if(i<0) i=text.indexOf(href);
    if(i<0) return text;
    const before=text.slice(Math.max(0,i-900),i);
    const boundaries=[...before.matchAll(/\b(?:company|role|position|job title)\s*[:：]/gi)];
    const start=boundaries.length ? boundaries.at(-1).index : Math.max(0,before.lastIndexOf('http'));
    return before.slice(start)+text.slice(i,i+(needle || href).length);
  }
  function matches(lead,from,to) { return !!lead.posted && (!from || lead.posted>=from) && (!to || lead.posted<=to) && relevant('hiring '+(lead.jobContext || context(lead.text,lead.url,lead.url))) && !!experience(lead.jobContext || context(lead.text,lead.url,lead.url)); }
  function searches(from,to) {
    const q='hiring (frontend OR "full stack" OR backend) "2-4 years"';
    const next=new Date(to+'T12:00:00');next.setDate(next.getDate()+1);
    return {
      linkedin:'https://www.linkedin.com/search/results/content/?keywords='+encodeURIComponent(q)+'&sortBy=%22date_posted%22',
      reddit:'https://www.reddit.com/search/?q='+encodeURIComponent(q)+'&sort=new',
      x:'https://x.com/search?q='+encodeURIComponent(q+' since:'+from+' until:'+localDate(next))+'&f=live',
      pinterest:'https://www.pinterest.com/search/pins/?q='+encodeURIComponent(q)
    };
  }
  function csv(text) { const rows=[]; let row=[], field='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"' && text[i+1]==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c;} else if(c==='"' && !field) quoted=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field.replace(/\r$/, ''));rows.push(row);row=[];field='';} else field+=c;} if(quoted) throw Error('Unclosed quoted field in CSV'); if(field || row.length){row.push(field.replace(/\r$/, ''));rows.push(row);} return rows; }
  function encode(rows) { return rows.map(r => r.map(v => '"'+String(v ?? '').replace(/"/g,'""')+'"').join(',')).join('\r\n'); }
  return {key,date,relevant,experience,context,matches,searches,csv,encode};
})();
if (typeof module !== 'undefined') module.exports = Social;
