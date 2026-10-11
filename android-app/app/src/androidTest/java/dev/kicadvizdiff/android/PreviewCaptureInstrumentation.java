package dev.kicadvizdiff.android;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import java.io.*;
import java.util.concurrent.*;
import org.json.*;

/** Opt-in documentation capture: packaged UI, synthetic fixture, app surface only. */
final class PreviewCaptureInstrumentation {
    final Instrumentation host;final boolean tablet;WebView web;MainActivity activity;
    PreviewCaptureInstrumentation(Instrumentation host,boolean tablet){this.host=host;this.tablet=tablet;}
    String shell(String command)throws Exception{try(var fd=host.getUiAutomation().executeShellCommand(command);var in=new FileInputStream(fd.getFileDescriptor())){return new String(in.readAllBytes()).trim();}}
    String js(String code)throws Exception{CountDownLatch latch=new CountDownLatch(1);String[] result={null};host.runOnMainSync(()->web.evaluateJavascript(code,v->{result[0]=v;latch.countDown();}));if(!latch.await(10,TimeUnit.SECONDS))throw new AssertionError("JS timeout");return result[0];}
    void settle()throws Exception{Thread.sleep(2200);js("for(const d of document.querySelectorAll('dialog[open]'))d.close();for(const d of (document.getElementById('viewer')?.contentDocument?.querySelectorAll('dialog[open]')||[]))d.close();true");Thread.sleep(200);}
    void rotate(boolean landscape,int naturalPortrait)throws Exception{host.runOnMainSync(()->activity.setRequestedOrientation(landscape?0:1));shell("wm user-rotation lock "+(landscape?1-naturalPortrait:naturalPortrait));for(int i=0;i<100;i++){if(Boolean.toString(landscape).equals(js("innerWidth>innerHeight")))return;Thread.sleep(100);}throw new AssertionError("Orientation blocked: unlock phone");}
    void capture(String name)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);int[] status={-1};android.graphics.Bitmap[] bitmap={null};
        host.runOnMainSync(()->{int[] pos=new int[2];web.getLocationInWindow(pos);android.graphics.Rect bounds=new android.graphics.Rect(pos[0],pos[1],pos[0]+web.getWidth(),pos[1]+web.getHeight());bitmap[0]=android.graphics.Bitmap.createBitmap(web.getWidth(),web.getHeight(),android.graphics.Bitmap.Config.ARGB_8888);android.view.PixelCopy.request(activity.getWindow(),bounds,bitmap[0],value->{status[0]=value;latch.countDown();},new android.os.Handler(android.os.Looper.getMainLooper()));});
        if(!latch.await(10,TimeUnit.SECONDS)||status[0]!=android.view.PixelCopy.SUCCESS)throw new AssertionError("PixelCopy failed "+status[0]);
        File dir=new File(host.getTargetContext().getFilesDir(),"native-preview");dir.mkdirs();try(var out=new FileOutputStream(new File(dir,name+".png"))){bitmap[0].compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap[0].recycle();
    }
    void run(){Bundle result=new Bundle();String auto=null,rotation=null;try{
        auto=shell("settings get system accelerometer_rotation");rotation=shell("settings get system user_rotation");
        activity=(MainActivity)host.startActivitySync(new Intent(host.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));host.runOnMainSync(()->{activity.setTurnScreenOn(true);activity.getWindow().addFlags(128);host.getTargetContext().getSystemService(android.app.KeyguardManager.class).requestDismissKeyguard(activity,null);});
        var field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);web=(WebView)field.get(activity);for(int i=0;i<100&&!"true".equals(js("!!window.KiCadAndroid"));i++)Thread.sleep(100);
        var mode=host.getTargetContext().getSystemService(android.hardware.display.DisplayManager.class).getDisplay(0).getMode();int naturalPortrait=mode.getPhysicalWidth()<mode.getPhysicalHeight()?0:1;shell("settings put system accelerometer_rotation 0");rotate(false,naturalPortrait);settle();if(tablet){js("window.KiCadAndroid.showHome();true");settle();capture("tablet-home");}
        String fixture;try(var in=host.getContext().getAssets().open("native-preview-project.json")){fixture=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);}js("window.KiCadAndroid.receiveProject("+fixture+");true");settle();capture(tablet?"tablet-schematic-portrait":"phone-schematic-portrait");
        js("window.KiCadAndroid.openDrawing('test-board.kicad_pcb');true");settle();capture(tablet?"tablet-layout-portrait":"phone-layout-portrait");rotate(true,naturalPortrait);settle();capture(tablet?"tablet-layout-landscape":"phone-layout-landscape");result.putString("stream","App-only native previews captured\n");
    }catch(Throwable error){result.putString("stream",android.util.Log.getStackTraceString(error));result.putString("error",error.toString());}
    finally{try{byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest("local\nnative-preview-sensor".getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder id=new StringBuilder();for(byte b:hash)id.append(String.format(java.util.Locale.ROOT,"%02x",b&255));new ProjectLibrary(host.getTargetContext()).handle(new JSONObject().put("action","remove").put("id",id.toString()),null);}catch(Exception ignored){}try{shell("wm user-rotation free");if(rotation!=null)shell("settings put system user_rotation "+Integer.parseInt(rotation));if(auto!=null)shell("settings put system accelerometer_rotation "+Integer.parseInt(auto));if(web!=null)js("window.KiCadAndroid?.showHome();true");}catch(Exception error){result.putString("restoreError",error.toString());}if(activity!=null)host.runOnMainSync(activity::finish);host.finish(result.containsKey("error")?1:0,result);}
    }
}

