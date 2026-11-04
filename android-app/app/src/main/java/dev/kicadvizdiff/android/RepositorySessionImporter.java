package dev.kicadvizdiff.android;

import android.app.Activity;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

/** Serial, bounded file streaming from the bridge-free browser to private storage. */
final class RepositorySessionImporter {
    private final Activity activity;
    private final RepositorySessionBrowser browser;
    private final DiskProjectStore store;
    RepositorySessionImporter(Activity activity,RepositorySessionBrowser browser,DiskProjectStore store){this.activity=activity;this.browser=browser;this.store=store;}
    JSONObject load(JSONObject request)throws Exception {
        String repository=RepositorySessionPolicy.repository(request.getString("repository")),sha=request.getString("sha");
        if(!sha.matches("[a-f0-9]{40}"))throw new IOException("A pinned repository revision is required.");
        JSONArray nodes=request.getJSONArray("nodes");if(nodes.length()>2000)throw new IOException("Choose a smaller project folder.");
        JSONObject metadata=new JSONObject().put("github",new JSONObject().put("repository",repository).put("sha",sha).put("sourceRef",request.optString("sourceRef")).put("transport","website-session"));
        JSONObject project=store.importProject(repository,nodes,(path,target,unused)->download(repository,sha,path,target),metadata,request.optBoolean("temporary",true),1);
        return new JSONObject().put("project",project).put("repository",repository).put("sha",sha).put("private",true);
    }
    private JSONObject call(String repository,JSONObject operation)throws Exception {
        NativeLoadOperation.checkCurrent();ManagedPolicy.requireNetwork(activity);
        String requestId=java.util.UUID.randomUUID().toString();operation.put("requestId",requestId);
        CountDownLatch done=new CountDownLatch(1);JSONObject[] value={null};String[] failure={null};
        activity.runOnUiThread(()->{try{browser.request(new JSONObject().put("action","dispatch").put("repository",repository).put("operation",operation),(result,error)->{value[0]=result;failure[0]=error;done.countDown();});}catch(Exception error){failure[0]="Repository browser unavailable.";done.countDown();}});
        long deadline=android.os.SystemClock.elapsedRealtime()+70000;
        try{while(!done.await(100,TimeUnit.MILLISECONDS)){NativeLoadOperation.checkCurrent();if(android.os.SystemClock.elapsedRealtime()>deadline)throw new IOException("Repository file read timed out.");}}
        catch(Exception cancelled){activity.runOnUiThread(()->browser.cancelRequest(requestId));throw cancelled;}
        NativeLoadOperation.checkCurrent();if(failure[0]!=null||value[0]==null)throw new IOException(failure[0]==null?"Repository file unavailable.":failure[0]);return value[0];
    }
    private void download(String repository,String sha,String path,File target)throws Exception {
        boolean asset=ProjectImporter.isAsset(path);long limit=asset?32L*1024*1024:64L*1024*1024;
        JSONObject result=call(repository,new JSONObject().put("type","source").put("repository",repository).put("action",asset?"asset":"file").put("ref",sha).put("path",path).put("limit",limit));
        JSONObject transfer=result.getJSONObject("transfer");String id=transfer.getString("id");long expected=transfer.getLong("bytes");int count=transfer.getInt("chunks"),characters=transfer.getInt("characters");
        if(!id.matches("[a-fA-F0-9-]{36}")||!sha.equals(transfer.getString("sha"))||!transfer.optString("encoding").equals("base64")||expected<0||expected>limit||characters<0||characters>128*1024*1024||count!=(characters+262143)/262144)throw new IOException("Invalid repository file transfer.");
        long bytes=0;int receivedCharacters=0;
        try(OutputStream output=new FileOutputStream(target)){
            for(int i=0;i<count;i++){
                JSONObject chunk=call(repository,new JSONObject().put("type","chunk").put("repository",repository).put("id",id).put("index",i));String data=chunk.getString("base64");
                if(chunk.getInt("index")!=i||chunk.getBoolean("last")!=(i==count-1)||data.length()!=Math.min(262144,characters-receivedCharacters)||!data.matches("[A-Za-z0-9+/]*={0,2}"))throw new IOException("Invalid repository transfer chunk.");
                byte[] decoded=Base64.decode(data,Base64.NO_WRAP);bytes+=decoded.length;receivedCharacters+=data.length();if(bytes>expected)throw new IOException("Repository file exceeded its declared size.");output.write(decoded);
            }
            if(bytes!=expected||receivedCharacters!=characters)throw new IOException("Repository file download was incomplete.");
        }finally{try{call(repository,new JSONObject().put("type","discard").put("repository",repository).put("id",id));}catch(Exception ignored){/* In-page transfer also expires after two minutes. */}}
    }
}
