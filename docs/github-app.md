# GitHub App delivery

The GitHub-installed product is a GitHub App. Users install it on their account
or organization and choose repositories. On a pull request that changes KiCad
files, it adds a neutral **KiCad visual review** check. The check's **Details**
link opens this App's interactive hosted viewer. No browser extension, local
companion or KiCad installation is required. The App also has a repository
browser for opening schematic and board files outside pull requests.

GitHub Apps have API, webhook and check integrations; GitHub does not expose a
custom blob-file renderer registration API. Installing this App therefore
does not replace the text display on GitHub's own `.kicad_sch` file page. The
optional Chrome/Edge companion provides that inline behavior. The GitHub App
and its standalone viewer work without the companion.

## Run the App locally

```powershell
python scripts/package_app_web.py
python -m kicad_vizdiff.app_server --port 8780
```

Open `http://127.0.0.1:8780/app/` (or `/setup`). This local preview needs no
App ID, private key or webhook secret. Enter a public repository and branch,
or a pull request number. Source rendering occurs in the browser using the
owned schematic/PCB Canvas2D engine and SPIKE adapter. The Python App handles navigation metadata
and GitHub checks; it never runs KiCad or renders designs on the server.

The repository browser resolves a branch to a commit before listing files.
PR comparisons use GitHub's merge base and support public forks, renames,
additions and removals. Both views include schematic sheet navigation, saved
object inspection, PCB layer controls and a procedural 3D preview. Exact
STEP/WRL assembly models and pixel-identical native KiCad rendering remain
outside the current browser renderer.

## Register and deploy

1. Choose a real HTTPS domain and put an HTTPS reverse proxy in front of the
   service. Keep port 8780 reachable only by that proxy. This repository
   supplies `Dockerfile.github-app` and `compose.github-app.yml`, but does not
   provision a domain, proxy or hosting account. Neither container installs
   KiCad.
2. Generate registration settings after the domain is chosen. The helper
   uses `wayri`, the owner selected for this App. It only writes files and
   does not create an App:

   ```powershell
   $origin = Read-Host 'Actual public HTTPS origin (for example, your chosen domain)'
   python scripts/configure_github_app.py --origin $origin --owner wayri
   ```

   Review `.vizdiff/github-app-registration/app-manifest.json` and
   `deployment.env.example`. The manifest sets the service URL, `/setup`
   landing page and `/api/github/webhook` callback. Register a public GitHub
   App while signed in as its intended owner. Give it repository contents read,
   pull requests read and checks write permissions, and subscribe to
   `pull_request` events.
3. In the registered App's GitHub settings, choose a random webhook secret of
   at least 24 characters, record its numeric App ID, and generate an RSA
   private key. Keep the key in a host file outside this repository and the
   web root. Fill a private deployment environment file from the generated
   example with the actual HTTPS origin, App ID, webhook secret, installation
   URL and `GITHUB_PRIVATE_KEY_FILE` pointing to that host key file. Do not
   commit the environment file or key. Public startup requires a valid RSA
   key, numeric App ID, webhook secret and HTTPS origin; it fails closed if
   these are missing or invalid.
4. Start the single service instance with Compose, using the private
   environment file you filled:

   ```powershell
   $envFile = Read-Host 'Absolute path to the private deployment env file'
   docker compose --env-file $envFile -f compose.github-app.yml up --build -d
   ```

   Compose mounts the key as a secret at `/run/secrets/github_app_key` and
   sets `GITHUB_PRIVATE_KEY_PATH` to that location. Its named `app-state`
   volume stores the SQLite delivery database at
   `/var/lib/kicad-review/deliveries.sqlite3`, outside `/app/`'s served
   assets. Keep the volume across upgrades and do not run multiple service
   replicas against this single-instance queue. The container publishes
   port 8780 on `127.0.0.1` by default; configure the proxy to reach it and
   terminate HTTPS. Check `/health` through the proxy; an unhealthy worker
   makes that check fail.
5. Install the registered App on a test public repository. Open or update a
   PR with a KiCad change; verify that its check links to `/app/`, renders both
   revisions, and follows child schematic sheets. Confirm the webhook's
   signature verification and test a redelivery in GitHub's settings. The
   post-install `/setup` page accepts a public `owner/repo` and optional PR;
   its `installation_id` query is not treated as proof of access.

Webhook requests are signature verified before durable enqueue. The SQLite
queue makes five processing attempts total: the initial attempt, then retries
after 5, 30, 120 and 600 seconds. Completed and failed delivery IDs are kept
for seven days for deduplication; failed deliveries can be redelivered.
Interrupted `running` work is requeued when the single service instance
restarts. A matching App-owned check is updated where possible. Monitor
`/health`, logs and the durable volume. This still needs operational testing
on a real host before service reliability can be promised.

No App has been registered, hosted, installed or published in this work. A
fresh GitHub login was attempted but timed out over the network; it did not
create an App or establish access to the intended owner account.

## GitHub Marketplace

A public GitHub App can be installed through its GitHub App page before a
Marketplace listing is approved. Marketplace publication is a separate owner
step. It requires valid publisher contact, support and privacy pages,
screenshots, pricing and the Marketplace agreement. A paid listing currently
requires organization ownership, publisher verification, at least 100 App
installations, and purchase-event handling. This prototype does not implement
Marketplace billing or user OAuth; do not submit it as a completed paid App.

The current App viewer supports public repositories. GitHub installation
credentials are used only on the server to create checks. No installation
token is sent to the browser. Private repositories require user authentication
and authorization before serving private files; they are deliberately skipped.

SPIKE remains owner-provided code with its source provenance in the bundle's
notice. Selling the integration and later publishing its GUI engine under a
chosen open-source license can be organized separately; this change does not
assign a new license to SPIKE.

References: [GitHub App architecture](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps),
[check runs](https://docs.github.com/en/rest/checks/runs), and
[Marketplace requirements](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app).
