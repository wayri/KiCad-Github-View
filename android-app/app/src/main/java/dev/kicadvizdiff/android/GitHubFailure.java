package dev.kicadvizdiff.android;

/** Only fixed, actionable diagnostics leave the native transport; never raw bodies or SSO URLs. */
final class GitHubFailure {
    static String forbidden(int status, boolean authenticated, String remaining, String reset, String retry, String sso, String message, long nowSeconds) {
        String context = authenticated ? " The request used your signed-in account." : " The request was anonymous; sign in to use your account quota.";
        if (sso != null && sso.startsWith("required")) return "GitHub requires organization SSO authorization. Authorize this app/token for the organization, then retry.";
        boolean secondary = message != null && message.toLowerCase(java.util.Locale.ROOT).contains("secondary rate limit");
        if ("0".equals(remaining)) {
            long seconds = number(reset) - nowSeconds;
            return "GitHub API quota exhausted." + waitMessage(seconds) + context;
        }
        if (status == 429 || number(retry) > 0 || secondary) return "GitHub temporarily throttled requests." + waitMessage(Math.max(60, number(retry))) + " Avoid repeated retries." + context;
        return "GitHub refused repository access (HTTP 403). Check repository access, token permissions, and organization approval." + context;
    }
    static long number(String value) { try { return value == null ? -1 : Long.parseLong(value); } catch (NumberFormatException error) { return -1; } }
    private static String waitMessage(long seconds) {
        if (seconds <= 0 || seconds > 86400) return " Wait for the quota to reset before retrying.";
        return " Retry in about " + Math.max(1, (seconds + 59) / 60) + " minute(s).";
    }
    static String importBudget(int files, long remaining, boolean authenticated) {
        if (remaining < 0 || files <= remaining) return null;
        return "This project needs " + files + " file requests, but GitHub reports only " + remaining + " API requests remaining. "
                + (authenticated ? "Wait for your account quota to reset, or open a downloaded project ZIP." : "Sign in with GitHub before opening it, or open a downloaded project ZIP.");
    }
}
