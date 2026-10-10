# Data Safety worksheet — requires publisher review

Prepared against Android source on 2026-10-10. This is an evidence worksheet, not completed Console answers. The publisher is responsible for reviewing the actual signed build, all dependencies and network behavior. Google defines collection as transmission off the device; solely local processing is treated differently. Specific user-initiated transfers can qualify for a sharing exception, but that does not automatically exempt collection. See [Google's definitions and form guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Data / flow | Evidence and handling | Console review needed |
| --- | --- | --- |
| Selected local drawings, models, settings and results | Document picker and local renderer; private storage for saved copies. No automatic project upload. | Solely local processing is not off-device collection. Optional publication/export flows must be considered separately. |
| Account name, provider identity, tokens and OAuth details | GitHubClient, GitLabClient, GitHubVault; HTTPS to selected provider; token encryption in AndroidKeyStore storage. | Assess User IDs and other applicable personal-info categories; account management/app functionality; optional access. Credentials should never appear in screenshots or reviewer notes. |
| Repository paths, revisions and online project requests | HTTPS to GitHub API/raw hosts or selected GitLab server. | Assess applicable files/docs and app-interaction categories, including normal service request logs. Provider access is not equivalent to a developer analytics service. |
| Comments, titles, mentions, review metadata | Local drafts until explicit publication; then stored at selected issue/discussion. | Assess other user-generated content/messages; optional app functionality. Evaluate the user-initiated sharing exception against the actual UI disclosure. Remote retention is not ephemeral. |
| Screenshots | Locally captured/pasted images; uploaded only as part of selected publication. | Assess photos/images. Verify attachment visibility and optional user-initiated transfer treatment. |
| Bookmarks, recent history, stars, preferences and BoM drafts | App-private local storage; optional user-chosen export. | Local-only unless a selected export provider transfers it. Do not assume all external document destinations are offline. |
| Ads, location, contacts, camera, microphone, advertising ID | Not requested in reviewed manifest; no advertising/analytics SDK in reviewed Gradle dependencies. | Verify merged production manifest/dependency inventory. Do not declare unsupported telemetry or permissions. |

## Security and deletion answers

Built-in native service requests use HTTPS; the Android manifest prohibits cleartext traffic. Confirm this applies to every off-device flow and SDK in the signed production artifact before asserting encryption in transit. At-rest encryption is mixed: credentials and ordinary snapshots are encrypted; large private downloaded copies and exports are not.

The app has no separate service-account registration. Confirm the submitted authentication UI does not add app-account creation and assess Google's account-deletion policy accordingly. Sign-out removes credentials, but **does not delete saved offline projects or provider posts**. Removal procedures are in [PRIVACY.md](PRIVACY.md). Do not present sign-out as account/data deletion.

## Final evidence to retain

- Production merged manifest, dependency list and signed artifact checksum.
- Local-only offline run and authenticated public/private GitHub/GitLab request traces, with secrets redacted.
- Explicit publish confirmation, uploaded screenshot handling and provider retention/permissions check.
- Sign-out, remove offline copy, remove bookmark and clear-data acceptance evidence.
- Owner-approved final Data Safety answers and matching public policy URL.

Source dependencies: AndroidX WebKit and Browser; bundled shared viewer assets also require an inventory review. Google Play/system services may process information under their own policies; do not invent SDK behavior or claim an independent security review.
