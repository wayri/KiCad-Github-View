# Pocket KiView 1.50 deployment preparation

Prepared 2026-10-11 for source release **v0.12.38**, Android **1.50 / versionCode 53**, package `dev.kicadvizdiff.android`. This record supersedes the 1.49 artifact references for the new candidate. It does not replace the earlier compliance findings or constitute Play approval.

Subsequent [photo/AR and testpoint work](../PHOTO-AR-TESTPOINTS.md) is present in the current source/debug APK, but is absent from the signed bundle and release archives recorded below. A candidate containing it needs a fresh build, artifact verification, camera permission/declaration evidence, hosted privacy update and physical-device acceptance before deployment. The historical checksum below identifies the earlier candidate only.

## Candidate artifacts and verification

- Play upload bundle: `dist/play-android-1.50/pocket-kiview-play-1.50.aab`.
- Verified SHA-256: `ea5a33e459280108fb3d1549b85717c964703e6bc36134ae942aec1ffb5803f0`. Upload signature verified with jarsigner; source asset parity verified for 118 viewer assets. Release manifest: package `dev.kicadvizdiff.android`, version1.50/code53, minimum API26, target API36, non-debuggable. Zero native `.so` entries. Permissions: Internet, optional notifications, boot completed for temporary-copy reminders, and the dependency-generated signature-protected receiver permission. Certificate and detailed evidence are adjacent to the AAB.
- Retain its SHA-256, upload certificate, signature verification, merged release manifest, SDK/permission inventory and native library inventory in the release evidence before upload. A successful debug APK build does not establish any of these release-bundle facts.
- Associate final source tests, packaging checks, Android release build/lint results and artifact hashes with this exact candidate. Earlier 1.49 build/install evidence and browser checks are supporting evidence only.
- Keep the upload private key and recoverable password out of source and release archives; retain an independent secure backup. The public upload certificate may accompany the bundle.

## What this candidate adds

Repository tree/quick actions; comment destination selection; dedicated settings and KiCad-style themes; supported repository/embedded 3D models; layout measurement; saved-result plots, probing and supported overlays; BoM quantities, local variants and assembly/procurement drafts; inert iBOM and exported BoM Studio imports; selected offline engineering calculators; and a dedicated Gerber viewer/analyzer with source-hashed reports. Format support remains bounded as documented in [BoM tools](../BOM-ASSEMBLY.md), [calculators](../CALCULATORS.md) and [Gerber review](../GERBER-VIEWER.md).

## Ordered deployment steps

1. Verify final signed bundle evidence and confirm owner approval of the [listing](LISTING.md), privacy/contact details and declarations. Use the current bundle, not the 1.49 file named in historical records.
2. Confirm Play App Signing enrollment and upload-key identity in Console. Upload the bundle to **internal testing** and retain Console validation and Bundle Explorer evidence.
3. Install the Play-delivered build and record version/code and artifact association in [ACCEPTANCE.md](ACCEPTANCE.md). Test minimum/current Android, phone/tablet, Back/keyboard/accessibility, offline reopening and provider authorization. Verify any signing migration preserves intended data; do not assume a debug installation can be updated by Play.
4. Exercise the new BoM/variant/import, calculator, Gerber/drill and saved-result flows on that build, including unsupported/malformed inputs, storage failures and large sets. Confirm visible limitations, unsnapped measurement behavior, source scope and export contents. Check repository/embedded models and missing-model state in 3D.
5. Verify real authenticated comment publishing/readback, rules acceptance, block/unblock and report delivery. Reporting currently opens an email draft; it is sent only when the user sends it. Obtain actual delivery/moderation evidence and assess the outstanding reporting-policy question.
6. Resolve material pre-launch crashes/ANRs and accessibility findings, collect genuine current phone/tablet store screenshots, and complete any closed-testing/production-access requirement shown for the owner's account.
7. Submit for production only after owner decisions, runtime acceptance and declarations are complete. Record the track, rollout choice and owner sign-off separately from source-release publication.

## Pending gates

| Gate | Still required |
| --- | --- |
| Owner/account | Legal publisher identity, account type/creation date and Console eligibility; final audience, countries, pricing, category, rating and ads declarations. Existing Play account is confirmed; its type is unknown. |
| Signing | Secure independent key/password backup, enrollment/Console validation and Play-delivered installation of this exact candidate. |
| Contact/policy | Verify receipt and monitoring of `support.kiview@sigharmonic.com`, public policy availability/current copy and Console entries. The renamed mailbox has not been verified here. |
| Privacy/access | Owner-approved Data Safety answers against actual requests/dependencies; safe reusable reviewer access for authenticated features; deletion/sign-out/offline-copy behavior evidence. |
| Moderation | Actual report receipt, ongoing moderation ownership/escalation and suitability of the email-draft reporting route. Local blocking is not a provider-account block. |
| Acceptance/assets | Exact-build internal-track phone/tablet/minimum/current Android and 16 KB environment checks, authentication and export flows, pre-launch review and current genuine screenshots. |

See [OWNER-DECISIONS.md](OWNER-DECISIONS.md), [DATA-SAFETY.md](DATA-SAFETY.md), [APP-ACCESS.md](APP-ACCESS.md), [MODERATION.md](MODERATION.md) and [SUBMISSION.md](SUBMISSION.md) for the worksheets. Their old artifact/version references are historical; use this candidate and its final evidence for 1.50. No Console upload, provider message or store publication is performed by preparing these files.

Current policy references rechecked 2026-10-11: [target API36](https://developer.android.com/google/play/requirements/target-sdk) and [conditional personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465). Console eligibility remains an owner/account fact.

Release verification: **76 Python tests and 1,047 JavaScript tests passed**, including installed native KiCad reference exports. Android debug/lint/unsigned bundle and upload-signed bundle builds passed. Distribution packages and exact source asset inventories were audited in `dist/release-v0.12.38`. Git commit/tag/publication is pending source-snapshot authorization; the candidate manifest accurately records a dirty checkout until then.
