package dev.kicadvizdiff.android;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONObject;
import java.io.IOException;

final class TemporaryProjectSettings {
    private final Context context;
    private final SharedPreferences preferences;
    TemporaryProjectSettings(Context context) { this.context=context;preferences=context.getSharedPreferences("temporary_project_settings",Context.MODE_PRIVATE); }
    int durationMinutes() { int minutes=preferences.getInt("durationMinutes",360);return minutes>=30&&minutes<=360?minutes:360; }
    String durationLabel() { int minutes=durationMinutes(),hours=minutes/60,remainder=minutes%60;return hours==0?minutes+" minutes":hours+(hours==1?" hour":" hours")+(remainder==0?"":" "+remainder+(remainder==1?" minute":" minutes")); }
    void setDuration(JSONObject request) throws Exception {
        Object value=request.get("minutes");int minutes=request.getInt("minutes");
        if(!(value instanceof Number)||request.getDouble("minutes")!=minutes||minutes<30||minutes>360)throw new IOException("Choose a duration from 30 to 360 minutes");
        if(!preferences.edit().putInt("durationMinutes",minutes).commit())throw new IOException("Could not save temporary duration");
    }
    boolean remindersEnabled() { return preferences.getBoolean("remindersEnabled",true); }
    void enableReminders() throws IOException { if(!preferences.edit().putBoolean("remindersEnabled",true).commit())throw new IOException("Could not enable reminders"); }
    boolean notificationsAllowed() {
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        android.app.NotificationChannel channel=manager==null?null:manager.getNotificationChannel(TemporaryProjectReminders.CHANNEL);
        return manager!=null && manager.areNotificationsEnabled()
            && (channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE)
            && (Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);
    }
    boolean offerOnce() { if(preferences.getBoolean("permissionOffered",false))return false;return preferences.edit().putBoolean("permissionOffered",true).commit(); }
    JSONObject result() throws Exception { return new JSONObject().put("durationMinutes",durationMinutes()).put("remindersEnabled",remindersEnabled()).put("notificationsAllowed",notificationsAllowed()); }
    static long reminderAt(JSONObject project) {
        long expiry=project.optLong("expiresAt",0),created=project.optLong("createdAt",expiry-DiskProjectStore.TEMP_LIFETIME);
        long duration=expiry-created;
        return duration>0 && duration<=DiskProjectStore.TEMP_LIFETIME ? created+(duration*4)/5 : expiry;
    }
}
