// LumeSource: {"id":"jj38_video","name":"久久热","version":"1.0.0","category":"video","mirrors":["https://www.99jj38.com","https://99jj38.com"]}

// 站点：https://www.99jj38.com （久久热视频，国产自拍，KVS 模板）
//
// 结构（2026-10-24 逐页核过；本机直连不通，验证走本机代理出口）：
//   列表      GET /latest-updates/<N>/、/top-rated/<N>/、/most-viewed/<N>/（1 基）
//   标签      GET /tags/<slug>/<N>/（首页导航里带 50 个标签）
//   卡片      `div.item`：地址 `a[href=/videos/<id>/<slug>/]`、封面 `img.thumb`、
//             标题 `strong.title`、时长 `.duration`（KVS 标准结构）。
//   详情      GET <视频地址>：标题 og:title、封面 og:image。
//   播放      `var flashvars = { video_url: '…/<id>.mp4/', video_url_text: 'LQ',
//              video_alt_url: '/hd.php', video_alt_url_text: 'HD' }`
//             **站点的 HD 是 VIP 专属**：`/hd.php` 返回的是「只有 VIP 才能观看高清」的跳转页，
//             不是媒体地址。所以只把 `video_url`（标清）交给播放器，并在文案里如实标「标清」。
//   搜索      `/search/<词>/` 返回「请登录后搜索」且 0 条——**搜索需要账号**，
//             脚本不假装有结果，直接抛可读错误，请用分类浏览。
var H = {
  base: 'https://www.99jj38.com', name: '久久热', defaultBase: 'https://www.99jj38.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); },
  entity: function (s) { return String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/gi, function (v) { var m = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }; return m[v] || v; }); },
  abs: function (u) { u = this.entity(u).trim(); if (!u) return ''; if (u.indexOf('//') === 0) return 'https:' + u; if (/^https?:\/\//i.test(u)) return u; if (u.charAt(0) === '/') return /^https?:\/\/[^/]+/.exec(this.base)[0] + u; return u; },
  useDomain: function () { var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null; this.base = String((c && c.domain) || this.defaultBase).replace(/\/+$/, ''); return this.base; },
  headers: function (page) { return { 'User-Agent': this.ua, 'Referer': page || this.base + '/' }; },
  response: function (r) { if (!r) throw new Error(this.name + '：没有网络响应'); var s = r.status; if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证（HTTP ' + s + '）'); if (s === 404) throw new Error(this.name + '：页面不存在（HTTP 404）'); if (s !== 200) throw new Error(this.name + '：请求失败（HTTP ' + s + '）'); return String(r.body || ''); },
  get: async function (path) { return this.response(await LumeSource.http.get(this.base + path, { headers: this.headers() })); }
};

var LumeSource = {
  id: 'jj38_video',
  name: '久久热',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.99jj38.com', 'https://99jj38.com'],

  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/latest-updates/', page: 1 });
    if (!page.items.length) throw new Error('久久热：首页没认出条目（站点可能改版）');
    return [{ title: '最新更新', moreUrl: '/latest-updates/', items: page.items.slice(0, 24) }];
  },

  /// 分类＝三个排序入口 + 首页导航里的标签。
  async categories() {
    H.useDomain();
    var rows = [
      { id: '/latest-updates/', title: '最新' },
      { id: '/top-rated/', title: '最高评分' },
      { id: '/most-viewed/', title: '最多观看' }
    ];
    var seen = {};
    try {
      var html = await H.get('/');
      var re = /href="([^"]*\/(?:tags|categories)\/[^"\/]+\/)"[^>]*>([\s\S]{0,160}?)<\/a>/g, m;
      while ((m = re.exec(html)) !== null) {
        var id = m[1].replace(/^https?:\/\/[^/]+/, '');
        // 分类名后面常跟一个 `<span class="rating">数量</span>`，只留名字。
        var title = H.clean(String(m[2]).replace(/<span class="rating"[^>]*>[\s\S]*?<\/span>/gi, ''));
        if (!id || !title || seen[id]) continue;
        seen[id] = true;
        rows.push({ id: id, title: title });
      }
    } catch (error) {
      console.warn('[99jj38] 标签导航抓取失败：' + error);
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
    if (keyword) throw new Error('久久热：该站搜索需要登录（脚本不代登录），请用分类浏览');
    var path = /^\/(?:latest-updates|top-rated|most-viewed|tags\/[^\/]+|categories\/[^\/]+)\/?$/.test(category)
      ? category : '/latest-updates/';
    path = path.replace(/\/?$/, '/') + page + '/';
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[99jj38] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, page) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/<div\s+class="item[ "]/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].slice(0, 3500);
      var link = /href="(https?:\/\/[^"]*\/videos\/[^"\/]+\/[^"\/]+\/)"/.exec(block);
      if (!link) continue;
      var id = link[1].replace(/^https?:\/\/[^/]+/, '');
      if (seen[id]) continue;
      var title = H.entity((/<a[^>]+title="([^"]{2,200})"/.exec(block) || [])[1] || '');
      if (!title) title = H.clean((/<strong class="title"[^>]*>([\s\S]{0,300}?)<\/strong>/.exec(block) || [])[1] || '');
      if (!title) continue;
      seen[id] = true;
      var img = /<img[^>]+(?:data-original|src)="([^"]+)"/.exec(block);
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

  __hasMore: function (html, page) {
    return new RegExp('/' + (page + 1) + '/"').test(String(html));
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^\/]+\/[^\/]+\/$/.test(id)) return null;
    var html = await H.get(id);
    var title = H.entity((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '');
    if (!title) {
      var h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
      title = h1 ? H.clean(h1[1]) : '';
    }
    if (!title) return null;
    var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '';
    var cats = H.entity((/video_categories:\s*'([^']*)'/.exec(html) || [])[1] || '');
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: cats
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^\/]+\/[^\/]+\/$/.test(id)) throw new Error('久久热：认不出视频地址（' + id + '）——id 应当来自 list()');
    var pageUrl = H.base + id;
    var html = await H.get(id);
    var url = (/video_url:\s*'([^']+)'/.exec(html) || [])[1] || '';
    var label = H.entity((/video_url_text:\s*'([^']*)'/.exec(html) || [])[1] || '');
    if (!url) throw new Error('久久热：详情页里没解出播放地址——站点可能改版，或该视频需要 VIP');
    return {
      kind: 'video',
      url: H.abs(url),
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: [{ label: (label ? label + ' ' : '') + '标清（HD 需 VIP）', url: H.abs(url) }]
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
