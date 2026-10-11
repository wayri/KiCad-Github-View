"""Single-instance durable GitHub webhook queue, with bounded retries."""
import json
import hashlib
from pathlib import Path
import sqlite3
import threading
import time

from .git import VizError


class DeliveryQueue:
    def __init__(self, path, process, *, retry_delays=(5, 30, 120, 600), capacity=1000, history_capacity=10000):
        self.process = process
        self.retry_delays = retry_delays
        self.capacity = capacity
        self.history_capacity = history_capacity
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.failed = threading.Event()
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False, timeout=10)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS deliveries (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL,
            updated REAL NOT NULL, error TEXT)''')
        if 'fingerprint' not in {column[1] for column in self.db.execute('PRAGMA table_info(deliveries)')}:
            self.db.execute('ALTER TABLE deliveries ADD COLUMN fingerprint TEXT')
        self.db.execute('CREATE INDEX IF NOT EXISTS delivery_fingerprints ON deliveries(fingerprint)')
        # This queue is run by one service process; recover interrupted work on restart.
        self.db.execute("UPDATE deliveries SET status='queued', next_attempt=? WHERE status='running'", (time.time(),))
        self.db.commit()
        self.thread = threading.Thread(target=self.run, name='github-webhooks', daemon=True)
        self.thread.start()

    def enqueue(self, delivery, payload):
        now = time.time()
        with self.lock:
            if not self.healthy:
                raise VizError('Webhook worker unavailable. Redeliver after the service recovers.')
            try:
                return self._enqueue(delivery, payload, now)
            except sqlite3.Error as exc:
                self.failed.set()
                self.wake.set()
                try:
                    self.db.rollback()
                except sqlite3.Error:
                    pass
                raise VizError('Webhook storage unavailable. Redeliver after the service recovers.') from exc

    @property
    def healthy(self):
        return not self.failed.is_set() and not self.stop.is_set() and self.thread.is_alive()

    def _enqueue(self, delivery, payload, now):
        self.db.execute("DELETE FROM deliveries WHERE status IN ('complete','failed') AND updated < ?", (now-7*86400,))
        encoded = json.dumps(payload, sort_keys=True, separators=(',', ':'))
        fingerprint = hashlib.sha256(encoded.encode()).hexdigest()
        row = self.db.execute('SELECT status FROM deliveries WHERE id=?', (delivery,)).fetchone()
        if row and row[0] != 'failed':
            self.db.commit()
            return 'duplicate'
        # GitHub signs the body, not X-GitHub-Delivery. A captured signed payload
        # must not bypass deduplication just by changing that unsigned header.
        duplicate = self.db.execute("SELECT id FROM deliveries WHERE fingerprint=? AND status != 'failed' LIMIT 1", (fingerprint,)).fetchone()
        if duplicate:
            self.db.commit()
            return 'duplicate'
        if not row and self.db.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0] >= self.history_capacity:
            self.db.commit()
            raise VizError('Webhook history capacity reached. Redeliver later.')
        count = self.db.execute("SELECT COUNT(*) FROM deliveries WHERE status IN ('queued','running')").fetchone()[0]
        if count >= self.capacity:
            self.db.commit()
            raise VizError('Webhook queue capacity reached. Redeliver later.')
        if row:
            self.db.execute("UPDATE deliveries SET payload=?, fingerprint=?, status='queued', attempts=0, next_attempt=?, updated=?, error=NULL WHERE id=?",
                            (encoded, fingerprint, now, now, delivery))
        else:
            self.db.execute("INSERT INTO deliveries(id,payload,fingerprint,status,next_attempt,updated) VALUES(?,?,?,'queued',?,?)",
                            (delivery, encoded, fingerprint, now, now))
        self.db.commit()  # Persist before the HTTP handler acknowledges the delivery.
        self.wake.set()
        return 'accepted'

    def state(self, delivery):
        with self.lock:
            row = self.db.execute('SELECT status,attempts,error FROM deliveries WHERE id=?', (delivery,)).fetchone()
        return {'status': row[0], 'attempts': row[1], 'error': row[2]} if row else None

    def next_job(self):
        with self.lock:
            row = self.db.execute("SELECT id,payload,attempts FROM deliveries WHERE status='queued' AND next_attempt<=? ORDER BY next_attempt LIMIT 1", (time.time(),)).fetchone()
            if not row:
                return None
            self.db.execute("UPDATE deliveries SET status='running', attempts=attempts+1, updated=? WHERE id=?", (time.time(), row[0]))
            self.db.commit()
        return row[0], json.loads(row[1]), row[2]+1

    def finish(self, delivery, attempt, error=None):
        now = time.time()
        if error is None:
            status, next_attempt = 'complete', now
        elif attempt <= len(self.retry_delays):
            status, next_attempt = 'queued', now+self.retry_delays[attempt-1]
        else:
            status, next_attempt = 'failed', now
        with self.lock:
            self.db.execute('UPDATE deliveries SET status=?, next_attempt=?, updated=?, error=? WHERE id=?',
                            (status, next_attempt, now, error, delivery))
            if status in ('complete', 'failed'):
                self.db.execute("UPDATE deliveries SET payload='{}' WHERE id=?", (delivery,))
            self.db.commit()

    def run(self):
        try:
            self._run()
        except Exception as exc:
            self.failed.set()
            print(f'GitHub App webhook worker stopped: {type(exc).__name__}. Restart after storage recovery.', flush=True)

    def _run(self):
        while not self.stop.is_set() and not self.failed.is_set():
            job = self.next_job()
            if job is None:
                self.wake.wait(1)
                self.wake.clear()
                continue
            delivery, payload, attempt = job
            try:
                self.process(payload)
            except Exception as exc:
                kind = type(exc).__name__
                self.finish(delivery, attempt, kind)
                print(f'GitHub App delivery attempt {attempt} failed: {kind}.', flush=True)
            else:
                self.finish(delivery, attempt)

    def shutdown(self, wait=True, **kwargs):
        self.stop.set()
        self.wake.set()
        # Do not close SQLite while an active GitHub request is still finishing.
        self.thread.join()
        self.db.close()
