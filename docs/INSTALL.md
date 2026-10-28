# Install Pocket KiView

Current GitHub preview: extension 0.12.66 and Android 1.68. Download the packages below; store availability is separate from GitHub release availability.

Choose a prepared package from the [README download buttons](../README.md#downloads) or [GitHub Releases](https://github.com/wayri/KiCad-Github-View/releases). GitHub's automatic **Source code** archives are source checkouts, not installable extensions. The source repository and release downloads are public.

The browser and VS Code editions run on Windows, Linux and macOS. There is no standalone Windows `.exe`, Linux `.deb`/AppImage or macOS `.dmg` installer in the published release. Ordinary viewing does not require KiCad, Python or a rendering server. The optional local Python launcher has separate requirements.

Current release assets: `kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.66.zip`, `kicad-visual-review-firefox-0.12.66.zip`, `kicad-visual-review-vscode-0.12.66.vsix`, and `pocket-kivi-android-phone-tablet-1.68-development.apk`.

## Choose your platform

| Platform | Recommended route | Other options |
| --- | --- | --- |
| Windows | VS Code Marketplace or unpacked Chromium extension | Firefox temporary add-on; source-based local browser launcher |
| Linux | VS Code Marketplace or unpacked Chromium extension | Firefox temporary add-on; source-based local browser launcher |
| macOS | VS Code Marketplace or unpacked Chromium extension | Firefox temporary add-on; Safari development conversion with Xcode |
| Android 8+ | Download the APK from Releases | No Google Play installation is available yet |

## VS Code — Windows, Linux and macOS

1. Install [Visual Studio Code](https://code.visualstudio.com/) 1.95 or newer.
2. In **Extensions**, search for **KiCad Visual Review** by publisher **wayri**, or open the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review), and select **Install**.
3. Open a project folder. Open a `.kicad_sch` or `.kicad_pcb`, then use **Reopen Editor With → KiCad Visual Review**, or run **KiCad: Open Visual Viewer** from the Command Palette.
4. Follow the [VS Code illustrated guide](../vscode-extension/GUIDE.md) for inspection, annotations and visual Git conflict resolution.

For offline/manual installation, download the `.vsix` release asset and use **Extensions: Install from VSIX…**. Select the downloaded file; reload VS Code if prompted. Marketplace and GitHub package versions can differ.

If the `code` command is available, installation works from PowerShell on Windows or Terminal on Linux/macOS:

```sh
code --install-extension wayri.kicad-visual-review
```

For a downloaded VSIX, replace the filename with the actual package:

```sh
code --install-extension ./kicad-visual-review-vscode-0.12.66.vsix
```

On macOS, VS Code's **Shell Command: Install 'code' command in PATH** enables this optional terminal route. The Extensions UI does not need it.

## Chrome / Chromium — Windows, Linux and macOS

1. Download the Chromium extension ZIP and extract it into a permanent folder. On Windows use **Extract All**; on macOS double-click the ZIP; on Linux use the archive manager or `unzip <downloaded-file.zip>`.
2. Check that `manifest.json` is directly inside the selected folder.
3. Open `chrome://extensions` in Chrome/Chromium or `edge://extensions` in Microsoft Edge.
4. Enable **Developer mode**, select **Load unpacked**, and choose the extracted folder containing `manifest.json`.
5. Keep the folder in place. Pin the extension's toolbar icon if desired.
6. Refresh an existing GitHub/GitLab file page, or open extension Options → **Open local KiCad workspace** for files on your computer.

Brave, Opera and Vivaldi can use the same ZIP where their extension manager supports Manifest V3 and **Load unpacked**. Use the browser's Extensions page; browser-specific APIs and validation coverage differ. These are compatibility candidates, not a guarantee that every feature works in every browser. Managed computers may require administrator-approved extension installation.

For local projects, choose **Open folder**, **Open files**, or drag and drop supported files/folders. Folder selection preserves sheet/model paths. Files selected locally stay local unless you explicitly export/share them. The installed local workspace works without internet. See [local workspace details](LOCAL-VIEWER.md).

### Open in KiCad setup

The browser viewer's **Open in KiCad** button saves the repository at its viewed
commit through the browser's Save As dialog, then asks the optional desktop helper
to validate/extract that ZIP into a new sibling folder and launch installed KiCad.
It never overwrites an existing project folder. The feature requests Downloads and
Native Messaging permissions only when used; ordinary viewing needs neither.
Install the Windows helper once using [Open in KiCad setup](OPEN-IN-KICAD.md).
Managed browsers can block native messaging. macOS/Linux native installation and
an installed-browser launch have not yet been validated; use manual ZIP extraction
and opening in KiCad there. A missing helper produces setup instructions rather
than claiming KiCad opened.

For online projects, open a normal repository file page for `.kicad_sch` or `.kicad_pcb`, rather than a raw download URL. Allow the declared host access. Public viewing needs no connected account. Supported private session reads require an explicitly approved matching signed-in tab; API history, binary assets and publication may still require a connected account. Android has its own authorization flow. See [Git host support](GIT-HOSTS.md) and [GitHub sign-in](GITHUB-SIGNIN.md).

**Update:** extract the replacement package, select **Reload** on the extension card, then refresh viewer tabs. Unpacked packages do not update automatically. **Remove:** export local reviews first, then remove the extension through its manager; clearing extension storage can remove local drafts.

## Firefox and derivatives — Windows, Linux and macOS

1. Download the [Firefox 0.12.66 ZIP](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.66/kicad-visual-review-firefox-0.12.66.zip), verify its checksum and extract it.
2. In desktop Firefox 128+, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the extracted `manifest.json`.
3. Click the extension icon for local files/folders, or refresh a GitHub/GitLab design page. Preferences/Options contains optional provider accounts and approved servers.
4. To update, reload its `about:debugging` card after replacing the extracted files and refresh design tabs. Load it again after restarting Firefox.

The unsigned preview is temporary; no permanent signed XPI or AMO listing is supplied. When a signed package is published, use its official AMO page or `about:addons` → settings gear → **Install Add-on From File…** with the **signed XPI**. Renaming a ZIP does not sign it. Export local notes before removing/replacing an installation.

Zen, LibreWolf, current Waterfox and other Firefox derivatives are candidates using the **Firefox** package, not the Chromium ZIP. Their Gecko/API versions and add-on manager must support it; installed acceptance is unverified. The [Firefox/derivative guide](FIREFOX.md) covers vendor references, signing, updates and troubleshooting. Firefox Android extension acceptance is pending; use the Android APK now. Its future signed-XPI route is documented separately there.

Publishers should follow the [Mozilla deployment steps and current consent-metadata blocker](FIREFOX.md#publish-to-mozilla-add-ons-or-distribute-a-signed-xpi) for AMO and signed self-distribution. Keep signature checks and organizational policies enabled.

## Safari — macOS development option

Safari cannot load the Chromium ZIP as a normal extension. The Safari development ZIP needs full Xcode, conversion with its included `convert.sh`, building/signing the generated application, and enabling it in Safari Settings. The target is Safari 16.4+; native conversion and installed-browser verification remain pending. Follow the [Safari guide](SAFARI.md). This is not an iPhone app or a signed App Store release.

## Android — APK installation

1. Download the `.apk` release asset on your Android 8+ phone/tablet, or copy it from your computer. Do not download the `.aab` for direct installation.
2. Open the APK. If Android blocks installation, allow **Install unknown apps** for the specific browser/file manager you used, install it, then turn that permission off if no longer needed. Menu labels vary by device.
3. Open **Pocket KiView**. Import a project folder/ZIP through the app's file picker, or browse a supported repository.
4. Updates are manual: download and install the newer APK over the existing app when its package and signing identity match.

The current GitHub 1.68 APK is a **development-signed preview**. It is not a Play Store release. Development and future distribution/Play signing identities may differ. If Android reports a signature conflict, preserve/export projects and review state before deciding how to migrate; do not immediately uninstall or clear app data. Installing an older version over a newer version may also be rejected.

Android Chrome does not provide the desktop **Load unpacked** workflow. Use the Android app rather than trying to install the desktop extension in mobile Chrome.

## Optional local browser launcher from source

For a browser interface beside KiCad, the extension file picker is the simplest route and needs no Python. Alternatively, from a source checkout with Python 3.10+ and the bundled viewer dependencies present, launch the loopback server:

Windows (PowerShell, repository root):

```powershell
py -m kicad_vizdiff.local_viewer --project "C:/designs/my-board"
```

Linux / macOS (Terminal, repository root):

```sh
python3 -m kicad_vizdiff.local_viewer --project "/path/to/my-board"
```

Keep the process running while viewing; stop it with **Ctrl+C**. Closing the browser tab alone does not stop it. Save edits in KiCad, then use **Reload saved project**; unsaved KiCad editor state is not synchronized. The optional legacy PCB ActionPlugin and its installation path depend on your KiCad build. See [the complete local launcher guide](LOCAL-VIEWER.md). No KiCad installation is required to view already saved sources.

## Verify downloads

Use the release's `SHA256SUMS.txt` and compare the digest for the file you downloaded.

Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 "C:/Downloads/downloaded-file.zip"
```

Linux:

```sh
sha256sum downloaded-file.zip
```

macOS:

```sh
shasum -a 256 downloaded-file.zip
```

A matching hash verifies bytes against the published checksum; it is not a publisher signature. See `release-manifest.json` for the release's source/version evidence.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Extension folder rejected | Extract the archive; select the folder directly containing `manifest.json` |
| Toolbar button appears to do nothing | Confirm the extension is enabled, check host permission, reload it and refresh the repository tab; use Options to open the local workspace |
| VS Code shows source text | Use **Reopen Editor With → KiCad Visual Review** and confirm the extension is enabled |
| Private project returns 404/403 | Verify the matching host, repository access and account connection; a 404 may hide denied access |
| Viewer chrome loads but controls fail | In updated builds, read the startup-error panel and use Options → Connection and browser checks; see [startup diagnostics](VIEWER-RELIABILITY.md) |
| Managed Chrome/Edge cannot open public files | Ask IT to check `ExtensionSettings` runtime hosts and network access to GitHub, its API and raw source host; the extension cannot override policy |
| Missing sheet/model | Import the whole project folder; inspect relative paths, format/size warnings and library references |
| APK will not install | Check Android version, free storage, version downgrade and signing identity; preserve data before migration |
| Download requires sign-in | This GitHub repository/release is still private; request access or wait for public availability |

Continue with the [user guide](USER-GUIDE.md). Report reproducible problems to [support.kivi@sigharmonic.com](mailto:support.kivi@sigharmonic.com), including version, operating system, steps and a non-confidential sample. Do not send credentials or private designs without authorization.
