# Photo/AR review and testpoint summary

These tools share the PCB/schematic review workspace on Android and the web. Open the parts/BoM pane and choose **Photo & AR review** or **Testpoints & nets**.

## Photo and assisted AR

1. Load the PCB and its corresponding schematic sources. Choose the board file and front/back side.
2. Take/import a JPEG, PNG or WebP, or start the live camera. Camera access is optional and starts only from that action; photo import remains available if the browser blocks camera access.
3. Select four distinct component centers spread around the board perimeter, in perimeter order. For each, choose **Mark on image** and tap its visible center. Collinear, crossed or degenerate alignment is rejected.
4. Tap a component marker to select its saved footprint. Choose **Locate in layout** or **Match schematic**. Saved symbol paths take priority; reference fallback is labelled and multiple sheet/unit matches require a choice.
5. Save a calibration JSON for a still photo. Import requires the same image hash, board source hash, repository/revision scope, side and image dimensions.

The projective overlay assumes a flat board. This is assisted AR: there is no pretrained recognition of arbitrary components, ARCore pose tracking, depth reconstruction or motion compensation. Re-align after any camera/board movement. Component centers can overlap or be occluded; close candidates require explicit selection. Photo coordinates are not calibrated physical measurements.

Images stay in the local session and are not automatically uploaded or saved. The calibration export contains coordinates and hashes, not the image. Camera tracks stop on close, page exit or Android backgrounding. Android grants video capture only for the trusted foreground app shell, following the OS permission prompt; audio capture is denied. Web camera access also depends on browser and host-page policy.

Photo inputs are bounded to 16 MiB, 32 megapixels and 8192 pixels per axis; rendering scales to a maximum dimension of 1600 pixels. Schematic matching is bounded to 64 files, 8 MiB per file and 32 MiB total.

## Testpoints and nets

The searchable table lists each saved testpoint pad/pin separately: reference, pad/pin number, net, connectivity status, source file, position in millimetres, detection evidence, and locate/schematic actions. Search by reference, net or source file. Export CSV includes all matching rows and source UUID/net evidence; display is capped at 1000 rows until filters narrow the set.

Detection uses saved testpoint properties, TP-number references or testpoint library/value names. Inferred detections are labelled. Duplicate references in different files remain separate. Unconnected and unresolved pins remain visible rather than receiving a guessed nearby net.

PCB rows use saved pad net declarations and absolute positions, including footprint rotation. Schematic connectivity is per-file source evidence; cross-sheet hierarchy, hidden power pins and buses are not fully resolved. Such limitations are shown in the table.

## Verification and deployment scope

Geometry tests cover independent perspective references, inverse transforms, board-side mirroring, invalid alignments, ambiguous picks and calibration identity. Testpoint tests cover rotated multi-pad footprints, file-scoped duplicate references, schematic connectivity/no-connect/unresolved states, input limits and CSV escaping. Workspace integration checks cover named CSV export, locate, and saved-path schematic navigation with exact UUID/position focus. Browser fixture checks exercised photo alignment/picking/calibration and table filtering/locate, including a narrow table viewport.

Android debug assembly and lint passed. Real-device camera capture, OS permission denial/background lifecycle and alignment with a photographed physical board still require acceptance testing.

The earlier signed 1.50 Play candidate and prepared v0.12.38 release archives predate these additions. They do not contain this camera/AR/testpoint work. Rebuild and verify a new release candidate, update its permission/declaration evidence, and republish the updated hosted privacy page before uploading a candidate that includes this work.

Population review now supports separately retained high-resolution front/back photos, reviewed reference comparison, DNP mismatch review, conservative variant inference and controlled Discussion drafts. See [Population inspection](POPULATION-INSPECTION.md) for the reference requirements, local retention limits and validation status.

## Testpoint inspection filters

Testpoints is a direct drawing-toolbar action. Combine fielded search terms such as `ref:TP net:GND`, or quote names such as `net:"POWER GOOD"`. Connectivity, source and detection filters preserve the distinction between saved, unresolved and inferred evidence. Expand a row to locate other saved pads/pins on the same source-file net. Cross-file net names alone do not establish connectivity. CSV export includes all filtered matches even when the on-screen table is bounded.
