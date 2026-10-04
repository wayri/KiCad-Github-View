# Browser STEP importer

`occt-import-js` 0.0.23, rebuilt from unchanged pinned sources by Viktor Kovacs, licensed under LGPL-2.1. Open CASCADE Technology is licensed under LGPL-2.1 with the exception in its source tree. Complete license texts accompany these files.

Importer source revision: `c2148e54b456b571238d35cac037d304053d64b2`.
OCCT submodule revision: `d2abb6d844231cb8f29be6894440874a4700e4a5`.

The release source companion contains both pinned upstream source archives, build scripts and license/exception notices. Generate it with `python scripts/package_step_source.py`. Extract the importer, extract OCCT into its `occt` directory, and follow `docs/step-build.md` and `scripts/rebuild_step_csp.cmd` in the companion. This build uses Emscripten 3.1.69, CMake Release (`-Oz` from upstream), Ninja 1.13.2 and `-sDYNAMIC_EXECUTION=0` to remove Embind dynamic JavaScript generation. The Windows build and strict no-dynamic-code conversion regression passed on 2026-10-04; cross-platform bit-for-bit reproducibility is not established. Emscripten runtime MIT/NCSA terms are preserved in `EMSCRIPTEN-LICENSE.txt`.

These libraries remain separate, replaceable files in `vendor/occt`. Replace the JavaScript/WASM pair together with a compatible build; the viewer's worker calls `ReadStepFile` and receives bounded mesh arrays. No signature check prevents replacement in a development installation. The project permits debugging/reverse engineering of these library components for modification; this notice does not grant rights to unrelated owner code.

Bundled SHA-256:
- `occt-import-js.js`: `73bfc4ac71dc1fc495a362303418f8b9d8798e2c86a508bc6a22e2cb69ac5523`
- `occt-import-js.wasm`: `4a20dc48ce93a7461709fd3e14b9823acf4a42c2c165d281d1b1b8945a686caf`

Upstream: https://github.com/kovacsv/occt-import-js and https://github.com/Open-Cascade-SAS/OCCT
