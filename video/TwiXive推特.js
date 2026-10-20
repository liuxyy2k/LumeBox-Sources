// LumeSource: {"id":"twixive_video","name":"TwiXive","version":"1.0.0","category":"video","mirrors":["https://twixive.net"]}
// 站点：https://twixive.net（X/Twitter 视频保存排行；Next.js 服务端渲染）
//
// ## 抓取口径（每条都对着实时页面核过）
//
//   页面   GET /ranking/24h  → 「24時間のX(Twitter)動画保存ランキング」，50 条
//          GET /new          → 「最近保存された新着動画」，50 条
//          （/ranking/week|month|total|72h|168h 实测全是 404；/trend/videos 与 /home
//            的负载结构不同、不是列表，所以分类只有这两个。）
//   数据   **不要解析 DOM**：条目不渲染成卡片，而是内联在 Next.js 的 RSC 负载里：
//            self.__next_f.push([1,"…\"initialData\":{\"kind\":\"day\",\"items\":[
//              {\"video\":{\"id\":\"<数字>\",\"postId\":\"…\",\"url\":\"https://video.twimg.com/…mp4?tag=12\",
//                         \"thumbnail\":\"https://pbs.twimg.com/…jpg\",\"width\":720,\"height\":1140,
//                         \"createdAt\":\"2026-10-18 23:23:48\",
//                         \"author\":{\"id\":\"…\",\"username\":\"…\",\"name\":\"…\",\"avatar\":\"…\"}}}, …]}…"])
//          这一段是**转义过的 JSON**（`\"`），先反转义再按 `{"video":{"id":"` 切块即可，
//          每块到第一个 `}}}` 结束（author 闭合 + video 闭合 + item 闭合）。
//   详情   **没有逐条详情页**（列表项只链到 /user/<handle>）：详情就是列表里那条对象本身，
//          标题用作者名（没有推文正文），副标题是作者 @handle 与时间。
//   播放   `video.url` 就是 **video.twimg.com 的直链 mp4**（实测可直接播放），不需要 Referer。
//          推特的 mp4 是长期可用的静态地址（不是签名链），但仍每次从列表重新取，避免用旧 id。
//
// ## 纪律
// 1. base() 优先用宿主注入的域名（换镜像 / 手填域名立刻生效）。
// 2. 列表负载里同时有 50 条 mp4，解析要**只认 `{"video":{` 结构**，别把别的 JSON 段当条目。
// 3. 详情/播放按 id 在「24h 排行 → 最新」两个列表里找；找不到如实报错。

var DEFAULT_BASE = 'https://twixive.net';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 120;
var CACHE_KEY = 'twixive/list-cache';
var CACHE_TTL_MS = 5 * 60 * 1000;   // 列表缓存 5 分钟（详情/播放要按 id 回查）

function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'twixive_video',
  name: 'TwiXive',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://twixive.net'],

  async home() {
    var page = await this.list({ categoryId: 'ranking', page: 1 });
    if (!page.items.length) throw new Error('TwiXive：首页没认出条目（站点可能改版）');
    return [{ title: '24小时排行', items: page.items.slice(0, 18) }];
  },

  async categories() {
    return [
      { id: 'ranking', title: '24小时排行' },
      { id: 'new', title: '最新保存' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      // 站点没有搜索（没有搜索框、也没有 /search 路由），如实拒绝。
      throw new Error('TwiXive：本站没有搜索功能，请用排行/最新两个列表浏览');
    }
    var category = String(args.categoryId == null ? '' : args.categoryId) || 'ranking';
    var path = category === 'new' ? '/new' : '/ranking/24h';
    var items = await this.__load(path);
    return { items: items.slice(0, MAX_ITEMS), hasMore: false };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var item = await this.__find(id);
    return {
      id: id,
      title: item.title,
      cover: item.cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: item.subtitle,
      description: item.description
    };
  },

  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var item = await this.__find(id);
    if (!item.url) {
      throw new Error('TwiXive：这条没有视频直链（' + id + '）——可能已被删除');
    }
    return {
      kind: 'video',
      url: item.url,
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    };
  },

  // ---------------------------------------------------------------- 数据

  /// 取一页并解析成条目；带 5 分钟 fs 缓存（详情/播放按 id 回查要用）。
  async __load(path) {
    try {
      var raw = await LumeSource.fs.readText(CACHE_KEY + ':' + path);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.at && (new Date().getTime() - cached.at) < CACHE_TTL_MS) {
          return cached.items || [];
        }
      }
    } catch (error) { /* 没缓存就现取 */ }
    var html = await this.__get(path);
    var items = this.__parse(html);
    if (!items.length) {
      throw new Error('TwiXive：页面里没解析出视频（' + path + '，' + html.length + ' 字符）——站点可能改版');
    }
    try {
      await LumeSource.fs.writeText(CACHE_KEY + ':' + path, JSON.stringify({
        at: new Date().getTime(),
        items: items
      }));
    } catch (error) { /* 存不下也能用 */ }
    return items;
  },

  /// 按 id 在两个列表里找（排行 → 最新）。
  async __find(id) {
    var paths = ['/ranking/24h', '/new'];
    for (var i = 0; i < paths.length; i++) {
      var items = await this.__load(paths[i]);
      for (var k = 0; k < items.length; k++) {
        if (items[k].id === id) return items[k];
      }
    }
    throw new Error('TwiXive：列表里已经没有这条了（' + id + '）——排行每 24 小时会换一批');
  },

  /// 解析 RSC 负载：`{"video":{"id":"…", … "author":{…}}}` 一条一块。
  __parse(html) {
    var un = String(html || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    var at = un.indexOf('"initialData"');
    if (at < 0) return [];
    // 只在 initialData 之后找，避免把站点其它 JSON 段当条目。
    var scope = un.slice(at);
    var parts = scope.split('{"video":{"id":"');
    var items = [];
    var seen = {};
    for (var i = 1; i < parts.length && items.length < MAX_ITEMS; i++) {
      var block = parts[i];
      var end = block.indexOf('}}}');
      if (end > 0) block = block.slice(0, end);
      var idMatch = /^(\d+)/.exec(block);
      if (!idMatch) continue;
      var id = idMatch[1];
      if (seen[id]) continue;
      var url = this.__field(block, 'url');
      if (!url || url.indexOf('video.twimg.com') < 0) continue;
      var cover = this.__field(block, 'thumbnail');
      var created = this.__field(block, 'createdAt');
      var name = this.__field(block, 'name');
      var username = this.__field(block, 'username');
      var title = name || (username ? '@' + username : '推特视频 ' + id);
      var subtitle = [];
      if (username && name) subtitle.push('@' + username);
      if (created) subtitle.push(created);
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: cover,
        coverHeaders: { 'Referer': base() + '/' },
        subtitle: subtitle.join(' · '),
        description: '',
        url: url
      });
    }
    return items;
  },

  __field(block, name) {
    var m = new RegExp('"' + name + '":"([^"]*)"').exec(block);
    return m ? this.__entity(m[1]) : '';
  },

  // ---------------------------------------------------------------- 网络

  async __get(path) {
    var url = /^https?:/i.test(path) ? path : base() + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 521 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：TwiXive 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：TwiXive 需要网页验证（' + url + '）');
    }
    return body;
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

  __clean(text) {
    return this.__entity(String(text == null ? '' : text).replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ').trim();
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /(\d{6,})/.exec(raw);
    if (m) return m[1];
    throw new Error('TwiXive：缺少视频 ID');
  }
};
