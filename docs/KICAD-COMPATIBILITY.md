# KiCad file compatibility — VS Code and Chrome

Both editions use the shared saved-file parser and 2D rendering pipeline. KiCad installation is not required for ordinary viewing. This describes file compatibility, not a native KiCad plugin ABI.

| Saved source | VS Code | Chrome | Evidence and limits |
| --- | --- | --- | --- |
| KiCad 8 | Recognized constructs | Recognized constructs | Header/geometry/field tests and older-format fixtures from the official 8.0 QA corpus; native KiCad 8 pixel acceptance remains pending. |
| KiCad 9 | Recognized constructs | Recognized constructs | Generator-header and geometry tests; not full native KiCad 9 feature certification. |
| KiCad 10 | Recognized constructs | Recognized constructs | Header/geometry tests and native-reference fixtures exported with KiCad 10. |
| Newer generator versions | Warned preview | Warned preview | Synthetic future headers test warnings; no promise of future-version compatibility. |
| KiCad 4–7 / legacy .sch | Restricted preview | Restricted preview | Saved modern PCB modules and legacy schematic/cache-library constructs have retained-fixture tests. Missing symbol definitions are omitted with diagnostics; complete version certification is pending. |
| Legacy .brd | Conversion required | Conversion required | Discovery recognizes the file; convert it in KiCad for rendering. |
| KiCad 11 | Unverified forward preview | Unverified forward preview | No native KiCad 11 acceptance is claimed. |

Drawing previews accept .kicad_sch, .kicad_pcb and restricted legacy .sch. Legacy .pro remains inspectable as saved source. A saved format date alone does not establish the KiCad major version. Unknown top-level constructs are disclosed as omitted; nested/new features may require additional implementation. Embedded file assets, component-class rules, schematic net-class rule areas and native schematic tables are not implemented, even for newer sources. External model assets depend on supported formats and accessible paths.

Viewing and comparison have rendering/connectivity limits. Saved ERC/DRC findings are displayed; native checks and simulation solvers are not run. Opening a source does not establish complete design fidelity or engineering validation.

## Choose an edition

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review): review beside source code, keep review sidecars and compare marker-based Git conflicts visually. VS Code 1.95 or newer is declared by the package.
- [Chrome companion](https://github.com/wayri/kiview-marketplace-assets/blob/main/CHROME-HOME.md): local file/folder and supported GitHub/GitLab page review. Chrome Web Store publication is pending; no public store URL is advertised yet.

Each edition works independently. Portable exports transfer supported review state; feature availability differs by host. KiCad, Microsoft and Google do not endorse this independent product.

Saved `${VARIABLE}` text can resolve from bounded matching project settings, title blocks and supported field/reference lookups. Raw text remains available. Optional project metadata is read only when the loaded drawing contains variable expressions.
