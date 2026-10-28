# Firefox and Mozilla-based browsers

The Firefox package is an unsigned Manifest V3 WebExtension for **Firefox desktop 140 or later**. It shares the owned schematic, PCB, project, comparison and 3D renderers with the Chromium extension. Packaging and event-page behavior are tested; an installed Firefox session has not yet been visually verified. Android Firefox is not a verified target.

Current preview: [Firefox 0.12.67 ZIP](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.67/kicad-visual-review-firefox-0.12.67.zip). Verify the release's `SHA256SUMS.txt` as described in [download verification](INSTALL.md#verify-downloads). Use this Firefox-specific artifact, not the Chromium ZIP or automatic source archive.

| Goal | Available route |
| --- | --- |
| Try desktop Firefox | Temporary installation below; reload after browser restart |
| Install permanently | Requires a Mozilla-signed XPI; none is published for this project yet |
| Publish on Mozilla Add-ons (AMO) | Complete the publisher steps and consent-readiness gate below |
| Try Zen, LibreWolf or Waterfox | Firefox-package compatibility candidates; installed acceptance is unverified |
| Use on Android now | [Pocket KiView APK](INSTALL.md#android--apk-installation); Firefox Android acceptance is pending |

## Temporary installation

1. Download `kicad-visual-review-firefox-VERSION.zip` from the release assets and extract it to a folder. Use the Firefox asset, not the Chromium ZIP.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**, then select the extracted `manifest.json`.
4. Open a `.kicad_sch`, `.kicad_pcb` or supported project file on GitHub or GitLab. Private projects need a connected account; self-hosted GitLab needs an explicit server grant in Options. Approve the requested site permissions if Firefox asks. Refresh a page that was open before installation.
5. Open the extension's **Preferences/Options** from `about:addons` to connect GitHub or the selected GitLab server for authorized private reads and explicit review publishing.

Temporary installation ends when Firefox restarts. A ZIP is not an AMO-signed, permanent installation package. Permanent public distribution requires Mozilla signing/review and an accurate data-collection declaration. No signed XPI or AMO listing is supplied yet.

For files on your computer, click the extension icon, then **Open files** or **Open folder**. No account is needed for local/public viewing. Test both the toolbar action and an ordinary repository file page; Firefox internal/settings pages are not injection targets. See Mozilla's [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Persistent installation after Mozilla signing

These instructions apply to a future signed release, not the current unsigned ZIP:

1. For a published official AMO listing, open its link in Firefox, choose **Add to Firefox**, and review permissions.
2. For a self-distributed signed XPI, save it, open `about:addons`, open the settings gear and choose **Install Add-on From File…**. Select the signed `.xpi` and review the prompt.
3. Restart the browser and verify the extension remains enabled; reopen a design and Options.

Renaming an unsigned ZIP to `.xpi` does not sign it. Keep signature checks and other browser security protections enabled. Managed browsers may require IT approval. Mozilla documents [signed-file installation](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

## Firefox derivatives

Install separately in each browser/profile. Check the underlying Gecko/API compatibility, not just the browser's marketing version. This package declares a Gecko minimum of 140.0; that does not establish acceptance in any derivative.

| Browser | Route and limits |
| --- | --- |
| Firefox stable / compatible ESR | Temporary route now; official AMO or signed-XPI route when published |
| Zen | Its [extension guide](https://docs.zen-browser.app/user-manual/extensions) uses Mozilla Add-ons. Use the Firefox package; temporary loading depends on its developer interface. Zen Mods are separate from WebExtensions. |
| LibreWolf | Firefox-derived candidate; use its add-on manager or temporary developer loader where available. Its [privacy defaults](https://librewolf.net/docs/faq/) can affect storage/authentication; do not disable protections globally to work around a failure. |
| Current Waterfox | Follow its [extension manager guide](https://www.waterfox.com/support/addons-help/) for AMO/signed files when available. Temporary loading depends on that build. Waterfox Classic compatibility is not promised. |
| Floorp / other Firefox derivatives | Candidates only: verify Manifest V3, event-page, storage, identity and WebGL support with the vendor's documentation. Do not substitute Chromium packages or assume legacy XUL support. |

Before relying on a derivative, test folder import, public repository viewing, sheets/layers, 3D, provider reconnect and draft persistence after restarting. Record browser and Gecko versions for bug reports. Privacy policies, site permissions, graphics capabilities and enterprise restrictions may affect behavior. Never include credentials or private sources in public reports.

## Firefox on Android

This release is a desktop-targeted unsigned preview, not a mobile-certified add-on. Desktop `about:debugging` is not an end-user Android installation route. Use the [Android APK](INSTALL.md#android--apk-installation) for the supported phone/tablet app.

After a mobile-compatible extension has been tested and signed, Mozilla supports installing compatible extensions through its Android add-on catalog. Its [signed-XPI Android instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/#install-add-on-from-file-on-android) also describe: save the XPI; open **Settings → About Firefox**; tap the logo five times; return to **Settings → Install Extension from File**; select it and review permissions. Menu availability varies by browser/build. This is a future distribution route, not a claim that the current ZIP supports Android or bypasses signing.

## Publish to Mozilla Add-ons or distribute a signed XPI

**Data consent:** new packages require Firefox desktop 140 or later, which supplies Mozilla's built-in installation consent. The generated Firefox manifest declares required `authenticationInfo` (provider account credentials/usernames), `browsingActivity` (repository URLs), `personalCommunications` (issue/discussion messages), `personallyIdentifyingInfo` (author/account names and contact fields), `websiteActivity` (provider actions such as posting and downloading), and `websiteContent` (repository files and review content). These declarations cover existing provider transfers; they do not enable analytics or automatically post reviews. Account connection and publication still require user actions. No technical/interaction telemetry or ungated optional data permission is declared. Users who decline installation consent can cancel installation; Firefox 139 and earlier cannot install this package. See [Mozilla's consent requirements](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Earlier immutable release archives retain their original manifests and are not made submission-ready by this documentation.

1. Sign in at the [AMO Developer Hub](https://addons.mozilla.org/developers/); the owner completes any account/agreement requirements.
2. Preserve the add-on ID **`kicad-visual-review@wayri.github.io`**. Update an existing AMO item instead of creating a duplicate.
3. Choose **On this site** for a public AMO listing, or **On your own** for a signed package distributed from GitHub/your site. Both routes require signing; unlisted does not mean unsigned.
4. Upload the newly prepared **Firefox** ZIP with `manifest.json` at its root. Resolve validation errors and review warnings. Declare desktop/Android platforms only after actual testing.
5. Supply readable source and exact build instructions for bundled/minified JavaScript and WASM, including relevant renderer/STEP sources, dependency versions and notices. Do not substitute a source-map link or include private designs, keys or tokens. See [source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).
6. Provide listing text, genuine Firefox screenshots, license, accurate data disclosures and the [privacy policy](https://wayri.github.io/KiCad-Github-View/privacy.html). Use `support.kivi@sigharmonic.com` and [public support](https://github.com/wayri/KiCad-Github-View/issues). Adapt the [listing draft](STORE-LISTINGS.md) to the Firefox limits here; Chrome/Edge captures are not installed-Firefox evidence.
7. Provide a public sample and repeatable reviewer instructions. Account access is optional for public/local review; dedicated reviewer credentials belong only in private AMO fields.
8. Submit for review. After signing, download the signed XPI and test clean-profile installation, restart, permissions and representative designs. Publish the actual AMO URL or signed XPI/hash after verifying them.
9. Increment the version for updates, retaining the add-on ID and existing AMO item. Listed distribution can use AMO updates; self-distribution needs a documented update mechanism or explicit installation of each newly signed XPI. The current ZIP does not auto-update.

See Mozilla's [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) and [self-distribution guide](https://extensionworkshop.com/documentation/publish/self-distribution/). This documentation update does not submit, sign or approve an add-on.

## Update, remove and troubleshoot

- **Temporary update:** extract the newer Firefox ZIP, then use **Reload** on its `about:debugging` card. If the folder changed, remove the temporary entry and load the new `manifest.json`. Refresh design tabs. Export notes before removal because extension storage can be lost.
- **Remove:** export local reviews/drafts first, then remove through `about:addons`; keep exports separately.
- **Corrupt/unverified package:** verify the Firefox artifact and checksum. Use temporary loading for this preview, or a signed XPI when available; renaming the archive is not a fix.
- **Public repository blocked:** check site permissions, refresh and inspect startup diagnostics. IT/network policy can block API hosts even when the repository page opens.
- **Missing sheets/models:** import the complete folder and inspect unresolved-path/format diagnostics. Installed desktop KiCad libraries are not automatically browser assets.
- **Private access fails:** check the exact provider/server and reconnect after background/browser restarts where required. Keep credentials out of logs.

## Review and comment workflow

Use **Review / Comments** to select a component or draw an area, enter text, severity, tags and state, and save the local annotation. Use the **GitHub** tab to choose **Issue** or **Discussion** and a destination; publishing is a separate explicit action. Saving does not post remotely. GitHub tokens remain in extension session storage and must be connected again after a browser restart. Only extension settings can change credentials. GitLab notes can be explicitly posted to new/existing issues or discussions inside existing issues; select the exact server in Options. Credentials are encrypted with background-memory keys, and background restart requires reconnection. GitLab OAuth uses PKCE and needs a registered non-confidential public Application ID and this browser's exact redirect URI; no publisher GitLab ID is bundled.

## Browser differences

| Feature | Firefox behavior |
| --- | --- |
| Background transport and GitHub publishing | Event-page background scripts with Promise-based WebExtension APIs |
| KiCad renderers and repo-linked WRL/GLB geometry | Shared browser renderer; unsupported or unresolved models are reported |
| Local Git review sidecar | Automatic selected-file writes are unavailable. Export review JSON, save it as `.kicad-review.json` in your checkout, then stage/commit it yourself. Import/export remains available. |
| Repository HTML / iBOM | Static, isolated preview. Repository scripts are disabled, so interactive iBOM does not run. |
| Self-hosted GitLab | Options → GitLab accounts and servers → Grant server access for an exact HTTPS origin; subpath installations are unsupported |
| Store installation | Pending signing and installed-browser verification |

The HTML fallback uses an iframe with an empty `sandbox` attribute and a restrictive content security policy. It does not grant same-origin access, script execution or the extension's messaging bridge to repository HTML.

## Build and verification

```powershell
python scripts/package_firefox.py
python -m unittest discover -s tests -p test_package_firefox.py -v
```

The builder uses the Chromium source inventory, transforms the manifest and background import list, injects a small API namespace adapter, and generates a deterministic ZIP under `.vizdiff`. It fails if the shared background or preview entry contract changes. Chromium's source manifest and renderer code are not rewritten.

Implementation references: Mozilla documents [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Promise APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API), [session storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session) and [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). The static HTML path avoids relying on the much newer [manifest sandbox support](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/sandbox.json).

## Firefox 0.12.67 validation corrections

The Firefox archive uses its own unsupported-vault stub; provider modules retain encrypted event-page session credentials without Chromium offscreen APIs. Saved HTML analysis reports are tokenized as bounded text/table data, with no privileged HTML insertion. Desktop Firefox remains 140+; the Android manifest floor is 142 for built-in data consent, while Android installation remains unverified and is excluded from this AMO submission.

Firefox PDFs use the browser's built-in PDF viewer, with local/project PDF intake, an Open in Firefox action and a download fallback. No PDF.js library fork is included in the Firefox ZIP. Search, zoom, rotation, printing and password handling depend on Firefox's native viewer and settings; the shared custom PDF.js page/search/render budgets do not apply to that native viewer. PDF input remains bounded to 32 MiB. Chromium, Android and VS Code retain their existing platform-specific PDF path.

The initial AMO 0.12.66 listing was restricted by Mozilla during submission. The dashboard currently blocks new versions and failed to load the review reason; this is separate from package validation warnings. Do not treat the unsigned development ZIP or a clean validator report as Mozilla publication approval.
