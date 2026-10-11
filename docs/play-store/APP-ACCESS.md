# Reviewer access instructions

Prepared 2026-10-10. Copy the applicable instructions into Play Console → App content → App access after verifying them on the **Play-delivered build**. The local/public paths below are ready to use; authenticated access still needs owner-provided test credentials in Console's private fields. This document contains no credentials.

## Without an account

Pocket KiView does not require sign-in for local project viewing. Download the original, non-production [sensor example folder](https://github.com/wayri/KiCad-Github-View/tree/v0.12.38/examples/sensor), or the accompanying [reviewer-sample.zip](reviewer-sample.zip) ([SHA-256](reviewer-sample.sha256)). The sample contains an embedded schematic symbol and PCB pads; it requires no third-party symbol/footprint libraries. It is a synthetic viewer demonstration, not an electrically validated circuit. It has no external 3D model files.

1. Launch Pocket KiView. Dismiss the introductory guide if shown, or follow its opening instructions.
2. Open **Library and accounts** using the menu button, then **Open files**. Select `reviewer-sample.zip` from Android's file picker. If testing the unpacked folder instead, use **Open folder** and grant access to the sample folder.
3. Choose **Schematic**. The root is `sensor.kicad_sch`, titled Sensor interface. Inspect resistor R1 and the SIGNAL_IN/SENSE nets. Enter Power using the sheet tree or by double-tapping its sheet symbol; Android Back returns to the parent. All sheets displays the loaded hierarchy together.
4. Choose **Layout** to view `sensor.kicad_pcb`. Inspect pads, layers, selection and measurements. 3D uses approximate stand-ins for this sample because it supplies no model assets.
5. Open **Comments**, enter a local review note and save a draft. Publishing requires an online repository and provider authorization; a local draft is not uploaded.
6. Use the project library to save/reopen a local copy, and test in airplane mode. Privacy, About and Read Me are accessible from Library and accounts without sign-in.

For public repository reading, open **GitHub projects**, enter `https://github.com/wayri/KiCad-Github-View`, and use revision `v0.12.38`. The example is under `examples/sensor`. Public reading can be subject to GitHub's unauthenticated rate limits; it is an additional test route, not a substitute for offline access or authenticated reviewer access.

## Authenticated functions — publisher must complete

Put a dedicated GitHub/GitLab account's reusable sign-in details and safe test-repository URL in Console's restricted access fields. Give that account access only to non-sensitive sample projects and review threads, with the permissions needed for private reads and posting. Use a separate private sample repository for private-access checks. Do not commit passwords, tokens, OTPs or private URLs to this document.

Explain the actual provider sign-in flow in English, including opening the authorization page and returning to Pocket KiView. Test it from a fresh device without help from the publisher, geographic restrictions or expiring/one-time credentials. Google explicitly requires reusable access to all restricted functions, including third-party sign-in. If provider verification prevents unattended review, resolve this through the provider and Play Console support; do not add an authentication bypass to the production app. [Reviewer access requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).

The reviewer should be able to read the safe private repository, view its issue/discussion threads, create a review, review the final destination before publishing, and verify its thread readback. New source controls require accepted content rules before publishing. Report content/user opens a dialog, then an email draft to `support.kiview@sigharmonic.com`; the user must send it in the email app. Opening a draft is not a submission receipt. Block hides an author's comments in the current provider/app profile; unblock is in Comment settings. It does not change the provider account or delete provider posts. Verify these controls are present in the submitted build. Use only benign sample content; do not seed abusive content to demonstrate moderation.

## Publisher acceptance record

- Submitted version name/code and AAB SHA-256:
- Play internal-track installation date and device/Android version:
- Offline sample import/reopen result:
- Public repository result:
- Private repository and reusable sign-in result:
- Final publish confirmation and thread readback result:
- Report/block/content-rules result:
- English Console access instructions reviewed by:

Blank fields mean these checks are not yet evidenced. The static sample and instructions do not prove provider authentication or Google approval.
