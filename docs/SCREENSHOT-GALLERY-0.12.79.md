# Screenshot workflows · 0.12.79

[Demo board acknowledgements and source revisions](DEMO-BOARD-CREDITS.md) — thanks to OLIMEX, Berkeley Lab Marble, Ttl/FMCW3 and KiCad demo contributors.

These **2 November 2026** captures use the production UI from the audited Chrome/Chromium **0.12.79** ZIP, served over loopback with the local-project bridge. The drawings, component assets and fabrication files come from real, pinned public repositories. Local review/assembly states and Draftsman documents were created during the demonstration; they are not upstream design records.

This is a workflow gallery, **not installed Chrome, VS Code, physical Android or live-provider acceptance**. No remote comment, fork or repository save is demonstrated. The package SHA-256 is `02fdbb2e7387c6a151950b4ac856a2c329eeccb35b4ff3d86e1e5324b75e8789`.

[Machine-readable capture manifest](images/0.12.79/capture-manifest.json) · [Image provenance](images/0.12.79/README.md) · [User guide](../USER-GUIDE.md)

**Fast PI follow-up:** [supported real-board setup, solved results and measured speed](FAST-PI-WALKTHROUGH-0.12.79.md). The original Olimex setup remains an unsupported case; the follow-up uses the unmodified public PIC programmer board.

**Cross-probe follow-up:** [all three starting views with mixed schematic/layout/3D popups and interaction steps](CROSS-PROBE-WALKTHROUGH-0.12.79.md).

## Public sources

| Source | Immutable revision | Retained scope |
| --- | --- | --- |
| [Olimex ESP32-PoE M2](https://github.com/OLIMEX/ESP32-POE/tree/deb38a377d50eadb04ddc7118a17a5ae58b1ee53/HARDWARE/ESP32-PoE-hardware-revision-M2) | `deb38a377d50eadb04ddc7118a17a5ae58b1ee53` | PCB, schematic, project, 34 repository model assets and 13 upstream Gerber/drill files. |
| [BerkeleyLab Marble](https://github.com/BerkeleyLab/Marble/tree/a426777d92c0f22a546d4740b419a3937e0c1f90) | `a426777d92c0f22a546d4740b419a3937e0c1f90` | 25 schematic files and project settings. The 44 MB PCB and all models were excluded from this capture corpus. |
| [Henrik Forstén FMCW3](https://github.com/Ttl/fmcw3/tree/e57ce3bd46c862798b6acc4206564233bcbd5aaf) | `e57ce3bd46c862798b6acc4206564233bcbd5aaf` | Original legacy schematic/project/cache-library files and PCB text. Only working schematic views are pictured. |

## Captured workflows · 38 images

Follow the steps within each group to understand the shown result. Counts and limits refer to these saved sources and observed interactions.

### Open and inspect

**01. Olimex PCB layout** — Open the retained Olimex project and choose Layout. The saved PCB is the drawing source.

![Olimex PCB layout](images/0.12.79/01-olimex-layout.jpg)

Saved source shown.

**02. Real component models in 3D** — Switch the same board to 3D. The capture reports 126 of 143 components linked to repository models.

![Real component models in 3D](images/0.12.79/02-olimex-3d-real-models.jpg)

Model coverage is partial; unlinked components are not evidence of a complete mechanical assembly.

**03. Project-wide search** — Search the loaded real project and inspect the matching saved objects and paths.

![Project-wide search](images/0.12.79/03-project-search.jpg)

Search evidence is limited to the loaded project.

**04. 3D selection and native properties** — Select a real component in 3D and inspect its saved field/value properties.

![3D selection and native properties](images/0.12.79/04-3d-selection-properties.jpg)

Selection and properties are viewing operations, not design edits.

### Probe and cross-select

**05. Selected +5V copper** — Select the saved +5V net. The inspected selection contains 64 track segments and four vias.

![Selected +5V copper](images/0.12.79/05-3d-net-highlight.jpg)

Saved-net inspection is not electrical or manufacturing qualification.

**06. Layout probe over the 3D board** — Open a layout probe while keeping the main board in 3D.

![Layout probe over the 3D board](images/0.12.79/06-net-probe-on-3d.jpg)

The popup is an independent viewport in the same application page.

**07. Independent sibling probes** — Rotate the layout probe by 90 degrees, open a sibling 3D probe, and drag the second popup to the right. Curved source guides remain visible.

![Independent sibling probes](images/0.12.79/07-independent-probe-views.jpg)

The second popup moved from DOM x=76 to x=532; this is not a separate installed application window.

**08. Paired 3D and schematic views** — Open the actual project schematic beside the board 3D view.

![Paired 3D and schematic views](images/0.12.79/08-paired-3d-schematic.jpg)

Pairing uses the retained saved project; it does not synchronize unsaved KiCad editor state.

**09. Saved pad selection** — Select a pad and inspect its saved properties.

![Saved pad selection](images/0.12.79/09-pad-selection.jpg)

This capture proves pad selection only. The search/navigation step returns to a single PCB view; it is not evidence of paired pin highlighting.

**10. Actual +5V cross-selection** — Cross-select +5V between the PCB and schematic; inspect the saved pin/pad-name properties.

![Actual +5V cross-selection](images/0.12.79/10-paired-net-highlight.jpg)

This observed saved-net match does not establish every possible cross-sheet or repeated-unit mapping.

### Board data and local review

**11. Layers and terminal labels** — Use the floating layer controls and the independent number/net-name controls.

![Layers and terminal labels](images/0.12.79/11-floating-layers-net-labels.jpg)

Shown label visibility depends on zoom, saved identities and annotation budgets.

**12. BoM column chooser** — Open the BoM table and choose the fields to display.

![BoM column chooser](images/0.12.79/12-bom-column-picker.jpg)

Fields come from the saved project; column choices do not rewrite the design.

**13. Local assembly tracking** — Mark one assembly entry Placed. The local demonstration shows one placed and 142 not started.

![Local assembly tracking](images/0.12.79/13-bom-assembly-tracker.jpg)

These are demonstration tracking states, not a record of physical assembly.

**14. Board-extent measurement** — Measure the saved board outline in the viewer.

![Board-extent measurement](images/0.12.79/14-measure-board-extents.jpg)

Screen measurements are review aids, without inferred manufacturing tolerances.

**15. Local review-note composer** — Create a local Minor-severity issue draft with its drawing location.

![Local review-note composer](images/0.12.79/15-comment-composer-local.jpg)

No provider comment is sent.

**16. Locate a saved local note** — Save the local draft and choose Locate to return to its drawing location.

![Locate a saved local note](images/0.12.79/16-comment-locate-local.jpg)

This demonstrates local save/locate only, not remote publication or readback.

**17. Filter local review notes** — Filter the saved local review entries.

![Filter local review notes](images/0.12.79/17-comment-filters.jpg)

Account threads and remote conversation refresh are not exercised.

### Screening setup and Draftsman

**18. Reviewed Fast PI setup** — Review a 5 V, 0.1 A, 58 MS/m setup using the saved stackup.

![Reviewed Fast PI setup](images/0.12.79/18-fast-pi-reviewed-setup.jpg)

Setup only: this actual Olimex board is rejected for unsupported slotted drills. No solved PI result is shown.

**19. KiCad-style Draftsman sheet** — Choose the KiCad-style template and dimension the 28 × 80 mm board outline.

![KiCad-style Draftsman sheet](images/0.12.79/19-draftsman-kicad-template.jpg)

The drawing document is separate from the PCB source.

**20. Multiple documentation views** — Arrange top and isometric views with copper hidden.

![Multiple documentation views](images/0.12.79/20-draftsman-multiple-views.jpg)

View visibility is a documentation choice, not a change to saved copper.

**21. Generated PDF ready** — Generate the PDF and save a local drawing draft; the download link remains available.

![Generated PDF ready](images/0.12.79/21-draftsman-pdf-ready.jpg)

GitHub save is disabled without authentication. This does not demonstrate a remote repository save.

### Project files and fabrication

**22. Project home and saved files** — Return to project home and inspect the actual saved source files.

![Project home and saved files](images/0.12.79/22-project-home-files.jpg)

The capture uses a loopback local-project bridge, not live provider discovery.

**23. Upstream Gerber layers** — Open the 13 actual upstream fabrication files from the pinned repository revision. Twelve render in this capture.

![Upstream Gerber layers](images/0.12.79/23-gerber-copper-layers.jpg)

Partial import: PTH is rejected for unsupported slots/macros. The files are upstream saved outputs, not newly plotted from the current board.

**24. Partial Gerber analysis** — Inspect the saved fabrication analysis and its 1,002 findings.

![Partial Gerber analysis](images/0.12.79/24-gerber-analysis-partial.jpg)

Findings are screening data, not DFM certification. Unsupported PTH slots/macros and incomplete rendering remain explicit.

### Large schematic hierarchy

**25. Marble root and hierarchy** — Open the actual Marble root schematic and its saved hierarchy.

![Marble root and hierarchy](images/0.12.79/25-marble-root-hierarchy.jpg)

This capture corpus deliberately excludes the 44 MB PCB and all models.

**26. All loaded schematic pages** — Open the all-sheets overview of all 25 loaded pages. Repeated QSFP2 is represented by a two-instance stack.

![All loaded schematic pages](images/0.12.79/26-marble-all-sheets.jpg)

The overview does not claim that every repeated instance has been expanded into a separate page.

**27. Only sheets matching FPGA_MISO** — Highlight FPGA_MISO and show only its four matching sheets.

![Only sheets matching FPGA_MISO](images/0.12.79/27-marble-linked-sheets.jpg)

The filter reflects this saved net and loaded sources, not a general connectivity proof.

**28. Net links without hierarchy links** — Turn hierarchy links off while leaving net links on.

![Net links without hierarchy links](images/0.12.79/28-net-links-without-hierarchy.jpg)

The two link overlays are controlled independently.

**29. Sheet-level net indicators** — Use sheet indicators to follow the highlighted saved net.

![Sheet-level net indicators](images/0.12.79/29-marble-sheet-net-indicators.jpg)

Indicators reflect the active saved selection.

**30. Schematic theme control** — Toggle the schematic theme while retaining the loaded drawing.

![Schematic theme control](images/0.12.79/30-schematic-theme-toggle.jpg)

Theme changes presentation, not source geometry.

### Legacy sheets and version identity

**31. FMCW3 legacy root** — Open the authentic FMCW3 legacy root schematic.

![FMCW3 legacy root](images/0.12.79/31-fmcw3-legacy-root.jpg)

Restricted legacy preview; unsupported records or missing library content may be omitted with diagnostics.

**32. FMCW3 power subsheet** — Navigate from the root to the saved power subsheet.

![FMCW3 power subsheet](images/0.12.79/32-fmcw3-legacy-subsheet.jpg)

Schematic navigation works here. The FMCW3 PCB fails with “Invalid numeric KiCad value”; no successful PCB capture is included.

**33. About the packaged version** — Open About and read the packaged 0.12.79 version.

![About the packaged version](images/0.12.79/33-about-packaged-version.jpg)

The UI is from the audited package, served locally; this does not prove a store installation.

### Generated downloads and responsive web previews

**34. Generated layout PDF** — Choose Generate and download PDF. Production status reports “Generated ESP32-PoE_Rev_M2.pdf · 1920 × 4096 pixels. Your browser handles download”.

![Generated layout PDF](images/0.12.79/34-generated-layout-download.jpg)

The PDF was generated and download was handed to the browser. No downloaded filesystem path was verified. Image: **1707 × 1067 pixels**.

**35. Narrow layout web preview** — Inspect the real Olimex layout in a narrow responsive web viewport.

![Narrow layout web preview](images/0.12.79/35-phone-layout-preview.jpg)

Requested viewport 390 × 844 at 75% browser zoom; actual DOM and JPEG are 520 × 1125, device-pixel ratio 0.75. This is not a physical Android capture. Image: **520 × 1125 pixels**.

**36. Narrow local-comment web preview** — Open the local comment interface in the narrow responsive web viewport.

![Narrow local-comment web preview](images/0.12.79/36-phone-comments-preview.jpg)

Requested viewport 390 × 844 at 75% browser zoom; actual DOM and JPEG are 520 × 1125, device-pixel ratio 0.75. Notes remain local; no provider send is demonstrated. Image: **520 × 1125 pixels**.

**37. Narrow 3D web preview** — Switch the real board to 3D and wait for the visible 126/143 linked-model status.

![Narrow 3D web preview](images/0.12.79/37-phone-3d-preview.jpg)

Requested viewport 390 × 844 at 75% browser zoom; actual DOM and JPEG are 520 × 1125, device-pixel ratio 0.75. Responsive web evidence only; model coverage remains partial. Image: **520 × 1125 pixels**.

**38. Tablet-sized 3D web preview** — Inspect the top-camera 3D view after the visible 126/143 linked-model status.

![Tablet-sized 3D web preview](images/0.12.79/38-tablet-3d-preview.jpg)

Requested viewport 1024 × 768; JPEG dimensions are recorded below and in the manifest. This is a responsive web preview, not physical tablet or Android validation. Image: **1365 × 1024 pixels**.

## Coverage and capabilities without captured evidence

A visible control is not evidence of a successful calculation, remote write or hardware installation.

| Capability | Evidence status | Scope or limitation |
| --- | --- | --- |
| Saved PCB, schematic and project navigation | Captured · 01,03,22,25,31,32 | Authentic retained public files; local transport. |
| Real 3D model geometry | Partial · 02 | 126/143 components linked; no complete-model claim. |
| Selected saved copper and via inspection | Captured · 05 | 64 track segments and four vias in the observed +5V selection. |
| Independent mini viewports, rotation, movement and guides | Captured · 06,07 | Same-page layout and 3D popups; layout rotation and popup movement exercised. |
| Paired PCB/schematic net selection | Captured · 08,10 | Observed +5V case with saved pin/pad-name properties. |
| Pad selection and label controls | Captured · 09,11 | 09 demonstrates selection only; these images do not demonstrate dense BGA numbering. |
| BoM columns and assembly tracking | Captured local demo · 12,13 | One placed state is demonstration data, not physical assembly. |
| Measurements | Captured · 14 | Saved outline review; no manufacturing tolerance qualification. |
| Review drafts, Locate and filters | Captured local only · 15,16,17 | No remote publication/readback or live account threads. |
| Fast PI numerical results | Setup only; no result · 18 | Actual board rejects unsupported slotted drills. No solved field or numerical result is presented. |
| Draftsman templates, views, PDF link and draft | Captured local · 19,20,21 | Generated PDF link and local draft; GitHub save disabled without authentication. |
| Gerber/drill import and analysis | Partial · 23,24 | 13 inputs, 12 rendered; PTH unsupported, 1,002 screening findings. Not DFM certification. |
| Multi-sheet hierarchy, net filtering and independent link overlays | Captured · 25,26,27,28,29 | 25 loaded pages, QSFP2 two-instance stack; FPGA_MISO filter shows four matching sheets. |
| Restricted legacy schematic navigation | Captured · 31,32 | Legacy root/power sheet only; FMCW3 PCB numeric-load failure is not hidden. |
| About/package version | Captured · 33 | Version 0.12.79 from the audited package. |
| KiCad simulation workbook/waveform and wayriCAD results | Not pictured | No real corresponding saved results were available for these project corpora. No solver/result screenshots fabricated. |
| Successful ERC/DRC report inspection | Not pictured | No successful report available; the optional native Olimex DRC attempt crashed and produced no report. |
| Live provider account threads, send/readback, sync/backoff, discussion categories | Not exercised | Local note captures do not verify these account-backed operations. |
| History, comparison, fork or remote repository saves | Not exercised | No remote actions or fabricated provider history included. |
| Installed Chrome/VS Code or physical Android acceptance | Not exercised | Packaged UI in a loopback browser harness only. |
| Dense BGA annotation coverage, calculators, photo alignment, physical assembly and other uncaptured tools | Not pictured | Feature availability is separate from evidence in this gallery. |
| Generated layout PDF download | Generated; browser handoff · 34 | The status confirms ESP32-PoE_Rev_M2.pdf generation at 1920 × 4096 pixels and browser download handling; no downloaded file path was verified. |
| Narrow and tablet-sized layout, comments and 3D | Responsive web only · 35,36,37,38 | Narrow: requested 390 × 844 at 75% zoom; actual DOM/JPEG 520 × 1125 and DPR 0.75. Tablet: requested 1024 × 768; JPEG 1365 × 1024. No physical-device claim. |

The Gerbers are the repository’s saved fabrication outputs; their presence beside the PCB does not prove that they were regenerated from those exact PCB bytes. Fast PI remains experimental fixed-temperature DC screening; this project did not produce a solved result. The gallery makes no manufacturing, electrical, mechanical-fit or general format-support certification.
