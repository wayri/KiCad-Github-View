# BoM field table

The drawing BoM manager and imported BoM and assembly viewer follow KiCad's Symbol Fields Table structure:
field columns, Show and Group by checkboxes, Group symbols, a filter and CSV
export. The source interface is described in the [KiCad manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html).

The Group by selector offers Value, Footprint, Value + footprint, Rate (unit
price), and Custom fields. Choosing a preset enables grouping. Custom field
checkboxes allow multiple grouping keys. Rate grouping compares numeric saved
prices, keeps currencies distinct and does not treat a missing price as zero.

Reference, Value, Footprint, Qty, DNP, Exclude from BoM and Assembly are shown
initially. Imported custom fields and procurement draft fields are available
in Fields and grouping. Grouping starts with Value and Footprint, preserves
source identities, and separates DNP and excluded parts. Differing fields
display `<mixed>`. Ungroup to set individual assembly states, or select a
reference and use its existing progress control.

The drawing manager shares the same field/grouping model and exports the displayed
columns and groups. Group management edits only changed fields, preserving mixed
procurement values. The phone table scrolls horizontally with a fixed first column and fixed
headers. Field settings collapse above the grid on phones and sit alongside
it on desktop. A reference selects its original imported object and locates
it on assembly geometry when that geometry exists. Saved design fields are
read-only; procurement and progress remain local, source/variant scoped drafts.

Verification: 1,207 JavaScript checks passed. Browser checks using the retained
BoM Studio producer fixture verified 11 parts in 7 grouped rows, 11 ungrouped
rows, custom MPN column visibility, and C1 selection. Phone and desktop
screenshots are in `dist/ui-polish`. Physical Android testing remains pending.
# Reset saved management fields

Use **Manage → Reset saved fields…** for one part or a grouped row. For bulk work, open **Reset progress / fields** and choose **Reset matching parts…** (the entire filtered result, including rows beyond the first displayed page) or **Reset entire source…** (the current source, including DNP/excluded parts).

The warning lists affected identities and count. Choose assembly progress only, procurement status only, or all local management fields; acknowledge the warning before confirming. Changing the reset mode clears acknowledgement. Assembly returns to `not started`; procurement returns to `not ordered`. All-fields reset removes local management overrides so original saved KiCad fields reappear. Source drawings, variants, DNP definitions and provider publications are unchanged. Export metadata first for a recoverable backup. Cancel performs no write; a failed save preserves existing data and keeps the warning open.
