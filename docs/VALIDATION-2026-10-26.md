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
