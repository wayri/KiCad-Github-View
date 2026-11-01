# Full-net 3D inspection

Choose a net in a schematic, PCB or the 3D net selection mode. The 3D viewer shows saved copper on every supported copper layer, including layers hidden by ordinary display filters. Open **Display → Full net 3D** to switch this inspection mode off. It is enabled by default. Its translucent grey context takes precedence over the ordinary dim-context setting while a net is selected. It never changes the saved design, camera or layer visibility preferences.

Tracks and arcs, pad copper, filled-zone polygons, via barrels and plated through-hole pad transitions retain their saved net identity and XY coordinates. Filled polygons are translucent so they do not hide routing on other selected layers. Unfilled zones appear only as boundaries. Missing routes, missing fills and airwire connectivity are not synthesized.

Complete saved stackups determine copper center elevations, including unequal dielectric thicknesses. Otherwise layer depths and missing foil thicknesses are estimates identified in Display notes. Drill-bore wall surfaces retain native drill dimensions and explicit via endpoint spans; plating thickness is unknown and is not invented. Unsupported/ambiguous via spans are omitted instead of being stretched through the whole board. NPTH pads never receive a plated barrel. Unknown pad native types cannot establish plating. Unused-layer annulus trimming is not independently evaluated.

The overlay has a 200,000 selected-primitive intake limit, 512 unique shape/fill batches and at most 64 copper layers. Source zone polygon/point limits also apply. Omissions and estimated geometry are disclosed; a limited view is not evidence of complete fabrication copper. The separate 2,000 bounding-box limit does not truncate net copper. Clearing or changing selection restores original scene materials and releases owned GPU buffers.

The feature uses the same generated shared renderer in browser extensions, VS Code, the standalone viewer and Android. Synthetic fixture: `extension/tests/fixtures/net3d/inspection.kicad_pcb`. Tests cover asymmetric depths, blind/buried/microvias, plated pads versus NPTH, exact net identity, internal fills, geometry budgets, disposal and reversible translucency.


## Edge clarity

In **Display → Quality**, **Sharp · edges** uses the normal display pixel budget and postprocess edge antialiasing without ambient occlusion. **High · AO** retains the more expensive ambient-occlusion pipeline and its smaller framebuffer budget; it can appear softer on a large screen. Balanced uses native framebuffer antialiasing where the graphics driver supplies it. Rendering diagnostics distinguish the active antialiasing method from the default framebuffer's antialias flag.

Independent 3D probes request native antialiasing and support up to 2× device pixel ratio, while retaining their 500,000-pixel and 1024-pixel-dimension limits. STEP conversion uses a 0.02 mm absolute linear deflection and 0.2 radian angular deflection, with the existing 500,000-vertex/triangle limits and interruptible worker timeout. Original model normals and saved geometry are retained. Coarse source meshes cannot gain missing geometry through antialiasing alone. These renderer refinements are included in 0.12.78; device compatibility limits are recorded below.


### Copper geometry refinement

Tracks retain their saved width with round end caps instead of oversized rectangular ends. Cap detail is bucketed by width with a 0.0025 mm target chord error and a 128-segment cap; limits are reported. Pads and drill contours use bounded analytic refinement. Native saved arcs are refined only when matched unambiguously, with a 200,000-segment budget. Already polygonized outlines and imported triangle meshes retain their source detail.

Ordinary saved copper fills are opaque; selected-net inspection retains translucent fills for visibility through layers. Outer copper and substrate elevations use the saved stackup without counting the outer foil thickness twice. A 0.001 mm display separation limits coincident-surface artifacts; component placement still uses the native board surfaces.

Development checks use the retained public Olimex ESP32-PoE board (143 parts, 2,528 track segments). Before/after browser captures confirm removal of square track-end overhangs and translucent-fill artifacts. This local saved-file check does not establish installed-extension or Android GPU compatibility. An enhanced-rendering fallback occurred once during view changes; the repeat run retained FXAA. Safe Balanced fallback and diagnostic logging remain enabled. No frame-rate improvement has been measured.
