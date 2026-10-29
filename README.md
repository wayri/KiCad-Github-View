<p align="center">
  <img src="docs/play-store/assets/store-icon-512.png" alt="Pocket KiView app icon" width="112" height="112">
</p>

# Pocket KiView

**Your KiCad project, ready for review—at your desk or at the bench.**

Explore schematics and PCB layouts, follow nets, measure geometry, work through a BoM and carry review notes between devices. Use the Chromium extension, VS Code, or an Android phone/tablet. Ordinary viewing needs no KiCad installation or rendering server.

[![CI](https://github.com/wayri/KiCad-Github-View/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wayri/KiCad-Github-View/actions/workflows/ci.yml)
[![Release asset downloads](https://img.shields.io/github/downloads/wayri/KiCad-Github-View/total?label=release%20downloads&color=2ea44f)](docs/DOWNLOAD-STATS.md)
[![Status](https://img.shields.io/badge/status-preview-orange)](#downloads)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20Linux%20%7C%20macOS-555)](docs/INSTALL.md)
[![KiCad formats](https://img.shields.io/badge/KiCad-8%20%7C%209%20%7C%2010-314CB0)](docs/KICAD-COMPATIBILITY.md)

[Illustrated user guide](USER-GUIDE.md) | [Installation](docs/INSTALL.md) | [Release notes](https://github.com/wayri/KiCad-Github-View/releases) | [Report an issue](https://github.com/wayri/KiCad-Github-View/issues) | [Contact support](mailto:support.kivi@sigharmonic.com)

## Downloads

**Release 0.12.75 / Android 1.75:** detachable browser views, linked cross-selection, improved project-model path recovery and experimental Fast PI. Store approval is separate from GitHub downloads. Chrome 0.12.75 is submitted and pending review. VS Code Marketplace 0.12.75 is uploaded and verifying. Mozilla remains disabled pending its existing appeal. Android uses the development signing channel; no Google Play release is claimed. [Channel details](docs/RELEASE-STATUS.md).

The live counter above totals GitHub release-asset downloads, including downloads initiated by KiCad PCM **when its package URL points to a GitHub release asset in this repository**. GitHub does not expose a browser-versus-PCM breakdown or unique install count. No PCM package/repository is currently configured here, and downloads hosted elsewhere are not included. [What the counter measures](docs/DOWNLOAD-STATS.md).

[![Download Android APK](https://img.shields.io/badge/Android-Download%20APK%201.75-3DDC84?logo=android&logoColor=white)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/pocket-kivi-android-phone-tablet-1.75-development.apk)
[![Download Chromium extension](https://img.shields.io/badge/Chrome%20%2F%20Chromium-Download%20ZIP-4285F4?logo=googlechrome&logoColor=white)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.75.zip)
[![Download VS Code VSIX](https://img.shields.io/badge/VS%20Code-Download%20VSIX%200.12.75-007ACC)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/kicad-visual-review-vscode-0.12.75.vsix)

| Edition | Download / install | Availability |
| --- | --- | --- |
| Android | APK button above | Android 8+; published 1.75 preview, development-signed; manual installation and updates |
| Chrome, Edge, Brave, Opera, Vivaldi, Chromium | Chromium ZIP button above | Published 0.12.75 preview; extract and load unpacked; candidate browsers have differing validation coverage |
| VS Code | [Marketplace](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review) / [offline VSIX 0.12.75](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/kicad-visual-review-vscode-0.12.75.vsix) | Windows, Linux and macOS; VS Code 1.95+; Marketplace and GitHub versions may differ |
| Firefox / compatible derivatives | [Development ZIP 0.12.75](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/kicad-visual-review-firefox-0.12.75.zip) | Firefox desktop 140+; unsigned temporary add-on; Zen/LibreWolf/Waterfox candidates unverified; [install, signing and Mozilla publishing](docs/FIREFOX.md) |
| Safari | [Development ZIP 0.12.75](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/kicad-visual-review-safari-0.12.75.zip) | macOS Safari 16.4+; requires Xcode conversion/signing; native verification pending; [instructions](docs/SAFARI.md) |

Browser/desktop downloads above are the [v0.12.75 GitHub preview](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.12.75). Android 1.75 is included in the same release. Store channels are updated separately. The source repository and GitHub downloads are public.

<details>
<summary>Release versions, checksums and Android signing</summary>

Release packages are built from the tagged source; screenshots show several retained development versions and may differ from the packaged UI. The Chrome Store link above is the existing public listing; its approved version can lag GitHub. No Google Play installation is advertised here.

Compare preview downloads with [SHA256SUMS.txt](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.75/SHA256SUMS.txt). An AAB is a Play upload bundle, not a directly installable Android app. Preserve/export projects and review state before changing signing channels; do not uninstall merely to bypass a signature mismatch. [Installation and updates](docs/INSTALL.md).

</details>

## Get started

Browser update 0.12.75: click the extension toolbar icon on a repository to detect KiCad projects and open a standalone viewer tab. One result opens directly; multiple results offer a chooser. Empty listings show **No KiCad project detected**; partial listings and access failures remain explicit. Repository, file and pull-request pages stay untouched until you explicitly request a viewer. Reload an already-open repository page after updating. The shared viewer also reads [KiCad Monkey saved design/netlist reports](docs/KICAD-MONKEY.md). [Startup and managed-browser troubleshooting](docs/VIEWER-RELIABILITY.md) explains the new local diagnostics. These changes are included in the 0.12.75 preview.

The development web and VS Code workspace uses a compact drawing toolbar, searchable project and properties panels, and a **More tools** menu for secondary actions. VS Code chrome follows the editor theme. A red **!** opens access diagnostics when a repository request is blocked or fails; an organization policy is identified only when the browser explicitly reports it.

This preview includes chat-style Issue and Discussion conversations in **Comments → Threads** on Android, in the extension and in VS Code. Browse conversations or open a thread by number, search its messages, reply, mention contributors, and edit your own plain messages where the provider permits it. Paste a screenshot or attach the selected drawing location for ECAD context; review the destination before sending. Enter adds a line; Ctrl/Cmd+Enter opens the send review. The conversation opens with a compact icon header and a **+ / Send** composer; search, refresh, filters and attachment tools appear only when opened. Unsaved drafts survive switching conversations during the session; **+ → Save local draft** stores a review note without posting.

GitHub Issues use linked quoted replies, GitHub Discussions use native replies, and GitLab conversations belong to Issues. Refresh loads new messages; this does not provide live presence or typing indicators. Reactions and editing published annotation metadata are unavailable. Context remains tied to its saved source revision; mutable VS Code workspaces and cross-repository fork comparisons may require opening the saved source before locating or attaching context. These features are included in the 0.12.75 preview downloads above.

Drawing tools group Design, Inspect and Review tasks, with shortcuts for Measure, Rules, 3D, Layers, BoM and saved Reports. The 2D ruler keeps five completed distance/angle measurements for session replay, including their original sheet. The 3D viewer measures between tapped model surfaces with XYZ deltas, mm/mil units and five-entry history; endpoints on footprint stand-ins are marked approximate. KiCad Monkey and other saved reports can open directly in a VS Code Results tab. Rules display saved settings and imported ERC/DRC findings; these controls do not run native KiCad checks.

The shared Three.js 3D viewer defaults to **Balanced** quality and **Realistic** materials. Select **High** for ambient occlusion, HDR output and enhanced antialiasing, or **Low** for a smaller graphics budget. **Layers → Appearance** switches to layer colours. The viewer renders on demand and recovers from graphics-context loss. Component realism depends on linked model files; missing geometry uses labelled footprint stand-ins. Unsupported pad/drill shapes and unsafe or bounded drill omissions appear in rendering notes. Unfilled zone boundaries remain outlines rather than fabricated copper fills.

**[Open the illustrated Android, VS Code and Chrome user guide](USER-GUIDE.md)** — setup, everyday workflows, Git reviews, fabrication files and saved results, with screenshots.

New to the viewer? Start with the guide's [first five minutes](USER-GUIDE.md#your-first-five-minutes), then follow the [Draftsman walkthrough](USER-GUIDE.md#9-create-draftsman-documentation) to create and download drawing sheets. The guide labels newer source previews separately from published binaries.

1. Install an edition using the [platform instructions](docs/INSTALL.md).
2. Open a local project folder with its sheets and model files, or open a supported GitHub/GitLab file page. Public projects need no account connection; private access requires authorization.
3. Select a part or net, open **Explorer**, **Inspect**, or **Review**, and follow the [illustrated user guide](USER-GUIDE.md).

Local browser file/folder viewing works offline once the extension is installed. Repository access, sign-in and publishing need a network connection. Folder import preserves relative paths better than selecting a single drawing.

## What you can do

| Task | Tools |
| --- | --- |
| Understand a design | Schematic hierarchy and all-sheets overview; PCB layers, net highlighting, saved properties and parallel views |
| Inspect layout | Snapped 2D measurements, saved copper/zone statistics, trace-length summaries, testpoint/net tables and imported ERC/DRC markers |
| Assemble a board | BoM field tables, grouping, fitted/DNP filters, variants, progress and procurement fields; confirmed per-part and bulk resets in current source |
| Create drawing documentation | [Draftsman workspace](docs/DRAFTSMAN.md): customizable sheets, outline/manual dimensions, notes, BoM and PDF/SVG/editable exports |
| Inspect fabrication and documents | Gerber/drill screening, PDF viewing and supported saved analysis plots/overlays |
| Continue a [wayriCAD workflow](https://github.com/wayri/WayriCAD) | Open supported quickTherm, quickPI and quickSI saved results; inspect exported plots, fields and reports in Android/browser |
| Review in 3D | Supported accessible model assets; unresolved models are identified and may use approximate proxies |
| Review with a team | Local annotations and portable review exports; optional GitHub/GitLab publication where supported by the host |
| Resolve a Git conflict | VS Code visual comparison of marker-based conflicts, with validated candidate export and explicit source replacement |
| Calculate at the bench | Interactive engineering calculators with units, assumptions and circuit illustrations; host availability varies |

[Platform parity and limits](extension/docs/platform-parity.md) | [BoM field table](docs/bom-field-table.md) | [GitHub/GitLab access](docs/GIT-HOSTS.md) | [VS Code walkthrough](vscode-extension/GUIDE.md) | [Commit actions, pin selection and saved waveforms](docs/REVISION-REVIEW.md)

## Works with WayriCAD simulation results

Run simulations in **[wayriCAD / kiWay](https://github.com/wayri/WayriCAD)**, then open their supported saved results in **Pocket KiView on Android or in the browser**. Bring the result files with the project to inspect them offline, or share those exports with another reviewer.

| WayriCAD tool | Review in KiView |
| --- | --- |
| **[quickTherm](https://github.com/wayri/WayriCAD/tree/develop/quick_therm_plugin)** | Saved temperature fields, component tables and supported transient frames/history |
| **[quickPI](https://github.com/wayri/WayriCAD/tree/develop/quick_pi_plugin)** | Saved voltage/current waveforms, copper-layer potential, power and current-density fields |
| **[quickSI](https://github.com/wayri/WayriCAD)** | Saved eye traces, step responses, impedance/screening curves and report metadata |
| **Other WayriCAD exports** | Supported JSON/CSV/TSV fields and tables; specialized plots depend on a recognized schema and saved numerical data |

Inspect plots and probe saved values. Supported spatial exports provide **2D/3D overlays**; placing an overlay on a PCB requires a matching saved board hash and spatial/layer metadata. Results remain read-only, and KiView does not rerun the simulation. Compatibility applies to documented export formats, rather than every WayriCAD version or arbitrary result file. Current source also opens saved results in a dedicated VS Code panel.

[Supported formats, probing and overlay requirements](docs/ANALYSIS_VIEWER.md) | [Open a saved result](docs/USER-GUIDE.md#wayricad-simulation-results).

## Screenshots

### Project dashboard | 0.12.65

[![Project dashboard with locally stored recent project locations](docs/images/current/dashboard-0.12.65.png)](docs/images/current/dashboard-0.12.65.png)

The extension dashboard revisits saved remote revisions and lists local imports
with **Reselect files** availability. Names and locations stay in extension-local
storage; imported source contents are not retained by this history.

> **Screenshot note:** Some images show older versions of the UI. The latest app, browser extension and VS Code extension may have updated controls, layouts and styling.

Click any image to open it at full size. [Capture sources and attribution](docs/images/README.md).

### Capability gallery | retained releases and source previews

These **37 screenshots** cover the main implemented workflows discussed during development. Images labelled **unreleased source** are not a promise that the current store/download package includes that feature. Local source previews can be ahead of both the published source and release packages. Older UI and synthetic/provider fixtures are identified below. Click an image for full size; screenshots alone do not establish security, solver accuracy, live provider actions or physical-device acceptance.

<details>
<summary><strong>Projects · 3 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/current/dashboard-0.12.65.png"><img src="docs/images/current/dashboard-0.12.65.png" width="440" alt="Dashboard and recent projects"></a> | **Dashboard and recent projects**<br>Release 0.12.65 · browser UI with demonstration history. |
| <a href="docs/images/current/dashboard-phone-0.12.65.png"><img src="docs/images/current/dashboard-phone-0.12.65.png" width="210" alt="Dashboard on a phone-width screen"></a> | **Dashboard on a phone-width screen**<br>Release 0.12.65 · responsive browser preview. |
| <a href="docs/images/features/file-tree-hierarchy.png"><img src="docs/images/features/file-tree-hierarchy.png" width="440" alt="Folders and all project filenames"></a> | **Folders and all project filenames**<br>Unreleased source preview · expand/collapse, search and pagination; unsupported files are listed without reading their contents. |

</details>

<details>
<summary><strong>Viewing · 3 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/current/schematic-workspace-0.12.64.png"><img src="docs/images/current/schematic-workspace-0.12.64.png" width="440" alt="Schematic workspace and navigation"></a> | **Schematic workspace and navigation**<br>Earlier 0.12.64 UI · retained feature preview. |
| <a href="docs/images/current/pcb-workspace-0.12.64.png"><img src="docs/images/current/pcb-workspace-0.12.64.png" width="440" alt="PCB workspace"></a> | **PCB workspace**<br>Earlier 0.12.64 UI · retained feature preview. |
| <a href="docs/images/features/refined-all-sheets.png"><img src="docs/images/features/refined-all-sheets.png" width="440" alt="All sheets in one viewport"></a> | **All sheets in one viewport**<br>Release preparation UI · hierarchy/net link toggles and single-sheet navigation. |

</details>

<details>
<summary><strong>3D · 3 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/current/pcb-3d-dark-0.12.64.jpg"><img src="docs/images/current/pcb-3d-dark-0.12.64.jpg" width="440" alt="3D PCB with linked component models"></a> | **3D PCB with linked component models**<br>Earlier 0.12.64 renderer · linked models 56/63; material preview. |
| <a href="docs/images/current/pcb-3d-light-0.12.64.jpg"><img src="docs/images/current/pcb-3d-light-0.12.64.jpg" width="440" alt="Light theme and real model geometry"></a> | **Light theme and real model geometry**<br>Earlier 0.12.64 renderer · retained preview. |
| <a href="docs/images/features/measurement-3d-snap-phone.png"><img src="docs/images/features/measurement-3d-snap-phone.png" width="210" alt="Phone measurement magnifier in 3D"></a> | **Phone measurement magnifier in 3D**<br>Unreleased WebGL browser preview · surface/edge/corner modes and target filters. This fixture uses approximate stand-in bodies. |

</details>

<details>
<summary><strong>Selection · 3 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/features/refined-layout-selection.png"><img src="docs/images/features/refined-layout-selection.png" width="440" alt="Selected parts with grey context"></a> | **Selected parts with grey context**<br>Release preparation UI · public KiCad demo. |
| <a href="docs/images/features/refined-3d-selection.png"><img src="docs/images/features/refined-3d-selection.png" width="440" alt="3D selection and grey context"></a> | **3D selection and grey context**<br>Release preparation UI · stand-in bodies in this fixture. |
| <a href="docs/images/features/refined-3d-simulation.png"><img src="docs/images/features/refined-3d-simulation.png" width="440" alt="3D net selection and saved waveform popup"></a> | **3D net selection and saved waveform popup**<br>Release preparation UI · synthetic waveform on a public demo; stand-in bodies. |

</details>

<details>
<summary><strong>Assembly · 2 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/features/refined-bom-tracker.png"><img src="docs/images/features/refined-bom-tracker.png" width="440" alt="Grouped BoM and assembly tracker"></a> | **Grouped BoM and assembly tracker**<br>Release preparation UI · searchable grouping, status counts and part selection. |
| <a href="docs/images/features/bom-columns-desktop.png"><img src="docs/images/features/bom-columns-desktop.png" width="440" alt="Choose BoM columns"></a> | **Choose BoM columns**<br>Unreleased source preview · select standard/custom fields, hide Actions, and retain column choices. |

</details>

<details>
<summary><strong>Review · 2 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/current/comments-thread-0.12.64.png"><img src="docs/images/current/comments-thread-0.12.64.png" width="210" alt="Conversation thread and composer"></a> | **Conversation thread and composer**<br>Earlier 0.12.64 UI · synthetic issue discussion, no provider write. |
| <a href="docs/images/current/comments-workspace-0.12.64.png"><img src="docs/images/current/comments-workspace-0.12.64.png" width="440" alt="Comments workspace"></a> | **Comments workspace**<br>Earlier 0.12.64 UI · synthetic discussion content. |

</details>

<details>
<summary><strong>Git · 3 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/features/features-commit-actions.png"><img src="docs/images/features/features-commit-actions.png" width="440" alt="Commit view, compare, download, copy and fork"></a> | **Commit view, compare, download, copy and fork**<br>Synthetic commit transport · action availability preview, no fork performed. |
| <a href="docs/images/features/selected-movement-comparison.png"><img src="docs/images/features/selected-movement-comparison.png" width="440" alt="Visual comparison with movement arrows"></a> | **Visual comparison with movement arrows**<br>Synthetic conflict fixture · current/incoming selection, value changes and properties. |
| <a href="docs/images/features/part-presence-comparison.png"><img src="docs/images/features/part-presence-comparison.png" width="440" alt="Part presence and comparison properties"></a> | **Part presence and comparison properties**<br>Synthetic conflict fixture · saved part identities and property differences. |

</details>

<details>
<summary><strong>Tools · 8 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/features/object-filter-desktop.png"><img src="docs/images/features/object-filter-desktop.png" width="440" alt="Object-type and board-side filters"></a> | **Object-type and board-side filters**<br>Release preparation UI · unavailable types are explicitly disabled. |
| <a href="docs/images/features/object-filter-3d.png"><img src="docs/images/features/object-filter-3d.png" width="440" alt="3D object visibility controls"></a> | **3D object visibility controls**<br>Release preparation UI · available object types differ between 2D and 3D. |
| <a href="docs/images/features/floating-layers-v28.png"><img src="docs/images/features/floating-layers-v28.png" width="440" alt="Floating copper layer selector"></a> | **Floating copper layer selector**<br>Earlier UI capture · floating layer access. |
| <a href="docs/images/features/ecad-measurement-history.png"><img src="docs/images/features/ecad-measurement-history.png" width="440" alt="Measurements and pinned readouts"></a> | **Measurements and pinned readouts**<br>Synthetic PCB fixture · dimensions and measurement history. |
| <a href="docs/images/features/floating-drc.png"><img src="docs/images/features/floating-drc.png" width="440" alt="Saved DRC findings and jump-to-location"></a> | **Saved DRC findings and jump-to-location**<br>Earlier UI · synthetic saved DRC report; does not run DRC in the browser. |
| <a href="docs/images/features/net-colors-pcb.png"><img src="docs/images/features/net-colors-pcb.png" width="440" alt="Net-class colours"></a> | **Net-class colours**<br>Earlier UI · saved colour toggles on a test design. |
| <a href="docs/images/features/measurement-touch-lens.png"><img src="docs/images/features/measurement-touch-lens.png" width="440" alt="Phone measurement magnifier in 2D"></a> | **Phone measurement magnifier in 2D**<br>Unreleased responsive browser preview · corner/edge target filters, drag to preview and release to place; synthetic touch input. |
| <a href="docs/images/features/generated-pdf-render.png"><img src="docs/images/features/generated-pdf-render.png" width="440" alt="Browser-generated schematic PDF"></a> | **Browser-generated schematic PDF**<br>Unreleased source preview · actual generated single-sheet raster PDF rendered by PDF.js; no PDF was required in the repository. |

</details>

<details>
<summary><strong>Analysis · 4 views</strong></summary>

Run the analytics in [wayriCAD](https://github.com/wayri/WayriCAD), then bring supported saved results into KiView. [Quick PI](https://github.com/wayri/WayriCAD/tree/develop/quick_pi_plugin) and [QuickTherm](https://github.com/wayri/WayriCAD/tree/develop/quick_therm_plugin) fields can provide saved spatial data for overlays and probing. Quick SI exports provide plots when the recognised format includes samples. KiCad workbooks are a separate source and do not contain waveform samples. These captures display exported data; they do not run a solver.

| View | Context |
| --- | --- |
| <a href="docs/images/features/showcase-wayricad-2d.png"><img src="docs/images/features/showcase-wayricad-2d.png" width="440" alt="wayriCAD saved field in 2D with A/B probes"></a> | **wayriCAD saved field in 2D with A/B probes**<br>Fresh unreleased source 25e3de6 · actual QuickPI producer fixture; standalone field, no PCB attached. |
| <a href="docs/images/features/showcase-wayricad-3d.png"><img src="docs/images/features/showcase-wayricad-3d.png" width="440" alt="wayriCAD saved field in WebGL 3D"></a> | **wayriCAD saved field in WebGL 3D**<br>Fresh unreleased source 25e3de6 · saved flat PI field; no board identity inferred. |
| <a href="docs/images/features/showcase-kicad-workbook.png"><img src="docs/images/features/showcase-kicad-workbook.png" width="440" alt="KiCad workbook as a separate source"></a> | **KiCad workbook as a separate source**<br>Fresh unreleased source 25e3de6 · synthetic .wbk settings, no invented waveform samples. |
| <a href="docs/images/features/showcase-waveform.png"><img src="docs/images/features/showcase-waveform.png" width="440" alt="Saved waveform graph and signal probes"></a> | **Saved waveform graph and signal probes**<br>Fresh unreleased source 25e3de6 · synthetic CSV remains unclassified rather than claiming a producer. |

</details>

<details>
<summary><strong>Mobile · 6 views</strong></summary>

| View | Context |
| --- | --- |
| <a href="docs/images/android/phone-layout.png"><img src="docs/images/android/phone-layout.png" width="210" alt="Android phone layout"></a> | **Android phone layout**<br>Earlier Android UI · retained cropped demonstration capture. |
| <a href="docs/images/android/tablet-portrait.png"><img src="docs/images/android/tablet-portrait.png" width="210" alt="Android tablet schematic"></a> | **Android tablet schematic**<br>Earlier Android UI · retained cropped demonstration capture. |
| <a href="docs/images/features/android-library-phone-1.6.png"><img src="docs/images/features/android-library-phone-1.6.png" width="210" alt="Offline copies and starred projects"></a> | **Offline copies and starred projects**<br>Earlier Android UI · synthetic library preview; current placement can differ. |
| <a href="docs/images/features/android-smart-selection.png"><img src="docs/images/features/android-smart-selection.png" width="440" alt="Smart part/net selection"></a> | **Smart part/net selection**<br>Earlier Android UI · selection-mode preview. |
| <a href="docs/images/features/bom-columns-phone.png"><img src="docs/images/features/bom-columns-phone.png" width="210" alt="BoM column chooser on a narrow screen"></a> | **BoM column chooser on a narrow screen**<br>Unreleased responsive browser preview · custom-field column selection; not a new device capture. |
| <a href="docs/images/features/file-tree-phone.png"><img src="docs/images/features/file-tree-phone.png" width="210" alt="Folder search on a narrow screen"></a> | **Folder search on a narrow screen**<br>Unreleased responsive browser preview · nested matching paths; unsupported files remain metadata-only. |

</details>

[Capture provenance and limitations](docs/images/README.md#capability-gallery-added-2026-10-29) · [wayriCAD export compatibility](docs/ANALYSIS_VIEWER.md)

### Current renderer and compact workspace | 0.12.64

[![PIC Programmer PCB in the shared Three.js renderer, High quality and dark theme](docs/images/current/pcb-3d-dark-0.12.64.jpg)](docs/images/current/pcb-3d-dark-0.12.64.jpg)

Production WebGL rendering of KiCad's public PIC Programmer demo, captured on 27 October 2026. **Real linked STEP/VRML component models** are loaded for all 56 footprints with saved model references (19 distinct model files). The seven model-less bodies are hidden, so no stand-ins appear. High quality and ambient occlusion are enabled. The refined viewer groups display controls and provides seven fitted camera directions. These are browser-rendered application pixels, with no generated imagery or operating-system status bar.

<details>
<summary><strong>Light theme, top view and compact drawing workspaces</strong></summary>

| Light theme | Top view |
| :---: | :---: |
| [![Light-theme PCB material preview](docs/images/current/pcb-3d-light-0.12.64.jpg)](docs/images/current/pcb-3d-light-0.12.64.jpg) | [![Top view of the public PIC Programmer board](docs/images/current/pcb-3d-top-0.12.64.jpg)](docs/images/current/pcb-3d-top-0.12.64.jpg) |

| Compact PCB workspace | Compact schematic workspace |
| :---: | :---: |
| [![Current PCB viewer with compact controls](docs/images/current/pcb-workspace-0.12.64.png)](docs/images/current/pcb-workspace-0.12.64.png) | [![Current schematic viewer with compact controls](docs/images/current/schematic-workspace-0.12.64.png)](docs/images/current/schematic-workspace-0.12.64.png) |

The drawing workspaces use the same public demo through a local read-only fixture transport. They demonstrate the shared viewer UI, not live GitHub authentication, a VS Code window or a physical Android device. [Capture details](docs/images/README.md#current-release-renders-2026-10-27).

</details>

### Focused review conversations

Messages stay central, with a compact composer and secondary actions under menus. The final destination and terms are reviewed before a provider write. These responsive browser previews use synthetic review threads and mocked provider responses; no live comment was posted.

| Compact conversation | Drawing and thread workspace |
| --- | --- |
| <a href="docs/images/current/comments-thread-0.12.64.png"><img src="docs/images/current/comments-thread-0.12.64.png" width="240" alt="Responsive review conversation with one message menu and a compact composer"></a> | [![Drawing with the refined review conversation panel](docs/images/current/comments-workspace-0.12.64.png)](docs/images/current/comments-workspace-0.12.64.png) |

### Chrome | open a project and get straight to the drawing

Read local projects offline or inspect supported GitHub/GitLab file pages. Open the whole project folder to retain sheet and model paths.

| Schematic workspace | PCB workspace |
| :---: | :---: |
| [![KiCad schematic open in the installed Chrome extension](docs/images/chrome/schematic.png)](docs/images/chrome/schematic.png) | [![PCB layout open in the installed Chrome extension](docs/images/chrome/pcb.png)](docs/images/chrome/pcb.png) |

These are installed Chrome extension captures using the public KiCad PIC Programmer demo, opened locally. They do not demonstrate live repository authentication.

<details>
<summary><strong>More browser views: BoM, parallel drawings and net inspection</strong></summary>

**A table-first BoM.** Search parts, choose grouping keys, show the fields you need and track assembly without changing the saved CAD source.

[![Expanded BoM field table with compact controls](docs/images/chrome/bom-field-table.jpg)](docs/images/chrome/bom-field-table.jpg)

| Schematic beside PCB | Selected net and saved properties |
| :---: | :---: |
| [![Local parallel schematic and PCB views](docs/images/integration/local-parallel-view.png)](docs/images/integration/local-parallel-view.png) | [![Net highlight with connection properties](docs/images/net-highlighting.jpg)](docs/images/net-highlighting.jpg) |

The expanded BoM capture uses the loopback local workspace and PIC Programmer demo. Parallel views and net inspection use synthetic local fixtures.

</details>

### VS Code | inspect hardware beside its source

Open a saved drawing as a custom editor, inspect component fields and keep review sidecars alongside your project files.

| PCB inspection inside VS Code | BoM fields and grouping |
| :---: | :---: |
| [![PCB viewer in an installed VS Code extension](vscode-extension/images/pcb-inspection.jpg)](vscode-extension/images/pcb-inspection.jpg) | [![BoM table and grouping controls in VS Code](vscode-extension/images/assembly-bom.jpg)](vscode-extension/images/assembly-bom.jpg) |

**See a Git conflict before choosing a side.** Compare Current and Incoming with linked cameras and highlighted saved-field differences. Export a resolved copy or explicitly confirm source replacement. The choice applies across the file's conflict blocks; this is not an automatic component-by-component merge.

[![VS Code visual merge conflict comparison highlighting a changed capacitor value](vscode-extension/images/visual-merge-conflict.jpg)](vscode-extension/images/visual-merge-conflict.jpg)

These installed VS Code captures use the KiCad PIC Programmer demo. The conflict is deliberately generated by changing one capacitor's Value field. [Visual conflict walkthrough](vscode-extension/GUIDE.md#resolve-git-conflicts-visually).

<details>
<summary><strong>More VS Code views: launch command and copper net names</strong></summary>

| Open a visual editor | Net labels on copper |
| :---: | :---: |
| [![VS Code command palette with the KiCad viewer command](vscode-extension/images/open-viewer-command.jpg)](vscode-extension/images/open-viewer-command.jpg) | [![Saved net names overlaid on PCB copper in VS Code](vscode-extension/images/copper-net-names.jpg)](vscode-extension/images/copper-net-names.jpg) |

[Read the illustrated VS Code guide](vscode-extension/GUIDE.md).

</details>

### Android | take the board to the bench

Keep saved projects available offline, inspect a board on your phone and use the wider workspace on a tablet.

<table>
<tr><th>Marble PCB | physical phone</th><th>Schematic | physical phone</th></tr>
<tr>
<td align="center" valign="top"><a href="docs/images/android/marble-phone-layout.png"><img src="docs/images/android/marble-phone-layout.png" width="240" alt="Marble board layout running on a Samsung Android phone"></a></td>
<td align="center" valign="top"><a href="docs/images/android/phone-schematic.png"><img src="docs/images/android/phone-schematic.png" width="240" alt="Synthetic schematic in the Android app on a physical Samsung phone"></a></td>
</tr>
</table>

Marble was captured on a Samsung SM-A366E running development version 1.55. The schematic capture uses version 1.49 and a synthetic project. These are retained device captures, not screenshots of the newest APK.

<details>
<summary><strong>Tablet workspace and phone-sized assembly controls</strong></summary>

**A wider canvas on tablets.** This retained Android 1.49 emulator capture uses the synthetic sensor fixture.

[![Android tablet landscape workspace](docs/images/android/tablet-landscape.png)](docs/images/android/tablet-landscape.png)

| BoM field grid | Testpoints and their nets |
| :---: | :---: |
| <a href="docs/images/tools/bom-phone-grid.jpg"><img src="docs/images/tools/bom-phone-grid.jpg" width="270" alt="Phone-sized BoM table with reference, value, footprint and DNP fields"></a> | <a href="docs/images/tools/testpoints.jpg"><img src="docs/images/tools/testpoints.jpg" width="270" alt="Phone-sized searchable testpoint and connected-net table"></a> |

The BoM and testpoint views above are browser captures of the shared tools at phone size, using local fixtures; they are not physical-phone acceptance evidence.

</details>

### Engineering tools | inspect more than the drawing

The shared Android/browser tools cover assembly, saved results, documents and engineering calculations. Availability differs in VS Code; see [platform parity](extension/docs/platform-parity.md).

<details>
<summary><strong>Calculators, Gerbers and PDFs</strong></summary>

**Explore a circuit interactively.** Change resistance, capacitance and probe conditions to inspect the analytical response, with units and assumptions beside the circuit.

[![Interactive RC filter calculator with circuit drawing and live controls](docs/images/tools/calculator.jpg)](docs/images/tools/calculator.jpg)

| Gerber and drill inspection | Integrated PDF reading |
| :---: | :---: |
| <a href="docs/images/tools/gerber.jpg"><img src="docs/images/tools/gerber.jpg" width="270" alt="Gerber fabrication viewer with a synthetic trace and drill fixture"></a> | <a href="docs/images/tools/pdf.jpg"><img src="docs/images/tools/pdf.jpg" width="270" alt="PDF viewer displaying a synthetic inspection report"></a> |

Local browser fixture captures. The calculator shows analytical estimates, not a live circuit simulation; the Gerber example is geometry screening, not full DFM. [Calculator guide](docs/CALCULATORS.md) | [Gerber guide](docs/GERBER-VIEWER.md) | [PDF guide](docs/PDF-VIEWER.md).

</details>

<details>
<summary><strong>3D models, saved analysis and board settings</strong></summary>

| Supported linked model (fixture) | Marble (approximate component proxies) |
| :---: | :---: |
| [![A repository-linked WRL model rendered on a fixture board](docs/images/repository-model-3d.jpg)](docs/images/repository-model-3d.jpg) | [![Marble 3D preview with approximate procedural component bodies](docs/images/marble-3d-proxies.jpg)](docs/images/marble-3d-proxies.jpg) |

The linked-model fixture loads one actual WRL asset. Marble's pictured bodies are proxies, not resolved mechanical models. These are retained local renderer captures.

**Read [wayriCAD-compatible saved results](https://github.com/wayri/WayriCAD).** Open supported quickTherm, quickPI and quickSI exports for plots, probing and available spatial overlays. The thermal-field image below illustrates the saved-analysis viewer. Its retained capture does not establish a solver run, native-device testing or independent numerical validation.

[![Saved thermal analysis field displayed as a color plot](docs/images/tools/saved-analysis.png)](docs/images/tools/saved-analysis.png)

**Inspect saved constraints.** Net classes and their units are shown in KiCad-style tables. Missing fields stay missing; viewing a rule does not evaluate it.

[![Saved board net classes and rule fields in a table](docs/images/tools/board-setup.jpg)](docs/images/tools/board-setup.jpg)

[Saved-analysis formats](docs/ANALYSIS_VIEWER.md) | [Compatibility and limits](docs/KICAD-COMPATIBILITY.md).

</details>

<details>
<summary><strong>Measurements, analytics, collaboration and safe resets</strong></summary>

| Snapped measurement | GitHub review destination |
| :---: | :---: |
| [![Pinned distance measurement with X and Y components](docs/images/integration/readable-distance-measurement.png)](docs/images/integration/readable-distance-measurement.png) | [![GitHub review type and destination controls](docs/images/github-collaboration.jpg)](docs/images/github-collaboration.jpg) |

| Saved board analytics | Portable review transfer |
| :---: | :---: |
| <a href="docs/images/integration/board-analytics-phone.png"><img src="docs/images/integration/board-analytics-phone.png" width="250" alt="Saved straight and curved trace length totals in board analytics"></a> | <a href="docs/images/integration/review-handoff-phone.png"><img src="docs/images/integration/review-handoff-phone.png" width="250" alt="Portable review export and import controls"></a> |

These local fixture captures demonstrate controls and saved data. The collaboration view uses mocked provider responses; no remote post was made for it.

**Reset deliberately.** Per-part and bulk BoM resets list their scope and require an acknowledgement before local metadata is changed.

[![BoM reset warning with affected parts and explicit acknowledgement](docs/images/tools/bom-reset-warning.jpg)](docs/images/tools/bom-reset-warning.jpg)

[BoM reset behavior](docs/bom-field-table.md#reset-saved-management-fields) | [Review and transfer guide](docs/USER-GUIDE.md#6-record-share-and-transfer-a-review).

</details>

## Compatibility and limits

Recognized KiCad 8, 9 and 10 saved-file constructs have differing test coverage; this is not complete version certification. See the [compatibility matrix](docs/KICAD-COMPATIBILITY.md). Legacy `.sch`/`.brd` formats are not advertised as supported.

Source designs are ordinarily read-only. Explicit conflict-resolution actions in VS Code and supported export workflows are described separately. Saved ERC/DRC and simulation results are displayed; KiView does not run native KiCad checks or simulation solvers. Connectivity inference, model resolution and fabrication screening have limits. Verify engineering decisions and resolved designs in the appropriate native tools.

## Documentation and development

- [Installation for Windows, Linux, macOS and Android](docs/INSTALL.md)
- [Illustrated user guide](USER-GUIDE.md) and [VS Code illustrated guide](vscode-extension/GUIDE.md)
- [Offline local workspace and optional KiCad launcher](docs/LOCAL-VIEWER.md)
- [Build and repository map](docs/DEVELOPMENT.md)
- [Security and private reports](SECURITY.md)
- [Historical technical reference](docs/PROJECT-REFERENCE.md) and [release history](docs/releases/)

## License and support

Copyright (c) 2026 **Yawar B (wayri)**. Licensed under the [Pocket KiView Source-Available License 1.0](LICENSE), **not an OSI-approved open-source license**. Personal and internal professional use are permitted. Paid distribution, paid bundles and monetized hosted access require written permission. Your designs and outputs remain yours under the license. [Licensing details](LICENSING.md) | [Third-party notices](THIRD-PARTY-NOTICES.md).

Support and commercial licensing: **[support.kivi@sigharmonic.com](mailto:support.kivi@sigharmonic.com)**. Optional sponsorship does not unlock app features. This independent project is not affiliated with or endorsed by KiCad, GitHub, GitLab, Google, Apple or Microsoft.
