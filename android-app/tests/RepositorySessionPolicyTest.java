package dev.kicadvizdiff.android;

/** Pure policy checks. No network access or real GitHub account is used. */
public final class RepositorySessionPolicyTest {
    private static int checks;
    private static void check(boolean value, String reason) { checks++; if (!value) throw new AssertionError(reason); }
    public static void main(String[] args) {
        String repo = "fixture-owner/fixture-repo";
        check(RepositorySessionPolicy.home(repo).equals("https://github.com/" + repo), "canonical home");
        for (String path : new String[]{"", "/", "/issues/12", "/tree/main", "/blob/main/file%20name.kicad_pcb", "/issues?state=open", "#readme"}) {
            String url = "https://github.com/" + repo + path;
            check(RepositorySessionPolicy.repositoryUrl(url, repo), "repository page: " + path);
            check(RepositorySessionPolicy.navigation(url, repo), "repository navigation: " + path);
        }
        for (String url : new String[]{
                "http://github.com/" + repo, "https://github.com.evil.test/" + repo,
                "https://github.com@evil.test/" + repo, "https://evil.test@github.com/" + repo,
                "https://github.com:8443/" + repo, "file:///" + repo, "content://" + repo,
                "javascript:alert(1)", "https://appassets.androidplatform.net/" + repo,
                "https://github.com/fixture-owner/fixture-repository", "https://github.com/another/repo",
                "https://github.com/" + repo + "/../another", "https://github.com/" + repo + "/%2e%2e/another",
                "https://github.com/" + repo + "%2fextra", "https://github.com/" + repo + "/%5csettings",
                "https://github.com/" + repo + "/%00bad", null}) {
            check(!RepositorySessionPolicy.repositoryUrl(url, repo), "unsafe repository URL: " + url);
            check(!RepositorySessionPolicy.navigation(url, repo), "unsafe navigation: " + url);
        }
        for (String path : new String[]{"/login", "/login?return_to=%2Ffixture-owner%2Ffixture-repo", "/session", "/sessions", "/sessions/two-factor", "/users/two-factor", "/users/two-factor/recovery", "/sudo", "/logout"}) {
            String url = "https://github.com" + path;
            check(RepositorySessionPolicy.navigation(url, repo), "auth navigation: " + path);
            check(!RepositorySessionPolicy.repositoryUrl(url, repo), "auth page cannot run repository scripts: " + path);
        }
        for (String path : new String[]{"/settings", "/orgs/example/sso", "/login/oauth/authorize", "/search", "/", "/login.evil"}) check(!RepositorySessionPolicy.navigation("https://github.com" + path, repo), "external-only page: " + path);
        for (String path : new String[]{"/orgs/fixture-owner/sso", "/orgs/fixture-owner/sso/", "/orgs/fixture-owner/sso?return_to=%2Ffixture-owner%2Ffixture-repo", "/orgs/fixture-owner/saml/consume"}) {
            check(RepositorySessionPolicy.navigation("https://github.com" + path, repo), "bound organization SSO: " + path);
            check(RepositorySessionPolicy.authenticationUrl("https://github.com" + path, repo), "bound organization authentication: " + path);
            check(!RepositorySessionPolicy.repositoryUrl("https://github.com" + path, repo), "SSO cannot run repository scripts: " + path);
        }
        for (String path : new String[]{"/orgs/another-owner/sso", "/orgs/another-owner/saml/consume", "/orgs/fixture-owner/sso/other", "/orgs/fixture-owner/settings", "/orgs/fixture-owner/saml/consume/other", "/orgs/fixture-owner/../another-owner/sso", "/login/oauth/authorize"}) check(!RepositorySessionPolicy.authenticationUrl("https://github.com" + path, repo), "foreign or unrelated authentication path: " + path);
        check("https://login.example.test".equals(RepositorySessionPolicy.httpsOrigin("https://LOGIN.example.test:443/sso?secret=hidden")), "approval identifies origin only");
        check("https://login.example.test:8443".equals(RepositorySessionPolicy.httpsOrigin("https://login.example.test:8443/sso")), "approval binds HTTPS port");
        check(!RepositorySessionPolicy.navigation("https://login.example.test/sso", repo), "page URL alone grants no IdP approval");
        check(!RepositorySessionPolicy.repositoryUrl("https://login.example.test/sso", repo), "approved IdP can never run repository scripts");
        for (String value : new String[]{"../repo", "owner/..", "owner/.", "owner/repo.git", "owner/repo/extra", "owner/repo?query", "owner/repo#hash", "owner%2frepo", "https://github.com/owner/repo", "login/repo", "owner/", "/repo", "owner\\repo", null}) {
            boolean rejected = false;
            try { RepositorySessionPolicy.repository(value); } catch (IllegalArgumentException expected) { rejected = true; }
            check(rejected, "invalid binding: " + value);
        }
        check(RepositorySessionPolicy.external("https://login.example.test/sso"), "HTTPS SSO can be offered explicitly");
        for (String url : new String[]{"javascript:alert(1)", "intent://example", "http://login.example.test", "https://appassets.androidplatform.net/viewer/index.html", "https://user@other.example.test/", null}) check(!RepositorySessionPolicy.external(url), "blocked external URL: " + url);
        check(RepositorySessionPolicy.interactiveAllowed(true, true), "ordinary interactive website session");
        check(!RepositorySessionPolicy.interactiveAllowed(true, false), "read-only policy disables interactive website mode");
        check(!RepositorySessionPolicy.interactiveAllowed(false, true), "network policy disables interactive website mode");
        check(!RepositorySessionPolicy.interactiveAllowed(false, false), "both restrictions disable interactive website mode");
        System.out.println("Repository session policy: " + checks + " checks passed");
    }
}
