# Firefox extension

The Firefox package is an unsigned Manifest V3 WebExtension for **Firefox desktop 128 or later**. It shares the owned schematic, PCB, project, comparison and 3D renderers with the Chromium extension. Packaging and event-page behavior are tested; an installed Firefox session has not yet been visually verified. Android Firefox is not a verified target.

## Temporary installation

1. Download `kicad-visual-review-firefox-VERSION.zip` from the release assets and extract it to a folder. Use the Firefox asset, not the Chromium ZIP.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**, then select the extracted `manifest.json`.
4. Open a `.kicad_sch`, `.kicad_pcb` or supported project file on GitHub or GitLab. Private projects need a connected account; self-hosted GitLab needs an explicit server grant in Options. Approve the requested site permissions if Firefox asks. Refresh a page that was open before installation.
5. Open the extension's **Preferences/Options** from `about:addons` to connect GitHub or the selected GitLab server for authorized private reads and explicit review publishing.

Temporary installation ends when Firefox restarts. A ZIP is not an AMO-signed, permanent installation package. Permanent public distribution requires Mozilla signing/review and an accurate data-collection declaration. No signed XPI or AMO listing is supplied yet.

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
python -m unittest tests.test_package_firefox
```

The builder uses the Chromium source inventory, transforms the manifest and background import list, injects a small API namespace adapter, and generates a deterministic ZIP under `.vizdiff`. It fails if the shared background or preview entry contract changes. Chromium's source manifest and renderer code are not rewritten.

Implementation references: Mozilla documents [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Promise APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API), [session storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session) and [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). The static HTML path avoids relying on the much newer [manifest sandbox support](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/sandbox.json).
