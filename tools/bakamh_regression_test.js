const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function source() {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../comic/bakamh_comic.js'), 'utf8'), ctx);
  return ctx.LumeSource;
}
// Small representative Madara markup, not a claim of a live website response.
const card = '<div class="item-thumb"><a href="/manga/sample/" title="Sample"><img data-src="https://img.example/a.jpg"></a></div>';
const reading = '<div class="reading-content"><div class="page-break"><img data-src="https://img.example/1.jpg"></div><div class="page-break"><img src="https://img.example/2.jpg"></div></div>';
test('baka: home pagination advances and image requests carry source headers', async () => {
 const s = source(); s.__host = 'https://bakamh.com'; const requests = [];
 s.http = { get: async (url) => { requests.push(url); return {status:200, body:card}; } };
 const result = await s.list({page:2});
 assert.equal(requests[0], 'https://bakamh.com/page/2/');
 assert.equal(result.items.length, 1);
 assert.equal(result.items[0].cover, 'https://img.example/a.jpg');
 assert.equal(result.items[0].coverHeaders.Referer, 'https://bakamh.com/');
 assert.ok(result.items[0].coverHeaders['User-Agent']);
});
test('baka: category pagination and last-page result', async () => {
 const s = source(); s.__host = 'https://bakamh.com'; let requested;
 s.http = { get: async url => {requested=url;return {status:200,body:card};} };
 const result = await s.list({categoryId:'manhwa',page:3});
 assert.equal(requested, 'https://bakamh.com/manhwa/page/3/');
 assert.equal(result.hasMore,false);
});
test('baka: chapters sorted, recommendations excluded and shortcut titles replaced', () => {
 const s=source(); const html='<a href="/manga/sample/c-2/">观看最新话</a><a href="/manga/sample/c-2/">第2话</a><a href="/manga/other/c-1/">第1话</a><a href="/manga/sample/c-1/">第1话</a>';
 const chapters=s.__chapters(html,'/manga/sample/');
 assert.deepEqual(Array.from(chapters, c=>c.title), ['第1话','第2话']);
});
test('baka: body images and individual chapter referer', async () => {
 const s=source();s.__host='https://bakamh.com';s.http={get:async()=>({status:200,body:reading})};
 const result=await s.content({chapterId:'/manga/sample/c-1/'});
 assert.deepEqual(Array.from(result.images),['https://img.example/1.jpg','https://img.example/2.jpg']);
 for(const url of result.images) assert.equal(result.imageHeaders[url].Referer,'https://bakamh.com/manga/sample/c-1/');
});
test('baka: Cloudflare and locked chapters return actionable errors', async () => {
 const s=source();s.__host='https://bakamh.com';s.http={get:async()=>({status:403,body:'challenge'})};
 await assert.rejects(()=>s.list({page:1}),/NEED_WEBVIEW_VERIFY/);
 s.http={get:async()=>({status:200,body:'<div class="mkjp-ea-lock"></div>'})};
 await assert.rejects(()=>s.content({chapterId:'/manga/sample/c-1/'}),/需要登录/);
});
test('baka: a shared stylesheet mentioning the lock class does not block a public chapter', async () => {
 const s=source();s.http={get:async()=>({status:200,body:'<style>.mkjp-ea-lock{display:none}</style>'+reading})};
 const c=await s.content({chapterId:'/manga/sample/c-1/'});
 assert.equal(c.images.length,2);
});
test('baka: unreachable primary moves to an available mirror', async () => {
 const s=source();const requests=[];s.http={get:async url=>{requests.push(url);return {status:requests.length===1?502:200,body:card};}};
 const host=await s.__pickHost();assert.notEqual(host + '/', requests[0]);assert.equal(host + '/', requests[1]);assert.ok(requests.length>=2);
});
