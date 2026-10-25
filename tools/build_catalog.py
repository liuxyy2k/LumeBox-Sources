"""Build deterministic source classifications and backwards-compatible manifests.

Run: python tools/build_catalog.py [--check]
Only reads source headers; never executes adapters or requests media.
"""
import argparse
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = 'https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/'
KINDS = {'comic': '漫画', 'photo': '美图', 'movie': '影视',
         'video': '视频与直播', 'audiobook': '有声小说'}
MOVIES = {'luttt_video', 'gztv5_video', 'jpyy2_video', 'ysxq-boju',
          'a123tv', 'fdzys', 'flixflop', 'duanju2', 'olehdtv', 'huavod'}
# These aliases already share an ID. Keep the original canonical entries rather
# than letting directory order silently replace them with a different adapter.
PREFERRED = {'hstv_video': 'video/好色TV.js',
             'jiuse91_video': 'video/九色91Porny.js'}


def url(path):
    return RAW + path


def read_sources():
    found = {}
    for folder in KINDS:
        for path in sorted((ROOT / folder).glob('*.js')):
            text = path.read_text(encoding='utf-8-sig')
            match = re.search(r'^\s*//\s*@?LumeSource\s*[:=]\s*(\{[^\n]+\})', text, re.M)
            if not match:
                continue  # Legacy manifests with a .js suffix are not adapters.
            meta = json.loads(match[1])
            relative = path.relative_to(ROOT).as_posix()
            found.setdefault(meta['id'], []).append((relative, meta))
    ratings = json.loads((ROOT / 'content-ratings.json').read_text(encoding='utf-8'))['sources']
    rows = []
    for sid, candidates in found.items():
        preferred = PREFERRED.get(sid)
        canonical = next((pair for pair in candidates if pair[0] == preferred), None)
        if canonical is None:
            # Prefer already-canonical photo/movie/audiobook locations over
            # byte-identical copies left under comic/video for old URLs.
            canonical = next((pair for pair in candidates
                              if pair[0].split('/')[0] in ('photo', 'movie', 'audiobook')),
                             candidates[0])
        path, meta = canonical
        if sid in MOVIES:
            kind = 'movie'
        elif meta.get('mediaType') == 'audio' or sid.endswith('_audiobook'):
            kind = 'audiobook'
        elif path.startswith('photo/'):
            kind = 'photo'
        else:
            kind = 'comic' if meta.get('category') == 'comic' else 'video'
        rows.append({
            'id': sid, 'name': meta['name'], 'version': meta['version'],
            'kind': kind, 'appSection': 'comic' if kind in ('comic', 'photo') else 'video',
            'path': path, 'url': url(path),
            'aliases': [p for p, _ in candidates if p != path],
            'rating': ratings.get(sid, {}).get('rating', 'unknown'),
            'iconDeclared': bool(meta.get('icon') or meta.get('iconUrl')),
        })
    return sorted(rows, key=lambda row: (list(KINDS).index(row['kind']), row['name'].casefold(), row['id']))


def manifest(rows, heading):
    return '# ' + heading + '\n# 自动生成；修改脚本后运行 python tools/build_catalog.py\n' + ''.join(
        row['url'] + '\n' for row in rows)


def build():
    rows = read_sources()
    groups = {kind: [row for row in rows if row['kind'] == kind] for kind in KINDS}
    out = {}
    for kind, label in KINDS.items():
        out['subscriptions/' + kind + '.txt'] = manifest(groups[kind], label)
    comic = groups['comic'] + groups['photo']
    video = groups['movie'] + groups['video'] + groups['audiobook']
    out['comics'] = manifest(comic, '漫画与美图（兼容综合入口）')
    out['videos'] = manifest(video, '影视、视频与有声（兼容综合入口）')
    out['漫画订阅.js'] = out['comics']
    out['视频订阅.js'] = out['videos']
    for filename, kind in [('movies', 'movie'), ('photos', 'photo'), ('audiobooks', 'audiobook')]:
        out[filename] = manifest(groups[kind], KINDS[kind])
    for folder, members in [('comic', comic), ('video', video)]:
        for name in ('sources.js', 'sources.txt'):
            out[folder + '/' + name] = manifest(members, '旧地址兼容 · ' + folder)
    out['all'] = json.dumps({
        'format': 'lume.total-subscription', 'version': 1,
        'sections': {
            'comic': [url('subscriptions/' + kind + '.txt') for kind in ('comic', 'photo')],
            'video': [url('subscriptions/' + kind + '.txt') for kind in ('movie', 'video', 'audiobook')],
        },
    }, ensure_ascii=False, indent=2) + '\n'
    out['catalog.json'] = json.dumps({
        'format': 'lume.source-catalog', 'version': 1,
        'counts': {kind: len(members) for kind, members in groups.items()},
        'verification': 'Metadata inventory only; not a live cover or playback availability report.',
        'sources': rows,
    }, ensure_ascii=False, indent=2) + '\n'
    # Existing CDN aliases must represent exactly the corresponding raw list.
    removed_file = ROOT / 'docs/removed-duplicates.json'
    removed_entries = json.loads(removed_file.read_text(encoding='utf-8'))['entries'] if removed_file.exists() else []
    for name in ('videos-hd', 'videos-18plus'):
        legacy = (ROOT / name).read_text(encoding='utf-8')
        for entry in removed_entries:
            legacy = legacy.replace(url(entry['removed']), url(entry['retained']))
        out[name] = legacy
        lines = legacy.splitlines()
        entries = [line.strip() for line in lines if line.startswith(RAW)]
        out[name + '-cdn'] = '# 兼容 CDN 入口；可能有缓存延迟\n' + ''.join(
            'https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/' + line[len(RAW):] + '\n'
            for line in entries)
    out['README.md'] = '''# LumeBox 源仓库

在 APP 的“总订阅导入导出”中添加[总订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all)，一次导入全部分类；已有用户可用“一键同步全部订阅”更新。

## 分类入口

| 分类 | 独立源数 | 导入入口 | APP 所属板块 |
| --- | ---: | --- | --- |
''' + ''.join(f"| {KINDS[kind]} | {len(groups[kind])} | [订阅]({url('subscriptions/' + kind + '.txt')}) | {'漫画' if kind in ('comic', 'photo') else '视频'} |\n" for kind in KINDS) + f'''
共 **{len(rows)} 个独立源**，按 ID 去重。每个源在总订阅中只出现一次，兼容副本与同 ID 重复脚本已删除。旧订阅清单入口保留，被删除文件的旧单独地址不再可用。

18+ 是内容分级，与上述内容类型分别管理；未分级不代表全年龄适用。图标、封面和播放实时可用性没有经过全站逐项验证，静态检查通过不代表站点可用。

## 查看与维护

- [完整源目录](docs/源目录.md)：名称、版本、分类、分级及兼容副本。
- [旧地址兼容表](docs/源分类与兼容地址.md)：已有订阅可以继续使用。
- [维护说明](docs/README.md)：生成清单与离线验证命令。
- `catalog.json` 是维护用索引，不是 APP 导入地址；`content-ratings.json` 保存分级依据。
- `comic/`、`photo/`、`movie/`、`video/`、`audiobook/` 保存脚本。实际分类以目录索引为准；影视和有声中仍有历史脚本位于 `video/`，分类清单已经分别归类。
- `tools/` 保存生成与测试工具；`snapshots/` 保存离线回归样本；`licenses/` 保存授权材料。

## 兼容综合入口

[漫画与美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics) · [影视、视频与有声](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)。新用户使用上方分类入口即可，无需叠加导入扩展清单。
'''
    directory = '# 源目录\n\n由脚本首行元数据生成，同一 ID 只列一次。[返回入口](../README.md)。\n\n分级“未分级”表示尚无明确结论，不表示全年龄；此目录不声明实时封面或播放可用。\n'
    for kind, label in KINDS.items():
        directory += f'\n## {label}（{len(groups[kind])}）\n\n| 源 | 版本 | 分级 | 兼容副本数 |\n| --- | --- | --- | ---: |\n'
        for row in groups[kind]:
            directory += f"| [{row['name']}](../{urllib.parse.quote(row['path'])}) | {row['version']} | {'18+' if row['rating'] == '18+' else '未分级'} | {len(row['aliases'])} |\n"
    removed_path = ROOT / 'docs/removed-duplicates.json'
    removed = json.loads(removed_path.read_text(encoding='utf-8'))['entries'] if removed_path.exists() else []
    directory += '\n## 已删除的重复脚本\n\n仅删除下列重复文件；同一 ID 的保留版本继续提供。原单独文件地址不再可用。\n\n| ID | 保留版本 | 已删除文件 |\n| --- | --- | --- |\n'
    for entry in removed:
        directory += f"| `{entry['id']}` | `{entry['retained']}` | `{entry['removed']}` |\n"
    out['docs/源目录.md'] = directory
    out['docs/源分类与兼容地址.md'] = '''# 分类与旧地址兼容

总订阅 `all` 现在只展开 `subscriptions/` 下的五类清单，各源按 ID 唯一收录。APP 仍按漫画、视频两个板块承接；美图归漫画，有声归视频。

| 旧地址 | 兼容行为 |
| --- | --- |
| `comics`、`漫画订阅.js`、`comic/sources.js`、`comic/sources.txt` | 漫画与美图综合入口 |
| `videos`、`视频订阅.js`、`video/sources.js`、`video/sources.txt` | 影视、视频、听书综合入口 |
| `movies` | 完整影视分类 |
| `photos` | 完整美图分类 |
| `audiobooks` | 完整有声分类 |
| `videos-hd`、`videos-18plus` 及其 `-cdn` 版本 | 保留原有子集，不再与总订阅重复展开 |

已删除 6 个兼容副本和同 ID 重复脚本，原单独文件地址停止使用，具体路径与保留版本见[源目录](源目录.md)。其余脚本和旧清单入口保留；没有修改源脚本的账号、播放地址或内容解析。

旧综合清单与分类清单可以导入同一个 APP；为减少重复下载，建议只保存总订阅，或只保存需要的分类。删除订阅前先确认 APP 的保留源选项，避免误删个人收藏。

纯文字小说源此前已移除；有声小说是音频，继续保留。详情见[源目录](源目录.md)。
'''
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = build()
    changed = []
    for name, content in outputs.items():
        path = ROOT / name
        if not path.exists() or path.read_text(encoding='utf-8') != content:
            changed.append(name)
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
    if args.check and changed:
        raise SystemExit('Generated files differ: ' + ', '.join(changed))
    print(f"{'Checked' if args.check else 'Generated'} {len(outputs)} catalog files; changed {len(changed)}")
