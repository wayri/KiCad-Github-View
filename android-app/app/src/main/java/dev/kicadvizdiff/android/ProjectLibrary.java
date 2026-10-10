package dev.kicadvizdiff.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.CipherOutputStream;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Explicit user-owned offline copies. Account sign-out must not clear this separate store. */
final class ProjectLibrary {
    private static final String ALIAS = "kicadvizdiff.project_library.v1";
    private static final long SNAPSHOT_LIMIT = 160L * 1024 * 1024;
    private static final long STORE_LIMIT = 512L * 1024 * 1024;
    private static final int INDEX_LIMIT = 1024 * 1024;
    private final File directory;
    private final DiskProjectStore diskStore;
    private final AtomicFile index;

    ProjectLibrary(Context context) {
        diskStore = new DiskProjectStore(context);
        directory = new File(context.getNoBackupFilesDir(), "project-library");
        index = new AtomicFile(new File(directory, "library.enc"));
    }

    synchronized JSONObject handle(JSONObject request, JSONObject activeProject) throws Exception {
        try { return dispatch(request, activeProject); }
        catch (IOException error) { throw new IllegalArgumentException(error.getMessage(), error); }
    }

    private JSONObject dispatch(JSONObject request, JSONObject activeProject) throws Exception {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create project library. Check available device storage.");
        JSONArray items = readIndex();
        pruneUnreferenced(items);
        String action = field(request, "action", "list", 40);
        if (action.equals("list")) return listing(items);
        if (action.equals("save")) return save(request, activeProject, items);
        String id = field(request, "id", "", 64);
        if (!id.matches("[a-f0-9]{64}")) throw new IOException("Invalid saved project ID");
        int position = find(items, id);
        if (position < 0) throw new IOException("Saved project not found. Refresh the library.");
        JSONObject item = items.getJSONObject(position);
        String oldFile = item.optString("snapshot"), oldDownload = item.optString("downloadedId");
        if (action.equals("open")) {
            if (oldFile.isEmpty()) throw new IOException("This project is bookmarked only. Open its online source and choose Save offline first.");
            JSONObject project = new JSONObject(readEncrypted(snapshotFile(oldFile), SNAPSHOT_LIMIT));
            // Only the source payload is exposed: offline views cannot inherit provider transport.
            JSONObject clean = sourceOnly(project);
            clean.put("offline", true).put("name", item.getString("name")).put("libraryId", id).put("offlineRef", item.optString("snapshotRef", item.optString("ref")));
            item.put("updated",System.currentTimeMillis()).put("lastOpened",System.currentTimeMillis());writeIndex(items);
            return new JSONObject().put("project", clean).put("item", publicItem(item));
        }
        if (action.equals("star")) item.put("starred", request.optBoolean("value", false));
        else if (action.equals("remove-offline")) { item.remove("snapshot"); item.remove("downloadedId"); item.remove("snapshotRef"); }
        else if (action.equals("remove")) items.remove(position);
        else throw new IOException("Unknown project library action");
        item.put("updated", System.currentTimeMillis());
        writeIndex(items);
        if ((action.equals("remove") || action.equals("remove-offline")) && !oldFile.isEmpty()) {
            if(!oldDownload.isEmpty()) diskStore.remove(new JSONObject().put("diskBacked",true).put("id",oldDownload));
            deleteSnapshot(oldFile);
        }
        return listing(items);
    }

    private JSONObject save(JSONObject request, JSONObject project, JSONArray items) throws Exception {
        if (project == null) throw new IOException("Open a project before saving it to your library.");
        String requestedId = field(request, "id", project.optString("libraryId"), 64);
        if (!requestedId.isEmpty() && !requestedId.matches("[a-f0-9]{64}")) throw new IOException("Invalid saved project ID");
        int existingPosition = requestedId.isEmpty() ? -1 : find(items, requestedId);
        if (!requestedId.isEmpty() && existingPosition < 0) throw new IOException("Saved project not found. Refresh the library.");
        JSONObject existing = existingPosition < 0 ? null : items.getJSONObject(existingPosition);
        JSONObject github = project.optJSONObject("github"), remote = project.optJSONObject("remote");
        String provider = field(request, "provider", existing != null ? existing.optString("provider") : remote != null ? remote.optString("provider", "gitlab") : github != null ? "github" : "local", 20);
        if (!provider.matches("local|github|gitlab")) throw new IOException("Unsupported project provider");
        String repository = field(request, "repository", existing != null ? existing.optString("repository") : remote != null ? remote.optString("repository") : github != null ? github.optString("repository") : "", 500);
        String host = field(request, "host", existing != null ? existing.optString("host") : remote != null ? remote.optString("host") : github != null ? "https://github.com" : "", 300);
        String ref = field(request, "ref", existing != null ? existing.optString("ref") : remote != null ? remote.optString("sha") : github != null ? github.optString("sha") : "", 200);
        String sourceId = field(project, "id", "", 200);
        if (sourceId.isEmpty()) throw new IOException("Project identity is missing");
        String identity = provider.equals("local") ? "local\n" + sourceId : provider + "\n" + host + "\n" + repository;
        String id = requestedId.isEmpty() ? hash(identity) : requestedId;
        int position = find(items, id);
        JSONObject previous = position < 0 ? null : items.getJSONObject(position);
        if (previous == null && items.length() >= 200) throw new IOException("Library limit reached (200 projects). Remove a bookmark first.");
        String name = field(request, "name", previous != null ? previous.optString("name") : repository.isEmpty() ? "KiCad project" : repository, 200);
        if (name.trim().isEmpty()) name = "KiCad project";
        JSONObject item = new JSONObject().put("id", id).put("name", name).put("provider", provider)
                .put("repository", repository).put("host", host).put("ref", ref)
                .put("starred", request.has("starred") ? request.optBoolean("starred") : request.has("star") ? request.optBoolean("star") : previous != null && previous.optBoolean("starred"))
                .put("updated", System.currentTimeMillis());
        if(request.optBoolean("remember", false)) item.put("lastOpened", System.currentTimeMillis());
        else if(previous!=null && previous.has("lastOpened")) item.put("lastOpened",previous.getLong("lastOpened"));
        if(previous!=null && previous.has("downloadedId"))item.put("downloadedId",previous.getString("downloadedId"));
        String oldFile = previous == null ? "" : previous.optString("snapshot");
        if (!oldFile.isEmpty()) item.put("snapshot", oldFile).put("snapshotRef", previous.optString("snapshotRef", previous.optString("ref")));
        String created = "";
        try {
            if (request.optBoolean("offline", false)) {
                int offlineCount = 0;
                for (int i = 0; i < items.length(); i++) if (!items.getJSONObject(i).optString("snapshot").isEmpty()) offlineCount++;
                if (oldFile.isEmpty() && offlineCount >= 20) throw new IOException("Offline limit reached (20 projects). Remove an offline copy first.");
                JSONObject clean = sourceOnly(project);
                if(project.optBoolean("diskBacked")) item.put("downloadedId",project.getString("id"));
                else item.remove("downloadedId");
                created = id + "-" + UUID.randomUUID().toString().replace("-", "") + ".enc";
                writeEncrypted(new AtomicFile(snapshotFile(created)), clean.toString(), SNAPSHOT_LIMIT);
                if (storedBytes() > STORE_LIMIT) throw new IOException("Offline storage limit reached (512 MiB). Remove an offline copy first.");
                item.put("snapshot", created).put("snapshotRef", project.optBoolean("offline") ? project.optString("offlineRef", ref) : ref);
            }
            if (position < 0) items.put(item); else items.put(position, item);
            writeIndex(items);
        } catch (Exception error) {
            if (!created.isEmpty()) deleteSnapshot(created);
            throw error;
        }
        if (!created.isEmpty() && !oldFile.isEmpty()) {deleteSnapshot(oldFile);if(previous!=null && !previous.optString("downloadedId").isEmpty() && !previous.optString("downloadedId").equals(item.optString("downloadedId")))diskStore.remove(new JSONObject().put("diskBacked",true).put("id",previous.getString("downloadedId")));}
        return listing(items);
    }

    private static JSONObject sourceOnly(JSONObject source) throws Exception {
        JSONArray files = source.optJSONArray("files"), assets = source.optJSONArray("assets");
        if (files == null || files.length() == 0 || files.length() > 2000 || assets != null && assets.length() > 2000)
            throw new IOException("Invalid offline project payload");
        if(source.optBoolean("diskBacked")) {
            JSONArray cleanFiles=new JSONArray(),cleanAssets=new JSONArray();
            for(int category=0;category<2;category++) {JSONArray entries=category==0?files:assets;if(entries==null)continue;
                for(int i=0;i<entries.length();i++){JSONObject entry=entries.getJSONObject(i);String path=entry.getString("path"),diskPath=entry.getString("diskPath");long size=entry.getLong("size");
                    if(!DiskProjectStore.pathOK(path)||!diskPath.matches("/assets/viewer/downloaded/[a-f0-9]{32}/[0-9]{1,4}")||size<0||size>DiskProjectStore.FILE_LIMIT)throw new IOException("Invalid downloaded file");
                    (category==0?cleanFiles:cleanAssets).put(new JSONObject().put("path",path).put("diskPath",diskPath).put("size",size));
                }
            }
            return new JSONObject().put("id",field(source,"id","project",200)).put("diskBacked",true).put("files",cleanFiles).put("assets",cleanAssets).put("offline",true);
        }
        // Native importers validate paths and original payload limits. Copy only source fields;
        // preflight escaped UTF-8 size before JSONObject.toString allocates its serialized buffer.
        long encoded = 2048;
        JSONArray cleanFiles = new JSONArray(), cleanAssets = new JSONArray();
        for (int category = 0; category < 2; category++) {
            JSONArray entries = category == 0 ? files : assets;
            if (entries == null) continue;
            String payloadKey = category == 0 ? "content" : "base64";
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.getJSONObject(i);
                String path = entry.getString("path"), payload = entry.getString(payloadKey);
                encoded += 128 + jsonBytes(path) + jsonBytes(payload);
                if (encoded > SNAPSHOT_LIMIT) throw new IOException("Offline project size limit exceeded (160 MiB serialized). Export a ZIP instead.");
                JSONObject clean = new JSONObject().put("path", path).put(payloadKey, payload);
                (category == 0 ? cleanFiles : cleanAssets).put(clean);
            }
        }
        return new JSONObject().put("id", field(source, "id", "project", 200)).put("files", cleanFiles)
                .put("assets", cleanAssets).put("offline", true);
    }

    private static long jsonBytes(String text) {
        long size = 2;
        for (int i = 0; i < text.length(); i++) {
            char value = text.charAt(i);
            if (value < 32) size += 6;
            else if (value == '"' || value == '\\') size += 2;
            else if (value < 128) size++;
            else if (value < 2048) size += 2;
            else if (Character.isHighSurrogate(value) && i + 1 < text.length() && Character.isLowSurrogate(text.charAt(i + 1))) { size += 4; i++; }
            else size += 3;
        }
        return size;
    }

    private JSONArray readIndex() throws Exception {
        if (!index.getBaseFile().exists() && !new File(index.getBaseFile().getPath() + ".bak").exists()) return new JSONArray();
        try { return new JSONObject(readEncrypted(index, INDEX_LIMIT)).getJSONArray("items"); }
        catch (Exception error) { throw new IOException("Cannot unlock the saved project library. Its files have been preserved.", error); }
    }
    private void writeIndex(JSONArray items) throws Exception { writeEncrypted(index, new JSONObject().put("items", items).toString(), INDEX_LIMIT); }
    private static int find(JSONArray items, String id) throws Exception {
        for (int i = 0; i < items.length(); i++) if (id.equals(items.getJSONObject(i).optString("id"))) return i;
        return -1;
    }
    private static JSONObject publicItem(JSONObject item) throws Exception {
        JSONObject result = new JSONObject();
        for (String key : new String[]{"id", "name", "repository", "host", "provider", "ref", "starred", "updated", "lastOpened"}) result.put(key, item.opt(key));
        result.put("storage", !item.optString("downloadedId").isEmpty() ? "Private app storage / downloaded projects" : !item.optString("snapshot").isEmpty() ? "Private app storage / encrypted snapshots" : item.optString("provider").equals("local") ? "Original file not saved in app" : item.optString("provider").equals("local") ? "Original file not saved in app" : "Online repository");
        return result.put("offline", !item.optString("snapshot").isEmpty()).put("offlineRef", item.optString("snapshotRef", item.optString("ref")));
    }
    private static JSONObject listing(JSONArray items) throws Exception {
        JSONArray result = new JSONArray();
        for (int i = 0; i < items.length(); i++) result.put(publicItem(items.getJSONObject(i)));
        return new JSONObject().put("items", result);
    }
    private File snapshotFile(String name) throws IOException {
        if (!name.matches("[a-f0-9]{64}-[a-f0-9]{32}\\.enc")) throw new IOException("Invalid offline snapshot ID");
        return new File(directory, name);
    }
    private void deleteSnapshot(String name) throws IOException { new AtomicFile(snapshotFile(name)).delete(); }
    private long storedBytes() throws IOException {
        File[] files = directory.listFiles();
        if (files == null) throw new IOException("Cannot inspect offline storage");
        long total = 0;
        for (File file : files) if (file.isFile()) total += file.length();
        return total;
    }
    private void pruneUnreferenced(JSONArray items) throws Exception {
        java.util.Set<String> referenced = new java.util.HashSet<>();
        for (int i = 0; i < items.length(); i++) {
            String file = items.getJSONObject(i).optString("snapshot");
            if (!file.isEmpty()) { snapshotFile(file); referenced.add(file); }
        }
        File[] files = directory.listFiles();
        if (files == null) throw new IOException("Cannot inspect offline storage");
        // Recover abandoned pre-index snapshots after a crash. Never delete anything if the
        // encrypted index could not be authenticated, and leave all referenced copies intact.
        for (File file : files) {
            String name = file.getName();
            if (name.matches("[a-f0-9]{64}-[a-f0-9]{32}\\.enc(?:\\.new|\\.bak)?")) {
                String base = name.replaceFirst("\\.(new|bak)$", "");
                if (!referenced.contains(base)) new AtomicFile(snapshotFile(base)).delete();
            }
        }
    }
    private static String field(JSONObject object, String key, String fallback, int maximum) throws IOException {
        Object raw = object.opt(key);
        if (raw == null || raw == JSONObject.NULL) return fallback;
        if (!(raw instanceof String)) throw new IOException("Invalid " + key);
        String value = (String) raw;
        if (value.length() > maximum || value.matches("(?s).*[\\x00-\\x1f\\x7f].*")) throw new IOException("Invalid " + key);
        return value;
    }
    private static String hash(String text) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(64);
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private void writeEncrypted(AtomicFile destination, String text, long limit) throws Exception {
        FileOutputStream file = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(destination.getBaseFile().getName().getBytes(StandardCharsets.UTF_8));
            file = destination.startWrite();
            file.write(new byte[]{'K', 'P', 'L', 1}); file.write(cipher.getIV());
            // Closing compression/encryption must finalize authentication without closing AtomicFile's stream before sync.
            OutputStream keepOpen = new FilterOutputStream(file) { @Override public void close() throws IOException { flush(); } };
            try (OutputStream encrypted = new CipherOutputStream(keepOpen, cipher);
                 GZIPOutputStream gzip = new GZIPOutputStream(encrypted);
                 OutputStream bounded = new FilterOutputStream(gzip) {
                     long count;
                     @Override public void write(byte[] bytes, int offset, int length) throws IOException {
                         if ((count += length) > limit) throw new IOException("Offline project size limit exceeded");
                         out.write(bytes, offset, length);
                     }
                     @Override public void write(int value) throws IOException { if (++count > limit) throw new IOException("Offline project size limit exceeded"); out.write(value); }
                 };
                 Writer writer = new OutputStreamWriter(bounded, StandardCharsets.UTF_8)) { writer.write(text); }
            destination.finishWrite(file); file = null;
        } catch (Exception error) { if (file != null) destination.failWrite(file); throw error; }
    }
    private String readEncrypted(File file, long limit) throws Exception { return readEncrypted(new AtomicFile(file), limit); }
    private String readEncrypted(AtomicFile source, long limit) throws Exception {
        try (InputStream input = source.openRead()) {
            if (source.getBaseFile().length() > limit + 1024 * 1024) throw new IOException("Offline copy exceeds size limit");
            byte[] header = new byte[16]; int offset = 0;
            while (offset < header.length) { int count = input.read(header, offset, header.length - offset); if (count < 0) throw new IOException("Truncated offline copy"); offset += count; }
            if (header[0] != 'K' || header[1] != 'P' || header[2] != 'L' || header[3] != 1) throw new IOException("Unsupported offline copy");
            byte[] iv = java.util.Arrays.copyOfRange(header, 4, 16);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            cipher.updateAAD(source.getBaseFile().getName().getBytes(StandardCharsets.UTF_8));
            try (CipherInputStream decrypted = new CipherInputStream(input, cipher);
                 GZIPInputStream gzip = new GZIPInputStream(decrypted);
                 ByteArrayOutputStream result = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[65536]; long total = 0; int count;
                while ((count = gzip.read(buffer)) >= 0) { if ((total += count) > limit) throw new IOException("Offline copy exceeds size limit"); result.write(buffer, 0, count); }
                // Consume encrypted input to force tag validation even if the compressor ended early.
                while (decrypted.read(buffer) != -1) { /* authentication completes at EOF */ }
                return result.toString(StandardCharsets.UTF_8.name());
            }
        }
    }
}
