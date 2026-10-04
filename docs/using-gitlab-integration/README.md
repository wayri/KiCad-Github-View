# Using GitLab integration

The browser extension opens supported KiCad drawings from public GitLab.com repositories and lets you keep local review notes anchored to the project, ref, file, object, point, or drawing area. It does not connect a GitLab account or publish notes to GitLab issues or merge requests. For remote discussion, use GitLab's own issue or merge-request page and post the note manually.

The screenshots below show the actual viewer in a local preview harness using local fixture files and mocked Git metadata. They do not show a live GitLab repository, create a GitLab issue, or post a remote comment.

## Open and inspect a KiCad file

Install the browser extension and allow access to `gitlab.com` as described in [INSTALL.md](../INSTALL.md). Open a public repository **Files** page and select a `.kicad_sch` or `.kicad_pcb` file. The viewer reads the public GitLab revision and displays the saved design as a read-only drawing.

![PCB component selected in the GitLab viewer with Explorer and saved properties visible](../images/integration/gitlab-part-properties.jpg)

Use **Explorer** to browse parts, nets, layers, sheets, search results, BOM, and saved ERC/DRC reports. Select a component to see its saved reference, footprint, net, coordinates, assembly status, and other available properties in **Inspect**. Search can find design objects and project files, and selecting a result locates it on the canvas. PCB net or net-class highlights help trace saved connectivity; layer controls focus the drawing on relevant copper or fabrication layers. The browser does not edit the source file or run KiCad rule checks.

For a schematic, open a sheet from the sheet list and use Back, Forward, Up, or Root to navigate the loaded hierarchy. To compare branches or commits, select the GitLab revisions and inspect base/head drawings and saved-object changes. To compare a schematic and its PCB, use **Split schematic + PCB** and choose the corresponding project file. Only public GitLab.com repositories are supported in the browser; merge-request file cards and self-hosted GitLab are not included.

![Shared schematic viewer with sheet navigation](../images/schematic-sheets.jpg)

This is a shared-renderer fixture screenshot, not a live GitLab page. Double-click a sheet symbol to open it; `E` opens part properties, `F` fits the drawing and `Home` fits its worksheet. Preserve full nested paths when choosing a paired drawing or imported annotation.

![Shared revision comparison interface](../images/revision-comparison.jpg)

Use the revision controls to choose exact branches or commits. The illustrated comparison is a local synthetic GitHub fixture of the shared comparison engine; GitLab supplies its own project and revision metadata. Project setup, saved stackup, BOM/statistics and supported repository-linked WRL/GLB models use the same renderer. Missing/unsupported assets are reported; STEP import is unavailable.

## Create a local note

Open **Review → Comments**. Use **New note** to attach the note to the current selection or drawing, **Point** and click a precise location, or **Area** and drag a rectangle. You can capture the visible contents of an anchored area as a PNG. The capture excludes viewer controls. It stays in the local/exported note; attach it manually if you post to GitLab.

Set the severity (Info, Minor, Major, Critical), review state (Open, Skipped, Resolved, or Won't fix), optional tags, and optional `@login` mentions, then write the note and choose **Save comment**. Text is limited to 4,000 characters. Up to 20 tags of 40 characters and 20 valid GitHub-style account names are accepted. Mentions are plain note metadata here: GitLab notifications are not sent.

![GitLab note editor with severity, state, tags, mention and drawing area capture controls](../images/integration/gitlab-comment-editor.jpg)

Created and updated times are generated automatically in UTC and displayed in the browser's local time zone. Editing a note or changing its state updates its timestamp. Read/unread is a separate, browser-user-specific marker; changed notes become unread again. Use severity, state, read status, text/part/tag search, ordering, and **Next unread** to triage the local notes.

![Saved local note anchored to footprint R1, with severity, tags and mention visible](../images/integration/gitlab-saved-note.jpg)

GitLab notes are kept in this browser's storage and remain provider-bound. They are isolated from GitHub comments and credentials. Notes are not synchronized to another browser or teammate until you export and share them.

## Export and import review notes

Choose **Export comments** to download a portable `kicad-review-comments.json` file. Share it with a teammate or commit the export as a Git review artifact. To restore notes in another browser, open the same GitLab project revision and drawing, choose **Import comments**, and select that JSON file. The viewer checks that the provider, project path, revision, and drawing match; it will reject notes for a different project or revision. The portable export is bounded to 100 notes and 1 MiB. The GitLab viewer has no dedicated connection control for the `.kicad-review.json` sidecar.

## Post manually through GitLab

The local viewer has no **Publish to GitLab** or prefilled GitLab composer. To share a note remotely, open the project's GitLab issue or merge-request discussion in GitLab, copy the note text and relevant anchor details from the viewer, and submit them using GitLab's normal interface. If the note includes a PNG capture, download it from the note and attach it in GitLab. Keep the exported JSON or local note if you want to retain severity, state, tags, exact drawing coordinates, and revision binding; a manual GitLab post does not sync those fields back to the viewer.

GitLab comments do not get repository policy checks, remote readback, mention notifications, or remote-state synchronization in this release. GitHub's Issue/Discussion account and publishing controls are hidden in GitLab views. See [Git host support](../GIT-HOSTS.md) and [comment data details](../COMMENTS.md#gitlab-and-vs-code).
