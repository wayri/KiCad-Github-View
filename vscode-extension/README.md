# KiCad Visual Review for VS Code

Open saved `.kicad_sch` and `.kicad_pcb` files with **KiCad Visual Review**, or run **KiCad: Open Visual Viewer**. The same extension entry point supports desktop VS Code and web extension hosts such as github.dev, provided the workspace filesystem provider supplies the files.

The viewer shares the browser extension's schematic/PCB renderers and review interface: pan/zoom, fit drawing/sheet, properties, nets, layer controls, measurement, assembly variants, local annotations and SPIKE board 3D. Drawing files are read only. The editor reviews a saved snapshot: close and reopen it after changing source files. Hierarchy reads stay in the containing workspace (or the opened file's directory outside a workspace), with limits of 32 sheets, 8 MiB per file and 24 MiB per project. Missing sheets are reported. Files and descendant directories reported as symbolic links are excluded; this depends on the filesystem provider exposing links correctly.

Review annotations are saved in `.kicad-review.json` at the containing workspace root (or the drawing's directory when opened outside a workspace). Add and commit this sidecar with your KiCad project to track review history in Git. It contains schema version 1, drawing/object anchors with positions and optional rectangular areas in millimetres, severity, tags, open/resolved/wont-fix state, creation/update timestamps and optional remote issue/discussion references. Optional PNG captures are limited to 256 KiB of encoded data per note and 1024 pixels per dimension; captures count toward the 4 MiB sidecar limit. New local notes use the portable repository marker `local/workspace` and revision `workspace`; existing GitHub provenance is preserved. No GitHub repository or revision is guessed.

Writes stage a validated file in the same directory, check for external changes, then use the filesystem provider's rename operation. Interrupted staging and failed renames preserve the original sidecar. Atomic replacement guarantees depend on the provider; the VS Code filesystem API does not provide compare-and-swap against edits after the final check. A provider without writable staging/rename cannot save annotations. Files over 4 MiB, unsupported versions, malformed records and unknown fields are rejected before replacement. Close and reopen the viewer after externally editing the sidecar to reload its annotations.

Existing notes from the previous workspace-state storage are left intact. Run **KiCad: Import Previous Workspace Notes into Sidecar** explicitly to migrate notes for the active project; it retains the original drafts. Imported assembly variants and drawing-scoped UI/drawing themes and ruler units use VS Code workspace state. Page settings remain session-only. This version does not publish annotations, retrieve GitHub threads, or compare Git revisions. Export annotations for sharing. Repository-linked WRL/VRML/GLB footprint models load through the containing workspace filesystem, with 8 MiB per file, 32 requests and 32 MiB per editor session. Absolute paths, unresolved library variables, STEP files and reported symlinks are unsupported. File-only schematic net inference has the same limitations displayed by the shared renderer.

## Navigator and sample project

The **KiCad Review** section in VS Code's Explorer lists up to 200 saved schematic/PCB files and existing sidecars. Select a drawing to open its visual viewer, or select **Review annotations** to inspect the JSON sidecar. Run **KiCad: Refresh Review Navigator** after adding files. Inside the viewer, **Explorer** opens the shared Parts/Nets/Layers navigator; selecting a part or net opens its properties. The Review panel edits severity, tags and state while preserving the source drawings.

For a local demonstration, open the prepared `.vizdiff/vscode-demo-project` folder from this repository in VS Code, select `pic_programmer.kicad_sch`, then navigate to its child sheet or select a PCB from **KiCad Review**. If that disposable folder has not been prepared, any existing KiCad project folder works. Save a review note and inspect `.kicad-review.json` in Source Control; reopen the drawing to verify persistence. No demo file is downloaded by the extension.

## Build and test

From the repository root:

```text
python scripts/package_vscode.py
node --test vscode-extension/tests/*.test.cjs
python -m unittest discover -s tests -p test_package_vscode.py
```

Packaging creates `vscode-extension/media/` from an explicit asset list and writes the installable VSIX to `build/`. Re-run packaging after shared viewer changes. The source folder is then ready for **F5** using the supplied launch configuration. For a web development host, use VS Code's standard web-extension development tooling with this directory; no Node filesystem or subprocess APIs are used by the extension.

Automated checks cover virtual URIs, hierarchy bounds, the private bridge, local annotation scope, CSP and VSIX contents. They do not replace installed desktop or github.dev smoke tests. No Marketplace publication is performed by the packaging script.

Layer navigation (0.9.1): in Explorer -> Layers, search by saved layer name, focus one layer, choose dim/isolate, and fit its drawable geometry. All/None/Front/Back/Copper presets are reversible with Restore view; the first visibility state is retained across consecutive presets and focus operations. Clear focus keeps current visibility, while Restore view restores it. The board outline and drill holes remain context in isolate mode; inactive layers cannot be picked. [ and ] cycle focus, Shift+F fits it, and Escape restores visibility. These controls apply to 2D PCB review; schematic net focus and SPIKE 3D retain their existing controls. Layer preferences are session-only.

Ruler update (0.9.2): press M, click a start point, move the cursor for a live distance/angle/X/Y overlay, and click again to pin it. Choose geometry/grid/off snapping and grid spacing in millimetres. Geometry snapping uses only visible saved geometry, respects layer isolation, and prefers pad/pin centers and endpoints within eight screen pixels. Alt bypasses snap; Shift constrains horizontal/vertical. New measurement resets the ruler; Escape exits. Drawing measurements use the configured mm/mil display units and work in flipped 2D views. Board extents reports the axis-aligned bounding dimensions of all saved Edge.Cuts shapes, including detached panels and arcs, excluding stroke width; it does not validate a closed manufacturable outline. No board or schematic source is modified. Ruler snap/grid options are session-only; 3D measurement remains unavailable.

Version 0.9.5 adds global project search, multiple component/net/net-class highlights, connection navigation and saved ERC/DRC report markers. See [search and highlight controls](../extension/docs/search-and-highlights.md).

Version 0.9.6 adds double-click/Enter subsheet navigation, Alt+Up parent navigation, E property inspection, H net highlighting, / search focus, C comments, Space recentering and a keyboard guide. Design files remain read-only; routing and schematic editing are unavailable.

Version 0.10.0 adds a read-only project workspace, settings/constraint inspection, PCB stackup, file navigation and our browser Gerber/drill viewer. See [project and fabrication workspace](../extension/docs/project-workspace.md).

Version 0.11.0 adds the shared BOM / Stats and DNP controls, saved board/zone analytics and bounded regex/wildcard global search. HTML files can be selected in Project and opened in a separate static isolated preview; interactive self-contained HTML/iBOM runs in the browser extension. Drawing files stay read-only. Future KiCad generator versions display an explicit forward-preview warning.

Version 0.11.1 shares the refined read-only project setup forms and tables. GitHub release packaging is documented in [the release guide](../docs/RELEASING.md).

Version 0.11.2 opens PCB drawings from the project tree, provides saved layer details when physical stackup is absent, and simplifies project/schematic hierarchy navigation.
