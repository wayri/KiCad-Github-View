package dev.kicadvizdiff.android;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import android.net.Uri;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/** Native GitLab transport: credentials remain outside the renderer and redirects are forbidden. */
final class GitLabClient {
    static final class Failure extends IOException { final int status; Failure(String message) { this(message,0); } Failure(String message,int status) { super(message);this.status=status; } }
    private static final int FILE_LIMIT=32*1024*1024, TOTAL_LIMIT=96*1024*1024;
    private static final class DownloadRequired extends IOException {}
    interface ConnectionFactory { HttpsURLConnection open(URL url) throws IOException; }
    private final ConnectionFactory connections;
    private DiskProjectStore diskStore;
    synchronized void setDiskProjectStore(DiskProjectStore store) { diskStore=store; }
    private final Context context;
    private final android.content.SharedPreferences journal;
    private final ProviderWriteGuard writeGuard;
    private int generation;
    private final Map<String,String> tokens=new HashMap<>();
    private final Map<String,JSONObject> refreshRecords=new HashMap<>();
    private final Map<String,GitHubVault> vaults=new HashMap<>();
    private boolean authExpired;
    private String oauthHost,oauthClient,oauthState,oauthVerifier;
    private long oauthExpiry;
    GitLabClient(Context context) { this(context,url->(HttpsURLConnection)url.openConnection()); }
    GitLabClient(Context context,ConnectionFactory connections) { this.context=context.getApplicationContext();this.connections=connections;writeGuard=new ProviderWriteGuard(context);journal=context.getSharedPreferences("gitlab_publication_journal",Context.MODE_PRIVATE); }
    synchronized int generation() { return generation; }
    synchronized boolean current(int epoch) { return epoch==generation; }
    synchronized boolean authExpired() { return authExpired; }
    synchronized void cancelRequests() { generation++;oauthState=null;oauthVerifier=null; }
    synchronized void reset(String host) throws Exception {
        host=validateHost(host); generation++;oauthState=null;oauthVerifier=null; tokens.remove(host);refreshRecords.remove(host); vault(host).clear(); authExpired=false;
    }
    private void claimWrite(String category) throws Failure {
        try { writeGuard.claim(category); }
        catch (IOException error) { throw new Failure(error.getMessage()); }
    }
    private void check(int epoch) throws IOException {
        NativeLoadOperation.checkCurrent();
        if (!current(epoch)||Thread.currentThread().isInterrupted()) throw new Failure("GitLab request cancelled");
    }
    static String validateHost(String host) throws Exception {
        if(host==null||host.length()>300) throw new Failure("Invalid GitLab HTTPS origin");
        URI uri=new URI(host);
        if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getHost().endsWith(".")||uri.getUserInfo()!=null
            ||(uri.getPort()!=-1&&uri.getPort()!=443)||uri.getQuery()!=null||uri.getFragment()!=null
            ||!(uri.getPath().isEmpty()||uri.getPath().equals("/"))) throw new Failure("Use an exact GitLab HTTPS origin without a path or credentials");
        return "https://"+uri.getHost().toLowerCase(Locale.ROOT);
    }
    private synchronized GitHubVault vault(String host) throws Exception {
        GitHubVault result=vaults.get(host);
        if(result==null) { result=new GitHubVault(context,"gitlab_"+hash(host));vaults.put(host,result); }
        return result;
    }
    private String credential(String host,int epoch) throws Exception {
        JSONObject record;
        synchronized(this) {
            check(epoch);
            if(!tokens.containsKey(host)) {
                String saved=vault(host).read();
                if(saved!=null&&saved.startsWith("{")) {try{JSONObject parsed=new JSONObject(saved);tokens.put(host,parsed.getString("accessToken"));refreshRecords.put(host,parsed);}catch(Exception ignored){vault(host).clear();tokens.put(host,null);}}
                else tokens.put(host,saved);
            }
            record=refreshRecords.get(host);
            if(record==null||record.optLong("expiresAt",0)>System.currentTimeMillis()+60000)return tokens.get(host);
        }
        String client=record.getString("clientId"),refresh=record.getString("refreshToken");
        byte[] body=("client_id="+encode(client)+"&refresh_token="+encode(refresh)+"&grant_type=refresh_token&redirect_uri="+encode("kicadvizdiff://gitlab-oauth")).getBytes(StandardCharsets.UTF_8);
        // Refresh tokens may rotate server-side: Stop must finish persisting that rotation,
        // then discard the stopped read, rather than leaving the account unusable.
        try(NativeLoadOperation.AuthenticationScope authentication=NativeLoadOperation.preserveAuthentication()) {
            JSONObject refreshed=new JSONObject(network(host,"/oauth/token","POST",body,null,epoch,65536,"application/x-www-form-urlencoded"));
            saveOAuth(host,client,refreshed,epoch);
        }
        synchronized(this){check(epoch);return tokens.get(host);}
    }
    private synchronized void saveOAuth(String host,String client,JSONObject result,int epoch)throws Exception {
        check(epoch);String access=result.getString("access_token"),refresh=result.getString("refresh_token");
        if(access.length()<20||access.length()>1000||!access.matches("[\\x21-\\x7e]+")||refresh.length()<20||refresh.length()>1000||!refresh.matches("[\\x21-\\x7e]+"))throw new Failure("Invalid GitLab OAuth token response");
        int lifetime=result.getInt("expires_in");if(lifetime<=0||lifetime>86400)throw new Failure("Invalid GitLab OAuth expiry");
        JSONObject record=new JSONObject().put("accessToken",access).put("refreshToken",refresh).put("clientId",client).put("expiresAt",System.currentTimeMillis()+lifetime*1000L);
        vault(host).write(record.toString());tokens.put(host,access);refreshRecords.put(host,record);authExpired=false;
    }
    JSONObject connectToken(String host,String candidate,int epoch) throws Exception {
        host=validateHost(host);
        if(candidate==null||candidate.length()<20||candidate.length()>1000||!candidate.matches("[\\x21-\\x7e]+")) throw new Failure("Enter a valid GitLab token without spaces");
        JSONObject user=new JSONObject(network(host,"/user","GET",null,candidate,epoch,1024*1024));
        synchronized(this) { check(epoch);vault(host).write(candidate);tokens.put(host,candidate);refreshRecords.remove(host);authExpired=false; }
        return new JSONObject().put("connected",true).put("login",user.getString("username")).put("host",host);
    }
    synchronized JSONObject startOAuth(String host,String clientId,int epoch) throws Exception {
        check(epoch);host=validateHost(host);
        if(!clientId.matches("[A-Za-z0-9_-]{8,200}"))throw new Failure("Enter the registered GitLab public application ID");
        byte[] random=new byte[32];new SecureRandom().nextBytes(random);oauthState=Base64.encodeToString(random,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
        new SecureRandom().nextBytes(random);oauthVerifier=Base64.encodeToString(random,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
        oauthHost=host;oauthClient=clientId;oauthExpiry=SystemClock.elapsedRealtime()+600000;
        String challenge=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(oauthVerifier.getBytes(StandardCharsets.US_ASCII)),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
        return new JSONObject().put("authorizationUri",host+"/oauth/authorize?client_id="+encode(clientId)+"&redirect_uri="+encode("kicadvizdiff://gitlab-oauth")+"&response_type=code&scope=api&state="+oauthState+"&code_challenge="+challenge+"&code_challenge_method=S256");
    }
    JSONObject completeOAuth(Uri uri,int epoch) throws Exception {
        String host,client,verifier,code;
        synchronized(this) {
            check(epoch);
            if(!"kicadvizdiff".equals(uri.getScheme())||!"gitlab-oauth".equals(uri.getHost())||!(uri.getPath()==null||uri.getPath().isEmpty())||uri.getFragment()!=null||uri.getUserInfo()!=null
                ||oauthState==null||SystemClock.elapsedRealtime()>oauthExpiry||!oauthState.equals(uri.getQueryParameter("state")))throw new Failure("GitLab sign-in callback is invalid or expired");
            code=uri.getQueryParameter("code");if(code==null||!code.matches("[A-Za-z0-9_-]{8,2048}"))throw new Failure("GitLab authorization was cancelled");
            host=oauthHost;client=oauthClient;verifier=oauthVerifier;oauthState=null;oauthVerifier=null;
        }
        byte[] body=("client_id="+encode(client)+"&code="+encode(code)+"&grant_type=authorization_code&redirect_uri="+encode("kicadvizdiff://gitlab-oauth")+"&code_verifier="+encode(verifier)).getBytes(StandardCharsets.UTF_8);
        JSONObject result=new JSONObject(network(host,"/oauth/token","POST",body,null,epoch,65536,"application/x-www-form-urlencoded"));
        JSONObject connected=connectToken(host,result.getString("access_token"),epoch);saveOAuth(host,client,result,epoch);return connected;
    }
    static boolean cancellableRead(String action) {
        return java.util.Arrays.asList("repositories", "import", "revision-import", "revision-resolve", "revision-branches", "revision-commits", "repository-tree", "repository-history", "repository-branches", "policy", "threads", "thread", "contributors").contains(action);
    }
    JSONObject handleLoad(JSONObject request, int epoch, NativeLoadOperation operation) throws Exception {
        if (!cancellableRead(request.optString("action"))) throw new IllegalArgumentException("Only project reads can be stopped");
        try (NativeLoadOperation.Scope scope = operation.enter()) { return handle(request, epoch); }
    }
    JSONObject handle(JSONObject request,int epoch) throws Exception {
        check(epoch); String host=validateHost(request.optString("host","https://gitlab.com"));
        switch(request.getString("action")) {
            case "oauth-start":return startOAuth(host,request.getString("clientId"),epoch);
            case "policy":return policy(host,request,epoch);
            case "auth-status": {
                String token=credential(host,epoch),login="";
                if(token!=null) login=json(host,"/user",epoch).getString("username");
                return new JSONObject().put("connected",token!=null).put("login",login).put("host",host);
            }
            case "sign-out":return new JSONObject().put("connected",false).put("host",host);
            case "repositories": {
                int page=page(request); boolean connected=credential(host,epoch)!=null;
                JSONArray items=array(host,"/projects?simple=true&per_page=100&order_by=last_activity_at&sort=desc&page="+page+(connected?"&membership=true":"&visibility=public"),epoch);
                JSONArray repositories=new JSONArray();
                for(int i=0;i<items.length();i++) { JSONObject item=items.getJSONObject(i);repositories.put(new JSONObject().put("fullName",item.getString("path_with_namespace")).put("private",!item.optString("visibility").equals("public")).put("defaultBranch",item.optString("default_branch",""))); }
                return new JSONObject().put("repositories",repositories).put("hasMore",items.length()==100);
            }
            case "import":case "revision-import":return importProject(host,request,epoch);
            case "revision-resolve":return revisionResolve(host,request,epoch);
            case "repository-tree":return readRepositoryTree(host,request,epoch);
            case "repository-history":return readRepositoryHistory(host,request,epoch);
            case "repository-branches":return repositoryBranches(host,request,epoch);
            case "revision-branches": {
                String root=project(request);validateRevisionRequest(request);JSONArray source=array(host,root+"/repository/branches?per_page=100&page=1",epoch),branches=new JSONArray(),warnings=new JSONArray();
                for(int i=0;i<source.length();i++){JSONObject branch=source.getJSONObject(i);String name=branch.getString("name");validRef(name);branches.put(new JSONObject().put("name",name).put("sha",sha(branch.getJSONObject("commit").getString("id"))));}
                if(source.length()==100)warnings.put("At most 100 branches shown; enter another branch manually");return new JSONObject().put("repository",repository(request)).put("branches",branches).put("warnings",warnings);
            }
            case "revision-commits": {
                JSONObject snapshot=revisionResolve(host,request,epoch);String file=request.getString("file"),snapshotRef=snapshot.getString("sha");
                JSONArray source=array(host,project(request)+"/repository/commits?ref_name="+snapshotRef+"&path="+encode(file)+"&per_page=50&page=1",epoch),commits=new JSONArray(),warnings=new JSONArray();
                if(source.length()>50)throw new Failure("Invalid GitLab commit page size");
                for(int i=0;i<source.length();i++){JSONObject commit=source.getJSONObject(i);commits.put(new JSONObject().put("sha",sha(commit.getString("id"))).put("message",clean(commit.optString("title"))).put("author",clean(commit.optString("author_name"))).put("date",clean(commit.optString("authored_date"))));}
                if(source.length()==50)warnings.put("At most 50 commits shown; enter an older commit manually");return new JSONObject().put("repository",repository(request)).put("file",file).put("snapshotRef",snapshotRef).put("commits",commits).put("warnings",warnings);
            }
            case "threads": {
                String root=project(request);String state=request.optString("state","all");
                if(!Arrays.asList("all","opened","closed").contains(state)) throw new Failure("Invalid issue state");
                JSONArray values=array(host,root+"/issues?scope=all&state="+state+"&per_page=100&page="+page(request),epoch);
                JSONArray threads=new JSONArray();for(int i=0;i<values.length();i++) threads.put(issue(values.getJSONObject(i)));
                return new JSONObject().put("threads",threads).put("hasMore",values.length()==100);
            }
            case "thread": return readThread(host,request,epoch);
            case "contributors": {
                JSONArray users=new JSONArray(),warnings=new JSONArray();String query=request.optString("query","").toLowerCase(Locale.ROOT);if(query.length()>100||controls(query))throw new Failure("Invalid people query");
                if(credential(host,epoch)==null)return new JSONObject().put("users",users).put("warnings",warnings.put("Sign in to discover GitLab project members"));
                JSONArray members=array(host,project(request)+"/members/all?per_page=100&page="+page(request),epoch);
                for(int i=0;i<members.length();i++){JSONObject member=members.getJSONObject(i);String login=member.optString("username"),name=member.optString("name");if(login.matches("[A-Za-z0-9_.-]{1,100}")&&(query.isEmpty()||login.toLowerCase(Locale.ROOT).contains(query)||name.toLowerCase(Locale.ROOT).contains(query)))users.put(new JSONObject().put("login",login).put("name",name).put("source","member"));}
                if(members.length()==100)warnings.put("More project members are available on the next page");return new JSONObject().put("users",users).put("warnings",warnings);
            }
            case "publish":return publish(host,request,epoch);
            case "upload":return upload(host,request,epoch);
            default:throw new Failure("Unsupported GitLab request");
        }
    }
    private JSONObject readThread(String host,JSONObject request,int epoch)throws Exception {
        String repository=repository(request),kind=request.optString("kind","issue");int number=number(request);
        if(!Arrays.asList("issue","discussion").contains(kind))throw new Failure("Invalid GitLab thread kind");
        long deadline=SystemClock.elapsedRealtime()+90000;
        JSONObject project=json(host,project(request),epoch);long projectId=threadId(project,"id");
        if(!repository.equals(project.optString("path_with_namespace")))throw new Failure("GitLab returned another project identity");
        String endpoint="/projects/"+projectId+"/issues/"+number,url=host+"/"+repository+"/-/issues/"+number;
        JSONObject value=json(host,endpoint,epoch);
        if(value.optInt("iid")!=number||value.optDouble("iid")!=number||threadId(value,"project_id")!=projectId||!Arrays.asList("opened","closed").contains(value.optString("state"))||!(value.opt("title") instanceof String))throw new Failure("GitLab returned an invalid Issue identity");
        ThreadText text=new ThreadText();JSONObject result=threadRecord(value,true,null,null,url,text);
        result.put("provider","gitlab").put("host",host).put("repository",repository).put("kind","issue").put("number",number).put("title",value.getString("title").substring(0,Math.min(1024,value.getString("title").length()))).put("state",value.getString("state").equals("opened")?"open":"closed");
        JSONArray comments=new JSONArray();Set<String> seen=new HashSet<>();
        for(int page=1;page<=8&&!text.stopped;page++) {
            check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("GitLab thread read timed out");
            JSONArray groups=array(host,endpoint+"/discussions?per_page=100&page="+page,epoch);
            for(int i=0;i<groups.length();i++) {
                JSONObject group=groups.optJSONObject(i);JSONArray notes=group==null?null:group.optJSONArray("notes");
                if(group==null||!(group.opt("individual_note") instanceof Boolean)||!group.optString("id").matches("[A-Za-z0-9_-]{1,200}")||notes==null||notes.length()>1000){text.warn("Some discussion groups were invalid and omitted.");continue;}
                String parent=null;
                for(int n=0;n<notes.length();n++) {
                    JSONObject note=notes.optJSONObject(n);if(note!=null&&note.optBoolean("system"))continue;
                    if(comments.length()>=200||text.stopped){text.stopped=true;break;}
                    JSONObject entry=threadRecord(note,false,group.getBoolean("individual_note")?null:parent,group.getBoolean("individual_note")?null:group.getString("id"),url,text);
                    if(entry!=null){String id=entry.getString("id");if(parent==null)parent=id;if(seen.add(id))comments.put(entry);}
                }
                if(text.stopped)break;
            }
            if(groups.length()<100)break;if(page==8)text.stopped=true;
        }
        if(text.stopped)text.warn("Thread readback was truncated at 200 comments, 10 requests or the text limit. Open GitLab for the complete conversation.");
        check(epoch);return result.put("comments",comments).put("warnings",text.warnings);
    }
    private static long threadId(JSONObject value,String key)throws Exception {
        Object raw=value==null?null:value.opt(key);long id=raw instanceof Number?((Number)raw).longValue():0;
        if(id<1||id>9007199254740991L||((Number)raw).doubleValue()!=id)throw new Failure("GitLab returned an invalid thread identifier");return id;
    }
    private static boolean threadTime(String value) {
        if(!value.matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,9})?Z"))return false;
        try{java.time.Instant.parse(value);return true;}catch(Exception invalid){return false;}
    }
    private static final class ThreadText {
        int bytes;boolean stopped;final JSONArray warnings=new JSONArray();
        void warn(String value){for(int i=0;i<warnings.length();i++)if(value.equals(warnings.optString(i)))return;warnings.put(value);}
        String take(Object value)throws Exception {
            if(value==JSONObject.NULL)return "";if(!(value instanceof String))throw new Failure("GitLab returned invalid thread text");
            byte[] raw=((String)value).getBytes(StandardCharsets.UTF_8);int limit=Math.min(raw.length,Math.min(65536,Math.max(0,1024*1024-bytes)));
            if(raw.length>limit)warn("Thread text was truncated at 64 KiB per entry or 1 MiB total.");
            String result;while(true){try{result=StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(raw,0,limit)).toString();break;}catch(CharacterCodingException partial){limit--;if(limit<0)throw partial;}}
            bytes+=limit;if(bytes>=1024*1024-3)stopped=true;return result;
        }
    }
    private static JSONObject threadRecord(JSONObject value,boolean root,String replyTo,String discussionId,String url,ThreadText text)throws Exception {
        try {
            long id=threadId(value,"id");JSONObject author=value.optJSONObject("author");Object rawAuthor=value.opt("author");
            String created=value.optString("created_at"),updated=value.optString("updated_at");
            if(!threadTime(created)||!threadTime(updated)||rawAuthor!=JSONObject.NULL&&(author==null||!author.optString("username").matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,99}")))throw new Failure("GitLab returned invalid thread provenance");
            JSONObject entry=new JSONObject().put("id",String.valueOf(id)).put("author",author==null?JSONObject.NULL:author.getString("username")).put("createdAt",created).put("updatedAt",updated).put("body",text.take(value.opt(root?"description":"body"))).put("url",root?url:url+"#note_"+id).put("replyTo",replyTo==null?JSONObject.NULL:replyTo);
            if(discussionId!=null)entry.put("discussionId",discussionId);return entry;
        }catch(Exception invalid){if(root)throw new Failure("GitLab returned invalid thread provenance");text.warn("Some thread comments had invalid provenance and were omitted.");return null;}
    }
    private static JSONObject issue(JSONObject value) throws Exception {
        JSONObject author=value.optJSONObject("author");return new JSONObject().put("kind","issue").put("id",String.valueOf(value.getLong("id"))).put("number",value.getInt("iid")).put("title",value.optString("title")).put("body",value.optString("description")).put("state",value.optString("state")).put("url",value.optString("web_url")).put("createdAt",value.optString("created_at")).put("updatedAt",value.optString("updated_at")).put("author",author==null?"":author.optString("username"));
    }
    private JSONObject optional(String host,String path,int epoch)throws Exception {
        try{return json(host,path,epoch);}catch(Failure e){if(e.status==404)return null;throw e;}
    }
    private JSONObject policy(String host,JSONObject request,int epoch)throws Exception {
        if(credential(host,epoch)==null)return new JSONObject().put("allowed",false).put("reason","Sign in before posting");
        String repository=repository(request),root=project(request);JSONObject metadata=json(host,root,epoch);
        if(!repository.equals(metadata.getString("path_with_namespace"))||metadata.optLong("id",0)<=0)throw new Failure("GitLab project policy identity could not be verified");
        root="/projects/"+metadata.getLong("id");String ref=metadata.optString("default_branch","");if(ref.isEmpty()||ref.length()>255||controls(ref))throw new Failure("GitLab project policy revision unavailable");
        JSONObject user=json(host,"/user",epoch);String login=user.getString("username");long id=user.getLong("id");if(id<=0||!login.matches("[A-Za-z0-9_.-]{1,100}"))throw new Failure("GitLab account identity could not be verified");
        JSONObject file=optional(host,root+"/repository/files/.kicad-review-policy.json?ref="+encode(ref),epoch);String mode="all";JSONArray allowlist=new JSONArray();
        if(file==null) {
            JSONArray listing=array(host,root+"/repository/tree?ref="+encode(ref)+"&per_page=100&page=1",epoch);
            if(listing.length()>=100)throw new Failure("Repository policy absence could not be verified");
            for(int i=0;i<listing.length();i++){JSONObject entry=listing.getJSONObject(i);if(!entry.getString("name").equals(entry.getString("path"))||entry.getString("name").equals(".kicad-review-policy.json"))throw new Failure("Repository policy absence could not be verified");}
        } else {
            if(!file.optString("file_path").equals(".kicad-review-policy.json")||!file.optString("encoding").equals("base64")||file.getString("content").length()>48*1024)throw new Failure("Malformed repository policy");
            JSONObject value=new JSONObject(utf8(Base64.decode(file.getString("content"),Base64.DEFAULT)));JSONObject commenting=value.getJSONObject("commenting");
            if(value.optInt("schemaVersion")!=1||value.getDouble("schemaVersion")!=1||value.length()!=2||!value.has("schemaVersion")||!value.has("commenting"))throw new Failure("Malformed repository policy");
            Iterator<String> keys=commenting.keys();while(keys.hasNext()){String key=keys.next();if(!key.equals("mode")&&!key.equals("allowlist"))throw new Failure("Malformed repository policy");}
            mode=commenting.getString("mode");if(!Arrays.asList("all","allowlist","contributors","collaborators","maintainers").contains(mode))throw new Failure("Malformed repository policy");
            if(commenting.has("allowlist"))allowlist=commenting.getJSONArray("allowlist");if(allowlist.length()>100)throw new Failure("Malformed repository policy");
            for(int i=0;i<allowlist.length();i++)if(!allowlist.getString(i).matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"))throw new Failure("Malformed repository policy");
        }
        boolean allowed=mode.equals("all");for(int i=0;i<allowlist.length();i++)if(login.equalsIgnoreCase(allowlist.getString(i)))allowed=true;
        if(!allowed) {
            JSONObject member=optional(host,root+"/members/all/"+id,epoch);
            if(member!=null) {if(member.getLong("id")!=id)throw new Failure("GitLab membership could not be verified");int access=member.getInt("access_level");allowed=access>=50||mode.equals("collaborators")&&access>=10||mode.equals("maintainers")&&access>=40;}
        }
        return new JSONObject().put("projectId",metadata.getLong("id")).put("allowed",allowed).put("mode",mode).put("reason",allowed?"Repository policy allows this account":mode.equals("contributors")?"Contributor identity cannot be securely verified; use an account allowlist or collaborators policy":"Repository policy denies this account");
    }
    private JSONObject publish(String host,JSONObject request,int epoch) throws Exception {
        if(credential(host,epoch)==null) throw new Failure("Sign in to publish to GitLab");
        JSONObject publicationPolicy=policy(host,request,epoch);if(!publicationPolicy.getBoolean("allowed"))throw new Failure("Repository policy blocks publication");
        String root="/projects/"+publicationPolicy.getLong("projectId"), destination=request.optString("destination","new-issue"),body=request.getString("body");
        if(body.isEmpty()||body.getBytes(StandardCharsets.UTF_8).length>65536||body.indexOf('\0')>=0) throw new Failure("Comment text is empty or too long");
        String operation=request.getString("operationId");if(!operation.matches("[a-fA-F0-9]{32,64}"))throw new Failure("Invalid publication operation identifier");
        String journalKey="publish_"+hash(host+"/"+repository(request)+"/"+destination+"/"+request.optInt("number",0)+"/"+operation);
        String marker="<!-- kicad-android-operation:"+operation.toLowerCase(Locale.ROOT)+" -->";body+="\n\n"+marker;
        String search=destination.equals("new-issue")?root+"/issues?scope=all&state=all&per_page=100&page=":root+"/issues/"+number(request)+"/notes?per_page=100&page=";
        long publishingUser=json(host,"/user",epoch).getLong("id");
        boolean complete=false;
        for(int page=1;page<=100;page++) {
            JSONArray items=array(host,search+page,epoch);
            for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);String existing=item.optString(destination.equals("new-issue")?"description":"body");if(existing.contains(marker)&&item.optJSONObject("author")!=null&&item.getJSONObject("author").optLong("id",0)==publishingUser) {int issue=destination.equals("new-issue")?item.getInt("iid"):number(request);return new JSONObject().put("number",issue).put("url",host+"/"+repository(request)+"/-/issues/"+issue).put("recovered",true);}}
            if(items.length()<100){complete=true;break;}
        }
        if(!complete)throw new Failure("Publication recovery check is incomplete; no duplicate post was sent");
        if(journal.contains(journalKey))throw new Failure("Previous publication has an unconfirmed outcome; inspect GitLab before posting again");
        JSONObject payload=new JSONObject();String path;
        if(destination.equals("new-issue")) {
            String title=request.optString("title","").trim();if(title.isEmpty()||title.length()>255||controls(title)) throw new Failure("Enter an issue title (up to 255 characters)");
            path=root+"/issues";payload.put("title",title).put("description",body);
        } else if(destination.equals("issue")||destination.equals("discussion")) {
            path=root+"/issues/"+number(request)+(destination.equals("discussion")?"/discussions":"/notes");payload.put("body",body);
        } else throw new Failure("Choose a new issue or an existing issue/discussion");
        claimWrite("publish");
        if(!journal.edit().putBoolean(journalKey,true).commit())throw new Failure("Cannot record publication recovery status");
        JSONObject result=new JSONObject(network(host,path,"POST",payload.toString().getBytes(StandardCharsets.UTF_8),credential(host,epoch),epoch,4*1024*1024));
        int issue=destination.equals("new-issue")?result.getInt("iid"):number(request);
        long note=0; if(destination.equals("discussion")) note=result.getJSONArray("notes").getJSONObject(0).getLong("id");else if(destination.equals("issue"))note=result.getLong("id");
        return new JSONObject().put("number",issue).put("noteId",note).put("url",host+"/"+repository(request)+"/-/issues/"+issue+(note==0?"":"#note_"+note));
    }
    private JSONObject upload(String host,JSONObject request,int epoch) throws Exception {
        JSONObject uploadPolicy=policy(host,request,epoch);if(!uploadPolicy.getBoolean("allowed"))throw new Failure("Repository policy blocks screenshot upload");
        String root="/projects/"+uploadPolicy.getLong("projectId"),bearer=credential(host,epoch);if(bearer==null) throw new Failure("Sign in to upload a screenshot");
        JSONObject metadata=json(host,root,epoch);
        if(!metadata.optString("visibility").equals("public")&&!metadata.optBoolean("enforce_auth_checks_on_uploads",false)) throw new Failure("Enable GitLab 'Require authentication to view media files' before uploading private screenshots");
        JSONObject capture=request.getJSONObject("capture");String data=capture.getString("dataUrl");if(!data.startsWith("data:image/png;base64,"))throw new Failure("Invalid screenshot PNG");data=data.substring(22);if(data.length()>12*1024*1024)throw new Failure("Screenshot exceeds 8 MiB");
        byte[] bytes=Base64.decode(data,Base64.DEFAULT);if(bytes.length<8||bytes.length>8*1024*1024||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71||bytes[4]!=13||bytes[5]!=10||bytes[6]!=26||bytes[7]!=10)throw new Failure("Only PNG screenshots up to 8 MiB are accepted");
        if(bytes.length<33||bytes[12]!='I'||bytes[13]!='H'||bytes[14]!='D'||bytes[15]!='R')throw new Failure("Invalid PNG header");
        ByteBuffer header=ByteBuffer.wrap(bytes);int width=header.getInt(16),height=header.getInt(20);
        if(width<1||height<1||width>4096||height>4096||width!=capture.getInt("width")||height!=capture.getInt("height"))throw new Failure("PNG dimensions do not match capture");
        String imageHash=hashBytes(bytes),uploadKey="upload_"+hash(host+"/"+repository(request)+"/"+imageHash);
        String savedUpload=journal.getString(uploadKey,null);if(savedUpload!=null){if(savedUpload.equals("pending"))throw new Failure("Previous screenshot upload has an unconfirmed outcome; inspect GitLab uploads before retrying");return new JSONObject(savedUpload);}
        String filename="kicad-review-"+imageHash.substring(0,20)+".png";
        String boundary="KiCadAndroid"+UUID.randomUUID().toString().replace("-","");ByteArrayOutputStream form=new ByteArrayOutputStream();
        form.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\""+filename+"\"\r\nContent-Type: image/png\r\n\r\n").getBytes(StandardCharsets.US_ASCII));form.write(bytes);form.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.US_ASCII));
        claimWrite("upload");
        if(!journal.edit().putString(uploadKey,"pending").commit())throw new Failure("Cannot record screenshot recovery status");
        JSONObject uploaded=new JSONObject(network(host,root+"/uploads","POST",form.toByteArray(),bearer,epoch,1024*1024,"multipart/form-data; boundary="+boundary));
        String url=uploaded.getString("url");if(!url.matches("/uploads/[a-fA-F0-9]{32}/"+filename.replace(".","\\.")))throw new Failure("Unexpected GitLab upload location");
        JSONObject attachment=new JSONObject().put("url",host+"/"+repository(request)+url).put("width",width).put("height",height).put("mime","image/png").put("provider","gitlab").put("host",host).put("repository",repository(request)).put("projectId",metadata.getLong("id"));
        if(!journal.edit().putString(uploadKey,attachment.toString()).commit())throw new Failure("Screenshot uploaded but recovery metadata could not be saved; inspect GitLab uploads");return attachment;
    }
    private static void validRef(String ref)throws Exception {if(ref==null||ref.isEmpty()||ref.length()>255||controls(ref))throw new Failure("Invalid branch or commit");}
    private static void validateRevisionRequest(JSONObject request)throws Exception {repository(request);validRef(request.getString("ref"));safePath(request.getString("file"));}
    private static String clean(String value) {String result=value.replaceAll("[\\p{Cntrl}]"," ");return result.length()>300?result.substring(0,300):result;}
    private JSONObject revisionResolve(String host,JSONObject request,int epoch)throws Exception {
        validateRevisionRequest(request);String ref=request.getString("ref"),commit=sha(json(host,project(request)+"/repository/commits/"+encode(ref),epoch).getString("id"));return new JSONObject().put("repository",repository(request)).put("ref",ref).put("sha",commit);
    }
    private static int metadataPage(JSONObject request,String key,int fallback,int maximum)throws Exception {
        if(!request.has(key))return fallback;Object value=request.get(key);int number=request.getInt(key);
        if(!(value instanceof Number)||request.getDouble(key)!=number||number<1||number>maximum)throw new Failure("Invalid "+key);return number;
    }
    private void repositoryCheck(int epoch,long deadline)throws Exception {check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository metadata request timed out");}
    private JSONObject repositorySnapshot(String host,JSONObject request,int epoch,long deadline)throws Exception {
        String repository=repository(request),root=project(request),ref=request.optString("ref",""),pinned=request.optString("sha","");
        if(ref.length()>255||controls(ref))throw new Failure("Invalid branch or commit");if(!pinned.isEmpty())pinned=sha(pinned);
        if(ref.isEmpty())ref=pinned.isEmpty()?json(host,root,epoch).optString("default_branch",""):pinned;validRef(ref);
        if(request.optInt("page",1)>1&&pinned.isEmpty()&&!ref.matches("[a-fA-F0-9]{40}"))throw new Failure("Use the returned commit SHA when loading another repository page");
        repositoryCheck(epoch,deadline);String identity=sha(json(host,root+"/repository/commits/"+encode(pinned.isEmpty()?ref:pinned),epoch).getString("id"));
        if(!pinned.isEmpty()&&!pinned.equals(identity)||ref.matches("[a-fA-F0-9]{40}")&&!ref.equalsIgnoreCase(identity))throw new Failure("Repository snapshot identity mismatch");
        repositoryCheck(epoch,deadline);return new JSONObject().put("repository",repository).put("ref",ref).put("sha",identity);
    }
    private JSONObject readRepositoryTree(String host,JSONObject request,int epoch)throws Exception {
        int page=metadataPage(request,"page",1,1000),perPage=metadataPage(request,"perPage",100,100);long deadline=SystemClock.elapsedRealtime()+90000;
        boolean direct=request.has("directory");if(direct&&!(request.get("directory") instanceof String))throw new Failure("Invalid directory path");String directory=request.optString("directory","");if(!directory.isEmpty())safePath(directory);if(directory.split("/",-1).length>32)throw new Failure("Directory nesting exceeds metadata limit");
        JSONObject snapshot=repositorySnapshot(host,request,epoch,deadline);String identity=snapshot.getString("sha");
        String endpoint=project(request)+"/repository/tree?ref="+identity+"&recursive="+(!direct)+"&per_page="+perPage+"&page="+page+(directory.isEmpty()?"":"&path="+encode(directory));
        JSONArray source=array(host,endpoint,epoch),entries=new JSONArray(),warnings=new JSONArray();boolean omitted=false;
        if(source.length()>perPage)throw new Failure("Invalid repository tree page size");
        for(int i=0;i<source.length();i++){
            repositoryCheck(epoch,deadline);try{
                JSONObject entry=GitHubClient.treeEntry(source.getJSONObject(i),"",false);String path=entry.getString("path");
                if(direct){String prefix=directory.isEmpty()?"":directory+"/";if(!path.startsWith(prefix)||path.substring(prefix.length()).isEmpty()||path.substring(prefix.length()).indexOf('/')>=0)throw new Failure("Directory entry is outside the pinned folder");}
                entries.put(entry);
            }catch(Exception invalid){omitted=true;}
        }
        boolean more=source.length()==perPage&&page<1000,truncated=omitted||source.length()==perPage&&page==1000;
        if(omitted)warnings.put("Some unsafe or unsupported repository entries were omitted.");if(more)warnings.put("More repository entries may be available; load the next page.");if(page==1000&&source.length()==perPage)warnings.put("Repository tree reached the 1000-page limit.");
        repositoryCheck(epoch,deadline);return new JSONObject().put("provider","gitlab").put("host",host).put("repository",snapshot.getString("repository")).put("ref",snapshot.getString("ref")).put("sha",identity).put("directory",directory).put("recursive",!direct).put("entries",entries).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
    }
    private JSONObject readRepositoryHistory(String host,JSONObject request,int epoch)throws Exception {
        int page=metadataPage(request,"page",1,100),perPage=metadataPage(request,"perPage",30,100);long deadline=SystemClock.elapsedRealtime()+90000;
        JSONObject snapshot=repositorySnapshot(host,request,epoch,deadline);String repository=snapshot.getString("repository"),identity=snapshot.getString("sha");
        JSONArray source=array(host,project(request)+"/repository/commits?ref_name="+identity+"&per_page="+perPage+"&page="+page,epoch),commits=new JSONArray(),warnings=new JSONArray();
        if(source.length()>perPage)throw new Failure("Invalid repository history page size");
        for(int i=0;i<source.length();i++){
            repositoryCheck(epoch,deadline);JSONObject commit=source.getJSONObject(i);String id=sha(commit.getString("id")),date=commit.optString("authored_date",commit.optString("committed_date","")),author=commit.optString("author_name","").replaceAll("[\\p{Cntrl}]"," ");
            if(author.length()>256)author=author.substring(0,256);if(date.length()>64||controls(date))throw new Failure("Invalid commit timestamp");JSONArray rawParents=commit.getJSONArray("parent_ids");
            commits.put(new JSONObject().put("sha",id).put("parents",GitHubClient.historyParents(rawParents,false,warnings)).put("parentsTruncated",rawParents.length()>32).put("message",GitHubClient.historyMessage(commit.optString("message",""),warnings)).put("author",author).put("date",date).put("url",host+"/"+repository+"/-/commit/"+id));
        }
        boolean more=source.length()==perPage&&page<100,pageLimited=source.length()==perPage&&page==100,truncated=pageLimited;for(int i=0;i<commits.length();i++)truncated|=commits.getJSONObject(i).optBoolean("parentsTruncated");
        if(more)warnings.put("This is one history page; parent commits can be outside the loaded graph.");if(pageLimited)warnings.put("Repository history reached the 100-page limit; no complete-history claim is made.");
        repositoryCheck(epoch,deadline);return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository).put("ref",snapshot.getString("ref")).put("sha",identity).put("commits",commits).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
    }
    private JSONObject repositoryBranches(String host,JSONObject request,int epoch)throws Exception {
        int page=metadataPage(request,"page",1,100),perPage=metadataPage(request,"perPage",100,100);JSONArray source=array(host,project(request)+"/repository/branches?per_page="+perPage+"&page="+page,epoch),branches=new JSONArray(),warnings=new JSONArray();
        if(source.length()>perPage)throw new Failure("Invalid branch page size");
        for(int i=0;i<source.length();i++){check(epoch);JSONObject branch=source.getJSONObject(i);String name=branch.getString("name");validRef(name);branches.put(new JSONObject().put("name",name).put("sha",sha(branch.getJSONObject("commit").getString("id"))));}
        boolean more=source.length()==perPage&&page<100,truncated=source.length()==perPage&&page==100;if(truncated)warnings.put("Branch listing reached the 100-page limit.");
        return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository(request)).put("branches",branches).put("page",page).put("perPage",perPage).put("hasMore",more).put("nextPage",more?page+1:JSONObject.NULL).put("truncated",truncated).put("warnings",warnings);
    }
    private JSONObject importProject(String host,JSONObject request,int epoch) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+(request.optBoolean("downloadLarge")?30L:8L)*60*1000;String repository=repository(request),root=project(request);
        String sourceRef=request.optString("sourceRef",request.optString("ref",""));if(sourceRef.length()>255||controls(sourceRef))throw new Failure("Invalid branch or commit");
        DiskProjectStore cachedStore;
        synchronized(this) { check(epoch);cachedStore=diskStore; }
        // A different project transfer may own the disk lock. Never keep the
        // provider monitor while waiting: UI cancellation also needs that monitor.
        JSONObject cached=cachedStore==null?null:cachedStore.findRemote("gitlab",host,repository,request.optString("ref",""));
        check(epoch);
        if(cached!=null)return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository).put("sha",cached.getJSONObject("gitlab").getString("sha")).put("cached",true).put("project",cached);
        JSONObject metadata=json(host,root,epoch);String ref=request.optString("ref","");if(ref.isEmpty())ref=metadata.optString("default_branch","");
        if(ref.isEmpty()||ref.length()>255||controls(ref))throw new Failure("Invalid branch or commit");
        String sha=sha(json(host,root+"/repository/commits/"+encode(ref),epoch).getString("id"));
        JSONArray nodes=new JSONArray();boolean more=true;
        for(int page=1;page<=1000&&more;page++) {
            check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository download timed out");
            JSONArray chunk=array(host,root+"/repository/tree?recursive=true&per_page=100&ref="+sha+"&page="+page,epoch);
            for(int i=0;i<chunk.length();i++) nodes.put(chunk.getJSONObject(i));more=chunk.length()==100;
        }
        if(more)throw new Failure("Repository tree is too large; incomplete imports are refused");
        if(request.optBoolean("downloadLarge")) {
            DiskProjectStore store; synchronized(this) { check(epoch);store=diskStore; }
            if(store==null)throw new Failure("Project download storage is unavailable");
            Map<String,String> identities=new HashMap<>();JSONArray sources=new JSONArray();
            for(int i=0;i<nodes.length();i++) {JSONObject node=nodes.getJSONObject(i);String path=node.optString("path");
                if(!node.optString("type").equals("blob")||!GitHubClient.importable(path))continue;
                safePath(path);identities.put(path,sha(node.getString("id")));
                sources.put(new JSONObject().put("path",path).put("type","blob").put("mode",node.optString("mode")).put("size",-1));
            }
            final String projectRoot=root;
            JSONObject origin=new JSONObject().put("host",host).put("repository",metadata.getString("path_with_namespace")).put("sha",sha).put("sourceRef",sourceRef);
            JSONObject downloaded=store.importProject(metadata.getString("path_with_namespace"),sources,
                (path,target,size)->downloadBlob(host,projectRoot,identities.get(path),target,epoch,deadline),
                new JSONObject().put("gitlab",origin),request.optBoolean("temporaryDownload"));
            downloaded.put("repositoryTree",GitHubClient.repositoryTree(nodes));
            check(epoch);return new JSONObject().put("provider","gitlab").put("host",host).put("repository",metadata.getString("path_with_namespace")).put("sha",sha)
                .put("private",!metadata.optString("visibility").equals("public")).put("project",downloaded);
        }
        JSONArray files=new JSONArray(),assets=new JSONArray();Set<String> paths=new HashSet<>();int total=0,count=0;
        for(int i=0;i<nodes.length();i++) {
            check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository download timed out");
            JSONObject node=nodes.getJSONObject(i);if(!node.optString("type").equals("blob"))continue;
            String path=node.getString("path"),lower=path.toLowerCase(Locale.ROOT);boolean binary=lower.matches(".*\\.(step|stp|wrl|vrml|glb|pdf)$");
            boolean text=lower.matches(".*\\.(kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|json|gbr|ger|gerber|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\\d+|g\\d+|drl|xln|csv|tsv|txt|wbk|raw|html|htm)$")||lower.equals("sym-lib-table")||lower.equals("fp-lib-table")||lower.endsWith("/sym-lib-table")||lower.endsWith("/fp-lib-table");
            if(!binary&&!text)continue;safePath(path);
            if(!node.optString("mode").equals("100644")&&!node.optString("mode").equals("100755"))throw new Failure("Symbolic links cannot be imported");
            if(!paths.add(lower)||++count>2000)throw new Failure("Duplicate paths or too many KiCad files (limit 2000)");
            byte[] bytes;
            try { bytes=networkBytes(host,root+"/repository/blobs/"+sha(node.getString("id"))+"/raw","GET",null,credential(host,epoch),epoch,Math.min(FILE_LIMIT,TOTAL_LIMIT-total),"application/json"); }
            catch(DownloadRequired required) {return new JSONObject().put("downloadRequired",true).put("provider","gitlab").put("host",host).put("repository",metadata.getString("path_with_namespace")).put("sha",sha).put("bytes",-1);}
            total+=bytes.length;
            if(bytes.length>=42&&new String(bytes,0,42,StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/"))throw new Failure("Git LFS files must be downloaded locally before import");
            MessageDigest objectDigest=MessageDigest.getInstance("SHA-1");objectDigest.update(("blob "+bytes.length+"\0").getBytes(StandardCharsets.US_ASCII));objectDigest.update(bytes);StringBuilder actualBlob=new StringBuilder();for(byte b:objectDigest.digest())actualBlob.append(String.format(Locale.ROOT,"%02x",b&255));if(!actualBlob.toString().equals(sha(node.getString("id"))))throw new Failure("Repository blob identity mismatch");
            JSONObject item=new JSONObject().put("path",path);if(lower.endsWith(".pdf"))item.put("encoding","base64");if(binary)assets.put(item.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP)));else files.put(item.put("content",utf8(bytes)));
        }
        if(files.length()==0&&assets.length()==0)throw new Failure("No supported KiCad files found in project");check(epoch);
        repository=metadata.getString("path_with_namespace");
        return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository).put("sha",sha).put("private",!metadata.optString("visibility").equals("public"))
            .put("project",new JSONObject().put("id",hash(host+"/"+repository+"@"+sha)).put("files",files).put("assets",assets).put("repositoryTree",GitHubClient.repositoryTree(nodes))
            .put("gitlab",new JSONObject().put("host",host).put("repository",repository).put("sha",sha)));
    }
    /** Bounded file transfer: raw bytes never pass through the WebView or a whole-file byte array. */
    private void downloadBlob(String host,String root,String identity,File target,int epoch,long deadline)throws Exception {
        check(epoch);host=validateHost(host);identity=sha(identity);
        String path=root+"/repository/blobs/"+identity+"/raw";
        URL url=new URL(host+"/api/v4"+path);
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||!url.getHost().equals(new URI(host).getHost())||url.getPort()!=-1)throw new Failure("Unsupported GitLab endpoint");
        String bearer=credential(host,epoch);HttpsURLConnection connection=connections.open(url); NativeLoadOperation.track(connection);
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setUseCaches(false);
        connection.setRequestProperty("Accept","application/octet-stream");connection.setRequestProperty("User-Agent","Pocket-KiVi-Android");
        if(bearer!=null)connection.setRequestProperty("Authorization","Bearer "+bearer);
        long written=0;
        try {
            int status=connection.getResponseCode();check(epoch);
            if(status==401){synchronized(this){check(epoch);authExpired=bearer!=null;tokens.remove(host);refreshRecords.remove(host);vault(host).clear();}throw new Failure("GitLab sign-in expired or was revoked; sign in again");}
            if(status==403||status==429)throw new Failure("GitLab denied access or rate limited this request");
            if(status==404)throw new Failure("Project or revision unavailable; check private project access",404);
            if(status<200||status>=300)throw new Failure("GitLab request failed (HTTP "+status+")");
            long declared=connection.getContentLengthLong();if(declared>DiskProjectStore.FILE_LIMIT)throw new Failure("Downloaded projects support up to 256 MiB per file");
            try(InputStream input=NativeLoadOperation.input(connection.getInputStream());OutputStream output=new FileOutputStream(target)) {
                byte[] buffer=new byte[65536];int n;
                while((n=input.read(buffer))!=-1) {check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository download timed out");
                    if(n>DiskProjectStore.FILE_LIMIT-written)throw new Failure("Downloaded projects support up to 256 MiB per file");
                    output.write(buffer,0,n);written+=n;
                }
            }
            if(declared>=0&&written!=declared)throw new Failure("Repository file size mismatch");
            MessageDigest digest=MessageDigest.getInstance("SHA-1");digest.update(("blob "+written+"\0").getBytes(StandardCharsets.US_ASCII));
            try(InputStream input=new FileInputStream(target)) {byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1){check(epoch);digest.update(buffer,0,n);}}
            StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format(Locale.ROOT,"%02x",b&255));
            if(!actual.toString().equals(identity))throw new Failure("Repository blob identity mismatch");
        } finally {NativeLoadOperation.untrack(connection); connection.disconnect();}
    }
    private static String repository(JSONObject request) throws Exception {
        String value=request.getString("repository");if(value.length()>300||!value.matches("[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+"))throw new Failure("Invalid GitLab project path");
        for(String part:value.split("/"))if(part.equals(".")||part.equals(".."))throw new Failure("Invalid GitLab project path");return value;
    }
    private static String project(JSONObject request)throws Exception {return "/projects/"+encode(repository(request));}
    private static int page(JSONObject request)throws Exception {int n=request.optInt("page",1);if(n<1||n>1000||request.has("page")&&request.getDouble("page")!=n)throw new Failure("Invalid page");return n;}
    private static int number(JSONObject request)throws Exception {int n=request.getInt("number");if(n<1||request.getDouble("number")!=n)throw new Failure("Invalid issue number");return n;}
    private static boolean controls(String value){for(int i=0;i<value.length();i++)if(Character.isISOControl(value.charAt(i)))return true;return false;}
    private static void safePath(String path)throws Exception {if(path.length()>500||path.startsWith("/")||path.indexOf('\\')>=0||path.indexOf(':')>=0||controls(path))throw new Failure("Unsafe repository path");for(String p:path.split("/",-1))if(p.isEmpty()||p.equals(".")||p.equals(".."))throw new Failure("Unsafe repository path");}
    private static String sha(String value)throws Exception {if(!value.matches("[a-fA-F0-9]{40}"))throw new Failure("Invalid GitLab object identifier");return value.toLowerCase(Locale.ROOT);}
    private static String hash(String text)throws Exception {return hashBytes(text.getBytes(StandardCharsets.UTF_8));}
    private static String hashBytes(byte[] source)throws Exception {byte[] bytes=MessageDigest.getInstance("SHA-256").digest(source);StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    private static String encode(String value)throws Exception {return URLEncoder.encode(value,"UTF-8").replace("+","%20");}
    private static String utf8(byte[] bytes)throws Exception {return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}
    private JSONObject json(String host,String path,int epoch)throws Exception {return new JSONObject(network(host,path,"GET",null,credential(host,epoch),epoch,4*1024*1024));}
    private JSONArray array(String host,String path,int epoch)throws Exception {JSONArray result=new JSONArray(network(host,path,"GET",null,credential(host,epoch),epoch,4*1024*1024));if(result.length()>100)throw new Failure("Invalid GitLab page size");return result;}
    private String network(String host,String path,String method,byte[] body,String bearer,int epoch,int limit)throws Exception {return network(host,path,method,body,bearer,epoch,limit,"application/json");}
    private String network(String host,String path,String method,byte[] body,String bearer,int epoch,int limit,String contentType)throws Exception {return utf8(networkBytes(host,path,method,body,bearer,epoch,limit,contentType));}
    private byte[] networkBytes(String host,String path,String method,byte[] body,String bearer,int epoch,int limit,String contentType)throws Exception {
        check(epoch);host=validateHost(host);if(!path.startsWith("/projects/")&&!path.equals("/user")&&!path.startsWith("/projects?")&&!path.equals("/oauth/token"))throw new Failure("Unsupported GitLab endpoint");
        URL url=new URL(host+(path.equals("/oauth/token")?"":"/api/v4")+path);if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||!url.getHost().equals(new URI(host).getHost())||url.getPort()!=-1)throw new Failure("Unsupported GitLab endpoint");
        HttpsURLConnection connection=connections.open(url); NativeLoadOperation.track(connection);connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setUseCaches(false);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","KiCadVizDiff-Android");connection.setRequestMethod(method);
        if(path.equals("/oauth/token")&&bearer!=null)throw new Failure("Unsupported GitLab OAuth credential");
        if(bearer!=null)connection.setRequestProperty("Authorization","Bearer "+bearer);long deadline=SystemClock.elapsedRealtime()+90000;
        try {
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type",contentType);connection.setFixedLengthStreamingMode(body.length);try(OutputStream stream=connection.getOutputStream()){stream.write(body);}}
            int status=connection.getResponseCode();check(epoch);
            if(status==401||status==400&&path.equals("/oauth/token")){synchronized(this){check(epoch);authExpired=bearer!=null||refreshRecords.containsKey(host);tokens.remove(host);refreshRecords.remove(host);vault(host).clear();}throw new Failure("GitLab sign-in expired or was revoked; sign in again");}
            if(status==403||status==429)throw new Failure("GitLab denied access or rate limited this request");
            if(status==404)throw new Failure("Project or revision unavailable; check private project access",404);
            if(status<200||status>=300)throw new Failure("GitLab request failed (HTTP "+status+")");
            if(connection.getContentLengthLong()>limit){if(path.matches("/projects/.*/repository/blobs/[a-f0-9]{40}/raw"))throw new DownloadRequired();throw new Failure("GitLab response exceeds import limits");}
            try(InputStream stream=NativeLoadOperation.input(connection.getInputStream());ByteArrayOutputStream output=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[32768];int n;while((n=stream.read(buffer))!=-1){check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("GitLab request timed out");if(n>limit-output.size()){if(path.matches("/projects/.*/repository/blobs/[a-f0-9]{40}/raw"))throw new DownloadRequired();throw new Failure("GitLab response exceeds import limits");}output.write(buffer,0,n);}return output.toByteArray();
            }
        } finally {NativeLoadOperation.untrack(connection); connection.disconnect();}
    }
}
