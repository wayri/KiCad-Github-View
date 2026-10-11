# Pocket KiView offline calculators

`extension/calculator-viewer.html` is a standalone mobile page. It requires no repository, network or native calculator executable. `calculator-tools.js` contains pure scalar equations; the page validates inputs, clears outdated results after errors, displays units, and provides System / KiCad light / KiCad dark themes. Nothing is written into board or schematic files.

## Supported tools

| Tool | Equation and assumptions |
| --- | --- |
| Ohm's law / DC resistor power | `I = V/R`, `V = IR`, `P = VI`. Solve from positive resistance and nonnegative voltage or current. |
| Loaded divider | `Rb′ = Rbottom || Rload`; `Vout = Vin Rb′/(Rtop + Rb′)`. Optional load to ground; ideal input source. Also reports input current and resistor dissipation. |
| Adjustable regulator | `Vout = Vref (1 + R2/R1) + Iadj R2`; R1 from output to adjust, R2 adjust to ground. Set adjust current to zero for the standard feedback model. Datasheet dropout, tolerance and minimum load are separate checks. |
| LED resistor | `R = (Vs − Vf)/I`, resistor loss `(Vs − Vf) I`. Fixed LED forward voltage; no nonlinear diode solver or rating selection. |
| Copper track width | Legacy IPC-2221: `I = k ΔT^0.44 A^0.725`, area in mil², `k = 0.048` outer / `0.024` inner. Also `R = ρ L/(w t)`, drop and loss, with copper `ρ = 1.72e-8 Ω·m`. Thickness in µm; length and result width in mm. |
| Plated via DC resistance | `A = π (d + t) t`, `R = ρ L/A`. Finished hole diameter is the barrel's inner diameter; plating thickness is radial. Also voltage drop and power. Does not predict via ampacity. |
| Resistor colors | Four or five bands: significant digits × multiplier and tolerance. Gray spelling; gold/silver multipliers supported. No sixth-band temperature coefficient. |
| Wavelength / period | `v = c/√εr`, `λ = v/f`, `T = 1/f`, exact SI `c = 299792458 m/s`. Lossless homogeneous medium, relative permeability 1; not a transmission-line geometry solver. |
| Length conversion | Exact `1 inch = 25.4 mm`; mil is 0.001 inch; µm is 0.001 mm. |

All resistances and geometric dimensions must be positive except trace length, which may be zero. Frequency and permitted temperature rise must be positive. The UI lists each equation and its assumptions beside the result.

## Primary references inspected

The [KiCad 9 Calculator manual](https://docs.kicad.org/9.0/en/pcb_calculator/pcb_calculator.html), documentation revision `152cd19e`, identifies track-width, via, color-code and regulator tools. Its resistor examples are used as direct reference tests. The regulator expression and resistor convention are checked against equation 2 in the [TI LM317 datasheet](https://www.ti.com/lit/ds/symlink/lm317.pdf), revision Z, April 2025, section 8.2.2. No native calculator executable comparison is claimed.

The [KiCad 9 track-width implementation](https://github.com/KiCad/kicad-source-mirror/blob/9.0/pcb_calculator/calculator_panels/panel_track_width.cpp) documents the two IPC-2221 coefficients, exponents, unit normalization and DC copper-loss calculations. The [KiCad via-size implementation](https://github.com/KiCad/kicad-source-mirror/blob/master/pcb_calculator/calculator_panels/panel_via_size.cpp) uses the same finished-hole annulus expression and fixed copper resistivity. These sources were inspected on 2026-10-11. Implementation is independent JavaScript using the equations, with no source-code copy or bundled native KiCad executable.

## Verification and limits

Run `node --test extension/tests/calculator-tools.test.cjs`. Reference checks cover 12 V across 100 Ω; loaded/unloaded dividers; 5 V regulator plus 36 mV adjust-current correction; 150 Ω / 60 mW LED resistor; manual color examples 4.7 kΩ ±5% and 1 kΩ ±1%; exact inch conversion; wavelength at 1 GHz and εr=4; annular via resistance. Track width at 1 A / 10 °C / 35 µm is independently evaluated using the logarithmic rearrangement in KiCad's reference: 0.30038652083330475 mm outer copper, and recomputed current agrees with 1 A. Tests also reject missing, negative, zero-denominator, nonfinite and overflowing inputs.

This is a selected calculator suite, not full native KiCad parity. Transmission-line synthesis, electrical spacing tables, board classes, RF attenuators, E-series optimization, regulator library persistence and advanced via RF/thermal properties are not implemented. Copper estimates use legacy IPC-2221 and fixed resistivity; they do not include IPC-2152, thermal spreading or transient effects. Numerical reference checks do not establish physical design suitability. Parent integration is responsible for packaging and browser/mobile acceptance.
