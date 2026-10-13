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
var test = require('node:test');
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
  var source = stubBody(loadSource('xman6_comic.js'), snapshot('xman6_cat.html'));

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
  var source = stubBody(loadSource('xman6_comic.js'), snapshot('xman6_cat.html'));
  var last = await source.list({ categoryId: '韩漫', page: 61 });
  assert.equal(last.hasMore, false);
  assert.equal(last.items.length, 24);

  stubBody(source, snapshot('xman6_search.html'));
  var search = await source.list({ keyword: '恋', page: 1 });
  assert.equal(search.items.length, 24);
  assert.equal(search.items[0].id, '368296');
});

test('xman6: 详情快照的封面取自 content_thumb（不是推荐位的第一张）', async function () {
  var source = stubBody(loadSource('xman6_comic.js'), snapshot('xman6_detail.html'));
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
  var source = stubBody(loadSource('xman6_comic.js'), snapshot('xman6_read.html'));
  var content = await source.content({ id: '368107', chapterId: 'OVGuHKcFwzFMwDKQlHQZ' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 154);
  assert.match(content.images[0], /^https:\/\/new\.niaopic\.com\//);
  assert.ok(content.images.every(function (url) { return url.indexOf('mc.yandex.ru') < 0; }));
});

test('xman6: 排行榜快照（ranklist_item 另一套标记）解析出条目', async function () {
  var source = stubBody(loadSource('xman6_comic.js'), snapshot('xman6_rank.html'));
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
  var source = loadSource('xnovel_novel.js');

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
  var source = stubBody(loadSource('xnovel_novel.js'), snapshot('xnovel_search.html'));
  var result = await source.list({ keyword: '老师', page: 1 });
  assert.equal(result.items.length, 24);
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].id, 'hi2bb8ww4z');
});

test('xnovel: 目录第 1 章不被底部工具条（「阅读」/「开始阅读」）污染', async function () {
  var source = stubBody(loadSource('xnovel_novel.js'), snapshot('xnovel_detail_short.html'));
  var chapters = await source.chapters({ id: 'hi1ezanput' });
  assert.equal(chapters.length, 3);
  assert.equal(JSON.stringify(chapters.map(function (c) { return c.title; })), JSON.stringify(['上', '下', '后记']));
  assert.equal(JSON.stringify(chapters.map(function (c) { return c.id; })), JSON.stringify(['1', '2', '3']));
});

test('xnovel: 详情（简介 / 作者 / 本作标签）+ 正文段落', async function () {
  var source = stubBody(loadSource('xnovel_novel.js'), snapshot('xnovel_detail.html'));
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
  var source = stubBody(loadSource('xnovel_novel.js'), snapshot('xnovel_blocked.html'));
  await assert.rejects(
    function () { return source.list({ categoryId: 'all', page: 1 }); },
    function (error) {
      assert.match(String(error.message), /国家反诈中心|反诈\/拦截页/);
      return true;
    }
  );
});

// ------------------------------------------------------------------ 金牌影院（jpyy2.com / vv3nwjk.com）

test('jpyy2: 首页 / 列表 / 详情 / 选集 / 播放地址（按快照 JSON 解析）', async function () {
  var source = stubStore(loadSource('jpyy2_video.js'));

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
  var source = stubStore(loadSource('jpyy2_video.js'));
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
  var source = stubStore(loadSource('jpyy2_video.js'));
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
  var source = stubStore(loadSource('jpyy2_video.js'));
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
