"""Static safety contracts for the opt-in GitHub App deployment."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DeploymentConfigTests(unittest.TestCase):
    def test_locked_node_dependency_uses_exact_registry_integrity(self):
        directory = ROOT / 'scripts/build-deps'
        spec = json.loads((directory / 'package.json').read_text(encoding='utf-8-sig'))
        lock = json.loads((directory / 'package-lock.json').read_text(encoding='utf-8-sig'))
        three = lock['packages']['node_modules/three']
        self.assertEqual(spec['dependencies'], {'three': '0.171.0'})
        self.assertEqual(three['version'], '0.171.0')
        self.assertEqual(three['resolved'], 'https://registry.npmjs.org/three/-/three-0.171.0.tgz')
        self.assertTrue(three['integrity'].startswith('sha512-'))

    def test_workflows_install_locked_dependencies_without_lifecycle_scripts(self):
        for name in ('ci.yml', 'release.yml'):
            text = (ROOT / '.github/workflows' / name).read_text(encoding='utf-8')
            self.assertIn('npm ci --prefix .vizdiff/build-deps --ignore-scripts', text)
            self.assertIn('--require-hashes -r scripts/requirements-linux.lock', text)
            self.assertIn('--no-deps --no-build-isolation .', text)

    def test_compose_has_local_binding_file_secrets_and_restrictions(self):
        text = (ROOT / 'compose.github-app.yml').read_text(encoding='utf-8-sig')
        for setting in ('127.0.0.1:8780:8780', 'GITHUB_WEBHOOK_SECRET_FILE: /run/secrets/github_webhook_secret',
                        'read_only: true', 'mem_limit: 512m', 'cpus: 1.0', 'pids_limit: 128',
                        'noexec,nosuid,nodev,size=64m', 'cap_drop: ["ALL"]', 'no-new-privileges:true'):
            self.assertIn(setting, text)
        self.assertNotIn('GITHUB_WEBHOOK_SECRET: ', text)

    def test_image_runs_as_nonroot_and_stages_complete_assets(self):
        text = (ROOT / 'Dockerfile.github-app').read_text(encoding='utf-8-sig')
        self.assertIn('USER 10001:10001', text)
        self.assertIn('COPY extension ./extension', text)
        self.assertIn('COPY --from=builder /app/.vizdiff/app-web', text)
        self.assertIn('--require-hashes -r scripts/requirements-linux.lock', text)

    def test_proxy_does_not_accept_forwarded_client_identity(self):
        text = (ROOT / 'deploy/nginx-github-app.conf').read_text(encoding='utf-8-sig')
        self.assertIn('limit_req_zone $binary_remote_addr', text)
        self.assertIn('proxy_set_header X-Forwarded-For "";', text)
        self.assertIn('proxy_set_header Forwarded "";', text)
        self.assertIn('client_max_body_size 1m;', text)
        webhook = text.split('location = /api/github/webhook {', 1)[1].split('\n    }', 1)[0]
        self.assertIn('proxy_request_buffering off;', webhook)


if __name__ == '__main__':
    unittest.main()
