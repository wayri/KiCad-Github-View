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
    private int generation;
    private final Map<String,String> tokens=new HashMap<>();
    private final Map<String,JSONObject> refreshRecords=new HashMap<>();
    private final Map<String,GitHubVault> vaults=new HashMap<>();
    private boolean authExpired;
    private String oauthHost,oauthClient,oauthState,oauthVerifier;
    private long oauthExpiry;
    GitLabClient(Context context) { this(context,url->(HttpsURLConnection)url.openConnection()); }
    GitLabClient(Context context,ConnectionFactory connections) { this.context=context.getApplicationContext();this.connections=connections;journal=context.getSharedPreferences("gitlab_publication_journal",Context.MODE_PRIVATE); }
    synchronized int generation() { return generation; }
    synchronized boolean current(int epoch) { return epoch==generation; }
    synchronized boolean authExpired() { return authExpired; }
    synchronized void cancelRequests() { generation++;oauthState=null;oauthVerifier=null; }
    synchronized void reset(String host) throws Exception {
        host=validateHost(host); generation++;oauthState=null;oauthVerifier=null; tokens.remove(host);refreshRecords.remove(host); vault(host).clear(); authExpired=false;
    }
    private void check(int epoch) throws IOException {
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
        JSONObject refreshed=new JSONObject(network(host,"/oauth/token","POST",body,null,epoch,65536,"application/x-www-form-urlencoded"));
        saveOAuth(host,client,refreshed,epoch);synchronized(this){check(epoch);return tokens.get(host);}
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
            case "thread": {
                String root=project(request)+"/issues/"+number(request);
                JSONObject result=issue(json(host,root,epoch));JSONArray comments=new JSONArray(),warnings=new JSONArray();
                for(int page=1;page<=5;page++) {
                    JSONArray notes=array(host,root+"/notes?per_page=100&page="+page+"&sort=asc",epoch);
                    for(int i=0;i<notes.length();i++){JSONObject note=notes.getJSONObject(i);if(note.optBoolean("system",false))continue;JSONObject author=note.optJSONObject("author");long id=note.getLong("id");comments.put(new JSONObject().put("id",String.valueOf(id)).put("author",author==null?"":author.optString("username")).put("createdAt",note.optString("created_at")).put("updatedAt",note.optString("updated_at")).put("body",note.optString("body")).put("url",result.getString("url")+"#note_"+id));}
                    if(notes.length()<100)break;if(page==5)warnings.put("Only the first 500 issue notes are shown");
                }
                result.put("comments",comments).put("warnings",warnings);return result;
            }
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
        if(body.isEmpty()||body.length()>65536||body.indexOf('\0')>=0) throw new Failure("Comment text is empty or too long");
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
    private JSONObject importProject(String host,JSONObject request,int epoch) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+(request.optBoolean("downloadLarge")?30L:8L)*60*1000;String repository=repository(request),root=project(request);
        String sourceRef=request.optString("sourceRef",request.optString("ref",""));if(sourceRef.length()>255||controls(sourceRef))throw new Failure("Invalid branch or commit");
        synchronized(this) {
            check(epoch);JSONObject cached=diskStore==null?null:diskStore.findRemote("gitlab",host,repository,request.optString("ref",""));
            if(cached!=null)return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository).put("sha",cached.getJSONObject("gitlab").getString("sha")).put("cached",true).put("project",cached);
        }
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
            check(epoch);return new JSONObject().put("provider","gitlab").put("host",host).put("repository",metadata.getString("path_with_namespace")).put("sha",sha)
                .put("private",!metadata.optString("visibility").equals("public")).put("project",downloaded);
        }
        JSONArray files=new JSONArray(),assets=new JSONArray();Set<String> paths=new HashSet<>();int total=0,count=0;
        for(int i=0;i<nodes.length();i++) {
            check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("Repository download timed out");
            JSONObject node=nodes.getJSONObject(i);if(!node.optString("type").equals("blob"))continue;
            String path=node.getString("path"),lower=path.toLowerCase(Locale.ROOT);boolean binary=lower.matches(".*\\.(step|stp|wrl)$");
            boolean text=lower.matches(".*\\.(kicad_sch|kicad_pcb|kicad_pro|kicad_prl|kicad_dru|kicad_wks|json|gbr|ger|drl|csv|tsv|txt|wbk|raw|html|htm)$")||lower.equals("sym-lib-table")||lower.equals("fp-lib-table")||lower.endsWith("/sym-lib-table")||lower.endsWith("/fp-lib-table");
            if(!binary&&!text)continue;safePath(path);
            if(!node.optString("mode").equals("100644")&&!node.optString("mode").equals("100755"))throw new Failure("Symbolic links cannot be imported");
            if(!paths.add(lower)||++count>2000)throw new Failure("Duplicate paths or too many KiCad files (limit 2000)");
            byte[] bytes;
            try { bytes=networkBytes(host,root+"/repository/blobs/"+sha(node.getString("id"))+"/raw","GET",null,credential(host,epoch),epoch,Math.min(FILE_LIMIT,TOTAL_LIMIT-total),"application/json"); }
            catch(DownloadRequired required) {return new JSONObject().put("downloadRequired",true).put("provider","gitlab").put("host",host).put("repository",metadata.getString("path_with_namespace")).put("sha",sha).put("bytes",-1);}
            total+=bytes.length;
            if(bytes.length>=42&&new String(bytes,0,42,StandardCharsets.US_ASCII).startsWith("version https://git-lfs.github.com/spec/"))throw new Failure("Git LFS files must be downloaded locally before import");
            MessageDigest objectDigest=MessageDigest.getInstance("SHA-1");objectDigest.update(("blob "+bytes.length+"\0").getBytes(StandardCharsets.US_ASCII));objectDigest.update(bytes);StringBuilder actualBlob=new StringBuilder();for(byte b:objectDigest.digest())actualBlob.append(String.format(Locale.ROOT,"%02x",b&255));if(!actualBlob.toString().equals(sha(node.getString("id"))))throw new Failure("Repository blob identity mismatch");
            JSONObject item=new JSONObject().put("path",path);if(binary)assets.put(item.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP)));else files.put(item.put("content",utf8(bytes)));
        }
        if(files.length()==0)throw new Failure("No supported KiCad files found in project");check(epoch);
        repository=metadata.getString("path_with_namespace");
        return new JSONObject().put("provider","gitlab").put("host",host).put("repository",repository).put("sha",sha).put("private",!metadata.optString("visibility").equals("public"))
            .put("project",new JSONObject().put("id",hash(host+"/"+repository+"@"+sha)).put("files",files).put("assets",assets)
            .put("gitlab",new JSONObject().put("host",host).put("repository",repository).put("sha",sha)));
    }
    /** Bounded file transfer: raw bytes never pass through the WebView or a whole-file byte array. */
    private void downloadBlob(String host,String root,String identity,File target,int epoch,long deadline)throws Exception {
        check(epoch);host=validateHost(host);identity=sha(identity);
        String path=root+"/repository/blobs/"+identity+"/raw";
        URL url=new URL(host+"/api/v4"+path);
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||!url.getHost().equals(new URI(host).getHost())||url.getPort()!=-1)throw new Failure("Unsupported GitLab endpoint");
        String bearer=credential(host,epoch);HttpsURLConnection connection=connections.open(url);
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
            try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(target)) {
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
        } finally {connection.disconnect();}
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
        HttpsURLConnection connection=connections.open(url);connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setUseCaches(false);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","KiCadVizDiff-Android");connection.setRequestMethod(method);
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
            try(InputStream stream=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[32768];int n;while((n=stream.read(buffer))!=-1){check(epoch);if(SystemClock.elapsedRealtime()>deadline)throw new Failure("GitLab request timed out");if(n>limit-output.size()){if(path.matches("/projects/.*/repository/blobs/[a-f0-9]{40}/raw"))throw new DownloadRequired();throw new Failure("GitLab response exceeds import limits");}output.write(buffer,0,n);}return output.toByteArray();
            }
        } finally {connection.disconnect();}
    }
}
