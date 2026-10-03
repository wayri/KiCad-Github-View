# Historical renderer assets

The notes below describe retired dependencies. Active viewers and release archives use the owned renderer and SPIKE bundle; these legacy renderer/font files are not tracked or shipped.

KiCanvas bundle downloaded from https://kicanvas.org/kicanvas/kicanvas.js on 2026-09-28.
Local bundle changes:
- Replace its Google Fonts stylesheet URL with `vendor/kicanvas-fonts.css`,
  so the extension makes no runtime font request.
- Clear the entire Canvas2D physical buffer before applying device scaling,
  preventing stale drawing fragments when browser zoom makes devicePixelRatio < 1.
- Update WebGL's clear color on redraw, so PCB theme changes update the background.

The last two changes are reproducible with `python scripts/patch_kicanvas.py`.
The script checks expected source fragments before applying them.

The Material Symbols font is bundled from Google Fonts and licensed
under Apache 2.0; see MATERIAL-SYMBOLS-LICENSE. KiCanvas's notices are in
KICANVAS-LICENSE.md. Original bundle SHA-256:
CA910F25276C3EFB9AACB3A5D6341D4D9AF4736D4C875FB0440D2CC856865AB7.

Current patched bundle SHA-256: a26c501852ee310006d476204315b805680bd474b6c528fbf637e3ea2841af27.
