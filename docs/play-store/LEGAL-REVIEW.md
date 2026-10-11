# Legal release review

Pocket KiView now bundles readable offline Terms of Service and engineering disclaimers. Source: `TERMS.md`; run `python scripts/build_terms.py` after editing it to regenerate the Android, extension and policy-site HTML copies. Material revisions must also change the terms acceptance version in `extension/review-workspace.js`. Older content-only acceptance is not reused as agreement to these terms.

The Android home screen, global menu and About page expose the terms. Shared review settings and final publication confirmation expose them as well. Publication requires affirmative acceptance, saved locally with a version. This is a local receipt, not an identity-verified contract archive or remote consent ledger. Offline viewing is not blocked by a legal modal.

Before a public legal release, confirm the actual legal operator and country/state, and obtain qualified legal review appropriate to the release jurisdictions. “Pocket KiView team” is a support signature, not a verified registered business identity. The current text does not invent an operator entity, governing-law selection, arbitration clause, immunity, indemnity or waiver of mandatory rights. It preserves mandatory consumer protections and liability that cannot be excluded.

The liability clauses and disclaimers reduce ambiguity; they do not guarantee enforceability or replace safe implementation, actual moderation, privacy compliance, third-party licensing, insurance or necessary professional review. No automatic moderation or report-delivery backend is claimed.

Google Play requires acceptance of terms/user policies before user-generated content upload and effective ongoing moderation, not just legal text: https://support.google.com/googleplay/android-developer/answer/9876937

The bundled terms and policy-site HTML are prepared locally. Updating the live public policy site is a separate publication action. Confirm the legal operator before representing these as finalized public terms. The existing public privacy policy remains separate and should continue to match actual data handling.
