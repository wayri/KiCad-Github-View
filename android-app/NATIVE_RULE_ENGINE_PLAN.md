# Native mobile KiCad rule engine

Status (2026-10-08): not integrated. Android 1.22 runs the Java/WebView viewer and has no NDK/JNI KiCad rule engine. Importing KiCad JSON reports is offline report viewing, not executing ERC/DRC. Desktop KiCad validation of field-copy fixtures does not validate Android execution.

## Deliverable and milestones

1. Pin a supported upstream KiCad release and audit a native Android checker build. KiCad's actual schematic ERC and PCB DRC implementations must be used. The existing [dsa-t Android port](https://github.com/dsa-t/kicad-android) is a feasibility reference, not an approved or bundled runtime. Its documented API-28 requirement conflicts with this app's API-26 floor; gate the feature or revisit the supported minimum after testing.
2. Build ARM64 with the Android NDK and expose engine version, run, cancel, and diagnostic output through JNI. Resolve the actual C++/wxWidgets dependency graph. Do not package a desktop Windows executable or label JavaScript heuristics as native KiCad checks.
3. Stage a copied complete project in app-private storage, preserving schematic hierarchy paths, .kicad_pro, .kicad_dru, symbol/footprint tables and required libraries. Missing dependencies must be reported. Never alter original files or silently refill/save zones.
4. Run asynchronously with cancellation and tested resource limits. Return JSON reports bound to the exact file hashes, project/rule context and engine version. Define refill and schematic-parity options explicitly.
5. On a connected ARM64 phone, compare against the same desktop KiCad version on known-error and known-clean fixtures, nested/reused sheets, library dependencies, custom rules, exclusions and filled zones. Check report locations/severities, interruption, offline behavior and performance before enabling the UI.

## Current evidence

Installed desktop KiCad is 10.0.6; sch erc and pcb drc are available. Before/after Value-only schematic and PCB copies were parsed/exported and checked with that desktop engine in .vizdiff/field-native. Existing findings are fixture evidence, not an Android engine result or proof a real user's design is clean. Native file-picker/export flow still requires a connected phone test.

Official references: [KiCad CLI and rule commands](https://docs.kicad.org/10.0/en/cli/cli.html), [KiCad build dependencies](https://dev-docs.kicad.org/en/build/getting-started/index.html), [supported downloads](https://www.kicad.org/download/), [Android NDK ABIs](https://developer.android.com/ndk/guides/abis).
