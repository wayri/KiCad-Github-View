# KiCad review annotations

Notes record text, severity, tags, Open/Resolved/Won't fix state, timestamps and repository/revision/file/object/position/variant anchors. Published thread references record repository, number and exact GitHub URL. State changes are local metadata; they do not close issues or edit earlier posts.

## Git-controlled storage

Open extension settings and connect or create `.kicad-review.json` in your Git checkout. Grant file permission, then stage and commit it normally. The schema is `{ "schemaVersion": 1, "annotations": [] }`. Tokens never enter this file. The connected file is authoritative; migrate existing browser drafts explicitly using export/import. Without a connected file, notes stay in device storage. File permission may need renewal after restarting Chrome.

Writes validate the document, serialize browser-tab updates and check external changes before committing staged data. This is optimistic conflict detection, not an atomic lock across Chrome and VS Code; avoid simultaneous writes from both applications. Stale editor timestamps are rejected and malformed files are preserved. Sidecars allow 1,000 notes and 4 MiB; device storage allows 100 notes per file/revision; imports allow 100 notes and 1 MiB. Text is bounded to 4,000 characters and tags to 20 entries of 40 characters. VS Code notes retain local/workspace provenance; copying a sidecar does not automatically bind them to a GitHub repository.

## Direct GitHub publishing

Enter a personal access token only in extension settings. It stays in Chrome session storage and clears on browser restart; it is never returned to GitHub page scripts. Grant Issues write permission for issue/PR comments and Discussions access for discussions. See the [Issues REST API](https://docs.github.com/en/rest/issues/issues) and [Discussions GraphQL guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions).

Choose New issue, Existing issue, New discussion, Existing discussion or Pull request. For a new discussion, load and choose a category. Save the note and click its **Publish to GitHub** button. Loading a drawing or saving a note never posts automatically. Successful publishing saves the remote link. Retrying a confirmed successful request recovers its receipt without duplicating the post. An uncertain response stays pending to prevent duplicate posts; inspect GitHub before further action. There is currently no reset/recovery interface for ambiguous writes.

The separate **Open GitHub composer** action fills an empty form without submitting it. Shared Markdown includes visible metadata and a validated kicad-review:v1 marker. Public issue/PR readback scans up to 200 recent threads and 100 comments on a requested thread and matches repository/revision/file. API limits and truncation are reported. Discussion readback, automatic remote state synchronization and mapping unmarked comments are not implemented. VS Code currently tracks local notes without token publishing. Automated tests mock GitHub and do not create live posts.

## Area evidence and triage (0.9.0)

Point anchors use saved drawing coordinates. Area anchors store a bounded `{x,y,width,height}` rectangle in millimetres. The editor's Capture area action crops the visible 2D drawing into a PNG up to1024 pixels per side and262144 data-URL characters. The sidecar retains it; the card previews and downloads it. An off-screen area must be brought into view first. Capture does not include UI overlays or 3D.

Severity, tags, state and text filters support triage. Shared note metadata travels in the GitHub issue/discussion marker, but PNG data is excluded. Download and manually attach the PNG in a GitHub composer; API publication does not upload it. Sidecar and exported JSON remain bounded to1 MiB. Remove captures or retain a separate Git-controlled evidence file if the review exceeds this limit. State changes remain local and do not automatically close GitHub issues.
