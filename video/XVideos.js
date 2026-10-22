// LumeSource: {"id":"xvideos_video","name":"XVideos","version":"1.0.0","category":"video","mirrors":["https://www.xvideos.com","https://xvideos.com"]}

// 站点：https://www.xvideos.com （老牌视频站，服务端渲染 + html5player）
//
// 结构（2026-10-22 逐页核过；本机直连不通，验证走本机代理出口）：
//   首页      GET /                 网格；分页是路径式 `/new/<N>`（第 2 页 = /new/1，到 /new/1000）
//   分类      GET /tags            站点自己的分类索引（`/c/<Slug>`，实测 38 个）
//             GET /c/<Slug>        第 1 页；之后 `/c/<Slug>/<N>`（第 2 页 = /1）
//   搜索      GET /?k=<关键词>      翻页 `&p=<N>`（第 2 页 = p=1，0 基）
//   卡片      `div.thumb-block`：视频地址 `/video.<eid>/<数字id>/…/<slug>`、封面 `img[data-src]`、
//             标题 `p.title a[title]`、时长 `span.duration`、上传者/播放数在 `p.metadata`。
//   详情      GET <视频地址>：标题 `html5player.setVideoTitle('…')`、
//             封面 `setThumbUrl('…')`、时长/播放数在页面 `#video-tags-list` 一带。
//   播放      `html5player.setVideoUrlHigh/Low('…/mp4_sd.mp4?secure=…')` 与
//             `html5player.setVideoHLS('…/hls.m3u8')`。
//             实测：HLS 主清单含 360p / 480p / 1080p 三档（默认走它，自适应）；
//             MP4 与 HLS 都带 `secure=…,<过期时间>` 签名，**每次播放都要重新取详情页**。
//             媒体直链带不带 Referer 都回 206（仍统一带站内 Referer）。
//             高清 mp4（mp4_hd）在本站未登录时不暴露，High/Low 都指向 mp4_sd——不编造档位。
var H = {
  base: 'https://www.xvideos.com', name: 'XVideos', defaultBase: 'https://www.xvideos.com',
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

function chapterTitleOf(html) {
  var m = /html5player\.setVideoTitle\('((?:[^'\\]|\\.)*)'\)/.exec(html);
  if (m) return H.clean(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/'));
  var t = /<title>([\s\S]*?)<\/title>/.exec(html);
  return t ? H.clean(t[1]).replace(/\s*-\s*XVIDEOS\.COM\s*$/i, '') : '';
}

var LumeSource = {
  id: 'xvideos_video',
  name: 'XVideos',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.xvideos.com', 'https://xvideos.com'],

  /// 首页：站点的「最新」第 1 页（24 条）。
  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/', page: 1 });
    if (!page.items.length) throw new Error('XVideos：首页没认出条目（站点可能改版）');
    return [{ title: '最新视频', moreUrl: '/', items: page.items.slice(0, 24) }];
  },

  /// 分类＝站点 `/tags` 索引里的 `/c/<Slug>`（实时抓；抓不到就只给「最新」，不编造）。
  async categories() {
    H.useDomain();
    var fixed = [{ id: '/', title: '最新视频' }];
    var rows = [];
    var seen = {};
    try {
      var html = await H.get('/tags');
      var re = /<a[^>]+href="(\/c\/[^"\/]+)"[^>]*>([^<]{1,32})<\/a>/g, m;
      while ((m = re.exec(html)) !== null) {
        var id = m[1];
        var title = H.clean(m[2]);
        if (!id || !title || seen[id]) continue;
        seen[id] = true;
        rows.push({ id: id, title: title });
      }
    } catch (error) {
      console.warn('[xvideos] 分类索引抓取失败：' + error);
    }
    return fixed.concat(rows);
  },

  /// 列表 / 搜索。分页全部是站点自己的写法：首页 `/new/<N>`、分类 `/c/<Slug>/<N>`、
  /// 搜索 `&p=<N>`，三者的 N 都是 0 基（第 2 页 = 1）。
  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/';
    var path;
    if (keyword) {
      path = '/?k=' + encodeURIComponent(keyword) + (page > 1 ? '&p=' + (page - 1) : '');
    } else if (category === '/') {
      path = page > 1 ? '/new/' + (page - 1) : '/';
    } else if (/^\/c\/[^\/]+$/.test(category)) {
      path = page > 1 ? category + '/' + (page - 1) : category;
    } else {
      path = category;
    }
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[xvideos] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, category, keyword, page) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/<div[^>]+class="[^"]*thumb-block[^"]*"/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 3000);
      var link = /href="(\/video\.[^"]+)"/.exec(block);
      if (!link) continue;
      var path = link[1];
      if (seen[path]) continue;
      seen[path] = true;
      var title = (/<p class="title">[\s\S]{0,400}?title="([^"]*)"/.exec(block) || [])[1] || '';
      if (!title) title = H.clean((/<p class="title">([\s\S]{0,400}?)<\/p>/.exec(block) || [])[1] || '');
      if (!title) continue;
      var cover = (/<img[^>]+data-src="([^"]+)"/.exec(block) || [])[1] || '';
      var duration = H.clean((/<span class="duration">([\s\S]{0,24}?)<\/span>/.exec(block) || [])[1] || '');
      var meta = H.clean((/<p class="metadata">([\s\S]{0,800}?)<\/p>/.exec(block) || [])[1] || '');
      out.push({
        id: path,
        title: title,
        cover: cover ? H.abs(cover) : null,
        coverHeaders: H.headers(),
        subtitle: duration
      });
    }
    return out;
  },

  __hasMore: function (html, category, keyword, page) {
    var next;
    if (keyword) next = '[?&]p=' + page + '(?:&|"|\')';
    else if (category === '/') next = '/new/' + page + '"';
    else next = String(category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/' + page + '"';
    return new RegExp(next).test(String(html).replace(/&amp;/g, '&'));
  },

  /// 详情：标题 / 封面 / 时长与播放数。
  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/video\.[A-Za-z0-9]+\//.test(id)) return null;
    var html = await H.get(id);
    var title = chapterTitleOf(html);
    if (!title) return null;
    var cover = (/html5player\.setThumbUrl\('([^']+)'\)/.exec(html) || [])[1]
      || (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) || [])[1] || '';
    var duration = H.clean((/<span class="duration">([\s\S]{0,24}?)<\/span>/.exec(html) || [])[1] || '');
    var views = H.clean((/<span class="views">[\s\S]{0,80}?<\/span>/i.exec(html) || [])[0] || '');
    var subtitle = [duration, views.replace(/\s+/g, ' ')].filter(function (x) { return !!x; }).join(' · ');
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: subtitle
    };
  },

  /// 单条视频：没有选集，固定一行「播放」。
  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  /// 播放：每次现取详情页（地址带过期签名），HLS 优先，MP4 作为备选线路。
  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/video\.[A-Za-z0-9]+\//.test(id)) {
      throw new Error('XVideos：认不出视频地址（' + id + '）——id 应当来自 list()');
    }
    var pageUrl = H.abs(id);
    var html = await H.get(id);
    var hls = (/html5player\.setVideoHLS\('([^']+)'\)/.exec(html) || [])[1] || '';
    var high = (/html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html) || [])[1] || '';
    var low = (/html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html) || [])[1] || '';
    var mp4 = high || low;
    if (!hls && !mp4) {
      throw new Error('XVideos：详情页里没解出播放地址——站点可能改版，或该视频需要登录/VIP');
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
