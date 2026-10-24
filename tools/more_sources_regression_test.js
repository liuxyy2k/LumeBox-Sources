/* eslint-env node */

// 2026-10-23 新增三个视频源的快照回归：VoyeurHit（JSON API）、YouJizz、RedTube。
// 快照都是写脚本时的真实响应（视频站本机直连不通，验证走本机代理出口）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function snapshot(name) {
  return fs.readFileSync(path.join(ROOT, 'snapshots', name), 'utf8');
}

function loadSource(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const context = {};
  vm.runInNewContext(source, context, { filename: file, timeout: 5000 });
  return context.LumeSource;
}

function stub(source, routes) {
  const seen = [];
  source.__urls = seen;
  source.http = {
    get: async function (url) {
      seen.push(url);
      for (const route of routes) {
        const hit = typeof route.match === 'string' ? url.indexOf(route.match) >= 0 : route.match.test(url);
        if (hit) return { status: 200, body: route.body };
      }
      throw new Error('未覆盖的地址: ' + url);
    },
  };
  return source;
}

// ------------------------------------------------------------------ VoyeurHit（JSON API）

test('VoyeurHit: 分类来自 categories 接口，五个排序入口在最前', async () => {
  const source = stub(loadSource('video/VoyeurHit.js'), [
    { match: '/api/json/categories/', body: snapshot('voyeurhit_categories.json') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.slice(0, 5).map((c) => c.id).join(','),
    '/latest-updates,/most-popular,/most-viewed,/top-rated,/longest');
  assert.ok(categories.length >= 70, String(categories.length));
  assert.ok(categories.some((c) => c.id === '/category/amateur' && c.title === 'Amateur'),
    JSON.stringify(categories.slice(5, 10)));
});

test('VoyeurHit: 列表 60 条、pages 判续页，翻页把页号放进 params', async () => {
  const source = stub(loadSource('video/VoyeurHit.js'), [
    { match: '/api/json/videos2/', body: snapshot('voyeurhit_list.json') },
  ]);
  const page = await source.list({ categoryId: '/latest-updates', page: 1 });
  assert.equal(page.items.length, 60);
  assert.equal(page.items[0].id, '363975');
  assert.equal(page.items[0].title, 'Ipcam Russian Couple');
  assert.ok(/^https:\/\/tn\.voyeurhit\.com\//.test(page.items[0].cover), page.items[0].cover);
  assert.equal(page.hasMore, true);
  assert.ok(source.__urls[0].indexOf('86400/str/latest-updates/60/..1.all...json') >= 0, source.__urls[0]);

  await source.list({ categoryId: '/latest-updates', page: 2 });
  assert.ok(source.__urls[1].indexOf('/..2.all...json') >= 0, source.__urls[1]);

  await source.list({ categoryId: '/most-popular', page: 1 });
  assert.ok(source.__urls[2].indexOf('14400/str/most-popular/60/..1.all..day.json') >= 0, source.__urls[2]);

  await source.list({ categoryId: '/category/amateur', page: 1 });
  assert.ok(source.__urls[3].indexOf('categories.amateur.1.all...json') >= 0, source.__urls[3]);
});

test('VoyeurHit: 搜索把关键词交给 &s=，详情读单视频接口', async () => {
  const source = stub(loadSource('video/VoyeurHit.js'), [
    { match: '/api/videos2.php', body: snapshot('voyeurhit_search.json') },
    { match: '/api/json/video/86400/0/363/363975.json', body: snapshot('voyeurhit_video.json') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(page.items.length, 60);
  assert.equal(page.items[0].id, '219591');
  assert.ok(source.__urls[0].indexOf('&s=asian') >= 0, source.__urls[0]);

  const detail = await source.detail({ id: '363975' });
  assert.equal(detail.title, 'Ipcam Russian Couple');
  assert.ok(/preview\.jpg$/.test(detail.cover), detail.cover);
  assert.ok(detail.subtitle.indexOf('3:37') >= 0, detail.subtitle);
});

test('VoyeurHit: 播放地址由西里尔同形 base64 还原成 /get_file/…_hq.mp4', async () => {
  const source = stub(loadSource('video/VoyeurHit.js'), [
    { match: '/api/videofile.php', body: snapshot('voyeurhit_file.json') },
  ]);
  const content = await source.content({ id: '363975', chapterId: 'play' });
  assert.equal(content.kind, 'video');
  assert.ok(/^https:\/\/voyeurhit\.com\/get_file\/1\/[0-9a-f]{40,}\/363000\/363975\/363975_hq\.mp4\/\?d=\d+&br=\d+&ti=\d+$/.test(content.url), content.url);
  assert.equal(content.qualities.length, 1);
  assert.equal(content.qualities[0].label, 'HQ');
});

// ------------------------------------------------------------------ YouJizz

test('YouJizz: 分类=首页导航里的分类 + 五个排序入口', async () => {
  const source = stub(loadSource('video/YouJizz.js'), [
    { match: 'youjizz.com/', body: snapshot('youjizz_home.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.slice(0, 5).map((c) => c.id).join(','),
    '/most-popular/1.html,/newest-clips/1.html,/top-rated/1.html,/top-rated-month/1.html,/trending/1.html');
  assert.ok(categories.some((c) => c.id === '/categories/asian-1.html' && c.title === 'asian'),
    JSON.stringify(categories.slice(5, 10)));
  assert.ok(categories.length > 20, String(categories.length));
});

test('YouJizz: 搜索可解析、分页 -N.html，详情与播放地址都解出', async () => {
  const source = stub(loadSource('video/YouJizz.js'), [
    { match: '/search/asian-1.html', body: snapshot('youjizz_search.html') },
    { match: '/videos/sharing-the-bed-with-thick-step-sister-on-vacation', body: snapshot('youjizz_video.html') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.ok(page.items.length >= 20, String(page.items.length));
  assert.ok(/^\/videos\/[^/]+\.html$/.test(page.items[0].id), page.items[0].id);
  assert.ok(/^https:\/\/cdne-pics\.youjizz\.com\//.test(page.items[0].cover), page.items[0].cover);
  assert.equal(page.hasMore, true);

  const id = '/videos/sharing-the-bed-with-thick-step-sister-on-vacation-~-cassie2sassy-~-household-fantasy-~-scott-stark-127192361.html';
  const detail = await source.detail({ id: id });
  assert.ok(detail.title.indexOf('Sharing The Bed With Thick Step Sister') === 0, detail.title);

  const content = await source.content({ id: id, chapterId: 'play' });
  assert.equal(content.kind, 'video');
  const labels = content.qualities.map((q) => q.label);
  assert.ok(labels.some((l) => /MP4$/.test(l)), labels.join(' | '));
  assert.ok(labels.some((l) => /HLS$/.test(l)), labels.join(' | '));
  assert.ok(!labels.some((l) => /^\?p/.test(l)), '没有 quality 的空档位应被剔除：' + labels.join(' | '));
  assert.ok(/1080p/.test(labels.join(' ')), labels.join(' | '));
  assert.ok(content.url.indexOf('https://') === 0, content.url);
});

// ------------------------------------------------------------------ RedTube

test('RedTube: 分类读分类页导航（77 个），不含纯数字标题', async () => {
  const source = stub(loadSource('video/RedTube.js'), [
    { match: '/redtube/asian', body: snapshot('redtube_search.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.slice(0, 4).map((c) => c.id).join(','), '/hot,/new,/recommended,/top');
  assert.ok(!categories.some((c) => /^\d+$/.test(c.title)), JSON.stringify(categories.filter((c) => /^\d+$/.test(c.title))));
});

test('RedTube: 搜索 36 条、?page= 翻页，播放要两跳（media JSON → 签名地址）', async () => {
  const source = stub(loadSource('video/RedTube.js'), [
    { match: '/media/hls', body: snapshot('redtube_media_hls.json') },
    { match: '/media/mp4', body: snapshot('redtube_media_mp4.json') },
    { match: 'search=asian', body: snapshot('redtube_search.html') },
    { match: '/190940221', body: snapshot('redtube_video.html') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(page.items.length, 36);
  assert.equal(page.items[0].id, '/237491921');
  assert.equal(page.items[0].title, 'Japanese MILF cheating wife CREAMPIED');
  assert.equal(page.hasMore, true);
  assert.ok(source.__urls[0].indexOf('search=asian') >= 0, source.__urls[0]);

  await source.list({ keyword: 'asian', page: 2 });
  assert.ok(source.__urls[1].indexOf('page=2') >= 0, source.__urls[1]);

  const detail = await source.detail({ id: '/190940221' });
  assert.equal(detail.title, 'The guys fucked their wife in a circle in front of her husband');

  const content = await source.content({ id: '/190940221', chapterId: 'play' });
  assert.equal(content.kind, 'video');
  const labels = content.qualities.map((q) => q.label);
  assert.ok(labels.length >= 6, labels.join(' | '));
  assert.ok(labels.some((l) => l.indexOf('HLS') >= 0), labels.join(' | '));
  assert.ok(labels.some((l) => l.indexOf('MP4') >= 0), labels.join(' | '));
  assert.ok(/^https:\/\/[^/]*rdtcdn\.com\//.test(content.url), content.url);
});

test('三个新视频源都满足源契约', async () => {
  for (const file of ['video/VoyeurHit.js', 'video/YouJizz.js', 'video/RedTube.js']) {
    const source = loadSource(file);
    for (const method of ['home', 'categories', 'list', 'detail', 'chapters', 'content']) {
      assert.equal(typeof source[method], 'function', file + ':' + method);
    }
    assert.equal(source.category, 'video');
    assert.ok(/^[a-z0-9_-]+_video$/.test(source.id), source.id);
  }
});
