package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;

/** Native-only GitHub transport. Never returns credentials, response errors, or remote URLs to JS. */
final class GitHubClient {
    static class Failure extends IOException { Failure(String message) { super(message); } }
    private static final class Missing extends Failure { Missing() { super("Repository or revision unavailable; check its name and private repository access"); } }
    private static final String CLIENT = "Ov23li8RsSVZk2dHptN1";
    private static final int FILE_LIMIT = 32 * 1024 * 1024;
    private static final int TOTAL_LIMIT = 96 * 1024 * 1024;
    private final GitHubVault vault;
    private final GitHubVault deviceVault;
    private String userCode = "";
    private long deviceWallExpiry;
    private final SharedPreferences reviewReceipts;
    private int generation;
    private String token;
    private String login = "";
    private long coreRemaining = -1;
    private boolean quotaAuthenticated;
    private boolean authExpired;
    private String deviceCode;
    private long deviceExpiry;
    private long nextPoll;
    private int interval;

    GitHubClient(Context context) { this(context,"github"); }
    GitHubClient(Context context, String namespace) { vault = new GitHubVault(context,namespace); deviceVault = new GitHubVault(context, namespace+"_device"); token = vault.read();
        try { String saved = deviceVault.read(); if (saved != null && token == null) {
            JSONObject pending = new JSONObject(saved); long remaining = pending.getLong("expiresAt") - System.currentTimeMillis();
            if (remaining > 0 && remaining <= 1800000) { deviceCode = pending.getString("deviceCode"); userCode = pending.getString("userCode"); interval = Math.max(5, Math.min(60,pending.optInt("interval",5))); deviceWallExpiry = pending.getLong("expiresAt"); deviceExpiry = SystemClock.elapsedRealtime()+remaining; nextPoll = SystemClock.elapsedRealtime()+interval*1000L; }
            else deviceVault.clear();
        } else if (token != null) deviceVault.clear(); } catch(Exception ignored) { deviceVault.clear(); }
        reviewReceipts = context.getSharedPreferences("github_review_receipts", Context.MODE_PRIVATE); }
    synchronized int generation() { return generation; }
    synchronized boolean current(int epoch) { return epoch == generation; }
    synchronized boolean authExpired() { return authExpired; }
    synchronized void reset() {
        generation++; coreRemaining = -1; token = null; login = ""; authExpired = false; clearDevice(); vault.clear();
    }
    synchronized void invalidateRequests() { generation++; }
    synchronized String displayedCode() { return pendingDevice() ? userCode : ""; }
    synchronized void cancelDevice() { generation++; clearDevice(); }
    synchronized void cancelRequests() { generation++; clearDevice(); }
    private synchronized void clearDevice() { deviceCode = null; userCode = ""; deviceVault.clear(); }
    synchronized boolean deviceExpired() { return deviceCode != null && SystemClock.elapsedRealtime() >= deviceExpiry; }
    synchronized boolean pendingDevice() { if(deviceCode != null && SystemClock.elapsedRealtime() >= deviceExpiry) clearDevice(); return deviceCode != null; }
    private synchronized JSONObject deviceStatus() throws Exception { return new JSONObject().put("pending",pendingDevice()).put("userCode",userCode).put("interval",interval); }
    private synchronized void saveDevice() throws Exception { deviceVault.write(new JSONObject().put("deviceCode",deviceCode).put("userCode",userCode).put("expiresAt",deviceWallExpiry).put("interval",interval).toString()); }
    private void check(int epoch) throws IOException {
        if (!current(epoch) || Thread.currentThread().isInterrupted()) throw new Failure("GitHub request cancelled");
    }
    private synchronized String credential(int epoch) throws IOException { check(epoch); return token; }

    JSONObject handle(JSONObject request, int epoch) throws Exception {
        check(epoch);
        switch (request.getString("action")) {
            case "auth-status":
                if (credential(epoch) != null) {
                    try { JSONObject user = api("/user", epoch, 1024 * 1024);
                        synchronized (this) { check(epoch); login = user.getString("login"); }
                    } catch (IOException error) { if(authExpired() || !current(epoch)) throw error; }
                }
                synchronized (this) { check(epoch); return deviceStatus().put("connected", token != null).put("login", login); }
            case "device-start": return start(request.optString("scope", "public"), epoch);
            case "device-poll": return poll(epoch);
            case "device-cancel": case "sign-out": return new JSONObject().put("connected", credential(epoch) != null);
            case "repositories": return repositories(request, epoch);
            case "import": case "revision-import": return importProject(request, epoch);
            case "revision-resolve": return revisionResolve(request, epoch);
            case "revision-branches": return revisionBranches(request, epoch);
            case "revision-commits": return revisionCommits(request, epoch);
            case "review-list": return reviewList(request, epoch);
            case "review-categories": return categories(repository(request), epoch);
            case "review-thread": return reviewThread(request, epoch);
            case "review-publish": return publish(request, epoch);
            case "review-upload": return upload(request, epoch);
            case "review-read": return reviewRead(request, epoch);
            case "review-contributors": return contributors(request, epoch);
            case "review-policy": return policyStatus(repository(request), epoch);
            default: throw new Failure("Unsupported GitHub request");
        }
    }
    JSONObject connectToken(String candidate, int epoch) throws Exception {
        if (candidate == null || !candidate.matches("[A-Za-z0-9_]{20,255}")) throw new Failure("Invalid GitHub token format");
        JSONObject user = new JSONObject(network("https://api.github.com/user", null, candidate, epoch, 1024 * 1024));
        synchronized (this) {
            check(epoch); vault.write(candidate); coreRemaining = -1; token = candidate; authExpired = false; login = user.getString("login");
            return new JSONObject().put("connected", true).put("login", login);
        }
    }
    private JSONObject start(String scope, int epoch) throws Exception {
        if (!scope.equals("public") && !scope.equals("private")) throw new Failure("Invalid repository access scope");
        JSONObject result = oauth("/login/device/code", "client_id=" + CLIENT + "&scope=" + (scope.equals("private") ? "repo" : "public_repo"), epoch);
        if (result.has("error")) throw new Failure("GitHub device sign-in is unavailable; use a personal access token");
        synchronized (this) {
            check(epoch); deviceCode = result.getString("device_code");
            int expires = Math.max(1, Math.min(1800, result.getInt("expires_in")));
            interval = Math.max(5, Math.min(60, result.optInt("interval", 5)));
            deviceExpiry = SystemClock.elapsedRealtime() + expires * 1000L;
            deviceWallExpiry = System.currentTimeMillis() + expires * 1000L; userCode = result.getString("user_code");
            nextPoll = SystemClock.elapsedRealtime() + interval * 1000L; saveDevice();
            return new JSONObject().put("userCode", result.getString("user_code"))
                    .put("verificationUri", "https://github.com/login/device").put("expiresIn", expires).put("interval", interval);
        }
    }
    private JSONObject poll(int epoch) throws Exception {
        String code;
        synchronized (this) {
            check(epoch);
            if (deviceCode == null || SystemClock.elapsedRealtime() >= deviceExpiry) { clearDevice(); throw new Failure("Device sign-in expired; start again"); }
            if (SystemClock.elapsedRealtime() < nextPoll) return new JSONObject().put("pending", true).put("interval", interval);
            code = deviceCode; nextPoll = SystemClock.elapsedRealtime() + interval * 1000L;
        }
        JSONObject result = oauth("/login/oauth/access_token", "client_id=" + CLIENT + "&device_code=" + encode(code)
                + "&grant_type=" + encode("urn:ietf:params:oauth:grant-type:device_code"), epoch);
        String error = result.optString("error");
        if (error.equals("authorization_pending") || error.equals("slow_down")) {
            synchronized (this) {
                check(epoch);
                if (error.equals("slow_down")) interval = Math.max(interval + 5, result.optInt("interval", interval + 5));
                nextPoll = SystemClock.elapsedRealtime() + interval * 1000L; if(error.equals("slow_down")) saveDevice();
                return new JSONObject().put("pending", true).put("slowDown", error.equals("slow_down")).put("interval", interval);
            }
        }
        if (!error.isEmpty()) {
            synchronized (this) { check(epoch); clearDevice(); }
            throw new Failure(error.equals("access_denied") ? "GitHub sign-in was denied" : "GitHub device sign-in failed; start again");
        }
        String accepted = result.getString("access_token");
        if (!accepted.matches("[A-Za-z0-9_]{20,255}")) throw new Failure("GitHub returned an invalid credential");
        synchronized(this) { check(epoch); vault.write(accepted); token = accepted; authExpired = false; coreRemaining = -1; clearDevice(); }
        // The token endpoint already authorized this credential. Profile lookup belongs to auth-status,
        // so a second API request cannot delay or falsely undo successful authorization.
        JSONObject connected; synchronized(this){check(epoch);connected=new JSONObject().put("connected",true).put("login",login);}
        synchronized (this) { check(epoch); clearDevice(); }
        return connected.put("pending", false);
    }
    private JSONObject repositories(JSONObject request, int epoch) throws Exception {
        int page = request.optInt("page", 1);
        if (page < 1 || page > 1000 || (request.has("page") && (!(request.get("page") instanceof Number)
                || request.getDouble("page") != page))) throw new Failure("Invalid repository page");
        if (credential(epoch) == null) throw new Failure("Sign in to list your repositories, or enter a public owner/repository");
        JSONArray source = new JSONArray(network("https://api.github.com/user/repos?per_page=100&sort=updated&page=" + page, null, credential(epoch), epoch, 8 * 1024 * 1024));
        JSONArray repositories = new JSONArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.getJSONObject(i);
            repositories.put(new JSONObject().put("fullName", item.getString("full_name"))
                    .put("private", item.getBoolean("private")).put("defaultBranch", item.getString("default_branch")));
        }
        return new JSONObject().put("repositories", repositories).put("hasMore", source.length() == 100);
    }
    private JSONObject importProject(JSONObject request, int epoch) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 8 * 60 * 1000;
        String repository = request.getString("repository");
        if (repository.length() > 240 || !repository.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")
                || repository.endsWith("/.") || repository.endsWith("/..")) throw new Failure("Enter a valid owner/repository");
        String root = "/repos/" + repository;
        JSONObject metadata = api(root, epoch, 1024 * 1024);
        String ref = request.optString("ref", "");
        if (ref.isEmpty()) ref = metadata.getString("default_branch");
        if (ref.length() > 255 || ref.isEmpty() || hasControl(ref)) throw new Failure("Invalid branch or commit");
        JSONObject commit = api(root + "/commits/" + encode(ref), epoch, 4 * 1024 * 1024);
        String sha = validSha(commit.getString("sha"));
        String treeSha = validSha(commit.getJSONObject("commit").getJSONObject("tree").getString("sha"));
        JSONObject tree = api(root + "/git/trees/" + treeSha + "?recursive=1", epoch, 16 * 1024 * 1024);
        if (tree.optBoolean("truncated", true)) throw new Failure("Repository tree is too large; incomplete imports are refused");
        JSONArray nodes = tree.getJSONArray("tree");
        int requiredFiles = 0;
        for (int i = 0; i < nodes.length(); i++) { JSONObject node = nodes.getJSONObject(i);
            if (node.optString("type").equals("blob") && importable(node.optString("path"))) requiredFiles++;
        }
        synchronized (this) {
            check(epoch); boolean authenticated = token != null;
            String budget = GitHubFailure.importBudget(requiredFiles, quotaAuthenticated == authenticated ? coreRemaining : -1, authenticated);
            if (budget != null) throw new Failure(budget);
        }

        if (nodes.length() > 100000) throw new Failure("Repository has too many entries");
        JSONArray files = new JSONArray(), assets = new JSONArray();
        Set<String> paths = new HashSet<>();
        int total = 0, count = 0;
        for (int i = 0; i < nodes.length(); i++) {
            check(epoch);
            if (SystemClock.elapsedRealtime() > deadline) throw new Failure("Repository download timed out; use a smaller repository or local import");
            JSONObject node = nodes.getJSONObject(i);
            if (!node.optString("type").equals("blob")) continue;
            String path = node.getString("path"), lower = path.toLowerCase(Locale.ROOT);
            boolean binary = lower.matches(".*\\.(step|stp|wrl)$");
            boolean text = lower.matches(".*\\.(kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|json|gbr|ger|drl|csv)$")
                    || lower.equals("sym-lib-table") || lower.equals("fp-lib-table") || lower.endsWith("/sym-lib-table") || lower.endsWith("/fp-lib-table");
            if (!binary && !text) continue;
            safePath(path);
            if (!node.optString("mode").equals("100644") && !node.optString("mode").equals("100755")) throw new Failure("Symbolic links cannot be imported");
            if (!paths.add(lower)) throw new Failure("Duplicate repository file path");
            if (++count > 2000) throw new Failure("Too many KiCad files (limit 2000)");
            long size = node.getLong("size");
            if (size < 0 || size > FILE_LIMIT || size > TOTAL_LIMIT - total) throw new Failure("Repository exceeds 32 MiB per file or 96 MiB total");
            JSONObject blob = api(root + "/git/blobs/" + validSha(node.getString("sha")), epoch, (int)Math.min(48L * 1024 * 1024, size * 2 + 16384));
            if (!blob.getString("encoding").equals("base64")) throw new Failure("Unsupported GitHub blob encoding");
            byte[] bytes = Base64.decode(blob.getString("content"), Base64.DEFAULT);
            if (bytes.length != size) throw new Failure("Repository file size mismatch");
            if (bytes.length >= 42 && new String(bytes, 0, 42, StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/"))
                throw new Failure("Git LFS files must be downloaded locally before import");
            total += bytes.length;
            JSONObject item = new JSONObject().put("path", path);
            if (binary) assets.put(item.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)));
            else {
                String content = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                if (content.startsWith("version https://git-lfs.github.com/spec/")) throw new Failure("Git LFS files must be downloaded locally before import");
                files.put(item.put("content", content));
            }
        }
        check(epoch);
        if (files.length() == 0) throw new Failure("No supported KiCad files found in repository");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((repository.toLowerCase(Locale.ROOT) + "@" + sha).getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte b : digest) id.append(String.format(Locale.ROOT, "%02x", b & 255));
        return new JSONObject().put("repository", metadata.getString("full_name")).put("sha", sha).put("private", metadata.getBoolean("private"))
                .put("project", new JSONObject().put("id", id.toString()).put("files", files).put("assets", assets));
    }
    private static boolean importable(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.matches(".*\\.(step|stp|wrl|kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|json|gbr|ger|drl|csv)$")
                || lower.equals("sym-lib-table") || lower.equals("fp-lib-table") || lower.endsWith("/sym-lib-table") || lower.endsWith("/fp-lib-table");
    }
    private static String revisionFile(JSONObject request) throws Exception {
        String file = request.getString("file"); safePath(file);
        if (!file.toLowerCase(Locale.ROOT).matches(".*\\.(kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|sch|brd)$"))
            throw new Failure("Select a supported KiCad drawing or project file");
        return file;
    }
    private String revisionRef(JSONObject request, String repo, int epoch) throws Exception {
        String ref = request.optString("ref", "");
        if (ref.isEmpty()) ref = api("/repos/" + repo, epoch, 1024 * 1024).getString("default_branch");
        if (ref.isEmpty() || ref.length() > 255 || hasControl(ref)) throw new Failure("Invalid branch or commit");
        return ref;
    }
    private JSONObject revisionResolve(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), ref = revisionRef(request, repo, epoch);
        revisionFile(request);
        String sha = validSha(api("/repos/" + repo + "/commits/" + encode(ref), epoch, 4 * 1024 * 1024).getString("sha"));
        return new JSONObject().put("repository", repo).put("ref", ref).put("sha", sha);
    }
    private JSONObject revisionBranches(JSONObject request, int epoch) throws Exception {
        String repo = repository(request);
        JSONArray source = new JSONArray(network("https://api.github.com/repos/" + repo + "/branches?per_page=100", null, credential(epoch), epoch, 4 * 1024 * 1024));
        if (source.length() > 100) throw new Failure("Invalid GitHub branches response");
        JSONArray branches = new JSONArray(), warnings = new JSONArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.getJSONObject(i); String name = item.getString("name");
            if (name.isEmpty() || name.length() > 255 || hasControl(name)) throw new Failure("Invalid GitHub branch name");
            branches.put(new JSONObject().put("name", name).put("sha", validSha(item.getJSONObject("commit").getString("sha"))));
        }
        if (branches.length() == 100) warnings.put("Branch suggestions were limited to the first 100 branches. Enter another branch or commit directly.");
        return new JSONObject().put("repository", repo).put("branches", branches).put("warnings", warnings);
    }
    private JSONObject revisionCommits(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), file = revisionFile(request), ref = revisionRef(request, repo, epoch);
        String sha = validSha(api("/repos/" + repo + "/commits/" + encode(ref), epoch, 4 * 1024 * 1024).getString("sha"));
        JSONArray source = new JSONArray(network("https://api.github.com/repos/" + repo + "/commits?per_page=50&sha=" + sha + "&path=" + encode(file), null, credential(epoch), epoch, 4 * 1024 * 1024));
        if (source.length() > 50) throw new Failure("Invalid GitHub file history response");
        JSONArray commits = new JSONArray(), warnings = new JSONArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.getJSONObject(i), commit = item.getJSONObject("commit"), author = commit.getJSONObject("author");
            String message = commit.getString("message"), name = author.optString("name"), date = author.getString("date");
            if (message.length() > 4096) { message = message.substring(0, 4096); if (warnings.length() == 0) warnings.put("Long commit messages were shortened."); }
            if (name.length() > 256) name = name.substring(0, 256);
            if (date.length() > 64 || hasControl(date)) throw new Failure("Invalid GitHub commit timestamp");
            commits.put(new JSONObject().put("sha", validSha(item.getString("sha"))).put("message", message).put("author", name).put("date", date));
        }
        if (commits.length() == 50) warnings.put("File history was limited to the latest 50 commits at this snapshot.");
        return new JSONObject().put("repository", repo).put("file", file).put("snapshotRef", sha).put("commits", commits).put("warnings", warnings);
    }
    private static String repository(JSONObject request) throws Exception {
        String value = request.getString("repository");
        if (!value.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")
                || value.endsWith("/.") || value.endsWith("/..")) throw new Failure("Invalid GitHub repository");
        return value;
    }
    private static int positive(JSONObject request, String key, int fallback, int maximum) throws Exception {
        if (!request.has(key)) return fallback;
        Object value = request.get(key);
        if (!(value instanceof Number) || request.getDouble(key) != request.getInt(key)
                || request.getInt(key) < 1 || request.getInt(key) > maximum) throw new Failure("Invalid " + key);
        return request.getInt(key);
    }
    private static String nodeId(String value) throws IOException {
        if (!value.matches("[A-Za-z0-9_=-]{1,200}")) throw new Failure("Invalid GitHub identifier");
        return value;
    }
    private String authenticated(int epoch) throws IOException {
        String value = credential(epoch);
        if (value == null) throw new Failure("Sign in to GitHub to publish or read Discussions");
        return value;
    }
    private JSONObject graphql(String query, JSONObject variables, int epoch) throws Exception {
        authenticated(epoch);
        JSONObject value = new JSONObject(networkJson("/graphql", new JSONObject().put("query", query).put("variables", variables), epoch));
        if (value.optJSONArray("errors") != null && value.getJSONArray("errors").length() > 0)
            throw new Failure("GitHub could not complete the Discussion request; check permissions and destination");
        return value.getJSONObject("data");
    }
    private JSONObject categories(String repo, int epoch) throws Exception {
        String[] names = repo.split("/");
        JSONObject data = graphql("query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:25){nodes{id name slug description}}}}",
                new JSONObject().put("owner", names[0]).put("name", names[1]), epoch);
        JSONObject source = data.getJSONObject("repository");
        JSONArray result = new JSONArray(), nodes = source.getJSONObject("discussionCategories").getJSONArray("nodes");
        for (int i = 0; i < nodes.length(); i++) {
            JSONObject node = nodes.getJSONObject(i);
            result.put(new JSONObject().put("id", nodeId(node.getString("id"))).put("name", node.getString("name"))
                    .put("slug", node.optString("slug")).put("description", node.optString("description")));
        }
        return new JSONObject().put("repositoryId", nodeId(source.getString("id"))).put("categories", result);
    }
    private static String kind(JSONObject request) throws Exception {
        String value = request.getString("kind");
        if (!value.equals("issue") && !value.equals("discussion")) throw new Failure("Invalid review thread type");
        return value;
    }
    private static String threadUrl(String repo, String kind, int number) {
        return "https://github.com/" + repo + "/" + (kind.equals("issue") ? "issues" : "discussions") + "/" + number;
    }
    private JSONObject reviewList(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), kind = kind(request);
        JSONArray threads = new JSONArray();
        boolean more; String cursor = "";
        if (kind.equals("issue")) {
            int page = positive(request, "page", 1, 10);
            JSONArray source = new JSONArray(network("https://api.github.com/repos/" + repo + "/issues?state=all&per_page=100&page=" + page,
                    null, credential(epoch), epoch, 4 * 1024 * 1024));
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.getJSONObject(i);
                if (item.has("pull_request")) continue;
                int number = positive(item, "number", 0, Integer.MAX_VALUE);
                threads.put(new JSONObject().put("number", number).put("title", item.getString("title"))
                        .put("state", item.getString("state")).put("url", threadUrl(repo, kind, number)));
            }
            more = source.length() == 100 && page < 10;
        } else {
            cursor = request.optString("cursor", "");
            if (cursor.length() > 1024 || hasControl(cursor)) throw new Failure("Invalid Discussion cursor");
            String[] names = repo.split("/");
            JSONObject source = graphql("query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){discussions(first:50,after:$cursor,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title closed} pageInfo{hasNextPage endCursor}}}}",
                    new JSONObject().put("owner", names[0]).put("name", names[1]).put("cursor", cursor.isEmpty() ? JSONObject.NULL : cursor), epoch)
                    .getJSONObject("repository").getJSONObject("discussions");
            JSONArray nodes = source.getJSONArray("nodes");
            for (int i = 0; i < nodes.length(); i++) {
                JSONObject item = nodes.getJSONObject(i); int number = positive(item, "number", 0, Integer.MAX_VALUE);
                threads.put(new JSONObject().put("number", number).put("title", item.getString("title"))
                        .put("state", item.getBoolean("closed") ? "closed" : "open").put("url", threadUrl(repo, kind, number)));
            }
            more = source.getJSONObject("pageInfo").getBoolean("hasNextPage");
            cursor = more ? source.getJSONObject("pageInfo").getString("endCursor") : "";
            if (more && (cursor.isEmpty() || cursor.length() > 1024 || hasControl(cursor))) throw new Failure("Invalid Discussion pagination");
        }
        return new JSONObject().put("threads", threads).put("hasMore", more).put("cursor", cursor);
    }
    // Narrow readback endpoints let the shared source-bound annotation parser run unchanged.
    private JSONObject reviewRead(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), resource = request.getString("resource");
        int page = positive(request, "page", 1, 10), number = positive(request, "number", 0, Integer.MAX_VALUE);
        String path;
        switch (resource) {
            case "issues": path = "/issues?state=all&per_page=100&page=" + page; break;
            case "issue": if (number == 0) throw new Failure("Issue number required"); path = "/issues/" + number; break;
            case "comments": if (number == 0) throw new Failure("Issue number required"); path = "/issues/" + number + "/comments?per_page=100&page=" + page; break;
            case "policy": path = "/contents/.kicad-review-policy.json"; break;
            case "metadata": path = ""; break;
            case "collaborators": path = "/collaborators?per_page=100&page=" + page; break;
            case "contributors": path = "/contributors?per_page=100&page=" + page; break;
            default: throw new Failure("Unsupported GitHub review resource");
        }
        String raw = network("https://api.github.com/repos/" + repo + path, null, credential(epoch), epoch, 4 * 1024 * 1024);
        return new JSONObject().put("value", raw.startsWith("[") ? new JSONArray(raw) : new JSONObject(raw));
    }
    private JSONObject record(JSONObject item, boolean discussion, String url, String id, String parent, int[] budget) throws Exception {
        String body = item.isNull("body") ? "" : item.optString("body", "");
        int limit = Math.min(65536, Math.max(0, 1024 * 1024 - budget[0]));
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        if (encoded.length > limit) {
            budget[1] = 1;
            int end = limit;
            while (end > 0 && (encoded[end] & 0xc0) == 0x80) end--;
            body = new String(encoded, 0, end, StandardCharsets.UTF_8);
        }
        budget[0] += body.getBytes(StandardCharsets.UTF_8).length;
        JSONObject author = item.optJSONObject(discussion ? "author" : "user");
        String who = author == null ? "" : author.optString("login");
        if (!who.isEmpty() && !who.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")) throw new Failure("Invalid GitHub thread author");
        String created = item.getString(discussion ? "createdAt" : "created_at"), updated = item.getString(discussion ? "updatedAt" : "updated_at");
        if (!created.matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,3})?Z") || !updated.matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,3})?Z")) throw new Failure("Invalid GitHub thread timestamp");
        return new JSONObject().put("id", id).put("author", who.isEmpty() ? JSONObject.NULL : who).put("createdAt", created)
                .put("updatedAt", updated).put("body", body).put("url", url).put("replyTo", parent == null ? JSONObject.NULL : parent);
    }
    private JSONObject reviewThread(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), kind = kind(request), url;
        int number = positive(request, "number", 0, Integer.MAX_VALUE);
        if (number == 0) throw new Failure("Thread number required");
        url = threadUrl(repo, kind, number);
        JSONArray comments = new JSONArray(), warnings = new JSONArray(); int[] budget = {0, 0};
        JSONObject thread = null;
        if (kind.equals("issue")) {
            JSONObject source = api("/repos/" + repo + "/issues/" + number, epoch, 4 * 1024 * 1024);
            if (source.getInt("number") != number) throw new Failure("GitHub returned a different thread");
            thread = record(source, false, url, String.valueOf(number), null, budget).put("title", source.getString("title")).put("state", source.getString("state"));
            int count = source.getInt("comments");
            for (int page = 1; page <= 4 && comments.length() < count && budget[0] < 1024 * 1024; page++) {
                JSONArray rows = new JSONArray(network("https://api.github.com/repos/" + repo + "/issues/" + number + "/comments?per_page=50&page=" + page, null, credential(epoch), epoch, 4 * 1024 * 1024));
                for (int i = 0; i < rows.length() && comments.length() < 200; i++) {
                    JSONObject row = rows.getJSONObject(i); long id = row.getLong("id"); if (id <= 0) throw new Failure("Invalid GitHub comment identifier");
                    comments.put(record(row, false, url + "#issuecomment-" + id, String.valueOf(id), null, budget));
                }
                if (rows.length() < 50) break;
            }
            if (count > comments.length()) budget[1] = 1;
        } else {
            String fields = "id databaseId body createdAt updatedAt author{login}";
            String query = "query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){discussion(number:$number){number title closed " + fields + " comments(first:50,after:$cursor){nodes{" + fields + " replies(first:10){nodes{" + fields + "} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}";
            String[] names = repo.split("/"); String cursor = ""; Set<String> seen = new HashSet<>();
            java.util.ArrayList<JSONObject> replyTasks = new java.util.ArrayList<>(); int requests = 0;
            for (int page = 0; page < 4 && comments.length() < 200 && budget[0] < 1024 * 1024; page++) {
                JSONObject source = graphql(query, new JSONObject().put("owner", names[0]).put("name", names[1]).put("number", number)
                        .put("cursor", cursor.isEmpty() ? JSONObject.NULL : cursor), epoch).getJSONObject("repository").getJSONObject("discussion");
                requests++;
                if (source.getInt("number") != number) throw new Failure("GitHub returned a different Discussion");
                if (thread == null) thread = record(source, true, url, String.valueOf(number), null, budget)
                        .put("title", source.getString("title")).put("state", source.getBoolean("closed") ? "closed" : "open");
                JSONArray rows = source.getJSONObject("comments").getJSONArray("nodes");
                for (int i = 0; i < rows.length() && comments.length() < 200; i++) {
                    JSONObject row = rows.getJSONObject(i); long id = row.getLong("databaseId"); if (id <= 0) throw new Failure("Invalid Discussion comment identifier");
                    if (!seen.add(String.valueOf(id))) continue;
                    comments.put(record(row, true, url + "#discussioncomment-" + id, String.valueOf(id), null, budget));
                    JSONArray replies = row.getJSONObject("replies").getJSONArray("nodes");
                    for (int j = 0; j < replies.length() && comments.length() < 200; j++) {
                        JSONObject reply = replies.getJSONObject(j); long rid = reply.getLong("databaseId"); if (rid <= 0) throw new Failure("Invalid Discussion reply identifier");
                        if (seen.add(String.valueOf(rid))) comments.put(record(reply, true, url + "#discussioncomment-" + rid, String.valueOf(rid), String.valueOf(id), budget));
                    }
                    JSONObject replyInfo = row.getJSONObject("replies").getJSONObject("pageInfo");
                    if (replyInfo.getBoolean("hasNextPage")) {
                        String replyCursor = replyInfo.getString("endCursor");
                        if (replyCursor.isEmpty() || replyCursor.length() > 1024 || hasControl(replyCursor)) throw new Failure("Invalid Discussion reply pagination");
                        replyTasks.add(new JSONObject().put("id", nodeId(row.getString("id"))).put("parent", String.valueOf(id)).put("cursor", replyCursor));
                    }
                }
                JSONObject info = source.getJSONObject("comments").getJSONObject("pageInfo");
                if (!info.getBoolean("hasNextPage")) { cursor = ""; break; }
                String next = info.getString("endCursor");
                if (next.isEmpty() || next.length() > 1024 || hasControl(next) || next.equals(cursor)) throw new Failure("Invalid Discussion pagination");
                cursor = next;
            }
            if (!cursor.isEmpty()) budget[1] = 1;
            String replyQuery = "query($id:ID!,$cursor:String){node(id:$id){... on DiscussionComment{replies(first:50,after:$cursor){nodes{" + fields + "} pageInfo{hasNextPage endCursor}}}}}";
            for (JSONObject task : replyTasks) {
                Set<String> cursors = new HashSet<>(); String next = task.getString("cursor");
                do {
                    if (requests >= 10 || comments.length() >= 200 || budget[0] >= 1024 * 1024) { budget[1] = 1; break; }
                    if (!cursors.add(next)) throw new Failure("Repeated Discussion reply pagination");
                    JSONObject page = graphql(replyQuery, new JSONObject().put("id", task.getString("id")).put("cursor", next), epoch).getJSONObject("node").getJSONObject("replies"); requests++;
                    JSONArray rows = page.getJSONArray("nodes");
                    for (int i = 0; i < rows.length() && comments.length() < 200; i++) {
                        JSONObject row = rows.getJSONObject(i); long id = row.getLong("databaseId"); if (id <= 0) throw new Failure("Invalid Discussion reply identifier");
                        if (seen.add(String.valueOf(id))) comments.put(record(row, true, url + "#discussioncomment-" + id, String.valueOf(id), task.getString("parent"), budget));
                    }
                    JSONObject info = page.getJSONObject("pageInfo");
                    next = info.getBoolean("hasNextPage") ? info.getString("endCursor") : "";
                    if (next.length() > 1024 || hasControl(next) || info.getBoolean("hasNextPage") && next.isEmpty()) throw new Failure("Invalid Discussion reply pagination");
                } while (!next.isEmpty());
            }
        }
        if (budget[1] != 0) warnings.put("Thread readback was bounded at 200 comments, 10 requests or the text limit. Open GitHub for the complete conversation.");
        check(epoch);
        return thread.put("kind", kind).put("number", number).put("comments", comments).put("warnings", warnings);
    }
    private JSONObject publish(JSONObject request, int epoch) throws Exception {
        authenticated(epoch);
        String repo = repository(request), destination = request.getString("destination"), body = request.getString("body");
        if (!policyStatus(repo, epoch).getBoolean("allowed")) throw new Failure("Repository comment policy does not allow this account to publish");
        if (!destination.matches("new-issue|issue|new-discussion|discussion")) throw new Failure("Invalid publication destination");
        if (body.isEmpty() || body.getBytes(StandardCharsets.UTF_8).length > 65536 || body.indexOf(0) >= 0) throw new Failure("Comment is empty or exceeds 64 KiB");
        String title = request.optString("title", "");
        if (destination.startsWith("new-") && (title.trim().isEmpty() || title.length() > 200 || hasControl(title))) throw new Failure("Enter a title of at most 200 characters");
        int number = positive(request, "number", 0, Integer.MAX_VALUE);
        if (!destination.startsWith("new-") && number == 0) throw new Failure("Choose an existing thread");
        if (destination.startsWith("new-") && request.has("number")) throw new Failure("A new thread cannot specify an existing number");
        String operation = request.getString("operationId");
        if (!operation.matches("[A-Za-z0-9_.:-]{1,200}")) throw new Failure("Invalid publication operation identifier");
        String key = hash(repo.toLowerCase(Locale.ROOT) + "|" + destination + "|" + number + "|" + operation);
        String saved = reviewReceipts.getString(key, null);
        if (saved != null) {
            JSONObject receipt = new JSONObject(saved);
            if (receipt.has("remoteRef")) return receipt.put("duplicate", true);
            throw new Failure("An earlier publication was not confirmed. Inspect GitHub before retrying; automatic retries are blocked");
        }
        String discussionId = "", repositoryId = "";
        if (destination.equals("new-discussion")) {
            JSONObject bundle = categories(repo, epoch); repositoryId = bundle.getString("repositoryId");
            String category = nodeId(request.getString("categoryId")); boolean found = false;
            JSONArray nodes = bundle.getJSONArray("categories");
            for (int i = 0; i < nodes.length(); i++) if (nodes.getJSONObject(i).getString("id").equals(category)) found = true;
            if (!found) throw new Failure("Discussion category does not belong to this repository");
        } else if (destination.equals("discussion")) {
            String[] names = repo.split("/");
            JSONObject discussion = graphql("query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){discussion(number:$number){id number}}}",
                    new JSONObject().put("owner", names[0]).put("name", names[1]).put("number", number), epoch).getJSONObject("repository").getJSONObject("discussion");
            if (discussion.getInt("number") != number) throw new Failure("Discussion not found");
            discussionId = nodeId(discussion.getString("id"));
        }
        synchronized (this) {
            check(epoch);
            if (!reviewReceipts.edit().putString(key, new JSONObject().put("pending", true).toString()).commit()) throw new Failure("Could not protect publication against duplicate retries");
        }
        JSONObject remote; String node = "", suffix = "";
        if (destination.equals("new-issue") || destination.equals("issue")) {
            String path = "/repos/" + repo + "/issues" + (destination.equals("issue") ? "/" + number + "/comments" : "");
            JSONObject input = new JSONObject().put("body", body);
            if (destination.equals("new-issue")) input.put("title", title);
            JSONObject result = new JSONObject(networkJson(path, input, epoch));
            if (destination.equals("new-issue")) { number = positive(result, "number", 0, Integer.MAX_VALUE); if (number == 0) throw new Failure("GitHub did not confirm the new issue"); }
            else { long id = result.getLong("id"); if (id <= 0) throw new Failure("GitHub did not confirm the comment"); suffix = "#issuecomment-" + id; }
            node = nodeId(result.getString("node_id"));
        } else if (destination.equals("new-discussion")) {
            JSONObject data = graphql("mutation($input:CreateDiscussionInput!){createDiscussion(input:$input){discussion{id number}}}",
                    new JSONObject().put("input", new JSONObject().put("repositoryId", repositoryId).put("categoryId", nodeId(request.getString("categoryId"))).put("title", title).put("body", body)), epoch);
            JSONObject result = data.getJSONObject("createDiscussion").getJSONObject("discussion");
            number = positive(result, "number", 0, Integer.MAX_VALUE); if (number == 0) throw new Failure("GitHub did not confirm the new Discussion"); node = nodeId(result.getString("id"));
        } else {
            JSONObject result = graphql("mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id databaseId}}}",
                    new JSONObject().put("input", new JSONObject().put("discussionId", discussionId).put("body", body)), epoch)
                    .getJSONObject("addDiscussionComment").getJSONObject("comment");
            node = nodeId(result.getString("id")); long id = result.getLong("databaseId"); if (id > 0) suffix = "#discussioncomment-" + id;
        }
        String kind = destination.contains("discussion") ? "discussion" : "issue";
        remote = new JSONObject().put("kind", kind).put("repository", repo).put("number", number).put("nodeId", node)
                .put("url", threadUrl(repo, kind, number) + suffix).put("publishedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT) {{ setTimeZone(java.util.TimeZone.getTimeZone("UTC")); }}.format(new java.util.Date()));
        JSONObject receipt = new JSONObject().put("remoteRef", remote);
        synchronized (this) { check(epoch); if (!reviewReceipts.edit().putString(key, receipt.toString()).commit()) throw new Failure("GitHub accepted the post but its receipt could not be saved. Inspect GitHub before retrying"); }
        return receipt;
    }
    private JSONObject upload(JSONObject request, int epoch) throws Exception {
        String bearer = authenticated(epoch), repo = repository(request);
        if (!policyStatus(repo, epoch).getBoolean("allowed")) throw new Failure("Repository comment policy does not allow this account to publish");
        if (!bearer.matches("(?:gho_|ghp_|github_pat_).*")) throw new Failure("Screenshot uploads require an OAuth or personal access token");
        JSONObject capture = request.getJSONObject("capture"); String data = capture.getString("dataUrl");
        int width = positive(capture, "width", 0, 8192), height = positive(capture, "height", 0, 8192);
        if (width == 0 || height == 0 || !data.startsWith("data:image/png;base64,") || data.length() > 262166) throw new Failure("Screenshot is invalid or too large");
        byte[] bytes = Base64.decode(data.substring(22), Base64.NO_WRAP);
        byte[] signature = {(byte)137,80,78,71,13,10,26,10};
        if (bytes.length < 33 || bytes.length > 196608) throw new Failure("Screenshot exceeds 192 KiB");
        for (int i = 0; i < signature.length; i++) if (bytes[i] != signature[i]) throw new Failure("Screenshot must be PNG");
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        if (buffer.getInt(8) != 13 || buffer.getInt(12) != 0x49484452 || buffer.getInt(16) != width || buffer.getInt(20) != height) throw new Failure("Screenshot dimensions do not match PNG");
        String digest = hashBytes(bytes), key = "image-" + hash(repo.toLowerCase(Locale.ROOT) + digest);
        String saved = reviewReceipts.getString(key, null);
        if (saved != null) return new JSONObject(saved);
        JSONObject metadata = api("/repos/" + repo, epoch, 1024 * 1024);
        if (!metadata.getString("full_name").equalsIgnoreCase(repo) || metadata.optJSONObject("permissions") == null || !metadata.getJSONObject("permissions").optBoolean("push")) throw new Failure("Screenshot upload requires repository write access");
        long repositoryId = metadata.getLong("id"); if (repositoryId <= 0) throw new Failure("Invalid GitHub repository identity");
        String response;
        try { response = networkBytes("https://uploads.github.com/user-attachments/assets?name=kicad-review-" + digest.substring(0,20) + ".png&content_type=image%2Fpng&repository_id=" + repositoryId,
                bytes, "application/octet-stream", bearer, epoch, 16384); }
        finally { java.util.Arrays.fill(bytes, (byte)0); }
        String url = new JSONObject(response).getString("url");
        if (!url.matches("https://github\\.com/user-attachments/assets/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new Failure("GitHub did not return a valid screenshot URL");
        JSONObject attachment = new JSONObject().put("provider", "github").put("repository", repo).put("url", url).put("mime", "image/png").put("width", width).put("height", height);
        synchronized (this) { check(epoch); if (!reviewReceipts.edit().putString(key, attachment.toString()).commit()) throw new Failure("Could not save screenshot receipt"); }
        return attachment;
    }
    private JSONObject contributors(JSONObject request, int epoch) throws Exception {
        String repo = repository(request), query = request.optString("query", "").toLowerCase(Locale.ROOT);
        if (query.length() > 40 || !query.matches("[a-z0-9-]*")) throw new Failure("Invalid mention search");
        JSONArray users = new JSONArray(), warnings = new JSONArray(); Set<String> seen = new HashSet<>();
        for (String resource : new String[]{"collaborators", "contributors"}) {
            try {
                for (int page = 1; page <= 3 && users.length() < 100; page++) {
                    JSONArray rows = new JSONArray(network("https://api.github.com/repos/" + repo + "/" + resource + "?per_page=100&page=" + page,
                            null, credential(epoch), epoch, 2 * 1024 * 1024));
                    for (int i = 0; i < rows.length() && users.length() < 100; i++) {
                        String name = rows.getJSONObject(i).optString("login");
                        if (name.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?") && name.toLowerCase(Locale.ROOT).contains(query) && seen.add(name.toLowerCase(Locale.ROOT)))
                            users.put(new JSONObject().put("login", name).put("source", resource));
                    }
                    if (rows.length() < 100) break;
                    if (page == 3) warnings.put("Mention suggestions were limited to the first 300 " + resource);
                }
            } catch (Failure error) { check(epoch); if (authExpired()) throw error; warnings.put("Repository " + resource + " could not be listed with this account"); }
        }
        return new JSONObject().put("users", users).put("warnings", warnings);
    }
    private JSONObject policyStatus(String repo, int epoch) throws Exception {
        JSONObject metadata = api("/repos/" + repo, epoch, 1024 * 1024);
        if (!metadata.getString("full_name").equalsIgnoreCase(repo)) throw new Failure("Repository policy identity mismatch");
        boolean privateRepo = metadata.getBoolean("private"); String ref = metadata.getString("default_branch");
        if (ref.isEmpty() || ref.length() > 255 || hasControl(ref)) throw new Failure("Invalid repository default branch");
        JSONObject policy = null; String source = "default";
        try {
            JSONObject file = new JSONObject(network("https://api.github.com/repos/" + repo + "/contents/.kicad-review-policy.json?ref=" + encode(ref),
                    null, privateRepo ? credential(epoch) : null, epoch, 128 * 1024));
            if (!file.getString("encoding").equals("base64") || file.getString("content").length() > 48 * 1024) throw new Failure("Repository comment policy is too large or unsupported");
            byte[] bytes = Base64.decode(file.getString("content"), Base64.DEFAULT);
            policy = new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()); source = "repository";
        } catch (Missing absent) {
            if (privateRepo) {
                JSONArray root = new JSONArray(network("https://api.github.com/repos/" + repo + "/contents?ref=" + encode(ref), null, credential(epoch), epoch, 4 * 1024 * 1024));
                if (root.length() >= 1000) throw new Failure("Private repository policy cannot be verified; Contents read access is required");
                for (int i = 0; i < root.length(); i++) {
                    JSONObject entry = root.getJSONObject(i); String name = entry.getString("name");
                    if (!name.equals(entry.getString("path")) || name.contains("/") || name.equals(".kicad-review-policy.json")) throw new Failure("Private repository policy cannot be verified; Contents read access is required");
                }
            }
        }
        String mode = "all"; JSONArray allowlist = new JSONArray();
        if (policy != null) {
            if (!(policy.get("schemaVersion") instanceof Number) || policy.getDouble("schemaVersion") != 1 || policy.length() != 2 || !policy.has("commenting")) throw new Failure("Malformed repository comment policy; publishing blocked");
            JSONObject commenting = policy.getJSONObject("commenting"); mode = commenting.getString("mode");
            if (!mode.matches("all|contributors|collaborators|allowlist")) throw new Failure("Malformed repository comment policy mode");
            java.util.Iterator<String> keys = commenting.keys();
            while (keys.hasNext()) { String key = keys.next(); if (!key.equals("mode") && !key.equals("allowlist")) throw new Failure("Malformed repository comment policy fields"); }
            if (commenting.has("allowlist")) allowlist = commenting.getJSONArray("allowlist");
            if (allowlist.length() > 100) throw new Failure("Repository allowlist exceeds 100 accounts");
            for (int i = 0; i < allowlist.length(); i++) if (!(allowlist.get(i) instanceof String) || !allowlist.getString(i).matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")) throw new Failure("Malformed repository allowlist");
        }
        JSONObject result = new JSONObject().put("repository", repo).put("ref", ref).put("mode", mode).put("source", source).put("allowed", false).put("reason", "Connect GitHub to publish comments");
        if (credential(epoch) == null) return result;
        String who = api("/user", epoch, 1024 * 1024).getString("login");
        if (!who.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")) throw new Failure("Could not verify publishing account");
        result.put("login", who);
        boolean allowed = mode.equals("all") || who.equalsIgnoreCase(repo.split("/")[0]);
        for (int i = 0; i < allowlist.length(); i++) if (who.equalsIgnoreCase(allowlist.getString(i))) allowed = true;
        if (!allowed && mode.equals("collaborators")) {
            try { String permission = api("/repos/" + repo + "/collaborators/" + encode(who) + "/permission", epoch, 1024 * 1024).getString("permission");
                allowed = permission.matches("read|write|admin"); } catch (Missing absent) { allowed = false; }
        }
        if (!allowed && mode.equals("contributors")) {
            for (int page = 1; page <= 10 && !allowed; page++) {
                JSONArray users = new JSONArray(network("https://api.github.com/repos/" + repo + "/contributors?per_page=100&page=" + page, null, credential(epoch), epoch, 2 * 1024 * 1024));
                for (int i = 0; i < users.length(); i++) if (who.equalsIgnoreCase(users.getJSONObject(i).optString("login"))) allowed = true;
                if (users.length() < 100) break;
            }
        }
        return result.put("allowed", allowed).put("reason", allowed ? "Repository policy allows this account to publish" : "Repository policy does not allow this account to publish");
    }
    private static String hash(String value) throws Exception { return hashBytes(value.getBytes(StandardCharsets.UTF_8)); }
    private static String hashBytes(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder result = new StringBuilder();
        for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255)); return result.toString();
    }
    private String networkJson(String path, JSONObject body, int epoch) throws Exception {
        return networkBytes("https://api.github.com" + path, body.toString().getBytes(StandardCharsets.UTF_8), "application/json", credential(epoch), epoch, 4 * 1024 * 1024);
    }
    private static void safePath(String path) throws IOException {
        if (path.length() > 500 || path.startsWith("/") || path.indexOf('\\') >= 0 || path.indexOf(':') >= 0 || hasControl(path)) throw new Failure("Unsafe repository path");
        for (String part : path.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new Failure("Unsafe repository path");
    }
    private static boolean hasControl(String value) {
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) return true;
        return false;
    }
    private static String validSha(String sha) throws IOException {
        if (!sha.matches("[0-9a-fA-F]{40}")) throw new Failure("Invalid GitHub object identifier");
        return sha;
    }
    private static String encode(String value) throws Exception { return URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
    private JSONObject api(String path, int epoch, int limit) throws Exception {
        return new JSONObject(network("https://api.github.com" + path, null, credential(epoch), epoch, limit));
    }
    private JSONObject oauth(String path, String body, int epoch) throws Exception {
        return new JSONObject(network("https://github.com" + path, body, null, epoch, 64 * 1024));
    }
    private String network(String address, String body, String bearer, int epoch, int limit) throws Exception {
        return networkBytes(address, body == null ? null : body.getBytes(StandardCharsets.UTF_8), "application/x-www-form-urlencoded", bearer, epoch, limit);
    }
    private String networkBytes(String address, byte[] body, String contentType, String bearer, int epoch, int limit) throws Exception {
        check(epoch);
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") || url.getPort() != -1 || url.getUserInfo() != null
                || (!url.getHost().equals("api.github.com") && !(url.getHost().equals("uploads.github.com") && bearer != null && body != null
                && url.getPath().equals("/user-attachments/assets")) && !(url.getHost().equals("github.com") && bearer == null && body != null
                && (url.getPath().equals("/login/device/code") || url.getPath().equals("/login/oauth/access_token"))))) throw new Failure("Unsupported GitHub endpoint");
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "KiCadVizDiff-Android");
        if (url.getHost().equals("api.github.com")) connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
        long deadline = SystemClock.elapsedRealtime() + 90000;
        try {
            if (body != null) {
                byte[] bytes = body;
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", contentType);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream stream = connection.getOutputStream()) { stream.write(bytes); }
            }
            int status = connection.getResponseCode();
            check(epoch);
            if (url.getHost().equals("api.github.com") && !url.getPath().equals("/graphql")) {
                synchronized (this) { check(epoch); coreRemaining = GitHubFailure.number(connection.getHeaderField("X-RateLimit-Remaining")); quotaAuthenticated = bearer != null; }
            }
            if (status == 401) {
                synchronized (this) { check(epoch); if (bearer != null) { authExpired = true; token = null; login = ""; clearDevice(); vault.clear(); } }
                throw new Failure("GitHub sign-in expired or was revoked; sign in again");
            }
            if (status == 404) throw new Missing();
            if (status == 403 || status == 429) {
                String message = "";
                try (InputStream errorStream = connection.getErrorStream()) {
                    if (errorStream != null) { byte[] bytes = new byte[4096]; int n = errorStream.read(bytes);
                        if (n > 0) message = new JSONObject(new String(bytes, 0, n, StandardCharsets.UTF_8)).optString("message"); }
                } catch (Exception ignored) { /* Headers remain authoritative; never expose remote response text. */ }
                throw new Failure(GitHubFailure.forbidden(status, bearer != null, connection.getHeaderField("X-RateLimit-Remaining"),
                        connection.getHeaderField("X-RateLimit-Reset"), connection.getHeaderField("Retry-After"),
                        connection.getHeaderField("X-GitHub-SSO"), message, System.currentTimeMillis()/1000));
            }
            if (status < 200 || status >= 300) throw new Failure("GitHub request failed (HTTP " + status + ")");
            if (connection.getContentLengthLong() > limit) throw new Failure("GitHub response exceeds import limits");
            try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[32768]; int n;
                while ((n = stream.read(buffer)) != -1) {
                    check(epoch);
                    if (SystemClock.elapsedRealtime() > deadline) throw new Failure("GitHub download timed out");
                    if (n > limit - output.size()) throw new Failure("GitHub response exceeds import limits");
                    output.write(buffer, 0, n);
                }
                return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString();
            }
        } finally { connection.disconnect(); }
    }
}
