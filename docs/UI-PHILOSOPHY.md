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

## Verification on 2026-10-11

1068 JavaScript tests and 41 Python application/packaging/release tests passed. Android debug assembly and lint passed. Browser checks used a retained synthetic fabrication fixture with copper, board outline and Excellon drills; inspected desktop and 390 CSS-pixel phone layouts, 44 px toolbar targets, layer panel switching, unsnapped two-point measurement, analysis criterion changes and source-role labels. Calculator chrome was inspected in dark mode at desktop and phone widths. Physical-device gesture and native export acceptance remain pending. The APK is `android-app/app/build/outputs/apk/debug/app-debug.apk`; signed Play artifacts require a separate rebuild and validation.

Icon artwork uses a 20 px box (18 px in the dense drawing header), independently of the 40 px standalone button or 44 px touch target. The drawing inspection strip reserves 52 px on touch layouts so its 44 px controls fit without clipping. Header titles, supporting text and actions share a consistent scale. Icon decoration must not inject global size overrides.
