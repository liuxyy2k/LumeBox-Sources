// 四个源的「筛选」回归：状态/排序（qTcms 系）与苹果CMS 的筛选条。
//
// 覆盖：
//   · xman6 / jm18 / nnhanman —— 站点 URL 里的 ob（排序）/ st（状态）段，静态两组 + 改写正确；
//   · luttt —— 从列表页快照里实时抓筛选条（地区/年份/语言/字母/排序），选项 id 是「段位|值」，
//     list() 按段位回填成苹果CMS 的 12 段 URL。
//
// 跑法：node tools/source_facets_test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function load(relative) {
  const context = vm.createContext({ console, setTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context);
  return context.LumeSource;
}

function stubGet(source, body) {
  const urls = [];
  source.http = {
    get: async (url) => {
      urls.push(url);
      const text = typeof body === 'function' ? body(url) : body;
      return { status: 200, body: text };
    }
  };
  return urls;
}

function groupTitles(value) {
  const groups = Array.isArray(value) ? value : (value && value.groups) || [];
  return groups.map((g) => `${g.id}:${g.title}(${g.options.length})`);
}

async function qTcmsCheck(file, param, expectStatus) {
  const source = load(file);
  const urls = stubGet(source, '<html></html>');
  const filters = await source.filters();
  const groups = Array.isArray(filters) ? filters : filters.groups;
  // vm 里的数组原型与宿主不同，比较用 JSON（与本仓库既有用例一致）。
  const ids = (list) => JSON.stringify(Array.from(list));
  assert.equal(ids(groups.map((g) => g.id)), ids(['status', 'sort']), `${file} 分组`);
  assert.equal(ids(groups[0].options.map((o) => o.id)), ids(['all', 'serialized', 'completed']));
  assert.equal(ids(groups[1].options.map((o) => o.id)), ids(['time', 'hits']));
  assert.equal(groups[0].options[1].title, expectStatus, `${file} 状态文案跟站点一致`);

  await source.list({ categoryId: param, page: 2, filters: { status: 'completed', sort: 'hits' } });
  const url = urls[urls.length - 1];
  assert.match(url, /\/ob\/hits\/st\/completed(\/page\/2)?$/, `${file} 筛选拼进地址: ${url}`);

  // 认不出的值退回默认（all/time），不把任意串拼进地址。
  await source.list({ categoryId: param, page: 1, filters: { status: 'BAD', sort: 'BAD' } });
  assert.match(urls[urls.length - 1], /\/ob\/time\/st\/all/, `${file} 白名单兜底`);
  // 不带筛选时地址不变（回归：别把默认值写坏）。
  await source.list({ categoryId: param, page: 1 });
  assert.match(urls[urls.length - 1], /\/ob\/time\/st\/all/, `${file} 无筛选默认`);
  console.log(`${file}：状态/排序两组 + 地址改写通过`);
}

async function lutttCheck() {
  const source = load('video/北觅影视.js');
  const snapshot = fs.readFileSync(path.join(root, 'snapshots', 'luttt_filters.html'), 'utf8');
  const urls = stubGet(source, snapshot);

  const groups = await source.filters();
  const titles = groups.map((g) => g.title);
  assert.equal(JSON.stringify(titles), JSON.stringify(['地区', '年份', '语言', '字母', '排序']), 'luttt 筛选行');
  const area = groups.find((g) => g.title === '地区');
  assert.ok(area.options.some((o) => o.title === '大陆'), '地区含大陆');
  assert.match(area.options.find((o) => o.title === '大陆').id, /^\d+\|大陆$/, '选项 id = 段位|值');
  const sort = groups.find((g) => g.title === '排序');
  assert.equal(JSON.stringify(Array.from(sort.options.map((o) => o.title))),
    JSON.stringify(['按最新', '按最热', '按评分']));

  // 按段位回填：地区(段1) + 排序(段2) → /vodshow/1-大陆-hits---------…（12 段）
  await source.list({ categoryId: '1', page: 1, filters: { area: '1|大陆', sort: '2|hits' } });
  const filtered = urls[urls.length - 1];
  assert.match(filtered, /\/vodshow\/1-%E5%A4%A7%E9%99%86-hits---------.html$/, '地区+排序回填');
  // 页码写在第 8 段；第 1 页留空（站点自己的形态）。
  await source.list({ categoryId: '1', page: 3, filters: { sort: '2|score' } });
  assert.match(urls[urls.length - 1], /\/vodshow\/1--score------3---\.html$/, '页码在第 8 段');
  // 越界段位不写（白名单 1..11，且不允许覆盖页码段）。
  await source.list({ categoryId: '1', page: 1, filters: { bad: '8|9' } });
  assert.match(urls[urls.length - 1], /\/vodshow\/1-----------.html$/, '第 8 段不被筛选覆盖');
  console.log('video/北觅影视.js：苹果CMS 筛选条解析 + 段位回填通过');
}

/// 禁漫天堂（18comic）：分类来自站点自己的书库/排行/标签地址，筛选是 URL 里的
/// t=（更新）/o=（排序）/shunt=（分流）。检查两组契约：
///   1. 筛选组与白名单改写；2. 分类数量与「分类地址自己带的 o=/t= 不被抹掉」。
async function jmcomicCheck() {
  const source = load('comic/禁漫天堂.js');
  const urls = stubGet(source, '<div class="thumb-overlay-albums">' +
    '<a href="/album/1"><img title="T" data-src="https://cdn.example/1.jpg"></a></div>');

  const groups = (await source.filters()).groups;
  const ids = (list) => JSON.stringify(Array.from(list));
  assert.equal(ids(groups.map((g) => g.id)), ids(['time', 'sort', 'shunt']), 'jmcomic 分组');
  assert.equal(ids(groups[1].options.map((o) => o.id)),
    ids(['mr', 'mv', 'mp', 'tr', 'md', 'tf']), '排序六个值来自站点自己的 o=');
  assert.equal(ids(groups[0].options.map((o) => o.id)), ids(['a', 't', 'w', 'm']));

  const categories = await source.categories();
  assert.ok(categories.length >= 40, `分类要给全（当前 ${categories.length} 条）`);
  for (const need of ['/albums/doujin', '/albums/single', '/albums/short', '/albums/hanman',
    '/albums/meiman', '/albums/another', '/albums/another/sub/cosplay']) {
    assert.ok(categories.some((c) => c.id === need), `缺分类 ${need}`);
  }
  assert.ok(categories.some((c) => c.id.indexOf('/search/photos?search_query=') === 0),
    '标签类分类走站点自己的搜索页');

  // 筛选写进地址；认不出的值不拼进去。
  await source.list({ categoryId: '/albums/doujin', page: 2,
    filters: { time: 'w', sort: 'mv', shunt: '2' } });
  assert.match(urls[urls.length - 1], /\/albums\/doujin\?t=w&o=mv&shunt=2&page=2$/,
    `筛选拼进地址: ${urls[urls.length - 1]}`);
  await source.list({ categoryId: '/albums/doujin', page: 1,
    filters: { time: 'BAD', sort: 'BAD', shunt: '9' } });
  assert.match(urls[urls.length - 1], /\/albums\/doujin\?page=1$/, '白名单兜底');
  // 排行分类自带的 o=/t= 不能被「没选排序」抹掉（否则月排行退化成默认）。
  await source.list({ categoryId: '/albums?o=mv&t=m', page: 1, filters: { time: 'a' } });
  assert.match(urls[urls.length - 1], /\/albums\?o=mv&t=a&page=1$/, '分类自带的排序保留');
  console.log('comic/禁漫天堂.js：分类给全 + 更新/排序/分流三组改写通过');
}

/// 漫蛙 / 漫小肆（同一套 manga-list-2 模板的兄弟站）：分类 + 五组/三组筛选 +
/// 卡片解析。两个站都在 2026-10-15 换过模板，这一份把「新卡片结构」钉住。
async function manwaCheck() {
  const source = load('comic/漫蛙.js');
  const card = '<ul class="manga-list-2"><li><div class="manga-list-2-cover">' +
    '<a href="/book/543350" title="示例作品"><img class="manga-list-2-cover-img" ' +
    'src="https://mwappimgs.cc/static/upload3/book/id/543350/cover_1.png"></a></div>' +
    '<p class="manga-list-2-title"><a href="/book/543350">示例作品</a></p></li></ul>' +
    '<ul class="pagination2"><li><a>1</a></li><li><a data-page="2">2</a></li></ul>';
  const urls = stubGet(source, card);

  const groups = (await source.filters()).groups;
  const ids = (list) => JSON.stringify(Array.from(list));
  assert.equal(ids(groups.map((g) => g.id)), ids(['gender', 'area', 'end', 'sort', 'tag']), 'manwa 五组');
  assert.equal(groups[0].options[0].id, '-1', '分类的「全部」是站点自己的 -1');
  assert.equal(groups[2].options[1].id, '2', '状态沿用站点自己的值');
  assert.equal(groups[4].options.length, 16, '标签排给全');
  assert.ok((await source.categories()).length >= 5, '站点入口（推荐/全部/更新/排行/完结榜）');

  await source.list({ categoryId: '/booklist', page: 2,
    filters: { gender: '1', area: '2', end: '2', sort: '1', tag: '巨乳' } });
  assert.match(urls[urls.length - 1], /\/booklist\?tag=%E5%B7%A8%E4%B9%B3&gender=1&area=2&end=2&sort=1&page=2$/,
    `筛选拼进书库地址: ${urls[urls.length - 1]}`);
  // App 会把空 id 的「全部」换成标题再送回来：必须当作没选，不能拼成 tag=全部。
  await source.list({ categoryId: '/rank?type=end', page: 1,
    filters: { gender: '', area: '全部', end: '', sort: '', tag: '全部' } });
  assert.match(urls[urls.length - 1], /\/rank\?type=end$/, '「全部」不下发');
  // 认不出的值不拼进地址。
  await source.list({ categoryId: '/booklist', page: 1, filters: { gender: 'BAD', area: '99' } });
  assert.match(urls[urls.length - 1], /\/booklist$/, '白名单兜底');

  const page = await source.list({ categoryId: '/booklist', page: 1 });
  assert.equal(page.items[0].id, '/book/543350');
  assert.equal(page.items[0].title, '示例作品');
  assert.equal(page.items[0].cover,
    'https://mwappimgs.cc/static/upload3/book/id/543350/cover_1.png');
  assert.equal(page.hasMore, true, '分页器是 data-page（没有 href），也要认出来');

  // 详情封面只认站点图床：页头的 logo（new_logo.svg）不能当封面（真机日志里
  // 一串「图片解码失败: new_logo.svg」的根因）。
  const detailSource = load('comic/漫蛙.js');
  stubGet(detailSource, '<div class="normal-top"><a href="/"><img src="https://mwappimgs.cc/static/images/new_logo.svg?v=2"></a></div>' +
    '<div class="detail-main"><h1 class="detail-main-info-title">示例作品</h1>' +
    '<div class="detail-main-cover"><img class="lazy" data-original="https://mwappimgs.cc/static/upload3/book/id/543350/cover_1.png?v=2" src="https://mwappimgs.cc/static/images/imagecover_s.png"></div></div>');
  const detail = await detailSource.detail({ id: '/book/543350' });
  assert.equal(detail.title, '示例作品');
  assert.equal(detail.cover, 'https://mwappimgs.cc/static/upload3/book/id/543350/cover_1.png?v=2');
  console.log('comic/漫蛙.js：分类/五组筛选/卡片与 data-page 分页/详情封面通过');
}

async function fxcomicCheck() {
  const source = load('comic/漫小肆.js');
  const card = '<ul class="manga-list-2"><li><div class="manga-list-2-cover">' +
    '<a href="/book/1248"><img class="manga-list-2-cover-img" ' +
    'data-original="https://www.jjmhw9.top/static/upload/book/1248/cover.jpg"></a></div>' +
    '<p class="manga-list-2-title"><a href="/book/1248" title="示例作品">示例作品</a></p>' +
    '<p class="manga-list-2-tip">简介</p></li></ul>' +
    '<div class="pagination"><a href="/booklist/?page=2">下一页</a></div>';
  const urls = stubGet(source, card);

  const groups = (await source.filters()).groups;
  const ids = (list) => JSON.stringify(Array.from(list));
  assert.equal(ids(groups.map((g) => g.id)), ids(['end', 'area', 'tag']), '漫小肆三组');
  assert.equal(groups[2].options.length, 23, '分类（标签）给全');
  assert.ok((await source.categories()).length >= 6, '站点入口给全');

  await source.list({ categoryId: '/booklist', page: 2,
    filters: { tag: '巨乳', area: '1', end: '0' } });
  assert.match(urls[urls.length - 1], /\/booklist\?tag=%E5%B7%A8%E4%B9%B3&area=1&end=0&page=2$/,
    `筛选拼进书库地址: ${urls[urls.length - 1]}`);
  await source.list({ categoryId: '/booklist?end=1', page: 1,
    filters: { tag: '全部', area: '-1', end: '-1' } });
  assert.match(urls[urls.length - 1], /\/booklist\?end=1$/, '「全部」不下发');
  await source.list({ categoryId: '/update', page: 3 });
  assert.match(urls[urls.length - 1], /\/update\?page=3$/, '站点自己的入口原样进');

  const page = await source.list({ categoryId: '/booklist', page: 1 });
  assert.equal(page.items[0].id, '/book/1248');
  assert.equal(page.items[0].title, '示例作品');
  assert.equal(page.items[0].cover,
    'https://www.jjmhw9.top/static/upload/book/1248/cover.jpg');
  assert.equal(page.hasMore, true, '下一页链接要认出来');

  // 详情页 2026-10-15 已换模板：标题/封面/简介/标签都要取到，不能只回落到 <title>。
  const detailSource = load('comic/漫小肆.js');
  stubGet(detailSource, '<div class="detail-main">' +
    '<div class="detail-main-cover"><img class="lazy" data-original="https://www.jjmhw9.top/static/upload/book/1248/cover.jpg"></div>' +
    '<div class="detail-main-info"><p class="detail-main-info-title">一家有多妻</p>' +
    '<p class="detail-main-info-author">作者：<a href="#">CHILLDAE</a></p>' +
    '<p class="detail-main-info-class"><span><a href="/booklist/?tag=都市">都市</a></span></p></div></div>' +
    '<p class="detail-desc">坐擁龐大資產的房地產富豪，身邊同時有三個美女妻子</p>');
  const detail = await detailSource.detail({ id: '/book/1248' });
  assert.equal(detail.title, '一家有多妻');
  assert.equal(detail.cover, 'https://www.jjmhw9.top/static/upload/book/1248/cover.jpg');
  assert.match(detail.subtitle || '', /作者/);
  assert.equal(detail.description, '坐擁龐大資產的房地產富豪，身邊同時有三個美女妻子');
  assert.equal(JSON.stringify(Array.from(detail.tags)), JSON.stringify(['都市']));
  console.log('comic/漫小肆.js：分类/三组筛选/新卡片与新详情模板通过');
}

async function main() {
  await jmcomicCheck();
  await manwaCheck();
  await fxcomicCheck();
  await qTcmsCheck('comic/X漫.js', '韩漫', '更新中');
  await qTcmsCheck('comic/18禁漫.js', 'all', '连载中');
  await qTcmsCheck('comic/鸟鸟韩漫.js', 'all', '连载中');
  await lutttCheck();
  console.log('筛选回归全部通过');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
