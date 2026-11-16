from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import date, timedelta
import csv, hashlib, os, tempfile
base=Path(__file__).resolve().parents[2]; paths=','.join(str(base/x) for x in ['social-job-collector','job-autopilot'])
def extension_id(path): return ''.join(chr(97+int(x,16)) for x in hashlib.sha256(str(path).encode()).hexdigest()[:32])
auto=extension_id(base/'job-autopilot');collector=extension_id(base/'social-job-collector')
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='social-test-'), executable_path=os.environ['CHROME_FOR_TESTING'],headless=True,ignore_default_args=['--disable-extensions'],args=['--no-sandbox','--disable-extensions-except='+paths,'--load-extension='+paths])
 page=c.new_page(); page.goto(f'chrome-extension://{auto}/options.html'); page.wait_for_selector('#collectorId'); page.wait_for_timeout(1500)
 print('autopilot id shown', page.locator('#autopilotId').inner_text()); page.locator('#collectorId').fill(collector);page.locator('#saveCollector').click();page.wait_for_timeout(500);print('save:',page.locator('#collectorStatus').inner_text()); assert 'saved' in page.locator('#collectorStatus').inner_text()
 social=c.new_page();social.goto(f'chrome-extension://{collector}/social.html');social.wait_for_selector('#connect'); social.locator('#autopilotId').fill(auto); social.locator('#connect').click(); social.wait_for_timeout(1200); print('connection:',social.locator('#status').inner_text()); assert 'Connected.' in social.locator('#status').inner_text()
 c.route('https://www.linkedin.com/search/results/content/**',lambda r:r.fulfill(status=200,content_type='text/html',body='''<html><body><section><h2>Feed post</h2><div><a href="https://www.linkedin.com/in/test-recruiter">Test Recruiter</a><br>Talent Acquisition Manager<br>now<br>We are hiring a Full Stack Engineer with 2-4 years experience. Apply now. <a href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.example.com%2Froles%2F42">Apply on Job</a></div><button aria-label="Open control menu for post by a recruiter">...</button></section></body></html>'''))
 job=c.new_page();job.goto('https://www.linkedin.com/search/results/content/?keywords=hiring');social.bring_to_front();social.locator('#refresh').click();social.wait_for_timeout(500); print('tabs:', social.locator('#tabs').inner_text());social.locator('#to').fill((date.today()+timedelta(days=1)).isoformat());social.locator('#from').fill((date.today()+timedelta(days=1)).isoformat());social.locator('#scan').click();social.wait_for_timeout(500);assert '0 new links' in social.locator('#status').inner_text();social.locator('#from').fill(date.today().isoformat());social.locator('#to').fill(date.today().isoformat());social.locator('#scan').click();social.wait_for_timeout(1000); print('scan:',social.locator('#status').inner_text());print('row:',social.locator('#rows').inner_text()[:300]);assert '1 new links' in social.locator('#status').inner_text(); assert 'jobs.example.com/roles/42' in social.locator('#rows').inner_text()
 with social.expect_download() as download: social.locator('#export').click()
 with open(download.value.path(),newline='') as f: exported=list(csv.DictReader(f))
 assert len(exported)==1 and exported[0]['job_url']=='https://jobs.example.com/roles/42'
 assert exported[0]['person_name']=='Test Recruiter' and exported[0]['person_title']=='Talent Acquisition Manager'
 print('CSV export: one unique lead with poster name and title')
 social.locator('#scan').click();social.wait_for_timeout(500);print('repeat scan:',social.locator('#status').inner_text());assert '0 new links' in social.locator('#status').inner_text()
 c.route('https://jobs.example.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body='<html><body>Job review fixture</body></html>'))
 with c.expect_page() as opened: social.get_by_role('button',name='Open job in Autopilot').click()
 target=opened.value;target.wait_for_url('https://jobs.example.com/**');print('handoff:',target.url)
 worker=next(w for w in c.service_workers if auto in w.url);result=worker.evaluate('async () => {const x=await chrome.storage.session.get(null); return Object.values(x).some(v => v && v.socialReview === true)}'); print('review mode:', result);assert result

 fixtures = [
  ('https://x.com/search?q=hiring', '<article data-testid="tweet"><div data-testid="User-Name"><a href="/recruiter">X Recruiter</a></div><time datetime="'+date.today().isoformat()+'"></time>Hiring backend engineer, 2-4 years <a href="https://jobs.example.com/roles/x">Apply</a></article>'),
  ('https://www.reddit.com/search/?q=hiring', '<shreddit-post author="reddit_recruiter"><time datetime="'+date.today().isoformat()+'"></time>Hiring frontend engineer, 2-4 years <a href="https://jobs.example.com/roles/reddit">Apply</a></shreddit-post>'),
  ('https://www.pinterest.com/search/pins/?q=hiring', '<div data-test-id="pin"><span data-test-id="pinner-name">Pinterest Recruiter</span><time datetime="'+date.today().isoformat()+'"></time>Hiring full stack engineer, 2-4 years <a href="https://jobs.example.com/roles/pinterest">Apply</a></div>')
 ]
 for url,html in fixtures:
  c.route(url,lambda r,request,body=html:r.fulfill(status=200,content_type='text/html',body='<html><body>'+body+'</body></html>'))
  source=c.new_page();source.goto(url)
  social.bring_to_front();social.locator('#refresh').click();social.wait_for_timeout(200)
  tabid=social.evaluate('async url => (await chrome.tabs.query({})).find(t=>t.url===url).id',url)
  social.locator('#tabs').select_option(str(tabid));social.locator('#scan').click();social.wait_for_timeout(300)
  assert '1 new links' in social.locator('#status').inner_text(),social.locator('#status').inner_text()
  print('Platform fixture passed:',url.split('/')[2])
 c.close(); print('PASS real extensions, pair, scan, dedupe and handoff')
