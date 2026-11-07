# Firefox packaging and Mozilla submission

Maintainer reference. For installation and everyday use, see the [Firefox guide](../FIREFOX.md). Store states are dated in [release status](../RELEASE-STATUS.md).

## Publish to Mozilla Add-ons or distribute a signed XPI

**Data consent:** new packages require Firefox desktop 140 or later, which supplies Mozilla's built-in installation consent. The generated Firefox manifest declares required `authenticationInfo` (provider account credentials/usernames), `browsingActivity` (repository URLs), `personalCommunications` (issue/discussion messages), `personallyIdentifyingInfo` (author/account names and contact fields), `websiteActivity` (provider actions such as posting and downloading), and `websiteContent` (repository files and review content). These declarations cover existing provider transfers; they do not enable analytics or automatically post reviews. Account connection and publication still require user actions. No technical/interaction telemetry or ungated optional data permission is declared. Users who decline installation consent can cancel installation; Firefox 139 and earlier cannot install this package. See [Mozilla's consent requirements](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Earlier immutable release archives retain their original manifests and are not made submission-ready by this documentation.

1. Sign in at the [AMO Developer Hub](https://addons.mozilla.org/developers/); the owner completes any account/agreement requirements.
2. Preserve the add-on ID **`kicad-visual-review@wayri.github.io`**. Update an existing AMO item instead of creating a duplicate.
3. Choose **On this site** for a public AMO listing, or **On your own** for a signed package distributed from GitHub/your site. Both routes require signing; unlisted does not mean unsigned.
4. Upload the newly prepared **Firefox** ZIP with `manifest.json` at its root. Resolve validation errors and review warnings. Declare desktop/Android platforms only after actual testing.
5. Supply readable source and exact build instructions for bundled/minified JavaScript and WASM, including relevant renderer/STEP sources, dependency versions and notices. Do not substitute a source-map link or include private designs, keys or tokens. See [source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).
6. Provide listing text, genuine Firefox screenshots, license, accurate data disclosures and the [privacy policy](https://wayri.github.io/KiCad-Online/privacy.html). Use `support.kivi@sigharmonic.com` and [public support](https://github.com/wayri/KiCad-Online/issues). Adapt the [listing draft](../STORE-LISTINGS.md) to the Firefox limits here; Chrome/Edge captures are not installed-Firefox evidence.
7. Provide a public sample and repeatable reviewer instructions. Account access is optional for public/local review; dedicated reviewer credentials belong only in private AMO fields.
8. Submit for review. After signing, download the signed XPI and test clean-profile installation, restart, permissions and representative designs. Publish the actual AMO URL or signed XPI/hash after verifying them.
9. Increment the version for updates, retaining the add-on ID and existing AMO item. Listed distribution can use AMO updates; self-distribution needs a documented update mechanism or explicit installation of each newly signed XPI. The current ZIP does not auto-update.

See Mozilla's [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) and [self-distribution guide](https://extensionworkshop.com/documentation/publish/self-distribution/). This documentation update does not submit, sign or approve an add-on.


## Build and verification

```powershell
python scripts/package_firefox.py
python -m unittest discover -s tests -p test_package_firefox.py -v
```

The builder uses the Chromium source inventory, transforms the manifest and background import list, injects a small API namespace adapter, and generates a deterministic ZIP under `.vizdiff`. It fails if the shared background or preview entry contract changes. Chromium's source manifest and renderer code are not rewritten.

Implementation references: Mozilla documents [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Promise APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API), [session storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session) and [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). The static HTML path avoids relying on the much newer [manifest sandbox support](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/sandbox.json).

## Historical implementation notes: 0.12.67–0.12.85

The Firefox archive uses its own unsupported-vault stub; provider modules retain encrypted event-page session credentials without Chromium offscreen APIs. Saved HTML analysis reports are tokenized as bounded text/table data, with no privileged HTML insertion. Desktop Firefox remains 140+; the Android manifest floor is 142 for built-in data consent, while physical Android extension acceptance remains unverified. The 0.12.84 upload selected both desktop and Android; the 0.12.85 candidate adds the mobile viewer-tab fallback.

Firefox PDFs use the browser's built-in PDF viewer, with local/project PDF intake, an Open in Firefox action and a download fallback. No PDF.js library fork is included in the Firefox ZIP. Search, zoom, rotation, printing and password handling depend on Firefox's native viewer and settings; the shared custom PDF.js page/search/render budgets do not apply to that native viewer. PDF input remains bounded to 32 MiB. Chromium, Android and VS Code retain their existing platform-specific PDF path.

Historical note: the initial AMO 0.12.66 listing was restricted during submission. The owner later supplied a tentative automated approval notice for that version. Current dashboard availability was not independently confirmed during 0.12.83 preparation. Do not treat the unsigned development ZIP, the old notice or a clean validator report as approval of the new candidate.

## KiCad Online branding and current candidate

The product is now **KiCad Online**; its existing Mozilla listing URL and add-on ID remain stable. The dashboard independently showed 0.12.66 Approved before the 0.12.84 update upload. Validation for 0.12.84 returned zero errors and warnings; validation is not approval. The fresh 0.12.85 candidate includes updated branding and the Firefox Android tab fallback. Its focused mobile API tests cover internal routes, desktop behavior, invalid requests and policy rejection; actual signed mobile installation, provider authentication, touch controls and 3D still require device acceptance.
