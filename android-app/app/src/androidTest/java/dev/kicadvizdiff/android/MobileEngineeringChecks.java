package dev.kicadvizdiff.android;

import android.app.*;
import android.content.Intent;
import android.os.*;
import android.webkit.WebView;
import android.view.MotionEvent;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

/** App-only synthetic mechanical/PI acceptance; no repository, credentials or writes. */
final class MobileEngineeringChecks {
    final Instrumentation test;final PreviewCaptureInstrumentation probe;int checks;
    MobileEngineeringChecks(Instrumentation test){this.test=test;probe=new PreviewCaptureInstrumentation(test,false);}
    String js(String expression)throws Exception{
        // Each evaluation needs a fresh lexical scope. Repeated top-level const
        // declarations otherwise fail silently in evaluateJavascript and can
        // leave stale success flags from an earlier screenshot or interaction.
        String result=probe.js("try {\n"+expression+"\n} catch(error) { '__KIVI_TEST_ERROR__'+String(error.stack||error); }");
        if(result!=null&&result.contains("__KIVI_TEST_ERROR__"))throw new IOException("JavaScript check failed: "+result);
        return result;
    }
    void check(String expression,String message)throws Exception{if(!"true".equals(js(expression)))throw new AssertionError(message);checks++;}
    void waitFor(String expression)throws Exception{long end=SystemClock.elapsedRealtime()+45000;while(SystemClock.elapsedRealtime()<end){if("true".equals(js(expression))){checks++;return;}Thread.sleep(100);}throw new AssertionError("Timed out: "+expression+"; "+js("window.__mobileW?.document.querySelector('.fast-pi-status')?.textContent||document.getElementById('importStatus')?.textContent"));}
    void capture(String name)throws Exception{
        js("window.__mobilePaint=false;const w=window.__mobileW||window;w.requestAnimationFrame(()=>w.requestAnimationFrame(()=>{window.__mobilePaint=true;}));true");waitFor("window.__mobilePaint===true");
        CountDownLatch done=new CountDownLatch(1);test.runOnMainSync(()->probe.web.postVisualStateCallback(System.nanoTime(),new WebView.VisualStateCallback(){public void onComplete(long id){done.countDown();}}));if(!done.await(10,TimeUnit.SECONDS))throw new AssertionError("No composed frame");
        int[] bounds=new int[2];test.runOnMainSync(()->{bounds[0]=probe.web.getWidth();bounds[1]=probe.web.getHeight();});
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(bounds[0],bounds[1],android.graphics.Bitmap.Config.ARGB_8888);CountDownLatch copied=new CountDownLatch(1);int[] status={-1};
        test.runOnMainSync(()->{int[] at=new int[2];probe.web.getLocationInWindow(at);android.view.PixelCopy.request(probe.activity.getWindow(),new android.graphics.Rect(at[0],at[1],at[0]+bounds[0],at[1]+bounds[1]),bitmap,value->{status[0]=value;copied.countDown();},new Handler(Looper.getMainLooper()));});
        if(!copied.await(10,TimeUnit.SECONDS)||status[0]!=android.view.PixelCopy.SUCCESS)throw new AssertionError("PixelCopy failed");
        File directory=new File(test.getTargetContext().getExternalFilesDir(null),"mobile-engineering");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("No evidence directory");try(FileOutputStream out=new FileOutputStream(new File(directory,name+".png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{bitmap.recycle();}
    }
    void tap(double x,double y)throws Exception{
        JSONArray at=new JSONArray((String)new JSONTokener(js("JSON.stringify(__mobileScreen("+x+","+y+"))")).nextValue());
        tapAt(at);
    }
    void tapElement(String selector)throws Exception{
        JSONArray at=new JSONArray((String)new JSONTokener(js("JSON.stringify((()=>{let w=__mobileW;const e=w.document.querySelector("+JSONObject.quote(selector)+");if(!e)throw Error('Missing touch target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();let x=r.left+r.width/2,y=r.top+r.height/2;while(w!==window){const frame=w.frameElement.getBoundingClientRect();x+=frame.left;y+=frame.top;w=w.parent;}return[x,y];})())")).nextValue());
        tapAt(at);
    }
    void tapAt(JSONArray at)throws Exception{
        int[] screen=new int[2];float[] scale={1};test.runOnMainSync(()->{probe.web.getLocationOnScreen(screen);scale[0]=probe.web.getWidth()/(float)1;});
        double width=Double.parseDouble(js("innerWidth"));float px=(float)(screen[0]+at.getDouble(0)*scale[0]/width),py=(float)(screen[1]+at.getDouble(1)*scale[0]/width);long now=SystemClock.uptimeMillis();
        MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,px,py,0),up=MotionEvent.obtain(now,now+70,MotionEvent.ACTION_UP,px,py,0);try{test.sendPointerSync(down);test.sendPointerSync(up);}finally{down.recycle();up.recycle();}Thread.sleep(150);
    }
    Bundle run(){Bundle result=new Bundle();try{
        probe.activity=(MainActivity)test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));test.runOnMainSync(()->{probe.activity.setTurnScreenOn(true);probe.activity.getWindow().addFlags(128);probe.activity.setRequestedOrientation(1);});
        var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);probe.web=(WebView)field.get(probe.activity);waitFor("!!window.KiCadAndroid?.receiveProject");
        String source;try(InputStream in=test.getContext().getAssets().open("engineering-mobile-strip.kicad_pcb")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[4096];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);source=out.toString(StandardCharsets.UTF_8.name());}
        JSONObject project=new JSONObject().put("id","mobile-engineering-qa").put("files",new JSONArray().put(new JSONObject().put("path","strip.kicad_pcb").put("content",source))).put("assets",new JSONArray());
        js("document.getElementById('androidQuickStart')?.close();window.KiCadAndroid.receiveProject("+project+");window.KiCadAndroid.openDrawing('strip.kicad_pcb');true");
        waitFor("(()=>{const find=w=>{try{if(w.document.getElementById('openDraftsman')&&w.document.querySelector('.owned-canvas'))return w;for(let i=0;i<w.frames.length;i++){const found=find(w.frames[i]);if(found)return found;}}catch{}return null;};window.__mobileW=find(window);return !!__mobileW;})()");
        js("(()=>{const w=__mobileW,open=w.KiCadDraftsmanWorkspace.open;w.KiCadDraftsmanWorkspace.open=async(...a)=>w.__mobileDraft=await open(...a);w.document.getElementById('openDraftsman').click();})();true");waitFor("!!__mobileW.__mobileDraft?.getDocument&&!!__mobileW.document.querySelector('.draftsman-stage svg')");
        check("(()=>{const d=__mobileW.document,s=d.querySelector('.draftsman-stage').getBoundingClientRect(),p=d.querySelector('.draftsman-stage>[role=img]').getBoundingClientRect();return s.height>__mobileW.innerHeight*.6&&p.width>100&&p.height>50&&p.width<=s.width&&p.height<=s.height;})()","Phone Draftsman sheet is squashed or not fitted");
        check("!__mobileW.document.querySelector('.draftsman-tools-disclosure').open&&!__mobileW.document.querySelector('.draftsman-export-disclosure').open","Phone controls do not start compact");capture("draftsman-portrait");
        js("__mobileW.document.querySelector('.draftsman-tools-disclosure>summary').click();true");check("__mobileW.document.querySelector('.draftsman-tools-disclosure').open&&__mobileW.document.querySelector('.draftsman-stage').getBoundingClientRect().height>__mobileW.innerHeight*.6","Tools opening shrinks drawing");capture("draftsman-tools");
        js("__mobileW.document.querySelector('.draftsman button[aria-label=Properties]').click();true");check("(()=>{const d=__mobileW.document,a=d.querySelector('.draftsman-inspector').getBoundingClientRect(),b=d.querySelector('.draftsman').getBoundingClientRect();return a.width>b.width*.9&&a.height<=b.height*.66;})()","Phone properties is still a narrow permanent column");
        js("__mobileW.document.querySelector('.draftsman button[aria-label=Properties]').click();true");
        test.runOnMainSync(()->probe.activity.setRequestedOrientation(0));waitFor("innerWidth>innerHeight");
        waitFor("(()=>{const d=__mobileW.document,s=d.querySelector('.draftsman-stage').getBoundingClientRect(),p=d.querySelector('.draftsman-stage>[role=img]').getBoundingClientRect();return p.height>50&&p.height<=s.height&&p.width<=s.width;})()");capture("draftsman-landscape");
        test.runOnMainSync(()->probe.activity.setRequestedOrientation(1));waitFor("innerWidth<innerHeight");
        js("__mobileW.__mobileDraft.close();const w=__mobileW,p=w.KiCadOwnedCanvas.Camera.prototype,old=p.world_to_screen;p.world_to_screen=function(...args){w.__mobileCamera=this;return old.apply(this,args);};w.document.getElementById('fitDrawing').click();w.document.getElementById('openFastPI').click();true");
        waitFor("!!__mobileW.document.querySelector('.fast-pi-panel')");
        js("(()=>{const w=__mobileW,d=w.document,p=d.querySelector('.fast-pi-panel');for(const [name,value]of [['voltage','5'],['current','2'],['conductivity','58000000'],['grid','1']]){const n=p.querySelector('[name='+name+']');n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));}p.querySelector('.fast-pi-actions button').click();window.__mobileScreen=(x,y)=>{const q=w.__mobileCamera.world_to_screen({x,y}),r=d.querySelector('.owned-canvas').getBoundingClientRect();let left=r.left,top=r.top,v=w;while(v!==window){const f=v.frameElement.getBoundingClientRect();left+=f.left;top+=f.top;v=v.parent;}return [left+q.x,top+q.y];};})();true");
        check("__mobileW.document.querySelector('.fast-pi-panel').getBoundingClientRect().height<=185","Picking panel blocks the phone drawing");capture("fast-pi-picking");tap(.5,.5);check("__mobileW.document.querySelector('.fast-pi-status').textContent.includes('Source set')","Native touch source contact missed");tap(9.5,.5);
        check("__mobileW.document.querySelector('.fast-pi-status').textContent.includes('Contacts set')","Native touch load contact missed");
        js("__mobileW.document.querySelector('.fast-pi-solve').click();true");waitFor("__mobileW.document.querySelector('.fast-pi-output').textContent.includes('Voltage drop')");
        check("Math.abs(parseFloat([...__mobileW.document.querySelectorAll('.fast-pi-output p')].find(p=>p.querySelector('span')?.textContent==='Voltage drop').querySelector('strong').textContent)-2*.009/(58000000*.001*.000035))<1e-6","Packaged worker result disagrees with the copper-strip reference");
        check("(()=>{const d=__mobileW.document,p=d.querySelector('.fast-pi-panel').getBoundingClientRect(),o=d.querySelector('.fast-pi-output').getBoundingClientRect();return o.top>=p.top&&o.top<p.bottom;})()","Solved analytics remain below the visible panel");
        result.putString("metrics",(String)new JSONTokener(js("__mobileW.document.querySelector('.fast-pi-output').innerText")).nextValue());capture("fast-pi-results");
        result.putString("stream","Mobile engineering checks passed: "+checks+"; real touch contacts and packaged worker result; synthetic local board only.\n");
    }catch(Throwable error){result.putString("error",android.util.Log.getStackTraceString(error));result.putString("stream",android.util.Log.getStackTraceString(error));try{capture("failure");}catch(Exception ignored){}}
    finally{try{File directory=new File(test.getTargetContext().getExternalFilesDir(null),"mobile-engineering");JSONObject report=new JSONObject();for(String key:result.keySet())report.put(key,result.get(key));try(FileOutputStream out=new FileOutputStream(new File(directory,"report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}}catch(Exception ignored){}if(probe.activity!=null)test.runOnMainSync(()->probe.activity.setRequestedOrientation(-1));}return result;}
}
