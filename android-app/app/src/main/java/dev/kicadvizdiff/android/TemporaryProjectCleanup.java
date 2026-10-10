package dev.kicadvizdiff.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Inexact Android alarm cleanup; expiry is enforced even if the OS delays the alarm. */
public final class TemporaryProjectCleanup extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult pending=goAsync();
        new Thread(() -> {
            try {
                DiskProjectStore store=new DiskProjectStore(context);store.cleanupExpired();store.scheduleCleanup();
                try { new ProjectLibrary(context).handle(new org.json.JSONObject().put("action","list"),null); }
                catch(Exception ignored) { /* Preserve an index that cannot be authenticated; prune on next open. */ }
            }
            finally { pending.finish(); }
        },"temporary-project-cleanup").start();
    }
}
