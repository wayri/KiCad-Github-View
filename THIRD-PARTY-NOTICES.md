# Third-party and owner-engine notices

The browser and VS Code release packages include Three.js 0.171.0 under MIT. Its complete notice is preserved as `vendor/THREE-LICENSE` (under `extension/media/vendor/` in the VSIX).

The SPIKE browser geometry bundle is provided by the project owner. Provenance and source hashes are preserved in `extension/vendor/SPIKE-ENGINE-NOTICE.md`. This repository does not grant that engine an open-source license. Publishing downloadable artifacts does not establish a license for selling, copying or modifying owner code.

The active schematic/PCB/Gerber viewers and SVG icons are owned project implementations. Retired KiCanvas and Material Symbols assets are not included in release packages. Their historical notices remain in the source tree for provenance; they are not runtime dependencies.

Optional GitHub App authentication uses the separately installed `cryptography` Python package; it is not vendored in the extension archives. Its upstream licensing applies when installed. No third-party KiCad design files are included in the download packages. Retained test fixtures remain source-test inputs and carry their provenance where supplied.

The browser STEP preview bundles occt-import-js 0.0.23 rebuilt from unchanged pinned sources with dynamic JavaScript generation disabled and its Open CASCADE WebAssembly kernel under LGPL-2.1 (OCCT exception included). Licenses, pinned provenance and rebuild/replacement instructions are in `extension/vendor/occt/NOTICE.md`. Releases containing it must include the `kicad-visual-review-step-source-VERSION.zip` corresponding-source companion, produced and checksum-verified by the release builder. Library debugging and replacement remain permitted. The dependency is loaded only when STEP conversion is requested.

The STEP dependency includes Emscripten runtime code under MIT or University of Illinois/NCSA terms. Its complete license is preserved as `extension/vendor/occt/EMSCRIPTEN-LICENSE.txt`.
