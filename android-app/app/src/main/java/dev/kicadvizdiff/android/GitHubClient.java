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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.*;
import javax.net.ssl.HttpsURLConnection;

/** Native-only GitHub transport. Never returns credentials or raw response errors to JS. */
final class GitHubClient {
    static class Failure extends IOException { Failure(String message) { super(message); } }
    private static final class Missing extends Failure { Missing() { super("Repository or revision unavailable; check its name and private repository access"); } }
    private static final String CLIENT = "Ov23li8RsSVZk2dHptN1";
    private static final int FILE_LIMIT = 32 * 1024 * 1024;
    private static final int TOTAL_LIMIT = 96 * 1024 * 1024;
    interface ConnectionFactory { HttpsURLConnection open(URL url)throws IOException; }
    private final ConnectionFactory connections;
    private final Context policyContext;
    private final DiskProjectStore diskStore;
    private final GitHubVault vault;
    private final GitHubVault deviceVault;
    private String userCode = "";
    private long deviceWallExpiry;
    private final SharedPreferences reviewReceipts;
    private final ProviderWriteGuard writeGuard;
    private int generation;
    private String token;
    private String login = "";
    private String scopes = "";
    private boolean scopesKnown;
    private long coreRemaining = -1;
    private boolean quotaAuthenticated;
    private boolean authExpired;
    private String deviceCode;
    private long deviceExpiry;
    private long nextPoll;
    private int interval;

    GitHubClient(Context context) { this(context,"github"); }
    GitHubClient(Context context, String namespace) { this(context,namespace,url->(HttpsURLConnection)url.openConnection()); }
    GitHubClient(Context context,String namespace,ConnectionFactory connections) { this.policyContext=context.getApplicationContext();this.connections=connections;diskStore = new DiskProjectStore(context); vault = new GitHubVault(context,namespace); deviceVault = new GitHubVault(context, namespace+"_device"); token = vault.read();
        try { String saved = deviceVault.read(); if (saved != null && token == null) {
            JSONObject pending = new JSONObject(saved); long remaining = pending.getLong("expiresAt") - System.currentTimeMillis();
            if (remaining > 0 && remaining <= 1800000) { deviceCode = pending.getString("deviceCode"); userCode = pending.getString("userCode"); interval = Math.max(5, Math.min(60,pending.optInt("interval",5))); deviceWallExpiry = pending.getLong("expiresAt"); deviceExpiry = SystemClock.elapsedRealtime()+remaining; nextPoll = SystemClock.elapsedRealtime()+interval*1000L; }
            else deviceVault.clear();
        } else if (token != null) deviceVault.clear(); } catch(Exception ignored) { deviceVault.clear(); }
        writeGuard = new ProviderWriteGuard(context);
        reviewReceipts = context.getSharedPreferences("github_review_receipts", Context.MODE_PRIVATE); }
    synchronized int generation() { return generation; }
    synchronized boolean current(int epoch) { return epoch == generation; }
    synchronized boolean authExpired() { return authExpired; }
    synchronized void reset() {
        generation++; coreRemaining = -1; token = null; login = ""; scopes = ""; scopesKnown = false; authExpired = false; clearDevice(); vault.clear();
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
    private void claimWrite(String category) throws Failure {
        try { writeGuard.claim(category); }
        catch (IOException error) { throw new Failure(error.getMessage()); }
    }
    private void check(int epoch) throws IOException {
        NativeLoadOperation.checkCurrent();
        NativeChatScope.checkCurrent();
        if (!current(epoch) || Thread.currentThread().isInterrupted()) throw new Failure("GitHub request cancelled");
    }
    private synchronized String credential(int epoch) throws IOException { check(epoch); return token; }

    static boolean cancellableRead(String action) {
        return java.util.Arrays.asList("repositories", "notifications", "import", "revision-import", "revision-resolve", "revision-branches", "revision-commits", "repository-tree", "repository-history", "repository-branches", "review-list", "chat-thread-list", "review-categories", "review-thread", "review-read", "review-contributors", "review-policy").contains(action);
    }
    JSONObject handleLoad(JSONObject request, int epoch, NativeLoadOperation operation) throws Exception {
        if (!cancellableRead(request.optString("action"))) throw new IllegalArgumentException("Only project reads can be stopped");
        try (NativeLoadOperation.Scope scope = operation.enter()) { return handle(request, epoch); }
    }
    JSONObject handle(JSONObject request, int epoch) throws Exception {
        ManagedPolicy.requireAction(policyContext,request.getString("action"));
        check(epoch);
        switch (request.getString("action")) {
            case "auth-status":
                if (credential(epoch) != null) {
                    try { JSONObject user = api("/user", epoch, 1024 * 1024);
                        synchronized (this) { check(epoch); login = user.getString("login"); }
                    } catch (IOException error) { if(authExpired() || !current(epoch)) throw error; }
                }
                synchronized (this) { check(epoch); return accountStatus(deviceStatus()); }
            case "device-start": return start(request.optString("scope", "public"), epoch);
            case "device-poll": return poll(epoch);
            case "device-cancel": case "sign-out": return new JSONObject().put("connected", credential(epoch) != null);
            case "repositories": return repositories(request, epoch);
            case "notifications": return notifications(request, epoch);
            case "import": case "revision-import": return importProject(request, epoch);
            case "revision-resolve": return revisionResolve(request, epoch);
            case "revision-branches": return revisionBranches(request, epoch);
            case "revision-commits": return revisionCommits(request, epoch);
            case "repository-tree": return readRepositoryTree(request,epoch);
            case "repository-history": return readRepositoryHistory(request,epoch);
            case "repository-branches": return readRepositoryBranches(request,epoch);
            case "repository-fork-revision": return forkRevision(request,epoch);
            case "review-list": return reviewList(request, epoch);
            case "review-categories": return categories(repository(request), epoch);
            case "review-thread": return reviewThread(request, epoch);
            case "chat-thread-state": return chatThreadState(request,epoch);
            case "chat-message-write": return chatWrite(request,epoch);
            case "chat-thread-list": return chatThreadList(request,epoch);
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
            return accountStatus(new JSONObject());
        }
    }
    private JSONObject start(String scope, int epoch) throws Exception {
        if (!scope.equals("public") && !scope.equals("private")) throw new Failure("Invalid repository access scope");
        JSONObject result = oauth("/login/device/code", "client_id=" + CLIENT + "&scope=" + encode((scope.equals("private") ? "repo" : "public_repo") + " notifications"), epoch);
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
        synchronized(this) { check(epoch); vault.write(accepted); token = accepted; scopes = result.optString("scope"); scopesKnown = result.has("scope"); authExpired = false; coreRemaining = -1; clearDevice(); }
        // The token endpoint already authorized this credential. Profile lookup belongs to auth-status,
        // so a second API request cannot delay or falsely undo successful authorization.
        JSONObject connected; synchronized(this){check(epoch);connected=accountStatus(new JSONObject());}
        synchronized (this) { check(epoch); clearDevice(); }
        return connected.put("pending", false);
    }
    private synchronized JSONObject accountStatus(JSONObject result) throws Exception {
        JSONArray granted = new JSONArray();
        for (String scope : scopes.split("[ ,]+")) if (!scope.isEmpty()) granted.put(scope);
        return result.put("connected", token != null).put("login", login).put("scopes", granted)
                .put("scopesKnown", scopesKnown).put("notificationsAccess", scopesKnown ? notificationScope() : JSONObject.NULL);
    }
    private synchronized boolean notificationScope() {
        for (String scope : scopes.split("[ ,]+")) if (scope.equals("notifications") || scope.equals("repo")) return true;
        return false;
    }
    private JSONObject notifications(JSONObject request, int epoch) throws Exception {
        String bearer = authenticated(epoch);
        int page = positive(request, "page", 1, 5);
        JSONArray allowlist = request.optJSONArray("repositories");
        if (allowlist == null || allowlist.length() > 100) throw new Failure("Choose up to 100 saved GitHub projects for notifications");
        Set<String> repositories = new HashSet<>();
        for (int i = 0; i < allowlist.length(); i++) {
            String repo = repository(new JSONObject().put("repository", allowlist.getString(i)));
            repositories.add(repo.toLowerCase(Locale.ROOT));
        }
        JSONArray rows = new JSONArray();
        if (repositories.isEmpty()) return new JSONObject().put("notifications", rows).put("hasMore", false).put("page", page);
        synchronized (this) { check(epoch); if (scopesKnown && !notificationScope()) throw new Failure("GitHub notifications permission is missing. Reconnect your GitHub account to grant notifications access, or use a classic token with notifications or repo scope."); }
        JSONArray source = new JSONArray(network("https://api.github.com/notifications?per_page=100&page=" + page
                + "&all=" + request.optBoolean("all", false), null, bearer, epoch, 4 * 1024 * 1024));
        for (int i = 0; i < source.length() && i < 100; i++) {
            check(epoch); JSONObject row = source.getJSONObject(i), repoData = row.optJSONObject("repository"), subject = row.optJSONObject("subject");
            if (repoData == null || subject == null) continue;
            String repo = repoData.optString("full_name");
            if (!repositories.contains(repo.toLowerCase(Locale.ROOT))) continue;
            String type = subject.optString("type");
            if (!type.equals("Issue") && !type.equals("PullRequest") && !type.equals("Discussion")) continue;
            String url = GitHubNotificationLinks.subject(repo, type, subject.optString("url"));
            if (url.isEmpty()) continue;
            rows.put(new JSONObject().put("id", row.optString("id")).put("repository", repo)
                    .put("title", subject.optString("title")).put("type", type).put("reason", row.optString("reason"))
                    .put("unread", row.optBoolean("unread")).put("updatedAt", row.optString("updated_at")).put("url", url));
        }
        return new JSONObject().put("notifications", rows).put("hasMore", source.length() == 100 && page < 5)
                .put("limited", source.length() == 100 && page == 5).put("page", page);
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
        long deadline = SystemClock.elapsedRealtime() + (request.optBoolean("downloadLarge") ? 30L : 8L) * 60 * 1000;
        String repository = request.getString("repository");
        if (repository.length() > 240 || !repository.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")
                || repository.endsWith("/.") || repository.endsWith("/..")) throw new Failure("Enter a valid owner/repository");
        String root = "/repos/" + repository;
        String sourceRef=request.optString("sourceRef",request.optString("ref",""));
        if(sourceRef.length()>255||hasControl(sourceRef))throw new Failure("Invalid branch or commit");
        // Cache validation can wait on a disk transfer. Do not hold the provider
        // monitor: cancel/sign-out are called from the UI thread and must stay responsive.
        check(epoch);
        JSONObject cached=diskStore.findRemote("github","",repository,request.optString("ref",""));
        check(epoch);
        if(cached!=null)return new JSONObject().put("repository",repository).put("sha",cached.getJSONObject("github").getString("sha")).put("cached",true).put("project",cached);
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

        if (nodes.length() > 100000) throw new Failure("Repository has too many entries");
        long sourceBytes = 0; boolean large = false;
        for (int i = 0; i < nodes.length(); i++) { JSONObject node = nodes.getJSONObject(i);
            if (!node.optString("type").equals("blob") || !importable(node.optString("path"))) continue;
            long size = node.optLong("size", -1); if (size < 0) throw new Failure("Unknown repository file size");
            sourceBytes += size; large |= size > FILE_LIMIT;
        }
        large |= sourceBytes > TOTAL_LIMIT;
        synchronized (this) {
            check(epoch); boolean authenticated = token != null;
            String budget = GitHubFailure.importBudget((large || request.optBoolean("downloadLarge")) && !metadata.optBoolean("private") ? 0 : requiredFiles, quotaAuthenticated == authenticated ? coreRemaining : -1, authenticated);
            if (budget != null) throw new Failure(budget);
        }
        if (large || request.optBoolean("downloadLarge")) {
            if (!request.optBoolean("downloadLarge")) return new JSONObject().put("downloadRequired", true).put("bytes", sourceBytes).put("repository", repository).put("sha", sha);
            JSONObject downloaded = diskStore.download(repository, sha, metadata.optBoolean("private"), nodes, (path, target, size) -> downloadFile(repository, sha, path, target, size, metadata.optBoolean("private"), epoch, deadline),request.optBoolean("temporaryDownload"),sourceRef);
            downloaded.getJSONObject("project").put("repositoryTree", repositoryTree(nodes));
            return downloaded;
        }

        JSONObject imported=importSmallFiles(nodes,(identity,size)->api(root+"/git/blobs/"+identity,epoch,(int)Math.min(48L*1024*1024,size*2+16384)),()->{
            check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository download timed out; use a smaller repository or local import");
        },3);
        JSONArray files=imported.getJSONArray("files"),assets=imported.getJSONArray("assets");
        check(epoch);
        if (files.length() == 0 && assets.length() == 0) throw new Failure("No supported KiCad files found in repository");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((repository.toLowerCase(Locale.ROOT) + "@" + sha).getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte b : digest) id.append(String.format(Locale.ROOT, "%02x", b & 255));
        return new JSONObject().put("repository", metadata.getString("full_name")).put("sha", sha).put("private", metadata.getBoolean("private"))
                .put("project", new JSONObject().put("id", id.toString()).put("files", files).put("assets", assets).put("repositoryTree", repositoryTree(nodes)));
    }
    interface BlobLoader { JSONObject load(String identity,long size)throws Exception; }
    interface ImportCheck { void run()throws Exception; }
    private static final long SMALL_PARALLEL_BYTES=8L*1024*1024;
    private static final class SmallFile {
        final int index;final String path,identity;final long size;final boolean binary;
        SmallFile(int index,String path,String identity,long size){this.index=index;this.path=path;this.identity=identity;this.size=size;this.binary=path.toLowerCase(Locale.ROOT).matches(".*\\.(step|stp|wrl|vrml|glb|pdf)$");}
    }
    /** Complete preflight precedes all blob reads. At most three small requests,
     * or one large request, decode concurrently; output retains tree order. */
    static JSONObject importSmallFiles(JSONArray nodes,BlobLoader loader,ImportCheck check,int concurrency)throws Exception {
        if(concurrency<1||concurrency>3)throw new IllegalArgumentException("Transfer concurrency must be 1–3");
        List<SmallFile> sources=new ArrayList<>();Set<String> paths=new HashSet<>();long total=0;
        for(int i=0;i<nodes.length();i++) {
            check.run();JSONObject node=nodes.getJSONObject(i);String path=node.optString("path");
            if(!node.optString("type").equals("blob")||!importable(path))continue;
            safePath(path);if(!node.optString("mode").matches("100644|100755"))throw new Failure("Symbolic links cannot be imported");
            if(!paths.add(path.toLowerCase(Locale.ROOT)))throw new Failure("Duplicate repository file path");
            if(sources.size()>=2000)throw new Failure("Too many KiCad files (limit 2000)");
            long size=node.getLong("size");if(size<0||size>FILE_LIMIT||size>TOTAL_LIMIT-total)throw new Failure("Repository exceeds 32 MiB per file or 96 MiB total");
            String identity=validSha(node.getString("sha"));total+=size;sources.add(new SmallFile(sources.size(),path,identity,size));
        }
        JSONObject[] items=new JSONObject[sources.size()];ExecutorService pool=Executors.newFixedThreadPool(concurrency,runnable->{Thread thread=new Thread(runnable,"kiview-github-import");thread.setDaemon(true);return thread;});
        CompletionService<JSONObject> completed=new ExecutorCompletionService<>(pool);Map<Future<JSONObject>,SmallFile> active=new HashMap<>();
        int next=0,finished=0;long reserved=0;boolean interrupted=false;
        try {
            while(finished<sources.size()) {
                check.run();if(Thread.currentThread().isInterrupted())throw new InterruptedException("GitHub import cancelled");
                while(next<sources.size()&&active.size()<concurrency) {
                    SmallFile file=sources.get(next);if(!active.isEmpty()&&file.size>SMALL_PARALLEL_BYTES-reserved)break;
                    Future<JSONObject> task=completed.submit(()->decodeSmallFile(file,loader,check));active.put(task,file);reserved+=file.size;next++;
                }
                Future<JSONObject> task=completed.take();SmallFile file=active.remove(task);
                try{items[file.index]=task.get();}catch(ExecutionException failure){Throwable cause=failure.getCause();if(cause instanceof Exception)throw (Exception)cause;if(cause instanceof Error)throw (Error)cause;throw new IOException("GitHub import failed",cause);}
                reserved-=file.size;finished++;check.run();
            }
        }catch(InterruptedException cancellation){interrupted=true;java.io.InterruptedIOException failure=new java.io.InterruptedIOException("GitHub import cancelled");failure.initCause(cancellation);throw failure;}
        finally {DiskProjectStore.joinTransfers(pool,active.keySet());if(interrupted)Thread.currentThread().interrupt();}
        JSONArray files=new JSONArray(),assets=new JSONArray();for(SmallFile source:sources)(source.binary?assets:files).put(items[source.index]);
        check.run();return new JSONObject().put("files",files).put("assets",assets);
    }
    private static JSONObject decodeSmallFile(SmallFile file,BlobLoader loader,ImportCheck check)throws Exception {
        check.run();JSONObject blob=loader.load(file.identity,file.size);check.run();
        if(!blob.getString("encoding").equals("base64"))throw new Failure("Unsupported GitHub blob encoding");
        byte[] bytes=Base64.decode(blob.getString("content"),Base64.DEFAULT);
        if(bytes.length!=file.size)throw new Failure("Repository file size mismatch");
        if(bytes.length>=42&&new String(bytes,0,42,StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/"))throw new Failure("Git LFS files must be downloaded locally before import");
        JSONObject item=new JSONObject().put("path",file.path);if(file.path.toLowerCase(Locale.ROOT).endsWith(".pdf"))item.put("encoding","base64");
        if(file.binary)item.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));
        else {String content=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            if(content.startsWith("version https://git-lfs.github.com/spec/"))throw new Failure("Git LFS files must be downloaded locally before import");item.put("content",content);}
        check.run();if(Thread.currentThread().isInterrupted())throw new java.io.InterruptedIOException("GitHub import cancelled");return item;
    }
    /** Metadata only; unsupported repository files are never downloaded into the viewer. */
    static JSONObject repositoryTree(JSONArray nodes) throws Exception {
        JSONArray entries = new JSONArray();
        boolean omitted = nodes.length() > 10000;
        for (int i = 0; i < Math.min(nodes.length(), 10000); i++) {
            JSONObject node = nodes.getJSONObject(i);
            String path = node.optString("path"), type = node.optString("type");
            try { safePath(path); } catch (Exception invalid) { omitted = true; continue; }
            if (!type.equals("blob") && !type.equals("tree") && !type.equals("commit")) continue;
            entries.put(new JSONObject().put("path", path).put("type", type));
        }
        return new JSONObject().put("entries", entries).put("truncated", omitted);
    }
    private void downloadFile(String repository, String sha, String path, java.io.File target, long size, boolean isPrivate, int epoch, long projectDeadline) throws Exception {
        ManagedPolicy.requireNetwork(policyContext);
        HttpsURLConnection connection = connections.open(downloadUrl(repository,sha,path,size,isPrivate)); NativeLoadOperation.track(connection);
        connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/vnd.github.raw+json"); connection.setRequestProperty("User-Agent", "KiCadVizDiff-Android");
        String bearer = credential(epoch); if(isPrivate && bearer!=null) connection.setRequestProperty("Authorization", "Bearer "+bearer);
        try {
            int status = connection.getResponseCode(); check(epoch);
            if(status!=200) throw new Failure("Large-file download failed (HTTP "+status+"); check sign-in and repository access");
            long expected=connection.getContentLengthLong(); if(expected>=0 && expected!=size) throw new Failure("Large-file download size mismatch");
            long total=0, deadline=Math.min(projectDeadline,SystemClock.elapsedRealtime()+15*60*1000L);
            try(InputStream input=NativeLoadOperation.input(connection.getInputStream()); java.io.OutputStream output=new java.io.FileOutputStream(target)) {
                byte[] buffer=new byte[65536]; int n; while((n=input.read(buffer))!=-1) { check(epoch); if(SystemClock.elapsedRealtime()>deadline || n>size-total) throw new Failure("Large-file download size or time limit exceeded"); output.write(buffer,0,n); total+=n; }
            }
            if(total!=size) throw new Failure("Large-file download was incomplete");
        } finally { NativeLoadOperation.untrack(connection); connection.disconnect(); }
    }
    static URL downloadUrl(String repository, String sha, String path, long size, boolean isPrivate) throws Exception {
        if (!repository.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}") || repository.endsWith("/.") || repository.endsWith("/..")) throw new IOException("Invalid repository");
        validSha(sha); safePath(path);
        if (size < 0 || size > DiskProjectStore.FILE_LIMIT) throw new IOException("Invalid download size");
        StringBuilder encoded = new StringBuilder(); for (String part : path.split("/")) { if(encoded.length()>0) encoded.append('/'); encoded.append(encode(part)); }
        // Public raw sources avoid per-file API quota. Private sources use the
        // authenticated contents API; raw-host bearer authentication is not reliable.
        if (isPrivate && size > 100L*1024*1024) throw new IOException("Private GitHub files over 100 MiB are not supported by this download path; GitHub Contents API cannot serve them");
        String endpoint = !isPrivate
                ? "https://raw.githubusercontent.com/"+repository+"/"+sha+"/"+encoded
                : "https://api.github.com/repos/"+repository+"/contents/"+encoded+"?ref="+sha;
        return new URL(endpoint);
    }
    static boolean importable(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.matches(".*\\.(step|stp|wrl|vrml|glb|pdf|kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|json|gbr|ger|gerber|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\\d+|g\\d+|drl|xln|csv|tsv|txt|wbk|raw|html|htm)$")
                || lower.equals("sym-lib-table") || lower.equals("fp-lib-table") || lower.endsWith("/sym-lib-table") || lower.endsWith("/fp-lib-table");
    }
    private static String revisionFile(JSONObject request) throws Exception {
        String file = request.getString("file"); safePath(file);
        if (!file.toLowerCase(Locale.ROOT).matches(".*\\.(kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|sch|brd|json|csv|tsv|txt|wbk|raw|html|htm)$"))
            throw new Failure("Select a supported KiCad drawing, project or analysis report");
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
    private void repositoryCheck(int epoch,long deadline)throws IOException {check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository metadata request timed out");}
    private JSONObject repositorySnapshot(JSONObject request,int epoch,long deadline)throws Exception {
        String repo=repository(request),ref=request.optString("ref","");String pinned=request.optString("sha","");
        if(ref.length()>255||hasControl(ref))throw new Failure("Invalid branch or commit");
        if(!pinned.isEmpty())pinned=validSha(pinned).toLowerCase(Locale.ROOT);
        if(ref.isEmpty())ref=pinned.isEmpty()?revisionRef(request,repo,epoch):pinned;
        if(request.optInt("page",1)>1&&pinned.isEmpty()&&!ref.matches("[a-fA-F0-9]{40}"))throw new Failure("Use the returned commit SHA when loading another repository page");
        repositoryCheck(epoch,deadline);JSONObject commit=api("/repos/"+repo+"/commits/"+encode(pinned.isEmpty()?ref:pinned),epoch,4*1024*1024);
        String sha=validSha(commit.getString("sha")).toLowerCase(Locale.ROOT);
        if(!pinned.isEmpty()&&!pinned.equals(sha)||ref.matches("[a-fA-F0-9]{40}")&&!ref.equalsIgnoreCase(sha))throw new Failure("Repository snapshot identity mismatch");
        repositoryCheck(epoch,deadline);return new JSONObject().put("repository",repo).put("ref",ref).put("sha",sha).put("treeSha",validSha(commit.getJSONObject("commit").getJSONObject("tree").getString("sha")));
    }
    private JSONObject pinnedTree(String repo,String identity,boolean recursive,int epoch,long deadline)throws Exception {
        repositoryCheck(epoch,deadline);JSONObject tree=api("/repos/"+repo+"/git/trees/"+validSha(identity)+(recursive?"?recursive=1":""),epoch,16*1024*1024);
        if(!validSha(tree.getString("sha")).equalsIgnoreCase(identity))throw new Failure("Repository tree identity mismatch");
        if(tree.getJSONArray("tree").length()>100000)throw new Failure("Repository tree exceeds metadata limits");repositoryCheck(epoch,deadline);return tree;
    }
    static JSONObject treeEntry(JSONObject node,String prefix,boolean direct)throws Exception {
        String path=node.getString("path");safePath(path);if(direct&&path.indexOf('/')>=0)throw new Failure("Invalid immediate directory entry");
        path=prefix.isEmpty()?path:prefix+"/"+path;safePath(path);String type=node.getString("type"),mode=node.getString("mode");if(mode.equals("40000"))mode="040000";
        if(!(type.equals("tree")&&mode.equals("040000")||type.equals("blob")&&mode.matches("100644|100755|120000")||type.equals("commit")&&mode.equals("160000")))throw new Failure("Unsupported repository entry mode");
        String identity=validSha(node.has("sha")?node.getString("sha"):node.getString("id")).toLowerCase(Locale.ROOT);
        JSONObject result=new JSONObject().put("path",path).put("type",type).put("mode",mode).put("sha",identity);
        if(node.has("size")&&node.optLong("size",-1)>=0)result.put("size",node.getLong("size"));return result;
    }
    private JSONObject readRepositoryTree(JSONObject request,int epoch)throws Exception {
        int page=positive(request,"page",1,1000),perPage=positive(request,"perPage",1000,1000);long deadline=SystemClock.elapsedRealtime()+90000;
        boolean direct=request.has("directory");if(direct&&!(request.get("directory") instanceof String))throw new Failure("Invalid directory path");String directory=request.optString("directory","");if(!directory.isEmpty())safePath(directory);if(directory.split("/",-1).length>32)throw new Failure("Directory nesting exceeds metadata limit");
        JSONObject snapshot=repositorySnapshot(request,epoch,deadline);String repo=snapshot.getString("repository"),identity=snapshot.getString("treeSha");JSONObject tree;
        if(direct){
            tree=pinnedTree(repo,identity,false,epoch,deadline);
            if(!directory.isEmpty())for(String segment:directory.split("/")){
                JSONArray children=tree.getJSONArray("tree");String found=null;
                for(int i=0;i<children.length();i++){JSONObject entry=children.getJSONObject(i);if(entry.optString("path").equals(segment)&&entry.optString("type").equals("tree")){if(found!=null)throw new Failure("Ambiguous saved directory");found=treeEntry(entry,"",true).getString("sha");}}
                if(found==null)throw new Failure(tree.optBoolean("truncated",true)?"Directory was not present in the bounded parent tree; no latest-branch fallback was used":"Directory is not present at this saved commit");
                tree=pinnedTree(repo,found,false,epoch,deadline);
            }
        }else tree=pinnedTree(repo,identity,true,epoch,deadline);
        JSONArray nodes=tree.getJSONArray("tree"),entries=new JSONArray(),warnings=new JSONArray();boolean truncated=tree.optBoolean("truncated",true),omitted=false;
        int start=(page-1)*perPage,end=Math.min(nodes.length(),start+perPage);
        for(int i=start;i<end;i++){repositoryCheck(epoch,deadline);try{entries.put(treeEntry(nodes.getJSONObject(i),direct?directory:"",direct));}catch(Exception invalid){omitted=true;}}
        boolean more=end<nodes.length()&&page<1000;if(omitted){truncated=true;warnings.put("Some unsafe or unsupported repository entries were omitted.");}
        if(tree.optBoolean("truncated",true))warnings.put("GitHub returned a truncated tree. Browse saved directories to inspect omitted descendants.");
        if(more)warnings.put("More repository entries are available; load the next page.");
        return new JSONObject().put("repository",repo).put("ref",snapshot.getString("ref")).put("sha",snapshot.getString("sha")).put("directory",directory).put("recursive",!direct).put("entries",entries).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
    }
    static String historyMessage(String message,JSONArray warnings) {
        String safe=message.replace("\r\n","\n").replace('\r','\n').replaceAll("[\\p{Cntrl}&&[^\\n\\t]]","");
        if(safe.length()>16384){int end=Character.isHighSurrogate(safe.charAt(16383))?16383:16384;safe=safe.substring(0,end);warnings.put("A commit message was shortened to 16384 characters.");}return safe;
    }
    static JSONArray historyParents(JSONArray source,boolean github,JSONArray warnings)throws Exception {
        if(source==null)throw new Failure("Commit parent identities are missing");JSONArray parents=new JSONArray();
        for(int i=0;i<Math.min(source.length(),32);i++)parents.put(validSha(github?source.getJSONObject(i).getString("sha"):source.getString(i)).toLowerCase(Locale.ROOT));
        if(source.length()>32)warnings.put("A commit has more than 32 parents; its parent list is truncated.");return parents;
    }
    private JSONObject readRepositoryHistory(JSONObject request,int epoch)throws Exception {
        int page=positive(request,"page",1,100),perPage=positive(request,"perPage",30,100);long deadline=SystemClock.elapsedRealtime()+90000;
        JSONObject snapshot=repositorySnapshot(request,epoch,deadline);String repo=snapshot.getString("repository"),sha=snapshot.getString("sha");
        JSONArray source=new JSONArray(network("https://api.github.com/repos/"+repo+"/commits?sha="+sha+"&per_page="+perPage+"&page="+page,null,credential(epoch),epoch,4*1024*1024)),commits=new JSONArray(),warnings=new JSONArray();
        if(source.length()>perPage)throw new Failure("Invalid repository history page size");
        for(int i=0;i<source.length();i++){
            repositoryCheck(epoch,deadline);JSONObject item=source.getJSONObject(i),commit=item.getJSONObject("commit"),author=commit.optJSONObject("author");if(author==null)author=commit.optJSONObject("committer");
            String identity=validSha(item.getString("sha")).toLowerCase(Locale.ROOT),name=author==null?"":author.optString("name","").replaceAll("[\\p{Cntrl}]"," "),date=author==null?"":author.optString("date","");if(name.length()>256)name=name.substring(0,256);if(date.length()>64||hasControl(date))throw new Failure("Invalid commit timestamp");
            JSONArray rawParents=item.getJSONArray("parents");commits.put(new JSONObject().put("sha",identity).put("parents",historyParents(rawParents,true,warnings)).put("parentsTruncated",rawParents.length()>32).put("message",historyMessage(commit.optString("message",""),warnings)).put("author",name).put("date",date).put("url","https://github.com/"+repo+"/commit/"+identity));
        }
        boolean more=source.length()==perPage&&page<100,pageLimited=source.length()==perPage&&page==100,truncated=pageLimited;for(int i=0;i<commits.length();i++)truncated|=commits.getJSONObject(i).optBoolean("parentsTruncated");
        if(more)warnings.put("This is one history page; parent commits can be outside the loaded graph.");if(pageLimited)warnings.put("Repository history reached the 100-page limit; no complete-history claim is made.");
        repositoryCheck(epoch,deadline);return new JSONObject().put("repository",repo).put("ref",snapshot.getString("ref")).put("sha",sha).put("commits",commits).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
    }
    private JSONObject readRepositoryBranches(JSONObject request,int epoch)throws Exception {
        int page=positive(request,"page",1,100),perPage=positive(request,"perPage",100,100);String repo=repository(request);
        JSONArray source=new JSONArray(network("https://api.github.com/repos/"+repo+"/branches?per_page="+perPage+"&page="+page,null,credential(epoch),epoch,4*1024*1024)),branches=new JSONArray(),warnings=new JSONArray();
        if(source.length()>perPage)throw new Failure("Invalid branch page size");
        for(int i=0;i<source.length();i++){check(epoch);JSONObject branch=source.getJSONObject(i);String name=branch.getString("name");if(name.isEmpty()||name.length()>255||hasControl(name))throw new Failure("Invalid branch name");branches.put(new JSONObject().put("name",name).put("sha",validSha(branch.getJSONObject("commit").getString("sha")).toLowerCase(Locale.ROOT)));}
        boolean more=source.length()==perPage&&page<100,truncated=source.length()==perPage&&page==100;if(truncated)warnings.put("Branch listing reached the 100-page limit.");
        return new JSONObject().put("repository",repo).put("branches",branches).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
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
        JSONObject result=new JSONObject().put("id", id).put("author", who.isEmpty() ? JSONObject.NULL : who).put("createdAt", created)
                .put("updatedAt", updated).put("body", body).put("bodyTruncated",encoded.length>limit).put("url", url).put("replyTo", parent == null ? JSONObject.NULL : parent);
        if(discussion&&item.has("id"))result.put("nodeId",nodeId(item.getString("id"))).put("viewerCanUpdate",item.optBoolean("viewerCanUpdate",false)).put("viewerDidAuthor",item.optBoolean("viewerDidAuthor",false));
        if(author!=null&&author.has("id"))result.put("authorId",NativeChatRequest.remoteId(author,"id"));
        return result;
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
            thread = record(source, false, url, String.valueOf(number), null, budget).put("title", source.getString("title")).put("state", source.getString("state")).put("locked",source.optBoolean("locked")).put("isPullRequest",source.has("pull_request"));
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
            String fields = "id databaseId body createdAt updatedAt author{login} viewerCanUpdate viewerDidAuthor";
            String query = "query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){discussion(number:$number){number title closed locked " + fields + " comments(first:50,after:$cursor){nodes{" + fields + " replies(first:10){nodes{" + fields + "} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}";
            String[] names = repo.split("/"); String cursor = ""; Set<String> seen = new HashSet<>();
            java.util.ArrayList<JSONObject> replyTasks = new java.util.ArrayList<>(); int requests = 0;
            for (int page = 0; page < 4 && comments.length() < 200 && budget[0] < 1024 * 1024; page++) {
                JSONObject source = graphql(query, new JSONObject().put("owner", names[0]).put("name", names[1]).put("number", number)
                        .put("cursor", cursor.isEmpty() ? JSONObject.NULL : cursor), epoch).getJSONObject("repository").getJSONObject("discussion");
                requests++;
                if (source.getInt("number") != number) throw new Failure("GitHub returned a different Discussion");
                if (thread == null) thread = record(source, true, url, String.valueOf(number), null, budget)
                        .put("title", source.getString("title")).put("state", source.getBoolean("closed") ? "closed" : "open").put("locked",source.getBoolean("locked"));
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
        thread.put("kind", kind).put("number", number).put("comments", comments).put("warnings", warnings);
        if(request.optBoolean("includeCapabilities",false))chatCapabilities(thread,repo,kind,epoch);
        return thread;
    }
    private JSONObject chatThreadList(JSONObject request,int epoch)throws Exception {
        NativeChatRequest.validateScope(request.getString("ref"),request.getString("file"));String repo=repository(request),kind=kind(request);int page=positive(request,"page",1,5);JSONArray threads=new JSONArray();boolean more,truncated=false;String cursor=NativeChatRequest.cursor(request),previousCursor=cursor;if(kind.equals("issue")&&request.has("cursor")&&!request.isNull("cursor"))throw new Failure("Issue discovery does not use a cursor");
        if(kind.equals("issue")){JSONArray rows=new JSONArray(network("https://api.github.com/repos/"+repo+"/issues?state=all&sort=updated&direction=desc&per_page=20&page="+page,null,credential(epoch),epoch,4*1024*1024));if(rows.length()>20)throw new Failure("Invalid issue page size");for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(row.has("pull_request"))continue;int number=positive(row,"number",0,Integer.MAX_VALUE);if(number==0)throw new Failure("Invalid issue number");String updated=row.getString("updated_at");if(!NativeChatRequest.timestamp(updated))throw new Failure("Invalid thread timestamp");threads.put(new JSONObject().put("kind",kind).put("number",number).put("title",NativeChatRequest.summaryTitle(row)).put("state",NativeChatRequest.summaryState(row,false)).put("author",NativeChatRequest.summaryAuthor(row,false)).put("updatedAt",updated).put("url",threadUrl(repo,kind,number)));}more=rows.length()==20&&page<5;truncated=rows.length()==20&&page==5;
        }else{String[]names=repo.split("/");JSONObject value=graphql("query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){discussions(first:20,after:$cursor,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title closed updatedAt author{login}} pageInfo{hasNextPage endCursor}}}}",new JSONObject().put("owner",names[0]).put("name",names[1]).put("cursor",cursor.isEmpty()?JSONObject.NULL:cursor),epoch).getJSONObject("repository").getJSONObject("discussions");JSONArray rows=value.getJSONArray("nodes");if(rows.length()>20)throw new Failure("Invalid Discussion page size");for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);int number=positive(row,"number",0,Integer.MAX_VALUE);String updated=row.getString("updatedAt");if(number==0||!NativeChatRequest.timestamp(updated))throw new Failure("Invalid Discussion summary");threads.put(new JSONObject().put("kind",kind).put("number",number).put("title",NativeChatRequest.summaryTitle(row)).put("state",row.getBoolean("closed")?"closed":"open").put("author",NativeChatRequest.summaryAuthor(new JSONObject().put("user",row.opt("author")),false)).put("updatedAt",updated).put("url",threadUrl(repo,kind,number)));}boolean providerMore=value.getJSONObject("pageInfo").getBoolean("hasNextPage");more=providerMore&&page<5;truncated=providerMore&&page==5;cursor=more?value.getJSONObject("pageInfo").getString("endCursor"):"";if(more&&(cursor.isEmpty()||cursor.length()>1024||hasControl(cursor)||cursor.equals(previousCursor)))throw new Failure("Invalid Discussion pagination");}
        return new JSONObject().put("threads",threads).put("hasMore",more).put("cursor",cursor).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated);
    }
    private void chatCapabilities(JSONObject thread,String repo,String kind,int epoch)throws Exception {
        boolean allowed=false;String viewer="";long viewerId=0;
        try{if(credential(epoch)!=null){JSONObject user=api("/user",epoch,1024*1024);viewer=user.getString("login");viewerId=NativeChatRequest.remoteId(user,"id");if(!viewer.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"))throw new Failure("Invalid account identity");allowed=policyStatus(repo,epoch).getBoolean("allowed");}}catch(Exception denied){check(epoch);}
        allowed=allowed&&!thread.optBoolean("locked")&&!thread.optBoolean("isPullRequest");thread.put("capabilities",new JSONObject().put("create",allowed).put("reply",allowed).put("edit",allowed).put("reactions",false).put("replyMode",kind.equals("issue")?"quoted":"native"));
        boolean canClose=false,canReopen=false;if(allowed){try{ManagedPolicy.requireAction(policyContext,"chat-thread-state");JSONObject fresh=threadStateSnapshot(repo,kind,thread.getInt("number"),epoch);if(fresh.getString("updatedAt").equals(thread.optString("updatedAt"))&&fresh.getBoolean("closed")==thread.optString("state").equals("closed")){canClose=!fresh.getBoolean("closed")&&fresh.getBoolean("viewerCanClose");canReopen=fresh.getBoolean("closed")&&fresh.getBoolean("viewerCanReopen");}}catch(Exception denied){check(epoch);}}thread.getJSONObject("capabilities").put("canClose",canClose).put("canReopen",canReopen);
        JSONArray messages=thread.getJSONArray("comments");for(int i=0;i<messages.length();i++){JSONObject item=messages.getJSONObject(i);boolean own=!viewer.isEmpty()&&viewer.equalsIgnoreCase(item.optString("author"))&&(kind.equals("discussion")?item.optBoolean("viewerDidAuthor"):viewerId>0&&viewerId==item.optLong("authorId",0));item.put("canEdit",allowed&&own&&!item.optBoolean("bodyTruncated")&&(!kind.equals("discussion")||item.optBoolean("viewerCanUpdate")&&item.optBoolean("viewerDidAuthor"))&&!item.optString("body").contains("kicad-review:"));}
    }
    private JSONObject threadStateSnapshot(String repo,String kind,int number,int epoch)throws Exception {
        String[] names=repo.split("/");JSONObject result=graphql("query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){nameWithOwner "+kind+"(number:$number){id number closed updatedAt viewerCanClose viewerCanReopen}}}",new JSONObject().put("owner",names[0]).put("name",names[1]).put("number",number),epoch).getJSONObject("repository"),value=result.getJSONObject(kind);
        if(!repo.equalsIgnoreCase(result.getString("nameWithOwner"))||NativeChatRequest.remoteId(value,"number")!=number||!(value.get("closed")instanceof Boolean)||!(value.get("viewerCanClose")instanceof Boolean)||!(value.get("viewerCanReopen")instanceof Boolean)||!NativeChatRequest.timestamp(value.getString("updatedAt")))throw new Failure("Conversation identity or permissions could not be verified");nodeId(value.getString("id"));return value;
    }
    private JSONObject chatThreadState(JSONObject request,int epoch)throws Exception {
        NativeThreadStateRequest input=new NativeThreadStateRequest(request);String repo=repository(request);if(credential(epoch)==null)throw new Failure("Sign in before changing conversation state");
        JSONObject user=api("/user",epoch,1024*1024);long viewer=NativeChatRequest.remoteId(user,"id");if(!policyStatus(repo,epoch).getBoolean("allowed"))throw new Failure("Repository policy blocks conversation state changes");
        String key="thread_state_"+hash(repo.toLowerCase(java.util.Locale.ROOT)+"|"+viewer+"|"+input.kind+"|"+input.number+"|"+input.expectedUpdatedAt+"|"+input.state+"|"+request.getString("ref")+"|"+request.getString("file"));String previous=reviewReceipts.getString(key,null);
        if(previous!=null){JSONObject receipt=new JSONObject(previous);if(receipt.has("result"))return receipt.getJSONObject("result").put("duplicate",true);throw new Failure("Previous state change has an unconfirmed outcome; refresh and inspect GitHub before retrying");}
        JSONObject fresh=threadStateSnapshot(repo,input.kind,input.number,epoch);input.checkRevision(fresh.getString("updatedAt"),fresh.getBoolean("closed"));if(!fresh.getBoolean(input.state.equals("closed")?"viewerCanClose":"viewerCanReopen"))throw new Failure("GitHub does not permit this state change");
        synchronized(this){check(epoch);ManagedPolicy.requireAction(policyContext,"chat-thread-state");if(reviewReceipts.contains(key))throw new Failure("State change already in progress; refresh before retrying");claimWrite("publish");if(!reviewReceipts.edit().putString(key,new JSONObject().put("pending",true).toString()).commit())throw new Failure("Could not reserve state change");}
        String verb=input.state.equals("closed")?"close":"reopen",type=input.kind.equals("issue")?"Issue":"Discussion",operation=verb+type,inputType=(input.state.equals("closed")?"Close":"Reopen")+type+"Input";
        JSONObject value=graphql("mutation($input:"+inputType+"!){"+operation+"(input:$input){"+input.kind+"{id number closed updatedAt}}}",new JSONObject().put("input",new JSONObject().put(input.kind+"Id",fresh.getString("id"))),epoch).getJSONObject(operation).getJSONObject(input.kind);
        if(!fresh.getString("id").equals(value.getString("id"))||NativeChatRequest.remoteId(value,"number")!=input.number||!(value.get("closed")instanceof Boolean)||value.getBoolean("closed")!=input.state.equals("closed")||!NativeChatRequest.timestamp(value.getString("updatedAt")))throw new Failure("GitHub did not confirm the state change; inspect the conversation before retrying");
        JSONObject response=new JSONObject().put("provider","github").put("repository",repo).put("kind",input.kind).put("number",input.number).put("state",input.state).put("updatedAt",value.getString("updatedAt")).put("url",threadUrl(repo,input.kind,input.number));synchronized(this){check(epoch);if(!reviewReceipts.edit().putString(key,new JSONObject().put("result",response).toString()).commit())throw new Failure("State changed but receipt could not be saved; refresh the conversation");}return response;
    }
    private JSONObject chatWrite(JSONObject request,int epoch)throws Exception {
        NativeChatRequest input=new NativeChatRequest(request);String repo=repository(request);authenticated(epoch);
        if(request.has("annotation")&&!request.getJSONObject("annotation").getJSONObject("anchor").optString("provider","github").equals("github"))throw new Failure("Annotation provider mismatch");
        JSONObject user=api("/user",epoch,1024*1024);String viewer=user.getString("login");long viewerId=NativeChatRequest.remoteId(user,"id");if(!viewer.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"))throw new Failure("Invalid account identity");
        if(!policyStatus(repo,epoch).getBoolean("allowed"))throw new Failure("Repository policy blocks chat messages");
        String key="chat_"+hash(viewerId+"|"+repo.toLowerCase(Locale.ROOT)+"|"+input.kind+"|"+input.number+"|"+input.mutationId),digest=hash(input.fingerprint(viewerId+":"+viewer.toLowerCase(Locale.ROOT)));
        String saved=reviewReceipts.getString(key,null);if(saved!=null){JSONObject prior=new JSONObject(saved);if(!digest.equals(prior.optString("digest")))throw new Failure("This chat mutation identifier was already used for another message");if(prior.has("result"))return prior.getJSONObject("result").put("duplicate",true);throw new Failure("The earlier chat write has an unconfirmed outcome; inspect GitHub before retrying");}
        JSONObject thread=reviewThread(new JSONObject().put("repository",repo).put("kind",input.kind).put("number",input.number),epoch),target=null;
        String targetId=input.operation.equals("reply")?input.replyTo:input.messageId;JSONArray comments=thread.getJSONArray("comments");for(int i=0;i<comments.length();i++){JSONObject row=comments.getJSONObject(i);if(row.getString("id").equals(targetId))target=row;}
        if(!input.operation.equals("create")&&target==null)throw new Failure("The message is not present in this verified thread; reload the conversation");
        if(input.operation.equals("edit")&&(!viewer.equalsIgnoreCase(target.optString("author"))||input.kind.equals("issue")&&viewerId!=target.optLong("authorId",0)||!input.expectedUpdatedAt.equals(target.optString("updatedAt"))||target.optBoolean("bodyTruncated")||target.optString("body").contains("kicad-review:")))throw new Failure("The message changed, is not yours, or contains a drawing annotation; reload before editing");
        String body=input.outgoingBody,parent="",discussionId="",commentNode="";
        if(input.kind.equals("issue")){
            JSONObject root=api("/repos/"+repo+"/issues/"+input.number,epoch,4*1024*1024);if(root.optInt("number")!=input.number||root.has("pull_request")||root.optBoolean("locked"))throw new Failure("This Issue cannot accept chat messages");
            if(input.operation.equals("reply"))body="> Reply to ["+(target.isNull("author")?"message":target.getString("author"))+"]("+target.getString("url")+")\n\n"+body;
            if(input.operation.equals("edit")){JSONObject fresh=api("/repos/"+repo+"/issues/comments/"+input.messageId,epoch,4*1024*1024);String expected="https://api.github.com/repos/"+repo+"/issues/"+input.number;
                if(!String.valueOf(NativeChatRequest.remoteId(fresh,"id")).equals(input.messageId)||!expected.equalsIgnoreCase(fresh.optString("issue_url"))||fresh.optJSONObject("user")==null||viewerId!=NativeChatRequest.remoteId(fresh.getJSONObject("user"),"id")||!viewer.equalsIgnoreCase(fresh.getJSONObject("user").optString("login"))||!input.expectedUpdatedAt.equals(fresh.optString("updated_at"))||fresh.optString("body").contains("kicad-review:"))throw new Failure("The message changed or belongs to another Issue");commentNode=nodeId(fresh.getString("node_id"));}
        }else{
            String[] names=repo.split("/");JSONObject discussion=graphql("query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){discussion(number:$number){id number locked}}}",new JSONObject().put("owner",names[0]).put("name",names[1]).put("number",input.number),epoch).getJSONObject("repository").getJSONObject("discussion");
            if(discussion.getInt("number")!=input.number||discussion.getBoolean("locked"))throw new Failure("Discussion is locked or its identity changed");discussionId=nodeId(discussion.getString("id"));if(!discussionId.equals(thread.getString("nodeId")))throw new Failure("Discussion identity changed before publication");
            if(input.operation.equals("reply")){parent=target.isNull("replyTo")?target.getString("id"):target.getString("replyTo");JSONObject root=null;for(int i=0;i<comments.length();i++){JSONObject row=comments.getJSONObject(i);if(parent.equals(row.getString("id")))root=row;}if(root==null)throw new Failure("Discussion reply root is unavailable");commentNode=nodeId(root.getString("nodeId"));}
            else if(input.operation.equals("edit")){if(!target.optBoolean("viewerCanUpdate")||!target.optBoolean("viewerDidAuthor"))throw new Failure("Discussion message edit permission is unavailable");commentNode=nodeId(target.getString("nodeId"));JSONObject fresh=graphql("query($id:ID!){node(id:$id){... on DiscussionComment{id databaseId updatedAt body author{login} viewerCanUpdate viewerDidAuthor discussion{id number}}}}",new JSONObject().put("id",commentNode),epoch).getJSONObject("node");if(!commentNode.equals(fresh.optString("id"))||!input.messageId.equals(String.valueOf(fresh.getLong("databaseId")))||!input.expectedUpdatedAt.equals(fresh.optString("updatedAt"))||!fresh.optBoolean("viewerCanUpdate")||!fresh.optBoolean("viewerDidAuthor")||fresh.optJSONObject("author")==null||!viewer.equalsIgnoreCase(fresh.getJSONObject("author").optString("login"))||!discussionId.equals(fresh.getJSONObject("discussion").optString("id"))||fresh.optString("body").contains("kicad-review:"))throw new Failure("Discussion message changed before editing");}
        }
        if(body.getBytes(StandardCharsets.UTF_8).length>65536)throw new Failure("Chat reply exceeds the provider body limit");
        synchronized(this){check(epoch);if(reviewReceipts.contains(key))throw new Failure("This chat operation is already in progress; inspect GitHub before retrying");claimWrite("publish");if(!reviewReceipts.edit().putString(key,new JSONObject().put("digest",digest).put("pending",true).toString()).commit())throw new Failure("Could not reserve chat publication");}
        JSONObject value;String messageId,updated,url=threadUrl(repo,input.kind,input.number);
        if(input.kind.equals("issue")){
            String path="/repos/"+repo+"/issues/"+input.number+"/comments";
            long id;if(input.operation.equals("edit")){value=graphql("mutation($input:UpdateIssueCommentInput!){updateIssueComment(input:$input){issueComment{id databaseId updatedAt}}}",new JSONObject().put("input",new JSONObject().put("id",commentNode).put("body",body)),epoch).getJSONObject("updateIssueComment").getJSONObject("issueComment");if(!commentNode.equals(value.optString("id")))throw new Failure("GitHub returned another comment identity");id=value.getLong("databaseId");updated=value.getString("updatedAt");}
            else{value=new JSONObject(networkJson(path,new JSONObject().put("body",body),epoch));id=value.getLong("id");updated=value.getString("updated_at");}
            if(id<=0||input.operation.equals("edit")&&!input.messageId.equals(String.valueOf(id)))throw new Failure("GitHub did not confirm the expected message");messageId=String.valueOf(id);url+="#issuecomment-"+messageId;
        }else{
            JSONObject variables=new JSONObject(),payload=new JSONObject().put("body",body);
            if(input.operation.equals("edit")){payload.put("commentId",commentNode);variables.put("input",payload);value=graphql("mutation($input:UpdateDiscussionCommentInput!){updateDiscussionComment(input:$input){comment{id databaseId updatedAt}}}",variables,epoch).getJSONObject("updateDiscussionComment").getJSONObject("comment");}
            else{payload.put("discussionId",discussionId);if(!parent.isEmpty())payload.put("replyToId",commentNode);variables.put("input",payload);value=graphql("mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id databaseId updatedAt}}}",variables,epoch).getJSONObject("addDiscussionComment").getJSONObject("comment");}
            nodeId(value.getString("id"));long id=value.getLong("databaseId");if(id<=0||input.operation.equals("edit")&&!input.messageId.equals(String.valueOf(id)))throw new Failure("GitHub did not confirm the expected Discussion message");messageId=String.valueOf(id);updated=value.getString("updatedAt");url+="#discussioncomment-"+messageId;
        }
        if(!NativeChatRequest.timestamp(updated))throw new Failure("GitHub returned an invalid chat timestamp");
        JSONObject result=new JSONObject().put("provider","github").put("kind",input.kind).put("number",input.number).put("messageId",messageId).put("url",url).put("updatedAt",updated).put("replyTo",input.operation.equals("reply")?(input.kind.equals("discussion")?parent:input.replyTo):JSONObject.NULL);
        synchronized(this){check(epoch);if(!reviewReceipts.edit().putString(key,new JSONObject().put("digest",digest).put("result",result).toString()).commit())throw new Failure("Message accepted but receipt could not be saved; inspect GitHub before retrying");}return result;
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
            claimWrite("publish");
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
        claimWrite("upload");
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
    private JSONObject forkRevision(JSONObject request,int epoch)throws Exception {
        NativeRevisionFork.validate(request,true);if(credential(epoch)==null)throw new Failure("Sign in to GitHub before creating a fork");
        ManagedPolicy.requireTransport(policyContext,true);claimWrite("publish");
        return NativeRevisionFork.create(request,true,"https://github.com",new NativeRevisionFork.Transport(){
            public void authorize()throws Exception {check(epoch);ManagedPolicy.requireTransport(policyContext,true);if(credential(epoch)==null)throw new Failure("GitHub session expired");}
            public JSONObject get(String path,boolean missing)throws Exception {try{return api(path,epoch,1024*1024);}catch(Missing error){if(missing)return null;throw error;}}
            public JSONObject post(String path,JSONObject body,int expected)throws Exception {return new JSONObject(networkBytes("https://api.github.com"+path,body.toString().getBytes(StandardCharsets.UTF_8),"application/json",credential(epoch),epoch,1024*1024,expected));}
        });
    }
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
        return networkBytes(address,body,contentType,bearer,epoch,limit,-1);
    }
    private String networkBytes(String address, byte[] body, String contentType, String bearer, int epoch, int limit,int expectedStatus) throws Exception {
        check(epoch);
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") || url.getPort() != -1 || url.getUserInfo() != null
                || (!url.getHost().equals("api.github.com") && !(url.getHost().equals("uploads.github.com") && bearer != null && body != null
                && url.getPath().equals("/user-attachments/assets")) && !(url.getHost().equals("github.com") && bearer == null && body != null
                && (url.getPath().equals("/login/device/code") || url.getPath().equals("/login/oauth/access_token"))))) throw new Failure("Unsupported GitHub endpoint");
        boolean providerWrite=body!=null&&!url.getHost().equals("github.com");
        if(providerWrite&&url.getPath().equals("/graphql")){
            String query=new JSONObject(new String(body,StandardCharsets.UTF_8)).optString("query",null);
            providerWrite=!EnterprisePolicy.readOnlyGraphql(query);
        }
        ManagedPolicy.requireTransport(policyContext,providerWrite);
        HttpsURLConnection connection = connections.open(url); NativeLoadOperation.track(connection);
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
                check(epoch);ManagedPolicy.requireTransport(policyContext,providerWrite);try (java.io.OutputStream stream = connection.getOutputStream()) { check(epoch);stream.write(bytes); }
            }
            int status = connection.getResponseCode();
            check(epoch);
            if (url.getHost().equals("api.github.com") && !url.getPath().equals("/graphql")) {
                synchronized (this) { check(epoch); coreRemaining = GitHubFailure.number(connection.getHeaderField("X-RateLimit-Remaining")); quotaAuthenticated = bearer != null; }
            }
            if (url.getHost().equals("api.github.com") && bearer != null && status >= 200 && status < 300) {
                String granted = connection.getHeaderField("X-OAuth-Scopes");
                if (granted != null) synchronized (this) { check(epoch); scopes = granted; scopesKnown = true; }
            }
            if (status == 401) {
                synchronized (this) { check(epoch); if (bearer != null) { authExpired = true; token = null; login = ""; scopes = ""; scopesKnown = false; clearDevice(); vault.clear(); } }
                throw new Failure("GitHub sign-in expired or was revoked; sign in again");
            }
            if (status == 404) throw new Missing();
            if (status == 403 || status == 429) {
                String message = "";
                try (InputStream errorStream = NativeLoadOperation.input(connection.getErrorStream())) {
                    if (errorStream != null) { byte[] bytes = new byte[4096]; int n = errorStream.read(bytes);
                        if (n > 0) message = new JSONObject(new String(bytes, 0, n, StandardCharsets.UTF_8)).optString("message"); }
                } catch (Exception ignored) { /* Headers remain authoritative; never expose remote response text. */ }
                if (status == 403 && url.getPath().equals("/notifications")
                        && GitHubFailure.number(connection.getHeaderField("X-RateLimit-Remaining")) != 0
                        && connection.getHeaderField("Retry-After") == null && connection.getHeaderField("X-GitHub-SSO") == null
                        && !message.toLowerCase(Locale.ROOT).contains("rate limit"))
                    throw new Failure("GitHub notifications access was denied. Reconnect your GitHub account to grant notifications access, or use a classic token with notifications or repo scope; fine-grained tokens do not support this endpoint.");
                throw new Failure(GitHubFailure.forbidden(status, bearer != null, connection.getHeaderField("X-RateLimit-Remaining"),
                        connection.getHeaderField("X-RateLimit-Reset"), connection.getHeaderField("Retry-After"),
                        connection.getHeaderField("X-GitHub-SSO"), message, System.currentTimeMillis()/1000));
            }
            if (status < 200 || status >= 300) throw new Failure("GitHub request failed (HTTP " + status + ")");
            if(expectedStatus>0&&status!=expectedStatus)throw new Failure("GitHub did not confirm creation of a new resource");
            if (connection.getContentLengthLong() > limit) throw new Failure("GitHub response exceeds import limits");
            try (InputStream stream = NativeLoadOperation.input(connection.getInputStream()); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
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
        } finally { NativeLoadOperation.untrack(connection); connection.disconnect(); }
    }
}
