# Data Safety worksheet — requires publisher review

Prepared against Android source on 2026-10-10. This is an evidence worksheet, not completed Console answers. The publisher is responsible for reviewing the actual signed build, all dependencies and network behavior. Google defines collection as transmission off the device; solely local processing is treated differently. Specific user-initiated transfers can qualify for a sharing exception, but that does not automatically exempt collection. See [Google's definitions and form guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Data / flow | Evidence and handling | Console review needed |
| --- | --- | --- |
| Selected local drawings, models, settings and results | Document picker and local renderer; private storage for saved copies. No automatic project upload. | Solely local processing is not off-device collection. Optional publication/export flows must be considered separately. |
| Optional camera/photos and alignment | User-started video-only camera permission, local session processing, no automatic image upload or saving. Calibration export includes source/image hashes and coordinates. | Review Photos/videos against solely local processing; account for any separately initiated evidence export/publication. |
| Account name, provider identity, tokens and OAuth details | GitHubClient, GitLabClient, GitHubVault; HTTPS to selected provider; token encryption in AndroidKeyStore storage. | Assess User IDs and other applicable personal-info categories; account management/app functionality; optional access. Credentials should never appear in screenshots or reviewer notes. |
| Repository paths, revisions and online project requests | HTTPS to GitHub API/raw hosts or selected GitLab server. | Assess applicable files/docs and app-interaction categories, including normal service request logs. Provider access is not equivalent to a developer analytics service. |
| GitHub notifications and contributor suggestions | Requested on user action from the provider; account/repository names, mentions, issue titles and timestamps displayed in app. No background push service in reviewed source. | Assess User IDs, other user-generated content and applicable app activity. Include optional notifications scope in the policy and signed-build trace review. |
| Comments, titles, mentions, review metadata | Local drafts until explicit publication; then stored at selected issue/discussion. | Assess other user-generated content/messages; optional app functionality. Evaluate the user-initiated sharing exception against the actual UI disclosure. Remote retention is not ephemeral. |
| Screenshots | Locally captured/pasted images; uploaded only as part of selected publication. | Assess photos/images. Verify attachment visibility and optional user-initiated transfer treatment. |
| Content/user reports and blocking | Follow-up source opens a user-reviewed email draft to `support.kiview@sigharmonic.com` with reason, provider, author and safe permalink when available; no automatic attachments. The user must send it in an external email app. Block settings stay in provider/profile-scoped local storage. | Assess report text/identifiers and mailbox receipt/retention, including user-initiated sharing treatment. Opening a draft is not delivery; email is not end-to-end encrypted by the app. Publisher must adopt and disclose actual report retention. |
| Bookmarks, recent history, stars, preferences and BoM drafts | App-private local storage; optional user-chosen export. | Local-only unless a selected export provider transfers it. Do not assume all external document destinations are offline. |
| Temporary downloaded projects | Private but unencrypted disk copies, fixed six-hour expiry; cleanup may be delayed. Your projects → Clear temporary downloads removes copies manually while retaining expired recent-history entries. | On-device retention does not imply ephemeral off-device processing. Recent entries remain until removed separately; clearing downloads is not account/data deletion. |
| Ads, location, contacts, camera, microphone, advertising ID | Not requested in reviewed manifest; no advertising/analytics SDK in reviewed Gradle dependencies. | Verify merged production manifest/dependency inventory. Do not declare unsupported telemetry or permissions. |

## Security and deletion answers

Built-in native service requests use HTTPS; the Android manifest prohibits cleartext traffic. Confirm this applies to every off-device flow and SDK in the signed production artifact before asserting encryption in transit. At-rest encryption is mixed: credentials and ordinary snapshots are encrypted; large private downloaded copies and exports are not.

The reviewed source has no separate Pocket KiView service-account registration; it connects existing GitHub/GitLab accounts. This is the basis for a provisional account-creation answer, not a blanket exemption: confirm the actual provider sign-in flow and Google's [account-deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) before completing Console. Sign-out removes credentials, but **does not delete saved offline projects or provider posts**. Removal procedures are in [PRIVACY.md](PRIVACY.md). Do not present sign-out as account/data deletion.

The viewer uses app-controlled WebViews: their bundled JavaScript and native bridge flows belong in the inventory. Opening external browsing pages is distinct. A user-initiated sharing exception must be evaluated for each transfer and does not automatically exempt that transfer from collection. HTTPS is transport encryption, not end-to-end encryption.

## Final evidence to retain

- Production merged manifest, dependency list and signed artifact checksum.
- Local-only offline run and authenticated public/private GitHub/GitLab request traces, with secrets redacted.
- Explicit publish confirmation, uploaded screenshot handling and provider retention/permissions check.
- Sign-out, remove offline copy, remove bookmark and clear-data acceptance evidence.
- Owner-approved final Data Safety answers and matching public policy URL.

Keep final responses in a private decision record with the Console question, selected answer, applicable flow, purpose, whether optional, recipient and supporting trace. Distinguish local-only drafts from provider publication; distinguish user-initiated sharing exceptions from collection. If reporting controls are added, inventory their destination, report reason, author/content identifiers and any optional explanatory text before signing off the form. A report opened for the user to send is not an automatic app upload; record the actual implemented route and do not assume a private recipient or guaranteed delivery.

Source dependencies: AndroidX WebKit and Browser; bundled shared viewer assets also require an inventory review. Google Play/system services may process information under their own policies; do not invent SDK behavior or claim an independent security review.
