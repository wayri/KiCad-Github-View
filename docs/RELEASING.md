# Push-to-release

The repository is prepared for GitHub under owner `wayri`. Its extension release version is `0.11.6`; the separate Python report tool remains `0.1.0` and is not versioned by the extension tag.

## One-time repository connection

Create the intended repository under your GitHub account with the intended visibility, without an initial README or license. Connect this existing local checkout:

```sh
git remote add origin https://github.com/wayri/KiCad-Github-View.git
git push -u origin main
```

Use your normal Git credential manager or `gh auth login --hostname github.com --web` if authentication needs refreshing. Do not add tokens to remote URLs or commit credentials. Repository creation/authentication are account actions and are not performed by the build scripts. GitHub Actions must be enabled and permitted to use its normal repository `GITHUB_TOKEN` with contents-write in the publishing job.

## Publish the prepared version

After reviewing the source and intended visibility, push the prepared tag:

```sh
git push origin v0.11.6
```

The release workflow tests and builds that tag, verifies package contents and checksums, then publishes a **prerelease** with the release notes and download files. No PAT, hosting service, Chrome Store credentials or VS Code Marketplace token is needed for GitHub Release publication. A matching GitHub Release must not already exist; reruns do not overwrite one.

You can push the initial branch and tag together with `git push --atomic origin main v0.11.6`. The workflow checks that the remote tag still points at the tested commit before publishing. Do not move published tags.

## Check locally

Python 3.10+, Node 22 and Git are required. The optional `github` extra enables credential-signing tests; KiCad is needed only for native-reference integration tests.

```sh
python -m pip install '.[github]'
python scripts/release.py --output dist/release
```

Run `python scripts/release.py --tag v0.11.6 --output dist/release` from a clean checkout of that existing tag to validate commit binding as well. Every CLI invocation runs the required tests before assembling assets. Output directories containing unexpected files are rejected so wildcard upload cannot publish unrelated files.

Outputs: browser ZIP, VSIX, optional hosted-viewer and App-service ZIPs, `INSTALL.md`, release notes, third-party notices, `release-manifest.json` and `SHA256SUMS.txt`. Browser/VSIX packaging and application ZIP normalization use fixed timestamps and file modes. The release manifest records the source commit, version and package hashes.

## Next version

Update the browser and VS Code manifest versions together, add `docs/releases/vX.Y.Z.md`, update the installation guide's filenames and package-test expectations, and commit the changes. Run the release checks, create `git tag -a vX.Y.Z -m 'KiCad Visual Review vX.Y.Z'`, and push the branch/tag. The tag must exactly match both manifests and point to the checkout being built. The current workflow publishes prereleases; change that policy explicitly when stable acceptance is complete.

See [workflow details](release-ci.md). Source archives inherit repository visibility and licensing. Marketplace listings, payment/billing, App hosting and choosing a future open-source engine license are separate deliverables.
