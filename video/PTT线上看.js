// LumeSource: {"id":"ptt2_video","name":"PTT线上看","version":"1.0.0","category":"video","mirrors":["https://ptt2.my"]}
// 站点：https://ptt2.my（PTT 线上看；影视聚合站，服务端渲染）
//
// ## 抓取口径（每条都对着实时页面核过）
//
//   首页   `GET /` **返回 500**（站点自己的问题，实测 / 与 /index.php 行为不同），
//          所以本源一律从 `/index.php` 进；分页/分类也走 index.php 同款路由。
//   分类   GET /p/3 电视剧、/p/1 电影、/p/4 动漫、/p/2 综艺、/p/66 短剧、/p/53 体育
//          另有地区 /?category_id=<id> 与年份 /p/<id>?year=<年>（不当分类，避免长尾）。
//   列表   GET /p/<分类id>?page=<N>   48 张卡片/页；卡片在 `#videos` 里：
//          `div.item` → `a[href="/<数字>"]`（作品 id 就是数字）、
//          封面 `img.card-img-top[src=…avif]`、标题在 `div.card-body` 的链接文字里、
//          角标 `span.badge`（年份 / 「共47集」「全70集」）。
//   详情   GET /<id>  标题在 `og:title`（形如「兰香如故 - 线上看 : 第1集」），
//          封面 `og:image`，简介 `og:description`。
//   分集   **章节＝集数**：详情页里有 `/<id>/<集>/<线路>` 的链接（标签是纯数字 1…N），
//          按集号升序；线路 id 就是当前选中的那条（站点有「魔都/如意/量子/光速」多条线路，
//          每条线路是同一个播放源的镜像，本源用详情页默认线路）。
//   播放   GET /<id>/<集>/<线路>  页面里直接给 `https://play.<域>/<日期>/<hash>/index.m3u8`。
//          m3u8 带时效，所以每次播放都重新取这一集，不缓存直链。
//
// ## 纪律
// 1. base() 优先用宿主注入的域名（换镜像 / 手填域名立刻生效）。
// 2. 站点的根路径 500，但**所有真实内容都在 /index.php 与 /p/、/<id> 这些路由下**；
//    报错时把实际地址带上，方便判断是哪一段挂了。
// 3. 只认 `/<数字>` 形态的作品地址（页面里混着 /p/、/v/、/list/ 等其它链接）。

var DEFAULT_BASE = 'https://ptt2.my';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var PAGE_SIZE = 48;
var MAX_ITEMS = 144;
var ITEM_WINDOW = 1800;

function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'ptt2_video',
  name: 'PTT线上看',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://ptt2.my'],

  async home() {
    var page = await this.list({ categoryId: 'p/3', page: 1 });
    if (!page.items.length) throw new Error('PTT线上看：首页没认出条目（站点可能改版）');
    return [{ title: '电视剧', items: page.items.slice(0, 18) }];
  },

  async categories() {
    return [
      { id: 'p/3', title: '电视剧' },
      { id: 'p/1', title: '电影' },
      { id: 'p/4', title: '动漫' },
      { id: 'p/2', title: '综艺' },
      { id: 'p/66', title: '短剧' },
      { id: 'p/53', title: '体育' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var category = String(args.categoryId == null ? '' : args.categoryId);
    var path;
    if (keyword) {
      // 实测：`/index.php?keywords=` 与 `?keyword=` 都只是回默认的电视剧列表
      // （标题、条数与分类页完全一样），站点没有实现搜索——如实拒绝，别给假结果。
      throw new Error('PTT线上看：本站没有搜索功能（站点搜索框没有实现），请用分类浏览');
    } else if (/^p\/\d+$/.test(category)) {
      path = '/' + category + '?page=' + page;
    } else {
      path = '/p/3?page=' + page;
    }
    var html = await this.__get(path);
    var items = this.__items(html);
    if (!items.length) console.warn('[ptt2] 没认出条目：' + path + '（' + html.length + ' 字符）');
    return { items: items.slice(0, MAX_ITEMS), hasMore: this.__hasMore(html, page, items.length) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/' + id);
    var title = this.__meta(html, 'og:title') || this.__titleTag(html);
    title = title.replace(/\s*-\s*线上看\s*[:：]\s*第?\d+集?\s*$/i, '').trim();
    if (!title) throw new Error('PTT线上看：详情页没认出标题（' + id + '）');
    var cover = this.__abs(this.__meta(html, 'og:image'));
    var description = this.__meta(html, 'og:description');
    var meta = this.__pageMeta(html);
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: meta,
      description: description
    };
  },

  /// 章节＝集数（站点把分集链接直接写在详情页里，标签是纯数字）。
  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/' + id);
    var rows = this.__episodes(html, id);
    if (!rows.length) return [{ id: '1', title: '第1集' }];
    return rows;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = String(argument && argument.chapterId != null ? argument.chapterId : '').trim() || '1';
    var path = chapterId.indexOf('/') === 0 ? chapterId : '/' + id + '/' + chapterId + '/1';
    var html = await this.__get(path);
    var url = this.__media(html);
    if (!url) {
      throw new Error('PTT线上看：这一集没解出 m3u8（' + path
        + '）——可能换了线路，或该集需要登录/会员');
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
        throw new Error('NEED_WEBVIEW_VERIFY：PTT线上看 需要网页验证（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|cf-chl-|cf-turnstile/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：PTT线上看 需要网页验证（' + url + '）');
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
    return m ? this.__clean(m[1]) : '';
  },

  __meta(html, property) {
    var text = String(html || '');
    var esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp('<meta[^>]+(?:property|name)="' + esc + '"[^>]*content="([^"]*)"', 'i').exec(text)
      || new RegExp('<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="' + esc + '"', 'i').exec(text);
    return m ? this.__clean(m[1]) : '';
  },

  /// 卡片列表：`#videos` 里的 `div.item`，只认 `/<数字>` 作品地址。
  __items(html) {
    var text = String(html || '');
    var start = text.indexOf("id='videos'");
    if (start < 0) start = text.indexOf('id="videos"');
    var scope = start >= 0 ? text.slice(start) : text;
    var items = [];
    var seen = {};
    var index = 0;
    while (index < scope.length && items.length < MAX_ITEMS) {
      var at = scope.indexOf('class="card-img-top', index);
      if (at < 0) break;
      index = at + 18;
      var from = Math.max(0, at - 900);
      var win = scope.slice(from, at + ITEM_WINDOW);
      var anchor = /href="\/(\d+)"/.exec(win);
      if (!anchor) continue;
      var id = anchor[1];
      if (seen[id]) continue;
      var cover = '';
      var img = /<img[^>]+src="([^"]+)"/i.exec(scope.slice(at - 40, at + 400));
      if (img) cover = this.__abs(img[1]);
      // 标题在 card-body 里（可能带 fa 图标），取「下一个 item 之前」的文字。
      var bodyAt = scope.indexOf('card-body', at);
      var title = '';
      if (bodyAt >= 0) {
        var bodyEnd = scope.indexOf('class="col-', bodyAt);
        var body = scope.slice(bodyAt, bodyEnd > bodyAt ? bodyEnd : bodyAt + 600);
        var titleLink = /<a[^>]*>([\s\S]{0,200}?)<\/a>/i.exec(body);
        if (titleLink) title = this.__clean(titleLink[1]);
      }
      if (!title) {
        var alt = /<img[^>]+alt="([^"]+)"/i.exec(scope.slice(at - 40, at + 400));
        if (alt) title = this.__entity(alt[1]);
      }
      if (!title) continue;
      var badges = scope.slice(at - 500, at + 500).match(/<span class="badge[^"]*">([^<]{1,16})<\/span>/g) || [];
      var labels = [];
      for (var b = 0; b < badges.length; b++) {
        var label = this.__clean(badges[b]);
        if (label) labels.push(label);
      }
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: cover,
        coverHeaders: { 'Referer': base() + '/' },
        subtitle: labels.join(' · '),
        duration: ''
      });
    }
    return items;
  },

  __hasMore(html, page, count) {
    var text = String(html || '');
    if (text.indexOf('page=' + (page + 1)) >= 0) return true;
    return count >= PAGE_SIZE;
  },

  /// 分集：`/<id>/<集>/<线路>`，标签是纯数字。
  __episodes(html, id) {
    var text = String(html || '');
    var re = new RegExp('href="(/' + id + '/(\\d+)/(\\d+))"[^>]*>\\s*(\\d+)\\s*<', 'g');
    var rows = [];
    var seen = {};
    var m;
    while ((m = re.exec(text)) !== null) {
      var ep = Number(m[4]);
      if (!(ep > 0) || seen[ep]) continue;
      seen[ep] = true;
      rows.push({
        id: m[1],
        title: '第' + ep + '集',
        index: ep
      });
    }
    rows.sort(function (a, b) { return a.index - b.index; });
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push({ id: rows[i].id, title: rows[i].title });
    return out;
  },

  /// 详情页上的年份 / 集数角标（拼成副标题）。
  __pageMeta(html) {
    var text = String(html || '');
    var labels = [];
    var badges = text.match(/<span class="badge[^"]*">([^<]{1,16})<\/span>/g) || [];
    for (var i = 0; i < badges.length && labels.length < 3; i++) {
      var label = this.__clean(badges[i]);
      if (label && labels.indexOf(label) < 0) labels.push(label);
    }
    return labels.join(' · ');
  },

  __media(html) {
    var m = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s<]*)/i.exec(String(html || ''));
    if (!m) return '';
    return this.__entity(m[1]).replace(/&amp;/g, '&');
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/(\d+)(?:[/?#]|$)/.exec(raw);
    if (m) return m[1];
    if (/^\d+$/.test(raw)) return raw;
    throw new Error('PTT线上看：缺少作品 ID');
  }
};
