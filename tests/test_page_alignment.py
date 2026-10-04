import unittest
from kicad_vizdiff.render import align_sheet_pages


class PageAlignmentTests(unittest.TestCase):
    def test_identity_pairing_updates_objects_and_hierarchy_links(self):
        before = {'old.svg': 'root', 'old-Power.svg': 'child'}
        old = {'sheets': [{'id': 'root', 'page': 'old.svg'}, {'id': 'root/power', 'page': 'old-Power.svg'}],
               'objects': [{'page': 'old-Power.svg', 'pages': ['old-Power.svg'], 'source': 'old.kicad_sch'}]}
        new = {'sheets': [{'id': 'root', 'page': 'new.svg'}, {'id': 'root/power', 'page': 'new-Supply.svg'}], 'objects': []}
        paired = align_sheet_pages(before, old, {'new.svg': 'new root', 'new-Supply.svg': 'new child'}, new)
        self.assertEqual(paired, {'new.svg': 'root', 'new-Supply.svg': 'child'})
        self.assertEqual(old['objects'][0]['pages'], ['new-Supply.svg'])
        self.assertEqual(old['objects'][0]['source'], 'old.kicad_sch')

    def test_ambiguous_identity_and_colliding_pages_are_not_guessed(self):
        before = {'old.svg': 'old root', 'new.svg': 'unrelated'}
        old = {'sheets': [{'id': 'root', 'page': 'old.svg'}], 'objects': []}
        new = {'sheets': [{'id': 'root', 'page': 'new.svg'}], 'objects': []}
        self.assertEqual(align_sheet_pages(before, old, {'new.svg': 'new root'}, new), before)
        self.assertEqual(old['sheets'][0]['page'], 'old.svg')
        duplicate = {'sheets': [{'id': 'root', 'page': 'new.svg'}, {'id': 'root', 'page': 'other.svg'}], 'objects': []}
        self.assertEqual(align_sheet_pages({'old.svg': 'old'}, old, {'new.svg': 'new'}, duplicate), {'old.svg': 'old'})
