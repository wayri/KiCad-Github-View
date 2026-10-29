# Pad numbers and copper net names

Status: current development source after 0.12.76; a new store release has not been published for this fix.

Enable **Net names** in the floating Layers controls, or **Pad numbers and net names (2D / 3D)** in View and page setup. The per-drawing preference is shared with **Pad and net names (close zoom)** in the 3D Display menu and is stored by the existing browser, Android or VS Code host adapter. Existing projects default to off.

At readable zoom, pad numbers take collision priority over trace and zone net labels. A long hierarchical net name is shortened in the middle when necessary; the complete pad number is retained. Unconnected pads can show their numbers. Optional pin names are included only when there is space. Full saved values remain available in Properties. Geometry and KiCad source files are unchanged.

The 2D overlay supports saved copper pads, straight traces and filled polygons, respects visible layers, isolation and object filters, and stops at 300 labels per frame. Its bounded scan considers up to 12,000 eligible visible primitives, with a bounded deferred trace/zone list. Unfilled polygons and arcs do not receive copper-name presentation labels.

3D uses the same number-first layout and adaptive 9–18 px text on the facing saved copper surface. It shows up to 150 close-zoom pad labels, drawn with depth testing: components and board geometry can occlude them. Hide Parts temporarily or change the camera when inspecting pads beneath a body. Labels are excluded from mechanical Draftsman captures, measurements and picking.

Verification: 1,939 JavaScript checks and 23 package/release checks passed. The actual Canvas2D and WebGL viewers were visually checked on a controlled fixture containing a long hierarchical net, GND and an unconnected pad. This is shared-renderer validation; it does not establish installed host acceptance for a future release.
