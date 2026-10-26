package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.security.cert.Certificate;
import java.lang.reflect.Field;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** Synthetic transport checks only. No request reaches a network or user account. */
final class NativeChatChecks {
    private static final String SHA="c".repeat(40),FILE="design/board.kicad_sch",TIME="2026-10-27T00:00:00.000Z",HOST="https://gitlab-chat-selftest.invalid";
    private static int checks;
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    private interface Attempt { void run()throws Exception; }
    private static void denied(Attempt attempt)throws Exception {try{attempt.run();throw new AssertionError("Unsafe chat request was accepted");}catch(IOException expected){checks++;}}
    private static JSONObject request(String operation,String id,boolean lab)throws Exception {return new JSONObject().put("action","chat-message-write").put("repository",lab?"group/sub/board":"owner/board").put("host",lab?HOST:"https://github.com").put("ref",SHA).put("file",FILE).put("thread",new JSONObject().put("kind","issue").put("number",42)).put("messageAction",operation).put("body","Plain chat text").put("clientMutationId",id);}
    private static JSONObject user(boolean lab,int id)throws Exception{return new JSONObject().put("id",id).put(lab?"username":"login","reviewer");}
    private static JSONObject note(boolean lab,int id,int author)throws Exception{return new JSONObject().put("id",id).put(lab?"author":"user",user(lab,author)).put(lab?"created_at":"created_at",TIME).put("updated_at",TIME).put("body","Original message").put("node_id","IC_"+id).put("system",false).put("issue_url","https://api.github.com/repos/owner/board/issues/42");}
    private static final class Fixture {
        final boolean lab;int writes,opens;boolean foreign,oversize,failWrite;String written="",method="";Runnable beforeBody;
        Fixture(boolean lab){this.lab=lab;}
        HttpsURLConnection open(URL url)throws IOException {
            opens++;
            require(url.getProtocol().equals("https")&&url.getHost().equals(lab?"gitlab-chat-selftest.invalid":"api.github.com"),"Native credential destination escaped its provider");
            return new HttpsURLConnection(url){
                final ByteArrayOutputStream input=new ByteArrayOutputStream();byte[] response;int status=200;
                public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
                public OutputStream getOutputStream(){Runnable callback=beforeBody;beforeBody=null;if(callback!=null)callback.run();return input;}
                public int getResponseCode()throws IOException {try{
                    String path=url.getPath();Object value;String payload=input.toString("UTF-8");method=getRequestMethod();boolean mutation=!payload.isEmpty()&&(!path.equals("/graphql")||payload.contains("mutation("));
                    if(mutation){writes++;written=payload;if(failWrite){status=503;value=new JSONObject();}else if(lab&&path.endsWith("/discussions"))value=new JSONObject().put("id","group_new").put("notes",new JSONArray().put(note(true,88,7)));else if(path.equals("/graphql"))value=new JSONObject().put("data",new JSONObject().put("updateIssueComment",new JSONObject().put("issueComment",new JSONObject().put("id","IC_77").put("databaseId",77).put("updatedAt",TIME))));else value=note(lab,method.equals("PUT")?77:88,7);
                    }else if(path.endsWith("/user"))value=user(lab,7);
                    else if(path.contains(".kicad-review-policy.json")){status=404;value=new JSONObject();}
                    else if(path.contains("/repository/tree"))value=new JSONArray();
                    else if(path.endsWith("/issues/42"))value=note(lab,900,7).put("number",42).put("iid",42).put("project_id",9).put("comments",1).put("title","Board review").put("description","Issue root").put("state",lab?"opened":"open").put("locked",false);
                    else if(path.endsWith("/discussions/group_1"))value=new JSONObject().put("id","group_1").put("notes",new JSONArray().put(note(true,77,foreign?8:7)));
                    else if(path.endsWith("/discussions"))value=new JSONArray().put(new JSONObject().put("id","group_1").put("individual_note",false).put("notes",new JSONArray().put(note(true,77,foreign?8:7).put("body",oversize?"x".repeat(70000):"Original message"))));
                    else if(path.endsWith("/issues/comments/77")||path.endsWith("/notes/77"))value=note(lab,77,foreign?8:7);
                    else if(path.endsWith("/comments"))value=new JSONArray().put(note(false,77,foreign?8:7).put("body",oversize?"x".repeat(70000):"Original message"));
                    else if(path.endsWith("/issues"))value=new JSONArray().put(note(lab,900,7).put("number",42).put("iid",42).put("project_id",9).put("title","Board review").put("state",lab?"opened":"open"));
                    else value=new JSONObject().put("id",9).put("full_name","owner/board").put("path_with_namespace","group/sub/board").put("private",false).put("default_branch","main");
                    response=value.toString().getBytes(StandardCharsets.UTF_8);return status;
                }catch(Exception error){throw new IOException(error);}}
                public long getContentLengthLong(){return response==null?-1:response.length;}
                public InputStream getInputStream(){return new ByteArrayInputStream(response);}
                public String getCipherSuite(){return "synthetic";}public Certificate[] getLocalCertificates(){return null;}public Certificate[] getServerCertificates(){return null;}public Principal getPeerPrincipal(){return null;}public Principal getLocalPrincipal(){return null;}
            };
        }
    }
    @SuppressWarnings("unchecked")
    static int run(Context base)throws Exception {
        checks=0;Context context=new ContextWrapper(base){public Context getApplicationContext(){return this;}public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences("native_chat_selftest_"+name,mode);}};
        JSONObject project=new JSONObject().put("github",new JSONObject().put("repository","owner/board").put("sha",SHA)).put("files",new JSONArray().put(new JSONObject().put("path",FILE)));
        JSONObject valid=request("create","native_chat_mutation_0001",false);require(NativeChatRequest.matchesProject(project,"github","https://github.com",valid),"Pinned chat project scope denied");
        for(JSONObject invalid:new JSONObject[]{new JSONObject(valid.toString()).put("ref","main"),new JSONObject(valid.toString()).put("file","../board.kicad_sch"),new JSONObject(valid.toString()).put("repository","other/board")})require(!NativeChatRequest.matchesProject(project,"github","https://github.com",invalid),"Foreign scope accepted");
        new NativeChatRequest(valid);for(JSONObject invalid:new JSONObject[]{new JSONObject(valid.toString()).put("replyTo","77"),new JSONObject(valid.toString()).put("clientMutationId","short"),new JSONObject(valid.toString()).put("body",""),new JSONObject(valid.toString()).put("messageAction","edit").put("messageId",77).put("expectedUpdatedAt",TIME)})denied(()->new NativeChatRequest(invalid));
        JSONObject annotation=new JSONObject().put("id",valid.getString("clientMutationId")).put("text",valid.getString("body")).put("threadType","issue").put("anchor",new JSONObject().put("repository","owner/board").put("ref",SHA).put("file",FILE));
        String marker=Base64.encodeToString(annotation.toString().getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);JSONObject annotated=new JSONObject(valid.toString()).put("annotation",annotation).put("renderedBody","Visible body\n\n<!-- kicad-review:v1 "+marker+" -->");new NativeChatRequest(annotated);checks++;
        JSONObject forged=new JSONObject(annotation.toString());forged.getJSONObject("anchor").put("ref","d".repeat(40));String foreignMarker=Base64.encodeToString(forged.toString().getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);denied(()->new NativeChatRequest(new JSONObject(annotated.toString()).put("renderedBody","<!-- kicad-review:v1 "+foreignMarker+" -->")));
        boolean[] current={true};try(NativeChatScope.Scope scope=NativeChatScope.enter(()->{if(!current[0])throw new IOException("Changed project");})){NativeChatScope.checkCurrent();current[0]=false;denied(NativeChatScope::checkCurrent);}NativeChatScope.checkCurrent();
        for(boolean lab:new boolean[]{false,true}){
            context.getSharedPreferences("provider_write_pacing",Context.MODE_PRIVATE).edit().clear().commit();context.getSharedPreferences(lab?"gitlab_publication_journal":"github_review_receipts",Context.MODE_PRIVATE).edit().clear().commit();Fixture fixture=new Fixture(lab);
            GitHubClient hub=null;GitLabClient gitlab=null;
            if(lab){gitlab=new GitLabClient(context,fixture::open);Field tokens=GitLabClient.class.getDeclaredField("tokens");tokens.setAccessible(true);((Map<String,String>)tokens.get(gitlab)).put(HOST,"native-test-token");}
            else{hub=new GitHubClient(context,"native_chat_selftest",fixture::open);Field token=GitHubClient.class.getDeclaredField("token");token.setAccessible(true);token.set(hub,"ghp_native_test_token");}
            final GitHubClient h=hub;final GitLabClient g=gitlab;
            if(lab){
                Field recordsField=GitLabClient.class.getDeclaredField("refreshRecords");recordsField.setAccessible(true);Map<String,JSONObject> records=(Map<String,JSONObject>)recordsField.get(g);
                JSONObject refresh=new JSONObject().put("expiresAt",0).put("clientId","synthetic-client").put("refreshToken","synthetic-refresh-token");records.put(HOST,refresh);
                JSONObject auth=new JSONObject().put("action","auth-status").put("host",HOST);
                try(NativeChatScope.Scope scope=NativeChatScope.enter(()->{})){
                    int connections=fixture.opens;denied(()->g.handle(auth,g.generation()));require(fixture.opens==connections,"Scoped OAuth refresh reached the network");
                    refresh.put("expiresAt",System.currentTimeMillis()+3600000);require(g.handle(auth,g.generation()).getBoolean("connected"),"Non-expired scoped credentials stopped working");
                }
                records.remove(HOST);
            }
            JSONObject create=request("create","native_chat_create_0001",lab),result=lab?g.handle(create,g.generation()):h.handle(create,h.generation());require(result.getString("messageId").equals("88")&&fixture.writes==1,"Native chat create failed");
            JSONObject repeat=lab?g.handle(create,g.generation()):h.handle(create,h.generation());require(repeat.optBoolean("duplicate")&&fixture.writes==1,"Duplicate chat was sent twice");denied(()->{JSONObject changed=new JSONObject(create.toString()).put("body","Changed payload");if(lab)g.handle(changed,g.generation());else h.handle(changed,h.generation());});
            context.getSharedPreferences("provider_write_pacing",Context.MODE_PRIVATE).edit().clear().commit();JSONObject reply=request("reply","native_chat_reply_0001",lab).put("replyTo","77");if(lab)g.handle(reply,g.generation());else h.handle(reply,h.generation());require(fixture.writes==2,"Native chat reply failed");if(!lab)require(new JSONObject(fixture.written).getString("body").startsWith("> Reply to [reviewer]"),"Issue reply lost its verified quoted target");
            context.getSharedPreferences("provider_write_pacing",Context.MODE_PRIVATE).edit().clear().commit();JSONObject edit=request("edit","native_chat_edit_00001",lab).put("messageId","77").put("expectedUpdatedAt",TIME);if(lab)g.handle(edit,g.generation());else h.handle(edit,h.generation());require(fixture.writes==3,"Native own-message edit failed");
            int before=fixture.writes;fixture.foreign=true;denied(()->{JSONObject other=new JSONObject(edit.toString()).put("clientMutationId","native_chat_other_0001");if(lab)g.handle(other,g.generation());else h.handle(other,h.generation());});require(fixture.writes==before,"Foreign author edit reached mutation");fixture.foreign=false;fixture.oversize=true;denied(()->{JSONObject longBody=new JSONObject(edit.toString()).put("clientMutationId","native_chat_long_00001");if(lab)g.handle(longBody,g.generation());else h.handle(longBody,h.generation());});require(fixture.writes==before,"Truncated message edit reached mutation");fixture.oversize=false;
            JSONObject read=new JSONObject().put("action",lab?"thread":"review-thread").put("repository",lab?"group/sub/board":"owner/board").put("host",lab?HOST:"https://github.com").put("kind","issue").put("number",42).put("includeCapabilities",true);JSONObject capabilities=lab?g.handle(read,g.generation()):h.handle(read,h.generation());require(capabilities.getJSONObject("capabilities").getBoolean("create")&&!capabilities.getJSONObject("capabilities").getBoolean("reactions")&&capabilities.getJSONArray("comments").getJSONObject(0).getBoolean("canEdit"),"Native chat capabilities lost auth/owner state");
            JSONObject discovery=new JSONObject().put("action","chat-thread-list").put("repository",lab?"group/sub/board":"owner/board").put("host",lab?HOST:"https://github.com").put("ref",SHA).put("file",FILE).put("kind","issue").put("page",1);JSONObject listed=lab?g.handle(discovery,g.generation()):h.handle(discovery,h.generation());require(listed.getJSONArray("threads").length()==1&&!listed.getJSONArray("threads").getJSONObject(0).has("body"),"Chat discovery leaked bodies or lost a thread");
            denied(()->{JSONObject tooMany=new JSONObject(discovery.toString()).put("page",6);if(lab)g.handle(tooMany,g.generation());else h.handle(tooMany,h.generation());});
            context.getSharedPreferences("provider_write_pacing",Context.MODE_PRIVATE).edit().clear().commit();fixture.failWrite=true;JSONObject uncertain=request("create","native_chat_uncertain_01",lab);denied(()->{if(lab)g.handle(uncertain,g.generation());else h.handle(uncertain,h.generation());});before=fixture.writes;denied(()->{if(lab)g.handle(uncertain,g.generation());else h.handle(uncertain,h.generation());});require(fixture.writes==before,"Unconfirmed mutation was retried");
        }
        return checks;
    }
}
