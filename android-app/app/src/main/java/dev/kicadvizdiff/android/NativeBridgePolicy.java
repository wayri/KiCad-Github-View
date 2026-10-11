package dev.kicadvizdiff.android;

import java.net.URI;

/** No caller-supplied origin, URL prefix, or top document alone grants native access. */
final class NativeBridgePolicy {
    static boolean repositorySource(String address, String activeHost) {
        if (address == null || activeHost == null || address.length() > 4096) return false;
        try {
            URI uri = new URI(address);
            return "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null
                && uri.getRawQuery() == null && uri.getRawFragment() == null
                && activeHost.equals("https://" + uri.getRawAuthority());
        } catch (Exception error) { return false; }
    }
    static boolean trustedOrigin(String address, boolean mainFrame) {
        if (!mainFrame || address == null) return false;
        try {
            URI uri = new URI(address);
            return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getQuery() == null && uri.getFragment() == null
                && (uri.getPath().isEmpty() || uri.getPath().equals("/"));
        } catch (Exception error) { return false; }
    }
    static boolean viewerResource(String address) {
        try {
            URI uri = new URI(address);
            if (!trustedOrigin(new URI(uri.getScheme(), uri.getUserInfo(), uri.getHost(), uri.getPort(), null, null, null).toString(), true)) return false;
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/viewer/") || path.indexOf('\\') >= 0 || path.indexOf('%') >= 0) return false;
            for (String part : path.split("/", -1)) if (part.equals(".") || part.equals("..")) return false;
            return true;
        } catch (Exception error) { return false; }
    }
    static boolean importedResource(String address) {
        if (!viewerResource(address)) return false;
        try { String path = new URI(address).getPath(); return path.startsWith("/assets/viewer/downloaded/") || path.startsWith("/assets/viewer/temporary-downloads/"); }
        catch (Exception error) { return false; }
    }
}
