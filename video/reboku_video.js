// LumeSource: {"id":"reboku_video","name":"热播库","version":"1.0.0","category":"video"}
//
// 热播库 —— 苹果CMS（自定义（content-list） 主题）站点的 Lume Box 源。
//
// ============================================================================
// 来源与验证状态（如实说明）
// ============================================================================
//
// - **规则来源**：TVBox / drpy 社区蜘蛛 `hjdhnx/dr_py` 的 `js/热播库.js`：移植其地址规则
//   与播放地址解壳方式，没有改动站点逻辑；
// - **站点形态**：苹果CMS + 自定义（content-list） 主题。分类 / 列表 / 搜索都是站点自己的 HTML 页面；
//   详情页与播放页里有本站的 `player_aaaa` 播放数据——`url` 就是播放地址，`encrypt`
//   决定怎么解（0 原样 / 1=unescape / 2=base64 后再 unescape）；
// - **本机（境外出口）连不上该站**，因此**未做端到端实播验证**。导入后请先点
//   「图源管理 → 测试连通性」：失败提示带 HTTP 状态，便于分辨是限流、域名更换还是改版。
//   域名换了改下面的 HOSTS 即可（按顺序试，第一个通的即用）；
// - 站点若被人机校验（CF / WAF）拦下，脚本抛固定标记 `NEED_WEBVIEW_VERIFY`，
//   App 会给「网页视图」入口让用户手动过一次校验（脚本不做任何绕过）。
var HOSTS = ['https://www.reboku.cc'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/// 一页条数（站点自己定的，这里只用于判断「可能还有下一页」）。
var PAGE_FULL = 12;

var LumeSource = {
  id: 'reboku_video',
  name: '热播库',
  version: '1.0.0',
  category: 'video',

  /// 分类：从站点导航实时抓（站点改分类，这里跟着变）。
  async categories() {
    await this.__pickHost();
    var html = await this.__page('/');
    return this.__navPairs(html);
  },

  /// 列表 / 搜索。
  async list(argument) {
    await this.__pickHost();
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    if (keyword) {
      var searched = await this.__search(keyword, page);
      // 搜索若走的是联想接口，它直接返回条目表；走 HTML 则照常解析。
      if (searched && searched.items) {
        return { items: searched.items, hasMore: searched.hasMore === true };
      }
      var found = this.__items(searched === null ? '' : searched);
      return { items: found, hasMore: found.length >= PAGE_FULL };
    }
    var html = await this.__page(this.__listPath(category, page));
    var items = this.__items(html === null ? '' : html);
    return { items: items, hasMore: items.length >= PAGE_FULL };
  },

  /// 详情：标题 / 封面 / 简介。
  async detail(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return null;
    var html = await this.__page(path);
    if (html === null) return null;
    var title = this.__text(html, ['<h1[^>]*>([^<]+)</h1>']);
    var cover = this.__attr(html, ['data-original="([^"]+)"', 'property="og:image"[^>]*content="([^"]+)"']);
    var desc = this.__text(html, ['<h2[^>]*>[^<]*简介[^<]*</h2>([\\s\\S]{0,600}?)</div>']);
    return {
      id: path,
      title: title || path,
      cover: cover ? this.__abs(cover) : null,
      subtitle: this.__text(html, ['class="bottom2[^"]*"[^>]*>([^<]+)<']) || null,
      description: desc || null
    };
  },

  /// 剧集：详情页里所有「/play/<id>-<线路>-<集>.html」链接。
  ///
  /// 为什么按链接形状抓、不按容器类名：这类站点一换主题容器类名必变，而苹果CMS
  /// 的播放页地址规则十年没变——按形状抓更抗改版。
  async chapters(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.id);
    if (!path) return [];
    var html = await this.__page(path);
    if (html === null) return [];
    var seen = {};
    var chapters = [];
    var pattern = /<a[^>]+href=["']([^"']*\/play\/[^"']+?\.html)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi;
    var matched;
    while ((matched = pattern.exec(html)) !== null) {
      var href = matched[1];
      if (seen[href]) continue;
      seen[href] = true;
      var label = this.__plain(matched[2]);
      chapters.push({ id: href, title: label || ('第 ' + (chapters.length + 1) + ' 集') });
    }
    if (!chapters.length) {
      throw new Error('热播库：详情页里没有播放链接（站点可能改版，或该片没有可播剧集）');
    }
    return chapters;
  },

  /// 播放地址：抓播放页里的 `player_aaaa`，按 `encrypt` 解壳。
  ///
  /// 解出来不是 m3u8 / mp4（例如指向某个「解析播放页」的 iframe）就如实报错，
  /// 不把播不了的页面塞给内核。
  async content(argument) {
    await this.__pickHost();
    var path = this.__path(argument && argument.chapterId) ||
               this.__path(argument && argument.id);
    if (!path) throw new Error('热播库：缺少播放页地址，无法取播放地址');
    var html = await this.__page(path);
    if (html === null) throw new Error('热播库：播放页打不开（HTTP 404，剧集可能已下架）');

    var raw = this.__playerData(html);
    if (!raw) {
      throw new Error('热播库：播放页里没有解析出播放数据（站点可能改版，或这一集只提供网页播放）');
    }
    var url = String(raw.url || '');
    if (!url) throw new Error('热播库：播放数据里没有地址（该集可能尚未上线）');
    var encrypt = String(raw.encrypt == null ? '0' : raw.encrypt);
    // 解壳：encrypt=1 是 escape 包裹（unescape 一次）；encrypt=2 是 base64 与 escape
    // 两层，**顺序各站实现不一**（base64 在外 / escape 在外都见过），两种都试，
    // 取第一个解出来像播放地址的。都不像就交给下面的形状校验如实报错。
    if (encrypt === '1') {
      url = this.__unescape(url);
    } else if (encrypt === '2') {
      var first = this.__unescape(this.__base64(url));
      var second = this.__base64(this.__unescape(url));
      var stream = /\.(m3u8|mp4)(\?|#|$)/i;
      if (stream.test(first)) {
        url = first;
      } else if (stream.test(second)) {
        url = second;
      } else {
        url = first.length >= second.length ? first : second;
      }
    }
    url = this.__abs(url);
    if (!/\.(m3u8|mp4)(\?|#|$)/i.test(url)) {
      throw new Error('热播库：这一集的地址不是直连流（' + url.slice(0, 90)
        + '）——本站把它交给了网页播放器，本 App 播不了这种形式');
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'Referer': this.__base() + '/' }
    };
  },

  // ------------------------------------------------------------------ 站点差异

  /// 列表页地址（各站路径不同：/list/、/show/、/s/、/vodshow/）。
  __listPath(category, page) {
    var cat = category || '1';
    return '/s/{cat}-----------{page}---.html'.replace('{cat}', cat).replace('{page}', String(page));
  },

  /// 搜索：站点的联想接口（JSON，返回 list[].name / .pic / .id）。
  ///
  /// 为什么用联想接口而不是搜索页：这类主题的搜索页常挂滑块人机校验，而联想接口是
  /// 站点自己给输入框用的，直连可用；拿到的 id 直接拼详情页地址。
  async __search(keyword, page) {
    var url = this.__base() + '/index.php/ajax/suggest?mid=1&wd='
      + encodeURIComponent(keyword) + '&limit=50';
    var response = await LumeSource.http.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' }
    });
    var status = response ? response.status : 0;
    if (status === 403 || status === 503 || status === 521) {
      throw new Error('NEED_WEBVIEW_VERIFY：热播库 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('热播库：搜索失败（HTTP ' + status + '）');
    var data = null;
    try {
      data = JSON.parse(String((response && response.body) || 'null'));
    } catch (error) {
      data = null;
    }
    var rows = (data && data.list) || [];
    var items = [];
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      if (!row.id) continue;
      var id = '/v/{id}.html'.replace('{id}', String(row.id));
      if (seen[id]) continue;   // 联想接口会吐重复项（同一部片的多个别名）
      seen[id] = true;
      items.push({
        id: id,
        title: this.__plain(row.name || ('影片 ' + row.id)),
        cover: row.pic ? this.__abs(row.pic) : null,
        subtitle: null
      });
    }
    return { items: items, hasMore: false };
  },

  // ------------------------------------------------------------------ 解析内核

  /// 取页面：被人机校验拦下抛 NEED_WEBVIEW_VERIFY，404 返回 null，其余抛可读错误。
  async __page(path) {
    var url = /^https?:\/\//i.test(path)
      ? path
      : this.__base() + (path.charAt(0) === '/' ? path : '/' + path);
    var response = await LumeSource.http.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Referer': this.__base() + '/'
      }
    });
    var status = response ? response.status : 0;
    if (status === 404) return null;
    if (status === 403 || status === 503 || status === 521) {
      throw new Error('NEED_WEBVIEW_VERIFY：热播库 触发了站点人机校验（HTTP ' + status + '）');
    }
    if (status !== 200) throw new Error('热播库：拉取失败（HTTP ' + status + '）：' + url);
    return String(response.body || '');
  },

  /// 当前可用域名：按 HOSTS 顺序试，第一个通的即用，整个会话记住。
  async __pickHost() {
    if (this.__host) return this.__host;
    for (var i = 0; i < HOSTS.length; i++) {
      try {
        var response = await LumeSource.http.get(HOSTS[i] + '/', { headers: { 'User-Agent': UA } });
        var status = response ? response.status : 0;
        // 活着（200），或活着但被校验（403/503/521，后续请求会抛标记让用户过校验）都算可用。
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

  /// 导航 / 分类：**容器范围内**逐条 `a` 取文本 + 从 href 抠分类号。
  ///
  /// 先把容器整块切出来（不按 `<li>` 切：页面里其它列表也有 `<li>`，按 li 切会
  /// 混进导航之外的东西），再在块内全局匹配 a 标签——一个容器里通常有十几条。
  __navPairs(html) {
    var text = String(html || '');
    var block = this.__firstBlock(text, { start: '<ul class="nav', end: '</ul>' });
    if (!block) return [];
    var result = [];
    var seen = {};
    var pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,40}?)<\/a>/gi;
    var matched;
    while ((matched = pattern.exec(block)) !== null) {
      var title = this.__plain(matched[2]);
      var id = (function (href) { var m = /\/(\d+)(?:\.html|\/)/.exec(href); return m ? m[1] : ''; })(matched[1]);
      if (!id || !title || seen[id]) continue;
      seen[id] = true;
      result.push({ id: id, title: title });
    }
    return result;
  },

  /// 切出第一个「开始标记…结束标记」之间的整块（找不到返回空串）。
  __firstBlock(text, spec) {
    var start = new RegExp(spec.start, 'i').exec(text);
    if (!start) return '';
    var tail = text.slice(start.index);
    var end = spec.end ? new RegExp(spec.end, 'i').exec(tail.slice(start[0].length)) : null;
    return end ? tail.slice(0, start[0].length + end.index + end[0].length) : tail;
  },

  /// 列表条目：先找**详情页链接**，再在它后面取一段窗口解析标题 / 封面 / 备注。
  ///
  /// 为什么不是按容器类名切片：四个站就是四套主题（stui / mxpro / content-list），
  /// 类名一变切片就废；而「详情页链接的形状」是苹果CMS 的固定约定（详情页是 /v/<数字>.html），
  /// 从它出发取窗口，标题（a 的 title 属性）、封面（同一条 a 上的 data-original）、
  /// 备注（紧随其后的角标）都在窗口里，四个站共用一套逻辑。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var pattern = /(?:(?:v|detail|voddetail)\/\d+\.html)/gi;
    var matched;
    while ((matched = pattern.exec(text)) !== null) {
      var raw = matched[0];
      var path = this.__path(raw);
      if (!path || seen[path]) continue;
      seen[path] = true;
      // 先把它所在的**那一个 a 标签**整段取出来（从最近的 `<a` 到它的 `>`），
      // 再取标签之后的一段（封面 img 与备注角标各主题有的在标签内、有的紧随其后）。
      // 只从匹配位置往后切窗口是不行的：mxpro 的 class 写在 href **之前**，
      // 那样窗口里第一个 class 命中会落到下一个条目上（实测差点把下一部的标题配上来）。
      var anchorStart = text.lastIndexOf('<a', matched.index);
      var tagEnd = text.indexOf('>', matched.index);
      var tag = anchorStart >= 0 && tagEnd > anchorStart ? text.slice(anchorStart, tagEnd + 1) : '';
      var rest = tagEnd >= 0 ? text.slice(tagEnd + 1) : '';
      var close = rest.indexOf('</a>');
      var inner = close >= 0 ? rest.slice(0, close) : rest.slice(0, 80);
      var after = rest.slice(0, 500);
      var title = this.__text(tag, ['title="([^"]+)"', '<h[34][^>]*>([^<]+)<']) || this.__plain(inner);
      if (!title) continue;
      var cover = this.__attr(tag, ['data-original="([^"]+)"', 'src="([^"]+)"']) || this.__attr(after, ['data-original="([^"]+)"', 'src="([^"]+)"']);
      items.push({
        id: path,
        title: title,
        cover: cover ? this.__abs(cover) : null,
        subtitle: this.__text(tag, ['class="bottom2[^"]*"[^>]*>([^<]+)<']) || this.__text(after, ['class="bottom2[^"]*"[^>]*>([^<]+)<']) || null
      });
    }
    return items;
  },

  /// `player_aaaa = {...}` 取出来并 JSON.parse（页面里是 JS 对象字面量，键带引号）。
  __playerData(html) {
    var text = String(html || '');
    var matched = /player_[A-Za-z0-9_]*\s*=\s*(\{[\s\S]*?\})\s*(?:<\/script>|;)/.exec(text)
      || /player_[A-Za-z0-9_]*\s*=\s*(\{[\s\S]*?\})/.exec(text);
    if (!matched) return null;
    try {
      return JSON.parse(matched[1]);
    } catch (error) {
      return null;
    }
  },

  /// 按「开始标记 + 结束标记」切块（沙箱没有 DOM，正则切片是最稳的做法）。
  __blocks(html, spec) {
    var text = String(html || '');
    var blocks = [];
    var start = new RegExp(spec.start, 'gi');
    var item;
    while ((item = start.exec(text)) !== null) {
      var tail = text.slice(item.index);
      var end = spec.end ? new RegExp(spec.end, 'i').exec(tail.slice(item[0].length)) : null;
      var length = end ? item[0].length + end.index : Math.min(tail.length, 1500);
      blocks.push(tail.slice(0, length));
      if (start.lastIndex === item.index) start.lastIndex++;
    }
    return blocks;
  },

  /// 在片段里找第一个匹配的文本（多套选择器依次试）。
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

  /// 列表 href → 站内路径（可能给的是整条地址）。
  __path(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) {
      var match = /^https?:\/\/[^\/]+(\/[\s\S]*)$/.exec(text);
      return match ? match[1] : text;
    }
    return text.charAt(0) === '/' ? text : '/' + text;
  },

  __abs(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (text.indexOf('//') === 0) return 'http:' + text;
    return this.__base() + (text.charAt(0) === '/' ? text : '/' + text);
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

  /// 自带实现（不依赖宿主有没有 Annex B 的 unescape）：百分号 XX 与 百分号 uXXXX 两种都解。
  ///
  /// 为什么自己写：这类站点的 `player_aaaa.url` 大量用 `escape()` 包裹（encrypt=1/2），
  /// 而沙箱引擎未必提供 `unescape`——依赖它的话，缺失时只会静默返回原文，用户看到的是
  /// 「地址不是直连流」这种误判。自己实现就不受引擎差异影响。
  __unescape(text) {
    var value = String(text == null ? '' : text);
    try {
      return value.replace(/%u([0-9A-Fa-f]{4})|%([0-9A-Fa-f]{2})/g, function (all, u, h) {
        if (u) return String.fromCharCode(parseInt(u, 16));
        return String.fromCharCode(parseInt(h, 16));
      });
    } catch (error) {
      return value;
    }
  },

  /// 纯 JS base64 解码（QuickJS 没有 atob）。
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
