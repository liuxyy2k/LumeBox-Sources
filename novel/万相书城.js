// LumeSource: {"id":"wxscs_novel","name":"万相书城","version":"1.0.0","category":"novel","mirrors":["https://www.wxscs.com","https://wxscs.com"]}
// 站点：https://www.wxscs.com（Bootstrap 皮 + 服务端渲染；PC / 移动同一套标记；阅读免登录）
//
// ## 抓取口径（每条都对着实时页面核过，快照见 snapshots/novel_wxscs_*.html）
//
//   分类   `/nav/<slug>.html`；第 N 页是 `/nav/<slug>_p<N>.html`
//          （站点分页锚点写的是**相对**页名 `xuanhuan_p2.html`，所以自己拼绝对路径，
//           不照抄相对锚点）。九个分类就是站点导航那九个，逐个核过：
//          xuanhuan 玄幻·奇幻 / xianxia 仙侠·武侠 / dushi 都市·娱乐 / lishi 历史·军事 /
//          kehuan 科幻·游戏 / kongbu 恐怖·悬疑 / chunai 耽美·纯爱 / yanqing 女生·言情 /
//          erciyuan 轻小说。每页 50 条。
//   搜索   **本站没有搜索**：/search.html 直接 404（三条常见搜索路径都试过）。
//          list() 带 keyword 时明确报错，不做「悄悄返回空」——空列表会被当成
//          「没搜到」，用户会反复换关键词。
//   条目   `div.media`：`a.media-left[href=/book/<id>/] > img.book-img-small[src=/uploads/cover/pic<id>.jpg]`
//          是封面与作品地址，`div.media-title > h4 > a` 是书名，`div.media-info` 是简介。
//          **<id> 可能是数字（/book/23183/）也可能是拼音 slug（/book/wanxiangzhiwang/）**，
//          两种都当原样字符串传下去，不要只留数字（slug 那种会把 0 个字符当 id）。
//   详情   `h1.book-name` 是书名；`img.book-img-middel` 是封面；`div.book-detail` 是简介；
//          「作者：/ 状态：/ 最新章节：」三行在 book-info 的 div.dark 里（按标签取，不按顺序取）。
//   目录   **详情页就带全量目录**（实测 2288 条），不用另抓目录页：
//          `a[href=/book/<id>/<chapid>.html][title]`，站点给的是**倒序**（最新在前），
//          这里按 chapid 数值升序重排后再交付。
//   正文   `/book/<id>/<chapid>.html`：正文在 `div#cont-body`（class 里带 chapid）。
//          长章会分页，页 2 是 `<chapid>_2.html`（同目录下相对地址），页面自己的
//          `ul.pagination` 里列着全部页号；按它把 2…N 页并起来再拼成一段。
//
// ## 两条纪律
// 1. `base()` 优先用宿主注入的域名（换镜像 / 手填域名要立刻生效）；站内绝对地址
//    （页面里写死的 www.wxscs.com）一律按 base() 重写，否则换了域名又被拉回旧站。
// 2. 沙箱单次调用有墙钟预算：目录只解析当前页（不翻页），正文多页按 4 页一批并发
//    + 软截止，宁可不全也不整次超时。

var DEFAULT_BASE = 'https://www.wxscs.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 200;        // 单次列表最多产出（防解析失控）
var ITEM_WINDOW = 1400;     // 解析单条时往后看的窗口
var MAX_CHAPTERS = 3000;    // 目录最多产出多少章
var PAGE_SIZE = 10;         // 分类页每页条数（实测：p1/p2/p3 各 10 条，逐页不重复）
var CONTENT_BATCH = 4;      // 正文多页每批并发几页
var CONTENT_BUDGET_MS = 5000; // 正文抓取软截止（沙箱单次调用预算 10s）
var CONTENT_MAX_PAGES = 12; // 正文最多并几页（超长章也不至于把预算吃光）

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
/// 老版本 App 没有 config（或字段缺失）时回落到本源自己的默认域名。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

/// 站点自己的 host（含镜像）：这类绝对地址要按 base() 重写。
function isSiteHost(host) {
  var h = String(host || '').toLowerCase().replace(/^www\./, '');
  var list = ['wxscs.com'];
  var b = base();
  var m = /^https?:\/\/([^/]+)/i.exec(b);
  if (m) list.push(m[1].toLowerCase().replace(/^www\./, ''));
  for (var i = 0; i < list.length; i++) {
    if (h === list[i]) return true;
  }
  return false;
}

var LumeSource = {
  id: 'wxscs_novel',
  name: '万相书城',
  version: '1.0.0',
  category: 'novel',
  mirrors: ['https://www.wxscs.com', 'https://wxscs.com'],

  // ---------------------------------------------------------------- 契约方法

  /// 首页：站点自己的三块——最新入库（只有书名+作者）、好书推荐（带封面）、书籍列表。
  /// 三块都是「服务端渲染好的」，一次请求就能全拿到。
  async home() {
    var html = await this.__get('/');
    var sections = [];
    var newest = this.__simpleRows(this.__block(html, '最新入库'));
    if (newest.length) sections.push({ title: '最新入库', items: newest.slice(0, 18) });
    var pick = this.__mediaCards(this.__block(html, '好书推荐'));
    if (pick.length) sections.push({ title: '好书推荐', items: pick.slice(0, 18) });
    var all = this.__simpleRows(this.__block(html, '书籍列表'));
    if (all.length) sections.push({ title: '书籍列表', items: all.slice(0, 18) });
    if (!sections.length) sections.push({ title: '最新入库', items: this.__mediaCards(html).slice(0, 18) });
    return sections;
  },

  /// 分类＝站点导航那九个（顺序照站点）。
  async categories() {
    return [
      { id: 'xuanhuan', title: '玄幻·奇幻' },
      { id: 'xianxia', title: '仙侠·武侠' },
      { id: 'dushi', title: '都市·娱乐' },
      { id: 'lishi', title: '历史·军事' },
      { id: 'kehuan', title: '科幻·游戏' },
      { id: 'kongbu', title: '恐怖·悬疑' },
      { id: 'chunai', title: '耽美·纯爱' },
      { id: 'yanqing', title: '女生·言情' },
      { id: 'erciyuan', title: '轻小说' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      // 站点没有搜索（/search.html 404）。明确报错，别给一个「看起来搜过」的空列表。
      throw new Error('万相书城：本站没有搜索功能，请用分类浏览');
    }
    var slug = this.__slug(args.categoryId);
    var html = await this.__get(this.__listPath(slug, page));
    var items = this.__mediaCards(html);
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    if (!items.length) {
      console.warn('[wxscs] 分类页没认出条目：/nav/' + slug + '.html 第 ' + page + ' 页（'
        + html.length + ' 字符）');
    }
    return { items: items, hasMore: this.__hasMore(html, page) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/book/' + id + '/');
    var title = this.__title(html);
    if (!title) {
      throw new Error('万相书城：详情页没认出书名（id=' + id + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    var cover = this.__cover(html);
    var info = this.__detailInfo(html);
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: info.subtitle,
      description: info.description
    };
  },

  /// 目录：全量目录就在详情页上（实测 2288 条），倒序 → 按 chapid 升序交付。
  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/book/' + id + '/');
    var rows = this.__chapters(html, id);
    if (!rows.length) {
      throw new Error('万相书城：目录页没认出章节（id=' + id + '）——把运行日志发回来收敛解析规则');
    }
    if (rows.length > MAX_CHAPTERS) rows = rows.slice(0, MAX_CHAPTERS);
    return rows;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = this.__token(argument && argument.chapterId);
    if (!chapterId) throw new Error('万相书城：缺少章节号（请重新进一次目录再打开）');
    var first = '/book/' + id + '/' + chapterId + '.html';
    var html = await this.__get(first);
    var pages = this.__contentPages(html, chapterId);
    var text = this.__articleText(html);
    if (pages && pages.length && text) {
      var started = new Date().getTime();
      for (var start = 0; start < pages.length; start += CONTENT_BATCH) {
        if (new Date().getTime() - started > CONTENT_BUDGET_MS) {
          console.warn('[wxscs] 正文到软截止（' + CONTENT_BUDGET_MS + 'ms），先返回已抓到的 '
            + (start + 1) + ' 页');
          break;
        }
        var batch = [];
        for (var i = start; i < start + CONTENT_BATCH && i < pages.length; i++) {
          batch.push(this.__contentPage(id, chapterId, pages[i]));
        }
        var results = await Promise.all(batch);
        for (var r = 0; r < results.length; r++) {
          var piece = results[r];
          if (piece) text += '\n' + piece;
        }
      }
    }
    if (!text) {
      throw new Error('万相书城：正文页没认出正文（' + first + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 地址

  /// 分类 id：站点用 slug（xuanhuan 这种）。宿主可能给整条地址（/nav/xuanhuan.html），
  /// 一律取其中的 slug 段；认不出就返回空串，交给 __listPath 回落到第一个分类。
  __slug(value) {
    var text = String(value == null ? '' : value).trim().toLowerCase();
    var m = /(?:^|\/)([a-z0-9_]+)(?:\.html)?$/.exec(text);
    if (m) return m[1];
    return /^[a-z0-9_]+$/.test(text) ? text : '';
  },

  /// 分类 id → 列表地址。slug 一律小写字母数字；认不出的退回第一个分类，
  /// 别抛「无效分类」把整页变成报错（宿主可能在配置迁移期给个旧 id）。
  __listPath(slug, page) {
    var id = /^[a-z0-9_]+$/.test(slug) ? slug : 'xuanhuan';
    if (page <= 1) return '/nav/' + id + '.html';
    return '/nav/' + id + '_p' + page + '.html';
  },

  /// 分页：站点分页器里第 N 页锚点写的是相对页名（`xuanhuan_p3.html`），
  /// 所以判「还有下一页」＝这段里出现过 `_p<page+1>.html`。
  /// 注意**不能**只看 `下页` 两个字：末页也带「下页」锚点（实测）。
  __hasMore(html, page) {
    var block = this.__pager(html);
    if (block && block.indexOf('_p' + (page + 1) + '.html') >= 0) return true;
    if (block) return false;
    // 分页器没认出来时退一步：整页找页名，再退一步按「整页条数」判。
    if (html.indexOf('_p' + (page + 1) + '.html') >= 0) return true;
    return this.__mediaCards(html).length >= PAGE_SIZE;
  },

  /// 作品 id：数字或拼音 slug 都原样保留（/book/23183/ 与 /book/wanxiangzhiwang/ 都合法）。
  /// 传参口径兼容 `id` / `itemId` / `bookId` 与整条地址（契约是 id，但存量的自检脚本
  /// 与老版本宿主用的是 itemId——两个都认，别让一个字段名把整章正文拦下来）。
  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'bookId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/book\/([^\/\s"'?#]+)/.exec(raw);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
    throw new Error('万相书城：缺少作品 ID');
  },

  /// 章节号：站点一律是纯数字（7404617）。整条地址也接受。
  __token(value) {
    var text = String(value == null ? '' : value).trim();
    var m = /(\d+)/.exec(text);
    return m ? m[1] : '';
  },

  // ---------------------------------------------------------------- 网络

  /// 所有请求的唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path) {
    var url = /^https?:/i.test(path) ? this.__abs(path) : base() + path;
    var response = await LumeSource.http.get(url, { headers: { 'Referer': base() + '/' } });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 521 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：万相书城 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile|人机校验/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：万相书城 需要网页验证（' + url + '）');
    }
    return body;
  },

  /// 站内绝对地址按 base() 重写（换域名后不被页面里写死的旧域名拉回去）；
  /// 站外地址（图床等）原样保留。
  __abs(value) {
    var url = this.__entity(String(value || '')).trim();
    if (!url) return '';
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (/^https?:\/\//i.test(url)) {
      var m = /^https?:\/\/([^\/]+)([\s\S]*)$/i.exec(url);
      if (m && isSiteHost(m[1])) return base() + m[2];
      return url;
    }
    return base() + (url.charAt(0) === '/' ? '' : '/') + url;
  },

  // ---------------------------------------------------------------- 解析

  /// 正则版的「取标签」：本沙箱里没有 DOM，全站解析都走正则 + 位置窗口。
  __attr(tagHtml, name) {
    var m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')
      .exec(String(tagHtml || ''));
    if (!m) return '';
    var v = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    return this.__entity(v || '');
  },

  __entity(text) {
    return String(text == null ? '' : text).replace(
      /&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi,
      function (v) {
        var map = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
        if (map[v]) return map[v];
        var code = v.charAt(2) === 'x' || v.charAt(2) === 'X'
          ? parseInt(v.slice(3), 16) : parseInt(v.slice(2), 10);
        return isFinite(code) && code > 0 ? String.fromCharCode(code) : v;
      });
  },

  __stripTags(text) {
    return String(text || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]*>/g, '');
  },

  __clean(text) {
    return this.__entity(this.__stripTags(text)).replace(/[ \t\r\f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  },

  /// 取某个 panel 块（标题 → 下一个头面板之间），拿不到就返回整页。
  __block(html, title) {
    var at = String(html || '').indexOf(title);
    if (at < 0) return '';
    var next = html.indexOf('panel-heading', at + title.length);
    var end = next > 0 ? next : Math.min(html.length, at + 120000);
    return html.slice(at, end);
  },

  __pager(html) {
    var at = String(html || '').indexOf('pagination');
    if (at < 0) return '';
    return html.slice(at, at + 1500);
  },

  /// 带封面的卡片（div.media）：首页推荐块、分类列表、相关推荐都用它。
  __mediaCards(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var index = 0;
    while (index < text.length && items.length < MAX_ITEMS) {
      var at = text.indexOf('class="media"', index);
      if (at < 0) break;
      index = at + 13;
      var win = text.slice(at, at + ITEM_WINDOW);
      var anchor = /href="(\/book\/[^"\s]+)"/.exec(win);
      if (!anchor) continue;
      var id = this.__id({ id: anchor[1] });
      if (!id || seen[id]) continue;
      var img = /<img\b[^>]*>/i.exec(win);
      var cover = img ? this.__abs(this.__attr(img[0], 'src') || this.__attr(img[0], 'data-src')) : '';
      if (cover && /nocover|nopic|blank|default/i.test(cover)) cover = '';
      var title = '';
      var h4 = /<h4[^>]*>([\s\S]{0,200}?)<\/h4>/i.exec(win);
      if (h4) title = this.__clean(h4[1]);
      if (!title && img) title = this.__entity(this.__attr(img[0], 'alt'));
      if (!title) continue;
      var info = /class="media-info"[^>]*>([\s\S]{0,400}?)<\/div>/i.exec(win);
      var author = /<span class="dark"[^>]*>([\s\S]{0,60}?)<\/span>/i.exec(win);
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: cover,
        subtitle: author ? this.__clean(author[1]) : '',
        description: info ? this.__clean(info[1]).slice(0, 120) : ''
      });
    }
    return items;
  },

  /// 纯文字行（最新入库 / 书籍列表）：这两块**没有封面**，行标记是
  /// `<div class="col-md-12 item fix1px">` / `<div class="col-md-6 item">`——
  /// 不要按 `class="item"` 找（那个字符串根本匹配不上，实测整块解析出 0 条），
  /// 直接扫块内的 `/book/…` 锚点，作者取紧随其后的 `span.dark`。
  __simpleRows(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var pattern = /<a\b[^>]*href="(\/book\/[^"\s]+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi;
    var m;
    while ((m = pattern.exec(text)) !== null && items.length < MAX_ITEMS) {
      var id = '';
      try {
        id = this.__id({ id: m[1] });
      } catch (error) {
        continue;
      }
      var title = this.__clean(m[2]);
      if (!id || !title || seen[id]) continue;
      var after = text.slice(m.index + m[0].length, m.index + m[0].length + 240);
      var author = /<span class="dark[^>]*>([\s\S]{0,60}?)<\/span>/i.exec(after);
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: '',
        subtitle: author ? this.__clean(author[1]) : '',
        description: ''
      });
    }
    return items;
  },

  __title(html) {
    var m = /<h1[^>]*class="[^"]*book-name[^"]*"[^>]*>([\s\S]{0,200}?)<\/h1>/i.exec(String(html || ''));
    if (m) {
      var t = this.__clean(m[1]);
      if (t) return t;
    }
    var h1 = /<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i.exec(String(html || ''));
    return h1 ? this.__clean(h1[1]) : '';
  },

  __cover(html) {
    var text = String(html || '');
    var m = /<img[^>]*class="[^"]*book-img-middel[^"]*"[^>]*>/i.exec(text)
      || /<img[^>]*class="[^"]*book-img[^"]*"[^>]*>/i.exec(text);
    if (!m) return '';
    var src = this.__attr(m[0], 'src') || this.__attr(m[0], 'data-src');
    var url = this.__abs(src);
    if (/nocover|nopic|blank|default/i.test(url)) return '';
    return url;
  },

  __detailInfo(html) {
    var text = String(html || '');
    var intro = /<div[^>]*class="[^"]*book-detail[^"]*"[^>]*>([\s\S]{0,3000}?)<\/div>/i.exec(text);
    var author = /作者[\s:：]*<a[^>]*>([\s\S]{0,60}?)<\/a>/i.exec(text);
    var status = /状态[\s:：]*([\s\S]{0,20}?)<\//i.exec(text);
    var latest = /最新章节[\s:：]*<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/i.exec(text);
    var subtitle = '';
    if (author) subtitle = '作者：' + this.__clean(author[1]);
    if (status) {
      var s = this.__clean(status[1]);
      if (s) subtitle += (subtitle ? ' · ' : '') + s;
    }
    var description = intro ? this.__clean(intro[1]) : '';
    if (latest) {
      var last = this.__clean(latest[2]);
      if (last) description += (description ? '\n' : '') + '最新章节：' + last;
    }
    return { subtitle: subtitle, description: description };
  },

  /// 目录：详情页里所有 /book/<id>/<chapid>.html，倒序 → 按 chapid 升序。
  ///
  /// 标题取锚点自己的 title 属性。**先整条锚点抓下来再取属性**，不要写成
  /// `href="…"[^>]*?(?:title="…")?`——那个懒惰量词加可选组会匹配空，标题永远抓不到
  /// （实测会退化成「第 7404617 章」这种拿章节号当标题）。
  ///
  /// 同一个 id 会出现多次且**先来的未必带标题**：详情页顶部「开始阅读」按钮也指向
  /// 第 1 章（无 title），真正的目录条目在下面。所以重复 id 不丢弃，而是「空标题让位给
  /// 有标题的那条」——否则第一章永远显示成「第 <章节号> 章」。
  __chapters(html, id) {
    var text = String(html || '');
    var rows = [];
    var index = {};
    var pattern = new RegExp('<a\\b[^>]*href="/book/' + id + '/(\\d+)\\.html"[^>]*>', 'g');
    var m;
    while ((m = pattern.exec(text)) !== null) {
      var tok = m[1];
      var title = this.__clean(this.__attr(m[0], 'title'));
      if (index[tok] === undefined) {
        index[tok] = rows.length;
        rows.push({ id: tok, title: title, index: Number(tok) });
      } else if (title && !rows[index[tok]].title) {
        rows[index[tok]].title = title;
      }
    }
    rows.sort(function (a, b) { return a.index - b.index; });
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({
        id: rows[i].id,
        title: rows[i].title || ('第 ' + rows[i].id + ' 章')
      });
    }
    return out;
  },

  /// 正文分页：站点自己的分页器里是相对页名 `<chapid>_2.html`，返回 2…N 的页号数组。
  __contentPages(html, chapterId) {
    var pager = this.__pager(html);
    if (!pager) return [];
    var pattern = new RegExp('[\'"]' + chapterId + '_(\\d+)\\.html[\'"]', 'g');
    var m;
    var max = 1;
    while ((m = pattern.exec(pager)) !== null) {
      var n = Number(m[1]);
      if (n > max) max = n;
    }
    if (max > CONTENT_MAX_PAGES) max = CONTENT_MAX_PAGES;
    var pages = [];
    for (var i = 2; i <= max; i++) pages.push(i);
    return pages;
  },

  async __contentPage(id, chapterId, page) {
    var url = '/book/' + id + '/' + chapterId + '_' + page + '.html';
    try {
      var html = await this.__get(url);
      return this.__articleText(html);
    } catch (error) {
      console.warn('[wxscs] 正文第 ' + page + ' 页失败：' + error);
      return '';
    }
  },

  /// 正文：`div#cont-body`（class 里带 chapid），段落是 <p>。
  ///
  /// 结束位置**不能**取「页脚之前」这种模糊口径：正文块后面紧跟分页器、底部
  /// 上一章/回目录/下一页 按钮、标签推荐、版权声明，一路扫下去会把「有能力者请一定
  /// 订阅正版」之类当正文尾巴（实测）。站点在正文块之后紧接着放的是
  /// `<div class="clear">`（中间页）、`<div class="note">`、`<div class="page">`（分页器）、
  /// 末页的 `<div class="fixed-btn">`；取其中**最先出现**的那个当截断点。
  __articleText(html) {
    var text = String(html || '');
    var at = text.indexOf('id="cont-body"');
    if (at < 0) {
      var alt = /<div[^>]*class="[^"]*cont-body[^"]*"[^>]*>/i.exec(text);
      if (!alt) return '';
      at = alt.index;
    }
    var body = text.slice(text.indexOf('>', at) + 1);
    var ends = [
      'class="clear"',
      'class="note"',
      'class="page"',
      'class="fixed-btn"',
      'Content End',
      'Footer Begin'
    ];
    var cut = body.length;
    for (var i = 0; i < ends.length; i++) {
      var pos = body.indexOf(ends[i]);
      if (pos >= 0 && pos < cut) cut = pos;
    }
    // 截断点落在标签中间时往前退到那个标签的 `<`：否则清完标签会剩下半截
    // `<div`（它没有 `>`，`<[^>]*>` 这种规则剥不掉，实测会原样出现在正文末尾）。
    var lastLt = body.lastIndexOf('<', cut);
    if (lastLt >= 0 && body.indexOf('>', lastLt) > cut) cut = lastLt;
    var block = body.slice(0, cut);
    return this.__clean(block.replace(/<script[\s\S]*?<\/script>/gi, ' '))
      .replace(/<[^>]*$/, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
};
