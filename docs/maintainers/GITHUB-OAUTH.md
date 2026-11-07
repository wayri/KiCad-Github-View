# GitHub OAuth application configuration

Maintainer reference. Users should follow [GitHub accounts and repository access](../GITHUB-SIGNIN.md).

## One-time publisher registration

From v0.11.10, browser packages include the registered publisher OAuth App public Client ID `Ov23li8RsSVZk2dHptN1`. Normal users can press **Sign in with GitHub** without configuring advanced settings. The publisher must keep Device Flow enabled; live authorization is completed on GitHub by each user. The steps below are for maintainers changing or independently registering an App.

1. As `wayri`, open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**. Follow [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
2. Use a recognizable application name such as **KiCad GitHub View**, and the project's repository as its homepage. Complete GitHub's required registration fields. This implementation uses device authorization, not a callback exchange.
3. Enable **Device Flow** in the App settings. Copy the public **Client ID**; no client secret is needed or bundled for this device flow. See [GitHub's device authorization documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow).
4. Set `RELEASE_OAUTH_CLIENT_ID` in `extension/github-review-api.js` to that public ID. Build and verify the packages before publishing the next version. The shared Firefox and Safari builders inherit this configuration.
5. Verify actual device approval, denial, cancellation, expiry, sign-out, public access and private access in a test repository. Package and mocked-flow tests do not establish live OAuth acceptance.

A developer can enter their own client ID under **Advanced connection settings** without changing a build. Normal users of a configured distribution should not need that field. Do not put an OAuth client secret, PAT or access token into source code or release configuration.

