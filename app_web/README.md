# Hosted KiCad visual review

For the separate Firefox/Firefox-derivative extension, see [installation, signed-XPI distribution and Mozilla publishing](../docs/FIREFOX.md). That add-on and this hosted web application are separate deployment routes; a hosted viewer link does not install a browser add-on.

This static browser app is the GitHub App's hosted viewer. It is served at
`/app/` by the same origin that provides the metadata endpoints. It opens
public GitHub schematics and PCB layouts with the project's own Canvas2D renderer. Its controls include
KiCad sheet navigation, layer and property inspection, fit drawing/full sheet,
dark PCB colors, and SPIKE's approximate 3D PCB view. PR mode displays base
and head revisions side by side or individually.

The page retrieves KiCad source directly from the public GitHub Contents API.
It does not accept credentials or promise access to private repositories.
The origin must expose:

* `GET /api/designs?repository=owner/repo&ref=branch` returning
  `{repository,ref,files:["path/to/board.kicad_pcb"]}`.
* `GET /api/review?repository=owner/repo&pull=123` returning
  `{repository,headRepository,base,head,files:[{file,oldFile,status}]}`.

`status` should be `added`, `removed`, or `modified` (a rename uses `oldFile`).
Direct links may pass `repository`, `headRepository`, `file`, `oldFile`, `base`,
and `head` without a pull request number. A current revision link may instead
pass `ref` and `file`.

Run `python scripts/package_app_web.py` at the repository root. It stages the
serving directory at `.vizdiff/app-web/` and creates
`.vizdiff/kicad-visual-review-app-web.zip`. Serve that directory at `/app/`.
The package includes the project's own schematic/PCB parsers and Canvas2D renderer,
plus the locally bundled SPIKE 3D engine and its license notices. No remote
script or native companion app is needed. The renderer shows an approximate
default worksheet frame; custom `.kicad_wks` files and exact editor pixel
parity are not supported.

The GitHub App links into this page from a check or other App surface. GitHub
Apps cannot replace GitHub's own blob-file viewer. GitHub's public API rate
limit, CORS, file-size limits, and the 32-sheet/24-MiB project cap apply.

## Android browsers

The hosted viewer includes touch pan, pinch zoom, tap selection and long-press context events using the same touch adapter as the Android app. On screens up to 700 CSS pixels, Details opens a scrollable overlay; tapping the drawing or pressing Escape closes it. Drawing controls remain reachable in a horizontally scrollable toolbar. No browser extension is required for the hosted viewer. Hosted retrieval remains public GitHub only; private GitHub/GitLab account access and downloaded offline projects remain features of the native Android app.

Chrome for Android cannot install the desktop extension; use the hosted viewer or Android app. Firefox for Android supports extensions, but this project's unsigned Firefox package has not passed Android-device acceptance or Mozilla signing. Do not describe it as an installable mobile add-on yet. See [Mozilla's Android extension guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/) and [Chrome extension installation](https://support.google.com/chrome/answer/2664769).

Mobile browser acceptance on 2026-10-08: a synthetic schematic rendered at 400×800 CSS pixels, Details opened and closed, and the page had no horizontal overflow. Shared touch tests cover drag/pinch, cancellation, long press, and chooser dispatch. These checks used a Chromium browser viewport and synthetic transport, not installed Android Chrome or Firefox.
