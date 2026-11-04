package dev.kicadvizdiff.android;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/** The website browser is bound to one GitHub repository, never an arbitrary URL. */
final class RepositorySessionPolicy {
    private static final Set<String> RESERVED = Set.of("login", "logout", "session", "sessions", "settings", "users", "orgs", "organizations", "search", "marketplace", "features", "sponsors", "explore", "topics", "collections", "notifications", "new", "security");

    static String repository(String value) {
        if (value == null || !value.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")) throw new IllegalArgumentException("Use a GitHub owner/repository.");
        String[] parts = value.split("/", -1);
        if (RESERVED.contains(parts[0].toLowerCase(Locale.ROOT)) || parts[1].equals(".") || parts[1].equals("..") || parts[1].endsWith(".git")) throw new IllegalArgumentException("Invalid GitHub repository.");
        return value;
    }

    static URI github(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"github.com".equalsIgnoreCase(uri.getHost()) || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            String raw = uri.getRawPath();
            if (raw == null || !raw.startsWith("/") || raw.contains("\\") || raw.toLowerCase(Locale.ROOT).matches(".*%(?:2f|5c|00|0a|0d).*")) return null;
            // Decode dot segments before checking; URI.normalize does not decode them.
            for (String segment : uri.getPath().split("/", -1)) if (segment.equals(".") || segment.equals("..")) return null;
            return uri;
        } catch (Exception invalid) { return null; }
    }

    static boolean repositoryUrl(String value, String repository) {
        URI uri = github(value);
        if (uri == null) return false;
        String path = uri.getRawPath();
        String prefix = "/" + repository(repository);
        return path.equalsIgnoreCase(prefix) || path.regionMatches(true, 0, prefix + "/", 0, prefix.length() + 1);
    }

    static boolean navigation(String value, String repository) {
        if (repositoryUrl(value, repository)) return true;
        return authenticationUrl(value, repository);
    }

    static boolean authenticationUrl(String value, String repository) {
        URI uri = github(value);
        if (uri == null) return false;
        String path = uri.getRawPath();
        String owner = repository(repository).split("/", -1)[0];
        boolean organization = path.equalsIgnoreCase("/orgs/" + owner + "/sso") || path.equalsIgnoreCase("/orgs/" + owner + "/sso/") || path.equalsIgnoreCase("/orgs/" + owner + "/saml/consume");
        return organization || path.equals("/login") || path.equals("/session") || path.equals("/sessions") || path.startsWith("/sessions/") || path.equals("/logout") || path.equals("/sudo") || path.startsWith("/users/two-factor/") || path.equals("/users/two-factor");
    }

    static boolean external(String value) {
        return httpsOrigin(value) != null;
    }

    static String httpsOrigin(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getPort() > 65535 || "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())) return null;
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT) + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (Exception invalid) { return null; }
    }

    static String home(String repository) { return "https://github.com/" + repository(repository); }

    static boolean interactiveAllowed(boolean network, boolean providerWrites) { return network && providerWrites; }
}
