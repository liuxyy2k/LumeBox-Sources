// LumeSource: {"id":"mycomic_comic","name":"MYCOMIC","version":"1.0.0","category":"comic"}

// 站点：https://mycomic.com/cn （简体中文站；同一站另有繁体版 mycomic.com）
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/mycomic_*.html）
//
//   列表  GET /cn/comics?page={N}   30 条/页（实测共 1845 页）；服务端整页渲染。
//         条目在 `<div class="grid grid-cols-3 …">` 里：
//           `<a href="https://mycomic.com/cn/comics/{数字id}">
//              <img src="https://biccam.com/comics/{id}-{hash}.jpg" alt="{标题}">
//              …<div class="text-white text-sm pb-3 truncate">{最新话}</div>`
//         标题取 img 的 alt，副标题取那张卡右下角的「最新话」。
//   筛选  站点自己的筛选是查询串：`?filter[tag]=`、`filter[audience]=`、`filter[country]=`、
//         `filter[end]=`、`filter[year]=`、`filter[author]=`，排序是 `?sort=-update`
//         （最近更新）/ `?sort=-views`（最高人气），默认不带 sort＝最新上架。
//         本源把它们做成 `filters()`（分组与选项**从列表页实时抓**，含中文标签）。
//   搜索  GET /cn/comics?keyword={词}&page={N}   30 条/页（实测返回 30 条）。
//   排行  GET /cn/rank   排行榜（实测 50 条）。
//   详情  GET /cn/comics/{id}
//         标题 `div[data-flux-heading]`；封面 `img[src=biccam.com/comics/…]`（og:image 同一张）；
//         副标题行「1997 / 共 603 话」、状态徽章（连载中/已完结）、原创作者 / 作品类型 / 作品地区
//         都是页头那几条；简介在 `<p class="line-clamp-4 …">`（「观看全部」展开前的那段就是全文开头）。
//   目录  **章节在页面里是 Alpine 的 x-data JSON**：
//           `x-data="{ chapters: [{id:817597,title:"第1150话"}, …], decending: true, … }"`
//         站点默认**倒序**（最新在上）且带「倒序排列」开关；本源按 App 的阅读方向翻成
//         **旧→新升序**交出去（站点自己的「开始阅读」也是指向第 1 话）。
//   正文  GET /cn/chapters/{章节id}
//         图片是**明文**：`<img class="page w-full mx-auto" src="https://biccam.com/chapters/{id}/{n}-{hash}.jpg">`
//         （一话一页，整页给全；实测一章 12 图、页面 73KB）。图床实测不带 Referer 也能取。
//
// ## Cloudflare（**必须走网页视图过一次校验**）
//
//   整站在 Cloudflare 的托管校验后面：没有 `cf_clearance` 的客户端（curl / 本 App 的网络层）
//   一律拿到 403 + 「Just a moment...」挑战页。因此本源被拦时抛 `NEED_WEBVIEW_VERIFY`，
//   App 会给出「网页视图」入口；用户在视图里过一次校验后，Cookie（含 HttpOnly 的
//   cf_clearance）由 App 存进该图源的会话，后续请求自动带上——**脚本侧不用做任何事**。

var BASE_URL = 'https://mycomic.com/cn';

var PAGE_SIZE = 30;        // 列表/搜索每页条数（快照实测）
var ITEM_WINDOW = 1600;    // 单张卡往后看的窗口
var MAX_ITEMS = 200;       // 单次列表最多产出
var MAX_CHAPTERS = 6000;   // 目录最多解析多少话（ONE PIECE 实测 473）
var MAX_IMAGES = 400;      // 正文最多收多少张图
var MAX_FILTER_OPTIONS = 60; // 单个筛选组最多收多少选项

var LumeSource = {
  id: 'mycomic_comic',
  name: 'MYCOMIC',
  version: '1.0.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：站点自己的资料库入口（三个排序）。
  ///
  /// 站点另有一页「漫画排行」（/cn/rank），但那一页的主体是 Alpine 从内联数据渲染的
  /// 复合结构（不是稳定的服务端标记），本源不去猜它——浏览需求由「最高人气」这一档覆盖。
  async categories() {
    return [
      { id: 'all', title: '最新上架' },
      { id: 'sort-recent', title: '最近更新' },
      { id: 'sort-popular', title: '最高人气' }
    ];
  },

  /// 筛选标签：从列表页**实时抓**（页脚与侧栏用的是同一套筛选链接，
  /// 一次遍历去重即可；分组标题用站点自己的中文文案，选项文案取链接文本）。
  async filters() {
    var html = await this.__get('/comics');
    var buckets = {};
    var pattern = /<a href="([^"]*filter%5B([a-z]+)%5D=([^"&]+)[^"]*)"[^>]*>([\s\S]{0,300}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var key = match[2];
      var value = this.__decode(match[3]);
      var label = this.__clean(match[4]);
      if (!key || !value || !label) continue;
      if (!buckets[key]) buckets[key] = [];
      if (buckets[key].length >= MAX_FILTER_OPTIONS) continue;
      var id = key + '=' + value;
      var exists = false;
      for (var i = 0; i < buckets[key].length; i++) {
        if (buckets[key][i].id === id) {
          exists = true;
          break;
        }
      }
      if (!exists) buckets[key].push({ id: id, title: label });
    }
    var groups = [];
    var order = ['tag', 'audience', 'country', 'end', 'year', 'author'];
    for (var j = 0; j < order.length; j++) {
      var bucket = buckets[order[j]];
      if (!bucket || !bucket.length) continue;
      groups.push({ id: order[j], title: this.__filterTitle(order[j]), options: bucket });
    }
    groups.push({
      id: 'sort',
      title: '排序',
      options: [
        { id: 'sort-recent', title: '最近更新' },
        { id: 'sort-popular', title: '最高人气' }
      ]
    });
    return { groups: groups };
  },

  /// 侧栏链接 → 选项值（list() 直接把它拆成查询串；排序两个入口单独映射）。
  __optionValue(href) {
    var text = String(href || '');
    if (text.indexOf('sort=-update') >= 0) return 'sort-recent';
    if (text.indexOf('sort=-views') >= 0) return 'sort-popular';
    var match = /filter%5B([a-z]+)%5D=([^&"]+)/.exec(text);
    if (match) return this.__decode(match[1]) + '=' + this.__decode(match[2]);
    return '';
  },

  /// 分组标题（与 list() 里读的键一致）。
  __filterTitle(key) {
    var map = {
      tag: '作品类型', audience: '适合受众', country: '作品地区',
      end: '目前进度', year: '出品年份', author: '原创作者'
    };
    return map[key] || key;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    var filters = argument && argument.filters ? argument.filters : {};

    var query = [];
    if (keyword) query.push('keyword=' + encodeURIComponent(keyword));
    if (category === 'sort-recent') query.push('sort=-update');
    else if (category === 'sort-popular') query.push('sort=-views');

    // 筛选：组 id 就是查询串里的键（tag/audience/…）；多选以逗号相连时取第一个
    //（站点每条查询串只认一个值）。
    var keys = Object.keys(filters);
    for (var i = 0; i < keys.length; i++) {
      var group = keys[i];
      var value = String(filters[group] || '').split(',')[0].trim();
      if (!value) continue;
      if (group === 'sort') {
        if (value === 'sort-recent') query.push('sort=-update');
        else if (value === 'sort-popular') query.push('sort=-views');
        continue;
      }
      query.push('filter%5B' + encodeURIComponent(group) + '%5D=' + encodeURIComponent(value));
    }
    if (page > 1) query.push('page=' + page);

    var url = '/comics' + (query.length ? '?' + query.join('&') : '');
    var html = await this.__get(url);
    var items = this.__items(html);
    return { items: items, hasMore: this.__hasNextPage(html, page) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/comics/' + encodeURIComponent(id));
    var info = this.__detailInfo(html);
    if (!info.title) {
      console.warn('[mycomic] 详情页没认出标题：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    return {
      id: id,
      title: info.title,
      cover: info.cover,
      subtitle: info.subtitle,
      description: info.description,
      tags: info.tags,
      extra: {
        author: info.author,
        status: info.status,
        updated: info.updated,
        country: info.country,
        chapters: this.__chapters(html).length
      }
    };
  },

  /// 目录：页面里 Alpine 的 `chapters: [...]` JSON（站点默认倒序，这里翻成旧→新）。
  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/comics/' + encodeURIComponent(id));
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      throw new Error('MYCOMIC：详情页没认出章节（' + id + '）——'
        + '站点可能改了章节数据的写法，把运行日志发回来收敛解析规则');
    }
    return chapters;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('MYCOMIC：缺少章节 id（请重新进一次目录）');
    var html = await this.__get('/chapters/' + encodeURIComponent(chapterId));
    var images = this.__images(html);
    if (!images.length) {
      throw new Error('MYCOMIC：章节页没认出图片（' + chapterId + '，' + html.length
        + ' 字符）——站点可能改了正文标记');
    }
    return { kind: 'images', images: images };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    if (!id) throw new Error('MYCOMIC：缺少漫画 id');
    // 容错：传进来的是完整地址也能用。
    var match = /\/(\d+)(?:#|$)/.exec(id);
    if (match) id = match[1];
    return id;
  },

  /// 列表条目：`a[href=/cn/comics/{id}]` + `img[src=biccam.com/comics/...]` + 最新话。
  __items(html) {
    var items = [];
    var seen = {};
    var pattern = /<a href="https:\/\/mycomic\.com\/cn\/comics\/(\d+)"[^>]*>\s*<img[^>]*>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var coverMatch = /<img[^>]+src="([^"]+)"/.exec(block);
      var altMatch = /<img[^>]+alt="([^"]*)"/.exec(block);
      var latestMatch = /<div class="text-white text-sm[^"]*">([\s\S]{0,120}?)<\/div>/.exec(block);
      items.push({
        id: id,
        title: this.__clean(altMatch ? altMatch[1] : id),
        cover: coverMatch ? this.__absolute(coverMatch[1]) : '',
        subtitle: this.__clean(latestMatch ? latestMatch[1] : '')
      });
    }
    return items;
  },

  __detailInfo(html) {
    var titleMatch = /data-flux-heading[^>]*>([^<]{1,120})</.exec(html);
    var coverMatch = /<meta property="og:image" content="([^"]+)"/.exec(html)
      || /<img[^>]+src="(https:\/\/biccam\.com\/comics\/[^"]+)"/.exec(html);
    var subtitleMatch = /data-flux-subheading[^>]*>\s*([^<]{0,60}?)\s*</.exec(html);
    var statusMatch = /data-flux-badge[^>]*>\s*([^<]{0,20}?)\s*</.exec(html);
    var authorMatch = /原创作者:<\/label>\s*<span[^>]*>\s*<a[^>]*>([^<]{0,40})</.exec(html);
    var updatedMatch = /<time[^>]*datetime="([^"]+)"[^>]*>([^<]{0,20})</.exec(html);
    var countryMatch = /作品地区:<\/label>[\s\S]{0,200}?<a[^>]*>([^<]{0,20})</.exec(html);
    var descMatch = /<p class="line-clamp-4[^"]*">([\s\S]{0,3000}?)<\/p>/.exec(html)
      || /<meta name="description" content="([^"]*)"/.exec(html);
    var tags = [];
    var tagPattern = /<a href="https:\/\/mycomic\.com\/cn\/comics\?filter%5Btag%5D=[^"]+"[^>]*>([^<]{1,20})<\/a>/g;
    var tagMatch;
    while ((tagMatch = tagPattern.exec(html)) !== null) {
      var label = this.__clean(tagMatch[1]);
      if (label && tags.indexOf(label) < 0 && tags.length < 12) tags.push(label);
    }
    return {
      title: this.__clean(titleMatch ? titleMatch[1] : ''),
      cover: coverMatch ? this.__absolute(coverMatch[1]) : '',
      subtitle: this.__clean(subtitleMatch ? subtitleMatch[1] : ''),
      status: this.__clean(statusMatch ? statusMatch[1] : ''),
      author: this.__clean(authorMatch ? authorMatch[1] : ''),
      updated: this.__clean(updatedMatch ? updatedMatch[2] : ''),
      country: this.__clean(countryMatch ? countryMatch[1] : ''),
      description: this.__clean(descMatch ? descMatch[1] : ''),
      tags: tags
    };
  },

  /// 目录：Alpine 的 `chapters: [ {id, title}, … ]`（站点倒序 → 这里翻成升序）。
  __chapters(html) {
    var marker = html.indexOf('chapters: [');
    if (marker < 0) return [];
    var start = html.indexOf('[', marker);
    var depth = 0;
    var end = -1;
    for (var i = start; i < html.length; i++) {
      var ch = html.charAt(i);
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) return [];
    var raw;
    try {
      raw = JSON.parse(html.slice(start, end));
    } catch (error) {
      console.warn('[mycomic] 章节 JSON 解析失败：' + error);
      return [];
    }
    if (!Array.isArray(raw)) return [];
    var chapters = [];
    for (var j = 0; j < raw.length && chapters.length < MAX_CHAPTERS; j++) {
      var entry = raw[j] || {};
      if (entry.id == null) continue;
      var title = this.__clean(String(entry.title || ''));
      chapters.push({ id: String(entry.id), title: title || ('第 ' + (j + 1) + ' 话') });
    }
    // 站点默认最新在上；App 的「下一话」按数组顺序走，翻成旧→新更符合阅读方向。
    chapters.reverse();
    return chapters;
  },

  /// 正文图片：`<img class="page …" src="https://biccam.com/chapters/…">`。
  __images(html) {
    var images = [];
    var seen = {};
    var pattern = /<img[^>]+class="[^"]*\bpage\b[^"]*"[^>]+src="([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (images.length >= MAX_IMAGES) break;
      var url = this.__absolute(match[1]);
      if (!url || seen[url]) continue;
      seen[url] = true;
      images.push(url);
    }
    if (!images.length) {
      // 兜底：有些页面把 class 写在 src 后面。
      var fallback = /<img[^>]+src="(https:\/\/biccam\.com\/chapters\/[^"]+)"[^>]*class="[^"]*\bpage\b/g;
      while ((match = fallback.exec(html)) !== null) {
        if (images.length >= MAX_IMAGES) break;
        var value = this.__absolute(match[1]);
        if (!value || seen[value]) continue;
        seen[value] = true;
        images.push(value);
      }
    }
    return images;
  },

  /// 「还有下一页」：分页器里的「下一页」锚点（末页没有）。
  __hasNextPage(html, page) {
    if (/rel="next"/.test(html)) return true;
    var next = 'page=' + (page + 1);
    var pattern = new RegExp('href="[^"]*[?&]' + next + '(?:&|")');
    return pattern.test(html);
  },

  __filterTitle(key) {
    var map = {
      tag: '作品类型', audience: '适合受众', country: '作品地区',
      end: '目前进度', year: '出品年份', author: '原创作者'
    };
    return map[key] || '';
  },

  __decode(value) {
    var text = String(value || '');
    if (text.indexOf('%') < 0) return text;
    try {
      return decodeURIComponent(text);
    } catch (error) {
      return text;
    }
  },

  __absolute(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (value.indexOf('http') === 0) return value;
    if (value.indexOf('//') === 0) return 'https:' + value;
    return BASE_URL + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  __clean(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /// 所有请求的唯一出口：整站在 Cloudflare 后面，被拦时抛固定标记让 App 拉起网页视图。
  async __get(path) {
    var url = path.indexOf('http') === 0 ? path : BASE_URL + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': BASE_URL + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 429 || status === 503) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    var head = body.slice(0, 4000);
    if (/just a moment|checking your browser|attention required|__cf_chl|cf-chl-|challenge-platform/.test(head)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
