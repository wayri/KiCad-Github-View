# Pocket KiView Android 1.53 deployment candidate

Source release v0.12.41, versionCode 56, package `dev.kicadvizdiff.android`.

Upload-signed bundle: `dist/play-android-1.53/pocket-kiview-play-1.53.aab`.
SHA-256: `2d7740a92d103628d273e050eff4621b48150a7140ef703c723ef430231938f0`.

The JAR signature and exact packaged viewer payload were verified. The retained public certificate and verification log accompany the local candidate. Debug APK, lint and unsigned release bundle builds passed. This candidate includes the camera/photo, PDF, population and strengthened assembly/testpoint tools added after the historical 1.50 candidate. The upload key remains outside the source and distribution archives.

GitHub prerelease downloads use development signing and an unsigned AAB. They are distinct from this signed Play upload candidate. Google Play Console upload, declarations, hosted privacy parity, reviewer access and Play-delivered phone/tablet acceptance remain outstanding; no device was connected during this release. Use the existing publisher worksheets to finish those account and runtime gates. Do not treat the older 1.50 signed artifact or installed debug-version evidence as 1.53 acceptance.
