const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../comic/十八漫画.js'), 'utf8');
function fixture() {
  const context = vm.createContext({console});
  vm.runInContext(code, context);
  const source = context.LumeSource;
  source.__host = 'https://18mh.net';
  return source;
}
function check(headers) {
  assert.equal(headers['X-Lume-Image-Encoding'], 'aes-cbc-nopadding');
  assert.equal(headers['X-Lume-Image-Key'], 'f5d965df75336270');
  assert.equal(headers['X-Lume-Image-IV'], '97b60394abc2fbe1');
  assert.match(headers.Referer, /^https:\/\/18mh.net\//);
}
test('十八漫画列表、首页、详情封面都声明网站公开图片解码参数', async () => {
  const source = fixture();
  source.http = { get: async () => ({status:200,body:'<a href="/comic/detail/7"><img alt="测试漫画" data-src="https://images.example/cover.jpg?auth_key=example"></a>'}) };
  const list = await source.list({});
  assert.equal(list.items.length, 1);
  assert.match(list.items[0].cover, /auth_key=example$/);
  check(list.items[0].coverHeaders);
  const home = await source.home();
  for (const board of home) check(board.items[0].coverHeaders);
  source.http = {get:async()=>({status:200,body:'<h1>测试漫画</h1><img class="detail-page__poster-img" data-src="https://images.example/detail.jpg">'})};
  check((await source.detail({id:'/comic/detail/7'})).coverHeaders);
});
test('十八漫画所有正文图片带 NoPadding 参数，保留签名且去重过滤图标', async () => {
  const source = fixture();
  source.http={get:async()=>({status:200,body:'<img data-src="https://images.example/p1.jpg?auth_key=example"><img data-src="https://images.example/p1.jpg?auth_key=example"><img data-original="https://images.example/p2.jpg"><img data-src="/static/icon.jpg">'})};
  const content=await source.content({chapterId:'/comic/chapter/7/1'});
  assert.equal(content.images.length,2);
  for (const url of content.images) check(content.imageHeaders[url]);
  assert.match(content.images[0],/auth_key=example$/);
});
