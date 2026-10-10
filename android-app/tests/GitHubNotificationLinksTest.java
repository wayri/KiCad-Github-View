package dev.kicadvizdiff.android;

/** Small local-JVM security checks for the production notification link converter. */
public final class GitHubNotificationLinksTest {
    private static int checks;
    private static void expect(String expected, String repo, String type, String url) {
        if (!expected.equals(GitHubNotificationLinks.subject(repo, type, url))) throw new AssertionError(url);
        checks++;
    }
    public static void main(String[] args) {
        expect("https://github.com/owner/board/issues/12", "owner/board", "Issue", "https://api.github.com/repos/owner/board/issues/12");
        expect("https://github.com/owner/board/pull/23", "owner/board", "PullRequest", "https://api.github.com/repos/owner/board/pulls/23");
        expect("https://github.com/owner/board/discussions/34", "owner/board", "Discussion", "https://api.github.com/repos/owner/board/discussions/34");
        expect("", "owner/board", "Issue", "https://api.github.com/repos/other/board/issues/12");
        expect("", "owner/board", "Issue", "https://api.github.com.evil.test/repos/owner/board/issues/12");
        expect("", "owner/board", "Issue", "https://api.github.com@evil.test/repos/owner/board/issues/12");
        expect("", "owner/board", "Issue", "http://api.github.com/repos/owner/board/issues/12");
        expect("", "owner/board", "Issue", "https://api.github.com/repos/owner/board/issues/12?url=evil");
        expect("", "owner/board", "Issue", "https://api.github.com/repos/owner/board/issues/12#evil");
        expect("", "owner/board", "Issue", "https://api.github.com/repos/owner/board/pulls/12");
        expect("", "owner/board", "Issue", "https://api.github.com/repos/owner/board/issues/0");
        expect("", "owner/board", "Release", "https://api.github.com/repos/owner/board/releases/12");
        expect("", "owner/..", "Issue", "https://api.github.com/repos/owner/../issues/12");
        expect("", "owner/board", "Issue", null);
        System.out.println("GitHub notification links: " + checks + " checks passed");
    }
}
