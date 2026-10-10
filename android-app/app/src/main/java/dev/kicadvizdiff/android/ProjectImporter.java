package dev.kicadvizdiff.android;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class ProjectImporter {
    static final int MAX_FILE_BYTES = 32 * 1024 * 1024;
    static final int MAX_TOTAL_BYTES = 96 * 1024 * 1024;
    static final int MAX_FILES = 2000;
    private static final int MAX_TREE_NODES = 4000;
    
    private static final String[] COLUMNS = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
    };

    interface Cancelled {
        boolean get();
    }

    private static final class Entry {
        final Uri uri;
        final String path;
        final String documentId;
        final boolean directory;
        final long size;

        Entry(Uri uri, String path, String documentId, boolean directory, long size) {
            this.uri = uri;
            this.path = path;
            this.documentId = documentId;
            this.directory = directory;
            this.size = size;
        }
    }

    private ProjectImporter() { }

    static JSONObject read(ContentResolver resolver, java.io.File cacheDirectory, Uri uri, boolean folder,
                           Cancelled cancelled) throws Exception {
        JSONArray files = new JSONArray();
        JSONArray assets = new JSONArray();
        Set<String> paths = new HashSet<>();
        int[] counts = new int[2]; // files, raw bytes
        if (folder) {
            readTree(resolver, uri, cancelled, files, assets, paths, counts);
        } else {
            Entry entry = querySingle(resolver, uri);
            if (entry.path.toLowerCase(Locale.ROOT).endsWith(".zip")) {
                readZip(resolver, cacheDirectory, entry, cancelled, files, assets, paths, counts);
            } else addFile(resolver, entry, cancelled, files, assets, paths, counts);
        }
        if (files.length() == 0) {
            throw new IOException("No supported KiCad files found");
        }
        JSONObject result = new JSONObject();
        result.put("id", sourceId(uri));
        result.put("files", files);
        result.put("assets", assets);
        return result;
    }

    private static void readTree(ContentResolver resolver, Uri treeUri, Cancelled cancelled,
                                 JSONArray files, JSONArray assets, Set<String> paths,
                                 int[] counts) throws Exception {
        if (!DocumentsContract.isTreeUri(treeUri)) throw new IOException("Invalid folder selection");
        String rootId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri rootUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootId);
        Entry root = new Entry(rootUri, "", rootId, true, -1);
        ArrayDeque<Entry> queue = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        queue.add(root);
        int nodes = 0;
        while (!queue.isEmpty()) {
            checkCancelled(cancelled);
            Entry directory = queue.removeFirst();
            if (!visited.add(directory.documentId)) continue;
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
                    treeUri, directory.documentId);
            try (Cursor cursor = resolver.query(children, COLUMNS, null, null, null)) {
                if (cursor == null) throw new IOException("Cannot read selected folder");
                int idColumn = cursor.getColumnIndexOrThrow(COLUMNS[0]);
                int nameColumn = cursor.getColumnIndexOrThrow(COLUMNS[1]);
                int typeColumn = cursor.getColumnIndexOrThrow(COLUMNS[2]);
                int sizeColumn = cursor.getColumnIndexOrThrow(COLUMNS[3]);
                while (cursor.moveToNext()) {
                    checkCancelled(cancelled);
                    if (++nodes > MAX_TREE_NODES) throw new IOException("Folder has too many entries");
                    String id = cursor.getString(idColumn);
                    String name = safeSegment(cursor.getString(nameColumn));
                    if (name.equals(".git") || name.equals("node_modules") || name.equals(".gradle")) continue;
                    String type = cursor.getString(typeColumn);
                    long size = cursor.isNull(sizeColumn) ? -1 : cursor.getLong(sizeColumn);
                    String path = directory.path.isEmpty() ? name : directory.path + "/" + name;
                    Uri childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id);
                    boolean isDirectory = DocumentsContract.Document.MIME_TYPE_DIR.equals(type);
                    Entry child = new Entry(childUri, path, id, isDirectory, size);
                    if (isDirectory) {
                        queue.addLast(child);
                    } else {
                        addFile(resolver, child, cancelled, files, assets, paths, counts);
                    }
                }
            }
        }
    }

    private static Entry querySingle(ContentResolver resolver, Uri uri)
            throws IOException {
        try (Cursor cursor = resolver.query(uri,
                new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE},
                null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new IOException("Cannot read selected file");
            String name = safeSegment(cursor.getString(
                    cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)));
            int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
            long size = sizeColumn < 0 || cursor.isNull(sizeColumn) ? -1 : cursor.getLong(sizeColumn);
            return new Entry(uri, name, uri.toString(), false, size);
        } catch (RuntimeException error) {
            throw new IOException("Cannot inspect selected file", error);
        }
    }

    private static String safeSegment(String name) throws IOException {
        if (name == null || name.isEmpty() || name.equals(".") || name.equals("..")
                || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0
                || name.indexOf(':') >= 0) {
            throw new IOException("Unsafe file name in selection");
        }
        for (int i = 0; i < name.length(); i++) {
            if (Character.isISOControl(name.charAt(i))) {
                throw new IOException("Unsafe file name in selection");
            }
        }
        return name;
    }

    private static void addFile(ContentResolver resolver, Entry entry, Cancelled cancelled,
                                JSONArray files, JSONArray assets, Set<String> paths,
                                int[] counts) throws Exception {
        String path = entry.path;
        String lower = path.toLowerCase(Locale.ROOT);
        boolean text = isText(path);
        boolean binary = isAsset(path);
        if (!text && !binary) return;
        if (++counts[0] > MAX_FILES) throw new IOException("Too many KiCad files (limit 2000)");
        if (!paths.add(lower)) throw new IOException("Duplicate file path: " + path);
        if (entry.size > MAX_FILE_BYTES) throw new IOException("File exceeds 32 MiB: " + path);
        if (entry.size >= 0 && entry.size > MAX_TOTAL_BYTES - counts[1]) {
            throw new IOException("Project exceeds 96 MiB");
        }
        byte[] content = readBounded(resolver, entry.uri, cancelled,
                Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - counts[1]));
        counts[1] += content.length;
        JSONObject item = new JSONObject().put("path", path);
        if (text) {
            String decoded;
            try {
                decoded = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(content)).toString();
            } catch (java.nio.charset.CharacterCodingException error) {
                throw new IOException(lower.endsWith(".raw")
                        ? "Binary RAW data is unsupported. Import an ASCII RAW export."
                        : "Project text files must use UTF-8: " + path, error);
            }
            files.put(item.put("content", decoded));
        } else {
            assets.put(item.put("base64", Base64.encodeToString(content, Base64.NO_WRAP)));
        }
    }

    static boolean isText(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".kicad_sch") || lower.endsWith(".kicad_pcb")
                || lower.endsWith(".kicad_pro") || lower.endsWith(".kicad_dru")
                || lower.endsWith(".kicad_prl") || lower.endsWith(".kicad_wks")
                || lower.endsWith(".json") || lower.endsWith("/sym-lib-table")
                || lower.endsWith("/fp-lib-table") || lower.equals("sym-lib-table")
                || lower.equals("fp-lib-table") || lower.endsWith(".gbr")
                || lower.endsWith(".ger") || lower.endsWith(".drl") || lower.endsWith(".csv")
                || lower.endsWith(".tsv") || lower.endsWith(".txt") || lower.endsWith(".wbk")
                || lower.endsWith(".raw") || lower.endsWith(".html") || lower.endsWith(".htm");
    }

    static boolean isAsset(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".step") || lower.endsWith(".stp") || lower.endsWith(".wrl");
    }

    static String safePath(String path) throws IOException {
        if (path == null || path.length() > 500) throw new IOException("Unsafe project path");
        for (String segment : path.split("/", -1)) safeSegment(segment);
        return path;
    }

    private static void readZip(ContentResolver resolver, java.io.File cacheDirectory, Entry selected,
                                Cancelled cancelled, JSONArray files, JSONArray assets,
                                Set<String> paths, int[] counts) throws Exception {
        java.io.File archive = java.io.File.createTempFile("project-import-", ".zip", cacheDirectory);
        try {
            try (InputStream input = resolver.openInputStream(selected.uri)) {
                if (input == null) throw new IOException("Cannot open selected ZIP");
                ZipProjectReader.stage(input, archive, cancelled::get);
            }
            ZipProjectReader.read(archive, cancelled::get, path -> isText(path) || isAsset(path),
                    (path, content) -> {
                        if (++counts[0] > MAX_FILES) throw new IOException("Too many KiCad files (limit 2000)");
                        if (!paths.add(path.toLowerCase(Locale.ROOT))) throw new IOException("Duplicate file path: " + path);
                        counts[1] += content.length;
                        JSONObject item = new JSONObject().put("path", path);
                        if (isText(path)) files.put(item.put("content", StandardCharsets.UTF_8.newDecoder()
                                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                                .decode(ByteBuffer.wrap(content)).toString()));
                        else assets.put(item.put("base64", Base64.encodeToString(content, Base64.NO_WRAP)));
                    });
        } finally {
            if (!archive.delete()) archive.deleteOnExit();
        }
    }

    private static byte[] readBounded(ContentResolver resolver, Uri uri, Cancelled cancelled,
                                      int remaining) throws IOException {
        try (InputStream stream = resolver.openInputStream(uri)) {
            if (stream == null) throw new IOException("Cannot open selected file");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                checkCancelled(cancelled);
                if (count > remaining - output.size()) {
                    throw new IOException("File or project size limit exceeded");
                }
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static void checkCancelled(Cancelled cancelled) throws IOException {
        if (cancelled.get() || Thread.currentThread().isInterrupted()) {
            throw new IOException("Import cancelled");
        }
    }

    private static String sourceId(Uri uri) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(uri.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder(40);
        for (int i = 0; i < 20; i++) {
            id.append(Character.forDigit((digest[i] >> 4) & 0xf, 16));
            id.append(Character.forDigit(digest[i] & 0xf, 16));
        }
        return id.toString();
    }
}
