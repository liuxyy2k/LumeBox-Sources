// LumeSource: {"id":"xhamster_video","name":"xHamster","version":"1.0.1","category":"video","mirrors":["https://xhamster.com","https://www.xhamster.com"]}

// 站点：https://xhamster.com （Vue SSR + xplayer）
//
// 结构（2026-10-22 逐页核过；本机直连不通，验证走本机代理出口）：
//   首页      GET /                    视频网格（`div.thumb-list__item[data-video-id]`）
//   分类      GET /categories           站点分类索引（实测 657 个 `/categories/<slug>`）
//             GET /categories/<slug>    分类列表
//   搜索      GET /search/<关键词>
//   翻页      以上列表一律 `?page=<N>`（1 基；页面里的 JSON 也写着 pageLinkTemplate=…?page={#}）
//   卡片      `div.thumb-list__item`：地址是**绝对**的 `https://xhamster.com/videos/<slug>-<id>`、
//             标题在 `aria-label`、封面 `img[src]`、时长 `data-role="video-duration"`、播放数 `… views`。
//   详情      GET <视频地址>：标题 og:title（h1 同文）、封面 og:image。
//   播放      页面把播放源写成**加密串**（`"h264":[{"url":"06a6…"}]`），不能直接用；
//             但页面 `<link rel="preload">` 里有一条明文 HLS：
//               https://video-nss.xhcdn.com/<token>/media=hls4/multi=…/_TPL_.av1.mp4.m3u8
//             实测把 `_TPL_.av1.mp4.m3u8` 换成 `_TPL_.h264.mp4.m3u8` 就是同一批码率的
//             **H.264** 主清单（144p/240p/480p/720p，真站 200），所以默认给 H.264、AV1 作备选。
//             注意：另一部分视频走 `video-b.xhcdn.com/key=…,end=…` 那套 token，只认 av1
//             （换 h264 回 403），这类只能给 AV1——需要 MPV 内核解码，AVPlayer 在旧机型上不行。
//             两条都带 `,<过期时间>` 签名，**每次播放重新取详情页**。
var H = {
  base: 'https://zh.xhamster.com', name: 'xHamster', defaultBase: 'https://zh.xhamster.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  clean: function (s) { return this.entity(String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim(); },
  entity: function (s) { return String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);|&#(?:x[0-9a-f]+|\d+);/gi, function (v) { var map = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }; if (map[v]) return map[v]; var code = v.charAt(2) === 'x' ? parseInt(v.slice(3), 16) : parseInt(v.slice(2), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : v; }); },
  abs: function (u, from) { u = this.entity(u).trim(); if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; if (u.indexOf('//') === 0) return 'https:' + u; var b = from || this.base; if (u.charAt(0) === '/') return /^https?:\/\/[^/]+/.exec(b)[0] + u; return b.replace(/[^/]*$/, '') + u; },
  headers: function () { return { 'User-Agent': this.ua, 'Referer': this.base + '/', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5' }; },
  useDomain: function () { var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null; this.base = String((c && c.domain) || this.defaultBase).replace(/\/+$/, ''); if (/^https:\/\/(?:www\.)?xhamster\.com$/.test(this.base)) this.base = 'https://zh.xhamster.com'; return this.base; },
  response: function (r) { if (!r) throw new Error(this.name + '：没有网络响应'); var s = r.status; if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证（HTTP ' + s + '）'); if (s === 404) throw new Error(this.name + '：页面不存在（HTTP 404）'); if (s !== 200) throw new Error(this.name + '：请求失败（HTTP ' + s + '）'); var b = String(r.body || ''); if (/cf-chl-|Just a moment|<title>\s*人机校验/i.test(b)) throw new Error('NEED_WEBVIEW_VERIFY：' + this.name + ' 需要网页验证'); return b; },
  get: async function (u) { return this.response(await LumeSource.http.get(this.abs(u, this.base + '/'), { headers: this.headers() })); }
};

var LumeSource = {
  id: 'xhamster_video',
  name: 'xHamster',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://xhamster.com', 'https://www.xhamster.com'],

  /// 首页：站点首页网格（一屏 24 条）。
  async home() {
    H.useDomain();
    var page = await this.list({ categoryId: '/', page: 1 });
    if (!page.items.length) throw new Error('xHamster：首页没认出条目（站点可能改版）');
    return [{ title: '推荐视频', moreUrl: '/', items: page.items.slice(0, 24) }];
  },

  /// 分类＝站点 `/categories` 索引（实测 657 个，取前 160 个，顺序用站点自己的）。
  async categories() {
    H.useDomain();
    var rows = [{ id: '/', title: '首页推荐' }];
    var seen = { '/': true };
    try {
      var html = await H.get('/categories');
      // 分类页按 <section> 分组（Production / Actions / Fetish / … / Location）；
      // 「Porn in your language」「All other categories」「How-Tos」三组不是内容分类，整组跳过。
      var sections = String(html).split(/<section\b/);
      for (var i = 0; i < sections.length; i++) {
        var head = /<h2[^>]*>([\s\S]{0,400}?)<\/h2>/.exec(sections[i]);
        var section = head ? H.clean(head[1]) : '';
        if (/Porn in your language|All other categories|How-Tos/i.test(section)) continue;
        var re = /href="https?:\/\/(?:[a-z0-9-]+\.)?xhamster\.com\/categories\/([a-z0-9-]+)"[\s\S]{0,800}?<h3[^>]*>([\s\S]{0,160}?)<\/h3>/g, m;
        while ((m = re.exec(sections[i])) !== null) {
          var id = '/categories/' + m[1];
          var title = H.clean(m[2]);
          if (!title || seen[id]) continue;
          seen[id] = true;
          rows.push({ id: id, title: title });
        }
      }
    } catch (error) {
      console.warn('[xhamster] 分类索引抓取失败：' + error);
    }
    return rows.slice(0, 200);
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim() || '/';
    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword);
    } else if (category.charAt(0) === '/') {
      path = category.split('?')[0];
    } else {
      path = '/';
    }
    var basePath = path;
    if (page > 1) {
      // 站点的两种翻页写法（页面 JSON 里的 pageLinkTemplate 也印证）：
      // 搜索是 `?page=N`；首页与分类页是路径式 `/<N>`（首页第 2 页就是 `/2`）。
      if (keyword) path = basePath + '?page=' + page;
      else if (basePath === '/') path = '/' + page;
      else path = basePath.replace(/\/+$/, '') + '/' + page;
    }
    var html = await H.get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[xhamster] 列表没解析出条目：' + path);
    return { items: items, hasMore: this.__hasMore(html, keyword, basePath, page) };
  },

  __items: function (html) {
    var out = [];
    var seen = {};
    var blocks = String(html).split(/data-video-id="/);
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i];
      var link = /href="(https?:\/\/(?:[a-z0-9-]+\.)?xhamster\.com\/videos\/[^"]+)"/.exec(block);
      if (!link) continue;
      var path = link[1].replace(/^https?:\/\/[^/]+/, '');
      if (seen[path]) continue;
      var title = (/aria-label="([^"]*)"/.exec(block) || [])[1] || '';
      title = H.clean(title);
      if (!title) continue;
      seen[path] = true;
      var cover = (/<img[^>]+src="(https:\/\/[^"]+)"/.exec(block) || [])[1] || '';
      var duration = (/data-role="video-duration">[\s\S]{0,260}?(\d{1,2}:\d{2}(?::\d{2})?)/.exec(block) || [])[1] || '';
      var views = (/[\d.,]+\s*[KMB]?\s*views/i.exec(H.clean(block)) || [])[0] || '';
      out.push({
        id: path,
        title: title,
        cover: cover ? H.abs(cover) : null,
        coverHeaders: H.headers(),
        subtitle: [duration, views].filter(function (x) { return !!x; }).join(' · ')
      });
    }
    // SSR contains the complete catalogue; lazy HTML can have just a handful
    // of rendered images. Parse data, never evaluate the site's scripts.
    var initial = /window\.initials\s*=\s*([\s\S]*?)<\/script>/i.exec(String(html));
    if (initial) {
      try {
        var state = JSON.parse(initial[1].trim().replace(/;$/, ''));
        var pending = [state], count = 0;
        while (pending.length && count++ < 20000) {
          var node = pending.pop();
          if (!node || typeof node !== 'object') continue;
          if (node.pageURL && node.title && (node.imageURL || node.thumbURL)) {
            var url = H.abs(node.pageURL);
            var path = url.replace(/^https?:\/\/[^/]+/, '');
            if (/^\/videos\/[^/?]+$/.test(path)) {
              var cover = H.abs(node.imageURL || node.thumbURL);
              var old = out.filter(function (item) { return item.id === path; })[0];
              if (old) { if (!old.cover) old.cover = cover; }
              else if (!seen[path]) {
                seen[path] = true;
                out.push({id:path, title:H.clean(node.title), cover:cover,
                  coverHeaders:H.headers(), subtitle:String(node.duration || '')});
              }
            }
          }
          Object.keys(node).forEach(function (key) {
            if (node[key] && typeof node[key] === 'object') pending.push(node[key]);
          });
        }
      } catch (_) { /* Keep HTML cards if a site experiment changes the data. */ }
    }
    return out;
  },

  __hasMore: function (html, keyword, basePath, page) {
    var text = String(html).replace(/&amp;/g, '&');
    if (keyword) return new RegExp('page(?:=|&#x3D;)' + (page + 1) + '(?!\\d)').test(text);
    var escaped = String(basePath === '/' ? '' : basePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped + '/' + (page + 1) + '"').test(text);
  },

  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^/]+$/.test(id)) return null;
    var html = await H.get(id);
    var title = H.entity(((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) || [])[1] || ''));
    if (!title) {
      var h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
      title = h1 ? H.clean(h1[1]) : '';
    }
    if (!title) return null;
    var cover = ((/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) || [])[1] || '');
    var views = (/[\d.,]+\s*[KMB]?\s*views/i.exec(H.clean(html.slice(0, 200000))) || [])[0] || '';
    return {
      id: id,
      title: title,
      cover: cover ? H.abs(cover) : null,
      coverHeaders: H.headers(),
      subtitle: views
    };
  },

  async chapters(argument) {
    if (!argument || !argument.id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  /// 播放：现取详情页，从 `<link rel="preload">` 取明文 HLS，再换成 H.264 主清单。
  async content(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/videos\/[^/]+$/.test(id)) {
      throw new Error('xHamster：认不出视频地址（' + id + '）——id 应当来自 list()');
    }
    var pageUrl = H.abs(id);
    var html = await H.get(id);
    // 明文 HLS 在 <link rel="preload"> 里；实测两种 CDN 写法（各抓 12 条汇总）：
    //   video-nss / video-nss-a / video-nss-b.xhcdn.com/<token>,<过期>/…/_TPL_.av1.mp4.m3u8
    //     → 把 `_TPL_.av1` 换成 `_TPL_.h264` 就是同一批码率的 H.264 主清单（逐条实测 200）
    //   video-a / video-b / video7.xhcdn.com/key=…,end=…/…/_TPL_.av1.mp4.m3u8
    //     → token 只认 av1（换 h264 回 403 Wrong key），只能给 AV1；AV1 需要能解的
    //       内核（MPV），AVPlayer 在旧机型上解不了——如实标在清晰度名字里。
    var av1 = (/<link[^>]+rel="preload"[^>]+href="(https:\/\/[^"]*xhcdn\.com\/[^"]+\.m3u8)"/.exec(html) || [])[1] || '';
    if (!av1) {
      var loose = /(https:\/\/video[^"']*xhcdn\.com\/[^"']+\.m3u8)/.exec(html);
      av1 = loose ? loose[1] : '';
    }
    if (!av1) {
      throw new Error('xHamster：详情页里没解出播放地址——站点可能改版，或该视频需要登录/VIP');
    }
    var derivesH264 = av1.indexOf('_TPL_.av1.mp4.m3u8') >= 0 && av1.indexOf('/key=') < 0;
    var h264 = derivesH264 ? av1.replace('_TPL_.av1.mp4.m3u8', '_TPL_.h264.mp4.m3u8') : '';
    var qualities = [];
    if (h264) qualities.push({ label: 'HLS H.264', url: h264 });
    qualities.push({ label: h264 ? 'HLS AV1' : 'HLS AV1（需 MPV 内核解码）', url: av1 });
    return {
      kind: 'video',
      url: h264 || av1,
      headers: { 'Referer': pageUrl, 'User-Agent': H.ua },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
