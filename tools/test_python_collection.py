import collections
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import build_catalog
import build_selfhost


class PythonCollectionTests(unittest.TestCase):
    def test_total_expands_collection_once_with_correct_sections(self):
        outputs = build_catalog.build()
        rows = json.loads(outputs['metadata/catalog.json'])['sources']
        expected = {r['url']: r for r in rows if r['id'].startswith('pypack_')}
        self.assertEqual(len(expected), 304)
        for route in ('subscriptions/', 'subscriptions/cdn/'):
            total = json.loads(outputs[route + 'all.json'])
            found = collections.Counter()
            for section, manifests in total['sections'].items():
                self.assertTrue(any('/python-' in u for u in manifests))
                for url in manifests:
                    prefix = build_catalog.CDN if route.endswith('cdn/') else build_catalog.RAW
                    content = outputs[url.removeprefix(prefix)]
                    for script in content.splitlines():
                        canonical = script.replace(build_catalog.CDN, build_catalog.RAW)
                        if canonical in expected:
                            self.assertEqual(expected[canonical]['appSection'], section)
                            found[canonical] += 1
            self.assertEqual(dict(found), {url: 1 for url in expected})
        for name in ('subscriptions/python-video.txt', 'subscriptions/python-comic.txt',
                     'subscriptions/cdn/python-video.txt', 'subscriptions/cdn/python-comic.txt'):
            for line in outputs[name].splitlines():
                if line and not line.startswith('#'):
                    self.assertNotIn(' ', line, name)
        self.assertIn('%20', outputs['subscriptions/python-video.txt'])

    def test_inventory_preserves_body_and_quarantines_failures(self):
        index = json.loads((build_catalog.ROOT / 'metadata/python-collection.json').read_text('utf-8'))
        self.assertEqual(index['counts'], {'published': 304, 'pending-load': 13, 'excluded-demo': 1, 'excluded-tool': 3})
        for row in index['sources']:
            if not row['path']:
                continue
            text = (build_catalog.ROOT / row['path']).read_text('utf-8')
            header, runtime, body = text.split('\n', 2)
            self.assertEqual(json.loads(header.split(': ', 1)[1])['id'], row['id'])
            self.assertEqual(runtime, '# LumeRuntime: python')
            self.assertEqual(hashlib.sha256(body.encode()).hexdigest(), row['bodySha256'])
            if row['status'] == 'pending-load':
                self.assertTrue(row['path'].startswith('archive/'))

    def test_selfhost_keeps_python_manifests_and_audio_in_reading(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            build_selfhost.build('https://sources.test/', out)
            total = json.loads((out / 'subscriptions/all.json').read_text('utf-8'))
            self.assertIn('https://sources.test/subscriptions/python-video.txt', total['sections']['video'])
            self.assertIn('https://sources.test/subscriptions/python-comic.txt', total['sections']['comic'])
            self.assertIn('https://sources.test/subscriptions/audiobook.txt', total['sections']['comic'])
            self.assertTrue((out / 'subscriptions/python.json').is_file())


if __name__ == '__main__':
    unittest.main()
