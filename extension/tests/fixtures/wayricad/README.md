# WayriCAD producer compatibility fixtures

These JSONs were generated on 2026-10-11 by the actual local WayriCAD Python
producers with their bounded analytical test inputs. They are saved numerical
outputs, not hand-written approximations of the result schemas. Inputs are
synthetic; these fixtures do not establish measured or production-board accuracy.

`provenance.json` records both source checkout HEAD revisions, current producer
module hashes (the checkouts contain local changes), and fixture hashes.

| Fixture | Producer / input |
| --- | --- |
| quickpi-dc | `quick_pi_plugin.tests.test_report.bundle`, analytical strip |
| quickpi-transient | `quick_pi_plugin.transient.solve_transient`, short test rail |
| quickpi-electrothermal-transient | `electrothermal_transient.solve_electrothermal_transient`, rail + conductor RC node |
| quicktherm-steady | `quick_therm.analyze_manual_board`, explicit 0.5 W and 40 K/W component |
| quicktherm-transient | `transient.solve_transient`, independent thermal RC node |
| quicksi-screen | `quick_si.screen`, complete matched 50-ohm routed-path evidence |
| quicksi-eye | `eye_model.simulate_eye`, matched-source open-load illustrative eye |
| quicktherm-board-network | newer `thermal_network.solve_thermal_network`, bounded 4-cell-axis board |
| quicktherm-coupled-air | newer `thermal_transient.solve_coupled_transient`, four serial board RC models |
| quicktherm-spatial-transient | newer `thermal_spatial_transient.evolve`, one-node RC without spatial coordinates |
| quicktherm-multilayer-transient | newer `thermal_multilayer.solve_multilayer_thermal`, two-layer saved field and three transient frames |

QuickTherm and QuickPI primary native UIs already export HTML plus JSON numerical
sidecars. QuickSI's primary `quick_ui.export_report` exports HTML only; its CLI can
export full JSON. A full JSON sidecar for that UI and validated reopening in the
three source applications remain integration opportunities.

The spatial transient's `spatial_index.cells` contains `[xIndex, yIndex]` per
active cell; board nodes are flattened by `layerIndex * active_cells_per_layer +
cellIndex`. Additional sink nodes can follow them. Missing coordinates in the
evolve-only fixture must not be invented.
