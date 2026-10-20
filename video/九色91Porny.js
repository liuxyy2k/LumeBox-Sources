// LumeSource: {"id":"jiuse91_video","name":"九色91Porny","version":"1.0.0","category":"video","mirrors":["https://91porny.com","https://www.91porny.com"]}
// 站点：https://91porny.com（九色 / 91PORNY；服务端渲染的 Bootstrap 站，桌面/移动同一套标记）
//
// ## 抓取口径（每条都对着实时页面核过）
//
//   列表   GET /video/list?page=<N>   24 条/页（`/video/category/latest/<N>` 是站点
//          分页器自己写的**规范地址**，两种写法同内容）。翻页是**查询串** page=N。
//          `?type=` 在 SSR 层被忽略（实测 hot / japan / west / c0… 全部返回同一批），
//          所以分类不能靠它。
//   分类   GET /tags：全站热搜标签墙（169 页、每页约 490 个标签），每个标签就是一条
//          `GET /search?keywords=<标签>` 搜索。本源把「最近更新」＋热搜前 60 个标签
//          作为分类，这就是站点自己的筛选入口（站点没有别的分类体系）。
//   搜索   GET /search?keywords=<词>&page=<N>   24 条/页，分页同样是查询串。
//   条目   `div.video-elem`：封面在 `div.img` 的 style 里
//          （`background-image: url('//int.ucloud165.xyz/thumb/<id>.jpg')`，协议相对），
//          时长 `small.layer`，标题 `a.title`，作者 `作者: <a>`，播放数在
//          `… 次播放` 那段文字里。**首页/列表里混着广告位**：广告条目的 href 是外链
//          （`*.html?cid=` / 裸 IP:端口），只认 `href="/video/view/<id>"` 才能滤掉。
//   详情   GET /video/view/<id>：`og:title` / `og:image(:secure_url)` / `og:description`；
//          播放地址是页面里的 `<id>.m3u8`（带 `?t=&m=` 签名，**不需要 Referer**，
//          实测不带 Referer 也是 200 + `#EXTM3U`）。
//   播放   m3u8（HLS）。签名会过期，所以**每次打开正文都重新取详情页**，不缓存直链。
//
// ## 纪律
// 1. `base()` 优先用宿主注入的域名（换镜像 / 手填域名立刻生效）；站内绝对地址
//    （og:image 是 http 绝对地址、封面是协议相对地址）一律按 base() 归一。
// 2. 本沙箱没有 DOM，全部解析走正则 + 窗口；`all`/`text` 这类遍历**不用递归**
//    （沙箱的 JS 调用栈很浅，深页面会直接栈溢出）。
// 3. 25 秒内要返回：分类只取 /tags 的第一页，不翻 169 页。

var DEFAULT_BASE = 'https://91porny.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var PAGE_SIZE = 24;        // 列表/搜索每页条数（实测）
var MAX_ITEMS = 120;       // 单次列表最多产出
var MAX_TAGS = 60;         // 分类里最多带多少个热搜标签
var ITEM_WINDOW = 1600;    // 解析单条时往后看的窗口

/// 站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'jiuse91_video',
  name: '九色91Porny',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://91porny.com', 'https://www.91porny.com'],

  /// 首页：最近更新一屏。
  async home() {
    var html = await this.__get('/video/list?page=1');
    var items = this.__items(html);
    if (!items.length) throw new Error('九色91Porny：首页没认出条目（站点可能改版）');
    return [{ title: '最近更新', items: items.slice(0, 18) }];
  },

  /// 分类＝「最近更新」＋ 站点的热搜标签（/tags 第一页）。
  /// 标签分类的 id 用 `tag:<关键词>`，请求时落到 /search。
  async categories() {
    var list = [{ id: 'latest', title: '最近更新' }];
    try {
      var html = await this.__get('/tags');
      var tags = this.__tags(html);
      for (var i = 0; i < tags.length && list.length <= MAX_TAGS; i++) {
        list.push({ id: 'tag:' + tags[i], title: '#' + tags[i] });
      }
    } catch (error) {
      // 热搜标签墙挂了不该让整页变空：退回只有「最近更新」。
      console.warn('[91porny] 热搜标签没取到：' + error);
    }
    return list;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var category = String(args.categoryId == null ? '' : args.categoryId);
    var path;
    if (keyword) {
      path = '/search?keywords=' + encodeURIComponent(keyword) + '&page=' + page;
    } else if (category.indexOf('tag:') === 0) {
      path = '/search?keywords=' + encodeURIComponent(category.slice(4))
        + '&page=' + page;
    } else {
      path = '/video/list?page=' + page;
    }
    var html = await this.__get(path);
    var items = this.__items(html);
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    if (!items.length) console.warn('[91porny] 没认出条目：' + path + '（' + html.length + ' 字符）');
    return { items: items, hasMore: this.__hasMore(html, page, keyword || category) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/video/view/' + id);
    var title = this.__meta(html, 'og:title') || this.__clean(this.__titleTag(html));
    if (!title) throw new Error('九色91Porny：详情页没认出标题（id=' + id + '）');
    var cover = this.__abs(this.__meta(html, 'og:image:secure_url') || this.__meta(html, 'og:image'));
    var author = this.__author(html);
    var description = this.__meta(html, 'og:description');
    var duration = this.__duration(html);
    var subtitle = '';
    if (author) subtitle = '作者：' + author;
    if (duration) subtitle += (subtitle ? ' · ' : '') + duration;
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: subtitle,
      description: description && description !== title ? description : ''
    };
  },

  /// 单视频没有分话：给一条「播放」，播放器拿它当入口。
  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var url = '/video/view/' + id;
    var html = await this.__get(url);
    // 签名直链每次重新取（页面里的 m3u8 带 t/m 参数，过期就不给播）。
    var match = /(https?:\/\/[^"'\s]+?\.m3u8[^"'\s<]*)/.exec(html);
    if (!match) {
      throw new Error('九色91Porny：详情页里没有 m3u8（' + url
        + '，' + html.length + ' 字符）——站点可能改版，或该视频需要登录');
    }
    var media = this.__entity(match[1]).replace(/&amp;/g, '&');
    return {
      kind: 'video',
      url: media,
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    };
  },

  // ---------------------------------------------------------------- 网络

  /// 唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path) {
    var url = /^https?:/i.test(path) ? this.__abs(path) : base() + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 521 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：九色91Porny 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：九色91Porny 需要网页验证（' + url + '）');
    }
    return body;
  },

  /// 站内地址按 base() 归一；协议相对（//xxx）补 https；站外地址原样保留。
  __abs(value) {
    var url = this.__entity(String(value || '')).trim();
    if (!url) return '';
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (/^https?:\/\//i.test(url)) {
      var m = /^https?:\/\/([^\/]+)([\s\S]*)$/i.exec(url);
      if (m && this.__isSiteHost(m[1])) return base() + m[2];
      // og:image 之类的 http 绝对地址（图床）：统一升 https，避免 iOS 明文拦截。
      return url.replace(/^http:/i, 'https:');
    }
    return base() + (url.charAt(0) === '/' ? '' : '/') + url;
  },

  __isSiteHost(host) {
    var h = String(host || '').toLowerCase().replace(/^www\./, '');
    if (h === '91porny.com') return true;
    var m = /^https?:\/\/([^\/]+)/i.exec(base());
    return !!m && m[1].toLowerCase().replace(/^www\./, '') === h;
  },

  // ---------------------------------------------------------------- 解析

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

  __titleTag(html) {
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
    return m ? m[1] : '';
  },

  __meta(html, property) {
    var text = String(html || '');
    var re = new RegExp('<meta[^>]+(?:property|name)="' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '"[^>]*content="([^"]*)"', 'i');
    var m = re.exec(text);
    if (m) return this.__entity(m[1]).trim();
    var re2 = new RegExp('<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="'
      + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'i');
    var m2 = re2.exec(text);
    return m2 ? this.__entity(m2[1]).trim() : '';
  },

  /// 条目：`div.video-elem`，只认站内 `/video/view/<id>`（广告位是外链，直接跳过）。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var index = 0;
    while (index < text.length && items.length < MAX_ITEMS) {
      var at = text.indexOf('video-elem', index);
      if (at < 0) break;
      index = at + 10;
      var win = text.slice(at, at + ITEM_WINDOW);
      var anchor = /href="(\/video\/view\/[^"\s]+)"/.exec(win);
      if (!anchor) continue;
      var id = anchor[1].replace(/^\/video\/view\//, '').replace(/\/+$/, '');
      if (!id || seen[id]) continue;
      var title = '';
      var titleTag = /class="title[^"]*"[^>]*>([\s\S]{0,200}?)<\/a>/i.exec(win);
      if (titleTag) title = this.__clean(titleTag[1]);
      if (!title) {
        var og = /<img[^>]+alt="([^"]{1,120})"/i.exec(win);
        if (og) title = this.__entity(og[1]);
      }
      if (!title) continue;
      var cover = '';
      var bg = /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(win);
      if (bg) cover = this.__abs(bg[1]);
      var duration = '';
      var layer = /<small[^>]*class="[^"]*layer[^"]*"[^>]*>([\s\S]{0,20}?)<\/small>/i.exec(win);
      if (layer) duration = this.__clean(layer[1]);
      var author = /作者[:：]\s*<a[^>]*>([\s\S]{0,40}?)<\/a>/i.exec(win);
      var views = /([\d.]+\s*[万wW]?\s*次播放)/.exec(win);
      var subtitle = [];
      if (author) subtitle.push(this.__clean(author[1]));
      if (views) subtitle.push(views[1].replace(/\s+/g, ''));
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: cover,
        coverHeaders: { 'Referer': base() + '/' },
        subtitle: subtitle.join(' · '),
        description: duration
      });
    }
    return items;
  },

  /// 热搜标签：/tags 里每个标签都是 `/search?keywords=<词>` 链接。
  /// 锚点里面包的是 `<button class="btn btn-outline-danger …">标签</button>`，
  /// 所以标签文字要从 button 里取，不能直接读 `<a>` 的文本节点。
  __tags(html) {
    var text = String(html || '');
    var tags = [];
    var seen = {};
    var re = /href="\/search\?keywords=([^"&]+)"[^>]*>([\s\S]{0,260}?)<\/a>/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var kw = this.__entity(decodeURIComponent(this.__entity(m[1]))).trim();
      var labelTag = />([^<>]{1,24})</.exec(m[2]);
      var label = labelTag ? this.__clean(labelTag[1]) : '';
      if (!kw || kw.length > 24) continue;
      if (!label) label = kw;
      if (seen[kw]) continue;
      seen[kw] = true;
      tags.push(kw);
      if (tags.length >= MAX_TAGS) break;
    }
    return tags;
  },

  __author(html) {
    var text = String(html || '');
    // 只认详情页头部那段「作者：<a>」；评论区的「作者留言：xxx」是用户留言，不当作者。
    var head = text.slice(0, Math.min(text.length, 60000));
    var m = /作者[:：]\s*(?:<a[^>]*>)?\s*([^<\s]{1,32})/.exec(head);
    return m ? this.__clean(m[1]) : '';
  },

  __duration(html) {
    var m = /<small[^>]*class="[^"]*layer[^"]*"[^>]*>([\s\S]{0,20}?)<\/small>/i.exec(String(html || ''));
    return m ? this.__clean(m[1]) : '';
  },

  /// 还有下一页吗：站点分页器里出现第 page+1 页就继续。
  /// 列表写 `/video/category/latest/<N>`，搜索写 `page=<N>`——两种都要认。
  __hasMore(html, page, mode) {
    var text = String(html || '');
    var at = text.indexOf('class="pagination"');
    var block = at >= 0 ? text.slice(at, at + 2000) : text;
    var next = page + 1;
    if (block.indexOf('page=' + next) >= 0) return true;
    if (block.indexOf('/latest/' + next) >= 0) return true;
    if (at >= 0) return false;
    return this.__items(text).length >= PAGE_SIZE;
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/video\/view\/([^\/\s"'?#]+)/.exec(raw);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
    throw new Error('九色91Porny：缺少视频 ID');
  }
};
