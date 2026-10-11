# Saved KiCad versions

The browser renderer reads saved S-expression geometry without rewriting files or requiring an installed KiCad version. Recognized KiCad 8, 9 and 10 constructs share the same parser and geometry pipeline. Tests exercise 8.0/9.0/10.0 generator headers and coordinates; native-reference fixtures were exported with KiCad 10. This does not establish full fidelity for every KiCad 9 feature.

Generator versions greater than 10 are accepted as **forward-compatibility previews**, with a visible warning. Unknown top-level constructs are listed as omitted. The saved format version and generator version remain available in renderer metadata. A format date alone does not identify the KiCad major release. Synthetic future-header tests verify disclosure and continued recognized-geometry rendering; they are not real KiCad 11 fixtures or proof of KiCad 11 feature compatibility. Nested new features still require additional targeted fixtures and renderer implementation.

KiCad documents its date/version fields and shared S-expression structure in its [format documentation](https://dev-docs.kicad.org/en/file-formats/sexpr-intro/). Future support must be checked against actual saved files and native exports as those formats evolve. Missing or unknown fields are never converted into guessed geometry.


KiCad 8 viewing retains recognized symbol/footprint geometry, field visibility, legacy `tstamp` object identities, sheet navigation, selection, comparison, comments, saved copper and repository-linked models. No project is rewritten or automatically upgraded. Support is bounded by the same renderer limits as newer versions.

The compact **KiCad 8 · Features** button lists retained capabilities and blocked ones. Accessing a feature introduced in KiCad 9 (embedded assets, component-class rules, schematic net-class rule areas or native schematic tables) opens an upgrade recommendation for a KiCad 8 file. These features also remain unimplemented in the viewer for newer files; the popup says that upgrading alone will not enable them. Unknown generator versions are reported as unknown rather than guessed from the format date. Saved report and simulation viewing is not blocked merely because a drawing is old.

Evidence: synthetic KiCad 8 headers, rotation/field-visibility checks, and unmodified custom-field schematic/PCB fixtures from the official KiCad 8.0.0 QA corpus. Those corpus files were originally saved in older formats and do not identify their generator major. They test backward-compatible constructs, not full native KiCad 8 certification. Native pixel acceptance with an installed KiCad 8 remains pending. Fixture URLs and SHA-256 checksums are retained alongside the files.

Feature introduction evidence: [KiCad 9 release notes](https://www.kicad.org/blog/2025/02/Version-9.0.0-Released/).
