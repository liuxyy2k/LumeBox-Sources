/* eslint-env node */

// 2026-10-24 新增三个中文 KVS 系视频源的快照回归：废柴视频（fcw.xxx）、
// 久久热（99jj38.com）、85PO（85po.com）。
// 快照都是写脚本时的真实响应。85PO 对 Node 的 TLS 指纹回 403（curl / Python 都是 200），
// 所以它的解析用这里保存的真站 HTML 验证，播放地址另行用 curl 实测过 Range 206。

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

// ------------------------------------------------------------------ 废柴视频（KVS）

test('废柴视频: 列表 24 条、/page/ 路径式翻页、分类取标签导航', async () => {
  const source = stub(loadSource('video/Fcw.js'), [
    { match: '/latest-updates/2/', body: snapshot('fcw_list.html') },
    { match: '/latest-updates/1/', body: snapshot('fcw_list.html') },
    { match: 'fcw.xxx/', body: snapshot('fcw_home.html') },
  ]);
  const page = await source.list({ categoryId: '/latest-updates/', page: 1 });
  assert.equal(page.items.length, 24);
  assert.ok(/^\/videos\/\d+\/[^/]+\/$/.test(page.items[0].id), page.items[0].id);
  assert.ok(/^https:\/\/fcw\.xxx\/contents\//.test(page.items[0].cover), page.items[0].cover);
  assert.ok(page.items[0].title.length > 2, page.items[0].title);
  assert.equal(page.hasMore, true);
  assert.ok(source.__urls[0].endsWith('/latest-updates/1/'), source.__urls[0]);

  await source.list({ categoryId: '/latest-updates/', page: 2 });
  assert.ok(source.__urls[1].endsWith('/latest-updates/2/'), source.__urls[1]);

  const categories = await source.categories();
  assert.equal(categories.slice(0, 3).map((c) => c.id).join(','), '/latest-updates/,/top-rated/,/most-viewed/');
  assert.ok(categories.some((c) => c.id.indexOf('/tags/') === 0), JSON.stringify(categories.slice(0, 5)));
  assert.ok(categories.length > 30, String(categories.length));
});

test('废柴视频: 搜索如实报「需要登录」，播放只给标清（HD 是 VIP）', async () => {
  const source = stub(loadSource('video/Fcw.js'), [
    { match: '/videos/143202/1346/', body: snapshot('fcw_video.html') },
  ]);
  await assert.rejects(() => source.list({ keyword: 'asian', page: 1 }), /需要登录/);

  const detail = await source.detail({ id: '/videos/143202/1346/' });
  assert.ok(detail.title.indexOf('美少妇的哀羞') >= 0, detail.title);

  const content = await source.content({ id: '/videos/143202/1346/', chapterId: 'play' });
  assert.equal(content.kind, 'video');
  assert.ok(/^https:\/\/fcw\.xxx\/get_file\/1\/[0-9a-f]+\/143000\/143202\/143202\.mp4\/$/.test(content.url), content.url);
  assert.equal(content.qualities.length, 1);
  assert.ok(content.qualities[0].label.indexOf('标清') >= 0, content.qualities[0].label);
});

// ------------------------------------------------------------------ 久久热（KVS）

test('久久热: 列表 24 条、分页与 9 个分类（去掉跟随的数量）', async () => {
  const source = stub(loadSource('video/99jj38.js'), [
    { match: '/latest-updates/', body: snapshot('jj38_list.html') },
    { match: '99jj38.com/', body: snapshot('jj38_home.html') },
  ]);
  const page = await source.list({ categoryId: '/latest-updates/', page: 1 });
  assert.equal(page.items.length, 24);
  assert.ok(/^\/videos\/\d+\/[^/]+\/$/.test(page.items[0].id), page.items[0].id);
  assert.equal(page.hasMore, true);

  const categories = await source.categories();
  const cats = categories.filter((c) => c.id.indexOf('/categories/') === 0);
  assert.ok(cats.length >= 5, JSON.stringify(cats));
  assert.ok(!cats.some((c) => /\d{2,}/.test(c.title)), '分类名不应带数量：' + JSON.stringify(cats));
});

test('久久热: 播放地址是站点自己的 get_file mp4', async () => {
  const source = stub(loadSource('video/99jj38.js'), [
    { match: '/videos/227693/3p882/', body: snapshot('jj38_video.html') },
  ]);
  const detail = await source.detail({ id: '/videos/227693/3p882/' });
  assert.ok(detail.title.indexOf('3p全程记录') >= 0, detail.title);
  const content = await source.content({ id: '/videos/227693/3p882/', chapterId: 'play' });
  assert.ok(/^https:\/\/www\.99jj38\.com\/get_file\/3\/[0-9a-f]+\/227000\/227693\/227693\.mp4\/$/.test(content.url), content.url);
});

// ------------------------------------------------------------------ 85PO

test('85PO: 分类列表 24 条（div.item 模板）与搜索可用', async () => {
  const source = stub(loadSource('video/85PO.js'), [
    { match: '/search/asian/', body: snapshot('p85_list.html') },
    { match: '/latest-updates/1/', body: snapshot('p85_list.html') },
    { match: '85po.com/', body: snapshot('p85_home.html') },
  ]);
  const page = await source.list({ categoryId: '/latest-updates/', page: 1 });
  assert.equal(page.items.length, 24);
  assert.ok(/^\/v\/[^/]+\.html$/.test(page.items[0].id), page.items[0].id);
  assert.ok(/^https:\/\/www\.85po\.com\/contents\//.test(page.items[0].cover), page.items[0].cover);
  assert.ok(source.__urls[0].endsWith('/latest-updates/1/'), source.__urls[0]);

  const search = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(search.items.length, 24);
  assert.ok(source.__urls[1].indexOf('/search/asian/') >= 0, source.__urls[1]);

  const categories = await source.categories();
  assert.ok(categories.some((c) => c.id.indexOf('/tags/') === 0), JSON.stringify(categories.slice(0, 5)));
});

test('85PO: 播放给 480p + 720p 两条（hd.php 会员跳转不混进来）', async () => {
  const source = stub(loadSource('video/85PO.js'), [
    { match: '/v/36847.html', body: snapshot('p85_video.html') },
  ]);
  const detail = await source.detail({ id: '/v/36847.html' });
  assert.ok(detail.title.indexOf('口交') >= 0 || detail.title.length > 3, detail.title);
  const content = await source.content({ id: '/v/36847.html', chapterId: 'play' });
  assert.equal(content.kind, 'video');
  assert.equal(content.qualities.length, 2);
  assert.ok(content.qualities.every((q) => q.url.indexOf('/get_file/') > 0), JSON.stringify(content.qualities.map((q) => q.url)));
  assert.ok(content.qualities.every((q) => q.url.indexOf('/hd.php') < 0));
  assert.ok(/v-acctoken=/.test(content.url), content.url);
});

test('三个 KVS 源都满足源契约', async () => {
  for (const file of ['video/Fcw.js', 'video/99jj38.js', 'video/85PO.js']) {
    const source = loadSource(file);
    for (const method of ['home', 'categories', 'list', 'detail', 'chapters', 'content']) {
      assert.equal(typeof source[method], 'function', file + ':' + method);
    }
    assert.equal(source.category, 'video');
    assert.ok(/^[a-z0-9_-]+_video$/.test(source.id), source.id);
  }
});
