<p align="center">
  <img src="docs/play-store/assets/store-icon-512.png" alt="Pocket KiView app icon" width="112" height="112">
</p>

# Pocket KiView

**Your KiCad project, ready for review—at your desk or at the bench.**

Explore schematics and PCB layouts, follow nets, measure geometry, work through a BoM and carry review notes between devices. Use the Chromium extension, VS Code, or an Android phone/tablet. Ordinary viewing needs no KiCad installation or rendering server.

[![CI](https://github.com/wayri/KiCad-Github-View/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wayri/KiCad-Github-View/actions/workflows/ci.yml)
[![Status](https://img.shields.io/badge/status-preview-orange)](#downloads)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20Linux%20%7C%20macOS-555)](docs/INSTALL.md)
[![KiCad formats](https://img.shields.io/badge/KiCad-8%20%7C%209%20%7C%2010-314CB0)](docs/KICAD-COMPATIBILITY.md)

[Illustrated user guide](USER-GUIDE.md) | [Installation](docs/INSTALL.md) | [Release notes](https://github.com/wayri/KiCad-Github-View/releases) | [Report an issue](https://github.com/wayri/KiCad-Github-View/issues) | [Contact support](mailto:support@sigharmonic.com)

## Downloads

[![Download Android APK](https://img.shields.io/badge/Android-Download%20APK%201.66-3DDC84?logo=android&logoColor=white)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/pocket-kivi-android-phone-tablet-1.66-development.apk)
[![Download Chromium extension](https://img.shields.io/badge/Chrome%20%2F%20Chromium-Download%20ZIP-4285F4?logo=googlechrome&logoColor=white)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-0.12.64.zip)
[![Download VS Code VSIX](https://img.shields.io/badge/VS%20Code-Download%20VSIX%200.12.64-007ACC)](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/kicad-visual-review-vscode-0.12.64.vsix)

| Edition | Download / install | Availability |
| --- | --- | --- |
| Android | APK button above | Android 8+; published 1.66 preview, development-signed; manual installation and updates |
| Chrome, Edge, Brave, Opera, Vivaldi, Chromium | Chromium ZIP button above | Published 0.12.64 preview; extract and load unpacked; candidate browsers have differing validation coverage |
| VS Code | [Marketplace](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review) / [offline VSIX 0.12.64](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/kicad-visual-review-vscode-0.12.64.vsix) | Windows, Linux and macOS; VS Code 1.95+; Marketplace and GitHub versions may differ |
| Firefox | [Development ZIP 0.12.64](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/kicad-visual-review-firefox-0.12.64.zip) | Desktop 128+; unsigned temporary add-on; [instructions](docs/FIREFOX.md) |
| Safari | [Development ZIP 0.12.64](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/kicad-visual-review-safari-0.12.64.zip) | macOS Safari 16.4+; requires Xcode conversion/signing; native verification pending; [instructions](docs/SAFARI.md) |

Downloads above are the [v0.12.64 GitHub preview](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.12.64). The VS Code Marketplace channel is updated separately. The source repository and GitHub downloads are public.

<details>
<summary>Release versions, checksums and Android signing</summary>

Release packages are built from the tagged source; screenshots show several retained development versions and may differ from the packaged UI. No Google Play or public Chrome Web Store installation URL is advertised here.

Compare preview downloads with [SHA256SUMS.txt](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.64/SHA256SUMS.txt). An AAB is a Play upload bundle, not a directly installable Android app. Preserve/export projects and review state before changing signing channels; do not uninstall merely to bypass a signature mismatch. [Installation and updates](docs/INSTALL.md).

</details>

## Get started

Development additions: repository main pages detect KiCad projects and offer **Open KiCad project**, including nested projects and standalone drawings. The shared viewer also reads [KiCad Monkey saved design/netlist reports](docs/KICAD-MONKEY.md). [Startup and managed-browser troubleshooting](docs/VIEWER-RELIABILITY.md) explains the new local diagnostics. These changes are included in the 0.12.64 preview.

The development web and VS Code workspace uses a compact drawing toolbar, searchable project and properties panels, and a **More tools** menu for secondary actions. VS Code chrome follows the editor theme. A red **!** opens access diagnostics when a repository request is blocked or fails; an organization policy is identified only when the browser explicitly reports it.

This preview includes chat-style Issue and Discussion conversations in **Comments → Threads** on Android, in the extension and in VS Code. Browse conversations or open a thread by number, search its messages, reply, mention contributors, and edit your own plain messages where the provider permits it. Paste a screenshot or attach the selected drawing location for ECAD context; review the destination before sending. Enter adds a line; Ctrl/Cmd+Enter opens the send review. The conversation opens with a compact icon header and a **+ / Send** composer; search, refresh, filters and attachment tools appear only when opened. Unsaved drafts survive switching conversations during the session; **+ → Save local draft** stores a review note without posting.

GitHub Issues use linked quoted replies, GitHub Discussions use native replies, and GitLab conversations belong to Issues. Refresh loads new messages; this does not provide live presence or typing indicators. Reactions and editing published annotation metadata are unavailable. Context remains tied to its saved source revision; mutable VS Code workspaces and cross-repository fork comparisons may require opening the saved source before locating or attaching context. These features are included in the 0.12.64 preview downloads above.

Drawing tools group Design, Inspect and Review tasks, with shortcuts for Measure, Rules, 3D, Layers, BoM and saved Reports. The 2D ruler keeps five completed distance/angle measurements for session replay, including their original sheet. The 3D viewer measures between tapped model surfaces with XYZ deltas, mm/mil units and five-entry history; endpoints on footprint stand-ins are marked approximate. KiCad Monkey and other saved reports can open directly in a VS Code Results tab. Rules display saved settings and imported ERC/DRC findings; these controls do not run native KiCad checks.

The shared Three.js 3D viewer defaults to **Balanced** quality and **Realistic** materials. Select **High** for ambient occlusion, HDR output and enhanced antialiasing, or **Low** for a smaller graphics budget. **Layers → Appearance** switches to layer colours. The viewer renders on demand and recovers from graphics-context loss. Component realism depends on linked model files; missing geometry uses labelled footprint stand-ins. Unsupported pad/drill shapes and unsafe or bounded drill omissions appear in rendering notes. Unfilled zone boundaries remain outlines rather than fabricated copper fills.

**[Open the illustrated Android, VS Code and Chrome user guide](USER-GUIDE.md)** — setup, everyday workflows, Git reviews, fabrication files and saved results, with screenshots.

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
| Inspect fabrication and documents | Gerber/drill screening, PDF viewing and supported saved analysis plots/overlays |
| Continue a WayriCAD workflow | Open supported quickTherm, quickPI and quickSI saved results; inspect exported plots, fields and reports in Android/browser |
| Review in 3D | Supported accessible model assets; unresolved models are identified and may use approximate proxies |
| Review with a team | Local annotations and portable review exports; optional GitHub/GitLab publication where supported by the host |
| Resolve a Git conflict | VS Code visual comparison of marker-based conflicts, with validated candidate export and explicit source replacement |
| Calculate at the bench | Interactive engineering calculators with units, assumptions and circuit illustrations; host availability varies |

[Platform parity and limits](extension/docs/platform-parity.md) | [BoM field table](docs/bom-field-table.md) | [GitHub/GitLab access](docs/GIT-HOSTS.md) | [VS Code walkthrough](vscode-extension/GUIDE.md)

## Works with WayriCAD simulation results

Run simulations in **WayriCAD / kiWay**, then open their supported saved results in **Pocket KiView on Android or in the browser**. Bring the result files with the project to inspect them offline, or share those exports with another reviewer.

| WayriCAD tool | Review in KiView |
| --- | --- |
| **quickTherm** | Saved temperature fields, component tables and supported transient frames/history |
| **quickPI** | Saved voltage/current waveforms, copper-layer potential, power and current-density fields |
| **quickSI** | Saved eye traces, step responses, impedance/screening curves and report metadata |
| **Other WayriCAD exports** | Supported JSON/CSV/TSV fields and tables; specialized plots depend on a recognized schema and saved numerical data |

Inspect plots and probe saved values. Supported spatial exports provide **2D/3D overlays**; placing an overlay on a PCB requires a matching saved board hash and spatial/layer metadata. Results remain read-only, and KiView does not rerun the simulation. Compatibility applies to documented export formats, rather than every WayriCAD version or arbitrary result file. The standalone results viewer is not currently available in VS Code.

[Supported formats, probing and overlay requirements](docs/ANALYSIS_VIEWER.md) | [Open a saved result](docs/USER-GUIDE.md#wayricad-simulation-results).

## Screenshots

> **Screenshot note:** Some images show older versions of the UI. The latest app, browser extension and VS Code extension may have updated controls, layouts and styling.

Click any image to open it at full size. [Capture sources and attribution](docs/images/README.md).

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

**Read WayriCAD-compatible saved results.** Open supported quickTherm, quickPI and quickSI exports for plots, probing and available spatial overlays. The thermal-field image below illustrates the saved-analysis viewer. Its retained capture does not establish a solver run, native-device testing or independent numerical validation.

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

Support and commercial licensing: **[support@sigharmonic.com](mailto:support@sigharmonic.com)**. Optional sponsorship does not unlock app features. This independent project is not affiliated with or endorsed by KiCad, GitHub, GitLab, Google, Apple or Microsoft.
