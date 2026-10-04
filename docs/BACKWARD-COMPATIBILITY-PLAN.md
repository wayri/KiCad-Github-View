# KiCad 4 onward compatibility plan

Status: proposed, pending confirmation that “GitHub 4” means **KiCad 4** rather than GitHub Enterprise versions. This document describes future work, not verified compatibility.

## Scope and current evidence

Keep rendering browser-only, use the project's own engine, and preserve read-only source files. Share format support across GitHub, GitLab, browser packages and VS Code through the common viewer modules.

The current schematic renderer requires a `kicad_sch` root. The PCB renderer handles `footprint`, but not historical `module` records. Current compatibility tests cover KiCad 9/10 headers and selected features; these do not establish complete compatibility with earlier releases. KiCad 11 remains a forward preview until real files and native references validate specific features.

KiCad 4–5 use legacy `.sch` schematics and `.lib` symbol libraries. Repository cache libraries matter for faithfully resolving old symbols. See [legacy format documentation](https://dev-docs.kicad.org/en/file-formats/legacy-4-to-6/index.html) and [opening legacy schematics](https://docs.kicad.org/master/en/eeschema/eeschema.html#opening-legacy-schematics). Historical PCB documentation is explicitly marked outdated; use real saved files and upstream readers to settle ambiguous behavior.

## Milestones

### 1. Establish reference projects and format detection

- Collect redistribution-permitted real projects saved by KiCad 4, 5, 6, 7, 8, 9 and 10, with native schematic/PCB reference exports.
- Include hierarchical and reused sheets, multi-unit symbols, rotated/mirrored components, old arcs, filled zones, custom worksheets and repository-linked 3D assets.
- Detect content headers and format dates rather than guessing from filenames or generator strings. Other tools also use `.sch`.
- Maintain a per-feature support matrix with tested, partial, unsupported and missing-dependency states.

Acceptance: fixtures have version/provenance records; unsupported or ambiguous content produces an actionable diagnostic.

### 2. Add historical PCB adapters

- Normalize `module`/`footprint`, legacy reference/value text, `page`/`paper`, timestamp identities, layer records, arc encodings, saved zone fills and model transforms into the shared scene model.
- Retain original source identities and source locations for selection, properties, comments and diffs. Never write converted data back to the repository.
- Keep unavailable physical stackup information explicit rather than manufacturing defaults.

Acceptance: reference geometry, layer placement, pad/net selection, page frame and object properties agree with the historical fixtures.

### 3. Add legacy schematic and symbol readers

- Parse `.sch`, `.lib`, cache libraries and legacy `.pro` settings without native conversion.
- Resolve repository libraries and relative subsheet paths at the selected revision, respecting private repository access and nested directories.
- Preserve symbol units, alternate bodies, transforms, fields, pins, labels, buses, junctions, sheet instances and title blocks.
- Show missing library dependencies explicitly; do not substitute unrelated modern symbols.

Acceptance: old schematics render with their saved symbols and page layout; root/up/back/forward navigation works, including reused sheets.

### 4. Integrate all viewer entry points and review features

- Extend host file detection, project trees, split/pop-out views and VS Code selectors to legacy formats.
- Connect normalized data to search, properties, BOM, multi-highlighting, measurement, model loading and annotation publication.
- Reconstruct connectivity with hierarchical scope. Distinguish confirmed cross-probing matches from ambiguous reference-only candidates.
- Preserve instance-specific comment anchors using legacy timestamps plus sheet paths; report unresolved anchors instead of silently moving them.
- Support visual comparisons between old and modern revisions without claiming identity continuity when a native upgrade changed identifiers.

Acceptance: the same legacy project opens through each supported host, and comments/search/highlights select the intended object or sheet instance.

### 5. Validate and release support incrementally

- Compare rendering against native exports, with geometry tolerances and explicit font/rendering differences.
- Exercise real browser loading, private access, unavailable libraries, malformed files and large projects as well as unit tests.
- Run modern-format regression checks and package checks before each compatibility release.
- Publish support for validated format families separately: historical PCB support, legacy schematic support, then complete project/review integration. Update installation guides, screenshots and the feature/version matrix with limitations.

Acceptance: release claims link to fixture evidence and list remaining omissions. KiCad 11 support is promoted only after actual version-specific validation.

## Boundaries

Pre-KiCad-4 `.brd` boards are a separate optional milestone. Viewing imported ERC/DRC reports does not mean this extension runs historical KiCad rule-checking engines. Missing external libraries or 3D models require an explicit asset source; successful parsing cannot recreate absent assets.

If the request instead concerns GitHub Enterprise, replace this format plan with a host-version matrix covering URL routing, REST/GraphQL availability, authentication, Issues/Discussions capabilities and exact-host credential isolation.
