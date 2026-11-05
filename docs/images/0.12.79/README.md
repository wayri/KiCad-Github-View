# Capture provenance · 0.12.79

[Demo board acknowledgements](../../DEMO-BOARD-CREDITS.md): thanks to OLIMEX, Berkeley Lab Marble and Ttl/FMCW3 contributors; design/model licenses remain with their respective upstream sources.

Captured **2 November 2026**. [Workflow gallery](../../SCREENSHOT-GALLERY-0.12.79.md) · [Capture manifest](capture-manifest.json).

The screenshots show production packaged UI served over loopback with a local-project bridge. They do not show an installed Chrome extension, a VS Code installation, a physical Android device or a live authenticated provider workflow. The audited Chrome/Chromium ZIP SHA-256 is `02fdbb2e7387c6a151950b4ac856a2c329eeccb35b4ff3d86e1e5324b75e8789`.

All pictured drawing/model/fabrication source comes from these immutable public revisions:

- Olimex ESP32-PoE M2: `deb38a377d50eadb04ddc7118a17a5ae58b1ee53`.
- BerkeleyLab Marble: `a426777d92c0f22a546d4740b419a3937e0c1f90`.
- Ttl/FMCW3: `e57ce3bd46c862798b6acc4206564233bcbd5aaf`.

Local source snapshot manifests are retained as capture evidence. The portable `capture-manifest.json` records immutable public source URLs and hashes, repository revisions, corpus hashes, image dimensions, byte sizes and SHA-256 digests. Local review drafts/assembly states are identified as demonstration data rather than upstream records. There are 38 JPEG captures.

## Reading the evidence

- Real 3D coverage is **126/143** linked components, not a complete assembly. The +5V capture inspects 64 track segments and four vias.
- Capture 07 shows a layout probe rotated 90 degrees and a sibling 3D popup moved from DOM x = 76 to 532, with curved guides. Capture 09 proves pad selection only; capture 10 separately demonstrates the actual +5V PCB/schematic cross-selection.
- Capture 13 marks one part Placed and 142 not started as a local demonstration. Captures 15–17 save/filter/locate local Minor issue drafts; no remote comments are posted.
- Capture 18 is a reviewed Fast PI setup: 5 V, 0.1 A, 58 MS/m and saved stackup. Unsupported slotted drills reject this board; no solved PI result is claimed.
- Captures 19–21 show the KiCad-style Draftsman template, 28 × 80 mm dimensions, top/isometric copper-hidden views, a real generated PDF link and local draft. GitHub save is disabled without authentication.
- Captures 23–24 use 13 upstream Gerber/drill files, with 12 rendered. PTH is rejected for unsupported slots/macros. The 1,002 findings are screening data, not DFM certification.
- Marble shows 25 loaded pages; repeated QSFP2 has a two-instance stack. FPGA_MISO filtering shows four matching sheets, and hierarchy/net links have separate toggles.
- FMCW3 root/power subsheet navigation works within restricted legacy preview limits. The PCB fails with `Invalid numeric KiCad value`; its provisional picture was excluded.
- No real simulation workbook/wayriCAD saved results or successful ERC/DRC report was available for these captures. Native KiCad DRC failed and produced no report. No findings or solver result was fabricated.

See the workflow gallery’s coverage matrix for uncaptured tools and account-backed operations. These limitations apply to this evidence set; they do not establish general support or failure for every project.

## Added download and responsive captures

- Capture 34 confirms real layout PDF generation and browser-download handoff. The reported render is 1920 × 4096 pixels; no downloaded filesystem path was verified.
- Captures 35–37 are responsive web previews: requested 390 × 844 at 75% browser zoom, observed DOM and JPEG 520 × 1125, DPR 0.75. The 3D view waited for visible 126/143 linked-model status.
- Capture 38 is a top-camera responsive 3D preview: requested 1024 × 768, actual JPEG 1365 × 1024, with the same visible 126/143 model coverage. These are not physical phone/tablet or Android captures.
- The capture bridge’s legacy-adapter wiring was corrected during capture preparation. This hosting correction is not evidence of a shipped-product defect. The distinct FMCW3 PCB numeric-load failure is still disclosed and has no gallery image.
