package dev.kicadvizdiff.android;

import java.util.ArrayDeque;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/** Admission happens on the bridge thread, before large requests reach the UI queue. */
final class NativeRequestGuard {
    private final ArrayDeque<Long> admitted = new ArrayDeque<>();
    private final ThreadLocal<boolean[]> queued = new ThreadLocal<>();
    private int outstanding;
    synchronized boolean admit(long now) {
        while (!admitted.isEmpty() && now - admitted.peekFirst() >= 10000) admitted.removeFirst();
        if (!admitted.isEmpty() && now < admitted.peekLast()) return false;
        if (admitted.size() >= 24 || outstanding >= 8) return false;
        admitted.addLast(now);
        outstanding++;
        return true;
    }
    synchronized void release() { if (outstanding > 0) outstanding--; }
    void dispatch(Consumer<Runnable> ui, Runnable callback) {
        ui.accept(() -> {
            boolean[] submitted = {false}; queued.set(submitted);
            try { callback.run(); }
            finally { queued.remove(); if (!submitted[0]) release(); }
        });
    }
    void execute(Executor executor, Runnable callback) {
        boolean[] submitted = queued.get();
        if (submitted == null) throw new IllegalStateException("Request must be admitted before dispatch");
        executor.execute(() -> { try { callback.run(); } finally { release(); } });
        submitted[0] = true;
    }
}
