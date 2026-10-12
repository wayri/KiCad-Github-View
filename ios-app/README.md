# Pocket KiView for iPhone and iPad

Initial native iOS host for the shared offline viewer, targeting iOS/iPadOS 16+.
It bundles the same schematic/PCB renderers, hierarchy, models, measurements,
analytics, BoM/assembly, testpoints, PDFs and saved-report tools. No KiCad
installation or internet connection is required to view imported local projects.

Native Files pickers open saved files or a complete project folder. Relative
paths preserve subsheets and models. ZIP import and GitHub/GitLab account
integration are not ported yet: extract a ZIP in Files before selecting its
folder. Cloud-provider files must be locally available to open without internet.
Native Share exports supported review JSON, BoM/testpoint CSV and text. Camera
permission is requested only for photo inspection; camera/AR, 3D/STEP, file
provider coordination and device resource limits need iPhone/iPad acceptance.

The app serves only bundled viewer assets on 127.0.0.1:49273. Imported data is
served through a random per-launch session capability. It never binds to Wi-Fi
or exposes a filesystem browse endpoint. An occupied port fails visibly rather
than changing the origin and losing access to browser review storage. Imported
project copies and review metadata stay in protected app-private storage and are
excluded from iCloud backup; export them for independent retention. CAD source
files are never edited. Closing a project view retains the saved import copy.

## Build from this Windows workspace

Windows can prepare the sources and bundled assets:

```powershell
python scripts/package_ios.py
```

Run **Build iOS preview** in GitHub Actions on the development branch. It stages
the exact shared assets, validates plists and compiles on a macOS runner:

```sh
xcodebuild -project ios-app/PocketKiView.xcodeproj -scheme PocketKiView \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios-app/DerivedData CODE_SIGNING_ALLOWED=NO build
```

The retained `.app` ZIP runs in the matching architecture's iOS Simulator on a
Mac. It is not an installable physical-iPhone IPA and does not use signing secrets
or an Apple Developer membership. The build also retains logs and the prepared
source archive. A successful compile is not device/runtime acceptance.

## Later TestFlight preparation

Apple Developer membership, an available bundle ID, distribution signing and
provisioning, App Store Connect configuration, a release icon, declarations,
current policy and real-device acceptance remain separate work. The provisional
bundle ID is `dev.kicadvizdiff.ios`; confirm it before distribution. The current
privacy manifest describes the local-only host; revisit it when adding online
accounts, analytics or new native SDKs. No TestFlight upload is configured.

App startup/native errors remain visible. If importing a large project fails,
the previous snapshot is retained. Native import limits are 512 supported files,
32 MiB per file and 96 MiB total; shared drawing/parser limits also apply.
