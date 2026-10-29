# Independent linked browser views

Use **Detach → Schematic / Layout / 3D**, or drag a supported view tab beyond the
viewer window. Matching current drawings open immediately from the gesture.
When another drawing is needed, choose the saved drawing and press **Open window**.
The browser may require popup permission. Each window keeps independent pan,
zoom and drawing controls.

**Cross-select detached views** enables/disables selection sharing for the linked
session, including newly joined windows. Part, net and individual pin/pad selections
use saved object identities and existing schematic/PCB association checks.
A missing or ambiguous target remains a diagnostic instead of a guessed match.
Groups of parts/nets are supported; multiple-pin groups remain unsupported.
Layout and 3D windows on the same board share the same saved identities.

A random session capability plus provider, repository and exact revision scope
isolates the message channel. Selection payloads, traffic and replay state are
bounded; received events do not echo back. Views at a different revision do not
cross-select. Closing a window releases its channel.

Imported local browser projects can detach while the original workspace stays
open. The original workspace grants an exact, same-origin viewer URL read-only
access to its imported project transport. Closing that workspace makes reloads
of those local detached views unavailable; reopen the project to start a new session.

VS Code Webviews and the native Android WebView do not currently expose this
browser popup mechanism. They show an explicit unavailable message and retain
split/parallel views. Their release packages contain the shared feature without
claiming native OS floating-window support. Desktop browser popup and tab-drag
behavior remains dependent on browser and administrator policies.
