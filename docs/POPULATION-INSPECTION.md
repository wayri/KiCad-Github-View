# Photo population and variant review

Pocket KiView shares this inspection workflow between the browser viewer and Android. Open a PCB, choose **Photo & AR review**, import or capture a still photo, and align four known component centers. Retain separately aligned front and back photographs by changing the Side selector. Choose **Population inspection** to review the table against the selected saved variant.

Mark each component **Fitted**, **Empty / DNP**, or **Unknown** after inspecting the photo. Empty means visually absent; it does not prove the absence was intentional. A mismatch compares the observed state with the selected variant's population data and does not edit the design or BoM.

## Assisted automatic comparison

This implementation compares against reviewed examples, rather than recognizing arbitrary components with a pretrained model. For each component, collect a verified fitted photograph and a verified empty photograph of the same board revision. Review the state before using **Use as fitted reference** or **Use as empty reference**. Export the reference file, then import it while inspecting another board. Both example states are needed for every component you want to compare automatically.

References bind to the exact PCB content SHA-256, footprint identity, source path and board side. Native photo pixels are sampled into a rectified 32 × 32 region using saved fabrication body geometry; pad extents are a disclosed approximation when fabrication geometry is unavailable. Spatial brightness-normalized luminance and edges are compared conservatively. Missing references, poor texture, small regions, out-of-frame regions and ambiguous matches produce **unknown**. Automatic findings remain suggestions until a person reviews them. The displayed score is a comparison score, not a calibrated probability of correctness.

These checks cannot establish part value, correct MPN, polarity, solder quality or hidden underside connections. Physical-photo detection accuracy has not been measured. Validate references and thresholds with representative boards, lighting, camera distance and intentional missing parts before relying on this workflow for assembly checks.

## Variant inference

Inference uses population differences in saved variants. At least two observed distinguishing components and exactly one contradiction-free candidate are required. Human-reviewed findings and strong reference matches contribute; unknown findings do not. Variants differing only in invisible values or part numbers remain indistinguishable. A suggested variant does not change the selected variant automatically.

## Photos, logs and Discussions

Imported JPEG, PNG and WebP files are capped at 16 MiB, 32 megapixels and 8192 pixels per axis. Still capture uses `ImageCapture.takePhoto` when available, with a native video-resolution fallback. Display downscaling does not reduce the original pixels used for inspection. A fresh still capture requires fresh alignment because camera still and preview framing can differ. Retained photos share a 32 megapixel session budget; adding a photo beyond this releases the other side and requires importing it again at a smaller resolution. Changing the board or closing photo review releases photographs. Reference files are bounded to 4 MiB and 2000 entries; comparison uses at most 16 matching references per component.

**Export inspection log** saves JSON with both retained sides, image and PCB hashes, dimensions, calibration, observations, comparison evidence, human review status, mismatches and variant ranking. References are exported separately. Photos and reference data stay in the local session unless explicitly exported or published.

**Prepare Discussion with photos** opens the existing editable Discussion composer with a bounded Markdown summary and a labelled, compressed top/bottom contact sheet. Choose the repository and Discussion category, review the image and text, then use the existing publish controls. Preparing the draft performs no upload. Publishing uses the existing GitHub attachment and permission checks. The photo sheet is compressed to the comment attachment limits; it does not upload the full-resolution originals. Export the complete JSON log separately when the summary is truncated or complete evidence is needed. Publishing and native camera behavior still require validation on a connected phone and an authorized test repository.

## Verification

Engine tests cover fitted/empty reference comparison, brightness changes, unknown outcomes, exact source/side scoping, reference import limits, conservative variant inference and report provenance. Geometry tests cover rotated fabrication bounds, circular bodies, pad approximation, mirrored native-resolution crop sampling and minimum pixel rejection. A synthetic browser fixture verifies the two-side table, mismatch review, variant inference and Discussion contact-sheet preparation. These are software checks, not measured real-board accuracy.

On 2026-10-11, 1065 JavaScript tests and 41 Python application/packaging/release tests passed; Android `assembleDebug lintDebug --offline` passed. Browser checks also exercised real photo import/calibration handlers, side switching and retention of two 2000 × 2000 originals into a compressed Discussion draft. No physical device was connected to ADB; no Discussion was posted. The updated artifact is `android-app/app/build/outputs/apk/debug/app-debug.apk`. Existing signed Play artifacts must be rebuilt and revalidated before deploying these additions.
