# Publisher-managed GitLab sign-in

Ordinary users choose **Sign in with GitLab**, authorize Pocket KiView on the
selected server, and return to their project. They do not register applications,
copy an Application ID or enter a client secret. Publication uses their own
account permissions. The publisher performs registration once for its releases;
self-hosted administrators configure their own instance once.

## Release prerequisite

The checked-in `extension/provider-oauth.json` contains the publisher-owned
GitLab.com public Application ID registered for **Pocket KiView**. Its currently
registered callback is Android’s `kicadvizdiff://gitlab-oauth`, with `api` scope
and Confidential disabled. This registration was created through GitLab settings
under the publisher’s normal account with explicit approval.

Browser callbacks must still be registered against the publisher’s stable
extension identity before browser OAuth can be accepted. Do not treat the
Android registration alone as proof of browser login support. For another
instance or edition, register a publisher-owned **public, non-confidential**
OAuth application with the exact callback used by that edition. Keep any generated secret outside the application;
public-client PKCE does not use it. Copy only the public Application ID into the
release configuration. Never reuse another publisher's client ID.

GitLab's [PKCE documentation](https://docs.gitlab.com/api/oauth2/#authorization-code-with-proof-key-for-code-exchange-pkce)
describes authorization and token exchange without a client secret. Its
[application registration documentation](https://docs.gitlab.com/integration/oauth_provider/)
describes publisher/group/admin application ownership.

The public configuration has exactly this structure, with registered IDs added
by the publisher or build configuration:

```json
{
  "version": 1,
  "gitlab": {}
}
```

Each `gitlab` entry maps an exact HTTPS origin to an object containing only
`clientId`. No tokens, client secrets, redirects or project content are accepted.
For a GitLab.com release, the build input is
`POCKET_KIVI_GITLAB_CLIENT_ID`. This value is a public ID, not a secret. The build
must package the same configuration as the browser's `provider-oauth.json` and
Android's `viewer/provider-oauth.json`. A missing or invalid entry leaves sign-in
unconfigured; it must never fabricate an application registration.

## Callback registration

- Android currently uses `kicadvizdiff://gitlab-oauth`. Register this exact URI
  and exercise a real browser round trip before promoting a release. PKCE and
  single-use state bind the callback to its originating native login attempt.
- Chromium uses `chrome.identity.getRedirectURL('gitlab')`, normally
  `https://<extension-id>.chromiumapp.org/gitlab`. Stabilize the publisher's
  extension ID before registering this URI. Keep the matching public manifest
  key for unpacked builds where necessary; never package the private signing key.
- Other browsers may supply different callbacks or lack the identity API.
  Register and test each supported edition's actual callback. Do not silently
  substitute another browser's redirect URI.

Chrome documents the [identity callback](https://developer.chrome.com/docs/extensions/reference/api/identity)
and [consistent extension ID](https://developer.chrome.com/docs/extensions/reference/manifest/key).
Separate registrations per edition simplify callback ownership and revocation.
Desktop WayriCAD should use its own registered callback and protected credential
store; a browser connection does not authorize native token sharing.

## Self-hosted instances

A GitLab.com client ID does not identify an application on another GitLab
instance. The instance publisher or administrator registers its own public
application and distributes the instance's public ID with the approved package
or advanced host configuration. Exact origins are isolated: there is no
cross-host fallback. The browser retains advanced per-host public-ID overrides
for managed deployments. Users should not need to register their own app.

## Implementation and acceptance

The browser's `KiCadProviderOAuth.clientId(host)` reads only the fixed packaged
configuration URL once, streams at most 16 KiB, rejects redirected or malformed
content and returns an empty ID for an unavailable host. The native
`GitLabOAuthConfig.resolve(context,host)` reads only its packaged asset with the
same bounds. Neither reads configuration from a repository or downloaded file.
An advanced browser override takes precedence for its exact host; reset restores
the packaged default. Ordinary UI needs only the provider connection state.

Before release, verify:

1. Signing in with the packaged ID needs no user Application ID input.
2. The exact registered callback works in the installed browser/app.
3. PKCE, random single-use state, cancellation, expiry and callback validation
   reject late, duplicate, malformed and mismatched responses.
4. Granted scope and Bearer token type are checked before storing credentials;
   credentials stay in protected provider-specific storage.
5. An absent/invalid ID fails before opening authorization, with an accurate
   publisher/admin configuration message.
6. Self-hosted authorization uses only that instance's configured ID and host.

Automated configuration tests establish parsing, isolation and transport bounds.
They do not prove the Application ID is registered or that live authorization
works. A real installed-edition login remains necessary once registration exists.
