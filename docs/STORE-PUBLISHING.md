# Store publishing

Current verified channel status: [30 October 2026 release state](RELEASE-STATUS.md). Chrome 0.12.76 is submitted and pending review; VSIX 0.12.76 is uploaded and verifying. Mozilla still disables the existing listing and blocks new submissions. Android 1.76 is installed through the development APK channel; the unsigned AAB is not ready for Play upload. Older dated records below are historical.

## Current Mozilla / Firefox deployment instructions

Use the [Firefox and derivative guide](FIREFOX.md#publish-to-mozilla-add-ons-or-distribute-a-signed-xpi) for public AMO submission or signed self-distribution. It covers the stable add-on ID, Firefox-specific ZIP, validator/source submission, privacy and reviewer information, signed-XPI verification and updates. The existing 0.12.64 ZIP is an unsigned temporary desktop preview: its missing `gecko.data_collection_permissions` and consent readiness must be addressed before a new AMO submission. No Mozilla listing/signing has been completed. Do not turn off signature checks to create a permanent installation.

Current Chromium upload text: [0.12.76 submission](store-submissions/chrome-0.12.76.txt). Older version-specific publishing records below are historical; use the current package and installed-version evidence.

## Illustrated VS Code listing: 0.12.50

Uploaded 23 October 2026; Marketplace shows **Verifying**, availability **Private**. Main README reduced from roughly 2,450 to 480 words; six installed VS Code screenshots include new command-palette and copper-net-name captures. Full workflows, limits, shortcuts and troubleshooting are in the bundled GUIDE.md and a public guide in `wayri/kiview-marketplace-assets`. All six screenshot URLs and guide text were verified. Six packaging tests passed; final VSIX README/guide/license contents match the reviewed source. Includes the chosen source-available license. Submission files: `dist/store-submission-0.12.50/`; source commit `71fd46b`. No iOS changes included. Public release and inspection of Marketplace's new rendered version remain pending validation.


## Licensed packages: 0.12.49 (prepared, not uploaded)

Owner/licensor: Yawar B (wayri). Pocket KiView Source-Available License 1.0 permits personal/internal professional use and uncompensated sharing under its terms; paid software distribution, paid bundles and monetized hosted access require separate written permission. Do not label it open source. Third-party licenses and valid earlier grants remain unchanged. The included owner-authored SPIKE subset is covered; the rest of SPIKE is not relicensed.

Canonical terms: LICENSE. Chrome/VSIX copies: LICENSE.txt. VS Code uses `SEE LICENSE IN LICENSE.txt` and an addressable license asset. Android's next asset payload includes the same text; no APK was built. Prepared Chrome ZIP and VSIX plus licensing documents and checksums: `dist/licensed-0.12.49/`. Six packaging tests passed; both archives were inspected for exact license content and SPIKE notice scope. These files supersede 0.12.48 for the next upload; existing store uploads have not been modified. Private repository visibility remains unchanged. Custom legal text and commercial/contributor agreements should receive jurisdiction-specific legal review before reliance.


## VS Code update: 0.12.48

Uploaded 23 October 2026; Marketplace reports **Verifying**, availability **Private**. Includes shared 2D copper net labels, persisted toggle, toolbar hover contrast fix and README usage/limits. Verified with 230 feature/host tests, six packaging tests, final archive inspection and isolated VSIX installation. Source commit `e2e3b0c` on `work/vscode-marketplace-0.12.47`; iOS excluded. Package, checksum and submission evidence: `dist/store-submission-0.12.48/`. Public release and rendered listing inspection remain pending validation.


## VS Code listing update: 0.12.47

Uploaded to publisher `wayri` on 23 October 2026. Marketplace currently reports **Verifying**; the extension remains **Private**. Do not make it public until validation completes and the rendered 0.12.47 listing has been checked.

The README covers all currently supported VS Code workflows and documents companion-only tools and validation limits. Four genuine installed VS Code screenshots show the public KiCad PIC Programmer schematic, PCB, BoM field table and generated visual conflict comparison. Public images are pinned to the `wayri/kiview-marketplace-assets` repository because the source repository is private.

Validation: 65 VS Code tests, six packaging tests, four public image byte comparisons, final packaged README comparison, and successful isolated VSIX installation. Package and checksum: `dist/store-submission-0.12.47/`. Source branch: `work/vscode-marketplace-0.12.47`. No iOS changes were included.


This is the manual first-listing procedure for the Chromium browser extension and the VS Code extension. The repository's packaging code builds and audits downloadable files; it deliberately does not sign in to a store, create a listing, or publish one.


## Current submission — 2026-10-23

Publish to Visual Studio Marketplace first, then Chrome Web Store. The owner has
created the Pocket KiView publisher (`wayri`), and version 0.12.46 was uploaded
successfully. The Marketplace currently shows **Verifying** and **Private**;
public availability has not been established. Chrome registration/submission is
still pending. Retain the publisher-management tab for the validation result.

The exact released VSIX and Chromium ZIP have been copied to
`dist/store-submission-0.12.46/`, with SHA-256 hashes verified against the retained
release manifest at source commit `843062fad54bca4014eea00370b1b7e4558e8316`.
The VSIX installed successfully into an isolated VS Code profile. This proves
installability, not custom-editor, sidecar or web-host acceptance.
See [listing drafts and permission explanations](STORE-LISTINGS.md).

1. Complete Microsoft sign-in at https://marketplace.visualstudio.com/manage.
2. Create publisher ID `wayri` if available, or verify ownership if it already
   exists. If unavailable to this account, resolve the publisher identity before
   rebuilding; do not upload a package under someone else's publisher.
3. Review the existing `UNLICENSED` declaration and intended distribution terms.
   Then use New extension → Visual Studio Code to upload the verified VSIX.
4. Complete installed-viewer acceptance and inspect the listing before publishing.
5. Register the intended Google publishing account in the Chrome developer
   dashboard. The owner completes agreement acceptance, any payment and required
   verification. Do not create a second listing if one already exists.
6. Upload the verified Chromium ZIP, provide current genuine screenshots and an
   extension-specific public privacy policy, complete disclosures, then submit.

Keep credentials and reviewer secrets in the account/dashboard only. No PAT is
needed for the manual VSIX-upload route; postpone publishing automation until the
first listing is established. No open-source license has been selected on the
owner's behalf.

## Build the exact submissions

Use a clean checkout whose `extension/manifest.json` and `vscode-extension/package.json` both say `0.12.46`. Run the release builder from the repository root:

```powershell
python scripts/release.py --tag v0.12.46 --output dist/release-0.12.46
```

The command requires the checked-out commit to be the local `v0.12.46` tag, a clean working tree, reviewed `docs/releases/v0.12.46.md`, and passing Python and JavaScript checks. It then audits each archive against the explicit package inventories and writes hashes. Upload only these two results:

- Chrome Web Store: `dist/release-0.12.46/kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.46.zip`
- Visual Studio Marketplace: `dist/release-0.12.46/kicad-visual-review-vscode-0.12.46.vsix`

Check both names in `SHA256SUMS.txt`, retain `release-manifest.json`, and install each artifact locally for a final smoke test. Do not upload the Firefox, Safari, guides, web-app, GitHub-App, or STEP-source ZIP in place of the Chromium ZIP.

For an untagged packaging check, `python scripts/package_extension.py` writes the Chromium ZIP under `.vizdiff/`, and `python scripts/package_vscode.py` writes the VSIX under `build/`. Those commands do not run the full release checks and are not the preferred source of a store submission.

## Chrome Web Store

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Register the publishing Google account, accept the agreement, pay Google's one-time registration fee, and enable 2-Step Verification. Both registration and 2-Step Verification are prerequisites in Google's current documentation: [register a developer account](https://developer.chrome.com/docs/webstore/register/) and [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies).
2. Choose **New item**, upload `kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.46.zip`, and complete the listing. The package is the required ZIP with `manifest.json` at its root; see [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare/) and [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/).
3. Use the product name and single purpose represented by the manifest: read-only visual review of KiCad schematic, PCB, project, fabrication, and revision data on supported GitHub/GitLab pages. Supply an accurate description, category, 128 px icon, screenshots, support/homepage links, and distribution settings. Store screenshots must show the extension as shipped; label any synthetic or mocked account state rather than presenting it as live acceptance.
4. Explain every requested permission in the Privacy tab, including `storage`, `offscreen`, `identity`, `scripting`, the fixed GitHub/GitLab hosts, and optional user-approved HTTPS GitLab servers. Remove a permission from the package if it cannot be justified by a shipped feature; Google requires the narrowest necessary permissions.
5. Publish an accessible privacy policy and make the dashboard disclosures match the extension's behavior. Follow Google's [privacy-field guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/) and [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/).
6. Add reviewer instructions, then choose the intended visibility and submit for review. The dashboard's Test instructions tab accepts steps and credentials when needed.

Do not select a blanket “no user data” answer. This extension processes website content and repository files, repository/ref/path metadata, browser activity on supported hosts, user-created review notes and captures, settings, and optional authentication information. Some data remains local, while explicit GitHub/GitLab reads and publication send selected data to those services. Local processing still must be disclosed. Describe collection, use, storage/retention, sharing, deletion/sign-out behavior, and the optional authentication flows accurately. The policy and listing should also state that remote issue/discussion publication happens only after an explicit user action. Do not claim that the publisher receives no data unless that statement is narrowly defined and verified against all actual network and logging paths.

Suggested reviewer path (replace the URL only if this exact revision stops being public):

1. Install the submitted package and grant access to `github.com`.
2. Open the public [Marble PCB at the pinned revision](https://github.com/BerkeleyLab/Marble/blob/a426777d92c0f22a546d4740b419a3937e0c1f90/design/Marble.kicad_pcb).
3. Confirm that the inline viewer opens, pan/zoom and layer controls work, and **Show source** restores GitHub's source view.
4. Open the extension Options page to inspect the account and GitLab-server controls.
5. Explain that authentication is optional for this public-board path. If Google needs to test private repositories or posting, provide a dedicated least-privilege test account/repository through the dashboard's private test-instruction fields, never in this repository or public listing text.

Before submission, run an installed Chrome smoke test of the public-board path and the relevant sign-in/sign-out lifecycle. Automated fixtures and local mocked screenshots do not establish installed-store behavior.

## Visual Studio Marketplace

The Marketplace identity is fixed by `vscode-extension/package.json`: publisher `wayri`, extension name `kicad-visual-review`, version `0.12.46`. The uploading Microsoft account must own or be a member of the intended **wayri** publisher; its existence and availability have not yet been verified. Do not change the publisher merely to bypass ownership; either use that publisher account or arrange publisher membership/transfer through the owner.

1. Sign in to the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and select the `wayri` publisher.
2. Choose **New extension → Visual Studio Code**, select `kicad-visual-review-vscode-0.12.46.vsix`, review the generated listing, and upload it. Microsoft's official guide documents both this manual route and `vsce`: [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
3. After processing, install the Marketplace version in a clean VS Code profile. Open a local `.kicad_sch` and `.kicad_pcb`, exercise the custom editor and **KiCad Review** Explorer view, save a test annotation sidecar, and confirm the source drawings remain unchanged. Also test a web extension host such as `github.dev` if that surface is advertised.

The VSIX is structurally packageable, uses the same audited `extension.js` entry point for `main` and `browser`, declares VS Code `^1.95.0`, and includes a README. The first public listing still has specific metadata gaps to resolve before upload:

- `license` is `UNLICENSED`. Confirm that public Marketplace distribution is intended under the repository's actual licensing terms, and make the package metadata and included license material consistent. This is a release/legal readiness decision, not proof that Microsoft will reject the package.
- Repository, homepage and issue-support URLs are included in `package.json`. Verify their appearance in the Marketplace preview.
- The VSIX includes the project’s 128×128 PNG as `icon.png`, with package metadata and VSIX icon declarations. Microsoft disallows SVG extension icons.
- Review the packaged README links and images in the rendered Marketplace listing. Project documentation links now use absolute GitHub URLs.
- Confirm the display name, description, categories, keywords, compatibility floor, and feature claims against the installed VSIX.

These are readiness concerns observed in the current metadata. They are not guarantees of store rejection. Rebuild and repeat the release checks if any metadata or packaged file changes; a changed package is no longer the previously audited artifact.

## Credentials and later automation

Keep Google credentials, Azure DevOps tokens, Microsoft Entra credentials, GitHub tokens, OAuth secrets, and reviewer passwords out of source, release archives, issue text, screenshots, and workflow logs. The browser package may contain a public OAuth client ID for a public-client device flow; it must not contain a client secret or user token.

Create and validate both initial listings manually first so their immutable store identities, publisher ownership, policy answers, and reviewer instructions are known. Only then add automated updates. Use the store-supported secret or identity mechanism with minimum scope, protected release environments, immutable version/tag checks, and a workflow that uploads the already-audited artifact. Prefer supported OIDC/federated identity where the store offers it; otherwise use a narrowly scoped secret in the CI secret store, never a committed key. Microsoft's guide notes the move toward secure automated publishing with Microsoft Entra ID and the retirement of global Azure DevOps PATs on December 1, 2026. Automation must not silently rewrite listing/privacy answers or publish artifacts that differ from the audited hashes.

## Readiness checklist

- [ ] `v0.12.46` points to the clean checked-out commit and both manifests say `0.12.46`.
- [ ] Full release command passes; the two exact artifacts match `SHA256SUMS.txt`.
- [ ] Chromium ZIP is installed and tested on the pinned public Marble board.
- [ ] Optional authentication, sign-out, and explicit publication are tested where those features are advertised.
- [ ] Chrome developer registration fee is paid and 2-Step Verification is enabled.
- [ ] Chrome listing, screenshots, permission rationales, privacy policy, data-use answers, and reviewer instructions describe actual behavior.
- [ ] Any reviewer credential is dedicated, least privilege, and supplied only through the store dashboard.
- [ ] The uploading Microsoft account belongs to the `wayri` Marketplace publisher.
- [ ] VS Code licensing, repository, icon, README links, support metadata, and listing claims are resolved and the VSIX is rebuilt afterward.
- [ ] Marketplace-installed desktop behavior is smoke-tested; advertised web-host behavior is also checked.
- [ ] No secret, PAT, token, password, private key, or client secret is in Git, an artifact, listing copy, screenshot, or log.
- [ ] Store automation remains deferred until both first listings and a supported secrets/OIDC publishing flow are established.
