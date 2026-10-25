// LumeSource: {"id":"spankbang_video","name":"SpankBang","version":"1.0.0","category":"video","mirrors":["https://spankbang.com"]}
//
// 站点：https://spankbang.com （综合大 tube 站，全站 18+）
//
// ⚠️ 本脚本是「拿到内容就能用」的形态，但**内容抓取这一层在本机无法实测**，原因写清楚：
//
// ── 403 实测结论（2026-10-25，多组合验证过）
//   · 直连（不带代理）：DNS 被劫持到 173.252.248.244，TCP 连不上，curl 回 000；
//     手动 --resolve 指到真实 CF 出口 IP 时同样回 403。
//   · 走本机代理 http://127.0.0.1:7890：403，响应头 `Cf-Mitigated: challenge`、
//     `Server: cloudflare`、`cf-ray: …-HKG`，响应体是 Cloudflare 的 `Just a moment...` 挑战页（约 5.6KB，
//     `cType: 'interactive'`，带 `__cf_chl_opt` / `script-src https://challenges.cloudflare.com`）。
//   · 换头无效：桌面 Chrome 140 全套（UA + sec-ch-ua / sec-fetch-* + Accept + Accept-Language +
//     Referer: https://spankbang.com/）与 iPhone 17 UA 都是同一个挑战页。
//   · 换路径无效：/ 、/new_videos/ 、/trending/ 、/most_popular/ 、/categories/ 、/pornstars/ 、
//     /s/teen/ 、/api/v1/videos/new 、/api/videos/new 、/ajax/videos 、/sitemap.xml 、/feed/ 、/rss
//     —— 全部 403 挑战页（每个都重试过，000 只是代理抖动，重试即 403）。
//     **只有 /robots.txt 是 200**（Cloudflare 的托管规则单放行了它，里面没有任何片库数据）。
//   · m.spankbang.com 只是一条 301 回主域，跟着跳过去还是 403。
//   ⇒ 这是「按 IP 信誉 + TLS/JS 指纹判定」的 JS 挑战，不是 UA 或 Referer 能过的东西，
//     纯 HTTP 客户端（宿主 LumeSource.http / Node fetch / curl）在拿到 cf_clearance 之前
//     一页真实 HTML 都取不到。所以：**本脚本的所有 HTML 解析规则没有实测样本可对照**。
//
// ── 因此这里的设计（照 App 的既有范式，同 huavod.js / olehdtv.js）
//   1) 抓取层统一走 getText()：403 / 503 / 521，或响应体里出现 `Just a moment` / `cf-chl` / `__cf_chl_opt`
//      → 抛 `NEED_WEBVIEW_VERIFY：…`，App 收到后会在失败页给出「网页视图」按钮；
//      用户在 App 内置网页视图里过完校验，App 把整套 Cookie（含 HttpOnly 的 cf_clearance）
//      存进本源会话，之后本源**所有**请求自动带上 —— 这条路 App 侧是支持的，也是本源唯一可用的通路。
//      （脚本不读也不写 Cookie，那是宿主凭据。）
//   2) 解析规则用**不依赖具体 DOM 结构**的兜底式抽取：
//      · 列表：`/<videoId>/video/<slug>` 锚点 + 同块 og/cover 图 + 时长文本；
//      · 详情：og:title / og:image / og:description / <title>；
//      · 播放：页面里第一个 m3u8（优先）或 mp4 直链，覆盖 `"videoUrl":"…"`、`<source src=…>`、
//        `og:video` 三种常见内联形态。
//      一条都抽不到时**抛可读错误**（说明「站点结构未实测 / 已改版 / 是否还没过校验」），
//      不返回空壳、不猜地址。
//   3) categories() 先实时抓首页导航里的站内路径，抓不到就用下面的兜底路径表（同样未实测）。
//
// ── 已知限制
//   · 没有实测样本 ⇒ 解析正则可能对不上当前线上结构；拿到 403 之外的页面后第一件事应是校对
//     __parseItems / __mediaOf 里的锚点形状。
//   · 搜索路径按 ` /s/<词>/ ` 拼（spankbang 的搜索是路径式，不是 query 式）；`?sort=top` 之类的排序串没加，
//     避免在无法验证时凭空构造参数。
//   · 播放地址大概率是 CDN 签名直链，有时效；本源每次都现取播放页，不做缓存。
//   · 本机 7890 代理出口是机房 IP，CF 判定的就是这类 IP，过了网页视图也要保证 App 的网络配置
//     与网页视图走同一个出口，否则 cf_clearance 与 IP 绑不上。
//
// 2026-10-25 本机自测：lume-source-check 里 categories 走兜底表通过；home/list/detail/chapters/content
// 全部按设计抛 NEED_WEBVIEW_VERIFY（403 挑战页），所以 **本源的 PASS 只能在
// 「App 内置网页视图过校验 + 同出口 IP」之后取得，纯 shell 环境不可能 PASS**。

var DEFAULT_BASE = 'https://spankbang.com';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// 兜底分类：spankbang 的导航路径（/new_videos/ 等）。⚠️ 未实测，过完校验后应改成实时抓到的路径。
var FALLBACK_CATEGORIES = [
  { id: '/new_videos/', title: '最新' },
  { id: '/trending/', title: '正在流行' },
  { id: '/most_popular/', title: '最多观看' }
];

function base() {
  var domain = '';
  try {
    domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  } catch (error) {
    domain = '';
  }
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: referer || base() + '/',
    'Upgrade-Insecure-Requests': '1'
  };
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#34': '"' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n =
        code.charAt(1) === 'x' || code.charAt(1) === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  var plain = String(text == null ? '' : text)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return entity(plain).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  var text = entity(String(url == null ? '' : url)).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

/// 统一的 HTML 抓取：CF 挑战页一律转成 NEED_WEBVIEW_VERIFY，让 App 出「网页视图」
function responseOf(reply, path) {
  if (!reply) throw new Error('SpankBang：没有网络响应（' + path + '）');
  var status = Number(reply.status) || 0;
  var body = String(reply.body || '');
  if (status === 403 || status === 503 || status === 521 || status === 429) {
    throw new Error(
      'NEED_WEBVIEW_VERIFY：SpankBang 触发了 Cloudflare 人机校验（HTTP ' + status + '）——' +
        '请在「网页视图」里完成校验后再试（本源所有请求会自动带上校验后的 Cookie）'
    );
  }
  if (/Just a moment|__cf_chl_opt|cf-chl|challenges\.cloudflare\.com/i.test(body)) {
    throw new Error(
      'NEED_WEBVIEW_VERIFY：SpankBang 返回的是 Cloudflare 挑战页（HTTP ' + status + '）——' +
        '请在「网页视图」里完成校验后再试'
    );
  }
  if (status === 404) throw new Error('SpankBang：页面不存在（HTTP 404）' + path);
  if (status === 451) throw new Error('SpankBang：该地区被站点屏蔽（HTTP 451）' + path);
  if (status !== 200) throw new Error('SpankBang：请求失败 HTTP ' + status + ' ' + path);
  if (body.length < 512) throw new Error('SpankBang：响应过短（' + body.length + ' 字节），可能被拦' + path);
  return body;
}

async function getText(path, referer) {
  var url = /^https?:\/\//i.test(path) ? path : base() + (String(path).charAt(0) === '/' ? path : '/' + path);
  var reply = await LumeSource.http.get(url, { headers: headers(referer) });
  return responseOf(reply, url);
}

/// 列表页 → Item[]。不绑定具体 DOM：以 `/<vid>/video/<slug>` 锚点切块，再在块内找封面与时长。
function parseItems(html) {
  var items = [];
  var seen = {};
  var text = String(html);
  var anchor = /<a\b[^>]*href="(?:\/|https?:\/\/[^"]*?\/)([a-z0-9]{5,10})\/video\/([a-z0-9-]{2,120})"[^>]*>([\s\S]{0,400}?)<\/a>/gi;
  var matched;
  while ((matched = anchor.exec(text)) !== null) {
    var videoId = matched[1];
    if (seen[videoId]) continue;
    var block = text.slice(matched.index, Math.min(text.length, matched.index + 1600));
    var title = clean(matched[3]);
    if (!title) {
      var alt = /(?:alt|title)="([^"]{3,200})"/.exec(block);
      title = alt ? clean(alt[1]) : '';
    }
    if (!title) title = matched[2].replace(/-/g, ' ');
    var cover =
      (/<img[^>]+(?:data-src|data-original|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(block) || [])[1] || '';
    var duration = (/<span[^>]*class="[^"]*(?:l-?time|duration|length)[^"]*"[^>]*>([^<]{2,12})</i.exec(block) || [])[1] || '';
    seen[videoId] = 1;
    items.push({
      id: String(videoId) + '/video/' + matched[2],
      title: title,
      cover: cover ? absolute(cover) : null,
      subtitle: clean(duration)
    });
  }
  return items;
}

/// 页面里找媒体地址：m3u8 优先，其次 mp4；覆盖 videoUrl / source src / og:video 三种内联形态
function mediaOf(html) {
  var text = String(html || '').replace(/\\\//g, '/');
  var found = [];
  var m3u8 = /(?:https?:)?\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/gi;
  var matched;
  while ((matched = m3u8.exec(text)) !== null) found.push({ kind: 'hls', url: entity(matched[0]) });
  if (!found.length) {
    var mp4 = /(?:https?:)?\/\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/gi;
    while ((matched = mp4.exec(text)) !== null) found.push({ kind: 'mp4', url: entity(matched[0]) });
  }
  for (var i = 0; i < found.length; i++) {
    found[i].url = absolute(found[i].url);
    if (/\.(m3u8|mp4)/i.test(found[i].url)) return found[i];
  }
  return null;
}

var LumeSource = {
  id: 'spankbang_video',
  name: 'SpankBang',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://spankbang.com'],

  /// 分类：优先抓首页导航里的站内路径（`/new_videos/`、`/trending/`、`/most_popular/` 这类），
  /// 抓不到（多半是 CF 403）就用兜底表 —— 这里**不抛错**，保证源至少能导入、能出分类。
  async categories() {
    var rows = [];
    var seen = {};
    try {
      var html = await getText('/');
      var pattern = /<a\b[^>]*href="\/(new_videos|trending|most_popular|top_rated|pornstars|categories|c|[a-z_]*)\/?"[^>]*>([^<]{2,24})</gi;
      var matched;
      while ((matched = pattern.exec(html)) !== null) {
        var path = '/' + matched[1] + '/';
        var title = clean(matched[2]);
        if (!title || seen[path]) continue;
        if (!/new|trend|popular|top|star|categor|^\/c\//.test(path)) continue;
        seen[path] = 1;
        rows.push({ id: path, title: title });
      }
    } catch (error) {
      console.warn('[spankbang] 分类导航抓取失败，用兜底表：' + error);
    }
    if (!rows.length) {
      for (var i = 0; i < FALLBACK_CATEGORIES.length; i++) rows.push(FALLBACK_CATEGORIES[i]);
    }
    rows.push({ id: 'search:' + encodeURIComponent('new'), title: '搜索' });
    return rows;
  },

  async home() {
    var page = await this.list({ categoryId: '/new_videos/', page: 1 });
    if (!page.items.length) throw new Error('SpankBang：首页没认出条目（站点可能改版，或尚未通过 CF 校验）');
    return [{ title: '最新', moreUrl: '/new_videos/', items: page.items.slice(0, 24) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim() || '/new_videos/';
    var path;
    if (keyword) {
      // spankbang 的搜索是路径式：/s/<词>/（不是 ?q=）。分页用 /s/<词>/<N>/
      path = '/s/' + encodeURIComponent(keyword).replace(/%20/g, '+') + '/' + (page > 1 ? page + '/' : '');
    } else if (categoryId.indexOf('search:') === 0) {
      path = '/s/' + decodeURIComponent(categoryId.slice(7)) + '/' + (page > 1 ? page + '/' : '');
    } else if (/^https?:\/\//i.test(categoryId)) {
      path = categoryId;
    } else {
      var rel = categoryId.charAt(0) === '/' ? categoryId : '/' + categoryId;
      if (!/\/$/.test(rel)) rel += '/';
      path = page > 1 ? rel + page + '/' : rel;
    }
    var html = await getText(path);
    var items = parseItems(html);
    if (!items.length) console.warn('[spankbang] 列表没解析出条目：' + path + '（规则未实测，需校对锚点形状）');
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return null;
    var path = /^https?:\/\//i.test(id) ? id : base() + '/' + id.replace(/^\/+/, '');
    var html = await getText(path);
    var title =
      (/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html) || [])[1] ||
      (/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(html) || [])[1] ||
      '';
    if (!title) {
      var titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      title = titleTag ? clean(titleTag[1]).replace(/\s*[-|]\s*SpankBang.*$/i, '') : '';
    }
    if (!title) title = clean(id);
    var cover =
      (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html) || [])[1] ||
      (/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i.exec(html) || [])[1] ||
      '';
    var description = (/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) || [])[1] || '';
    var duration = (/<meta[^>]+property=["']og:video:duration["'][^>]+content=["']([^"']*)["']/i.exec(html) || [])[1] || '';
    return {
      id: id,
      title: clean(title),
      cover: cover ? absolute(cover) : null,
      subtitle: duration ? String(duration) + ' 秒' : '',
      description: clean(description).slice(0, 600)
    };
  },

  /// 单集：spankbang 一条视频一个播放页（清晰度是同一 HLS 里的多码率，不是分集）
  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var settings = argument || {};
    var id = String(settings.id || '').trim();
    if (!id) throw new Error('SpankBang：缺少视频 id（应来自 list() 的条目）');
    var pageUrl = /^https?:\/\//i.test(id) ? id : base() + '/' + id.replace(/^\/+/, '');
    var html = await getText(pageUrl);
    var media = mediaOf(html);
    if (!media) {
      // 播放器页有时只有 embed 里带地址，再试一次
      var embedBase = pageUrl.replace(/\/video\/.*$/, '');
      try {
        var embedHtml = await getText(embedBase + '/embed/', pageUrl);
        media = mediaOf(embedHtml);
      } catch (error) {
        console.warn('[spankbang] embed 页也取不到：' + error);
      }
    }
    if (!media) {
      throw new Error(
        'SpankBang：详情页里没找到可播地址（页面 ' +
          html.length +
          ' 字节）——可能是站点结构改了，或页面还不是真实内容（CF 校验未通过时本应抛 NEED_WEBVIEW_VERIFY，' +
          '若你看到这句，说明拿到了非挑战页但这套解析规则还没校对过，请把这一页的 HTML 贴回给源作者）'
      );
    }
    return {
      kind: 'video',
      url: media.url,
      headers: {
        'User-Agent': UA,
        Referer: pageUrl,
        Accept: '*/*'
      }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
