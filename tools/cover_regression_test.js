const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = vm.createContext({console});
const script = fs.readFileSync(path.join(__dirname, '../comic/92mh_comic.js'), 'utf8');
vm.runInContext(script, context);
const source = vm.runInContext('LumeSource', context);
const html = `<img src="http://cover.alltucdn.cc/images/etc/browser-firefox.png">
  <img src="https://www.92mh.com/images/92mh-pc.png">
  <img src="loading.gif" data-original="http://cover.alltucdn.cc/cover/2026/abc.jpg">`;
assert.equal(source.__cover(html), 'http://cover.alltucdn.cc/cover/2026/abc.jpg');
assert.equal(source.__cover('<img src="http://cover.alltucdn.cc/images/etc/browser-firefox.png">'), '');
assert.equal(source.__cover('<meta property="og:image" content="https://cdn.example/real.jpg">'), 'https://cdn.example/real.jpg');
console.log('92漫画封面回归通过：过滤浏览器提示图，优先真实封面与延迟加载地址');
