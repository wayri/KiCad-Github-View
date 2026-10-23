# Copper net names

The shared 2D PCB canvas now supports SPIKE-style presentation labels for named straight traces and saved filled copper polygons. Enable **Net names** in the floating Layers controls, or **Net names on copper (2D)** in View and page setup. The per-drawing preference is stored through the existing browser, mobile or VS Code host adapter; it defaults off for existing projects.

Labels follow the visible segment angle and remain upright in flipped views. They appear only when the visible copper has room for a readable label, avoid other net-name labels and stop at 300 labels per frame. Names use the saved net model; geometry and source files are unchanged. Hidden layers, focused copper layers, isolated nets and hidden zone fills control label visibility. Unfilled zones, arcs, pads and 3D objects do not receive these presentation labels.

Implementation uses the existing owned canvas, spatial candidate index and workspace net model. No new runtime package or asset is required. SPIKE's `LayoutViewport.tsx` and `viewportPerformance.ts` informed the placement and readability behavior.

Verification: 165 focused shared renderer/workspace tests and 45 VS Code host tests passed, including net-name placement, clipping, collisions, flipped camera, layer/isolation filtering and preference persistence/rejection. The saved public KiCad PIC Programmer board was visually checked in the local shared-renderer harness, including its flipped view. Installed Android and VS Code host visual acceptance and a new Marketplace upload remain pending.
