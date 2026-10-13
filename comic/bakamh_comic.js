// LumeSource: {"id":"bakamh_comic","name":"巴卡漫画","version":"1.0.0","category":"comic"}
//
// 巴卡漫画（bakamh.com）—— 站点用的是 **Madara 模板**（WordPress 上最通行的漫画主题，
// 结构十年没大改），本文件的地址与选择器**逐条对齐 Tachiyomi/Keiyoushi 的 `madara`
// multisrc + 站点自己的两处覆盖**（src/zh/bakamh/Bakamh.kt：章节列表选择器改成
// `.chapter-loveYou`、状态取 `.post-content_item:contains(状态)`、slug 一律小写），
// 不是照着模板猜的。
//
// ============================================================================
// 站点结构（Madara 通行 + 该站的两处差异）
// ============================================================================
//
//   最新更新   GET /manga/page/{页}/[?m_orderby=latest]     卡片 div.page-item-detail
//   最多观看   GET /manga/page/{页}/?m_orderby=views
//   最新上架   GET /manga/page/{页}/?m_orderby=new
//   搜索       GET /?s={关键词}&post_type=wp-manga[&paged={页}]
//   详情       GET /manga/{slug}/                          标题 div.post-title h1、封面 div.summary_image img
//   剧集       GET /manga/{slug}/                          章节 li.wp-manga-chapter（该站容器类名是 chapter-loveYou）
//   正文       GET {章节页}                                div.reading-content img（**优先 data-src**：
//                                                          src 常常是占位图），按话号升序排序
//
// 三个必须照做的站点脾气（都写死在实现里）：
//   1. **章节按话号升序**：Madara 默认「最新话在最前」，原样交出去阅读器的「下一章」
//      会往回跳（本仓库的 seyoumanhua 源踩过同一个坑）；
//   2. **图片优先 data-src**：Madara 的懒加载把真地址放 data-src，src 是
//      loading 占位（照 src 读会得到一堆一样的假图）；
//   3. **登录锁**：需要登录的章节页里有 `.mkjp-ea-lock`（multisrc 同样拦这个），
//      脚本如实提示「本章节需要登录后阅读」，不装作能看。
//
// 验证状态（如实说）：**本机（境外出口）连不上该站**，未做实播验证；解析内核用
// Madara 结构夹具跑通（列表 / 分页 / 详情 / 剧集排序 / 正文取 data-src / 登录锁提示）。
// 导入后请先点「图源管理 → 测试连通性」。
var HOSTS = ['https://bakamh.com'];

// Madara 会按 UA 决定是否给移动版；带手机 UA 最稳。
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/16A366 Safari/604.1';

/// 每章最多取多少张图。
var MAX_IMAGES = 300;

var LumeSource = {
  id: 'bakamh_comic',
  name: '巴卡漫画',
  version: '1.0.0',
  category: 'comic',

  /// 分类：三个内置排序入口（Madara 的分类是「题材」，在详情页里，筛起来要逐题材抓，
  /// 不如按站点自己的排序入口给；用户要按题材找可用搜索）。
  async categories() {
    return [
      { id: 'latest', title: '最近更新' },
      { id: 'views', title: '最多观看' },
      { id: 'new', title: '最新上架' }
    ];
  },

  /// 列表 / 搜索。
  async list(argument) {
    await this.__pickHost();
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var path;
    if (keyword) {
      path = '/?s=' + encodeURIComponent(keyword) + '&post_type=wp-manga'
        + (page > 1 ? '&paged=' + page : '');
    } else {
      path = '/manga/page/' + page + '/'
        + (category && category !== 'latest' ? '?m_orderby=' + encodeURIComponent(category) : '');
    }
    var html = await this.__page(path);
    return { items: this.__items(html), hasMore: this.__hasNext(html) };
  },

  /// 详情。
  async detail(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return null;
    var html = await this.__page(path);
    if (html === null) return null;
    var title = this.__text(html, ['<div[^>]+class="post-title"[^>]*>[\\s\\S]{0,120}?<h1[^>]*>([^<]+)</h1>', '<h1[^>]*>([^<]+)</h1>']);
    // data-src 与 src 必须拆成两条、且 data-src 在前：写成一个 `(?:data-src|src)` 时
    // 正则会在标签内部回溯到**最后一个** `src="`——那是 loading 占位图（实测踩到）。
    var cover = this.__attr(html, [
      'class="summary_image"[^>]*>[\\s\\S]{0,400}?<img[^>]+data-src="([^"]+)"',
      'class="summary_image"[^>]*>[\\s\\S]{0,400}?<img[^>]+src="([^"]+)"',
      'property="og:image"[^>]*content="([^"]+)"'
    ]);
    var description = this.__text(html, ['class="description-summary"[^>]*>[\\s\\S]{0,80}?class="summary__content"[^>]*>([\\s\\S]{0,2000}?)</div>', 'class="summary__content"[^>]*>([\\s\\S]{0,2000}?)</div>']);
    var status = this.__labelled(html, ['状态', 'Status']);
    var genres = this.__genres(html);
    var bits = [];
    if (status) bits.push(status);
    if (genres) bits.push(genres);
    return {
      id: path,
      title: title || path,
      cover: cover ? this.__upgrade(this.__abs(cover)) : null,
      subtitle: bits.length ? bits.join(' · ') : null,
      description: description || null
    };
  },

  /// 剧集。
  async chapters(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return [];
    var html = await this.__page(path);
    if (html === null) return [];
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      throw new Error('巴卡漫画：这一部没有剧集（可能未上架，或站点改版）');
    }
    return chapters;
  },

  /// 正文图片。
  async content(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.chapterId) || this.__path(argument && argument.id);
    if (!path) throw new Error('巴卡漫画：缺少章节地址，无法取图');
    var html = await this.__page(path);
    if (html === null) throw new Error('巴卡漫画：章节页打不开（HTTP 404）');

    // 登录锁：站点用这个标记表示「本章要登录」（multisrc 用同一个判据）。
    if (/class="[^"]*mkjp-ea-lock/.test(html)) {
      throw new Error('巴卡漫画：本章节需要登录后阅读（站点限制，脚本不绕过）');
    }

    var images = this.__images(html);
    if (!images.length) {
      throw new Error('巴卡漫画：章节页里没有图片（本章可能需要登录，或图片改由站点的 AJAX 加载）');
    }
    return { kind: 'images', images: images };
  },

  // ------------------------------------------------------------------ 解析

  /// 列表条目（Madara 的两种卡片写法都认）。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var blocks = this.__blocks(text, {
      start: '<div[^>]+class="[^"]*(?:page-item-detail|c-tabs-item__content)',
      end: '</div>\\s*</div>'
    });
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var href = this.__attr(block, ['<a[^>]+href="([^"]*\\/manga\\/[^"]+)"']);
      var path = this.__path(href);
      if (!path || seen[path]) continue;
      var title = this.__text(block, [
        'class="post-title"[^>]*>[\\s\\S]{0,80}?<a[^>]*>([^<]+)</a>',
        '<h3[^>]*>[\\s\\S]{0,40}?<a[^>]*>([^<]+)</a>',
        'title="([^"]+)"'
      ]);
      if (!title) continue;
      seen[path] = true;
      var cover = this.__attr(block, ['<img[^>]+data-src="([^"]+)"', '<img[^>]+src="([^"]+)"']);
      var note = this.__text(block, ['class="chapter-item"[^>]*>[\\s\\S]{0,120}?<a[^>]*>([^<]+)</a>', 'class="post-on"[^>]*>([^<]+)<']);
      items.push({
        id: path,
        title: title,
        cover: cover ? this.__upgrade(this.__abs(cover)) : null,
        subtitle: note || null
      });
    }
    return items;
  },

  /// 还有下一页吗：Madara 的 `.pagination` 里最后一项不是当前页就有下一页；
  /// 搜索页没有分页容器时退回「满一页就当还有」。
  __hasNext(html) {
    var text = String(html || '');
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*pagination', end: '</ul>|</nav>|</div>' });
    if (!box) return /class="[^"]*(?:page-item-detail|c-tabs-item__content)/.test(text);
    var items = box.match(/<li[\s\S]*?<\/li>/gi) || [];
    if (!items.length) return true;
    var last = items[items.length - 1] || '';
    return !/class="[^"]*\bactive\b/.test(last);
  },

  /// 章节：只认「作品页下面还有一层」的链接（`/manga/<作品>/<章节>/`）。
  __chapters(html) {
    var text = String(html || '');
    var chapters = [];
    var seen = {};
    var pattern = /<a[^>]+href="([^"]*\/manga\/[^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var path = this.__path(matched[1]);
      if (!path || seen[path]) continue;
      var segments = path.replace(/^\/+|\/+$/g, '').split('/');
      // /manga/<slug>/<chapter>/ = 3 段；作品页只有 2 段。
      if (segments.length < 3) continue;
      seen[path] = true;
      var title = this.__plain(matched[2]);
      if (!title) continue;
      chapters.push({ id: path, title: title });
    }
    return this.__sortChapters(chapters);
  },

  /// 按话号升序（Madara 默认最新在前；不排序阅读器会往回跳）。
  __sortChapters(chapters) {
    var numbered = [];
    var others = [];
    for (var i = 0; i < chapters.length; i++) {
      var chapter = chapters[i];
      var matched = /(\d+(?:\.\d+)?)/.exec(String(chapter.title || '') + ' ' + String(chapter.id || ''));
      if (matched) {
        chapter.__n = parseFloat(matched[1]);
        numbered.push(chapter);
      } else {
        others.push(chapter);
      }
    }
    numbered.sort(function (a, b) { return a.__n - b.__n; });
    return numbered.concat(others).map(function (c) { return { id: c.id, title: c.title }; });
  },

  /// 正文图片：`.reading-content img`（或 `.wp-manga-chapter-img`），**data-src 优先**。
  __images(html) {
    var text = String(html || '');
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*reading-content', end: '</div>\\s*</div>' });
    if (!box) box = text;
    var images = [];
    var seen = {};
    var pattern = /<img[^>]+>/gi;
    var matched;
    while ((matched = pattern.exec(box)) !== null) {
      var tag = matched[0];
      var url = this.__attr(tag, ['data-src="([^"]+)"', 'data-lazy-src="([^"]+)"', 'src="([^"]+)"']);
      if (!url) continue;
      var lowered = url.toLowerCase();
      // 占位图与透明 gif 一律跳过（Madara 的懒加载会先给这些）。
      if (lowered.indexOf('loading') >= 0 || lowered.indexOf('placeholder') >= 0) continue;
      if (/\.(gif|svg)$/.test(lowered)) continue;
      var absolute = this.__upgrade(this.__abs(url));
      if (!absolute || seen[absolute]) continue;
      seen[absolute] = true;
      images.push(absolute);
      if (images.length >= MAX_IMAGES) break;
    }
    return images;
  },

  /// 按标签文字取值（Madara 的 `post-content_item` 一行标签 + 一行 summary-content）。
  __labelled(html, labels) {
    var text = String(html || '');
    var blocks = this.__blocks(text, { start: '<div[^>]+class="[^"]*post-content_item', end: '</div>\\s*</div>' });
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var plain = this.__plain(block);
      var hit = false;
      for (var j = 0; j < labels.length; j++) {
        if (plain.indexOf(labels[j]) >= 0) { hit = true; break; }
      }
      if (!hit) continue;
      var value = this.__text(block, ['class="summary-content"[^>]*>([\\s\\S]{0,120}?)</div>', 'class="summary-content"[^>]*>([^<]+)<']);
      if (value) return value;
    }
    return '';
  },

  __genres(html) {
    var text = String(html || '');
    var result = [];
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*genres-content', end: '</div>' });
    var pattern = /<a[^>]*>([^<]{1,20})</gi;
    var matched;
    while ((matched = pattern.exec(box)) !== null) {
      var title = this.__plain(matched[1]);
      if (title && result.indexOf(title) < 0) result.push(title);
      if (result.length >= 8) break;
    }
    return result.join(' / ');
  },

  // ------------------------------------------------------------------ 网络与工具

  async __pickHost() {
    if (this.__host) return this.__host;
    for (var i = 0; i < HOSTS.length; i++) {
      try {
        var response = await LumeSource.http.get(HOSTS[i] + '/', { headers: { 'User-Agent': UA } });
        var status = response ? response.status : 0;
        if (status === 200 || status === 403 || status === 503 || status === 521) {
          this.__host = HOSTS[i];
          return this.__host;
        }
      } catch (error) { /* 换下一个域名 */ }
    }
    this.__host = HOSTS[0];
    return this.__host;
  },

  __base() {
    return this.__host || HOSTS[0];
  },

  async __page(path) {
    var url = /^https?:\/\//i.test(path)
      ? path
      : this.__base() + (path.charAt(0) === '/' ? path : '/' + path);
    var response = await LumeSource.http.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': this.__base() + '/'
      }
    });
    var status = response ? response.status : 0;
    if (status === 404) return null;
    if (status === 403 || status === 503 || status === 521) {
      throw new Error('NEED_WEBVIEW_VERIFY：巴卡漫画 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('巴卡漫画：拉取失败（HTTP ' + status + '）：' + url);
    return String(response.body || '');
  },

  __firstBlock(text, spec) {
    var start = new RegExp(spec.start, 'i').exec(text);
    if (!start) return '';
    var tail = text.slice(start.index);
    var end = spec.end ? new RegExp(spec.end, 'i').exec(tail.slice(start[0].length)) : null;
    return end ? tail.slice(0, start[0].length + end.index + end[0].length) : tail;
  },

  __blocks(text, spec) {
    var blocks = [];
    var start = new RegExp(spec.start, 'gi');
    var item;
    while ((item = start.exec(text)) !== null) {
      var tail = text.slice(item.index);
      var end = spec.end ? new RegExp(spec.end, 'i').exec(tail.slice(item[0].length)) : null;
      var length = end ? item[0].length + end.index + end[0].length : Math.min(tail.length, 4000);
      blocks.push(tail.slice(0, length));
      if (start.lastIndex === item.index) start.lastIndex++;
    }
    return blocks;
  },

  __text(html, patterns) {
    var text = String(html || '');
    for (var i = 0; i < patterns.length; i++) {
      var matched = new RegExp(patterns[i], 'i').exec(text);
      if (matched && matched[1] !== undefined) {
        var value = this.__plain(matched[1]);
        if (value) return value;
      }
    }
    return '';
  },

  __attr(html, patterns) {
    var text = String(html || '');
    for (var i = 0; i < patterns.length; i++) {
      var matched = new RegExp(patterns[i], 'i').exec(text);
      if (matched && matched[1]) return matched[1];
    }
    return '';
  },

  __path(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) {
      var match = /^https?:\/\/[^\/]+([\s\S]*)$/.exec(text);
      return match ? match[1] : text;
    }
    return text.charAt(0) === '/' ? text : '/' + text;
  },

  __abs(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (text.indexOf('//') === 0) return 'https:' + text;
    return this.__base() + (text.charAt(0) === '/' ? text : '/' + text);
  },

  __upgrade(url) {
    var text = String(url || '');
    if (text.indexOf('http://') !== 0) return text;
    var host = '';
    var matched = /^http:\/\/([^\/]+)/.exec(text);
    if (matched) host = matched[1];
    if (!host) return text;
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host) || host.indexOf('localhost') === 0) return text;
    return 'https://' + text.substring(7);
  },

  __plain(text) {
    return String(text == null ? '' : text)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
};
