package dev.kicadvizdiff.android;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import java.nio.charset.StandardCharsets;

/** Explicit live acceptance against the existing KiView test issue only.
 * The publish flag is opt-in; regular native suites never contact GitHub. */
final class GitHubPhoneInstrumentation {
    final Instrumentation host;
    final PreviewCaptureInstrumentation probe;
    GitHubPhoneInstrumentation(Instrumentation host){this.host=host;probe=new PreviewCaptureInstrumentation(host,false);}
    void waitFor(String expression)throws Exception{
        for(int i=0;i<240;i++){if("true".equals(probe.js(expression)))return;Thread.sleep(250);}
        throw new AssertionError("Phone acceptance timed out: "+expression);
    }
    void run(boolean publish){Bundle result=new Bundle();try{
        probe.activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        host.runOnMainSync(()->{probe.activity.setTurnScreenOn(true);probe.activity.getWindow().addFlags(128);});
        var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);probe.web=(android.webkit.WebView)field.get(probe.activity);
        waitFor("!!window.KiCadAndroidGitHub");
        probe.js("window.__phoneCheck={};KiCadAndroidGitHub.request({type:'auth-status'}).then(value=>{__phoneCheck.connected=value.connected;__phoneCheck.authReady=true;}).catch(error=>{__phoneCheck.error=error.message;__phoneCheck.authReady=true;});true");
        waitFor("__phoneCheck.authReady===true");
        if(!"true".equals(probe.js("__phoneCheck.connected===true")))throw new AssertionError("Android GitHub account is not connected");
        probe.js("KiCadAndroidGitHub.request({type:'review-thread',repository:'wayri/KiCad-Github-View',kind:'issue',number:1}).then(value=>{__phoneCheck.thread=value;__phoneCheck.readReady=true;}).catch(error=>{__phoneCheck.error=error.message;__phoneCheck.readReady=true;});true");
        waitFor("__phoneCheck.readReady===true");
        if(!"true".equals(probe.js("__phoneCheck.thread?.number===1 && __phoneCheck.thread.comments.length>=1")))throw new AssertionError("Phone could not read existing issue and replies");
        result.putString("nativeRead",probe.js("({issue:__phoneCheck.thread.number,state:__phoneCheck.thread.state,replies:__phoneCheck.thread.comments.length,annotations:KiCadReviewComments.fromMarkdown(__phoneCheck.thread.body).length})"));
        String fixture;try(var in=host.getContext().getAssets().open("github-collaboration-project.json")){fixture=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
        // A transient actual-source view avoids changing the user's saved library.
        probe.js("window.KiCadAndroidProject="+fixture+";document.getElementById('welcome').hidden=true;const frame=document.getElementById('viewer');frame.hidden=false;frame.src='pcb-viewer.html?repository=wayri%2FKiCad-Github-View&ref=77bd7e87fddc6da4d7ae966a60dcc364ee519353&file=examples%2Fsensor%2Fsensor.kicad_pcb';window.__phoneDrawing=()=>document.getElementById('viewer').contentDocument;true");
        waitFor("!!__phoneDrawing()?.getElementById('refreshGitHub') && __phoneDrawing().getElementById('frameControls').hidden===false");
        probe.js("const doc=__phoneDrawing();doc.getElementById('commentsButton').click();doc.getElementById('commentDestination').value='existing-issue';doc.getElementById('commentDestination').dispatchEvent(new doc.defaultView.Event('change'));doc.getElementById('threadNumber').value='1';doc.getElementById('refreshGitHub').click();true");
        waitFor("__phoneDrawing().querySelectorAll('#commentList .note').length>=1");
        result.putString("renderedRead",probe.js("({cards:__phoneDrawing().querySelectorAll('#commentList .note').length,metadata:[...__phoneDrawing().querySelectorAll('#commentList .note-meta')].filter(n=>/Review:|Issue.*open|Issue.*closed/.test(n.textContent)).map(n=>n.textContent)})"));
        if(publish){
            // Stable ID/time make reruns idempotent through the real publication receipt.
            probe.js("const win=__phoneDrawing().defaultView;const comment={id:'android-phone-20261025-statecheck',threadType:'issue',text:'[KiView test] Android phone posting and state readback\\nGenerated inside the installed Android WebView through its native GitHub transport. Review state skipped is intentional; this is not a hardware defect.',createdAt:'2026-10-25T16:20:00.000Z',updatedAt:'2026-10-25T16:20:00.000Z',severity:'info',state:'skipped',tags:['android-acceptance'],mentions:[],anchor:{repository:'wayri/KiCad-Github-View',ref:'77bd7e87fddc6da4d7ae966a60dcc364ee519353',file:'examples/sensor/sensor.kicad_pcb',uuid:'11c0163b-7b74-54a7-a1c0-8e5e1ca79cf5',reference:'R1',kind:'footprint',variant:'default',position:{x:95,y:80}}};win.chrome.runtime.sendMessage({type:'github-publish-comment',repository:'wayri/KiCad-Github-View',comment,destination:'issue',number:1}).then(value=>{__phoneCheck.publication=value;__phoneCheck.publishReady=true;}).catch(error=>{__phoneCheck.error=error.message;__phoneCheck.publishReady=true;});true");
            waitFor("__phoneCheck.publishReady===true");
            if(!"true".equals(probe.js("__phoneCheck.publication?.ok===true")))throw new AssertionError("Phone publication failed: "+probe.js("__phoneCheck.publication?.error||__phoneCheck.error"));
            result.putString("publication",probe.js("__phoneCheck.publication.result"));
            probe.js("__phoneDrawing().getElementById('refreshGitHub').click();true");
            waitFor("[...__phoneDrawing().querySelectorAll('#commentList .note')].some(card=>card.textContent.includes('Android phone posting and state readback')&&card.textContent.includes('skipped'))");
            result.putString("phonePostReadback","PASS posted annotation rendered with skipped review state");
        }
        if("true".equals(probe.js("document.visibilityState==='visible'"))){Thread.sleep(300);probe.capture("github-phone-comments");}
        result.putString("stream","PASS Android GitHub native read, rendered annotations"+(publish?", phone publication and readback":"")+"\n");
    }catch(Throwable error){result.putString("error",error.toString());result.putString("stream",android.util.Log.getStackTraceString(error));}
    finally{if(probe.activity!=null)host.runOnMainSync(probe.activity::finish);host.finish(result.containsKey("error")?1:0,result);}}
}
