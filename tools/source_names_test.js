const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('Canonical manifests point to existing Chinese filenames with matching runtime names and versions', () => {
  let count = 0;
  for (const [entry,label] of [['novels','小说'],['comics','漫画'],['videos','视频']]) {
    const manifest = fs.readFileSync(path.join(root, entry), 'utf8');
    assert.equal(manifest, fs.readFileSync(path.join(root, label + '订阅.js'), 'utf8'));
    assert.ok(fs.readFileSync(path.join(root,'README.md'),'utf8').includes('/main/'+entry+')'));
    for (const line of manifest.split(/\r?\n/).filter(x => x.startsWith('https://'))) {
      const relative = decodeURIComponent(new URL(line).pathname.split('/main/')[1]);
      assert.match(path.basename(relative), /[\u4e00-\u9fff]/);
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      const metadata = JSON.parse(source.match(/\/\/ LumeSource: (\{[^\n]+\})/)[1]);
      const context = {};
      vm.runInNewContext(source, context, {timeout:5000});
      assert.equal(context.LumeSource.name, metadata.name, relative);
      assert.equal(context.LumeSource.version, metadata.version, relative);
      count++;
    }
  }
  assert.equal(count, 40);
});
