# Security and managed-browser review · 0.12.80

Date: 2 November 2026. This is a bounded source review and adversarial regression run, not an independent penetration-test certification or a promise of immunity to exploitation.

## Boundaries exercised

Chrome extension message senders and page scope; public GitHub HTML/raw transport and immutable repository identity; GitLab host pinning and provider operations; hostile source paths, ZIP admission and parser budgets; injected browser messages and untrusted HTML; portable review imports; local HTTP service admission, framing, deadlines and webhook replay; Git environment/hooks/transports; Android origin, picker, archive and enterprise admission; release archive source/version integrity.

The focused independent review of background, project-buffer, website-reader and launcher boundaries found no confirmed exploitable injection or credential-exfiltration path in that scope. That is not an exhaustive audit of every dependency, deployment, browser or operating-system attack surface.

## Corrections

- Office diagnostics previously checked only raw/API endpoints and could imply that an optional API block prevented project viewing. Website/raw viewing and optional account/review API results are now separate.
- Explicit administrator network restrictions and unavailable/invalid managed configuration now have distinct static diagnostics. A generic fetch failure is still inconclusive; it is never labelled proof of an organization block.
- The background response retains only the recognized MANAGED_POLICY code, not arbitrary exception properties. A regression verifies that private extra fields and unknown codes are not serialized.
- Settings check administrator controls before connectivity probes. Invalid/offline policy means no probes. The supported local-file route stays visible where administrators permit local use. No policy, permissions or security protections are bypassed.
- Datasheet shortcuts admit only HTTP/HTTPS URLs without embedded credentials. Editable controls retain normal typing. Cross-probe identities reject foreign roots and ambiguous repeated instances.

## Current evidence

- **2,198 JavaScript checks passed**, serial final run; no skips. This includes hostile message/transport/archive/parser/provider inputs and focused new regressions.
- **148 Python tests passed; one skipped (149 total)**: this Windows account cannot create the symbolic link used by one local-viewer test. Native KiCad synthetic exports and Git/HTTP tests ran.
- **24 focused Python security/package tests passed** in an overlapping focused run, including Android JVM boundary checks, Git hook/transport rejection, local-service origin/framing/deadline checks and package metadata tampering.
- Android assembleDebug, lintDebug and bundleRelease passed after the final shared-asset update. Lint warnings and unsigned-bundle status are recorded by the release manifest; this is not installed-device security testing.
- Current-source pattern scan inspected **1,005 UTF-8 files up to2MiB** for private keys and common GitHub/GitLab/AWS token patterns: no candidates. It excludes large/binary files, ignored caches and Git history and is not proof that secrets cannot exist.
- Real Olimex and Marble browser acceptance used pinned public snapshots and the packaged viewer. No provider writes or private-design disclosure were performed in this run.

## Remaining deployment requirements

Actual office-managed Chrome/Edge configurations, EDR/proxy/TLS interception, installed Firefox/VSIX and Android hardware were not available for this run. Use [managed-browser diagnostics](MANAGED-BROWSERS.md) with your administrator; include sanitized error category and affected feature, never credentials or confidential project content. A disabled/blocked extension cannot diagnose itself, and must be handled by the administrator. A fresh exhaustive dependency-advisory audit, binary-reproducibility audit and third-party penetration test remain separate work; historical scanner results are in SECURITY-AUDIT-2026-10-27.md and are not represented as newly rerun here.
