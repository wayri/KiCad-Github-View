# Security reporting

Do not post access tokens, private repository files, OAuth credentials or private keys in public issues. Use GitHub's private vulnerability reporting when the repository owner enables it, or contact the owner privately through their published contact channel.

Reports should identify the affected version, viewer surface, reproduction steps and whether the issue crosses the isolated HTML, extension worker, repository scope or VS Code message boundary. Use a minimal synthetic example where possible.

## Authentication protection

Browser packages encrypt GitHub tokens using AES-256-GCM before writing them to extension session storage. Each save uses a fresh random 96-bit IV. Expiry metadata is authenticated; changed ciphertext, IVs or expiry fail closed. The non-extractable encryption key exists only in background-process memory and is never stored alongside the ciphertext, exported, synced or written into review files. Startup removes obsolete plaintext records and unusable records from earlier background processes. OAuth device secrets also stay only in background memory.

Sessions last at most eight hours, or the shorter expiry returned by GitHub. Background suspension/restart discards the key, so users must sign in again, potentially after an ordinary idle period in Chromium. This is an intentional security/usability tradeoff. Sign-out destroys the key, deletes credential records and cancels pending login. **Reset GitHub connection** additionally removes the custom public OAuth client ID while preserving review notes. Late login responses cannot restore a signed-out session.

Tokens are accessed only by privileged background code. Host page scripts cannot request raw credentials, and only the exact extension settings page can set, clear, reset or initiate authentication. Authenticated requests go to `https://api.github.com`; redirects are rejected. Public raw-content fallbacks never receive tokens. No OAuth client secret or refresh token is retained.

Encryption protects copied storage records; it does **not** make a decrypted bearer token non-replayable. Malicious code running inside the extension, a compromised browser/OS, privileged debugging, or process-memory capture can access credentials during use. JavaScript does not offer guaranteed zeroization of immutable strings. A request already sent before sign-out cannot be recalled.

Removing the extension clears its browser storage under the browser's extension lifecycle. There is no reliable uninstall callback that can revoke GitHub authorization. Local deletion does not invalidate a stolen plaintext token or remove the account's GitHub authorization. Revoke OAuth access in [GitHub application settings](https://github.com/settings/applications), or a manual PAT in [token settings](https://github.com/settings/tokens). See [Chrome storage lifecycle](https://developer.chrome.com/docs/extensions/reference/api/storage), [Firefox session storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session), and [GitHub token revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation).

Use narrowly scoped, expiring credentials and repository permissions. The current OAuth `repo` scope is broad; encryption does not narrow it. GitLab account connection and VS Code GitHub token publication are not implemented. Safari packages still require real macOS lifecycle verification. Automated tests verify encryption, corruption rejection, expiry, restart isolation, cleanup races, sender restrictions and credential transport; they do not establish installed-browser or live OAuth acceptance.

Repository HTML previews run separately from privileged viewer documents. Design files are read-only; review annotations can be stored locally or explicitly published. See the extension documentation for current isolation and compatibility limits.
