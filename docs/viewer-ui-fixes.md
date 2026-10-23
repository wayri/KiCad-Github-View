# Viewer navigation and phone controls

The all-sheets overview draws teal arrows from each saved parent sheet to its
child sheet. The Hierarchy links toggle controls these arrows independently
of the gold net connections. Repeated source placements retain their saved
instance labels; unloaded or unresolved targets are reported rather than
connected to an unrelated page.

The testpoint page provides live reference/net/pad/file search and defaults to
detected testpoints in the current drawing type. Select a reference or row to
navigate to its source object. Additional filters and CSV export are under
Filters and export. The Explorer also has a Testpoints only object filter.

Android engineering tools use a separate iframe. Returning from calculators,
BoM, PDF or Gerber restores the mounted drawing, selection and filter without
reloading it. Opening a different project clears the old return context.

Phone controls have minimum touch targets, wrapping action groups and bounded,
scrollable custom menus. The all-sheets toolbar wraps onto rows. Corrupted
punctuation was repaired in the affected shared and Android UI files.

Validation: 1,200 JavaScript checks passed, followed by 26 focused checks after
the final testpoint count text correction. Browser checks at a phone viewport
verified Marble hierarchy arrows, testpoint filtering and navigation, and
calculator return preserving the drawing selection and filter. Screenshots
are in `dist/ui-polish`. Physical Android verification remains pending.

These are local development artifacts; the published release is unchanged.
