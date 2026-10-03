"""Owner registration settings do not invent credentials or accept unsafe origins."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from kicad_vizdiff.git import VizError
from scripts.configure_github_app import generate
from kicad_vizdiff.app_server import main, validate_credentials


class RegistrationTests(unittest.TestCase):
    def test_public_startup_never_binds_without_credentials(self):
        with patch.dict('os.environ', {'VIZDIFF_PUBLIC_URL': 'https://review.example',
                                     'GITHUB_WEBHOOK_SECRET': 'x'*32}, clear=True), \
                patch('sys.argv', ['app-server']), patch('kicad_vizdiff.app_server.AppServer') as server, \
                redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code, 2)
            server.assert_not_called()

    def test_real_rsa_key_is_accepted_and_invalid_file_is_rejected(self):
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric import rsa
        except ImportError:
            self.skipTest('App credential validation needs the optional github extra.')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            secret = root/'app.pem'
            secret.write_bytes(key.private_bytes(serialization.Encoding.PEM,
                               serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            validate_credentials('123', str(secret), root/'web')
            secret.write_text('invalid private key')
            with self.assertRaises(VizError):
                validate_credentials('123', str(secret), root/'web')

    def test_wayri_settings_and_placeholder_deployment_environment(self):
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()):
            generate('https://review.example/', 'wayri', 'KiCad Visual Review', temp)
            manifest = json.loads((Path(temp)/'app-manifest.json').read_text())
            self.assertEqual(manifest['setup_url'], 'https://review.example/setup')
            self.assertEqual(manifest['hook_attributes']['url'], 'https://review.example/api/github/webhook')
            self.assertEqual(manifest['default_permissions'], {'contents': 'read', 'pull_requests': 'read', 'checks': 'write'})
            environment = (Path(temp)/'deployment.env.example').read_text()
            self.assertIn('# GitHub App owner: wayri', environment)
            self.assertIn('REPLACE_WITH_REGISTERED_APP_ID', environment)
            self.assertEqual(len(list(Path(temp).iterdir())), 2)

    def test_invalid_origin_and_owner_write_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            for origin, owner in (('http://review.example', 'wayri'), ('https://review.example', 'owner\nINJECT=value'),
                                  ('https://review.example\nINJECT=value', 'wayri')):
                with self.subTest(origin=origin, owner=owner), self.assertRaises((VizError, ValueError)):
                    generate(origin, owner, 'Review', temp)
            self.assertFalse(list(Path(temp).iterdir()))
