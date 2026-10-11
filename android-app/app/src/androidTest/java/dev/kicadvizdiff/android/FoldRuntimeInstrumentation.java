package dev.kicadvizdiff.android;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import androidx.window.layout.*;
import java.util.List;
import org.json.JSONObject;
/** Synthetic WindowManager update through the actual native listener and trusted packaged WebView. */
final class FoldRuntimeInstrumentation {
    static void dialogApplied(PreviewCaptureInstrumentation p)throws Exception {
        p.js("document.getElementById('githubDialog').showModal();true");
        try {
            for(int i=0;i<100;i++){
                if("true".equals(p.js("(()=>{const b=document.getElementById('githubDialog').getBoundingClientRect(),r=window.KiCadAndroidUsableViewport;return !!r&&b.width>0&&b.height>0&&b.left>=r.x-1&&b.top>=r.y-1&&b.right<=r.x+r.width+1&&b.bottom<=r.y+r.height+1;})()")))return;
                Thread.sleep(50);
            }
            throw new AssertionError("Real root dialog crossed usable fold region");
        } finally {p.js("document.getElementById('githubDialog').close();true");}
    }
    static void applied(PreviewCaptureInstrumentation p,String orientation)throws Exception {
        String predicate="(()=>{if(!window.KiCadAndroidFoldUI||document.body.dataset.fold!=="+JSONObject.quote(orientation)+")return false;const b=document.body.getBoundingClientRect(),f=window.KiCadAndroidFold,w=innerWidth,h=Math.min(innerHeight,visualViewport?.height||innerHeight),close=(a,c)=>Math.abs(a-c)<1;if("+JSONObject.quote(orientation)+"==='none')return !window.KiCadAndroidUsableViewport&&close(b.x,0)&&close(b.y,0)&&close(b.width,w)&&b.height>=h-1;const r=window.KiCadAndroidUsableViewport;if(!r||!close(b.x,r.x)||!close(b.y,r.y)||!close(b.width,r.width)||!close(b.height,r.height))return false;return "+JSONObject.quote(orientation)+"==='vertical'?b.width<w&&(b.right<=f.x+1||b.left>=f.x+f.width-1):b.height<h&&(b.bottom<=f.y+1||b.top>=f.y+f.height-1);})()";
        for(int i=0;i<100;i++){if("true".equals(p.js(predicate)))return;Thread.sleep(50);}
        throw new AssertionError("Fold UI/CSS safe region not applied: "+orientation+" "+p.js("({module:!!window.KiCadAndroidFoldUI,fold:document.body.dataset.fold,box:document.body.getBoundingClientRect().toJSON(),usable:window.KiCadAndroidUsableViewport})"));
    }
    static FoldingFeature feature(Rect bounds,boolean vertical,boolean separating){return new FoldingFeature(){
        public Rect getBounds(){return bounds;}public boolean isSeparating(){return separating;}
        public Orientation getOrientation(){return vertical?Orientation.VERTICAL:Orientation.HORIZONTAL;}
        public State getState(){return State.HALF_OPENED;}public OcclusionType getOcclusionType(){return OcclusionType.NONE;}
    };}
    static void run(Instrumentation host){Bundle result=new Bundle();PreviewCaptureInstrumentation p=new PreviewCaptureInstrumentation(host,false);
        try{
            p.activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            var web=MainActivity.class.getDeclaredField("webView");web.setAccessible(true);p.web=(android.webkit.WebView)web.get(p.activity);
            var ready=MainActivity.class.getDeclaredField("pageReady");ready.setAccessible(true);
            for(int i=0;i<100;i++){host.waitForIdleSync();if(ready.getBoolean(p.activity)&&p.web.getWidth()>0)break;Thread.sleep(100);}
            if(!ready.getBoolean(p.activity))throw new AssertionError("Initial native readiness timed out");
            host.runOnMainSync(()->{p.web.clearCache(true);try{ready.setBoolean(p.activity,false);}catch(IllegalAccessException error){throw new IllegalStateException(error);}p.web.reload();});
            for(int i=0;i<100;i++){host.waitForIdleSync();if(ready.getBoolean(p.activity)&&p.web.getWidth()>0)break;Thread.sleep(100);}
            if(!ready.getBoolean(p.activity))throw new AssertionError("Native page readiness timed out");
            p.js("window.__foldRuntime='preserved';window.__foldEvents=0;addEventListener('kicad-fold-changed',()=>__foldEvents++);true");
            var callback=MainActivity.class.getDeclaredField("foldListener");callback.setAccessible(true);
            @SuppressWarnings("unchecked") androidx.core.util.Consumer<WindowLayoutInfo> listener=(androidx.core.util.Consumer<WindowLayoutInfo>)callback.get(p.activity);
            int[] location=new int[2];host.runOnMainSync(()->p.web.getLocationInWindow(location));int width=p.web.getWidth(),height=p.web.getHeight();
            Rect hinge=new Rect(location[0]+width/2,location[1],location[0]+width/2+20,location[1]+height);
            host.runOnMainSync(()->listener.accept(new WindowLayoutInfo(List.of(feature(hinge,true,true)))));
            JSONObject fold=new JSONObject(p.js("window.KiCadAndroidFold"));
            if(!fold.getBoolean("separating")||!fold.getString("orientation").equals("vertical")||fold.getDouble("x")<=0||fold.getDouble("width")<=0)throw new AssertionError("Native fold snapshot missing");
            applied(p,"vertical");
            dialogApplied(p);
            host.runOnMainSync(()->listener.accept(new WindowLayoutInfo(List.of(feature(hinge,true,false)))));
            if(!"\"none\"".equals(p.js("window.KiCadAndroidFold.orientation")))throw new AssertionError("Continuous crease retained");
            applied(p,"none");
            host.runOnMainSync(()->listener.accept(new WindowLayoutInfo(List.of(feature(new Rect(location[0],location[1]+height/2,location[0]+width,location[1]+height/2),false,true)))));
            if(!"\"horizontal\"".equals(p.js("window.KiCadAndroidFold.orientation")))throw new AssertionError("Zero-height tabletop fold lost");
            applied(p,"horizontal");
            dialogApplied(p);
            var listening=MainActivity.class.getDeclaredField("foldListening");listening.setAccessible(true);host.runOnMainSync(()->host.callActivityOnStop(p.activity));
            if(listening.getBoolean(p.activity))throw new AssertionError("Fold listener retained onStop");
            host.runOnMainSync(()->listener.accept(new WindowLayoutInfo(List.of())));
            if(!"\"horizontal\"".equals(p.js("window.KiCadAndroidFold.orientation")))throw new AssertionError("Stopped callback changed page");
            host.runOnMainSync(()->host.callActivityOnStart(p.activity));if(!listening.getBoolean(p.activity))throw new AssertionError("Fold listener not restarted");
            host.runOnMainSync(()->listener.accept(new WindowLayoutInfo(List.of())));
            if(!"true".equals(p.js("window.KiCadAndroidFold.orientation==='none'&&__foldRuntime==='preserved'&&__foldEvents>=3")))throw new AssertionError("Fold/unfold reloaded or missing events");
            applied(p,"none");
            result.putString("stream","Native fold listener / real CSS+dialog safe regions / stop-start / unfold preservation passed\n");
        }catch(Throwable error){result.putString("stream",android.util.Log.getStackTraceString(error));result.putString("error",error.toString());}
        finally{if(p.activity!=null)host.runOnMainSync(p.activity::finish);host.finish(result.containsKey("error")?1:0,result);}
    }
}
