package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.IOException;
import org.json.JSONArray;

/** Device-wide pacing survives sign-out/restart; it is not a server-side abuse boundary. */
final class ProviderWriteGuard {
    private static final Object LOCK = new Object();
    private final SharedPreferences state;
    ProviderWriteGuard(Context context) { this(context.getSharedPreferences("provider_write_pacing", Context.MODE_PRIVATE)); }
    ProviderWriteGuard(SharedPreferences state) { this.state = state; }
    void claim(String kind) throws IOException { claim(kind, System.currentTimeMillis()); }
    void claim(String kind, long now) throws IOException {
        if (!kind.equals("publish") && !kind.equals("upload")) throw new IOException("Invalid write category");
        synchronized (LOCK) {
            try {
                JSONArray history = new JSONArray(state.getString(kind, "[]")), live = new JSONArray();
                if (history.length() > 20) throw new IOException("Publication pacing state is invalid");
                int recent = 0;
                for (int i = 0; i < history.length(); i++) {
                    long previous = history.getLong(i);
                    if (now < previous || now - previous < 3000) throw new IOException("Please wait a few seconds before another " + kind);
                    if (now - previous < 60000) recent++;
                    if (now - previous < 3600000) live.put(previous);
                }
                if (recent >= 5 || live.length() >= 20) throw new IOException("Local " + kind + " limit reached; please try later");
                live.put(now);
                if (!state.edit().putString(kind, live.toString()).commit()) throw new IOException("Could not protect publication pacing");
            } catch (org.json.JSONException error) { throw new IOException("Publication pacing state is invalid"); }
        }
    }
}
