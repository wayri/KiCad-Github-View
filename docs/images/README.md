# Screenshot provenance

Captured on 2026-10-04 from the project's actual browser viewer, running through the local preview harness at `127.0.0.1:8773`. Images are JPEG screenshots, not design mockups or AI-generated images. Capture includes the application controls and canvas; unused browser viewport margins were excluded. Browser device scaling determines image pixel dimensions.

The harness replaces extension transport with local files and mocked Git metadata/policy. It does not prove installed-browser integration, live authentication or successful remote publication. Screenshots show the working-tree viewer after the GitHub collaboration and large-board loading changes; they may differ from the already published v0.11.5 package. In particular, the GitHub destination and saved-note screenshots show a local draft with mocked policy; no Issue, Discussion, comment, or account sign-in was performed. The account-settings screenshot contains blank credential fields. GitLab captures also use local fixture content and mocked project metadata; no live GitLab posting occurred.

| Image | Source and displayed behavior |
| --- | --- |
| `marble-layout.jpg` | BerkeleyLab/Marble, `design/Marble.kicad_pcb`, revision below; dark 2D board view, 1006 saved footprints. |
| `marble-3d-proxies.jpg` | Same Marble revision; source-driven board preview with **0/1006 real footprint models**. All component bodies are procedural proxies. |
| `schematic-sheets.jpg` | Synthetic `hierarchy.kicad_sch` and `power.kicad_sch`; complete A4 page, title block and root/child navigator. |
| `net-highlighting.jpg` | Synthetic `highlights.kicad_pcb`; SIGNAL_IN copper highlight, pad connections and saved straight-track length. |
| `bom-analytics.jpg` | Same fixture; BOM and descriptive saved-source statistics, not manufacturing qualification or a fresh zone fill. |
| `repository-model-3d.jpg` | Owned `owned-model-review/board.kicad_pcb` fixture and repository-relative `models/review-block.wrl`; one real cuboid WRL model loaded, 1/1 footprints. |
| `project-settings.jpg` | Synthetic `review-demo.kicad_pro`; read-only constraints and dimension fields. |
| `project-stackup.jpg` | Synthetic `review-demo.kicad_pcb`; saved two-copper-layer FR4 stackup, diagram and table. |
| `github-collaboration.jpg` | Synthetic highlights board; GitHub type/destination selectors and mocked review policy. No account credentials or live thread. |
| `comment-editor.jpg` | Same fixture; unsaved demonstration draft. No external comment was created. |
| `revision-comparison.jpg` | Synthetic sensor base/head sources and mocked revision identifiers; side-by-side drawings and Changes panel. |
| `integration/github-account-settings.jpg` | Blank extension settings form for GitHub device sign-in and manual token; no account connected and no secret displayed. |
| `integration/github-discussion-destination.jpg` | Synthetic `highlights.kicad_pcb` fixture; Discussion type, new-thread destination, category, local review note and mocked policy status. No post was made. |
| `integration/github-saved-discussion.jpg` | Same synthetic fixture; saved local Discussion-type note and available controls. It is a draft, not evidence of successful publication. |
| `integration/gitlab-part-properties.jpg` | Synthetic `highlights.kicad_pcb` fixture with selected R1 footprint, saved properties and project explorer; GitLab project metadata is mocked. |
| `integration/gitlab-comment-editor.jpg` | Same fixture with an unsaved local note form, severity, state, tags, mention and area capture control. No GitLab API write was made. |
| `integration/gitlab-saved-note.jpg` | Same fixture with the saved local note and its annotation marker. No remote issue or merge-request comment exists. |

The new integration images accompany the step-by-step [GitHub guide](../using-github-integration/README.md) and [GitLab guide](../using-gitlab-integration/README.md). The three earlier collaboration images in the table above are a separate UI capture set; each set's provenance and limitations are described here.

## Marble attribution and limits

`integration/github-sign-in.jpg` captures the v0.11.7 primary sign-in screen in the same local harness on 2026-10-04. Advanced fields are collapsed, the account is signed out, and the missing publisher OAuth registration is visible. No device authorization or account login was performed. The earlier `github-account-settings.jpg` shows the preceding advanced configuration layout.

Marble hardware is the work of its upstream authors at [BerkeleyLab/Marble](https://github.com/BerkeleyLab/Marble), whose repository identifies the hardware license as CERN OHL v1.2. This project claims no ownership of that design and no upstream endorsement. The screenshots illustrate the viewer; the board source is not bundled in the extension release.

- Source revision: `a426777d92c0f22a546d4740b419a3937e0c1f90`.
- [Exact PCB source](https://github.com/BerkeleyLab/Marble/blob/a426777d92c0f22a546d4740b419a3937e0c1f90/design/Marble.kicad_pcb).
- File size: 44,059,775 bytes.
- SHA-256: `482850dbaaef9157e2e98af765a3c0d4d9c9f800daae224a54bf10e0621f52b0`.
- Linked models include STEP and `${CERN}` library references. The inspected repository tree has no supported WRL/GLB assets for these references. This renderer does not import STEP.

Visual inspection confirms these views loaded in the local harness. It does not establish pixel equivalence to native KiCad or correctness of every saved construct. Native KiCad remains necessary for authoritative design validation.


`integration/github-direct-discussion.jpg` and `github-formatted-review.jpg` capture the v0.11.8 editor in the same local synthetic PCB harness on 2026-10-04. They show a selected Discussion destination and Markdown preview with mocked category metadata. No account authorization or remote publication was performed.

`discussion-reply-draft.png` shows the actual browser editor after loading a synthetic marked Discussion comment and choosing Reply. The original sensor PCB fixture and provider responses are mocked; no private repository or remote post was used.

`integration/sheet-net-hierarchy.png` captures v0.12.17 shared outer/inner sheet trees and gold cross-sheet net badges on 2026-10-05. Saved root and Power drawings are synthetic local fixtures; Git transport is mocked. Outer-tree navigation was exercised without recreating the viewer, and SIGNAL_IN remained selected. No installed extension/private-account acceptance is implied.

The PNG `integration/loading-marble.png` was captured on 2026-10-05 from the actual schematic viewer loading the public Marble hierarchy through local fixture transport at port 8788. It shows the production loading surface while fetching and discovering sheets. No login or external publication occurred. See [performance evidence](../PERFORMANCE.md).

`integration/kicad-controls-themes.png` captures the production v0.12.19 schematic viewer in its dark display preset with the compact top controls, inspection strip and collapsed drawing-sheet overrides. Captured on 2026-10-05 using the synthetic hierarchy fixture and local mock transport at port 8788; no account or remote publication was used.

`integration/root-workspace-navigation.png` captures v0.12.20 at a 1000 × 700 CSS viewport on 2026-10-05. The requested `power.kicad_sch` subsheet automatically opens `hierarchy.kicad_sch`, its saved root. The screenshot shows the compact primary tab row, top sheet navigation and floating hierarchy tree. Synthetic source and mock repository transport at local port 8789; no account, installed extension or remote post was used.

`integration/pinned-auto-hide-panes.png` captures v0.12.21 on 2026-10-05 at a 1200 × 866 CSS viewport (75% browser scale). Explorer is pinned, and Properties and Comments remain collapsed to side tabs. The production viewer uses synthetic hierarchy drawings and local mock repository transport at port 8790. Wide and narrow layouts were inspected; no installed account or remote publication was used.

`integration/footprint-bounded-standins.png` captures v0.12.22 on 2026-10-06 in the light-theme Top view at an 800 × 667 CSS viewport (75% browser scale). The retained synthetic `extension/tests/fixtures/footprint-proxies.kicad_pcb` exercises offset front connectors at 90° and 37°, a back connector, and a circular body. Production parser and WebGL rendering, local source only; no account transport or linked model lookup. The back-side stand-in is below the board and hidden in this top view. Stand-ins are approximate boxes, not native mechanical models.

`integration/balanced-top-lighting.png` and `balanced-bottom-lighting.png` capture v0.12.23 on 2026-10-06 at a 1706 × 960 CSS viewport (75% browser scale). The local synthetic footprint fixture was extended with 12 matching tracks on each copper face and corner pads; parts were hidden to inspect copper illumination. The back view was reached by orbiting the production WebGL viewer. No Git service or linked model was used.

`integration/angle-measurement.png` and `readable-distance-measurement.png` capture v0.12.24 on 2026-10-06 using the production PCB viewer with the synthetic Sensor board and local mock transport at port 8792. They show a pinned 90° three-point angle and backed, separated distance/X/Y labels. The shared tool was also inspected on a narrow light schematic. No account or remote publication was used.

## README preview galleries

`integration/extension-compact-view.png` is an unchanged copy of the retained `.vizdiff/extension-compact-view.png` local browser preview. It shows a synthetic PCB in the actual viewer with collapsed side panels. Its original capture date was not recorded. It contains the viewer surface without system/browser chrome. It is illustrative evidence, not verification of the currently published extension package or live GitHub/GitLab integration. The adjacent hierarchy preview retains its version/date and mock-transport provenance above.

The README Android download button targets the v0.12.57 asset `pocket-kivi-android-phone-tablet-1.59-development.apk`. Releases currently use prerelease status, so the button uses the concrete asset URL rather than GitHub's stable-only `/releases/latest/download/` redirect.

### Android app-surface captures (2026-10-11)

`android/phone-schematic.png`, `phone-layout.png` and `phone-landscape.png` show the native Android 1.49 development app on a connected Samsung SM_A366E. `android/tablet-portrait.png` and `tablet-landscape.png` show the same app on a temporary tablet emulator. The drawings are a synthetic sensor interface fixture, not a private repository or production design.

The test-only capture uses Android PixelCopy restricted to the WebView's window bounds. These are real app pixels with the accelerated drawing canvas included. Android's status bar (clock, notifications and battery) and navigation bar are outside the captured surface; no image editing or generated UI was used. The app toolbar and workspace tabs remain visible. Root visually checked all five drawing captures and verified their README paths and PNG integrity. Tablet behavior here is emulator evidence, not a physical tablet acceptance claim.

The Android capture build passed `assembleDebug`, `assembleDebugAndroidTest` and `lintDebug`. A cold-start system-bar controller crash found during capture was fixed by initializing the window decor before requesting its controller; launch was then verified on phone and emulator. The home preview was deliberately omitted because its real native-library readiness warning persisted after refresh. Phone app data and original rotation settings were preserved; the owned temporary tablet emulator was removed.

`integration/testpoints-phone-0.12.40.png` is a local browser screenshot at 389 CSS pixels using `extension/tests/fixtures/bench-workflow/board.kicad_pcb` and mocked repository transport. It shows filtered saved testpoint data; it is not a physical-phone or live GitHub extension capture.

`integration/assembly-phone-0.12.40.png` uses the same synthetic fixture at 389 CSS pixels. It shows manually recorded assembly progress and the unfinished-parts action; no physical assembly or inspection result is represented.

`integration/board-analytics-phone.png` is a local browser capture at 389 CSS pixels using the retained synthetic `extension/tests/fixtures/board-analytics/tracks.kicad_pcb`, saved by native KiCad 10.0.6, with mocked repository transport. It shows saved straight/curved lengths and per-layer totals. It is not a physical-phone, complete-board or live GitHub acceptance capture. Both drawing themes and the desktop layout were checked.

`integration/review-handoff-phone.png`: shared transfer dialog after browser export/import, at 389 CSS pixels. Synthetic board fixture and mocked repository transport; controls are 44 CSS pixels high, with no horizontal dialog overflow. This is browser evidence, not a physical-phone capture.

`integration/local-parallel-view.png`: offline local workspace reading the retained sensor schematic hierarchy and PCB over the session-bound loopback transport. Browser file import, saved-source reload and R1 cross-probing were exercised. No KiCad renderer or Git host transport is used; native KiCad menu launch is not demonstrated by this capture.


## README platform galleries — 24 October 2026

The expanded root README reuses retained screenshots; no UI mockups or generated images were added. Documentation copies retain the original app pixels; the app-only crops listed below remove system/browser chrome. The documentation update is not a new app capture or a test of the newest APK/VSIX. Click-through images keep original resolution.

| Documentation image | Retained source | Context |
| --- | --- | --- |
| `chrome/schematic.png` | `dist/chrome-store-0.12.49/screenshots/01-schematic-1280x800.png` | Installed Chrome extension, local PIC Programmer schematic from the public KiCad demo. Browser tab/address bars are cropped out. |
| `chrome/pcb.png` | `dist/chrome-store-0.12.49/screenshots/02-pcb-1280x800.png` | Same installed Chrome extension and local PCB demo. No live repository authentication is demonstrated. |
| `chrome/bom-field-table.jpg` | `dist/chrome-store-0.12.50/evidence/bom-layout-improved.jpg` | Loopback local workspace, PIC Programmer demo, expanded BoM table and compact header. No Chrome browser frame is in this capture. |
| `android/marble-phone-layout.png` | `dist/ui-polish/marble-phone-layout.png` | Physical Samsung SM-A366E, Android development 1.55/code58, 14 October 2026; public Marble drawing. Retained device-test notes record a complete 2D render. It is not a capture of 1.59. |
| `tools/calculator.jpg` | `dist/ui-polish/calculator-desktop.jpg` | Local desktop browser capture of the shared RC calculator and its circuit illustration; analytical estimates, not a solver run. |
| `tools/gerber.jpg` | `dist/ui-polish/gerber-phone.jpg` | Phone-sized local browser view with synthetic trace/drill geometry. No physical-phone capture or complete DFM validation. |
| `tools/pdf.jpg` | `dist/ui-polish/pdf-phone.jpg` | Phone-sized local browser view of a synthetic inspection PDF, not private project data. |
| `tools/bom-phone-grid.jpg` | `dist/ui-polish/drawing-bom-grid-phone.jpg` | Shared drawing BoM field grid at phone size, local fixture. Physical-device acceptance is not established by this image. |
| `tools/board-setup.jpg` | `dist/ui-polish/board-setup-netclasses.jpg` | Local synthetic saved net classes and read-only board settings. Not a native rule evaluation. |
| `tools/testpoints.jpg` | `dist/ui-polish/testpoints-phone.jpg` | Phone-sized local browser testpoint page from the UI verification set; fixture data and mocked transport. |
| `tools/bom-reset-warning.jpg` | `dist/chrome-store-0.12.52/bom-reset-warning.jpg` | Local workspace reset warning. The demonstration was cancelled; no real project metadata was reset for the capture. |
| `tools/saved-analysis.png` | `.vizdiff/pocket-kivi-analysis-tablet.png` | Retained shared saved thermal-report color-field view. Original capture date/device and solver provenance are not recorded here; it illustrates the reader only, not physical-tablet or numerical acceptance. |

The VS Code images are linked directly from `vscode-extension/images/`: installed demo-window captures of KiCad's public PIC Programmer example. `visual-merge-conflict.jpg` uses a deliberately generated conflict changing one capacitor Value field. It is not a real customer merge, automatic semantic resolution or electrical redesign. See the [demo source note](../../vscode-extension/images/SCREENSHOT-SOURCES.md).

Android `phone-schematic.png` and `tablet-landscape.png`, and shared model, measurement, analytics, review and collaboration captures retain their individual provenance above. In particular, tablet screenshots are emulator evidence; browser phone-sized tools are not relabeled as physical Android captures; Marble 3D bodies in `marble-3d-proxies.jpg` remain approximate proxies. Public fixture/design authors retain their rights; no endorsement is implied.

## Current release renders (2026-10-27)

The five files in `current/` show the production 0.12.62 renderer and shared workspace code from source commit `7d006e698a8b07b7a19bbd7659a009dda4bd359c`. Captured on 27 October 2026 at 1440 × 900 CSS pixels, with browser/OS chrome outside the captured surface. No generated imagery, retouching or private project files were used.

- `pcb-3d-dark-0.12.62.jpg`, `pcb-3d-light-0.12.62.jpg`, and `pcb-3d-top-0.12.62.jpg`: the shared production Three.js/WebGL renderer, mounted locally with KiCad 10's distributed public PIC Programmer PCB demo. High quality and ambient occlusion were active. The source has 63 footprints and 247 pads. **Real linked component models are loaded for 56/63 footprints**, covering every saved model reference: 18 installed KiCad STEP library models and the demo’s `libs/3d_shapes/textool_40.wrl` (19 unique files, 3,093,878 bytes). Library environment paths resolve against the installed KiCad 10 model directory through the production asset loader; source model transforms are preserved. The seven bodies with no saved model (`P101`–`P106`, `JP1`) are hidden via the viewer’s population API; their pads and board geometry remain. No stand-in bodies are shown. STEP models retain the materials supplied by the production decoder, including neutral colours. All model-bearing footprints were confirmed loaded before capture, with no page exceptions. Rendering notes remain visible. These are shared-renderer browser captures, not physical Android or installed VS Code captures.
- `pcb-workspace-0.12.62.png` and `schematic-workspace-0.12.62.png`: the production schematic/PCB viewer pages with the same public demo PCB, root schematic and `pic_sockets.kicad_sch`, supplied by a local read-only mock repository transport. The fixture revision identifier is synthetic; it is not an upstream KiCad commit. These demonstrate the current shared UI without live GitHub/GitLab authentication or posting.

The PCB source is the installed `share/kicad/demos/pic_programmer/pic_programmer.kicad_pcb`, SHA-256 `aba03b4359e8bf162fe00b27b0d3394f2141acfbd3d43d9cf8e05bf0845d9bd5`. The demo title is SERIAL PIC PROGRAMMER. KiCad and the demo's authors retain their rights; no endorsement is implied. The source drawings and installed demo files were not altered. JPEGs were encoded directly by the browser at quality 90; PNG workspace captures are unchanged browser screenshots. All captures completed without browser page exceptions.


## App-only crop corrections (2026-10-27)

Reviewed all 72 documentation and VS Code screenshots, including enlarged top/bottom edges. Nine images needed corrections:

| Files | Original size | Retained rectangle (left, top, right, bottom; exclusive right/bottom) | Result |
| --- | --- | --- | --- |
| `android/marble-phone-layout.png` | 1080 × 2340 | (0, 101, 1080, 2301) | 1080 × 2200; Android status/gesture bars removed |
| `chrome/pcb.png`, `chrome/schematic.png` | 1280 × 800 | (0, 95, 1280, 800) | 1280 × 705; browser tab/address bars removed |
| All six `vscode-extension/images/*.jpg` captures | 1441 × 891 | (0, 0, 1441, 858) | 1441 × 858; desktop taskbar fragments and editor status-bar strip removed |

The application toolbars, drawing areas and relevant editor context remain. PNG crops preserve retained pixels exactly; cropped JPEGs are re-encoded at quality 97 with no chroma subsampling. No UI text, models or design content was reconstructed or generated. The other 63 captures, including the new linked-model renders and existing phone/tablet WebView captures, were unchanged. These are crop corrections to retained captures, not new device or current-version acceptance tests. Original release archives and capture evidence remain unchanged.


## SPIKE-inspired viewer refresh (0.12.64, 2026-10-27)

`current/pcb-3d-{dark,light,top}-0.12.64.jpg` uses the same unchanged public PIC Programmer PCB and 19 installed linked STEP/VRML files described above. All 56 model-bearing footprints load; P101–P106 and JP1 have no saved model and their bodies are hidden through the existing population API. No stand-in bodies are presented. These are actual production WebGL pixels with High/AO enabled and the new compact camera/display controls.

`current/pcb-workspace-0.12.64.png` and `schematic-workspace-0.12.64.png` use the actual viewer with the unchanged public demo and local mock repository transport. They show the refined 2D shell; no live provider authentication/posting or native Android acceptance is implied. All five captures are 1440 × 900 with no OS/browser bars or generated imagery. The former 0.12.62 captures remain retained historical evidence.


`current/comments-thread-0.12.64.png` (390 × 844) and `comments-workspace-0.12.64.png` (1280 × 800) show the actual production viewer and chat UI with a synthetic footprint fixture and mocked provider thread/publication responses. The test exercises explicit final review before a simulated write, thread draft preservation, message menus, search and responsive sizing. No live account or provider post was used. They are responsive browser previews, not physical Android screenshots, and contain no OS/browser bars.


## Capability gallery added 2026-10-29

### Draftsman guide capture

`draftsman/editor.png` is a 1280 × 800 application-only browser capture of the current Draftsman source preview, taken on 29 October 2026. It uses the retained synthetic `extension/tests/fixtures/net3d/inspection.kicad_pcb` fixture and local mock repository transport. The repository name and all-`a` revision are test data. The shown PDF export is generated locally; no live provider save, physical Android device or native KiCad plotting is demonstrated. The compact toolbar is newer than the first Draftsman release in 0.12.69. There are no OS, browser-address or Android status bars, and no generated/reconstructed image content.

`draftsman/kicad-template.png` and `draftsman/walkthrough.webm` use the same source/fixture in the alternative KiCad-style template. The walkthrough verifies the visible H1 mounting-hole centre snap, then performs local editing and PDF export. Recording ends before the harness's simulated folder/provider-write actions. These are local browser pixels, not native-device footage or a live GitHub save.

The README capability gallery adds the 30 retained views shown in the local gallery plus seven source previews of column selection, folder browsing, measurement assistance and generated PDF output. Existing tracked images are reused; the additional captures live in `features/`. These are actual application/browser pixels, not generated imagery.

The gallery mixes 0.12.64/0.12.65 captures and subsequent unreleased source previews. Captions identify historical UI, synthetic provider/commit/waveform data, stand-in component bodies and responsive browser previews. Phone-sized browser captures do not establish physical-device validation. No new live GitHub/GitLab post or remote fork is demonstrated.

The new analysis-family views were captured from source `25e3de6`. The wayriCAD field uses the retained actual QuickPI analytical-strip producer fixture, in standalone saved-field coordinates with no source PCB attached. Its 2D view contains A/B probes; its flat 3D surface does not imply invented physical thickness. `showcase-kicad-workbook.png` uses a synthetic empty version-8 workbook to demonstrate the separate settings view, and `showcase-waveform.png` uses an unclassified synthetic CSV. These inspect saved values rather than rerunning or qualifying a solver. See [wayriCAD](https://github.com/wayri/WayriCAD) and [the compatibility contracts](../ANALYSIS_VIEWER.md).

The new BoM/folder/measurement/download captures are source previews from 29 October 2026. The folder and drawing previews use KiCad’s public PIC Programmer demo with synthetic documentation/binary filenames; unsupported bytes are not loaded. The generated PDF is raster output from the browser viewer, rendered with bundled PDF.js. The 3D measurement fixture uses approximate stand-in component bodies. All were captured without OS/browser status or task bars; retained older Android pictures reuse the previously documented cropped assets.
