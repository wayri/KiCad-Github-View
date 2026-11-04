package dev.kicadvizdiff.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import org.json.JSONObject;
import org.json.JSONTokener;

/** A separate, bridge-free website browser. Page results are untrusted data. */
final class RepositorySessionBrowser {
    interface Callback { void complete(JSONObject result, String error); }
    interface WriteGuard { void check() throws Exception; }
    private static final int MAX_OPERATION = 128 * 1024, MAX_RESULT = 1024 * 1024;
    private static final long TIMEOUT_MS = 60_000;
    private static final String[] MODULES = {"parsing.js", "github-session-reader.js", "github-session-review.js", "mobile-session-page.js"};
    private final Activity activity;
    private final Runnable onUseProject;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final String bundleProperty = "__kivi_bundle_" + UUID.randomUUID().toString().replace("-", "");
    private WebView browser;
    private Dialog dialog;
    private TextView location;
    private volatile String repository;
    private String modules, readyUrl, observedUrl;
    private volatile boolean authenticationFlow;
    private final Set<String> approvedSsoOrigins = new java.util.concurrent.CopyOnWriteArraySet<>();
    private boolean isolated, expanded, destroyed, loading, pageFailed, foreground = true;
    private int generation;
    private Pending request;
    private Opening opening;
    private Draft draft;
    private WriteGuard writeGuard;
    private AlertDialog confirmation;
    private AlertDialog externalConfirmation;

    private static final class Pending {
        final Callback callback;
        final JSONObject operation;
        final int generation;
        final String url, property;
        final long started = SystemClock.uptimeMillis();
        Pending(Callback callback, JSONObject operation, int generation, String url) {
            this.callback = callback; this.operation = operation; this.generation = generation; this.url = url;
            property = "__kivi_session_" + UUID.randomUUID().toString().replace("-", "");
        }
    }
    private static final class Draft {
        String ticket, account, repository, body;
        int number;
        boolean verified;
        long preparedAt;
        WriteGuard guard;
    }
    private static final class Opening {
        final String url;
        final Callback callback;
        Opening(String url, Callback callback) { this.url = url; this.callback = callback; }
    }

    RepositorySessionBrowser(Activity activity) { this(activity, null); }
    RepositorySessionBrowser(Activity activity, Runnable onUseProject) { this.activity = activity; this.onUseProject = onUseProject; }

    void setWriteGuard(WriteGuard guard) { if (writeGuard != guard) { cancel("The saved review project changed. Prepare the message again."); writeGuard = guard; } }
    private void checkWriteGuard(WriteGuard expected) throws Exception {
        if (expected == null || expected != writeGuard) throw new IllegalStateException("Open the saved review project and prepare the message again.");
        try { expected.check(); }
        catch (ManagedPolicy.Denied denied) { throw denied; }
        catch (Exception changed) { throw new IllegalStateException("The saved review project changed. Prepare the message again."); }
    }
    private void requireInteractivePolicy() throws Exception {
        ManagedPolicy.requireNetwork(activity);
        if (!ManagedPolicy.read(activity).providerWrites) throw new IllegalStateException("Interactive repository browser is disabled by managed read-only policy; use approved local files.");
    }

    /** Must be called on the UI thread. Callback data never grants native authority. */
    void request(JSONObject message, Callback callback) {
        try {
            if (destroyed) throw new IllegalStateException("Repository browser has been destroyed.");
            String action = message.optString("action");
            if (action.equals("close")) { close(); callback.complete(new JSONObject().put("closed", true), null); return; }
            if (!foreground) throw new IllegalStateException("Return to the app before using the repository website session.");
            requireInteractivePolicy();
            String bound = RepositorySessionPolicy.repository(message.optString("repository", repository == null ? "" : repository));
            if (action.equals("open")) {
                String url = message.optString("url", RepositorySessionPolicy.home(bound));
                if (!RepositorySessionPolicy.repositoryUrl(url, bound)) throw new IllegalArgumentException("Open a page within the selected GitHub repository.");
                ensureBrowser();
                boolean changeRepository = !bound.equalsIgnoreCase(repository == null ? "" : repository);
                boolean navigate = changeRepository || !RepositorySessionPolicy.navigation(browser.getUrl(), bound) || message.has("url") && !url.equals(browser.getUrl()) || !loading && readyUrl == null;
                if (navigate) { cancel("Repository navigation requested."); if (changeRepository) { approvedSsoOrigins.clear(); authenticationFlow = false; } repository = bound; }
                if (message.optBoolean("waitForReady")) {
                    finishOpening(null, "A newer repository page request replaced this one.");
                    Opening next = new Opening(url, callback);
                    opening = next;
                    handler.postDelayed(() -> { if (opening == next) finishOpening(null, "Repository page timed out. Complete GitHub sign-in, return to the selected issue, and retry."); }, 30_000);
                }
                if (navigate) { loading = true; readyUrl = null; browser.loadUrl(url); }
                show();
                if (message.optBoolean("waitForReady")) { if (!loading && url.equals(readyUrl)) finishOpening(state().put("ready", true), null); }
                else callback.complete(state(), null);
                return;
            }
            if (browser == null || repository == null || !bound.equalsIgnoreCase(repository)) throw new IllegalArgumentException("Open this repository in the website browser first.");
            if (action.equals("show")) { show(); callback.complete(state(), null); return; }
            if (!action.equals("dispatch")) throw new IllegalArgumentException("Unknown repository browser action.");
            if (request != null || confirmation != null) throw new IllegalStateException("A repository browser request is already running.");
            JSONObject operation = new JSONObject(message.getJSONObject("operation").toString());
            validateOperation(operation);
            operation.put("repository", repository);
            if (operation.optString("type").equals("review") && Set.of("prepare", "verify", "commit").contains(operation.optString("action"))) show();
            if (operation.optString("type").equals("review") && operation.optString("action").equals("commit")) confirmCommit(operation, callback);
            else start(operation, callback);
        } catch (Exception error) { callback.complete(null, safeError(error)); }
    }

    private JSONObject state() throws Exception {
        return new JSONObject().put("repository", repository).put("visible", visible()).put("profileIsolated", isolated)
                .put("isolation", isolated ? "Separate Android WebView profile; no native bridge." : "Separate bridge-free WebView; website cookies are shared with the app's default WebView profile.");
    }

    private void validateOperation(JSONObject operation) throws Exception {
        if (operation.toString().getBytes(StandardCharsets.UTF_8).length > MAX_OPERATION) throw new IllegalArgumentException("Repository operation is too large.");
        String type = operation.optString("type");
        if (!Set.of("source", "review", "chunk", "discard").contains(type)) throw new IllegalArgumentException("Unknown repository operation.");
        if (type.equals("review") && !Set.of("inspect", "list", "read", "prepare", "verify", "commit", "discard").contains(operation.optString("action"))) throw new IllegalArgumentException("Unknown review operation.");
        if (type.equals("review") && Set.of("prepare", "verify", "commit").contains(operation.optString("action"))) {
            checkWriteGuard(writeGuard);
            if (!operation.optString("action").equals("prepare") && (draft == null || draft.guard != writeGuard || !draft.ticket.equals(operation.optString("ticket")))) throw new IllegalStateException("Prepare this message in the saved review project again.");
        }
        if (type.equals("source") && !Set.of("context", "directory", "file", "asset", "resolve", "history").contains(operation.optString("action"))) throw new IllegalArgumentException("Unknown source operation.");
        for (java.util.Iterator<String> keys = operation.keys(); keys.hasNext();) {
            String key = keys.next().toLowerCase(java.util.Locale.ROOT);
            if (Set.of("script", "javascript", "code", "token", "credentials", "cookie", "cookies", "password", "authorization", "headers", "origin", "host").contains(key)) throw new IllegalArgumentException("Credentials and custom scripts are not accepted by the website browser.");
        }
        if (operation.has("repository") && !repository.equalsIgnoreCase(operation.getString("repository"))) throw new IllegalArgumentException("The operation belongs to another repository.");
        if (operation.has("url") && !RepositorySessionPolicy.repositoryUrl(operation.getString("url"), repository)) throw new IllegalArgumentException("The operation URL is outside the selected repository.");
        if (type.equals("review") && operation.optString("action").equals("prepare")) {
            String body = operation.getString("body");
            if (body.isBlank() || body.length() > 65536 || operation.optInt("number") <= 0) throw new IllegalArgumentException("Select an issue and enter a message.");
            draft = null;
        }
    }

    private void confirmCommit(JSONObject operation, Callback callback) throws Exception {
        final Draft approved = draft;
        if (approved == null || !approved.verified || !approved.repository.equalsIgnoreCase(repository) || !approved.ticket.equals(operation.optString("ticket"))) throw new IllegalStateException("Prepare and verify this message before sending it.");
        checkWriteGuard(approved.guard);
        if (SystemClock.uptimeMillis() - approved.preparedAt >= 30_000) { draft = null; throw new IllegalStateException("The message draft expired. Prepare the message again."); }
        final int pageGeneration = generation;
        final String pageUrl = browser.getUrl();
        confirmation = new AlertDialog.Builder(activity).setTitle("Send GitHub issue message?")
                .setMessage(approved.repository + " · issue #" + approved.number + "\nAccount: " + approved.account + "\n\n" + approved.body)
                .setNegativeButton("Cancel", (unused, which) -> { confirmation = null; callback.complete(null, "Send cancelled."); })
                .setPositiveButton("Send message", (unused, which) -> {
                    confirmation = null;
                    try {
                        if (draft != approved || generation != pageGeneration || !pageUrl.equals(browser.getUrl())) throw new IllegalStateException("The website changed. Prepare the message again.");
                        checkWriteGuard(approved.guard);
                        if (SystemClock.uptimeMillis() - approved.preparedAt >= 30_000) throw new IllegalStateException("The message draft expired. Prepare the message again.");
                        final JSONObject commit = new JSONObject(operation.toString()).put("repository", approved.repository).put("number", approved.number).put("body", approved.body).put("account", approved.account);
                        approved.verified = false;
                        JSONObject verify = new JSONObject().put("type", "review").put("action", "verify").put("ticket", approved.ticket).put("repository", approved.repository).put("number", approved.number);
                        if (operation.has("requestId")) verify.put("requestId", operation.getString("requestId"));
                        // Website verification has a short lifetime: refresh it only after
                        // the user confirms, then commit this same ticket without a retry.
                        start(verify, (result, error) -> {
                            if (error != null) { draft = null; callback.complete(null, "The message could not be verified or expired. Prepare the message again."); return; }
                            try {
                                if (draft != approved || !approved.verified || generation != pageGeneration || !pageUrl.equals(browser.getUrl())) throw new IllegalStateException("The website changed. Prepare the message again.");
                                checkWriteGuard(approved.guard);
                                ManagedPolicy.requireAction(activity, "chat-message-write");
                                // Consume approval before starting: failures are never automatically retried.
                                draft = null;
                                start(commit, callback);
                            } catch (Exception errorAfterVerify) { draft = null; callback.complete(null, safeError(errorAfterVerify)); }
                        });
                    } catch (Exception error) { draft = null; callback.complete(null, safeError(error)); }
                }).create();
        confirmation.setOnCancelListener(unused -> { confirmation = null; callback.complete(null, "Send cancelled."); });
        confirmation.show(); secure(confirmation.getWindow());
    }

    private void start(JSONObject operation, Callback callback) throws Exception {
        if (!foreground) throw new IllegalStateException("Return to the app before using the repository website session.");
        requireInteractivePolicy();
        if (!RepositorySessionPolicy.repositoryUrl(browser.getUrl(), repository)) throw new IllegalStateException("Finish signing in and open the selected repository first.");
        if (loading || readyUrl == null || !readyUrl.equals(browser.getUrl())) throw new IllegalStateException("Wait for the selected repository page to finish loading, then retry.");
        if (operation.optString("type").equals("review") && Set.of("prepare", "verify", "commit").contains(operation.optString("action"))) checkWriteGuard(writeGuard);
        if (operation.optString("type").equals("review") && operation.optString("action").equals("commit")) ManagedPolicy.requireAction(activity, "chat-message-write");
        if (modules == null) {
            StringBuilder code = new StringBuilder();
            int totalBytes = 0;
            for (String asset : MODULES) try (InputStream input = activity.getAssets().open("viewer/" + asset)) {
                byte[] source = readModule(input);
                totalBytes += source.length + 3;
                if (totalBytes > 2 * 1024 * 1024) throw new IOException("Repository website modules exceed their size budget.");
                code.append(new String(source, StandardCharsets.UTF_8)).append("\n;\n");
            }
            modules = code.toString();
        }
        Pending pending = new Pending(callback, operation, generation, browser.getUrl());
        request = pending;
        String key = JSONObject.quote(pending.property);
        String bundle = JSONObject.quote(bundleProperty);
        String script = "(function(){const k=" + key + ";window[k]=null;try{if(window[" + bundle + "]!==true){" + modules
                + "\nwindow[" + bundle + "]=true;}Promise.resolve(window.KiCadMobileSessionPage.dispatch(" + operation + ")).then(function(value){let s=JSON.stringify({ok:true,result:value});window[k]=new TextEncoder().encode(s).length>524288?JSON.stringify({ok:false,error:'Website result exceeds the response limit.'}):s;},function(){window[k]=JSON.stringify({ok:false,error:'Website operation failed.'});});}catch(e){window[k]=JSON.stringify({ok:false,error:'Website operation unavailable.'});}})();";
        browser.evaluateJavascript(script, unused -> handler.postDelayed(() -> poll(pending), 80));
    }

    private static byte[] readModule(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count > 1024 * 1024 - output.size()) throw new IOException("Repository website module exceeds its size budget.");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private void poll(Pending pending) {
        if (request != pending) return;
        try {
            requireInteractivePolicy();
            if (generation != pending.generation || !pending.url.equals(browser.getUrl()) || !RepositorySessionPolicy.repositoryUrl(browser.getUrl(), repository)) throw new IllegalStateException("Website navigation cancelled the request.");
            if (SystemClock.uptimeMillis() - pending.started > TIMEOUT_MS) throw new IllegalStateException("Website operation timed out. Check the website before trying again.");
            browser.evaluateJavascript("window[" + JSONObject.quote(pending.property) + "]", encoded -> {
                if (request != pending) return;
                try {
                    if (generation != pending.generation || !pending.url.equals(browser.getUrl())) throw new IllegalStateException("Website navigation cancelled the request.");
                    if (encoded == null || encoded.equals("null")) { handler.postDelayed(() -> poll(pending), 100); return; }
                    if (encoded.length() > MAX_RESULT || encoded.getBytes(StandardCharsets.UTF_8).length > MAX_RESULT) throw new IllegalStateException("Website response is too large.");
                    Object decoded = new JSONTokener(encoded).nextValue();
                    if (!(decoded instanceof String)) throw new IllegalStateException("Invalid website response.");
                    JSONObject envelope = new JSONObject((String) decoded);
                    if (!envelope.optBoolean("ok")) throw new IllegalStateException("Website operation failed. Check the selected repository page and retry; prepare expired messages again.");
                    JSONObject result = envelope.optJSONObject("result");
                    if (result == null) throw new IllegalStateException("Invalid website result.");
                    observeDraft(pending.operation, result);
                    finish(pending, result, null);
                } catch (Exception error) { finish(pending, null, safeError(error)); }
            });
        } catch (Exception error) { finish(pending, null, safeError(error)); }
    }

    private void observeDraft(JSONObject operation, JSONObject result) throws Exception {
        if (!operation.optString("type").equals("review")) return;
        String action = operation.optString("action");
        if (action.equals("prepare")) {
            Draft next = new Draft();
            next.ticket = result.getString("ticket"); next.account = result.getString("account"); next.number = result.getInt("number"); next.repository = result.getString("repository"); next.body = operation.getString("body");
            next.preparedAt = SystemClock.uptimeMillis();
            next.guard = writeGuard;
            checkWriteGuard(next.guard);
            if (next.ticket.isEmpty() || !next.account.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}") || next.number != operation.getInt("number") || !next.repository.equalsIgnoreCase(repository)) throw new IllegalStateException("Invalid website draft response.");
            draft = next;
        } else if (action.equals("verify")) {
            if (draft == null || !draft.ticket.equals(operation.optString("ticket")) || !result.optBoolean("verified") || !draft.account.equals(result.optString("account"))) { draft = null; throw new IllegalStateException("The signed-in account or draft changed. Prepare again."); }
            checkWriteGuard(draft.guard);
            draft.verified = true;
        } else if (action.equals("discard")) draft = null;
    }

    private void finish(Pending pending, JSONObject result, String error) {
        if (request != pending) return;
        request = null;
        if (browser != null) browser.evaluateJavascript("delete window[" + JSONObject.quote(pending.property) + "]", null);
        pending.callback.complete(result, error);
    }

    private void finishOpening(JSONObject result, String error) {
        Opening active = opening;
        if (active == null) return;
        opening = null;
        active.callback.complete(result, error);
    }

    private void cancel(String reason) { finishOpening(null, reason); cancelOperation(reason); }

    private void cancelOperation(String reason) {
        if (browser != null && request != null) browser.evaluateJavascript("if(window.KiCadMobileSessionPage&&typeof window.KiCadMobileSessionPage.cancel==='function')window.KiCadMobileSessionPage.cancel();", null);
        if (request != null) finish(request, null, reason);
        draft = null;
        if (confirmation != null) { confirmation.cancel(); confirmation = null; }
        if (externalConfirmation != null) { externalConfirmation.dismiss(); externalConfirmation = null; }
    }

    private boolean allowedNavigation(String url) {
        if (RepositorySessionPolicy.navigation(url, repository)) return true;
        String origin = RepositorySessionPolicy.httpsOrigin(url);
        return authenticationFlow && origin != null && approvedSsoOrigins.contains(origin);
    }

    private void recordNavigation(String url) {
        if (RepositorySessionPolicy.authenticationUrl(url, repository)) authenticationFlow = true;
        else if (RepositorySessionPolicy.repositoryUrl(url, repository)) authenticationFlow = false;
    }

    @SuppressWarnings("deprecation")
    private void ensureBrowser() {
        if (browser != null) return;
        browser = new WebView(activity);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            try { WebViewCompat.setProfile(browser, "repository-website-session"); isolated = true; }
            catch (RuntimeException unsupported) { isolated = false; }
        }
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false); settings.setMediaPlaybackRequiresUserGesture(true); settings.setSafeBrowsingEnabled(true);
        EnterprisePolicy initialPolicy = ManagedPolicy.read(activity);
        settings.setBlockNetworkLoads(!RepositorySessionPolicy.interactiveAllowed(initialPolicy.network, initialPolicy.providerWrites));
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest permission) { permission.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, android.os.Message result) { return false; }
            @Override public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) { callback.onReceiveValue(null); return true; }
        });
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String target = request.getUrl().toString();
                if (!request.isForMainFrame()) return !RepositorySessionPolicy.external(target);
                try { requireInteractivePolicy(); } catch (Exception denied) { cancel(safeError(denied)); return true; }
                if (allowedNavigation(target)) { recordNavigation(target); loading = true; readyUrl = null; cancelOperation("Website navigation cancelled the request."); return false; }
                cancel("Navigation left the selected repository.");
                if (RepositorySessionPolicy.external(target)) offerExternal(target, true);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                generation++; loading = true; pageFailed = false; readyUrl = null; observedUrl = url; cancelOperation("Website navigation cancelled the request.");
                if (opening != null && !opening.url.equals(url)) finishOpening(null, "Complete GitHub sign-in, return to the selected repository issue, and retry.");
                if (!allowedNavigation(url)) { view.stopLoading(); if (RepositorySessionPolicy.external(url)) offerExternal(url, false); return; }
                recordNavigation(url);
                updateLocation(url);
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                // GitHub also changes routes without creating a new document.
                if (url == null || url.equals(observedUrl)) return;
                observedUrl = url; generation++; readyUrl = null;
                cancelOperation("Website navigation cancelled the request.");
                if (opening != null && !opening.url.equals(url)) finishOpening(null, "Complete GitHub sign-in, return to the selected repository issue, and retry.");
                updateLocation(url);
                if (!allowedNavigation(url)) { view.stopLoading(); if (RepositorySessionPolicy.external(url)) offerExternal(url, true); return; }
                recordNavigation(url);
                if (RepositorySessionPolicy.repositoryUrl(url, repository)) {
                    final int documentGeneration = generation;
                    handler.postDelayed(() -> settleRoute(url, documentGeneration, 0), 300);
                }
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!url.equals(view.getUrl())) return;
                loading = false; readyUrl = !pageFailed && RepositorySessionPolicy.repositoryUrl(url, repository) ? url : null; updateLocation(url);
                if (opening != null) {
                    try {
                        requireInteractivePolicy();
                        if (!opening.url.equals(readyUrl)) throw new IllegalStateException("Complete GitHub sign-in, return to the selected repository issue, and retry.");
                        finishOpening(state().put("ready", true), null);
                    } catch (Exception error) { finishOpening(null, safeError(error)); }
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) { if (request.isForMainFrame()) { loading = false; pageFailed = true; readyUrl = null; finishOpening(null, "The repository page could not load. Complete sign-in and retry."); } }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) { if (request.isForMainFrame() && error.getStatusCode() >= 400) { pageFailed = true; readyUrl = null; finishOpening(null, "The repository page is unavailable. Check repository access, complete sign-in, and retry."); } }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); loading = false; pageFailed = true; readyUrl = null; cancel("The website's secure connection failed."); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                EnterprisePolicy policy = ManagedPolicy.read(activity);
                if (!RepositorySessionPolicy.interactiveAllowed(policy.network, policy.providerWrites) || !"https".equalsIgnoreCase(uri.getScheme()) || "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())) return blocked();
                if (request.isForMainFrame() && !allowedNavigation(uri.toString())) {
                    final String target = uri.toString(), bound = repository;
                    final boolean replayGet = "GET".equalsIgnoreCase(request.getMethod());
                    if (authenticationFlow && RepositorySessionPolicy.external(target)) handler.post(() -> { if (foreground && bound != null && bound.equals(repository) && externalConfirmation == null) offerExternal(target, replayGet); });
                    return blocked();
                }
                return null;
            }
        });
        dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setTitle("GitHub repository website");
        LinearLayout layout = new LinearLayout(activity); layout.setOrientation(LinearLayout.VERTICAL); layout.setBackgroundColor(Color.WHITE);
        location = new TextView(activity); location.setTextSize(12); location.setPadding(12, 10, 12, 10); location.setTextColor(Color.BLACK); location.setMaxLines(3); location.setEllipsize(android.text.TextUtils.TruncateAt.END); layout.addView(location);
        LinearLayout toolbar = new LinearLayout(activity);
        button(toolbar, "Back", () -> { try { requireInteractivePolicy(); if (browser.canGoBack()) { cancel("Website navigation requested."); readyUrl = null; loading = true; browser.goBack(); } } catch (Exception denied) { cancel(safeError(denied)); } });
        button(toolbar, "Reload", () -> { try { requireInteractivePolicy(); cancel("Website reload requested."); readyUrl = null; loading = true; browser.reload(); } catch (Exception denied) { cancel(safeError(denied)); } });
        button(toolbar, "Expand", () -> { expanded = !expanded; sizeDialog(); });
        button(toolbar, "Close", this::close);
        layout.addView(toolbar);
        if (onUseProject != null) { Button use = new Button(activity); use.setText("Use project in viewer"); use.setOnClickListener(unused -> { close(); onUseProject.run(); }); layout.addView(use); }
        layout.addView(browser, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        dialog.setContentView(layout); dialog.setOnCancelListener(unused -> cancel("Repository browser closed."));
    }

    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void settleRoute(String url, int documentGeneration, int attempts) {
        EnterprisePolicy policy = ManagedPolicy.read(activity);
        if (!foreground || destroyed || browser == null || generation != documentGeneration || !url.equals(browser.getUrl()) || !RepositorySessionPolicy.interactiveAllowed(policy.network, policy.providerWrites)) return;
        browser.evaluateJavascript("document.readyState==='complete'&&location.href===" + JSONObject.quote(url), result -> {
            if (!foreground || destroyed || browser == null || generation != documentGeneration || !url.equals(browser.getUrl())) return;
            if ("true".equals(result)) {
                loading = false; pageFailed = false; readyUrl = url;
                if (opening != null && opening.url.equals(url)) try { finishOpening(state().put("ready", true), null); } catch (Exception error) { finishOpening(null, safeError(error)); }
            } else if (attempts < 49) handler.postDelayed(() -> settleRoute(url, documentGeneration, attempts + 1), 100);
        });
    }
    private void button(LinearLayout toolbar, String text, Runnable action) { Button button = new Button(activity); button.setText(text); button.setTextSize(11); button.setMinWidth(0); button.setMinimumWidth(0); button.setPadding(2, 0, 2, 0); button.setOnClickListener(unused -> action.run()); toolbar.addView(button, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1)); }
    private void secure(Window window) { if (window != null) { if (ManagedPolicy.read(activity).secureScreen) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE); else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE); } }
    void applyManagedPolicy() { secure(dialog == null ? null : dialog.getWindow()); secure(confirmation == null ? null : confirmation.getWindow()); secure(externalConfirmation == null ? null : externalConfirmation.getWindow()); EnterprisePolicy policy = ManagedPolicy.read(activity); boolean enabled = RepositorySessionPolicy.interactiveAllowed(policy.network, policy.providerWrites); if (browser != null) browser.getSettings().setBlockNetworkLoads(!enabled); if (!enabled) { cancel(policy.network ? "Interactive repository browser is disabled by managed read-only policy; use approved local files." : "Network access is disabled by managed application policy."); if (browser != null) browser.stopLoading(); if (dialog != null) dialog.dismiss(); } if (browser != null) updateLocation(browser.getUrl()); }
    private void show() { dialog.show(); secure(dialog.getWindow()); sizeDialog(); updateLocation(browser.getUrl()); }
    private void sizeDialog() {
        if (dialog == null || dialog.getWindow() == null) return;
        android.graphics.Rect available = new android.graphics.Rect();
        activity.getWindow().getDecorView().getWindowVisibleDisplayFrame(available);
        int width = available.width(), height = available.height();
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.view.WindowMetrics metrics = activity.getWindowManager().getCurrentWindowMetrics();
            android.graphics.Rect bounds = metrics.getBounds();
            android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            width = bounds.width() - insets.left - insets.right;
            height = bounds.height() - insets.top - insets.bottom;
        }
        android.util.DisplayMetrics fallback = activity.getResources().getDisplayMetrics();
        if (width <= 0) width = fallback.widthPixels;
        if (height <= 0) height = fallback.heightPixels;
        Window window = dialog.getWindow();
        WindowManager.LayoutParams params = window.getAttributes();
        float density = fallback.density;
        boolean tablet = width / density >= 600;
        params.width = expanded || !tablet ? width : Math.min(width, Math.round(520 * density));
        params.height = expanded || tablet ? height : Math.round(height * .62f);
        params.gravity = expanded ? android.view.Gravity.CENTER : tablet ? android.view.Gravity.TOP | android.view.Gravity.RIGHT : android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL;
        params.dimAmount = .15f;
        params.flags |= WindowManager.LayoutParams.FLAG_DIM_BEHIND;
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        window.setAttributes(params);
    }
    void resize() { if (visible()) sizeDialog(); }
    private void updateLocation(String url) { if (location != null) { String origin = RepositorySessionPolicy.httpsOrigin(url); String label = origin == null ? "Loading github.com" : origin + (RepositorySessionPolicy.github(url) == null ? "" : Uri.parse(url).getPath()); location.setText(label + (isolated ? "\nSeparate website profile · no native bridge" : "\nWebsite cookies shared within app · no native bridge") + (!ManagedPolicy.read(activity).providerWrites ? "\nManaged read-only: interactive website browser disabled" : "")); } }
    private void offerExternal(String url, boolean replayGet) {
        final String origin = RepositorySessionPolicy.httpsOrigin(url), bound = repository;
        final int pageGeneration = generation;
        if (origin == null || !foreground) return;
        boolean mayAuthenticateHere = authenticationFlow && !"https://github.com".equals(origin);
        String explanation = mayAuthenticateHere ? "Allow this origin for sign-in navigation in the same website browser? It receives no native bridge. Repository scripts stay limited to the selected GitHub repository." : "Continue in your external browser. Return here to continue with the selected repository.";
        if (mayAuthenticateHere && !replayGet) explanation += "\nThis form cannot be replayed. Continue here will restart the organization's normal GitHub sign-in flow.";
        AlertDialog.Builder choice = new AlertDialog.Builder(activity).setTitle(mayAuthenticateHere ? "Continue organization sign-in?" : "Open external page?")
                .setMessage(origin + "\n\n" + explanation).setNegativeButton("Cancel", null)
                .setNeutralButton("External browser", (unused, which) -> { externalConfirmation = null; try { requireInteractivePolicy(); activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); } catch (Exception unavailable) { /* No external browser or policy disabled. */ } });
        if (mayAuthenticateHere) choice.setPositiveButton("Continue here", (unused, which) -> {
            externalConfirmation = null;
            try {
                requireInteractivePolicy();
                if (!foreground || pageGeneration != generation || bound == null || !bound.equals(repository) || !authenticationFlow) return;
                // Only this explicit native choice grants an authentication origin.
                approvedSsoOrigins.add(origin); readyUrl = null; loading = true;
                browser.loadUrl(replayGet ? url : "https://github.com/orgs/" + bound.split("/", -1)[0] + "/sso");
            } catch (Exception denied) { cancel(safeError(denied)); }
        });
        AlertDialog prompt = choice.create(); externalConfirmation = prompt;
        prompt.setOnDismissListener(unused -> { if (externalConfirmation == prompt) externalConfirmation = null; });
        prompt.show(); secure(prompt.getWindow());
    }
    boolean visible() { return dialog != null && dialog.isShowing(); }
    void cancelRequest() { cancel("Repository browser request cancelled."); }
    void cancelRequest(String requestId) { if (requestId != null && request != null && requestId.equals(request.operation.optString("requestId"))) cancelRequest(); }
    void onPause() { foreground = false; cancelRequest(); handler.removeCallbacksAndMessages(null); if (browser != null) browser.onPause(); }
    void onResume() { foreground = true; if (browser != null) browser.onResume(); applyManagedPolicy(); if (browser != null && readyUrl == null && !pageFailed && RepositorySessionPolicy.repositoryUrl(browser.getUrl(), repository)) { String url = browser.getUrl(); int documentGeneration = generation; handler.postDelayed(() -> settleRoute(url, documentGeneration, 0), 300); } }
    void close() { cancel("Repository browser closed."); if (dialog != null) dialog.dismiss(); }
    void destroy() { close(); destroyed = true; approvedSsoOrigins.clear(); authenticationFlow = false; handler.removeCallbacksAndMessages(null); if (browser != null) { if (browser.getParent() instanceof ViewGroup) ((ViewGroup) browser.getParent()).removeView(browser); browser.stopLoading(); browser.destroy(); browser = null; } modules = null; }
    private static String safeError(Exception error) {
        if (error instanceof ManagedPolicy.Denied) return error.getMessage();
        if (error instanceof org.json.JSONException) return "Invalid repository website response.";
        if (error instanceof java.io.IOException) return "Repository website assets are unavailable.";
        // Only our own validation errors reach this branch; never include page
        // exceptions, provider response bodies, or arbitrary envelope errors.
        if (error instanceof IllegalArgumentException || error instanceof IllegalStateException) return error.getMessage() == null ? "Repository website operation failed." : error.getMessage();
        return "Repository website operation failed.";
    }
}
