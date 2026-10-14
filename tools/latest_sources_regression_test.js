/* eslint-env node */

// 第二批「点名源」的快照回归：rouman5（肉漫屋）/ hanime.xyz（H動漫網）/
// 漫小肆（freexcomic 发布页 + jjmhw9.top）/ 少数派文库（sspwk.vip）。
//
// 快照 = 写脚本时站点真实的样子（用真实浏览器取回的完整响应，见 snapshots/）。
// 站点改版后先在这里红，而不是等真机上「列表空了」才发现。

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

/// 按地址分发的响应替身（GET 与 POST 都支持，POST 会把请求体记下来）。
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

// ------------------------------------------------------------------ 肉漫屋（rouman5.com）

test('rouman5: 列表快照 24 条，封面/标题/最新章节都取到；分页有下一页', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books', body: snapshot('rouman5_books.html') },
  ]);
  const result = await source.list({ categoryId: 'all', page: 1 });
  assert.equal(result.items.length, 24);
  const first = result.items[0];
  assert.ok(/^\/books\//.test(first.id), '列表条目 id 应是 /books/<id>: ' + first.id);
  assert.equal(first.title, '自由落体');
  assert.ok(/^https:\/\/[a-z0-9.-]*kelv47\.xyz\/m\//.test(first.cover), '封面走站点图床代理: ' + first.cover);
  assert.ok(first.subtitle && first.subtitle.indexOf('第') === 0, '副标题是最新话: ' + first.subtitle);
  assert.equal(result.hasMore, true);
});

test('rouman5: 第 2 页用 0 基页号（?page=1），内容与第 1 页不同', async () => {
  const page2 = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books', body: snapshot('rouman5_books_p2.html') },
  ]);
  await page2.list({ categoryId: 'all', page: 2 });
  assert.ok(
    page2.__urls.some((row) => row[1].indexOf('/books?page=1') >= 0),
    '第 2 页请求应带 ?page=1（站点页号 0 基）: ' + JSON.stringify(page2.__urls)
  );
  const page1 = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books', body: snapshot('rouman5_books.html') },
  ]);
  const first = await page1.list({ categoryId: 'all', page: 1 });
  const second = await page2.list({ categoryId: 'all', page: 2 });
  assert.notEqual(first.items[0].id, second.items[0].id);
});

test('rouman5: 连载/完结分类带 continued 参数', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books', body: snapshot('rouman5_books.html') },
  ]);
  await source.list({ categoryId: 'ongoing', page: 1 });
  await source.list({ categoryId: 'completed', page: 1 });
  const urls = source.__urls.map((row) => row[1]);
  assert.ok(urls.some((u) => u.indexOf('/books?continued=true') >= 0), urls.join(' | '));
  assert.ok(urls.some((u) => u.indexOf('/books?continued=false') >= 0), urls.join(' | '));
});

test('rouman5: 搜索走 /search?term=（?q= 之类无效），结果来自真响应', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/search?term=', body: snapshot('rouman5_search.html') },
  ]);
  const result = await source.list({ keyword: '爱情', page: 1 });
  assert.ok(source.__urls[0][1].indexOf('/search?term=' + encodeURIComponent('爱情')) >= 0, source.__urls[0][1]);
  assert.equal(result.items.length, 18);
  assert.equal(result.items[0].title, '爱情回收战');
  assert.equal(result.hasMore, true, '搜索结果也有下一页');
});

test('rouman5: 详情快照的标题/封面/简介/信息栏', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books/cmjlosnvg', body: snapshot('rouman5_detail.html') },
  ]);
  const detail = await source.detail({ id: '/books/cmjlosnvg001ys66bcnpnqmgi' });
  assert.equal(detail.title, '自由落体');
  assert.ok(/^https:\/\/[a-z0-9.-]*kelv47\.xyz\/m\//.test(detail.cover), '封面是图床代理地址: ' + detail.cover);
  assert.ok(detail.description && detail.description.length > 40, '简介应取到 og:description');
  assert.ok(detail.subtitle && detail.subtitle.indexOf('作者') >= 0, '信息栏含作者: ' + detail.subtitle);
  assert.ok(/地[區区]/.test(detail.subtitle), detail.subtitle);
});

test('rouman5: 剧集按 0 基序号升序（第一话在最前）', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books/cmjlosnvg', body: snapshot('rouman5_detail.html') },
  ]);
  const chapters = await source.chapters({ id: '/books/cmjlosnvg001ys66bcnpnqmgi' });
  assert.ok(chapters.length >= 16, '章节数: ' + chapters.length);
  assert.equal(chapters[0].id, '/books/cmjlosnvg001ys66bcnpnqmgi/0');
  assert.equal(chapters[0].title, '第1话');
  assert.equal(chapters[1].title, '第2话', '简繁重复的标签应只留前一份: ' + chapters[1].title);
  assert.ok(chapters[chapters.length - 1].id.endsWith('/' + (chapters.length - 1)), chapters[chapters.length - 1].id);
});

test('rouman5: 正文从 SSR 载荷的 imagePaths 取图，广告图被 base64 路径过滤掉', async () => {
  const source = stub(loadSource('comic/rouman5_comic.js'), [
    { match: '/books/cmjlosnvg', body: snapshot('rouman5_read.html') },
  ]);
  const content = await source.content({ id: '/books/cmjlosnvg001ys66bcnpnqmgi', chapterId: '/books/cmjlosnvg001ys66bcnpnqmgi/0' });
  assert.equal(content.kind, 'images');
  assert.equal(content.images.length, 60, '第 1 话实测 60 张');
  assert.ok(content.images.every((u) => u.indexOf('kelv47.xyz') >= 0), content.images[0]);
  // Referer 用章节页自己的地址（部分图床只认同域来源）
  assert.equal(content.imageHeaders[content.images[0]].Referer, 'https://rouman5.com/books/cmjlosnvg001ys66bcnpnqmgi/0');

  // 阅读页里确实挂着广告图（另一个图床域名 towm85.xyz）——一张都不该进来。
  const raw = snapshot('rouman5_read.html');
  assert.ok(raw.indexOf('towm85.xyz') >= 0, '快照里应含广告图（用来证明过滤有效）');
  assert.ok(content.images.every((u) => u.indexOf('towm85.xyz') < 0));

  // 兜底扫描同样只认这本书的图（base64 路径核对）。
  const scanned = source.__scan(raw, 'cmjlosnvg001ys66bcnpnqmgi');
  assert.equal(scanned.length, 60);
  assert.ok(scanned.every((u) => source.__b64Path(u).indexOf('images/cmjlosnvg001ys66bcnpnqmgi/') >= 0));
});

// ------------------------------------------------------------------ H動漫網（hanime.xyz）

test('hanime: 首页快照 24 条（标题/封面/播放量），有下一页', async () => {
  const source = stub(loadSource('video/hanime_video.js'), [
    { match: '/', body: snapshot('hanime_home.html') },
  ]);
  const result = await source.list({ categoryId: '/', page: 1 });
  assert.equal(result.items.length, 24);
  assert.ok(/^\/\d+\.html$/.test(result.items[0].id), result.items[0].id);
  assert.equal(result.items[0].title, '當臣氏動漫高清無碼，女主美到窒息，全程純欲拉絲高潮');
  assert.ok(/^https:\/\//.test(result.items[0].cover), result.items[0].cover);
  assert.ok(/K$/.test(result.items[0].subtitle || ''), '副标题是播放量: ' + result.items[0].subtitle);
  assert.equal(result.hasMore, true);
});

test('hanime: 排序分类带 sort 参数，搜索走 ?q=', async () => {
  const source = stub(loadSource('video/hanime_video.js'), [
    { match: 'sort=hits', body: snapshot('hanime_hits.html') },
    { match: 'q=', body: snapshot('hanime_search.html') },
  ]);
  await source.list({ categoryId: '/?sort=hits', page: 1 });
  assert.ok(source.__urls[0][1].indexOf('sort=hits') >= 0, source.__urls[0][1]);
  const search = await source.list({ keyword: 'VAM', page: 1 });
  assert.ok(source.__urls[1][1].indexOf('q=VAM') >= 0, source.__urls[1][1]);
  assert.equal(search.items.length, 24);
  // 站点的搜索命中它自己那栏短名（缩略图 alt），显示标题里未必带关键词：
  // 快照的页面标题就是「VAM - H動漫網」，条目数 24 说明确实按关键词返回了一整页。
  assert.ok(/<title>VAM/.test(snapshot('hanime_search.html')), '快照应是 VAM 的搜索结果页');
});

test('hanime: 详细页的标题/封面（video poster）与 m3u8 播放地址', async () => {
  const source = stub(loadSource('video/hanime_video.js'), [
    { match: '/9434719.html', body: snapshot('hanime_detail.html') },
  ]);
  const detail = await source.detail({ id: '/9434719.html' });
  assert.equal(detail.title, '當臣氏動漫高清無碼，女主美到窒息，全程純欲拉絲高潮');
  assert.ok(/^https:\/\//.test(detail.cover), '封面来自 video poster: ' + detail.cover);
  assert.ok(detail.subtitle && detail.subtitle.length > 4, '副标题: ' + detail.subtitle);

  const chapters = await source.chapters({ id: '/9434719.html' });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, '播放');

  const content = await source.content({ id: '/9434719.html', chapterId: '/9434719.html' });
  assert.equal(content.kind, 'video');
  assert.ok(/\.m3u8/.test(content.url), '播放地址应是 m3u8: ' + content.url);
  assert.ok(content.url.indexOf('bf.qugt.com') >= 0, content.url);
  assert.ok(content.qualities.length === 1 && content.qualities[0].url === content.url);
  assert.ok(content.headers && /hanime\.xyz/.test(content.headers.Referer || ''), JSON.stringify(content.headers));
});

// ------------------------------------------------------------------ 漫小肆（freexcomic 发布页 → jjmhw9.top）

test('漫小肆: 从发布页读出当前站址再解析列表（封面取 background-image）', async () => {
  const source = stub(loadSource('comic/fxcomic_comic.js'), [
    { match: 'freexcomic.com', body: snapshot('fxcomic_publish.html') },
    { match: /jjmhw9\.top\/$/, body: snapshot('fxcomic_booklist.html') },
    { match: 'booklist', body: snapshot('fxcomic_booklist.html') },
  ]);
  const result = await source.list({ categoryId: 'all', page: 1 });
  assert.ok(source.__urls[0][1].indexOf('freexcomic.com') >= 0, '先读发布页: ' + source.__urls[0][1]);
  assert.equal(result.items.length, 28);
  assert.equal(result.items[0].id, '/book/1248');
  assert.equal(result.items[0].title, '一家有多妻');
  assert.ok(/\/static\/upload\/book\/1248\/cover\.jpg$/.test(result.items[0].cover), '封面来自 CSS 背景图: ' + result.items[0].cover);
  assert.equal(result.hasMore, true);
});

test('漫小肆: 连载/完结/更新三个入口与搜索', async () => {
  const source = stub(loadSource('comic/fxcomic_comic.js'), [
    { match: 'freexcomic.com', body: snapshot('fxcomic_publish.html') },
    { match: /jjmhw9\.top\/$/, body: snapshot('fxcomic_booklist.html') },
    { match: 'end=0', body: snapshot('fxcomic_booklist.html') },
    { match: 'end=1', body: snapshot('fxcomic_booklist.html') },
    { match: '/update', body: snapshot('fxcomic_update.html') },
    { match: '/search?keyword=', body: snapshot('fxcomic_search.html') },
  ]);
  await source.list({ categoryId: 'ongoing', page: 1 });
  await source.list({ categoryId: 'completed', page: 1 });
  const updated = await source.list({ categoryId: 'update', page: 1 });
  assert.equal(updated.items.length, 22);
  const search = await source.list({ keyword: '秘密', page: 1 });
  assert.equal(search.items.length, 20);
  assert.ok(search.items[0].title.length > 1, search.items[0].title);
  const urls = source.__urls.map((row) => row[1]);
  assert.ok(urls.some((u) => u.indexOf('end=0') >= 0), urls.join(' | '));
  assert.ok(urls.some((u) => u.indexOf('end=1') >= 0), urls.join(' | '));
  assert.ok(urls.some((u) => u.indexOf('keyword=' + encodeURIComponent('秘密')) >= 0), urls.join(' | '));
});

test('漫小肆: 详情快照的标题/封面/简介/标签，剧集按章节号升序', async () => {
  const source = stub(loadSource('comic/fxcomic_comic.js'), [
    { match: 'freexcomic.com', body: snapshot('fxcomic_publish.html') },
    { match: /jjmhw9\.top\/$/, body: snapshot('fxcomic_detail.html') },
    { match: '/book/1236', body: snapshot('fxcomic_detail.html') },
  ]);
  const detail = await source.detail({ id: '/book/1236' });
  assert.equal(detail.title, '一發致富');
  assert.ok(/\/static\/upload\/book\/1236\/cover\.jpg$/.test(detail.cover), detail.cover);
  assert.ok(detail.description && detail.description.indexOf('虛擬貨幣') >= 0, '简介: ' + detail.description);
  assert.ok(detail.subtitle && detail.subtitle.indexOf('作者') >= 0, '信息栏含作者: ' + detail.subtitle);
  assert.ok((detail.tags || []).indexOf('都市') >= 0, '标签: ' + JSON.stringify(detail.tags));

  const chapters = await source.chapters({ id: '/book/1236' });
  assert.equal(chapters.length, 11);
  assert.equal(chapters[0].id, '/chapter/57983');
  assert.equal(chapters[0].title, '第1話-代打手槍的正妹');
  const nums = chapters.map((c) => Number(c.id.replace('/chapter/', '')));
  assert.deepEqual(nums.slice().sort((a, b) => a - b), nums, '应按章节号升序');
});

test('漫小肆: 正文快照只收本站图床（二维码那张不算），并带 Referer', async () => {
  const source = stub(loadSource('comic/fxcomic_comic.js'), [
    { match: 'freexcomic.com', body: snapshot('fxcomic_publish.html') },
    { match: /jjmhw9\.top\/$/, body: snapshot('fxcomic_read.html') },
    { match: '/chapter/57983', body: snapshot('fxcomic_read.html') },
  ]);
  const content = await source.content({ id: '/book/1236', chapterId: '/chapter/57983' });
  assert.equal(content.kind, 'images');
  assert.ok(content.images.length >= 7, '正文图数量: ' + content.images.length);
  assert.ok(content.images.every((u) => u.indexOf('/static/upload/book/1236/57983/') >= 0), content.images.join('\n'));
  assert.ok(content.images.every((u) => u.indexOf('wxqrcode') < 0));
  assert.equal(content.imageHeaders[content.images[0]].Referer.indexOf('jjmhw9.top') >= 0, true);
});

// ------------------------------------------------------------------ 少数派文库（sspwk.vip）

test('sspwk: 分类页快照 12 条（书名/作者/时间），有下一页', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/booksort/6/1.html', body: snapshot('sspwk_booksort.html') },
  ]);
  const result = await source.list({ categoryId: '6', page: 1 });
  assert.equal(result.items.length, 12);
  assert.ok(/^\/novel\/\d+\.html$/.test(result.items[0].id), result.items[0].id);
  assert.ok(result.items[0].title.length > 1, result.items[0].title);
  assert.ok(/^作者：/.test(result.items[0].subtitle || ''), result.items[0].subtitle);
  assert.equal(result.items[0].cover, null, '小说站没有封面，如实为 null');
  assert.equal(result.hasMore, true);
});

test('sspwk: 搜索是 POST /search/（searchkey），GET 参数无效', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/search/', body: snapshot('sspwk_search.html') },
  ]);
  const result = await source.list({ keyword: '秘密', page: 1 });
  const post = source.__urls.find((row) => row[0] === 'POST');
  assert.ok(post, '应发 POST: ' + JSON.stringify(source.__urls));
  assert.ok(post[1].indexOf('/search/') >= 0, post[1]);
  assert.ok(post[2].indexOf('searchkey=' + encodeURIComponent('秘密')) >= 0, post[2]);
  assert.ok(post[2].indexOf('searchtype=all') >= 0, post[2]);
  assert.ok(result.items.length >= 6, '结果条数: ' + result.items.length);
  assert.equal(result.items[0].title, '怀孕女星的秘密');
  assert.ok(/^\/novel\/\d+\.html$/.test(result.items[0].id), result.items[0].id);
  assert.equal(result.hasMore, false);
});

test('sspwk: 详情快照的书名（《书名》简介）、信息栏与简介', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/novel/161813.html', body: snapshot('sspwk_detail.html') },
  ]);
  const detail = await source.detail({ id: '/novel/161813.html' });
  assert.equal(detail.title, '某平行世界的男神[综]');
  assert.ok(detail.subtitle && detail.subtitle.indexOf('作者：璎珞姒玉') >= 0, detail.subtitle);
  assert.ok(detail.subtitle.indexOf('类别：耽美小说') >= 0, detail.subtitle);
  assert.ok(detail.description && detail.description.indexOf('独立的世界') >= 0, '简介应取到: ' + detail.description);
  assert.equal(detail.cover, null);
});

test('sspwk: 目录逐页收齐，遇到整页重复就停（站点给的页数上限可能偏大）', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/indexlist/161813/', body: snapshot('sspwk_indexlist.html') },
  ]);
  const chapters = await source.chapters({ id: '/novel/161813.html' });
  assert.equal(chapters.length, 30, '第 1 页 30 章');
  assert.equal(chapters[0].id, '/novel/161813/19167169.html');
  assert.equal(chapters[0].title, '分节阅读_1', '书名前缀应去掉: ' + chapters[0].title);
  assert.equal(chapters[29].title, '分节阅读_30');
  const urls = source.__urls.map((row) => row[1]);
  assert.ok(urls.some((u) => u.indexOf('/indexlist/161813/1/') >= 0), urls.join(' | '));
  assert.ok(urls.some((u) => u.indexOf('/indexlist/161813/2/') >= 0), '第 2 页也要请求: ' + urls.join(' | '));
  assert.ok(urls.length <= 5, '一整批都是重复就停，不该把 21 页全翻完: ' + urls.length);
});

test('sspwk: 目录跨页累积（第 2 页是新章节时接着收）', async () => {
  const page = (label, links) =>
    '<html><body><select><option value="/indexlist/1/1/">1 - 30章</option>' +
    '<option value="/indexlist/1/2/">31 - 60章</option></select>' +
    '<ul class="list_li" id="jsList1">' +
    links.map((n) => `<li class="two"><a href="/novel/1/${n}.html">书名_分节阅读_${n}</a></li>`).join('') +
    '</ul></body></html>';
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/indexlist/1/1/', body: page('a', [1001, 1003]) },
    { match: '/indexlist/1/2/', body: page('b', [1005, 1007]) },
  ]);
  const chapters = await source.chapters({ id: '/novel/1.html' });
  assert.equal(chapters.length, 4);
  assert.equal(chapters[3].id, '/novel/1/1007.html');
  assert.equal(chapters[3].title, '分节阅读_1007');
});

test('sspwk: 正文取 div#nr1 的段落，站点自己那条「最新通知」要剔掉', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    { match: '/novel/161813/19167169.html', body: snapshot('sspwk_chapter.html') },
  ]);
  const content = await source.content({ id: '/novel/161813.html', chapterId: '/novel/161813/19167169.html' });
  assert.equal(content.kind, 'text');
  assert.ok(content.text.length > 200, '正文长度: ' + content.text.length);
  assert.ok(content.text.indexOf('安泽一') >= 0, '正文内容: ' + content.text.slice(0, 60));
  assert.ok(content.text.indexOf('最新通知') < 0, '站点公告不该混进正文');
  assert.ok(content.text.indexOf('网址已经更换') < 0);
});

test('sspwk: 首页给「最新小说」板块，分类 12 个', async () => {
  const source = stub(loadSource('novel/sspwk_novel.js'), [
    // 具体地址排在域名兜底之前：路由按顺序匹配。
    { match: '/booksort/3/1.html', body: snapshot('sspwk_booksort.html') },
    { match: '/booksort/5/1.html', body: snapshot('sspwk_booksort.html') },
    { match: 'sspwk.vip/', body: snapshot('sspwk_home.html') },
  ]);
  const boards = await source.home();
  assert.equal(boards.length, 3, '最新小说 + 玄幻 + 言情');
  assert.equal(boards[0].title, '最新小说');
  assert.ok(boards[0].items.length >= 8, '最新小说条数: ' + boards[0].items.length);
  const categories = await source.categories();
  assert.equal(categories.length, 12);
  assert.equal(categories[0].title, '耽美');
});

// ------------------------------------------------------------------ 契约：四个源都提供 home / categories

test('四个新源都满足源契约，且 home() 在真快照上跑得出板块', async () => {
  const cases = [
    {
      file: 'comic/rouman5_comic.js',
      id: 'rouman5_comic',
      category: 'comic',
      routes: [
        { match: '/books', body: snapshot('rouman5_books.html') },
      ],
      boards: 3,
    },
    {
      file: 'video/hanime_video.js',
      id: 'hanime_video',
      category: 'video',
      routes: [{ match: '/', body: snapshot('hanime_home.html') }],
      boards: 4,
    },
    {
      file: 'comic/fxcomic_comic.js',
      id: 'fxcomic_comic',
      category: 'comic',
      routes: [
        { match: 'freexcomic.com', body: snapshot('fxcomic_publish.html') },
        { match: /jjmhw9\.top\/$/, body: snapshot('fxcomic_booklist.html') },
        { match: 'booklist', body: snapshot('fxcomic_booklist.html') },
        { match: '/update', body: snapshot('fxcomic_update.html') },
      ],
      // 这块桩只覆盖「全部」与「更新」两个入口，另外两个入口的响应没派上——被
      // home() 的逐块 try/catch 跳过；而「更新」与「全部」同源时脚本会去重，所以是 2 块。
      boards: 2,
    },
    {
      file: 'novel/sspwk_novel.js',
      id: 'sspwk_novel',
      category: 'novel',
      routes: [
        // 具体地址排在域名兜底之前：路由按顺序匹配。
        { match: '/booksort/3/1.html', body: snapshot('sspwk_booksort.html') },
        { match: '/booksort/5/1.html', body: snapshot('sspwk_booksort.html') },
        { match: 'sspwk.vip/', body: snapshot('sspwk_home.html') },
      ],
      boards: 3,
    },
  ];
  for (const item of cases) {
    const source = stub(loadSource(item.file), item.routes);
    assert.equal(source.id, item.id, item.file);
    assert.equal(source.category, item.category, item.file);
    for (const method of ['home', 'categories', 'list', 'detail', 'chapters', 'content']) {
      assert.equal(typeof source[method], 'function', item.file + ':' + method);
    }
    const categories = await source.categories();
    assert.ok(categories.length >= 3, item.file + ' 分类数: ' + categories.length);
    assert.ok(categories.every((c) => c.id !== undefined && c.title), item.file + ' 分类项要有 id/title');
    const boards = await source.home();
    assert.ok(boards.length >= item.boards, item.file + ' 板块数: ' + boards.length);
    for (const board of boards) {
      assert.ok(board.title && Array.isArray(board.items) && board.items.length, item.file + ' 板块要带标题与条目');
      assert.ok(board.items.every((i) => i.id && i.title), item.file + ' 条目要有 id/title');
    }
  }
});
