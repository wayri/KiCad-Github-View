# Pocket KiView security safeguards

Security boundaries cover untrusted repository files, provider responses, credentials, the Android bridge, publication and hosted webhook processing. These controls reduce risk; they do not establish that the app is immune to attacks.

## Provider access and publication

- GitHub API requests use fixed HTTPS hosts. GitLab credentials are scoped to the selected HTTPS origin. Credential-bearing requests reject redirects; renamed repositories may require their canonical names.
- Native credentials use protected storage. Extension credentials use the encrypted credential vault. Imported HTML is inert and cannot receive the native host bridge.
- Publication verifies the provider, host, repository, permissions and configured repository comment policy. Private screenshot safeguards and exact-source anchors remain enforced.
- Durable publication and screenshot receipts prevent automatic retries after uncertain outcomes. A confirmed duplicate returns its existing receipt.
- Extension publication reservations are serialized and persisted per provider/host: at least 3 seconds apart, at most 5/minute and 20/hour. Failed network attempts consume the reservation. Invalid or unwritable history blocks posting.
- Android has device-wide persistent limits across accounts and providers with the same spacing and counts. Uploads and posts have separate budgets so a screenshot can immediately precede its comment. Sign-out does not reset the budget.
- Android admits no more than 8 outstanding provider requests and 24 requests per 10 seconds before queuing UI work. Request sizes, response text, thread pagination and file parsing remain bounded. GitLab comment size is checked in UTF-8 bytes.

## Hosted GitHub App

- Webhooks require a valid HMAC, exactly one Content-Length, no Transfer-Encoding and a body no larger than 1 MiB. The hosted review service remains public-repository only.
- Canonical signed-body fingerprints prevent replay with a changed unsigned delivery ID. Fingerprints persist after payload pruning, with 7-day retention; failed deliveries can be redelivered.
- Metadata lookup allows a burst of 20 and replenishes one request/second globally, with at most 4 active lookups. HTTP concurrency is capped at 32 with a 10-second socket timeout.
- Queue history is capped at 10,000 records; active queue capacity and retries remain bounded. Completed/terminal payloads are discarded. Check-history pagination is limited to 30 pages.

## Injection and unintended access boundaries

Android no longer uses `addJavascriptInterface`, which exposes its object to every frame. Its AndroidX WebMessageListener accepts only the packaged HTTPS origin **and main-frame callers**, while the current top-level document must also be the trusted root page. Caller-supplied origin fields do not grant authority. The native dispatcher uses structured JSON and a fixed method/argument-type allowlist; it rejects binary messages, oversized messages and excess admissions before parsing. Unsupported System WebViews leave native access disabled and show an update notice instead of falling back to the old bridge.

Native resource routing rejects foreign schemes/origins, credentials, path traversal, backslashes and double-encoded paths. Imported permanent and temporary downloads cannot become navigated frame documents. They are served as inert source data with sandbox CSP and `nosniff`. Native file/content URL access, mixed content, automatic JavaScript windows and WebView debugging are disabled.

The interactive browser HTML preview is isolated in a sandbox without extension/native APIs or same-origin authority. Its policy blocks external resources, network connections, forms, nested frames and workers. Android and VS Code use inert/static imported HTML; extracted report text and table cells are rendered with text nodes. Compiled viewer frames intentionally use the parent's application API; this makes escaping and avoiding execution of untrusted data inside compiled pages essential even with a frame-bound native bridge.

Repository settings use null-prototype dictionaries so `__proto__` and `constructor` remain data. Comments and properties use text rendering rather than markup insertion. BoM CSV exports neutralize formula-leading cells. Browser messaging validates expected sources/origins, and provider writes require the authorized viewer sender. GitHub project input additionally rejects URL credentials, controls and backslashes rather than silently normalizing them.

These are application access controls, not a claim of CPU/cache/timing side-channel immunity, protection on a compromised/rooted device, or a completed penetration test. Keep Android System WebView, browsers and operating systems updated. Hardware isolation and threats outside the application process require separate assessment.

## Moderation and deployment responsibilities

Client-side limits protect this app's workflow. A modified client, cleared installation or separate provider API client can bypass them. Use GitHub/GitLab repository permissions, protected credentials and provider moderation controls as the authority. For restricted reviews, configure `.kicad-review-policy.json` with `collaborators` or an explicit `allowlist`; see [comment policy](COMMENTS.md). This policy cannot restrict comments posted directly on the provider website.

The review UI provides local blocking and content/user reporting. Reporting opens a draft to **support@sigharmonic.com**; it does not claim delivery or implement automatic moderation. The Pocket KiView team must monitor reports and use provider controls when removal or account action is needed.

Public service deployments still need a TLS reverse proxy with request/header/body deadlines and edge rate limits or WAF protection. In-process limits do not stop distributed traffic from saturating the network. These deployment controls have not been configured by this code change.

Keep signing keys and provider secrets outside source and release archives. Use minimal provider scopes, revoke unused credentials, rotate compromised credentials and keep dependencies updated. Do not include tokens, device codes or private project contents in reports or logs.

## Verification

The posting security update passed 930 JavaScript tests, 37 focused Python tests and 38 JVM request-guard checks. The subsequent terms/injection update passed 932 JavaScript tests and 18 JVM origin/path checks; Android debug/test APK compilation and lint passed. Hosted security tests exercise signature rejection, replay deduplication, framing limits, pacing, queue bounds and redirect rejection. Android persisted-write and actual WebView main-frame/subframe instrumentation compile but must also be run on a connected device. Tests are regression evidence, not a penetration-test certification.
