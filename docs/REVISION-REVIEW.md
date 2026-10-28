# Commit actions, terminal selection and saved waveforms

Open **Repository → Commit history** and expand a commit. **View this commit** opens its saved drawing; **Compare with current** compares against the current revision. In VS Code this includes unsaved text in the current drawing, without checking out a branch or writing the file. Browser and Android comparisons use saved commits.

The commit's **More** menu provides three distinct operations:

| Action | Result |
| --- | --- |
| Download committed project | A ZIP of the selected revision. Browser downloads use the provider's archive link; private repositories may require provider sign-in. |
| Make local copy | VS Code exports into a new directory; Android retains a separate offline copy. In the browser, download the ZIP, extract it into a new directory, then open it in the local workspace. |
| Fork from this commit | Choose a new repository name, destination account/organization or namespace, and branch name. Confirm to create a remote fork and a separate branch at the exact selected SHA. |

A remote fork retains its provider-created default branch; the selected commit is pinned by the explicitly named review branch. The source repository is unchanged. Existing destinations are rejected. GitLab destinations use a numeric namespace ID; leave it empty for your account. Provider permissions and administrator policies still apply. If fork creation succeeds but branch creation fails, the result identifies the partial operation and gives its recovery URL; it does not delete the fork or silently retry a write. Remote-fork tests use simulated provider responses, not live account mutations.

Native committed exports reject symlinks, submodules, unsafe names and collisions, and retain limits of 2,000 files, 32 MiB per file and 128 MiB total. Provider archive downloads and Android import limits are separate. Large disk-backed Android revision comparisons still have separate transport limitations.

## Select a terminal

Choose **Pin / pad** in the selection selector to pick terminals rather than entire components. Cross-selection uses the source drawing, component identity and pin/pad number. Missing or ambiguous matches are reported rather than highlighting an arbitrary component. This applies to individual terminal selection; grouped terminal cross-selection is not supported.

In PCB 2D, enable net names and zoom in for fitted pad number/name and net labels. In 3D, enable **Pad and net names (close zoom)** in Display. Dense, distant and occluded labels are culled to keep the board readable. Scroll over the floating layer selector, or use its arrow keys, to cycle saved copper layers without zooming the drawing.

## Link saved samples to a net

Open **Saved reports** in a drawing and use **Link net plots** beside a supported CSV, TSV, ASCII RAW or JSON result. Select a saved voltage signal, or select an exactly matching net in the drawing, to see a small sample plot and cursor. **Open full graph** opens the report viewer. Its **Locate net** action uses the selected voltage trace; browser and Android users explicitly choose the target drawing when several are available. VS Code sends the selection only to its original, matching drawing session.

Matching requires an exact qualified net name or explicit source-sheet binding. Similar names, case changes, repeated sheet instances and arbitrary signal expressions are not guessed. Signal names alone do not verify the result's source design revision. KiCad `.wbk` files contain setup and display settings, not saved waveform samples; include a CSV or ASCII RAW export for graphs. Binary RAW and solver execution are unsupported. This is saved-data inspection, not the schematic-to-PCB snippet lens shown in the reference video.
