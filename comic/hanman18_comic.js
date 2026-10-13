// LumeSource: {"id":"hanman18_comic","name":"HANMAN18","version":"1.0.0","category":"comic"}
//
// HANMAN18（hanman18.com，韩漫站）—— 站点用的是 **Manga18 模板**（一套专门的漫画站
// 主题，韩漫站大量在用它），本文件的地址与选择器**逐条对齐 Tachiyomi/Keiyoushi 的
// `manga18` multisrc 实现**（lib-multisrc/manga18 与 src/zh/hanman18），不是猜的。
//
// ============================================================================
// 站点结构（对照 multisrc 实现抄下来的）
// ============================================================================
//
//   最新更新   GET /list-manga/{页}                    列表项 div.story_item
//   最多观看   GET /list-manga/{页}?order_by=views
//   按标签     GET /manga-list/{标签}/{页}[?order_by=]  标签取自页面 div.grid_cate li > a
//   搜索       GET /list-manga/{页}?search={关键词}      （就是列表接口加一个 search 参数）
//   详情       GET /manhwa/{slug}                      标题 div.detail_name > h1、封面 div.detail_avatar > img
//   剧集       GET /manhwa/{slug}                      章节 div.chapter_box .item（a 是链接与标题，p 是日期）
//   正文       GET {章节页}                            页面里 `slides_p_path` 脚本里是**base64 数组**，
//                                                      逐个解码就是图片地址（相对地址要补全）
//
// 已知边界：
// - **本章节需要登录**的提示：站点的章节页可能只给一个锁标记（multisrc 里同样处理）；
// - 图片地址若是明文 http，脚本统一升成 https（iOS 默认禁止明文，原样返回等于图全裂）；
// - 站点挂 CF 时抛 `NEED_WEBVIEW_VERIFY`，App 会给「网页视图」入口过一次校验。
//
// 验证状态（如实说）：**本机（境外出口）连不上该站**（连接超时/重置），因此未做实播验证；
// 解析内核用与该模板结构一致的夹具跑通（列表 / 分页判定 / 详情 / 剧集排序 / 正文 base64 解码）。
// 导入后请先点「图源管理 → 测试连通性」。
var HOSTS = ['https://hanman18.com'];

// 站点按 UA 发模板：移动端 UA 才拿到本文件解析的这套标记（桌面 UA 可能是另一套）。
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/// 一页条数（站点自己定的；分页另有判定，这个数字只作兜底）。
var PAGE_SIZE = 20;

/// 每章最多取多少张图（防脚本失控时把巨量地址塞给 App）。
var MAX_IMAGES = 200;

var LumeSource = {
  id: 'hanman18_comic',
  name: 'HANMAN18',
  version: '1.0.0',
  category: 'comic',

  /// 分类：两个内置排序 + 站点标签（标签从列表页实时抓，改版自动跟随）。
  async categories() {
    await this.__pickHost();
    var fixed = [
      { id: 'latest', title: '最新更新' },
      { id: 'views', title: '最多观看' }
    ];
    try {
      var html = await this.__page('/list-manga/1');
      var tags = this.__tags(html);
      return fixed.concat(tags);
    } catch (error) {
      // 抓标签失败不该让「分类」整块消失：两个内置排序仍可用。
      return fixed;
    }
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
      path = '/list-manga/' + page + '?search=' + encodeURIComponent(keyword);
    } else if (category.indexOf('tag:') === 0) {
      path = '/manga-list/' + encodeURIComponent(category.substring(4)) + '/' + page;
    } else if (category === 'views') {
      path = '/list-manga/' + page + '?order_by=views';
    } else {
      path = '/list-manga/' + page;
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
    var title = this.__text(html, ['<div[^>]+class="detail_name"[^>]*>[\\s\\S]{0,80}?<h1[^>]*>([^<]+)</h1>', '<h1[^>]*>([^<]+)</h1>']);
    var cover = this.__attr(html, ['class="detail_avatar"[^>]*>[\\s\\S]{0,200}?<img[^>]+src="([^"]+)"', 'property="og:image"[^>]*content="([^"]+)"']);
    var description = this.__text(html, ['<div[^>]+class="detail_reviewContent"[^>]*>([\\s\\S]{0,1500}?)</div>']);
    var status = this.__labelled(html, ['Status', '状态']);
    var author = this.__labelled(html, ['author', 'Autor', '作者']);
    var genres = this.__genres(html);
    var bits = [];
    if (status) bits.push(status);
    if (author) bits.push(author);
    if (genres) bits.push(genres);
    return {
      id: path,
      title: title || path,
      // 相对地址要先补全再升级协议（漏了 __abs 就会把 /uploads/x.jpg 原样交给图片管线）。
      cover: cover ? this.__upgrade(this.__abs(cover)) : null,
      subtitle: bits.length ? bits.join(' · ') : null,
      description: description || null
    };
  },

  /// 剧集：`div.chapter_box .item` 里的章节链接，**按话号升序**排。
  ///
  /// 为什么排序：这类站点的目录默认「最新话在最前」，照原样交出去，阅读器的
  /// 「下一章」会往更早的话跳（本仓库的 seyoumanhua 源踩过同一个坑）。
  async chapters(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return [];
    var html = await this.__page(path);
    if (html === null) return [];
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      throw new Error('HANMAN18：这一部没有剧集（可能未上架，或站点改版）');
    }
    return chapters;
  },

  /// 正文：章节页脚本里的 `slides_p_path` 数组（元素是 base64 的图片地址）。
  async content(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.chapterId) || this.__path(argument && argument.id);
    if (!path) throw new Error('HANMAN18：缺少章节地址，无法取图');
    var html = await this.__page(path);
    if (html === null) throw new Error('HANMAN18：章节页打不开（HTTP 404）');

    var raw = this.__slides(html);
    if (!raw.length) {
      throw new Error('HANMAN18：章节页里没有图片数据（本章可能需要登录，或站点改版）');
    }
    var images = [];
    for (var i = 0; i < raw.length && images.length < MAX_IMAGES; i++) {
      var url = this.__base64(raw[i]);
      url = String(url || '').trim();
      if (!url) continue;
      var absolute = this.__abs(url);
      if (absolute) images.push(this.__upgrade(absolute));
    }
    if (!images.length) throw new Error('HANMAN18：图片地址解析失败（本章可能需要登录）');
    return { kind: 'images', images: images };
  },

  // ------------------------------------------------------------------ 解析

  /// 列表条目：`div.story_item` → a[href] / div.mg_info > div.mg_name a / img[src]。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var blocks = this.__blocks(text, { start: '<div[^>]+class="[^"]*story_item', end: '</div>\\s*</div>|</li>' });
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var href = this.__attr(block, ['<a[^>]+href="([^"]+)"']);
      var path = this.__path(href);
      if (!path || seen[path]) continue;
      var title = this.__text(block, ['class="mg_name"[^>]*>[\\s\\S]{0,40}?<a[^>]*>([^<]+)</a>', 'class="mg_name"[^>]*>([^<]+)<', 'title="([^"]+)"']);
      if (!title) continue;
      seen[path] = true;
      var cover = this.__attr(block, ['<img[^>]+src="([^"]+)"', '<img[^>]+data-src="([^"]+)"']);
      var note = this.__text(block, ['class="mg_chapter[^"]*"[^>]*>([^<]+)<', 'class="mg_author[^"]*"[^>]*>([^<]+)<']);
      items.push({
        id: path,
        title: title,
        cover: cover ? this.__upgrade(this.__abs(cover)) : null,
        subtitle: note || null
      });
    }
    return items;
  },

  /// 还有下一页吗：模板给的是 `.pagination > li:last-child:not(.active)`
  /// ——分页容器里最后一项若不是「当前页」，就说明还有下一页。
  __hasNext(html) {
    var text = String(html || '');
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*pagination', end: '</ul>|</nav>|</div>' });
    if (!box) return false;
    var items = box.match(/<li[\s\S]*?<\/li>/gi) || [];
    if (!items.length) return false;
    var last = items[items.length - 1] || '';
    return !/class="[^"]*\bactive\b/.test(last);
  },

  /// 站点标签（`div.grid_cate li > a`）→ 分类项（id 前缀 tag: 表示按标签筛）。
  __tags(html) {
    var text = String(html || '');
    var box = this.__firstBlock(text, { start: '<[^>]+class="[^"]*grid_cate', end: '</ul>' });
    if (!box) return [];
    var result = [];
    var seen = {};
    var pattern = /<a[^>]+href="([^"]*\/manga-list\/([^"\/]+)[^"]*)"[^>]*>([\s\S]{0,30}?)<\/a>/gi;
    var matched;
    while ((matched = pattern.exec(box)) !== null) {
      var slug = matched[2];
      var title = this.__plain(matched[3]);
      if (!slug || !title || seen[slug]) continue;
      seen[slug] = true;
      result.push({ id: 'tag:' + slug, title: title });
    }
    return result;
  },

  /// 章节：`div.chapter_box .item` 里的 `a`（链接 + 标题），`p` 里是日期。
  __chapters(html) {
    var text = String(html || '');
    var blocks = this.__blocks(text, { start: '<div[^>]+class="[^"]*item', end: '</div>' });
    var chapters = [];
    var seen = {};
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var href = this.__attr(block, ['<a[^>]+href="([^"]+)"']);
      var path = this.__path(href);
      if (!path || seen[path]) continue;
      // 章节链接必须比作品页更深一层（/manhwa/x 是作品，/manhwa/x/... 才是章节）。
      if (!/\/[^\/]+\/[^\/]+/.test(path.replace(/^\/+/, ''))) continue;
      seen[path] = true;
      var title = this.__text(block, ['<a[^>]*>([^<]+)</a>']) || ('第 ' + (chapters.length + 1) + ' 话');
      chapters.push({ id: path, title: title });
    }
    return this.__sortChapters(chapters);
  },

  /// 按标题里的编号升序（抓不到编号的保持原相对顺序、放到末尾）。
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

  /// 正文图片数据：脚本里 `slides_p_path = [ "base64", "base64", ]`。
  ///
  /// 取法与 multisrc 一致：取 `[` 之后、`,]` 之前的那一段，去引号，按逗号切。
  __slides(html) {
    var text = String(html || '');
    var at = text.indexOf('slides_p_path');
    if (at < 0) return [];
    var tail = text.slice(at);
    var open = tail.indexOf('[');
    if (open < 0) return [];
    var rest = tail.slice(open + 1);
    var close = rest.indexOf(',]');
    if (close >= 0) rest = rest.slice(0, close);
    var values = [];
    var pattern = /"([^"]+)"/g;
    var matched;
    while ((matched = pattern.exec(rest)) !== null) values.push(matched[1]);
    return values;
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

  /// 取页面：被 CF / WAF 拦下抛固定标记（App 会给「网页视图」入口），404 返回 null。
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
      throw new Error('NEED_WEBVIEW_VERIFY：HANMAN18 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('HANMAN18：拉取失败（HTTP ' + status + '）：' + url);
    return String(response.body || '');
  },

  /// 结构无关的小工具：切块 / 取文本 / 取属性 / 去标签 / 绝对化 / 协议升级。
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
      blocks.push(end ? tail.slice(0, item[0].length + end.index + end[0].length) : tail.slice(0, 1500));
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

  /// 按「标签文字」取值（模板里是 `div.item` 里一行标签 + 一行 info_value）。
  __labelled(html, labels) {
    var text = String(html || '');
    // 块要收在「两层 </div>」之后：模板是 item >（info_label + info_value）两个 div，
    // 只收到第一个 </div> 会把 info_value 的值切在块外（实测状态 / 作者取不到）。
    var blocks = this.__blocks(text, { start: '<div[^>]+class="[^"]*item', end: '</div>\\s*</div>' });
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var plain = this.__plain(block);
      var hit = false;
      for (var j = 0; j < labels.length; j++) {
        if (plain.indexOf(labels[j]) >= 0) { hit = true; break; }
      }
      if (!hit) continue;
      var value = this.__text(block, ['class="info_value"[^>]*>([\\s\\S]{0,120}?)</div>', 'class="info_value"[^>]*>([^<]+)<']);
      if (value) return value;
    }
    return '';
  },

  /// 题材：`div.info_value > a[href*=/manga-list/]` 的链接文字。
  __genres(html) {
    var text = String(html || '');
    var result = [];
    var pattern = /href="[^"]*\/manga-list\/[^"]*"[^>]*>([^<]{1,20})</gi;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var title = this.__plain(matched[1]);
      if (title && result.indexOf(title) < 0) result.push(title);
      if (result.length >= 8) break;
    }
    return result.join(' / ');
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

  /// 明文 http 升级为 https：iOS 默认禁止明文请求，明文图会整批裂掉。
  /// 主机是 IP / localhost 的不动（那种站通常没有证书，升级反而把能用的弄坏）。
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
  },

  /// 纯 JS base64 解码（沙箱没有 atob）。
  __base64(text) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var input = String(text || '').replace(/[^A-Za-z0-9\+\/=]/g, '');
    var output = '';
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < input.length; i++) {
      var ch = input.charAt(i);
      if (ch === '=') break;
      var value = chars.indexOf(ch);
      if (value < 0) continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    return output;
  }
};
