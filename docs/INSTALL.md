# Install KiCad Visual Review v0.11.4

## Browser extension: inline on GitHub

1. Download `kicad-visual-review-extension-0.11.4.zip` from this release and extract it into a permanent folder.
2. Open `chrome://extensions` (or `edge://extensions`), enable Developer mode and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`. Keep that folder in place.
4. Open a public `.kicad_sch` or `.kicad_pcb` file on GitHub and refresh the page. The visual preview appears inside the file page.

When updating an existing unpacked installation, replace its files and click Reload on the extension card, then refresh GitHub. The release ZIP is an unpacked developer installation; it is not a Chrome Web Store listing or a signed CRX installer.

Open **Git revisions** to load branches and commits touching the drawing, select base/head and choose **Compare revisions**. Revisions resolve to commit SHAs. **Project** exposes the saved file tree, setup, constraints, stackup, fabrication files and HTML previews. **BOM / Stats** exposes assembly counts and saved board statistics. Global search supports `ref:glob:R*` and `type:footprint ref:regex:^R[0-9]+$`.

## VS Code

Download `kicad-visual-review-vscode-0.11.4.vsix`, run **Extensions: Install from VSIX**, and select the file. Open a saved KiCad drawing or run **KiCad: Open Visual Viewer**. If needed choose **Reopen Editor With → KiCad Visual Review**. After an update, run **Developer: Reload Window**.

```sh
code --install-extension kicad-visual-review-vscode-0.11.4.vsix --force
```

The extension uses the workspace provider and read-only custom editors. GitHub comment publication is currently a browser-extension feature; native notes use the Git-trackable review sidecar. HTML previews in VS Code are static; self-contained interactive iBOM runs in the browser extension. Actual github.dev deployment still needs separate hosted validation.

## Optional GitHub App / hosted viewer

The `app-web` ZIP is a hosted viewer payload. The `github-app` ZIP contains the service and deployment sources. Neither installs a browser extension or changes GitHub's built-in file renderer. Follow the bundled `docs/github-app.md` to register an App, configure an HTTPS host and install Python extras. No production host, private key or OAuth client ID is supplied by this release.

## Checksums and support

Compare downloaded files with `SHA256SUMS.txt`. On Linux/macOS, run `sha256sum --check SHA256SUMS.txt` from the download folder (install a SHA-256 utility if unavailable). In PowerShell, use `Get-FileHash -Algorithm SHA256 <file>` and compare the digest. Checksums detect file changes; they are not a publisher signature.

Design files remain read-only. Browser glyphs and some constructs are approximate or unsupported. KiCad 11 is a forward preview, zone statistics are saved polygon sums, STEP models are unsupported, and Gerber macros/curved regions/step-repeat/drill slots have documented limits. Read the release notes before using the viewer for engineering decisions.

## GitLab.com

After reloading the extension, allow its GitLab.com site access and open a public repository file page. Subgroup namespaces and manual branch/commit comparisons are supported. GitLab notes stay local until exported manually; private repositories, remote issue publication, merge-request cards and self-hosted instances are not included. See [host compatibility](GIT-HOSTS.md).
