const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
const lines = file => read(file).split(/\r?\n/).filter(line => line.startsWith('https://'));
const localPath = url => decodeURIComponent(new URL(url).pathname.split('/main/')[1]);
const catalog = JSON.parse(read('catalog.json'));
const metadata = file => JSON.parse(read(file).match(/\/\/ LumeSource: (\{[^\n]+\})/)[1]);

test('retired novel adapters and manifests stay absent', () => {
  for (const file of ['novel', 'novels', '小说订阅.js']) assert.equal(fs.existsSync(path.join(root, file)), false);
  assert.equal(JSON.parse(read('all')).sections.novel, undefined);
});

test('catalog covers every adapter exactly once with matching metadata and ratings', () => {
  const files = ['comic','photo','movie','video','audiobook'].flatMap(folder =>
    fs.readdirSync(path.join(root, folder)).filter(name => name.endsWith('.js'))
      .map(name => folder + '/' + name).filter(file => /^\/\/ LumeSource:/m.test(read(file))));
  const ids = files.map(file => metadata(file).id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs must be deleted, not just hidden from the manifest');
  assert.deepEqual(new Set(catalog.sources.map(row => row.id)), new Set(ids));
  const ratings = JSON.parse(read('content-ratings.json')).sources;
  for (const row of catalog.sources) {
    const meta = metadata(row.path);
    assert.equal(meta.id, row.id);
    assert.equal(meta.version, row.version);
    assert.equal(meta.name, row.name);
    assert.equal(meta.category, row.appSection);
    assert.equal(row.rating, ratings[row.id]?.rating || 'unknown');
    assert.deepEqual(row.aliases, []);
  }
});

test('five classifications are disjoint and match the generated inventory', () => {
  const urls = [];
  for (const kind of ['comic','photo','movie','video','audiobook']) {
    const actual = lines('subscriptions/' + kind + '.txt');
    const expected = catalog.sources.filter(row => row.kind === kind).map(row => row.url);
    assert.deepEqual(actual, expected);
    assert.equal(actual.length, catalog.counts[kind]);
    actual.forEach(url => assert.ok(fs.statSync(path.join(root, localPath(url))).isFile()));
    urls.push(...actual);
  }
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.length, catalog.sources.length);
});

test('total subscription routes all IDs once to the proper APP section', () => {
  const total = JSON.parse(read('all'));
  assert.equal(total.format, 'lume.total-subscription');
  const ids = [];
  for (const [section, manifests] of Object.entries(total.sections)) {
    for (const manifest of manifests) {
      for (const url of lines(localPath(manifest))) {
        const meta = metadata(localPath(url));
        assert.equal(meta.category, section);
        ids.push(meta.id);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set(catalog.sources.map(row => row.id)));
});

test('old manifests remain complete aliases while deleted scripts are absent', () => {
  for (const [canonical, aliases] of [
    ['comics', ['漫画订阅.js','comic/sources.js','comic/sources.txt']],
    ['videos', ['视频订阅.js','video/sources.js','video/sources.txt']],
  ]) {
    for (const alias of aliases) assert.deepEqual(lines(alias), lines(canonical));
  }
  const combined = [...lines('comics'), ...lines('videos')];
  assert.equal(new Set(combined).size, catalog.sources.length);
  for (const item of JSON.parse(read('docs/removed-duplicates.json')).entries) {
    assert.equal(fs.existsSync(path.join(root, item.removed)), false);
    assert.equal(metadata(item.retained).id, item.id);
  }
});

test('standalone category and CDN aliases match their complete raw manifests', () => {
  for (const [alias, kind] of [['movies','movie'],['photos','photo'],['audiobooks','audiobook']]) {
    assert.deepEqual(lines(alias), lines('subscriptions/' + kind + '.txt'));
  }
  for (const file of ['videos-hd','videos-18plus']) {
    const raw = lines(file).map(localPath);
    for (const relative of raw) assert.ok(fs.statSync(path.join(root, relative)).isFile());
    const cdn = lines(file + '-cdn').map(url => decodeURIComponent(new URL(url).pathname.split('@main/')[1]));
    assert.deepEqual(cdn, raw);
  }
});
