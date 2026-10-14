const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

// 92漫画（comic/92mh_comic.js）已从仓库移除：脚本不在就整文件跳过。
if (!fs.existsSync(path.join(__dirname, '../comic/92mh_comic.js'))) {
  console.log('跳过：comic/92mh_comic.js 已从仓库移除');
  process.exit(0);
}

const context = vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../comic/92mh_comic.js'), 'utf8'), context);
const source = vm.runInContext('LumeSource', context);
const html = `
  <a href="/manhua/999/232.html">第232话</a>
  <a href="/manhua/123/30.html"><span>第30话</span></a>
  <a href="/manhua/123/2.html">第2话</a>
  <a href="/manhua/123/1.html">第1话</a>
  <a href="/manhua/123/2.html">第2话</a>
  <a href="/manhua/123/25.html">第2.5话</a>`;
const chapters = source.__chapterLinks(html, 'https://www.92mh.com/manhua/123/');
assert.deepEqual(Array.from(chapters, c => c.title), ['第1话', '第2话', '第2.5话', '第30话']);
assert.equal(source.__chapterLinks('<a href="/manhua/999/1.html">第1话</a>', '/manhua/123/').length, 0);
assert.equal(source.__chapterLinks(html, '123').length, 4);
console.log('92漫画章节回归通过：隔离作品、去重、自然顺序及小数章节');
