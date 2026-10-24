// LumeSource: {"id":"youjizz_video","name":"YouJizz","version":"1.0.0","category":"video","mirrors":["https://www.youjizz.com","https://youjizz.com"]}

// 站点：https://www.youjizz.com （服务端渲染的老牌 tube）
//
// 结构（2026-10-23 逐页核过；本机直连不通，验证走本机代理出口）：
//   首页/排序  GET /most-popular/<N>.html、/newest-clips/<N>.html、/top-rated/<N>.html、
//              /top-rated-month/<N>.html、/trending/<N>.html（1 基）
//   分类       GET /categories/<slug>-<N>.html（首页导航里就带完整分类链接）
//   搜索       GET /search?q=<词> → 302 到 /search/<词>-1.html；分页 /search/<词>-<N>.html
//   卡片       `div.video-thumb[data-videoId]`：地址 `/videos/<slug>-<id>.html`、
//              封面 `img[data-original]`（协议相对）、标题 `a.agego-content-title`。
//   分页判据   页面里 `a.pagination-next`；末页没有这个链接。
//   播放       `<script>var dataEncodings = [{quality,filename,name},…]`，
//              filename 既可能是 `//cdne-mobile.youjizz.com/…-1280-720-…-h264.mp4?validfrom=…`，
//              也可能是 `//abre-videos.youjizz.com/_hls/…/master.m3u8?validfrom=…`（同一数组里混着）。
//              两种都带 `validfrom/validto/hash` 签名，**每次播放现取详情页**。
//              实测 mp4 与 m3u8 都能直接取（Range 206 / 200）。
var H = {
  base: 'https://www.youjizz.com', name: 'YouJizz', defaultBase: 'https://www.youjizz.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); },
  entity: function (s) { return String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/gi, function (v) { var m = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }; return m[v] || v; }); },
  attr: function (tag, name) { var m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i').exec(tag || ''); return this.entity(m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : ''); },
  abs: function (u) { u = this.entity(u).trim(); if (!u) return ''; if (u.indexOf('//') === 0) return 'https:' + u; if (/^https?:\/\//i.test(u)) return u; if (u.charAt(0) === '/') return /^https?:\/\/[^/]+/.exec(this.base)[0] + u; return u; },
  useDomain: function () { var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null; this.base = String((c && c.domain) || this.defaultBase).replace(/\/+$/, ''); return this.base; },
  headers: function (page) { return { 'User-Agent': this.ua, 'Referer': page || this.base + '/' }; },
  response: function (r) { if (!r) throw new Error(this.name + '：没有网络响应'); var s = r.status; if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证（HTTP ' + s + '）'); if (s === 404) throw new Error(this.name + '：页面不存在（HTTP 404）'); if (s !== 200) throw new Error(this.name + '：请求失败（HTTP ' + s + '）'); return String(r.body || ''); },
  get: async function (path) { return this.response(await LumeSource.http.get(this.base + path, { headers: this.headers() })); }
};

/// 取出 `var <name> = [ … ]` 的数组字面量（按括号配对），再 JSON.parse。
function jsonArray(html, name) {
  var at = String(html).indexOf(name + ' = [');
  if (at < 0) at = String(html).indexOf(name + '=');
  if (at < 0) return [];
  var start = html.indexOf('[', at);
  if (start < 0) return [];
  var depth = 0, inString = false, escaped = false;
  for (var i = start; i < html.length; i++) {
    var ch = html.charAt(i);
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch (error) { return []; }
      }
    }
  }
  return [];
}

var LumeSource = {
  id: 'youjizz_video',
  name: 'YouJizz',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.youjizz.com', 'https://youjizz.com'],

  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/most-popular/1.html', page: 1 });
    if (!page.items.length) throw new Error('YouJizz：首页没认出条目（站点可能改版）');
    return [{ title: '最多观看', moreUrl: '/most-popular/1.html', items: page.items.slice(0, 24) }];
  },

  /// 分类＝首页导航里的 `/categories/<slug>-1.html`（站点自己列的 50 个），外加五个排序入口。
  async categories() {
    H.useDomain();
    var rows = [
      { id: '/most-popular/1.html', title: '最多观看' },
      { id: '/newest-clips/1.html', title: '最新' },
      { id: '/top-rated/1.html', title: '最高评分' },
      { id: '/top-rated-month/1.html', title: '本月最佳' },
      { id: '/trending/1.html', title: '趋势' }
    ];
    var seen = {};
    try {
      var html = await H.get('/');
      var re = /href="(\/categories\/([a-z0-9-]+)-1\.html)"[^>]*>([^<]{1,40})<\/a>/g, m;
      while ((m = re.exec(html)) !== null) {
        var id = m[1];
        var title = H.clean(m[3]) || m[2];
        if (!id || !title || seen[id]) continue;
        seen[id] = true;
        rows.push({ id: id, title: title });
      }
    } catch (error) {
      console.warn('[youjizz] 分类导航抓取失败：' + error);
    }
    return rows.slice(0, 120);
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/most-popular/1.html';
    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword) + '-' + page + '.html';
    } else if (/^\/categories\/[a-z0-9-]+-1\.html$/.test(category)) {
      path = category.replace(/-1\.html$/, '-' + page + '.html');
    } else if (/^\/[a-z-]+\/1\.html$/.test(category)) {
      path = category.replace(/\/1\.html$/, '/' + page + '.html');
    } else {
      path = category;
    }
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[youjizz] 列表没解析出条目：' + path);
    return { items: items, hasMore: /class="[^"]*pagination-next[^"]*"/.test(html) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/<div class="video-thumb"/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 4000);
      var link = /href="(\/videos\/[^"]+\.html)"/.exec(block);
      if (!link) continue;
      var path = link[1];
      if (seen[path]) continue;
      var title = (/class="agego-content-title"[^>]*>([\s\S]{0,300}?)<\/a>/.exec(block) || [])[1] || '';
      title = H.clean(title);
      if (!title) title = H.entity((/title="([^"]{3,200})"/.exec(block) || [])[1] || '');
      if (!title) continue;
      seen[path] = true;
      var img = /<img[^>]+data-original="([^"]+)"/.exec(block);
      var duration = (/<span[^>]*class="[^"]*(?:duration|time)[^"]*"[^>]*>([\s\S]{0,20}?)<\/span>/.exec(block) || [])[1] || '';
      out.push({
        id: path,
        title: title,
        cover: img ? H.abs(img[1]) : null,
        coverHeaders: H.headers(),
        subtitle: H.clean(duration)
      });
    }
    return out;
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^"\/]+\.html$/.test(id)) return null;
    var html = await H.get(id);
    var title = H.entity((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '');
    if (!title) {
      var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(html);
      title = t ? H.clean(t[1]).replace(/\s*-\s*YouJizz.*$/i, '') : '';
    }
    if (!title) return null;
    var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '';
    var views = (/<span[^>]*class="[^"]*views[^"]*"[^>]*>([\s\S]{0,40}?)<\/span>/.exec(html) || [])[1] || '';
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: H.clean(views)
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^"\/]+\.html$/.test(id)) throw new Error('YouJizz：认不出视频地址（' + id + '）——id 应当来自 list()');
    var pageUrl = H.base + id;
    var html = await H.get(id);
    var rows = jsonArray(html, 'dataEncodings');
    if (!rows.length) rows = jsonArray(html, 'encodings');
    if (!rows.length) throw new Error('YouJizz：详情页里没解出播放地址——站点可能改版，或该视频需要登录');
    var mp4 = [], hls = [];
    for (var i = 0; i < rows.length; i++) {
      var file = String(rows[i].filename || '');
      if (!file) continue;
      var url = H.abs(file);
      var quality = Number(String(rows[i].quality || '').replace(/[^\d]/g, '')) || 0;
      if (/master\.m3u8/i.test(url)) hls.push({ quality: quality, url: url });
      else if (/\.mp4/i.test(url)) mp4.push({ quality: quality, url: url });
    }
    // `encodings` 数组里可能混着没有 quality 的条目（站点自己的空档位），
    // 只要存在带 quality 的条目，就把这些空档位剔掉，不显示成 `?p`。
    if (mp4.some(function (r) { return r.quality > 0; })) mp4 = mp4.filter(function (r) { return r.quality > 0; });
    if (hls.some(function (r) { return r.quality > 0; })) hls = hls.filter(function (r) { return r.quality > 0; });
    var order = function (a, b) { return b.quality - a.quality; };
    mp4.sort(order); hls.sort(order);
    var qualities = [];
    for (var j = 0; j < mp4.length; j++) qualities.push({ label: (mp4[j].quality || '?') + 'p MP4', url: mp4[j].url });
    for (var k = 0; k < hls.length; k++) qualities.push({ label: (hls[k].quality || '?') + 'p HLS', url: hls[k].url });
    if (!qualities.length) throw new Error('YouJizz：播放地址里没有可用的 mp4 / m3u8');
    return {
      kind: 'video',
      url: qualities[0].url,
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
