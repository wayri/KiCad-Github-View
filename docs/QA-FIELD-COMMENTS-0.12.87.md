# Property and BoM comment acceptance — 0.12.87

5 November 2026. Current-source production viewer in the integrated browser, through an allowlisted loopback harness. No private organization material used.

Public board: OLIMEX ESP32-PoE M2, commit deb38a377d50eadb04ddc7118a17a5ae58b1ee53, HARDWARE/ESP32-PoE-hardware-revision-M2. Retained saved PCB loaded as ESP32-PoE.kicad_pcb. The schematic in this harness is the separate public test fixture, not claimed as the board's matching schematic.

## Exercised through actual controls

- Select R42 from the Parts explorer; comment on Value = 9.1k/R2512. Save and inspect the note, position and marker.
- Open the real-board BoM (143 parts), filter R42, comment on Footprint = OLIMEX_RLC-FP:R_2512_MM_DWS. Save and reopen the note to edit it.
- On a two-part grouped fixture, comment on a grouped field. J1 and R1 both appear in the draft/card; only the first part is the primary Locate anchor. All references remain in metadata.
- Full viewer reload retains both fixture notes, field context and markers. Locate closes the panel and focuses the saved position; Back to comments is available.
- Deterministic tests cover GitHub/GitLab Markdown and local export/import round trips, invalid and oversized metadata, grouped callbacks and explicit-save semantics.

The first browser failure was in local test-server startup, before the viewer loaded: the default HTTP server performed reverse hostname resolution. A loopback-only server_bind override without getfqdn made the server immediately reachable. No OS firewall, certificate or browser security settings were weakened.

No new live provider write was performed for this feature. Tests of serialized provider metadata do not imply installed extension or physical Android acceptance. Standalone imported BoM tables are not covered. Packages and source must be audited before submission.
