# GitHub sign-in for extension publishing

The extension can publish a saved KiCad review note to a GitHub Issue or Discussion after you click **Publish to GitHub**. Its device sign-in requires a registered GitHub **OAuth App** client ID. No OAuth App or client ID is bundled with this repository yet, so the flow cannot connect until an app owner registers one.

1. [Register an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Use a homepage and required callback URL that you control; the callback is unused by device authorization. Turn on **Enable Device Flow**.
2. In the extension settings, enter that app's **Client ID** and choose **Connect GitHub**. The extension requests the `public_repo` scope, shows a verification code, and links to `https://github.com/login/device`. Enter the code there and approve the access shown by GitHub.
3. Return to the settings page. It checks authorization at GitHub's required interval and reports success, denial, expiry, or cancellation. If you close settings, reopen it before the code expires to resume checking. You can cancel at any time.

The `public_repo` OAuth scope grants access to public repositories, including broader write access than review comments alone; [GitHub documents the scope](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps). This extension only publishes when you explicitly select a note and click Publish. A GitHub OAuth App is separate from the installable GitHub App/check integration.

The device code and access token stay in extension worker storage. The client ID is saved in browser-local extension storage because it is public configuration. The token stays in `chrome.storage.session`, is never returned to a GitHub page or content script, and is cleared when the browser session ends or you select **Remove token**. If the OAuth App issues an expiring token, this version does not refresh it; reconnect after expiration. The manual personal-access-token field remains available for users who do not use the registered OAuth App.

Only `github.com` device endpoints and `api.github.com` review endpoints are contacted. No client secret is required or accepted. Mocked tests cover device-code display, minimum polling intervals, `slow_down`, denial, expiry, cancellation during an in-flight request, missing scope, and sender isolation. Live GitHub authorization and posting require a real registered app and were not exercised here.
