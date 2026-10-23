# Viewer performance checks

The Android 1.41 and shared browser viewer changes address repeated parsing
and offscreen text painting. Drawing preparation now validates and parses each
source once per job, reusing the AST and collected objects for the design model,
initial geometry and connectivity. Opaque snapshots reject changed sources and
are held in a WeakMap so completed jobs do not retain a global project cache.
Record IDs remain independent between consumers.

Canvas labels use actual glyph metrics for conservative viewport culling.
Metrics are cached during panning and recomputed on zoom or board flip.
Rotation, multiline labels, alignment, baseline, width and minimum font size
are included. Missing metrics preserve the prior always-visible behavior.
Initial drawing and zoom still require calculating label bounds.

## Reproducible CPU benchmarks

Run from the repository root:

```text
node extension/tests/drawing-preparation.bench.cjs
node extension/tests/benchmark-canvas-labels.cjs
```

Measured on the development Windows host on 2026-10-10:

| Workload | Previous path | Optimized path |
| --- | ---: | ---: |
| Synthetic 12,000-track PCB, 1.1 MB; median of five preparations | 270.81 ms | 139.43 ms |
| Synthetic 40,000 labels, zoomed 40 x 30 mm; median of 20 warm pans | 47.45 ms | 4.63 ms |
| Text paint calls per warm pan in the second workload | 40,000 | 75.95 |

Both preparation paths produce 12,000 objects, 12,054 primitives and one net.
These timings isolate CPU work; the label benchmark uses a no-op Canvas and
excludes browser rasterization. They do not establish Android frame rates,
network download performance, or end-to-end loading time for every project.

Validation: 839 shared viewer, web and Android JavaScript checks; three Android
packaging checks; Android debug build and lint. Focused tests compare prepared
and ordinary geometry/connectivity, source immutability, invalid snapshots,
and offscreen text behavior. Android 1.41 (code 44) was installed in place on
the connected device, preserving app data.

## Local download reuse (Android 1.42)

Online project opening checks downloaded manifests before making network requests.
Copies match provider, host, repository and requested branch or pinned commit.
Temporary expiry, deletion markers, stored paths and file sizes are checked.
Missing or incomplete copies fall back to downloading. Reopening preserves the
original expiry and cached revision; it does not refresh a branch automatically.
GitHub and GitLab device acceptance tests cover reuse, provider/host/revision
isolation, incomplete files, expiry and fallback to a permanent copy.
