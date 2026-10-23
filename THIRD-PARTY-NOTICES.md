# Third-party and owner-engine notices

The integrated PDF viewer bundles Mozilla PDF.js 6.4.299 under Apache-2.0. The complete license and bundled font/CMap notices are preserved in `extension/vendor/pdfjs/`. The official npm archive SHA-512 integrity value and SHA-256 hashes of each vendored file are recorded in `extension/vendor/pdfjs/FILES.json`. PDFs render locally; this adds no external document service.

Embedded KiCad model decompression uses fzstd 0.1.1 under MIT. The complete notice is preserved as `extension/vendor/fzstd/LICENSE` and is included in viewer packages. Pinned source provenance is recorded in `extension/vendor/fzstd/README.md`.

The browser and VS Code release packages include Three.js 0.171.0 under MIT. Its complete notice is preserved as `vendor/THREE-LICENSE` (under `extension/media/vendor/` in the VSIX).

The SPIKE browser geometry bundle is provided by the project owner. Provenance and source hashes are preserved in `extension/vendor/SPIKE-ENGINE-NOTICE.md`. The owner-authored subset included in KiView is covered by Pocket KiView Source-Available License 1.0, subject to the owner's rights. This does not relicense the rest of SPIKE, revoke earlier grants or change third-party licenses. See LICENSE and LICENSING.md.

The active schematic/PCB/Gerber viewers and SVG icons are owned project implementations. Retired KiCanvas and Material Symbols assets are not included in release packages. Their historical notices remain in the source tree for provenance; they are not runtime dependencies.

Optional GitHub App authentication uses the separately installed `cryptography` Python package; it is not vendored in the extension archives. Its upstream licensing applies when installed. No third-party KiCad design files are included in the download packages. Retained test fixtures remain source-test inputs and carry their provenance where supplied.

The browser STEP preview bundles occt-import-js 0.0.23 rebuilt from unchanged pinned sources with dynamic JavaScript generation disabled and its Open CASCADE WebAssembly kernel under LGPL-2.1 (OCCT exception included). Licenses, pinned provenance and rebuild/replacement instructions are in `extension/vendor/occt/NOTICE.md`. Releases containing it must include the `kicad-visual-review-step-source-VERSION.zip` corresponding-source companion, produced and checksum-verified by the release builder. Library debugging and replacement remain permitted. The dependency is loaded only when STEP conversion is requested.

The STEP dependency includes Emscripten runtime code under MIT or University of Illinois/NCSA terms. Its complete license is preserved as `extension/vendor/occt/EMSCRIPTEN-LICENSE.txt`.
