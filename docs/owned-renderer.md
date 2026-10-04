# Owned browser rendering engine

The extension and hosted GitHub App viewer share five owned rendering modules:

- `design-diff.js`: bounded S-expression parser and saved-object identity.
- `schematic-renderer.js`: embedded symbol library graphics, placed units/styles, rotation/mirror, pins/fields, network primitives, sheet boxes and default worksheet metadata.
- `pcb-renderer.js`: saved tracks/arcs, vias, front/back footprints, pads/drills, graphics, layer colors, filled copper and default worksheet metadata.
- `worksheet.js`: standard drawing sheet, native border/zone/title-block coordinates and saved metadata.
- `owned-canvas.js`: Canvas2D drawing, physical-buffer clearing at fractional DPR, mm camera transforms, pointer-anchored zoom, pan, selection and layer visibility.

`build(ast,path)` returns world-mm primitives, page dimensions, warnings and layers. `mount(host,{pcb,dark})` creates an owned viewport; source geometry stays immutable. Selection emits `kicad:select` with saved UUID/reference and optional parent UUID. No KiCanvas code, renderer, fonts or runtime requests are included in current packages. SPIKE 3D retains its owner-authorized geometry/parser adapter and Three.js infrastructure with notices.

Native KiCad 10 fixture SVGs confirmed resistor body/pin/wire coordinates, rotated front/back PCB pad position and serialized pad angles. These are geometric fixture checks, not evidence of general pixel equivalence. Default drawing-sheet coordinates and specialized pin/label geometry were checked against additional native SVG fixtures. Glyphs use browser fonts; custom worksheets remain unsupported; builder warnings disclose omitted constructs. The initial renderer specification prioritizes source-coordinate correctness, bounded parsing, object identity, browser-only execution and inline GitHub review. Superiority over other engines has not been benchmarked.

Review interaction lives separately in `design-model.js` and `review-workspace.js`: saved properties, imported assembly variants, sheet navigation, measurement and severity-tagged annotations. GitHub REST transport stays in the extension worker; composers stay on GitHub and are never auto-submitted. API and DOM boundaries are tested independently, and local browser fixtures label their mocked transport explicitly.

Net analysis is in `net-model.js`, separate from drawing geometry. PCB identity is `(source path, saved numeric code)`; lengths count native source tracks/arcs once. Schematic identity remains per file: exact endpoint/junction connectivity, label aliases and explicit version-aware power symbols. Unmarked interior crossings stay separate. A spatial index bounds connectivity work and reports limits rather than inventing a complete circuit netlist. Hierarchy, bus expansion and implicit power pins need additional resolution. Native netlist comparison could not run in the current sandbox because KiCad startup registry access failed; no registry settings were changed.

`ui-icons.js` supplies original, local SVG icons. `review-workspace.js` owns the explorer/inspector and annotation interaction. VS Code reuses these sources through a private webview bridge and workspace URI loader; it does not need KiCad or a rendering server at runtime.
## Group selection and sheet highlighting

Ctrl/Shift/Command-click drawing objects or Parts rows to add/remove group members, or enable Multihighlight under Review tools. Fit highlights fits visible members; Clear or Esc clears the group. Additive canvas clicks preserve the camera.

Selecting a sheet in the navigator highlights its loaded subtree; selecting a sheet symbol highlights that symbol and the subtree without leaving the parent. Groups retain other loaded-sheet members as you navigate. Groups are bounded to 200 objects. Reused hierarchy instances share their saved file view; missing files and ambiguous cross-highlight matches are reported rather than guessed.

Linked schematic/layout viewers propagate groups of saved part identities and unambiguous saved nets. Each drawing shows its own geometry, and groups spanning schematic sheets remain available when those sheets are opened. This does not edit or route the design.
