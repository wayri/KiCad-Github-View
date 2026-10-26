# KiCad Monkey saved reports

Pocket KiView reads saved **KiCad Monkey Design JSON a0** and **Netlist JSON a0** as component, net, terminal and custom-property tables in the existing **Project → Analysis** report viewer. Add the JSON export to the project/repository and select it from the saved reports. The shared reader is packaged with the browser extension, VS Code extension and Android app.

From a drawing, open **Tools → Reports** (phone/tablet: **Drawing tools → Inspect → Reports**) and search for the saved JSON. In VS Code it opens a dedicated **Results** tab with the same component/net tables; project file and symlink boundaries still apply. Tabular reports open directly on Data, rather than making you search through schema metadata. The project Analysis section also offers **Open saved report** in VS Code.

This is a data interchange feature. It does not install or execute KiCad Monkey, replace the drawing engine, edit source files, or run electrical checks. Net connectivity is shown exactly as supplied by the export; it is not reconciled with the currently opened revision. Keep the JSON export with the source revision that produced it.

## Exporting a design

In an environment where KiCad Monkey is already installed, its documented API can produce a report:

```python
from kicad_monkey import KiCadDesign

design = KiCadDesign.from_project_file("hardware/demo.kicad_pro")
design.save_json("hardware/design.json")
```

The viewer requires the exact top-level `schema` value `kicad_monkey.design.a0` or `kicad_monkey.netlist.a0`, `generator: "kicad_monkey"`, and component/net arrays. Other report JSON continues to use the generic report reader. Future Monkey schema versions produce an explicit unsupported-format message rather than being silently interpreted as a0.

## What is displayed

- Components: designator, value, footprint, library reference, description and saved hierarchy sheet path when present.
- Nets: saved name, net class, source sheets and terminal count.
- Terminals: net, component designator, pin number, pin name and pin type.
- Component properties: each saved parameter is a separate row, including empty values.
- Provenance: the export schema and generator are visible metadata. The schema identifier is the format version; the export does not provide a package-version field.

Render graphs, indexes, SVG and executable-looking strings are never executed or used to generate a drawing. The specialized projection does not traverse the export's potentially large compiled schematic graph. Saved strings remain text. Unknown optional fields remain in the saved source but are not represented as claims about the design.

The shared 64 MiB input limit applies. This projection additionally limits exports to 20,000 components, 20,000 nets, 200,000 combined table rows, and 16,384 characters per displayed text value or joined net sheet list. An invalid or excessive projection fails explicitly. These bounds concern viewing an exported report, independently of native project download limits.

## Contract and verification

The reader was checked on 2026-10-26 against the upstream exporter at revision [`bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d`](https://github.com/wavenumber-eng/kicad_monkey/blob/bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d/src/py/kicad_monkey/kicad_design_json.py), specifically `kicad_design_to_json`, `kicad_netlist_to_json`, `_component_json`, `_raw_component_json`, `_net_json` and `_terminal_json`. The upstream [netlist model](https://github.com/wavenumber-eng/kicad_monkey/blob/bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d/src/py/kicad_monkey/kicad_netlist_model.py) confirms the string-valued net class.

Tests use an original synthetic sensor report shaped to those field contracts; they are not an exported private design or a full upstream schema conformance corpus. They cover both a0 identifiers, absent optional hierarchy, empty properties, inert markup-like text, unknown schemas, malformed collections and collection/text/row limits. No Monkey implementation or fixture code is vendored. Upstream [KiCad Monkey](https://github.com/wavenumber-eng/kicad_monkey) is MIT-licensed.
