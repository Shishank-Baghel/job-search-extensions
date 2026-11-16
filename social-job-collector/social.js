const $ = id => document.getElementById(id);
let leads = [], seen = [], autopilotId = '', appliedUrls = [];
const status = s => $('status').textContent = s;
async function tabs() {
  const all = await chrome.tabs.query({}); $('tabs').replaceChildren();
  for (const t of all.filter(t => /^https:\/\/(?:[\w-]+\.)?(?:linkedin\.com|x\.com|twitter\.com|reddit\.com|pinterest\.com)\//i.test(t.url || ''))) {
    const o = document.createElement('option'); o.value = t.id; o.textContent = t.title || t.url; $('tabs').append(o);
  }
}
function collect(host = location.hostname) {
  let cards = [...(host.includes('linkedin.com') ? document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"], .search-results__list > li') : host.includes('pinterest.com') ? document.querySelectorAll('[data-test-id=pin], [data-test-id=pinWrapper]') : host.includes('reddit.com') ? document.querySelectorAll('shreddit-post, article[data-testid="post-container"]') : document.querySelectorAll('article[data-testid="tweet"]'))];
  if (host.includes('linkedin.com') && !cards.length) {
    // shortcut: LinkedIn's newer feed uses changing classes; identify a post by its heading and action buttons until stable post attributes are available.
    cards = [...document.querySelectorAll('h2')].filter(h => h.textContent.trim() === 'Feed post').map(h => {
      let node = h.parentElement;
      while (node && node !== document.body) {
        if ([...node.querySelectorAll('h2')].filter(x => x.textContent.trim() === 'Feed post').length > 1) break;
        if ([...node.querySelectorAll('button')].some(b => /^(comment|repost)$/i.test((b.innerText || '').trim()) || /^open control menu for post by/i.test(b.getAttribute('aria-label') || ''))) return node;
        node = node.parentElement;
      }
      return null;
    }).filter(Boolean);
  }
  return [...cards].map(card => {
    const time = card.querySelector('time');
    const dateText = time?.getAttribute('datetime') || time?.getAttribute('title') || card.querySelector('.update-components-actor__sub-description')?.innerText || (card.innerText || '').slice(0, 500).match(/(?:^|\n)\s*(now|\d+\s*(?:m|h|d|w|mo|y))\s*(?:[•·]|$)/im)?.[1] || '';
    const links = [...card.querySelectorAll('a[href]')].map(a => ({href:a.href, label:(a.innerText || a.getAttribute('aria-label') || '').trim()}));
    const text=(card.innerText || '').slice(0,15000);
    const author=[...card.querySelectorAll('a[href*="/in/"]')].find(a=>(a.innerText || '').trim()) || card.querySelector('[data-testid="User-Name"] a, a[href*="/user/"], a[href*="/u/"], [data-test-id="pinner-name"]');
    const authorName=(author?.innerText || author?.getAttribute('aria-label') || card.getAttribute('author') || '').trim().replace(/\s*•.*$/,'');
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    const i=lines.findIndex(x=>authorName && x.includes(authorName));
    const after=i>=0 ? lines.slice(i+1,i+7).find(x=>x!==authorName && !/^(?:[•·]|\d(?:st|nd|rd)|verified|open to work|follow|connect)(?:\b|$)/i.test(x)) || '' : '';
    const authorTitle=host.includes('linkedin.com') ? (card.querySelector('.update-components-actor__description, .feed-shared-actor__description')?.innerText?.trim() || (/^(?:now|\d+\s*(?:m|h|d|w|mo|y)|[•·]|follow|connect)/i.test(after) ? '' : after)) : '';
    let postUrl=links.find(x=>/linkedin\.com\/(?:feed\/update|posts\/)|(?:x|twitter)\.com\/[^/]+\/status\/|reddit\.com\/r\/[^/]+\/comments\/|pinterest\.com\/pin\//i.test(x.href))?.href || '';
    const urn=card.getAttribute('data-urn') || '';
    if(!postUrl && /urn:li:activity:\d+/.test(urn)) postUrl='https://www.linkedin.com/feed/update/'+urn.match(/urn:li:activity:\d+/)[0]+'/';
    return {text,dateText:dateText || card.getAttribute('created-timestamp') || '',links,authorName,authorTitle,postUrl,platform:host};
  });
}
function jobLink(raw) {
  try { let u = new URL(raw); if (/linkedin\.com$/i.test(u.hostname) && /^\/safety\/go\/?$/.test(u.pathname)) u = new URL(u.searchParams.get('url')); if (!/^https?:$/.test(u.protocol)) return ''; if (/(^|\.)(x\.com|twitter\.com|reddit\.com|pinterest\.com|linkedin\.com)$/.test(u.hostname) && !/linkedin\.com$/.test(u.hostname)) return ''; if (/linkedin\.com$/.test(u.hostname) && !/\/jobs\/view\//.test(u.pathname)) return ''; return Social.key(u.href); } catch { return ''; }
}
async function save() { await chrome.storage.local.set({socialLeads:leads, socialSeen:seen}); }
function render() {
  $('rows').replaceChildren(); for (const lead of leads.filter(x=>Social.matches(x,$('from').value,$('to').value)).slice().reverse()) { const tr=document.createElement('tr'); const date=document.createElement('td'); date.textContent=lead.posted || 'Unknown'; const post=document.createElement('td'); const p=document.createElement('p'); p.textContent=lead.text; post.append(p); if(lead.postUrl){const a=document.createElement('a');a.href=lead.postUrl;a.target='_blank';a.rel='noopener';a.textContent='Open source post';post.append(a);} const job=document.createElement('td');const a=document.createElement('button');a.textContent='Open job in Autopilot';a.onclick=async()=>{try { if(!autopilotId) throw Error('Connect Job Autopilot first.'); const r=await chrome.runtime.sendMessage(autopilotId,{type:'socialOpen',url:lead.url});if(!r || r.error) throw Error(r?.error || 'no response'); } catch(e) { status('Could not open job: '+e.message); }};job.append(a, document.createTextNode(' '+lead.url));const person=document.createElement('td');person.textContent=[lead.authorName || 'Not displayed',lead.authorTitle || 'Title not displayed'].join(' — ');tr.append(date,person,post,job);$('rows').append(tr); }
}
$('refresh').onclick = tabs;
function dates(){const from=$('from').value,to=$('to').value;if(!from || !to || from>to) throw Error('Choose a valid start and end date.');return {from,to};}
for(const button of document.querySelectorAll('[data-search]')) button.onclick=async()=>{try{const {from,to}=dates();await chrome.tabs.create({url:Social.searches(from,to)[button.dataset.search]});}catch(e){status(e.message);}};
for(const id of ['from','to']) $(id).onchange=async()=>{await chrome.storage.local.set({socialDates:{from:$('from').value,to:$('to').value}});render();};
$('collectorId').textContent = chrome.runtime.id;
$('connect').onclick = async () => { try {
  const id=$('autopilotId').value.trim(); if(!/^[a-p]{32}$/.test(id)) throw Error('Enter the 32-letter Job Autopilot extension ID.');
  const result=await chrome.runtime.sendMessage(id,{type:'socialSync'}); if(!result || result.error) throw Error(result?.error || 'No response from Job Autopilot.');
  autopilotId=id; appliedUrls=result.urls || []; const keys=new Set(leads.map(x=>Social.key(x.url)));
  for(const lead of result.leads || []) if(Social.key(lead.url) && !keys.has(Social.key(lead.url))) { leads.push(lead); keys.add(Social.key(lead.url)); }
  seen=[...new Set([...seen,...(result.seen || [])])]; await chrome.storage.local.set({autopilotId,appliedUrls}); await save(); render(); status(`Connected. Synced ${appliedUrls.length} application-log URLs and earlier social leads.`);
} catch(e) { status('Connection failed: '+e.message); } };

$('scan').onclick = async () => { try {
  const tabId=Number($('tabs').value), from=$('from').value, to=$('to').value;
  dates();if(!tabId) throw Error('Open a supported social tab and refresh the list.'); if(from && to && from>to) throw Error('The start date must be before the end date.');
  if (autopilotId) { const sync=await chrome.runtime.sendMessage(autopilotId,{type:'socialSync'}); if(!sync || sync.error) throw Error(sync?.error || 'Autopilot did not respond.'); appliedUrls=sync.urls || []; await chrome.storage.local.set({appliedUrls}); }
  const [result]=await chrome.scripting.executeScript({target:{tabId},func:collect}); const cards=result.result || []; const existing=new Set([...seen,...leads.map(x=>Social.key(x.url))]); for(const u of appliedUrls) if(Social.key(u)) existing.add(Social.key(u)); let added=0, undated=0;
  for(const card of cards){ if(!Social.relevant(card.text)) continue; const posted=Social.date(card.dateText); if(!posted && (from || to)){undated++;continue;} if((from && posted<from)||(to && posted>to)) continue;
    const postUrl=card.postUrl || card.links.map(x=>x.href).find(u => /linkedin\.com\/(?:feed\/update|posts\/)|(?:x|twitter)\.com\/[^/]+\/status\/|reddit\.com\/r\/[^/]+\/comments\//i.test(u)) || '';
    for(const link of card.links){if(!/job|career|apply|hiring|vacanc|opening|greenhouse|lever\.co|ashbyhq|workday|myworkdayjobs|smartrecruiters|workable|recruitee|wellfound|lnkd\.in|t\.co/i.test(link.href + ' ' + link.label)) continue; const url=jobLink(link.href); const jobContext=Social.context(card.text,link.label,link.href); if(!url || existing.has(url) || !Social.relevant('hiring '+jobContext) || !Social.experience(jobContext)) continue; existing.add(url); leads.push({posted,postUrl:Social.key(postUrl),url,text:card.text,authorName:card.authorName || '',authorTitle:card.authorTitle || '',jobContext,experience:Social.experience(jobContext),platform:card.platform || ''}); added++;}
  } await save();render();status(`${cards.length} loaded posts scanned; ${added} new links added${undated ? `; ${undated} matching posts had no readable date` : ''}.`);
} catch(e){status('Scan failed: '+e.message);} };
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const rows=Social.csv(await f.text());if(!rows.length)throw Error('CSV is empty.');const headers=rows[0].map(x=>x.trim().toLowerCase().replace(/^\ufeff/,''));const indexes=headers.map((h,i)=>/^(url|applyurl|apply_url|job_url|job link|link|posturl|post_url)$/.test(h)?i:-1).filter(i=>i>=0);if(!indexes.length)throw Error('No URL column found. Expected url, applyUrl, job_url, link or post_url.');const keys=new Set(seen);for(const row of rows.slice(1))for(const i of indexes){const k=Social.key(row[i]);if(k)keys.add(k);}seen=[...keys];await save();status(`Imported ${seen.length} known URLs for duplicate checks.`);}catch(err){status('Import failed: '+err.message);}e.target.value='';};
$('export').onclick=()=>{try{const {from,to}=dates();const selected=leads.filter(x=>Social.matches(x,from,to));const data=Social.encode([['posted','platform','person_name','person_title','experience','post_url','job_url','job_post'],...selected.map(x=>[x.posted,x.platform,x.authorName,x.authorTitle,Social.experience(x.jobContext || Social.context(x.text,x.url,x.url)),x.postUrl,x.url,x.text])]);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));a.download='job-leads-'+from+'-to-'+to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);status('Exported '+selected.length+' matching leads.');}catch(e){status(e.message);}};
(async()=>{const s=await chrome.storage.local.get(['socialLeads','socialSeen','autopilotId','appliedUrls','socialDates']);const today=new Date();$('to').value=s.socialDates?.to || Social.date(today.toISOString());today.setDate(today.getDate()-7);$('from').value=s.socialDates?.from || Social.date(today.toISOString());leads=s.socialLeads||[];seen=s.socialSeen||[];autopilotId=s.autopilotId||'';appliedUrls=s.appliedUrls||[];$('autopilotId').value=autopilotId;render();await tabs();})();
