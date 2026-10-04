# GitHub Actions visual review

The optional runner workflow uses the installed KiCad CLI to export full schematic pages and PCB layers into portable HTML reports. It supplements the interactive browser extension. Download the workflow artifact and open `index.html`; each drawing link opens its side-by-side, overlay, swipe and changed-pixel comparison. Artifact HTML is downloaded rather than embedded into GitHub's file preview.

## Review a pull request

Use [the example workflow](../.github/workflows/visual-review.yml) in your hardware repository. It checks out full history, installs Python and KiCad 10, installs this tool, and runs `scripts/ci.py` with the PR base and head commits. The script resolves immutable commit IDs and compares the **merge base** to the PR head, excluding changes made later on the base branch. Full history must include both commits, including the fork head; missing commits fail visibly rather than substituting another revision.

The example's `pip install .` assumes this tool's source is present. In a separate hardware repository, install this repository at a reviewed commit or use the composite action below, and supply your copy of `scripts/ci.py` if using its multi-file workflow. The supplied workflow's native tests verify this tool's own source checkout, not your hardware's electrical correctness.

Reports include additions, modifications, deletions and detected renames. A renamed drawing uses its previous path at the base revision. Schematic pages with matching saved hierarchy identities remain paired after a filename or sheet-name change. Ambiguous page matches remain separate. Deleted drawings retain the old rendering and an empty new side.

`sensor.kicad_sch.html` and `sensor.kicad_pcb.html` are distinct output paths, even when the source files share a basename. `review.json` records resolved base/head IDs, old/new paths, Git status, report paths and success. A failed rendering fails the job and is identified in the index without a success link. The artifact upload runs after rendering failures so completed reports remain available. A comparison without changed drawings still produces an index stating that fact. More than 256 changed drawings is rejected with a visible limit message.

The workflow has read-only repository permissions and no posting token. It does not publish review comments, mutate designs, evaluate ERC/DRC or certify fabrication. Reports use the saved file state; the native renderer, browser fonts and supported layers still determine visual output. Fork PR workflows run untrusted repository code with the ordinary restricted PR token; do not switch this workflow to `pull_request_target` or add privileged secrets.

## Compare branches or commits manually

Open **Actions → KiCad visual review → Run workflow**. Enter existing base and head revisions in the checked-out repository. Manual comparisons use those two resolved commits directly; PR runs use their merge base. The repository's sample designs are original synthetic examples under [`examples/sensor`](../examples/sensor/README.md).

To run the same multi-file comparison locally, install Git, Python and KiCad CLI 9+:

```sh
python -m pip install -e .
# Bash; use equivalent environment assignment in PowerShell.
BASE_SHA=main HEAD_SHA=feature REVIEW_MERGE_BASE=true python scripts/ci.py
```

## Use the composite action for one design

Install KiCad on the runner first, then check out your hardware repository with both revisions available. Pin the action to a reviewed commit in production. For a root schematic, native KiCad also exports its child sheets.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
    persist-credentials: false
- uses: wayri/KiCad-Github-View@main
  id: review
  with:
    file: hardware/controller.kicad_sch
    old-file: hardware/previous-controller.kicad_sch # Omit unless renamed
    base: YOUR_RESOLVED_BASE_COMMIT
    head: YOUR_RESOLVED_HEAD_COMMIT
    output: controller-review.html
- uses: actions/upload-artifact@v4
  with:
    name: controller-visual-review
    path: ${{ steps.review.outputs.report }}
```

The composite action compares the supplied revisions directly. Resolve the merge base yourself for PR semantics; `scripts/ci.py` does that automatically for the supplied PR workflow. `old-file` preserves the base-side path when a drawing was renamed. Missing drawings on only one side are allowed; a drawing missing on both sides fails.
