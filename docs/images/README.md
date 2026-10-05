# Screenshot provenance

Captured on 2026-10-04 from the project's actual browser viewer, running through the local preview harness at `127.0.0.1:8773`. Images are JPEG screenshots, not design mockups or AI-generated images. Capture includes the application controls and canvas; unused browser viewport margins were excluded. Browser device scaling determines image pixel dimensions.

The harness replaces extension transport with local files and mocked Git metadata/policy. It does not prove installed-browser integration, live authentication or successful remote publication. Screenshots show the working-tree viewer after the GitHub collaboration and large-board loading changes; they may differ from the already published v0.11.5 package. In particular, the GitHub destination and saved-note screenshots show a local draft with mocked policy; no Issue, Discussion, comment, or account sign-in was performed. The account-settings screenshot contains blank credential fields. GitLab captures also use local fixture content and mocked project metadata; no live GitLab posting occurred.

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
| `integration/github-account-settings.jpg` | Blank extension settings form for GitHub device sign-in and manual token; no account connected and no secret displayed. |
| `integration/github-discussion-destination.jpg` | Synthetic `highlights.kicad_pcb` fixture; Discussion type, new-thread destination, category, local review note and mocked policy status. No post was made. |
| `integration/github-saved-discussion.jpg` | Same synthetic fixture; saved local Discussion-type note and available controls. It is a draft, not evidence of successful publication. |
| `integration/gitlab-part-properties.jpg` | Synthetic `highlights.kicad_pcb` fixture with selected R1 footprint, saved properties and project explorer; GitLab project metadata is mocked. |
| `integration/gitlab-comment-editor.jpg` | Same fixture with an unsaved local note form, severity, state, tags, mention and area capture control. No GitLab API write was made. |
| `integration/gitlab-saved-note.jpg` | Same fixture with the saved local note and its annotation marker. No remote issue or merge-request comment exists. |

The new integration images accompany the step-by-step [GitHub guide](../using-github-integration/README.md) and [GitLab guide](../using-gitlab-integration/README.md). The three earlier collaboration images in the table above are a separate UI capture set; each set's provenance and limitations are described here.

## Marble attribution and limits

`integration/github-sign-in.jpg` captures the v0.11.7 primary sign-in screen in the same local harness on 2026-10-04. Advanced fields are collapsed, the account is signed out, and the missing publisher OAuth registration is visible. No device authorization or account login was performed. The earlier `github-account-settings.jpg` shows the preceding advanced configuration layout.

Marble hardware is the work of its upstream authors at [BerkeleyLab/Marble](https://github.com/BerkeleyLab/Marble), whose repository identifies the hardware license as CERN OHL v1.2. This project claims no ownership of that design and no upstream endorsement. The screenshots illustrate the viewer; the board source is not bundled in the extension release.

- Source revision: `a426777d92c0f22a546d4740b419a3937e0c1f90`.
- [Exact PCB source](https://github.com/BerkeleyLab/Marble/blob/a426777d92c0f22a546d4740b419a3937e0c1f90/design/Marble.kicad_pcb).
- File size: 44,059,775 bytes.
- SHA-256: `482850dbaaef9157e2e98af765a3c0d4d9c9f800daae224a54bf10e0621f52b0`.
- Linked models include STEP and `${CERN}` library references. The inspected repository tree has no supported WRL/GLB assets for these references. This renderer does not import STEP.

Visual inspection confirms these views loaded in the local harness. It does not establish pixel equivalence to native KiCad or correctness of every saved construct. Native KiCad remains necessary for authoritative design validation.


`integration/github-direct-discussion.jpg` and `github-formatted-review.jpg` capture the v0.11.8 editor in the same local synthetic PCB harness on 2026-10-04. They show a selected Discussion destination and Markdown preview with mocked category metadata. No account authorization or remote publication was performed.

`discussion-reply-draft.png` shows the actual browser editor after loading a synthetic marked Discussion comment and choosing Reply. The original sensor PCB fixture and provider responses are mocked; no private repository or remote post was used.

`integration/sheet-net-hierarchy.png` captures v0.12.17 shared outer/inner sheet trees and gold cross-sheet net badges on 2026-10-05. Saved root and Power drawings are synthetic local fixtures; Git transport is mocked. Outer-tree navigation was exercised without recreating the viewer, and SIGNAL_IN remained selected. No installed extension/private-account acceptance is implied.

The PNG `integration/loading-marble.png` was captured on 2026-10-05 from the actual schematic viewer loading the public Marble hierarchy through local fixture transport at port 8788. It shows the production loading surface while fetching and discovering sheets. No login or external publication occurred. See [performance evidence](../PERFORMANCE.md).

`integration/kicad-controls-themes.png` captures the production v0.12.19 schematic viewer in its dark display preset with the compact top controls, inspection strip and collapsed drawing-sheet overrides. Captured on 2026-10-05 using the synthetic hierarchy fixture and local mock transport at port 8788; no account or remote publication was used.

`integration/root-workspace-navigation.png` captures v0.12.20 at a 1000 × 700 CSS viewport on 2026-10-05. The requested `power.kicad_sch` subsheet automatically opens `hierarchy.kicad_sch`, its saved root. The screenshot shows the compact primary tab row, top sheet navigation and floating hierarchy tree. Synthetic source and mock repository transport at local port 8789; no account, installed extension or remote post was used.
