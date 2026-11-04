package dev.kicadvizdiff.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Synthetic-only website fixture. No provider account, remote write or user library. */
final class RepositoryBrowserChecks {
    static final String REPO="qa/annotations",SHA="cccccccccccccccccccccccccccccccccccccccc";
    final Instrumentation test;int checks;Activity activity;RepositorySessionBrowser browser;File sandbox;
    RepositoryBrowserChecks(Instrumentation test){this.test=test;}
    void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    static Object field(Object object,String name)throws Exception{Field f=object.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(object);}
    JSONObject request(JSONObject value)throws Exception{
        CountDownLatch done=new CountDownLatch(1);JSONObject[] result={null};String[] error={null};
        test.runOnMainSync(()->browser.request(value,(answer,failure)->{result[0]=answer;error[0]=failure;done.countDown();}));
        if(!done.await(40,TimeUnit.SECONDS))throw new AssertionError("Synthetic browser request timed out");
        if(error[0]!=null)throw new IOException(error[0]);return result[0];
    }
    JSONObject op(JSONObject value)throws Exception{return request(new JSONObject().put("action","dispatch").put("repository",REPO).put("operation",value.put("repository",REPO)));}
    void untilReady()throws Exception{
        long end=android.os.SystemClock.elapsedRealtime()+10000;
        while(android.os.SystemClock.elapsedRealtime()<end){AtomicBoolean ready=new AtomicBoolean();test.runOnMainSync(()->{try{ready.set(field(browser,"readyUrl")!=null);}catch(Exception ignored){}});if(ready.get())return;Thread.sleep(100);}
        StringBuilder state=new StringBuilder();test.runOnMainSync(()->{try{WebView web=(WebView)field(browser,"browser");state.append("url=").append(web.getUrl());for(String key:new String[]{"readyUrl","observedUrl","loading","pageFailed","foreground"})state.append(" ").append(key).append("=").append(field(browser,key));}catch(Exception error){state.append(error.toString());}});
        throw new AssertionError("Fixture did not finish loading: "+state);
    }
    Bundle run(){Bundle report=new Bundle();try{
        activity=test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        test.runOnMainSync(()->browser=new RepositorySessionBrowser(activity));
        // Install synthetic HTML before any network navigation: a real 404 for
        // the fixture namespace must not race its load callbacks.
        test.runOnMainSync(()->{try{
            Field repo=browser.getClass().getDeclaredField("repository");repo.setAccessible(true);repo.set(browser,REPO);
            java.lang.reflect.Method ensure=browser.getClass().getDeclaredMethod("ensureBrowser");ensure.setAccessible(true);ensure.invoke(browser);
        }catch(Exception error){throw new RuntimeException(error);}});
        JSONObject opened=request(new JSONObject().put("action","show").put("repository",REPO));check(opened.getBoolean("visible"),"browser did not open");
        final WebView[] web={null};test.runOnMainSync(()->{try{web[0]=(WebView)field(browser,"browser");}catch(Exception e){throw new RuntimeException(e);}});
        final String html=fixture();
        test.runOnMainSync(()->{
            android.webkit.WebViewClient original=web[0].getWebViewClient();
            web[0].setWebViewClient(new android.webkit.WebViewClient(){
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view,android.webkit.WebResourceRequest request){
                    if(request.isForMainFrame()&&request.getUrl().toString().equals("https://github.com/"+REPO+"/issues/1"))return new android.webkit.WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    return original.shouldInterceptRequest(view,request);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view,android.webkit.WebResourceRequest request){return original.shouldOverrideUrlLoading(view,request);}
                @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){original.onPageStarted(view,url,icon);}
                @Override public void onPageFinished(WebView view,String url){original.onPageFinished(view,url);}
                @Override public void doUpdateVisitedHistory(WebView view,String url,boolean reload){original.doUpdateVisitedHistory(view,url,reload);}
                @Override public void onReceivedError(WebView view,android.webkit.WebResourceRequest request,android.webkit.WebResourceError error){original.onReceivedError(view,request,error);}
                @Override public void onReceivedHttpError(WebView view,android.webkit.WebResourceRequest request,android.webkit.WebResourceResponse response){original.onReceivedHttpError(view,request,response);}
                @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){original.onReceivedSslError(view,handler,error);}
            });
            web[0].loadUrl("https://github.com/"+REPO+"/issues/1");
        });
        untilReady();
        test.runOnMainSync(()->{check(!web[0].getSettings().getAllowFileAccess(),"file access enabled");check(!web[0].getSettings().getAllowContentAccess(),"content access enabled");});
        JSONObject read=op(new JSONObject().put("type","review").put("action","read").put("number",1));check(read.getString("account").equals("qa-tester"),"actor readback");check(read.getJSONArray("comments").length()==0,"fixture had unexpected comments");
        boolean denied=false;try{request(new JSONObject().put("action","dispatch").put("repository","other/repo").put("operation",new JSONObject().put("type","review").put("action","read").put("number",1)));}catch(IOException expected){denied=true;}check(denied,"cross repository accepted");
        AtomicBoolean current=new AtomicBoolean(true);test.runOnMainSync(()->browser.setWriteGuard(()->{if(!current.get())throw new IOException("Project changed");}));
        String body="[Synthetic QA] Drawing point (10,20)";
        JSONObject prepared=op(new JSONObject().put("type","review").put("action","prepare").put("number",1).put("body",body));check(prepared.has("ticket"),"no prepare ticket");
        JSONObject verified=op(new JSONObject().put("type","review").put("action","verify").put("number",1).put("ticket",prepared.getString("ticket")));check(verified.optBoolean("verified"),"ticket state lost between dispatch calls");
        CountDownLatch sent=new CountDownLatch(1);JSONObject[] receipt={null};String[] sendError={null};
        JSONObject commit=new JSONObject().put("action","dispatch").put("repository",REPO).put("operation",new JSONObject().put("type","review").put("action","commit").put("number",1).put("ticket",prepared.getString("ticket")));
        test.runOnMainSync(()->browser.request(commit,(value,error)->{receipt[0]=value;sendError[0]=error;sent.countDown();}));
        // Exercise fresh permission verification after a real, delayed native confirmation.
        Thread.sleep(2400);
        test.runOnMainSync(()->{try{AlertDialog prompt=(AlertDialog)field(browser,"confirmation");check(prompt!=null&&prompt.isShowing(),"native send confirmation missing");prompt.getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new RuntimeException(e);}});
        check(sent.await(15,TimeUnit.SECONDS),"send did not finish");check(sendError[0]==null,"send failed: "+sendError[0]);check(receipt[0]!=null&&receipt[0].getString("messageId").equals("31"),"wrong receipt");
        JSONObject after=op(new JSONObject().put("type","review").put("action","read").put("number",1));check(after.getJSONArray("comments").length()==1,"reverse sync missed reply");check(after.getJSONArray("comments").getJSONObject(0).getString("body").equals(body),"reverse body changed");
        boolean duplicate=false;try{op(new JSONObject().put("type","review").put("action","prepare").put("number",1).put("body",body));}catch(IOException expected){duplicate=true;}check(duplicate,"duplicate draft accepted");
        prepared=op(new JSONObject().put("type","review").put("action","prepare").put("number",1).put("body","[Synthetic QA] Stale project"));current.set(false);
        boolean stale=false;try{op(new JSONObject().put("type","review").put("action","verify").put("number",1).put("ticket",prepared.getString("ticket")));}catch(IOException expected){stale=true;}check(stale,"stale project write guard bypassed");
        current.set(true);
        sandbox=new File(test.getTargetContext().getCacheDir(),"repository-browser-check-"+java.util.UUID.randomUUID());check(sandbox.mkdir(),"test sandbox creation failed");
        final File isolated=sandbox;
        ContextWrapper context=new ContextWrapper(test.getTargetContext()){@Override public Context getApplicationContext(){return this;}@Override public File getNoBackupFilesDir(){return isolated;}@Override public Object getSystemService(String name){return Context.ALARM_SERVICE.equals(name)?null:super.getSystemService(name);}};
        RepositorySessionImporter importer=new RepositorySessionImporter(activity,browser,new DiskProjectStore(context));
        JSONArray nodes=new JSONArray().put(new JSONObject().put("path","root.kicad_sch").put("mode","100644").put("type","blob").put("size",-1));
        JSONObject loaded=importer.load(new JSONObject().put("repository",REPO).put("sha",SHA).put("nodes",nodes));
        JSONObject project=loaded.getJSONObject("project");check(project.optBoolean("diskBacked"),"source was not disk backed");check(project.getJSONObject("github").optString("transport").equals("website-session"),"transport metadata lost");
        String diskPath=project.getJSONArray("files").getJSONObject(0).getString("diskPath");File source=new File(sandbox,"temporary-projects/"+project.getString("id")+"/"+diskPath.substring(diskPath.lastIndexOf('/')+1));
        byte[] bytes=new byte[(int)source.length()];try(InputStream input=new FileInputStream(source)){check(input.read(bytes)==bytes.length,"source read incomplete");}check(new String(bytes,StandardCharsets.UTF_8).equals("(kicad_sch)"),"streamed source changed");
        report.putString("stream","Synthetic repository browser checks passed: "+checks+"\nNo real provider writes or organization access.\n");
    }catch(Throwable error){report.putString("error",android.util.Log.getStackTraceString(error));}
    finally{if(browser!=null)test.runOnMainSync(()->browser.destroy());if(sandbox!=null)removeOwn(sandbox);}
    return report;}
    Bundle runPublic(){Bundle report=new Bundle();try{
        activity=test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        test.runOnMainSync(()->browser=new RepositorySessionBrowser(activity));
        String repository="wayri/KiCad-Github-View";
        JSONObject state=request(new JSONObject().put("action","open").put("repository",repository).put("url","https://github.com/"+repository+"/tree/main/examples/sensor").put("waitForReady",true));
        check(state.optBoolean("ready"),"public repository did not finish loading");
        JSONObject context=request(new JSONObject().put("action","dispatch").put("repository",repository).put("operation",new JSONObject().put("type","source").put("repository",repository).put("action","context").put("ref","HEAD")));
        check(context.getString("repository").equals(repository),"public repository identity mismatch");check(context.getString("sha").matches("[a-f0-9]{40}"),"public commit not pinned");
        String path=null;JSONArray items=context.getJSONArray("items");for(int i=0;i<items.length();i++)if(items.getJSONObject(i).getString("path").endsWith(".kicad_pcb"))path=items.getJSONObject(i).getString("path");
        check(path!=null,"public example PCB missing");
        JSONObject file=request(new JSONObject().put("action","dispatch").put("repository",repository).put("operation",new JSONObject().put("type","source").put("repository",repository).put("action","file").put("ref",context.getString("sha")).put("path",path).put("limit",1024*1024)));
        JSONObject transfer=file.getJSONObject("transfer");check(transfer.getLong("bytes")>0,"public source is empty");
        JSONObject chunk=request(new JSONObject().put("action","dispatch").put("repository",repository).put("operation",new JSONObject().put("type","chunk").put("repository",repository).put("id",transfer.getString("id")).put("index",0)));
        String source=new String(android.util.Base64.decode(chunk.getString("base64"),android.util.Base64.NO_WRAP),StandardCharsets.UTF_8);check(source.stripLeading().startsWith("(kicad_pcb"),"public file was not saved PCB source");
        report.putString("stream","Live public repository browser checks passed: "+checks+"\nRepository: "+repository+"\nFile: "+path+"\nPinned commit: "+context.getString("sha")+"\nSeparate WebView profile: "+state.optBoolean("profileIsolated")+"\nNo account API or provider writes.\n");
    }catch(Throwable error){report.putString("error",android.util.Log.getStackTraceString(error));}finally{if(browser!=null)test.runOnMainSync(()->browser.destroy());}return report;}
    void removeOwn(File file){if(file.isDirectory()){File[] list=file.listFiles();if(list!=null)for(File child:list)removeOwn(child);}file.delete();}
    String fixture()throws Exception{
        JSONObject issue=new JSONObject().put("number",1).put("url","https://github.com/"+REPO+"/issues/1").put("title","Synthetic review").put("body","Synthetic fixture only").put("state","OPEN").put("createdAt","2026-11-04T00:00:00Z").put("updatedAt","2026-11-04T00:00:00Z").put("author",new JSONObject().put("login","qa-tester")).put("viewerCanComment",true).put("locked",false).put("totalCommentsCount",0).put("timelineItems",new JSONObject().put("nodes",new JSONArray()));
        return "<!doctype html><meta name='user-login' content='qa-tester'><main><div><textarea aria-label='Add a comment'></textarea><button id='send'>Comment</button></div></main><script id='data' type='application/json'>"+issue+"</script><script>"+
        "window.fixture=JSON.parse(document.getElementById('data').textContent);document.getElementById('send').onclick=function(){let x=window.fixture;x.timelineItems.nodes.push({url:x.url+'#issuecomment-31',body:document.querySelector('textarea').value,createdAt:'2026-11-04T00:01:00Z',lastEditedAt:null,author:{login:'qa-tester'}});x.totalCommentsCount++;document.getElementById('data').textContent=JSON.stringify(x);document.querySelector('textarea').value='';};"+
        "window.fetch=async function(address){let raw=String(address),file=raw.includes('/raw/'),text=file?'(kicad_sch)':document.documentElement.outerHTML,bytes=new TextEncoder().encode(text);return{ok:true,status:200,url:file?'https://raw.githubusercontent.com/"+REPO+"/"+SHA+"/root.kicad_sch':raw,headers:new Headers({'content-type':file?'text/plain':'text/html'}),body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};};</script>";
    }
}
