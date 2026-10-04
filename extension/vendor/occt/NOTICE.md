# Browser STEP importer

Unmodified `occt-import-js` 0.0.23 by Viktor Kovacs, licensed under LGPL-2.1. Open CASCADE Technology is licensed under LGPL-2.1 with the exception in its source tree. Complete license texts accompany these files.

Importer source revision: `c2148e54b456b571238d35cac037d304053d64b2`.
OCCT submodule revision: `d2abb6d844231cb8f29be6894440874a4700e4a5`.

The release source companion contains both pinned upstream source archives, build scripts and license/exception notices. Generate it with `python scripts/package_step_source.py`. Extract the importer, extract OCCT into its `occt` directory, and follow upstream `tools/setup_emscripten_win.bat` (Emscripten 3.1.69) and `tools/build_wasm_win_dist.bat`. Rebuilding with the recorded toolchain has not been independently verified here.

These libraries remain separate, replaceable files in `vendor/occt`. Replace the JavaScript/WASM pair together with a compatible build; the viewer's worker calls `ReadStepFile` and receives bounded mesh arrays. No signature check prevents replacement in a development installation. The project permits debugging/reverse engineering of these library components for modification; this notice does not grant rights to unrelated owner code.

Bundled SHA-256:
- `occt-import-js.js`: `3fb44ce11d00611f9b3f3c5775d520ebab48930c1f08279b7b1316f05f0d3379`
- `occt-import-js.wasm`: `33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952`

Upstream: https://github.com/kovacsv/occt-import-js and https://github.com/Open-Cascade-SAS/OCCT
