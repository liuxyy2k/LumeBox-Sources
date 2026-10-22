/* eslint-env node */

// 2026-10-22 新增四个源的快照回归：色漫天堂（comic）、XVideos / XNXX / xHamster（video）。
//
// 快照 = 写脚本时站点真实响应（snapshots/ 下同名文件），站点改版先在这里红，
// 而不是等真机上「列表空了」才发现。四个源写脚本时都逐条对真站核过；
// 三个视频站本机直连不通，验证走本机代理出口。

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

/// 按地址分发的响应替身；记录每次请求，供断言翻页 / 取详情的地址。
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

// ------------------------------------------------------------------ 色漫天堂（smtt6.com）

test('色漫天堂: 首页五个板块，各 12 条且带「更多」入口', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: 'smtt6.com/', body: snapshot('smtt6_home.html') },
  ]);
  const boards = await source.home();
  assert.equal(boards.length, 5);
  assert.equal(boards.map((b) => b.title).join('|'), '热门漫画|最新更新|站长推荐|新上架漫画|已完结漫画');
  assert.equal(boards[0].items.length, 12);
  assert.equal(boards[0].moreUrl, '/re-men-man-hua');
  assert.equal(boards[4].moreUrl, '/man-hua-lei-bie/all/ob/time/st/completed');
  assert.equal(boards[0].items[0].id, '/man-hua-yue-du/12347484.html');
});

test('色漫天堂: 分类列表 24 条、按 /page/N 翻页', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/man-hua-lei-bie/all/ob/time/st/all', body: snapshot('smtt6_list.html') },
  ]);
  const page = await source.list({ categoryId: '/man-hua-lei-bie/all', page: 1 });
  assert.equal(page.items.length, 24);
  assert.equal(page.items[0].id, '/man-hua-yue-du/12348754.html');
  assert.ok(/^https:\/\/(?:p3p|p4p|p6)\.18rouman\.vip\//.test(page.items[0].cover), page.items[0].cover);
  assert.equal(page.hasMore, true);
  assert.ok(source.__urls[0].endsWith('/man-hua-lei-bie/all/ob/time/st/all'), source.__urls[0]);

  await source.list({ categoryId: '/man-hua-lei-bie/all', page: 2 });
  assert.ok(source.__urls[1].endsWith('/man-hua-lei-bie/all/ob/time/st/all/page/2'), source.__urls[1]);
});

test('色漫天堂: 筛选把排序 / 状态拼进站点的路径式筛选条', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/man-hua-lei-bie/', body: snapshot('smtt6_list.html') },
  ]);
  await source.list({ categoryId: '/man-hua-lei-bie/韩漫', page: 1, filters: { order: 'hits', status: 'completed' } });
  assert.ok(source.__urls[0].endsWith('/man-hua-lei-bie/韩漫/ob/hits/st/completed'), source.__urls[0]);
  const filters = await source.filters();
  assert.equal(filters.groups.map((g) => g.id).join(','), 'type,order,status');
  assert.equal(filters.groups[2].options.length, 3);
});

test('色漫天堂: 搜索走 /man-hua-sou-suo/，共 24 条且有下一页', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/man-hua-sou-suo/', body: snapshot('smtt6_search.html') },
  ]);
  const page = await source.list({ keyword: '秘密', page: 1 });
  assert.equal(page.items.length, 24);
  assert.equal(page.items[0].id, '/man-hua-yue-du/12348661.html');
  assert.equal(page.hasMore, true);
  assert.ok(source.__urls[0].indexOf('/man-hua-sou-suo/' + encodeURIComponent('秘密')) >= 0, source.__urls[0]);
});

test('色漫天堂: 详情取标题 / 封面 / 状态 / TAG / 作者 / 简介', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/man-hua-yue-du/12347484.html', body: snapshot('smtt6_detail.html') },
  ]);
  const detail = await source.detail({ id: '/man-hua-yue-du/12347484.html' });
  assert.equal(detail.title, '与前妻同居');
  assert.ok(/^https:\/\/p4p\.18rouman\.vip\//.test(detail.cover), detail.cover);
  assert.ok(detail.subtitle.indexOf('已完结') >= 0, detail.subtitle);
  assert.ok(detail.subtitle.indexOf('韩漫') >= 0, detail.subtitle);
  assert.ok(detail.subtitle.indexOf('作者：') >= 0, detail.subtitle);
  assert.ok(detail.description.indexOf('分手炮') >= 0, detail.description);
});

test('色漫天堂: 章节 67 条，标题去掉漫画名前缀，顺序保持站点顺序', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/man-hua-yue-du/12347484.html', body: snapshot('smtt6_detail.html') },
  ]);
  const chapters = await source.chapters({ id: '/man-hua-yue-du/12347484.html' });
  assert.equal(chapters.length, 67);
  assert.equal(chapters[0].title, '第1话-从夫妻变炮友');
  assert.equal(chapters[66].title, '最终话-两人的选择');
  assert.equal(chapters[0].id, '/man-hua-yue-du/12347484/zGMcLaQySbjkKqPYhwVd.html');
});

test('色漫天堂: 正文只收页面图（47 张），都带站内 Referer', async () => {
  const source = stub(loadSource('comic/色漫天堂.js'), [
    { match: '/zGMcLaQySbjkKqPYhwVd.html', body: snapshot('smtt6_chapter.html') },
  ]);
  const content = await source.content({
    id: '/man-hua-yue-du/12347484.html',
    chapterId: '/man-hua-yue-du/12347484/zGMcLaQySbjkKqPYhwVd.html',
  });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 47);
  assert.ok(content.images.every((url) => /18rouman\.vip\//.test(url)), content.images[0]);
  assert.ok(content.images.every((url) => !/mc\.yandex\.ru/.test(url)));
  assert.ok(content.imageHeaders[content.images[0]].Referer.indexOf('/zGMcLaQySbjkKqPYhwVd.html') >= 0);
});

// ------------------------------------------------------------------ XVideos

test('XVideos: 分类从 /tags 实时抓（38 个 + 最新）', async () => {
  const source = stub(loadSource('video/XVideos.js'), [
    { match: '/tags', body: snapshot('xvideos_tags.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.length, 39);
  assert.equal(categories[0].id, '/');
  assert.ok(categories.some((c) => c.id === '/c/Amateur-65' && c.title === 'Amateur'), JSON.stringify(categories.slice(0, 4)));
});

test('XVideos: 搜索第一页 24 条、0 基翻页（p=1）与播放地址解出 HLS + MP4', async () => {
  const source = stub(loadSource('video/XVideos.js'), [
    { match: 'p=1', body: snapshot('xvideos_search.html') },
    { match: 'k=asian', body: snapshot('xvideos_search.html') },
    { match: '/video.okccekvb26d/', body: snapshot('xvideos_video.html') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(page.items.length, 24);
  assert.equal(page.items[0].id, '/video.okccekvb26d/creampie_dripping_pussy');
  assert.equal(page.items[0].title, 'Creampie Dripping Pussy');
  assert.ok(/^https:\/\//.test(page.items[0].cover));
  assert.equal(page.hasMore, true);

  await source.list({ keyword: 'asian', page: 2 });
  assert.ok(source.__urls[1].indexOf('p=1') >= 0, source.__urls[1]);

  const detail = await source.detail({ id: '/video.okccekvb26d/creampie_dripping_pussy' });
  assert.equal(detail.title, 'Creampie Dripping Pussy');

  const chapters = await source.chapters({ id: '/video.okccekvb26d/creampie_dripping_pussy' });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].id, 'play');
  assert.equal(chapters[0].title, '播放');

  const content = await source.content({ id: '/video.okccekvb26d/creampie_dripping_pussy', chapterId: 'play' });
  assert.equal(content.kind, 'video');
  assert.ok(/\.m3u8$/.test(content.url), content.url);
  assert.equal(content.qualities.length, 2);
  assert.equal(content.qualities[0].url, content.url);
  assert.ok(/mp4_sd\.mp4/.test(content.qualities[1].url), content.qualities[1].url);
  assert.ok(content.headers.Referer.indexOf('/video.okccekvb26d/') >= 0);
});

// ------------------------------------------------------------------ XNXX

test('XNXX: 分类读首页内联分类表（161 项）', async () => {
  const source = stub(loadSource('video/XNXX.js'), [
    { match: 'xnxx.com/', body: snapshot('xnxx_home.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.length, 161);
  assert.equal(categories.slice(0, 3).map((c) => c.id).join(','), '/hits,/best,/todays-selection');
  assert.ok(categories.some((c) => c.id === '/search/milf' && c.title === 'Milf'), JSON.stringify(categories.slice(0, 12)));
});

test('XNXX: 搜索 36 条、翻页路径式，播放地址解出 HLS + MP4', async () => {
  const source = stub(loadSource('video/XNXX.js'), [
    { match: '/search/asian/1', body: snapshot('xnxx_search.html') },
    { match: '/search/asian', body: snapshot('xnxx_search.html') },
    { match: '/video-1iy9qy44/', body: snapshot('xnxx_video.html') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(page.items.length, 36);
  assert.equal(page.items[0].id, '/video-1iy9qy44/asian_indo_hijab_fuck_with_dildo');
  assert.equal(page.hasMore, true);

  await source.list({ keyword: 'asian', page: 2 });
  assert.ok(source.__urls[1].endsWith('/search/asian/1'), source.__urls[1]);

  const detail = await source.detail({ id: '/video-1iy9qy44/asian_indo_hijab_fuck_with_dildo' });
  assert.equal(detail.title, 'Asian indo hijab fuck with dildo');
  assert.ok(detail.subtitle.indexOf('6min') >= 0, detail.subtitle);

  const content = await source.content({ id: '/video-1iy9qy44/asian_indo_hijab_fuck_with_dildo', chapterId: 'play' });
  assert.ok(/\.m3u8$/.test(content.url), content.url);
  assert.equal(content.qualities.length, 2);
  assert.equal(content.qualities[0].url, content.url);
  assert.ok(/mp4_sd\.mp4/.test(content.qualities[1].url), content.qualities[1].url);
});

// ------------------------------------------------------------------ xHamster

test('xHamster: 搜索 46 条、路径式翻页 (basePath/2)', async () => {
  const source = stub(loadSource('video/xHamster.js'), [
    { match: '/search/asian/2', body: snapshot('xhamster_search.html') },
    { match: '/search/asian', body: snapshot('xhamster_search.html') },
  ]);
  const page = await source.list({ keyword: 'asian', page: 1 });
  assert.equal(page.items.length, 46);
  assert.equal(page.items[0].id, '/videos/canadian-asian-getting-rammed-doggy-and-fucked-13487433');
  assert.ok(page.items[0].subtitle.indexOf('07:27') >= 0, page.items[0].subtitle);
  assert.equal(page.hasMore, true);

  // 注意：搜索页是 `?page=N`；路径式 `/N` 是首页与分类页的写法。
  await source.list({ keyword: 'asian', page: 2 });
  assert.ok(source.__urls[1].indexOf('?page=2') >= 0, source.__urls[1]);
});

test('xHamster: 详情与 H.264 HLS（由明文 AV1 主清单换出）', async () => {
  const source = stub(loadSource('video/xHamster.js'), [
    { match: '/videos/canadian-asian-getting-rammed-doggy-and-fucked-13487433', body: snapshot('xhamster_video.html') },
  ]);
  const id = '/videos/canadian-asian-getting-rammed-doggy-and-fucked-13487433';
  const detail = await source.detail({ id });
  assert.equal(detail.title, 'canadian asian getting rammed doggy and fucked');
  assert.ok(/^https:\/\/ic-vt-nss\.xhcdn\.com\//.test(detail.cover), detail.cover);

  const chapters = await source.chapters({ id });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].id, 'play');

  const content = await source.content({ id, chapterId: 'play' });
  assert.equal(content.kind, 'video');
  assert.ok(content.url.indexOf('_TPL_.h264.mp4.m3u8') > 0, content.url);
  assert.equal(content.qualities.length, 2);
  assert.ok(content.qualities[1].url.indexOf('_TPL_.av1.mp4.m3u8') > 0, content.qualities[1].url);
  assert.ok(content.qualities[1].label.indexOf('AV1') >= 0);
});

test('三个视频源都满足源契约，且单条视频的 chapters 固定一行「播放」', async () => {
  for (const file of ['video/XVideos.js', 'video/XNXX.js', 'video/xHamster.js']) {
    const source = loadSource(file);
    for (const method of ['home', 'categories', 'list', 'detail', 'chapters', 'content']) {
      assert.equal(typeof source[method], 'function', file + ':' + method);
    }
    assert.equal(source.category, 'video');
    assert.ok(/^[a-z0-9_-]+_video$/.test(source.id), source.id);
  }
});
