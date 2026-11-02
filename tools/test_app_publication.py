import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import app_source_publish as publish
from verify_app_publication import matches


def source(sid='new'):
    return ('# LumeSource: ' + json.dumps(dict(id=sid, name='测试', version='1', category='video', contentCategory='movie'))
            + '\nclass Spider:\n    pass\n').encode()


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patcher = patch.object(publish, 'ROOT', self.root)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.git('init', '-q')
        self.git('config', 'user.name', 'test')
        self.git('config', 'user.email', 'test@example.invalid')
        (self.root/'metadata').mkdir()
        (self.root/'video').mkdir()
        (self.root/'movie').mkdir()
        (self.root/'metadata/catalog.json').write_text(json.dumps({'sources':[
            {'id':'old','path':'video/旧.py','aliases':['movie/旧.py']}]}), encoding='utf-8')
        (self.root/'video/旧.py').write_bytes(source('old'))
        (self.root/'movie/旧.py').write_bytes(source('old'))
        self.commit()
        self.base = self.git('rev-parse', 'HEAD')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.DEVNULL).decode().strip()

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'test')

    def test_real_git_unicode_add_and_python_syntax(self):
        (self.root/'video/新增.py').write_bytes(source())
        self.commit()
        self.assertEqual(publish.validate_candidate(self.base), {'video/新增.py':'A'})

    def test_delete_requires_all_catalog_aliases(self):
        (self.root/'video/旧.py').unlink()
        self.commit()
        with self.assertRaisesRegex(ValueError, 'aliases'):
            publish.validate_candidate(self.base)

    def test_delete_all_aliases_in_single_commit(self):
        (self.root/'video/旧.py').unlink()
        (self.root/'movie/旧.py').unlink()
        self.commit()
        self.assertEqual(len(publish.validate_candidate(self.base)), 2)

    def test_conflict_rejects_changed_main(self):
        (self.root/'video/新增.py').write_bytes(source())
        self.commit()
        with self.assertRaisesRegex(ValueError, 'main changed'):
            publish.validate_candidate('f'*40)

    def test_duplicates_and_unrelated_files_rejected(self):
        (self.root/'video/重复.py').write_bytes(source('old'))
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            publish.validate_candidate(self.base)

    def test_cannot_change_publishing_tools(self):
        (self.root/'danger.py').write_text('pass')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'only accepts'):
            publish.validate_candidate(self.base)


class ValidationTests(unittest.TestCase):
    def test_paths_and_syntax_and_categories(self):
        for path in ('../x.py', 'video/a/b.py', 'tools/a.py', 'video/.x.py', 'video/a\\b.py'):
            self.assertFalse(publish.valid_path(path))
        self.assertEqual(publish.validate_script('movie/测试.py', source())['id'], 'new')
        with self.assertRaises(SyntaxError):
            publish.validate_script('video/x.py', source()+b'\ninvalid syntax !')
        with self.assertRaises(ValueError):
            publish.validate_script('comic/x.py', source())

    def test_route_verification_requires_actual_bytes_and_checks_deletion(self):
        self.assertTrue(matches('url', b'expected', opener=lambda *a, **k: io.BytesIO(b'expected')))
        self.assertFalse(matches('url', b'expected', opener=lambda *a, **k: io.BytesIO(b'old')))
        self.assertFalse(matches('url', None, opener=lambda *a, **k: io.BytesIO(b'stale cached source')))
        def missing(*a, **k):
            raise urllib.error.HTTPError('url', 404, 'missing', {}, io.BytesIO())
        self.assertTrue(matches('url', None, opener=missing))
        self.assertFalse(matches('url', b'expected', opener=missing))


class CatalogIntegrationTests(unittest.TestCase):
    def test_add_then_delete_builds_real_catalog_and_both_subscriptions(self):
        import sys
        repository = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'repository'
            subprocess.run(['git', 'clone', '--quiet', '--shared', str(repository), str(target)], check=True)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=target, stderr=subprocess.DEVNULL).decode().strip()
            git('config', 'user.name', 'test')
            git('config', 'user.email', 'test@example.invalid')
            sid = 'lumebox_publication_fixture'
            script_path = target / 'video/发布测试.py'
            base = git('rev-parse', 'HEAD')
            script_path.write_bytes(source(sid).replace(b'"movie"', b'"adult"'))
            git('add', '.')
            git('commit', '-qm', 'add fixture locally')
            with patch.object(publish, 'ROOT', target):
                changes = publish.validate_candidate(base)
                publish.update_ratings(changes)
            subprocess.run([sys.executable, 'tools/build_catalog.py'], cwd=target, check=True, capture_output=True)
            catalog = json.loads((target/'metadata/catalog.json').read_text(encoding='utf-8'))
            self.assertEqual(next(row for row in catalog['sources'] if row['id'] == sid)['rating'], '18+')
            for prefix in ('subscriptions', 'subscriptions/cdn'):
                self.assertIn('发布测试.py', (target/prefix/'video.txt').read_text(encoding='utf-8'))
            git('add', '.')
            git('commit', '-qm', 'generate fixture subscriptions locally')
            base = git('rev-parse', 'HEAD')
            script_path.unlink()
            git('add', '.')
            git('commit', '-qm', 'delete fixture locally')
            with patch.object(publish, 'ROOT', target):
                self.assertEqual(publish.validate_candidate(base), {'video/发布测试.py':'D'})
            subprocess.run([sys.executable, 'tools/build_catalog.py'], cwd=target, check=True, capture_output=True)
            subprocess.run([sys.executable, 'tools/build_catalog.py', '--check'], cwd=target, check=True, capture_output=True)
            catalog = json.loads((target/'metadata/catalog.json').read_text(encoding='utf-8'))
            self.assertNotIn(sid, {row['id'] for row in catalog['sources']})
            for prefix in ('subscriptions', 'subscriptions/cdn'):
                self.assertNotIn('发布测试.py', (target/prefix/'video.txt').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
