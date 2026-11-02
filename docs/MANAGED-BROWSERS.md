# Managed office browsers

KiView follows browser and extension administrator policy. Signing in, changing an account or opening a project through another route cannot override a restriction. Use only the review workflow your organization permits.

## Check the failing feature

Open extension settings and choose **Check viewer connection**. This is an explicit, read-only action; checks do not run automatically. The settings page first asks the extension worker for administrator controls. If extension network access is disabled, or those controls cannot be verified, it does not start connectivity probes.

When permitted, checks contact three public endpoints without cookies, account credentials, project paths or project contents:

| Endpoint | Purpose | What a failure means |
| --- | --- | --- |
| `https://github.com/` | Website transport for GitHub project viewing | This viewing path needs attention; the error may identify a block, or leave the cause unknown. |
| `https://raw.githubusercontent.com/github/gitignore/main/README.md` | Public raw-file connectivity | Raw project/model reads may be affected. The public check does not establish access to a particular repository. |
| `https://api.github.com/rate_limit` | Optional API connectivity for account/review features | An API-only failure does not establish that website/raw project viewing is blocked. It does not verify sign-in or permission to publish. |

The API endpoint is a public connectivity check, not a project/history read. A reachable host, including an HTTP 404 response, does not prove access to your project. Granted site permissions also do not prove that administrator network rules permit a request.

## Read the result precisely

- **Extension network access disabled:** the extension’s administrator setting explicitly disables network activity. Do not try to override it.
- **Administrator controls could not be verified:** the extension cannot verify policy/configuration; its background guard fails closed. This is different from a confirmed website block.
- **Blocked by browser policy:** a request explicitly reported an administrator/organization block. Give the affected hostname and feature to your administrator.
- **Required site access disabled:** host permission is missing. Review extension site access only if your organization allows changes; locked controls require administrator help.
- **Client-side block:** another extension or browser protection may be responsible; organization policy is not confirmed.
- **Connection failed, timeout or HTTP 403:** proxy, DNS, firewall, network, service/account restrictions or policy may be involved. The generic error does not establish which one. Adding a token is not a demonstrated fix.

Administrators can inspect `chrome://policy` or `edge://policy`, extension status and site access, `ExtensionSettings`, runtime blocked hosts, proxy and firewall configuration. The extension cannot inspect every browser/network rule or identify a corporate proxy’s decision from a generic fetch failure. GitLab host admission and account checks are separate from these GitHub public-host probes.

## Local review when permitted

**Open local files** remains available in the connection-check section and opens the bundled local workspace. Import an approved saved project folder, including required sheets and models. This route uses imported local bytes rather than fetching that project from a repository; local draft notes do not publish remotely.

This fallback does not bypass extension-install policy, blocked file pickers or your organization’s data-handling rules. If either the extension or local import is blocked, ask for an approved workflow. Do not move private designs to personal accounts or devices to work around restrictions.

Checks are advisory and limited to the tested hosts at that time. They do not certify enterprise deployment, authenticated access or successful provider writes, and they do not change organization policy.
