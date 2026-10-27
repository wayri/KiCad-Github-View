"""Bound admitted sockets before ThreadingHTTPServer creates a request thread."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import threading
import io
import time


class DeadlineSocket:
    """Set remaining monotonic budget on *every* receive and response write."""
    def __init__(self, request, seconds=30):
        self.socket = request
        self.deadline = time.monotonic() + seconds
        self.idle = request.gettimeout() or 10

    def __getattr__(self, name):
        return getattr(self.socket, name)

    def remaining(self):
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError('HTTP request deadline exceeded.')
        self.socket.settimeout(min(self.idle, left))

    def sendall(self, data):
        self.remaining()
        return self.socket.sendall(data)

    def makefile(self, mode, buffering=-1):
        if mode != 'rb':
            raise ValueError('Only the HTTP read stream is supported.')
        owner = self
        class Reader(io.RawIOBase):
            def readable(self):
                return True
            def readinto(self, buffer):
                owner.remaining()
                return owner.socket.recv_into(buffer)
        raw = Reader()
        return raw if buffering == 0 else io.BufferedReader(raw, io.DEFAULT_BUFFER_SIZE if buffering < 0 else buffering)


class DeadlineRequestHandler(BaseHTTPRequestHandler):
    request_deadline = 30

    def setup(self):
        self.request = DeadlineSocket(self.request, self.request_deadline)
        super().setup()


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_timeout = 10
    max_connections = 32

    def __init__(self, *args, **kwargs):
        self.request_slots = threading.BoundedSemaphore(self.max_connections)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            request.settimeout(self.request_timeout)
            super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()
