// LumeSource: {"id":"jcomic_comic","name":"JComic","version":"1.2.0","category":"comic","mirrors":["https://jcomic.net","https://www.jcomic.net"]}

// 站点：https://jcomic.net（Bootstrap 站 + ccat 结构；桌面/移动同一套标记）
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/jcomic_*.html）
//
//   分类  GET /  首页就是分类宫格：`<h3><a href="/cat/{名}">名</a></h3>`
//         （最近更新 / 隨機 / 全彩 / 長篇 / 單行本 / 同人 / 短篇 / Cosplay / 歐美 /
//         WEBTOON…）。分类 id 就存这个中文名，请求时自己百分号编码。
//   列表  GET /cat/{分类}/{N}   30 条/页；`/cat/{分类}` 与 `/cat/{分类}/1` 同内容
//         （脚本一律拼 N）。分页器 `<a href="/cat/{分类}/{N}"> &raquo;</a>` 指向下一页。
//   搜索  GET /search/{关键词}/{N}   30 条/页（站点搜索框的 onload 就是跳这里）。
//   条目  列表里的锚点有**两种形态**（同一条列表里混着出现，实测 30 条里 13 条 /eps、
//         17 条 /page）：
//           · `/eps/{标题}`   多分话作品：详情页列出分镜，正文在 /page/{标题}/{N}；
//           · `/page/{标题}`  单页作品：锚点直接指向阅读页，没有 /eps 页、没有分话。
//         因此**作品 id 就存这条路径**（自带形态信息），标题用显示名。
//         标题里的 `/` `～` `+` 一类字符，站点在路径里换成了 `|A` `|E` `|P` 记号
//         （实测：显示名「星期一的丰满/月曜日のたわわ」/ 路径「星期一的丰满|A月曜…」），
//         id 必须原样保留记号，请求时统一 __encPath 编码。
//   详情  GET /eps/{标题}（多分话）或 /page/{标题}（单页）
//         干净标题在 `<h1>`；作者 `a[href=/author/…]`；分类 `a[href=/cat/…]`。
//         封面：/eps 页是本作第一张 `img.comic-thumb[src]`（签名地址）；
//         /page 页**没有**普通封面标签，取第一张加密正文图解出来的地址。
//   目录  在 /eps/{标题} 页里：`<a href="/page/{标题}/{N}"><button …>{分镜名}`，
//         {N} 从 1 开始、顺序即站点顺序（不重排）；/page 单页作品直接给一条「正文」。
//   正文  GET /page/{标题}/{N}
//         「一章」= 整个分镜，页面上一次性给出**本章全部图片**（实测一章 101/392/454 张）。
//
// ## 图片地址是**加密串**，必须解码（这是本站的核心差异）
//
//   `<img class="… jcomic-img" src="" data-locked="JCOMIC_TRAPS_{串}">`，
//   真地址 = base64 解码（去掉前缀、**整串倒序**之后）：
//       img.src = atob(data-locked.replace('JCOMIC_TRAPS_','').split('').reverse().join(''))
//   ——本站自己页面的 IntersectionObserver 就是这么干的（快照 jcomic_page1.html 里
//   那段脚本原样抄下来核对过）。沙箱里不赌 atob 存在，解码用本脚本自带的
//   __b64decode（纯 JS，字符集查表）。
//
// ## 一条必须如实说清的站点限制：图片直链是 **60 秒签名**的 S3 预签名地址
//
//   解码出来的地址形如 `https://images.jcomic.net/{漫画目录}/{章}/{页}.jpg
//   ?X-Amz-…&X-Amz-Expires=60&X-Amz-Signature=…`——**有效期 60 秒**：
//     · 实测：同一地址放超过 60 秒再取 → 403（不带签名的裸地址同样 403）；
//     · 因此「列表/详情里已经拿到的封面」和「已翻过但没加载的正文图」在缓存里放久了
//       会失效（App 侧表现为占位图；重进列表 / 重新打开本章即拿到新签名）；
//     · 章节正文在一打开时就把整套地址交出去，App 的预取窗口（默认前后几页）
//       都在 60 秒内完成，正常连续阅读不受影响。
//   这个限制来自站点本身（浏览器里同样是 60 秒内加载完），脚本无法绕开——
//   不要试图去掉查询串：实测裸地址 403。
//
// 主站和图片域名分别校验：主站可访问不代表 images.jcomic.net 已放行。
// 图片域名被 Cloudflare 拦截时需在 App 中完成该域名的网页验证。

var BASE_URL = 'https://jcomic.net';

var PAGE_SIZE = 30;        // 列表/搜索每页条数（快照实测）
var ITEM_WINDOW = 2200;    // 单条往后看的窗口（封面 + 标题 + 作者 + 分类都在这段里）
var MAX_ITEMS = 300;       // 单次列表最多产出
var MAX_BOARDS = 4;        // 首页最多几块
var MAX_CHAPTERS = 2000;   // 目录最多解析多少话
var MAX_IMAGES = 900;      // 正文最多收多少张图（实测一章 454 张）
var MAX_TAGS = 10;         // 详情页分类最多收几个

// 首页默认挑这几块（按站点分类名，缺哪个跳过哪个）。
var HOME_PICKS = ['最近更新', '全彩', '長篇'];
var HOME_BUDGET_MS = 6000;   // 首页软截止（沙箱单次调用预算是 3–10s，见 home()）

/// 主站地址：App 可能注入解析后的域名（自定义域名 > 选中镜像 > 第一个镜像）。
/// 各入口第一句都调一次——注入发生在脚本加载之后，只在加载时算一次就永远读不到
/// 「换网址 / 自定义域名」。
function syncBase() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  if (d) BASE_URL = d;
}

var LumeSource = {
  id: 'jcomic_comic',
  name: 'JComic',
  version: '1.2.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：首页宫格里的 `/cat/{名}`（实时抓，不写死）。
  async categories() {
    syncBase();
    var html = await this.__get('/');
    var pattern = /<h3>\s*<a href="\/cat\/([^"]+)">([^<]*)<\/a>/g;
    var seen = {};
    var result = [];
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var id = this.__clean(match[1]);
      if (!id || seen[id]) continue;
      seen[id] = true;
      result.push({ id: id, title: this.__clean(match[2]) || id });
    }
    return result;
  },

  /// 首页：最近更新 + 两个分类的首屏，每块 12 条。
  ///
  /// **逐块 try/catch + 软截止**：沙箱给单次调用的墙钟预算是 3–10 秒（默认 10），
  /// 三块串行（每块 ≈55KB）在慢网络下会顶到上限、整个 home 以「调用超时」收场。
  /// 到点就把已经拿到的板块先返回——首页有几块是几块，好过整页空白。
  async home() {
    syncBase();
    var started = new Date().getTime();
    var categories = [];
    try {
      categories = await this.categories();
    } catch (error) {
      console.warn('[jcomic] 首页取分类失败：' + error);
    }
    var picks = [];
    for (var i = 0; i < HOME_PICKS.length; i++) {
      for (var j = 0; j < categories.length; j++) {
        if (categories[j].id === HOME_PICKS[i]) picks.push(categories[j].id);
      }
    }
    if (!picks.length) {
      for (var k = 0; k < categories.length && picks.length < MAX_BOARDS; k++) {
        picks.push(categories[k].id);
      }
    }
    var boards = [];
    for (var b = 0; b < picks.length && boards.length < MAX_BOARDS; b++) {
      if (new Date().getTime() - started > HOME_BUDGET_MS) {
        console.warn('[jcomic] 首页到软截止（' + HOME_BUDGET_MS + 'ms），先返回已有的 '
          + boards.length + ' 块');
        break;
      }
      try {
        var payload = await this.list({ categoryId: picks[b], page: 1 });
        var items = payload && payload.items ? payload.items : [];
        if (!items.length) continue;
        boards.push({
          title: picks[b],
          moreUrl: picks[b],
          items: items.slice(0, 12)
        });
      } catch (error) {
        console.warn('[jcomic] 首页「' + picks[b] + '」失败：' + error);
      }
    }
    return boards;
  },

  async list(argument) {
    syncBase();
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    if (!keyword && !category) category = '最近更新';

    var url = keyword
      ? '/search/' + encodeURIComponent(keyword) + '/' + page
      : '/cat/' + encodeURIComponent(category) + '/' + page;
    var html = await this.__get(url);
    var items = this.__listItems(html);
    for (var i = 0; i < items.length; i++) items[i].coverHeaders['X-Lume-Image-Page'] = this.__absolute(url);
    // 常态满页 30 条；不足 90% 就当最后一页（比精确读分页器稳妥：站点的
    // `&raquo;` 末页也会在，只有它是 `disabled` 才说明到头——见 __hasNextPage）。
    return { items: items, hasMore: this.__hasNextPage(html, page, items.length) };
  },

  async detail(argument) {
    syncBase();
    var id = this.__pathId(argument);
    var html = await this.__get(this.__encPath(id));
    var title = this.__cleanTitle(this.__title(html));
    if (!title) {
      console.warn('[jcomic] 详情页没认出标题：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html, id.indexOf('/page/') === 0);
    var tags = info.categories.slice(0);
    if (info.author) tags.unshift('作者：' + info.author);
    return {
      id: id,
      title: title,
      cover: info.cover,
      coverHeaders: { 'Referer': BASE_URL + '/', 'X-Lume-Image-Page': this.__absolute(this.__encPath(id)) },
      subtitle: info.categories.join(' · '),
      description: tags.join(' · '),
      tags: info.categories.slice(0, MAX_TAGS),
      extra: { author: info.author, categories: info.categories }
    };
  },

  async chapters(argument) {
    syncBase();
    var id = this.__pathId(argument);
    // 单页作品（`/page/{标题}` 形态）：站点自己就只有一页，给一条「正文」入口，
    // content() 按第 1 页取（**不编造分话**）。
    if (id.indexOf('/page/') === 0) return [{ id: '1', title: '正文' }];
    var html = await this.__get(this.__encPath(id));
    var chapters = this.__chapters(html, id);
    if (!chapters.length) return [{ id: '1', title: '正文' }];
    return chapters;
  },

  async content(argument) {
    syncBase();
    var id = this.__pathId(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '1';
    if (!/^\d+$/.test(chapterId)) chapterId = '1';
    var pagePath = id.indexOf('/page/') === 0
      ? id
      : '/page/' + id.slice('/eps/'.length) + '/' + chapterId;
    var html = await this.__get(this.__encPath(pagePath));
    var images = this.__images(html);
    if (!images.length) {
      throw new Error('JComic：正文页没认出图片（' + pagePath + '，'
        + html.length + ' 字符）——站点可能改了加密串格式，把运行日志发回来');
    }
    var imageHeaders = {};
    for (var i = 0; i < images.length; i++) imageHeaders[images[i]] = { 'Referer': BASE_URL + '/', 'X-Lume-Image-Page': this.__absolute(this.__encPath(pagePath)) };
    return { kind: 'images', images: images, imageHeaders: imageHeaders };
  },

  // Signed image URLs expire after 60 seconds; refresh the originating page.
  async refreshImage(argument) {
    syncBase();
    var page = String(argument && argument.page || '');
    if (page.indexOf(BASE_URL + '/') !== 0) throw new Error('图片来源页不属于当前站点');
    var now = Date.now();
    this.__freshImages = this.__freshImages || {};
    var keys = Object.keys(this.__freshImages);
    for (var k = 0; k < keys.length; k++) if (now - this.__freshImages[keys[k]].at > 20000) delete this.__freshImages[keys[k]];
    var cached = this.__freshImages[page];
    if (!cached || now - cached.at > 20000) {
      // Arbitrary cache-buster query parameters trigger a 403 on this site.
      // Reload the original document with cache-control instead.
      cached = { at: now, pending: this.__get(page, true) };
      this.__freshImages[page] = cached;
    }
    var html;
    try { html = await cached.pending; } catch (error) { delete this.__freshImages[page]; throw error; }
    var urls = this.__images(html);
    var pattern = /<img[^>]+src=["']([^"']+)["']/g, match;
    while ((match = pattern.exec(html)) !== null) urls.push(this.__absolute(match[1]));
    var wanted = String(argument.url || '').split('?')[0];
    for (var i = 0; i < urls.length; i++) if (urls[i].split('?')[0] === wanted) return urls[i];
    return null;
  },

  // ---------------------------------------------------------------- 内部工具

  /// 作品 id：**站点列表锚点里的那条路径原样存**（`/eps/{标题}` 或 `/page/{标题}`）。
  ///
  /// 为什么存路径而不是标题：这一站的条目有**两种形态**——
  ///   · `/eps/{标题}`  多分话作品，详情页有分镜按钮，正文在 `/page/{标题}/{N}`；
  ///   · `/page/{标题}` 单页作品，锚点直接指向阅读页（没有分话、没有 /eps 页）。
  /// 路径自带形态信息，两种都能正确处理；标题还得再猜一次形态。
  ///
  /// 标题里站点会用 `|A` `|E` `|P` 替代 `/` `～` `+` 一类不能进路径的字符
  /// （实测：`星期一的丰满|A月曜日のたわわ`，显示名是 `星期一的丰满/月曜日のたわわ`）——
  /// id 必须原样保留这些记号，**不能**把显示名拼回去当地址。
  __pathId(argument) {
    var id = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !id; i++) {
      if (argument[keys[i]] != null) id = String(argument[keys[i]]).trim();
    }
    if (!id) throw new Error('JComic：缺少作品路径（请从列表重新打开）');
    // 容错：调用方给的可能是百分号编码过的一整条路径（`%7C` 等），解回原文再用。
    if (id.indexOf('%') >= 0) id = this.__decodeAttr(id);
    if (id.indexOf('/') !== 0) id = '/eps/' + id;
    return id;
  },

  /// 路径编码：`/` 分段保留，其余交给 encodeURIComponent
  /// （中文 / 空格 / `|` 记号都会编码成 %XX；实测服务端认这套）。
  __encPath(path) {
    var text = String(path || '');
    var parts = text.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      out.push(parts[i] ? encodeURIComponent(parts[i]) : parts[i]);
    }
    return out.join('/');
  },

  /// 列表 / 搜索页的条目。每条形如：
  ///   <div class="row …"><a target="_blank" href="/eps/{标题}">
  ///     <div class="… list-item"><img class="… comic-thumb" src="{签名封面}"></div>
  ///     <div class="… list-content"><p class='comic-title'>{标题} ({数字})</p>…
  __listItems(html) {
    var items = [];
    var seen = {};
    var pattern = /href="\/(eps|page)\/([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = '/' + match[1] + '/' + this.__decodeAttr(match[2]);
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var coverMatch = /<img[^>]+class="[^"]*comic-thumb[^"]*"[^>]+src="([^"]+)"/.exec(block);
      if (!coverMatch) coverMatch = /<img[^>]+src="([^"]+)"[^>]*comic-thumb/.exec(block);
      var titleMatch = /class='comic-title'>([^<]*)</.exec(block);
      var dateMatch = /class='comic-date'>([^<]*)</.exec(block);
      var title = this.__cleanTitle(this.__clean(titleMatch ? titleMatch[1] : ''));
      items.push({
        id: id,
        title: title || id,
        cover: coverMatch ? this.__absolute(coverMatch[1]) : '',
        coverHeaders: { 'Referer': BASE_URL + '/' },
        subtitle: this.__clean(dateMatch ? dateMatch[1] : '')
      });
    }
    return items;
  },

  /// 站点的 href 是**裸标题**（含空格 / 中文 / 括号）。属性里可能出现
  /// 百分号编码（站点自己也有编码过的锚点），统一先解码成标题原文当 id。
  __decodeAttr(value) {
    var text = String(value || '');
    if (text.indexOf('%') < 0) return text;
    try {
      return decodeURIComponent(text);
    } catch (error) {
      return text;
    }
  },

  __title(html) {
    var match = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return match[1];
    match = /class='comic-title'>([^<]*)</.exec(html);
    if (match) return match[1];
    match = /<title>([^<]*)<\/title>/.exec(html);
    return match ? match[1] : '';
  },

  /// 标题后缀 ` (12357)` 是站点的数字 id 展示，界面上去掉它（id 仍是路径原文）。
  __cleanTitle(text) {
    return this.__clean(text).replace(/\s*\(\d{1,9}\)\s*$/, '').trim();
  },

  /// 详情信息。/eps 页的封面是普通 `img[src]`（签名地址）；
  /// /page 页**没有**普通封面标签，第一张正文图就是封面——它也是加密串，解出来用。
  __detailInfo(html, singlePage) {
    var cover = '';
    if (!singlePage) {
      var coverMatch = /<img[^>]+class="[^"]*comic-thumb[^"]*"[^>]+src="([^"]+)"/.exec(html);
      if (!coverMatch) coverMatch = /<img[^>]+src="([^"]+)"[^>]*comic-thumb/.exec(html);
      if (coverMatch) cover = coverMatch[1];
    }
    if (!cover) {
      var locked = /data-locked="JCOMIC_TRAPS_([^"]+)"/.exec(html);
      if (locked) cover = this.__decodeLocked(locked[1]);
    }
    var authorMatch = /class='comic-author'>[\s\S]{0,40}?<\/p>\s*<a[^>]+href="\/author\/([^"]+)"/.exec(html);
    if (!authorMatch) authorMatch = /href="\/author\/([^"]+)"/.exec(html);
    var categories = [];
    var pattern = /href="\/cat\/([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var name = this.__decodeAttr(match[1]);
      if (name && categories.indexOf(name) < 0 && categories.length < MAX_TAGS) {
        categories.push(name);
      }
    }
    return {
      cover: this.__absolute(cover),
      coverHeaders: { 'Referer': BASE_URL + '/' },
      author: this.__clean(this.__decodeAttr(authorMatch ? authorMatch[1] : '')),
      categories: categories
    };
  },

  /// 目录：`<a href="/page/{标题}/{N}"><button …>{分镜名}<span class="badge"…`.
  /// 只认本作标题开头的锚点：比对时用 id 去掉 `/eps/` 前缀之后的那一段
  /// （页面别处可能有推荐位；标题里带 `|` / 斜杠一类的字符也照原样比）。
  __chapters(html, id) {
    var title = id.indexOf('/eps/') === 0 ? id.slice('/eps/'.length) : id;
    var chapters = [];
    var seen = {};
    var pattern = /<a href="\/page\/([^"]+)\/(\d+)">\s*<button[^>]*>([^<]*)<span/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (chapters.length >= MAX_CHAPTERS) break;
      var owner = this.__decodeAttr(match[1]);
      if (owner !== title) continue;
      var number = match[2];
      if (seen[number]) continue;
      seen[number] = true;
      var label = this.__clean(match[3]);
      chapters.push({ id: number, title: label || ('第 ' + number + ' 话') });
    }
    return chapters;
  },

  /// 正文图片：`data-locked="JCOMIC_TRAPS_{倒序 base64}"` → 解出真地址。
  __images(html) {
    var images = [];
    var pattern = /data-locked="JCOMIC_TRAPS_([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (images.length >= MAX_IMAGES) break;
      var url = this.__decodeLocked(match[1]);
      if (url && url.indexOf('http') === 0) images.push(url);
    }
    return images;
  },

  /// 站点的图片解码：去掉前缀 → 整串倒序 → base64 解码（原页脚本用 atob）。
  __decodeLocked(encoded) {
    var text = String(encoded || '');
    var reversed = text.split('').reverse().join('');
    return this.__b64decode(reversed);
  },

  /// 纯 JS 的 base64 解码（不赌沙箱里有 atob）。解出的都是 ASCII 地址。
  __b64decode(text) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '=') continue;
      var value = alphabet.indexOf(ch);
      if (value < 0) continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((buffer >> bits) & 0xFF);
      }
    }
    return out;
  },

  /// 「还有下一页」：认**分页器自己**（别拿整页找 `&raquo;`——页脚里也有箭头字符）。
  ///
  /// 实测三种形态：
  ///   · 中间页：`<li><a href="…/2"> &raquo;</a></li>`（有下一页箭头）；
  ///   · **末页**：箭头那条**整个不出现**，编号停在最大页（快照 jcomic_cat_last.html：
  ///     4759 页的末页分页器只到 4759，没有 &raquo;）；
  ///   · 「…」省略号是 `<li class="disabled"><span>...</span></li>`，与下一页无关。
  /// 因此顺序是：禁用的箭头（防站点换形态）→ 有箭头 → 编号最大值与当前页比较。
  __hasNextPage(html, page, itemCount) {
    var pager = /<ul class="pagination">([\s\S]{0,3000}?)<\/ul>/.exec(html);
    if (pager) {
      var text = pager[1];
      if (/<li class="disabled">\s*<(?:a|span)[^>]*>\s*&raquo;/.test(text)) return false;
      if (text.indexOf('&raquo;') >= 0) return true;
      var numbers = text.match(/>\s*(\d{1,7})\s*</g) || [];
      var max = 0;
      for (var i = 0; i < numbers.length; i++) {
        var value = Number(numbers[i].replace(/[><\s]/g, ''));
        if (value > max) max = value;
      }
      if (max > 0) return page < max;
    }
    // 认不出分页器时按条数保守判断（多翻一页只是空列表）。
    return itemCount >= PAGE_SIZE - 3;
  },

  __absolute(url) {
    var value = String(url || '').trim().replace(/&amp;/g, '&');
    if (!value) return '';
    if (value.indexOf('http') === 0) return value;
    if (value.indexOf('//') === 0) return 'https:' + value;
    return BASE_URL + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  __clean(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /// 所有请求的唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path, fresh) {
    var url = path.indexOf('http') === 0 ? path : BASE_URL + path;
    var response = await LumeSource.http.get(url, {
      headers: fresh
        ? { 'Referer': BASE_URL + '/', 'Cache-Control': 'no-cache' }
        : { 'Referer': BASE_URL + '/' }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|challenge-platform|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
