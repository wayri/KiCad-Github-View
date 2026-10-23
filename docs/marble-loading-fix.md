# Marble layout preparation fix

The PCB net builder looked up the saved board version inside its per-net helper.
That lookup filters the entire top-level board AST. On the retained 44,059,775-byte
Marble board, with 79,624 top-level forms, the helper made roughly 130,000 full
board scans. Preparation could exceed the worker's two-minute deadline.

The version is now read once per board. Numeric KiCad net codes and newer named
net records retain their existing interpretation. No timeout or parser limit was
relaxed, and saved filled copper remains in the rendered geometry.

The retained board plus 25 schematics (66,845,833 source bytes) completed in
5.741 seconds in a local Node profile, including result cloning. The result
contained 97,099 model objects, 205,702 primitives, 1,052,743 polygon points and
4,026 nets. This is a desktop measurement, not a phone timing claim. Peak RSS
was approximately 1,675 MiB; on-device memory and rendering remain acceptance
checks for this large project.

A deterministic regression checks that board-version access stays constant as
track count grows, alongside net-membership, geometry and worker-cloning tests.
All 1,186 JavaScript checks passed. The fix is included in the shared extension,
VS Code and staged mobile assets. The Android APK is a local development build;
it has not been published as a new release. iOS source remains local.

The local installer is `dist/ui-polish/pocket-kiview-1.54-marble-fix.apk`.
Android debug assembly passed, all 351 viewer assets passed their hash audit,
and APK signature verification passed. Its signing certificate matches the
v0.12.42 / Android 1.54 development APK previously installed on the phone.
The operator requested the APK for manual installation; no on-device test was
performed because ADB had no connected device.
