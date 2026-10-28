package dev.kicadvizdiff.android;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
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
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.window.layout.WindowInfoTracker;
import androidx.window.layout.WindowLayoutInfo;
import androidx.window.layout.FoldingFeature;
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter;

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
    private static final int REQUEST_TEMPORARY_NOTIFICATIONS = 1006;
    private static final int REQUEST_CAMERA = 1007;
    private PermissionRequest pendingCameraRequest;
    private boolean cameraRuntimeRequested;
    private boolean cameraRuntimeGranted;
    private int temporaryPermissionReply = -1;
    private boolean temporaryRefreshInFlight;

    private final ExecutorService importExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger importGeneration = new AtomicInteger();
    private static final class ReadTicket {
        final NativeLoadOperation operation = new NativeLoadOperation();
        final boolean opensProject;
        JSONObject project; String host; boolean isPrivate;
        ReadTicket(boolean opensProject) { this.opensProject = opensProject; }
    }
    // Accessed only on the main thread; cancellation closes I/O on a separate executor.
    private final java.util.Map<Integer,ReadTicket> githubReads = new java.util.HashMap<>();
    private final java.util.Map<Integer,ReadTicket> gitlabReads = new java.util.HashMap<>();
    private final java.util.Map<Integer,ReadTicket> libraryReads = new java.util.HashMap<>();
    private ReadTicket localRead;
    private int pendingProjectLoadId = -1;
    private ReadTicket beginRead(java.util.Map<Integer,ReadTicket> reads,int id,boolean opens) {
        if(reads.size()>=64 || reads.containsKey(id)) throw new IllegalArgumentException("Too many pending reads");
        ReadTicket ticket=new ReadTicket(opens); reads.put(id,ticket); return ticket;
    }
    private void cancelRead(java.util.Map<Integer,ReadTicket> reads,int id) {
        ReadTicket ticket=reads.remove(id); if(ticket!=null)ticket.operation.cancel();
    }
    private void acceptRead(java.util.Map<Integer,ReadTicket> reads,int id) {
        ReadTicket ticket=reads.get(id);
        if(ticket==null||ticket.project==null||!trustedPage()||!ticket.operation.accept())return;
        reads.remove(id);recordProject(ticket.project,ticket.host,ticket.isPrivate);
    }
    private void stopProjectLoads() {
        if(localRead!=null){localRead.operation.cancel();localRead=null;pendingProject=null;pendingProjectLoadId=-1;importGeneration.incrementAndGet();}
        for(java.util.Map<Integer,ReadTicket> reads:java.util.Arrays.asList(githubReads,gitlabReads,libraryReads)) {
            java.util.Iterator<ReadTicket> pending=reads.values().iterator();
            while(pending.hasNext()){ReadTicket ticket=pending.next();if(ticket.opensProject){ticket.operation.cancel();pending.remove();}}
        }
    }
    private void cancelAllReads() {
        stopProjectLoads();
        for(java.util.Map<Integer,ReadTicket> reads:java.util.Arrays.asList(githubReads,gitlabReads,libraryReads)) {
            for(ReadTicket ticket:reads.values())ticket.operation.cancel();reads.clear();
        }
    }
    private boolean deliverRead(java.util.Map<Integer,ReadTicket> reads,int id,ReadTicket ticket,JSONObject result,String error,String host) {
        if(ticket==null)return true;
        if(reads.get(id)!=ticket||ticket.operation.cancelled())return false;
        if(error==null&&ticket.opensProject&&result!=null&&result.optJSONObject("project")!=null){
            ticket.project=result.optJSONObject("project");ticket.host=host;ticket.isPrivate=result.optBoolean("private");
        }else reads.remove(id);
        return true;
    }

    private WebView webView;
    private boolean pageReady;
    private boolean backPending;
    private OnBackInvokedCallback backCallback;
    private volatile boolean destroyed;
    private String pendingProject;
    private String pendingProjectLink;
    private volatile JSONObject activeProject;
    private volatile String activeProviderHost;
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
    private final NativeRequestGuard bridgeMessageGuard = new NativeRequestGuard();
    private boolean nativeBridgeReady;
    private boolean restrictionsListening;
    private EnterprisePolicy appliedPolicy;
    private final android.content.BroadcastReceiver restrictionsReceiver=new android.content.BroadcastReceiver(){
        @Override public void onReceive(android.content.Context context,Intent intent){applyManagedPolicy();}
    };
    private void applyManagedPolicy(){
        EnterprisePolicy policy=ManagedPolicy.read(this);
        if(policy.secureScreen)getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if(appliedPolicy!=null&&((appliedPolicy.network&&!policy.network)||(appliedPolicy.providerWrites&&!policy.providerWrites))){
            if(github!=null)github.invalidateRequests();if(gitlab!=null)gitlab.cancelRequests();
        }
        appliedPolicy=policy;
    }

    private final NativeRequestGuard providerRequestGuard = new NativeRequestGuard();
    private final ExecutorService githubExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger githubImportGeneration = new AtomicInteger();
    private GitHubClient github;
    private GitLabClient gitlab;
    private ProjectLibrary projectLibrary;
    private DiskProjectStore diskProjectStore;
    private final ExecutorService gitlabExecutor = Executors.newSingleThreadExecutor();
    private WindowInfoTrackerCallbackAdapter foldTracker;
    private boolean foldListening;
    private android.graphics.Rect foldBounds;
    private boolean foldVertical;
    private String foldState = "unknown";
    private final androidx.core.util.Consumer<WindowLayoutInfo> foldListener = info -> {
        if (!foldListening || destroyed) return;
        foldBounds = null; foldState = "unknown";
        for (androidx.window.layout.DisplayFeature feature : info.getDisplayFeatures()) {
            if (!(feature instanceof FoldingFeature)) continue;
            FoldingFeature fold = (FoldingFeature) feature;
            if (!fold.isSeparating() && fold.getOcclusionType() != FoldingFeature.OcclusionType.FULL) continue;
            foldBounds = new android.graphics.Rect(fold.getBounds());
            foldVertical = fold.getOrientation() == FoldingFeature.Orientation.VERTICAL;
            foldState = fold.getState() == FoldingFeature.State.HALF_OPENED ? "half-opened"
                    : fold.getState() == FoldingFeature.State.FLAT ? "flat" : "unknown";
            break;
        }
        publishFold();
    };
    private final android.view.View.OnLayoutChangeListener foldLayoutListener =
            (view,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom) -> publishFold();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        github = new GitHubClient(this);
        gitlab = new GitLabClient(this);
        projectLibrary = new ProjectLibrary(this);
        diskProjectStore = new DiskProjectStore(this);
        gitlab.setDiskProjectStore(diskProjectStore);
        importExecutor.execute(() -> { diskProjectStore.cleanupExpired(); diskProjectStore.scheduleCleanup(); });
        configureWindow();
        applyManagedPolicy();
        android.content.IntentFilter restrictionsFilter=new android.content.IntentFilter(Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(restrictionsReceiver,restrictionsFilter,android.content.Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(restrictionsReceiver,restrictionsFilter);
        restrictionsListening=true;
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
        nativeBridgeReady = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (nativeBridgeReady) {
            NativeBridge nativeApi = new NativeBridge();
            WebViewCompat.addWebMessageListener(webView, "NativeKiCadBridge",
                Collections.singleton("https://appassets.androidplatform.net"),
                (view, message, sourceOrigin, mainFrame, replyProxy) -> {
                    if (!trustedPage() || !NativeBridgePolicy.trustedOrigin(sourceOrigin.toString(), mainFrame)
                            || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    String payload = message.getData();
                    if (payload == null || payload.length() > 26 * 1024 * 1024
                            || !bridgeMessageGuard.admit(android.os.SystemClock.elapsedRealtime())) return;
                    try { dispatchNativeMessage(nativeApi, new JSONObject(payload)); }
                    catch (Exception ignored) { /* Never echo parser values or untrusted payloads. */ }
                    finally { bridgeMessageGuard.release(); }
                });
        } else Toast.makeText(this, "Update Android System WebView to enable secure file and account access.", Toast.LENGTH_LONG).show();
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
                requestCamera(request);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingCameraRequest == request) clearCameraRequest(false);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!NativeBridgePolicy.viewerResource(uri.toString())) return forbidden();
                if(uri.getPath().startsWith("/assets/viewer/downloaded/") || uri.getPath().startsWith("/assets/viewer/temporary-downloads/")) { WebResourceResponse disk=diskProjectStore.response(uri); return disk!=null?disk:forbidden(); }
                WebResourceResponse response = assetLoader.shouldInterceptRequest(uri);
                if(response!=null&&uri.getPath().endsWith(".mjs"))response.setMimeType("application/javascript");
                return response != null ? response : forbidden();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame()) {
                    return !VIEWER_URL.equals(request.getUrl().toString());
                }
                Uri uri = request.getUrl();
                // Imported HTML is inert source data, never a native-bridge document.
                return !NativeBridgePolicy.viewerResource(uri.toString()) || NativeBridgePolicy.importedResource(uri.toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if(pageReady)cancelAllReads();
                clearCameraRequest(true);
                pageReady = false;
                if (webFileCallback != null) { webFileCallback.onReceiveValue(null); webFileCallback = null; }
                github.invalidateRequests();
                gitlab.cancelRequests();
                githubImportGeneration.incrementAndGet();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!VIEWER_URL.equals(url) || destroyed) return;
                if (!nativeBridgeReady) {
                    pageReady = true;
                    publishFold();
                    view.evaluateJavascript("window.KiCadAndroidNativeUnavailable='Update Android System WebView to enable secure file and account access';window.dispatchEvent(new Event('kicad-android-security-unavailable'));", null);
                    return;
                }
                view.evaluateJavascript(
                    "(function(){var transport=window.NativeKiCadBridge;var host={};" +
                    "['openFiles','openFolder','downloadProject','openRepositorySource','composeReport','setPresentation','exportCandidateProject','exportText','libraryRequest','githubRequest','gitlabRequest','cancelGithubRequest','cancelGitlabRequest','cancelLibraryRequest','cancelProjectLoad','acceptGithubRequest','acceptGitlabRequest','acceptLibraryRequest','acceptProjectLoad'].forEach(function(name){" +
                    "host[name]=function(){transport.postMessage(JSON.stringify({method:name,args:Array.from(arguments)}));};});" +
                    "Object.defineProperty(window,'NativeKiCadHost',{value:Object.freeze(host),writable:false,configurable:false});})()", null);
                view.evaluateJavascript(
                        "window.AndroidKiCad=Object.assign(window.AndroidKiCad||{}," +
                        "{openFiles:function(){NativeKiCadHost.openFiles()}," +
                        "openRepositorySource:function(url){NativeKiCadHost.openRepositorySource(String(url))}," +
                        "composeReport:function(body){NativeKiCadHost.composeReport(String(body))}," +
                        "setPresentation:function(active){NativeKiCadHost.setPresentation(Boolean(active))}," +
                        "openFolder:function(){NativeKiCadHost.openFolder()}," +
                        "downloadProject:function(){NativeKiCadHost.downloadProject()}," +
                        "exportCandidateProject:function(value){NativeKiCadHost.exportCandidateProject(JSON.stringify(value))}," +
                        "exportText:function(name,text,mime){NativeKiCadHost.exportText(name,text,mime)}," +
                        "cancelGithubRequest:function(id){NativeKiCadHost.cancelGithubRequest(id)}," +
                        "cancelGitlabRequest:function(id){NativeKiCadHost.cancelGitlabRequest(id)}," +
                        "cancelLibraryRequest:function(id){NativeKiCadHost.cancelLibraryRequest(id)}," +
                        "cancelProjectLoad:function(){NativeKiCadHost.cancelProjectLoad()}," +
                        "acceptGithubRequest:function(id){NativeKiCadHost.acceptGithubRequest(id)}," +
                        "acceptGitlabRequest:function(id){NativeKiCadHost.acceptGitlabRequest(id)}," +
                        "acceptLibraryRequest:function(id){NativeKiCadHost.acceptLibraryRequest(id)}," +
                        "acceptProjectLoad:function(id){NativeKiCadHost.acceptProjectLoad(id)}," +
                        "libraryRequest:function(id,message){NativeKiCadHost.libraryRequest(id,JSON.stringify(message))}," +
                        "githubRequest:function(id,message){NativeKiCadHost.githubRequest(id,JSON.stringify(message))}," +
                        "gitlabRequest:function(id,message){NativeKiCadHost.gitlabRequest(id,JSON.stringify(message))}});" +
                        "window.dispatchEvent(new Event('kicad-android-ready'));", null);
                pageReady = true;
                publishFold();
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
        // Draw backgrounds to every edge. Only the IME resizes the native view;
        // cutout/gesture clearance belongs to individual HTML controls.
        if (Build.VERSION.SDK_INT >= 30) {
            viewport.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
                int gestureBottom = insets.getInsets(WindowInsets.Type.mandatorySystemGestures()).bottom;
                view.setPadding(0, 0, 0, ime);
                safeViewportInsets = new int[]{safe.left,safe.top,safe.right,ime>0?0:Math.max(safe.bottom,gestureBottom)};
                publishSafeInsets();
                return WindowInsets.CONSUMED;
            });
        } else if (Build.VERSION.SDK_INT >= 28) {
            viewport.setOnApplyWindowInsetsListener((view, insets) -> {
                android.view.DisplayCutout cutout = insets.getDisplayCutout();
                view.setPadding(0,0,0,0);
                safeViewportInsets = cutout == null ? new int[4] : new int[]{cutout.getSafeInsetLeft(),cutout.getSafeInsetTop(),cutout.getSafeInsetRight(),cutout.getSafeInsetBottom()};
                publishSafeInsets();
                return insets.consumeDisplayCutout();
            });
        }
        setContentView(viewport);
        webView.addOnLayoutChangeListener(foldLayoutListener);
        viewport.requestApplyInsets();
    }

    @Override protected void onStart() {
        super.onStart();
        if (foldTracker == null) foldTracker = new WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(this));
        foldListening = true;
        foldTracker.addWindowLayoutInfoListener(this, command -> loginHandler.post(command), foldListener);
        publishFold();
    }

    @Override protected void onStop() {
        clearCameraRequest(true);
        if (foldTracker != null && foldListening) foldTracker.removeWindowLayoutInfoListener(foldListener);
        foldListening = false;
        super.onStop();
    }

    private int[] safeViewportInsets = new int[4];
    private void publishSafeInsets() {
        if(webView==null||!trustedPage()||webView.getWidth()<=0||webView.getHeight()<=0)return;
        webView.evaluateJavascript("(()=>{const sx=innerWidth/"+webView.getWidth()+",sy=innerHeight/"+webView.getHeight()+";window.KiCadAndroidSafeInsets={left:"+safeViewportInsets[0]+"*sx,top:"+safeViewportInsets[1]+"*sy,right:"+safeViewportInsets[2]+"*sx,bottom:"+safeViewportInsets[3]+"*sy};window.dispatchEvent(new Event('kicad-safe-insets'));})()",null);
    }

    private void publishFold() {
        publishSafeInsets();
        if (destroyed || webView == null || !trustedPage() || webView.getWidth() <= 0 || webView.getHeight() <= 0) return;
        int[] location = new int[2];webView.getLocationInWindow(location);
        double[] region = foldBounds == null ? null : FoldGeometry.project(foldVertical,
                foldBounds.left,foldBounds.top,foldBounds.right,foldBounds.bottom,
                location[0],location[1],webView.getWidth(),webView.getHeight());
        try {
            JSONObject state = new JSONObject().put("orientation",region == null ? "none" : foldVertical ? "vertical" : "horizontal")
                    .put("x",region == null ? 0 : region[0]).put("y",region == null ? 0 : region[1])
                    .put("width",region == null ? 0 : region[2]).put("height",region == null ? 0 : region[3])
                    .put("separating",region != null).put("state",region == null ? "unknown" : foldState);
            // Android bounds use window physical pixels; inset offsets above and current CSS viewport scales below.
            webView.evaluateJavascript("(()=>{const value="+state+";const sx=innerWidth/"+webView.getWidth()+",sy=innerHeight/"+webView.getHeight()+";value.x*=sx;value.width*=sx;value.y*=sy;value.height*=sy;const before=window.KiCadAndroidFold;window.KiCadAndroidFold=value;if(JSON.stringify(before)!==JSON.stringify(value))window.dispatchEvent(new CustomEvent('kicad-fold-changed',{detail:value}));})()",null);
        } catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
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
        applySystemBarAppearance();
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        } else {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
        enterFullscreen();
    }

    @SuppressWarnings("deprecation")
    private void enterFullscreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            android.view.View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                    | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarAppearance() {
        boolean light = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES;
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().getDecorView(); // Create decor before PhoneWindow.getInsetsController on cold start.
            int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(light ? mask : 0, mask);
        } else {
            int mask = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            int flags = getWindow().getDecorView().getSystemUiVisibility();
            getWindow().getDecorView().setSystemUiVisibility(light ? flags | mask : flags & ~mask);
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

    // API 26ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“32 compatibility only: API 33+ back gestures use the platform
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
        clearCameraRequest(true);
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

    private void dispatchNativeMessage(NativeBridge api, JSONObject message) throws Exception {
        if (message.length() != 2) return;
        String method = message.getString("method"); org.json.JSONArray args = message.getJSONArray("args");
        switch (method) {
            case "openFiles": if (args.length() == 0) api.openFiles(); break;
            case "openFolder": if (args.length() == 0) api.openFolder(); break;
            case "downloadProject": if (args.length() == 0) api.downloadProject(); break;
            case "openRepositorySource": if (args.length() == 1 && args.get(0) instanceof String) api.openRepositorySource(args.getString(0)); break;
            case "composeReport": if (args.length() == 1 && args.get(0) instanceof String) api.composeReport(args.getString(0)); break;
            case "setPresentation": if (args.length() == 1 && args.get(0) instanceof Boolean) api.setPresentation(args.getBoolean(0)); break;
            case "exportCandidateProject": if (args.length() == 1 && args.get(0) instanceof String) api.exportCandidateProject(args.getString(0)); break;
            case "exportText": if (args.length() == 3 && args.get(0) instanceof String && args.get(1) instanceof String && args.get(2) instanceof String) api.exportText(args.getString(0), args.getString(1), args.getString(2)); break;
            case "cancelProjectLoad": if(args.length()==0)api.cancelProjectLoad();break;
            case "cancelGithubRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.cancelGithubRequest(args.getInt(0));break;
            case "cancelGitlabRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.cancelGitlabRequest(args.getInt(0));break;
            case "cancelLibraryRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.cancelLibraryRequest(args.getInt(0));break;
            case "acceptGithubRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.acceptGithubRequest(args.getInt(0));break;
            case "acceptGitlabRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.acceptGitlabRequest(args.getInt(0));break;
            case "acceptLibraryRequest": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.acceptLibraryRequest(args.getInt(0));break;
            case "acceptProjectLoad": if(args.length()==1&&args.get(0) instanceof Number&&args.getDouble(0)==args.getInt(0)&&args.getInt(0)>=0)api.acceptProjectLoad(args.getInt(0));break;
            case "libraryRequest": case "githubRequest": case "gitlabRequest":
                if (args.length() != 2 || !(args.get(0) instanceof Number) || !(args.get(1) instanceof String)
                        || args.getDouble(0) != args.getInt(0) || args.getInt(0) < 0) return;
                int id = args.getInt(0); String body = args.getString(1);
                if (method.equals("libraryRequest")) api.libraryRequest(id, body);
                else if (method.equals("githubRequest")) api.githubRequest(id, body);
                else api.gitlabRequest(id, body);
                break;
            default: break;
        }
    }

    private final class NativeBridge {
        public void cancelGithubRequest(int id){runOnUiThread(()->{if(trustedPage())cancelRead(githubReads,id);});}
        public void cancelGitlabRequest(int id){runOnUiThread(()->{if(trustedPage())cancelRead(gitlabReads,id);});}
        public void cancelLibraryRequest(int id){runOnUiThread(()->{if(trustedPage())cancelRead(libraryReads,id);});}
        public void cancelProjectLoad(){runOnUiThread(()->{if(trustedPage())stopProjectLoads();});}
        public void acceptGithubRequest(int id){runOnUiThread(()->acceptRead(githubReads,id));}
        public void acceptGitlabRequest(int id){runOnUiThread(()->acceptRead(gitlabReads,id));}
        public void acceptLibraryRequest(int id){runOnUiThread(()->acceptRead(libraryReads,id));}
        public void acceptProjectLoad(int id){runOnUiThread(()->{
            if(trustedPage()&&localRead!=null&&id==importGeneration.get()&&localRead.project!=null&&localRead.operation.accept()){
                recordProject(localRead.project,null,false);localRead=null;
            }
        });}

        public void openRepositorySource(String url) {
            if (url == null || url.length() > 4096) return;
            runOnUiThread(() -> {
                if (!trustedPage() || activeProject == null || activeProviderHost == null) return;
                try {
                    if (!NativeBridgePolicy.repositorySource(url, activeProviderHost)) return;
                    openBrowser(Uri.parse(url));
                } catch (Exception ignored) { }
            });
        }

        public void composeReport(String body) {
            if (body == null || body.length() > 8192) return;
            runOnUiThread(() -> {
                if (!trustedPage()) return;
                if(!ManagedPolicy.read(MainActivity.this).network){sendError("Network access is disabled by managed application policy.");return;}
                Intent draft = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@sigharmonic.com?subject="
                        + Uri.encode("Pocket KiView content/user report") + "&body=" + Uri.encode(body)));
                draft.putExtra(Intent.EXTRA_SUBJECT, "Pocket KiView content/user report");
                draft.putExtra(Intent.EXTRA_TEXT, body);
                try { startActivity(draft); }
                catch (android.content.ActivityNotFoundException error) {
                    android.widget.Toast.makeText(MainActivity.this, "Email support@sigharmonic.com to report this concern.", android.widget.Toast.LENGTH_LONG).show();
                }
            });
        }
        public void setPresentation(boolean active) {
            runOnUiThread(() -> {
                if (!trustedPage()) return;
                if (active) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
        public void githubRequest(int id, String json) {
            if (id < 0 || json == null || json.length() > 1600000
                    || !providerRequestGuard.admit(android.os.SystemClock.elapsedRealtime())) return;
            providerRequestGuard.dispatch(MainActivity.this::runOnUiThread, () -> {
                if (!trustedPage()) return;
                try {
                    JSONObject request = new JSONObject(json);
                    String action = request.getString("action");
                    ManagedPolicy.requireAction(MainActivity.this,action);
                    if (action.equals("device-start") || action.equals("sign-out") || action.equals("token-connect")) {
                        purgeProject("https://github.com");
                        github.reset(); clearCopiedGitHubCode();
                        githubImportGeneration.incrementAndGet();
                    } else if (action.equals("device-cancel")) { github.cancelDevice(); clearCopiedGitHubCode(); }

                    final int epoch = github.generation();
                    final boolean chatScoped=action.equals("repository-fork-revision")||action.equals("chat-message-write")||action.equals("chat-thread-state")||action.equals("chat-thread-list")||request.optBoolean("chatContext")||action.equals("review-thread")&&request.optBoolean("includeCapabilities");
                    final JSONObject chatProject=activeProject;final int chatProjectEpoch=downloadGeneration.get();
                    final NativeChatScope.Guard chatGuard=()->{if(downloadGeneration.get()!=chatProjectEpoch||activeProject!=chatProject||!"https://github.com".equals(activeProviderHost)||!NativeChatRequest.matchesProject(chatProject,"github","https://github.com",request))throw new java.io.IOException("The chat project changed; reopen its conversation before posting");};
                    if(chatScoped)chatGuard.check();
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
                    final boolean opens=action.equals("import");
                    if(opens)stopProjectLoads();
                    final ReadTicket read=GitHubClient.cancellableRead(action)?beginRead(githubReads,id,action.equals("import")):null;
                    final int importEpoch = -1;
                    providerRequestGuard.execute(githubExecutor, () -> {
                        try (NativeChatScope.Scope chatLease=chatScoped?NativeChatScope.enter(chatGuard):null) { JSONObject result = read==null?github.handle(request, epoch):github.handleLoad(request,epoch,read.operation); githubReply(id, epoch, importEpoch, result, null, read);
                            if (action.equals("device-start") || action.equals("auth-status")) runOnUiThread(MainActivity.this::checkGitHubLogin);
                        }
                        catch (Exception error) { githubReply(id, epoch, importEpoch, null, githubError(error),read); }
                    });
                } catch (Exception error) {
                    githubReply(id, github.generation(), -1, null, error instanceof ManagedPolicy.Denied ? error.getMessage() : "Invalid GitHub request or browser unavailable");
                }
            });
        }
        public void gitlabRequest(int id, String json) {
            if (id < 0 || json == null || json.length() > 1600000
                    || !providerRequestGuard.admit(android.os.SystemClock.elapsedRealtime())) return;
            providerRequestGuard.dispatch(MainActivity.this::runOnUiThread, () -> {
                if (!trustedPage()) return;
                try {
                    JSONObject request = new JSONObject(json);
                    String action = request.getString("action");
                    ManagedPolicy.requireAction(MainActivity.this,action);
                    String host = GitLabClient.validateHost(request.optString("host", "https://gitlab.com"));
                    if (action.equals("sign-out") || action.equals("token-connect") || action.equals("oauth-start")) { purgeProject(host); gitlab.reset(host); }

                    final int epoch = gitlab.generation();
                    final boolean chatScoped=action.equals("repository-fork-revision")||action.equals("chat-message-write")||action.equals("chat-thread-state")||action.equals("chat-thread-list")||request.optBoolean("chatContext")||action.equals("thread")&&request.optBoolean("includeCapabilities");
                    final JSONObject chatProject=activeProject;final int chatProjectEpoch=downloadGeneration.get();
                    final NativeChatScope.Guard chatGuard=()->{if(downloadGeneration.get()!=chatProjectEpoch||activeProject!=chatProject||!host.equals(activeProviderHost)||!NativeChatRequest.matchesProject(chatProject,"gitlab",host,request))throw new java.io.IOException("The chat project changed; reopen its conversation before posting");};
                    if(chatScoped)chatGuard.check();
                    if (action.equals("token-connect")) { showGitLabTokenDialog(id, host, epoch); return; }
                    final boolean opens=action.equals("import");
                    if(opens)stopProjectLoads();
                    final ReadTicket read=GitLabClient.cancellableRead(action)?beginRead(gitlabReads,id,action.equals("import")):null;
                    providerRequestGuard.execute(gitlabExecutor, () -> {
                        try (NativeChatScope.Scope chatLease=chatScoped?NativeChatScope.enter(chatGuard):null) {
                            JSONObject result;
                            if (action.equals("oauth-start")) {
                                result = gitlab.startOAuth(host, request.getString("clientId"), epoch);
                                final String uri = result.getString("authorizationUri");
                                runOnUiThread(() -> { if (gitlab.current(epoch) && !destroyed) openBrowser(Uri.parse(uri)); });
                                result = new JSONObject().put("pending", true);
                            } else result = read==null?gitlab.handle(request, epoch):gitlab.handleLoad(request,epoch,read.operation);
                            final JSONObject imported = result;
                            runOnUiThread(() -> {
                                gitlabReply(id, epoch, imported, null,read,host);
                            });
                        } catch (Exception error) {
                            runOnUiThread(() -> { if (gitlab.current(epoch) && (read==null||!read.operation.cancelled()) && gitlab.authExpired()) purgeProject(host); });
                            gitlabReply(id, epoch, null, gitlabError(error),read,host);
                        }
                    });
                } catch (Exception error) { gitlabReply(id, gitlab.generation(), null, error instanceof ManagedPolicy.Denied ? error.getMessage() : "Invalid GitLab connection request"); }
            });
        }
        public void downloadProject() {
            runOnUiThread(() -> { if (trustedPage()) launchDownload(); });
        }

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

        public void exportText(String name, String text, String mime) {
            runOnUiThread(() -> {
                final boolean presentation = "text/html".equals(mime) && "pocket-kivi-presentation.html".equals(name);
                if (!trustedPage() || text == null || text.length() > (presentation ? 16 : 4) * 1024 * 1024 || name == null || !name.matches("[A-Za-z0-9._-]{1,100}") || !(presentation || "text/csv".equals(mime) || "application/json".equals(mime))) return;
                if (pendingTextExport != null || pendingDownload != null) { sendError("Finish the current export first"); return; }
                pendingTextExport = text; pendingTextEpoch = downloadGeneration.get();
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE, name); intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION); startActivityForResult(intent, REQUEST_TEXT_EXPORT);
            });
        }

        public void libraryRequest(int id, String serialized) {
            runOnUiThread(() -> {
                if (!trustedPage() || id < 1 || serialized == null || serialized.length() > 16384) return;
                final JSONObject project = activeProject;
                final JSONObject request;
                try { request = new JSONObject(serialized); }
                catch (Exception error) { libraryReply(id, null, "Invalid library request"); return; }
                if(request.optString("action").equals("enable-temporary-reminders")){enableTemporaryReminders(id);return;}
                if(request.optString("action").equals("clear-temporary")&&activeProject!=null&&activeProject.optBoolean("temporary")) {
                    activeProject=null;activeProviderHost=null;activePrivate=false;pendingProject=null;pendingDownload=null;downloadGeneration.incrementAndGet();
                    webView.evaluateJavascript("document.getElementById('viewer').src='about:blank';window.KiCadAndroidProject=null;window.KiCadAndroidRevisionCache=null;window.KiCadAndroid.showHome();",null);
                }
                final boolean opening = request.optString("action").equals("open");
                if(opening)stopProjectLoads();
                final int openEpoch = opening ? importGeneration.incrementAndGet() : -1;
                final ReadTicket read=opening?beginRead(libraryReads,id,true):null;
                importExecutor.execute(() -> {
                    try {
                        JSONObject result;
                        if(read==null)result=projectLibrary.handle(request,project);
                        else try(NativeLoadOperation.Scope scope=read.operation.enter()){result=projectLibrary.handle(request,project);}
                        runOnUiThread(() -> {
                            if (!trustedPage()) return;
                            if (opening) {
                                if (openEpoch != importGeneration.get()) { libraryReply(id, null, "Project opening was superseded by another selection"); return; }
                                if(!deliverRead(libraryReads,id,read,result,null,null))return;
                            }
                            libraryReply(id, result, null);
                        });
                    } catch (Exception error) {
                        runOnUiThread(()->{if(deliverRead(libraryReads,id,read,null,"error",null))libraryReply(id, null, error instanceof IllegalArgumentException ? error.getMessage() : "Unable to update project library. Check available storage and retry.");});
                    }
                });
            });
        }

        public void openFiles() {
            runOnUiThread(() -> {
                if (trustedPage()) launchFiles();
            });
        }

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
        if(error instanceof ManagedPolicy.Denied)return error.getMessage();
        return error instanceof GitLabClient.Failure && error.getMessage() != null ? error.getMessage() : "Unable to complete GitLab request; check server and permissions";
    }
    private void gitlabReply(int id,int epoch,JSONObject result,String error){gitlabReply(id,epoch,result,error,null,null);}
    private void gitlabReply(int id,int epoch,JSONObject result,String error,ReadTicket read,String host) {
        runOnUiThread(() -> {
            if (!trustedPage() || !gitlab.current(epoch)) return;
            if(!deliverRead(gitlabReads,id,read,result,error,host))return;
            try {
                JSONObject reply=new JSONObject().put("ok",error==null);
                if(error==null)reply.put("result",result);else reply.put("error",error).put("authExpired",gitlab.authExpired());
                webView.evaluateJavascript("window.KiCadAndroidGitLab?.reply("+id+","+reply.toString().replace("\u2028","\\u2028").replace("\u2029","\\u2029")+");",null);
            } catch(Exception ignored) { }
        });
    }
    private void gitlabCallback(Uri uri) {
        if(!ManagedPolicy.read(this).network){sendError("Network access is disabled by managed application policy.");return;}
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
        if(error instanceof ManagedPolicy.Denied)return error.getMessage();
        // JSON/parser errors can include raw server values; do not expose them to the WebView.
        return error instanceof GitHubClient.Failure && error.getMessage() != null
                ? error.getMessage() : "Unable to complete GitHub request; check the repository and sign-in";
    }

    private void githubReply(int id,int epoch,int importEpoch,JSONObject result,String error){githubReply(id,epoch,importEpoch,result,error,null);}
    private void githubReply(int id, int epoch, int importEpoch, JSONObject result, String error,ReadTicket read) {
        runOnUiThread(() -> {
            if (!trustedPage() || !github.current(epoch)
                    || (importEpoch >= 0 && importEpoch != githubImportGeneration.get())) return;
            if(!deliverRead(githubReads,id,read,result,error,"https://github.com"))return;
            if (error != null && github.authExpired()) purgeProject("https://github.com");
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

    private void checkTemporaryExpiry() {
        if(destroyed||activeProject==null||!activeProject.optBoolean("temporary")||temporaryRefreshInFlight)return;
        final JSONObject original=activeProject;temporaryRefreshInFlight=true;
        importExecutor.execute(()->{
            JSONObject kept=null;try{kept=projectLibrary.keptTemporary(original.optString("id"));}catch(Exception ignored){}
            final JSONObject retained=kept;
            runOnUiThread(()->{
                temporaryRefreshInFlight=false;if(destroyed||activeProject!=original)return;
                if(retained!=null){recordProject(retained,null,false);pendingProject=retained.toString();deliverPendingProject();return;}
                if(!DiskProjectStore.expired(original,System.currentTimeMillis()))return;
                activeProject=null;activeProviderHost=null;activePrivate=false;pendingProject=null;pendingDownload=null;downloadGeneration.incrementAndGet();
                if(trustedPage())webView.evaluateJavascript("document.getElementById('viewer').src='about:blank';window.KiCadAndroidProject=null;window.KiCadAndroidRevisionCache=null;window.KiCadAndroid.showHome();window.KiCadAndroid.receiveError('Temporary project expired. Reopen the source or use a saved offline copy.');window.KiCadAndroidLibrary?.refresh();",null);
            });
        });
    }

    private void enableTemporaryReminders(int replyId) {
        try {
            TemporaryProjectSettings settings=new TemporaryProjectSettings(this);settings.enableReminders();
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){
                if(temporaryPermissionReply!=-1){if(replyId>0)libraryReply(replyId,null,"Finish the current notification permission request");return;}
                temporaryPermissionReply=replyId>0?replyId:-2;
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},REQUEST_TEMPORARY_NOTIFICATIONS);return;
            }
            completeTemporaryPermission(replyId);
            if(!settings.notificationsAllowed())new android.app.AlertDialog.Builder(this).setTitle("Notifications disabled")
                .setMessage("Temporary downloads still work. Enable Pocket KiView notifications in Android settings to receive the Keep reminder.")
                .setPositiveButton("Android settings",(dialog,which)->startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName())))
                .setNegativeButton("Later",null).show();
        }catch(Exception error){if(replyId>0)libraryReply(replyId,null,"Could not enable temporary reminders");}
    }
    private void completeTemporaryPermission(int replyId) {
        try {JSONObject settings=new TemporaryProjectSettings(this).result();if(replyId>0)libraryReply(replyId,settings,null);
            if(trustedPage())webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('kicad-temporary-settings-changed',{detail:"+settings.toString()+"}));",null);
            importExecutor.execute(()->{diskProjectStore.showDueReminders();diskProjectStore.scheduleCleanup();});
        }catch(Exception ignored){if(replyId>0)libraryReply(replyId,null,"Could not read temporary reminder settings");}
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==REQUEST_CAMERA){
            cameraRuntimeRequested=false;
            cameraRuntimeGranted=results.length==1 && results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED
                    && permissions.length==1 && android.Manifest.permission.CAMERA.equals(permissions[0]);
            if(!cameraRuntimeGranted)clearCameraRequest(true);
            else if(activityResumed)finishCameraRequest();
        }
        if(requestCode==REQUEST_TEMPORARY_NOTIFICATIONS){int reply=temporaryPermissionReply;temporaryPermissionReply=-1;completeTemporaryPermission(reply);}
    }

    private boolean eligibleCameraRequest(PermissionRequest request) {
        return !destroyed && request != null && CameraPermissionPolicy.eligible(request.getOrigin().toString(),
                request.getResources(), trustedPage(), activityResumed);
    }

    private void requestCamera(PermissionRequest request) {
        if (!eligibleCameraRequest(request) || pendingCameraRequest != null || cameraRuntimeRequested) {
            request.deny(); return;
        }
        pendingCameraRequest=request;
        if(checkSelfPermission(android.Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED){
            cameraRuntimeGranted=true;finishCameraRequest();
        }else{
            cameraRuntimeRequested=true;
            requestPermissions(new String[]{android.Manifest.permission.CAMERA},REQUEST_CAMERA);
        }
    }

    private void finishCameraRequest() {
        PermissionRequest request=pendingCameraRequest;
        boolean grant=cameraRuntimeGranted && eligibleCameraRequest(request)
                && checkSelfPermission(android.Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        clearCameraRequest(false);
        if(request!=null){if(grant)request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else request.deny();}
    }

    private void clearCameraRequest(boolean deny) {
        PermissionRequest request=pendingCameraRequest;pendingCameraRequest=null;cameraRuntimeGranted=false;
        if(deny && request!=null)request.deny();
    }
    private void offerTemporaryReminders(JSONObject project){
        TemporaryProjectSettings settings=new TemporaryProjectSettings(this);
        if(!project.optBoolean("temporary")||settings.notificationsAllowed()||!settings.offerOnce())return;
        new android.app.AlertDialog.Builder(this).setTitle("Temporary project reminder")
            .setMessage("Allow a private notification shortly before this temporary copy expires? You can keep it offline then. Downloads work even if you choose Later.")
            .setPositiveButton("Enable",(dialog,which)->enableTemporaryReminders(-1)).setNegativeButton("Later",null).show();
    }
    private void recordProject(JSONObject project, String providerHost, boolean isPrivate) {
        if (project == null) return;
        activeProject = project;
        activeProviderHost = providerHost;
        activePrivate = isPrivate;
        if(project.optBoolean("temporary")){loginHandler.postDelayed(this::checkTemporaryExpiry,Math.max(1,project.optLong("expiresAt")-System.currentTimeMillis()));offerTemporaryReminders(project);}
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
        if(candidate != null && candidate.optBoolean("diskBacked")) { sendError("This project is already downloaded in private app storage. Reopen or star it in Your projects. External ZIP export is unavailable for large downloaded copies."); return; }
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
        sendLoading("Saving project ZIPÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
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
            Uri[] selected = null;
            if (trustedPage()) try { selected = WebChromeClient.FileChooserParams.parseResult(resultCode, data); }
            catch (RuntimeException invalid) { /* A document handler may return a malformed result. */ }
            if (selected != null) {
                if (selected.length == 0 || selected.length > 128) selected = null;
                else for (Uri item : selected) if (!NativeBridgePolicy.pickerContent(item == null ? null : item.toString())) { selected = null; break; }
            }
            if (callback != null) callback.onReceiveValue(selected);
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == REQUEST_TEXT_EXPORT) { pendingTextExport = null; sendDownloadResult("Export cancelled"); }
            if (requestCode == REQUEST_DOWNLOAD) {
                pendingDownload = null;
                sendDownloadResult("Project download cancelled");
            }
            return;
        }
        Uri uri = data.getData();
        if (!NativeBridgePolicy.pickerContent(uri.toString())) {
            if (requestCode == REQUEST_TEXT_EXPORT) pendingTextExport = null;
            if (requestCode == REQUEST_DOWNLOAD) pendingDownload = null;
            // Do not attempt cleanup on a rejected destination: that would also
            // delegate the app's filesystem authority to the document handler.
            sendError("The document handler returned an unsupported location. Choose a document provider.");
            return;
        }
        if (requestCode == REQUEST_TEXT_EXPORT) {
            final String text = pendingTextExport; final int epoch = pendingTextEpoch; pendingTextExport = null;
            if (text == null || epoch != downloadGeneration.get()) { deleteIncompleteDownload(uri); sendError("Export cancelled because the project changed"); return; }
            importExecutor.execute(() -> {
                try (java.io.OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException("Cannot write selected destination");
                    output.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    runOnUiThread(() -> sendDownloadResult("Export saved"));
                } catch (Exception error) { deleteIncompleteDownload(uri); runOnUiThread(() -> sendError("Cannot save export")); }
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
        if(!ManagedPolicy.read(this).network)return;
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
        if(!ManagedPolicy.read(this).network){sendError("Network access is disabled by managed application policy.");return;}
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
        if(!ManagedPolicy.read(this).network){sendError("Network access is disabled by managed application policy.");return;}
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

    private void importSource(Uri uri, boolean folder) { importSource(uri,folder,null); }

    private void importSource(Uri uri, boolean folder, Boolean temporary) {
        if (!NativeBridgePolicy.pickerContent(uri == null ? null : uri.toString())) { sendError("Choose a document from a content provider."); return; }
        stopProjectLoads();
        final int generation = importGeneration.incrementAndGet();
        final ReadTicket read=new ReadTicket(true);localRead=read;
        sendLoading("Opening " + (folder ? "folder" : "file") + "...",generation);
        importExecutor.execute(() -> {
            try (NativeLoadOperation.Scope scope=read.operation.enter()) {
                JSONObject project = temporary == null ? ProjectImporter.read(
                        getContentResolver(), getCacheDir(), uri, folder,
                        () -> generation != importGeneration.get() || destroyed) : ProjectImporter.readDisk(
                        getContentResolver(), getCacheDir(), diskProjectStore, uri, folder,
                        () -> generation != importGeneration.get() || destroyed, temporary);
                if(project.optBoolean("diskBacked")) {
                    try { projectLibrary.handle(new JSONObject().put("action","save").put("offline",true).put("remember",true),project); }
                    catch(Exception registration) {try{diskProjectStore.remove(project);}catch(Exception cleanup){registration.addSuppressed(cleanup);}throw registration;}
                }
                String json = project.toString();
                runOnUiThread(() -> {
                    if (generation != importGeneration.get() || destroyed) return;
                    if(read.operation.cancelled()||localRead!=read)return;
                    read.project=project;
                    pendingProjectLoadId=generation;
                    pendingProject = json;
                    deliverPendingProject();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (generation != importGeneration.get() || destroyed || read.operation.cancelled()) return;
                    localRead=null;
                    String message = error.getMessage() == null ? "Unable to open project" : error.getMessage();
                    if(temporary == null && (message.contains("32 MiB") || message.contains("96 MiB") || message.equals("File or project size limit exceeded"))) {
                        sendLoading("Large project: choose how to open it.");
                        new android.app.AlertDialog.Builder(this).setTitle("Open large project?")
                            .setMessage("This project needs a disk copy. Keep it offline, or use a temporary copy that remains available in Downloads for "+new TemporaryProjectSettings(this).durationLabel()+", after which the app automatically removes it. Android may delay physical cleanup while inactive. Original files are unchanged. Copies are unencrypted in private app storage; large drawings still need available memory.")
                            .setPositiveButton("Download and keep",(dialog,which)->{if(generation==importGeneration.get())importSource(uri,folder,false);})
                            .setNeutralButton("Temporary ("+new TemporaryProjectSettings(this).durationLabel()+")",(dialog,which)->{if(generation==importGeneration.get())importSource(uri,folder,true);})
                            .setNegativeButton("Cancel",(dialog,which)->sendError("Opening cancelled."))
                            .setOnCancelListener(dialog->sendError("Opening cancelled.")).show();
                        return;
                    }
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
        int loadId=pendingProjectLoadId;pendingProjectLoadId=-1;
        webView.evaluateJavascript("window.KiCadAndroid.receiveProject(" + json + (loadId>=0?",{loadId:"+loadId+"}":"") + ");", null);
    }

    private void sendLoading(String message,int loadId) {
        if(trustedPage())webView.evaluateJavascript("window.KiCadAndroid?.setLoading("+JSONObject.quote(message)+",{canStop:true,loadId:"+loadId+"});",null);
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
        if(!cameraRuntimeRequested)clearCameraRequest(true);
        if(trustedPage())webView.evaluateJavascript("window.dispatchEvent(new Event('kicad-android-paused'));",null);
        activityResumed = false;
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyManagedPolicy();
        if(diskProjectStore!=null) importExecutor.execute(() -> { diskProjectStore.cleanupExpired(); diskProjectStore.showDueReminders(); diskProjectStore.scheduleCleanup(); runOnUiThread(this::checkTemporaryExpiry); });
        activityResumed = true;
        if(cameraRuntimeGranted)finishCameraRequest();
        if(github != null && !github.pendingDevice()) clearCopiedGitHubCode();
        if (webView != null) { webView.onResume(); if(trustedPage()) webView.evaluateJavascript("window.dispatchEvent(new Event('kicad-android-resumed'));",null); }
        checkGitHubLogin();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarAppearance();
        applyTextScale();
        if (webView != null) {webView.requestLayout();webView.requestApplyInsets();}
    }

    @Override
    protected void onDestroy() {
        if(restrictionsListening){unregisterReceiver(restrictionsReceiver);restrictionsListening=false;}
        cancelAllReads();
        clearCameraRequest(true);
        destroyed = true;
        if (foldTracker != null && foldListening) foldTracker.removeWindowLayoutInfoListener(foldListener);
        foldListening = false;
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
            webView.removeOnLayoutChangeListener(foldLayoutListener);
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
