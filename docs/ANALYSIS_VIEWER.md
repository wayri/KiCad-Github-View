# Saved analysis and simulation results

In Pocket KiVi, open **Project → Analysis & simulation**, then choose a saved report. Reports imported with a project are retained in its offline copy. Standalone supported report files can also open directly. In the browser extension, choose **Analysis** in the project viewer. Results are read-only: this feature does not run KiCad, ngspice or WayriCAD solvers.

The viewer has Graphs, Data, Report and Source views. Select traces and linear/logarithmic axes for waveforms; point at a graph to read values. Thermal maps retain missing cells as gaps. Mechanical meshes can be rotated by dragging. Search Report for source hashes, assumptions, warnings, coverage and findings. Large property lists and tables load in batches.

## Verified formats

| Saved output | Presentation |
| --- | --- |
| Quick PI mesh/result JSON bundle | Nodal-potential, cell-power and current-density-magnitude fields, separated by saved copper layer when available. Triangle potential colours use the mean of saved node values; unknown values remain gaps. |
| Quick PI transient | Saved source and load voltage/current waveforms against `times_s`; repeated event timestamps retained. |
| QuickTherm full JSON | Physical thin-sheet board-temperature field and separately labelled illustrative junction interpolation, component tables and transient temperatures/power. |
| Quick SI | Illustrative eye traces, saved step response, separate reference-covered impedance and ideal-plane screening curves and report metadata. |
| Trace RLC and planar magnetics | Saved frequency sweeps, impedance/current results, and exported CSV dynamics. |
| Mechanical Check | Saved triangle-mesh scene, finding tables, measured limits and coverage. Scene coordinates are retained; they are not assumed to be PCB coordinates. |
| Other WayriCAD tools | Generic saved JSON fields/record tables and CSV/TSV tables, including manufacturing checks, heater summaries and BOM-style exports. A specialised plot requires saved numerical data; the viewer does not invent missing fields or grids. |
| KiCad `.wbk` | JSON workbooks (versions 6–8 and retained unknown fields), plus legacy line-oriented versions 1–5: commands, signals, cursors and display settings. No fabricated waveforms. |
| KiCad plot CSV / TSV | Numeric columns plotted against the first numeric column. Semicolon export and trailing empty column supported; saved display names retained. |
| ngspice ASCII `.raw` | Real and complex samples; complex traces displayed as real/imaginary components. Binary RAW is explicitly unsupported; export ASCII RAW or KiCad CSV. |
| HTML / text reports | Inert report text and HTML tables. Scripts, external assets and interactive embedded HTML plots are not executed; open the companion JSON/CSV for plots. |

KiCad workbooks contain simulation setup, not the waveform samples needed to recreate plots. Export simulated plot data as CSV in KiCad and include it with the project. Changing the workbook here does not rerun a simulation.

The saved-result viewer bounds each source at 64 MiB, tabular data at 200,000 rows / four million cells, and SPICE data at four million values. Eye plots display all saved contexts up to 512 traces. Source preview is limited to 512,000 characters; report-property inspection is limited to 4,000 fields. Native import/download and repository discovery retain their separate project budgets. Unsupported schemas remain searchable as saved JSON rather than being treated as new analysis results.

VS Code's existing webview CSP prohibits nested frames; its project view currently explains that graphical analysis is available in Pocket KiVi or the browser extension. No CSP permissions were expanded for this feature.

## Format evidence

Adapters were checked against WayriCAD develop commit `1b0590d016266a3c98264a1dda0a2f02abc2a5ac`, including the public QuickTherm example. Synthetic tests reproduce the documented PI, SI, mechanical and transient contracts; they do not establish numerical solver accuracy.

- [WayriCAD source and tool documentation](https://github.com/wayri/WayriCAD/tree/1b0590d016266a3c98264a1dda0a2f02abc2a5ac)
- [QuickTherm saved example](https://github.com/wayri/WayriCAD/blob/1b0590d016266a3c98264a1dda0a2f02abc2a5ac/quick_therm_plugin/examples/thermal-demo-report.json)
- [KiCad workbook documentation](https://docs.kicad.org/9.0/en/eeschema/eeschema.html#saving-simulation-setups)
- [KiCad 10 workbook serializer](https://github.com/KiCad/kicad-source-mirror/blob/10.0/eeschema/sim/simulator_frame_ui.cpp)
- [KiCad legacy workbook loader](https://docs.kicad.org/doxygen/legacy__workbook_8cpp_source.html)
- [ngspice raw-file reader/writer](https://github.com/ngspice/ngspice/blob/master/src/frontend/rawfile.c)
