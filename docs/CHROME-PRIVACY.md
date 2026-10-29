# Chrome extension privacy policy

**KiCad Visual Review for GitHub and GitLab**  
Effective date: 29 October 2026  
Publisher: Yawar B (wayri)  
Contact: support.kivi@sigharmonic.com

This policy covers the Chrome extension, including its local project workspace and supported GitHub/GitLab integrations. It is separate from companion-app policies.

## Information processed and why

The extension processes project files you select or open (including schematics, PCB layouts, models, BoM data, Gerbers, PDFs, photos and saved reports), repository names, revisions and file paths, and relevant content/URLs on supported GitHub/GitLab pages to provide visual engineering review. It processes settings, variants, review notes, comments, captures and export data that you create. Such files, photos and notes may contain personal or confidential information.

If you connect an account, the extension processes the account metadata and authorization information needed for selected provider operations, including tokens supplied or obtained through supported authorization flows. Supported already-signed-in provider pages may supply authorized source reads using your existing browser session. That does not give the extension unrestricted access to all private repositories or bypass provider permissions.

Local file parsing, rendering and engineering calculations occur in the browser. The extension's core viewer does not require uploading projects to a publisher-operated analysis backend. Selected remote project retrieval and provider operations contact the relevant GitHub/GitLab service. Executable viewer and decoder code is included in the extension package.

## Storage and retention

Viewer settings, approved server origins, local review drafts and related metadata can be stored in browser extension storage, page-local storage or local project storage. Their lifetime depends on the feature and browser. Downloads, exported reports and review files remain wherever you save them; they are not automatically removed by uninstalling the extension.

Supported credential flows use session-scoped handling and, where available, an isolated credential vault. Credentials may become unavailable after a browser session ends or vault state is lost, requiring reconnection. No claim of permanent, failure-proof or universally encrypted storage is made. Protect your browser profile and device.

## External services and sharing

When you request remote content, authorization or publication, the extension exchanges the data necessary for that operation with the selected provider. An explicit publication can send comment text, review metadata and selected captures/photos to a chosen repository or thread. Review the destination, visibility and attachment contents before confirming; public posts and attachment links can disclose information.

GitHub, GitLab and approved self-hosted GitLab servers operate under their own policies and may log network metadata such as IP addresses and request details. Browser/store providers and email support have their own data practices. Those third-party services are not controlled by the publisher.

The publisher does not sell extension user data or use it for advertising or unrelated profiling. Core extension data use is limited to providing its described review functionality. Contacting support voluntarily shares the content of your message and attachments with the support recipient and email services.

## Your controls and deletion

Choose which local files to open and which provider/server permissions to grant. Account connection is optional for local-file review. You can disconnect/reset an account through the extension's controls and remove approved servers where provided. Revoke provider-side authorization separately using GitHub/GitLab account settings.

Clear the extension's browser/site storage or uninstall it to remove browser-managed local state, subject to browser retention/backup behavior. Delete exported/downloaded files separately. Signing out, clearing a draft or uninstalling does not delete content already posted to a provider; use that provider's controls. Contact support for deletion/access requests concerning information actually received by the publisher, such as support correspondence.

## Permissions

Storage supports local settings and drafts; offscreen supports the Chromium credential-vault worker; identity supports optional browser authorization; scripting supports content-script registration for approved self-hosted GitLab origins. Fixed GitHub/GitLab hosts support inline review and selected API/raw/model/attachment operations. Optional HTTPS host access is requested for user-approved self-hosted GitLab servers, not granted automatically to every website.

## Project history and documentation drafts

The dashboard stores up to 50 recently opened project locations, including provider/server, repository, saved revision, drawing path and access time, in extension-local storage. It does not import earlier browsing history or cache local source contents in that history. Remove entries or clear history through the dashboard. Source-bound Draftsman drafts can be stored in this browser profile; editable JSON, SVG and PDF exports remain wherever you save them. Optional repository saves require confirmation and create a new documentation branch at the viewed source revision.

## Open in KiCad

The optional downloads and nativeMessaging permissions are requested for the user-selected Open in KiCad action. The extension downloads the selected project ZIP, asks where to save it, tracks its own download and can pass its verified completed path to the separately installed dev.pocketkivi.kicad helper. Ordinary viewing does not need these permissions. OAuth credentials are not sent to the helper. Downloaded and extracted projects remain on your computer until you remove them.

## Changes

Material changes will be reflected in a dated policy update. Review the current policy before sharing confidential information. Questions or privacy requests: support.kivi@sigharmonic.com. Do not send credentials or private project files with a request.
