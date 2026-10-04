# GitHub sign-in setup

Users should choose repository access and press **Sign in with GitHub**. They approve a device code on GitHub and return to the viewer. Account tokens are encrypted in extension session storage with a non-extractable key held only in background memory. **Sign out** removes credentials and pending login; **Reset GitHub connection** also clears a custom client ID. Background restart requires sign-in again, including normal worker suspension. Sessions last at most eight hours. Public access requests `public_repo`; private access requests the broader `repo` scope. Organization approval or SSO may also be required. Advanced settings offer a fine-grained manual token for narrower repository access.

## One-time publisher registration

This development release has no registered publisher OAuth client ID. The sign-in screen explains that prerequisite; it cannot authorize an account until a valid App is configured.

1. As `wayri`, open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**. Follow [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
2. Use a recognizable application name such as **KiCad GitHub View**, and the project's repository as its homepage. Complete GitHub's required registration fields. This implementation uses device authorization, not a callback exchange.
3. Enable **Device Flow** in the App settings. Copy the public **Client ID**; no client secret is needed or bundled for this device flow. See [GitHub's device authorization documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow).
4. Set `RELEASE_OAUTH_CLIENT_ID` in `extension/github-review-api.js` to that public ID. Build and verify the packages before publishing the next version. The shared Firefox and Safari builders inherit this configuration.
5. Verify actual device approval, denial, cancellation, expiry, sign-out, public access and private access in a test repository. Package and mocked-flow tests do not establish live OAuth acceptance.

A developer can enter their own client ID under **Advanced connection settings** without changing a build. Normal users of a configured distribution should not need that field. Do not put an OAuth client secret, PAT or access token into source code or release configuration.

## Private file access

GitHub website cookies do not authenticate extension API requests. For private schematic, PCB, project and model reads, authorize private access through the configured App, or use a fine-grained token with the target repository selected and **Contents: read** permission (with normal metadata access). Add Issues/Discussions permissions only when needed for publication. An inaccessible private file may appear as HTTP 404; check the exact branch/path and token repository access.

Private pull-request comparison and private annotation readback remain unsupported. Publication to an authorized private repository requires identity verification and authenticated Contents read access to verify its review policy. Ordinary file viewing does not imply those capabilities. GitLab account connection is not implemented.

See [authentication security and cleanup](../SECURITY.md) for encryption boundaries, uninstall behavior and remote revocation.
