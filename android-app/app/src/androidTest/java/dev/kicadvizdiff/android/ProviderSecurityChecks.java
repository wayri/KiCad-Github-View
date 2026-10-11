package dev.kicadvizdiff.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.IOException;

final class ProviderSecurityChecks {
    private static int checks;
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); checks++; }
    private static void blocked(ProviderWriteGuard guard, String kind, long now) throws Exception {
        try { guard.claim(kind, now); throw new AssertionError("Unpaced write accepted"); }
        catch (IOException expected) { checks++; }
    }
    static int run(Context context) throws Exception {
        checks = 0;
        check(NativeBridgePolicy.trustedOrigin("https://appassets.androidplatform.net", true), "Packaged main origin denied");
        check(!NativeBridgePolicy.trustedOrigin("https://appassets.androidplatform.net", false), "Subframe native origin accepted");
        for (String origin : new String[]{"http://appassets.androidplatform.net", "https://appassets.androidplatform.net.evil.test", "https://user@appassets.androidplatform.net", "https://appassets.androidplatform.net:8443", "https://appassets.androidplatform.net/assets/viewer/index.html", "null"})
            check(!NativeBridgePolicy.trustedOrigin(origin, true), "Foreign origin accepted");
        for (String path : new String[]{"/assets/viewer/../private", "/assets/viewer/%2e%2e/private", "/assets/viewer/%252e%252e/private", "/assets/viewer/%5c..%5cprivate", "/assets/viewer-evil/index.html"})
            check(!NativeBridgePolicy.viewerResource("https://appassets.androidplatform.net" + path), "Unsafe resource accepted");
        check(NativeBridgePolicy.viewerResource("https://appassets.androidplatform.net/assets/viewer/extension/viewer.html"), "Compiled viewer denied");
        check(NativeBridgePolicy.importedResource("https://appassets.androidplatform.net/assets/viewer/temporary-downloads/" + "a".repeat(32) + "/0"), "Temporary navigation not identified");
        NativeRequestGuard ingress = new NativeRequestGuard();
        for (int i = 0; i < 24; i++) { check(ingress.admit(10000), "Normal request refused"); ingress.release(); }
        for (int i = 0; i < 1000; i++) check(!ingress.admit(19999), "Burst admitted beyond bound");
        check(ingress.admit(20000), "Bridge window did not recover");
        check(!ingress.admit(19999), "Backwards bridge clock admitted");
        NativeRequestGuard pending = new NativeRequestGuard();
        for (int i = 0; i < 8; i++) check(pending.admit(0), "Queue slot refused");
        check(!pending.admit(10000), "Outstanding queue bound bypassed by time");
        pending.release(); check(pending.admit(10000), "Queue capacity did not recover");
        pending.dispatch(Runnable::run, () -> pending.execute(Runnable::run, () -> {}));
        check(pending.admit(10000), "Completed work did not release admission");
        SharedPreferences state = context.getSharedPreferences("provider_pacing_selftest", Context.MODE_PRIVATE);
        state.edit().clear().commit();
        try {
            ProviderWriteGuard guard = new ProviderWriteGuard(state);
            guard.claim("publish", 1000000); checks++;
            blocked(new ProviderWriteGuard(state), "publish", 1002999);
            guard.claim("upload", 1000000); checks++; // One screenshot + publication is allowed.
            for (int i = 1; i < 5; i++) { guard.claim("publish", 1000000 + i * 10000); checks++; }
            blocked(guard, "publish", 1050000);
            guard.claim("publish", 1060000); checks++;
            blocked(guard, "publish", 1059999);
            state.edit().clear().commit();
            for (int i = 0; i < 20; i++) { guard.claim("publish", 1000000 + i * 121000); checks++; }
            blocked(new ProviderWriteGuard(state), "publish", 1000000 + 20 * 121000);
            guard.claim("publish", 4600000); checks++;
            state.edit().putString("publish", "not-json").commit();
            blocked(guard, "publish", 5000000);
            blocked(guard, "unknown", 5000000);
        } finally { state.edit().clear().commit(); }
        return checks;
    }
}
