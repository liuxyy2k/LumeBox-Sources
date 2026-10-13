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
  const source = load('video/luttt_video.js');
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
  console.log('video/luttt_video.js：苹果CMS 筛选条解析 + 段位回填通过');
}

async function main() {
  await qTcmsCheck('comic/xman6_comic.js', '韩漫', '更新中');
  await qTcmsCheck('comic/jm18_comic.js', 'all', '连载中');
  await qTcmsCheck('comic/nnhanman_comic.js', 'all', '连载中');
  await lutttCheck();
  console.log('筛选回归全部通过');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
