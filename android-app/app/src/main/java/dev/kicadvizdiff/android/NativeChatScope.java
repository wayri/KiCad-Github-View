package dev.kicadvizdiff.android;

import java.io.IOException;

/** A queued native chat write keeps its original project lease until completion. */
final class NativeChatScope {
    interface Guard { void check() throws IOException; }
    private static final ThreadLocal<Guard> CURRENT = new ThreadLocal<>();
    static Scope enter(Guard guard) throws IOException { guard.check(); return new Scope(guard); }
    static void checkCurrent() throws IOException { Guard guard = CURRENT.get(); if (guard != null) guard.check(); }
    static boolean active() { return CURRENT.get() != null; }
    static final class Scope implements AutoCloseable {
        private final Guard previous;
        Scope(Guard guard) { previous = CURRENT.get(); CURRENT.set(guard); }
        public void close() { if (previous == null) CURRENT.remove(); else CURRENT.set(previous); }
    }
}
