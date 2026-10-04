# Git host compatibility

The browser extension embeds read-only viewers in supported repository file pages. A GitHub App cannot replace the website file renderer; the browser extension supplies that integration.

| Capability | GitHub.com | GitLab.com and approved self-hosted GitLab | VS Code local checkout |
| --- | --- | --- | --- |
| Schematic and PCB selection, properties and hierarchy | Public and authorized private file reads | Public and authorized private project reads, including subgroup namespaces | Saved local files |
| Project setup and supported repository-linked models | Yes | Yes, credentials bound to the selected server | Yes |
| Branch/commit visual comparison | Yes | Yes | Not yet |
| Inline PR / merge-request file cards | Public and authorized private GitHub pull requests | Merge-request cards not implemented | Not applicable |
| Local annotations and review JSON export | Yes | Yes, isolated by provider and server | Git-tracked sidecar |
| Account and remote review publication | Issues, PR comments and GitHub Discussions | New issues, comments and discussion threads within existing issues | Local sidecar only |
| Annotation marker readback | Public and authorized private Issue/PR markers; selected Discussion bodies/comments/replies | Markers on a selected issue, with authorized private access | Sidecar reads |
| Self-hosted hostnames | Enterprise not implemented | Explicit HTTPS origin permission required; URL subpaths unsupported | Host-independent local files |

## GitLab accounts and servers

Reload the current browser package and open Options → **GitLab accounts and servers**. GitLab.com is built in. For another server, enter an exact origin such as `https://gitlab.example.com` and choose **Grant server access**. Approve only your intended server. A server hosted beneath a URL prefix such as `/gitlab` is not supported. Up to twenty additional servers may be configured. Removing a server deletes its credentials and OAuth Application ID, unregisters its preview and removes the browser permission; review notes are retained.

Select the server, enter an expiring GitLab token and choose **Connect with token**. `read_api` access may suffice for private viewing; issue publication requires `api` access and project permissions. Website sign-in alone does not authenticate the extension. OAuth is also implemented: register a non-confidential application on that server, copy the exact **Browser redirect URI** from Options, select `api` scope, and enter its **Public Application ID**. Choose **Sign in with GitLab**. PKCE and random state protect the authorization flow; no client secret is used. No publisher GitLab Application ID is bundled. Registration is specific to the server and browser redirect URI. If the browser identity API is unavailable, use the token connection.

Credentials are AES-256-GCM encrypted with keys only in background memory, bound to the server, and expire within eight hours or the provider's shorter expiry. Background restart requires reconnection. Sign-out/reset purge credentials; remote revocation is a separate account action. See [SECURITY.md](../SECURITY.md).

## Viewing and comparison

Open a `.kicad_sch`, `.kicad_pcb` or supported project file under the repository **Files** page. Repository/ref/file metadata disambiguates branches containing slashes. Missing metadata leaves the normal source page intact. Requests use the selected server's REST API, never GitHub credentials; redirects with credentials are rejected. References resolve to commit SHAs before project loading. Pagination, file/model byte limits and time limits apply, and incomplete discovery is reported. A private-project 404 can mean denied access as well as a missing file.

Development after v0.12.8: when GitLab reports a timed-out or size-limited comparison, the extension recovers changed drawings by comparing blob identities in both immutable commit trees. This fallback requires complete tree discovery (at most 1,000 entries per revision); incomplete discovery stops the comparison rather than inferring missing or deleted files. Unique byte-identical moves are shown as renames. Edited or ambiguous moves appear as additions/removals, with a visible explanation. Ordinary large/collapsed text diffs still use the saved drawing files for rendering. Automated provider and authorized self-hosted worker fixtures cover this fallback; installed-server acceptance remains pending.

## GitLab review comments

Choose **Review → Comments** to create a part, point or area note. Choose **Issue** for a new issue or an existing issue note. Choose **Discussion** for a discussion thread within an existing issue; GitLab has no standalone GitHub-style Discussion categories. Set the existing issue number when required, preview the formatted Markdown, and choose **Post to GitLab** or **Publish to GitLab**. Saving a draft never posts automatically. Successful publication records its link; uncertain results block automatic retries to avoid duplicates.

The GitLab collaboration tab can load validated annotation markers from a selected existing issue. It reads the issue description and at most 500 notes; only markers matching the server, project, revision and drawing become annotations. Ordinary comments are not converted into drawing notes. Full conversation history, replies and notifications remain on GitLab. PNG captures must be downloaded and manually attached. Local state changes do not close issues or synchronize remote edits.

Owners may provide `.kicad-review-policy.json` on the default branch. Malformed or unverifiable policy blocks publication. Use `all`, `collaborators` or `allowlist` as appropriate; contributors-only checks fail closed without verifiable account membership or an explicit allowlist because commit emails do not establish account identity. Provider permissions remain authoritative. GitLab notes use local storage/export rather than the connected GitHub sidecar workflow.

## Boundaries and validation

Transport is isolated in `extension/gitlab-provider.js`; authentication/publication in `gitlab-review-api.js`; approved server registration in `gitlab-hosts.js`; routes and page mounting in `parsing.js` and `content.js`. Bitbucket, Azure DevOps, Gitea, Forgejo and GitHub Enterprise remain unimplemented. All hosts share renderer limitations; the browser displays imported ERC/DRC reports rather than running native checks.

Chromium, Firefox and Safari development packages share these capabilities. Safari conversion/signing and installed-browser OAuth acceptance require a Mac; a generated ZIP is not a signed store release. Automated fixtures verify routing and API contracts, not real account permissions, provider availability or every server's page markup.
