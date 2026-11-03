# Client-side project access

Included in the 0.12.81 GitHub preview. Store approval and installed-browser acceptance are separate.

## Viewing

Click the extension on an open GitHub or approved GitLab project tab. The extension installs a small read-only bridge in that tab's isolated world using temporary activeTab access. It opens its own viewer tab. The manifest has no permanent repository host permissions, no automatic page content scripts and no externally embeddable viewer resources. Self-hosted GitLab configuration records an approved HTTPS origin without requesting a standing viewing grant; obsolete persistent content registrations are retired.

All supported project resource loading—including schematics, PCB files, hierarchy, project settings, saved analysis/rule reports, PDFs and component models—uses the content transport independently of review-account tokens. Resources load as needed within the existing file, traversal and memory limits; this is not an unlimited download of every repository object.

GitHub uses website metadata and raw downloads, with no REST/GraphQL calls for ordinary project viewing. Private repository/folder context is resolved in the matching signed-in website tab first, including slash-containing branch names, then pinned to a commit. Public credentialless fallback is used when no matching session result is available; explicit private access denials are not converted to public discovery attempts. Private file bytes are not kept in the shared public cache. Existing bounded directory/inventory metadata caching remains repository/revision-scoped in worker memory.

GitLab uses same-origin website-cookie requests to its read-only `/api/v4` endpoints first, then credentialless public fallback. This is token-free content loading, not API-free GitLab viewing. The content adapter never asks the review connector for Authorization or PRIVATE-TOKEN headers. Self-hosted server versions and proxy/SSO arrangements may affect website-session API availability.

SSO/SAML, login requirements and administrator restrictions are respected. The extension cannot open files that the website session or organization policy forbids. Keep the chosen repository tab open; after navigation, closing it or losing temporary site access, reopen it and click the icon again. Local selected files/folders remain the fallback where permitted.

## Reviews and remote actions

Connecting an account is optional for viewing. Optional persistent provider-site grants are requested only by explicit account-connect/token-save controls for commenting and connected review actions. Existing remote mutation features, such as saving Draftsman output or creating a fork, still require explicit authorization and are not implied by loading source files.

GitHub/GitLab legacy OAuth scopes can themselves be broader than comments; a client cannot redefine provider scopes. The UI discloses GitHub private `repo` scope. For least privilege, use provider-supported fine-grained credentials or a selected-repository GitHub App with only the needed review permissions. This change isolates token use from content loading; it does not claim that legacy OAuth has become issue-only. Existing installed optional grants/authorizations may remain until the user revokes them.

## Security and acceptance

The bridge accepts only messages from this extension's non-tab contexts, and the readers validate exact website origin, repository namespace, safe paths and pinned identity. It never serializes cookies or signed raw URLs. Concurrent reads are limited to 4 and 128 MiB of reserved response budgets; individual source reads are capped at 64 MiB and binary assets at 32 MiB. Text responses do not accept login HTML as CAD source. Known SSO error codes use static messages; arbitrary provider error payloads are not forwarded.

Tests cover private/session-first flows with review-token access configured to throw, public fallback without credentials, nested namespaces/slash branches, cancellation, limits, foreign-origin/project rejection, opt-in permissions, message provenance and comment/content transport separation.

## Compatibility and permissions

| Situation | Viewing access | Acceptance evidence |
| --- | --- | --- |
| Public GitHub repository, nested project folder or pinned commit | Click the extension on that repository tab; no review login | Transport and discovery regressions with real public path inventories |
| Private GitHub repository | The normal signed-in website session, with the repository tab kept open | Installed Chrome opened a user-authorized private ESP32-PoE M2 copy and linked real models to 126 of 143 components; the review account was signed out |
| GitHub organization repository | Existing website membership and any required SSO; temporary access on the clicked tab | Origin/identity/SSO/policy failure cases tested; no live managed-organization acceptance yet |
| GitLab.com or configured self-hosted GitLab | Same-origin website session for read-only content API endpoints | Private session, nested namespace, permission revocation and authentication-page tests; live private GitLab acceptance pending |
| Administrator blocks extension installation, injection, downloads or the repository website | Administrator must permit the operation; use locally selected files where policy allows | Denial handling tested; the extension does not bypass policy |
| GitHub Enterprise Server on a custom domain | Not currently supported by the GitHub adapter | Do not grant a broad account token as a workaround |

Viewing does not require a GitHub OAuth `repo` grant, GitLab API token, organization-owner role, administrator role, cookie-reading permission or access to every repository in an account. Temporary `activeTab` access still lets the extension read the clicked website tab: this is real access and should not be described as zero permissions. Existing organization rules may require IT approval to install any extension. Existing grants from older installed versions can remain until revoked; the new manifest does not silently revoke permissions needed by an already-connected review workflow.

### Opening projects and models

Open the actual repository or project folder in the normal signed-in browser, then invoke the extension icon. The viewer opens separately. Keep that source tab open so the isolated reader can retrieve private files with its existing session; it does not export cookies or credentials. After restoring a viewer tab, reloading the extension or switching browser profiles, open the repository in that same signed-in profile and click the extension icon again to establish temporary website access. An optional review-account sign-in is separate. GitHub can return HTTP 404 for missing website/SSO access as well as a missing revision; explicit access errors are retained rather than retried anonymously. Complete SSO on the provider website itself when required.

The reader supports both embedded GitHub tree JSON and the server-rendered file table. For a nested folder on a mutable branch, it resolves that branch's root commit before reading the folder at the immutable revision. A folder's last-change commit is never treated as branch HEAD. Model discovery begins beside the selected PCB and adjacent shared model folders, with an independent bounded inventory; incomplete unrelated historical folders cannot erase a complete board model index.

Model files must actually be present in the repository or embedded in the board. The browser cannot read an author's local KiCad library directory. Unavailable or ambiguous references remain visible diagnostics; the loader does not substitute a different component merely to increase the linked count. In the M2 test, unavailable library references remain among the unlinked components.

### Development verification (2026-11-02)

The final complete JavaScript run passed all 2,243 checks, including the nested-table context changes. All 24 viewer-assets, Firefox/Safari packaging, product-version and release-metadata checks passed. Installed Chrome/private-board acceptance is distinct from organization-managed browser and installed Firefox acceptance, which remain unverified.

Development archives and local-only private test screenshots are retained under `.vizdiff/client-session-checks/` in the main D: checkout. Private test materials are not included in public documentation or release packages. Published release artifacts were not changed.
