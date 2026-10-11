# Content reporting and moderation procedure

Prepared 2026-10-10 for publisher adoption. This is an operational procedure, not evidence that the mailbox is already monitored or that Google has approved the reporting route.

## Current controls and boundaries

Shared comment source provides versioned content rules with acceptance before publishing, Report content/user, and persistent provider/profile-scoped local block/unblock. The rules prohibit harassment, hate, threats, sexual exploitation, illegal content, spam, private personal information and designs the user cannot share.

Report dialogs collect a reason and available provider/author/permalink identifiers, then open an email draft to the fixed address **support.kiview@sigharmonic.com**. The user reviews and sends it in their email app. No screenshot/project attachment is automatically included. Opening the draft does not deliver a report and creates no submission receipt. A provider moderation link is offered where available. Blocking hides content in the current app profile; it does not block the provider account or remove posts for other users.

The publisher must verify that this external-compose route satisfies the applicable in-app reporting requirements, or replace it with a supported secure submission service. No direct service/report backend is configured by this procedure. Google's [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) requires ongoing moderation as well as controls, including for specialized clients.

## Responsible role

The publisher assigns a primary report reviewer and backup with access to the support mailbox and appropriate repository/provider escalation channels. Record the actual individuals and monitoring arrangement privately. No response-time promise is invented here; select a realistic monitoring cadence, publish any promised response times only after approving and supporting them, and prioritize credible safety/privacy concerns.

## Handling a report

1. Confirm receipt and create a private case record: case ID, received time, provider/content identifier, reason, assigned reviewer, status and next action. Never copy credentials or private designs into a public issue. If the user included secrets unnecessarily, restrict access and handle them through the approved privacy process.
2. Review the concern against app content rules and the provider's rules. Obtain only necessary clarifying information. Do not assume the reporter is authorized to disclose a private repository; access private content only through permitted routes.
3. Act within actual permissions: remove or moderate content on repositories the publisher controls, escalate to the repository owner/provider for content outside that control, and explain local block/unblock to the reporter. Do not claim that Pocket KiView can globally remove third-party content or enforce a provider-account ban.
4. Record the action, escalation reference and outcome. Respond privately where possible. Do not state that opening a report email established receipt before it actually arrives.
5. Track unresolved reports until disposition, review repeat abuse and failures, and adjust safeguards. Set a documented retention period for case records; retain only what is necessary and update the privacy policy to match the adopted process.

## Acceptance before Play submission

- Verify a benign content report and user report reach the mailbox from the submitted build; verify behavior when no email app is installed and when the user cancels.
- Verify rules acceptance is required before each first publication under a new rules version, and local draft saving remains available.
- Verify block/unblock and profile/provider isolation on thread messages and supported local comments; document any content surface it does not cover.
- Assign reviewer/backup and confirm report tracking, provider escalation and private reply work without exposing test credentials.
- Record exact build/version, test date and redacted evidence in [ACCEPTANCE.md](ACCEPTANCE.md). Complete the report-flow Data Safety assessment and public policy copy.

Controls, email address and this document do not themselves close the operational moderation or Google review gates.


## Confirmed responsibility and initial automation

The publisher confirmed that they monitor **support.kiview@sigharmonic.com**, signing responses as **Pocket KiView team**. Mail delivery/end-to-end report checks remain pending. The Play account exists; its personal/organization type is not yet established.

Report drafts include a category (spam, harassment, hate, threats, child safety, privacy, rights or other), provider, author, content link and the user's explanation. Configure mailbox rules for the Pocket KiView report subject to label/queue cases. Prioritize `Category: threats` and `Category: child-safety`, then privacy concerns. Keep reports private. Do not auto-forward private repository links into public issues.

These are triage suggestions, not installed mailbox automation. Confirm the mailbox provider/admin access before applying filters. Initial automation should sort/flag reports, preserve the original message and assign a human reviewer. Never auto-publish accusations, delete designs or ban accounts solely from report text. Use provider moderation APIs only with an authorized account and an explicit reviewed decision; Pocket KiView has no separate content-hosting service to delete provider posts.

Record a redacted test report's delivery, categorization, reviewer decision and provider escalation before claiming the process operates end to end. A direct in-app report service with an acknowledged receipt is still a possible follow-up requiring a private endpoint, retention rules and operator access; the email-draft route must not be presented as that service.
