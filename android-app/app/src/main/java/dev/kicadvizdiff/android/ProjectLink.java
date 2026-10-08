package dev.kicadvizdiff.android;

import android.content.Intent;
import android.net.Uri;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Bounded, non-network intake; semantic validation happens in the trusted UI. */
final class ProjectLink {
    private static final Pattern URL = Pattern.compile("(?:https://|kicadvizdiff://)[^\\s<>\\\"]+");
    static String fromIntent(Intent intent) {
        if (intent == null) return null;
        String link;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence shared;
            try { shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT); }
            catch (RuntimeException error) { throw new IllegalArgumentException("Invalid shared project link."); }
            if (shared == null || shared.length() > 8192) throw new IllegalArgumentException("Share one project link.");
            Matcher matcher = URL.matcher(shared); if (!matcher.find()) throw new IllegalArgumentException("Share an HTTPS repository link.");
            link = matcher.group(); if (matcher.find()) throw new IllegalArgumentException("Share one project link at a time.");
        } else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri uri = intent.getData();
            if (!"https".equals(uri.getScheme()) && !("kicadvizdiff".equals(uri.getScheme()) && "open".equals(uri.getHost()))) return null;
            link = uri.toString();
        } else return null;
        if (link.length() > 8192 || link.chars().anyMatch(c -> c < 32 || c == 127)) throw new IllegalArgumentException("Invalid project link.");
        return link;
    }
}
