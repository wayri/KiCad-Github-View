# Safari Web Extension development package

This is a Safari-targeted web extension payload and an Apple packaging helper, **not an installed or signed Safari application**. Packaging and source checks run on Windows; native conversion, Safari interaction, signing and App Store acceptance still require verification on a Mac. The current target is desktop Safari **16.4 or later** because GitHub credentials use `storage.session`.

## Build the payload

From the repository root:

```sh
python scripts/package_safari.py
```

The resulting `kicad-visual-review-safari-VERSION.zip` contains `web-extension/manifest.json`, the explicit shared viewer assets, this guide, and `convert.sh`. Keep the whole extracted directory together. Do not select the outer directory as the extension source; the actual extension is in `web-extension`.

## Convert and run on a Mac

1. Install full Xcode and select its developer directory. Command Line Tools alone do not provide the complete Safari app packaging workflow.
2. Extract the development ZIP. Open Terminal in that extracted directory.
3. Choose a new output directory and your own Apple bundle identifier:

```sh
bash convert.sh "$HOME/Developer/KiCadVisualReviewSafari" com.example.kicadreview
```

The helper detects Apple's current `safari-web-extension-packager` or its older `safari-web-extension-converter` name. It requests a macOS Swift app, copies resources, and refuses to overwrite an existing project. Inspect all Apple compatibility warnings; successful conversion alone does not establish runtime support. [Apple packaging instructions](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).

4. Open the generated `.xcodeproj` in Xcode. Select your signing Team for the application and extension targets, and ensure their deployment target supports Safari 16.4 or later. Build and run the macOS app.
5. In Safari Settings → Extensions, enable KiCad Visual Review and grant access to GitHub and GitLab as needed. A development build may require Safari's developer option for unsigned extensions; use this only for local testing. Follow [Apple's running instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) for your Safari/Xcode version.
6. Visit a KiCad file on GitHub or a public GitLab.com repository. Use the toolbar button if the inline viewer has not appeared. Open the extension's Options page to connect GitHub; options are private extension resources and are never exposed as website-accessible pages.

## Features and limits

The package shares schematic/PCB review, project setup, layers, nets, selection, comparison and local review notes with the Chromium viewer. GitHub publication uses its existing explicit Issue/Discussion actions and session credentials. GitLab supports public repository viewing and its existing composer workflow; this package does not add GitLab OAuth or private project support.

Repository HTML/interactive BOM execution is **disabled** in the Safari package. Saved HTML source remains viewable. Chromium's privileged extension sandbox is not assumed to be portable: the Safari manifest omits it, its sandbox scripts are excluded, and the preview handler displays a limitation instead of creating a frame. The normal extension CSP remains restrictive. No credential persistence fallback is introduced.

Safari supports the `chrome` namespace and Promise APIs used here; Apple documents `storage.session` from Safari 16.4. [Apple browser compatibility reference](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility). Permissions, embedded extension frames, popup windows and WebGL still need installed Safari acceptance testing. iPhone/iPad usability and memory limits have not been verified; the helper currently generates macOS only.

## Acceptance checklist before distribution

- Enable the signed development app in Safari; permit only the requested repository/API origins.
- Open a schematic and PCB inline on GitHub and GitLab; navigate file pages and GitHub pull requests without stale frames.
- Verify sheet navigation, multi-net highlighting, measurements, light/dark themes, project settings and paired schematic/PCB review.
- Load repo-linked supported WRL/GLB geometry in 3D; inspect diagnostics for missing and unsupported STEP models.
- Confirm GitHub Options connection and disconnect work, credentials do not enter local notes/exports, and a page cannot invoke private credential actions.
- Save a local note, export/import it, then explicitly publish one Issue and one Discussion in a test repository with appropriate permissions. Verify receipts and avoid duplicate retries after ambiguous failures.
- Confirm HTML preview is disabled, and Options/settings are absent from `web_accessible_resources`.
- Check Safari Inspector for errors and run tests after any converter-driven source changes.

## Distribution

Public distribution requires an Apple Developer account and Apple's review/signing process. Add containing-app icons and distribution metadata, archive using Xcode and validate through TestFlight/App Store Connect. Apple also documents a [web-based App Store Connect packaging route](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect). No App Store listing, developer identity, signed app or Mac installation is produced by this repository's ZIP builder.
