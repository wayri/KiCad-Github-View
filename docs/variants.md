# Assembly variants in visual review

The review model reads saved KiCad schematic symbols, sheets, PCB footprints,
pads, tracks, vias and zones. A part's saved DNP, BOM exclusion, board
exclusion and unit fields form the **Saved design** view. An optional JSON or
assembly/BOM CSV file can add read-only review overlays. These overlays change
the displayed population and properties only; they never write KiCad source,
change copper, or alter the schematic or board renderer.

This import format is separate from [KiCad's native design variants](https://docs.kicad.org/master/en/eeschema/eeschema.html#design-variants).
The current review model detects native `variant` nodes and warns that their
per-instance overrides are not interpreted yet. If you need to review those
values in this version, provide an explicit assembly metadata overlay.

## JSON format

Use `schemaVersion: 1`. Every part rule names one KiCad file path and exactly
one `reference` or `uuid`. A reference rule applies to all units of the same
part within that file. A UUID rule selects one placed record. To change both
schematic and board displays, add one rule for each source file.

```json
{
  "schemaVersion": 1,
  "variants": [
    {
      "id": "prototype",
      "name": "Prototype",
      "parts": [
        {
          "path": "hardware/controller.kicad_sch",
          "reference": "U4",
          "populated": false,
          "properties": { "Value": "Not installed" }
        },
        {
          "path": "hardware/controller.kicad_pcb",
          "reference": "U4",
          "populated": false
        }
      ]
    }
  ]
}
```

`populated` is an optional boolean; omitting it keeps the saved DNP state.
`properties` is an optional dictionary of display values, such as `Value`,
`Tolerance` or a manufacturer part number. The review model keeps source
identity, unit, DNP and exclusion flags separate from arbitrary property
overrides. The reserved ID `default` always means **Saved design**.

## Assembly/BOM CSV format

The importer accepts RFC 4180 quoted fields, embedded commas and newlines.
Headers are case-insensitive. `Variant` and `Reference` are required;
`File/Path` (or `File` or `Path`), `Populated`, `DNP`, `Value` and any other
property columns are optional. `Populated` and `DNP` accept yes/no,
true/false or 1/0; `DNP` has the inverse meaning of `Populated`.

```csv
Variant,Reference,File/Path,DNP,Value,Tolerance
Prototype,"R4 R5",hardware/controller.kicad_sch,no,10k,1%
Prototype,U4,hardware/controller.kicad_sch,yes,Not installed,
Prototype,U4,hardware/controller.kicad_pcb,yes,,
```

One cell may list several references separated by commas or whitespace.
Reference ranges such as `R1-R5` are **not expanded**; an unmatched range is
reported as a warning. When `File/Path` is omitted, the importer applies a
row only if its reference resolves to exactly one KiCad file. Two units with
the same reference in that file are treated as one multiunit part; duplicate
same-unit records or references in multiple files are reported as ambiguous
and skipped. Unknown references, invalid rows and unsupported native variant
data appear in `model.warnings`; they are never silently applied elsewhere.

Browser API: load `design-diff.js`, then `design-model.js`.
`KiCadDesignModel.parseVariantConfig(text, filename)` accepts `.json` and
`.csv` files up to 1 MiB. `buildProject(files, config)` returns sheets, objects,
the Saved design plus named variants, and warnings. `applyVariant(model, id)`
returns new object records with effective properties/population while leaving
the saved records unchanged. Only safe relative `.kicad_sch` and `.kicad_pcb`
paths are accepted. Geometry selection uses each record's scoped path, UUID
and saved position; the importer does not claim exact rendered bounds.
