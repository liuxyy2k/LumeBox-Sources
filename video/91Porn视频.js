// LumeSource: {"id":"porn91_video","name":"91Porn","version":"1.0.0","category":"video","mirrors":["https://91porn.com","https://www.91porn.com"]}
// 站点：https://91porn.com（91porn 原站；服务端渲染的老式 PHP 站）
//
// ## 抓取口径（每条都对着实时页面核过）
//
//   列表   GET /v.php?category=<code>&viewtype=basic&page=<N>   24 条/页
//          条目容器 `div.well.well-sm.videos-text-align`：
//            `a[href=view_video.php?viewkey=<key>…]` 是作品地址（id 就是 viewkey），
//            封面 `img.img-responsive[src=https://<cdn>/thumb/<id>.jpg]`、
//            时长 `span.duration`、标题 `span.video-title`、
//            上传者 `From:</span> NAME`、播放数 `Views:</span> N`。
//          标题里的实体是**双重编码**的（`&amp;#39;` = 一个单引号），要解两遍。
//          翻页判据：页面里写着「Videos 1 - 24 of 13326」，末条 < 总数就还有下一页。
//   分类   站点导航不暴露分类 tab，但 `category=` 的排序码是可用的（逐个实测）：
//          rf 最近加精（total 1.3 万）/ tf 收藏最多 / md 讨论最多 / top 评分最高 /
//          hot 今日最热（60）/ long 长视频（实测时长 11~30 分钟）。
//          另有 rw / mf / uv 三个码实测都回落到全站总数（147942），不是分类，没有收。
//   搜索   GET /search_result.php?viewtype=basic&page=1&search_type=&search_id=<词>&search_key=&min_duration=
//          **搜索只有第 1 页**：带 page=2 与各种 search_type 组合实测都返回同一批
//          （首条 viewkey 相同），站点自己的分页器也不存在。所以搜索的 hasMore 恒为 false，
//          脚本不去猜一个可能无效的分页地址。
//   详情   GET /view_video.php?viewkey=<key>
//          标题在 `<title>… - 91porn</title>`（同样双重编码实体）；
//          封面是播放器上的 `poster="https://<cdn>/thumb/<id>.jpg"`；
//          「Runtime / Views / Comments」在播放器后面的 `#useraction .boxPart`。
//   播放   站点不在 HTML 里直接写地址，而是
//            `document.write(strencode2("<百分号编码的 <source src='…mp4?st=&e=&f='>"))`
//          `strencode2` 的定义就是 `unescape`（/js/m2.js 里逐字核过），所以
//          **解一次百分号编码 → 取 `<source src='…'>`** 就是带签名的 mp4 直链。
//          实测该 mp4 带不带 Referer 都回 206；签名带过期时间（e=），所以每次播放都重新取详情。
//
// ## 纪律
// 1. base() 优先用宿主注入的域名（换镜像 / 手填域名立刻生效），站内相对地址按 base() 补全。
// 2. 列表里混着广告位（外链 gif/裸 IP），只认 `view_video.php?viewkey=`。
// 3. 标题与视频地址都在站点自己的编码里，解不干净就报错，不把带实体的半成品交给阅读器。

var DEFAULT_BASE = 'https://91porn.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var PAGE_SIZE = 24;        // 列表每页条数（实测）
var MAX_ITEMS = 120;
var ITEM_WINDOW = 2000;    // 解析单条时往后看的窗口

/// 站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'porn91_video',
  name: '91Porn',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://91porn.com', 'https://www.91porn.com'],

  /// 首页：最近加精一屏。
  async home() {
    var page = await this.list({ categoryId: 'rf', page: 1 });
    if (!page.items.length) throw new Error('91Porn：首页没认出条目（站点可能改版）');
    return [{ title: '最近加精', items: page.items.slice(0, 18) }];
  },

  /// 分类＝站点可用的排序码（导航里没有 tab，码是逐个数出来的）。
  async categories() {
    return [
      { id: 'rf', title: '最近加精' },
      { id: 'hot', title: '今日最热' },
      { id: 'top', title: '评分最高' },
      { id: 'tf', title: '收藏最多' },
      { id: 'md', title: '讨论最多' },
      { id: 'long', title: '长视频' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var category = String(args.categoryId == null ? '' : args.categoryId) || 'rf';
    var path;
    if (keyword) {
      path = '/search_result.php?viewtype=basic&page=1&search_type=&search_id='
        + encodeURIComponent(keyword) + '&search_key=&min_duration=';
    } else {
      path = '/v.php?category=' + encodeURIComponent(category) + '&viewtype=basic&page=' + page;
    }
    var html = await this.__get(path);
    var items = this.__items(html);
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    if (!items.length) console.warn('[91porn] 没认出条目：' + path + '（' + html.length + ' 字符）');
    return {
      items: items,
      // 搜索页只有第 1 页（实测），所以搜索一律没有下一页。
      hasMore: keyword ? false : this.__hasMore(html, items.length)
    };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/view_video.php?viewkey=' + encodeURIComponent(id));
    var title = this.__detailTitle(html);
    if (!title) throw new Error('91Porn：详情页没认出标题（viewkey=' + id + '）');
    var cover = this.__poster(html);
    var info = this.__info(html);
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: info.subtitle,
      description: info.description
    };
  },

  /// 单视频没有分话：给一条「播放」入口。
  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var path = '/view_video.php?viewkey=' + encodeURIComponent(id);
    var html = await this.__get(path);
    var url = this.__media(html);
    if (!url) {
      throw new Error('91Porn：详情页里没解出播放地址（' + path
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
        throw new Error('NEED_WEBVIEW_VERIFY：91Porn 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：91Porn 需要网页验证（' + url + '）');
    }
    return body;
  },

  // ---------------------------------------------------------------- 解析

  __attr(tagHtml, name) {
    var m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')
      .exec(String(tagHtml || ''));
    if (!m) return '';
    var v = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    return this.__clean(v || '');
  },

  /// 站点把实体编码了两遍（`&amp;#39;` = `'`），所以解两次。
  __clean(text) {
    var value = String(text == null ? '' : text);
    for (var pass = 0; pass < 2; pass++) {
      value = value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi, function (v) {
          var map = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
          if (map[v]) return map[v];
          var code = v.charAt(2) === 'x' || v.charAt(2) === 'X'
            ? parseInt(v.slice(3), 16) : parseInt(v.slice(2), 10);
          return isFinite(code) && code > 0 ? String.fromCharCode(code) : v;
        });
    }
    return value.replace(/\s+/g, ' ').trim();
  },

  /// 条目：按站点自己的卡片容器切块，只认 `/view_video.php?viewkey=`。
  __items(html) {
    var text = String(html || '');
    var items = [];
    var seen = {};
    var index = 0;
    while (index < text.length && items.length < MAX_ITEMS) {
      // 列表页卡片是 `well well-sm videos-text-align`，搜索页是 `well well-sm`
      // （少了 videos-text-align）——按两者共有的 `well well-sm` 切块，两页通吃。
      var at = text.indexOf('well well-sm', index);
      if (at < 0) break;
      index = at + 12;
      var win = text.slice(at, at + ITEM_WINDOW);
      var key = /view_video\.php\?viewkey=([0-9A-Za-z]+)/.exec(win);
      if (!key) continue;
      var id = key[1];
      if (seen[id]) continue;
      var title = '';
      var titleTag = /class="video-title[^"]*"[^>]*>([\s\S]{0,400}?)<\/span>/i.exec(win);
      if (titleTag) title = this.__clean(titleTag[1]);
      if (!title) continue;
      var img = /<img[^>]+class="[^"]*img-responsive[^"]*"[^>]*>/i.exec(win);
      var cover = '';
      if (img) {
        var src = this.__attr(img[0], 'src');
        if (src && !/\.gif$|blank|nocover|spacer/i.test(src)) {
          cover = src.indexOf('//') === 0 ? 'https:' + src : src;
        }
      }
      var duration = '';
      var dur = /class="duration"[^>]*>([^<]{1,12})</i.exec(win);
      if (dur) duration = this.__clean(dur[1]);
      var views = '';
      var vm = /Views:<\/span>\s*([\d,]+)/i.exec(win);
      if (vm) views = vm[1].replace(/,/g, '');
      var from = '';
      var fm = /From:<\/span>\s*([^<]{1,40})</i.exec(win);
      if (fm) from = this.__clean(fm[1]);
      var subtitle = [];
      if (from) subtitle.push(from);
      if (views) subtitle.push(this.__views(Number(views)) + '次播放');
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: cover,
        coverHeaders: { 'Referer': base() + '/' },
        subtitle: subtitle.join(' · '),
        duration: duration
      });
    }
    return items;
  },

  __views(count) {
    if (!(count > 0)) return '0';
    if (count >= 10000) return (count / 10000).toFixed(1) + '万';
    return String(count);
  },

  /// 还有下一页吗：页面写着「Videos 1 - 24 of 13326」，末条 < 总数就是还有。
  __hasMore(html, count) {
    var m = /Videos\s+\d+\s*-\s*(\d+)\s+of\s+(\d+)/i.exec(String(html || ''));
    if (m) return Number(m[1]) < Number(m[2]);
    return count >= PAGE_SIZE;
  },

  __detailTitle(html) {
    var text = String(html || '');
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    if (!m) return '';
    var title = this.__clean(m[1]).replace(/\s*-\s*91porn\s*$/i, '').trim();
    return title;
  },

  __poster(html) {
    var m = /<video\b[^>]*>/i.exec(String(html || ''));
    if (!m) return '';
    var poster = this.__attr(m[0], 'poster');
    if (!poster) return '';
    return poster.indexOf('//') === 0 ? 'https:' + poster : poster;
  },

  /// 播放器后面的主信息块：`#useraction` 里的 Runtime / Views。
  __info(html) {
    var text = String(html || '');
    var at = text.indexOf('useraction');
    var block = at >= 0 ? text.slice(at, at + 3000) : text.slice(0, 12000);
    var runtime = /Runtime:\s*<span[^>]*>([^<]{1,16})</i.exec(block);
    var views = /Views:\s*<span[^>]*>([\d,]+)/i.exec(block);
    var parts = [];
    if (runtime) parts.push('时长 ' + this.__clean(runtime[1]));
    if (views) parts.push(this.__views(Number(views[1].replace(/,/g, ''))) + '次播放');
    return { subtitle: parts.join(' · '), description: '' };
  },

  /// 播放地址：`strencode2("…")` 就是 unescape（百分号解码），解出 `<source src='…'>`。
  __media(html) {
    var text = String(html || '');
    var call = /strencode2\("([^"]+)"\)/.exec(text);
    if (!call) return '';
    var decoded = '';
    try {
      decoded = decodeURIComponent(call[1]);
    } catch (error) {
      decoded = call[1];
    }
    var src = /<source[^>]+src=['"]([^'"]+)['"]/i.exec(decoded);
    if (!src) return '';
    var url = this.__clean(src[1]).replace(/^&amp;/g, '&');
    return url.indexOf('//') === 0 ? 'https:' + url : url;
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /viewkey=([0-9A-Za-z]+)/.exec(raw);
    if (m) return m[1];
    if (/^[0-9A-Za-z]+$/.test(raw)) return raw;
    throw new Error('91Porn：缺少视频 ID（viewkey）');
  }
};
