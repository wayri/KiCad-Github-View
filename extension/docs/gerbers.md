# Read-only fabrication viewer

The owned browser engine reads saved fabrication data; it does not regenerate Gerbers, route a board, edit source files, or establish manufacturing correctness. Dimensions and geometry come from the selected file. There is no inferred relationship between an exported Gerber and the current PCB revision.

## Engine API

`KiCadGerberRenderer.build(text, repositoryRelativePath)` returns a design with `kind: 'gerber'`, `path`, `primitives`, `layers: [path]`, `warnings`, `attributes`, `units: 'mm'`, and `readOnly: true`. `.drl`, `.xln`, `.exc`, `.nc` and `.xnc` select the drill parser; an `M48` header also identifies drill content. `.gbrjob` returns a job manifest (see below), not geometry. Other filenames select Gerber. The CommonJS export exposes the same API for tests. `parse` aliases `build`.

World coordinates are millimetres. Source X is preserved; source Y is negated to match the viewport's downward screen Y axis. This is a display transform, not a modification of fabrication coordinates. Selection identities are file-scoped command indices, not native KiCad UUIDs or electrical nets.

`paint(ctx, camera, primitives, color)` paints a **single layer onto a transparent Canvas2D surface**. The camera supplies `zoom`, `flipped`, and `world_to_screen(point)`. The host clears this surface before each frame, then composites it over other layer surfaces. Clear polarity uses `destination-out` on this layer only; painting directly onto a canvas containing other layers would incorrectly erase those layers. Compound regions use even-odd fill. The host must expose returned warnings visibly.

## Supported data

- Declared FS coordinate formats, leading/trailing zero omission, absolute and incremental coordinates, MM/inch units, omitted modal axes, aperture selection, move/draw/flash operations.
- C/R/O/P standard flashes, including rotated 3–12 vertex polygon apertures. Obrounds use exact round-capped segments.
- Circular aperture linear strokes and multi-quadrant clockwise/counterclockwise arcs, including full circles. Arc radius inconsistency greater than `max(0.002 mm, radius × 0.0001)` rejects the layer.
- Closed linear regions with multiple contours, ordered dark/clear polarity, and safely retained X2 file, aperture and object attributes. File attributes remain file-scoped, aperture attributes are captured when the aperture is defined, and object attributes follow their modal `TO`/`TD` scope. These saved names are not reconstructed electrical connectivity.
- Excellon/XNC round drill hits with declared tool diameters and MM/inch units. Decimal coordinates need no guessed format. Integer coordinates require `;FILE_FORMAT=integer:fractional` or a declared `000.000` unit format. LZ/TZ unit options determine zero handling. XNC `.xnc` coordinates are explicit decimal numbers, including integer literals such as `0` without a guessed fixed-point format.
- Excellon `G85` straight slots with explicit or previously established start coordinates. Routed lines use `G00` to establish the start, `M15`/`M16` tool down/up and `G01` interpolation, retaining modal axes/interpolation. Routed clockwise/counterclockwise `G02`/`G03` arcs support XNC positive `A` radius for minor arcs or declared I/J centre offsets, including full circles with I/J. All retain the selected physical tool width and source line.

## Explicit limits and omissions

Each file is limited to 8 MiB UTF-8, 200,000 commands/lines, 100,000 primitives, 4,096 apertures/tools, and coordinate magnitude 100,000 mm. Malformed commands and unsafe geometry reject the file rather than producing a guessed image.

Aperture macros, aperture holes, non-circular aperture strokes, single-quadrant arcs, and curved regions are omitted with diagnostics. Regions must be explicitly closed. Step-and-repeat beyond one copy, aperture blocks, nontrivial mirror/rotation/scale transformations, negative image polarity, and unknown parameters reject the layer. Excellon repeat commands, incremental drill coordinates, ambiguous integer coordinate formats and unsupported machine dialect commands reject the file. Tool-down rapid moves, missing routing start points and invalid arc geometry also reject the file. No archive unpacking, electrical net reconstruction, or manufacturing DRC is provided. Negative job-file image polarity is retained as metadata, but affected layers are not rendered as a guessed positive image.

The engine is independent of third-party rendering libraries. Focused tests use synthetic, source-retained snippets to exercise coordinate interpretation, physical aperture dimensions, modal axes, arc direction, compound contours, polarity compositing, drill diameters, unsupported constructs, and malformed/oversize input. These checks establish those contracts; they do not claim full Gerber conformance or native GerbView pixel equivalence.

## Gerber job sets and local import

`isFabricationPath(path)` covers the supported Gerber/drill/job extensions. `isJobPath(path)` identifies `.gbrjob`. `parseJob(text, jobPath)` (also `build` for a job filename) returns `{kind: 'gerber-job', path, files, metadata, warnings, readOnly: true}`. Each `files` entry has a resolved repository-relative `path`, `fileFunction`, and `filePolarity`. There are no invented primitives for a job. Saved `Header`, `GeneralSpecs`, `MaterialStackup` and `DesignRules` metadata are retained, each bounded to 64 KiB JSON.

The viewer shows job metadata and declared files beside the layer controls. Local jobs read only matching files explicitly selected by the user. Import a job and its files together, or choose **Import folder** to preserve nested relative paths. Missing references remain visible failures with partial coverage; filename-only guessing and disk access outside the selected input are not used. Multiple job sets require choosing one to avoid mixing variants.

Repository job links load declared files through the existing same-provider `project-file` transport at the requested revision. A job with one or more missing/unsupported layers remains partial, with each failure shown. X2 `FileFunction` takes precedence over job metadata, and a conflict is disclosed. Job-only roles are labelled as job metadata rather than X2 or filename inference.

Job input is limited to 8 MiB and 64 declared files. Absolute paths, parent traversal, backslashes, URL/query/fragment/encoded paths, duplicate files and nested job references are rejected. A viewer set remains limited to 16 rendered layers, 16 job manifests, 24 MiB total saved text and 200,000 operations; selected candidate expansion is capped at 128 files and local folder indexing at 4,096 files. A larger set must be split explicitly. Importing a job does not grant broader repository, website or local filesystem access.

Analysis JSON includes source SHA-256 hashes for job manifests and rendered files, saved job metadata and roles, and up to 64 unique X2 object-attribute examples per layer with a truncation indicator. Drill arcs/full-circle routes count as slots with the cutting tool diameter, not drill hits or copper trace widths. This metadata and geometry support read-only review; they do not prove a manufacturing set matches the current PCB revision.

“Gerber v2” here means Gerber X2 attributes in the extended RS-274X format, not a separate binary format. The same declared geometry and unsupported-construct limits apply to X2 files.

Format references: [Ucamco Gerber layer specification 2024.05](https://www.ucamco.com/files/downloads/file_en/456/gerber-layer-format-specification-revision-2024-05_en.pdf), [Ucamco XNC specification 2021.11](https://www.ucamco.com/files/downloads/file_en/452/xnc-format-specification-revision-2021-11_en.pdf), [Ucamco Gerber Job format](https://www.ucamco.com/files/downloads/file_en/435/gerber-job-format-specification-revision-2020-08_en.pdf), and [KiCad Excellon reader source](https://docs.kicad.org/doxygen/excellon__read__drill__file_8cpp_source.html).

## Geometry analysis

The Analysis panel and JSON export report per-layer line, arc, circle and polygon
operation counts; dark/clear counts; source-coordinate extents; minimum rendered
stroke; used aperture/tool IDs and their operation counts; drill diameters and
hit/slot counts. IDs count only retained parsed geometry, not unused declarations
or omitted unsupported operations. Repeated hits remain separate operations.
The renderer's `units: 'mm'` contract also applies to these measurements; reported
source Y ranges reverse the viewport's Y-down display transform.

Rendered path length sums stroked line, circular and arc centre lines in mm.
Obround flashes contribute their rendered centre-line segment, so this value is
not electrical routing length. The extent rectangle is width times height in
mm² and is not a board-area or outline-closure measurement.

Operation-area sums in mm² cover filled circles, circular stroke rings, round-
capped two-point line strokes and convex standard polygon/rectangle flashes.
Arc strokes, regions and compound or unsupported polygons are excluded, with
computed/omitted operation counts included in each layer's metrics. Areas sum
individual operations before overlap removal, repeated-hit removal or clear
polarity subtraction. They do not measure net copper coverage, material removal,
plating, connectivity or manufacturing compliance. Parser warnings still mark
partial coverage. Use a fabrication toolchain for boolean film areas and DFM.

Analysis is cached while source models and criteria remain unchanged. Panning,
zooming, visibility and opacity changes do not rerun geometry analysis; fitting
visible layers reuses the cached per-layer extents. Tables show at most 60 tool
IDs or drill sizes per layer; JSON export retains the bounded full inventory.
