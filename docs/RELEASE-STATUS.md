# Distribution status

Snapshot checked **29 October 2026**. This page records observed publication state; it does not update automatically.

| Channel | Current state | What to use |
| --- | --- | --- |
| GitHub browser/desktop packages | **0.12.72 published as a preview**; source tag and package checksums available | [Release and downloads](https://github.com/wayri/KiCad-Github-View/releases/tag/v0.12.72) |
| Chrome Web Store | **0.12.72 submitted, pending review**, with automatic publication after approval. The superseded 0.12.70 review was withdrawn. The observed approved package is 0.12.64 until Google approves an update. | [Existing store listing](https://chromewebstore.google.com/detail/klfdjlbngpoopegjmbajaidgodpmjaoc); use the GitHub ZIP for the newer unpacked build |
| VS Code Marketplace | **0.12.70 public/live**. GitHub also offers a 0.12.72 VSIX; Marketplace was not updated to that newer package. | [Marketplace](https://marketplace.visualstudio.com/items?itemName=wayri.kicad-visual-review) or [GitHub VSIX](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.72/kicad-visual-review-vscode-0.12.72.vsix) |
| Mozilla Add-ons | **Disabled by Mozilla**; submitted version 0.12.66 is restricted. New submissions are unavailable. The appeal was recorded; no reinstatement is shown. | [Unsigned Firefox 0.12.72 development ZIP](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.72/kicad-visual-review-firefox-0.12.72.zip), subject to [temporary-install and signing limits](FIREFOX.md) |
| Android | **1.72 / version code 75** APK published in v0.12.70. Development-signed, non-debuggable, manually installed/updated. The AAB is unsigned and not ready for Play upload. | [Android APK](https://github.com/wayri/KiCad-Github-View/releases/download/v0.12.70/pocket-kivi-android-phone-tablet-1.72-development.apk) |
| Safari | 0.12.72 development conversion package; native conversion/signing and runtime acceptance remain required | [Safari instructions](SAFARI.md) |

## Latest browser behaviour

**0.12.72 is icon-first.** Normal GitHub/GitLab repository, drawing and pull/merge-request pages remain untouched. Click the extension icon to open a dedicated viewer tab. A single detected project opens directly; multiple projects offer a chooser. Empty, partial and access-denied results have distinct messages. Refresh already-open repository pages after updating to remove older injected controls.

The Chrome listing now includes a **What's new in 0.12.72** section describing these changes and the retained Draftsman template/snapping improvements. Its reachable [Chrome privacy policy](https://wayri.github.io/KiCad-Github-View/chrome-privacy.html) and permission explanations match the user-directed workflow.

The [illustrated user guide](../USER-GUIDE.md) includes setup, review workflows and Draftsman screenshots/video. GitHub source updates are available in release tags and [source review PR #2](https://github.com/wayri/KiCad-Github-View/pull/2); the default branch may lag until that review is merged.
