// LumeSource: {"id":"yasetube_video","name":"亚色影库","version":"1.0.0","category":"video","mirrors":["https://www.yasetube.com"]}
// 站点：https://www.yasetube.com（亚色影库 - 偷拍自拍网；WordPress + RetroTube 主题）
//
// ## 抓取口径（每条都对着实时页面核过）
//
//   列表   GET /?filter=<latest|longest|most-viewed|popular>   30 条/页
//          GET /page/<N>?filter=<同上>                       第 N 页（站点自己的分页锚点）
//          卡片 `article.loop-video`（带 data-post-id / data-main-thumb）：
//            `a[href=/video/<slug>][title=<标题>]`、封面 `img`（图床 img.<域>）、
//            时长在 `span.duration`（有就取，没有留空）。
//   分类   GET /categories  站点自己的分类页（每类一个 /category/<slug>/）；另外四个
//          `?filter=` 排序就是站点的排序 tab，也作为分类给出。
//   搜索   GET /?s=<关键词>  （WordPress 原生搜索，结果页与列表同一套卡片）
//   详情   GET /video/<slug>
//          标题 `og:title` / `<title>`；封面 `og:image`；简介 `og:description`。
//   播放   站点用「clean-tube-player」插件：页面里只有一个 iframe
//            /wp-content/plugins/clean-tube-player/public/player-x.php?q=<base64>
//          base64 解出来是一段 HTML：`<video … poster="…"><source src="https://<图床>/mp4/…/xxx.mp4">`。
//          所以正文 = 解 base64 → 取 `<source src>`；有的条目页面里还会直接给 mp4
//          （下载按钮），两种都收，优先 iframe 里的 source。
//
// ## 纪律
// 1. base() 优先用宿主注入的域名（换镜像 / 手填域名立刻生效）。
// 2. 条目只认 `/video/`（页面里混着分类/标签/插件的链接）。
// 3. 播放地址是签名/临时 CDN 直链，**不缓存**：每次打开正文都重新取详情页。

var DEFAULT_BASE = 'https://www.yasetube.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var PAGE_SIZE = 30;
var MAX_ITEMS = 120;
var ITEM_WINDOW = 2600;

/// 站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'yasetube_video',
  name: '亚色影库',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://www.yasetube.com'],

  async home() {
    var page = await this.list({ categoryId: 'latest', page: 1 });
    if (!page.items.length) throw new Error('亚色影库：首页没认出条目（站点可能改版）');
    return [{ title: '最新更新', items: page.items.slice(0, 18) }];
  },

  /// 分类＝站点自己的四个排序 tab + /categories 页里的分类目录。
  /// 排序 tab 的 id 用 `filter:<名>`，分类目录的 id 用 `cat:<路径>`。
  async categories() {
    var list = [
      { id: 'filter:latest', title: '最新' },
      { id: 'filter:popular', title: '热门' },
      { id: 'filter:most-viewed', title: '最多播放' },
      { id: 'filter:longest', title: '最长' }
    ];
    try {
      var html = await this.__get('/categories');
      // 分类页是卡片列表：`<a href="…/video/category/<slug>" title="分类名">`
      // （不是 `/category/<slug>`；带 `?filter=` 的是该分类下的排序链接，跳过）。
      var re = /href="([^"]*\/video\/category\/[^"?#\/]+)"[^>]*title="([^"]+)"/g;
      var seen = {};
      var m;
      while ((m = re.exec(html)) !== null) {
        var path = m[1].replace(/^https?:\/\/[^\/]+/i, '').replace(/\/+$/, '');
        var title = this.__entity(m[2]);
        if (!title || seen[path]) continue;
        seen[path] = true;
        list.push({ id: 'cat:' + path, title: title });
        if (list.length > 120) break;
      }
    } catch (error) {
      console.warn('[yasetube] 分类页没取到：' + error);
    }
    return list;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var category = String(args.categoryId == null ? '' : args.categoryId) || 'filter:latest';
    var path;
    if (keyword) {
      path = '/page/' + page + '/?s=' + encodeURIComponent(keyword);
      if (page === 1) path = '/?s=' + encodeURIComponent(keyword);
    } else if (category.indexOf('cat:') === 0) {
      var catPath = category.slice(4);
      path = page > 1 ? catPath.replace(/\/$/, '') + '/page/' + page + '/' : catPath;
    } else {
      var filter = category.indexOf('filter:') === 0 ? category.slice(7) : 'latest';
      path = page > 1 ? '/page/' + page + '/?filter=' + encodeURIComponent(filter)
        : '/?filter=' + encodeURIComponent(filter);
    }
    var html = await this.__get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[yasetube] 没认出条目：' + path + '（' + html.length + ' 字符）');
    return { items: items.slice(0, MAX_ITEMS), hasMore: this.__hasMore(html, page, items.length) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get(id);
    var title = this.__meta(html, 'og:title') || this.__titleTag(html);
    if (!title) throw new Error('亚色影库：详情页没认出标题（' + id + '）');
    var cover = this.__abs(this.__meta(html, 'og:image'));
    var description = this.__meta(html, 'og:description');
    var duration = this.__duration(html);
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: duration ? '时长 ' + duration : '',
      description: description
    };
  },

  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var html = await this.__get(id);
    var url = this.__media(html);
    if (!url) {
      throw new Error('亚色影库：详情页里没解出播放地址（' + id
        + '）——站点可能改版，或该视频需要登录/VIP');
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    };
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
        throw new Error('NEED_WEBVIEW_VERIFY：亚色影库 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：亚色影库 需要网页验证（' + url + '）');
    }
    return body;
  },

  __abs(value) {
    var url = this.__clean(String(value || ''));
    if (!url) return '';
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (/^https?:\/\//i.test(url)) return url;
    return base() + (url.charAt(0) === '/' ? '' : '/') + url;
  },

  // ---------------------------------------------------------------- 解析

  __attr(tagHtml, name) {
    var m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')
      .exec(String(tagHtml || ''));
    if (!m) return '';
    var v = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    return this.__clean(v || '');
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

  __titleTag(html) {
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
    return m ? this.__clean(m[1]).replace(/\s*[-–|]\s*亚色影库.*$/i, '').trim() : '';
  },

  __meta(html, property) {
    var text = String(html || '');
    var esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp('<meta[^>]+(?:property|name)="' + esc + '"[^>]*content="([^"]*)"', 'i').exec(text)
      || new RegExp('<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="' + esc + '"', 'i').exec(text);
    return m ? this.__clean(m[1]) : '';
  },

  __duration(html) {
    var m = /class="[^"]*duration[^"]*"[^>]*>([^<]{1,16})</i.exec(String(html || ''));
    return m ? this.__clean(m[1]) : '';
  },

  /// 卡片：`article.loop-video`（WordPress post），只认 `/video/<slug>`。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var index = 0;
    while (index < text.length && items.length < MAX_ITEMS) {
      var at = text.indexOf('loop-video', index);
      if (at < 0) break;
      index = at + 10;
      var win = text.slice(at, at + ITEM_WINDOW);
      var anchor = /href="([^"]*\/video\/[^"?#]+)"/i.exec(win);
      if (!anchor) continue;
      var href = this.__abs(anchor[1]);
      var path = href.replace(/^https?:\/\/[^\/]+/i, '').replace(/\/+$/, '');
      if (seen[path]) continue;
      var title = '';
      var titleAttr = /<a[^>]+href="[^"]*\/video\/[^"]*"[^>]*title="([^"]+)"/i.exec(win);
      if (titleAttr) title = this.__entity(titleAttr[1]);
      if (!title) {
        var h3 = /<h\d[^>]*>\s*<a[^>]*>([\s\S]{0,200}?)<\/a>/i.exec(win);
        if (h3) title = this.__clean(h3[1]);
      }
      if (!title) continue;
      var cover = '';
      var img = /<img[^>]+(?:class="[^"]*video-main-thumb[^"]*"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="[^"]*video-main-thumb)/i.exec(win);
      if (img) cover = this.__abs(img[1] || img[2] || '');
      if (!cover) {
        var anyImg = /<img[^>]+src="([^"]+)"/i.exec(win);
        if (anyImg) cover = this.__abs(anyImg[1]);
      }
      var duration = '';
      var dur = /class="[^"]*duration[^"]*"[^>]*>([^<]{1,16})</i.exec(win);
      if (dur) duration = this.__clean(dur[1]);
      seen[path] = true;
      items.push({
        id: path,
        title: title,
        cover: cover,
        coverHeaders: { 'Referer': base() + '/' },
        subtitle: '',
        duration: duration
      });
    }
    return items;
  },

  __hasMore(html, page, count) {
    var text = String(html || '');
    // WordPress 分页器：`/page/<N+1>/` 出现就是还有下一页。
    if (text.indexOf('/page/' + (page + 1) + '/') >= 0) return true;
    if (text.indexOf('/page/' + (page + 1) + '?') >= 0) return true;
    return count >= PAGE_SIZE;
  },

  /// 播放地址：clean-tube-player 的 iframe base64 → `<source src>`。
  __media(html) {
    var text = String(html || '');
    var iframe = /player-x\.php\?q=([A-Za-z0-9+/=%]+)/i.exec(text);
    if (iframe) {
      var raw = iframe[1];
      try { raw = decodeURIComponent(raw); } catch (error) { /* 原样试 */ }
      var decoded = '';
      try { decoded = this.__b64(raw); } catch (error) { decoded = ''; }
      if (decoded) {
        var src = /<source[^>]+src=['"]([^'"]+)['"]/i.exec(decoded);
        if (src) return this.__abs(src[1]);
        var anyMp4 = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i.exec(decoded);
        if (anyMp4) return anyMp4[1];
      }
    }
    // 兜底：页面里直接给的 mp4（下载按钮那种），排除预告片（preview.mp4）。
    var matches = text.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi) || [];
    for (var i = 0; i < matches.length; i++) {
      if (!/preview\.mp4|trailer/i.test(matches[i])) return matches[i];
    }
    return '';
  },

  /// base64 → UTF-8 字符串（沙箱没有 atob）。
  __b64(input) {
    var T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var s = String(input).replace(/[^A-Za-z0-9+\/=]/g, '');
    var bytes = [];
    var bits = 0, buf = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '=') break;
      var v = T.indexOf(c);
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buf >>> bits) & 255); }
    }
    var out = '', k = 0;
    while (k < bytes.length) {
      var b = bytes[k++];
      if (b < 128) out += String.fromCharCode(b);
      else if (b < 224) out += String.fromCharCode(((b & 31) << 6) | (bytes[k++] & 63));
      else if (b < 240) out += String.fromCharCode(((b & 15) << 12) | ((bytes[k++] & 63) << 6) | (bytes[k++] & 63));
      else { k += 3; out += '\uFFFD'; }
    }
    return out;
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/video\/([^\/\s"'?#]+)/.exec(raw);
    if (m) return '/video/' + m[1];
    if (raw.indexOf('/video/') === 0) return raw.replace(/\/+$/, '');
    if (/^[A-Za-z0-9%._-]+$/.test(raw)) return '/video/' + raw;
    throw new Error('亚色影库：缺少视频路径');
  }
};
