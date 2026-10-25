package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.security.cert.Certificate;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/** Offline native API acceptance. All credentials, hosts and transport data are synthetic. */
final class RepositoryMetadataChecks {
    private static final String COMMIT="a".repeat(40),ROOT="b".repeat(40),FOLDER="c".repeat(40),CHILD="d".repeat(40),PARENT="e".repeat(40),OTHER="f".repeat(40);
    private static final String TOKEN="repository_metadata_fake_token_12345",HOST="https://gitlab-repository-metadata-test.invalid";
    private static int checks;
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;}
    private static JSONObject entry(String path,String type,String mode,String id,boolean github)throws Exception{return new JSONObject().put("path",path).put("type",type).put("mode",mode).put(github?"sha":"id",id);}
    private static JSONObject request(String action)throws Exception{return new JSONObject().put("action",action).put("repository","test/repository").put("ref","main");}
    private static JSONObject githubCommit(String id,boolean merge)throws Exception {
        JSONArray parents=new JSONArray();if(merge)parents.put(new JSONObject().put("sha",CHILD)).put(new JSONObject().put("sha",PARENT));
        return new JSONObject().put("sha",id).put("parents",parents).put("html_url","https://untrusted.invalid/wrong").put("commit",new JSONObject().put("tree",new JSONObject().put("sha",ROOT)).put("message","Title\n\nDetailed message\nSecond line").put("author",new JSONObject().put("name","Synthetic author").put("date","2026-10-25T00:00:00Z")));
    }
    private static JSONObject gitlabCommit(String id,boolean merge)throws Exception {return new JSONObject().put("id",id).put("parent_ids",merge?new JSONArray().put(CHILD).put(PARENT):new JSONArray()).put("title","Wrong shortened title").put("message","Title\n\nDetailed message\nSecond line").put("author_name","Synthetic author").put("authored_date","2026-10-25T00:00:00Z").put("web_url","https://untrusted.invalid/wrong");}
    private static final class Fixture {
        final boolean github;final List<String> calls=new ArrayList<>();boolean wrongTree,redirect;Runnable onRead;
        Fixture(boolean github){this.github=github;}
        HttpsURLConnection open(URL url)throws IOException {
            try{
                require(url.getProtocol().equals("https")&&url.getHost().equals(github?"api.github.com":"gitlab-repository-metadata-test.invalid"),"Provider metadata leaked to a foreign host");
                calls.add(url.toString());String path=url.getPath();android.net.Uri uri=android.net.Uri.parse(url.toString());String page=uri.getQueryParameter("page");Object body;
                if(path.endsWith("/user"))body=new JSONObject().put("id",1).put("username","synthetic");
                else if(path.contains("/git/trees/")){
                    boolean root=path.endsWith(ROOT),recursive=uri.getQueryParameter("recursive")!=null;
                    JSONArray tree=root?new JSONArray().put(entry("folder","tree","040000",FOLDER,true)):new JSONArray().put(entry("notes.md","blob","100755",CHILD,true)).put(entry("link","blob","120000",PARENT,true)).put(entry("submodule","commit","160000",OTHER,true));
                    if(recursive)tree.put(entry("folder/notes.md","blob","100755",CHILD,true));
                    body=new JSONObject().put("sha",wrongTree?OTHER:root?ROOT:FOLDER).put("tree",tree).put("truncated",recursive);
                }else if(path.contains("/repository/tree")){
                    String folder=uri.getQueryParameter("path");boolean root=folder==null||folder.isEmpty();
                    body="2".equals(page)?new JSONArray():root?new JSONArray().put(entry("folder","tree","040000",FOLDER,false)).put(entry("root.json","blob","100644",CHILD,false)):new JSONArray().put(entry("folder/notes.md","blob","100755",CHILD,false)).put(entry("folder/link","blob","120000",PARENT,false));
                }else if(path.endsWith("/branches"))body=new JSONArray().put(github?new JSONObject().put("name","main").put("commit",new JSONObject().put("sha",COMMIT)):new JSONObject().put("name","main").put("commit",new JSONObject().put("id",COMMIT)));
                else if(path.endsWith("/commits"))body="2".equals(page)?new JSONArray():new JSONArray().put(github?githubCommit(COMMIT,true):gitlabCommit(COMMIT,true)).put(github?githubCommit(CHILD,false):gitlabCommit(CHILD,false));
                else if(path.contains("/commits/"))body=github?githubCommit(COMMIT,true):gitlabCommit(COMMIT,true);
                else body=new JSONObject().put("default_branch","main");
                return new FakeConnection(url,body.toString().getBytes(StandardCharsets.UTF_8),redirect?302:200,()->{Runnable callback=onRead;onRead=null;if(callback!=null)callback.run();});
            }catch(Exception error){throw new IOException(error);}
        }
    }
    private interface Client {JSONObject handle(JSONObject request,int epoch)throws Exception;int epoch();void cancel();}
    static int run(Context base)throws Exception {
        checks=0;Context context=new ContextWrapper(base){@Override public Context getApplicationContext(){return this;}@Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences("repository_metadata_selftest_"+name,mode);}};
        Fixture githubFixture=new Fixture(true),gitlabFixture=new Fixture(false);GitHubVault testVault=new GitHubVault(context,"repository_metadata_selftest");testVault.write(TOKEN);
        GitHubClient github=new GitHubClient(context,"repository_metadata_selftest",githubFixture::open);GitLabClient gitlab=new GitLabClient(context,gitlabFixture::open);
        try {
            gitlab.connectToken(HOST,TOKEN,gitlab.generation());
            for(boolean isGitHub:new boolean[]{true,false}){
                Fixture fixture=isGitHub?githubFixture:gitlabFixture;
                Client client=isGitHub?new Client(){public JSONObject handle(JSONObject request,int epoch)throws Exception{return github.handle(request,epoch);}public int epoch(){return github.generation();}public void cancel(){github.cancelRequests();}}:new Client(){public JSONObject handle(JSONObject request,int epoch)throws Exception{return gitlab.handle(request.put("host",HOST),epoch);}public int epoch(){return gitlab.generation();}public void cancel(){gitlab.cancelRequests();}};
                JSONObject tree=client.handle(request("repository-tree").put("perPage",2),client.epoch());require(tree.getString("sha").equals(COMMIT),"Tree did not pin commit");require(tree.getJSONArray("entries").getJSONObject(0).getString("mode").equals("040000"),"Saved tree mode lost");
                if(isGitHub)require(tree.getBoolean("truncated"),"Recursive truncation was hidden");else require(tree.getBoolean("hasMore")&&tree.getInt("nextPage")==2,"GitLab tree pagination missing");
                int start=fixture.calls.size();JSONObject directory=client.handle(request("repository-tree").put("sha",COMMIT).put("directory","folder").put("perPage",2),client.epoch());
                require(!directory.getBoolean("recursive")&&directory.getString("directory").equals("folder"),"Directory context lost");
                JSONObject file=directory.getJSONArray("entries").getJSONObject(0);require(file.getString("path").equals("folder/notes.md")&&file.getString("sha").equals(CHILD)&&file.getString("mode").equals("100755"),"Directory file path/mode/SHA was fabricated or dropped");require(directory.getJSONArray("entries").getJSONObject(1).getString("mode").equals("120000"),"Symlink metadata lost");
                for(String call:fixture.calls.subList(start,fixture.calls.size()))require(!call.contains("/commits/main")&&!call.contains("ref=main"),"Pinned directory traversed mutable branch");
                if(isGitHub)require(fixture.calls.subList(start,fixture.calls.size()).stream().anyMatch(url->url.contains("/git/trees/"+FOLDER)),"Folder was not traversed from saved root tree");
                JSONObject directoryMore=client.handle(request("repository-tree").put("sha",COMMIT).put("directory","folder").put("page",2).put("perPage",2),client.epoch());
                if(isGitHub)require(directoryMore.getJSONArray("entries").getJSONObject(0).getString("mode").equals("160000"),"Submodule metadata missing from next directory page");else require(directoryMore.getJSONArray("entries").length()==0&&!directoryMore.getBoolean("hasMore"),"GitLab directory last page claimed more entries");
                JSONObject history=client.handle(request("repository-history").put("perPage",2),client.epoch());JSONArray commits=history.getJSONArray("commits");
                require(commits.length()==2&&commits.getJSONObject(0).getJSONArray("parents").length()==2,"Merge parents missing");require(commits.getJSONObject(0).getJSONArray("parents").getString(1).equals(PARENT),"Commit parent identity/order changed");
                require(commits.getJSONObject(0).getString("message").equals("Title\n\nDetailed message\nSecond line"),"Full commit message replaced with title");require(commits.getJSONObject(1).getJSONArray("parents").length()==0,"Root commit gained fake parents");
                require(commits.getJSONObject(0).getString("url").startsWith(isGitHub?"https://github.com/test/repository/commit/":HOST+"/test/repository/-/commit/"),"Untrusted remote commit URL escaped provider");require(history.getBoolean("hasMore")&&history.getInt("nextPage")==2,"History pagination missing");
                JSONObject second=client.handle(request("repository-history").put("sha",COMMIT).put("page",2).put("perPage",2),client.epoch());require(second.getJSONArray("commits").length()==0&&!second.getBoolean("hasMore"),"Empty last history page was not explicit");
                for(String call:fixture.calls)require(!call.contains("&path=")||call.contains("/repository/tree?"),"Repository history was accidentally filtered to one file");
                JSONObject branches=client.handle(request("repository-branches"),client.epoch());require(branches.getJSONArray("branches").getJSONObject(0).getString("sha").equals(COMMIT),"Repository branch head lost");
                for(JSONObject invalid:new JSONObject[]{request("repository-tree").put("directory","../private"),request("repository-tree").put("directory",true),request("repository-history").put("repository","../bad/project"),request("repository-history").put("perPage",101),request("repository-history").put("page",0),request("repository-history").put("page",101),request("repository-history").put("page",2),request("repository-history").put("sha","not-a-sha"),request("repository-tree").put("ref","main\nother")}){
                    int count=fixture.calls.size();try{client.handle(invalid,client.epoch());throw new AssertionError("Unsafe repository metadata request accepted");}catch(IOException expected){require(fixture.calls.size()==count,"Invalid request reached transport");}
                }
                fixture.redirect=true;try{client.handle(request("repository-history"),client.epoch());throw new AssertionError("Metadata redirect followed");}catch(IOException expected){require(expected.getMessage().contains("302"),"Unexpected redirect rejection");}finally{fixture.redirect=false;}
                int epoch=client.epoch(),calls=fixture.calls.size();client.cancel();try{client.handle(request("repository-history"),epoch);throw new AssertionError("Stale metadata request accepted");}catch(IOException expected){require(expected.getMessage().contains("cancelled")&&fixture.calls.size()==calls,"Cancelled request reached transport");}
                fixture.onRead=client::cancel;try{client.handle(request("repository-history"),client.epoch());throw new AssertionError("Cancelled in-flight metadata returned data");}catch(IOException expected){require(expected.getMessage().contains("cancelled"),"In-flight cancellation was lost");}
            }
            githubFixture.wrongTree=true;try{github.handle(request("repository-tree"),github.generation());throw new AssertionError("Mismatched saved tree accepted");}catch(IOException expected){require(expected.getMessage().contains("identity mismatch"),"Tree identity mismatch was not explicit");}
            JSONArray warnings=new JSONArray();require(GitHubClient.historyMessage("Title\n\nBody\u0000"+"x".repeat(17000),warnings).length()<=16384&&warnings.length()>0,"Long commit message bound missing");
            JSONArray parents=new JSONArray();for(int i=0;i<33;i++)parents.put(CHILD);warnings=new JSONArray();require(GitHubClient.historyParents(parents,false,warnings).length()==32&&warnings.length()>0,"Oversized parent graph was not bounded explicitly");
            return checks;
        } finally {testVault.clear();new GitHubVault(context,"repository_metadata_selftest_device").clear();gitlab.reset(HOST);}
    }
    private static final class FakeConnection extends HttpsURLConnection {
        final byte[] body;final int status;final Runnable onRead;FakeConnection(URL url,byte[] body,int status,Runnable onRead){super(url);this.body=body;this.status=status;this.onRead=onRead;}
        public int getResponseCode(){require(!getInstanceFollowRedirects(),"Metadata transport enabled redirects");require(getRequestMethod().equals("GET"),"Read-only repository metadata attempted a write");require(("Bearer "+TOKEN).equals(getRequestProperty("Authorization")),"Native account credential missing or changed");return status;}
        public long getContentLengthLong(){return body.length;}public InputStream getInputStream(){onRead.run();return new ByteArrayInputStream(body);}public void disconnect(){}public boolean usingProxy(){return false;}public void connect(){}public String getCipherSuite(){return "synthetic";}public Certificate[] getLocalCertificates(){return null;}public Certificate[] getServerCertificates(){return new Certificate[0];}public Principal getPeerPrincipal(){return null;}public Principal getLocalPrincipal(){return null;}
    }
}
