# KiCad Visual Review

Open KiCad schematics and PCBs beside your code—without installing KiCad. Inspect a design, review assembly fields, leave notes, and compare Git conflicts visually.

![Schematic review inside VS Code](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/schematic-review.jpg)

## Open your first project

1. Install the extension and open your KiCad project folder in VS Code.
2. Select a `.kicad_sch` or `.kicad_pcb`. If it opens as text, choose **Open With → KiCad Visual Review**.
3. Use **Explorer** for parts, nets and layers; use the search box to find a component or signal.

You can also press **Ctrl+Shift+P** and run **KiCad: Open Visual Viewer**.

![Open the visual viewer from the VS Code Command Palette](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/open-viewer-command.jpg)

## Inspect the board

Pan, zoom, flip the board and focus copper layers. Press **M** to measure in 2D. Select a component or net to inspect its saved properties.

![PCB inspection and drawing tools](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/pcb-inspection.jpg)

Turn on **Layers → Net names** to label traces and filled copper where there is room. Names stay upright when the board is flipped.

![Copper net names in the installed VS Code extension](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/copper-net-names.jpg)

For linked schematic/PCB inspection, run **KiCad: Open Paired Schematic and PCB Review**. Matching saved identities support cross-probing.

## Review assembly

Open the drawing's **BoM manager**. Choose columns and grouping, filter fitted/DNP parts, locate references and export the visible CSV. Review variants and highlight DNP/DNI footprints without changing the source design.

![KiCad-style BoM field table](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/assembly-bom.jpg)

**Testpoints & nets** helps plan probing. Board analytics and saved ERC/DRC reports help review existing design data. Available workspace models can load in the 3D board view.

## Compare a Git conflict

1. Select a marker-conflicted drawing and run **KiCad: Resolve Git Conflict Visually**.
2. Compare **Current** and **Incoming**, then choose one side for all conflict blocks.
3. Save a copy, or confirm replacement of the original. Staging is a separate confirmed action.

![Current and Incoming conflict comparison](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/7542d75ae3afbfd9444255ddcf330455742672bf/visual-merge-conflict.jpg)

This accepts a whole side across the file; it is not a per-object merger. Saving requires a trusted workspace. No commit or push happens automatically.

## Keep and share review notes

Use **Review** to add findings. Notes live in `.kicad-review.json`; commit that sidecar with your normal Git tools. Portable review exports carry supported notes, BoM metadata, variants and 2D view state between compatible viewers.

## Guide and limits

[Full user guide: all workflows, shortcuts, supported files and troubleshooting](https://github.com/wayri/kiview-marketplace-assets/blob/7542d75ae3afbfd9444255ddcf330455742672bf/VSCODE-GUIDE.md)

Drawings are read-only during ordinary inspection. Conflict replacement is an explicit write. Saved ERC/DRC findings are displayed; native checks are not run. The standalone PDF, calculator, simulation-results and imported iBOM tools belong to the companion apps. Close/reopen a drawing after external edits. Verify engineering decisions in the appropriate native tools.

Screenshots use the public KiCad PIC Programmer demo. The conflict fixture intentionally changes one Value field for demonstration.

Copyright © 2026 Yawar B (wayri). Source-available license; paid software distribution and monetized hosting require written permission. See the packaged `LICENSE.txt`. Third-party licenses remain applicable.

[Support](mailto:support.kiview@sigharmonic.com)
