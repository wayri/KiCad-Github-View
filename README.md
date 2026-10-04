# KiCad Visual Review

View `.kicad_sch` and `.kicad_pcb` files as interactive drawings directly on `github.com` and public `gitlab.com` repositories, much like opening a PDF preview. The Chrome/Edge extension inserts a viewer into GitHub file pages and pull-request file cards, and GitLab.com file pages. It bundles our own schematic and PCB drawing engine for browser-side rendering, so the viewer needs no local KiCad installation or external rendering service. The separate local report tool uses `kicad-cli` for KiCad-authored SVG geometry and pixel comparison.

**Current delivery (v0.11.4, preview):** the unpacked browser extension is the inline GitHub experience. Its toolbar button or `Alt+Shift+K` focuses the drawing already on the GitHub page; **Open full viewer** is an optional larger view. The separate GitHub App creates pull-request checks linking to a standalone browser viewer. Installing that App does not change GitHub's built-in file renderer or install the extension. Neither the App nor the extension has been published in a store, and private-repository previews are not supported yet.

GitLab.com supports public repository drawings, subgroup namespaces and branch/commit comparisons. GitLab notes are local and exportable; GitLab login, remote issue publication, merge-request cards and self-hosted instances are not supported yet. See [Git host compatibility](docs/GIT-HOSTS.md).

To try inline GitHub or GitLab.com viewing, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository's `extension` directory. Then open a public KiCad schematic or PCB file on GitHub or GitLab.com. See [extension setup](extension/README.md). To try the separate GitHub App viewer locally, run `python scripts/package_app_web.py` followed by `python -m kicad_vizdiff.app_server` and open `http://127.0.0.1:8780/app/`. See [GitHub App registration and deployment](docs/github-app.md).

## GitHub release

This repository includes branch/PR CI and tag-driven release workflows. After connecting the repository to GitHub, pushing `v0.11.4` tests the tagged source, builds the browser extension, VSIX and optional App deployment archives, verifies checksums and publishes a prerelease. See [push-to-release instructions](docs/RELEASING.md), [installation](docs/INSTALL.md), [release notes](docs/releases/v0.11.4.md), [licensing status](LICENSING.md) and [third-party notices](THIRD-PARTY-NOTICES.md).

```sh
python -m pip install '.[github]'
python scripts/release.py --output dist/release
```

Generated packages, local credentials, caches and retired renderer bundles are excluded from Git. The current browser renderer and SPIKE bundle are committed build inputs; rebuilding SPIKE from its separate owner source is optional and described in `scripts/build_spike_bundle.mjs`. CI does not require that sibling checkout. The hosted GitHub App needs registration and hosting separately; download releases do not install anything in GitHub automatically.

## Try it with a local project

Requires Python 3.10+, Git, and KiCad 9+ (`kicad-cli`). On Windows the tool also locates a standard KiCad installation automatically.

```sh
python -m pip install -e .
kicad-vizdiff doctor
kicad-vizdiff view hardware/controller.kicad_sch --open
kicad-vizdiff view hardware/controller.kicad_pcb --open
kicad-vizdiff diff hardware/controller.kicad_sch --base main --head HEAD --open
kicad-vizdiff diff hardware/controller.kicad_pcb --base HEAD --head WORKTREE --open
```

Pass the **root** schematic to include all hierarchical pages. Each report is a self-contained HTML file (default `.vizdiff/index.html`). It plots the full KiCad page, border, project title block, date, revision, company, and sheet annotations when present in the design. The PCB view includes a combined view and selectable exported layers. `--layers` controls the set, and `--theme` selects an installed KiCad color theme. `--old-file` handles a renamed design path in a diff.

Click or right-click a symbol, sheet, footprint, pad, track, via, or text item to see the properties saved in the KiCad file. Sheet symbols can jump to their exported child page. The object list can be searched. Visual comparison offers side-by-side, opacity overlay, swipe, and changed-pixel views. Added, removed, and modified saved objects are counted separately. The report is **read-only**; context actions do not edit the project or its Git history.

Run the included original demo:

```sh
python scripts/demo.py
```

It creates a disposable two-commit project under `.vizdiff/demo` and renders both schematic and PCB reports with real KiCad CLI. Choose another destination argument if that directory already exists.

## View files on GitHub

The browser extension inserts the visual viewer into GitHub blob pages and inside pull-request **Files changed** cards, keeping each file header and comments visible. It retrieves `.kicad_sch` and `.kicad_pcb` source at selected public Git revisions through GitHub's API, follows referenced schematic child sheets, and renders with our owned Canvas2D engine. The viewer provides linked base/head pan and zoom, zoom buttons and shortcuts, layers and saved-object properties, sheet navigation, board flip, and a dark PCB canvas by default. With the drawing focused, press `F` to fit it, `Home` for the full sheet, or `D` to switch the theme. Pull requests use GitHub's merge base, including public fork heads; added and removed files show only the revision that exists.

The pull-request **Changes** panel compares saved drawing objects by ID. Search or filter added, removed, and modified objects, inspect before/after properties, and focus a changed object's 2D position. This is a saved-object comparison, not an exact pixel diff or an electrical design rule check. The PCB viewer also has a read-only SPIKE 3D preview loading repository-linked WRL/VRML and self-contained GLB models, with procedural fallbacks.

Run `python scripts/package_extension.py` to create a browser-store submission ZIP under `.vizdiff/`. It is a package artifact, not a published store listing. A GitHub App installation cannot replace GitHub's built-in file renderer or install a browser extension. The standalone App viewer instead opens from GitHub check links and renders entirely in the browser, while the hosted service handles metadata and signed webhook events.

The GitHub App template is at [.github/app-manifest.example.json](.github/app-manifest.example.json). After choosing an actual HTTPS domain, `scripts/configure_github_app.py` generates owner registration settings and a deployment environment template. [compose.github-app.yml](compose.github-app.yml) mounts the private key as a secret and persists the webhook queue outside the web root. Install the App extras with `python -m pip install ".[github]"`; the remaining setup is in [the App guide](docs/github-app.md). Its `pull_request` handler creates a neutral KiCad review check linked directly to its standalone hosted viewer. The App permissions are repository contents read, pull requests read, and checks write. Registration, hosting, Marketplace billing/authentication, support/privacy materials and owner submission remain outstanding. `Dockerfile.github-app` builds the browser renderer and App service without installing KiCad.

## VS Code and github.dev

The companion [VS Code extension](vscode-extension/README.md) registers read-only visual custom editors for `.kicad_sch` and `.kicad_pcb`. Its desktop and web entry points share the browser renderer and review controls. It uses `workspace.fs` for local and virtual repositories, so it is designed for VS Code Desktop and the browser-based github.dev editor. Opening github.dev is a separate editor experience; the browser extension supplies inline viewing on github.com itself.

Run `python scripts/package_vscode.py` to prepare the development extension and build its installable VSIX. In VS Code, choose **Extensions: Install from VSIX**, select that package, and open a KiCad file. See the extension guide for web-host testing and current limitations. It has not been published in Visual Studio Marketplace; publisher registration and actual editor-rendering smoke tests remain outstanding.

## GitHub Actions

[`action.yml`](action.yml) runs one visual comparison when KiCad 9+ and Python are available on the runner. The example [workflow](.github/workflows/visual-review.yml) installs KiCad 10 from the [official Ubuntu PPA](https://www.kicad.org/download/details/ubuntu/), renders changed KiCad files for a pull request, and uploads self-contained HTML reports as a workflow artifact. It uses a read-only token and does not execute the checked-out project. The Action can be listed separately in GitHub Marketplace after this repository is published and released.

## Rendering and interaction limits

In the optional local report, page geometry, lettering, symbols, footprints, and tracks come from KiCad's own [SVG export](https://docs.kicad.org/10.0/en/cli/cli.html). Exported plots are not a pixel-identical copy of every editor overlay: live selection, ratsnest state, 3D view, and user-specific editor preferences are outside the SVG. Property inspection reads the saved KiCad S-expression files, so unsaved editor state is not visible. Click selection currently uses saved object anchor points; crowded objects may be easier to select through the searchable list. Visual change highlighting is a raster comparison at up to 2800 pixels on the longest page dimension; the two native SVGs remain available for close inspection.

The browser extension uses our own 2D geometry and interaction engine. It is not yet pixel-identical to KiCad: browser glyphs, custom worksheets and unsupported specialized constructs remain visible limitations. Dedicated schematic and PCB viewers inspect parts, navigate subsheets, import assembly/BOM variants, measure and anchor severity-tagged annotations. GitHub issues and PR annotations can be read back; discussion readback still requires authenticated API integration. Changes compares saved objects; the local native report offers side-by-side, overlay, swipe, and changed-pixel views. SPIKE 3D loads repository-linked WRL/VRML and self-contained GLB models; missing models retain procedural bodies and STEP remains unsupported. Public GitHub API limits apply; private repositories and GitLab remain unimplemented.

## Development checks

```sh
python -m unittest discover -s tests -v
node --test extension/tests/*.test.cjs
python scripts/demo.py .vizdiff/check-demo
```

The demo requires installed KiCad 9+; the browser and parser tests do not. The extension has local fixture coverage, but a live installed-extension test on GitHub is still needed before a browser-store submission.

Version 0.9.0 adds separate light/dark UI and drawing preferences, standard/custom review page setup and title blocks, mm/mil ruler readouts, point/area comments, PNG area capture and review search/state filters. GitHub device OAuth login is implemented but needs a registered OAuth App client ID with Device Flow enabled. Captures remain in the local/Git sidecar and require manual attachment through GitHub's composer. Page overrides are display-only; custom worksheet templates remain unsupported.
