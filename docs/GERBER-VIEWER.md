# Pocket KiView fabrication review

Open **Gerber viewer & analyzer** from home, project tools or a fabrication file in the repository tree. Import multiple layers and Excellon drill files, or load the active project's fabrication set. Fabrication-only imports are supported. Source coordinates retain their common origin; displayed coordinates and measurement distances use millimetres. Distance measurement is unsnapped.

Layers have independent visibility, color and opacity. Each is rendered into an isolated transparent film so clear polarity only subtracts from its own layer. Drag to pan, use zoom buttons or a wheel, and Fit to frame visible layers.

Analysis reports rendered bounds, operation/polarity counts, layer roles (X2 metadata preferred, filename inference identified), minimum rendered stroke, drill diameters, duplicate drill hits and parser warnings. User criteria screen stroke widths and drill diameters. These are not copper clearance, annular ring, outline containment or complete manufacturing DFM checks. Extents include clear operations and represent parsed geometry rather than final occupied copper.

Save analysis JSON preserves source SHA-256 hashes and the active project revision. Failed files are reported separately; unsupported constructs are never silently considered verified. Limits: 16 layers, 8 MiB per source, 24 MiB and 200,000 operations per set. Aperture macros, curved regions, unsupported transforms and routed drill slots remain outside the parser's supported subset. See [parser documentation](../extension/docs/gerbers.md) and the [official Gerber specification](https://www.ucamco.com/en/guest/downloads/gerber-format).

## Workspace controls

The drawing is the main workspace. Layers and Analysis share one inspection panel; on phones the panel opens below the canvas and can be dismissed to regain drawing space. File imports and project loading stay in the header; clearing the imported set stays inside the Layers panel. Show all/Hide all manage preview visibility without excluding files from analysis. Layer cards show roles and their X2 or filename provenance, colors and opacity.

Drag to pan, pinch or scroll to zoom, or use Fit drawing. Zoom remains anchored to the pointer/pinch midpoint. The canvas supports F/0 for fit, M for measurement, plus/minus for zoom, arrow keys for pan and Escape to cancel measurement/dismiss a phone panel. Measurement reports unsnapped millimetres in a stable footer. Canvas backing pixels are bounded and scaled for sharp displays without changing source picking; a single scratch film is reused with clearing between layers to preserve independent clear polarity and bound memory.

Analysis shows counts, source extents, coverage, expandable per-layer statistics and grouped duplicate findings. Exported JSON retains individual diagnostic evidence and source SHA-256 hashes. Android export uses the native file saver; browser export uses a downloaded JSON file. All changes are read-only. Chrome follows the common [UI philosophy](UI-PHILOSOPHY.md); Gerber and PDF use system appearance unless the Android app sets an explicit theme. Canvas palettes remain independent.
