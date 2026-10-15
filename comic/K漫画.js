// LumeSource: {"id":"kmh001_comic","name":"K漫画","version":"1.0.0","category":"comic"}
//
// K漫画（kmh001.com，发布页提示备用域 kmh.sex）—— 站点是 **Next.js App Router**
// 的服务端渲染站：**页面数据不在独立 JSON 接口里，而是内嵌在 HTML 的 RSC 载荷里**
// （一串 `self.__next_f.push([1,"…"])` 块拼起来就是完整数据层）。本文件的做法就是：
// 取页面 → 抽出并反转义载荷 → 在载荷里按站点自己的字段名取数据（字段名是**对着
// 真实页面核过**的，不是猜的）。
//
// ============================================================================
// 站点结构（全部来自真实响应，开发时逐条核对）
// ============================================================================
//
//   今日更新   GET /home                            载荷里是卡片：`"href":"/comic/<24位id>"`
//   连载周更   GET /weekly/<0..6>                    0=周日 … 6=周六（就是「周一…周日」标签页）
//   完本       GET /complete
//   搜索       GET /search?key=<关键词>              （无分页；结果同样在载荷里）
//   详情       GET /comic/<24位id>
//              作品名   HTML 里的 `<h1 hidden="">…</h1>`
//              简介     `"description","content":"…"`
//              作者     `<meta name="author" content="…">`（可能多个）
//              章节     `{"comicID":"…","data":[{_id, subtitle, title, ordinal, updateAt}]}`
//   正文       GET /chapter/<24位id>
//              图片     `{"sourceID":"…","sourceName":"FREEXCOMIC","url":"https://…jpg","sortIndex":N}`
//                      —— 站点有**多个图源**（源1 FREEXCOMIC / 源2 NNHANMAN …），
//                      脚本按 sortIndex 排序、**取图最多的那个图源**（同一章的图不能混源，
//                      混了会重复页）；源名写进注释便于将来做线路选择。
//
// ============================================================================
// 已知边界（如实说）
// ============================================================================
//
// - `/category`（分类筛选题材）**没有做**：那一页在服务端响应里没有卡片数据（载荷里
//   没有 `/comic/` 条目），它的数据是浏览器里二次请求来的，路径拿不到 → 与其猜，
//   不如不做（分类入口用「今日更新 / 周一…周日 / 完本」，够用且都是真的）。
// - 载荷解析用**括号配对**切数组而不是贪婪正则：章节数组动辄几千条，正则切会截断。
// - 图片地址若是明文 http 统一升 https（iOS 默认禁止明文，原样返回整章裂图）。
//
// 验证状态：**本机 curl 打不开该站**（连接重置），但用**真实浏览器**取回了 6 个页面的
// 完整响应（home / weekly / complete / search / detail / chapter）并存档，解析内核
// 就是对着这 6 份真响应跑通的（列表、分页判定、详情、章节排序、正文多图源取图）。
var HOSTS = ['https://kmh001.com', 'https://kmh.sex'];

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/// 每章最多取多少张图；每部作品最多取多少章（防异常数据把 App 拖死）。
var MAX_IMAGES = 400;
var MAX_CHAPTERS = 3000;

var LumeSource = {
  id: 'kmh001_comic',
  name: 'K漫画',
  version: '1.0.0',
  category: 'comic',

  /// 分类：站点自己的四个入口 + 连载的按星期（就是它顶栏那几个标签）。
  async categories() {
    return [
      { id: 'home', title: '今日更新' },
      { id: 'weekly1', title: '连载 · 周一' },
      { id: 'weekly2', title: '连载 · 周二' },
      { id: 'weekly3', title: '连载 · 周三' },
      { id: 'weekly4', title: '连载 · 周四' },
      { id: 'weekly5', title: '连载 · 周五' },
      { id: 'weekly6', title: '连载 · 周六' },
      { id: 'weekly0', title: '连载 · 周日' },
      { id: 'complete', title: '完本' }
    ];
  },

  /// 列表 / 搜索（关键词走站点自己的搜索页）。
  async list(argument) {
    await this.__pickHost();
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var path;
    if (keyword) {
      path = '/search?key=' + encodeURIComponent(keyword);
    } else if (category.indexOf('weekly') === 0) {
      path = '/weekly/' + category.substring(6);
    } else if (category === 'complete') {
      path = '/complete';
    } else {
      path = '/home';
    }
    var html = await this.__page(path);
    // 站点的这几个列表都是**一页到底**（翻页靠切标签页，不是页码），所以 hasMore 恒为 false。
    return { items: this.__cards(this.__payload(html)), hasMore: false };
  },

  /// 详情。
  async detail(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return null;
    var html = await this.__page(path);
    if (html === null) return null;
    var payload = this.__payload(html);
    var title = this.__text(html, ['<h1[^>]*>([^<]+)</h1>', '<meta[^>]+property="og:title"[^>]*content="([^"]+)"']);
    var description = this.__text(payload, ['"description","content":"([^"]*)"', '"description"[^>]*"content":"([^"]*)"']);
    var authors = this.__all(payload, '"name":"author","content":"([^"]+)"');
    var status = this.__text(payload + html, ['连载状态：([^"\\\\<]{1,12})', '"status":"([^"]{1,12})"']);
    var tags = this.__text(html, ['<meta[^>]+name="keywords"[^>]*content="([^"]+)"']);
    var cover = this.__text(payload + html, ['(https://img\\.kmh\\.pics/[^"\\\\]*-cover\\.jpg)', '(https://img\\.kmh\\.pics/[^"\\\\]*\\.jpg)']);
    if (!title) return null;
    var bits = [];
    if (status) bits.push(status);
    if (authors.length) bits.push('作者：' + authors.join('&'));
    if (!authors.length && tags) {
      var names = tags.split(',');
      if (names.length > 1) bits.push(names.slice(1, 4).join(' / '));
    }
    return {
      id: path,
      title: title,
      cover: cover ? this.__upgrade(cover) : null,
      subtitle: bits.length ? bits.join(' · ') : null,
      description: description || null
    };
  },

  /// 剧集：详情载荷里的 `data[]`（每项 `_id` 是章节 id、`ordinal` 是话号），按话号升序。
  async chapters(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return [];
    var html = await this.__page(path);
    if (html === null) return [];
    var payload = this.__payload(html);
    var chapters = this.__chapters(payload);
    if (!chapters.length) {
      throw new Error('K漫画：这一部没有剧集（可能未上架，或站点改版）');
    }
    return chapters;
  },

  /// 正文：章节载荷里的图片数组，按图源分组 → 取图最多的一组 → 按 sortIndex 排序。
  async content(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.chapterId) || this.__path(argument && argument.id);
    if (!path) throw new Error('K漫画：缺少章节地址，无法取图');
    var html = await this.__page(path);
    if (html === null) throw new Error('K漫画：章节页打不开（HTTP 404）');
    var payload = this.__payload(html);

    var images = this.__images(payload);
    if (!images.length) {
      throw new Error('K漫画：章节页里没有图片数据（站点可能改版，或本章需登录）');
    }
    return { kind: 'images', images: images };
  },

  // ------------------------------------------------------------------ 载荷层

  /// 抽 RSC 载荷：把所有 `self.__next_f.push([1,"…"])` 的字符串拼起来（含反转义）。
  ///
  /// 为什么这样做：站点把页面数据放在这些块里，**不在独立 JSON 接口里**——直接扫
  /// HTML 只能看到被转义过的片段，拼起来才是完整、干净的 JSON 文本。
  __payload(html) {
    var text = String(html || '');
    var chunks = [];
    var pattern = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      try {
        chunks.push(JSON.parse(matched[1]));
      } catch (error) {
        // 个别块不是合法 JSON 字符串：跳过它，其余照常拼。
      }
    }
    return chunks.join('');
  },

  /// 卡片解析：载荷里每张卡是 `"href":"/comic/<24位id>"` + 紧随其后的封面/标题/最新话。
  ///
  /// 窗口内取字段（而不是整段正则）：标题在 `"$","h3",…{"children":"…"}` 里、
  /// 最新话在 h4 里、封面是窗口里第一个 `"src":"https://…"`——列表页与搜索页两种
  /// 排版都能覆盖。
  __cards(payload) {
    var text = String(payload || '');
    var items = [];
    var seen = {};
    var pattern = /"href":"\/comic\/([0-9a-f]{24})"/g;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var id = matched[1];
      if (seen[id]) continue;
      var window_ = text.slice(matched.index, matched.index + 900);
      var title = this.__h(window_, 'h3');
      if (!title) continue;
      seen[id] = true;
      var cover = this.__first(window_, ['"src":"(https?://[^"]+)"']);
      var latest = this.__h(window_, 'h4');
      items.push({
        id: '/comic/' + id,
        title: title,
        cover: cover ? this.__upgrade(cover) : null,
        subtitle: latest || null
      });
    }
    return items;
  },

  /// 载荷里 `"hN",…,{"children":"文字"}` 的文字（就近取第一个）。
  __h(window_, tag) {
    var pattern = new RegExp('"\\$","' + tag + '",[\\s\\S]{0,200}?"children":"([^"]+)"');
    var matched = pattern.exec(window_);
    if (matched) return this.__plain(matched[1]);
    // 有的排版把 children 放在属性对象里（`{"className":"…","children":"…"}`）。
    var loose = new RegExp('"' + tag + '",[\\s\\S]{0,300}?"children":"([^"]+)"');
    var second = loose.exec(window_);
    return second ? this.__plain(second[1]) : '';
  },

  /// 章节数组：`"comicID":"…","data":[…]` —— 用括号配对切出数组再 JSON.parse。
  ///
  /// 为什么不用正则截 `]`：章节里有标题本身带方括号的（「第10话 [完]」那种），
  /// 贪婪/懒惰正则都会截错；括号配对（跳过字符串内的括号）才是稳的。
  __chapters(payload) {
    var text = String(payload || '');
    var at = text.indexOf('"data":[');
    var chapters = [];
    while (at >= 0) {
      var start = text.indexOf('[', at);
      var json = this.__sliceArray(text, start);
      if (json) {
        var list = null;
        try { list = JSON.parse(json); } catch (error) { list = null; }
        if (list && list.length) {
          for (var i = 0; i < list.length && chapters.length < MAX_CHAPTERS; i++) {
            var entry = list[i] || {};
            if (!entry._id) continue;
            var subtitle = String(entry.subtitle || '').trim();
            var title = String(entry.title || '').trim();
            chapters.push({
              id: '/chapter/' + entry._id,
              title: subtitle && title ? (subtitle + ' ' + title) : (subtitle || title || entry._id),
              __ordinal: Number(entry.ordinal == null ? chapters.length : entry.ordinal)
            });
          }
          if (chapters.length) break;
        }
      }
      at = text.indexOf('"data":[', at + 1);
    }
    chapters.sort(function (a, b) { return a.__ordinal - b.__ordinal; });
    return chapters.map(function (c) { return { id: c.id, title: c.title }; });
  },

  /// 正文图片：`{"sourceName":"…","url":"…","sortIndex":N}` 全量收集 → 按源分组取最大组。
  __images(payload) {
    var text = String(payload || '');
    var pattern = /\{"sourceID":"[^"]*","sourceName":"([^"]*)","url":"([^"]+)","sortIndex":(\d+)\}/g;
    var groups = {};
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var name = matched[1] || '默认';
      var url = matched[2];
      var index = Number(matched[3]);
      if (!url) continue;
      if (!groups[name]) groups[name] = [];
      groups[name].push({ url: url, index: index });
    }
    var best = null;
    var names = Object.keys(groups);
    for (var i = 0; i < names.length; i++) {
      if (!best || groups[names[i]].length > groups[best].length) best = names[i];
    }
    if (!best) {
      // 形态变了也别整章空手而归：退回「载荷里所有图片后缀的地址」。
      var fallback = [];
      var loose = /"url":"(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp|avif))"/gi;
      var hit;
      while ((hit = loose.exec(text)) !== null && fallback.length < MAX_IMAGES) {
        fallback.push({ url: hit[1], index: fallback.length });
      }
      return this.__sortUrls(fallback);
    }
    return this.__sortUrls(groups[best]);
  },

  __sortUrls(entries) {
    entries.sort(function (a, b) { return a.index - b.index; });
    var images = [];
    var seen = {};
    for (var i = 0; i < entries.length && images.length < MAX_IMAGES; i++) {
      var url = this.__upgrade(this.__abs(entries[i].url));
      if (!url || seen[url]) continue;
      seen[url] = true;
      images.push(url);
    }
    return images;
  },

  /// 从 `[` 起按括号配对切一段完整 JSON 数组（字符串里的括号不算）。
  __sliceArray(text, start) {
    if (start < 0) return null;
    var depth = 0;
    var inString = false;
    var escaped = false;
    var limit = Math.min(text.length, start + 4000000);
    for (var i = start; i < limit; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === '\\') { escaped = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  },

  // ------------------------------------------------------------------ 网络与工具

  async __pickHost() {
    if (this.__host) return this.__host;
    for (var i = 0; i < HOSTS.length; i++) {
      try {
        var response = await LumeSource.http.get(HOSTS[i] + '/home', { headers: { 'User-Agent': UA } });
        var status = response ? response.status : 0;
        if (status === 200 || status === 403 || status === 503 || status === 521) {
          this.__host = HOSTS[i];
          return this.__host;
        }
      } catch (error) { /* 换备用域 */ }
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
        'Referer': this.__base() + '/home'
      }
    });
    var status = response ? response.status : 0;
    if (status === 404) return null;
    if (status === 403 || status === 503 || status === 521) {
      throw new Error('NEED_WEBVIEW_VERIFY：K漫画 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('K漫画：拉取失败（HTTP ' + status + '）：' + url);
    return String(response.body || '');
  },

  __first(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var matched = new RegExp(patterns[i]).exec(String(text || ''));
      if (matched && matched[1]) return matched[1];
    }
    return '';
  },

  __text(text, patterns) {
    var value = this.__first(text, patterns);
    return value ? this.__plain(value) : '';
  },

  __all(text, pattern) {
    var result = [];
    var rx = new RegExp(pattern, 'g');
    var matched;
    while ((matched = rx.exec(String(text || ''))) !== null) {
      var value = this.__plain(matched[1]);
      if (value && result.indexOf(value) < 0) result.push(value);
      if (result.length >= 6) break;
    }
    return result;
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
      .replace(/\\n/g, ' ')
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
