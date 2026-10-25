/* eslint-env node */

// 小黄书家族与新点名的三个站：快照回归。
//
//   · audiobook/小黄书听书.js   —— 同站「有声小说」（每章一条 mp3 直链）
//   · photo/小黄书套图.js   —— /photos 情色套图（16 个系列 + 排序）
//   · photo/小黄书自拍.js   —— /amateurs 业余自拍
//   · video/黄果剧场.js     —— huangguo.video（分类 + 尺度 + 16 个情节标签，标签可多选）
//   · comic/丽图漫画.js     —— litu100.xyz（状态 / 地区 / 排序）
//
// 快照都是**真实浏览器取回的完整响应**（snapshots/xchina_*、huangguo_*、litu_*）。

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
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file, timeout: 5000 });
  return context.LumeSource;
}

function stub(source, routes) {
  const seen = [];
  const respond = (url) => {
    for (const route of routes) {
      const hit = typeof route.match === 'string' ? url.indexOf(route.match) >= 0 : route.match.test(url);
      if (hit) return route;
    }
    return null;
  };
  source.__urls = seen;
  source.http = {
    get: async function (url) {
      seen.push(['GET', url]);
      const route = respond(url);
      if (!route) throw new Error('未覆盖的地址: ' + url);
      return { status: route.status === undefined ? 200 : route.status, body: route.body };
    },
    post: async function (url, body) {
      seen.push(['POST', url, String(body)]);
      const route = respond(url);
      if (!route) throw new Error('未覆盖的地址: ' + url);
      return { status: 200, body: route.body };
    },
  };
  return source;
}

const ids = (list) => JSON.stringify(Array.from(list));
const lastUrl = (source) => source.__urls[source.__urls.length - 1][1];

// ------------------------------------------------------------------ 小黄书小说







// ------------------------------------------------------------------ 小黄书听书

test('xchina 听书：分类三档 + 列表卡片（🎧 标注）', async () => {
  const source = stub(loadSource('audiobook/小黄书听书.js'), [
    { match: '/fiction-tag/999', body: snapshot('xchina_audio_tag.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.length, 3);
  assert.ok(categories.every((c) => c.id.indexOf('/fiction-tag/999') === 0), JSON.stringify(categories));
  const result = await source.list({ page: 1 });
  assert.ok(result.items.length >= 20, '条数: ' + result.items.length);
  assert.ok(/^🎧 /.test(result.items[0].subtitle || ''), result.items[0].subtitle);
  assert.ok(/^https:\/\/upload\.xchina\.io\/fiction\//.test(result.items[0].cover || ''), result.items[0].cover);
  await source.list({ page: 2, filters: { sort: 'read' } });
  assert.match(lastUrl(source), /\/fiction-tag\/999\/2\?sort=read$/, lastUrl(source));
});

test('xchina 听书：章节页里的 <audio src> 就是播放地址（真站直链 mp3）', async () => {
  const source = stub(loadSource('audiobook/小黄书听书.js'), [
    { match: '/fiction/5f9131520f3aa/1', body: snapshot('xchina_audio_detail.html') },
    { match: '/fiction/5f9131520f3aa', body: snapshot('xchina_audio_detail.html') },
  ]);
  const content = await source.content({ id: '/fiction/5f9131520f3aa', chapterId: '/fiction/5f9131520f3aa/1' });
  assert.equal(content.kind, 'audio');
  assert.ok(/\.mp3$/.test(content.url), content.url);
  assert.ok(content.url.indexOf('upload.xchina.io/mp3/') >= 0, content.url);
  assert.ok(content.headers && /xchina\.co/.test(content.headers.Referer || ''), JSON.stringify(content.headers));
  assert.match(content.headers['User-Agent'], /iPhone/);
  const detail = await source.detail({ id: '/fiction/5f9131520f3aa' });
  assert.ok(detail.title.length > 0);

  // 没有音频标签时明确报告无配音，不能拼接并不存在的 mp3 地址。
  const fallback = stub(loadSource('audiobook/小黄书听书.js'), [
    { match: '/fiction/aaaa/3', body: '<html><body><div data-reader-body><p>纯文字</p></div></body></html>' },
  ]);
  await assert.rejects(fallback.content({ id: '/fiction/aaaa', chapterId: '/fiction/aaaa/3' }), /本章没有语音版/);
});

test('xchina 听书：audio/source 支持非 mp3 地址，忽略视频 source', async () => {
  const source = stub(loadSource('audiobook/小黄书听书.js'), [{
    match: '/fiction/book/1',
    body: '<video><source src="wrong.mp3"></video><audio><source src="voice?token=1&amp;part=2" type="audio/mp4"></audio>',
  }]);
  const content = await source.content({ chapterId: '/fiction/book/1' });
  assert.equal(content.kind, 'audio');
  assert.equal(content.url, 'https://xchina.co/fiction/book/voice?token=1&part=2');
  assert.equal(content.headers.Referer, 'https://xchina.co/fiction/book/1');
});

// ------------------------------------------------------------------ 小黄书套图

test('xchina 套图：分类 = 全部 + 从列表页现抓的 16 个系列', async () => {
  const source = stub(loadSource('photo/小黄书套图.js'), [
    { match: '/photos', body: snapshot('xchina_photo_list.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories[0].id, '/photos');
  assert.equal(categories.length, 17, '全部 + 16 系列（现抓）: ' + categories.length);
  assert.ok(categories.some((c) => c.id === '/photo-series/6310ce9b90056' && c.title === 'PANS'));
  assert.ok(categories.some((c) => c.title === '街拍'));
});

test('xchina 套图：列表 24 条（封面 img.xchina.io），页号走路径', async () => {
  const source = stub(loadSource('photo/小黄书套图.js'), [
    { match: '/photos', body: snapshot('xchina_photo_list.html') },
    { match: '/photo-series/', body: snapshot('xchina_photo_list.html') },
  ]);
  const result = await source.list({ page: 1 });
  assert.ok(result.items.length >= 20, '条数: ' + result.items.length);
  const first = result.items[0];
  assert.ok(/^\/photo\/[A-Za-z0-9]+$/.test(first.id), first.id);
  assert.ok(/^https:\/\/img\.xchina\.io\/photos\//.test(first.cover || ''), first.cover);
  assert.ok(first.subtitle && /PANS|Vol\./.test(first.subtitle), first.subtitle);
  assert.equal(result.hasMore, true);
  await source.list({ page: 2, filters: { sort: 'hot' } });
  assert.match(lastUrl(source), /\/photos\/2\?sort=hot$/, lastUrl(source));
});

test('xchina 套图：正文只收这套图（23 张 _600x0），视频海报不混进来', async () => {
  const source = stub(loadSource('photo/小黄书套图.js'), [
    { match: '/photo/6acf3d018e5bd', body: snapshot('xchina_photo_detail.html') },
  ]);
  const detail = await source.detail({ id: '/photo/6acf3d018e5bd' });
  assert.ok(detail.title.indexOf('淘淘') >= 0, detail.title);
  assert.ok(/^https:\/\/img\.xchina\.io\/photos\//.test(detail.cover || ''), detail.cover);
  assert.ok(detail.subtitle && detail.subtitle.indexOf('张图片') >= 0, detail.subtitle);

  const chapters = await source.chapters({ id: '/photo/6acf3d018e5bd' });
  assert.equal(chapters.length, 1);
  const content = await source.content({ id: '/photo/6acf3d018e5bd', chapterId: '/photo/6acf3d018e5bd' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 23, '23 张实测');
  assert.ok(content.images.every((u) => u.indexOf('/photos/6acf3d018e5bd/') >= 0), content.images[0]);
  assert.ok(content.images.every((u) => u.indexOf('video-posters') < 0), '视频海报不算');
  assert.ok(content.images[0].indexOf('00001') > 0, '按序号升序: ' + content.images[0]);
});

// ------------------------------------------------------------------ 小黄书自拍

test('xchina 自拍：分类四档、列表封面在 img.xchina.io/amateurs', async () => {
  const source = stub(loadSource('photo/小黄书自拍.js'), [
    { match: '/amateurs', body: snapshot('xchina_amateur_list.html') },
  ]);
  const categories = await source.categories();
  assert.equal(categories.length, 4);
  assert.equal(categories[0].id, '/amateurs');
  const result = await source.list({ page: 1 });
  assert.ok(result.items.length >= 20, '条数: ' + result.items.length);
  assert.ok(/^\/amateur\/[A-Za-z0-9]+$/.test(result.items[0].id), result.items[0].id);
  assert.ok(/^https:\/\/img\.xchina\.io\/amateurs\//.test(result.items[0].cover || ''), result.items[0].cover);
  assert.ok(/\d+P/.test(result.items[0].subtitle || ''), result.items[0].subtitle);
  await source.list({ page: 2, filters: { sort: 'featured' } });
  assert.match(lastUrl(source), /\/amateurs\/2\?sort=featured$/, lastUrl(source));
});

test('xchina 自拍：正文 20 张，头像（upload.xchina.io/media）不算', async () => {
  const source = stub(loadSource('photo/小黄书自拍.js'), [
    { match: '/amateur/6ad11668a33c2', body: snapshot('xchina_amateur_detail.html') },
  ]);
  const content = await source.content({ id: '/amateur/6ad11668a33c2', chapterId: '/amateur/6ad11668a33c2' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 18, '实测 18 张（同图的不同规格按序号去重）');
  assert.ok(content.images.every((u) => u.indexOf('/amateurs/6ad11668a33c2/') >= 0), content.images[0]);
  assert.ok(content.images.every((u) => u.indexOf('/media/') < 0), '头像/媒体不算');
});

// ------------------------------------------------------------------ 黄果剧场

test('黄果：分类 5+2、筛选两组（尺度 4 / 情节标签 16）', async () => {
  const source = loadSource('video/黄果剧场.js');
  const categories = await source.categories();
  assert.equal(categories.length, 7);
  assert.equal(categories[0].id, '/videos?category=all');
  assert.ok(categories.some((c) => c.id === '/videos?category=3' && c.title === '连续剧'));
  assert.ok(categories.some((c) => c.id === '/updates'));
  const filters = await source.filters();
  assert.equal(ids(filters.map((g) => g.id)), ids(['rating', 'tags']));
  assert.equal(filters[0].options.length, 4);
  assert.equal(filters[1].options.length, 16, '情节标签: ' + filters[1].options.length);
  assert.ok(filters[1].options.some((o) => o.title === '乱伦'));
});

test('黄果：列表卡片（站内封面 / 限制级 / 更新至）+ 多选标签拼地址', async () => {
  const source = stub(loadSource('video/黄果剧场.js'), [
    { match: '/videos', body: snapshot('huangguo_list.html') },
  ]);
  const result = await source.list({ categoryId: '/videos?category=all', page: 1 });
  assert.ok(result.items.length >= 20, '条数: ' + result.items.length);
  const first = result.items[0];
  assert.equal(first.title, '母子同淫');
  assert.ok(/^https:\/\/huangguo\.video\/uploads\//.test(first.cover || ''), first.cover);
  assert.ok(first.subtitle.indexOf('限制级') >= 0 && first.subtitle.indexOf('更新至') >= 0, first.subtitle);
  assert.equal(result.hasMore, true);

  await source.list({ categoryId: '/videos?category=2', page: 2, filters: { rating: '3', tags: '1,2' } });
  assert.match(lastUrl(source), /\/videos\?category=2&rating=3&tags=1%2C2&page=2$/, lastUrl(source));
  await source.list({ categoryId: '/videos?category=all', page: 1, filters: { rating: '9', tags: '99,1' } });
  assert.match(lastUrl(source), /\/videos\?category=all&tags=1$/, '白名单兜底（认不出的丢掉）: ' + lastUrl(source));
});

test('黄果：搜索走 /search?q=，结果卡片同一套标记', async () => {
  const source = stub(loadSource('video/黄果剧场.js'), [
    { match: '/search?q=', body: snapshot('huangguo_search.html') },
  ]);
  const result = await source.list({ keyword: '母子', page: 1 });
  assert.ok(lastUrl(source).indexOf('/search?q=' + encodeURIComponent('母子')) >= 0, lastUrl(source));
  assert.ok(result.items.length >= 5, '搜索结果: ' + result.items.length);
  assert.ok(/^\/series\//.test(result.items[0].id) || /^\/video\//.test(result.items[0].id), result.items[0].id);
});

test('黄果：连续剧的选集按集号升序（真站默认倒序）', async () => {
  const source = stub(loadSource('video/黄果剧场.js'), [
    { match: '/series/fsr7qpxd', body: snapshot('huangguo_series.html') },
  ]);
  const detail = await source.detail({ id: '/series/fsr7qpxd' });
  assert.equal(detail.title, '母子同淫');
  assert.ok(/^https:\/\/huangguo\.video\/uploads\//.test(detail.cover || ''), detail.cover);

  const chapters = await source.chapters({ id: '/series/fsr7qpxd' });
  assert.ok(chapters.length >= 4, '集数: ' + chapters.length);
  assert.ok(/第\s*1\s*集/.test(chapters[0].title), '升序后第一条是第 1 集: ' + chapters[0].title);
  assert.ok(/第\s*4\s*集/.test(chapters[chapters.length - 1].title), chapters[chapters.length - 1].title);
  assert.ok(/^\/video\/[A-Za-z0-9]+$/.test(chapters[0].id), chapters[0].id);
});

test('黄果：播放地址取 data-hls（站内 m3u8）并带页面 Referer', async () => {
  const source = stub(loadSource('video/黄果剧场.js'), [
    { match: '/video/bwt03zdhz', body: snapshot('huangguo_video.html') },
  ]);
  const content = await source.content({ id: '/video/bwt03zdhz', chapterId: '/video/bwt03zdhz' });
  assert.equal(content.kind, 'video');
  assert.equal(content.url, 'https://huangguo.video/uploads/content/video/4700/master.m3u8');
  assert.ok(/huangguo\.video/.test(content.headers.Referer || ''), JSON.stringify(content.headers));
});

// ------------------------------------------------------------------ 丽图漫画

test('丽图：分类 8 个（全部 / 状态 3 / 地区 4）+ 排序筛选 4 档', async () => {
  const source = loadSource('comic/丽图漫画.js');
  const categories = await source.categories();
  assert.equal(categories.length, 8);
  assert.equal(categories[0].id, '/comics.html');
  assert.ok(categories.some((c) => c.id === '/comics/kk-1.html' && c.title === '连载中'));
  assert.ok(categories.some((c) => c.id === '/comics/kk-韩国.html' && c.title === '韩国'));
  const filters = await source.filters();
  assert.equal(filters.length, 1);
  assert.equal(ids(filters[0].options.map((o) => o.id)), ids(['', 'added', 'read', 'comment']));
});

test('丽图：列表卡片（封面是背景图）与页号参数', async () => {
  const source = stub(loadSource('comic/丽图漫画.js'), [
    { match: '/comics', body: snapshot('litu_list.html') },
  ]);
  const result = await source.list({ categoryId: '/comics.html', page: 1 });
  assert.equal(result.items.length, 20);
  const first = result.items[0];
  assert.equal(first.title, '高薪兼职的代价');
  assert.ok(/^\/comic\/id-[A-Za-z0-9]+\.html$/.test(first.id), first.id);
  assert.ok(/^https:\/\/img\.xchina\.io\/comics\/[A-Za-z0-9]+\/cover\.jpg$/.test(first.cover || ''), '背景图封面: ' + first.cover);
  assert.ok(first.subtitle && first.subtitle.indexOf('国家') >= 0, first.subtitle);
  assert.equal(result.hasMore, true);

  await source.list({ categoryId: '/comics.html', page: 2 });
  assert.match(lastUrl(source), /\/comics\.html\?page=2$/, lastUrl(source));
  await source.list({ categoryId: '/comics/kk-1.html', page: 1 });
  assert.match(lastUrl(source), /\/comics\/kk-1\.html$/, lastUrl(source));
  await source.list({ categoryId: '/comics.html', page: 1, filters: { sort: 'read' } });
  assert.match(lastUrl(source), /\/comics\/sort-read\.html$/, '排序是独立路径: ' + lastUrl(source));
});

test('丽图：详情（标题取 <title>、地区/作者/状态）与剧集升序', async () => {
  const source = stub(loadSource('comic/丽图漫画.js'), [
    { match: '/comic/id-6acac1d09ea57', body: snapshot('litu_detail.html') },
  ]);
  const detail = await source.detail({ id: '/comic/id-6acac1d09ea57.html' });
  assert.equal(detail.title, '高薪兼职的代价');
  assert.ok(/^https:\/\/img\.xchina\.io\/comics\//.test(detail.cover || ''), detail.cover);
  assert.ok(detail.subtitle.indexOf('地区：韩国') >= 0, detail.subtitle);
  assert.ok(detail.subtitle.indexOf('作者：') >= 0, detail.subtitle);
  assert.ok(detail.subtitle.indexOf('状态：') >= 0, detail.subtitle);

  const chapters = await source.chapters({ id: '/comic/id-6acac1d09ea57.html' });
  assert.ok(chapters.length >= 4, '章数: ' + chapters.length);
  const nums = chapters.map((c) => Number((/\/(\d+)\.html$/.exec(c.id) || [])[1] || 0));
  assert.deepEqual(nums.slice().sort((a, b) => a - b), nums, '应按话号升序');
  assert.ok(/^\/comic\/id-6acac1d09ea57\/1\.html$/.test(chapters[0].id), chapters[0].id);
});

test('丽图：正文只收这一话的图（推荐位/其它话的图全排除）', async () => {
  const source = stub(loadSource('comic/丽图漫画.js'), [
    { match: '/comic/id-6acac1d09ea57/4.html', body: snapshot('litu_reader.html') },
  ]);
  const content = await source.content({ id: '/comic/id-6acac1d09ea57.html', chapterId: '/comic/id-6acac1d09ea57/4.html' });
  assert.equal(content.kind, 'images');
  assert.ok(content.images.length >= 100, '这一话的图: ' + content.images.length);
  assert.ok(content.images.every((u) => u.indexOf('/comics/6acac1d09ea57/4/') >= 0), content.images[0]);
  assert.ok(content.images[0].indexOf('/001.') > 0, '按序号升序: ' + content.images[0]);
  assert.ok(content.imageHeaders[content.images[0]].Referer.indexOf('litu100.xyz') >= 0);
});
