# Saved KiCad versions

The browser renderer reads saved S-expression geometry without rewriting files or requiring an installed KiCad version. Recognized KiCad 9 and 10 constructs share the same parser and geometry pipeline. Tests exercise 9.0/10.0 generator headers and coordinates; native-reference fixtures were exported with KiCad 10. This does not establish full fidelity for every KiCad 9 feature.

Generator versions greater than 10 are accepted as **forward-compatibility previews**, with a visible warning. Unknown top-level constructs are listed as omitted. The saved format version and generator version remain available in renderer metadata. A format date alone does not identify the KiCad major release. Synthetic future-header tests verify disclosure and continued recognized-geometry rendering; they are not real KiCad 11 fixtures or proof of KiCad 11 feature compatibility. Nested new features still require additional targeted fixtures and renderer implementation.

KiCad documents its date/version fields and shared S-expression structure in its [format documentation](https://dev-docs.kicad.org/en/file-formats/sexpr-intro/). Future support must be checked against actual saved files and native exports as those formats evolve. Missing or unknown fields are never converted into guessed geometry.
