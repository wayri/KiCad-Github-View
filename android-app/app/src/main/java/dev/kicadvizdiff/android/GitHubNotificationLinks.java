package dev.kicadvizdiff.android;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Converts only supported notification subjects into browser links, never trusting remote HTML URLs. */
final class GitHubNotificationLinks {
    static String subject(String repository, String type, String apiUrl) {
        if (repository == null || !repository.matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")
                || repository.endsWith("/.") || repository.endsWith("/..") || apiUrl == null) return "";
        String resource, browser;
        if ("Issue".equals(type)) { resource = "issues"; browser = "issues"; }
        else if ("PullRequest".equals(type)) { resource = "pulls"; browser = "pull"; }
        else if ("Discussion".equals(type)) { resource = "discussions"; browser = "discussions"; }
        else return "";
        Matcher match = Pattern.compile("https://api\\.github\\.com/repos/" + Pattern.quote(repository)
                + "/" + resource + "/([1-9][0-9]{0,15})", Pattern.CASE_INSENSITIVE).matcher(apiUrl);
        return match.matches() ? "https://github.com/" + repository + "/" + browser + "/" + match.group(1) : "";
    }
}
