const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(name) {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../video', name), 'utf8'), context);
  return context.LumeSource;
}
test('xHamster: recover all lazy thumbnails from SSR without evaluating scripts', () => {
  const source = load('xHamster.js');
  const cards = Array.from({length: 50}, (_, i) => ({
    pageURL: 'https://zh.xhamster.com/videos/test-' + i,
    title: '中文标题 ' + i, imageURL: 'https://cdn.example/' + i + '.jpg'
  }));
  const html = '<script>window.initials=' + JSON.stringify({layoutPage:{videoListProps:{videoThumbProps:cards}}}) + ';</script>';
  const result = source.__items(html);
  assert.equal(result.length, 50);
  assert.equal(result.filter(x => x.cover).length, 50);
  assert.equal(new Set(result.map(x => x.id)).size, 50);
});
test('xHamster: Chinese site categories keep their original filter paths', async () => {
  const source = load('xHamster.js');
  source.http = {get: async (url) => {
    assert.equal(new URL(url).host, 'zh.xhamster.com');
    return {status:200,body:'<section><h2>制作</h2><a href="https://zh.xhamster.com/categories/amateur"><h3>业余</h3></a></section>'};
  }};
  const categories = await source.categories();
  assert.equal(categories[1].id, '/categories/amateur');
  assert.equal(categories[1].title, '业余');
});
test('Iwara: custom thumbnail uses image filename, ordinary videos use frame index', () => {
  const source = load('Iwara视频.js');
  assert.equal(source.__cover({customThumbnail:{id:'abc',name:'abc.jpg'},thumbnail:4}),
    'https://i.iwara.tv/image/thumbnail/abc/abc.jpg');
  assert.equal(source.__cover({file:{id:'video'},thumbnail:9}),
    'https://i.iwara.tv/image/thumbnail/video/thumbnail-9.jpg');
});
