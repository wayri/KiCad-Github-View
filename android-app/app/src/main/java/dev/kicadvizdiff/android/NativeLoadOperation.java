package dev.kicadvizdiff.android;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Exact read scope; never invalidates credentials or unrelated publication requests. */
final class NativeLoadOperation {
    private static final InheritableThreadLocal<NativeLoadOperation> CURRENT = new InheritableThreadLocal<>();
    private static final ExecutorService CLOSER = Executors.newFixedThreadPool(3, task -> {
        Thread thread = new Thread(task, "project-read-stop"); thread.setDaemon(true); return thread;
    });
    // A disconnect waiting on a read lock must not starve the close that releases it.
    private static final ExecutorService STREAM_CLOSER = Executors.newFixedThreadPool(3, task -> {
        Thread thread = new Thread(task, "project-input-stop"); thread.setDaemon(true); return thread;
    });
    private final Set<HttpURLConnection> connections = new HashSet<>();
    private final Set<InputStream> streams = new HashSet<>();
    private volatile boolean cancelled;
    private boolean accepted;
    private Thread owner;
    synchronized boolean cancelled() { return cancelled; }
    synchronized boolean accept() { if (cancelled || accepted) return false; accepted = true; return true; }
    void cancel() {
        final Thread thread;
        final HttpURLConnection[] sockets;
        final InputStream[] inputs;
        synchronized (this) {
            if (accepted || cancelled) return;
            cancelled = true; thread = owner;
            if (thread != null) thread.interrupt();
            sockets = connections.toArray(new HttpURLConnection[0]);
            inputs = streams.toArray(new InputStream[0]);
        }
        // Provider close/disconnect may block: never execute it on the Android UI thread.
        for (HttpURLConnection socket : sockets) CLOSER.execute(socket::disconnect);
        for (InputStream input : inputs) STREAM_CLOSER.execute(() -> { try { input.close(); } catch (IOException ignored) {} });
    }
    Scope enter() throws IOException {
        check(); NativeLoadOperation previous = CURRENT.get();
        synchronized (this) { check(); owner = Thread.currentThread(); }
        CURRENT.set(this); return new Scope(previous);
    }
    final class Scope implements AutoCloseable {
        private final NativeLoadOperation previous;
        Scope(NativeLoadOperation previous) { this.previous = previous; }
        public void close() {
            synchronized (NativeLoadOperation.this) { owner = null; }
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
            // Do not leak this cancellation interrupt into the executor's next (possibly write) task.
            if (cancelled) Thread.interrupted();
        }
    }
    private void check() throws IOException {
        if (cancelled || Thread.currentThread().isInterrupted()) throw new IOException("Project loading stopped");
    }
    /** Finish an already needed refresh-token rotation even if its parent read is stopped. */
    static AuthenticationScope preserveAuthentication() throws IOException {
        NativeLoadOperation operation=CURRENT.get();
        if(operation!=null)synchronized(operation){operation.check();operation.owner=null;CURRENT.remove();}
        return new AuthenticationScope(operation);
    }
    static final class AuthenticationScope implements AutoCloseable {
        private final NativeLoadOperation operation;
        AuthenticationScope(NativeLoadOperation operation){this.operation=operation;}
        public void close(){if(operation!=null)synchronized(operation){operation.owner=Thread.currentThread();CURRENT.set(operation);}}
    }
    static void checkCurrent() throws IOException { NativeLoadOperation operation = CURRENT.get(); if (operation != null) operation.check(); }
    static void track(HttpURLConnection connection) throws IOException {
        NativeLoadOperation operation = CURRENT.get(); if (operation == null) return;
        synchronized (operation) { operation.check(); operation.connections.add(connection); }
    }
    static void untrack(HttpURLConnection connection) {
        NativeLoadOperation operation = CURRENT.get(); if (operation != null) synchronized (operation) { operation.connections.remove(connection); }
    }
    static InputStream input(InputStream source) throws IOException {
        NativeLoadOperation operation = CURRENT.get(); if (operation == null || source == null) return source;
        synchronized (operation) {
            try { operation.check(); } catch (IOException error) { source.close(); throw error; }
            operation.streams.add(source);
        }
        return new FilterInputStream(source) {
            public int read() throws IOException { operation.check(); int result = super.read(); operation.check(); return result; }
            public int read(byte[] bytes, int offset, int length) throws IOException { operation.check(); int result = in.read(bytes, offset, length); operation.check(); return result; }
            public void close() throws IOException { try { super.close(); } finally { synchronized (operation) { operation.streams.remove(source); } } }
        };
    }
}
