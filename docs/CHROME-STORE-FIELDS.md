# Chrome Web Store — copy/paste fields (0.12.72)

Upload only the extension ZIP as the package, not this folder or a VSIX. The uploaded title/summary come from the manifest. Use [CHROME-STORE-DESCRIPTION.txt](CHROME-STORE-DESCRIPTION.txt) for the Description field; the upload folder also includes it as description.txt. Its headings and bullet lists are plain text, without Markdown syntax.

## Store listing

- Category: Tools (the engineering viewer is a general tool, not a browser DevTools debugger).
- Language: English (United States).
- Store icon: store-icon-128.png.
- Global promo video: leave blank unless you have a real video URL.
- Official URL: None unless your account has verified a website you own.
- Homepage URL: https://github.com/wayri/kiview-marketplace-assets/blob/main/CHROME-HOME.md
- Support URL: https://github.com/wayri/kiview-marketplace-assets/blob/main/SUPPORT.md
- Mature content: Off.
- Contact/support email where requested: support.kivi@sigharmonic.com.
- Screenshots: genuine Chrome-extension captures, 1280×800 or 640×400, JPEG or 24-bit PNG without alpha. At least one is required; up to five. Three actual Chrome captures are available in screenshots/ and chrome-store-screenshots.zip.
- Small promo tile: small-promo-440x280.png. Marquee promo tile: marquee-promo-1400x560.png. Both are RGB PNGs without alpha; upload them to their separate promo fields.

## Privacy

Privacy policy URL: https://wayri.github.io/KiCad-Github-View/chrome-privacy.html

Single purpose:
Visually inspect and review saved KiCad engineering project files locally and on supported GitHub/GitLab repository pages.

Permission justifications:

storage:
Save viewer preferences, local review drafts, BoM/variant metadata, approved GitLab server settings and account-flow state.

offscreen:
Host the bundled isolated credential-vault worker during optional authenticated provider sessions.

identity:
Run optional provider authorization through the browser authentication flow. Local and public-file review do not require an account.

scripting:
Register bundled content bridges only on explicitly approved self-hosted GitLab origins. Identify the user-selected repository/revision and support authorized signed-in source reads. Ordinary repository pages are not automatically replaced; executable scripts are not downloaded.

downloads:
Optional permission for the explicit Open in KiCad action. Download the selected repository revision ZIP, ask where to save it, track that download by its own ID, and verify the completed path before passing it to the optional desktop helper. It does not scan unrelated download history.

nativeMessaging:
Optional permission for Open in KiCad after the user grants it and separately installs the dev.pocketkivi.kicad desktop helper. Check helper availability and open the user-selected completed project ZIP in local KiCad. OAuth credentials are not sent to the helper; ordinary viewing works without it.

hostPermissions:
github.com and gitlab.com identify the repository selected by the user and support authorized source reads. api.github.com retrieves repository metadata/files and performs explicitly requested provider operations. raw.githubusercontent.com retrieves selected raw files/models; uploads.github.com supports selected attachment operations. Optional HTTPS origins support self-hosted GitLab servers only after user approval.

Remote code:
Yes, I am using remote code. The optional project HTML preview displays user-selected local or repository HTML that may contain inline JavaScript. It runs inside a manifest-declared sandbox and nested sandboxed iframe, without extension API access or same-origin privileges. The preview CSP blocks network connections and external script sources. Viewer logic, libraries and Wasm decoders are bundled; project scripts do not execute in privileged extension contexts. Keep this disclosure aligned with the actual packaged sandbox behaviour rather than declaring all HTML previews static.

Data usage — disclose processing, including local processing. Based on the shipped feature set, the relevant categories are:
- Personally identifiable information: optional provider usernames/account metadata and user-entered author/review details.
- Authentication information: optional tokens and supported signed-in provider-session authorization.
- Personal communications: review notes/comments and explicitly selected provider discussions/captures.
- Website content: selected repository files, page content and source/review resources.
- Web history/browsing activity: supported page/resource URLs used for repository routing and review context, not general browsing-history scraping.
Do not declare that no user data is handled. Do not select health, payment/financial or precise-location categories as a normal feature of this engineering viewer. Arbitrary user files can contain sensitive content; avoid uploading such files in store/reviewer evidence. Review the actual labels shown by Google before certifying them.

Limited-use certifications: the extension is intended not to sell user data, use/transfer it for unrelated purposes, or use it for credit/lending decisions. Read Google's exact certification language and confirm only statements you can stand behind. These fields are publisher declarations, not a guarantee of acceptance or a full security/legal audit.

## Test instructions (no reviewer password required for basic review)

1. Install the package and click its toolbar icon to open the local workspace.
2. Select a non-sensitive KiCad schematic/PCB or project folder. No account sign-in is required for local files.
3. Inspect parts/nets/layers, pan/zoom, use 2D measurement and enable Layers → Net names when inspecting PCB copper.
4. Open BoM manager, choose grouping/columns and export the visible CSV.
5. Open a public supported drawing, for example https://github.com/BerkeleyLab/Marble/blob/a426777d92c0f22a546d4740b419a3937e0c1f90/design/Marble.kicad_pcb, and inspect the inline viewer and Show source action.
6. Account connection/private access/publication are optional. Do not publish test content to a third-party repository. Provide a separate least-privilege test account only if needed through Google's private reviewer fields; do not put passwords/tokens in this document.
7. Native KiCad checks/solvers are not run. Imported results are saved data, not fresh simulations.
8. During a repository read or drawing preparation, choose Stop loading. Check that the stopped view offers Retry and that late results do not reopen the drawing. Stop does not cancel publishing or other writes.
9. PCB layers use KiCad Default colours, including distinct internal copper layers and mask/paste opacity. Custom KiCad colour themes are not imported.

## Distribution and submission

Keep as draft until the genuine Chrome screenshots and remaining dashboard requirements are complete. Select Public distribution when ready for the intended public release. Trader/non-trader status must reflect your actual activity; it is not determined by the source-available software license.

Google reference: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
Google local-data disclosure FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Version support and companion edition

Paste the updated description.txt, including its SUPPORTED KICAD VERSIONS and COMPANION VS CODE EDITION sections. Compatibility details: https://github.com/wayri/kiview-marketplace-assets/blob/main/COMPATIBILITY.md

Use only a live public Chrome Store URL for a direct store cross-link. Until then, the VS Code README links to the public Chrome companion guide and labels store publication pending.
