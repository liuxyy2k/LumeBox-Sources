// LumeSource: {"id":"bakamh_comic","name":"巴卡漫画","version":"1.1.0","category":"comic"}
//
// 巴卡漫画（BAKAMH）—— Madara 系（WordPress 漫画主题）站点，**多域名**。
// 本文件是**对着真站核过**的：用浏览器把真站页面取回来存档，解析内核就对着这些
// 真响应跑（列表 / 详情 / 章节 / 阅读页 / 搜索接口五条路径全跑通）。
//
// ============================================================================
// 域名（站点自己的发布页：https://bakamh.app）
// ============================================================================
//
//   海外地址 bakamh.com ｜ 地址1 bakamh.ru ｜ 地址2 baka3.cfd ｜ 地址3 baka1.cfd ｜ 地址4 baka2.cfd
//
// 实测（2026-10-14）：**baka3.cfd 可用**；bakamh.com / bakamh.ru / baka1.cfd / baka2.cfd
// 当时都是 nginx 502（站点自己的后端在故障，不是脚本问题）——所以这一版把 5 个域名都写进来，
// 并且 **502/404 会被当成「这个域名不通」自动换下一个**；全都不通时再去**读发布页**
// 把最新域名捞出来（站点换域名时脚本不用改）。
//
// 实测另一件事：**整站挂在 Cloudflare 后面**（浏览器要过「请稍候…」挑战）。
// App 侧遇到时脚本会抛 `NEED_WEBVIEW_VERIFY`，用「网页视图」过一次校验即可（脚本不绕过）。
//
// ============================================================================
// 站点结构（全部来自真实响应）
// ============================================================================
//
//   分类      站点自己的板块路径：/（首页）/manhwa/ 韩漫 /bl/ BL /gl/ GL /anime/ 动画
//             /allages/ 全年龄 /en-manga/ 英文 /on-going/ 连载 /end/ 完结
//   列表      GET {板块}[/page/<页>/]                卡片 div.item-thumb（a[href][title] + img[src]）
//   分页      div.wp-pagenavi 里的 a.page → /page/N/
//   搜索      **不是服务端渲染**：POST /wp-admin/admin-ajax.php
//             action=wp-manga-search-manga & title=<关键词>
//             → {"success":true,"data":[{title,url,type}]}   （服务端 HTML 里一条结果都没有，实测）
//   详情      GET /manga/<slug>/                     标题 h1、封面 .summary_image img、
//                                                     信息栏 .post-content_item（观看/别名/作者/分类/图源/标籤）
//   剧集      GET /manga/<slug>/                     条目类名 chapter-loveYou（站点改过的 Madara 样式），
//                                                     链接形状仍是 /manga/<slug>/c-<话号>/，**默认最新话在前** → 脚本按话号升序
//   正文      GET /manga/<slug>/c-<话号>/            .reading-content img（data-src / src 同址，站点图床是独立 CDN）；
//                                                     需要登录的章节页有 .mkjp-ea-lock → 如实提示，不假装能看
//
// 已知边界：
// - 详情页**没有简介块**（真站就没有），description 如实为 null；
// - 明文 http 的图片统一升 https（iOS 默认禁止明文，原样返回整章裂图）。
var HOSTS = [
  'https://baka3.cfd',
  'https://bakamh.com',
  'https://bakamh.ru',
  'https://baka1.cfd',
  'https://baka2.cfd'
];

/// 站点发布页：全部域名都不通时去这里捞最新域名。
var PUBLISH_PAGE = 'https://bakamh.app/';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/// 每章最多取多少张图。
var MAX_IMAGES = 400;

var LumeSource = {
  id: 'bakamh_comic',
  name: '巴卡漫画',
  version: '1.1.0',
  category: 'comic',

  /// 分类 = 站点自己的板块（真站导航里逐条核对过）。
  async categories() {
    return [
      { id: '', title: '首页' },
      { id: 'manhwa', title: '韩漫' },
      { id: 'bl', title: 'BL 漫画' },
      { id: 'gl', title: 'GL 漫画' },
      { id: 'allages', title: '全年龄' },
      { id: 'anime', title: '动画' },
      { id: 'en-manga', title: '英文漫画' },
      { id: 'on-going', title: '连载中' },
      { id: 'end', title: '已完结' }
    ];
  },

  /// 列表 / 搜索。
  async list(argument) {
    await this.__pickHost();
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      // 站点搜索是 AJAX 接口（服务端 HTML 里没有结果，实测），走它自己那条路。
      var found = await this.__search(keyword);
      return { items: found, hasMore: false };
    }
    // 路径必须带尾斜杠（WordPress 规范地址；少了它真站回 404，实测）。
    var path = category ? '/' + category + '/' + (page > 1 ? 'page/' + page + '/' : '') : '/';
    var html = await this.__page(path);
    var items = this.__items(html === null ? '' : html);
    return { items: items, hasMore: this.__hasNext(html === null ? '' : html, page) };
  },

  /// 详情。
  async detail(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return null;
    var html = await this.__page(path);
    if (html === null) return null;
    var title = this.__text(html, ['<h1[^>]*>([^<]+)</h1>', 'property="og:title"[^>]*content="([^"]+)"']);
    if (!title) return null;
    var cover = this.__attr(html, [
      'class="summary_image"[^>]*>[\\s\\S]{0,300}?<img[^>]+src="([^"]+)"',
      'property="og:image"[^>]*content="([^"]+)"'
    ]);
    // 信息栏是 .post-content_item（标签：观看 / 别名 / 作者 / 分类 / 图源 / 标籤，实测）。
    var author = this.__labelled(html, ['作者', 'Author']);
    var category = this.__labelled(html, ['分类', 'Categories']);
    var bits = [];
    if (category) bits.push(category);
    if (author) bits.push('作者：' + author);
    return {
      id: path,
      title: title,
      cover: cover ? this.__upgrade(this.__abs(cover)) : null,
      subtitle: bits.length ? bits.join(' · ') : null,
      // 真站详情页没有简介块（实测），如实为 null 而不是编一段。
      description: null
    };
  },

  /// 剧集：详情页里所有「/manga/<作品>/c-<话号>/」链接，**按话号升序**。
  ///
  /// 为什么按形状抓而不是按类名：真站把章节容器类名改成了 `chapter-loveYou`
  /// （Tachiyomi 扩展为它还专门写了一条覆盖），但链接形状仍是 Madara 的
  /// `/manga/<slug>/c-<n>/` —— 按形状抓不受类名改动影响。
  async chapters(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return [];
    var html = await this.__page(path);
    if (html === null) return [];
    var chapters = this.__chapters(html, path);
    if (!chapters.length) {
      throw new Error('巴卡漫画：这一部没有剧集（可能未上架，或站点改版）');
    }
    return chapters;
  },

  /// 正文：`.reading-content img`（data-src 优先），需要登录的章节如实拒绝。
  async content(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.chapterId) || this.__path(argument && argument.id);
    if (!path) throw new Error('巴卡漫画：缺少章节地址，无法取图');
    var html = await this.__page(path);
    if (html === null) throw new Error('巴卡漫画：章节页打不开（HTTP 404）');

    // 登录锁：真站要登录的章节页有这个标记（Tachiyomi 扩展用同一个判据）。
    if (/class="[^"]*mkjp-ea-lock/.test(html)) {
      throw new Error('巴卡漫画：本章节需要登录后阅读（站点限制，脚本不绕过）');
    }
    var images = this.__images(html);
    if (!images.length) {
      throw new Error('巴卡漫画：章节页里没有图片（可能本章需要登录，或站点改版）');
    }
    return { kind: 'images', images: images };
  },

  // ------------------------------------------------------------------ 解析

  /// 列表卡片：真站是 `div.item-thumb`（内含 a[href][title] + img[src]）；
  /// 其它 Madara 皮肤常见的 `div.page-item-detail` / `.c-tabs-item__content` 也一并认。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var blocks = this.__splitByStart(text, '<div[^>]+class="[^"]*(?:item-thumb|page-item-detail|c-tabs-item__content)');
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].replace(/\s+/g, ' ');
      var href = this.__attr(block, ['<a[^>]+href="([^"]*\\/manga\\/[^"]+)"']);
      var path = this.__path(href);
      if (!path || seen[path]) continue;
      var title = this.__text(block, ['title="([^"]+)"', '<a[^>]*>([^<]{1,80})<\\/a>']);
      if (!title) continue;
      seen[path] = true;
      var cover = this.__attr(block, ['<img[^>]+data-src="([^"]+)"', '<img[^>]+src="([^"]+)"']);
      var note = this.__text(block, ['class="chapter-item"[^>]*>[\\s\\S]{0,200}?<a[^>]*>([^<]+)<\\/a>', 'class="post-on"[^>]*>([^<]+)<']);
      items.push({
        id: path,
        title: title,
        cover: cover ? this.__upgrade(this.__abs(cover)) : null,
        subtitle: note || null
      });
    }
    return items;
  },

  /// 还有下一页吗：真站分页是 `div.wp-pagenavi`，当前页是 `span.current`、
  /// 其它页是 `a.page`；有指向 page+1 的链接（或 next 链接）就还有。
  __hasNext(html, page) {
    var text = String(html || '');
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*(?:wp-pagenavi|pagination)', end: '</div>' });
    if (!box) return false;
    var next = new RegExp('/page/' + (page + 1) + '/');
    if (next.test(box)) return true;
    return /class="[^"]*(?:nextpostslink|next)\\b/.test(box);
  },

  /// 章节：只认**本作品自己**的章节链接（`<作品路径>c-<话号>/`），按话号升序。
  ///
  /// 为什么要卡作品路径：真站详情页底部还有一圈「别的作品的章节推荐」，它们的链接
  /// 形状一模一样（`/manga/<别的作品>/c-<n>/`）——不卡的话实测 16 话会混成 33 条。
  /// 也不按容器类名抓：真站把章节容器类名改成了 `chapter-loveYou`（Tachiyomi 扩展
  /// 为它还专门写了一条覆盖），而链接形状是 Madara 的固定约定。
  __chapters(html, mangaPath) {
    var text = String(html || '');
    var scope = String(mangaPath || '');
    var chapters = [];
    var seen = {};
    var pattern = /<a[^>]+href="([^"]*\/manga\/[^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var path = this.__path(matched[1]);
      // 这里**不能**因为「已见过」就跳过：同一话会有多条链接（详情页顶部的
      // 「观看第一话」快捷入口排在真章节列表之前），跳过就没法用后面的好标题覆盖它。
      // 去重交给下面的评分逻辑（seen 里存的是 {score, title}）。
      if (!path) continue;
      // 只收本作品下的链接（前缀匹配，章节 id 就是作品路径 + c-<n>/）。
      if (scope && path.indexOf(scope) !== 0) continue;
      // 排除评论锚点之类的「看着像章节」的链接（真站有 `/manga/<作品>/#respond`）。
      if (path.indexOf('#') >= 0 || path.indexOf('?') >= 0) continue;
      if (/\/(?:respond|comment|feed|trackback)\/?$/i.test(path)) continue;
      var segments = path.replace(/^\/+|\/+$/g, '').split('/');
      if (segments.length < 3) continue;
      var title = this.__plain(matched[2]);
      if (!title) continue;
      // 同一话可能被多条链接指向：详情页顶部的「观看第一话 / 观看最新话」快捷入口
      // 排在真章节列表前面（实测），照单收下标题就会变成「观看第一话」。
      // 规则：标题**长得像章节**（第N话 / Episode N / 纯数字）的优先，同分先到先得。
      var score = /第\s*\d|episode\s*\d|^\s*\d+(\.\d+)?\s*$/i.test(title) ? 2 : 1;
      var existing = seen[path];
      if (existing) {
        if (score > existing.score) { existing.title = title; existing.score = score; }
        continue;
      }
      seen[path] = { score: score, title: title };
      chapters.push({ id: path, title: title });
    }
    // 回填：同一话的多个链接里，用评分更高的那个标题（见上面的 score 规则）。
    for (var s = 0; s < chapters.length; s++) {
      var picked = seen[chapters[s].id];
      if (picked) chapters[s].title = picked.title;
    }
    return this.__sortChapters(chapters);
  },

  /// 按话号升序（真站默认最新话在前；不排序阅读器会往回跳）。
  __sortChapters(chapters) {
    var numbered = [];
    var others = [];
    for (var i = 0; i < chapters.length; i++) {
      var chapter = chapters[i];
      // 话号优先从**路径**里取（`c-<n>` 是站点的固定命名）；标题里的数字只作兜底——
      // 标题可能是「观看第一话」这类没有数字的文案，也可能是「外传 圣诞节特别篇」。
      var byPath = /\/c-(\d+)(?:\/|$)/.exec(String(chapter.id || ''));
      var byTitle = byPath ? null : /(\d+(?:\.\d+)?)/.exec(String(chapter.title || ''));
      if (byPath || byTitle) {
        chapter.__n = parseFloat((byPath || byTitle)[1]);
        numbered.push(chapter);
      } else {
        others.push(chapter);
      }
    }
    numbered.sort(function (a, b) { return a.__n - b.__n; });
    return numbered.concat(others).map(function (c) { return { id: c.id, title: c.title }; });
  },

  /// 正文图片：`.reading-content img`（真站 data-src 与 src 同址，data-src 优先）。
  ///
  /// 切块要**取图片最多的那块**：整页里 `reading-content` 这个类名先出现在 CSS 里
  /// （第一篇匹配根本不是正文容器），按「第一个块」取会一张图都拿不到（实测）。
  __images(html) {
    var text = String(html || '');
    var chunks = this.__splitByStart(text, '<div[^>]+class="[^"]*reading-content');
    var scope = text;
    var best = -1;
    for (var i = 0; i < chunks.length; i++) {
      var count = (chunks[i].match(/<img/gi) || []).length;
      if (count > best) { best = count; scope = chunks[i]; }
    }
    if (best <= 0) {
      // 兜底：按真站的图片类名在全页里收（class 是站点自己给的，比容器更稳）。
      scope = text;
    }
    // 再按 Madara 的分页容器 `div.page-break` 切到每一页（真站每页一张图，
    // 「第 N / 30 页」的编号就在这些块里）——不这么切会把读容器**之外**的
    // 模板图片也算进来（实测多出一张）。
    var pages = this.__splitByStart(scope, '<div[^>]+class="[^"]*page-break');
    var scan = pages.length > 0 ? pages : [scope];
    var images = [];
    var seen = {};
    for (var k = 0; k < scan.length; k++) {
      var pattern = /<img[^>]+>/gi;
      var matched;
      while ((matched = pattern.exec(scan[k])) !== null) {
        var tag = matched[0];
        var url = this.__attr(tag, ['data-src="([^"]+)"', 'data-lazy-src="([^"]+)"', 'src="([^"]+)"']);
        if (!url) continue;
        var lowered = url.toLowerCase();
        if (lowered.indexOf('loading') >= 0 || lowered.indexOf('placeholder') >= 0) continue;
        if (/\.(gif|svg)$/.test(lowered)) continue;
        var absolute = this.__upgrade(this.__abs(url));
        if (!absolute || seen[absolute]) continue;
        seen[absolute] = true;
        images.push(absolute);
        break;   // 一页只取第一张（分页块里可能还有占位图）
      }
      if (images.length >= MAX_IMAGES) break;
    }
    return images;
  },

  /// 搜索：站点的 AJAX 接口（服务端 HTML 里没有结果，实测）。
  async __search(keyword) {
    var url = this.__base() + '/wp-admin/admin-ajax.php';
    var response = await LumeSource.http.post(
      url,
      'action=wp-manga-search-manga&title=' + encodeURIComponent(keyword),
      {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.__base() + '/'
        }
      }
    );
    var status = response ? response.status : 0;
    if (status === 403 || status === 503 || status === 521) {
      throw new Error('NEED_WEBVIEW_VERIFY：巴卡漫画 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('巴卡漫画：搜索失败（HTTP ' + status + '）');
    var data = null;
    try {
      data = JSON.parse(String((response && response.body) || 'null'));
    } catch (error) {
      data = null;
    }
    var rows = (data && data.data) || [];
    var items = [];
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var path = this.__path(row.url || '');
      if (!path || seen[path]) continue;
      seen[path] = true;
      items.push({
        id: path,
        title: this.__plain(row.title || path),
        cover: null,
        subtitle: row.type ? String(row.type) : null
      });
    }
    return items;
  },

  // ------------------------------------------------------------------ 网络与工具

  /// 定域名：HOSTS 顺序试；**502/404 视为这个域名不通，换下一个**；
  /// 全都不通再去读发布页捞最新域名。整个会话记住结果。
  async __pickHost() {
    if (this.__host) return this.__host;
    var candidates = HOSTS.slice();
    for (var round = 0; round < 2; round++) {
      for (var i = 0; i < candidates.length; i++) {
        var host = candidates[i];
        var alive = await this.__probe(host);
        if (alive) {
          this.__host = host;
          return host;
        }
      }
      if (round === 0) {
        // 全部不通：读发布页（站点自己的地址页）把最新域名捞出来再试一轮。
        var discovered = await this.__publishHosts();
        if (!discovered.length) break;
        candidates = discovered;
      }
    }
    this.__host = HOSTS[0];
    return this.__host;
  },

  /// 探一个域名：200 或「活着但被 CF 校验（403/503/521）」都算可用；
  /// 404/502/其它 5xx 算不通（真站实测：宕机的域名回的就是 nginx 502）。
  async __probe(host) {
    try {
      var response = await LumeSource.http.get(host + '/', { headers: { 'User-Agent': UA } });
      var status = response ? response.status : 0;
      if (status === 200 || status === 403 || status === 503 || status === 521) return true;
      return false;
    } catch (error) {
      return false;
    }
  },

  /// 读发布页（https://bakamh.app/）把当前域名捞出来。
  async __publishHosts() {
    try {
      var response = await LumeSource.http.get(PUBLISH_PAGE, { headers: { 'User-Agent': UA } });
      if (!response || response.status !== 200) return [];
      var text = String(response.body || '');
      var found = [];
      var seen = {};
      var pattern = /https:\/\/([a-z0-9.-]+)/gi;
      var matched;
      while ((matched = pattern.exec(text)) !== null) {
        var host = matched[1].toLowerCase();
        if (host.indexOf('bakamh.app') >= 0) continue;
        if (seen[host]) continue;
        // 只收 bakamh / baka*.cfd 这类域名，避免把页面里的统计/广告域名当站点。
        if (!/^(?:bakamh|baka\d?)[a-z0-9.-]*\.(?:com|ru|cfd|app|net|xyz|top)$/.test(host)) continue;
        seen[host] = true;
        found.push('https://' + host);
      }
      return found;
    } catch (error) {
      return [];
    }
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

  /// 从每个 start 匹配处切到**下一个** start 匹配处（块里嵌套多少层都不受影响）。
  __splitByStart(text, startPattern) {
    var re = new RegExp(startPattern, 'gi');
    var starts = [];
    var matched;
    while ((matched = re.exec(text)) !== null) {
      starts.push(matched.index);
      if (re.lastIndex === matched.index) re.lastIndex++;
    }
    var chunks = [];
    for (var i = 0; i < starts.length; i++) {
      var end = i + 1 < starts.length ? starts[i + 1] : text.length;
      chunks.push(text.slice(starts[i], end));
    }
    return chunks;
  },

  __firstBlock(text, spec) {
    var start = new RegExp(spec.start, 'i').exec(text);
    if (!start) return '';
    var tail = text.slice(start.index);
    var end = spec.end ? new RegExp(spec.end, 'i').exec(tail.slice(start[0].length)) : null;
    return end ? tail.slice(0, start[0].length + end.index + end[0].length) : tail;
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

  /// 按标签文字取值（`post-content_item` 一行标签 + 一行 summary-content）。
  /// 先折叠空白再匹配：真站缩进很深，带窗口的模式会被缩进顶爆。
  __labelled(html, labels) {
    var text = String(html || '');
    var blocks = this.__splitByStart(text, '<div[^>]+class="[^"]*post-content_item');
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].replace(/\s+/g, ' ');
      var plain = this.__plain(block);
      var hit = false;
      for (var j = 0; j < labels.length; j++) {
        if (plain.indexOf(labels[j]) >= 0) { hit = true; break; }
      }
      if (!hit) continue;
      var value = this.__text(block, ['class="summary-content"[^>]*>([\\s\\S]{0,300}?)<\\/div>', 'class="summary-content"[^>]*>([^<]+)<']);
      if (value) return value;
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
