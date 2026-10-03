"""GitHub App entry points; the browser renders all KiCad geometry."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import threading
from urllib.parse import parse_qs, unquote, urlsplit

from .app_review import changed_designs, check_payload, public_designs, public_repository, public_review, service_origin
from .github import api, installation_token, verify_webhook
from .git import VizError
from .app_jobs import DeliveryQueue
from .app_assets import PUBLIC_ASSETS


def validate_credentials(app_id, key_path, web_root):
    if not re.fullmatch(r'[1-9][0-9]*', app_id or ''):
        raise VizError('Set GITHUB_APP_ID to the numeric registered App ID.')
    if not key_path:
        raise VizError('Set GITHUB_PRIVATE_KEY_PATH to the deployment secret file.')
    path = Path(key_path).resolve()
    if path.is_relative_to(Path(web_root).resolve()):
        raise VizError('The App private key must be outside the public viewer directory.')
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        if not isinstance(key, RSAPrivateKey):
            raise ValueError('Expected RSA key')
    except ImportError as exc:
        raise VizError('Install the github extra to enable GitHub App authentication.') from exc
    except (OSError, ValueError, TypeError) as exc:
        raise VizError('GITHUB_PRIVATE_KEY_PATH must be a readable, unencrypted RSA private key.') from exc


class Handler(BaseHTTPRequestHandler):
    server_version = 'KiCadGitHubApp/0.1'

    def log_message(self, *args):
        pass

    def respond(self, status, body, content_type='application/json', location=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.github.com; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
        if location:
            self.send_header('Location', location)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        try:
            if path == '/setup':
                return self.respond(302, b'', location='/app/setup.html')
            if path in ('/', '/app'):
                return self.respond(302, b'', location='/app/')
            if path == '/health':
                healthy = self.server.worker.healthy
                return self.respond(200 if healthy else 503, {'status': 'ok' if healthy else 'unavailable',
                                    'browserRendering': True, 'privateRepositories': False})
            if path == '/api/config':
                return self.respond(200, {'githubApp': True, 'browserRendering': True,
                                         'privateRepositories': False, 'installUrl': self.server.install_url})
            if path in ('/api/review', '/api/designs'):
                query = parse_qs(parsed.query)
                def field(name, default=None):
                    values = query.get(name, [default])
                    if len(values) != 1 or values[0] is None:
                        raise VizError(f'Exactly one {name} is required.')
                    return values[0]
                if not self.server.metadata_slots.acquire(blocking=False):
                    return self.respond(503, {'error': 'Repository lookup capacity reached. Retry shortly.'})
                try:
                    data = (public_review(field('repository'), field('pull')) if path == '/api/review'
                            else public_designs(field('repository'), field('ref', 'HEAD')))
                finally:
                    self.server.metadata_slots.release()
                return self.respond(200, data)
            if path.startswith('/app/'):
                relative = unquote(path[len('/app/'):]) or 'index.html'
                if relative not in PUBLIC_ASSETS:
                    return self.respond(404, {'error': 'Not found.'})
                if '\\' in relative or '\0' in relative or any(p in ('.', '..') for p in relative.split('/')):
                    return self.respond(404, {'error': 'Not found.'})
                target = (self.server.web_root / relative).resolve()
                if not target.is_relative_to(self.server.web_root) or not target.is_file():
                    return self.respond(404, {'error': 'Not found.'})
                mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                return self.respond(200, target.read_bytes(), mime)
            return self.respond(404, {'error': 'Not found.'})
        except (VizError, ValueError, TypeError, KeyError) as exc:
            return self.respond(400, {'error': str(exc)})
        except Exception:
            return self.respond(502, {'error': 'GitHub lookup failed. Retry shortly.'})

    def do_POST(self):
        if urlsplit(self.path).path != '/api/github/webhook':
            return self.respond(404, {'error': 'Not found.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024 * 1024:
                return self.respond(413, {'error': 'Webhook must be between 1 byte and 1 MiB.'})
            raw = self.rfile.read(length)
            if not verify_webhook(self.server.webhook_secret, raw, self.headers.get('X-Hub-Signature-256')):
                return self.respond(401, {'error': 'Invalid webhook signature.'})
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise VizError('Expected a JSON object.')
            event = self.headers.get('X-GitHub-Event')
            if event == 'ping':
                return self.respond(200, {'status': 'ok'})
            if event != 'pull_request' or payload.get('action') not in ('opened', 'synchronize', 'reopened', 'ready_for_review'):
                return self.respond(202, {'status': 'ignored'})
            if payload.get('repository', {}).get('private', True):
                return self.respond(202, {'status': 'skipped', 'reason': 'Private repositories are not enabled.'})
            delivery = self.headers.get('X-GitHub-Delivery', '')
            if not delivery or len(delivery) > 200:
                raise VizError('Valid webhook delivery ID required.')
            try:
                status = self.server.worker.enqueue(delivery, payload)
            except VizError as exc:
                return self.respond(503, {'error': str(exc)})
            return self.respond(202, {'status': status})
        except (VizError, ValueError, TypeError, KeyError) as exc:
            return self.respond(400, {'error': str(exc)})


class AppServer(ThreadingHTTPServer):
    def __init__(self, address, web_root, origin, install_url=None, webhook_secret='', state_path=':memory:'):
        self.web_root = Path(web_root).resolve()
        self.origin = service_origin(origin, local=True)
        if state_path != ':memory:' and Path(state_path).resolve().is_relative_to(self.web_root):
            raise VizError('The webhook database must be outside the public viewer directory.')
        super().__init__(address, Handler)
        self.install_url = install_url
        self.webhook_secret = webhook_secret
        self.metadata_slots = threading.BoundedSemaphore(4)
        self.worker = DeliveryQueue(state_path, lambda payload: self.process_pr(payload))

    def process_pr(self, payload):
        token = installation_token(os.environ['GITHUB_APP_ID'], os.environ['GITHUB_PRIVATE_KEY_PATH'], payload['installation']['id'])
        repo = public_repository(payload['repository']['full_name'], token)
        pr = payload['pull_request']
        number = pr['number']
        designs = changed_designs(repo, number, token)
        if not designs:
            return
        check = check_payload(self.origin, repo, number, pr['head']['sha'], designs)
        same = None
        page = 1
        while True:
            existing = api(f'/repos/{repo}/commits/{pr["head"]["sha"]}/check-runs?check_name=KiCad%20visual%20review&filter=all&per_page=100&page={page}', token)
            batch = existing.get('check_runs', [])
            same = next((item for item in batch
                         if item.get('external_id') == check['external_id'] and str(item.get('app', {}).get('id')) == str(os.environ['GITHUB_APP_ID'])), None)
            if same or len(batch) < 100:
                break
            page += 1
        if same:
            update = {key: value for key, value in check.items() if key != 'head_sha'}
            api(f'/repos/{repo}/check-runs/{same["id"]}', token, update, method='PATCH')
        else:
            api(f'/repos/{repo}/check-runs', token, check)

def main():
    parser = argparse.ArgumentParser(description='GitHub App with browser-rendered KiCad review; no KiCad server required.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--web-root', default='.vizdiff/app-web')
    parser.add_argument('--state-db', default=os.environ.get('VIZDIFF_STATE_DB', '.vizdiff/app-state.sqlite3'))
    args = parser.parse_args()
    origin = os.environ.get('VIZDIFF_PUBLIC_URL', f'http://127.0.0.1:{args.port}')
    secret = os.environ.get('GITHUB_WEBHOOK_SECRET', '')
    if urlsplit(origin).scheme == 'https' or args.host not in ('127.0.0.1', 'localhost', '::1'):
        try:
            service_origin(origin)
            validate_credentials(os.environ.get('GITHUB_APP_ID'), os.environ.get('GITHUB_PRIVATE_KEY_PATH'), args.web_root)
        except VizError as exc:
            parser.error(str(exc))
        if len(secret) < 24:
            parser.error('Set GITHUB_WEBHOOK_SECRET (at least 24 characters) before public deployment.')
    install_url = os.environ.get('GITHUB_APP_INSTALL_URL')
    if install_url and not re.fullmatch(r'https://github\.com/apps/[a-z0-9-]+/installations/new', install_url):
        parser.error('GITHUB_APP_INSTALL_URL must be the GitHub App installation URL.')
    if not (Path(args.web_root) / 'index.html').is_file():
        parser.error('Build the viewer first: python scripts/package_app_web.py')
    server = AppServer((args.host, args.port), args.web_root, origin, install_url, secret, args.state_db)
    print(f'KiCad GitHub App viewer: http://{args.host}:{args.port}/app/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.worker.shutdown(wait=True, cancel_futures=False)


if __name__ == '__main__':
    main()
