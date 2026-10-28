package dev.kicadvizdiff.android;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.webkit.WebView;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.*;

/** Opt-in native WebView acceptance using unchanged public KiCad demo bytes. No remote APIs. */
final class RendererAcceptanceChecks {
    final Instrumentation host;MainActivity activity;WebView web;int checks,anrCount;final JSONArray nativePrompts=new JSONArray();
    static final String FRAME="window.__rendererAcceptanceWindow";
    RendererAcceptanceChecks(Instrumentation host){this.host=host;}
    static Bundle run(Instrumentation host){return new RendererAcceptanceChecks(host).run();}
    void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    String js(String code)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);String[] value={null};
        host.runOnMainSync(()->web.evaluateJavascript(code,result->{value[0]=result;latch.countDown();}));
        if(!latch.await(15,TimeUnit.SECONDS))throw new AssertionError("Renderer JavaScript timeout");return value[0];
    }
    boolean bool(String code)throws Exception{return "true".equals(js(code));}
    void waitFor(String code,int seconds,String message)throws Exception{
        long end=System.currentTimeMillis()+seconds*1000L;while(System.currentTimeMillis()<end){if(bool(code)){checks++;return;}Thread.sleep(200);}throw new AssertionError(message+"; state="+js("JSON.stringify({ready:document.readyState,frame:!!"+FRAME+",stats:"+FRAME+"?.__rendererAcceptance?.getRenderStats?.()})"));
    }
    JSONObject stats()throws Exception{return new JSONObject((String)new JSONTokener(js("JSON.stringify("+FRAME+".__rendererAcceptance.getRenderStats())")).nextValue());}
    AccessibilityNodeInfo findText(AccessibilityNodeInfo node,String value,int depth){
        if(node==null||depth>40)return null;if(node.isVisibleToUser()&&node.getText()!=null&&node.getText().toString().equalsIgnoreCase(value))return node;
        for(int i=0;i<node.getChildCount();i++){var found=findText(node.getChild(i),value,depth+1);if(found!=null)return found;}return null;
    }
    String nodeText(AccessibilityNodeInfo node,int depth){if(node==null||depth>30)return "";StringBuilder value=new StringBuilder();if(node.getText()!=null)value.append(node.getText()).append(' ');for(int i=0;i<node.getChildCount()&&value.length()<12000;i++)value.append(nodeText(node.getChild(i),depth+1));return value.toString();}
    boolean clickNode(AccessibilityNodeInfo node){for(int i=0;node!=null&&i<4;i++,node=node.getParent())if(node.isVisibleToUser()&&node.isEnabled()&&node.isClickable())return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);return false;}
    void clearKnownNativePrompts()throws Exception{
        var service=host.getUiAutomation().getServiceInfo();service.flags|=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;host.getUiAutomation().setServiceInfo(service);
        for(int attempt=0;attempt<4;attempt++){
            boolean clicked=false;for(AccessibilityWindowInfo window:host.getUiAutomation().getWindows()){
                var node=window.getRoot();if(node==null)continue;String pkg=String.valueOf(node.getPackageName());if(!pkg.equals("android")&&!pkg.equals("com.android.systemui"))continue;
                String text=nodeText(node,0);boolean anr=text.contains("isn't responding")||text.contains("is not responding");
                AccessibilityNodeInfo button=anr?findText(node,"Wait",0):findText(node,"Got it",0);
                if(button!=null){if(anr&&++anrCount>1)throw new AssertionError("Recurring native ANR blocks visual acceptance: "+text);require(clickNode(button),"Cannot dismiss observed native prompt");nativePrompts.put(new JSONObject().put("package",pkg).put("action",anr?"Wait":"Got it").put("anr",anr));clicked=true;Thread.sleep(anr?1800:400);break;}
                require(!anr,"Native ANR has no observed Wait action; visual acceptance blocked");
            }if(!clicked)return;
        }throw new AssertionError("Native first-run prompt did not clear");
    }
    void compositorReady()throws Exception{
        CountDownLatch ready=new CountDownLatch(1);host.runOnMainSync(()->{web.postVisualStateCallback(System.nanoTime(),new WebView.VisualStateCallback(){@Override public void onComplete(long requestId){ready.countDown();}});web.invalidate();});require(ready.await(20,TimeUnit.SECONDS),"WebView compositor did not present visual state");
    }
    void prepareCapture()throws Exception{
        clearKnownNativePrompts();
        js("(()=>{const dialog=document.getElementById('androidQuickStart');if(dialog?.open){const skip=dialog.querySelector('button[aria-label=\"Skip introduction\"]');if(skip&&!skip.disabled&&skip.getClientRects().length)skip.click();}return true;})()");
        require(bool("(()=>{const check=w=>{try{if([...w.document.querySelectorAll('dialog[open]')].some(d=>d.getClientRects().length))return false;for(let i=0;i<w.frames.length;i++)if(!check(w.frames[i]))return false;}catch{return false;}return true;};return check(window);})()"),"An app dialog covers renderer acceptance");
        compositorReady();clearKnownNativePrompts();
        var activeRoot=host.getUiAutomation().getRootInActiveWindow();require(activeRoot!=null&&host.getTargetContext().getPackageName().equals(String.valueOf(activeRoot.getPackageName())),"App is not the active native window for capture");
        for(AccessibilityWindowInfo window:host.getUiAutomation().getWindows()){
            var node=window.getRoot();if(node==null)continue;String text=nodeText(node,0),pkg=String.valueOf(node.getPackageName());
            require(!text.contains("isn't responding")&&!text.contains("is not responding"),"Native ANR still covers renderer");
            require(!(window.isFocused()&&window.getType()==AccessibilityWindowInfo.TYPE_APPLICATION&&!pkg.equals(host.getTargetContext().getPackageName())),"A native window covers app capture: "+pkg);
        }
        require(bool("(()=>{const w="+FRAME+",host=w?.__rendererAcceptance?.host,rect=host?.getBoundingClientRect();return !!rect&&rect.width>100&&rect.height>100&&!w.__rendererAcceptance.getRenderStats().contextLost;})()"),"Renderer surface is hidden or invalid");
    }
    void screenshot(File directory,String name)throws Exception{prepareCapture();captureRaw(directory,name);}
    void captureRaw(File directory,String name)throws Exception{
        Bitmap bitmap=host.getUiAutomation().takeScreenshot();require(bitmap!=null,"Native screenshot unavailable");
        try(FileOutputStream out=new FileOutputStream(new File(directory,name+".png"))){require(bitmap.compress(Bitmap.CompressFormat.PNG,100,out),"Screenshot encoding failed");}finally{bitmap.recycle();}
    }
    Bundle run(){
        Bundle result=new Bundle();JSONObject report=new JSONObject();String originalQuality=null;File output=new File(host.getTargetContext().getExternalFilesDir(null),"renderer-acceptance");
        try{
            require(output.isDirectory()||output.mkdirs(),"Cannot create acceptance output directory");
            activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            host.runOnMainSync(()->{activity.setTurnScreenOn(true);activity.getWindow().addFlags(128);host.getTargetContext().getSystemService(android.app.KeyguardManager.class).requestDismissKeyguard(activity,null);});
            var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);web=(WebView)field.get(activity);
            waitFor("!!window.KiCadAndroid?.receiveProject",30,"Android project runtime unavailable");
            clearKnownNativePrompts();js("document.getElementById('androidQuickStart')?.querySelector('button[aria-label=\"Skip introduction\"]')?.click();true");
            String fixture;try(var in=host.getContext().getAssets().open("renderer-acceptance-project.json")){fixture=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
            JSONObject project=new JSONObject(fixture),provenance=project.getJSONObject("provenance");report.put("fixture",provenance);
            require(fixture.length()<10*1024*1024,"Fixture exceeds acceptance budget");
            byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(project.getJSONArray("files").getJSONObject(0).getString("content").getBytes(StandardCharsets.UTF_8));StringBuilder hash=new StringBuilder();for(byte b:digest)hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            require(hash.toString().equals(provenance.getString("boardSha256")),"Demo board source hash changed");
            js("window.KiCadAndroid.receiveProject("+fixture+");window.KiCadAndroid.openDrawing('pic_programmer.kicad_pcb');true");
            String discover="(()=>{const find=w=>{try{const button=w.document.getElementById('mode3d');if(button&&!button.hidden&&!button.disabled&&typeof button.onclick==='function')return w;for(let i=0;i<w.frames.length;i++){const found=find(w.frames[i]);if(found)return found;}}catch{}return null;};window.__rendererAcceptanceWindow=find(window);return !!window.__rendererAcceptanceWindow;})()";
            waitFor(discover,45,"PCB viewer did not initialize");
            originalQuality=js(FRAME+".localStorage.getItem('pocket-kivi:3d-quality:v1')");
            js("(()=>{const w="+FRAME+";if(!w.SpikeBoard3D){const s=w.document.createElement('script');s.src='vendor/spike-board3d.bundle.js';w.document.head.append(s);}return true;})()");
            waitFor("!!"+FRAME+"?.SpikeBoard3D?.mountBoard3D",30,"Production WebGL engine unavailable");
            js("(()=>{const w="+FRAME+",engine=w.SpikeBoard3D;w.SpikeBoard3D={...engine,mountBoard3D(...args){return w.__rendererAcceptance=engine.mountBoard3D(...args);}};w.document.getElementById('mode3d').click();return true;})()");
            waitFor("!!"+FRAME+"?.__rendererAcceptance?.getRenderStats",45,"Production WebGL initialization failed");
            waitFor(FRAME+".__rendererAcceptance.getRenderStats().loadedModelCount==="+provenance.getInt("expectedModels"),180,"Real linked model loading incomplete");
            JSONObject initial=stats();report.put("initial",initial);require(initial.getInt("componentCount")==provenance.getInt("expectedComponents"),"Unexpected native component count");require(initial.getInt("renderCount")>0,"WebGL did not render frames");
            report.put("userAgent",new JSONTokener(js(FRAME+".navigator.userAgent")).nextValue());report.put("hardwareAccelerated",web.isHardwareAccelerated());
            for(String mode:new String[]{"balanced","high","low"}){
                int before=stats().getInt("renderCount");js(FRAME+".__rendererAcceptance.setQuality('"+mode+"');true");waitFor(FRAME+".__rendererAcceptance.getRenderStats().renderCount>"+before,30,"Quality switch failed: "+mode);
                JSONObject value=stats();require(value.getInt("pixels")<=value.getInt("maxPixels"),"Framebuffer pixel budget exceeded");require(value.getInt("width")<=value.getInt("maxDimension")&&value.getInt("height")<=value.getInt("maxDimension"),"GPU renderbuffer dimensions exceeded");
                if(mode.equals("high")){require(value.getString("quality").equals("high")&&value.getBoolean("ambientOcclusion")||value.getString("quality").equals("balanced"),"High quality neither initialized nor safely fell back");}
                else require(value.getString("quality").equals(mode),"Requested quality not applied");
                require(value.getInt("loadedModelCount")==56,"Quality switch lost linked geometry");report.put(mode,value);screenshot(output,"pic-programmer-"+mode);
            }
            js(FRAME+".__rendererAcceptance.setQuality('balanced');"+FRAME+".__rendererAcceptance.setView('top');true");Thread.sleep(600);screenshot(output,"pic-programmer-top");
            require(bool(FRAME+".__rendererAcceptance.setView('bottom')"),"Bottom camera preset failed");Thread.sleep(600);screenshot(output,"pic-programmer-bottom");
            JSONObject beforeResize=stats();js(FRAME+".__rendererAcceptance.host.style.height='70%';true");Thread.sleep(700);JSONObject afterResize=stats();report.put("resized",afterResize);require(afterResize.getInt("height")<beforeResize.getInt("height"),"Viewport resize did not update GPU buffer");js(FRAME+".__rendererAcceptance.host.style.height='100%';true");
            boolean lossSupported=bool("(()=>{const w="+FRAME+",canvas=w.__rendererAcceptance.host.shadowRoot.querySelector('canvas');w.__rendererAcceptanceLose=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');return !!w.__rendererAcceptanceLose;})()");report.put("contextLossExtension",lossSupported);
            if(lossSupported){int before=stats().getInt("renderCount");js(FRAME+".__rendererAcceptanceLose.loseContext();true");waitFor(FRAME+".__rendererAcceptance.getRenderStats().contextLost",15,"Context loss was not handled");Thread.sleep(1000);js(FRAME+".__rendererAcceptanceLose.restoreContext();true");waitFor("!"+FRAME+".__rendererAcceptance.getRenderStats().contextLost&&"+FRAME+".__rendererAcceptance.getRenderStats().renderCount>"+before,30,"Context recovery failed");JSONObject recovered=stats();report.put("recovered",recovered);require(recovered.getString("quality").equals("balanced")&&recovered.getInt("loadedModelCount")==56,"Context recovery lost quality policy or model identities");}
            js(FRAME+".__rendererAcceptance.setView('iso');true");Thread.sleep(700);screenshot(output,"pic-programmer-recovered");
            report.put("checks",checks);report.put("visualAcceptance",true);report.put("evidenceScope","Actual Android WebView app pixels; emulator evidence does not establish physical phone GPU speed, battery use, or performance.");
            result.putString("stream","Renderer acceptance passed: "+checks+" checks; outputs "+output.getAbsolutePath()+"\n");
        }catch(Throwable error){result.putString("error",error.toString());result.putString("stream",android.util.Log.getStackTraceString(error));try{report.put("visualAcceptance",false);report.put("error",error.toString());if(web!=null){report.put("runtime",js("document.body.innerText.slice(0,2000)"));captureRaw(output,"failure");}}catch(Exception ignored){}}
        finally{
            try{if(web!=null&&originalQuality!=null)js("(()=>{const w="+FRAME+";if(!w)return false;const prior="+originalQuality+";if(prior===null)w.localStorage.removeItem('pocket-kivi:3d-quality:v1');else w.localStorage.setItem('pocket-kivi:3d-quality:v1',prior);return true;})()");}catch(Exception ignored){}
            try{report.put("nativePromptsHandled",nativePrompts);report.put("nativeAnrCount",anrCount);if(anrCount>0){String warning="A native Android ANR required Wait. This emulator instability is a material limitation; this run does not establish reliable rendering performance.";report.put("emulatorLimitation",warning);result.putString("warning",warning);}}catch(Exception ignored){}
            try(FileOutputStream out=new FileOutputStream(new File(output,"report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}catch(Exception error){result.putString("reportError",error.toString());}
            result.putString("outputDirectory",output.getAbsolutePath());if(activity!=null)host.runOnMainSync(activity::finish);
        }return result;
    }
}
