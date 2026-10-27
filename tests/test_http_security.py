"""Local adversarial probes; no provider calls or native CAD execution."""
import hashlib
import hmac
import http.client
import json
import os
import threading
import types
import socket
import time
import unittest
from unittest.mock import Mock, patch

from kicad_vizdiff.server import Server, Handler, main
from kicad_vizdiff.http_limits import BoundedHTTPServer, DeadlineSocket


class LegacyHTTPBoundaryTests(unittest.TestCase):
    def test_native_service_requires_explicit_opt_in_and_never_binds_publicly(self):
        for args in [[], ['--allow-unsandboxed-native', '--host', '0.0.0.0']]:
            with patch('sys.argv', ['legacy-service', *args]), patch('kicad_vizdiff.server.find_kicad') as native:
                with self.assertRaises(SystemExit) as error:
                    main()
                self.assertEqual(error.exception.code, 2)
                native.assert_not_called()

    def setUp(self):
        self.server = Server(('127.0.0.1', 0), Handler)
        self.server.api_key = 'a-strong-test-capability-' * 2
        self.server.jobs = types.SimpleNamespace(
            version='synthetic', items={}, lock=threading.Lock(),
            seen_deliveries={}, submit=Mock(return_value='job'))
        self.server.webhooks = Mock()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, path='/api/jobs', headers=None, body=b'{}', extra_headers=()):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        try:
            conn.putrequest('POST', path)
            headers = {'Content-Length': str(len(body)), 'Content-Type': 'application/json', **(headers or {})}
            for key, value in [*headers.items(), *extra_headers]:
                conn.putheader(key, value)
            conn.endheaders(body)
            response = conn.getresponse()
            return response.status, response.read()
        finally:
            conn.close()

    def test_loopback_jobs_fail_closed_without_key_or_with_browser_origin(self):
        self.assertEqual(self.request()[0], 401)
        good = {'Authorization': 'Bearer ' + self.server.api_key}
        self.assertEqual(self.request(headers=good)[0], 202)
        self.assertEqual(self.request(headers={**good, 'Origin': 'https://attacker.invalid'})[0], 401)
        self.assertEqual(self.request(headers=good, extra_headers=[('Authorization', good['Authorization'])])[0], 401)
        self.server.api_key = ''
        self.assertEqual(self.request()[0], 401)
        self.assertEqual(self.server.jobs.submit.call_count, 1)

    def test_ambiguous_http_framing_is_rejected_before_admission(self):
        for extras in [[('Content-Length', '2')], [('Transfer-Encoding', 'chunked')]]:
            self.assertEqual(self.request(extra_headers=extras)[0], 400)
        self.server.jobs.submit.assert_not_called()

    def webhook(self, delivery='delivery-1'):
        body = json.dumps({'action': 'opened', 'repository': {'private': False}}).encode()
        signature = 'sha256=' + hmac.new(b'test-secret', body, hashlib.sha256).hexdigest()
        return self.request('/api/github/webhook', {
            'X-Hub-Signature-256': signature, 'X-GitHub-Event': 'pull_request',
            'X-GitHub-Delivery': delivery}, body)

    @patch.dict(os.environ, {'GITHUB_WEBHOOK_SECRET': 'test-secret'})
    def test_changed_unsigned_delivery_id_cannot_replay_signed_body(self):
        self.assertEqual(self.webhook()[0], 202)
        status, body = self.webhook('different-unsigned-id')
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body)['status'], 'duplicate')
        self.assertEqual(self.server.webhooks.submit.call_count, 1)

    @patch.dict(os.environ, {'GITHUB_WEBHOOK_SECRET': 'test-secret'})
    def test_webhook_queue_full_is_retriable_without_consuming_fingerprint(self):
        self.server.webhook_slots = threading.BoundedSemaphore(0)
        self.assertEqual(self.webhook()[0], 503)
        self.assertEqual(self.server.jobs.seen_deliveries, {})
        self.server.webhooks.submit.assert_not_called()


class ConnectionAdmissionTests(unittest.TestCase):
    def test_absolute_deadline_cuts_off_drip_fed_socket(self):
        first, second = socket.socketpair()
        try:
            first.settimeout(1)
            wrapped = DeadlineSocket(first, seconds=0.08)
            with wrapped.makefile('rb') as stream:
                second.sendall(b'x')
                self.assertEqual(stream.read(1), b'x')
                # The peer may keep sending, but that does not extend lifetime.
                time.sleep(0.12)
                with self.assertRaises(TimeoutError):
                    stream.read(1)
        finally:
            first.close()
            second.close()

    def test_thread_budget_is_enforced_before_dispatch_and_sets_deadline(self):
        server = BoundedHTTPServer(('127.0.0.1', 0), Handler)
        self.addCleanup(server.server_close)
        server.request_slots = threading.BoundedSemaphore(1)
        first, second = Mock(), Mock()
        with patch('http.server.ThreadingHTTPServer.process_request') as dispatch, patch.object(server, 'shutdown_request') as rejected:
            server.process_request(first, ('127.0.0.1', 1))
            server.process_request(second, ('127.0.0.1', 2))
            first.settimeout.assert_called_once_with(10)
            self.assertEqual(dispatch.call_count, 1)
            rejected.assert_called_once_with(second)
        with patch('http.server.ThreadingHTTPServer.process_request_thread'):
            server.process_request_thread(first, ('127.0.0.1', 1))
        self.assertTrue(server.request_slots.acquire(blocking=False))
