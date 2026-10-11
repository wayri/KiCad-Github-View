package dev.kicadvizdiff.android;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Opt-in real-display rotation acceptance using a synthetic project only. */
public final class OrientationInstrumentation {
    private WebView web;
    private final Instrumentation host;
    OrientationInstrumentation(Instrumentation host){this.host=host;}
    void cleanupLibrary() throws Exception {
        byte[] bytes=java.security.MessageDigest.getInstance("SHA-256").digest("local\nrotation-acceptance".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder id=new StringBuilder();for(byte b:bytes)id.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        try {new ProjectLibrary(getTargetContext()).handle(new JSONObject().put("action","remove").put("id",id.toString()),null);}
        catch(java.io.IOException absent){if(!absent.getMessage().contains("Saved project not found"))throw absent;}
        catch(IllegalArgumentException absent){if(!absent.getMessage().contains("Saved project not found"))throw absent;}
    }
    private android.app.UiAutomation getUiAutomation(){return host.getUiAutomation();}
    private android.content.Context getTargetContext(){return host.getTargetContext();}
    private void runOnMainSync(Runnable action){host.runOnMainSync(action);}
    private android.app.Activity startActivitySync(Intent intent){return host.startActivitySync(intent);}
    private void finish(int code,Bundle result){host.finish(code,result);}
    private String shell(String command)throws Exception{
        try(ParcelFileDescriptor fd=getUiAutomation().executeShellCommand(command);
            java.io.FileInputStream in=new java.io.FileInputStream(fd.getFileDescriptor())){
            return new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).trim();
        }
    }
    private String js(String script)throws Exception{
        CountDownLatch done=new CountDownLatch(1);String[] value={null};
        runOnMainSync(()->web.evaluateJavascript(script,result->{value[0]=result;done.countDown();}));
        if(!done.await(10,TimeUnit.SECONDS))throw new AssertionError("WebView callback timed out");
        return value[0];
    }
    private JSONObject viewport()throws Exception{return new JSONObject(js("({w:innerWidth,h:innerHeight,id:window.KiCadAndroidProject?.id||'',sticky:window.__rotationTest||'',src:document.getElementById('viewer')?.getAttribute('src')||'',error:document.getElementById('importStatus')?.textContent||''})"));}
    private JSONObject waitFor(boolean landscape)throws Exception{
        for(int i=0;i<100;i++){JSONObject size=viewport();if((size.getInt("w")>size.getInt("h"))==landscape)return size;Thread.sleep(100);}
        throw new AssertionError("Display did not reach requested orientation");
    }
    public void onStart(){Bundle result=new Bundle();String auto=null,rotation=null;MainActivity activity=null;
        try{
            auto=shell("settings get system accelerometer_rotation");rotation=shell("settings get system user_rotation");
            activity=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            MainActivity waking=activity;runOnMainSync(()->{waking.setTurnScreenOn(true);waking.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);getTargetContext().getSystemService(android.app.KeyguardManager.class).requestDismissKeyguard(waking,null);});
            java.lang.reflect.Field field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);web=(WebView)field.get(activity);
            boolean ready=false;for(int i=0;i<100;i++){if("true".equals(js("!!window.KiCadAndroid?.receiveProject"))){ready=true;break;}Thread.sleep(100);}
            if(!ready)throw new AssertionError("Packaged home did not load");
            js("window.KiCadAndroid.receiveProject({id:'rotation-acceptance',files:[{path:'root.kicad_sch',content:'(kicad_sch (version 20250114) (generator eeschema) (uuid 00000000-0000-0000-0000-000000000001) (paper \"A4\") (lib_symbols) (text \"Rotation acceptance\" (at 50 50 0) (effects (font (size 2 2))) (uuid 00000000-0000-0000-0000-000000000002)))'}],assets:[]});window.__rotationTest='preserved';true");
            int naturalPortrait=getTargetContext().getSystemService(android.hardware.display.DisplayManager.class).getDisplay(android.view.Display.DEFAULT_DISPLAY).getMode().getPhysicalWidth()<getTargetContext().getSystemService(android.hardware.display.DisplayManager.class).getDisplay(android.view.Display.DEFAULT_DISPLAY).getMode().getPhysicalHeight()?0:1;
            MainActivity active=activity;runOnMainSync(()->active.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));shell("settings put system accelerometer_rotation 0");shell("wm user-rotation lock "+naturalPortrait);JSONObject portrait=waitFor(false);Thread.sleep(1500);
            runOnMainSync(()->active.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));shell("wm user-rotation lock "+(1-naturalPortrait));JSONObject landscape=waitFor(true);Thread.sleep(1500);
            if(field.get(activity)!=web||!"preserved".equals(landscape.getString("sticky"))||!"rotation-acceptance".equals(landscape.getString("id"))||landscape.getString("src").isEmpty()||!landscape.getString("error").isEmpty())throw new AssertionError("Rotation lost the active viewer");
            js("for(const d of document.querySelectorAll('dialog[open]'))d.close();for(const d of (document.getElementById('viewer')?.contentDocument?.querySelectorAll('dialog[open]')||[]))d.close();true");
            Thread.sleep(200);
            File screenshot=new File(getTargetContext().getFilesDir(),"orientation-acceptance.png");
            try(FileOutputStream out=new FileOutputStream(screenshot)){getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
            runOnMainSync(()->active.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));shell("wm user-rotation lock "+naturalPortrait);JSONObject restored=waitFor(false);
            if(!"preserved".equals(restored.getString("sticky")))throw new AssertionError("Return to portrait reloaded viewer");
            result.putString("stream","PASS portrait="+portrait+" landscape="+landscape+" restored="+restored+"\n");result.putString("screenshot",screenshot.getAbsolutePath());
        }catch(Throwable error){result.putString("stream",android.util.Log.getStackTraceString(error));result.putString("error",error.toString());}
        finally{try{shell("wm user-rotation free");if(rotation!=null)shell("settings put system user_rotation "+Integer.parseInt(rotation));if(auto!=null)shell("settings put system accelerometer_rotation "+Integer.parseInt(auto));}catch(Exception error){result.putString("restoreError",error.toString());}if(activity!=null){MainActivity finishActivity=activity;runOnMainSync(finishActivity::finish);}finish(result.containsKey("error")?1:0,result);}
    }
}




