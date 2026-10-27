# Chrome Store screenshots — 0.12.64

Captured 28 October 2026 at 1280 × 800, without OS taskbars or browser tab/address bars. Upload the individual PNG files to the existing Chrome Store listing in this order:

1. `01-pcb-layout.png` — compact PCB workspace and floating layer control.
2. `04-schematic.png` — schematic and sheet hierarchy.
3. `02-pcb-3d.png` — fitted 3D board with linked models.
4. `03-pcb-3d-top.png` — top camera view.
5. `05-3d-display-controls.png` — grouped appearance, quality and visibility controls.

These are unretouched screenshots of the actual unpacked Chromium extension from the audited 0.12.64 release ZIP, running in Edge 156.0.4314.42. Chrome's branded test executable did not load the unpacked extension through command-line flags, so these are not claims of Chrome Store installation acceptance. The screenshots contain only the extension's UI, which is shared by the Chromium package.

Source: the public PIC Programmer demo installed with KiCad 10, imported through the shipped local-folder picker. Original schematic/PCB contents were not changed. Nineteen linked STEP/VRML assets load on 56 of the board's 63 footprints. Seven footprints lack linked models and retain the shipped bounded fallback bodies; the renderer's diagnostic remains visible. No synthetic account, review conversation, provider response, or generated image content was used.

The store screenshot size reference is https://developer.chrome.com/docs/webstore/images#screenshots. This capture set documents the current interface; it is not a guarantee of native KiCad rendering equivalence or store approval.
