# Pocket KiView BoM and assembly tools

Open **BoM & assembly** from the home screen or project overview. In a drawing, the BoM pane's **Open BoM manager** uses its saved schematic symbols or PCB footprints. **Manage variants** is available in drawing tools. Engineering calculators are available from home, project overview and drawing tools without an account.

Use the **Columns** button above the table to choose standard and custom fields.
Search the chooser, toggle individual columns or Actions, use **Show all columns**,
or **Reset columns**. Reference stays visible for part selection. Choices are saved
per project revision and schematic/PCB source; visible CSV export uses the same
chosen columns. If preferences cannot be saved, the session choice remains usable
and the manager reports the storage error.

The manager provides individual parts or grouped quantities, natural reference ordering, full saved fields, search, fitted/DNP/exclusion/front/back filters, procurement states and assembly progress (not started, placed, soldered, verified). Management drafts include manufacturer, MPN, supplier/SKU, notes, unit price and currency. Manage a group to assign those fields together; the form explicitly lists the affected count. A board-count input calculates build quantities from fitted, nonexcluded parts. Costs are sums of entered prices, kept separate by currency, with unpriced parts counted. No live sourcing, exchange-rate conversion or purchases are performed.

CSV exports reflect visible filters, grouping and board count, retain custom fields, and neutralize spreadsheet formulas. Quantity per board and build quantity are separate columns. Metadata JSON can be exported and restored only to the same saved revision/source scope. Browser storage failures are reported without pretending a draft was saved. For native drawings the saved-design metadata scope remains compatible with earlier drafts; other variants have separate scopes. Imported exports are scoped to their exact source SHA-256 and selected variant.

Create, duplicate, rename and delete local assembly variants. Stage per-part fitted/DNP, value, footprint and MPN overrides, then **Save variants**. Export JSON or import the existing JSON/CSV variant format. Path and UUID/reference identify each part; ambiguous cross-file references are skipped with a warning. Native drawing BoMs and 2D/3D population overlays follow the selected variant. Imported BoM variants update quantities without changing their saved placement geometry. BoM Studio exports identify one exported variant, which becomes the saved assembly here; switching does not reconstruct unexported source variants.

An imported iBOM opens its inert component data and a simplified interactive assembly board. Choose a part in the manager to locate it, or tap a saved footprint position. Front/back views, pan/zoom and Fit are provided. This saved geometry consists of straight edges and footprint boxes; exact curved edges, pads, copper and net tracing are not implemented. Unsupported iBOM layouts display an import error. No scripts from imported HTML execute.

See [supported interchange formats and source evidence](BOM-IMPORT.md) and [calculator equations and limitations](CALCULATORS.md). BoM Studio workspace sidecars, release ZIPs and XLSX require JSON/CSV exports. Native KiCad variant nodes remain explicitly identified as uninterpreted; these tools use the existing assembly sidecar format. Saved file/reference identities count multiunit schematic symbols once; repeated hierarchy instances are not expanded. Drafts and assembly states are local to this device, not synchronized to an iBOM or BoM Studio workspace.

The assembly workspace keeps the board, searchable parts list, variant selector and local checklist together. The parts panel collapses on phones; selecting a saved component links its list row and board location. Fitted, DNP, excluded and manual progress states remain distinct. Progress changes in the workspace and manager share the same revision and variant scope. CSV files without placement coordinates still provide the full parts workflow and explicitly show that a board view is unavailable.

In PCB drawing tools, **DNP / DNI** toggles population highlighting for the active saved file and selected assembly variant. Omitted footprints receive a cross, highlighted ring and reference/status label; the BoM checkbox stays synchronized. Native KiCad `dnp` flags and explicit `DNP` / `DNI` / `Do not populate` / `Do not install` fields with affirmative values are recognized. A value containing “DNP”, BoM exclusion, an empty field or an uncertain status does not mark a part omitted. Explicit variant population overrides take precedence. The first 1,000 omitted-part markers are displayed; fitting highlights uses saved footprint geometry. Source files remain unchanged.

## Assembly queue

Next unfinished part follows the current filters and wraps through saved source identities without changing progress. Unfinished fitted parts excludes DNP, excluded and verified entries. Whole-source verified counts remain visible alongside filtered counts; a filtered list is not a claim that the full assembly is complete. Quick progress actions use the same fitted/included work-item scope.
