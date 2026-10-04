"""Object locations and sheet navigation from native KiCad syntax."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from kicad_vizdiff.git import VizError
from kicad_vizdiff.inspect import _parse, inspect
from tests.fixtures import board, schematic, uid


class InspectTests(unittest.TestCase):
    def test_quoted_syntax_and_comments(self):
        self.assertEqual(_parse('(root (text "hello (world); \\"quoted\\"") ; comment\n (at 2 3))'),
                         ['root', ['text', 'hello (world); "quoted"'], ['at', '2', '3']])
        with self.assertRaises(VizError):
            _parse('(root (text "unterminated))')

    def test_schematic_placed_symbol_and_page(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'sensor.kicad_sch').write_text(schematic(), encoding='utf-8')
            result = inspect(root, 'sensor.kicad_sch', ['sensor.svg'])
            symbol = next(o for o in result['objects'] if o['type'] == 'symbol')
            self.assertEqual((symbol['x'], symbol['y'], symbol['title']), (100, 90, 'R1'))
            self.assertEqual(symbol['properties']['Value'], '10k')
            self.assertEqual(symbol['page'], 'sensor.svg')
            wire = next(o for o in result['objects'] if o['type'] == 'wire')
            self.assertEqual(wire['properties']['Points'], [(100, 70), (100, 86.19)])
            self.assertEqual(result['sheets'][0]['page'], 'sensor.svg')
            json.dumps(result)

    def test_pcb_footprint_pad_rotation_and_nets(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'sensor.kicad_pcb').write_text(board(), encoding='utf-8')
            result = inspect(root, 'sensor.kicad_pcb', ['All selected layers', 'F.Cu', 'B.Cu'])
            footprint = next(o for o in result['objects'] if o['type'] == 'footprint')
            self.assertEqual((footprint['x'], footprint['y'], footprint['title']), (95, 80, 'R1'))
            pads = [o for o in result['objects'] if o['type'] == 'pad']
            self.assertEqual([(p['x'], p['y']) for p in pads], [(95, 80), (105, 80)])
            self.assertEqual(pads[0]['properties']['Net'], 'SENSE')
            self.assertEqual(pads[0]['footprintId'], footprint['id'])
            self.assertEqual(pads[0]['pages'], ['All selected layers', 'F.Cu', 'B.Cu'])
            track = next(o for o in result['objects'] if o['type'] == 'segment')
            self.assertEqual((track['x'], track['y']), (95, 90))
            self.assertEqual(track['page'], 'All selected layers')
            self.assertEqual(track['pages'], ['All selected layers', 'F.Cu'])
            json.dumps(result)
            rotated = board().replace('(at 95 80)', '(at 95 80 90)', 1)
            (root / 'sensor.kicad_pcb').write_text(rotated, encoding='utf-8')
            pads = [o for o in inspect(root, 'sensor.kicad_pcb')['objects'] if o['type'] == 'pad']
            self.assertAlmostEqual(pads[1]['x'], 95)
            self.assertAlmostEqual(pads[1]['y'], 70)

    def test_hierarchical_sheet_navigation_and_path_boundary(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            child_uuid = uid('child')
            root_text = schematic().replace('(sheet_instances (path "/" (page "1")))',
                f'''(sheet (at 30 30) (size 20 12) (uuid "{child_uuid}")
                     (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch"))
                    (sheet_instances (path "/" (page "1")))''')
            (root / 'sensor.kicad_sch').write_text(root_text, encoding='utf-8')
            (root / 'power.kicad_sch').write_text(schematic(), encoding='utf-8')
            result = inspect(root, 'sensor.kicad_sch', ['sensor.svg', 'sensor-Power.svg'])
            self.assertEqual(len(result['sheets']), 2)
            self.assertEqual(result['sheets'][1]['page'], 'sensor-Power.svg')
            sheet_object = next(o for o in result['objects'] if o['type'] == 'sheet')
            self.assertEqual(sheet_object['targetSheetId'], result['sheets'][1]['id'])
            self.assertEqual(sheet_object['page'], 'sensor.svg')
            child_symbols = [o for o in result['objects'] if o['type'] == 'symbol' and o['page'] == 'sensor-Power.svg']
            self.assertEqual(len(child_symbols), 1)
            legacy = root_text.replace('Sheetname', 'Sheet name').replace('Sheetfile', 'Sheet file')
            (root / 'sensor.kicad_sch').write_text(legacy, encoding='utf-8')
            legacy_result = inspect(root, 'sensor.kicad_sch', ['sensor.svg', 'sensor-Power.svg'])
            self.assertEqual(len(legacy_result['sheets']), 2)
            self.assertEqual(legacy_result['sheets'][1]['name'], 'Power')
            legacy_sheet = next(o for o in legacy_result['objects'] if o['type'] == 'sheet')
            self.assertEqual(legacy_sheet['title'], 'Power')
            # A hostile Sheetfile cannot make the parser read outside a snapshot.
            (root / 'sensor.kicad_sch').write_text(root_text.replace('power.kicad_sch', '../outside.kicad_sch'), encoding='utf-8')
            self.assertEqual(len(inspect(root, 'sensor.kicad_sch')['sheets']), 1)


if __name__ == '__main__':
    unittest.main()
