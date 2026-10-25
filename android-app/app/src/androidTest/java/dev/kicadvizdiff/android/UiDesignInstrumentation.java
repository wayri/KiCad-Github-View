package dev.kicadvizdiff.android;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Opt-in, app-only UI acceptance with the retained synthetic sensor project. */
final class UiDesignInstrumentation {
    final Instrumentation host;
    final PreviewCaptureInstrumentation probe;
    int checks;
    UiDesignInstrumentation(Instrumentation host){this.host=host;probe=new PreviewCaptureInstrumentation(host,false);}
    void check(String expression,String message)throws Exception{if(!"true".equals(probe.js(expression)))throw new AssertionError(message);checks++;}
    void waitFor(String expression)throws Exception{for(int i=0;i<150;i++){if("true".equals(probe.js(expression)))return;Thread.sleep(100);}throw new AssertionError("UI did not become ready: "+expression);}
    void capture(String name)throws Exception{
        var ready=new java.util.concurrent.CountDownLatch(1);
        host.runOnMainSync(()->probe.web.postVisualStateCallback(System.nanoTime(),new WebView.VisualStateCallback(){@Override public void onComplete(long requestId){probe.web.postOnAnimation(()->probe.web.postOnAnimation(ready::countDown));}}));
        if(!ready.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new AssertionError("UI frame did not render");
        probe.capture(name);
    }
    void run(){Bundle result=new Bundle();try{
        probe.activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        host.runOnMainSync(()->{probe.activity.setTurnScreenOn(true);probe.activity.getWindow().addFlags(128);});
        var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);probe.web=(WebView)field.get(probe.activity);
        waitFor("!!window.KiCadAndroid && document.body.classList.contains('android-design')");
        int[] bounds=new int[4];host.runOnMainSync(()->{int[] at=new int[2];probe.web.getLocationInWindow(at);bounds[0]=at[0];bounds[1]=at[1];bounds[2]=probe.web.getHeight();bounds[3]=probe.activity.getWindow().getDecorView().getHeight();});
        if(bounds[0]!=0||bounds[1]!=0||bounds[2]!=bounds[3])throw new AssertionError("WebView still has native bezel padding: "+java.util.Arrays.toString(bounds));checks++;
        result.putString("edgeBounds",java.util.Arrays.toString(bounds));
        capture("design-full-bleed-home");
        String fixture;try(var in=host.getContext().getAssets().open("native-preview-project.json")){fixture=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
        probe.js("window.KiCadAndroid.receiveProject("+fixture+");true");
        waitFor("!!document.getElementById('viewer')?.contentDocument?.getElementById('androidWorkspaceHeader')");
        probe.js("window.__uiShell=()=>document.getElementById('viewer').contentDocument;window.__uiDrawing=()=>__uiShell().querySelector('#headDrawing iframe')?.contentDocument;true");
        waitFor("!!__uiDrawing()?.getElementById('androidRailToggle') && __uiDrawing().body.classList.contains('android-design')");
        check("(()=>{const doc=__uiShell(),bar=doc.getElementById('androidWorkspaceHeader'),parent=doc.getElementById('reviewHeader'),button=bar.querySelector('button'),safe=parseFloat(doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--android-safe-top'))||0;return button.getBoundingClientRect().top>=safe && bar.getBoundingClientRect().bottom<=parent.getBoundingClientRect().bottom+1;})()","Workspace header clips controls or overlaps the cutout");
        probe.js("__uiShell().querySelector('#androidWorkspaceHeader button[aria-label=\"Project actions and view options\"]').click();true");Thread.sleep(300);
        check("__uiShell().getElementById('androidWorkspaceSheet').open","Project menu did not open");
        check("__uiShell().getElementById('splitView').hidden && getComputedStyle(__uiShell().getElementById('splitView')).display==='none'","Original split button leaked into menu");
        check("__uiShell().getElementById('androidQuickSplit').textContent.includes('Split schematic')","Readable split action missing");
        capture("design-project-menu");
        probe.js("__uiShell().defaultView.KiCadAndroidUI.handleBack();__uiShell().querySelector('#workspaceTabs button[aria-label=Project]').click();true");
        waitFor("!!__uiShell().querySelector('#projectWorkspace iframe')?.contentDocument?.getElementById('androidProjectTabButton-files')");
        probe.js("window.__uiProject=()=>__uiShell().querySelector('#projectWorkspace iframe').contentDocument;__uiProject().getElementById('androidProjectTabButton-files').click();true");
        check("__uiProject().getElementById('androidProjectTab-files').hidden===false && __uiProject().getElementById('androidProjectTab-overview').hidden","Files tab did not switch");
        probe.js("__uiProject().getElementById('androidFileSearch').value='test';__uiProject().getElementById('androidProjectTabButton-reports').click();__uiProject().getElementById('androidProjectTabButton-files').click();true");
        check("__uiProject().getElementById('androidFileSearch').value==='test'","Project tab switch lost query");
        capture("design-project-files");
        probe.js("__uiProject().getElementById('androidProjectTabButton-overview').click();true");capture("design-project-overview");
        probe.js("__uiShell().querySelector('#workspaceTabs button[aria-label=Schematic]').click();true");
        waitFor("!!__uiDrawing()?.getElementById('androidRailExplorer')");
        probe.js("__uiDrawing().getElementById('androidRailToggle').click();__uiDrawing().getElementById('androidRailExplorer').click();__uiDrawing().getElementById('navNets').click();true");
        waitFor("[...__uiDrawing().querySelectorAll('#netList button')].some(b=>b.textContent.includes('SIGNAL_IN'))");
        check("![...__uiDrawing().querySelectorAll('#netList strong')].some(b=>/Unnamed network \\([a-f0-9-]{20,}/i.test(b.textContent))","UUID exposed as net display name");
        capture("design-net-list");
        probe.js("[...__uiDrawing().querySelectorAll('#netList button')].find(b=>b.textContent.includes('SIGNAL_IN')).click();__uiDrawing().getElementById('closeNavigator').click();true");
        check("__uiDrawing().getElementById('designInspector').hidden","Net highlight opened Properties implicitly");
        check("__uiDrawing().getElementById('selectionStatus').textContent.includes('SIGNAL_IN')","Highlight status lost saved net name");
        capture("design-net-highlight");
        probe.js("__uiDrawing().getElementById('propertiesButton').click();true");
        check("!__uiDrawing().getElementById('designInspector').hidden && __uiDrawing().getElementById('selectedName').textContent==='SIGNAL_IN'","Explicit net Properties did not show saved label");
        capture("design-net-properties");
        probe.js("__uiDrawing().getElementById('closeInspector').click();__uiDrawing().getElementById('fitDrawing').click();true");Thread.sleep(300);
        probe.js("window.__framePerf={writes:0,changes:[]};const doc=__uiDrawing();const observer=new MutationObserver(records=>{__framePerf.writes+=records.length;for(const r of records)__framePerf.changes.push({id:r.target.id,before:[...r.removedNodes].map(n=>n.textContent).join(''),after:[...r.addedNodes].map(n=>n.textContent).join('')});});for(const id of ['viewScale','drawingViewLabel','accelerationStatus','renderMode'])observer.observe(doc.getElementById(id),{childList:true,subtree:true});const start=performance.now();for(let i=0;i<30;i++)doc.getElementById('fitDrawing').click();__framePerf.ms=performance.now()-start;setTimeout(()=>{observer.disconnect();__framePerf.ready=true;},100);true");
        waitFor("window.__framePerf?.ready===true");
        result.putString("framePerformance",probe.js("__framePerf"));
        // Panel closing may legitimately change zoom; only redundant writes are wrong.
        check("__framePerf.changes.every(change=>change.before!==change.after)","Drawing frames redundantly rewrote unchanged status labels");
        check("!!__uiDrawing().getElementById('highlightTestpoints') && !!__uiDrawing().getElementById('filterTestpoints')","Testpoint quick actions are missing");
        probe.js("__uiDrawing().getElementById('filterTestpoints').click();true");
        check("__uiDrawing().getElementById('objectFilter').value==='testpoints' && !__uiDrawing().getElementById('allSheets').checked && __uiDrawing().activeElement.id==='partSearch'","Testpoint quick filter did not scope/focus search");
        capture("design-testpoint-filter");
        result.putString("stream","PASS Android UI design checks="+checks+"; app-only screenshots saved under files/native-preview/design-*.png\n");
    }catch(Throwable error){result.putString("stream",android.util.Log.getStackTraceString(error));result.putString("error",error.toString());try{result.putString("uiDiagnostic",probe.js("({visible:document.visibilityState,project:window.KiCadAndroidProject?.id,src:document.getElementById('viewer')?.getAttribute('src'),status:document.getElementById('importStatus')?.textContent,headFrames:document.getElementById('viewer')?.contentDocument?.querySelectorAll('#headDrawing iframe').length})"));}catch(Exception ignored){}}
    finally{try{byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest("local\nnative-preview-sensor".getBytes(StandardCharsets.UTF_8));StringBuilder id=new StringBuilder();for(byte b:hash)id.append(String.format(java.util.Locale.ROOT,"%02x",b&255));new ProjectLibrary(host.getTargetContext()).handle(new JSONObject().put("action","remove").put("id",id.toString()),null);}catch(Exception ignored){}if(probe.activity!=null)host.runOnMainSync(probe.activity::finish);host.finish(result.containsKey("error")?1:0,result);}
    }
}
