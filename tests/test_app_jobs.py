"""Durable acknowledgement, restart recovery, retry and deduplication evidence."""
import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from kicad_vizdiff.app_jobs import DeliveryQueue
from kicad_vizdiff.git import VizError


def wait_for(predicate):
    deadline = time.monotonic()+3
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(.01)
    return False


class DeliveryQueueTests(unittest.TestCase):
    def test_database_failure_stops_acknowledgements_and_retains_running_job(self):
        entered = threading.Event()
        release = threading.Event()
        def process(payload):
            entered.set()
            release.wait(2)
        queue = DeliveryQueue(':memory:', process)
        try:
            with patch.object(queue, 'finish', side_effect=sqlite3.OperationalError('secret details')):
                queue.enqueue('one', {})
                self.assertTrue(entered.wait(2))
                release.set()
                self.assertTrue(wait_for(lambda: not queue.healthy))
            self.assertEqual(queue.state('one')['status'], 'running')
            with self.assertRaises(VizError):
                queue.enqueue('two', {})
            self.assertIsNone(queue.state('two'))
        finally:
            release.set()
            queue.shutdown()

    def test_enqueue_storage_failure_is_not_acknowledged(self):
        queue = DeliveryQueue(':memory:', lambda payload: None)
        try:
            with patch.object(queue, '_enqueue', side_effect=sqlite3.OperationalError('disk unavailable')):
                with self.assertRaises(VizError):
                    queue.enqueue('one', {})
            self.assertFalse(queue.healthy)
            self.assertIsNone(queue.state('one'))
        finally:
            queue.shutdown()

    def test_acknowledged_payload_and_completed_dedup_survive_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'events.sqlite3'
            release = threading.Event()
            queue = DeliveryQueue(path, lambda payload: release.wait(2))
            try:
                self.assertEqual(queue.enqueue('one', {'number': 4}), 'accepted')
                with closing(sqlite3.connect(path)) as database:
                    row = database.execute('SELECT payload FROM deliveries WHERE id=?', ('one',)).fetchone()
                    self.assertEqual(json.loads(row[0]), {'number': 4})
                self.assertEqual(queue.enqueue('one', {}), 'duplicate')
                release.set()
                self.assertTrue(wait_for(lambda: queue.state('one')['status'] == 'complete'))
            finally:
                release.set()
                queue.shutdown()
            calls = []
            restarted = DeliveryQueue(path, calls.append)
            try:
                self.assertEqual(restarted.enqueue('one', {}), 'duplicate')
                self.assertEqual(calls, [])
            finally:
                restarted.shutdown()

    def test_restart_recovers_interrupted_delivery(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'events.sqlite3'
            initial = DeliveryQueue(path, lambda payload: None)
            initial.shutdown()
            with closing(sqlite3.connect(path)) as database:
                database.execute("INSERT INTO deliveries(id,payload,status,attempts,next_attempt,updated) VALUES('interrupted',?,'running',1,0,0)", (json.dumps({'repo': 'wayri/design'}),))
                database.commit()
            calls = []
            restarted = DeliveryQueue(path, calls.append)
            try:
                self.assertTrue(wait_for(lambda: restarted.state('interrupted')['status'] == 'complete'))
                self.assertEqual(calls, [{'repo': 'wayri/design'}])
                self.assertEqual(restarted.state('interrupted')['attempts'], 2)
            finally:
                restarted.shutdown()

    def test_bounded_automatic_retries_and_explicit_redelivery(self):
        calls = []
        def fail(payload):
            calls.append(payload)
            raise VizError('never persist exception details or secrets')
        queue = DeliveryQueue(':memory:', fail, retry_delays=(0, 0))
        try:
            queue.enqueue('failed', {'try': 1})
            self.assertTrue(wait_for(lambda: queue.state('failed')['status'] == 'failed'))
            self.assertEqual(len(calls), 3)
            self.assertEqual(queue.state('failed')['error'], 'VizError')
            queue.process = lambda payload: calls.append(payload)
            self.assertEqual(queue.enqueue('failed', {'try': 2}), 'accepted')
            self.assertTrue(wait_for(lambda: queue.state('failed')['status'] == 'complete'))
            self.assertEqual(calls[-1], {'try': 2})
        finally:
            queue.shutdown()

    def test_capacity_includes_work_in_progress(self):
        release = threading.Event()
        queue = DeliveryQueue(':memory:', lambda payload: release.wait(2), capacity=1)
        try:
            queue.enqueue('one', {})
            with self.assertRaises(VizError):
                queue.enqueue('two', {})
            self.assertEqual(queue.enqueue('one', {}), 'duplicate')
        finally:
            release.set()
            queue.shutdown()


if __name__ == '__main__':
    unittest.main()
