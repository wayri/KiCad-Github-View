# Distribution status

**0.12.88 / Android 1.90 prepared (5 November 2026):** source gates passed: 149 Python passes / one Windows skip and 2,402 JavaScript passes / one skip. Android serial offline assemble, lint and bundle succeeded, with 19 lint warnings and no errors. This release adds guided Fast PI contacts and bounded mesh recovery, default-on Keep context colors, bidirectional drawing-linked BoM selection, scoped hierarchy loading and dismissible/clamped menus. Local production-viewer acceptance used bounded public/sample fixtures; no new organization, installed-store or physical-device acceptance is claimed. Package audits and publication receipts follow below once completed. Chrome review remains untouched; Altium beta excluded.

**0.12.87 / Android 1.89 prepared (5 November 2026):** exact local tag `v0.12.87` at `9558035fcfbaa86714c1d07a6c2afa4c3cbdd269`. All 23 release files are built locally; all 22 checksum entries passed. No new remote upload today. The planned upload was superseded by the requested immediate 0.12.88 release. Existing Chrome review remains untouched; cancelling it still requires separate approval. Property and drawing-linked BoM comment UI verified in the integrated browser using retained public OLIMEX M2 and small schematic/grouped fixtures. Save/edit, field/value context, group references, reload persistence, markers and Locate passed. 150 Python checks: 149 passed, one Windows environment skip. JavaScript: 2,393 passed, one skipped. Android offline build/lint/bundle passed; APK signature and exact 427 viewer assets audited, non-debuggable; 19 lint warnings, no errors. Android APK is development-signed; AAB unsigned and not Play-ready. Physical-device and new live-provider posting acceptance are not claimed. Mozilla matching readable source prepared (91,906,821 bytes; SHA-256 `a861c9f2a9e05e308da9fbfcc023abf4b2d536b3d52d55450e1b048b7ff422c5`); Three/SPIKE rebuilt byte-identically, OCCT not rebuilt. Altium beta excluded. See [field-comment acceptance](QA-FIELD-COMMENTS-0.12.87.md).

**0.12.86 (5 November 2026):** [GitHub preview published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.86)
with 20 assets (123,247,941 bytes); every remote asset size and SHA-256 matches
the audited local output. Exact clean source/tag: `9f05e418d1d7551c1d40a2de8348192858443115`.
License naming and public screenshot update; Firefox now includes the project
license and static Terms. 150 Python checks: 148 passed, two environment skips
(Java policy runtime unavailable; Windows symbolic-link privilege unavailable).
JavaScript: 2,388 passed, one skipped. Readable Mozilla companion is prepared
(91,901,852 bytes; SHA-256 `2b4f853c21571a81bd3691e01b2d2063daf0122440825a669290391bac309ba7`);
the bundled rendering source rebuilt byte-identically. Native OCCT was not rebuilt.

| Channel | 0.12.86 handoff |
| --- | --- |
| VS Code | **0.12.86 public; verification finished.** Publisher dashboard displays 0.12.86 and Public without a Verifying badge. |
| Mozilla | **0.12.86 Awaiting Review**, zero validation errors/warnings (version 6667792, file 5211886). Matching readable source is retained: the version form shows View current and Changes successfully saved. Public version remains 0.12.66; icon, renamed license metadata and three new screenshots were saved separately. |
| Chrome | Pending **0.12.85** review intentionally left running. No store upload, withdrawal or listing modification for 0.12.86. |
| Android | 1.88 unchanged; no Android build or installation in this release. |

**KiCad Online 0.12.85 / Android 1.88 (4 November 2026):**
[GitHub preview published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.85)
with 23 assets; all remote sizes and SHA-256 hashes match local audited packages.
The renamed UI, guides, five genuine public OLIMEX M2 screenshots and Firefox
Android internal-tab fallback are included. Altium beta excluded. Installed IDs,
settings and license retained. Checks: 149 Python tests (one skip), 2,388 JavaScript
passes (one skip), Android offline assemble/lint/bundle and exact package audits.

| Channel | Verified state |
| --- | --- |
| Chrome | **0.12.85 submitted, pending review**, automatic publication after approval. Listing name, full description, support/homepage/policy links and two genuine 1280×800 layout/3D images updated. Old screenshots and old-name optional promo tiles removed with explicit approval. Last observed published version: 0.12.80. |
| VS Code | **0.12.85 public; verification finished**. Public extension and publisher display names are KiCad Online; publisher profile links and support email updated. The 0.12.84 upload finished verification before this update. |
| Mozilla | **0.12.85 Awaiting Review**, zero validator errors/warnings, desktop and Android checked. Product name, description, support and homepage updated. Submission is complete with the exact 91.5 MB readable-source companion attached (version 6664588). No new approval is claimed. The existing approved version is 0.12.66. |
| Android | **1.88 / versionCode 91 installed and launched** on the connected Samsung phone, with the existing application ID/signer and data preserved. Development-signed/non-debuggable; unsigned AAB is not Play upload-ready. Physical Firefox Android extension acceptance is separate and pending. |
| Public policies | Renamed Pages site serves updated Chrome privacy and Android privacy/terms. Checked HTTP 200 at the new policy URLs. |

See [release notes](releases/v0.12.85.md) and [fresh captures/provenance](BRAND-SCREENSHOTS-0.12.85.md).
Screenshots are local current-source browser captures, not installed-store or
physical Android acceptance evidence. Older entries below are historical.

**0.12.84 deployment check (4 November 2026):** Android 1.87 / version code 90 installed and launched on the connected Samsung phone. VS Code Marketplace accepted the owner upload and was still Verifying 0.12.84. Chrome 0.12.82 review was cancelled with authorization; 0.12.84 uploaded as a draft before the requested fresh branding update. Mozilla 0.12.84 validation returned zero errors/warnings and the matching source was selected; final submission/approval is not yet confirmed. The dashboard showed 0.12.66 Approved.

**0.12.84 / Android 1.87 (4 November 2026):** [GitHub preview published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.84) with 23 uploaded assets; all remote sizes and SHA-256 digests match the audited local packages. Documentation/gallery packaging refresh; engineering runtime unchanged from 0.12.83. Altium beta excluded. The gate passed 149 Python checks (one environment skip) and 2,383 JavaScript checks (one skip); Android offline assemble/lint/bundle and exact package audits passed. No new store submission, approval or physical-device acceptance is claimed. See [release notes](releases/v0.12.84.md).

**0.12.83 / Android 1.86 (4 November 2026):** [GitHub preview published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.83) with 23 SHA-256-verified assets. This release adds faster
large-board rendering, searchable Fast PI contacts, masked smooth result fields,
mechanical Draftsman optimization, Android document exports and corrected saved
DRC/ERC report ingestion. The full gate passed 149 Python checks (one environment skip) and 2,383 JavaScript checks (one skip); Android assemble/lint and exact package/source audits passed. See [release notes](releases/v0.12.83.md). Store upload
and approval are separate; no new Chrome, Marketplace or Mozilla approval is
claimed by this entry. The last full-Marble phone run predates the final added
picker/field/export changes; the final added UI checks remain pending.

**Mozilla notice:** the owner supplied an automated-screening notice reporting
tentative public approval of **0.12.66**. Older disabled-listing snapshots below
are historical. The current dashboard/listing state has not been independently
confirmed. [The 0.12.83 update plan](store-submissions/mozilla-0.12.83-plan.md)
requires the existing listing, matching readable source and installed-Firefox
acceptance before a new submission/approval claim.

**0.12.82 / Android 1.82 (4 November 2026):** [GitHub preview published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.82), including Chrome/Chromium, unsigned Firefox, VSIX, development-signed APK and unsigned AAB. Browser-session Issue replies/readback and point/area markers are included. Synthetic schematic/layout/3D marker checks passed; organization content and screenshots are excluded. No new store publication or device acceptance is claimed.

**0.12.81 / Android 1.81 (3 November 2026):** GitHub preview packages include Firefox, VSIX and the development-signed Android APK, source and checksums. See [release notes](releases/v0.12.81.md). This does not claim new Marketplace/Mozilla submission or phone installation. Chrome 0.12.80 was submitted for review separately.

**0.12.80 / Android 1.80 (2 November 2026):** [GitHub preview release published](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.80) with 23 uploaded assets, checksums and source tag. Source and audited packages include independent schematic probe navigation, R1 cross-probe identity correction, flip/rotation controls and managed-browser diagnostics. The new store submission is not claimed; previous store snapshots below remain historical. See [release notes](releases/v0.12.80.md), [browser evidence](PROBE-WALKTHROUGH-0.12.80.md) and [security scope](SECURITY-REVIEW-0.12.80.md).

**0.12.79 store update (2 November 2026):** Chrome 0.12.79 was uploaded and submitted for review, with automatic publication after approval. The superseded 0.12.78 review was canceled with explicit owner authorization; the published Chrome version remains 0.12.76. The listing includes the 0.12.79 changes. Marketplace has the validated 0.12.79 VSIX selected, but Upload opened an image CAPTCHA: the owner deferred completing it, so submission is not confirmed and the observed public VSIX version remains 0.12.76. Chrome review submission is not approval. Android is unchanged. Both packages passed exact source/package audits and checksum verification; 2,153 JavaScript checks passed. The 142-test Python run had two environment skips and one stale install-document version failure, corrected and passed on focused rerun. See the [release notes](releases/v0.12.79.md) and [Chrome submission text](store-submissions/chrome-0.12.79.txt). Older snapshots below are historical.

**Release package update: 0.12.78 / Android 1.78 (1 November 2026).** [GitHub release](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.78) includes the browser ZIPs, VSIX and development-signed Android APK. Store submissions checked **1 November 2026**: Chrome 0.12.78 is **pending review**, with automatic publication after approval; its published package was 0.12.76 when checked. VS Code Marketplace accepted 0.12.78 and shows **Verifying**. Neither pending state is an approval claim. Android 1.78 is ready with the same development certificate as 1.77; no phone was detected, and installation was deferred at the user’s request. Android hardware acceptance and the intermittent optional 3D postprocessing fallback remain disclosed in the [release notes](releases/v0.12.78.md).

The historical store snapshot below was checked **30 October 2026**. It is not a current store-status check and does not update automatically.

| Channel | Current state | What to use |
| --- | --- | --- |
| GitHub browser/desktop packages | **0.12.76 published as a preview**; source tag and package checksums available | [Release and downloads](https://github.com/wayri/KiCad-Online/releases/tag/v0.12.76) |
| Chrome Web Store | **0.12.76 submitted, pending review**, with automatic publication after approval. The superseded review was withdrawn. The observed approved package is 0.12.64 until Google approves an update. | [Existing store listing](https://chromewebstore.google.com/detail/klfdjlbngpoopegjmbajaidgodpmjaoc); use the GitHub ZIP for the newer unpacked build |
| VS Code Marketplace | **0.12.76 uploaded and verifying**. The last confirmed public package was 0.12.75; GitHub provides the new VSIX immediately. | [Marketplace](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review) or [GitHub VSIX](https://github.com/wayri/KiCad-Online/releases/download/v0.12.76/kicad-visual-review-vscode-0.12.76.vsix) |
| Mozilla Add-ons | **Disabled by Mozilla**; submitted version 0.12.66 is restricted. New submissions are unavailable. The appeal was recorded; no reinstatement is shown. | [Unsigned Firefox 0.12.76 development ZIP](https://github.com/wayri/KiCad-Online/releases/download/v0.12.76/kicad-visual-review-firefox-0.12.76.zip), subject to [temporary-install and signing limits](FIREFOX.md) |
| Android | **1.76 / version code 79** APK published in v0.12.76; installed on the connected phone. Development-signed, non-debuggable, manually installed/updated. The AAB is unsigned and not ready for Play upload. | [Android APK](https://github.com/wayri/KiCad-Online/releases/download/v0.12.76/pocket-kivi-android-phone-tablet-1.76-development.apk) |
| Safari | 0.12.76 development conversion package; native conversion/signing and runtime acceptance remain required | [Safari instructions](SAFARI.md) |

## Latest browser behaviour

**0.12.76 is icon-first.** Normal GitHub/GitLab repository, drawing and pull/merge-request pages remain untouched. Click the extension icon to open a dedicated viewer tab. A single detected project opens directly; multiple projects offer a chooser. Empty, partial and access-denied results have distinct messages. Refresh already-open repository pages after updating to remove older injected controls.

The Chrome listing now includes a **What's new in 0.12.76** section describing centered project-wide search, compact navigation, mechanical 3D Draftsman and client-side GitHub project buffering. Its reachable [Chrome privacy policy](https://wayri.github.io/KiCad-Online/chrome-privacy.html) and permission explanations match the user-directed workflow.

The [illustrated user guide](../USER-GUIDE.md) includes setup, review workflows and Draftsman screenshots/video. GitHub source updates are available in release tags and [source review PR #2](https://github.com/wayri/KiCad-Online/pull/2); the default branch may lag until that review is merged.

## Shared viewer updates

0.12.76 includes improved project-model path recovery and the detachable browser schematic/layout/3D windows introduced in 0.12.74, with independent cameras and linked cross-selection toggle. Native Android and VS Code Webviews retain split views. See [release notes](releases/v0.12.76.md). The new search spans saved design objects, net names, project paths/settings, supported report/simulation text and scoped Draftsman documents; limits are shown in the search UI.
