# Pocket KiVi Privacy Policy

Policy date: 2026-10-10. Applies to the Pocket KiVi Android app (`dev.kicadvizdiff.android`).

## What the app accesses

Pocket KiVi reads the project files or folders you select through Android's document picker, including supported drawings, settings, models and saved analysis results. A document provider may download those files from its own cloud service. The app processes design content to display it, search it, calculate review overlays and show saved properties. The app does not request broad device storage, camera, microphone, contacts or location permission. Its manifest requests Internet access.

The app stores settings, review drafts, screenshots, project history, bookmarks, stars and optional offline project copies on your device. It can also export files to a destination you choose. Offline use of local projects does not require a Pocket KiVi account.

## Optional online services

When you open a GitHub or GitLab project, Pocket KiVi sends repository, revision and file requests to that provider. When you connect an account, authentication requests and credentials go to GitHub or the selected GitLab server. The app reads the authorized account name and repository information needed for these features. GitHub OAuth may request the broad private-repository `repo` permission; organization or SSO approval may also be needed. GitLab permissions depend on your chosen token or registered OAuth client. You can use local files without connecting either account.

Comment threads, contributor suggestions and revision history are requested from the selected provider. Publishing a review sends the chosen comment, title, mentions, review metadata and any included screenshot to that provider only when you choose to publish. Visibility follows the destination repository, issue or discussion permissions. Provider attachment links can have visibility rules different from the repository; do not include confidential content unless you have checked those rules.

The Android app's built-in repository and authentication requests use HTTPS. External links and sign-in pages open in a browser or another app, which handles those pages under its own policy. GitHub, GitLab, self-hosted server operators and cloud document providers can retain account, request and uploaded data according to their policies. Public requests also expose normal network information, such as your IP address, to the contacted service. The app has no built-in advertising or analytics SDK in the reviewed Android source; it does not intentionally send project usage telemetry to a Pocket KiVi analytics server.

## Storage and security

Account credentials are encrypted using a device-backed AndroidKeyStore key and are not passed into the viewer's JavaScript. Ordinary saved library snapshots use separate encrypted storage. Large downloaded project copies use private app storage **without file encryption**. Temporary downloaded copies are also unencrypted and have a fixed six-hour expiry. Android background cleanup may be delayed, but expired copies cannot be reopened. Choose Save offline to keep a permanent copy before expiry. Exported project ZIPs and exported BoM files are ordinary unencrypted files. Protect your device and exported private projects accordingly.

Android backup is disabled for this app. Encryption keys depend on the installation and are not a portable backup. Project content remains sensitive even when it is in private app storage.

## Retention and removal

- Sign out of GitHub or the selected GitLab account to remove the app's stored credentials and active authenticated project. Sign-out preserves explicitly saved offline copies, bookmarks and review notes.
- Use Your projects to remove an offline copy or remove its library entry. Removing a bookmark also removes its associated saved copy. Original files outside the app remain unchanged.
- Delete local notes through the comment interface. Export anything you wish to keep before clearing app data.
- Android Settings → Apps → Pocket KiVi → Storage → Clear data, or uninstalling the app, removes the app's private data, including stored credentials, settings, review drafts and saved projects. It does not remove files you exported or content already published to a provider.
- Delete published issues, discussions, comments or attachments through the provider's own controls, subject to your permissions and the provider's retention rules. Revoke OAuth authorization or personal access tokens at the provider if you want to end the app's remote authorization as well.

Pocket KiVi does not create a separate Pocket KiVi service account. Connecting GitHub or GitLab does not delete or replace that provider account. Provider account deletion is managed by the provider.

## Privacy inquiries and changes

Project maintainers can be contacted through the [Pocket KiVi project support page](https://github.com/wayri/KiCad-Github-View/issues). GitHub issues are public: do not post credentials, private designs or other sensitive data there. A monitored private privacy-contact address must be added by the publisher before Play submission.

This policy should be updated when the app's data handling changes. The policy date above identifies this source version.
