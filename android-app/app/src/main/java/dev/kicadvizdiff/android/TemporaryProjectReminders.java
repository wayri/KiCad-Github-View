package dev.kicadvizdiff.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONObject;

final class TemporaryProjectReminders {
    static final String CHANNEL="temporary-project-retention", DISMISS="dev.kicadvizdiff.android.DISMISS_TEMPORARY";
    static void cancel(Context context,String id){NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(manager!=null)manager.cancel("temporary:"+id,1);}
    static void show(Context context,JSONObject project)throws Exception {
        String id=project.getString("id");if(!id.matches("[a-f0-9]{32}"))return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(manager==null)return;
        NotificationChannel channel=new NotificationChannel(CHANNEL,"Temporary project reminders",NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("A single reminder before each temporary project expires");channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);manager.createNotificationChannel(channel);
        Intent keep=new Intent(context,KeepTemporaryProjectActivity.class).setData(Uri.parse("kicadvizdiff://temporary/"+id+"/keep")).putExtra("temporaryId",id);
        Intent no=new Intent(context,TemporaryProjectCleanup.class).setAction(DISMISS).setData(Uri.parse("kicadvizdiff://temporary/"+id+"/dismiss")).putExtra("temporaryId",id);
        int flags=PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE;
        PendingIntent retain=PendingIntent.getActivity(context,0,keep,flags),dismiss=PendingIntent.getBroadcast(context,0,no,flags);
        Notification publicVersion=new Notification.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_save).setContentTitle("Pocket KiView").setContentText("A temporary project expires soon").build();
        Notification notification=new Notification.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("Temporary project expires soon").setContentText("Keep “"+project.optString("name","KiCad project")+"” offline?")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion).setOnlyAlertOnce(true)
            .setContentIntent(retain).setDeleteIntent(dismiss).setTimeoutAfter(Math.max(1,project.getLong("expiresAt")-System.currentTimeMillis()))
            .addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context,android.R.drawable.ic_menu_save),"Keep",retain).build())
            .addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context,android.R.drawable.ic_menu_close_clear_cancel),"No",dismiss).build()).build();
        manager.notify("temporary:"+id,1,notification);
    }
}
