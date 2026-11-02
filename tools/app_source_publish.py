"""Validate App-created candidate commits without executing source programs.

Run on a checkout of the candidate. main must still equal its single parent.
"""
import argparse
import ast
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
KINDS = {'comic', 'photo', 'movie', 'video', 'audiobook'}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8').strip()


def valid_path(path):
    parts = path.split('/')
    return (len(parts) == 2 and parts[0] in KINDS and not parts[1].startswith('.')
            and re.search(r'\.(js|py)$', parts[1]) is not None
            and not re.search(r'[\\\x00-\x1f\x7f]', path))


def validate_script(path, content):
    if not valid_path(path) or not 0 < len(content) <= 4 * 1024 * 1024:
        raise ValueError('Invalid source path or size')
    text = content.decode('utf-8-sig')
    match = re.search(r'^\s*(?://|#)\s*@?LumeSource\s*[:=]\s*(\{[^\n]+\})', text, re.M)
    if not match:
        raise ValueError('Source requires LumeSource JSON header')
    meta = json.loads(match[1])
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(meta.get('id', ''))):
        raise ValueError('Invalid source ID')
    if any(not isinstance(meta.get(key), str) or not meta[key].strip() for key in ('name', 'version')):
        raise ValueError('Missing source name/version')
    kind = path.split('/')[0]
    categories = ('comic', 'photo') if kind in ('comic', 'photo') else ('video', 'audiobook')
    if meta.get('category') not in categories or meta.get('contentCategory') not in ('movie', 'adult'):
        raise ValueError('Source category/contentCategory mismatch')
    if kind == 'movie' and meta['contentCategory'] != 'movie':
        raise ValueError('Movie directory requires movie contentCategory')
    if kind == 'audiobook' and not (meta.get('mediaType') == 'audio' or meta['category'] == 'audiobook' or meta['id'].endswith('_audiobook')):
        raise ValueError('Audiobook requires audio metadata')
    if path.endswith('.py'):
        ast.parse(text, filename=path)
    return meta


def validate_candidate(base):
    if not re.fullmatch('[0-9a-f]{40}', base):
        raise ValueError('Expected full base SHA')
    parents = git('show', '-s', '--format=%P', 'HEAD').split()
    if parents != [base]:
        raise ValueError('main changed since App snapshot; refresh and resubmit')
    statuses = git('diff', '--no-renames', '--name-status', base, 'HEAD', '-z').split('\0')
    # --name-status -z emits alternating status/path, preserving Unicode and tabs.
    statuses = [x for x in statuses if x]
    if not statuses or len(statuses) % 2 or len(statuses) > 40:
        raise ValueError('Expected 1 to 20 source file changes')
    existing = json.loads(git('show', f'{base}:metadata/catalog.json'))['sources']
    ids = {row['id'] for row in existing}
    known_paths = {p for row in existing for p in [row['path'], *row.get('aliases', [])]}
    changes = dict(zip(statuses[1::2], statuses[::2]))
    for path, status in changes.items():
        if not valid_path(path) or status not in ('A', 'D'):
            raise ValueError('App publication only accepts added/deleted source files')
        if status == 'D':
            if path not in known_paths:
                raise ValueError('Cannot delete a file outside the source catalog')
        else:
            meta = validate_script(path, (ROOT / path).read_bytes())
            if meta['id'] in ids:
                raise ValueError('Duplicate source ID')
            ids.add(meta['id'])
            if path.endswith('.js'):
                subprocess.run(['node', '--check', str(ROOT / path)], check=True, capture_output=True)
    for row in existing:
        paths = {row['path'], *row.get('aliases', [])}
        removed = {p for p, status in changes.items() if status == 'D'}
        if paths & removed and not paths <= removed:
            raise ValueError('Delete all aliases of a source together')
    return changes


def update_ratings(changes):
    path = ROOT / 'metadata/content-ratings.json'
    ratings = json.loads(path.read_text(encoding='utf-8'))
    updated = False
    for name, status in changes.items():
        if status != 'A':
            continue
        meta = validate_script(name, (ROOT / name).read_bytes())
        if meta['contentCategory'] == 'adult':
            ratings['sources'][meta['id']] = {
                'rating': '18+', 'evidence': 'App-published source declares contentCategory adult',
            }
            updated = True
    if updated:
        path.write_text(json.dumps(ratings, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    options = parser.parse_args()
    changes = validate_candidate(options.base)
    update_ratings(changes)
    print(json.dumps(changes, ensure_ascii=True))
