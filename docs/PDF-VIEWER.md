# Integrated PDF viewer

Pocket KiView opens PDFs inside the phone and browser viewer. Choose **PDF viewer** from Android home/menu/drawing tools, open an imported PDF in Files & actions, or choose a PDF from the extension project tree. The hosted web home also links to the viewer for local PDF selection.

Features: previous/next or direct page navigation, fit width, zoom, rotation, document bookmarks, text search with page/snippet results, and selectable extracted page text. Password-protected documents prompt for a session-only password. Close document releases its loading/rendering worker and clears text/search state.

PDFs are binary files rather than decoded text. Android supports individual files, folders, ZIP projects, supported repository imports and saved offline projects. The extension reads repository PDFs through a separate, read-only, bounded binary transport scoped to the selected repository/revision; the PDF page cannot publish comments or request arbitrary model/source operations.

Rendering uses locally bundled Mozilla PDF.js 6.4.299 and bundled fonts, CMaps and image decoders. Documents are processed locally without automatic upload. PDF JavaScript, interactive forms/actions and embedded/external document links are not exposed. This is a document reader; annotations, PDF editing, OCR, printing and signature verification are not implemented. Scanned documents display but have no searchable text unless the file already includes a text layer.

Limits: 32 MiB per PDF, 5,000 pages, one rendered page at a time, 16 million canvas pixels with an 8192-pixel axis cap. Search covers at most 500 pages and 4 million extracted characters; partial coverage is reported. Bookmark display is bounded to 1000 entries and 12 levels. Repository binary reads also share the existing revision retrieval budget.

Browser verification used a deterministic two-page PDF to check rendering, text search, result navigation and page text. Binary-byte fidelity, malformed/oversized payloads, page/canvas bounds, extension sender restrictions and Android PDF-only project/transport routing have automated coverage. Android build/lint and packaging checks passed. Actual phone file-picker/offline PDF acceptance remains to be recorded.

The current debug APK contains this addition. Previously prepared signed Play/release artifacts predate it and require rebuilding and artifact-specific acceptance before deployment.
