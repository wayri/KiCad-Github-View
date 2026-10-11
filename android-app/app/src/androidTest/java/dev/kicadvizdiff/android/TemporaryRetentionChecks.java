package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class TemporaryRetentionChecks {
    private static int checks;
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    static int run(Context original)throws Exception {
        checks=0;File sandbox=new File(original.getNoBackupFilesDir(),"retention-selftest");
        Context context=new ContextWrapper(original){@Override public Context getApplicationContext(){return this;}
            @Override public File getNoBackupFilesDir(){return sandbox;}
            @Override public SharedPreferences getSharedPreferences(String name,int mode){return original.getSharedPreferences(name+"_retention_selftest",mode);}};
        SharedPreferences preferences=context.getSharedPreferences("temporary_project_settings",Context.MODE_PRIVATE);preferences.edit().clear().commit();
        try {
            TemporaryProjectSettings settings=new TemporaryProjectSettings(context);check(settings.durationMinutes()==360,"Default duration changed");
            for(Object value:new Object[]{29,361,30.5,"30",null})try{settings.setDuration(new JSONObject().put("minutes",value));throw new AssertionError("Invalid TTL accepted");}catch(org.json.JSONException|java.io.IOException expected){checks++;}
            settings.setDuration(new JSONObject().put("minutes",30));check(new TemporaryProjectSettings(context).durationMinutes()==30,"Settings did not persist");
            DiskProjectStore disk=new DiskProjectStore(context);
            byte[] bytes="(kicad_sch (version 20250114))".getBytes(StandardCharsets.UTF_8);
            JSONArray nodes=new JSONArray().put(new JSONObject().put("path","root.kicad_sch").put("type","blob").put("mode","100644").put("size",bytes.length));
            DiskProjectStore.Downloader download=(path,target,size)->{try(FileOutputStream out=new FileOutputStream(target)){out.write(bytes);}};
            JSONObject project=disk.importProject("Retention test",nodes,download,null,true);
            long created=project.getLong("createdAt"),expiry=project.getLong("expiresAt");
            check(expiry-created==30*60000L,"Configured expiration mismatch");
            check(TemporaryProjectSettings.reminderAt(project)==created+24*60000L,"80 percent reminder mismatch");
            settings.setDuration(new JSONObject().put("minutes",360));
            check(disk.temporaryProject(project.getString("id")).getLong("expiresAt")==expiry,"Changing setting extended an existing copy");
            disk.reminderHandled(project.getString("id"),false);
            JSONObject dismissed=disk.temporaryProject(project.getString("id"));
            check(dismissed.getBoolean("reminderShown")&&dismissed.getLong("expiresAt")==expiry,"No extended expiry or lost single reminder state");
            ProjectLibrary library=new ProjectLibrary(context);
            library.keepTemporary(project.getString("id"));
            JSONObject kept=library.keptTemporary(project.getString("id"));
            check(kept!=null&&!kept.optBoolean("temporary")&&kept.getBoolean("offline"),"Keep did not create permanent offline copy");
            check(disk.available(project)&&disk.available(kept),"Promotion removed original or saved copy");
            check(disk.temporaryProject(project.getString("id")).getBoolean("keptOffline"),"Keep reminder not suppressed");
            int count=library.handle(new JSONObject().put("action","list"),null).getJSONArray("items").length();
            library.keepTemporary(project.getString("id"));
            check(library.handle(new JSONObject().put("action","list"),null).getJSONArray("items").length()==count,"Repeated Keep duplicated a saved entry");
            JSONObject newer=disk.importProject("Six hour test",nodes,download,null,true);
            check(newer.getLong("expiresAt")-newer.getLong("createdAt")==360*60000L,"Max duration not applied to new copy");
            disk.clearTemporary();
            check(disk.available(kept),"Temporary cleanup removed a retained project");
            library.keepTemporary(project.getString("id"));check(disk.available(kept),"A committed Keep was lost after source expiration");
            try{library.keepTemporary(newer.getString("id"));throw new AssertionError("Expired/deleted Keep accepted");}catch(java.io.IOException expected){checks++;}
            check(new ProjectLibrary(context).keptTemporary(project.getString("id"))!=null,"Retained project did not survive store restart");
            File base=new File(sandbox,"downloaded-projects"),orphan=new File(base,"c".repeat(32)),unmarked=new File(base,"d".repeat(32));
            orphan.mkdir();File marker=new File(orphan,".staging");marker.createNewFile();marker.setLastModified(System.currentTimeMillis()-DiskProjectStore.TEMP_LIFETIME-1000);
            try(FileOutputStream out=new FileOutputStream(new File(orphan,"0"))){out.write(bytes);}
            unmarked.mkdir();try(FileOutputStream out=new FileOutputStream(new File(unmarked,"0"))){out.write(bytes);}
            File committedMarker=new File(new File(base,kept.getString("id")),".staging");committedMarker.createNewFile();committedMarker.setLastModified(marker.lastModified());
            disk.cleanupExpired();check(!orphan.exists(),"Proven abandoned staging not cleaned");check(unmarked.exists(),"Unmarked files were incorrectly removed");check(disk.available(kept),"Committed manifest with leftover marker was removed");
            java.lang.reflect.Field field=DiskProjectStore.class.getDeclaredField("TRANSFER_GUARD");field.setAccessible(true);
            java.util.concurrent.locks.ReentrantLock guard=(java.util.concurrent.locks.ReentrantLock)field.get(null);
            java.util.concurrent.CountDownLatch started=new java.util.concurrent.CountDownLatch(1),release=new java.util.concurrent.CountDownLatch(1);
            Thread transfer=new Thread(()->{guard.lock();try{started.countDown();try{release.await();}catch(InterruptedException ignored){}}finally{guard.unlock();}});
            transfer.start();try{check(started.await(2,java.util.concurrent.TimeUnit.SECONDS),"Transfer guard fixture failed");long before=android.os.SystemClock.elapsedRealtime();disk.backgroundCleanup();check(android.os.SystemClock.elapsedRealtime()-before<1000,"Background cleanup waited for active transfer");}
            finally{release.countDown();transfer.join(2000);}
        } finally {preferences.edit().clear().commit();delete(sandbox);new DiskProjectStore(original).scheduleCleanup();}
        return checks;
    }
    private static void delete(File file){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);file.delete();}
}
