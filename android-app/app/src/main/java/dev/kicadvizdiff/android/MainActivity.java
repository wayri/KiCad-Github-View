package dev.kicadvizdiff.android;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public final class MainActivity extends Activity {
    private static final String VIEWER_URL =
            "https://appassets.androidplatform.net/assets/viewer/index.html";
    private static final String VIEWER_PREFIX = "/assets/viewer/";
    private static final int REQUEST_FILES = 1001;
    private static final int REQUEST_FOLDER = 1002;
    private static final int REQUEST_DOWNLOAD = 1003;
    private static final int REQUEST_TEXT_EXPORT = 1004;
    private static final int REQUEST_WEB_FILE = 1005;

    private final ExecutorService importExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger importGeneration = new AtomicInteger();
    private WebView webView;
    private boolean pageReady;
    private boolean backPending;
    private OnBackInvokedCallback backCallback;
    private volatile boolean destroyed;
    private String pendingProject;
    private String pendingProjectLink;
    private JSONObject activeProject;
    private String activeProviderHost;
    private boolean activePrivate;
    private JSONObject pendingDownload;
    private int pendingDownloadEpoch;
    private android.webkit.ValueCallback<Uri[]> webFileCallback;
    private String pendingTextExport;
    private int pendingTextEpoch;
    private final AtomicInteger downloadGeneration = new AtomicInteger();
    private final android.os.Handler loginHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean githubPollInFlight;
    private String copiedGitHubCode;
    private boolean activityResumed;
    private final Runnable githubPollTask = () -> checkGitHubLogin();
    private final ExecutorService githubExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger githubImportGeneration = new AtomicInteger();
    private GitHubClient github;
    private GitLabClient gitlab;
    private ProjectLibrary projectLibrary;
    private final ExecutorService gitlabExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        github = new GitHubClient(this);
        gitlab = new GitLabClient(this);
        projectLibrary = new ProjectLibrary(this);
        configureWindow();
        createViewer();
        registerBackCallback();
        webView.loadUrl(VIEWER_URL);
        importExternalIntent(getIntent());
    }

    private void createViewer() {
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView = new WebView(this);
        invalidateUpgradedViewerAssets();
        webView.setLayoutParams(new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(android.graphics.Color.WHITE);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setHapticFeedbackEnabled(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setDefaultTextEncodingName("UTF-8");
        applyTextScale();
        WebView.setWebContentsDebuggingEnabled(false);
        webView.addJavascriptInterface(new NativeBridge(), "NativeKiCadHost");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trustedPage()) return false;
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = callback;
                try { startActivityForResult(params.createIntent(), REQUEST_WEB_FILE); return true; }
                catch (Exception error) { webFileCallback = null; callback.onReceiveValue(null); return true; }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme())
                        || !"appassets.androidplatform.net".equals(uri.getHost())
                        || (uri.getPort() != -1 && uri.getPort() != 443)
                        || uri.getPath() == null
                        || !uri.getPath().startsWith(VIEWER_PREFIX)) {
                    return forbidden();
                }
                WebResourceResponse response = assetLoader.shouldInterceptRequest(uri);
                return response != null ? response : forbidden();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame()) {
                    return !VIEWER_URL.equals(request.getUrl().toString());
                }
                Uri uri = request.getUrl();
                return !"https".equals(uri.getScheme())
                        || !"appassets.androidplatform.net".equals(uri.getHost())
                        || (uri.getPort() != -1 && uri.getPort() != 443)
                        || uri.getPath() == null
                        || !uri.getPath().startsWith(VIEWER_PREFIX);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageReady = false;
                if (webFileCallback != null) { webFileCallback.onReceiveValue(null); webFileCallback = null; }
                github.invalidateRequests();
                gitlab.cancelRequests();
                githubImportGeneration.incrementAndGet();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!VIEWER_URL.equals(url) || destroyed) return;
                view.evaluateJavascript(
                        "window.AndroidKiCad=Object.assign(window.AndroidKiCad||{}," +
                        "{openFiles:function(){NativeKiCadHost.openFiles()}," +
                        "openFolder:function(){NativeKiCadHost.openFolder()}," +
                        "downloadProject:function(){NativeKiCadHost.downloadProject()}," +
                        "exportCandidateProject:function(value){NativeKiCadHost.exportCandidateProject(JSON.stringify(value))}," +
                        "exportText:function(name,text,mime){NativeKiCadHost.exportText(name,text,mime)}," +
                        "libraryRequest:function(id,message){NativeKiCadHost.libraryRequest(id,JSON.stringify(message))}," +
                        "githubRequest:function(id,message){NativeKiCadHost.githubRequest(id,JSON.stringify(message))}," +
                        "gitlabRequest:function(id,message){NativeKiCadHost.gitlabRequest(id,JSON.stringify(message))}});" +
                        "window.dispatchEvent(new Event('kicad-android-ready'));", null);
                pageReady = true;
                deliverPendingProject();
                deliverPendingProjectLink();
                checkGitHubLogin();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                pageReady = false;
                if (webFileCallback != null) { webFileCallback.onReceiveValue(null); webFileCallback = null; }
                pendingProject = null;
                activeProject = null;
                activeProviderHost = null;
                pendingDownload = null;
                downloadGeneration.incrementAndGet();
                importGeneration.incrementAndGet();
                github.invalidateRequests();
                gitlab.cancelRequests();
                if (webView != null) {
                    if (webView.getParent() instanceof android.view.ViewGroup) {
                        ((android.view.ViewGroup) webView.getParent()).removeView(webView);
                    }
                    webView.destroy();
                    webView = null;
                }
                if (!destroyed) {
                    createViewer();
                    webView.loadUrl(VIEWER_URL);
                }
                return true;
            }
        });
        FrameLayout viewport = new FrameLayout(this);
        viewport.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        // On modern Android the viewport owns all insets, including the IME. Older
        // releases let the decor resize for the keyboard and consume system bars.
        if (Build.VERSION.SDK_INT >= 30) {
            viewport.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(viewport);
        viewport.requestApplyInsets();
    }

    private void invalidateUpgradedViewerAssets() {
        try {
            android.content.pm.PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), 0);
            long version = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
            android.content.SharedPreferences assets = getSharedPreferences("viewer-assets", MODE_PRIVATE);
            if (assets.getLong("installed-version", -1) != version) {
                // Packaged URLs stay constant across upgrades; discard cached old HTML/scripts.
                // This does not clear DOM storage, local notes or native account credentials.
                webView.clearCache(true);
                assets.edit().putLong("installed-version", version).apply();
            }
        } catch (android.content.pm.PackageManager.NameNotFoundException ignored) {
            // Self package is normally available; avoid making an OEM metadata failure fatal.
        }
    }

    private void configureWindow() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        } else {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }

    private void applyTextScale() {
        if (webView != null) {
            webView.getSettings().setTextZoom(Math.round(
                    100 * getResources().getConfiguration().fontScale));
        }
    }

    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleViewerBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    // API 26–32 compatibility only: API 33+ back gestures use the platform
    // OnBackInvokedDispatcher registered above, with the same UI-first handler.
    @Override
    @android.annotation.SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleViewerBack();
    }

    private void handleViewerBack() {
        if (destroyed || backPending) return;
        if (!trustedPage()) return;
        final WebView current = webView;
        backPending = true;
        current.evaluateJavascript(
                "(function(){try{if(!window.KiCadAndroidUI||!window.KiCadAndroidUI.handleBack)return true;return !!window.KiCadAndroidUI.handleBack()}" +
                "catch(e){return true}})()", handled -> {
            backPending = false;
            if (destroyed || webView != current || !trustedPage()) return;
            if (!"false".equals(handled)) return;
            // Only the packaged root can be a top-level history destination.
            android.webkit.WebBackForwardList history = current.copyBackForwardList();
            int previous = history.getCurrentIndex() - 1;
            if (previous >= 0 && VIEWER_URL.equals(history.getItemAtIndex(previous).getUrl())) {
                current.goBack();
            } else {
                finish();
            }
        });
    }

    private static WebResourceResponse forbidden() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void githubRequest(int id, String json) {
            if (id < 0 || json == null || json.length() > 1600000) return;
            runOnUiThread(() -> {
                if (!trustedPage()) return;
                try {
                    JSONObject request = new JSONObject(json);
                    String action = request.getString("action");
                    if (action.equals("device-start") || action.equals("sign-out") || action.equals("token-connect")) {
                        purgeProject("https://github.com");
                        github.reset(); clearCopiedGitHubCode();
                        githubImportGeneration.incrementAndGet();
                    } else if (action.equals("device-cancel")) { github.cancelDevice(); clearCopiedGitHubCode(); }
                    else if (action.equals("import")) github.cancelRequests();
                gitlab.cancelRequests();
                    final int epoch = github.generation();
                    if (action.equals("copy-device-code")) {
                        if(!copyGitHubCode()) throw new IllegalArgumentException();
                        githubReply(id,epoch,-1,new JSONObject().put("copied",true),null); return;
                    }
                    if (action.equals("open-verification") || action.equals("open-verification-mobile")) {
                        openGitHubVerification(action.equals("open-verification-mobile"));
                        githubReply(id, epoch, -1, new JSONObject().put("opened", true), null);
                        return;
                    }
                    if (action.equals("token-connect")) { showTokenDialog(id, epoch); return; }
                    final int importEpoch = action.equals("import") ? githubImportGeneration.incrementAndGet() : -1;
                    if (action.equals("import")) importGeneration.incrementAndGet();
                    githubExecutor.execute(() -> {
                        try { JSONObject result = github.handle(request, epoch); githubReply(id, epoch, importEpoch, result, null);
                            if (action.equals("device-start") || action.equals("auth-status")) runOnUiThread(MainActivity.this::checkGitHubLogin);
                        }
                        catch (Exception error) { githubReply(id, epoch, importEpoch, null, githubError(error)); }
                    });
                } catch (Exception error) {
                    githubReply(id, github.generation(), -1, null, "Invalid GitHub request or browser unavailable");
                }
            });
        }
        @JavascriptInterface
        public void gitlabRequest(int id, String json) {
            if (id < 0 || json == null || json.length() > 1600000) return;
            runOnUiThread(() -> {
                if (!trustedPage()) return;
                try {
                    JSONObject request = new JSONObject(json);
                    String action = request.getString("action");
                    String host = GitLabClient.validateHost(request.optString("host", "https://gitlab.com"));
                    if (action.equals("sign-out") || action.equals("token-connect") || action.equals("oauth-start")) { purgeProject(host); gitlab.reset(host); }
                    else if (action.equals("import")) {
                        gitlab.cancelRequests(); github.cancelRequests();
                        githubImportGeneration.incrementAndGet(); importGeneration.incrementAndGet();
                    }
                    final int epoch = gitlab.generation();
                    if (action.equals("token-connect")) { showGitLabTokenDialog(id, host, epoch); return; }
                    gitlabExecutor.execute(() -> {
                        try {
                            JSONObject result;
                            if (action.equals("oauth-start")) {
                                result = gitlab.startOAuth(host, request.getString("clientId"), epoch);
                                final String uri = result.getString("authorizationUri");
                                runOnUiThread(() -> { if (gitlab.current(epoch) && !destroyed) openBrowser(Uri.parse(uri)); });
                                result = new JSONObject().put("pending", true);
                            } else result = gitlab.handle(request, epoch);
                            final JSONObject imported = result;
                            runOnUiThread(() -> {
                                if (trustedPage() && gitlab.current(epoch) && action.equals("import"))
                                    recordProject(imported.optJSONObject("project"), host, imported.optBoolean("private"));
                                gitlabReply(id, epoch, imported, null);
                            });
                        } catch (Exception error) {
                            runOnUiThread(() -> { if (gitlab.current(epoch) && gitlab.authExpired()) purgeProject(host); });
                            gitlabReply(id, epoch, null, gitlabError(error));
                        }
                    });
                } catch (Exception ignored) { gitlabReply(id, gitlab.generation(), null, "Invalid GitLab connection request"); }
            });
        }
        @JavascriptInterface
        public void downloadProject() {
            runOnUiThread(() -> { if (trustedPage()) launchDownload(); });
        }

        @JavascriptInterface
        public void exportCandidateProject(String serialized) {
            runOnUiThread(() -> {
                if (!trustedPage() || activeProject == null || serialized == null || serialized.length() > 24 * 1024 * 1024) return;
                if (!"https://github.com".equals(activeProviderHost)) {
                    sendError("Field editing is available only for projects opened from GitHub"); return;
                }
                final JSONObject original = activeProject;
                importExecutor.execute(() -> {
                    try {
                        JSONObject request = new JSONObject(serialized);
                        org.json.JSONArray changes = request.getJSONArray("changes");
                        if (changes.length() < 1 || changes.length() > 32) throw new java.io.IOException("Invalid revised project file count");
                        java.util.Map<String, JSONObject> replacements = new java.util.HashMap<>();
                        org.json.JSONArray files = original.getJSONArray("files");
                        for (int n = 0; n < changes.length(); n++) {
                            JSONObject change = changes.getJSONObject(n); String path = change.getString("path");
                            if (!path.matches("(?i).+\\.kicad_(sch|pcb)") || replacements.containsKey(path)) throw new java.io.IOException("Invalid revised file path");
                            JSONObject source = null;
                            for (int i = 0; i < files.length(); i++) if (files.getJSONObject(i).getString("path").equals(path)) source = files.getJSONObject(i);
                            if (source == null) throw new java.io.IOException("Revised file is not in the original project");
                            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(source.getString("content").getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            StringBuilder hex = new StringBuilder(); for (byte b : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
                            if (!hex.toString().equals(change.getString("expectedSha"))) throw new java.io.IOException("Original source changed; reopen the editor");
                            String content = change.getString("content");
                            if (content.length() > 16 * 1024 * 1024 || !content.trim().startsWith(path.toLowerCase(java.util.Locale.ROOT).endsWith(".kicad_pcb") ? "(kicad_pcb" : "(kicad_sch")) throw new java.io.IOException("Invalid revised KiCad source");
                            replacements.put(path, new JSONObject().put("path", path).put("content", content));
                        }
                        JSONObject candidate = new JSONObject();
                        java.util.Iterator<String> keys = original.keys(); while (keys.hasNext()) { String key = keys.next(); candidate.put(key, original.get(key)); }
                        org.json.JSONArray revisedFiles = new org.json.JSONArray();
                        for (int i = 0; i < files.length(); i++) { JSONObject file = files.getJSONObject(i); revisedFiles.put(replacements.getOrDefault(file.getString("path"), file)); }
                        candidate.put("files", revisedFiles);
                        runOnUiThread(() -> { if (trustedPage() && activeProject == original && "https://github.com".equals(activeProviderHost)) launchDownload(candidate, "kicad-project-revised.zip"); });
                    } catch (Exception error) { runOnUiThread(() -> sendError("Cannot export revised project: " + error.getMessage())); }
                });
            });
        }

        @JavascriptInterface
        public void exportText(String name, String text, String mime) {
            runOnUiThread(() -> {
                if (!trustedPage() || text == null || text.length() > 4 * 1024 * 1024 || name == null || !name.matches("[A-Za-z0-9._-]{1,100}") || !("text/csv".equals(mime) || "application/json".equals(mime))) return;
                if (pendingTextExport != null || pendingDownload != null) { sendError("Finish the current export first"); return; }
                pendingTextExport = text; pendingTextEpoch = downloadGeneration.get();
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE, name); intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION); startActivityForResult(intent, REQUEST_TEXT_EXPORT);
            });
        }

        @JavascriptInterface
        public void libraryRequest(int id, String serialized) {
            runOnUiThread(() -> {
                if (!trustedPage() || id < 1 || serialized == null || serialized.length() > 16384) return;
                final JSONObject project = activeProject;
                final JSONObject request;
                try { request = new JSONObject(serialized); }
                catch (Exception error) { libraryReply(id, null, "Invalid library request"); return; }
                final boolean opening = request.optString("action").equals("open");
                final int openEpoch = opening ? importGeneration.incrementAndGet() : -1;
                if (opening) { github.cancelRequests(); gitlab.cancelRequests(); githubImportGeneration.incrementAndGet(); }
                importExecutor.execute(() -> {
                    try {
                        JSONObject result = projectLibrary.handle(request, project);
                        runOnUiThread(() -> {
                            if (!trustedPage()) return;
                            if (opening) {
                                if (openEpoch != importGeneration.get()) { libraryReply(id, null, "Project opening was superseded by another selection"); return; }
                                JSONObject offline = result.optJSONObject("project");
                                if (offline != null) {
                                    recordProject(offline, null, false);
                                    pendingProject = offline.toString(); deliverPendingProject();
                                    result.remove("project");
                                }
                            }
                            libraryReply(id, result, null);
                        });
                    } catch (Exception error) {
                        libraryReply(id, null, error instanceof IllegalArgumentException ? error.getMessage() : "Unable to update project library. Check available storage and retry.");
                    }
                });
            });
        }

        @JavascriptInterface
        public void openFiles() {
            runOnUiThread(() -> {
                if (trustedPage()) launchFiles();
            });
        }

        @JavascriptInterface
        public void openFolder() {
            runOnUiThread(() -> {
                if (trustedPage()) launchFolder();
            });
        }
    }

    private void showTokenDialog(int id, int epoch) {
        android.widget.EditText input = new android.widget.EditText(this);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setSingleLine(true);
        input.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(255) });
        input.setSaveEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO);
        android.app.AlertDialog tokenDialog = new android.app.AlertDialog.Builder(this).setTitle("Connect GitHub token")
                .setMessage("Use a fine-grained token with read-only Contents access to the repositories you need. The token stays in Android secure storage.")
                .setView(input)
                .setPositiveButton("Connect", (dialog, which) -> {
                    final String candidate = input.getText().toString().trim();
                    input.setText("");
                    githubExecutor.execute(() -> {
                        try { githubReply(id, epoch, -1, github.connectToken(candidate, epoch), null); }
                        catch (Exception error) { githubReply(id, epoch, -1, null, githubError(error)); }
                    });
                })
                .setNegativeButton("Cancel", (dialog, which) -> { input.setText(""); githubReply(id, epoch, -1, null, "Token sign-in cancelled"); })
                .setOnCancelListener(dialog -> { input.setText(""); githubReply(id, epoch, -1, null, "Token sign-in cancelled"); })
                .create();
        if (tokenDialog.getWindow() != null) tokenDialog.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        tokenDialog.show();
    }

    private void showGitLabTokenDialog(int id, String host, int epoch) {
        android.widget.EditText input = new android.widget.EditText(this);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setSingleLine(true); input.setSaveEnabled(false);
        input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(500)});
        input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO);
        android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this).setTitle("Connect GitLab")
            .setMessage("Server: " + host + "\nUse read_api for private browsing, or api to publish reviews. Your token stays in protected Android storage.")
            .setView(input).setPositiveButton("Connect", (d,w) -> {
                String token = input.getText().toString().trim(); input.setText("");
                gitlabExecutor.execute(() -> {
                    try { gitlabReply(id, epoch, gitlab.connectToken(host, token, epoch), null); }
                    catch (Exception error) { gitlabReply(id, epoch, null, gitlabError(error)); }
                });
            }).setNegativeButton("Cancel", (d,w) -> { input.setText(""); gitlabReply(id,epoch,null,"GitLab sign-in cancelled"); })
            .setOnCancelListener(d -> { input.setText(""); gitlabReply(id,epoch,null,"GitLab sign-in cancelled"); }).create();
        dialog.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE); dialog.show();
    }
    private static String gitlabError(Exception error) {
        return error instanceof GitLabClient.Failure && error.getMessage() != null ? error.getMessage() : "Unable to complete GitLab request; check server and permissions";
    }
    private void gitlabReply(int id,int epoch,JSONObject result,String error) {
        runOnUiThread(() -> {
            if (!trustedPage() || !gitlab.current(epoch)) return;
            try {
                JSONObject reply=new JSONObject().put("ok",error==null);
                if(error==null)reply.put("result",result);else reply.put("error",error).put("authExpired",gitlab.authExpired());
                webView.evaluateJavascript("window.KiCadAndroidGitLab?.reply("+id+","+reply.toString().replace("\u2028","\\u2028").replace("\u2029","\\u2029")+");",null);
            } catch(Exception ignored) { }
        });
    }
    private void gitlabCallback(Uri uri) {
        if (uri==null || !"kicadvizdiff".equals(uri.getScheme()) || !"gitlab-oauth".equals(uri.getHost())) return;
        final int epoch=gitlab.generation();
        gitlabExecutor.execute(() -> {
            String error=null;
            try { gitlab.completeOAuth(uri,epoch); } catch(Exception failure) { error=gitlabError(failure); }
            final String message=error;
            runOnUiThread(() -> {
                if(!trustedPage() || !gitlab.current(epoch))return;
                JSONObject detail=new JSONObject();
                try { if(message!=null)detail.put("error",message); }catch(Exception ignored) { }
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('kicad-gitlab-auth-changed',{detail:"+detail.toString()+"}));",null);
            });
        });
    }

    private static String githubError(Exception error) {
        // JSON/parser errors can include raw server values; do not expose them to the WebView.
        return error instanceof GitHubClient.Failure && error.getMessage() != null
                ? error.getMessage() : "Unable to complete GitHub request; check the repository and sign-in";
    }

    private void githubReply(int id, int epoch, int importEpoch, JSONObject result, String error) {
        runOnUiThread(() -> {
            if (!trustedPage() || !github.current(epoch)
                    || (importEpoch >= 0 && importEpoch != githubImportGeneration.get())) return;
            if (error != null && github.authExpired()) purgeProject("https://github.com");
            if (error == null && importEpoch >= 0 && result != null)
                recordProject(result.optJSONObject("project"), "https://github.com", result.optBoolean("private"));
            try {
                JSONObject reply = new JSONObject().put("ok", error == null);
                if (error == null) reply.put("result", result);
                else reply.put("error", error).put("authExpired", github.authExpired());
                String serialized = reply.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
                webView.evaluateJavascript("if(window.KiCadAndroidGitHub)window.KiCadAndroidGitHub.reply(" + id + "," + serialized + ");", null);
            } catch (Exception ignored) { }
        });
    }

    private boolean trustedPage() {
        return !destroyed && webView != null && pageReady
                && VIEWER_URL.equals(webView.getUrl());
    }

    private void recordProject(JSONObject project, String providerHost, boolean isPrivate) {
        if (project == null) return;
        activeProject = project;
        activeProviderHost = providerHost;
        activePrivate = isPrivate;
        downloadGeneration.incrementAndGet();
        pendingDownload = null;
    }

    private void purgeProject(String providerHost) {
        if (!providerHost.equals(activeProviderHost)) return;
        activeProject = null;
        activeProviderHost = null;
        activePrivate = false;
        pendingDownload = null;
        downloadGeneration.incrementAndGet();
    }

    private void launchDownload() { launchDownload(activeProject, "kicad-project.zip"); }

    private void launchDownload(JSONObject candidate, String filename) {
        if (pendingDownload != null || pendingTextExport != null) return;
        if (activeProject == null) { sendError("Open a project before downloading"); return; }
        final JSONObject project = activeProject;
        final int epoch = downloadGeneration.get();
        Runnable create = () -> {
            if (!trustedPage() || activeProject != project || downloadGeneration.get() != epoch) return;
            pendingDownload = candidate;
            pendingDownloadEpoch = epoch;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(intent, REQUEST_DOWNLOAD);
        };
        if (activePrivate) {
            new android.app.AlertDialog.Builder(this).setTitle("Download private project?")
                    .setMessage("This creates an unencrypted ZIP copy of the project files at the location you choose. Signing out will not delete that copy.")
                    .setPositiveButton("Download", (dialog, which) -> create.run())
                    .setNegativeButton("Cancel", (dialog, which) -> sendDownloadResult("Project download cancelled"))
                    .setOnCancelListener(dialog -> sendDownloadResult("Project download cancelled")).show();
        } else create.run();
    }

    private void exportProject(Uri destination) {
        final JSONObject project = pendingDownload;
        final int epoch = pendingDownloadEpoch;
        pendingDownload = null;
        if (project == null || epoch != downloadGeneration.get()) {
            deleteIncompleteDownload(destination);
            sendError("Project download cancelled because the active project changed");
            return;
        }
        sendLoading("Saving project ZIP…");
        importExecutor.execute(() -> {
            try {
                ProjectExporter.write(getContentResolver(), destination, project,
                        () -> destroyed || epoch != downloadGeneration.get());
                runOnUiThread(() -> {
                    if (trustedPage() && epoch == downloadGeneration.get()) {
                        sendDownloadResult("Project ZIP saved");
                    }
                });
            } catch (Exception error) {
                deleteIncompleteDownload(destination);
                runOnUiThread(() -> { if (!destroyed) sendError("Unable to save project ZIP; download cancelled or destination unavailable"); });
            }
        });
    }

    private void sendDownloadResult(String message) {
        if (trustedPage()) webView.evaluateJavascript(
                "window.KiCadAndroid?.receiveDownloadResult?.(" + JSONObject.quote(message) + ");", null);
    }

    private void libraryReply(int id, JSONObject result, String error) {
        runOnUiThread(() -> {
            if (!trustedPage()) return;
            try {
                JSONObject reply = new JSONObject().put("ok", error == null);
                if (error == null) reply.put("result", result); else reply.put("error", error);
                webView.evaluateJavascript("window.KiCadAndroidLibrary?.reply(" + id + "," + reply.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + ");", null);
            } catch (Exception ignored) { }
        });
    }

    private void deleteIncompleteDownload(Uri uri) {
        try { DocumentsContract.deleteDocument(getContentResolver(), uri); }
        catch (Exception ignored) { /* Provider may require the user to remove its partial document. */ }
    }

    private void launchFiles() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(intent, REQUEST_FILES);
    }

    private void launchFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(intent, REQUEST_FOLDER);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_WEB_FILE) {
            android.webkit.ValueCallback<Uri[]> callback = webFileCallback; webFileCallback = null;
            if (callback != null) callback.onReceiveValue(trustedPage() ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null);
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == REQUEST_TEXT_EXPORT) { pendingTextExport = null; sendDownloadResult("BoM export cancelled"); }
            if (requestCode == REQUEST_DOWNLOAD) {
                pendingDownload = null;
                sendDownloadResult("Project download cancelled");
            }
            return;
        }
        Uri uri = data.getData();
        if (requestCode == REQUEST_TEXT_EXPORT) {
            final String text = pendingTextExport; final int epoch = pendingTextEpoch; pendingTextExport = null;
            if (text == null || epoch != downloadGeneration.get()) { deleteIncompleteDownload(uri); sendError("Export cancelled because the project changed"); return; }
            importExecutor.execute(() -> {
                try (java.io.OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException("Cannot write selected destination");
                    output.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    runOnUiThread(() -> sendDownloadResult("BoM file saved"));
                } catch (Exception error) { deleteIncompleteDownload(uri); runOnUiThread(() -> sendError("Cannot save BoM file")); }
            });
        } else if (requestCode == REQUEST_DOWNLOAD) {
            exportProject(uri);
        } else if (requestCode == REQUEST_FILES) {
            importSource(uri, false);
        } else if (requestCode == REQUEST_FOLDER) {
            importSource(uri, true);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        importExternalIntent(intent);
    }

    private void checkGitHubLogin() {
        if (destroyed || github == null || githubPollInFlight) return;
        boolean expired = github.deviceExpired();
        if(!github.pendingDevice()) { if(expired && trustedPage()) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('kicad-github-auth-changed',{detail:{pending:false,error:'GitHub sign-in expired. Start again.'}}));",null); return; }
        loginHandler.removeCallbacks(githubPollTask); githubPollInFlight = true;
        final int epoch = github.generation();
        githubExecutor.execute(() -> {
            JSONObject result = null; String failure = null;
            try { result = github.handle(new JSONObject().put("action","device-poll"),epoch); }
            catch(Exception error) { failure = githubError(error); }
            final JSONObject state = result; final String message = failure;
            runOnUiThread(() -> {
                githubPollInFlight = false;
                if(destroyed) return;
                if(!github.current(epoch)) { checkGitHubLogin(); return; }
                boolean pending = github.pendingDevice();
                if(!pending) clearCopiedGitHubCode();
                try { JSONObject detail = state == null ? new JSONObject().put("pending",pending).put("error",message) : state;
                    if(trustedPage()) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('kicad-github-auth-changed',{detail:"+detail.toString().replace("\u2028","\\u2028").replace("\u2029","\\u2029")+"}));",null);
                } catch(Exception ignored) { }
                if(pending) loginHandler.postDelayed(githubPollTask, Math.max(5,state==null?15:state.optInt("interval",5))*1000L);
            });
        });
    }

    private boolean copyGitHubCode() {
        String code = github.displayedCode(); if(code.isEmpty()) return false;
        android.content.ClipData clip = android.content.ClipData.newPlainText("GitHub sign-in code",code);
        android.os.PersistableBundle extras = new android.os.PersistableBundle(); extras.putBoolean("android.content.extra.IS_SENSITIVE",true);clip.getDescription().setExtras(extras);
        ((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(clip); copiedGitHubCode = code; return true;
    }
    private void clearCopiedGitHubCode() {
        if(copiedGitHubCode == null || !activityResumed) return;
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        android.content.ClipData clip = clipboard.getPrimaryClip();
        if(clip != null && clip.getItemCount()==1 && copiedGitHubCode.contentEquals(clip.getItemAt(0).getText()==null?"":clip.getItemAt(0).getText())) {
            if(Build.VERSION.SDK_INT>=28) clipboard.clearPrimaryClip(); else clipboard.setPrimaryClip(android.content.ClipData.newPlainText("",""));
        }
        copiedGitHubCode = null;
    }

    private void openGitHubVerification(boolean mobile) {
        copyGitHubCode();
        Uri uri = Uri.parse("https://github.com/login/device");
        if(mobile) { Intent githubApp = new Intent(Intent.ACTION_VIEW,uri).setPackage("com.github.android");
            try { startActivity(githubApp); return; } catch(android.content.ActivityNotFoundException ignored) { }
        }
        String browser = androidx.browser.customtabs.CustomTabsClient.getPackageName(this, null);
        if(browser != null) { androidx.browser.customtabs.CustomTabsIntent tab = new androidx.browser.customtabs.CustomTabsIntent.Builder().setShowTitle(true).build(); tab.intent.setPackage(browser);
            try { tab.launchUrl(this,uri); return; } catch(android.content.ActivityNotFoundException ignored) { }
        }
        openBrowser(uri);
    }

    private void openBrowser(Uri uri) {
        Intent browser = new Intent(Intent.ACTION_VIEW, uri);
        browser.setSelector(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER));
        try { startActivity(browser); }
        catch (android.content.ActivityNotFoundException error) { Toast.makeText(this, "Install or enable a browser to sign in.", Toast.LENGTH_LONG).show(); }
    }

    private void importExternalIntent(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null
                && "kicadvizdiff".equals(intent.getData().getScheme()) && "gitlab-oauth".equals(intent.getData().getHost())) { gitlabCallback(intent.getData()); return; }
        try {
            String link = ProjectLink.fromIntent(intent);
            if (link != null) { pendingProjectLink = link; deliverPendingProjectLink(); return; }
        } catch (IllegalArgumentException error) {
            Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show(); return;
        }
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())
                && intent.getData() != null
                && "content".equals(intent.getData().getScheme())) {
            importSource(intent.getData(), false);
        }
    }

    private void deliverPendingProjectLink() {
        if (!trustedPage() || pendingProjectLink == null) return;
        String link = pendingProjectLink; pendingProjectLink = null;
        webView.evaluateJavascript("window.KiCadAndroidLinks.receive(" + JSONObject.quote(link).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + ");", null);
    }

    private void importSource(Uri uri, boolean folder) {
        github.cancelRequests();
                gitlab.cancelRequests();
        githubImportGeneration.incrementAndGet();
        final int generation = importGeneration.incrementAndGet();
        sendLoading("Opening " + (folder ? "folder" : "file") + "…");
        importExecutor.execute(() -> {
            try {
                JSONObject project = ProjectImporter.read(
                        getContentResolver(), getCacheDir(), uri, folder,
                        () -> generation != importGeneration.get() || destroyed);
                String json = project.toString();
                runOnUiThread(() -> {
                    if (generation != importGeneration.get() || destroyed) return;
                    recordProject(project, null, false);
                    pendingProject = json;
                    deliverPendingProject();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (generation != importGeneration.get() || destroyed) return;
                    String message = error.getMessage() == null ? "Unable to open project" : error.getMessage();
                    sendError(message);
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void deliverPendingProject() {
        if (!trustedPage() || pendingProject == null) return;
        String json = pendingProject;
        pendingProject = null;
        webView.evaluateJavascript("window.KiCadAndroid.receiveProject(" + json + ");", null);
    }

    private void sendLoading(String message) {
        if (trustedPage()) {
            webView.evaluateJavascript("if(window.KiCadAndroid&&window.KiCadAndroid.setLoading)" +
                    "window.KiCadAndroid.setLoading(" + JSONObject.quote(message) + ");", null);
        }
    }

    private void sendError(String message) {
        if (trustedPage()) {
            webView.evaluateJavascript("if(window.KiCadAndroid&&window.KiCadAndroid.receiveError)" +
                    "window.KiCadAndroid.receiveError(" + JSONObject.quote(message) + ");", null);
        }
    }

    @Override
    protected void onPause() {
        activityResumed = false;
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityResumed = true;
        if(github != null && !github.pendingDevice()) clearCopiedGitHubCode();
        if (webView != null) { webView.onResume(); if(trustedPage()) webView.evaluateJavascript("window.dispatchEvent(new Event('kicad-android-resumed'));",null); }
        checkGitHubLogin();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyTextScale();
        if (webView != null) webView.requestApplyInsets();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        loginHandler.removeCallbacks(githubPollTask);
        activeProject = null;
        activeProviderHost = null;
        pendingDownload = null;
        pendingTextExport = null;
        if (webFileCallback != null) { webFileCallback.onReceiveValue(null); webFileCallback = null; }
        downloadGeneration.incrementAndGet();
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
        importGeneration.incrementAndGet();
        importExecutor.shutdownNow();
        github.invalidateRequests();
                gitlab.cancelRequests();
        githubExecutor.shutdownNow();
        gitlabExecutor.shutdownNow();
        pendingProject = null;
        if (webView != null) {
            webView.removeJavascriptInterface("NativeKiCadHost");
            webView.loadUrl("about:blank");
            if (webView.getParent() instanceof android.view.ViewGroup) {
                ((android.view.ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
