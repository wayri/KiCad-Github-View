# Read-only fabrication viewer

The owned browser engine reads saved fabrication data; it does not regenerate Gerbers, route a board, edit source files, or establish manufacturing correctness. Dimensions and geometry come from the selected file. There is no inferred relationship between an exported Gerber and the current PCB revision.

## Engine API

`KiCadGerberRenderer.build(text, repositoryRelativePath)` returns a design with `kind: 'gerber'`, `path`, `primitives`, `layers: [path]`, `warnings`, `attributes`, `units: 'mm'`, and `readOnly: true`. `.drl` and `.xln` select the drill parser. Other filenames select Gerber. The CommonJS export exposes the same API for tests. `parse` aliases `build`.

World coordinates are millimetres. Source X is preserved; source Y is negated to match the viewport's downward screen Y axis. This is a display transform, not a modification of fabrication coordinates. Selection identities are file-scoped command indices, not native KiCad UUIDs or electrical nets.

`paint(ctx, camera, primitives, color)` paints a **single layer onto a transparent Canvas2D surface**. The camera supplies `zoom`, `flipped`, and `world_to_screen(point)`. The host clears this surface before each frame, then composites it over other layer surfaces. Clear polarity uses `destination-out` on this layer only; painting directly onto a canvas containing other layers would incorrectly erase those layers. Compound regions use even-odd fill. The host must expose returned warnings visibly.

## Supported data

- Declared FS coordinate formats, leading/trailing zero omission, absolute and incremental coordinates, MM/inch units, omitted modal axes, aperture selection, move/draw/flash operations.
- C/R/O/P standard flashes, including rotated 3–12 vertex polygon apertures. Obrounds use exact round-capped segments.
- Circular aperture linear strokes and multi-quadrant clockwise/counterclockwise arcs, including full circles. Arc radius inconsistency greater than `max(0.002 mm, radius × 0.0001)` rejects the layer.
- Closed linear regions with multiple contours, ordered dark/clear polarity, and safely retained X2 file attributes.
- Excellon/XNC round drill hits with declared tool diameters and MM/inch units. Decimal coordinates need no guessed format. Integer coordinates require `;FILE_FORMAT=integer:fractional` or a declared `000.000` unit format. LZ/TZ unit options determine zero handling.

## Explicit limits and omissions

Each file is limited to 8 MiB UTF-8, 200,000 commands/lines, 100,000 primitives, 4,096 apertures/tools, and coordinate magnitude 100,000 mm. Malformed commands and unsafe geometry reject the file rather than producing a guessed image.

Aperture macros, aperture holes, non-circular aperture strokes, single-quadrant arcs, and curved regions are omitted with diagnostics. Regions must be explicitly closed. Step-and-repeat beyond one copy, aperture blocks, nontrivial mirror/rotation/scale transformations, negative image polarity, and unknown parameters reject the layer. Excellon slots/routing, repeat commands, incremental drill coordinates, and ambiguous integer coordinate formats reject the file. No archive unpacking, Gerber job association, electrical net reconstruction, or manufacturing DRC is provided by this parser.

The engine is independent of third-party rendering libraries. Focused tests use synthetic, source-retained snippets to exercise coordinate interpretation, physical aperture dimensions, modal axes, arc direction, compound contours, polarity compositing, drill diameters, unsupported constructs, and malformed/oversize input. These checks establish those contracts; they do not claim full Gerber conformance or native GerbView pixel equivalence.

Format references: [Ucamco Gerber layer specification 2024.05](https://www.ucamco.com/files/downloads/file_en/456/gerber-layer-format-specification-revision-2024-05_en.pdf), [Ucamco XNC specification 2021.11](https://www.ucamco.com/files/downloads/file_en/452/xnc-format-specification-revision-2021-11_en.pdf), and [KiCad Excellon reader source](https://docs.kicad.org/doxygen/excellon__read__drill__file_8cpp_source.html).
