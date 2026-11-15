# Social Job Lead Collector

A separate Chrome extension that scans posts already loaded in a LinkedIn, X/Twitter or Reddit tab for hiring and full-stack, frontend, backend and software-engineer terms. It saves job-like links locally, filters by an optional inclusive publication-date range, imports prior CSV URLs for deduplication, exports its leads as CSV, and connects to Job Autopilot.

## Install and connect
1. In `chrome://extensions`, enable Developer mode. Choose **Load unpacked** and select this `social-job-collector` folder. Keep Job Autopilot installed as a separate extension, then reload Job Autopilot so its updated connection code is active.
2. Open the collector from its toolbar icon (or its extension details → Extension options). Copy the displayed collector ID.
3. In Job Autopilot settings, paste that ID under **Social job collector connection** and press **Save collector connection**. Copy the Job Autopilot ID shown there.
4. Paste the Autopilot ID into the collector and press **Connect and sync**. This also imports social leads saved in the earlier combined version, if any. Only the paired collector can request log URLs or open a review tab; resume and profile data are not shared.

## Find leads
Open a social search/feed in another tab, scroll to load posts, choose it in the collector and scan. Enter dates to filter by publication date; posts without a readable date are excluded when dates are set. Relative dates are approximate. The scan checks previously collected URLs, imported CSV URLs, and fresh URLs from Job Autopilot's application log. Import a CSV with a `url`, `applyUrl`, `apply_url`, `job_url`, `link` or `post_url` column. Export downloads a new CSV with all stored leads; it does not edit an existing file.

Click **Open job in Autopilot** to open a lead in a new tab with hands-free disabled. Verify the employer, location, experience, compensation and that the role remains open; independently review the tailored application before starting Autopilot. It does not automatically submit leads: the existing Autopilot batch filters do not verify all those criteria.

The collector only scans currently loaded posts, cannot reliably identify the poster's role, and may miss links or dates when a site changes its layout. Different URLs for the same job may remain duplicates. LinkedIn prohibits automated activity and may restrict accounts; stop at warnings or verification prompts.
