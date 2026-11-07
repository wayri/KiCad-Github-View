# Safari distribution verification

Maintainer reference for the experimental macOS package. [Safari setup](../SAFARI.md).

## Acceptance checklist before distribution

- Enable the signed development app in Safari; permit only the requested repository/API origins.
- Open a schematic and PCB inline on GitHub and GitLab; navigate file pages and GitHub pull requests without stale frames.
- Verify sheet navigation, multi-net highlighting, measurements, light/dark themes, project settings and paired schematic/PCB review.
- Load repo-linked supported WRL/GLB geometry in 3D; inspect diagnostics for missing and unsupported STEP models.
- Confirm GitHub and GitLab Options connection, sign-out/reset and self-host removal work, credentials do not enter local notes/exports, and a page cannot invoke private credential actions.
- Save a local note, export/import it, then explicitly publish one Issue and one Discussion in a test repository with appropriate permissions. For GitLab, publish a new issue and a discussion inside an existing issue. Verify receipts and avoid duplicate retries after ambiguous failures.
- Confirm HTML preview is disabled, and Options/settings are absent from `web_accessible_resources`.
- Check Safari Inspector for errors and run tests after any converter-driven source changes.

