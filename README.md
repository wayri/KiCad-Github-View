# KiCad GitHub View

**Interactive KiCad review inside GitHub and public GitLab.com file pages.** Open schematics and PCB layouts as drawings, inspect saved parts and nets, compare revisions, and anchor review notes to the design. The viewer runs in the browser with our own schematic/PCB engine and the owner-authorized SPIKE 3D adapter. No KiCad installation, local companion process or rendering server is needed for the browser extension.

[Download v0.11.5](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.11.5) · [Install](docs/INSTALL.md) · [Comment integration](docs/COMMENTS.md) · [Git services](docs/GIT-HOSTS.md) · [Release notes](docs/releases/v0.11.5.md)

**Status: preview release.** Source designs are read-only: no routing, schematic editing or automatic design changes. This project is not affiliated with KiCad, GitHub or GitLab. Browser-store and VS Code Marketplace listings are not published. Public repository previews are supported; browser access to private repositories is not implemented. See the limitations below before relying on a view for engineering review.

## What you can do

| Workspace | Review capabilities |
| --- | --- |
| Schematics | Dedicated drawing viewer, paper/border/title block, parts and saved properties, loaded sheet hierarchy, Back/Forward/Up/Root navigation, sheet selection and double-click navigation |
| PCB layouts | Copper, pads, tracks, vias and saved filled zones; layer visibility and focus; board flip; independent light/dark UI and drawing themes; part and net inspection |
| Search and highlighting | Project search with field filters, wildcard and bounded regex queries; single or multiple component/net/net-class highlights; connection navigation and fit highlights |
| Measurement | Live distance, X/Y and angle display; mm/mil units; geometry/grid snapping; pinned measurements; saved Edge.Cuts bounding dimensions |
| Comparison | Select branches or commits; inspect added, removed and modified saved objects and before/after properties; linked base/head camera views; GitHub pull-request file previews including public fork heads |
| Review notes | Part, point and rectangular area anchors; severity, tags, mentions, timestamps, read/unread state, Open/Skipped/Resolved/Won't fix triage; optional visible 2D area captures |
| Project inspection | Compact project tree; saved project settings, constraints, net classes, layer details and physical stackup where present; read-only forms and tables |
| Fabrication | Browser Gerber/drill viewer with disclosed unsupported constructs; file selection and layer review |
| Assembly and analytics | BOM/Stats, JSON/CSV assembly variants, fitted/DNP counts and highlights, component navigation, saved board/zone/copper statistics |
| 3D | SPIKE board preview, source footprint/model transforms and repository-linked WRL/VRML or self-contained GLB assets; missing models have procedural proxies |
| HTML/iBOM | Isolated preview for self-contained HTML; interactive browser preview has no network or extension bridge; VS Code uses a static preview |

Properties and analytics come from the saved source revision. Missing settings are not fabricated. Imported ERC/DRC JSON reports provide visual markers and navigation; the browser does not run KiCad's ERC or DRC engine.

## Install in Chrome or Edge

1. Download **`kicad-visual-review-extension-0.11.5.zip`** from [Releases](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.11.5). The GitHub **Source code** archives are not the prepared extension package.
2. Extract the ZIP into a permanent folder. Select the folder containing `manifest.json`, not the ZIP itself.
3. Open `chrome://extensions` in Chrome/Chromium or `edge://extensions` in Edge.
4. Enable **Developer mode**, select **Load unpacked**, and choose that folder.
5. Allow the extension on `github.com` and `gitlab.com`. Open a public KiCad file page and refresh it. The drawing appears in the repository's file preview.

Keep the extracted folder in place. To update, extract the new package there, click **Reload** on the extension card, and refresh repository tabs. Pin the toolbar icon for quick access; the toolbar button or `Alt+Shift+K` focuses the inline viewer. **Show source** returns to the text view; **Open full viewer** and **Pop out** provide larger views.

Chrome's unpacked workflow is documented in [Chrome's developer guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked); Edge provides [its sideloading guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading). Managed browsers may prohibit developer installations. There is no signed CRX or automatic browser-store update channel in this release.

See [the full installation guide](docs/INSTALL.md) for Brave, other Chromium browsers, updates, troubleshooting, checksums and VS Code.

## Browser compatibility

| Browser/platform | Current status |
| --- | --- |
| Desktop Chrome / Chromium | Primary Manifest V3 target; unpacked release package |
| Desktop Microsoft Edge | Same Chromium package and Load unpacked workflow; separate installed-browser acceptance remains necessary |
| Desktop Brave | Chromium candidate using the same package; not independently verified |
| Other desktop Chromium browsers, including Opera/Vivaldi | May load the same package if their extension manager supports Manifest V3 and required APIs; browser-specific smoke testing is pending |
| Firefox | No Firefox package yet; requires a background-runtime port and API/storage/file-access validation |
| Safari | No Safari extension package or signing/distribution integration yet |
| Mobile browsers | Not supported by this release |
| VS Code Desktop | Separate VSIX using the shared read-only viewer |
| github.dev / VS Code web hosts | Web entry point exists; actual hosted installation and filesystem behavior need separate validation |

The Chromium ZIP is not advertised as a Firefox or Safari add-on. Firefox uses different background requirements; see [Mozilla's background manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). Browser rendering fixtures and transport tests are not proof of acceptance in every installed browser.

## Git service compatibility

| Service | Inline file drawings | Revision comparison | Remote review integration |
| --- | --- | --- | --- |
| GitHub.com, public repositories | Schematic/PCB and project file previews; pull-request file cards | Branch/commit picker and PR merge-base comparisons | Explicit issue/discussion/PR publication with configured authentication; issue/PR marker readback |
| GitLab.com, public repositories | File pages, including subgroup namespaces | Manual branch/commit picker | Local notes and JSON export only |
| Self-hosted GitLab / GitHub Enterprise | Not implemented | Not implemented in browser | Not implemented |
| Bitbucket / Azure DevOps / Gitea / Forgejo | Not implemented | Not implemented in browser | Not implemented |
| Any service checked out locally in VS Code | Saved workspace files are host-independent | No native VS Code revision comparison yet | Local Git-trackable review sidecar; no direct publication |

GitLab login, private repository previews, merge-request cards and issue publication remain pending. The extension grants permissions only to its supported hosts; it does not send GitHub credentials to GitLab. See [host compatibility and adapter boundaries](docs/GIT-HOSTS.md).

## Using the viewer

Open a `.kicad_sch` or `.kicad_pcb` **file page**, rather than its raw download URL. Use **Explorer** to choose Parts, Sheets, Nets, Search, BOM/Stats, ERC/DRC or Layers. Click a part to inspect saved properties; inspect connected nets or choose several highlights using **Multihighlight**. **Project** opens the file structure and setup views. **Split schematic + PCB** displays a paired view with shared part/net selection where saved identities resolve uniquely.

Useful shortcuts with the drawing focused:

| Action | Shortcut/control |
| --- | --- |
| Zoom / pan | Pointer-anchored mouse wheel / right or middle drag |
| Fit drawing / fit sheet | `F` / `Home` |
| Properties / net highlight | `E` / `H` |
| Search / comments | `/` / `C` |
| Measure / drawing theme | `M` / `D` |
| Enter a subsheet | Double-click the sheet symbol or select it and press `Enter` |
| Sheet history / parent / root | `Alt+Left`, `Alt+Right` / `Alt+Up` / `Alt+Home` |
| Layer focus | `[` and `]`; `Shift+F` fits focused layer; `Escape` restores visibility |

Text fields retain normal typing behavior. Reused hierarchy instances currently share file views; complete instance-specific connectivity is not resolved. Page setup overrides are for viewing and do not modify the source or implement arbitrary custom worksheet templates.

For detailed workflows see [search/highlights](extension/docs/search-and-highlights.md), [project/Gerbers](extension/docs/project-workspace.md), [BOM/analytics](extension/docs/bom-analytics.md), [variants](docs/variants.md), [HTML preview](extension/docs/html-preview.md) and [revision comparison](extension/docs/git-revisions.md).

## How comments integrate with Git and GitHub

There are two separate review records: a **Git-trackable local annotation file** and an optional **GitHub thread**. Saving a note does not post to GitHub, create a commit, push a branch or edit a drawing.

1. In **Review**, create a part note, click a point or draw an area. Set text, severity, tags, mentions and state. Save the note.
2. Without a connected file, the browser keeps notes in device storage. In extension settings, connect/create **`.kicad-review.json`** inside a local checkout to use it as the review store. Stage, commit and push that file with normal Git tools. Existing browser notes need explicit export/import when changing stores.
3. For remote publication, open **GitHub sign-in and review file**. Use a personal access token or configure a registered OAuth App client ID with Device Flow enabled. No production OAuth client ID is bundled. Tokens stay in browser session storage and are excluded from review JSON.
4. Choose a new/existing issue, new/existing discussion, or the current PR; for a new discussion, select a category. Click **Publish to GitHub** on the saved note. A successful request records the remote URL in the note. **Open GitHub composer** prepares a manual post without submitting it.
5. Public issue/PR readback recognizes the extension's validated annotation markers for the matching repository, revision and drawing. Discussion readback and automatic two-way state synchronization are not implemented.

Review notes retain repository/ref/file, saved object identity or millimetre position/area, variant, creation/update times and lifecycle metadata. Changing a note to Resolved or Skipped changes review metadata; it does not close a GitHub issue or edit an earlier post. Captured PNGs remain in the local/exported review record: download and attach them manually in GitHub's composer. API publication excludes image attachments. Mentions saved locally do not notify anyone until text is posted remotely, subject to GitHub behavior.

Repository owners can provide `.kicad-review-policy.json` to restrict the extension's authenticated publication workflow. The policy is a viewer-side publishing check, not a replacement for GitHub repository permissions and not a way to prevent people posting directly on GitHub. GitLab notes remain provider-isolated local/exportable records; VS Code writes a local sidecar without token publication.

Read [the complete comment guide](docs/COMMENTS.md) for authentication, permissions, the exact policy schema, file access, conflicts, retry handling and limitations.

## VS Code installation

Download **`kicad-visual-review-vscode-0.11.5.vsix`** from Releases. In VS Code run **Extensions: Install from VSIX**, select the file and run **Developer: Reload Window**. Open a KiCad project folder and use **KiCad: Open Visual Viewer** or **Reopen Editor With → KiCad Visual Review**. The **KiCad Review** explorer lists saved drawings and review sidecars.

```sh
code --install-extension kicad-visual-review-vscode-0.11.5.vsix --force
```

Local notes use `.kicad-review.json` in the workspace root (or drawing directory outside a workspace). Filesystem-provider permissions still apply. The VSIX is not currently published in Visual Studio Marketplace. See [the VS Code guide](vscode-extension/README.md).

## Browser extension, GitHub App and local reports

| Delivery | Purpose | Requirements |
| --- | --- | --- |
| Browser extension ZIP | Embeds interactive previews directly in supported Git websites | Installed separately in each user's desktop browser |
| VS Code VSIX | Opens saved workspace files in visual custom editors | VS Code and a workspace filesystem provider |
| Optional GitHub App / hosted viewer ZIPs | Adds PR checks linking to a standalone browser viewer | App registration, HTTPS hosting and service configuration |
| Optional Python tool / GitHub Action | Produces KiCad-authored SVG and pixel-comparison HTML reports | Python 3.10+, Git and installed KiCad CLI 9+ |

A GitHub App cannot replace the built-in file preview or install the browser extension. The optional service processes signed webhook metadata; browser rendering stays client-side. No production App deployment, Marketplace billing integration or registered OAuth client is supplied. See [the App guide](docs/github-app.md).

For local native reports:

```sh
python -m pip install -e .
kicad-vizdiff doctor
kicad-vizdiff view hardware/controller.kicad_sch --open
kicad-vizdiff diff hardware/controller.kicad_pcb --base main --head HEAD --open
```

Pass the root schematic to include child sheets. The native report supports side-by-side, overlay, swipe and changed-pixel views; these should not be confused with the browser extension's saved-object comparison. [`action.yml`](action.yml) and [the example PR workflow](.github/workflows/visual-review.yml) provide optional runner-based reports.

## Rendering and engineering limits

Recognized KiCad 9/10 saved constructs use the shared parser; native reference fixtures were exported with KiCad 10. Future generator versions, including KiCad 11 headers, are accepted as **forward previews** with warnings; this is not full KiCad 11 certification. See [version handling](extension/docs/version-compatibility.md).

The browser viewer is not pixel-identical to KiCad. Browser font metrics, custom worksheets, bitmap images and specialized constructs remain incomplete or approximate and should be checked against native KiCad. Nets are inferred from saved geometry; buses, implicit pins and complete cross-sheet/instance connectivity are not fully resolved. Saved-object comparison is not an electrical equivalence check.

3D loads repository-linked supported assets, not installed KiCad model libraries. STEP is unsupported. Missing models have proxies; GLB coordinates currently use millimetres. Gerber macros, curved regions, step-repeat and drill slots have documented limits. Copper/zone analytics are saved polygon sums, not a validated physical union or manufacturing sign-off. Retrieval, search, reports and annotation storage are bounded; API rate limits and omitted data are disclosed.

## Build, verify and release

Python 3.10+, Node 22+ and Git are required for packaging/tests. KiCad is optional except for native-reference checks.

```sh
python -m pip install '.[github]'
python scripts/release.py --output dist/release
```

The release gate prepares shared VS Code assets, runs Python and JavaScript tests, audits ZIP/VSIX inventories and writes `release-manifest.json` plus `SHA256SUMS.txt`. Each release identifies its source commit. Automated tests and local browser fixtures do not substitute for live browser-store acceptance or testing every browser/service combination.

To publish a new version, update both manifests and release documentation, commit, create the matching version tag and push it. The tag workflow builds verified assets and publishes a prerelease. See [release instructions](docs/RELEASING.md) and [CI details](docs/release-ci.md). Ordinary code pushes run CI without publishing.

## Licensing and support

Owner: Yawar ([wayri](https://github.com/wayri)). **No blanket open-source license is granted.** The owner plans a commercial integration and a separately licensed open-source GUI engine later. Public source availability does not assign that future license. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Report reproducible problems through [repository Issues](https://github.com/wayri/KiCad-Github-View/issues), including browser/version, public file URL or a shareable minimal fixture, expected behavior and the visible diagnostic. Exclude tokens, private files and credentials. Design/rendering limitations, Git host ports and browser ports can also be discussed there.
