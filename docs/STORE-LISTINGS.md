# Store listing drafts

Current Chrome update: [0.12.76 upload file and release text](store-submissions/chrome-0.12.76.txt). Support contact: `support.kivi@sigharmonic.com`. The older preparation notes below are retained as historical guidance; use the current submission text and release artifacts.

For a Mozilla listing, adapt the browser description to the [Firefox-specific limits and submission steps](FIREFOX.md). Use the Firefox ZIP, preserve add-on ID `kicad-visual-review@wayri.github.io`, check the current submission/restriction status, and obtain genuine Firefox captures before advertising installed acceptance. A Chrome Store listing/ZIP is not an AMO listing or signed XPI. Both public AMO and unlisted signed distribution are described in that guide.

## Historical preparation — 0.12.46

Prepared 2026-10-23. These are separate listings; do not advertise browser-only
account/publication tools as VS Code features. Preserve the immutable publisher
and extension IDs. Account registration, final previews and submission are pending.

## Visual Studio Marketplace (first)

- Publisher: `wayri` (ownership must be verified after sign-in).
- Extension ID: `wayri.kicad-visual-review`.
- Display name: KiCad Visual Review.
- Summary: Read-only KiCad schematic and PCB review with properties, nets,
  measurements and local annotations.
- Category: Visualization.
- Support: https://github.com/wayri/KiCad-Github-View/issues
- Private support: support.kivi@sigharmonic.com

Open saved KiCad schematics and PCB layouts directly in VS Code. Inspect parts,
nets and layers, measure geometry, review assembly variants and keep source-linked
notes in a `.kicad-review.json` sidecar alongside your project. The KiCad Review
Explorer helps navigate supported project files. Supported 3D model assets load
from the containing workspace. Native KiCad is not required for the shared viewer.

Drawings remain read-only; review actions can write the annotation sidecar and
explicitly exported files. Rendering and inferred connectivity have documented
limits. Imported rule reports do not run native ERC/DRC. Use the original design
and appropriate native tools to validate engineering decisions. This is an
independent project, not an official KiCad product.

Desktop and web extension hosts share an entry point; advertise github.dev only
after testing that host with the submitted artifact. Remote provider thread
publication and standalone engineering-tool launching are not promised for VS Code.

Version 0.12.49 adds Pocket KiView Source-Available License 1.0, copyright Yawar B (wayri). Personal/internal professional use and uncompensated redistribution are permitted under its terms. Paid distribution, paid bundles and monetized hosted access require written permission. Do not advertise this as open source. Third-party licenses remain unchanged. The VS Code manifest points to the packaged LICENSE.txt.

## Chrome Web Store (second)

- Name: KiCad Visual Review for GitHub and GitLab (matches manifest).
- Single purpose: Visually inspect and review saved KiCad project files locally
  and on supported repository pages.
- Summary: Browser-only KiCad schematic and PCB review on GitHub, GitLab.com and
  configured GitLab servers, with issue comments.
- Support: https://github.com/wayri/KiCad-Github-View/issues
- Private support: support.kivi@sigharmonic.com

Inspect KiCad schematics and boards inside supported GitHub and GitLab pages, or
click the extension icon to open a local file/folder workspace. Explore parts,
nets, layers and supported 3D models, measure geometry and compare supported
revisions. Review assembly variants with field-table BoMs and grouping. Open
supported Gerber files, PDFs, saved analysis reports and engineering calculators.
Create local notes and explicitly choose when to publish through a connected
provider account. Opening local files does not require account sign-in.

Some native file constructs and model dependencies are unsupported. Saved results
are visualized rather than recomputed by a simulation solver. Native ERC/DRC is
not run in the browser. The project is independent of KiCad, GitHub and GitLab.

### Permission explanations

| Permission | Shipped reason |
| --- | --- |
| `storage` | Viewer settings, local review drafts, account-flow state and approved GitLab host settings. |
| `offscreen` | Chromium offscreen document hosting for the credential vault lifecycle. |
| `identity` | Optional provider authorization through the browser authentication flow. |
| `scripting` | Register content scripts only for explicitly approved self-hosted GitLab origins. |
| GitHub/GitLab fixed origins | Inline file review, repository/API reads and explicit review publication; raw/model and upload endpoints support those selected operations. |
| Optional HTTPS origins | User-approved self-hosted GitLab servers; not an automatic grant to all sites. |

All executable viewer/decoder code is bundled. Verify the final remote-code
declaration against packaged behavior. Do not mark every data category unused:
repository content, identifiers, review notes/captures and optional authentication
are processed. Specify local storage separately from explicit provider transfers.
Prepare a current public policy covering the extension; the Android policy must
not be assumed to describe the browser's storage/authentication behavior.

### Reviewer path and assets

1. Click the icon on an ordinary tab; the local workspace opens.
2. Import a non-sensitive saved KiCad project folder and inspect its drawing.
3. Open a public supported GitHub drawing; check inline review and Show source.
4. Inspect Options; account connection is optional for local/public review.
5. Use a dedicated least-privilege provider account only when authenticated
   features are being tested. Put credentials in private dashboard fields.

Capture fresh screenshots of the installed submitted extension. Retained local
fixture images are illustrative and are not current installed-store evidence.
Do not upload Android phone screenshots for the desktop browser listing.

## Compatibility and companion references — 0.12.52

Both listing texts now describe recognized KiCad 8/9/10 constructs, narrower 8/9 coverage, KiCad 10 native references and warned future-version previews. Do not advertise complete feature certification or legacy .sch/.brd support. Public matrix: https://github.com/wayri/kiview-marketplace-assets/blob/main/COMPATIBILITY.md

Chrome description links to the live VS Code Marketplace listing. VS Code README links to the Chrome companion guide and labels Chrome Store publication pending. Replace that guide link with the actual public Chrome Store URL only after publication is verified. Neither edition requires installing the other.

Policy review (23 October 2026): Chrome listing guidance explicitly allows links to related sites; metadata must remain accurate, relevant and free of keyword spam. Microsoft supports README links, including HTTPS image URLs. No blanket prohibition on a brief, relevant companion reference was found; this is a policy reading, not store approval or a legal guarantee.

References:
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## GitHub project link

Both store descriptions link to https://github.com/wayri/KiCad-Github-View. Until the owner makes it public, disclose that the repository is private and public access is planned. Repository visibility was not changed.
