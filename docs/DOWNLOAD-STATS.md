# Download counter

The main README uses a live [Shields GitHub download badge](https://shields.io/badges/git-hub-downloads-all-assets-all-releases) backed by GitHub's public release-asset download totals. It refreshes through Shields and GitHub's image caching; it is not an instantaneous display.

## Included and excluded

- Counts requests GitHub records against published release assets in `wayri/KiCad-Github-View`, across releases, including previews.
- Includes manual downloads, scripted downloads and KiCad Plugin and Content Manager (PCM) downloads **if they fetch those same GitHub release assets**.
- Counts all release assets, including documentation, source companions and checksums; it is not limited to application installers.
- Does not count source clones, GitHub's automatic source archives, repository file views, Marketplace/Chrome Store installations or files downloaded from other hosts.
- Does not measure unique people, successful installation, active use or the download client. Repeated downloads and automation can contribute to the total.

The [GitHub release-asset API](https://docs.github.com/en/rest/releases/assets) provides `download_count` per asset, without a PCM/browser/referrer breakdown. An existing aggregate cannot be reliably split into direct and PCM requests after the fact. The badge adds no analytics or telemetry code to the applications or extensions.

## PCM distribution

No PCM `metadata.json`, package repository or dedicated PCM release asset is configured in this project at the time of this update (28 October 2026). The badge must not be described as evidence of an existing PCM listing or installation count.

[KiCad's PCM format](https://dev-docs.kicad.org/en/addons/) uses a package version's `download_url` to locate its archive. When a future PCM package uses a release-asset URL in this repository, GitHub's total automatically includes downloads GitHub records for that asset; there is no second count to add.

For a separate **PCM package downloads** badge in future:

1. Publish a dedicated PCM package asset and point the PCM metadata's `download_url` to that asset.
2. Sum GitHub `download_count` only for those dedicated package assets across versions.
3. Label this as package downloads, not confirmed PCM installs: people and scripts can still fetch the same package directly.
4. Keep it as a subset of the GitHub total; adding the two would double-count those requests.

If PCM uses a separate repository or download host, its actual package URL and that host's aggregate statistics are needed before a combined total can be calculated. Do not invent a zero count for an unconfigured source or count repository metadata checks as package downloads.
