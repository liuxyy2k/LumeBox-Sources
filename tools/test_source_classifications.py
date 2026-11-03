import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import build_catalog


class SourceClassificationsTest(unittest.TestCase):
    def test_audio_headers_are_compatible_with_comic_import(self):
        for row in build_catalog.read_sources():
            if row['kind'] != 'audiobook':
                continue
            text = (build_catalog.ROOT / row['path']).read_text(encoding='utf-8-sig')
            meta = json.loads(text.splitlines()[0].split(': ', 1)[1])
            self.assertEqual(meta['category'], 'comic', row['path'])
            self.assertEqual(meta['mediaType'], 'audio', row['path'])

    def test_four_reported_sources_and_audiobook_are_classified(self):
        rows = {row['id']: row for row in build_catalog.read_sources()}
        for sid in ['duboku_video', 'ptt_drama']:
            self.assertEqual(rows[sid]['kind'], 'movie')
        for sid in ['asmrba_video', 'asmrhoney_video']:
            self.assertEqual(rows[sid]['rating'], '18+')
        self.assertEqual(rows['yueting_video']['kind'], 'audiobook')
        self.assertEqual(rows['yueting_video']['appSection'], 'comic')
        total = json.loads(build_catalog.build()['subscriptions/all.json'])
        self.assertIn(build_catalog.RAW + 'subscriptions/audiobook.txt', total['sections']['comic'])
        self.assertNotIn(build_catalog.RAW + 'subscriptions/audiobook.txt', total['sections']['video'])

    def test_new_video_source_cannot_publish_without_content_classification(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'video').mkdir()
            (root / 'metadata').mkdir()
            (root / 'metadata/content-ratings.json').write_text('{"sources":{}}', 'utf8')
            source = root / 'video/example.js'
            metadata = {'id': 'example_video', 'name': '示例', 'version': '1', 'category': 'video'}
            source.write_text('// LumeSource: ' + json.dumps(metadata), 'utf8')
            with patch.object(build_catalog, 'ROOT', root):
                with self.assertRaisesRegex(ValueError, 'contentCategory'):
                    build_catalog.read_sources()
                metadata['contentCategory'] = 'movie'
                source.write_text('// LumeSource: ' + json.dumps(metadata), 'utf8')
                self.assertEqual(build_catalog.read_sources()[0]['kind'], 'movie')

    def test_audio_media_type_takes_priority_over_movie_content_label(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'audiobook').mkdir()
            (root / 'metadata').mkdir()
            (root / 'metadata/content-ratings.json').write_text('{"sources":{}}', 'utf8')
            metadata = {'id': 'example', 'name': 'Audio', 'version': '1', 'category': 'comic', 'mediaType': 'audio', 'contentCategory': 'movie'}
            (root / 'audiobook/example.js').write_text('// LumeSource: ' + json.dumps(metadata), 'utf8')
            with patch.object(build_catalog, 'ROOT', root):
                row = build_catalog.read_sources()[0]
                self.assertEqual((row['kind'], row['appSection']), ('audiobook', 'comic'))


if __name__ == '__main__':
    unittest.main()
