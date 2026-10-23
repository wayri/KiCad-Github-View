# Saved project and board setup inspection

`project-settings.js` provides `KiCadProjectSettings.parse(text, {file})` in the browser and CommonJS. It is an own, read-only data inspector. It does not invoke KiCad, modify files, resolve custom-rule expressions, load library URIs, or invent settings omitted from a saved file.

Supported files:

- `.kicad_pro`: all saved JSON sections, including board constraints/defaults, schematic settings, ERC severity configuration, net classes/assignments, text variables, libraries and future fields.
- `.kicad_prl`: saved local editor preferences; these may be user-specific and absent from Git repositories.
- `.kicad_pcb`: saved board setup and physical stackup. Board geometry belongs to the dedicated layout viewer.
- `.kicad_dru`: saved custom-rule syntax tree, rule names, conditions, layer/severity selectors and constraint forms. Conditions remain inert text.
- `.kicad_wks`: saved drawing-sheet setup/elements as a readable tree. This inspector does not render a worksheet preview.
- `fp-lib-table` and `sym-lib-table`: library names, types, saved URIs/options/descriptions and raw syntax trees. Environment variables and external paths remain unresolved.

The result includes `file`, `kind`, `title`, `tree`, `sections` and `warnings`. Every section contains `id`, `label` and `entries`. Entries contain a human-readable `label`, original saved `value` and a `path`: a JSON Pointer into the returned tree. Escaping preserves property names containing `/` or `~`. Empty arrays/objects, false, zero and null remain visible. No known-field whitelist silently removes unknown project JSON values. Render labels/values as text, never HTML.

Board results also expose `layers`, `boardThicknessMm` and `stackup`. Stackup rows keep saved order and include `name`, `type`, `thicknessMm`, `thicknessLocked`, `material`, `color`, `epsilonR`, `lossTangent`, `sourcePath` and the original row `tree`. Missing fields are null; no default material, copper thickness or total stackup is generated. Unknown row attributes remain in the saved tree. Board thickness is the saved general thickness, not a calculated sum. Saved setup/plot fields and unknown top-level non-drawing forms remain available in the generic sections. Top-level PCB geometry, net records and embedded payloads become null slots in the returned tree, with an explicit warning; original numeric source indexes are preserved. This keeps a board with many drawing objects from consuming the settings inspector's copied-value budget. The dedicated layout and source viewers show those omitted records.

Custom-rule results include `rules`, with `name`, `condition`, `layer`, `severity`, `constraints`, `sourcePath` and `tree`. This is a syntax inspection, not proof that KiCad accepts a rule or that it applies to a selected object. Effective constraints require KiCad's rule engine and other design inputs; they are not inferred here.

Bounds are 8 MiB of UTF-8 input, 64 copied tree levels, 100,000 saved tree values and 50,000 displayed leaf entries. Violations fail explicitly rather than silently returning a partial setup. Parsing uses null-prototype JSON objects to keep keys such as `__proto__` as inert own data. S-expression parsing uses the existing bounded own design parser (`design-diff.js`, loaded before this module). Custom-rule `#` comments are removed only outside quoted strings.

Reference contracts: [KiCad board file format and stackup](https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/) and [KiCad settings framework](https://dev-docs.kicad.org/en/components/settings/index.html). Saved field coverage is independent of a particular GUI version; schema migrations/default evaluation are intentionally outside this inspector.

The Board Setup page follows the KiCad 9 design-rule section layout: Constraints,
Pre-defined Sizes, Net Classes and assignments, Custom Rules, Violation Severity,
Teardrops and Length-tuning Patterns. Desktop uses section navigation beside the
content; phones use a section selector. Numeric values use typed, read-only fields
with explicit units. Booleans and severity selections show their saved states.
Size and net-class tables preserve saved order; absent class values are labelled
“Not saved”, rather than filled with guessed defaults. The All settings view
continues to expose fields outside the specialised layout.

Custom-rule files open as read-only source plus a rule summary. The viewer does
not check custom-rule syntax, evaluate effective constraints or save edits.
Opening Board Setup preserves the loaded project and offers Back to its prior
section. This is a browser layout based on native KiCad sections, not a claim of
pixel-identical native controls.

Reference: [KiCad 9 Board Setup](https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html).
Run `node --test extension/tests/project-settings.test.cjs extension/tests/board-setup-ui.test.cjs`.
The retained fixtures are synthetic saved-data contracts, not evidence of native
KiCad execution or complete GUI parity.
