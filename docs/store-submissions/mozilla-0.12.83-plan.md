# Mozilla update plan — 0.12.83

Update the existing **Pocket KiView / KiCad Review** AMO listing; keep add-on ID
`kicad-visual-review@wayri.github.io`. Do not create a replacement listing.

## Observed status

The owner supplied Mozilla's automated-screening notice for **0.12.66**, reporting
tentative approval and possible later manual review. That notice does not approve
0.12.83. The latest public listing/dashboard status could not be independently
confirmed during this preparation. Older disabled-listing notes are historical,
not proof that the new notice is invalid or that submission is currently blocked.

## Candidate and submission gates

1. Use `kicad-visual-review-firefox-0.12.83.zip` and verify it against the GitHub
   release's `SHA256SUMS.txt`. It is an unsigned development ZIP, not a signed XPI.
2. Run the repository's Firefox packaging/manifest tests and an existing pinned
   `web-ext lint` installation if available. Record unresolved warnings with their
   actual reasons; validation success alone is not installed-browser acceptance.
3. Install temporarily in a clean Firefox desktop profile. Test toolbar project
   opening, local folder input, schematic/layout/3D, report markers, Fast PI pad
   suggestions and smooth/mesh overlays, Draftsman and exports. Check restart,
   reconnection, permissions, keyboard and narrow/wide layouts. Do not claim
   Android Firefox or derivative-browser acceptance from Chromium tests.
4. Prepare a fresh readable reviewer-source archive for the exact release commit,
   including the shared viewer sources, the corresponding SPIKE geometry subset,
   pinned lockfiles, third-party source/license records, worker generators and
   exact rebuild commands. Rebuild and byte-compare the transformed/bundled files.
   **Do not submit the old 0.12.66 source archive unchanged.** The reviewer archive
   must stay within Mozilla's 200 MB source-upload limit.
5. Review the existing listing's permissions/data disclosures and reachable
   privacy policy. Preserve support `support.kivi@sigharmonic.com`. Explain the
   independent viewer, explicit review actions, experimental DC limits and
   imported-report workflow accurately. New version features add no manifest
   permissions. Use genuine Firefox captures after the installed-browser test.
6. In the existing listing's version-management page, upload the Firefox ZIP,
   attach its matching source archive and reviewer notes, and submit the update.
   Account verification, new terms or CAPTCHA remain owner actions when required.
7. Record the submission/version ID. After signing, download the actual signed
   XPI, test installation and restart, record its hash, then update the README and
   distribution status with the verified AMO version/link. Do not call the
   unsigned GitHub ZIP approved or permanently installable.

## Reviewer notes to adapt after Firefox acceptance

This update improves PCB loading, exact pad-contact suggestions, masked display
interpolation for experimental DC screening, mechanical Draftsman preparation and
saved DRC/ERC report review. The code performs no remote-code loading. Website
session workflows require the user's explicitly opened, authorized repository;
they do not bypass organization restrictions. Posting remains explicit. Imported
rule reports are not newly executed ERC/DRC checks. The source archive and rebuild
comparison must be attached for this exact version.

## Authoritative instructions

- [Update the existing add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Matching source and reproducible build requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [web-ext validation](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)

This plan prepares the update; it does not submit, sign or approve it.
