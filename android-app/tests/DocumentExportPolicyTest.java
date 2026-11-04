package dev.kicadvizdiff.android;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

public final class DocumentExportPolicyTest {
    private static int checks;
    private static void check(boolean value, String reason) { checks++; if (!value) throw new AssertionError(reason); }
    private static void reject(String name, String mime, String encoding, String value, String reason) {
        boolean rejected = false;
        try { DocumentExportPolicy.decode(name, mime, encoding, value); } catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, reason);
    }
    public static void main(String[] args) {
        byte[] pdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        String encoded = Base64.getEncoder().encodeToString(pdf);
        check(Arrays.equals(pdf, DocumentExportPolicy.decode("assembly.pdf", "application/pdf", "base64", encoded)), "PDF bytes stay binary");
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>R1 &amp; C1</text></svg>";
        check(Arrays.equals(svg.getBytes(StandardCharsets.UTF_8), DocumentExportPolicy.decode("assembly-sheet-1.svg", "image/svg+xml", "utf8", svg)), "SVG UTF-8 bytes");
        String json = "{\"title\":\"Assembly π\"}";
        check(Arrays.equals(json.getBytes(StandardCharsets.UTF_8), DocumentExportPolicy.decode("assembly.kivi-draft.json", "application/json", "utf8", json)), "JSON UTF-8 bytes");
        check(DocumentExportPolicy.requestId("12345678-1234-1234-1234-123456789abc"), "correlated request identity");
        for (String id : new String[]{"", "short", "<script>request-id</script>", null}) check(!DocumentExportPolicy.requestId(id), "unsafe request identity");
        for (String name : new String[]{"../assembly.pdf", "/assembly.pdf", "file:///assembly.pdf", "dir/assembly.pdf", "dir\\assembly.pdf", "a%2fb.pdf", ".pdf", "assembly.pdf\n", null}) reject(name, "application/pdf", "base64", encoded, "unsafe filename: " + name);
        reject("assembly.svg", "application/pdf", "base64", encoded, "extension/MIME mismatch");
        reject("assembly.pdf", "application/pdf", "utf8", new String(pdf, StandardCharsets.US_ASCII), "binary PDF requires base64");
        reject("assembly.pdf", "application/pdf", "base64", "data:application/pdf;base64," + encoded, "no data URLs");
        reject("assembly.pdf", "application/pdf", "base64", Base64.getEncoder().encodeToString("<html>not a PDF</html>".getBytes(StandardCharsets.US_ASCII)), "PDF signature");
        reject("assembly.pdf", "application/pdf", "base64", Base64.getEncoder().encodeToString("%PDF-1.4\ntruncated document".getBytes(StandardCharsets.US_ASCII)), "PDF EOF signature");
        reject("assembly.svg", "image/svg+xml", "utf8", "<html></html>", "SVG root signature");
        reject("assembly.svg", "image/svg+xml", "utf8", "<!DOCTYPE svg SYSTEM \"https://fixture.example.test/external.dtd\">" + svg, "external DTD rejected without resolving it");
        reject("assembly.svg", "image/svg+xml", "utf8", "<!DOCTYPE svg [<!ENTITY secret SYSTEM \"file:///private-data\">]>" + svg, "entity declaration rejected");
        reject("assembly.svg", "image/svg+xml", "utf8", "<!doctype svg>" + svg, "declaration case variant rejected");
        reject("assembly.svg", "image/svg+xml", "utf8", "https://fixture.example.test/assembly.svg", "no source URL exports");
        reject("assembly.json", "application/json", "utf8", "<script></script>", "JSON root signature");
        reject("assembly.json", "application/json", "base64", "e30=", "JSON uses UTF-8 text");
        reject("assembly.json", "application/json", "utf8", "{\"text\":\"\ud800\"}", "unpaired surrogate rejected");
        reject("assembly.json", "application/json", "utf8", "{\"text\":\"\u0000\"}", "NUL rejected");
        String depth128 = "[".repeat(128) + "0" + "]".repeat(128);
        check(DocumentExportPolicy.decode("assembly.json", "application/json", "utf8", depth128).length == depth128.length(), "128 structural nesting levels allowed");
        reject("assembly.json", "application/json", "utf8", "[".repeat(129) + "0" + "]".repeat(129), "129 structural nesting levels rejected before recursive parsing");
        String quotedBraces = "{\"note\":\"" + "{[}]".repeat(200) + "\",\"escaped\":\"quoted \\\" [ ] } { and backslash \\\\\"}";
        check(Arrays.equals(quotedBraces.getBytes(StandardCharsets.UTF_8), DocumentExportPolicy.decode("assembly.json", "application/json", "utf8", quotedBraces)), "brackets and escaped quotes inside strings do not affect structure");
        reject("assembly.json", "application/json", "utf8", "{\"note\":\"unclosed}", "unclosed quoted string rejected");
        reject("assembly.json", "application/json", "utf8", "{\"note\":[0}}", "mismatched bracket rejected");
        reject("assembly.json", "application/json", "utf8", "{\"note\":[0]", "unclosed structure rejected");
        reject("assembly.json", "application/json", "utf8", "[\"" + "é".repeat(DocumentExportPolicy.JSON_LIMIT / 2) + "\"]", "UTF-8 byte limit, not only Java character count");
        reject("assembly.pdf", "application/pdf", "base64", "A".repeat(((DocumentExportPolicy.PDF_LIMIT + 2) / 3) * 4 + 1), "base64 size is bounded before decoding");
        System.out.println("Document export policy: " + checks + " checks passed");
    }
}
