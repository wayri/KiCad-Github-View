# Third-party and owner-engine notices

The browser and VS Code release packages include Three.js 0.171.0 under MIT. Its complete notice is preserved as `vendor/THREE-LICENSE` (under `extension/media/vendor/` in the VSIX).

The SPIKE browser geometry bundle is provided by the project owner. Provenance and source hashes are preserved in `extension/vendor/SPIKE-ENGINE-NOTICE.md`. This repository does not grant that engine an open-source license. Publishing downloadable artifacts does not establish a license for selling, copying or modifying owner code.

The active schematic/PCB/Gerber viewers and SVG icons are owned project implementations. Retired KiCanvas and Material Symbols assets are not included in release packages. Their historical notices remain in the source tree for provenance; they are not runtime dependencies.

Optional GitHub App authentication uses the separately installed `cryptography` Python package; it is not vendored in the extension archives. Its upstream licensing applies when installed. No third-party KiCad design files are included in the download packages. Retained test fixtures remain source-test inputs and carry their provenance where supplied.
