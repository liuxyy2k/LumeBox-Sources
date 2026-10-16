const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('Canonical manifests point to existing Chinese filenames with matching runtime names and versions', () => {
  let count = 0;
  const ids = new Set();
  for (const entry of ['novels','comics','videos']) {
    const manifest = fs.readFileSync(path.join(root, entry), 'utf8');
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
      assert.ok(!ids.has(metadata.id), 'Each source belongs to one subscription: '+metadata.id);
      ids.add(metadata.id);
      count++;
    }
  }
  assert.equal(count, 45);
});

test('three subscriptions are disjoint, total routes by section, legacy links retain all sources', () => {
  const lines = name => fs.readFileSync(path.join(root,name),'utf8').split(/\r?\n/).filter(line=>line.startsWith('https://'));
  assert.equal(lines('audiobooks').length,0);
  assert.equal(lines('photos').length,1);
  assert.equal(lines('movies').length,3);
  const current=['novels','comics','videos'].flatMap(lines);
  const legacy=['小说订阅.js','漫画订阅.js','视频订阅.js'].flatMap(lines);
  assert.deepEqual(new Set(current),new Set(legacy));
  assert.equal(new Set(current).size,current.length);
  const total=JSON.parse(fs.readFileSync(path.join(root,'all'),'utf8'));
  assert.equal(total.format,'lume.total-subscription');
  assert.equal(total.version,1);
  assert.deepEqual(total.sections, {
    novel:['https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novels'],
    comic:['https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics'],
    video:['https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos'],
  });
  assert.ok(lines('comics').some(line=>line.includes('/photo/')));
  assert.ok(lines('videos').some(line=>line.includes('/movie/')));
});

test('six content directories exist and legacy script URLs mirror canonical files', () => {
  for (const dir of ['novel','audiobook','comic','photo','movie','video']) {
    assert.ok(fs.statSync(path.join(root,dir)).isDirectory());
  }
  for (const [oldDir,newDir,name] of [
    ['comic','photo','Z8PT图库.js'], ['video','movie','瓜子影视.js'],
    ['video','movie','金牌影院.js'], ['video','movie','北觅影视.js'],
  ]) {
    const read = dir => fs.readFileSync(path.join(root,dir,name),'utf8').replace(/\r\n/g,'\n');
    assert.equal(read(oldDir).replace(/^\/\/ 兼容地址镜像[^\n]*\n/m,''), read(newDir));
  }
});
