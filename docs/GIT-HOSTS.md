# GitHub and GitLab projects

Open a repository in your browser, then click the KiCad Online extension icon. One detected project opens directly; multiple projects offer a chooser. The normal repository page stays visible unless you choose the optional in-page viewer.

[Installation](INSTALL.md) · [Comments](COMMENTS.md) · [Managed-browser help](MANAGED-BROWSERS.md)

## Choose how to open your project

| Source | How to use it |
| --- | --- |
| GitHub.com | Open the repository or project folder in the browser profile that has access, then click the extension icon. Keep the source tab open. |
| GitLab.com | Open the project in a signed-in tab and click the icon. Keep the matching project tab open. |
| Self-hosted GitLab | First grant access to the exact HTTPS server in Options, then open the project there. URL-subpath installations are unsupported. |
| Local checkout | Import the complete folder/ZIP, or open its saved drawings in VS Code. No provider account is needed for local inspection. |

GitHub Enterprise, Bitbucket, Azure DevOps, Gitea and Forgejo integrations are not implemented. You can still import supported files downloaded through those services.

## Private and organization-managed projects

Browser-session loading uses the access already available in the matching source tab. Viewing supported project files does not require a broad repository OAuth connection. Complete any SSO prompt in that browser profile before opening the viewer.

This does not bypass organization policies. Downloads, third-party extensions or some files may still be blocked. An HTTP 404 can mean denied access as well as a missing path. Check that the file opens in the same profile, verify the branch/folder and read the viewer's diagnostic.

If discovery is incomplete, open the known project folder or root schematic. Include subsheets and model files. For local review, use a provider-permitted folder or ZIP download; importing it does not grant remote commenting access.

The viewer resolves supported revisions to saved commits. Missing or truncated inventory is reported rather than treated as a complete design. See [GitHub snapshot loading](GITHUB-WEBSITE-VIEWING.md) for discovery and cache limits.

## Self-hosted GitLab

Open **Options → GitLab accounts and servers**, enter the exact origin, such as `https://gitlab.example.com`, and choose **Grant server access**. Approve only the intended server. A server beneath a URL prefix such as `/gitlab` is not supported.

Server permissions and connected credentials are separate. Removing a server removes its saved connection and browser permission; review notes are retained. If an API operation needs a connected account, choose that server before connecting. OAuth setup for custom deployments is described in the [technical host reference](maintainers/GIT-HOSTS-REFERENCE.md#gitlab-accounts-and-servers).

## History and comparison

Use **History / compare** to load an available revision or compare it with the displayed source. GitHub website history is bounded; use an exact commit SHA for older revisions. Provider access, available history and complete file discovery determine which comparisons can open.

On supported GitLab merge-request **Changes** pages, the drawing selector compares the target merge base with the source head. **Refresh revisions** updates the comparison. The provider's source diff remains visible. Historical diff-version URLs are not substituted with newer revisions.

A byte-identical, uniquely matched move can appear as a rename. An edited or ambiguous move may appear as an addition/removal. An incomplete comparison is reported explicitly.

## Review conversations

Use **Comments** to save local notes, browse supported Issue/Discussion threads and explicitly post a review. Supported GitHub website-session Issue operations can send and read back replies without a separately connected API account. Other operations may need a connected account and repository permission.

GitLab Discussions belong to an existing Issue. Merge-request comment publication is not provided. A note with matching review metadata can restore drawing locations; ordinary conversation messages remain in the thread reader. [Commenting and synchronization](COMMENTS.md) covers markers, local states, refresh and retry recovery.

## VS Code checkouts

Open a trusted Git checkout with the matching GitHub or GitLab remote. GitHub uses VS Code's native account consent; GitLab uses an exact-server token held in VS Code SecretStorage. These sessions are separate from browser and Android sessions.

Pinned annotation readback and publication require drawings to match their committed source. Commit and reopen changed drawings when requested. Restricted Mode, unbound projects and historical snapshots retain local inspection without remote publication.

The Repository view can open a commit's saved drawing as a read-only snapshot without checking out the branch or replacing working files.

## Security and compatibility

Requests stay bound to their provider and approved server. Notes and exports do not contain account credentials. Sign-out and permission removal stop subsequent authorized reads; remote revocation is a separate provider account action.

Rendering coverage is shared across hosts, but permissions, browser APIs and website markup can change what is available. Imported ERC/DRC reports display saved findings rather than running KiCad checks. See [file compatibility](KICAD-COMPATIBILITY.md), [security](../SECURITY.md) and the [technical host reference](maintainers/GIT-HOSTS-REFERENCE.md).
