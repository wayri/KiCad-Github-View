# Chrome workspace and drawing BoM layout

Prepared Chrome package 0.12.50 on 23 October 2026; not submitted to the store.

The local workspace uses a compact header with inline import status and a file-tree toggle. Parallel drawing panes use an accessible separator: drag to resize, arrow keys adjust, Shift increases the step, Home/End select the bounds and double-click restores equal sizes. The 20–80% split persists locally. Narrow workspaces stack the views and resize vertically. Pointer capture and temporarily disabling iframe pointer input keep drags working across drawings; resizing does not navigate either frame.

The shared drawing BoM manager fills its view with a scrollable field table, sticky column headers and reference column. Search, source, variant and grouping stay above the table. Columns, filters, transfers and explanatory information collapse by default. Virtual schematic references beginning with `#` remain available through excluded-parts filtering and do not contribute to procurement or assembly totals. Source designs are unchanged.

Validation: 28 focused JavaScript tests passed; 10 Python local-host/package tests passed with one platform-specific skip. Browser inspection of the actual shared viewer on the loopback launcher measured a 38.7px host header and verified a 50/50 to 60/40 pointer drag. Full-width PCB BoM inspected visually. This local-host check is not a fresh installed Chrome-store acceptance run. The ZIP inventory and six changed viewer assets were checked byte-for-byte against the source. No iOS changes were published.
