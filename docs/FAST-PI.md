# Experimental Fast PI

Fast PI is a browser-local, fixed-temperature 2.5D DC copper screening workflow.
Open **Simulation → Fast PI**, select a net, enter source voltage and load current,
review conductivity and copper stackup, then choose **Source + load pads**. Select
its saved pad/layer row; the load chooser opens next. You can still pick copper
in the PCB viewport. Inputs and contacts remain available after a failed solve.

The worker solves the saved filled copper, straight tracks, supported pads and
lumped plated via/through-hole barrel transitions. It never refills zones or
modifies the design. Supply layer center elevations and copper thicknesses in mm;
via plating thickness is required for barrel transitions. Copper
conductivity starts with a visible nominal copper preset of 58 MS/m; change it
in **Advanced** for your material and temperature. Complete saved physical
stackups are prefilled; incomplete stackups require explicit layer dimensions. Dielectric
separation contributes to barrel length via layer elevations, not DC lateral
conductivity. There is no invented stackup fallback.

The sidebar reports terminal voltage relative to the supplied ideal source,
voltage drop, current, resistance, total copper loss and peak mesh-edge current
density. Display a voltage-drop gradient or current magnitude, with signed current
arrows, on the existing PCB view. The overlay is sampled on large meshes. Isolate
the analyzed net through the canonical net mapping. Float the results panel when
needed. Cancel/clear terminates the worker; solves have a 30-second UI timeout.

Contact-resolution failures trigger at most two finer-mesh retries within the
existing work limits and 30-second timeout. The result reports the actual mesh
size and any refinement. Disconnected copper and invalid physical inputs still
fail; automatic refinement is not a convergence/accuracy study.

## Scope and evidence

This is experimental screening, not a replacement for Quick PI or SPIKE.
The source is an ideal voltage contact and the load is a point current sink.
Return-network impedance, AC effects, temperature feedback, device models and
physical qualification are outside this model. Copper islands disconnected from
the source retain unknown voltage. Unsupported arc tracks, custom pads and slotted
or offset drills are rejected. Cell-center meshing can miss narrow traces, gaps,
thermal spokes and pad spreading; inspect the geometry and repeat at finer mesh
resolutions before relying on a result, especially peak current density. A contact
is mapped to a nearby cell and displayed at the picked location.

Analytical tests cover rho*L/A resistance, via barrel resistance, voltage reference
offsets, disconnected copper, rotated pads, through-hole transitions, resolution
checks, Kirchhoff current balance and power conservation. These are software and
analytical checks, not measurement correlation on a manufactured board.

Saved wayriCAD spatial results and KiCad simulation workbooks/waveforms remain
separate import workflows. Fast PI does not run ngspice or pretend that workbook
settings alone contain solved samples. Hosts that prohibit dedicated workers show
an unavailable diagnostic rather than blocking the UI with a synchronous solve.
