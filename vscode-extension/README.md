# KiCad Visual Review

Open KiCad schematics and PCBs beside your code—without installing KiCad. Inspect a design, review assembly fields, leave notes, and compare Git conflicts visually.

![Schematic review inside VS Code](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/schematic-review.jpg)

## Open your first project

**KiCad versions:** recognized KiCad **8, 9 and 10** `.kicad_sch` and `.kicad_pcb` constructs use the shared viewer. Native reference fixtures use KiCad 10; 8/9 coverage is narrower and does not certify every feature. Newer generator versions open as warned previews. No KiCad installation is required. Linked and supported embedded 3D models can load when their assets resolve. Component-class rules, schematic net-class rule areas and native schematic tables are not implemented. [Compatibility details](https://github.com/wayri/kiview-marketplace-assets/blob/main/COMPATIBILITY.md).

1. Install the extension and open your KiCad project folder in VS Code.
2. Select a `.kicad_sch` or `.kicad_pcb`. If it opens as text, choose **Open With → KiCad Visual Review**.
3. Use **Explorer** for parts, nets and layers; use the search box to find a component or signal.

You can also press **Ctrl+Shift+P** and run **KiCad: Open Visual Viewer**.

![Open the visual viewer from the VS Code Command Palette](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/open-viewer-command.jpg)

## Inspect the board

Pan, zoom, flip the board and focus copper layers. Press **M** to measure in 2D. Select a component or net to inspect its saved properties.

![PCB inspection and drawing tools](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/pcb-inspection.jpg)

Turn on **Layers → Net names** to label traces and filled copper where there is room. Names stay upright when the board is flipped.

![Copper net names in the installed VS Code extension](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/copper-net-names.jpg)

For linked schematic/PCB inspection, run **KiCad: Open Paired Schematic and PCB Review**. Matching saved identities support cross-probing. Drag the native VS Code editor-group divider to resize the two views.

## Review assembly

Open the drawing's **BoM manager**: a full-width table with sticky headers and a fixed reference column. Search and grouping stay visible; columns, filters and import/export collapse to keep the rows in focus. Choose columns and grouping, filter fitted/DNP parts, locate references and export the visible CSV. Review variants and highlight DNP/DNI footprints without changing the source design.

![KiCad-style BoM field table](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/assembly-bom.jpg)

**Testpoints & nets** helps plan probing. Board analytics and saved ERC/DRC reports help review existing design data. Available workspace models can load in the 3D board view. Measure works in 2D and between 3D model surfaces, with five-entry session history. **Tools → Reports** opens saved KiCad Monkey design/netlist JSON and analysis data in a native Results tab.

## Browse files and Git history

Open **Repository** from the drawing tools to browse working files, status colours, branches and the commit graph. Expand a commit for its message, author, date and parents. Refresh follows current HEAD; older pages stay pinned. Choose **Browse files** on a commit to inspect its pinned file tree and open supported drawings as read-only saved snapshots. Native Git and workspace trust are required; working files and the checked-out branch stay unchanged.

## Compare a Git conflict

1. Select a marker-conflicted drawing and run **KiCad: Resolve Git Conflict Visually**.
2. Compare **Current** and **Incoming**, then choose one side for all conflict blocks.
3. Save a copy, or confirm replacement of the original. Staging is a separate confirmed action.

![Current and Incoming conflict comparison](https://raw.githubusercontent.com/wayri/kiview-marketplace-assets/634d2135944e9d2601b178864514df8d9aa9243a/visual-merge-conflict.jpg)

This accepts a whole side across the file; it is not a per-object merger. Saving requires a trusted workspace. No commit or push happens automatically.

## Keep and share review notes

Use **Review** to add findings. Notes live in `.kicad-review.json`; commit that sidecar with your normal Git tools. Portable review exports carry supported notes, BoM metadata, variants and 2D view state between compatible viewers.

With a matching Git remote in a trusted checkout, open the Review account control to connect: GitHub uses VS Code native sign-in; GitLab tokens stay in SecretStorage for the exact remote host. Select Issue or Discussion, enter a number and choose **Load thread** to read its body, comments and replies. GitLab discussions belong to issues.

Create a draft or choose **Reply**, review the destination and optional screenshot, then explicitly select **Comment** or **Publish**. Pinned annotation readback and publication verify the displayed source against committed Git blobs; commit dirty drawings and reopen first. Historical snapshots remain read-only. Notifications, a full issue inbox and GitLab merge-request posting are not included.

## Guide and limits

**Companion browser edition:** [KiCad Visual Review for Chrome](https://github.com/wayri/kiview-marketplace-assets/blob/main/CHROME-HOME.md) reviews local projects and supported GitHub/GitLab pages. The latest companion ZIP is available from the project releases; store and GitHub versions may differ. Each edition works independently; portable review exports transfer supported review state.

[Full user guide: all workflows, shortcuts, supported files and troubleshooting](https://github.com/wayri/kiview-marketplace-assets/blob/main/VSCODE-GUIDE.md)

Drawings are read-only during ordinary inspection. Conflict replacement is an explicit write. Saved ERC/DRC findings are displayed; native checks are not run. The standalone PDF, calculator, simulation-results and imported iBOM tools belong to the companion apps. Close/reopen a drawing after external edits. Verify engineering decisions in the appropriate native tools.

Screenshots use the public KiCad PIC Programmer demo. The conflict fixture intentionally changes one Value field for demonstration.

Copyright © 2026 Yawar B (wayri). Source-available license; paid software distribution and monetized hosting require written permission. See the packaged `LICENSE.txt`. Third-party licenses remain applicable.

[GitHub project](https://github.com/wayri/KiCad-Github-View) · [Support](mailto:support@sigharmonic.com)

The GitHub repository is public; browse the source, guides and release downloads there.
