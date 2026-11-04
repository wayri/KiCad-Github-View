package dev.kicadvizdiff.android;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

/** Bounded generated-document bytes, never a source URL or filesystem path. */
final class DocumentExportPolicy {
    static final int PDF_LIMIT = 16 * 1024 * 1024;
    static final int SVG_LIMIT = 8 * 1024 * 1024;
    static final int JSON_LIMIT = 4 * 1024 * 1024;

    static boolean requestId(String value) { return value != null && value.matches("[A-Za-z0-9_-]{16,80}"); }

    static byte[] decode(String name, String mime, String encoding, String value) {
        if (name == null || !name.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,99}") || value == null) throw new IllegalArgumentException("Invalid document export.");
        String lower = name.toLowerCase(Locale.ROOT);
        if ("application/pdf".equals(mime) && lower.endsWith(".pdf") && "base64".equals(encoding)) {
            if (value.length() > ((PDF_LIMIT + 2) / 3) * 4 || !value.matches("[A-Za-z0-9+/]*={0,2}")) throw new IllegalArgumentException("PDF exceeds the 16 MiB mobile export limit or has invalid encoding.");
            byte[] bytes;
            try { bytes = Base64.getDecoder().decode(value); } catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Invalid PDF encoding."); }
            if (bytes.length < 16 || bytes.length > PDF_LIMIT) throw new IllegalArgumentException("Invalid PDF export size.");
            String header = new String(bytes, 0, Math.min(9, bytes.length), StandardCharsets.US_ASCII);
            String tail = new String(bytes, Math.max(0, bytes.length - 1024), Math.min(1024, bytes.length), StandardCharsets.US_ASCII).trim();
            if (!header.matches("%PDF-(?:1\\.[0-7]|2\\.0)[\\r\\n].*") || !tail.endsWith("%%EOF")) throw new IllegalArgumentException("Invalid PDF document signature.");
            return bytes;
        }
        int limit;
        if ("image/svg+xml".equals(mime) && lower.endsWith(".svg") && "utf8".equals(encoding)) limit = SVG_LIMIT;
        else if ("application/json".equals(mime) && lower.endsWith(".json") && "utf8".equals(encoding)) limit = JSON_LIMIT;
        else throw new IllegalArgumentException("Choose a matching PDF, SVG or JSON filename, MIME type and encoding.");
        if (value.length() > limit) throw new IllegalArgumentException("Generated document exceeds its mobile export limit.");
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            if (current == 0) throw new IllegalArgumentException("Invalid document text.");
            if (Character.isHighSurrogate(current)) { if (++i >= value.length() || !Character.isLowSurrogate(value.charAt(i))) throw new IllegalArgumentException("Invalid UTF-8 document text."); }
            else if (Character.isLowSurrogate(current)) throw new IllegalArgumentException("Invalid UTF-8 document text.");
        }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > limit) throw new IllegalArgumentException("Generated document exceeds its mobile export limit.");
        String text = value.trim();
        if ("image/svg+xml".equals(mime)) {
            String upper = text.toUpperCase(Locale.ROOT);
            if (upper.contains("<!DOCTYPE") || upper.contains("<!ENTITY")) throw new IllegalArgumentException("SVG declarations and entities are not supported.");
            if (text.startsWith("<?xml")) { int end = text.indexOf("?>"); if (end < 0 || end > 200) throw new IllegalArgumentException("Invalid SVG declaration."); text = text.substring(end + 2).trim(); }
            if (!text.matches("(?s)<svg(?:\\s|>).*" ) || !text.endsWith("</svg>") && !text.endsWith("/>")) throw new IllegalArgumentException("Invalid SVG document signature.");
        } else {
            if (!(text.startsWith("{") && text.endsWith("}") || text.startsWith("[") && text.endsWith("]"))) throw new IllegalArgumentException("Invalid JSON document signature.");
            validateJsonStructure(text);
        }
        // The Android host additionally parses the complete JSON/XML document.
        return bytes;
    }

    private static void validateJsonStructure(String text) {
        char[] stack = new char[128];
        int depth = 0;
        boolean quoted = false, escaped = false;
        for (int i = 0; i < text.length(); i++) {
            char current = text.charAt(i);
            if (quoted) {
                if (escaped) escaped = false;
                else if (current == '\\') escaped = true;
                else if (current == '"') quoted = false;
            } else if (current == '"') quoted = true;
            else if (current == '{' || current == '[') {
                if (depth == stack.length) throw new IllegalArgumentException("JSON export exceeds its nesting limit.");
                stack[depth++] = current;
            } else if (current == '}' || current == ']') {
                if (depth == 0 || stack[--depth] != (current == '}' ? '{' : '[')) throw new IllegalArgumentException("Invalid JSON document structure.");
            }
        }
        if (quoted || escaped || depth != 0) throw new IllegalArgumentException("Unclosed JSON document structure.");
    }
}
