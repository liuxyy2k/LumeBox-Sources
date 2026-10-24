// LumeSource: {"id":"p85_video","name":"85PO","version":"1.0.0","category":"video","mirrors":["https://www.85po.com","https://85po.com"]}

// 站点：https://www.85po.com （中文成人影片站，KVS 系）
//
// 结构（2026-10-24 逐页核过；本机直连不通，验证走本机代理出口）：
//   列表      GET /latest-updates/<N>/、/top-rated/<N>/、/most-popular/<N>/（1 基）
//   标签      GET /tags/<slug>/<N>/（首页导航里带 50 个标签）
//   搜索      GET /search/<关键词>/（实测可用；第 N 页 /search/<词>/<N>/）
//   卡片      `div.card-item`：地址 `a.drop-card[href=/v/<id>.html]`、
//             封面 `img[data-original]`（懒加载占位是 base64 gif）、标题 `.card-title`、时长 `.duration`。
//   详情      GET /v/<id>.html：标题 og:title / h1、封面 og:image。
//   播放      `var flashvars = { video_url: '…480p.mp4…', video_alt_url: '…720p.mp4…' }`
//             （两个地址都带 `v-acctoken` 签名，实测 Range 206）。签名会过期，**每次播放现取详情页**。
var H = {
  base: 'https://www.85po.com', name: '85PO', defaultBase: 'https://www.85po.com',
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

var LumeSource = {
  id: 'p85_video',
  name: '85PO',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.85po.com', 'https://85po.com'],

  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/latest-updates/', page: 1 });
    if (!page.items.length) throw new Error('85PO：首页没认出条目（站点可能改版）');
    return [{ title: '最新影片', moreUrl: '/latest-updates/', items: page.items.slice(0, 24) }];
  },

  /// 分类＝五个排序入口 + 首页导航里的 50 个标签。
  async categories() {
    H.useDomain();
    var rows = [
      { id: '/latest-updates/', title: '最新' },
      { id: '/top-rated/', title: '最高评分' },
      { id: '/most-popular/', title: '最热' }
    ];
    var seen = {};
    try {
      var html = await H.get('/');
      var re = /href="([^"]*\/tags\/[^"\/]+\/)"[^>]*>([^<]{1,40})<\/a>/g, m;
      while ((m = re.exec(html)) !== null) {
        var id = m[1].replace(/^https?:\/\/[^/]+/, '');
        var title = H.clean(m[2]);
        if (!id || !title || seen[id]) continue;
        seen[id] = true;
        rows.push({ id: id, title: title });
      }
    } catch (error) {
      console.warn('[85po] 标签导航抓取失败：' + error);
    }
    return rows.slice(0, 120);
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/latest-updates/';
    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword) + '/';
      if (page > 1) path += page + '/';
    } else {
      // 站点对不带页号的列表路径会回 403（实测 /latest-updates/ 403、/latest-updates/1/ 200）。
      path = /^\/(?:latest-updates|top-rated|most-popular|tags\/[^\/]+)\/?$/.test(category)
        ? category : '/latest-updates/';
      path = path.replace(/\/?$/, '/') + page + '/';
    }
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[85po] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, page) };
  },

  __items: function (html) {
    // 首页/搜索用 card-item 模板，分类列表用 KVS 的 `div.item` 模板；
    // 两套都解析，取条目多的那一份（首页也带 3 个 card-item 导航块，不能只看谁先命中）。
    var a = this.__parse(html, /<div class="card-item"/);
    var b = this.__parse(html, /<div\s+class="item[ "]/);
    return a.length >= b.length ? a : b;
  },

  __parse: function (html, splitter) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(splitter);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 4000);
      var link = /href="(https?:\/\/[^"]*\/v\/[^"\/]+\.html)"/.exec(block);
      if (!link) continue;
      var id = this.__idOf(link[1]);
      if (!id || seen[id]) continue;
      var title = H.clean((/<div class="card-title"[^>]*>([\s\S]{0,300}?)<\/div>/.exec(block) || [])[1] || '');
      if (!title) title = H.entity((/<a[^>]+title="([^"]{2,200})"/.exec(block) || [])[1] || '');
      if (!title) continue;
      seen[id] = true;
      var img = /<img[^>]+data-original="([^"]+)"/.exec(block);
      var duration = H.clean((/<div class="duration"[^>]*>([\s\S]{0,20}?)<\/div>/.exec(block) || [])[1] || '');
      out.push({
        id: id,
        title: title,
        cover: img ? H.abs(img[1]) : null,
        coverHeaders: H.headers(),
        subtitle: duration
      });
    }
    return out;
  },

  __idOf: function (url) {
    var m = /\/v\/([^"\/]+)\.html/.exec(String(url || ''));
    return m ? '/v/' + m[1] + '.html' : '';
  },

  __hasMore: function (html, page) {
    return new RegExp('/(?:page/)?' + (page + 1) + '/"').test(String(html)) || new RegExp('/' + (page + 1) + '/"').test(String(html));
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/v\/[^\/]+\.html$/.test(id)) return null;
    var html = await H.get(id);
    var title = H.entity((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '');
    if (!title) {
      var h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
      title = h1 ? H.clean(h1[1]) : '';
    }
    if (!title) return null;
    var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '';
    var categories = H.entity((/video_categories:\s*'([^']*)'/.exec(html) || [])[1] || '');
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: categories
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/v\/[^\/]+\.html$/.test(id)) throw new Error('85PO：认不出视频地址（' + id + '）——id 应当来自 list()');
    var pageUrl = H.base + id;
    var html = await H.get(id);
    var qualities = [];
    var pairs = [
      [/video_url:\s*'([^']+)'/, /video_url_text:\s*'([^']*)'/],
      [/video_alt_url:\s*'([^']+)'/, /video_alt_url_text:\s*'([^']*)'/]
    ];
    for (var i = 0; i < pairs.length; i++) {
      var url = (pairs[i][0].exec(html) || [])[1] || '';
      if (!url) continue;
      var label = H.entity((pairs[i][1].exec(html) || [])[1] || '');
      // `hd.php` 那种是会员跳转，不是媒体地址，跳过。
      if (/\/hd\.php/.test(url)) continue;
      qualities.push({ label: label || (i ? 'HD' : '默认'), url: H.abs(url) });
    }
    if (!qualities.length) throw new Error('85PO：详情页里没解出播放地址——站点可能改版，或该视频需要 VIP');
    return {
      kind: 'video',
      url: qualities[0].url,
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
