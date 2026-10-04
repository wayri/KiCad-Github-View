# Review comments and GitHub integration

KiCad Visual Review stores comments alongside the design context they refer to: repository, revision, KiCad file, optional object identity or reference, and a point or rectangular area in drawing coordinates. Each note can also carry severity (`info`, `minor`, `major`, or `critical`), tags, mentions, text, timestamps, and a local state (`open`, `skipped`, `resolved`, or `wont-fix`). Area captures can include a PNG. These annotations help reviewers discuss saved design data; they do not modify the schematic or board.

## Where notes are stored

In the browser extension, notes use browser-local storage by default. To share them through Git, open the extension's **Options**, choose **Connect existing file** or **Create review file**, and select `.kicad-review.json` in your checkout. The extension validates the file and its permission, then reads and writes it as the shared annotation store. Stage and commit the file with your normal Git workflow; the extension does not create commits. Chrome may ask you to renew file access after a restart. Disconnecting the file returns the viewer to browser-local drafts; it does not migrate those drafts automatically. Use the review JSON export/import controls when you want to move drafts explicitly.

The sidecar uses schema version 1 and contains annotations, including any confirmed GitHub thread references, but never credentials. It is limited to 1,000 notes and 4 MiB. Notes have a 4,000-character text limit and at most 20 tags of 40 characters each. JSON import/export is limited to 100 notes and 1 MiB; browser-local storage is limited to 100 notes per file and revision. PNG captures are limited to 1,024 pixels per side and 262,144 data-URL characters, and the total sidecar limit still applies. Remove captures or store large evidence separately if the sidecar approaches its limit.

The extension serializes its own browser-tab writes, checks whether the file changed externally before saving, and rejects stale note edits. This is optimistic conflict detection, not a lock shared with other applications. Avoid editing the sidecar in an editor while the browser is saving. Invalid existing JSON is left intact rather than replaced. If a conflict is reported, reload the notes and retry your edit.

## Connecting GitHub

GitHub publishing is optional. Open the extension **Options** page and either connect through GitHub device sign-in or enter a personal access token. Device sign-in requires the registered OAuth App client ID and Device Flow enabled for that app; the extension requests the `public_repo` scope. A manually entered token must have access to the repositories you intend to review. Issue and pull-request comments require Issues write access. Discussions require the account/token to be permitted to use GitHub Discussions through GraphQL. Fine-grained tokens may also need access to the target repository. GitHub decides the final permissions, and the extension reports denied or missing access.

Tokens live in Chrome session storage, are made available only to the trusted extension context, and clear when the browser session ends. They are not written to `.kicad-review.json` or exposed to GitHub page scripts. The OAuth client ID is stored in extension local settings; the temporary device code is session-only. Remove the token from Options to disconnect it sooner. Grant access only to repositories you review.

## Repository comment policy

Before publishing, the extension checks the target public repository's `.kicad-review-policy.json` on its default branch. If the file is absent, the default policy allows any signed-in account that can publish to the repository. A malformed or unverifiable policy blocks publication. The file format is:

```json
{
  "schemaVersion": 1,
  "commenting": {
    "mode": "contributors",
    "allowlist": ["reviewer-login"]
  }
}
```

`mode` can be `all`, `contributors`, `collaborators`, or `allowlist`. The optional `allowlist` is limited to 100 GitHub logins. In `all` mode, a connected account may publish. The other modes require the extension to identify the signed-in account; the repository owner and listed accounts are accepted, while `contributors` additionally checks GitHub's contributor list and `collaborators` checks collaborator permission. `allowlist` accepts only the owner or listed accounts. If GitHub cannot verify the required identity or repository status, publication is blocked rather than assuming access. The policy is checked against the public default branch, so changes there govern all revisions being reviewed.

## Publishing a note

Create and save the annotation in the drawing viewer first. Choose its GitHub destination (a new issue, an existing issue or pull request, a new discussion, or an existing discussion); for a new discussion, load and select a category. Then click **Publish to GitHub** on the note. Saving or opening a drawing never publishes automatically. The extension posts a new issue for a new issue destination, an issue comment for an existing issue or pull request, a new discussion, or a discussion comment, as appropriate.

Published text includes the note, severity, state, tags, mentions, date, repository, revision, file, and available object/location/variant anchors. A hidden `kicad-review:v1` marker preserves validated note metadata so the browser can identify its own annotations on later readback. PNG image data is excluded from API posts. The note indicates that a capture exists in the sidecar; download the PNG and attach it yourself in GitHub if reviewers need the image. **Open GitHub composer** fills a GitHub form with the annotation but leaves submission to you.

On confirmed success, the local note records the GitHub repository, thread number, URL, publication time, and available remote ID. Repeating a confirmed publication recovers its saved receipt and does not create another post. If the request outcome is uncertain (for example, a network interruption after GitHub may have accepted it), the extension marks it pending and will not retry automatically, because that could duplicate a comment. Inspect GitHub before taking further action. There is no in-extension recovery control for an ambiguous publication; the pending record is kept in extension local storage.

The state shown on a note is local review metadata. Marking a note resolved or skipped does not close a GitHub issue or edit an earlier GitHub post. The extension does not automatically synchronize remote issue state or edits back into the note.

## Reading existing GitHub annotations

For public repositories, **Refresh from GitHub** reads issue and pull-request bodies and comments through GitHub's unauthenticated public REST API. It scans up to 200 recent issues and pull requests, and up to 100 comments on the selected issue or pull request. It imports only bodies with a valid `kicad-review:v1` marker whose repository, revision, and file match the open drawing. Older threads, excess comments, malformed markers, and API rate limits can limit results; the viewer reports truncation or API warnings. A selected issue or pull request can be fetched separately when it falls outside the recent-thread scan.

Discussion readback is not implemented. Ordinary GitHub comments without the extension's marker are not converted into KiCad annotations. Readback does not merge remote edits or state changes into existing local notes. To discuss an imported note, open its linked GitHub thread. GitHub's public API limits apply.

## GitLab and VS Code

On GitLab.com, notes are local to that browser and anchored to the GitLab project/ref/file. They can be exported as review JSON and committed manually, but GitLab account connection, GitLab issue or merge-request publication, remote readback, and repository comment policies are not implemented. GitHub publication and GitHub sidecar controls are hidden in GitLab viewers.

The VS Code extension saves annotations through the workspace file system and can use a Git-tracked `.kicad-review.json` file in the workspace. It does not currently offer GitHub token setup or publication from the VS Code viewer. A note created in VS Code has local/workspace provenance; copying its JSON sidecar does not automatically make it a GitHub-anchored note. Browser and VS Code writes do not share an atomic lock, so avoid editing the same sidecar from both at once.

Automated checks use mocked GitHub responses. They do not create live issues, discussions, or comments, and they do not prove that a particular repository's token permissions or policy will allow publication.
