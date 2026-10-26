# Viewer startup and managed browsers

The development viewer reports missing/blocked scripts and uncaught runtime errors in a visible panel with **Reload viewer** and local diagnostics. Diagnostics contain resource basenames, line numbers, error types and extension version; they do not collect design URLs, source, exception messages or credentials. Nothing is uploaded automatically.

A red **!** also identifies failed repository access. Select it for guidance. An explicit administrator-policy error is labelled **Blocked by browser policy**; generic network failures, HTTP 403, sign-in failures and rate limits have their own explanations. HTTP 404 and user cancellation do not imply an organization block. Dismissing the explanation retains the badge so it can be reopened. Reloading the viewer clears its previous diagnostics.

In extension **Options → Connection and browser checks**, choose **Check viewer connection**. This explicitly checks declared GitHub host access and two public endpoints: GitHub API rate-limit metadata and a HEAD request for GitHub's public `github/gitignore` README. Requests omit credentials and project data. A failed request can indicate policy, DNS, proxy, firewall, offline access or a timeout; the check cannot distinguish those causes automatically. HTTP 404 means a server responded, not that a particular design exists or is accessible.

## Organization-managed Chrome and Edge

The user or administrator can inspect `chrome://policy` / `edge://policy`, particularly `ExtensionSettings`, `runtime_blocked_hosts` and `runtime_allowed_hosts`. Granted extension permissions do not prove organization policy allows the same access. Ask the administrator to review the installed extension ID and the hosts needed for the intended workflow:

| Workflow | Hosts |
| --- | --- |
| GitHub repository page, API metadata and raw drawing source | `github.com`, `api.github.com`, `raw.githubusercontent.com` |
| GitHub screenshot publication | `uploads.github.com` (only needed for publication) |
| GitLab | `gitlab.com`, or the explicitly configured and granted self-hosted GitLab origin |

The app does not change policy, request blanket access, disable browser security or route around blocked hosts. An administrator may decide this extension is unsuitable for an organization's policy. See Google's [extension policy documentation](https://support.google.com/chrome/a/answer/9867568) and [how to inspect browser management](https://support.google.com/chrome/answer/9281740).

## Interpreting a GitHub 404

A contents API 404 can mean a missing path/ref, an unavailable repository or concealed access denial. Check the exact file and revision, extension version, and connection results. A public repository should not need private-account permission. A 404 from GitHub's own `/_global-navigation/payloads.json` endpoint is a GitHub page-navigation request; it does not by itself establish an extension script failure. Preserve the actual request URL and extension-frame error if reporting a failure, omitting credentials or private source.

## Verification boundary

On 2026-10-26 a fresh-profile installed unpacked extension was tested on Windows Edge against the public `wayri/KiCad-Github-View` sensor PCB: the actual extension worker fetched the source, a drawing canvas loaded, and the settings control opened with no page exceptions. A separate local fixture check exercised the shared drawing entry point. These checks do not reproduce a colleague's managed Chrome policy or establish Windows Chrome/macOS acceptance. The reported failure remains unconfirmed without the exact failing repository/file, installed extension version and policy/network evidence.
