# Development and repository map

Start with the [README](../README.md), [installation guide](INSTALL.md) and [user guide](USER-GUIDE.md) for product use. This page describes source layout and packaging.

## Source layout

| Path | Purpose |
| --- | --- |
| `extension/` | Shared parser/rendering/review modules and browser extension entry points |
| `vscode-extension/` | VS Code host, custom editors, Marketplace README and illustrated guide |
| `android-app/` | Android host and app-specific web interface; shared viewer assets are generated |
| `kicad_vizdiff/` | Python CLI, local viewer and optional service tools |
| `kicad_plugin/` | Optional legacy KiCad PCB browser-launch action |
| `app_web/` | Hosted viewer support and app web tests |
| `scripts/` | Deterministic packaging, release and supporting tools |
| `tests/`, `extension/tests/`, `vscode-extension/tests/` | Python and JavaScript checks |
| `docs/` | User workflows, compatibility, architecture, release history and store preparation |
| `examples/` | Example inputs/workflows; preserve attribution and component licenses |

`build/`, `dist/`, `.vizdiff/`, generated viewer copies, dependency directories and test caches are local outputs excluded from Git. Do not put upload keys, passwords, provider tokens or private designs in source or release archives.

## Build individual packages

Use Python 3.10+, Node 22+ and Git. Native-reference checks also need the applicable KiCad tools. Required pinned rendering dependencies and provenance are described in [third-party notices](../THIRD-PARTY-NOTICES.md) and [CI setup](../.github/workflows/ci.yml); a partial checkout with omitted runtime assets is not a complete release source tree.

Run from the repository root (`python3` on systems where `python` is unavailable):

```sh
python -m pip install '.[github]'
python scripts/package_extension.py
python scripts/package_vscode.py
python scripts/package_android.py
```

Browser output goes to `dist/`; VSIX output goes to `build/`. Android packaging stages shared web assets and creates a source archive; it does not itself compile an APK. Android compilation needs JDK 17, Android SDK 36 and the Gradle wrapper. On Windows run `android-app/gradlew.bat -p android-app assembleDebug`; on Linux/macOS use `sh android-app/gradlew -p android-app assembleDebug` from the root. Debug builds are development-signed, not Play uploads. Follow [Play signing instructions](play-store/SUBMISSION.md) for the separate upload identity.

Optional packages have their own scripts: `package_firefox.py`, `package_safari.py` and `package_local_viewer.py`. Building a package is not proof of an installed-browser test.

## Verification and releases

```sh
python -m unittest discover -s tests
node --test extension/tests/*.test.cjs
```

The full release gate is `python scripts/release.py --output dist/release`. It requires matching browser/VS Code versions, reviewed release notes and complete runtime assets. A working tree where channels have separate versions must be reconciled deliberately before running the combined release pipeline; do not overwrite another channel's version just to pass the gate.

Tagged publication also requires a clean, committed source tree and a matching tag. See [release procedure](RELEASING.md) and [CI details](release-ci.md). Preserve user work; inspect exact staged files before committing. Do not bulk-stage local experiments or signing material. Documentation download links should point to verified release assets, not guessed `/latest` URLs when only prereleases exist.

## Licensing

The [project license](../LICENSE) is source-available with paid distribution and monetized hosted access requiring permission. Third-party licenses continue to apply. Contributions do not automatically transfer copyright or grant commercial relicensing rights; read [licensing policy](../LICENSING.md) before accepting external code.
