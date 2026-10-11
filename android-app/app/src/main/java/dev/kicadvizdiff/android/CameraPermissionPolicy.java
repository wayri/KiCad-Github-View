package dev.kicadvizdiff.android;

/** WebView supplies an origin, not the requesting iframe path. Consent is origin-scoped. */
final class CameraPermissionPolicy {
    static final String VIDEO_CAPTURE = "android.webkit.resource.VIDEO_CAPTURE";

    static boolean eligible(String origin, String[] resources, boolean trustedShell, boolean foreground) {
        return trustedShell && foreground && NativeBridgePolicy.trustedOrigin(origin, true)
                && resources != null && resources.length == 1 && VIDEO_CAPTURE.equals(resources[0]);
    }
}
