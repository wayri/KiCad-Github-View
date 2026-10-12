# App and browser extension parity

Pocket KiView's Android app and browser extension package the same engineering
viewers and review modules. Open **Engineering tools** in a drawing or project
to reach standalone imports. The extension opens a bundled tab; Android uses
its viewer frame.

| Capability | Android app | Browser extension |
| --- | --- | --- |
| Schematic/PCB inspection, measurements and net probing | Shared viewer | Shared viewer |
| Board analytics: trace length, zone geometry, placement candidates and saved routing findings | Shared module | Shared module |
| BoM, assembly progress, variants and DNP/DNI highlights | Shared modules | Shared modules |
| CSV/JSON/iBOM imports, Gerber viewer/analyzer, engineering calculators and PDF viewer | Engineering tools | Engineering tools |
| Saved supported simulation results, plots and spatial overlays | Project results | Project results |
| Testpoint summary, component linking and photo inspection | Shared modules | Shared modules |
| Portable review handoff | Import/export through native file handling | Import/export through browser file handling |

Parity depends on source data and supported formats. Camera permission,
high-resolution capture, Android file picking and native sharing remain host
capabilities. Browser photo input uses browser file/camera support. Photo/AR
review is aligned board imagery and inspection evidence; it does not guarantee
automatic component recognition or assembly validation. Standalone engineering
tools are currently launched from Android and the browser extension; the VS Code
host continues to use its existing drawing and review interfaces.

## Transfer work between devices

In a 2D drawing, choose **Transfer review**, then **Export portable review**.
Load the same saved drawing paths and contents in the other host, open the same
active drawing and import the JSON file. **Apply verified review** becomes
available only after every loaded drawing's SHA-256 fingerprint matches.
Repository/ref context can differ (for example GitHub to a local Android
project); verified note anchors and assembly scope are translated to the target.
This is explicit file transfer, not automatic cloud synchronization.

The file includes local notes from the active drawing, embedded note screenshots,
management records for the selected assembly variant, variant definitions,
camera position, saved object/net selection and completed distance/angle
measurements. It does not carry CAD sources, model files, original inspection
photos, standalone simulation data, credentials or accounts. Supported reports
and BoM imports can be opened separately in either host using their shared
viewers. Load model dependencies alongside the original project.

Existing note IDs are skipped; existing nonempty management fields take
precedence over imported fields. Conflicting definitions of the same variant
are rejected. Remote publication links, mentions and external attachments are
cleared on import; embedded screenshots remain. Import does not publish an
issue or discussion. A failed sequential note save reports partial progress;
retry skips saved IDs.

Limits: 4 MiB per handoff, 100 notes/1 MiB of serialized notes, 1–128 loaded
KiCad drawings and 96 MiB of source text for fingerprinting. Source identity is
exact text and path equality, including whitespace; it does not establish DRC,
netlist or manufacturing equivalence.

## Verification

The focused launcher/handoff and shared workspace tests cover packaged tool
routing, native exports, safe source-context translation, exact fingerprints,
variant conflicts, unknown part IDs, malformed files, duplicate notes, retained
assembly fields and note-capacity rejection. Board analytics retains separate
native KiCad reference fixtures and labels inferred routing/placement findings.
