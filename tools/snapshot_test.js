/* eslint-env node */

// Small Node-only regression tests for the checked-in HTML/JSON snapshots.
// The sources themselves remain QuickJS-compatible; this file is not imported by LumeBox.
//
// 快照 = 写脚本时站点真实的样子（snapshots/<前缀>_<角色>）。这些用例把脚本
// 放进 vm 里、喂快照当响应，钉住**解析规则**：站点改版后先在这里红，而不是
// 等真机上「列表空了」才发现。
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var nodeTest = require('node:test');
// 用例名前缀 → 脚本文件：脚本从仓库移除后，它的用例自动跳过（而不是整片红掉、
// 把真正的回归埋住）。删源时记得把对应快照一并清理。
var REMOVED = { 'gmh:': 'comic/gmh_comic.js', 'jcomic:': 'comic/jcomic_comic.js', '92mh:': 'comic/92mh_comic.js' };
function test(name, fn) {
  for (var prefix in REMOVED) {
    if (name.indexOf(prefix) === 0 && !fs.existsSync(path.join(__dirname, '..', REMOVED[prefix]))) {
      return nodeTest(name, { skip: REMOVED[prefix] + ' 已从仓库移除' }, fn);
    }
  }
  return nodeTest(name, fn);
}
var vm = require('node:vm');

var ROOT = path.join(__dirname, '..');

/// 按文件名在 board 目录（comic / novel / video）里找脚本。
function findScript(file) {
  var boards = ['comic', 'novel', 'video'];
  for (var i = 0; i < boards.length; i++) {
    var candidate = path.join(ROOT, boards[i], file);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('找不到脚本: ' + file);
}

function loadSource(file) {
  var source = fs.readFileSync(findScript(file), 'utf8');
  var context = {};
  vm.runInNewContext(source, context, { filename: file });
  return context.LumeSource;
}

function snapshot(name) {
  return fs.readFileSync(path.join(ROOT, 'snapshots', name), 'utf8');
}

/// 一次性响应（所有请求都给同一份快照）。
function stubBody(source, body) {
  source.http = {
    get: async function () {
      return { status: 200, body: body };
    }
  };
  return source;
}

/// 按 URL 关键词分发的响应（同一次调用里会打多个地址时用）。
function stubRoutes(source, routes) {
  var seen = [];
  source.http = {
    get: async function (url) {
      seen.push(url);
      var keys = Object.keys(routes);
      for (var i = 0; i < keys.length; i++) {
        if (url.indexOf(keys[i]) >= 0) return { status: 200, body: routes[keys[i]] };
      }
      throw new Error('快照未覆盖的地址: ' + url);
    }
  };
  source.__urls = seen;
  return source;
}

/// 沙盒存储替身（脚本用它记 deviceId / 可用域）。
function stubStore(source) {
  var memory = {};
  source.fs = {
    readText: async function (key) { return memory[key] == null ? null : memory[key]; },
    writeText: async function (key, value) { memory[key] = String(value); return true; },
    exists: async function (key) { return memory[key] != null; },
    remove: async function (key) { delete memory[key]; return true; },
    list: async function () { return Object.keys(memory); }
  };
  return source;
}

// ------------------------------------------------------------------ X漫（xman6）

test('xman6: 分类页快照解析出 24 条（封面只在 data-original 里）', async function () {
  var source = stubBody(loadSource('X漫.js'), snapshot('xman6_cat.html'));

  var result = await source.list({ categoryId: '韩漫', page: 1 });
  assert.equal(result.items.length, 24);
  assert.equal(JSON.stringify(result.items[0]), JSON.stringify({
    id: '368107',
    title: '恶次人生',
    cover: 'https://thumb.niaopic.com/upload_s/202502/20250208012437509.webp',
    coverHeaders: { Referer: 'https://xman6.com/' },
    subtitle: '15小时之前'
  }));
  assert.equal(result.hasMore, true);
});

test('xman6: 末页快照 hasMore=false；搜索页同样认出 24 条', async function () {
  // xman6_cat.html 的分页器写着「共有 61 页」——第 61 页不该再说还有下一页。
  var source = stubBody(loadSource('X漫.js'), snapshot('xman6_cat.html'));
  var last = await source.list({ categoryId: '韩漫', page: 61 });
  assert.equal(last.hasMore, false);
  assert.equal(last.items.length, 24);

  stubBody(source, snapshot('xman6_search.html'));
  var search = await source.list({ keyword: '恋', page: 1 });
  assert.equal(search.items.length, 24);
  assert.equal(search.items[0].id, '368296');
});

test('xman6: 详情快照的封面取自 content_thumb（不是推荐位的第一张）', async function () {
  var source = stubBody(loadSource('X漫.js'), snapshot('xman6_detail.html'));
  var detail = await source.detail({ id: '368107' });
  assert.equal(detail.title, '恶次人生');
  assert.equal(detail.cover, 'https://thumb.niaopic.com/upload_s/202502/20250208012437509.webp');
  assert.equal(JSON.stringify(detail.tags), JSON.stringify(['正妹', '巨乳', '同居', '好友', '校园']));
  assert.equal(detail.extra.author, 'UMS');

  var chapters = await source.chapters({ id: '368107' });
  assert.equal(chapters.length, 76);
  assert.equal(chapters[0].id, 'qIIWVnhZMDNMfDnkRxMq');
  assert.equal(chapters[0].title, '第1话-展开第二次人生');
});

test('xman6: 正文快照收 154 张 data-src 图（yandex 统计像素只带 src，不算）', async function () {
  var source = stubBody(loadSource('X漫.js'), snapshot('xman6_read.html'));
  var content = await source.content({ id: '368107', chapterId: 'OVGuHKcFwzFMwDKQlHQZ' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 154);
  assert.match(content.images[0], /^https:\/\/new\.niaopic\.com\//);
  assert.ok(content.images.every(function (url) { return url.indexOf('mc.yandex.ru') < 0; }));
});

test('xman6: 排行榜快照（ranklist_item 另一套标记）解析出条目', async function () {
  var source = stubBody(loadSource('X漫.js'), snapshot('xman6_rank.html'));
  var result = await source.list({ categoryId: 'rank', page: 1 });
  assert.ok(result.items.length >= 20, 'rank 条目应 >= 20，实际 ' + result.items.length);
  assert.equal(result.hasMore, false);
  assert.equal(result.items[0].id, '368198');
  assert.equal(result.items[0].title, '猎艷管理员');
});

// ------------------------------------------------------------------ JComic（jcomic.net）

test('jcomic: 列表快照里 /eps 与 /page 两种形态都被收下（各带形态路径）', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_cat.html'));
  var result = await source.list({ categoryId: '最近更新', page: 1 });
  assert.equal(result.items.length, 30);
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].id, '/eps/[Patreon] NankoAI （AI）part.3');
  assert.equal(result.items[0].title, '[Patreon] NankoAI （AI）part.3');
  assert.ok(result.items.some(function (item) { return item.id.indexOf('/page/') === 0; }),
    '快照里应有单页作品（/page/ 形态）');
});

test('jcomic: 中间页 hasMore=true、真站末页（没有 &raquo; 那条）hasMore=false', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_cat_p2.html'));
  var middle = await source.list({ categoryId: '最近更新', page: 2 });
  assert.equal(middle.hasMore, true);

  // 末页快照取自真站（/cat/最近更新/4759）：箭头那条根本不存在，编号停在最大页。
  stubBody(source, snapshot('jcomic_cat_last.html'));
  var last = await source.list({ categoryId: '最近更新', page: 4759 });
  assert.equal(last.hasMore, false);
  assert.equal(last.items.length, 29);
});

test('jcomic: 详情 + 目录（/eps 形态）', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_eps.html'));
  var id = '/eps/[Pixiv] Misoya (25058255) part.4（AI）';
  var detail = await source.detail({ id: id });
  assert.equal(detail.title, '[Pixiv] Misoya (25058255) part.4（AI）');
  assert.equal(detail.extra.author, 'Misoya');
  assert.equal(JSON.stringify(detail.tags), JSON.stringify(['全彩', '同人', 'CG雜圖']));
  assert.match(detail.cover, /^https:\/\/images\.jcomic\.net\//);

  var chapters = await source.chapters({ id: id });
  assert.equal(chapters.length, 22);
  assert.equal(chapters[0].id, '1');
  assert.equal(chapters[0].title, 'deepseek');
  assert.equal(chapters[1].title, '风笛');
});

test('jcomic: 标题里带 |A 记号的目录（120 话）认得出', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_eps_marked.html'));
  var id = '/eps/星期一的丰满|A月曜日のたわわ その1-608';
  var chapters = await source.chapters({ id: id });
  assert.equal(chapters.length, 120);
  assert.equal(chapters[0].id, '8');
  assert.match(chapters[0].title, /その399/);
});

test('jcomic: 单页作品（/page 形态）给一条「正文」，正文图能解出来', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_page_single.html'));
  var id = '/page/侵入者';
  var detail = await source.detail({ id: id });
  assert.equal(detail.title, '侵入者');
  assert.match(detail.cover, /^https:\/\/images\.jcomic\.net\//);
  assert.equal(detail.extra.author, '甚助屋 (甚助)');

  var chapters = await source.chapters({ id: id });
  assert.equal(JSON.stringify(chapters), JSON.stringify([{ id: '1', title: '正文' }]));

  var content = await source.content({ id: id, chapterId: '1' });
  assert.equal(content.images.length, 47);
});

test('jcomic: 正文快照 392 张图全部解出（JCOMIC_TRAPS_ 倒序 base64）', async function () {
  var source = stubBody(loadSource('jcomic_comic.js'), snapshot('jcomic_page1.html'));
  var content = await source.content({
    id: '/eps/[Pixiv] Misoya (25058255) part.4（AI）',
    chapterId: '1'
  });
  assert.equal(content.images.length, 392);
  assert.match(content.images[0],
    /^https:\/\/images\.jcomic\.net\/6ab01114bbe35b0ab56e70bd\/1\/001_22\.jpg\?/);
  assert.ok(content.images.every(function (url) {
    return url.indexOf('images.jcomic.net') > 0 && url.indexOf('X-Amz-Signature=') > 0;
  }), '每张都应是带签名的 S3 直链');
});

// ------------------------------------------------------------------ 夜读小说（x-novel.com）

test('xnovel: 分类 + 列表（24 条，条目信息齐全）+ 末页 hasMore=false', async function () {
  var source = loadSource('夜读小说.js');

  stubBody(source, snapshot('xnovel_home.html'));
  var categories = await source.categories();
  assert.equal(categories[0].id, 'all');
  assert.ok(categories.some(function (item) { return item.id === 'wife' && item.title === '人妻女友'; }));

  stubBody(source, snapshot('xnovel_list.html'));
  var list = await source.list({ categoryId: 'all', page: 1 });
  assert.equal(list.items.length, 24);
  assert.equal(list.hasMore, true);
  assert.equal(list.items[0].id, 'hi1ezanput');
  assert.equal(list.items[0].title, '疯狂交合与温泉露出');
  assert.equal(list.items[0].cover, 'https://x-novel.com/assets/cover/6acbfdc50f5fb.webp');

  stubBody(source, snapshot('xnovel_list_last.html'));
  var last = await source.list({ categoryId: 'all', page: 100 });
  assert.equal(last.items.length, 24);
  assert.equal(last.hasMore, false, '第 100 页（末页）没有「下一页」锚点');
});

test('xnovel: 搜索页（?q=）解析出条目', async function () {
  var source = stubBody(loadSource('夜读小说.js'), snapshot('xnovel_search.html'));
  var result = await source.list({ keyword: '老师', page: 1 });
  assert.equal(result.items.length, 24);
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].id, 'hi2bb8ww4z');
});

test('xnovel: 目录第 1 章不被底部工具条（「阅读」/「开始阅读」）污染', async function () {
  var source = stubBody(loadSource('夜读小说.js'), snapshot('xnovel_detail_short.html'));
  var chapters = await source.chapters({ id: 'hi1ezanput' });
  assert.equal(chapters.length, 3);
  assert.equal(JSON.stringify(chapters.map(function (c) { return c.title; })), JSON.stringify(['上', '下', '后记']));
  assert.equal(JSON.stringify(chapters.map(function (c) { return c.id; })), JSON.stringify(['1', '2', '3']));
});

test('xnovel: 详情（简介 / 作者 / 本作标签）+ 正文段落', async function () {
  var source = stubBody(loadSource('夜读小说.js'), snapshot('xnovel_detail.html'));
  var detail = await source.detail({ id: 'j9rf1t4t4i' });
  assert.equal(detail.title, '老婆陪我换配偶');
  assert.equal(detail.cover, 'https://x-novel.com/assets/cover/6093f3730b02c.webp');
  assert.equal(detail.extra.author, 'jiandan000');
  assert.match(detail.subtitle, /8 章/);
  assert.match(detail.description, /^这时的我，上身仅穿着一件T恤/);
  // 详情页上半部分是「按标签逛」的宫格导航——不能被当成这一部的标签
  // （快照里那套导航有 13 项；本作自己的药丸行在尾部）。
  assert.ok(detail.tags.length <= 8, '标签数应受 MAX_TAGS 约束');

  var chapters = await source.chapters({ id: 'j9rf1t4t4i' });
  assert.equal(chapters.length, 8);
  assert.equal(chapters[0].title, '前篇');
  assert.equal(chapters[1].title, '第一章 捉奸在床');

  stubBody(source, snapshot('xnovel_chapter.html'));
  var content = await source.content({ id: 'j9rf1t4t4i', chapterId: '1' });
  assert.equal(content.kind, 'text');
  assert.ok(content.text.length > 500, '正文应超过 500 字，实际 ' + content.text.length);
  assert.ok(content.text.indexOf('\n\n') > 0, '段落之间应以空行分隔');
  assert.ok(content.text.indexOf('换配偶') > 0);
});

test('xnovel: 命中反诈/运营商拦截页（200 + 「国家反诈中心」）要抛出可读原因', async function () {
  // 国内直连该域名会拿到 200 + 拦截页（3KB）——不识别的话解析出来是空列表，
  // 用户只会看到「暂无内容」，以为是源坏了。
  var source = stubBody(loadSource('夜读小说.js'), snapshot('xnovel_blocked.html'));
  await assert.rejects(
    function () { return source.list({ categoryId: 'all', page: 1 }); },
    function (error) {
      assert.match(String(error.message), /国家反诈中心|反诈\/拦截页/);
      return true;
    }
  );
});


// ------------------------------------------------------------------ XAnimu（xanimu.one / xanimu.art）

test('xanimu: 首页/分类快照解析出 47 条（封面首张 src、其余 data-src 都要认）', async function () {
  var source = stubStore(loadSource('成人动漫.js'));

  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_cat.html') });
  var page = await source.list({ categoryId: '36900-2d', page: 1 });
  // 快照里 48 个 video-block，其中一个没有 data-post-id（站点自己的装饰块），
  // 所以条目数是 47——脚本只认带 data-post-id 的卡片。
  assert.equal(page.items.length, 47);
  assert.equal(page.hasMore, true);
  assert.equal(page.items[0].id, '108866');
  assert.equal(page.items[0].title, 'Mime Dash, Derpixon X 高清hmv');
  assert.match(page.items[0].cover, /^https:\/\/jre1cpolr1frc\.7132p\.cc\/storage\//);
  assert.match(page.items[0].subtitle, /min/);
  // 第 2 条走的是懒加载 data-src（首张才是 src）——两种都要有封面。
  assert.match(page.items[1].cover, /^https:\/\/jre1cpolr1frc\.7132p\.cc\/storage\//);
  // 分类路径要拼进请求地址（裸中文按段编码）。
  assert.match(source.__urls[0], /\/zh-CN\/36900-2d\/$/);
});

test('xanimu: 分类末页（没有 a.next）hasMore=false；翻页地址是 /page/N/', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_cat_last.html') });
  var last = await source.list({ categoryId: '36900-2d', page: 51 });
  assert.equal(last.hasMore, false);
  assert.equal(last.items.length, 30);
  assert.match(source.__urls[0], /\/zh-CN\/36900-2d\/page\/51\/$/);
});

test('xanimu: 搜索（?s=）与搜索翻页（/page/N/?s=）', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, {
    '/page/2/': snapshot('xanimu_search_p2.html'),
    '/zh-CN/': snapshot('xanimu_search.html')
  });
  var first = await source.list({ keyword: '3d', page: 1 });
  assert.equal(first.items.length, 47);
  assert.equal(first.hasMore, true);
  assert.match(source.__urls[0], /\/zh-CN\/\?s=3d$/);

  var second = await source.list({ keyword: '3d', page: 2 });
  assert.equal(second.items.length, 47);
  assert.match(source.__urls[1], /\/zh-CN\/page\/2\/\?s=3d$/);
});

test('xanimu: 排序开关（filters.sort）拼成站点的 ?filter=', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_filter_latest.html') });

  var groups = await source.filters();
  assert.equal(groups.groups.length, 1);
  assert.equal(JSON.stringify(groups.groups[0].options.map(function (o) { return o.id; })),
    JSON.stringify(['popular', 'latest', 'most-viewed', 'longest']));

  var list = await source.list({ categoryId: 'all', filters: { sort: 'latest' }, page: 1 });
  assert.equal(list.items.length, 47);
  assert.equal(list.items[0].id, '298342', '?filter=latest 的第一条应是最新那条');
  assert.match(source.__urls[0], /\/zh-CN\/\?filter=latest$/);

  // 「受欢迎」是站点默认（不带参数）。
  await source.list({ categoryId: 'all', filters: { sort: 'popular' }, page: 1 });
  assert.equal(/filter=/.test(source.__urls[1]), false, '受欢迎不该带 filter 参数');
});

test('xanimu: 分类从导航实时读（id 是 /zh-CN/ 后的路径，标题用中文展示名）', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_home.html') });
  var categories = await source.categories();
  assert.equal(categories[0].id, 'all');
  assert.ok(categories.length >= 40, '分类数应 >= 40，实际 ' + categories.length);
  assert.ok(categories.some(function (c) { return c.id === '36900-2d' && c.title === '2D'; }));
  // 中文展示名优先（AI porn 的分类显示名是「AI色情」）。
  assert.ok(categories.some(function (c) { return c.title === 'AI色情'; }));
  // 子分类的 id 带层级（Disney 下的阿拉丁）。
  assert.ok(categories.some(function (c) { return c.id.indexOf('9479-disney') === 0; }));
});

test('xanimu: 详情（标题/封面/简介/分类/标签/时长）与单集目录', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_post.html') });

  var detail = await source.detail({ id: '212' });
  assert.equal(detail.title, '史上最佳的无尽触手电影！');
  assert.match(detail.cover, /^https:\/\/st1\.nosofiles\.com\/.+_poster\.jpg/);
  assert.match(detail.description, /触手/);
  assert.equal(JSON.stringify(detail.tags),
    JSON.stringify(['变态', '大胸', '口交', '肛门', '射精', '恋物癖', '喷射', '双重穿透', '触手']));
  assert.equal(JSON.stringify(detail.extra.categories.split('、')), JSON.stringify(['3D', '触手']));
  assert.match(detail.subtitle, /52 分 28 秒/);
  assert.match(detail.subtitle, /2019-06-05/, '副标题带上发布日期');
  // extra 里留站点的原始时间戳（副标题只截日期）。
  assert.equal(detail.extra.uploadDate, '2019-06-05T22:18:36+00:00');
  assert.equal(detail.extra.duration, '52 分 28 秒');
  // 详情用 ?p={id}（301 到正式地址），不解析中文 slug。
  assert.match(source.__urls[0], /\/zh-CN\/\?p=212$/);

  var chapters = await source.chapters({ id: '212' });
  assert.equal(JSON.stringify(chapters), JSON.stringify([{ id: '1', title: '正片' }]));
});

test('xanimu: 播放地址是两条 mp4（high/low），verify 令牌原样保留', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  stubRoutes(source, { '/zh-CN/': snapshot('xanimu_post.html') });
  var content = await source.content({ id: '212', chapterId: '1' });
  assert.equal(content.kind, 'video');
  assert.equal(content.qualities.length, 2);
  assert.equal(JSON.stringify(content.qualities.map(function (q) { return q.label; })),
    JSON.stringify(['高清', '标清']));
  assert.match(content.url, /_high\.mp4\?verify=/);
  assert.equal(content.url, content.qualities[0].url, '默认线路取站点自己的第一条（high）');
  // `%3D` 是令牌的一部分，**不能**再解一次码。
  assert.match(content.qualities[0].url, /%3D$/);
});

test('xanimu: 域名链（.art 首选）；首选连不上就换下一个并记住可用的那个', async function () {
  var source = stubStore(loadSource('成人动漫.js'));
  var attempts = [];
  source.http = {
    get: async function (url) {
      attempts.push(url);
      if (url.indexOf('xanimu.art') >= 0) throw new Error('网络请求失败：Connection reset');
      return { status: 200, body: snapshot('xanimu_home.html') };
    }
  };
  var categories = await source.categories();
  assert.ok(categories.length > 1);
  assert.match(attempts[0], /^https:\/\/xanimu\.art\//);
  assert.match(attempts[1], /^https:\/\/xanimu\.one\//);

  // 第二轮：直接用记住的 .one，不再去撞 .art。
  attempts.length = 0;
  await source.categories();
  assert.equal(attempts.length, 1);
  assert.match(attempts[0], /^https:\/\/xanimu\.one\//);
});


// ------------------------------------------------------------------ G社漫画（g-mh.org）

test('gmh: 列表快照解析出 18 条（slug 作 id、封面 img.card、标题 h3.cardtitle）', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  stubRoutes(source, { '/manga': snapshot('gmh_list.html') });
  var page = await source.list({ categoryId: 'all', page: 1 });
  assert.equal(page.items.length, 18);
  assert.equal(page.hasMore, true, '目录页有 /manga/page/{N} 分页器');
  assert.equal(page.items[0].id, 'wuliandianfeng-pikapi');
  assert.equal(page.items[0].title, '武炼巅峰');
  assert.match(page.items[0].cover, /^https:\/\/c-nc-1\.6wm\.top\/manga\//);
  assert.match(source.__urls[0], /\/manga$/);
});

test('gmh: 搜索如实拒绝（站点没有搜索，不返回假的空结果）', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  var attempts = [];
  source.http = { get: async function (url) { attempts.push(url); return { status: 200, body: '' }; } };
  await assert.rejects(
    function () { return source.list({ keyword: 'naruto', page: 1 }); },
    function (error) {
      assert.match(String(error.message), /没有搜索/);
      return true;
    }
  );
  assert.equal(attempts.length, 0, '不该为一个不存在的搜索端点发请求');
});

test('gmh: 分类 = 四个栏目 + 站点自己的题材/标签（实时抓）', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  stubRoutes(source, { '/manga': snapshot('gmh_list.html') });
  var categories = await source.categories();
  assert.equal(JSON.stringify(categories.slice(0, 4).map(function (c) { return c.id; })),
    JSON.stringify(['all', 'hots', 'dayup', 'newss']));
  assert.ok(categories.some(function (c) { return c.id === 'genre:kr' && c.title === '韩漫'; }),
    '题材组应含 genre:kr');
  assert.ok(categories.some(function (c) { return c.id.indexOf('tag:') === 0; }),
    '标签组应被解析出来');
});

test('gmh: 详情（作品页 data-mid + 页面元信息）与目录（接口 chapters 升序）', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  stubRoutes(source, {
    '/api/v2/manga/get': snapshot('gmh_manga_api.json'),
    '/manga/': snapshot('gmh_manga.html')
  });
  var detail = await source.detail({ id: 'wujiakegui-yiming' });
  assert.equal(detail.title, '无家可归');
  // 封面取 og:image（本作封面）；页面上第一张 img.card 是推荐位，属于别的作品。
  assert.match(detail.cover, /^https:\/\/c-nc-1\.6wm\.top\/manga\/wujiakegui-yiming\//);
  assert.equal(detail.extra.mid, '4418');
  assert.equal(detail.extra.author, '佚名');
  assert.equal(detail.extra.genre, '韩漫');
  assert.ok(detail.tags.length >= 1);
  assert.match(detail.subtitle, /共 20 话/);

  var chapters = await source.chapters({ id: 'wujiakegui-yiming' });
  assert.equal(chapters.length, 20);
  assert.equal(chapters[0].id, '1266718');
  assert.match(chapters[0].title, /第01话/);
});

test('gmh: 被站点防护拦下（403）时换域，全被拦才抛 NEED_WEBVIEW_VERIFY', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  var attempts = [];
  source.http = {
    get: async function (url) {
      attempts.push(url);
      if (url.indexOf('g-mh.org') >= 0) throw new Error('网络请求失败：Connection reset');
      return { status: 403, body: '<html><title>Just a moment...</title></html>' };
    }
  };
  await assert.rejects(
    function () { return source.list({ categoryId: 'all', page: 1 }); },
    function (error) {
      assert.match(String(error.message), /NEED_WEBVIEW_VERIFY/);
      return true;
    }
  );
  assert.equal(attempts.length, 2, '两个候选域都要试过');
});

test('gmh: 正文走「站点自己的解码器」（快照里解码器原样跑，出 38 张图）', async function () {
  var source = stubStore(loadSource('gmh_comic.js'));
  stubRoutes(source, {
    '/api/v2/chapter/getinfo': snapshot('gmh_chapter_api.json'),
    '/chapter-decoder.js': snapshot('gmh_decoder.txt'),
    '/manga/': snapshot('gmh_manga.html')
  });
  var content = await source.content({ id: 'wujiakegui-yiming', chapterId: '1266718' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 38);
  assert.match(content.images[0], /^https:\/\/c-nd2-1\.6wm\.top\/wujiakegui\/ac3f6\//);
  assert.match(content.images[0], /\.webp$/);
});

// ------------------------------------------------------------------ MYCOMIC（mycomic.com/cn）

test('mycomic: 列表 30 条/页（标题取 alt、副标题取「最新话」）', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/comics': snapshot('mycomic_list.html') });
  var page = await source.list({ categoryId: 'all', page: 1 });
  assert.equal(page.items.length, 30);
  assert.equal(page.hasMore, true);
  assert.equal(page.items[0].id, '55355');
  assert.equal(page.items[0].title, '猎人游戏W');
  assert.match(page.items[0].cover, /^https:\/\/biccam\.com\/comics\/55355-/);
  assert.equal(page.items[0].subtitle, '第07话');
});

test('mycomic: 中间页 hasMore=true、真站末页（第 1845 页）hasMore=false', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/comics': snapshot('mycomic_list_p3.html') });
  var mid = await source.list({ categoryId: 'all', page: 3 });
  assert.equal(mid.hasMore, true, '第 3 页后面还有（快照里能看到 page=1845）');

  // 末页快照取自真站第 1845 页：没有 page=1846，也没有 rel="next"。
  stubRoutes(source, { '/comics': snapshot('mycomic_list_last.html') });
  var last = await source.list({ categoryId: 'all', page: 1845 });
  assert.equal(last.hasMore, false);
  assert.equal(last.items.length, 8, '末页只剩余数条目（1845 页 × 30 条）');
});

test('mycomic: 搜索与筛选拼成站点自己的查询串（keyword / filter[key] / sort）', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/comics': snapshot('mycomic_search.html') });
  await source.list({ keyword: '海贼', page: 1 });
  assert.match(source.__urls[0], /keyword=%E6%B5%B7%E8%B4%BC/);

  await source.list({
    categoryId: 'sort-popular',
    filters: { tag: 'rexue', country: 'japan', end: '1' },
    page: 2
  });
  assert.match(source.__urls[1], /sort=-views/);
  assert.match(source.__urls[1], /filter%5Btag%5D=rexue/);
  assert.match(source.__urls[1], /filter%5Bcountry%5D=japan/);
  assert.match(source.__urls[1], /filter%5Bend%5D=1/);
  assert.match(source.__urls[1], /page=2/);
});

test('mycomic: 筛选分组从列表页实时抓（含中文标题与选项）', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/comics': snapshot('mycomic_list.html') });
  var filters = await source.filters();
  var titles = filters.groups.map(function (g) { return g.title; });
  assert.equal(JSON.stringify(titles),
    JSON.stringify(['作品类型', '适合受众', '作品地区', '目前进度', '出品年份', '排序']));
  var tag = filters.groups[0];
  assert.ok(tag.options.length >= 30, '作品类型应有 30+ 个选项，实际 ' + tag.options.length);
  assert.ok(tag.options.some(function (o) { return o.id === 'tag=rexue'; }));
  assert.ok(filters.groups[5].options.some(function (o) { return o.id === 'sort-popular'; }));
});

test('mycomic: 详情（标题/封面/作者/状态/简介/标签）+ 目录升序（站点默认倒序）', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/comics/': snapshot('mycomic_detail.html') });
  var detail = await source.detail({ id: '1128' });
  assert.equal(detail.title, 'ONE PIECE航海王');
  assert.equal(detail.extra.author, '尾田榮一郎');
  assert.equal(detail.extra.status, '连载中');
  assert.equal(detail.extra.country, '日本');
  assert.equal(detail.extra.chapters, 473);
  assert.match(detail.subtitle, /共 603 话/);
  assert.ok(detail.tags.indexOf('热血') >= 0);

  var chapters = await source.chapters({ id: '1128' });
  assert.equal(chapters.length, 473);
  assert.equal(chapters[0].title, '第00话前传', '旧→新升序：第一项是前传');
  assert.equal(chapters[chapters.length - 1].id, '817597', '最后一项是最新话');
});

test('mycomic: 正文图片是明文（img.page → biccam.com/chapters/…）', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  stubRoutes(source, { '/chapters/': snapshot('mycomic_chapter.html') });
  var content = await source.content({ id: '1128', chapterId: '817597' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 12);
  assert.match(content.images[0], /^https:\/\/biccam\.com\/chapters\/817597\/1-/);
});

test('mycomic: Cloudflare 挑战页（403）抛 NEED_WEBVIEW_VERIFY 让 App 拉起网页视图', async function () {
  var source = stubStore(loadSource('我的漫画.js'));
  source.http = {
    get: async function () {
      return {
        status: 403,
        body: '<html><head><title>Just a moment...</title></head><body>enable javascript</body></html>'
      };
    }
  };
  await assert.rejects(
    function () { return source.list({ categoryId: 'all', page: 1 }); },
    function (error) {
      assert.match(String(error.message), /NEED_WEBVIEW_VERIFY/);
      return true;
    }
  );
});

// ------------------------------------------------------------------ 金牌影院（jpyy2.com / vv3nwjk.com）

test('jpyy2: 首页 / 列表 / 详情 / 选集 / 播放地址（按快照 JSON 解析）', async function () {
  var source = stubStore(loadSource('金牌影院.js'));

  // 首页：一次请求拿四块（快照里是新电影 / 新剧集 / 综艺 / 动漫、每块 12 条）。
  stubRoutes(source, {
    '/anonymous/v1/home/all/list': snapshot('jpyy2_home.json')
  });
  var boards = await source.home();
  assert.equal(boards.length, 4);
  assert.equal(boards[0].title, '最新电影');
  assert.equal(boards[0].items.length, 12);
  assert.equal(boards[0].items[0].id, '147184');
  assert.equal(boards[0].moreUrl, '1');

  // 分类（快照里是电影/电视剧/综艺/动漫/短剧/体育直播六项）。
  stubRoutes(source, { '/anonymous/get/filer/type': snapshot('jpyy2_types.json') });
  var categories = await source.categories();
  assert.equal(categories.length, 6);
  assert.equal(categories[0].title, '电影');

  // 列表：hasMore 由 totalPage 说话。
  stubRoutes(source, { '/anonymous/video/list': snapshot('jpyy2_list.json') });
  var list = await source.list({ categoryId: '1', page: 1 });
  assert.equal(list.items.length, 24);
  assert.equal(list.hasMore, true);
  assert.equal(list.items[0].id, '146660');

  // 详情 + 选集。
  stubRoutes(source, { '/anonymous/video/detail': snapshot('jpyy2_detail.json') });
  var detail = await source.detail({ id: '146660' });
  assert.equal(detail.title, '猫鼬');
  assert.equal(detail.extra.year, '2026');
  assert.equal(JSON.stringify(detail.tags), JSON.stringify(['动作', '惊悚']));
  var chapters = await source.chapters({ id: '146660' });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].id, '1314815');

  // 播放地址：三条清晰度都在，默认选标清。
  stubRoutes(source, { '/anonymous/v2/video/episode/url': snapshot('jpyy2_episode.json') });
  var content = await source.content({ id: '146660', chapterId: '1314815' });
  assert.equal(content.kind, 'video');
  assert.equal(content.qualities.length, 3);
  assert.match(content.url, /\.m3u8/);
  // 默认线路必须是标清：快照里 480「标清」那条 needLogin=false，720/1080 是 true。
  // （按 needLogin 挑，不按文案——resolutionName 里没有「480」这种数字。）
  var standard = content.qualities.filter(function (q) { return q.label === '标清'; })[0];
  assert.ok(standard, '快照里应有「标清」线路');
  assert.equal(content.url, standard.url, '默认应选标清线路');
  assert.equal(JSON.stringify(content.qualities.map(function (q) { return q.label; })),
    JSON.stringify(['蓝光', '高清', '标清']));
});

test('jpyy2: 分页参数用 pageNum（只传 page 时接口会忽略它、永远返回第 1 页）', async function () {
  var source = stubStore(loadSource('金牌影院.js'));
  stubRoutes(source, {
    '/anonymous/video/list': snapshot('jpyy2_list.json')
  });
  await source.list({ categoryId: '1', page: 3 });
  assert.equal(source.__urls.length, 1);
  assert.match(source.__urls[0], /[?&]pageNum=3(&|$)/);
  assert.ok(source.__urls[0].indexOf('page=3') < 0, '不能再传裸 page 参数');

  // 域的选择：默认从手机域（实测无 WAF）开始。
  assert.match(source.__urls[0], /^https:\/\/m\.vv3nwjk\.com\/api\/mw-movie\//);
});

test('jpyy2: 主域被 WAF 拦下（521）时换下一个域，全挂才抛 WAF_RECAPTCHA_V3', async function () {
  var source = stubStore(loadSource('金牌影院.js'));
  var attempts = [];
  source.http = {
    get: async function (url) {
      attempts.push(url);
      if (url.indexOf('m.vv3nwjk.com') >= 0) {
        return { status: 521, body: '<html><script>window.document.location="/?waf_captcha_marker=abc"</script></html>' };
      }
      return { status: 521, body: '请进行安全验证' };
    }
  };

  await assert.rejects(
    function () { return source.categories(); },
    function (error) {
      assert.match(String(error.message), /WAF_RECAPTCHA_V3/);
      return true;
    }
  );
  // 三个候选域都要试过（手机域 → 主域 → 镜域）。
  assert.equal(attempts.length, 3);
  assert.ok(attempts[0].indexOf('m.vv3nwjk.com') > 0);
  assert.ok(attempts[2].indexOf('jpyy2.com') > 0);
});

test('jpyy2: 手机域可用后记住它（下一次请求不再重复试错）', async function () {
  var source = stubStore(loadSource('金牌影院.js'));
  var attempts = [];
  source.http = {
    get: async function (url) {
      attempts.push(url);
      if (url.indexOf('m.vv3nwjk.com') >= 0) return { status: 200, body: snapshot('jpyy2_types.json') };
      return { status: 521, body: '请进行安全验证' };
    }
  };
  await source.categories();
  assert.equal(attempts.length, 1);
  attempts.length = 0;
  await source.categories();
  assert.equal(attempts.length, 1, '第二次应直接用记住的域');
});


test('mycomic: WebKit序列化后的章节JSON与封面/正文请求头', async function () {
  var source = loadSource('我的漫画.js');
  var raw = source.__chapters(snapshot('mycomic_detail.html'));
  var rendered = snapshot('mycomic_detail.html').replace(/"/g, '&quot;');
  assert.equal(source.__chapters(rendered).length, raw.length);
  assert.ok(raw.length > 0);
  stubBody(source, snapshot('mycomic_list.html'));
  var list = await source.list({page:1});
  assert.match(list.items[0].coverHeaders.Referer, /^https:\/\/mycomic.com/);
  stubBody(source, snapshot('mycomic_chapter.html'));
  var content = await source.content({id:'1',chapterId:'1'});
  assert.equal(Object.keys(content.imageHeaders).length, content.images.length);
});

test('jcomic:签名刷新重读来源页并匹配原图片，不给图床发来源页元数据', async function () {
  var source = loadSource('jcomic_comic.js');
  var html = snapshot('jcomic_cat.html');
  var item = source.__listItems(html)[0];
  var calls = 0;
  source.http = {get: async function(url) { calls++; assert.ok(url.includes('_lume_refresh=')); return {status:200,body:html}; }};
  var argument = {url:item.cover.split('?')[0]+'?expired=1',page:'https://jcomic.net/cat/test/1'};
  assert.equal(await source.refreshImage(argument), item.cover);
  assert.equal(await source.refreshImage(argument), item.cover);
  assert.equal(calls, 1);
  await assert.rejects(()=>source.refreshImage({url:item.cover,page:'https://other.example/'}));
  stubBody(source, snapshot('jcomic_page_single.html'));
  var content = await source.content({id:'/page/test',chapterId:'1'});
  assert.equal(Object.keys(content.imageHeaders).length, content.images.length);
});
