# Android GPU rendering

The Android viewer uses the shared Three.js WebGL renderer, requesting the high-performance GPU preference. Studio illumination, physically based board materials, ACES tone mapping, cached shadows and real linked STEP/VRML/GLB models are available. High quality adds ambient occlusion and SMAA antialiasing. GPU preference is a browser hint; the native WebView and graphics driver determine the actual implementation.

## Quality selection and detail

Previously all coarse-pointer devices received the constrained framebuffer budget. High quality then capped phones and tablets at one million pixels, which could make fine edges softer than Balanced despite the extra effects.

The renderer now chooses its allocation tier from actual texture/renderbuffer limits, reported device memory and floating-point render-target support. Touch input is not a graphics capability test. High uses a one-, two-, or three-million-pixel budget for constrained, standard and premium tiers. Premium Android devices use High on first opening; explicit saved Low/Balanced/High choices remain authoritative. A 390 × 740 CSS-pixel viewport at 3× DPR keeps full native pixel detail in premium High. Large tablets remain bounded to the same total pixel budget. These are allocation heuristics, not measured GPU benchmarks.

Premium requires floating-point targets, at least an 8192-pixel renderbuffer/texture dimension, and at least 6 GiB reported memory. If memory is unavailable, a 16384 dimension and eight reported hardware threads are required. Devices with a maximum dimension at or below 4096, or reported memory at or below 2 GiB, receive the constrained budget. Standard devices retain Balanced by default.

High postprocessing estimates remain below 300 MB; this estimate covers framebuffer effects and cached shadows, not model geometry, textures, driver allocation or all application memory. Models retain their separate loading budgets. Failed enhanced rendering falls back to Balanced. Lost contexts retain board/selection state and recover in Balanced so repeated GPU allocation failures do not loop automatically. Studio-environment generation failure now falls back to direct lighting instead of aborting the viewer.

## Diagnostics and acceptance

The mounted viewer's `getRenderStats()` reports quality, framebuffer width/height/ratio, estimated bytes, graphics tier, default quality, maximum render dimension, actual context antialias attribute, floating-point target support, environment/AO availability, draw calls, loaded-model/component counts and context-loss state. This distinguishes missing component models from a low-resolution framebuffer. No renderer fingerprint or remote telemetry is collected.

Focused Node tests cover capability selection, native phone resolution, tablet/orientation budgets, dimension limits, unknown capabilities and existing material/depth policy. Native acceptance still requires a physical Android phone/tablet: load a real project with linked models, inspect top/bottom and oblique views, compare Balanced/High, rotate and zoom, background/restore the app, and confirm both model counts and framebuffer resolution. Browser or analytical tests alone do not prove native visual quality, GPU speed or battery behavior.

## Opt-in Android renderer acceptance

`RendererAcceptanceChecks` uses the ordinary app project loader, PCB viewer and 3D action. Its test-only fixture contains the installed public KiCad 10 PIC Programmer board with unchanged source bytes, SHA-256 `aba03b4359e8bf162fe00b27b0d3394f2141acfbd3d43d9cf8e05bf0845d9bd5`, and all 19 referenced installed STEP/VRML models (3,093,878 model bytes). The JSON bundle is approximately 4.9 MB and includes per-model hashes. The demo has 63 footprints, with real models for all 56 footprints that carry saved model references. The remaining seven can display their ordinary renderer stand-ins. KiCad and the demo/model authors retain their rights.

After installing the app and test APK, the opt-in instrumentation flag is `rendererAcceptance=true`. The runner verifies source integrity, real model loading, quality switches and buffer bounds, top/bottom presets, surface resizing, and context loss/recovery when the extension exists. It restores the previous rendering-quality preference. Actual Android screenshots and a machine-readable report are written to the app's external-files `renderer-acceptance` directory; these screenshots include the native screen surface and may contain system bars. This runner does not create provider accounts, post comments or fetch remote assets. Execution on an emulator establishes WebView behavior on that emulator only; a passing runner does not establish physical-device speed or battery behavior.

## Current verification limits

Android assembly and lint completed successfully. An emulator run loaded all 56
model-bearing footprints and passed 42 graphics-state checks, including quality
changes and context recovery. Its screenshots were covered by Android first-run
prompts and an emulator System UI ANR, so they are not accepted visual evidence.
The capture runner now rejects those states; the subsequent clean install stalled
on the restarted emulator. No physical phone/tablet performance or clean final
visual acceptance is claimed. The retained native reports distinguish these limits
from model-loading and framebuffer checks.
