# Social Job Lead Collector

Choose a start and end publication date, open a search on LinkedIn, Reddit, X or Pinterest, scroll to load posts, then select that tab and scan. The collector runs locally on the loaded page, using your normal signed-in session where needed.

It keeps hiring posts matching frontend, full-stack, backend and related software-engineering terms with explicitly stated experience fully within 2–4 years. For example, 2–4 or exactly 3 years qualifies; 3–6, 2+ and unstated experience are skipped. This conservative text filter can miss good roles or reject multi-role posts; check the original post before applying.

Export downloads a CSV filtered to the chosen inclusive dates with columns: posted, platform, person_name, person_title, experience, post_url, job_url, job_post. Names and titles are collected only when displayed. Reddit, X and Pinterest usually do not display a professional title, so that field may be empty. Posts without readable dates are skipped. Pinterest pins often lack dates and direct job links and therefore may produce no leads. Relative dates are approximate.

Earlier leads and imported CSV URLs prevent repeat job links. Import a CSV with a url, job_url, apply_url, applyUrl, link or post_url column. Export contains all saved leads matching the selected filters, once per URL; an identical later export can still include previously exported rows. Different URLs for one job can remain duplicates. Existing leads lacking poster metadata retain blank fields unless collected again.

Load this folder via chrome://extensions → Developer mode → Load unpacked. Reload the extension after updates.

Optional Job Autopilot connection: copy the collector ID into Job Autopilot Settings → Social job collector connection → Save collector connection. Copy the displayed Autopilot ID back into the collector and connect. It checks application-log URLs and opens selected jobs in review tabs. CSV collection works without that connection.

The extension scans loaded posts only; it does not crawl all of social media. Searches use the dates directly on X and apply the date filter locally on every platform. Layout changes, login requirements and verification challenges may prevent collection. Stop at account warnings or challenges.

Validation: node tests/social.test.js and node tests/pairing.test.js. The tests/e2e.py browser test requires Playwright and CHROME_FOR_TESTING pointing to a Chrome for Testing executable. It loads both extensions and checks date exclusions, poster metadata, CSV export, repeated scans and review-tab handoff using controlled posts for all four platforms.
