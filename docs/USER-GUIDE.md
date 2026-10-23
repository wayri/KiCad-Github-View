# Pocket KiView user guide

Open saved KiCad projects, inspect schematics and layouts, and record review or assembly findings without a KiCad installation. Design sources are read-only during ordinary viewing. Review notes, assembly progress and variants are separate data; the VS Code conflict resolver is an explicit exception that can write a resolved drawing after confirmation.

This guide describes the current source capabilities. Older GitHub preview downloads may not include every control; check the release notes and the installed version. Host differences are called out below.

Start with the [installation guide](INSTALL.md) for Android, Windows, Linux and macOS. Check the [KiCad compatibility matrix](KICAD-COMPATIBILITY.md) before reviewing a new file format. Recognized KiCad 8, 9 and 10 constructs use the shared viewer; coverage is narrower for 8/9, and newer constructs may display warnings or incomplete previews.

## 1. Open a project

### Android

1. Choose **Open a file** for a drawing or project ZIP, or use the Android document picker for an available storage provider.
2. Prefer a complete project ZIP when the design includes subsheets, libraries or component models. Selecting one drawing does not grant access to its sibling files.
3. For a repository, use the GitHub or GitLab import controls. Public projects can be read without a connected account; private projects need authorized access through the app's account connection.
4. Use **Menu → Your projects → Save offline** to retain the loaded revision. Reopen it from **Offline** without a network connection. Save offline again after importing a newer revision; stored copies do not refresh automatically.

Offline copies belong to the app and disappear when app data is cleared or the app is uninstalled. **Export project ZIP** creates a separate, unencrypted file containing supported source/model files, without review metadata or credentials. Back up review state separately. See the [Android guide](../android-app/README.md).

### Chromium browser extension

Open extension Options and choose **Open local KiCad workspace**. Use **Open files**, **Open folder**, or drag files/a folder into the workspace. Folder import preserves relative paths so subsheets and models can be found. If directory dragging is unsupported, use **Open folder**. Local imports stay on your computer and can be viewed offline after installing the extension.

Enable **Parallel views** and choose a drawing for each pane to inspect schematic and PCB together. Matching saved part/net identities support cross-probing. Reimport browser-picked files after changing them externally: the viewer holds a saved snapshot. The optional loopback launcher has a separate **Reload saved project** action. See [local browser workspace](LOCAL-VIEWER.md).

For online review, open a supported GitHub/GitLab repository file page. Allow the extension access to the intended host. Private browser-session reads have provider-specific limits; publishing remote reviews requires a connected account and permissions. See [Git hosts and accounts](GIT-HOSTS.md) and [GitHub sign-in](GITHUB-SIGNIN.md).

### VS Code

1. Open the folder containing the project.
2. Select a `.kicad_sch` or `.kicad_pcb`. If it opens as text, choose **Open With… → KiCad Visual Review**, or run **KiCad: Open Visual Viewer** from the Command Palette.
3. Use the **KiCad Review** Explorer section to change drawings. Run **KiCad: Open Paired Schematic and PCB Review** for a companion editor.
4. Close and reopen a drawing after external edits. Run **KiCad: Refresh Review Navigator** after adding project files.

Desktop local-file review works offline. Web extension hosts depend on the files and permissions supplied by their workspace provider. See the [VS Code guide](../vscode-extension/GUIDE.md).

## 2. Navigate and inspect drawings

- Search for a reference, value or net; use **Explorer** for parts, nets and layers, and **Inspect** for saved properties.
- In schematics, open a child sheet and return to its parent with sheet navigation. **All sheets** provides a project-wide overview when the required sheets are available. See [sheet navigation](SHEET-NAVIGATION.md).
- In layouts, toggle layers, flip the board, or focus a copper layer. Show/hide side panels to regain canvas space on a phone.
- Select a part or net to highlight matching saved geometry. Paired views can follow matching selections; ambiguous or incomplete identities limit cross-probing.
- Enable **Net names** in Layers for labels on supported straight tracks and filled copper polygons. Labels depend on visible layers, saved net data and available space. They are display overlays, not connectivity changes. See [copper net names](copper-net-names.md).
- Open 3D for board geometry and available supported models. Import models with the project; missing external libraries or unresolved paths are not supplied merely by installing KiCad. The VS Code guide lists workspace model formats and limits.

Rendering warnings matter: a visible preview is not proof that every source construct was interpreted.

## 3. Measure, probe and review board data

Choose **Measure** in a PCB drawing, then select two points for a distance. Measurement options include angle, geometry/grid snapping, units and saved board extents. For an angle, select endpoint → vertex → endpoint. Exit measurement mode when finished. Desktop viewers also provide the **M** shortcut. Measurement uses saved 2D geometry; 3D measurement is unavailable.

Open **Testpoints & nets** to search candidate testpoints and their saved nets. Select a row to locate it in the drawing and export CSV for a bench checklist. Check classifications and connections against the actual board before probing.

**Board analytics** summarizes saved track lengths, zone polygon areas and routing/placement review candidates. Imported **ERC/DRC** reports can show findings and markers. These controls do not run native KiCad checks, refill zones or establish manufacturing readiness. Candidate airwires and placement flags are not native unrouted/unplaced counts.

## 4. Use the BoM field table

Open **BoM & assembly** in Android/browser project tools, or the drawing's **Open BoM manager** / **Assembly** controls. VS Code supplies the drawing manager; standalone imported BoM/iBOM pages belong to Android and the browser extension.

1. Filter parts by reference/value/field text, population, side or progress.
2. Open **Fields** to choose table columns. The phone table scrolls horizontally while keeping its first column and headers visible.
3. Enable grouping by **Value**, **Footprint**, **Value + footprint**, **Rate** or custom fields. Rate uses entered unit price and currency; missing prices are not zero. Different fields show `<mixed>`.
4. Select a reference to locate its saved object. Use **Manage** to enter procurement fields and local assembly progress. Editing a grouped row affects its listed parts; ungroup for individual control.
5. Export visible CSV for the current columns/groups, and metadata JSON to preserve local management drafts. Export before clearing storage or moving devices.

Saved design fields remain read-only. Management drafts are scoped to the saved source/revision and variant. Prices are entered locally; there is no live purchasing or currency conversion. Repeated hierarchical instances are not expanded into manufacturing quantities. See [BoM and assembly](BOM-ASSEMBLY.md), [field table and grouping](bom-field-table.md) and [supported import formats](BOM-IMPORT.md).

### Variants and DNP/DNI

Use **Manage variants** to create/import a review variant and stage fitted/DNP, Value, Footprint or MPN overrides. Choose **Save variants** to retain edits. The selected variant affects BoM quantities and supported population overlays without changing the source drawing.

Enable **DNP / DNI** in PCB drawing tools to highlight omitted footprints. BoM exclusion alone does not mean DNP. Imported BoM Studio exports describe the exported variant; they cannot reconstruct variants omitted by the producer. See [variants](variants.md).

### Reset progress or management fields

Export metadata first if you may need to restore it. Then choose:

- **Manage → Reset saved fields…** for one part or grouped row.
- **Reset progress / fields → Reset matching parts…** for the complete filtered result.
- **Reset entire source…** for the current source, including DNP/excluded parts.

The warning lists the affected identities and count. Choose assembly progress, procurement status, or all local management fields; acknowledge the warning before confirming. Changing the mode clears acknowledgement. Assembly resets to `not started`, procurement to `not ordered`; resetting all fields removes local overrides so original saved fields reappear. Cancel writes nothing. Source drawings and variant definitions are unchanged. Full details: [reset warning and scope](bom-field-table.md#reset-saved-management-fields).

## 5. Open fabrication files, documents and results

| Tool | Workflow and boundary |
| --- | --- |
| Gerber viewer & analyzer | In Android/browser, import fabrication layers and Excellon drills, toggle films, adjust opacity, measure, and export analysis JSON. Parsed bounds, stroke widths and drill findings are screening data, not complete DFM. Unsupported macros, transforms and slots are reported. VS Code provides inline Gerber/drill inspection, not the standalone analyzer page. [Gerber guide](GERBER-VIEWER.md). |
| PDF viewer | Android/browser: choose a PDF from project files or **PDF viewer**. Navigate pages, fit/zoom/rotate, use bookmarks, text search and extracted text. Scans need an existing text layer for search. No PDF editing, OCR or signature verification. This standalone page is unavailable in VS Code. [PDF guide](PDF-VIEWER.md). |
| Analysis & simulation | Android/browser: open a saved report from project tools. Choose Graphs, Data, Report or Source; use available traces and A/B probes. Supported spatial exports offer 2D/3D overlays. A PCB attachment requires an exact saved source binding; missing spatial data is not guessed. This viewer reads results and does not run solvers. VS Code does not open the standalone graphical results page. [Formats and probing](ANALYSIS_VIEWER.md). |
| Calculators | Android/browser: open **Calculators**, choose a circuit/tool and enter values in the displayed units. Inspect its diagram, calculated outputs, assumptions and warnings. Standalone calculator pages are unavailable in VS Code. [Calculator guide](CALCULATORS.md). |

KiCad simulation workbooks contain setup rather than waveform samples. Export CSV/TSV or supported ASCII RAW data from the simulation tool to inspect actual saved waveforms. Binary RAW is unsupported.

### WayriCAD simulation results

1. In WayriCAD / kiWay, save or export the result and its numerical data. Supported producer formats include quickTherm full JSON, quickPI mesh/result bundles and transient waveforms, and quickSI saved traces/reports. An HTML report alone may not contain the samples needed to recreate a plot.
2. Include the saved exports in the project folder/ZIP, or open a supported report directly. In Android use **Project → Analysis & simulation**; in the browser use **Analysis** in the project viewer.
3. Choose **Graphs**, **Data**, **Report** or **Source**. Select a trace or saved frame and use the available probes to inspect values. Supported spatial fields offer 2D/3D overlays; waveform-only results remain plots.
4. To attach spatial results to a PCB, include the exact board referenced by the result's saved source hash and the required coordinate/layer metadata. A different board revision is not silently substituted. Without an eligible board binding, inspect the standalone saved field.

This cross-compatible workflow displays saved exports; it does not launch WayriCAD solvers, synchronize live sessions or promise every producer version/schema. Include result files in the offline project copy to review them without a network connection. The standalone results viewer is available in Android/browser, not currently in VS Code. See the [format matrix and producer evidence](ANALYSIS_VIEWER.md#verified-formats).

## 6. Record, share and transfer a review

Use **Review** / **Comments** to anchor a note to a drawing object, position or area. Add severity, tags and state; review the destination and any image before publishing. Saving a local draft does not post it.

In the browser and supported app flows, GitHub Issues/Discussions and GitLab issues/issue-discussion threads require authorized account access. GitLab issue discussions are not standalone GitHub-style Discussions. Remote history/readback differs by host; use the [comments guide](COMMENTS.md) and [Git host matrix](GIT-HOSTS.md) for exact scope. Local state changes do not automatically close remote issues.

VS Code writes annotations to a `.kicad-review.json` sidecar. Inspect it in Source Control and commit it with normal Git tools to share it; this host does not publish notes to GitHub/GitLab. Assembly drafts use separate local storage.

Use portable review export/import to transfer supported notes, BoM metadata, variants and 2D view/measurement state. Open matching source drawings on the destination first: import checks paths and content fingerprints. Portable reviews do not include CAD sources, original photos, model files, credentials or entire remote conversations. Export is explicit transfer, not device synchronization.

For photo-assisted assembly review, import top/bottom photographs, align known component centers and inspect matched references. Population suggestions require reviewed reference photos and manual confirmation; the overlay does not track camera movement. See [photo alignment and testpoints](PHOTO-AR-TESTPOINTS.md) and [population inspection](POPULATION-INSPECTION.md).

## 7. Resolve a Git conflict in VS Code

1. Select a marker-conflicted `.kicad_sch` or `.kicad_pcb` and run **KiCad: Resolve Git Conflict Visually**.
2. Inspect **Current** and **Incoming** with linked cameras and saved-object difference highlights.
3. Choose **Use current** or **Use incoming**. The choice applies to every conflict marker block in the file; it is not a per-component semantic merge.
4. Save a resolved copy, or explicitly confirm replacement of the conflicted file. A trusted workspace and unchanged saved source are required.
5. Optionally confirm **Stage resolved file**. Nothing is committed or pushed automatically.
6. Open the resolved design in KiCad and run native checks before accepting it.

See the illustrated [VS Code conflict guide](../vscode-extension/GUIDE.md#resolve-git-conflicts-visually).

## Troubleshooting and support

- **Missing subsheet/model:** import the complete project folder/ZIP and inspect path or size warnings. Absolute/external model paths may be unavailable.
- **Old drawing after an edit:** reimport browser snapshots, reload the loopback project, or close/reopen the VS Code editor.
- **Private repository fails:** check account access and the exact host/repository; a 404 may mean denied access. Android does not inherit a desktop browser's cookies.
- **Drafts missing on another device:** export/import their metadata. Local storage is separate for each app/browser profile, and loopback ports have separate browser storage.
- **Large project is incomplete:** inspect truncation and parser diagnostics; reduce the imported set rather than assuming a partial view is complete.

Contact [support@sigharmonic.com](mailto:support@sigharmonic.com) with the app/extension version, operating system, exact steps and a non-confidential minimal example. Do not include account tokens or private project data without authorization.
