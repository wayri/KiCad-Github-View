package dev.kicadvizdiff.android;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Explicit opt-in live acceptance. Only posts disposable comments to the
 * authorized KiView test issue, through the real composer and confirmation UI.
 * Paste is a DOM ClipboardEvent, not evidence of Android system clipboard use. */
final class CommentAcceptanceChecks {
    private static final String REPO="wayri/KiCad-Github-View",SHA="77bd7e87fddc6da4d7ae966a60dcc364ee519353",FILE="examples/sensor/sensor.kicad_pcb",ISSUE="https://github.com/wayri/KiCad-Github-View/issues/1";
    private final Instrumentation host;
    private final PreviewCaptureInstrumentation probe;
    private final Bundle result=new Bundle();
    private int checks,confirmations,verified;
    private CommentAcceptanceChecks(Instrumentation host){this.host=host;probe=new PreviewCaptureInstrumentation(host,false);}
    static Bundle run(Instrumentation host){return new CommentAcceptanceChecks(host).run();}
    private void waitFor(String expression,String stage)throws Exception {
        long until=android.os.SystemClock.elapsedRealtime()+90000;
        while(android.os.SystemClock.elapsedRealtime()<until){if("true".equals(probe.js(expression)))return;Thread.sleep(250);}
        throw new AssertionError(stage+" timed out");
    }
    private void check(String expression,String message)throws Exception {if(!"true".equals(probe.js(expression)))throw new AssertionError(message);checks++;}
    private String string(String expression)throws Exception {Object value=new JSONTokener(probe.js(expression)).nextValue();return value instanceof String?(String)value:"";}
    private void capture(String name)throws Exception {
        CountDownLatch ready=new CountDownLatch(1);host.runOnMainSync(()->probe.web.postVisualStateCallback(System.nanoTime(),new WebView.VisualStateCallback(){@Override public void onComplete(long id){probe.web.postOnAnimation(ready::countDown);}}));
        if(!ready.await(10,TimeUnit.SECONDS))throw new AssertionError("Screenshot frame did not become ready");
        Bitmap screen=host.getUiAutomation().takeScreenshot();if(screen==null)throw new AssertionError("UiAutomation screenshot unavailable");
        int[] rect=new int[4];host.runOnMainSync(()->{probe.web.getLocationOnScreen(rect);rect[2]=probe.web.getWidth();rect[3]=probe.web.getHeight();});
        int x=Math.max(0,rect[0]),y=Math.max(0,rect[1]),width=Math.min(rect[2],screen.getWidth()-x),height=Math.min(rect[3],screen.getHeight()-y);
        if(width<1||height<1){screen.recycle();throw new AssertionError("Invalid screenshot bounds");}
        Bitmap app=Bitmap.createBitmap(screen,x,y,width,height);File dir=new File(host.getTargetContext().getExternalFilesDir(null),"comment-acceptance");if(!dir.isDirectory()&&!dir.mkdirs())throw new AssertionError("Screenshot directory unavailable");
        File target=new File(dir,name+".png");try(FileOutputStream out=new FileOutputStream(target)){if(!app.compress(Bitmap.CompressFormat.PNG,100,out))throw new AssertionError("Screenshot write failed");}finally{if(app!=screen)app.recycle();screen.recycle();}result.putString(name+"Screenshot",target.getAbsolutePath());
    }
    private void sendAndConfirm()throws Exception {
        check("(()=>{const d=__acceptanceDoc();return d.querySelector('.chat-provider-link')?.href==="+JSONObject.quote(ISSUE)+" && !d.querySelector('.chat-send')?.disabled;})()","Composer is not writable on the authorized issue");
        probe.js("__acceptanceDoc().querySelector('.chat-send').click();true");
        waitFor("!!__acceptanceDoc().querySelector('dialog.chat-send-review[open][aria-label=\"Review message destination\"]')","Composer destination confirmation");
        check("(()=>{const dlg=__acceptanceDoc().querySelector('dialog.chat-send-review[open]');return dlg.textContent.includes('wayri/KiCad-Github-View') && dlg.textContent.includes('Issue #1:');})()","Confirmation destination escaped the authorized issue");
        probe.js("(()=>{const d=__acceptanceDoc(),w=d.defaultView,dlg=d.querySelector('dialog.chat-send-review[open][aria-label=\"Review message destination\"]');const checkbox=dlg.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change',{bubbles:true}));const send=[...dlg.querySelectorAll('button')].find(b=>b.textContent==='Send message');if(!send)throw Error('Send confirmation missing');send.click();})();true");confirmations++;
        waitFor("(()=>{const d=__acceptanceDoc();return !d.querySelector('dialog.chat-send-review[open]') && !d.querySelector('.chat-send')?.disabled && (d.querySelector('.chat-status')?.textContent.startsWith('Message sent') || d.querySelector('.chat-status')?.classList.contains('error'));})()","Composer publication response");
        check("__acceptanceDoc().querySelector('.chat-status').textContent.startsWith('Message sent')","Composer did not confirm publication; inspect the issue before retrying");
        check("__acceptanceDoc().getElementById('chatMessageText').value===''","Confirmed send did not retire its text draft");
    }
    private void readback(String marker,String key)throws Exception {
        // Read-only provider API confirms actual stored content independently of
        // the composer's optimistic state. All writes above remain UI actions.
        probe.js("window.__commentAcceptance.readDone=false;window.KiCadAndroidGitHub.request({type:'review-thread',repository:"+JSONObject.quote(REPO)+",ref:"+JSONObject.quote(SHA)+",file:"+JSONObject.quote(FILE)+",kind:'issue',number:1}).then(value=>{const row=value.comments.find(c=>c.body?.includes("+JSONObject.quote(marker)+"));window.__commentAcceptance["+JSONObject.quote(key)+"]=row||null;window.__commentAcceptance.readDone=true;}).catch(()=>{window.__commentAcceptance.readFailed=true;window.__commentAcceptance.readDone=true;});true");
        waitFor("window.__commentAcceptance.readDone===true","Provider comment readback");
        check("!!window.__commentAcceptance["+JSONObject.quote(key)+"] && !window.__commentAcceptance.readFailed","Provider did not return the posted test comment");
        String url=string("window.__commentAcceptance["+JSONObject.quote(key)+"].url");if(!url.matches("https://github\\.com/wayri/KiCad-Github-View/issues/1#issuecomment-[1-9][0-9]*"))throw new AssertionError("Unexpected comment readback URL");result.putString(key+"Url",url);verified++;
        check("[...__acceptanceDoc().querySelectorAll('.chat-message')].some(node=>node.textContent.includes("+JSONObject.quote(marker)+"))","Posted comment is absent from the rendered conversation");
    }
    private Bundle run(){try{
        probe.activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));host.runOnMainSync(()->{probe.activity.setTurnScreenOn(true);probe.activity.getWindow().addFlags(128);});
        var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);probe.web=(WebView)field.get(probe.activity);
        waitFor("!!window.KiCadAndroidGitHub && !!window.KiCadAndroid","Native account bridge");
        probe.js("window.__commentAcceptance={authReady:false};window.KiCadAndroidGitHub.request({type:'auth-status'}).then(value=>{__commentAcceptance.connected=value.connected===true;__commentAcceptance.authReady=true;}).catch(()=>{__commentAcceptance.connected=false;__commentAcceptance.authReady=true;});true");waitFor("__commentAcceptance.authReady===true","Native GitHub authentication status");
        if(!"true".equals(probe.js("__commentAcceptance.connected===true"))){result.putString("blocked","GitHub account not connected");result.putString("stream","BLOCKED GitHub account not connected; no comments posted\n");return result;}
        String fixture;try(var in=host.getContext().getAssets().open("github-collaboration-project.json")){fixture=new String(in.readAllBytes(),StandardCharsets.UTF_8);}JSONObject project=new JSONObject(fixture);
        if(!REPO.equals(project.getJSONObject("github").getString("repository"))||!SHA.equals(project.getJSONObject("github").getString("sha")))throw new AssertionError("Acceptance fixture identity changed");
        // Register the retained public-source fixture with the native scope
        // guard; no user design/library import or saved CAD mutation is needed.
        var record=MainActivity.class.getDeclaredMethod("recordProject",JSONObject.class,String.class,boolean.class);record.setAccessible(true);host.runOnMainSync(()->{try{record.invoke(probe.activity,project,"https://github.com",false);}catch(Exception error){throw new RuntimeException(error);}});
        probe.js("delete window.KiCadAndroidRevisionCache;window.KiCadAndroidProject="+fixture+";document.getElementById('welcome').hidden=true;const frame=document.getElementById('viewer');frame.hidden=false;frame.src='pcb-viewer.html?repository=wayri%2FKiCad-Github-View&ref="+SHA+"&file=examples%2Fsensor%2Fsensor.kicad_pcb';window.__acceptanceDoc=()=>document.getElementById('viewer').contentDocument;true");
        waitFor("!!__acceptanceDoc()?.getElementById('commentThreadLoad') && __acceptanceDoc().getElementById('frameControls')?.hidden===false","Shared drawing review workspace");
        probe.js("(()=>{const d=__acceptanceDoc();d.getElementById('commentsButton').click();d.getElementById('commentThreadKind').value='issue';d.getElementById('commentThreadNumber').value='1';d.getElementById('commentThreadLoad').click();})();true");
        waitFor("!!__acceptanceDoc()?.getElementById('chatMessageText') && !__acceptanceDoc().getElementById('chatMessageText').disabled && __acceptanceDoc().querySelector('.chat-provider-link')?.href==="+JSONObject.quote(ISSUE),"Writable issue #1 chat composer");
        String run=java.util.UUID.randomUUID().toString().substring(0,12),textMarker="[KiView disposable acceptance "+run+"] Text composer",imageMarker="[KiView disposable acceptance "+run+"] DOM paste image";result.putString("runId",run);
        probe.js("(()=>{const d=__acceptanceDoc(),box=d.getElementById('chatMessageText');box.value="+JSONObject.quote(textMarker+"\nSent through the installed Android shared chat composer and destination confirmation. This is a disposable software acceptance comment, not a hardware finding.")+";box.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));})();true");
        capture("text-draft");sendAndConfirm();readback(textMarker,"text");capture("text-readback");
        probe.js("(()=>{const d=__acceptanceDoc(),w=d.defaultView,box=d.getElementById('chatMessageText');box.value='';box.dispatchEvent(new w.Event('input',{bubbles:true}));const canvas=d.createElement('canvas');canvas.width=160;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#163d57';ctx.fillRect(0,0,160,80);ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText('KiView paste test',12,32);ctx.font='11px sans-serif';ctx.fillText('Disposable PNG fixture',12,55);const encoded=canvas.toDataURL('image/png').split(',')[1],binary=w.atob(encoded),bytes=new w.Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const file=new w.File([bytes],'kiview-acceptance.png',{type:'image/png'}),data=new w.DataTransfer();data.items.add(file);data.setData('text/plain',"+JSONObject.quote(imageMarker+"\nDisposable PNG fixture pasted using a DOM ClipboardEvent inside the installed Android WebView. This does not claim physical OS clipboard validation.")+");box.focus();const paste=new w.ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});box.dispatchEvent(paste);window.__commentAcceptance.pasteDispatched=paste.defaultPrevented;})();true");
        waitFor("(()=>{const d=__acceptanceDoc(),p=d.getElementById('chatCapturePreview');return !!p && !p.hidden && p.complete && p.naturalWidth>0 && !d.querySelector('.chat-send')?.disabled;})()","DOM-pasted image preview");
        check("window.__commentAcceptance.pasteDispatched===true","Shared paste handler did not consume the ClipboardEvent");
        check("__acceptanceDoc().getElementById('chatMessageText').value.includes("+JSONObject.quote(imageMarker)+")","Mixed clipboard text was lost");
        probe.js("(()=>{const d=__acceptanceDoc(),w=d.defaultView;__commentAcceptance.imageDraft=d.getElementById('chatMessageText').value;__commentAcceptance.preview=d.getElementById('chatCapturePreview').src;const status=d.querySelector('.chat-sync-status');__commentAcceptance.refreshObserved=false;__commentAcceptance.observer=new w.MutationObserver(()=>{if(status.textContent.startsWith('Synced'))__commentAcceptance.refreshObserved=true;});__commentAcceptance.observer.observe(status,{childList:true,characterData:true,subtree:true});})();true");
        waitFor("__commentAcceptance.refreshObserved===true","Natural automatic comment refresh with image draft");
        check("__acceptanceDoc().getElementById('chatMessageText').value===__commentAcceptance.imageDraft && __acceptanceDoc().getElementById('chatCapturePreview').src===__commentAcceptance.preview && !__acceptanceDoc().getElementById('chatCapturePreview').hidden","Automatic refresh discarded the mixed image/text draft");
        probe.js("__commentAcceptance.observer.disconnect();true");capture("image-draft-after-refresh");sendAndConfirm();readback(imageMarker,"image");
        check("(()=>{const body=__commentAcceptance.image.body;const notes=window.KiCadReviewComments.fromMarkdown(body);return body.includes('<!-- kicad-review:v1 ') && notes.some(note=>note.attachments?.some(a=>a.provider==='github' && a.width===160 && a.height===80 && a.url.startsWith('https://github.com/user-attachments/assets/')));})()","Provider readback lacks confirmed PNG attachment and drawing-anchor metadata");
        String attachment=string("window.KiCadReviewComments.fromMarkdown(__commentAcceptance.image.body).flatMap(note=>note.attachments||[]).find(a=>a.provider==='github').url");if(!attachment.matches("https://github\\.com/user-attachments/assets/[0-9a-fA-F-]{36}"))throw new AssertionError("Unexpected screenshot attachment URL");result.putString("attachmentUrl",attachment);
        check("!__acceptanceDoc().getElementById('chatCapturePreview').src.startsWith('data:') || __acceptanceDoc().getElementById('chatCapturePreview').hidden","Confirmed image send retained the preview draft");capture("image-readback");
        result.putString("stream","PASS live Android composer text and DOM image paste, confirmation, provider readback and draft preservation across automatic refresh\n");result.putBoolean("passed",true);result.putString("pasteMethod","DOM ClipboardEvent with DataTransfer File; physical Android clipboard not exercised");
    }catch(Throwable error){result.putString("error",error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));result.putString("stream","FAIL comment acceptance; inspect issue #1 before retrying an uncertain send\n");try{capture("failure");result.putString("uiStatus",string("__acceptanceDoc()?.querySelector('.chat-status')?.textContent||''"));}catch(Exception ignored){}}
    finally{try{if(probe.web!=null)probe.js("window.__commentAcceptance?.observer?.disconnect();true");}catch(Exception ignored){}result.putInt("checks",checks);result.putInt("sendConfirmationClicks",confirmations);result.putInt("providerCommentsVerified",verified);result.putString("issueUrl",ISSUE);}return result;
    }
}
