# GitHub website project snapshots

Browser project viewing uses the open GitHub repository page and direct raw file
downloads. Project discovery, drawing hierarchy, companion drawings, saved rule
reports, model files and project search do not call GitHub's REST or GraphQL APIs.
The repository tab must stay open for website directory discovery and private reads.
The repository's page remains unchanged; the viewer opens separately.

The viewer pins a commit before reading files. Public file bytes and directory
metadata are shared between viewer windows in a bounded, memory-only background
buffer, so detaching or revisiting a drawing reuses the snapshot. Mutable branch
resolution expires after 30 seconds; immutable entries expire after 30 minutes.
The cache holds at most 128 MiB and 256 entries. Eviction, expiration or browser
worker shutdown may require downloading again. This is a temporary optimization,
not an offline project backup. Private file contents are not cached by this buffer.

Website discovery is bounded to 64 directories and 1,000 entries. Incomplete
results are identified, and uncertain library-model matching is disabled.
Linked files named explicitly by the saved drawing can still be fetched directly.
Missing model libraries on the author's computer cannot be inferred or downloaded
from unrelated sources.

API-based branch lists and commit graphs are not fetched automatically. Select
the branch or commit on GitHub and enter its name/SHA in the viewer to compare.
Explicit issue, discussion, publishing and account actions remain separate and
may use the provider API. Merely loading a drawing does not check comment policy
or start automatic GitHub comment polling.

Normal website/raw downloads can still fail because of connectivity, website
limits, private access, browser policy or unavailable files. API-free viewing is
not a claim of unlimited service access. Imported local projects remain available
without GitHub access.
