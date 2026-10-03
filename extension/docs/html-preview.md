# Isolated HTML and interactive BOM previews

The project file tree includes `.html` and `.htm`. Select the file, then explicitly choose **Start isolated preview**. The browser extension can run self-contained interactive BOM HTML with inline JavaScript, styles and data. Rendering an HTML BOM does not synchronize its selections with the KiCad drawing viewer.

Repository HTML runs inside an opaque sandbox with no extension API or privileged review bridge. External resource loading, fetch requests, nested frames, forms, popups, top navigation, workers, remote fonts and external images/scripts/styles are blocked by CSP/sandbox. A separate trusted sandbox wrapper also restricts the inner frame to about: navigation. Do not treat CSP as a general network firewall or enter credentials into untrusted HTML; browser navigation enforcement can differ. Data images and fonts and inline scripts/styles are allowed. References to neighboring repository assets are not automatically fetched. Source is bounded to 8 MiB. Scripts can still consume CPU; **Stop preview** destroys the iframe.

VS Code uses a separate script-disabled static preview with no host message receiver, no login credentials, no extension resource roots and no bridge bootstrap. Interactive canvas-based iBOM requires the browser extension; it may show no board in the static fallback. HTML is not made the default VS Code editor: use **KiCad: Open Visual Viewer** or the project navigator.

The preview runs saved HTML; it does not generate iBOM, edit a design or publish comments. Local mocked browser verification is not verification of an installed Chrome extension on GitHub.
