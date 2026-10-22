// LumeSource: {"id":"xnxx_video","name":"XNXX","version":"1.0.0","category":"video","mirrors":["https://www.xnxx.com","https://xnxx.com"]}

// 站点：https://www.xnxx.com （与 XVideos 同源，服务端渲染 + html5player）
//
// 结构（2026-10-22 逐页核过；本机直连不通，验证走本机代理出口）：
//   首页      GET /                 没有视频网格（版块位是 JS 填的），但**内联脚本里带分类 JSON**：
//                                  `xv.cats.write_thumb_block_list([{u:"/search/…",t:"…"}…])`，
//                                  实测 161 项——这就是站点自己的分类表，脚本直接读它。
//   列表      GET /hits              最多观看（分页 /hits/<N>，第 2 页 = /hits/1）
//             GET /best              自动跳到当月「最佳」（分页 /best/<yyyy-mm>/<N>）
//             GET /todays-selection   今日精选
//             GET /search/<词>        搜索；分页 /search/<词>/<N>（第 2 页 = /1）
//   卡片      `div.thumb-block`：视频地址 `/video-<eid>/<slug>`、封面 `img[data-src]`、
//             标题 `div.thumb-under p a[title]`、时长与播放数在 `p.metadata`。
//   详情      GET <视频地址>：标题 `html5player.setVideoTitle('…')`、封面 `setThumbUrl('…')`。
//   播放      `setVideoUrlHigh/Low('…mp4_sd.mp4?secure=…')` 与 `setVideoHLS('…hls.m3u8')`；
//             HLS 是自适应清单（与 XVideos 同一套 CDN），MP4 也带过期签名，**每次播放重新取详情页**。
//             未登录时 High/Low 同样是 mp4_sd，不存在「假装有高清 mp4」的档位。
var H = {
  base: 'https://www.xnxx.com', name: 'XNXX', defaultBase: 'https://www.xnxx.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim(); },
  entity: function (s) { return String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);|&#(?:x[0-9a-f]+|\d+);/gi, function (v) { var map = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }; if (map[v]) return map[v]; var code = v.charAt(2) === 'x' ? parseInt(v.slice(3), 16) : parseInt(v.slice(2), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : v; }); },
  attr: function (s, k) { var m = new RegExp('(?:^|\\s)' + k + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i').exec(s || ''); return this.entity(m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : ''); },
  abs: function (u, from) { u = this.entity(u).trim(); if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; if (u.indexOf('//') === 0) return 'https:' + u; var b = from || this.base; if (u.charAt(0) === '/') return /^https?:\/\/[^/]+/.exec(b)[0] + u; return b.replace(/[^/]*$/, '') + u; },
  headers: function () { return { 'User-Agent': this.ua, 'Referer': this.base + '/' }; },
  useDomain: function () { var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null; this.base = String((c && c.domain) || this.defaultBase).replace(/\/+$/, ''); return this.base; },
  response: function (r) { if (!r) throw new Error(this.name + '：没有网络响应'); var s = r.status; if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证（HTTP ' + s + '）'); if (s === 404) throw new Error(this.name + '：页面不存在（HTTP 404）'); if (s !== 200) throw new Error(this.name + '：请求失败（HTTP ' + s + '）'); var b = String(r.body || ''); if (/cf-chl-|Just a moment|<title>\s*人机校验/i.test(b)) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证'); return b; },
  get: async function (u) { return this.response(await LumeSource.http.get(this.abs(u, this.base + '/'), { headers: this.headers() })); }
};

/// 从内联脚本里读站点的分类表：`write_thumb_block_list([{"u":"/search/…","t":"…"}…])`。
function categoryList(html) {
  var at = String(html).indexOf('write_thumb_block_list(');
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
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch (error) { return []; }
      }
    }
  }
  return [];
}

function titleOf(html) {
  var m = /html5player\.setVideoTitle\('((?:[^'\\]|\\.)*)'\)/.exec(html);
  if (m) return H.clean(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/'));
  var t = /<title>([\s\S]*?)<\/title>/.exec(html);
  return t ? H.clean(t[1]).replace(/\s*-\s*XNXX\.COM\s*$/i, '') : '';
}

var LumeSource = {
  id: 'xnxx_video',
  name: 'XNXX',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.xnxx.com', 'https://xnxx.com'],

  /// 首页：最多观看第 1 页（站点首页本身没有视频网格）。
  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/hits', page: 1 });
    if (!page.items.length) throw new Error('XNXX：首页没认出条目（站点可能改版）');
    return [{ title: '最多观看', moreUrl: '/hits', items: page.items.slice(0, 24) }];
  },

  /// 分类＝站点内联脚本里的分类表（实测 161 项，去掉外链与重复路径），再补三个固定入口。
  async categories() {
    H.useDomain();
    var rows = [
      { id: '/hits', title: '最多观看' },
      { id: '/best', title: '当月最佳' },
      { id: '/todays-selection', title: '今日精选' }
    ];
    var seen = {};
    seen['/hits'] = true; seen['/best'] = true; seen['/todays-selection'] = true;
    try {
      var list = categoryList(await H.get('/'));
      for (var i = 0; i < list.length; i++) {
        var path = String(list[i].u || '').split('?')[0];
        var title = H.clean(list[i].t || '');
        if (!path || path.charAt(0) !== '/' || !title) continue;
        if (seen[path]) continue;
        seen[path] = true;
        rows.push({ id: path, title: title });
      }
    } catch (error) {
      console.warn('[xnxx] 分类表抓取失败：' + error);
    }
    return rows;
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/hits';
    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword);
    } else if (/^\/(?:hits|best|todays-selection)$/.test(category)) {
      path = category;
    } else if (category.charAt(0) === '/') {
      path = category.split('?')[0];
    } else {
      path = '/hits';
    }
    var basePath = path;
    if (page > 1) path += '/' + (page - 1);
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[xnxx] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, basePath, page) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/<div[^>]+class="[^"]*thumb-block[^"]*"/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 3000);
      var link = /href="(\/video-[^"]+)"/.exec(block);
      if (!link) continue;
      var path = link[1];
      if (seen[path]) continue;
      seen[path] = true;
      var title = (/<div class="thumb-under">[\s\S]{0,500}?title="([^"]*)"/.exec(block) || [])[1] || '';
      if (!title) title = H.clean((/<div class="thumb-under">[\s\S]{0,500}?<a[^>]*>([\s\S]{0,200}?)<\/a>/.exec(block) || [])[1] || '');
      if (!title) continue;
      var cover = (/<img[^>]+data-src="([^"]+)"/.exec(block) || [])[1] || '';
      var meta = H.clean((/<p class="metadata">([\s\S]{0,400}?)<\/p>/.exec(block) || [])[1] || '');
      out.push({
        id: path,
        title: title,
        cover: cover ? H.abs(cover) : null,
        coverHeaders: H.headers(),
        subtitle: meta.slice(0, 80)
      });
    }
    return out;
  },

  __hasMore: function (html, path, page) {
    var next = String(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/' + page + '"';
    return new RegExp(next).test(String(html).replace(/&amp;/g, '&'));
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/video-[A-Za-z0-9]+\//.test(id)) return null;
    var html = await H.get(id);
    var title = titleOf(html);
    if (!title) return null;
    var cover = (/html5player\.setThumbUrl\('([^']+)'\)/.exec(html) || [])[1]
      || (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) || [])[1] || '';
    // 播放页没有 p.metadata（那是列表卡片的写法），元数据在 span.metadata（上传者 / 时长 / 档位）。
    var meta = H.clean((/<p class="metadata">([\s\S]{0,400}?)<\/p>/.exec(html) || [])[1] || '');
    if (!meta) meta = H.clean((/<span class="metadata">([\s\S]{0,400})/.exec(html) || [])[1] || '');
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: meta.slice(0, 80)
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  /// 播放：现取详情页（签名会过期），HLS 优先、MP4 兜底。
  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/video-[A-Za-z0-9]+\//.test(id)) {
      throw new Error('XNXX：认不出视频地址（' + id + '）——id 应当来自 list()');
    }
    var pageUrl = H.abs(id);
    var html = await H.get(id);
    var hls = (/html5player\.setVideoHLS\('([^']+)'\)/.exec(html) || [])[1] || '';
    var high = (/html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html) || [])[1] || '';
    var low = (/html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html) || [])[1] || '';
    var mp4 = high || low;
    if (!hls && !mp4) {
      throw new Error('XNXX：详情页里没解出播放地址——站点可能改版，或该视频需要登录/VIP');
    }
    var qualities = [];
    if (hls) qualities.push({ label: 'HLS 自适应', url: hls });
    if (mp4) qualities.push({ label: hls ? 'MP4' : 'MP4（默认）', url: mp4 });
    return {
      kind: 'video',
      url: hls || mp4,
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
