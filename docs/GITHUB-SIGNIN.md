# GitHub accounts and repository access

You can view supported GitHub projects through the browser session without connecting a separate review account. Account connection is optional and is used for provider operations that need API access.

## View a repository through your browser session

1. Open the repository in the browser profile that has access to it.
2. Complete any GitHub or organization SSO prompt.
3. Click the KiCad Online extension icon and choose the project.
4. Keep the source repository tab open while loading files.

This route uses the access you already have on GitHub. It does not request broad repository OAuth permission or bypass organization restrictions. Project discovery can be partial; open the known project folder or root schematic when the repository contains many unrelated files. For an offline copy, download the project through the provider's permitted download controls and import the complete folder or ZIP.

Cookies and CSRF tokens are not exported into review files or extension settings. See [browser-session loading](GITHUB-WEBSITE-VIEWING.md) for snapshot and size limits.

## Comment without a connected review account

Supported GitHub website-session Issue workflows can send replies and read comments back inside the viewer. Keep the matching repository tab open and use **Comments** to choose the Issue destination. Location metadata in compatible review notes restores drawing markers and areas when the source can be resolved.

A prefilled GitHub website composer is also available for manual posting. Opening it prepares a draft; it does not submit it. API-only operations and other thread types may require a connected review account. See [comments](COMMENTS.md) for destination selection, synchronization and supported operations.

## Connect a review account

1. Open Options and choose the review access you need.
2. Select **Sign in with GitHub**.
3. Approve the displayed device code on GitHub, then return to the viewer.

Public review access requests GitHub's `public_repo` scope. Private OAuth access requests the broader `repo` scope and may require organization approval or SSO. Use browser-session viewing when you only need to inspect files. Advanced settings offer a manually supplied fine-grained token for a narrower selection of repositories and permissions.

Never paste a credential into a comment, issue, design file or support report.

## Reconnect and sign out

Connected credentials are encrypted in extension session storage; keys are held in memory. Sessions last at most eight hours. Browser restart, extension reload or loss of the key-holding worker requires reconnection. Some browser background restarts can also require sign-in again.

**Sign out** removes credentials and pending login state. **Reset GitHub connection** also clears a custom client ID. Remote posts are not removed by signing out. Export local drafts before uninstalling or clearing extension storage.

## Access errors

A private file may appear as HTTP 404 when access is denied. Check the repository, branch, path and signed-in profile before reconnecting an account. An organization can block downloads or third-party apps even when you can browse some repository pages. KiCad Online cannot override that policy.

[Managed-browser troubleshooting](MANAGED-BROWSERS.md) · [Authentication security](../SECURITY.md)

Maintainers: [OAuth application configuration](maintainers/GITHUB-OAUTH.md).
