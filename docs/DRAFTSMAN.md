# Draftsman drawing sheets

Open **Draftsman** in a schematic or PCB viewer to create drawing documentation in the current tab. The KiCad design stays read-only. This is a Pocket KiVi document format, not an Altium `.PCBDwf` or Xpedition interchange editor.

## Create and customize

- Add up to 20 sheets. Choose A4, A3 or Letter, portrait/landscape, document and sheet titles, revision, company, units, decimal precision, accent, font size and line width.
- Add schematic or top/bottom PCB views. Select visible source layers, rotate a view, choose fit or a numerical scale, edit captions, resize and drag views. Bottom views mirror their canonical source coordinates.
- **Auto dimensions** adds overall width and height from saved PCB `Edge.Cuts`, including curved outline extrema. It does not infer tolerances or certify mechanical clearance. Use manual dimensions for schematics and other details.
- **Dimension** places aligned, horizontal or vertical dimensions from two clicks, with geometry snapping. Endpoints remain in source millimetres; dimension offsets are page millimetres. You can edit coordinates and offsets in Properties. Escape cancels placement. The label follows the selected units and precision.
- Add editable notes and a fitted-parts BoM table (saved DNP and excluded-from-BoM parts are omitted). Tables that do not fit beside the views are split into separate BoM sheets. Delete items or sheets, or use Undo/Redo. Deleting a view also removes its linked dimensions. The preview identifies rendering notes and BoM overflow.

The small toolbar scrolls horizontally when space is limited. **Properties** hides/shows the inspector; it starts collapsed on a narrow screen. Dragging moves items when the pointer is released; invalid out-of-sheet edits retain the previous document.

## Save and export

**Save draft** retains the editable document in this browser profile. Closing normally attempts to retain unsaved changes; a storage failure keeps the editor open. **Discard** closes without saving. Keep an exported copy for durable storage.

- **Editable document** downloads `.kivi-draft.json`. **Open document** imports it only when its repository, revision and loaded source fingerprints match.
- **SVG** downloads each sheet with vector dimensions, notes, title blocks and tables. Drawing views are embedded raster previews from the existing renderer, not native KiCad vector plots.
- **PDF** downloads one locally rendered, multi-sheet document. It contains sheet pixels; it is not a native fabrication plot or vector CAD exchange file.
- **Save to folder** asks for a directory and creates a uniquely named subfolder containing the editable document, SVG sheets and PDF. It requires the browser's File System Access support and permission; otherwise use Download. A write failure reports how many files were saved and does not claim a complete export.
- **Save to repo** is available in the browser extension with a connected GitHub/GitLab account and permitted provider writes. Review the repository, new branch and `docs/draftsman/` path, then select **Create branch & save**. The new branch starts at the viewed source commit. The editable document and optional generated PDF/SVG files are saved there; the currently checked-out/default branch and KiCad sources are not replaced. Existing branch names are rejected. The provider enforces account and protected-repository permissions. GitLab can retain the newly created branch if its subsequent commit fails; the error explicitly reports this partial result.

No remote write occurs when opening, measuring, filtering or downloading. Declining the repository confirmation performs no repository write. Authentication remains in the extension worker, not the document or page. There are no new host permissions.

## Evidence and limits

Each document records its source repository/ref and SHA-256 fingerprints of the loaded drawing sources. Manual dimensions and notes are user-entered; automatic dimensions are calculated from saved outline geometry. Unsaved KiCad editor state, library resolution outside the loaded files, manufacturing tolerances and current native DRC/ERC results are outside this document's evidence boundary.

Documents support 1–128 loaded source drawings, 20 sheets, 200 items per sheet and 64 drawing views total. Editable JSON is capped at 4 MiB. The workspace uses a shared 16-megapixel preview budget; large documents should be split into volumes. SVG rendering and PDF pixels/bytes are bounded, and repository exports are capped at 16 MiB. Inputs with unsupported versions/fields, detached dimensions, unsafe paths, remote image URLs or changed source fingerprints are rejected. No document can execute scripts or change circuit connectivity.

The 0.12.69 preview includes this workspace; older binaries require an update. Repository writes are covered by mocked provider tests, not a live publish test.
