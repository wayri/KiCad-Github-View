These small fixtures contain manually chosen values, not solver output. They
exercise saved-result parsing, repeated timestamps, typed complex components,
and distinct hierarchical net names. They are safe to retain and distribute.

Format references checked 2026-10-28:

- KiCad 10 simulator documentation:
  https://docs.kicad.org/10.0/en/eeschema/eeschema.html#saving_simulation_setups
  and its following export section. Workbooks save settings, not samples;
  numerical exports use semicolons and named signals (including run suffixes).
- ngspice raw writer:
  https://github.com/ngspice/ngspice/blob/master/src/frontend/rawfile.c
  The parser supports one padded ASCII real/complex plot with a real sweep
  axis. Binary, unpadded, variable-specific dimensions and concatenated plots
  fail explicitly. Commands and options remain inert metadata.

Signal matching requires an exact qualified name from the drawing connectivity
model. File basenames, case-insensitive names and hierarchy stripping do not
establish identity. Raw/CSV results do not prove that the simulation model
matches the currently displayed design revision.
