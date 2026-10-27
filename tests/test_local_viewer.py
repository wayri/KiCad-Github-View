import base64
import http.client
import importlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

from kicad_vizdiff import local_viewer as viewer


class LocalViewerTests(unittest.TestCase):
    def test_packaged_license_is_not_exposed_or_rejected_by_local_asset_inventory(self):
        with tempfile.TemporaryDirectory() as folder:
            assets = Path(folder)
            (assets / 'local-assets.json').write_text(json.dumps({'files': ['local-viewer.html', 'LICENSE.txt']}), encoding='utf-8')
            self.assertEqual(viewer.asset_inventory(assets), frozenset({'local-viewer.html'}))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / 'project'
        self.project.mkdir()
        (self.project / 'board.kicad_pcb').write_text('(kicad_pcb (version 20240108))', encoding='utf-8')
        self.assets = self.root / 'web'
        self.assets.mkdir()
        (self.assets / 'local-viewer.html').write_text('<h1>Local viewer</h1>', encoding='utf-8')
        (self.assets / 'local-viewer.js').write_text('/* shared host */', encoding='utf-8')
        (self.assets / 'local-assets.json').write_text(json.dumps({'files': ['local-viewer.html', 'local-viewer.js']}), encoding='utf-8')

    def server(self):
        server = viewer.LocalViewerServer(self.project / 'board.kicad_pcb', self.assets)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server

    def request(self, server, path, method='GET', headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
        try:
            conn.request(method, path, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_snapshot_preserves_relative_sources_assets_and_selected_root(self):
        folder = self.project / 'schematics'
        folder.mkdir()
        (folder / 'root.kicad_sch').write_text('(kicad_sch (text "µA"))', encoding='utf-8')
        (self.project / 'top.gtl').write_text('G04 saved Gerber*', encoding='utf-8')
        (self.project / 'part.step').write_bytes(b'ISO-10303-21;')
        (self.project / 'manual.pdf').write_bytes(b'%PDF-1.7')
        (self.project / '.env').write_text('SECRET=private')
        (self.project / '.git').mkdir()
        (self.project / '.git' / 'private.json').write_text('{"secret":true}')
        (self.project / 'secret.key').write_text('not a project asset')
        result = viewer.project_snapshot(self.project / 'board.kicad_pcb')
        self.assertEqual(result['rootFile'], 'board.kicad_pcb')
        self.assertEqual({f['path'] for f in result['files']}, {'board.kicad_pcb', 'schematics/root.kicad_sch', 'top.gtl'})
        self.assertEqual(base64.b64decode(next(a for a in result['assets'] if a['path'] == 'manual.pdf')['base64']), b'%PDF-1.7')
        self.assertEqual(result['id'], viewer.project_snapshot(self.project)['id'])

    def test_project_endpoint_requires_header_session_and_exact_host_origin(self):
        server = self.server()
        status, headers, content = self.request(server, '/api/project', headers={'X-KiView-Session': server.session, 'Origin': server.origin})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(content)['rootFile'], 'board.kicad_pcb')
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
        self.assertIn("connect-src 'self'", headers['Content-Security-Policy'])
        self.assertIn("object-src 'none'", headers['Content-Security-Policy'])
        self.assertIn("form-action 'none'", headers['Content-Security-Policy'])
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        for extra in [{}, {'X-KiView-Session': 'wrong'}, {'X-KiView-Session': server.session, 'Origin': 'https://evil.example'}, {'X-KiView-Session': server.session, 'Host': 'evil.example'}]:
            self.assertEqual(self.request(server, '/api/project', headers=extra)[0], 403)
        self.assertEqual(self.request(server, '/api/project?session=' + server.session)[0], 403)
        self.assertIn('?session=', server.url)

    def test_assets_are_allowlisted_and_all_writes_are_rejected(self):
        (self.assets / 'private.json').write_text('{"secret":"never served"}')
        server = self.server()
        self.assertEqual(self.request(server, '/local-viewer.html')[0], 200)
        self.assertEqual(self.request(server, '/local-viewer.js')[1]['Content-Type'], 'text/javascript')
        for path in ['/private.json', '/local-assets.json', '/.git/config', '/%2e%2e/private.json', '/project/board.kicad_pcb']:
            self.assertEqual(self.request(server, path)[0], 404)
        original = (self.project / 'board.kicad_pcb').read_bytes()
        for method in ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']:
            self.assertEqual(self.request(server, '/api/project', method, {'X-KiView-Session': server.session})[0], 405)
        self.assertEqual((self.project / 'board.kicad_pcb').read_bytes(), original)

    def test_inventory_rejects_hidden_outside_source_and_arbitrary_config_entries(self):
        for name in ['../private.json', '.git/config', 'config.json', 'server.py', '/local-viewer.js', 'C:/private.js']:
            (self.assets / 'local-assets.json').write_text(json.dumps({'files': ['local-viewer.html', name]}), encoding='utf-8')
            with self.assertRaises(ValueError):
                viewer.asset_inventory(self.assets)

    def test_authenticated_snapshot_reloads_saved_disk_sources_and_has_bounded_read_limits(self):
        server = self.server()
        (self.project / 'board.kicad_pcb').write_text('changed saved data')
        result = json.loads(self.request(server, '/api/project', headers={'X-KiView-Session': server.session})[2])
        self.assertEqual(result['files'][0]['content'], 'changed saved data')
        self.assertEqual(result['rootFile'], 'board.kicad_pcb')
        (self.project / 'board.kicad_pcb').unlink()
        status, _, error = self.request(server, '/api/project', headers={'X-KiView-Session': server.session})
        self.assertEqual(status, 422)
        self.assertIn('error', json.loads(error))
        (self.project / 'board.kicad_pcb').write_text('restored source')
        with patch.object(viewer, 'MAX_PROJECT_BYTES', 1):
            with self.assertRaisesRegex(ValueError, '96 MiB'):
                viewer.project_snapshot(self.project)
        with self.assertRaises(ValueError):
            viewer.read_bounded(self.project.resolve(), 'board.kicad_pcb', maximum=2)
        with self.assertRaises(ValueError):
            viewer.contained_file(self.project.resolve(), '../outside.kicad_pcb')

    def test_linked_project_sources_and_web_assets_are_never_read(self):
        outside = self.root / 'outside.kicad_sch'
        outside.write_text('private external source')
        link = self.project / 'linked.kicad_sch'
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest('This Windows account cannot create symbolic links.')
        self.assertNotIn('linked.kicad_sch', {f['path'] for f in viewer.project_snapshot(self.project)['files']})
        with self.assertRaises(ValueError):
            viewer.project_snapshot(link)
        with self.assertRaises(ValueError):
            viewer.contained_file(self.project.resolve(), 'linked.kicad_sch')
        web_link = self.assets / 'linked.js'
        web_link.symlink_to(outside)
        (self.assets / 'local-assets.json').write_text(json.dumps({'files': ['local-viewer.html', 'linked.js']}), encoding='utf-8')
        self.assertEqual(self.request(self.server(), '/linked.js')[0], 404)

    def test_link_checks_are_enforced_without_symbolic_link_privileges(self):
        linked = self.project / 'board.kicad_pcb'
        with patch.object(Path, 'is_symlink', lambda p: p == linked):
            with self.assertRaisesRegex(ValueError, 'Linked paths'):
                viewer.contained_file(self.project.resolve(), 'board.kicad_pcb')
            with self.assertRaisesRegex(ValueError, 'linked path'):
                viewer.project_snapshot(linked)
        with patch.object(Path, 'is_symlink', lambda p: p == self.project):
            with self.assertRaisesRegex(ValueError, 'linked path'):
                viewer.project_snapshot(linked)

    def test_native_action_launches_saved_board_without_mutating_or_saving_it(self):
        class ActionPlugin:
            def register(self):
                pass
        fake = types.SimpleNamespace(ActionPlugin=ActionPlugin)
        with patch.dict(sys.modules, {'pcbnew': fake}):
            for key in ['kicad_plugin', 'kicad_plugin.action']:
                sys.modules.pop(key, None)
            action = importlib.import_module('kicad_plugin.action')
        class Board:
            def GetFileName(inner):
                return str(self.project / 'board.kicad_pcb')
        with patch.object(action.subprocess, 'Popen') as launched:
            action.launch_saved_board(Board(), executable='python-fixture')
            argv = launched.call_args.args[0]
            self.assertEqual(argv[:3], ['python-fixture', '-m', 'kicad_vizdiff.local_viewer'])
            self.assertEqual(Path(argv[4]), self.project / 'board.kicad_pcb')
            self.assertEqual(launched.call_args.kwargs['stdout'], action.subprocess.DEVNULL)
            self.assertIn('PYTHONPATH', launched.call_args.kwargs['env'])
        with self.assertRaisesRegex(ValueError, 'Save the PCB first'):
            action.launch_saved_board(types.SimpleNamespace(GetFileName=lambda: ''))
        host = self.root / 'pcbnew.exe'
        interpreter = self.root / 'python.exe'
        interpreter.write_bytes(b'mocked interpreter')
        with patch.object(action.sys, 'executable', str(host)), patch.object(action, 'os', types.SimpleNamespace(name='nt')):
            self.assertEqual(Path(action.python_executable()), interpreter)
            interpreter.unlink()
            with self.assertRaisesRegex(ValueError, 'interpreter could not be located'):
                action.python_executable()


if __name__ == '__main__':
    unittest.main()
