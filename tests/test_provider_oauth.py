"""Publisher public-ID configuration is build input, never a credential store."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('publisher_oauth', Path(__file__).resolve().parents[1] / 'scripts/provider_oauth.py')
CONFIG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONFIG)


class PublisherOAuthTests(unittest.TestCase):
    def fixture(self, value):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        (root / 'extension').mkdir()
        (root / 'extension/provider-oauth.json').write_text(json.dumps(value), encoding='utf-8')
        return root

    def test_public_release_id_is_injected_without_changing_source(self):
        root = self.fixture({'version': 1, 'gitlab': {}})
        before = (root / 'extension/provider-oauth.json').read_bytes()
        with patch.dict(os.environ, {'POCKET_KIVI_GITLAB_CLIENT_ID': 'publisher_public_app_id'}):
            result = json.loads(CONFIG.payload(root))
        self.assertEqual(result['gitlab']['https://gitlab.com'], {'clientId': 'publisher_public_app_id'})
        self.assertEqual((root / 'extension/provider-oauth.json').read_bytes(), before)

    def test_empty_release_configuration_is_honestly_unconfigured(self):
        root = self.fixture({'version': 1, 'gitlab': {}})
        with patch.dict(os.environ, {'POCKET_KIVI_GITLAB_CLIENT_ID': ''}):
            self.assertEqual(CONFIG.payload(root), (root / 'extension/provider-oauth.json').read_bytes())

    def test_secrets_and_noncanonical_hosts_are_rejected(self):
        for host in ('http://gitlab.com', 'https://gitlab.com/', 'https://user:pass@gitlab.com', 'https://gitlab.com:443', 'https://gitlab.com?x=1'):
            with self.subTest(host=host), patch.dict(os.environ, {'POCKET_KIVI_GITLAB_CLIENT_ID': ''}):
                with self.assertRaises(ValueError):
                    CONFIG.payload(self.fixture({'version': 1, 'gitlab': {host: {'clientId': 'publisher_public_app_id'}}}))
        with patch.dict(os.environ, {'POCKET_KIVI_GITLAB_CLIENT_ID': ''}), self.assertRaises(ValueError):
            CONFIG.payload(self.fixture({'version': 1, 'gitlab': {'https://gitlab.com': {'clientId': 'publisher_public_app_id', 'clientSecret': 'forbidden'}}}))

    def test_invalid_build_ids_are_rejected(self):
        for client in ('short', 'not a valid id', 'id\nwith\nlines'):
            with self.subTest(client=client), patch.dict(os.environ, {'POCKET_KIVI_GITLAB_CLIENT_ID': client}), self.assertRaises(ValueError):
                CONFIG.payload(self.fixture({'version': 1, 'gitlab': {}}))
