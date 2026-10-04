# Screenshot provenance

Captured on 2026-10-04 from the project's actual browser viewer, running through the local preview harness at `127.0.0.1:8773`. Images are JPEG screenshots, not design mockups or AI-generated images. Capture includes the application controls and canvas; unused browser viewport margins were excluded. Browser device scaling determines image pixel dimensions.

The harness replaces extension transport with local files and mocked Git metadata/policy. It does not prove installed-browser integration, live authentication or successful remote publication. Screenshots show the working-tree viewer after the GitHub collaboration and large-board loading changes; they may differ from the already published v0.11.5 package.

| Image | Source and displayed behavior |
| --- | --- |
| `marble-layout.jpg` | BerkeleyLab/Marble, `design/Marble.kicad_pcb`, revision below; dark 2D board view, 1006 saved footprints. |
| `marble-3d-proxies.jpg` | Same Marble revision; source-driven board preview with **0/1006 real footprint models**. All component bodies are procedural proxies. |
| `schematic-sheets.jpg` | Synthetic `hierarchy.kicad_sch` and `power.kicad_sch`; complete A4 page, title block and root/child navigator. |
| `net-highlighting.jpg` | Synthetic `highlights.kicad_pcb`; SIGNAL_IN copper highlight, pad connections and saved straight-track length. |
| `bom-analytics.jpg` | Same fixture; BOM and descriptive saved-source statistics, not manufacturing qualification or a fresh zone fill. |
| `repository-model-3d.jpg` | Owned `owned-model-review/board.kicad_pcb` fixture and repository-relative `models/review-block.wrl`; one real cuboid WRL model loaded, 1/1 footprints. |
| `project-settings.jpg` | Synthetic `review-demo.kicad_pro`; read-only constraints and dimension fields. |
| `project-stackup.jpg` | Synthetic `review-demo.kicad_pcb`; saved two-copper-layer FR4 stackup, diagram and table. |
| `github-collaboration.jpg` | Synthetic highlights board; GitHub type/destination selectors and mocked review policy. No account credentials or live thread. |
| `comment-editor.jpg` | Same fixture; unsaved demonstration draft. No external comment was created. |
| `revision-comparison.jpg` | Synthetic sensor base/head sources and mocked revision identifiers; side-by-side drawings and Changes panel. |

## Marble attribution and limits

Marble hardware is the work of its upstream authors at [BerkeleyLab/Marble](https://github.com/BerkeleyLab/Marble), whose repository identifies the hardware license as CERN OHL v1.2. This project claims no ownership of that design and no upstream endorsement. The screenshots illustrate the viewer; the board source is not bundled in the extension release.

- Source revision: `a426777d92c0f22a546d4740b419a3937e0c1f90`.
- [Exact PCB source](https://github.com/BerkeleyLab/Marble/blob/a426777d92c0f22a546d4740b419a3937e0c1f90/design/Marble.kicad_pcb).
- File size: 44,059,775 bytes.
- SHA-256: `482850dbaaef9157e2e98af765a3c0d4d9c9f800daae224a54bf10e0621f52b0`.
- Linked models include STEP and `${CERN}` library references. The inspected repository tree has no supported WRL/GLB assets for these references. This renderer does not import STEP.

Visual inspection confirms these views loaded in the local harness. It does not establish pixel equivalence to native KiCad or correctness of every saved construct. Native KiCad remains necessary for authoritative design validation.
