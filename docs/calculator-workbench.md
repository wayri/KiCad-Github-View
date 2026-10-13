# Circuit workbench and compact viewer chrome

The shared viewer provides 17 engineering calculators, including RC filters,
series RLC resonance, 555 timing, ideal op-amps, buck and boost converters,
reactance and resistor thermal noise. Parameters support unit prefixes and
interactive sliders. Clickable circuit diagrams select their associated inputs.
Plots support probing; saved references show result changes, and JSON exports
retain input units, output units and model assumptions.

These are analytical calculators, not SPICE simulations. Converter calculations
use ideal continuous-conduction models and reject loads outside that model.
Op-amp results omit clipping and device bandwidth. Each new calculator links
its model references and explains its limitations in the viewer.

PDF, fabrication and BoM/assembly viewers share 52 px headers, 44 px icon targets
and a secondary-tools page. Primary document, drawing and assembly controls stay
visible. Existing controls retain their original handlers when moved into pages.
Settings, library/account menus, drawing tools and assembly management open as
full-screen sections with a Back button. Back restores the previous section;
underlying content is inert while a section is open. Confirmation dialogs keep
their existing modal behavior. Viewer fields and loaded drawings stay in memory.

On phones, the Sidebar button reveals Explorer, Properties and Comments side
controls in schematic and layout views. Showing opens Explorer; hiding closes
all open sidebar panels through their existing controls. The visibility choice
is stored locally and shared between drawing frames. Desktop pane behaviour is
unchanged. The phone drawing toolbar scrolls horizontally when its actions do
not fit on a single row.

Verification: 1,173 JavaScript checks passed. Browser checks loaded a real PDF,
retained Gerber fixtures and a BoM Studio fixture at phone width, and verified
assembly and measurement menu actions. Calculator checks cover numerical
references, invalid inputs, bounded plot data and all catalog defaults.

These changes are local previews after v0.12.42 / Android 1.54. They have not
been installed on the phone or published as a new release. iOS source is local.
