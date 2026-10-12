# GitHub sign-in setup

Users should choose repository access and press **Sign in with GitHub**. They approve a device code on GitHub and return to the viewer. Account tokens are encrypted in extension session storage with non-extractable keys held only in memory. Supported Chrome builds retain keys in a separate offscreen worker through ordinary background idle; browser restart, extension reload or key-worker loss requires sign-in again. Other browsers use a fallback that also loses keys on background restart. Sessions last at most eight hours. **Sign out** removes credentials and pending login; **Reset GitHub connection** also clears a custom client ID. Live Chrome lifecycle verification remains outstanding; see [security boundaries and checks](../SECURITY.md). Public access requests `public_repo`; private access requests the broader `repo` scope. Organization approval or SSO may also be required. Advanced settings offer a fine-grained manual token for narrower repository access.

## One-time publisher registration

From v0.11.10, browser packages include the registered publisher OAuth App public Client ID `Ov23li8RsSVZk2dHptN1`. Normal users can press **Sign in with GitHub** without configuring advanced settings. The publisher must keep Device Flow enabled; live authorization is completed on GitHub by each user. The steps below are for maintainers changing or independently registering an App.

1. As `wayri`, open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**. Follow [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
2. Use a recognizable application name such as **KiCad GitHub View**, and the project's repository as its homepage. Complete GitHub's required registration fields. This implementation uses device authorization, not a callback exchange.
3. Enable **Device Flow** in the App settings. Copy the public **Client ID**; no client secret is needed or bundled for this device flow. See [GitHub's device authorization documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow).
4. Set `RELEASE_OAUTH_CLIENT_ID` in `extension/github-review-api.js` to that public ID. Build and verify the packages before publishing the next version. The shared Firefox and Safari builders inherit this configuration.
5. Verify actual device approval, denial, cancellation, expiry, sign-out, public access and private access in a test repository. Package and mocked-flow tests do not establish live OAuth acceptance.

A developer can enter their own client ID under **Advanced connection settings** without changing a build. Normal users of a configured distribution should not need that field. Do not put an OAuth client secret, PAT or access token into source code or release configuration.

## Private file access

The extension can fall back to the website session for private drawings, schematic hierarchies, text project files and directory reads. Open the repository in a signed-in `github.com` tab and keep that tab open while using the viewer. No pasted token or extra authorization is needed for that read-only path. Branches are resolved to a commit before reading source. Cookies, CSRF tokens and signed raw download URLs are never exported or stored. Directory data is validated against GitHub's page format; unavailable, changed or truncated data fails visibly. Inventory discovery is limited to 64 directories and 1000 supported files; each source download is limited to 32 MiB.

Website cookies do not authenticate GitHub API requests. History, private PR comparisons, binary model/PDF retrieval and remote review operations still use **Sign in with GitHub**, with private access selected. Android also uses this one-time authorization rather than another browser's cookies. Neither flow requires users to paste a token. Advanced users can instead supply a fine-grained token with the repository selected and **Contents: read**, adding publication permissions only when needed. An inaccessible private file can appear as HTTP 404; check the exact branch/path and account repository access.

The website-session fallback only reads source. Private publication, PR comparison and annotation readback require the separately connected account and applicable repository permissions.

Session-reader tests cover revision pinning, matching repository tabs, denied access, incomplete trees, redirects and response limits. Public tree and raw-download formats were checked against live GitHub responses. Installed-extension acceptance in a signed-in private repository remains to be checked.

See [authentication security and cleanup](../SECURITY.md) for encryption boundaries, uninstall behavior and remote revocation.
