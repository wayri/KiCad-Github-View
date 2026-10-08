package dev.kicadvizdiff.android;
import android.app.Instrumentation;
import android.content.ContextWrapper;
import android.os.Bundle;
import org.json.*;
import java.io.*;
/** Isolated native persistence acceptance; never touches the user's library. */
public final class LibraryInstrumentation extends Instrumentation {
    int checks;
    void check(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;}
    public void onCreate(Bundle args){super.onCreate(args);start();}
    public void onStart(){Bundle result=new Bundle();File sandbox=new File(getTargetContext().getNoBackupFilesDir(),"library-selftest");
        try {
            GitHubVault pendingVault = new GitHubVault(getTargetContext(),"auth_selftest_device");
            GitHubVault accountVault = new GitHubVault(getTargetContext(),"auth_selftest");accountVault.clear();pendingVault.clear();
            pendingVault.write(new JSONObject().put("deviceCode","private-device-test").put("userCode","TEST-CODE").put("expiresAt",System.currentTimeMillis()+600000).put("interval",5).toString());
            GitHubClient restored = new GitHubClient(getTargetContext(),"auth_selftest");
            check(restored.pendingDevice(),"pending authorization did not restore");check(restored.displayedCode().equals("TEST-CODE"),"displayed code did not restore");
            restored.invalidateRequests();check(new GitHubClient(getTargetContext(),"auth_selftest").pendingDevice(),"activity teardown erased pending login");
            restored.cancelDevice();check(!new GitHubClient(getTargetContext(),"auth_selftest").pendingDevice(),"cancel did not purge pending login");
            pendingVault.write(new JSONObject().put("deviceCode","expired").put("userCode","OLD-CODE").put("expiresAt",System.currentTimeMillis()-1).toString());
            check(!new GitHubClient(getTargetContext(),"auth_selftest").pendingDevice(),"expired pending login restored");check(pendingVault.read()==null,"expired pending credentials retained");
            pendingVault.clear();accountVault.clear();
            check(GitHubFailure.forbidden(403,false,"0","1600",null,null,"",1000).contains("10 minute") ,"primary rate reset");
            check(GitHubFailure.forbidden(403,false,"0","1600",null,null,"",1000).contains("anonymous"),"anonymous quota hint");
            check(GitHubFailure.forbidden(403,true,"0","1600",null,null,"",1000).contains("signed-in"),"account quota hint");
            check(GitHubFailure.forbidden(403,true,"100",null,null,"required; url=https://secret", "",1000).contains("SSO"),"SSO distinction");
            check(!GitHubFailure.forbidden(403,true,"100",null,null,"required; url=https://secret", "",1000).contains("secret"),"SSO URL disclosure");
            check(GitHubFailure.forbidden(429,true,"100",null,"120",null,"",1000).contains("2 minute"),"retry-after");
            check(GitHubFailure.forbidden(403,true,"100",null,null,null,"secondary rate limit",1000).contains("throttled"),"secondary quota");
            check(GitHubFailure.forbidden(403,true,"100",null,null,null,"private sensitive response",1000).contains("permissions"),"permission distinction");
            check(GitHubFailure.importBudget(65,57,false).contains("Sign in"),"anonymous import preflight");
            check(GitHubFailure.importBudget(65,57,true).contains("account quota"),"account import preflight");
            check(GitHubFailure.importBudget(65,5000,true)==null&&GitHubFailure.importBudget(65,-1,false)==null,"quota available or unknown");
            android.content.Intent link = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("kicadvizdiff://open?url=https%3A%2F%2Fgithub.com%2Fwayri%2FMarble"));
            check(ProjectLink.fromIntent(link).startsWith("kicadvizdiff://open?"), "redirect link intake");
            link = new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT,"Marble board\nhttps://github.com/wayri/Marble");
            check(ProjectLink.fromIntent(link).equals("https://github.com/wayri/Marble"), "Chrome share intake");
            check(ProjectLink.fromIntent(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("content://files/board.kicad_pcb"))) == null, "file intent stolen");
            check(ProjectLink.fromIntent(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("kicadvizdiff://gitlab-oauth?code=private"))) == null, "OAuth callback stolen");
            check(ProjectLink.fromIntent(new android.content.Intent("unexpected",android.net.Uri.parse("https://github.com/a/b"))) == null, "unexpected action accepted");
            for (String text : new String[]{"https://github.com/a/b https://github.com/c/d", "not a URL", new String(new char[8193])}) {
                try { ProjectLink.fromIntent(new android.content.Intent(android.content.Intent.ACTION_SEND).putExtra(android.content.Intent.EXTRA_TEXT,text)); throw new AssertionError("invalid share accepted"); }
                catch (IllegalArgumentException expected) { checks++; }
            }

            ContextWrapper context=new ContextWrapper(getTargetContext()){@Override public File getNoBackupFilesDir(){return sandbox;}};
            ProjectLibrary store=new ProjectLibrary(context);
            JSONObject source=new JSONObject().put("id","test-project").put("files",new JSONArray().put(new JSONObject().put("path","root.kicad_sch").put("content","offline-secret-source"))).put("assets",new JSONArray()).put("token","NEVER_SAVE_THIS");
            JSONObject save=new JSONObject().put("action","save").put("provider","github").put("host","https://github.com").put("repository","test/board").put("ref","a").put("name","Test board").put("offline",true);
            JSONObject item=store.handle(save,source).getJSONArray("items").getJSONObject(0);String id=item.getString("id");check(item.getBoolean("offline"),"offline copy missing");
            ProjectLibrary reopened=new ProjectLibrary(context);JSONObject opened=reopened.handle(new JSONObject().put("action","open").put("id",id),null).getJSONObject("project");
            check(opened.getJSONArray("files").getJSONObject(0).getString("content").equals("offline-secret-source"),"source roundtrip");
            check(!opened.has("github")&&!opened.has("remote")&&!opened.has("token")&&opened.getBoolean("offline"),"offline source isolation");
            check(opened.getString("libraryId").equals(id),"stable reopen identity");
            reopened.handle(new JSONObject().put("action","star").put("id",id).put("value",true),null);
            check(new ProjectLibrary(context).handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0).getBoolean("starred"),"star persistence");
            save.put("ref","b");check(reopened.handle(save,source).getJSONArray("items").length()==1,"revision duplicated bookmark");
            save.put("offline",false).put("ref","c");JSONObject newer=reopened.handle(save,source).getJSONArray("items").getJSONObject(0);check(newer.getString("ref").equals("c")&&newer.getString("offlineRef").equals("b"),"bookmark revision relabeled old snapshot");
            try{reopened.handle(new JSONObject(save.toString()).put("name","bad\nname"),source);throw new AssertionError("invalid metadata accepted");}catch(IllegalArgumentException expected){checks++;}
            check(reopened.handle(new JSONObject().put("action","open").put("id",id),null).getJSONObject("project").getJSONArray("files").length()==1,"failed save destroyed old snapshot");
            for(File file:new File(sandbox,"project-library").listFiles())if(file.isFile()){byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());String raw=new String(bytes,java.nio.charset.StandardCharsets.ISO_8859_1);check(!raw.contains("offline-secret-source")&&!raw.contains("Test board")&&!raw.contains("NEVER_SAVE_THIS"),"plaintext at rest");}
            for(File file:new File(sandbox,"project-library").listFiles())if(file.getName().matches("[a-f0-9]{64}-[a-f0-9]{32}\\.enc")){try(RandomAccessFile edit=new RandomAccessFile(file,"rw")){edit.seek(file.length()-1);int last=edit.read();edit.seek(file.length()-1);edit.write(last^1);}}
            try{reopened.handle(new JSONObject().put("action","open").put("id",id),null);throw new AssertionError("tampered snapshot accepted");}catch(Exception expected){checks++;}
            reopened.handle(new JSONObject().put("action","remove-offline").put("id",id),null);JSONObject remaining=reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0);check(!remaining.getBoolean("offline")&&remaining.getBoolean("starred"),"copy removal erased bookmark/star");
            try{reopened.handle(new JSONObject().put("action","open").put("id",id),null);throw new AssertionError("bookmark only reopened");}catch(IllegalArgumentException expected){checks++;}
            reopened.handle(new JSONObject().put("action","remove").put("id",id),null);check(reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").length()==0,"bookmark removal");
            result.putString("stream","Native library checks passed: "+checks);finish(0,result);
        }catch(Throwable error){result.putString("stream","Library failure: "+error.toString());finish(1,result);}finally{delete(sandbox);}
    }
    void delete(File file){if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);}file.delete();}
}
