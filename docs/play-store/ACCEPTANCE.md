# Play build acceptance record

Run on the exact signed AAB delivered through Play internal testing. Source tests and a sideloaded development APK are supporting evidence, not a substitute for this record. Do not manufacture device screenshots, provider sign-in state or pass results.

Version/code: ___ · AAB SHA-256: ___ · Play track: ___ · tester/date: ___

Source update 2026-10-11 adds repository navigation/quick actions, a unified comment destination selector, app settings/KiCad-style presets, and repository/embedded model handling. The previously prepared AAB below predates these source changes. Rebuild a new signed upload candidate and repeat the relevant Play/device flows before treating these features as accepted for publication.

Historical upload candidate: Android **1.49/code52**, `dist/play-android-1.49/pocket-kivi-play-1.49.aab`, SHA-256 `540cf7bda0b4d893ebfb0ea0ad4e5a5f3bec062cc333e05f902b0c1cc4b6e141`. Upload signature verified; zero native `.so` entries. Debug/lint/Play bundle build and 115 focused shared-workspace tests passed. Android1.49 was sideloaded on the authorized phone. These facts do **not** fill the pending Play-delivered/device-flow results below.

| Environment | Device/emulator and Android | Result/evidence |
| --- | --- | --- |
| Phone, current Android, portrait and landscape | | |
| Tablet, portrait and landscape | | |
| Android 8 / API26 minimum | | |
| 16 KB page-size environment | | |

For each environment check keyboard/IME visibility, Back navigation, outside-tap dismissal, bottom-sheet drag/close, touch targets, tooltips, light/dark contrast, TalkBack labels/focus and text scaling. Record any exception and resolution; a phone viewport in a browser is not a tablet-device test.

| Flow | Expected evidence | Result |
| --- | --- | --- |
| Local sample | Import `reviewer-sample.zip`, root/subsheet navigation, all-sheets names, part/net selection, linked PCB view, BoM, properties, measurement and supported 3D stand-ins | |
| Offline | Save, force-stop/relaunch in airplane mode, reopen saved project without provider request | |
| Large downloads | Download/Cancel and temporary/permanent options; available temporary copy reused; expiry keeps recent entry marked expired; manual cleanup preserves permanent copy | |
| Failure handling | Insufficient disk, interrupted download, provider denial/rate limit and memory pressure produce actionable state, not a crash or broken library entry | |
| Providers | Reusable reviewer sign-in, public/private reads, sign-out, contributor suggestions and optional notification flow without exposed credentials | |
| Comments | Draft remains local, first-line title, readable thread, keyboard-visible edit, destination review, explicit final post, image attachment and readback | |
| Moderation | Rules accepted before publishing; report content and user route verified; block/unblock suppresses selected author's content; reports reach the configured recipient and are reviewed | |
| Privacy/deletion | Policy accessible offline and at public URL; credentials removed on sign-out; offline copy/library removal and provider-post deletion distinctions match policy | |
| Release packaging | Upload signature valid, non-debuggable release, expected version/SDK/permissions; final native library inventory and Bundle Explorer checked | |
| Play findings | Pre-launch accessibility/crash/ANR results reviewed and material findings resolved | |

Capture genuine store screenshots from the submitted Android version using the original sample or another authorized non-sensitive design. Record actual phone/tablet device and build. Screenshots must not expose credentials, private designs or fabricated account state. Existing icon/feature graphic are branding candidates requiring owner review. Follow [Google's preview requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).

Production decision: ___ · unresolved defects: ___ · owner sign-off/date: ___

Current candidate: **1.50/code53**; upload signature and source asset parity verified, target API36, non-debuggable, zero native `.so` entries. SHA-256 `ea5a33e459280108fb3d1549b85717c964703e6bc36134ae942aec1ffb5803f0`. Play-delivered runtime acceptance remains pending; see [deployment preparation](DEPLOYMENT-1.50.md).
