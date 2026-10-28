# Decisions needed to finish the Play submission

No passwords, private keys or tokens belong here. Provide contact information and account facts; enter reviewer credentials only in Play Console and configure signing only on the owner's build machine.

| Required decision | Exact information needed | Why it cannot be inferred |
| --- | --- | --- |
| Publisher identity | Legal developer name that will appear in Console/listing; immutable package `dev.kicadvizdiff.android` confirmed | GitHub handle and app name do not establish legal identity. |
| Contact | Owner supplied `support.kivi@sigharmonic.com`; confirm mailbox operation and monitoring | Address is settled, but receipt/monitoring have not been verified. Public GitHub issues are unsuitable for confidential reports. |
| Policy hosting | Deployed URL: `https://wayri.github.io/pocket-kivi-policies/privacy.html`; verify response/copy parity and Console entry | HTTPS Pages build is ready; test actual response without login/geographic restrictions. |
| Account eligibility | Personal or organization; developer-account creation date; Console testing requirement | A new app listing does not establish the account type or whether the 12-testers/14-days rule applies. |
| Signing | Upload key and verified signed Android1.49 AAB prepared; approve secure independent backup and Play App Signing enrollment | Windows DPAPI password ciphertext is tied to the local user/machine and is not a portable backup. Never send the private key/password through chat. |
| Reviewer access | Dedicated safe provider account/repositories and working, reusable access instructions | Offline/public samples do not cover private reads, posting and provider authorization. |
| Moderation operations | Person/team monitoring reports; response procedure and provider escalation/removal path | UI controls cannot themselves perform ongoing human/provider moderation. |
| Declarations | Countries, pricing, category, audience/content rating, ads status and final Data Safety answers | These are publisher declarations based on actual signed-build behavior. |

## Proposed defaults for approval

Brand: **Pocket KiView**. Category: **Tools**. No ads SDK is present in the reviewed source; confirm the final build and listing declare no ads if unchanged. This is an engineering companion viewer, with optional provider UGC; select audience and complete the content-rating questionnaire based on what users can actually access rather than choosing a rating from marketing copy. The [listing copy](LISTING.md) and [Data Safety worksheet](DATA-SAFETY.md) are prepared for review.

## Evidence to collect in Console

1. Verify identity/contact, App access, Data Safety, privacy URL, content rating and target audience.
2. Enroll in Play App Signing; upload the independently signed AAB to internal testing. Keep certificate and checksum evidence. Production signing is distinct from the installed debug app; preserve user data before any migration.
3. Complete the [acceptance matrix](ACCEPTANCE.md), current phone/tablet screenshots and pre-launch findings using that Play-delivered build.
4. If required by Console, run closed testing with at least 12 continuously opted-in testers for 14 days and apply for production access. This calendar requirement cannot be shortened by a source change. [Official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
5. Submit after the evidence is complete; Google makes the publication decision. Keep owner approvals and moderation response records privately rather than publishing sensitive details.

Confirmed by owner: existing Play account (type unknown). On 2026-10-11 the owner requested the Pocket KiView name and support.kivi@sigharmonic.com address. Delivery and monitoring of the renamed mailbox have not been verified in this task. Automated triage is proposed in MODERATION.md and has not been configured in the mailbox.
