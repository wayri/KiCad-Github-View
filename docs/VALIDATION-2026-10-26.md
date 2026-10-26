# Non-phone completion and validation — 2026-10-26

The current Android, Chromium and VS Code packages include the shared UI,
performance, collaboration, testpoint, repository browsing and 3D selection work.
No phone installation, release, repository push or marketplace publication was
performed during this completion pass. iPhone work remains excluded.

## Final audit fixes

- Remote file trees and commit history share one pinned revision, including when
  a branch advances between requests. Unexpected directory/history snapshot
  changes are rejected rather than merged silently.
- Lazy folder browsing without a VS Code Git provider omits invalid revision IDs.
- VS Code first-page history refresh follows current HEAD; older pages remain
  pinned. Truncated branch lists retain the current branch. Trust revocation
  stops in-flight Git browsing.
- 3D selection uses clean box edges, one combined boundary per selected component,
  actual instance geometry bounds, scene depth and no duplicate direct-selection
  overlay. Selection refreshes as linked/embedded model geometry arrives.

## Verification performed

- Full JavaScript suite: **1,318 passed**, none skipped.
- Python app, jobs, local viewer, release and packaging suites: **59 run, 58 passed,
  1 skipped**. The skip is retained as an unverified case, not counted as a pass.
- Android `assembleDebug`, `assembleDebugAndroidTest`, `lintDebug`: passed.
- Isolated Android emulator: **210 native repository metadata checks passed**,
  exercising fake HTTPS responses, pinned traversal, pagination, cancellation and
  authentication boundaries. This is native runtime coverage without a phone or
  live provider credentials.
- Isolated native persistence/authentication/transport/frame-boundary suite:
  **1,498 checks passed**.
- Isolated emulator UI suite: **14 checks passed**, including full-window bounds,
  header/menu layout, testpoint actions and stable status updates. Four retained
  screenshots are in `.vizdiff/collaboration-acceptance/emulator-final`.
- Chrome ZIP, VSIX and APK: current repository explorer and SPIKE bundle compared
  byte-for-byte against source; no iOS payload found. Artifact paths, sizes and
  SHA-256 hashes are recorded in `.vizdiff/nonphone-artifacts.json`.
- Browser 3D acceptance: actual embedded-model geometry, direct selection,
  cross-selection and clear. Desktop and 390-pixel repository browser acceptance
  used retained Git metadata and the actual shared UI; this does not establish
  installed-provider end-to-end behavior.
- Native VS Code conflict resolver opened and exposed expected compact controls.
  Screenshot capture was obscured by another foreground application and is not
  treated as visual acceptance. Earlier BoM native and conflict browser evidence
  remain available in `.vizdiff/collaboration-acceptance`.

## Deliberate limits

VS Code inventory shows working files; its public Git API does not supply historical
file trees. Commit graphs show the selected ancestry, not a union of all branches.
Large listings are bounded with explicit warnings and lazy directory fetching.
Restricted or imported-only workspaces explain when history is unavailable.
Physical Samsung gestures, cutout behavior and performance must be rechecked on
the final package later. Existing real GitHub posting/readback evidence predates
this completion pass; no new public comments were posted here.


## Loader cancellation follow-up

The shared loader now offers Stop for cancellable reads and terminates parsing
workers. Chrome isolates cancellation by trusted viewer and load ID, including
website-session fallback reads. Android cancels scoped HTTP/local input and uses
accepted-project acknowledgments to reject cancelled late delivery. Shared
snapshots preserve other subscribers. VS Code preparation uses a self-contained
blob worker with an explicitly scoped CSP resource. Large jobs cannot silently
fall back to an uninterruptible UI-thread parse. Initial waits are bounded and
stopped drawings offer Retry loading. Publishing and writes do not offer Stop.

Follow-up checks: 1,355 JavaScript checks and 17 package checks passed; 53 targeted
native cancellation checks passed on the isolated emulator. The shared Stop
control was clicked against an actual stalled local HTTP body and a busy worker;
both stopped, and a fresh worker retry could also be stopped. These are isolated
transport/runtime fixtures, not live provider-account tests.

The final Chrome ZIP was compared byte-for-byte with its 359 source assets; the
VSIX shared-asset audit covered 314 files. Chrome requests no additional
permissions and contains no iOS payload. Its SHA-256 and audit are retained in
`dist/chrome-store-0.12.59/`. Store upload is pending owner sign-in.

The additional full native regression run did not complete: the isolated emulator
stalled while creating a WebView in FrameBoundaryChecks, after earlier checks
returned. It was stopped; the subsequent UI invocation reported a process crash.
Neither run is counted as passed. The targeted 53 cancellation checks and Android
build/lint passed separately. No physical-phone acceptance is claimed.

## Phone navigation refinement (Android 1.62 / extension 0.12.60)

File cards were replaced with indented folder/file rows in the project Files
page. Repository browsing uses SVG file/folder icons, consistent name slots and
flat rows; action controls remain separate. Project tools use full-width aligned
navigation rows. Shared Android controls use consistent touch targets, gutters,
form spacing and readable placeholders, preserving the native safe-area rules.

All 1,355 JavaScript checks passed. Android assembleDebug and lintDebug passed.
The final APK's four changed UI assets matched source byte-for-byte. Chromium's
359 files and VSIX's 314 shared assets passed the source/package audit. Checksums
are in `dist/phone-ui-1.62/`; these local packages have not been uploaded to stores
or installed on a phone in this pass.

Actual browser previews at 320px, 390px and 768px exercised dark and light layouts
using the real CSS/controllers with synthetic project data. Nested folders,
search with parent context, long filename truncation and file activation were
checked. Screenshots are in `.vizdiff/phone-ui-polish/`. This is browser layout
acceptance, not physical-device/WebView or live-provider acceptance.

## Conversation and Git-history parity (0.12.61 / Android 1.63)

- 1,403 JavaScript checks passed, including real temporary Git repositories,
  pinned historical project/model reads, both generated provider API adapters,
  simulated screenshot publication, duplicate receipts, concurrent retry exclusion,
  foreign-provider/host annotation rejection and workspace-bound GitLab sidecars.
- 20 Python packaging/release checks passed. Source/package audits cover 359
  Chromium files, 315 shared VSIX assets, generated host adapters and final APK
  conversation assets. Checksums and audit are in `dist/parity-0.12.61/`.
- Android assembleDebug, assembleDebugAndroidTest and lintDebug passed. The isolated
  emulator executed 54 native GitLab conversation checks. This test uses synthetic
  transport; no remote issue or screenshot was posted.
- The actual shared browser UI displayed a synthetic GitLab issue body, comments,
  a grouped reply and closed state at phone/desktop widths. Reply selected the
  existing issue number and retained an unpublished draft. Screenshot:
  `.vizdiff/parity-browser/conversation-preview.png`.
- Installed the final APK on the connected Samsung SM-A366E using `adb install -r`.
  The device reported versionName 1.63 / versionCode 66. No uninstall or data-clear
  command was used. New on-phone account connection/posting was not exercised.

VS Code GitHub sign-in uses the native account provider; GitLab uses exact-host
SecretStorage. Credential-bearing requests are bound to the trusted Git remote.
Pinned publication/readback compares raw saved Git blobs; ordinary conversation
reading does not require a clean displayed source. Historical viewers are separate
read-only snapshots and never substitute working files for missing saved files.

Remote behavior was verified with mocked transport, not new live-account posting.
No store upload was performed. Notification inbox/live synchronization and GitLab
merge-request publication remain outside this preview; historical viewer edits and
publication are deliberately unavailable.
