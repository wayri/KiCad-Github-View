# Project search and highlights (0.9.5)

Open Explorer → Search. Search starts with loaded drawings; **Index entire project** discovers schematic and PCB files from the repository or workspace. GitHub discovery reads an immutable commit snapshot. The current viewer must have identical bytes to any already loaded source; reload if it changed. Results show their drawing path and object type. Same-kind results navigate within the viewer; the other drawing type opens a separate viewer, currently at its full drawing rather than the exact search result.

Combine literal field queries, quoted phrases, AND, OR and NOT, for example:

- `ref:R1 OR ref:R2`
- `type:footprint value:"10 k" -dnp:yes`
- `net:SENSE`, `type:net`, `type:netclass`, `netclass:Power`
- `manufacturer:Acme sheet:power`

Property names are searchable. Ordinary terms remain literal. Explicit patterns work in the same field/boolean queries:

- `ref:glob:R*` selects references starting with R; `?` matches one character and `*` any sequence. Globs match the whole field, so use `value:glob:*10k*` for contains.
- `ref:regex:^R[0-9]+$` selects resistor references containing only R and digits.
- `net:regex:"^USB_.*" OR net:glob:SPI_*` combines patterns without regex alternation.
- `regex:060[34]` and `glob:*SENSE*` search any indexed field.

Matching ignores case and uses Unicode NFKC normalization. The regex subset supports literal characters, `.`, character classes/ranges and negated classes, `\\d`, `\\w`, `\\s` and uppercase inverses, `^`/`$` anchors, and single-atom `*`, `+`, `?`. Escape literal punctuation with a backslash; quoted query values require doubled backslashes. Groups, alternation, lookarounds, backreferences, counted repetitions, lazy quantifiers and flags are rejected. Use query OR for alternatives. Parenthesized boolean queries remain unsupported.

Patterns run through a finite-state matcher, never the browser's backtracking RegExp engine. Patterns are limited to 128 characters and 64 atoms, and a search has a five-million-step pattern budget. Literal terms run first to narrow candidates. Malformed patterns or exhausted budgets show an actionable error and return no partial matches. Complex Unicode normalization can expand characters; use literal search for such values.

Enable **Multihighlight** to toggle multiple result rows, components, nets and net classes. Disable it to replace the highlight with each selection. **Highlight matches in this drawing** adds active-drawing matches when enabled, or selects the first active-drawing match when disabled. Different sheets remain separate identities. Choose Dim context, Bright only or Isolate, then Fit highlights. Previous/Next connection visits saved pad and pin locations. Clear or Escape removes highlights. These tools apply to 2D; SPIKE 3D retains its existing part inspection.

One discovered `.kicad_pro` applies net classes automatically; when several exist, import the desired settings file. Explorer → Nets also has a class selector and Highlight class button. Selected classes compose; removing one keeps shared nets selected by another. Saved explicit assignments and case-sensitive whole-name `*`/`?` wildcard patterns are supported. Native regex matching, buses, rule areas, derived assignments and cross-sheet schematic netlist resolution are not implemented; warnings remain visible.

Discovery is bounded to 32 drawings, 8 MiB per source and 24 MiB of source reads. Up to eight project settings files of 1 MiB each are retrieved separately. The index is bounded to 50,000 objects and 16 Mi characters; results list the first 200 matches. Highlights are limited to 200 nets and 200 objects, with at most 64 selected classes. Truncation and omitted sources are disclosed. Multiple unrelated projects in one repository may need separate review sessions.

Explorer → ERC / DRC imports saved KiCad JSON reports or reads a repository-relative JSON path. See [rule reports](rule-reports.md) for schema, association and provenance limits. Findings offer clickable location markers, arrows, severity filtering and previous/next finding and affected-item navigation. Reports are review evidence; the browser does not execute KiCad checks or verify that an imported report matches the current revision.


## Read-only navigation shortcuts (0.9.6)

Double-click a sheet symbol to enter its loaded subsheet, or select it and press Enter. Alt+Up returns to its unique loaded parent. If several parent files reference the same sheet, choose the parent in Explorer → Sheets. Missing subsheets show a diagnostic. Double-click navigation is disabled while measuring or placing an area/point comment.

E opens the property inspector for the object under the pointer, falling back to the selected object or net. H highlights a saved net under the pointer; a selected part with several connections opens its filtered net list. `/` opens and focuses global search. C opens a review comment for the pointed/selected object, or the pointed position. Space, while the canvas is focused, centers the pointed location. `?` toggles the visible keyboard guide. Existing F/Home/+/−/D/M/Escape shortcuts remain available.

Shortcuts ignore text inputs, select controls, editable content, modifier combinations and repeated keys. Alt+Up is the explicit navigation exception. Source files and geometry remain read-only: no routing, footprint movement, schematic editing or property changes. Comments, variants and page/view overrides remain review metadata. The property inspector displays saved settings; E does not open an editor.
