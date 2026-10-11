# Pocket KiView: Google Play listing copy

Prepared 2026-10-11 for Android **1.50 / version code 53**, source release **v0.12.38**. Owner must confirm the final listing details before submission. The current candidate and pending gates are recorded in [DEPLOYMENT-1.50.md](DEPLOYMENT-1.50.md); the earlier [compliance audit](COMPLIANCE-AUDIT.md) remains supporting evidence for 1.49, not acceptance of this build.

## App name

Pocket KiView

## Short description

Review KiCad boards, 3D models, BoMs, Gerbers and saved analysis on the go

## Full description

Carry your KiCad projects with Pocket KiView, a portable viewer for Android phones and tablets.

Open a project folder, drawing or project ZIP using Android's file picker. Browse public GitHub and GitLab projects, or connect your account to access repositories you are authorized to view. Cloud document providers such as Drive work through Android's file picker.

Explore schematic sheets with a hierarchy tree and sheet navigation, or arrange loaded sheets together on one canvas. Select parts and nets, search saved design data, and follow supported connections across sheets and between the schematic and PCB. View PCB layers, measure layout distances and inspect part properties. Browse repository files with a tree and quick actions.

Inspect boards in 3D with supported repository or embedded models and cross-selection. Missing models use approximate stand-ins. Compare saved revisions and inspect changed part fields in the properties panel.

Manage BoMs with grouped quantities, build counts, fitted/DNP filters, local assembly variants, procurement drafts and assembly progress. Export CSV and restore source-scoped metadata. Import supported iBOM HTML as inert data with a simplified interactive assembly view, or BoM Studio JSON/CSV exports. Imported HTML scripts never execute; full iBOM geometry and BoM Studio workspace synchronization are not provided.

Review Gerber layers and round Excellon drill hits in a dedicated fabrication viewer. Control layer visibility, color and opacity, measure distances, inspect rendered statistics, screen stroke widths and drill diameters, and export analysis with source hashes. Parser warnings identify unsupported data. This is geometry screening, not complete manufacturing DFM; aperture macros and routed drill slots are unsupported.

Keep named recent projects with source and last-access details, bookmark and star favorites, and save project copies for offline viewing. Large supported online projects offer permanent or temporary downloads, subject to device storage, memory and provider limits. Temporary copies expire after six hours; recent entries remain marked expired. A manual cleanup action is available.

Create local review notes and screenshots. When connected, explicitly publish to GitHub Issues or Discussions or GitLab issues, and read supported comment threads. Optional GitHub field editing exports a revised project copy with existing value/custom-field edits; it does not overwrite the repository.

View supported saved WayriCAD analysis reports, KiCad simulation workbooks and exported waveform data, with plots and supported result overlays/probing where the saved data provides them. Pocket KiView displays saved results; it does not run KiCad ERC, DRC or simulation solvers on your phone.

Use offline calculators for Ohm's law, loaded dividers, adjustable regulators, LED resistors, copper track width, via resistance, resistor colors, wavelength and length conversion. Equations, units and assumptions accompany results. This selected suite does not include every native KiCad calculator tool.

The compact touch interface includes dedicated settings, KiCad-style light and dark presets, draggable panels, long-press actions, adaptive tablet layouts and an offline Read Me guide.

Pocket KiView is an independent project and is not an official KiCad, GitHub, GitLab, Altium or Siemens product. Rendering, net connectivity, imported reports and 3D approximations are review aids. Unsupported constructs and unavailable assets may affect the view. Validate designs and exported copies in KiCad before engineering use.

## Console metadata to confirm

- Application: `dev.kicadvizdiff.android`; Android 8 or later; phones and tablets.
- Suggested category: Tools. The owner selects final category, audience, countries, pricing and content rating.
- Support website: https://github.com/wayri/KiCad-Github-View
- Issue support: https://github.com/wayri/KiCad-Github-View/issues
- Support and private privacy/report contact: **support.kiview@sigharmonic.com** (supplied by the owner; verify mailbox operation and monitoring before submission).
- Privacy URL: https://wayri.github.io/pocket-kivi-policies/privacy.html (deployed; verify response/copy parity and enter in Console).

## Preview assets

Supply the shipped app icon as a 512 × 512 PNG, a 1024 × 500 opaque PNG/JPEG feature graphic, and genuine screenshots of the submitted Android version. Show schematic selection, PCB layers/3D, BoM/assembly, Gerber analysis, comments and offline library. Avoid private project data, access tokens, fabricated account state and device frames. Phone and tablet screenshots must depict their actual respective layouts. The repository's browser-fixture screenshots are development evidence, not physical Android acceptance evidence.

Follow the [official preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) for current dimensions and screenshot counts. The copy above fits the 30-character name, 80-character short description and 4,000-character full description limits; recheck after localization or editing.
