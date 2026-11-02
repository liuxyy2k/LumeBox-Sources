"""Compare raw/main and jsDelivr bytes with the published Git commit, including deletes."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

from purge_cdn_cache import ROOT, changed_paths, published_paths


def matches(url, expected, opener=urllib.request.urlopen):
    try:
        with opener(url, timeout=25) as response:
            if expected is None:
                return False
            return hashlib.sha256(response.read()).digest() == hashlib.sha256(expected).digest()
    except urllib.error.HTTPError as error:
        return expected is None and error.code == 404
    except OSError:
        return False


def verify(repository, before, after, rounds=8):
    aliases = json.loads((ROOT / 'metadata/legacy-paths.json').read_text(encoding='utf-8'))
    paths = published_paths(changed_paths(before, after), aliases)
    pending = []
    for path in paths:
        # Only physical changed files: legacy aliases are not hosted files.
        if path in aliases:
            continue
        blob = subprocess.run(['git', 'show', f'{after}:{path}'], cwd=ROOT, capture_output=True)
        expected = blob.stdout if blob.returncode == 0 else None
        escaped = urllib.parse.quote(path, safe='/')
        pending.extend((url, expected) for url in (
            f'https://raw.githubusercontent.com/{repository}/main/{escaped}',
            f'https://cdn.jsdelivr.net/gh/{repository}@main/{escaped}',
        ))
    for attempt in range(rounds):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda item: matches(*item), pending))
        pending = [item for item, ok in zip(pending, results) if not ok]
        if not pending:
            print('GitHub raw and domestic CDN bytes/deletions verified')
            return
        if attempt + 1 < rounds:
            for url, _ in pending:
                if 'cdn.jsdelivr.net' in url:
                    try:
                        with urllib.request.urlopen(url.replace('cdn.jsdelivr.net', 'purge.jsdelivr.net'), timeout=15):
                            pass
                    except OSError:
                        pass
            time.sleep(15)
    raise RuntimeError(f'{len(pending)} publication URLs not current after verification')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--before', required=True)
    parser.add_argument('--after', required=True)
    args = parser.parse_args()
    verify(args.repository, args.before, args.after)
