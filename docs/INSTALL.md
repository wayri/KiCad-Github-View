# Install KiCad GitHub View v0.12.26

Download packages from [the v0.12.26 release](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.12.26). The browser viewer needs no Python, KiCad installation or rendering server. Use a desktop browser with the required extension APIs. Public files work without account setup. Private GitHub file, project and supported model reads require an extension token with access to that repository; website sign-in alone does not authorize the extension. Private GitLab project, file and model reads require an account connected to the selected GitLab server. Authorized private GitHub annotation readback is supported; authorized private PR comparison is supported.

## Choose a package

| Download | Use |
| --- | --- |
| `kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.26.zip` | Chrome, Edge, Brave, Opera, Vivaldi and other desktop Chromium browsers |
| `kicad-visual-review-firefox-0.12.26.zip` | Unsigned Firefox 128+ development extension |
| `kicad-visual-review-safari-0.12.26.zip` | Safari 16.4+ macOS development payload and conversion helper |
| `kicad-visual-review-guides-0.12.26.zip` | Illustrated GitHub and GitLab guides and documentation |
| `kicad-visual-review-step-source-0.12.26.zip` | Pinned STEP dependency sources, licenses and rebuild recipe |
| `kicad-visual-review-vscode-0.12.26.vsix` | Read-only KiCad editors inside VS Code |
| `kicad-visual-review-app-web-0.12.26.zip` | Optional standalone hosted viewer payload |
| `kicad-visual-review-github-app-0.12.26.zip` | Optional GitHub App service/deployment sources |
| `SHA256SUMS.txt` and `release-manifest.json` | Package integrity checks and source/version evidence |
| `COMMENTS.md` and `GIT-HOSTS.md` | Comment workflow and service compatibility |

GitHub's automatically generated **Source code** ZIP/tarball contains the project sources. It is not the prepared browser package or VSIX. A GitHub release does not install an extension automatically, and no browser-store listing is supplied in this preview.

## Chrome and Chromium

1. Download the **extension ZIP** and extract all files into a permanent folder, such as `KiCad-GitHub-View/extension`.
2. Open that folder and confirm `manifest.json` is directly inside it. Do not select the ZIP, its parent folder, or a nested source repository root.
3. Enter `chrome://extensions` in the browser address bar.
4. Enable **Developer mode**, then select **Load unpacked**.
5. Choose the folder containing `manifest.json`. The extension card should show **KiCad Visual Review for GitHub and GitLab** and version **0.12.26**.
6. Open the card's **Details** if needed and allow site access for `github.com` and `gitlab.com`. The background worker also reads GitHub's API through the declared permission.
7. Open or refresh a public `.kicad_sch` or `.kicad_pcb` file page on a supported website. Use the normal repository file page, not the raw download endpoint.
8. Pin the extension in the toolbar if desired. Its button or `Alt+Shift+K` focuses the inline preview.

The official [Chrome unpacked-extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) explains Developer mode. Keep the extracted folder in place: the browser loads files from it. This is an unpacked developer installation, not a signed CRX or Chrome Web Store installation.

No GitHub account or token is required for public viewing. Authentication enables authorized private file reads and explicit review publication. Website login alone does not authenticate the extension.

## Microsoft Edge

Use the same extension ZIP. Open `edge://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the extracted folder containing `manifest.json`. Allow the declared websites and refresh the repository page. Follow [Microsoft's sideloading instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading) if the controls differ in your version.

Edge uses the Chromium package; there is no separate Edge Add-ons listing yet. Its installed-browser behavior and local review-file picker still require browser-specific validation.

## Brave and other Chromium browsers

Brave is a Chromium candidate for the same package. Open its Extensions manager (usually `brave://extensions` or `chrome://extensions`), enable Developer mode and select **Load unpacked** if available. Permit the supported websites and refresh them. Brave has not been independently verified for this release.

Opera, Vivaldi and other desktop Chromium browsers may support the same workflow through their Extensions manager. The package requires Manifest V3, a service worker, extension frames/storage and the relevant website permissions. The optional connected review sidecar also requires File System Access pickers in the extension Options page. If those pickers are unavailable, keep browser-local notes and export JSON manually. These browsers are compatibility candidates, not verified release targets.

Corporate policies can block developer installations or site access. Use an administrator-approved installation route when Developer mode or Load unpacked is disabled; this project does not provide enterprise deployment policy files.

## Firefox, Safari and mobile

Firefox: extract the dedicated Firefox ZIP, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and select `manifest.json`. It requires Firefox desktop 128+. This unsigned installation ends when Firefox restarts. See [Firefox instructions](FIREFOX.md).

Safari: extract the dedicated Safari ZIP on a Mac, run its `convert.sh` helper with a new project directory and your bundle identifier, then build/sign the generated app in Xcode and enable its extension in Safari Settings. The target is Safari 16.4+ on macOS. See [Safari instructions](SAFARI.md). Native conversion and installed-browser verification have not been performed on this Windows workstation.

Neither package is a signed store release. Firefox repository HTML is static; Safari repository HTML preview is disabled. Use review JSON import/export for local Git tracking in these browsers. Mobile browser installation is not verified.

The shared rendering engine is browser-side, but this alone does not establish extension compatibility. Future browser ports need their own packaged and installed-browser tests.

## Update or remove the unpacked extension

For an update, extract the new release into the same installation folder, replacing the package files; click **Reload** on the extension card and refresh open repository pages. Confirm the new version. Review any newly declared site permissions. There is no automatic update channel for the unpacked package.

Export browser-local notes before removing the extension or clearing its storage. A connected `.kicad-review.json` in your checkout is a separate file; removing the extension does not stage, commit or push it. File permissions may need renewal after a restart. See [comment storage](COMMENTS.md).

## First review

Use **Explorer** for parts, nets, sheets, layers and search; **Inspect** for saved properties; **Review** for notes; **Project** for the repository file tree and saved setup. **Git revisions** loads bounded branch/file-commit lists: choose base and head, then **Compare revisions**. Source refs resolve to commit SHAs. GitHub PR file cards use PR context; GitLab.com has manual comparison but no merge-request card integration.

Schematics offer Back/Forward/Up/Root controls. **Split schematic + PCB** and **Pop out** support parallel review. Use `F` to fit drawings, `Home` for the sheet, `E` for properties and `M` for a live snapped ruler. The visible keyboard guide lists contextual controls. Routing and source editing are unavailable.

GitLab supports subgroup namespaces and authorized private projects. In Options → **GitLab accounts and servers**, connect a token or configure OAuth for the selected server. For self-hosted GitLab, enter an exact HTTPS origin and choose **Grant server access**. Publish notes to new issues or discussions within existing issues. Merge-request cards and server URL subpaths remain unsupported. See [Git host compatibility](GIT-HOSTS.md) and the [illustrated GitLab guide](using-gitlab-integration/README.md). GitLab OAuth requires a non-confidential public Application ID registered on the selected server, its exact browser redirect URI and `api` scope. No publisher GitLab ID is bundled; use token connection if the browser identity API is unavailable.

## VS Code

Download the VSIX. Run **Extensions: Install from VSIX**, choose `kicad-visual-review-vscode-0.12.26.vsix`, then run **Developer: Reload Window**. Open a saved project folder and choose **KiCad: Open Visual Viewer** or **Reopen Editor With → KiCad Visual Review**. The KiCad Review explorer lists saved drawings and sidecars.

```sh
code --install-extension kicad-visual-review-vscode-0.12.26.vsix --force
```

The custom editor uses the workspace filesystem provider. Native notes use the Git-trackable `.kicad-review.json` sidecar, without token publication or native revision comparison. HTML previews are static in VS Code. The web entry point exists, but actual github.dev installation and filesystem behavior need separate hosted validation. See [the VS Code guide](../vscode-extension/README.md).

## Optional GitHub App

The app-web ZIP is a hosted viewer payload; the github-app ZIP contains the service and deployment sources. Neither changes GitHub's built-in renderer or installs a browser extension. Follow [the App guide](github-app.md) to register an App, configure HTTPS hosting and install Python extras. No production host, private key or Marketplace listing is supplied. The browser package includes its registered GitHub public OAuth client ID; GitLab OAuth needs separate per-server/browser registration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Load unpacked rejects the folder | Extract the ZIP fully; select the folder directly containing `manifest.json` |
| No visual preview | Confirm the extension is enabled and allowed on that host; refresh a public supported file page; raw URLs and unsupported hosts are not mounted |
| Chrome says an embedded page is blocked | Reload the extension after a manifest update, refresh the file page, and record the blocked frame URL/console diagnostic if it persists |
| HTTP error, missing source or incomplete tree | Public access, API rate limits, file/repository limits and the requested revision; private projects require authorized credentials for the correct server; 404 may conceal denied access |
| GitLab source view remains visible | Page repository/ref/file metadata or the preview container may be unavailable; the extension leaves the source intact |
| Child sheet or 3D model missing | Check the saved relative path and repository asset at that revision; installed KiCad libraries and STEP are not loaded |
| GitHub HTTP 403 / rate limit | Connect your account in extension Options, then retry after the displayed reset time. API reads use the configured session account. Public file reads can fall back to raw content; project structure and history still require API access. Reload the updated extension and allow its raw.githubusercontent.com site permission. |
| GitHub publishing unavailable | Configure token/device sign-in in Options, check destination permissions and repository policy; GitLab needs its own server account; VS Code remote publication is not implemented |
| Review file cannot save | Renew file permission, inspect visible conflict/validation errors, or export notes before changing stores |

For a report, include browser/version, a public URL or shareable fixture, and the visible error. Do not include credentials or private design files.

## Checksums and limits

Compare downloads with `SHA256SUMS.txt`. On Linux/macOS run `sha256sum --check SHA256SUMS.txt` in the download folder. In PowerShell use `Get-FileHash -Algorithm SHA256 <file>` and compare the digest. SHA-256 detects changed bytes; it is not a publisher signature. `release-manifest.json` binds versions and package hashes to the source commit.

The renderer has documented fidelity limits. KiCad 11 is a forward preview, STEP is unsupported, zone statistics are polygon sums, and several Gerber/drill constructs are incomplete. Read [the project README](../README.md) and release notes. Installed Chrome/GitLab acceptance, browser-store review and every candidate browser/service combination are not established by local automated tests.
