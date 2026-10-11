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
                DiskProjectStore store=new DiskProjectStore(context);
                if(intent!=null&&TemporaryProjectReminders.DISMISS.equals(intent.getAction())){
                    String id=intent.getStringExtra("temporaryId");if(id!=null&&id.matches("[a-f0-9]{32}"))TemporaryProjectReminders.cancel(context,id);
                }
                store.backgroundCleanup();
                // Encrypted library wrappers are pruned on next open; never wait for its transfer transaction here.
            }
            finally { pending.finish(); }
        },"temporary-project-cleanup").start();
    }
}
