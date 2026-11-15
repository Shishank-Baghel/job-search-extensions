# Job Autopilot

A Chrome extension for reviewing job descriptions, preparing résumés and assisting with application forms. Load this folder as an unpacked extension at `chrome://extensions`. In Settings, enter your own verified profile and upload your résumé. There is no bundled personal résumé or profile in this public copy.

Automatic submission, account creation, hands-free operation and résumé tailoring start disabled. Review the answer logic before enabling automation: some answers assume the original user's India and Delhi NCR circumstances and are not safe for a different person without modification. Review every answer against your own facts.

To connect the separate Social Job Lead Collector, follow its README. It opens collected leads in a review tab and checks application-log URLs for duplicates. The collector does not submit applications.

An optional native messaging helper can use Claude Code installed on your machine; see `native/install.sh`. It sends relevant profile and résumé data to the selected AI service when enabled. Extension data is stored in the local Chrome profile; the password template, if used, is stored unencrypted. Read sites' terms before using automation.
