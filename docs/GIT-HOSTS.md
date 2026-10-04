# Git host compatibility

The browser extension embeds the viewer in supported repository file pages. A GitHub App cannot replace the website file renderer; the browser extension supplies that integration.

| Capability | GitHub.com | GitLab.com | VS Code local checkout |
| --- | --- | --- | --- |
| Schematic and PCB viewers, selection and properties | Public repositories | Public repositories | Saved local files |
| Project explorer, hierarchy, setup and repository assets | Yes | Yes, including subgroup namespaces | Yes |
| Branch/commit visual comparison | Yes | Yes | Git revisions |
| Inline pull-request / merge-request file cards | Pull requests | Not yet | Not applicable |
| Local annotations and review JSON export | Yes | Yes, isolated by provider | Yes |
| Account connection and issue/discussion publication | GitHub controls | Not yet | GitHub controls |
| Private repository browser previews | Not yet | Not yet | Available after a local checkout |
| Self-hosted hostnames | Not yet | Not yet | Local files are host-independent |

## GitLab.com installation and behavior

Reload the updated extension in `chrome://extensions` or `edge://extensions` and allow access to `gitlab.com`. Open a public `.kicad_sch`, `.kicad_pcb` or supported project file under a repository's **Files** page. The extension uses the page's repository, file and ref metadata so branch names containing slashes are not guessed from the URL. If that metadata or preview container is unavailable, it leaves the source view intact.

Repository reads use the GitLab REST API on the exact `gitlab.com` host. Drawing and comparison sessions resolve refs to commit SHAs before loading project files. Tree discovery and file/model retrieval have pagination, size and time limits; incomplete listings are reported. API failures and rate limits appear as viewer errors. Public GitLab reads do not send GitHub credentials.

GitLab comments are saved in browser storage, with provider-bound anchors, severity, state, mentions and geometric locations. Export the review JSON and commit it to the repository manually to share it. This release does not sync GitLab notes to issues, enforce GitLab contributor policies, notify mentioned users, or connect GitLab accounts. GitHub publication and sidecar controls are hidden in GitLab viewers.

## Adding providers

GitLab transport is isolated in `extension/gitlab-provider.js`; routes and host-page mounting are handled by `parsing.js` and `content.js`. Shared parsers, renderers, properties and interaction code use validated repository/ref/file requests. Additional providers require their own exact-host adapter, page metadata integration, permissions, pagination, sender validation and tests. Bitbucket, Azure DevOps, Gitea and self-hosted GitLab have not been implemented.

The renderer remains read-only and existing rendering limitations apply on every host. Imported ERC/DRC reports are displayed; the browser does not run native rule checks.
