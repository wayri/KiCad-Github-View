# Store publishing for 0.12.28

This is the manual first-listing procedure for the Chromium browser extension and the VS Code extension. The repository's packaging code builds and audits downloadable files; it deliberately does not sign in to a store, create a listing, or publish one.

## Build the exact submissions

Use a clean checkout whose `extension/manifest.json` and `vscode-extension/package.json` both say `0.12.28`. Run the release builder from the repository root:

```powershell
python scripts/release.py --tag v0.12.28 --output dist/release-0.12.28
```

The command requires the checked-out commit to be the local `v0.12.28` tag, a clean working tree, reviewed `docs/releases/v0.12.28.md`, and passing Python and JavaScript checks. It then audits each archive against the explicit package inventories and writes hashes. Upload only these two results:

- Chrome Web Store: `dist/release-0.12.28/kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.28.zip`
- Visual Studio Marketplace: `dist/release-0.12.28/kicad-visual-review-vscode-0.12.28.vsix`

Check both names in `SHA256SUMS.txt`, retain `release-manifest.json`, and install each artifact locally for a final smoke test. Do not upload the Firefox, Safari, guides, web-app, GitHub-App, or STEP-source ZIP in place of the Chromium ZIP.

For an untagged packaging check, `python scripts/package_extension.py` writes the Chromium ZIP under `.vizdiff/`, and `python scripts/package_vscode.py` writes the VSIX under `build/`. Those commands do not run the full release checks and are not the preferred source of a store submission.

## Chrome Web Store

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Register the publishing Google account, accept the agreement, pay Google's one-time registration fee, and enable 2-Step Verification. Both registration and 2-Step Verification are prerequisites in Google's current documentation: [register a developer account](https://developer.chrome.com/docs/webstore/register/) and [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies).
2. Choose **New item**, upload `kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.28.zip`, and complete the listing. The package is the required ZIP with `manifest.json` at its root; see [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare/) and [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/).
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

The Marketplace identity is fixed by `vscode-extension/package.json`: publisher `wayri`, extension name `kicad-visual-review`, version `0.12.28`. The Microsoft/Azure DevOps account doing the upload must own or be a member of the existing **wayri** publisher. Do not change the publisher merely to bypass ownership; either use that publisher account or arrange publisher membership/transfer through the owner.

1. Sign in to the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and select the `wayri` publisher.
2. Choose **New extension → Visual Studio Code**, select `kicad-visual-review-vscode-0.12.28.vsix`, review the generated listing, and upload it. Microsoft's official guide documents both this manual route and `vsce`: [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
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

- [ ] `v0.12.28` points to the clean checked-out commit and both manifests say `0.12.28`.
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
