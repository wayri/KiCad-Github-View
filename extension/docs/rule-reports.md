# Saved ERC and DRC results

The browser imports official KiCad v1 JSON reports. It does not run KiCad's rule checker. Generate reports in KiCad or with:

```text
kicad-cli sch erc --format json --units mm --output project-erc.json project.kicad_sch
kicad-cli pcb drc --format json --units mm --output project-drc.json project.kicad_pcb
```

Only results included in the report are visible. A report without a finding does not establish that the design passes every check: check settings, ignored checks, severity filters and generation revision still matter.

The DRC (PCB) or ERC (schematic) toolbar action shows and hides the findings
window. The adjacent eye action independently shows or hides location markers;
it stays synchronized with the report window's marker checkbox. Hiding either
view retains imported reports, filters and findings. These shared controls are
also available in Android's drawing tools sheet. They display saved results and
do not execute native checks.

The parser follows the [official ERC v1 schema](https://gitlab.com/kicad/code/kicad/-/raw/master/resources/schemas/erc.v1.json) and [official DRC v1 schema](https://gitlab.com/kicad/code/kicad/-/raw/master/resources/schemas/drc.v1.json). The [KiCad CLI documentation](https://docs.kicad.org/9.0/en/cli/cli.html) documents JSON export and `mm`, `mils` and `in` coordinate units. Import converts positions to millimetres and retains the source, generation date, KiCad version, original units, included severities and ignored checks.

`KiCadRuleReports.parse(text, options)` returns `kind`, `metadata`, `sheets`, `findings` and `warnings`. Options may supply `kind`, a repository-relative drawing `file`, provenance `reportPath` and `revision`, and explicit `sheetFiles` keyed by the report's `uuid_path`. Each finding includes its category, severity, exclusion state, description and affected items. Each item retains its UUID and position when present. Missing positions remain `null`; no marker location is inferred. Unassociated positions remain available for exact identity matching by the viewer.

ERC `path` is a human-readable hierarchy name, not a repository filename. Root-sheet positions can use an explicitly selected root drawing; other sheets require exact identity resolution or an explicit sheet association. An affected item can belong to another sheet in a cross-sheet finding, so the viewer must prefer a unique, saved item UUID over the finding's sheet association. Repeated sheets and ambiguous identities require explicit selection. Importing or manually associating a drawing never verifies that the report matches its currently loaded revision; `metadata.associationVerified` stays `false`.

The importer accepts only v1 report structures, rejects unsupported fields and invalid positions or units, and bounds JSON to 5 MiB, findings to 10,000, affected items to 50,000 and items per finding to 100. Recognized reports without a schema declaration show a warning. Reports with missing positions remain useful as a list but cannot navigate those items by coordinates.

The parser tests use synthetic reports shaped against these published schemas. Native KiCad 10.0 export was attempted in this sandbox but failed with registry-access and `std::bad_alloc` errors; these synthetic fixtures are not represented as native generated reports.
