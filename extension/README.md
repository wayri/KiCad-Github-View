# KiCad Visual Review browser extension

Version 0.8.1 renders public GitHub `.kicad_sch` and `.kicad_pcb` files directly **inside github.com**. It uses our own S-expression parser, schematic geometry builder, PCB geometry builder, Canvas2D renderer, camera and picking code. KiCanvas is not loaded or included in the upload package. SPIKE supplies the owner-authorized, browser-side 3D adapter. No rendering service, companion process or installed KiCad is required at runtime.

File previews replace the source pane; **Show source** restores it. Pull-request **Files changed** cards retain GitHub’s header and conversation while displaying base/head drawings. Dynamic GitHub navigation and late/replaced file cards are supported. Public forks use the base repository’s PR context while retrieving the fork’s design revision.

## Viewer interaction

Dedicated schematic and PCB entry points share a review workspace. Click a symbol, footprint, pad, track or drawing feature to inspect saved properties; search the parts list or use the context menu to focus it and add an annotation. Schematics navigate loaded subsheets through the sheet selector or sheet context menu. PCB controls include layer visibility, front/back flip, grid and dark mode. The initial board view shows front/back copper and silkscreen plus Edge.Cuts; other layers can be enabled explicitly.

Wheel zoom anchors to the pointer. Right/middle drag pans; `+` / `-` zoom, `F` fits the drawing or board, `Home` fits the full sheet, `D` switches the theme and `M` measures two points in millimetres. The page view displays the paper boundary, the standard KiCad drawing sheet, coordinate zones and saved title metadata. Matching PR sheets have linked camera controls; **Changes** compares saved objects and before/after properties.

Import JSON assembly metadata or CSV BOM variants to inspect effective values, custom properties and fitted/DNP state. DNP markers and changed-value overlays leave source geometry unchanged; SPIKE hides procedural component bodies for DNP parts while retaining copper. See [variant formats](../docs/variants.md).

Annotations support Info, Minor, Major and Critical severities; tags; Open, Resolved and Won't fix states; and object/position/revision/variant anchors. In extension settings, connect or create `.kicad-review.json` in your local Git checkout. Connected files become the annotation store; stage and commit the file normally. Without a connected file, notes remain in device storage. Existing device notes can be exported and imported explicitly.

Enter your GitHub token in extension settings, then choose a destination and click **Publish to GitHub** on a saved note. Issues use REST; Discussions use GraphQL and a chosen category. Successful posts save the remote thread link in the annotation. Tokens remain in browser session storage, never in the Git file. Composer-based sharing remains available. Public issue/PR annotation readback is supported; Discussion readback is not implemented. See [comment behavior](docs/comments.md).

## Nets and properties

The explorer has separate Parts, Nets and Layers tabs, custom SVG icons and responsive drawers. The inspector groups identity, electrical, geometry and assembly properties. Selecting a PCB net highlights its saved pads, copper routes, vias and filled zones; its saved numeric code is the identity, even when another net has the same display name. Connections and routed length are derived from source records. Hidden layers remain hidden. Component inspection links to its connected nets.

Schematic net selection follows exact wire endpoints, T connections, explicit junctions, local/global labels and conductive pin endpoints. Ordinary wire crossings do not connect unless a junction is saved. Explicit power symbols name and join networks within the active sheet using version-specific KiCad semantics. Cross-sheet connectivity, implicit power pins and buses are not fully resolved. This is source inspection, not an ERC/netlist replacement. Nets and Layers are disabled in SPIKE 3D; its own front/back copper controls remain available.

The default drawing sheet now uses native template coordinates for borders, page zones and the title block. Specialized pin styles, global/hierarchical label outlines, overbars and text dimensions have native SVG fixture checks. Browser glyphs remain an approximation. Repeated hierarchy instances remain file-based.

## Development installation

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select this repository’s `extension` directory.
3. Open a public GitHub KiCad file or a PR containing one. The drawing appears inline. The toolbar icon / `Alt+Shift+K` focuses it.

`python scripts/package_extension.py` builds the browser-store ZIP. It is not published in Chrome Web Store or Edge Add-ons. The separate GitHub App supplies PR checks and hosted viewer links; GitHub App installation alone cannot register a replacement file renderer on github.com. Inline previews require this extension installed in each viewer’s browser. GitLab is not implemented yet.

## Current fidelity and verification limits

The new owned renderer is a baseline, not demonstrated superiority or pixel equivalence with KiCad. It uses browser text rather than KiCad’s stroke font; custom `.kicad_wks` layouts, some advanced label typography, bitmap images, rule areas and dimensions remain incomplete and are reported by the builders. Source variants with native per-instance overrides are detected but need explicit assembly/BOM overlays. Repeated hierarchy instances are navigated by file and do not yet provide full instance-specific annotation.

SPIKE 3D loads repository-relative WRL/VRML and self-contained GLB geometry, with source footprint placement and model transforms. Unavailable models retain visible procedural proxies. STEP requires a future browser CAD loader and is explicitly unsupported; global installed KiCad libraries are not repository assets. GLB coordinates currently use millimetres. Retrieval currently supports public repositories only, with GitHub API limits, at most 32 sheets, 8 MiB/file and 24 MiB/project. This is a read-only review tool, not a KiCad circuit/board editor.

Run `node --test extension/tests/*.test.cjs` and `node --test tests/spike_component_state.test.mjs`. Native KiCad SVG fixture exports check symbol/pin/wire and front/back pad coordinates. Local browser fixtures exercise actual renderers with mocked GitHub transport and Chrome runtime; a real installed-extension smoke test on github.com and store review remain outstanding.

## Blocked embedded page after an update

Version 0.8.1 explicitly exposes the inline shell and its schematic/PCB viewer pages to GitHub. Reload this unpacked extension from chrome://extensions, then refresh the GitHub tab. A manifest change does not take effect until the extension is reloaded. Credential settings and worker modules remain private. If Chrome still reports a blocked page, record the GitHub page URL and the blocked frame URL/error from DevTools; the local mock harness does not test Chrome extension navigation enforcement.

## Review controls (0.9.0)

Setup provides independent light/dark UI and drawing themes, mm/mil rulers, and standard/custom page sizes with portrait orientation and nine title-block comments. Page changes are review-only and resettable; they do not edit the KiCad source or implement custom `.kicad_wks` templates.

New note, Point and Area tools create object, coordinate or rectangular annotations. Area captures save a bounded PNG in the review sidecar; preview and download it in the Review panel. Severity, tags, state and search filters support review triage. Capture includes the drawing canvas, not surrounding UI or 3D. Download the PNG and attach it in the GitHub composer manually: direct issue/discussion API publication sends annotation metadata, not image attachments.

**GitHub sign-in and review file** opens options. Configure a registered OAuth App client ID with Device Flow enabled, then sign in using GitHub's verification code page. No hosting service or client secret is required for this flow. Registration is still required; no production client ID is bundled. See [authentication setup](docs/auth.md). Tokens stay in session storage. Live sign-in/publication has not been tested in this build.

Layer navigation (0.9.1): in Explorer -> Layers, search by saved layer name, focus one layer, choose dim/isolate, and fit its drawable geometry. All/None/Front/Back/Copper presets are reversible with Restore view; the first visibility state is retained across consecutive presets and focus operations. Clear focus keeps current visibility, while Restore view restores it. The board outline and drill holes remain context in isolate mode; inactive layers cannot be picked. [ and ] cycle focus, Shift+F fits it, and Escape restores visibility. These controls apply to 2D PCB review; schematic net focus and SPIKE 3D retain their existing controls. Layer preferences are session-only.

Ruler update (0.9.2): press M, click a start point, move the cursor for a live distance/angle/X/Y overlay, and click again to pin it. Choose geometry/grid/off snapping and grid spacing in millimetres. Geometry snapping uses only visible saved geometry, respects layer isolation, and prefers pad/pin centers and endpoints within eight screen pixels. Alt bypasses snap; Shift constrains horizontal/vertical. New measurement resets the ruler; Escape exits. Drawing measurements use the configured mm/mil display units and work in flipped 2D views. Board extents reports the axis-aligned bounding dimensions of all saved Edge.Cuts shapes, including detached panels and arcs, excluding stroke width; it does not validate a closed manufacturable outline. No board or schematic source is modified. Ruler snap/grid options are session-only; 3D measurement remains unavailable.

Version 0.9.5 adds global project search, multiple component/net/net-class highlights, connection navigation and saved ERC/DRC report markers. See [search and highlight controls](docs/search-and-highlights.md).

Version 0.9.6 adds double-click/Enter subsheet navigation, Alt+Up parent navigation, E property inspection, H net highlighting, / search focus, C comments, Space recentering and a keyboard guide. Design files remain read-only; routing and schematic editing are unavailable.

Version 0.10.0 adds a read-only project workspace, settings/constraint inspection, PCB stackup, file navigation and our browser Gerber/drill viewer. See [project and fabrication workspace](docs/project-workspace.md).

Version 0.11.0 adds BOM / Stats, variant-aware DNP highlighting, source-bound board and zone analytics, bounded regex/wildcard global search, isolated HTML previews, and the Git revisions commit/branch comparison picker. See [BOM and analytics](docs/bom-analytics.md), [HTML previews](docs/html-preview.md), [version handling](docs/version-compatibility.md) and [revision comparisons](docs/git-revisions.md).

Version 0.11.1 refines project setup into grouped read-only forms, typed values and net-class/stackup tables. Releases now include verified download packages and tag-driven GitHub publication; see [releasing](../docs/RELEASING.md).

Version 0.11.2 opens PCB drawings from the project tree, provides saved layer details when physical stackup is absent, and simplifies project/schematic hierarchy navigation.
