package dev.kicadvizdiff.android;

import android.app.Instrumentation;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Isolated synthetic documents; no project data, provider request or network access. */
final class FrameBoundaryChecks {
    static int run(Instrumentation runner) throws Exception {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
            throw new AssertionError("Update System WebView to run native frame-boundary validation");
        CountDownLatch received = new CountDownLatch(2);
        AtomicInteger accepted = new AtomicInteger(), rejected = new AtomicInteger();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        WebView[] viewer = new WebView[1];
        try {
            runner.runOnMainSync(() -> {
                WebView web = viewer[0] = new WebView(runner.getTargetContext());
                web.getSettings().setJavaScriptEnabled(true);
                web.getSettings().setBlockNetworkLoads(true);
                web.getSettings().setAllowFileAccess(false);
                web.getSettings().setAllowContentAccess(false);
                WebViewCompat.addWebMessageListener(web, "FrameTestBridge",
                    Collections.singleton("https://appassets.androidplatform.net"),
                    (view, message, origin, mainFrame, reply) -> {
                        try {
                            if (message.getType() != WebMessageCompat.TYPE_STRING) throw new AssertionError("Unexpected test message type");
                            if (NativeBridgePolicy.trustedOrigin(origin.toString(), mainFrame)) {
                                if (!"root".equals(message.getData())) throw new AssertionError("Child acquired main-frame authority");
                                accepted.incrementAndGet();
                            } else rejected.incrementAndGet();
                        } catch (Throwable error) { failure.set(error); }
                        finally { received.countDown(); }
                    });
                web.loadDataWithBaseURL("https://appassets.androidplatform.net/assets/viewer/index.html",
                    "<script>FrameTestBridge.postMessage('root')</script>"
                    + "<iframe srcdoc=\"&lt;script&gt;FrameTestBridge.postMessage('child')&lt;/script&gt;\"></iframe>",
                    "text/html", "UTF-8", null);
            });
            if (!received.await(10, TimeUnit.SECONDS)) throw new AssertionError("Frame provenance callbacks did not arrive");
            if (failure.get() != null) throw new AssertionError("Frame provenance failure", failure.get());
            if (accepted.get() != 1 || rejected.get() != 1) throw new AssertionError("Native frame admission was not isolated");
            return 3;
        } finally { runner.runOnMainSync(() -> { if (viewer[0] != null) viewer[0].destroy(); }); }
    }
}
