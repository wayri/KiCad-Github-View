# Pinned legacy VNA regression evidence

Source: https://github.com/Ttl/vna2/tree/2cf0efb22da56a168a7f07bf5e2c30631343997b/hw

`provenance.json` records complete upstream source SHA-256 values and URLs.
The schematic is retained byte-for-byte. The cache retains the root sheet's
referenced definitions. The board excerpt retains the header, layer list and
two modules, including hexadecimal timestamp `584E6390`, which previously
looked like an overflowing decimal exponent to the parser.

Saved-coordinate checks (millimetres):

- C272 pad 1: module origin (153.97, 117.65), rotation 270 degrees, local
  pad (-1, 0), resulting centre (153.97, 116.65).
- C5 pin 1: placement (3450, 1250) mil, saved matrix (0, 1, 1, 0), cache
  pin (0, 150) mil, resulting centre (91.44, 31.75).

A live read-only check of the complete pinned board yielded 522 modules,
35,127 render primitives and 7,029 pad primitives across layers. The root
schematic yielded 47 symbols, 86 pin primitives and 930 total primitives.
These are source-coordinate checks, not native KiCad pixel or netlist
qualification. Legacy library text, bitmaps, bus entries and unrecognized
constructs remain explicitly restricted; missing cache definitions are omitted
with diagnostics. No native source files are rewritten.
