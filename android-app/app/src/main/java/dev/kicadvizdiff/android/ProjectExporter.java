package dev.kicadvizdiff.android;

import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Exports only original source/model payloads; never serializes app or account metadata. */
final class ProjectExporter {
    private ProjectExporter() { }

    static void write(ContentResolver resolver, Uri destination, JSONObject project,
                      ProjectImporter.Cancelled cancelled) throws Exception {
        try (OutputStream raw = resolver.openOutputStream(destination, "wt")) {
            if (raw == null) throw new IOException("Cannot write selected destination");
            try (ZipOutputStream zip = new ZipOutputStream(raw, StandardCharsets.UTF_8)) {
                Set<String> paths = new HashSet<>();
                long total = 0;
                int count = 0;
                for (String category : new String[]{"files", "assets"}) {
                    JSONArray items = project.optJSONArray(category);
                    if (items == null) continue;
                    for (int i = 0; i < items.length(); i++) {
                        check(cancelled);
                        JSONObject item = items.getJSONObject(i);
                        String path = ProjectImporter.safePath(item.getString("path"));
                        String lower = path.toLowerCase(Locale.ROOT);
                        if (lower.equals(".kicad-review.json") || lower.endsWith("/.kicad-review.json")) continue;
                        boolean text = category.equals("files");
                        if (text ? !ProjectImporter.isText(path) : !ProjectImporter.isAsset(path))
                            throw new IOException("Unsupported project file");
                        if (!paths.add(lower)) throw new IOException("Duplicate project path");
                        if (++count > ProjectImporter.MAX_FILES) throw new IOException("Too many project files");
                        byte[] content = text ? item.getString("content").getBytes(StandardCharsets.UTF_8)
                                : Base64.decode(item.getString("base64"), Base64.DEFAULT);
                        total += content.length;
                        if (content.length > ProjectImporter.MAX_FILE_BYTES || total > ProjectImporter.MAX_TOTAL_BYTES)
                            throw new IOException("Project export size limit exceeded");
                        zip.putNextEntry(new ZipEntry(path));
                        for (int offset = 0; offset < content.length; offset += 65536) {
                            check(cancelled);
                            zip.write(content, offset, Math.min(65536, content.length - offset));
                        }
                        zip.closeEntry();
                    }
                }
                if (count == 0) throw new IOException("No project files available to download");
                check(cancelled);
            }
        }
    }

    private static void check(ProjectImporter.Cancelled cancelled) throws IOException {
        if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new IOException("Download cancelled");
    }
}
