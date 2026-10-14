const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function load(id, category, pages) {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', category,
    id + '_' + category + '.js'), 'utf8'), context, {timeout: 5000});
  context.LumeSource.http = {get: async url => {
    const p = new URL(url).pathname;
    assert.ok(p in pages, 'unexpected route: ' + p);
    return {status: 200, body: pages[p]};
  }};
  return context.LumeSource;
}

test('all requested adapters expose the source contract without remote imports', () => {
  for (const [category, ids] of Object.entries({
    comic: ['nnmh', 'mmcg18', 'sansi', 'manwa', 'z8pt', 'jmcomic', 'bakamh',
      'fxcomic', 'rouman5', 'cartoon18', 'relamanhua', 'mh18'],
    novel: ['alicesw', 'book18', 'jinshuge', 'xchina', 'hhhbook', 'hlib', 'aaccoo'],
    video: ['asmrhoney', 'hanime1'],
  })) for (const id of ids) {
    const s = load(id, category, {});
    assert.equal(s.id, id + '_' + category);
    for (const method of ['home', 'categories', 'list', 'detail', 'chapters', 'content']) {
      assert.equal(typeof s[method], 'function', id + ':' + method);
    }
  }
});

test('JM strip count matches the public reader boundary rules and independent MD5', () => {
  const s=load('jmcomic','comic',{});
  for(const id of [220979,220980,268849,268850,421925,421926,1452925]) {
    const hash=crypto.createHash('md5').update(String(id)+'00001').digest('hex');
    const expected=id<220980?0:id<268850?10:(hash.slice(-1).charCodeAt(0)%(id>=421926?8:10)+1)*2;
    assert.equal(s.__strips(id,'00001.webp',220980),expected);
  }
  assert.equal(s.__strips(1452925,'00001.gif',220980),0);
});

test('JM reader keeps only this chapter images and adds private strip metadata', async () => {
  const s=load('jmcomic','comic',{'/photo/1452925':
    '<script>var scramble_id=220980;var aid=1452925;</script>'+
    '<div id="00001.webp"><img data-original="https://cdn.example/media/photos/1452925/00001.webp"></div>'+
    '<img src="https://cdn.example/media/photos/999/00001.webp"><img src="logo.png">'});
  const c=await s.content({chapterId:'/photo/1452925'});
  assert.equal(c.images.length,1);
  assert.equal(c.imageHeaders[c.images[0]]['X-Lume-Image-Strips'],String(s.__strips(1452925,'00001.webp',220980)));
  assert.equal(c.imageHeaders[c.images[0]].Referer,'https://18comic.vip/photo/1452925');
});

test('JM list parses title attributes and chapter shortcuts do not duplicate episodes', async () => {
  const s=load('jmcomic','comic',{'/album/1':
    '<a href="/photo/1">阅读</a><div class="btn-toolbar"><a href="/photo/1">第一章</a></div>'+
    '<div class="btn-toolbar"><a href="/photo/2">第二章</a></div>'});
  const rows=s.__items('<div class="thumb-overlay-albums"><a href="/album/1/title"><img title="Sample" data-src="https://cdn.example/1.jpg"></a></div>');
  assert.equal(rows[0].title,'Sample');
  assert.equal(rows[0].cover,'https://cdn.example/1.jpg');
  const chapters=await s.chapters({id:'/album/1'});
  assert.deepEqual(Array.from(chapters,x=>x.id),['/photo/1','/photo/2']);
});

test('Hanime resolves the highest quality before playback, regardless of DOM order', async () => {
  const s = load('hanime1', 'video', {'/watch': '<video id="player">' +
    [720, 480, 1080].map(q => `<source size="${q}" src="https://media.example/${q}.mp4">`).join('') + '</video>'});
  const c = await s.content({chapterId: '/watch?v=123'});
  assert.equal(c.url, 'https://media.example/1080.mp4');
  assert.equal(c.qualities.length, 3);
  assert.equal(c.headers.Referer, 'https://hanime1.me/watch?v=123');
});

test('Hlib custom HTTP-200 human verification is not mistaken for empty content', async () => {
  const s = load('hlib', 'novel', {'/n/example': '<title>人机校验</title><pre>challenge</pre>'});
  await assert.rejects(s.content({chapterId:'/n/example'}), /NEED_WEBVIEW_VERIFY/);
});

test('Hlib reads the verified pre content and ignores ads and modal headings', async () => {
  const s = load('hlib', 'novel', {'/n/example': '<title>测试文 - H图书馆</title>' +
    '<h1 class="modal-title">弹窗</h1><pre id="content"><p>这是用于验证源解析的普通测试段落，不包含站点原文。</p></pre><aside>广告</aside>'});
  const d = await s.detail({id:'/n/example'});
  assert.equal(d.title, '测试文');
  const c = await s.content({chapterId:'/n/example'});
  assert.equal(c.kind, 'text');
  assert.ok(!c.text.includes('广告'));
});

test('HHHBook reads the article body rather than the homepage excerpt', async () => {
  const s = load('hhhbook', 'novel', {'/2026/10/14/example/':
    '<h1 class="entry-title">测试文章</h1><div class="entry-content"><p>这是一段用于测试正文提取的普通文本，详情页面内容应当被完整保留。</p></div><footer>其他内容</footer>'});
  const c = await s.content({chapterId:'/2026/10/14/example/'});
  assert.ok(c.text.includes('完整保留'));
  assert.ok(!c.text.includes('其他内容'));
});

test('Manwa emits ordered real reader URLs and local decoding metadata', async () => {
  const s = load('manwa', 'comic', {'/chapter/1':
    '<img src="logo.png"><img class="content-img lazy_img" data-r-src="https://img.example/a.webp" src="placeholder.jpg">' +
    '<img class="content-img" data-r-src="https://img.example/b.webp"><img class="ad" src="ad.jpg">'});
  const c = await s.content({chapterId:'/chapter/1'});
  assert.deepEqual(Array.from(c.images), ['https://img.example/a.webp','https://img.example/b.webp']);
  assert.equal(c.imageHeaders[c.images[0]]['X-Lume-Image-Encoding'], 'aes-cbc-pkcs7');
});

test('Z8PT decodes public image addresses and excludes unrelated images', async () => {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('DFVG$W^H%jh67j6j'), null);
  const url = 'https://images.example/sample.jpg';
  const value = Buffer.concat([cipher.update(url), cipher.final()]).toString('base64');
  const s = load('z8pt', 'comic', {'/content_1.html':
    `<img class="showimg" rdata="${value}"><img src="advertisement.jpg">`});
  const c = await s.content({chapterId:'/content_1.html'});
  assert.deepEqual(Array.from(c.images), [url]);
});

test('AACCOO keeps only the selected book chapters, deduplicates and orders them', async () => {
  const s = load('aaccoo', 'novel', {'/book/1/':
    '<a href="/book/1/20.html">最新章</a><a href="/book/1/10.html">第一章</a>' +
    '<a href="/book/1/20.html">第二章</a><a href="/book/2/5.html">其他作品</a>'});
  const rows = await s.chapters({id:'/book/1/'});
  assert.deepEqual(Array.from(rows, x => x.id), ['/book/1/10.html','/book/1/20.html']);
});

test('Bemi does not invent media Referer or generic UA and preserves declared headers', async () => {
  for(const headers of [undefined, {'Referer':'https://media.example/player/'}]) {
    const s=load('luttt','video',{'/vodplay/1-1-1.html':
      '<script>var player_aaaa='+JSON.stringify({url:'https://media.example/index.m3u8',headers})+';</script>'});
    const c=await s.content({id:'1',chapterId:'/vodplay/1-1-1.html'});
    assert.deepEqual(JSON.parse(JSON.stringify(c.headers)),headers||{});
  }
});
