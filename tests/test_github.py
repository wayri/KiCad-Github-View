"""Boundary checks for a server that accepts repository URLs and archives."""
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from urllib.request import Request
from unittest.mock import patch

from kicad_vizdiff.github import extract_archive, repository_name, verify_webhook, api, NoRedirect
from kicad_vizdiff.git import VizError


def archive(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as z:
        for name, value in entries.items():
            z.writestr(name, value)
    return stream.getvalue()


class GitHubBoundaryTests(unittest.TestCase):
    def test_authorized_api_redirect_never_forwards_credentials(self):
        request = Request('https://api.github.com/repos/owner/repo', headers={'Authorization': 'Bearer secret'})
        for url in ('https://attacker.example/collect', 'https://api.github.com/repos/renamed/repo'):
            with self.subTest(url=url), self.assertRaises(VizError):
                NoRedirect().redirect_request(request, None, 302, 'Found', {}, url)

    def test_invalid_api_paths_do_not_send_requests(self):
        with patch('kicad_vizdiff.github._api_opener.open') as transport:
            for path in ('https://attacker.example', '//attacker.example', '/repos/x\r\nInjected: yes', None):
                with self.subTest(path=path), self.assertRaises(VizError):
                    api(path, 'private-token')
            transport.assert_not_called()

    def test_public_repository_name(self):
        self.assertEqual(repository_name('KiCad/examples'), 'KiCad/examples')
        for value in ('../repo', 'org/../repo', 'owner/repo/extra', 'owner repo/x', None):
            with self.subTest(value=value), self.assertRaises(VizError):
                repository_name(value)

    def test_archive_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(VizError):
                extract_archive(archive({'repo-root/../escape.kicad_sch': 'bad'}), root)
            self.assertFalse((root.parent / 'escape.kicad_sch').exists())

    def test_archive_extracts_regular_project(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            extract_archive(archive({'repo-root/project.kicad_sch': '(kicad_sch)',
                                     'repo-root/sub/child.kicad_sch': '(kicad_sch)'}), root)
            self.assertEqual((root / 'sub/child.kicad_sch').read_text(), '(kicad_sch)')

    def test_webhook_signature(self):
        self.assertTrue(verify_webhook('secret', b'{}',
            'sha256=77325902caca812dc259733aacd046b73817372c777b8d95b402647474516e13'))
        self.assertFalse(verify_webhook('secret', b'{"x":1}',
            'sha256=77325902caca812dc259733aacd046b73817372c777b8d95b402647474516e13'))
        self.assertFalse(verify_webhook('', b'{}', 'sha256=x'))


if __name__ == '__main__':
    unittest.main()
