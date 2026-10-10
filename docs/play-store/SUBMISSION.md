# Pocket KiVi Google Play submission checklist

Prepared 2026-10-10 for a **new** Play listing. This directory prepares the submission; it does not establish Console ownership or publish the app.

## Upload identity and signing

Use package `dev.kicadvizdiff.android`. Confirm this immutable identity before creating the listing. Android **1.48 uses version code 51**; later uploads must increase the code. Enroll in Play App Signing and retain an independent upload key. Do not reuse the development/debug key. Read [COMPLIANCE-AUDIT.md](COMPLIANCE-AUDIT.md) before proceeding: a GitHub release is not a Play compliance approval.

Create an upload key outside the repository using the JDK's interactive `keytool`; it prompts for passwords rather than putting them into shell history:

```powershell
keytool -genkeypair -v -keystore C:\SecureKeys\pocket-kivi-upload.jks -alias pocket-kivi-upload -keyalg RSA -keysize 3072 -validity 10000
```

The directory is an example chosen by the owner, not a generated key or guaranteed existing location. Keep a secured backup and record the certificate fingerprint. Do not commit, archive or upload the private keystore. Configure these environment variables in the build process without printing their values:

- `POCKET_KIVI_KEYSTORE`: absolute keystore path.
- `POCKET_KIVI_STORE_PASSWORD`: keystore password.
- `POCKET_KIVI_KEY_ALIAS`: selected alias.
- `POCKET_KIVI_KEY_PASSWORD`: private-key password.

Stage the viewer with `python scripts/package_android.py`, then run `android-app/gradlew.bat -p android-app bundlePlayRelease`. Missing signing configuration must fail rather than fall back to a debug identity. Verify the signed AAB and its certificate, inspect its version and retain its SHA-256 checksum. The unsigned AAB and development APK on GitHub are not Play upload artifacts. A Play-signed app may require a separate install/migration path from a debug install; do not uninstall a user's app or erase projects without arranging backups.

## Owner-dependent gates

- [ ] Create/verify the Play developer account and listing; confirm developer legal identity, required contact information and countries.
- [ ] Set a monitored support email and private privacy-contact mechanism. The repository provides public issue support but no invented email.
- [ ] Host the [privacy policy](PRIVACY.md) at an active public HTML URL without login, geographic restrictions or editing access; add it to Console and make policy text/link accessible inside the app.
- [ ] Review [LISTING.md](LISTING.md), localization, category, target audience and content-rating responses. Do not assert child-targeted status or permissions without review.
- [ ] Complete the [Data Safety worksheet](DATA-SAFETY.md) as owner-approved Console answers consistent with actual behavior.
- [ ] Check developer-verification requirements in Console. New phone/tablet submissions currently require API 36; source and current merged debug manifest target 36. Inspect the final release manifest too.
- [ ] Inspect the signed AAB for native libraries and verify 16 KB compatibility in Bundle Explorer and a 16 KB emulator. The current debug APK contains no `.so` entries; Java/Kotlin-only apps support 16 KB according to Android guidance, but this is not a runtime acceptance test.
- [ ] Complete any required closed testing and production-access application. Personal accounts created after 13 November 2023 need at least 12 testers continuously opted in for 14 days, then an application for production access. Confirm this account's requirements in Console; a new listing alone does not determine account eligibility.
- [ ] Supply genuine phone/tablet screenshots, Play icon and feature graphic; verify their rights and current format requirements.
- [ ] Supply English reviewer access instructions for optional authenticated features, including a reusable dedicated provider account and safe test repository. Access must work regardless of location without expiring passwords, owner-assisted device codes or mandatory one-time-code handoffs. Put secrets only in secure Console fields. Do not weaken production authentication to accommodate reviewers.
- [ ] Resolve UGC moderation applicability and implementation before submitting comment/thread features. The current audit found no in-app report/block workflow or accepted-content policy. Provider moderation alone is not demonstrated compliance for a specialized UGC client.

## Deployment sequence

1. Confirm publisher identity, monitored contact, policy hosting, content/audience declarations and reviewer access. Resolve every blocking row in the compliance audit.
2. Stage assets and build the independently upload-signed AAB using the procedure above. Retain the checksum, certificate, release manifest and dependency inventory; verify the non-debuggable build in Bundle Explorer.
3. Upload to internal testing first. Install the Play-delivered build and complete the acceptance matrix below, including 16 KB, phone and tablet runs. Address pre-launch findings.
4. Run the account-required closed test, retaining feedback and fixes. Apply for production access where required; this approval is separate from app review.
5. Submit the final owner-approved listing, Data Safety form, privacy URL, app-access instructions and production AAB. Use a staged rollout after approval and monitor crashes/ANRs and review failures.

## Release acceptance

- [ ] Run shared release tests, Android lint, signed release build and packaged-asset audit.
- [ ] Install through Play internal testing; verify Android 8 minimum and a current Android version, phone/tablet, portrait/landscape, light/dark, keyboard/insets and Back handling.
- [ ] Verify offline local import and library reopen; large-project Download/Cancel, disk capacity errors and removal; source limits remain disclosed.
- [ ] Verify optional GitHub/GitLab sign-in and sign-out, public/private reads, thread readback and explicit comment/screenshot publication without exposing credentials.
- [ ] Check schematic hierarchy/all-sheets, net selection/cross-selection, PCB layers, supported 3D models/proxies, BoM and saved results on representative projects.
- [ ] Review Play pre-launch report, crashes/ANRs, accessibility and large-screen behavior. Release only after material failures are resolved.

## Official requirements

- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)
- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [User data, privacy policy and account deletion](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)
- [Reviewer sign-in access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en)
- [User-generated content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)
- [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

These links are the source of the submission gates, not evidence that Pocket KiVi has already satisfied them.
