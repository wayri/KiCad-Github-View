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
            delete(sandbox); // Recover only this isolated test directory after an interrupted runner.
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
            long lastOpened=reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0).getLong("lastOpened");
            check(lastOpened>0,"native open recency missing");
            reopened.handle(new JSONObject().put("action","star").put("id",id).put("value",true),null);
            check(reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0).getLong("lastOpened")==lastOpened,"star changed open recency");
            check(new ProjectLibrary(context).handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0).getBoolean("starred"),"star persistence");
            save.put("ref","b");check(reopened.handle(save,source).getJSONArray("items").length()==1,"revision duplicated bookmark");
            check(reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0).getLong("lastOpened")==lastOpened,"save changed open recency");
            save.put("offline",false).put("ref","c");JSONObject newer=reopened.handle(save,source).getJSONArray("items").getJSONObject(0);check(newer.getString("ref").equals("c")&&newer.getString("offlineRef").equals("b"),"bookmark revision relabeled old snapshot");
            try{reopened.handle(new JSONObject(save.toString()).put("name","bad\nname"),source);throw new AssertionError("invalid metadata accepted");}catch(IllegalArgumentException expected){checks++;}
            check(reopened.handle(new JSONObject().put("action","open").put("id",id),null).getJSONObject("project").getJSONArray("files").length()==1,"failed save destroyed old snapshot");
            for(File file:new File(sandbox,"project-library").listFiles())if(file.isFile()){byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());String raw=new String(bytes,java.nio.charset.StandardCharsets.ISO_8859_1);check(!raw.contains("offline-secret-source")&&!raw.contains("Test board")&&!raw.contains("NEVER_SAVE_THIS"),"plaintext at rest");}
            for(File file:new File(sandbox,"project-library").listFiles())if(file.getName().matches("[a-f0-9]{64}-[a-f0-9]{32}\\.enc")){try(RandomAccessFile edit=new RandomAccessFile(file,"rw")){edit.seek(file.length()-1);int last=edit.read();edit.seek(file.length()-1);edit.write(last^1);}}
            try{reopened.handle(new JSONObject().put("action","open").put("id",id),null);throw new AssertionError("tampered snapshot accepted");}catch(Exception expected){checks++;}
            reopened.handle(new JSONObject().put("action","remove-offline").put("id",id),null);JSONObject remaining=reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0);check(!remaining.getBoolean("offline")&&remaining.getBoolean("starred"),"copy removal erased bookmark/star");
            try{reopened.handle(new JSONObject().put("action","open").put("id",id),null);throw new AssertionError("bookmark only reopened");}catch(IllegalArgumentException expected){checks++;}
            reopened.handle(new JSONObject().put("action","remove").put("id",id),null);check(reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").length()==0,"bookmark removal");
            JSONObject recentLocal=reopened.handle(new JSONObject().put("action","save").put("remember",true).put("provider","local").put("name","Recent local"),source).getJSONArray("items").getJSONObject(0);
            check(recentLocal.getLong("lastOpened")>0&&!recentLocal.getBoolean("offline"),"remember copied local source without consent");
            check(recentLocal.getString("storage").equals("Original file not saved in app"),"local recent claims online storage");
            reopened.handle(new JSONObject().put("action","remove").put("id",recentLocal.getString("id")),null);
            String pinned="a".repeat(40);
            java.net.URL publicUrl=GitHubClient.downloadUrl("owner/test",pinned,"sub folder/large board.kicad_pcb",101L*1024*1024,false);
            check(publicUrl.getHost().equals("raw.githubusercontent.com")&&publicUrl.getPath().contains("/"+pinned+"/")&&publicUrl.toString().contains("sub%20folder/large%20board"),"public raw download not pinned/encoded");
            check(GitHubClient.downloadUrl("owner/test",pinned,"main.kicad_pcb",33L*1024*1024,true).getHost().equals("api.github.com"),"private contents transport");
            try{GitHubClient.downloadUrl("owner/test",pinned,"main.kicad_pcb",101L*1024*1024,true);throw new AssertionError("unsupported private raw transport accepted");}catch(IOException expected){check(expected.getMessage().contains("not supported by this download path"),"private API limit guidance");}
            for(String bad:new String[]{"../secret","https://evil.test/a","a\\b"})try{GitHubClient.downloadUrl("owner/test",pinned,bad,1,false);throw new AssertionError("unsafe download path accepted");}catch(IOException expected){checks++;}
            DiskProjectStore disk=new DiskProjectStore(context);
            JSONArray nodes=new JSONArray().put(new JSONObject().put("type","blob").put("mode","100644").put("path","main.kicad_pcb").put("size",33L*1024*1024));
            JSONObject downloaded=disk.download("owner/test", "a".repeat(40),false,nodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){byte[] buffer=new byte[65536];for(long written=0;written<size;written+=buffer.length)output.write(buffer,0,(int)Math.min(buffer.length,size-written));}});
            JSONObject manifest=downloaded.getJSONObject("project");check(manifest.getBoolean("diskBacked"),"disk manifest missing");
            check(!manifest.getJSONArray("files").getJSONObject(0).has("content"),"large source crossed bridge");
            android.webkit.WebResourceResponse diskResponse=disk.response(android.net.Uri.parse("https://appassets.androidplatform.net"+manifest.getJSONArray("files").getJSONObject(0).getString("diskPath")));
            check(diskResponse!=null,"downloaded source inaccessible");diskResponse.getData().close();
            JSONObject diskSaved=reopened.handle(new JSONObject().put("action","save").put("offline",true).put("provider","github").put("repository","owner/test").put("name","Large board"),manifest).getJSONArray("items").getJSONObject(0);
            check(reopened.handle(new JSONObject().put("action","open").put("id",diskSaved.getString("id")),null).getJSONObject("project").getBoolean("diskBacked"),"disk library reopen failed");
            reopened.handle(new JSONObject().put("action","remove-offline").put("id",diskSaved.getString("id")),null);
            check(disk.response(android.net.Uri.parse("https://appassets.androidplatform.net"+manifest.getJSONArray("files").getJSONObject(0).getString("diskPath")))==null,"removed disk copy retained");
            JSONObject noCopy=reopened.handle(new JSONObject().put("action","list"),null).getJSONArray("items").getJSONObject(0);
            check(noCopy.getString("storage").equals("Online repository")&&!noCopy.getBoolean("offline"),"removed download still claims local location");
            try{disk.download("owner/test","a".repeat(40),false,nodes,(path,target,size)->{throw new IOException("cancelled");});throw new AssertionError("partial download accepted");}catch(IOException expected){checks++;}
            check(new File(sandbox,"downloaded-projects").listFiles().length==0,"partial download files retained");
            checks+=GitLabDownloadChecks.run(context);
            JSONArray tempNodes=new JSONArray().put(new JSONObject().put("type","blob").put("mode","100644").put("path","temp.kicad_pcb").put("size",5));
            JSONObject temporary=disk.download("test/temp",pinned,false,tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},true).getJSONObject("project");
            check(temporary.optBoolean("temporary")&&temporary.getLong("expiresAt")>System.currentTimeMillis(),"temporary expiry metadata");
            check(disk.available(temporary),"temporary copy not available");
            check(disk.findRemote("github","","test/temp","").getString("id").equals(temporary.getString("id")),"temporary copy not reused for repository link");
            check(disk.findRemote("github","","TEST/temp",pinned)!=null,"pinned temporary copy not reused");
            check(disk.findRemote("github","","test/temp","different-branch")==null,"different revision reused");
            check(disk.findRemote("gitlab","https://gitlab.com","test/temp","")==null,"provider cache collision");
            GitHubClient cachedGitHub=new GitHubClient(context,"cache_selftest");
            JSONObject cachedReply=cachedGitHub.handle(new JSONObject().put("action","import").put("repository","test/temp"),cachedGitHub.generation());
            check(cachedReply.optBoolean("cached")&&cachedReply.getJSONObject("project").getString("id").equals(temporary.getString("id")),"GitHub import did not return existing download");
            JSONObject gitlabOrigin=new JSONObject().put("host","https://gitlab.com").put("repository","test/temp").put("sha",pinned).put("sourceRef","feature");
            JSONObject gitlabCached=disk.importProject("test/temp",tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},new JSONObject().put("gitlab",gitlabOrigin),true);
            GitLabClient cachedGitLab=new GitLabClient(context,url->{throw new AssertionError("Cached import attempted network access");});cachedGitLab.setDiskProjectStore(disk);
            JSONObject gitlabReply=cachedGitLab.handle(new JSONObject().put("action","import").put("host","https://gitlab.com").put("repository","test/temp").put("ref","feature"),cachedGitLab.generation());
            check(gitlabReply.optBoolean("cached")&&gitlabReply.getJSONObject("project").getString("id").equals(gitlabCached.getString("id")),"GitLab import did not reuse named branch download");
            check(disk.findRemote("gitlab","https://other.test","test/temp","feature")==null,"GitLab host cache collision");
            disk.remove(gitlabCached);
            File cacheFile=new File(new File(new File(sandbox,"temporary-projects"),temporary.getString("id")),"0");
            try(OutputStream output=new FileOutputStream(cacheFile)){output.write("bad".getBytes());}
            check(disk.findRemote("github","","test/temp","")==null,"incomplete download reused");
            try(OutputStream output=new FileOutputStream(cacheFile)){output.write("hello".getBytes());}
            JSONObject tempSaved=store.handle(new JSONObject().put("action","save").put("offline",true).put("remember",true),temporary);
            JSONObject tempItem=null;for(int i=0;i<tempSaved.getJSONArray("items").length();i++){JSONObject candidate=tempSaved.getJSONArray("items").getJSONObject(i);if(candidate.optBoolean("temporary"))tempItem=candidate;}
            check(tempItem!=null,"temporary recent entry missing");
            JSONObject reopenedTemp=store.handle(new JSONObject().put("action","open").put("id",tempItem.getString("id")),null).getJSONObject("project");
            check(reopenedTemp.optBoolean("temporary"),"reopening lost expiry");
            JSONObject kept=disk.promote(temporary);check(!kept.optBoolean("temporary")&&disk.available(kept),"temporary promotion failed");
            JSONObject keptLibrary=store.handle(new JSONObject().put("action","save").put("offline",true),reopenedTemp);
            check(keptLibrary.getJSONArray("items").length()>0,"Save offline promotion failed");
            File tempManifest=new File(new File(new File(sandbox,"temporary-projects"),temporary.getString("id")),"manifest.json");
            temporary.put("expiresAt",System.currentTimeMillis()-1);try(OutputStream output=new FileOutputStream(tempManifest)){output.write(temporary.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            JSONObject cachedAfterExpiry=disk.findRemote("github","","test/temp","");
            check(cachedAfterExpiry!=null&&!cachedAfterExpiry.optBoolean("temporary"),"expired download reused instead of permanent copy");
            check(disk.response(android.net.Uri.parse("https://appassets.androidplatform.net"+temporary.getJSONArray("files").getJSONObject(0).getString("diskPath")))==null,"expired file served");
            disk.cleanupExpired();check(!tempManifest.getParentFile().exists(),"expired temporary files retained");
            check(disk.available(kept),"cleanup removed permanent copy");
            // Update the encrypted snapshot metadata to exercise index expiry pruning.
            JSONObject expiredCopy=disk.download("test/expiry",pinned,false,tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},true).getJSONObject("project");
            expiredCopy.put("expiresAt",System.currentTimeMillis()-1);
            File expiredManifest=new File(new File(new File(sandbox,"temporary-projects"),expiredCopy.getString("id")),"manifest.json");
            try(OutputStream output=new FileOutputStream(expiredManifest)){output.write(expiredCopy.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            check(disk.findRemote("github","","test/expiry","")==null,"expired-only download reused");
            try{store.handle(new JSONObject().put("action","save").put("offline",true).put("remember",true),expiredCopy);throw new AssertionError("expired snapshot saved");}catch(Exception expected){checks++;}
            File quotaSandbox=new File(sandbox,"quota");
            ContextWrapper quotaContext=new ContextWrapper(getTargetContext()){@Override public File getNoBackupFilesDir(){return quotaSandbox;}};
            ProjectLibrary quotaLibrary=new ProjectLibrary(quotaContext);DiskProjectStore quotaDisk=new DiskProjectStore(quotaContext);
            for(int i=0;i<20;i++){JSONObject quotaSource=new JSONObject(source.toString()).put("id","quota"+i);quotaLibrary.handle(new JSONObject().put("action","save").put("provider","local").put("offline",true),quotaSource);}
            JSONObject quotaTemp=quotaDisk.download("test/quota",pinned,false,tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},true).getJSONObject("project");
            try{quotaLibrary.handle(new JSONObject().put("action","save").put("offline",true),quotaTemp);throw new AssertionError("offline quota bypassed");}catch(IllegalArgumentException expected){check(expected.getMessage().contains("Offline limit"),"unexpected failed-save result");}
            check(new File(quotaSandbox,"downloaded-projects").listFiles().length==0,"failed promotion left permanent orphan");
            check(quotaDisk.available(quotaTemp),"failed save erased temporary source");
            JSONObject shortTemp=disk.download("test/short",pinned,false,tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},true).getJSONObject("project");
            shortTemp.put("expiresAt",System.currentTimeMillis()+1000);File shortManifest=new File(new File(new File(sandbox,"temporary-projects"),shortTemp.getString("id")),"manifest.json");
            try(OutputStream output=new FileOutputStream(shortManifest)){output.write(shortTemp.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            store.handle(new JSONObject().put("action","save").put("offline",true).put("remember",true),shortTemp);
            Thread.sleep(1250);JSONObject afterExpiry=store.handle(new JSONObject().put("action","list"),null);
            JSONObject retained=null;
            for(int i=0;i<afterExpiry.getJSONArray("items").length();i++){JSONObject entry=afterExpiry.getJSONArray("items").getJSONObject(i);if(entry.optString("repository").equals("test/short"))retained=entry;}
            check(retained!=null,"expired recent entry lost");check(retained.optBoolean("expired")&&!retained.optBoolean("offline"),"expired recent claimed offline availability");check(retained.optLong("lastOpened")>0,"expired recent lost access time");
            try{store.handle(new JSONObject().put("action","open").put("id",retained.getString("id")),null);throw new AssertionError("expired recent opened");}catch(IllegalArgumentException expected){check(expected.getMessage().contains("expired"),"expired recent error unclear");}
            check(!shortManifest.getParentFile().exists(),"expired source directory retained after library cleanup");
            JSONObject manualTemp=disk.download("test/manual",pinned,false,tempNodes,(path,target,size)->{try(OutputStream output=new FileOutputStream(target)){output.write("hello".getBytes());}},true).getJSONObject("project");
            store.handle(new JSONObject().put("action","save").put("offline",true).put("remember",true),manualTemp);
            JSONObject cleared=store.handle(new JSONObject().put("action","clear-temporary"),null);check(cleared.optInt("clearedTemporary")>0,"manual cleanup removed no copies");
            check(!disk.available(manualTemp),"manual cleanup retained live temporary files");check(disk.available(kept),"manual cleanup deleted permanent copy");
            check(disk.findRemote("github","","test/manual","")==null,"manually cleared download reused");
            JSONObject manualEntry=null;for(int i=0;i<cleared.getJSONArray("items").length();i++){JSONObject entry=cleared.getJSONArray("items").getJSONObject(i);if(entry.optString("repository").equals("test/manual"))manualEntry=entry;}
            check(manualEntry!=null&&manualEntry.optBoolean("expired")&&!manualEntry.optBoolean("offline")&&manualEntry.optLong("lastOpened")>0,"manual cleanup lost recent history or left availability");
            check(store.handle(new JSONObject().put("action","clear-temporary"),null).optInt("clearedTemporary")==0,"repeat cleanup not idempotent");
            delete(sandbox);result.putString("stream","Native library checks passed: "+checks);finish(0,result);
        }catch(Throwable error){delete(sandbox);result.putString("stream","Library failure: "+error.toString());finish(1,result);}finally{delete(sandbox);}
    }
    void delete(File file){if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);}file.delete();}
}
