// LumeSource: {"id":"redtube_video","name":"RedTube","version":"1.0.0","category":"video","mirrors":["https://www.redtube.com","https://redtube.com"]}

// 站点：https://www.redtube.com （Angular 风格的服务端渲染 + 播放器配置内联）
//
// 结构（2026-10-23 逐页核过；本机直连不通，验证走本机代理出口）：
//   视频页     GET /<数字id>
//   列表/搜索  GET /?search=<词>&page=<N>（首页、搜索都用 `?page=`，1 基）
//   分类       GET /redtube/<slug>[?page=<N>]（分类页里带完整分类导航，共 77 个）；
//              另有 /hot、/new、/recommended、/top 四个固定入口。
//   卡片       `li.thumbnail-card[data-video-id]`：地址 `/<id>`、标题在链接的 `title` 属性
//              （或 `.video-title-text`）、封面在 `<picture><source data-srcset>` / `<img src>`。
//   播放       视频页内联 `mediaDefinition:[{format:"hls"|"mp4", videoUrl:"/media/hls?s=…"}]`；
//              那两个 `/media/…` 地址**本身返回 JSON**（不是 m3u8/mp4），里面才是带签名的
//              CDN 地址（hls 给 720/480/…，mp4 给 1080/720/480/…）。所以播放要两跳：
//              视频页 → /media/{hls,mp4}?s=… → 真实地址。签名带 validto，**每次播放现取**。
var H = {
  base: 'https://www.redtube.com', name: 'RedTube', defaultBase: 'https://www.redtube.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); },
  entity: function (s) { return String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/gi, function (v) { var m = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }; return m[v] || v; }); },
  abs: function (u) { u = this.entity(u).trim(); if (!u) return ''; if (u.indexOf('//') === 0) return 'https:' + u; if (/^https?:\/\//i.test(u)) return u; if (u.charAt(0) === '/') return /^https?:\/\/[^/]+/.exec(this.base)[0] + u; return u; },
  useDomain: function () { var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null; this.base = String((c && c.domain) || this.defaultBase).replace(/\/+$/, ''); return this.base; },
  headers: function (page) { return { 'User-Agent': this.ua, 'Referer': page || this.base + '/' }; },
  response: function (r) { if (!r) throw new Error(this.name + '：没有网络响应'); var s = r.status; if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证（HTTP ' + s + '）'); if (s === 404) throw new Error(this.name + '：页面不存在（HTTP 404）'); if (s !== 200) throw new Error(this.name + '：请求失败（HTTP ' + s + '）'); return String(r.body || ''); },
  get: async function (path, absolute) {
    var url = absolute ? path : this.base + path;
    return this.response(await LumeSource.http.get(url, { headers: this.headers() }));
  },
  json: async function (path, absolute) {
    var text = await this.get(path, absolute);
    try { return JSON.parse(text); } catch (error) { throw new Error(this.name + '：接口返回的不是 JSON（站点可能改版）'); }
  }
};

/// 取出 `name:[ … ]` 的数组字面量（按括号配对）。
function jsonArrayAfter(html, name) {
  var at = String(html).indexOf(name);
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
  id: 'redtube_video',
  name: 'RedTube',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.redtube.com', 'https://redtube.com'],

  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/hot', page: 1 });
    if (!page.items.length) throw new Error('RedTube：首页没认出条目（站点可能改版）');
    return [{ title: '热门', moreUrl: '/hot', items: page.items.slice(0, 24) }];
  },

  /// 分类＝站点分类页里的 `/redtube/<slug>` 导航（实测 77 个）+ 四个固定入口。
  async categories() {
    H.useDomain();
    var rows = [
      { id: '/hot', title: '热门' },
      { id: '/new', title: '最新' },
      { id: '/recommended', title: '推荐' },
      { id: '/top', title: '最高评分' }
    ];
    var seen = {};
    try {
      var html = await H.get('/redtube/asian');
      var re = /href="(\/redtube\/[a-z0-9-]+)"[^>]*>([^<]{1,32})<\/a>/g, m;
      while ((m = re.exec(html)) !== null) {
        var id = m[1];
        var title = H.clean(m[2]);
        if (!id || !title || /^\d+$/.test(title) || seen[id]) continue;
        seen[id] = true;
        rows.push({ id: id, title: title });
      }
    } catch (error) {
      console.warn('[redtube] 分类导航抓取失败：' + error);
    }
    return rows.slice(0, 120);
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/hot';
    var path;
    if (keyword) {
      path = '/?search=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
    } else if (/^\/(?:hot|new|recommended|top|redtube\/[a-z0-9-]+)$/.test(category)) {
      path = category + (page > 1 ? '?page=' + page : '');
    } else {
      path = '/hot' + (page > 1 ? '?page=' + page : '');
    }
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[redtube] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, page) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/class="[^"]*thumbnail-card[^"]*"/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 5000);
      var href = /href="\/(\d{6,})"/.exec(block);
      if (!href) continue;
      var id = href[1];
      if (seen[id]) continue;
      var title = H.entity((/title="([^"]{3,200})"/.exec(block) || [])[1] || '');
      if (!title) title = H.clean((/class="[^"]*video-title-text[^"]*"[^>]*>([\s\S]{0,300}?)<\//.exec(block) || [])[1] || '');
      if (!title) continue;
      seen[id] = true;
      var cover = (/<source[^>]+data-srcset="([^"\s]+)/.exec(block) || [])[1]
        || (/<img[^>]+(?:data-src|src)="(https:\/\/[^"]+)"/.exec(block) || [])[1] || '';
      var duration = (/class="[^"]*video-duration[^"]*"[^>]*>([\s\S]{0,20}?)<\//.exec(block) || [])[1] || '';
      out.push({
        id: '/' + id,
        title: title,
        cover: cover ? H.abs(cover) : null,
        coverHeaders: H.headers(),
        subtitle: H.clean(duration)
      });
    }
    return out;
  },

  __hasMore: function (html, page) {
    return new RegExp('page=' + (page + 1) + '(?:&|"|\')').test(String(html));
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/\d{6,}$/.test(id)) return null;
    var html = await H.get(id);
    var title = H.entity((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '');
    if (!title) {
      var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(html);
      title = t ? H.clean(t[1]).replace(/\s*\|\s*Redtube.*$/i, '').replace(/\s*-\s*Redtube.*$/i, '') : '';
    }
    if (!title) return null;
    var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '';
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers()
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/\d{6,}$/.test(id)) throw new Error('RedTube：认不出视频地址（' + id + '）——id 应当来自 list()');
    var pageUrl = H.base + id;
    var html = await H.get(id);
    var media = jsonArrayAfter(html, 'mediaDefinition:');
    if (!media.length) media = jsonArrayAfter(html, 'mediaDefinition');
    if (!media.length) throw new Error('RedTube：详情页里没找到 mediaDefinition（站点可能改版）');
    var qualities = [];
    for (var i = 0; i < media.length; i++) {
      var format = String(media[i].format || '').toLowerCase();
      var url = String(media[i].videoUrl || '');
      if (!url || (format !== 'hls' && format !== 'mp4')) continue;
      // `/media/hls?s=…` 返回的是 JSON（真实地址列表），不是播放清单本身。
      var variants = await H.json(H.abs(url), true);
      if (!variants || !variants.length) continue;
      for (var j = 0; j < variants.length; j++) {
        var real = String(variants[j].videoUrl || '');
        if (!real) continue;
        var quality = String(variants[j].quality || '').trim();
        qualities.push({
          label: (quality ? quality + 'p ' : '') + (format === 'hls' ? 'HLS' : 'MP4'),
          url: H.abs(real)
        });
      }
    }
    if (!qualities.length) throw new Error('RedTube：播放地址解析失败（站点可能改版）');
    // 默认优先 HLS（自适应、文件头小），没有就给第一条。
    var preferred = qualities[0];
    for (var k = 0; k < qualities.length; k++) {
      if (/HLS/.test(qualities[k].label)) { preferred = qualities[k]; break; }
    }
    return {
      kind: 'video',
      url: preferred.url,
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
