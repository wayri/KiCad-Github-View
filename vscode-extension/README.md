# KiCad Visual Review for VS Code

Inspect KiCad schematics and PCB layouts beside your code, review assembly data, and resolve marker-based Git conflicts with a visual comparison. Open saved project files directly in VS Code without installing KiCad. Ordinary inspection leaves the design files unchanged; resolving a conflict is an explicit, confirmed write action.

![Schematic review in the installed VS Code extension](https://raw.githubusercontent.com/wayri/KiCad-Github-View/64d4fb63345855373a9d0de0d7779e2c6899d3eb/vscode-extension/images/schematic-review.png)

Screenshots show the installed extension with the public KiCad 10 PIC Programmer demo. The conflict example intentionally changes one footprint Value field; it is a demonstration, not a customer merge.

## Start a review

1. Install **KiCad Visual Review** and open a folder containing your saved KiCad project.
2. Select a `.kicad_sch` or `.kicad_pcb` in Explorer. If it opens as text, use **Open With… → KiCad Visual Review**, or run **KiCad: Open Visual Viewer** from the Command Palette.
3. Use the **KiCad Review** section in Explorer to switch drawings. Inside the viewer, open **Explorer** for Parts, Nets and Layers, or use search to locate a reference, value or net.
4. Run **KiCad: Open Paired Schematic and PCB Review** to open the companion drawing beside it. Select a part or net to follow it between the two views where the saved identities match.
5. Add findings in **Review**, then inspect the generated `.kicad-review.json` in Source Control. Commit that sidecar with the project when you want to share the review history.

The viewer reads a saved snapshot. Close and reopen it after editing a drawing or externally editing its review sidecar. Run **KiCad: Refresh Review Navigator** after adding project files.

## What you can do

| Use case | Tools and outcome |
| --- | --- |
| Understand an unfamiliar design | Read hierarchical schematics, navigate child and parent sheets, inspect saved symbol fields, and follow nets and connections. |
| Review firmware and hardware together | Keep code, schematic and layout in adjacent VS Code editor groups; cross-probe matching component and net selections in paired schematic/PCB viewers. |
| Find components and signals across a project | Search references, values, fields, nets and net classes, including bounded wildcard/regular-expression searches; highlight multiple matches and step through connections. |
| Inspect a crowded PCB | Toggle layers, use Front/Back/Copper presets, dim or isolate a layer, flip the view, inspect pads and footprints, and restore the previous visibility state. |
| Check saved mechanical clearances and dimensions | Measure distance, angle and X/Y offsets in 2D with geometry/grid snapping; inspect saved board-outline bounding dimensions in mm or mil. |
| Review assembly and procurement fields | Use a KiCad-style BoM field table, select visible columns, filter fitted/DNP/excluded parts, group by value, footprint or unit price/currency, and export the visible CSV. |
| Track a bench assembly | Record local procurement and assembly checklist fields; locate a BoM reference in the drawing and export/import its management metadata. |
| Compare assembly variants | Create/import review variants with fitted/DNP and Value, Footprint or MPN overrides; switch variants in the BoM and highlight DNP/DNI footprints on the PCB. Source drawings stay unchanged. |
| Plan probing and board bring-up | Open **Testpoints & nets**, filter the saved testpoints and connected nets, select a row to locate it, and export a CSV summary. |
| Quantify a saved board | Inspect track and arc lengths, zone outline/fill polygon areas, placement review candidates and candidate airwires; export board analytics JSON. |
| Review existing electrical/design-rule findings | Load saved KiCad ERC/DRC reports, inspect finding details, navigate supported anchors, and show/hide their markers. |
| Inspect project configuration | Browse project files and saved settings, net classes, constraints, layer details and available physical stackup using read-only forms and tables. |
| Inspect fabrication outputs | Open supported Gerber and Excellon drill files; overlay available layers, adjust color/opacity, focus a layer and measure the rendered geometry. |
| Inspect board shape and component models | Open the shared SPIKE 3D board view; load supported footprint model files available inside the workspace. |
| Record actionable review findings | Anchor notes to drawings, objects, positions or areas; use severity, tags and open/resolved/wont-fix states, with optional bounded PNG captures. |
| Continue a review on another device | Export/import a portable review containing notes, BoM metadata, variants and the current 2D view/measurement. Import checks drawing paths and content fingerprints against the destination. |
| Match an assembly photo to the saved board | Import top/bottom board photos into **Photo & AR review**, align four known component centers, and select markers to inspect matching saved components. Assisted population checks require reviewed fitted/empty reference photos. |
| Inspect generated HTML documentation | Open project HTML in an isolated static preview with scripts and external assets disabled. |
| Resolve a conflicted drawing visually | Compare current/incoming reconstructions with linked cameras and saved-object difference highlights, accept one complete conflict side, save a copy or replace the original, and optionally stage it. |
| Review without a local KiCad installation | Use desktop VS Code for local files, or a compatible web extension host such as github.dev when its workspace filesystem supplies the files. Local desktop file review can work offline. |

![PCB layout inspection in VS Code](https://raw.githubusercontent.com/wayri/KiCad-Github-View/64d4fb63345855373a9d0de0d7779e2c6899d3eb/vscode-extension/images/pcb-inspection.png)

## Assembly, variants and testpoints

Open **Assembly** from a drawing to use the field table. Show the fields relevant to your review and group equivalent items by value/footprint, value, footprint, unit price/currency, or a custom set of fields. Filter by population, board side, procurement status and assembly progress. Mixed values remain visible as mixed values rather than silently becoming one part's value.

The table uses the saved symbols/footprints and review metadata. Selecting a reference locates that object in the drawing. Export **visible CSV** for the current columns/groups, or export **metadata JSON** to preserve the local management fields. Repeated hierarchical sheet instances are not expanded into a manufacturing quantity calculation; multi-unit schematic symbols count once per saved file/reference.

Variant overrides affect the review and its BoM/DNP overlays, not the original KiCad fields. Procurement and assembly drafts use the webview's local storage; export them before changing machines or clearing host storage. Variant configurations and drawing theme/unit preferences use VS Code workspace state. Git-trackable annotations use the separate review sidecar.

For bring-up, **Testpoints & nets** provides a searchable table of candidate testpoints and saved net relationships, with navigation back to the drawing and CSV export. Classification and connectivity depend on the saved design data; verify critical probing decisions against the physical board.

![BoM field table and assembly review in VS Code](https://raw.githubusercontent.com/wayri/KiCad-Github-View/64d4fb63345855373a9d0de0d7779e2c6899d3eb/vscode-extension/images/assembly-bom.png)

## Resolve Git conflicts visually

Use this when Git has left conflict markers in a saved `.kicad_sch` or `.kicad_pcb` and a text diff is difficult to interpret.

1. Select the conflicted drawing in Explorer and run **KiCad: Resolve Git Conflict Visually**.
2. Inspect **Current** and **Incoming** side by side. Pan/zoom either drawing with linked cameras and examine the highlighted saved-object differences and properties.
3. Choose **Use current** or **Use incoming**. This keeps the chosen side of **every conflict marker block** and preserves text outside the conflicts. It is one whole-side choice across the file, not a per-object or per-marker merge editor.
4. Choose **Save resolved copy** to create a new file inside the same workspace, or **Replace conflicted file** to replace the original after confirmation. Saving requires a trusted workspace; unsaved source edits or detected source changes block it.
5. After replacing the original, optionally choose **Stage resolved file**. This is a separate confirmed operation through VS Code's built-in Git extension, when a Git repository is available. No commit or push happens automatically.
6. Open the result in KiCad and run the appropriate native checks before accepting the design.

![Visual merge-conflict comparison in the installed VS Code extension](https://raw.githubusercontent.com/wayri/KiCad-Github-View/64d4fb63345855373a9d0de0d7779e2c6899d3eb/vscode-extension/images/visual-merge-conflict.png)

The conflict viewer reconstructs the two sides from markers in the selected file. It is not a general Git history/revision browser, three-way semantic merger, or automatic resolution engine. Syntax/root validation checks the saved file structure; it does not establish electrical correctness. Concurrent external writers can still race a filesystem-provider write after the final source check.

## Measurements, analytics and validation boundaries

Press **M**, select a start point, and move the pointer for a live distance/angle/X/Y overlay; select the endpoint to pin a distance. Ruler controls also provide angle measurement, snapping and grid spacing. **Alt** bypasses snapping, **Shift** constrains horizontal/vertical movement, and **Escape** exits. Geometry snapping follows visible saved geometry and layer isolation. Measurements work in flipped 2D views; 3D measurement is unavailable.

Saved board-outline extents are axis-aligned bounds of Edge.Cuts geometry, including detached shapes; they do not validate a closed manufacturable outline. Zone analytics report saved polygon areas, and routing/placement indicators are review candidates rather than native KiCad unrouted counts, DRC or placement validation. File-only schematic net inference has the limitations displayed by the renderer.

ERC/DRC controls display **saved reports**. The extension does not run native KiCad ERC/DRC, refill zones, route tracks, edit circuit connectivity, or certify manufacturing readiness.

Photo review uses manual four-point alignment. Live camera availability depends on the VS Code host and permissions; photo import is the fallback. The overlay does not track camera motion and must be realigned after movement. Population/variant suggestions require review and are not an automatic assembly acceptance decision. Photo-derived discussion drafts stay local in this host.

## Local review data and supported files

**Drawings and project files:** saved `.kicad_sch`, `.kicad_pcb`, `.kicad_pro`, `.kicad_prl`, `.kicad_dru`, `.kicad_wks`, supported library tables, Gerber and drill files. The navigator lists up to 200 supported saved files; project inventory and search show explicit truncation warnings when their limits are reached. Hierarchy loading is limited to 32 sheets, 8 MiB per file and 24 MiB per project. Missing sheets are reported.

**3D assets:** workspace-relative WRL/VRML, GLB and STEP/STP files, limited to 8 MiB per file, 32 requests and 32 MiB per editor session. Absolute paths, unresolved KiCad library variables and paths outside the workspace are unsupported. Files/directories reported as symbolic links are excluded. Assets must be available through the workspace filesystem provider; installing KiCad is not a substitute for supplying missing model files.

**Annotations:** `.kicad-review.json` lives at the containing workspace root, or beside the drawing when opened without a workspace. It uses schema version 1 and stores drawing/object anchors, severity, tags, state, timestamps and optional remote references. New notes use `local/workspace` and revision `workspace`; existing remote provenance is retained. Captures are limited to 256 KiB encoded PNG data per note and 1024 pixels per dimension, within a 4 MiB sidecar limit.

Sidecar writes validate and stage data, detect external changes, then request a filesystem-provider rename. Interrupted staging and failed renames preserve the original. Replacement guarantees depend on the provider; the API does not offer compare-and-swap against a concurrent edit after the final check. Read-only providers cannot save annotations. Unsupported schemas/fields or malformed records are rejected before replacement.

**Portable reviews:** transfer includes review metadata and optional embedded note captures, not CAD sources, original photos, model files, account credentials or remote threads. Open matching source files on the destination before importing. This is explicit file transfer, not automatic device synchronization.

Previous workspace-state notes remain intact. Run **KiCad: Import Previous Workspace Notes into Sidecar** to migrate the active project's previous notes explicitly. Page settings and layer focus are session-only.

## VS Code and companion-app capabilities

This listing describes the VS Code host. It does not publish notes to GitHub/GitLab, retrieve remote issues/discussions or offer arbitrary Git revision comparisons. Use your normal Git tools to commit and share sidecars.

The browser extension and Android app provide additional standalone engineering tools: the PDF viewer, calculator/circuit catalog, imported BoM/iBOM workspace, saved simulation-results viewer and dedicated Gerber analyzer. Those standalone pages cannot currently open in VS Code. VS Code includes its drawing BoM manager, saved board analytics, inline Gerber/drill review and static HTML preview; interactive iBOM is unavailable here.

Desktop and web extension hosts use the same entry point, including virtual workspaces where a provider supplies the files. File availability, writes, camera access and Git staging depend on that host/provider. Ordinary viewing does not execute project code or launch native KiCad commands.

## Commands and keyboard shortcuts

| Command | Purpose |
| --- | --- |
| **KiCad: Open Visual Viewer** | Open the selected saved file visually. |
| **KiCad: Open Paired Schematic and PCB Review** | Choose and open an opposite-type drawing beside the current one. |
| **KiCad: Resolve Git Conflict Visually** | Review and resolve a marker-conflicted drawing. |
| **KiCad: Open Review Sidecar** | Inspect the project's annotation JSON in VS Code. |
| **KiCad: Refresh Review Navigator** | Refresh saved project files in Explorer. |
| **KiCad: Import Previous Workspace Notes into Sidecar** | Explicitly migrate previous local notes. |

Inside a drawing: **/** focuses search, **E** inspects properties, **H** highlights a net, **C** opens comments, **Space** recenters, and **M** starts the ruler. **Enter** or double-click opens a child sheet; **Alt+Up** returns to its parent. For PCB layer focus, **[** and **]** cycle layers, **Shift+F** fits the focused layer, and **Escape** restores visibility. The viewer's keyboard guide lists contextual controls.

## Build and test from source

From the repository root:

```text
python scripts/package_vscode.py
node --test vscode-extension/tests/*.test.cjs
python -m unittest discover -s tests -p test_package_vscode.py
```

Packaging prepares the explicit shared media and writes an installable VSIX to `build/`. Re-run packaging after shared viewer changes. Use the supplied launch configuration with **F5** for extension development; compatible web hosts use standard VS Code web-extension development tooling. Packaging does not publish to Marketplace.

Automated checks cover virtual URIs, hierarchy bounds, the private bridge, annotations, conflict actions, content security policy and package contents. Installed desktop/web-host checks remain necessary.

[Source and issue tracker](https://github.com/wayri/KiCad-Github-View) · [Support](mailto:support.kiview@sigharmonic.com)
