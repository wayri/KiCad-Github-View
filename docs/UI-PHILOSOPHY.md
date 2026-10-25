# Pocket KiView UI philosophy

The drawing or document is the primary workspace. Chrome uses neutral KiCad-style surfaces, a single blue interaction accent, system fonts, 6 px control corners and 8 px panel corners. Layer, plot, thermal and PDF page colours belong to their renderers and are independent of the chrome theme.

## Action hierarchy

- Keep Back, project identity and view navigation stable. Moving between engineering tools should preserve the distinction between navigation and work on the current document.
- Keep pan, zoom, fit, layer selection and measurement near the canvas. Put detailed properties, evidence, analysis and export in secondary panels.
- Reserve filled primary actions for the next clear operation. Selected toggles use a tinted surface, an accent border and their accessible pressed/selected state. Do not use colour alone to indicate selection.
- Separate clear, remove and destructive actions from routine view controls. Describe what is affected and keep publishing actions explicit.
- Keep units, revision/source identity, uncertainty and evidence visible beside a measurement or result. Screen appearance must not imply engineering validation.

## Shared foundation

`extension/ui-foundation.css` is loaded after tool styles. Standalone engineering pages opt in through `body.kiview-tool`; the drawing pages use their existing `data-viewer` attribute and Android uses `body.android-home`. The foundation supplies the same named surface, panel, control, text, border, accent and selected-state tokens. Android's existing `--android-*` variables alias these tokens, retaining its adaptive layout and native behaviour.

The existing `body.dark` tool toggle and `body[data-ui-theme=light|dark]` application setting both work. An explicit data attribute wins. PDF and Gerber chrome follow the system appearance when no explicit setting is present. Calculator, analysis and BoM keep their existing theme controls. These pages do not automatically share saved theme preferences yet; theme state remains owned by the current page. The shared stylesheet changes no drawing palette or rendering algorithm.

Keyboard focus is visible across buttons, fields, summaries and links. Phone-sized screens and coarse pointers receive at least 44 px control heights; icon-only buttons also receive 44 px widths. Checkbox/radio/range geometry and canvas comment pins retain their specialised shapes. Their surrounding labels and hit areas should be reviewed whenever new tools are added.

The stylesheet is a bounded visual foundation, not a replacement layout framework. New controls should reuse the tokens and action hierarchy, provide accessible labels and states, and keep engineering limitations readable. Tool-specific layout and drawing colours stay in the tool's own stylesheet.

## Android interaction and layout

Android uses a flat, Material-inspired presentation with 12 px control/card corners, restrained primary emphasis, 48 px action targets and consistent section headers. Home separates opening a project, recent projects and engineering tools. Drawing commands live in one scrollable right rail, hidden or restored with its top-right toggle. Explorer, Properties and review panels take over the phone surface while open; the rail stays out of their way. Inspection, display, selection, navigation and engineering commands remain grouped on the full tools page. Context menus are bounded popups, never resizable sheets. Existing handlers and state stay attached to their controls when they move between layouts.

Android uses immersive full screen with transient system bars available by an edge swipe. The native WebView fills the entire display; only the keyboard resizes it. Reported display-cutout, visible system-bar and mandatory-gesture insets become CSS spacing on headers, navigation and interactive controls, rather than blank native gutters. Nested viewers receive only the safe edges they actually touch, avoiding repeated padding. Rotation updates these insets without reloading the project. Do not infer camera clearance from a device name or camera technology: a device reporting no display cutout receives no camera padding. Android 8 retains the legacy immersive/keyboard-resize path; Android 9–10 also protect reported cutouts, while Android 11 and later use the unified inset listener.

Selection and inspection are separate actions. Tapping a part or net, selecting a search/list result, or cross-highlighting another drawing updates the selection and the contents of an already-open inspector without opening Properties. Hold an object to open its context menu, then choose Properties explicitly; the Properties toolbar/page command remains available. Orbiting, pinching and cancelled touches must not become long presses or accidental selections. Menus use their actual dimensions to stay within the view and scroll when their contents exceed its height.

Do not rely on a nominal toolbar count: sidebar, measurement and sheet helpers can mount controls later. Verify the completed toolbar at 320 CSS pixels, and keep its tools entry accessible without horizontal scrolling. Text fields and selectors must fit both their container and their own labels; checking page overflow alone does not catch text clipped inside a control.

## Verification on 2026-10-11

1068 JavaScript tests and 41 Python application/packaging/release tests passed. Android debug assembly and lint passed. Browser checks used a retained synthetic fabrication fixture with copper, board outline and Excellon drills; inspected desktop and 390 CSS-pixel phone layouts, 44 px toolbar targets, layer panel switching, unsnapped two-point measurement, analysis criterion changes and source-role labels. Calculator chrome was inspected in dark mode at desktop and phone widths. Physical-device gesture and native export acceptance remain pending. The APK is `android-app/app/build/outputs/apk/debug/app-debug.apk`; signed Play artifacts require a separate rebuild and validation.

Icon artwork uses a 20 px box (18 px in the dense drawing header), independently of the 40 px standalone button or 44 px touch target. The drawing inspection strip reserves 52 px on touch layouts so its 44 px controls fit without clipping. Header titles, supporting text and actions share a consistent scale. Icon decoration must not inject global size overrides.

### Focused Android navigation

The Android library has one Open project entry; storage/account choices belong on its dedicated page. Project overview, files and saved reports are separate tabs and retain their controls and query state when switching. The bottom bar contains only Project, Schematic and Layout. Split/comparison and presentation are secondary project-menu tasks. The drawing rail starts collapsed and can be restored from its top-right Tools button.

Project-menu entries use one full-width row per action. Do not expose raw desktop toolbar containers beside phone proxies: an original trigger kept for controller compatibility must remain hidden, and its state must still update the visible proxy. Presentation is a collapsed group. Empty menu content must use the same surface as the rest of its page.

Icon-bearing search fields reserve a distinct grid cell for the symbol, leaving an 8 px gap before both placeholder and entered text. Saved net names and sheet-pin labels are display data; source UUIDs and canonical net keys remain connectivity identities and should not replace readable names in highlight UI.


Desktop workspaces default to content: file navigation is collapsed unless the
user explicitly keeps it visible, single-view duplicate file selectors are hidden,
and host commands use labelled icons. Focus view hides host chrome without
reloading drawings, and provides a persistent Restore controls action. Conflict
properties begin collapsed; source acceptance and save actions remain explicit.
BoM tables fill the workspace while source, totals and column configuration are
available on demand. Do not hide source-write confirmations to gain space.
