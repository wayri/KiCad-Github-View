"""Reproducible Firefox CSP adaptation of the pinned upstream PDF.js modules.

The input files remain unmodified in vendor/. Firefox packages replace a legacy
core-js global discovery fallback and restrict module loading to the exact local
worker and decoder modules used by Pocket KiView. Every replacement is guarded
by both the complete upstream digest and its exact source contract. Licenses and
upstream notices remain in the returned bytes. This is not a general JS rewriter.
"""
from __future__ import annotations

import hashlib

PREFIX = 'vendor/pdfjs/build/'
SOURCE_SHA256 = {
    'pdf.min.mjs': 'bccc24ea711db8e44503629519904a5292d73b9daaa214bbe7cdcc282b0f4259',
    'pdf.worker.min.mjs': '145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6',
}
GLOBAL_FALLBACK = 'Function("return this")()'
WORKER_IMPORT = 'import(\n/*webpackIgnore: true*/\n/*@vite-ignore*/\nthis.workerSrc)'
DECODER_IMPORT = 'import(\n/*webpackIgnore: true*/\n/*@vite-ignore*/\n`${WasmImage.#_}${this._noWasmFilename}`)'
WORKER_HELPER = r'''
// Pocket KiView Firefox CSP adapter: literal, extension-local worker only.
function kiviImportPdfWorker(source) {
  const expected = new URL("./pdf.worker.min.mjs", import.meta.url).href;
  if (source !== expected) return Promise.reject(new Error("PDF worker must be the packaged local module."));
  return import("./pdf.worker.min.mjs");
}
'''
DECODER_HELPER = r'''
// Pocket KiView Firefox CSP adapter: preserve both local no-WASM decoders.
async function kiviImportPdfDecoder(filename, base) {
  const expected = new URL("../wasm/", import.meta.url).href;
  if (typeof base !== "string" || new URL(base, import.meta.url).href !== expected)
    throw new Error("PDF decoder must use the packaged local module directory.");
  switch (filename) {
    case "jbig2_nowasm_fallback.js": return import("../wasm/jbig2_nowasm_fallback.js");
    case "openjpeg_nowasm_fallback.js": return import("../wasm/openjpeg_nowasm_fallback.js");
    default: throw new Error("Unsupported PDF fallback decoder.");
  }
}
'''


def _replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError('PDF.js source contract changed; review the Firefox CSP adapter.')
    return source.replace(old, new, 1)


def adapt(name: str, content: bytes) -> bytes:
    """Return packaged bytes; unrelated assets pass through unchanged."""
    short = name.removeprefix(PREFIX)
    if not name.startswith(PREFIX) or short not in SOURCE_SHA256:
        return content
    if hashlib.sha256(content).hexdigest() != SOURCE_SHA256[short]:
        raise ValueError('Pinned PDF.js digest changed; review the Firefox CSP adapter.')
    source = _replace_once(content.decode('utf-8'), GLOBAL_FALLBACK, 'globalThis')
    if short == 'pdf.min.mjs':
        source = _replace_once(source, WORKER_IMPORT, 'kiviImportPdfWorker(this.workerSrc)')
        helper = WORKER_HELPER
    else:
        source = _replace_once(source, DECODER_IMPORT,
                               'kiviImportPdfDecoder(this._noWasmFilename,WasmImage.#_)')
        helper = DECODER_HELPER
    # A function declaration after the upstream module is hoisted. Appending it
    # avoids moving or altering upstream copyright/license comments.
    return (source + helper).encode('utf-8')


def provenance() -> dict[str, object]:
    return {'adapter': 'scripts/firefox_pdf_csp.py',
            'upstreamVersion': '6.4.299',
            'upstreamSha256': dict(SOURCE_SHA256),
            'changes': ['Replace core-js Function global fallback with globalThis.',
                        'Resolve PDF fake worker and both no-WASM decoder fallbacks with literal local imports.'],
            'scope': 'Firefox packaged modules only; upstream vendored files and licenses are unchanged.'}
