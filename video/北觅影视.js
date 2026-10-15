// LumeSource: {"id":"luttt_video","name":"北觅影视","version":"1.1.1","category":"video"}
// 兼容地址镜像：正式文件位于 movie/北觅影视.js，保留此地址供已保存订阅更新。

// 站点：https://v.luttt.com （苹果CMS 10 + conch/hl 模板，服务端渲染 HTML）
//
// 结构（2026-10-08 实测直连可用，无需 Cookie/无需过验证）：
//   · 分类：`/vodtype/{id}.html`；一级分类在首页导航里（电影/电视剧/…），
//     取不到就回退内置的常用几项。
//   · 列表：`/vodshow/{f0}-{f1}-…-{f11}.html`（苹果CMS 的标准 12 段形态）：
//     f0=类型、f1=地区、f2=排序(time/hits/score)、f4=语言、f5=字母、f8=页码、f11=年份，
//     其余段留空。page=1 时 f8 留空 → `/vodshow/{type1}-----------.html`。
//   · 筛选：站点列表页那几排（地区/语言/字母/年份/排序）就是上面这些字段——本源把它们
//     从页面里**实时抓**成 `filters()`（选项 id 记成「段位|值」），`list()` 按段位回填。
//     条目在 `ul.hl-vod-list > li.hl-list-item` 里：`a.hl-item-thumb`
//     带 href="/voddetail/{id}.html" + title + data-original（封面，懒加载占位）。
//   · 搜索：`/vodsearch/{关键词}----------{page}---.html`（关键词按 URL 编码）。
//   · 详情：`/voddetail/{id}.html`，标题 `h2.hl-dc-title`，封面在
//     `hl-dc-pic span.hl-item-thumb` 的 data-original，简介是 `meta[name=description]`，
//     选集在 `ul#hl-plays-list li a[href="/vodplay/{id}-{line}-{n}.html"]`。
//   · 播放：`/vodplay/{id}-{line}-{n}.html` 内联 `player_aaaa = {...}` JSON，
//     `url` 字段就是 m3u8 直链；只使用播放数据明确声明的媒体请求头。
//
// 相对地址全部用 __absolute 补齐；失败抛可读中文错误。

var BASE_URL = 'https://v.luttt.com';
var PAGE_SIZE = 36;

var LumeSource = {
  id: 'luttt_video',
  name: '北觅影视',
  version: '1.1.1',
  category: 'video',

  async categories() {
    var html = await this.__get(BASE_URL + '/');
    var items = this.__navCategories(html);
    if (!items.length) {
      items = [
        { id: '1', title: '电影' },
        { id: '2', title: '电视剧' },
        { id: '3', title: '综艺' },
        { id: '4', title: '动漫' }
      ];
    }
    return items;
  },

  async home() {
    var categories = await this.categories();
    var boards = [];
    for (var i = 0; i < categories.length && boards.length < 4; i++) {
      var category = categories[i] || {};
      var payload = await this.list({ categoryId: category.id, page: 1 });
      var items = payload && payload.items ? payload.items : [];
      if (!items.length) continue;
      boards.push({
        title: String(category.title || category.id),
        moreUrl: String(category.id),
        items: items.slice(0, 12)
      });
    }
    return boards;
  },

  /// 筛选：从列表页的筛选条实时抓（地区 / 语言 / 字母 / 年份 / 排序）。
  ///
  /// 站点把筛选做成 URL 的固定字段位（苹果CMS 的 12 段形态），所以选项 id 记成
  /// **「段位|值」**（例：`1|大陆`），`list()` 按段位写回，脚本不写死任何分类名。
  /// 类型（f0）不在这里——它由分类那一排负责。
  async filters() {
    var html = await this.__get(BASE_URL + '/vodshow/1-----------.html');
    var groups = [];
    var seen = {};
    var rowPattern = /<div class="hl-filter-item hl-filter-text[^"]*">\s*<span>([^<]{1,10})<\/span>\s*<\/div>\s*<ul class="hl-filter-list[^"]*">([\s\S]{0,6000}?)<\/ul>/g;
    var row;
    while ((row = rowPattern.exec(html)) !== null) {
      var title = this.__clean(row[1]);
      if (!title || seen[title]) continue;
      var options = [];
      var linkPattern = /<a href="(\/vodshow\/([^"]+)\.html)"[^>]*>([^<]{1,20})<\/a>/g;
      var link;
      var optionSeen = {};
      while ((link = linkPattern.exec(row[2])) !== null) {
        var fields = decodeURIComponent(link[2]).split('-');
        var pos = -1;
        var value = '';
        for (var i = 1; i < fields.length; i++) {
          if (fields[i]) {
            pos = i;
            value = fields[i];
            break;
          }
        }
        if (pos < 0 || !value) continue;
        var text = this.__clean(link[3]);
        if (!text) continue;
        var id = pos + '|' + value;
        if (optionSeen[id]) continue;
        optionSeen[id] = true;
        options.push({ id: id, title: text });
      }
      if (!options.length) continue;
      seen[title] = true;
      groups.push({ id: 'facet-' + groups.length, title: title, options: options });
    }
    // 排序是另一处（列表右上「按最新 / 按最热 / 按评分」，URL 的 f2 段）。
    var sortOptions = [];
    var sortSeen = {};
    var sortPattern = /<a[^>]+href="\/vodshow\/1--([a-z]{2,10})-{6,}\.html"[^>]*>([^<]{1,10})<\/a>/g;
    var sortMatch;
    while ((sortMatch = sortPattern.exec(html)) !== null) {
      var sortText = this.__clean(sortMatch[2]);
      var sortId = '2|' + sortMatch[1];
      if (!sortText || sortSeen[sortId]) continue;
      sortSeen[sortId] = true;
      sortOptions.push({ id: sortId, title: sortText });
    }
    if (sortOptions.length) {
      groups.push({ id: 'facet-sort', title: '排序', options: sortOptions });
    }
    if (!groups.length) {
      console.warn('[luttt] 筛选条没解析出来：' + html.length + ' 字符');
    }
    return groups;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId) : '1';
    if (!category || category === 'all') category = '1';

    var html;
    if (keyword) {
      html = await this.__get(BASE_URL + '/vodsearch/' + this.__segment(keyword) + '----------' + page + '---.html');
    } else {
      // 苹果CMS 12 段形态：f0=类型、f8=页码，其余段位由筛选回填（没选就留空）。
      var fields = ['', '', '', '', '', '', '', '', '', '', '', ''];
      fields[0] = this.__segment(category);
      var filters = argument && argument.filters ? argument.filters : {};
      var keys = Object.keys(filters);
      for (var k = 0; k < keys.length; k++) {
        var raw = String(filters[keys[k]] == null ? '' : filters[keys[k]]).split(',')[0];
        var parts = raw.split('|');
        var pos = Number(parts[0]);
        if (!(pos >= 1 && pos <= 11) || pos === 8) continue;
        if (!parts[1]) continue;
        fields[pos] = this.__segment(parts[1]);
      }
      if (page > 1) fields[8] = String(page);
      html = await this.__get(BASE_URL + '/vodshow/' + fields.join('-') + '.html');
    }
    var items = this.__listItems(html);
    var hasMore = items.length >= PAGE_SIZE && this.__hasNextPage(html);
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get(BASE_URL + '/voddetail/' + encodeURIComponent(id) + '.html');
    var title = this.__clean(this.__match(html, /<h2[^>]*class="[^"]*hl-dc-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/));
    if (!title) return null;
    var cover = this.__match(html, /class="hl-dc-pic"[\s\S]*?data-original="([^"]+)"/);
    if (!cover) cover = this.__match(html, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    var description = this.__clean(this.__match(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/));
    var fields = this.__fields(html);
    var tags = [];
    if (fields.type) tags = fields.type.split(/[\/,、]/).map(this.__clean, this).filter(function (t) { return t; });
    return {
      id: id,
      title: title || String(id),
      cover: this.__absolute(cover),
      subtitle: fields.note || '',
      description: description,
      tags: tags,
      extra: {
        year: fields.year || '',
        area: fields.area || '',
        actors: fields.actor || '',
        director: fields.director || '',
        status: fields.note || ''
      }
    };
  },

  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get(BASE_URL + '/voddetail/' + encodeURIComponent(id) + '.html');
    var chapters = [];
    // 一条线路一个 <ul id="hl-plays-list">；多线路时同一集的链接会重复，按 href 去重。
    var pattern = /href="(\/vodplay\/[^"]+\.html)"[^>]*>([\s\S]{0,40}?)<\/a>/g;
    var seen = {};
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var href = match[1];
      if (seen[href]) continue;
      seen[href] = true;
      var title = this.__clean(match[2]);
      chapters.push({ id: href, title: title || ('第' + (chapters.length + 1) + '集') });
    }
    if (!chapters.length) throw new Error('北觅影视：该影片没有可播放的剧集');
    return chapters;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId) : '';
    if (!chapterId) throw new Error('北觅影视：缺少剧集（请先选择一集）');

    var url = chapterId.indexOf('http') === 0
      ? chapterId
      : this.__absolute(chapterId);
    var html = await this.__get(url);

    var raw = this.__match(html, /player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!raw) raw = this.__match(html, /player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!raw) throw new Error('北觅影视：播放页没有找到播放数据');
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('北觅影视：播放数据解析失败');
    }
    var playUrl = parsed && parsed.url ? String(parsed.url) : '';
    if (!playUrl) throw new Error('北觅影视：该剧集没有播放地址');
    return {
      kind: 'video',
      url: playUrl,
      headers: parsed.headers && typeof parsed.headers === 'object' && !Array.isArray(parsed.headers)
        ? parsed.headers : {}
    };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id);
    else if (argument && argument.vodId != null) id = String(argument.vodId);
    if (!id) throw new Error('北觅影视：缺少视频 ID');
    return id;
  },

  /// 一级分类：首页导航 `ul.hl-menus` 里的 `/vodtype/{数字}.html`（排除子分类
  /// 的 `.hl-type-child` 块）。
  __navCategories(html) {
    var items = [];
    var seen = {};
    var pattern = /<li class="hl-menus-item">([\s\S]*?)<\/li>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var block = match[1];
      var href = this.__match(block, /href="\/vodtype\/(\d+)\.html"/);
      if (!href) continue;
      if (seen[href]) continue;
      seen[href] = true;
      var title = this.__clean(this.__match(block, /<span[^>]*>([\s\S]*?)<\/span>/));
      if (!title) title = '分类 ' + href;
      items.push({ id: href, title: title });
    }
    return items;
  },

  __listItems(html) {
    var items = [];
    var pattern = /<a class="hl-item-thumb hl-lazy" href="\/voddetail\/(\d+)\.html" title="([^"]*)"[\s\S]*?data-original="([^"]*)"/g;
    var match;
    var seen = {};
    while ((match = pattern.exec(html)) !== null) {
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      items.push({
        id: id,
        title: this.__clean(match[2]),
        cover: this.__absolute(match[3]),
        subtitle: this.__remark(html, match.index)
      });
    }
    return items;
  },

  /// 备注（HD / 更新至第 N 集）：跟着条目后面的 `span.remarks` 走一小段找。
  __remark(html, from) {
    var tail = html.slice(from, from + 1400);
    var text = this.__clean(this.__match(tail, /class="hl-lc-1 remarks"[^>]*>([^<]*)</));
    var score = this.__clean(this.__match(tail, /class="hl-text-conch score"[^>]*>([^<]*)</));
    var parts = [];
    if (text) parts.push(text);
    if (score) parts.push('评分 ' + score);
    return parts.join(' · ');
  },

  /// 详情页的「影片信息」列表（片名/状态/主演/导演/年份/地区/类型/时长…）。
  ///
  /// 每个字段是一个 `<li><em>标签：</em>值</li>`，值可能是纯文本、`<span>` 或
  /// 一串 `<a>`（多值）。逐条取 `<li>` 再按标签名归类，比一条大正则稳。
  __fields(html) {
    var box = this.__match(html, /class="hl-vod-data[^"]*"[^>]*>([\s\S]*?)<\/ul>/);
    var fields = {};
    if (!box) return fields;
    var pattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
    var match;
    while ((match = pattern.exec(box)) !== null) {
      var line = match[1];
      var label = this.__clean(this.__match(line, /<em[^>]*>([\s\S]*?)<\/em>/)).replace(/[：:]/g, '');
      if (!label) continue;
      // 值 = 去掉 em 之后的全部内容，再剥标签（多值用「/」连）。
      var rest = line.replace(/<em[^>]*>[\s\S]*?<\/em>/, '');
      var parts = [];
      var linkPattern = /<a[^>]*>([\s\S]*?)<\/a>/g;
      var link;
      while ((link = linkPattern.exec(rest)) !== null) {
        var text = this.__clean(link[1]);
        if (text) parts.push(text);
      }
      var value = parts.length ? parts.join('/') : this.__clean(rest);
      value = value.replace(/^[\/、,，\s]+|[\/、,，\s]+$/g, '').replace(/\s*\/\s*/g, '/');
      if (label.indexOf('状态') >= 0) fields.note = value;
      else if (label.indexOf('主演') >= 0) fields.actor = value;
      else if (label.indexOf('导演') >= 0) fields.director = value;
      else if (label.indexOf('年份') >= 0) fields.year = value;
      else if (label.indexOf('地区') >= 0) fields.area = value;
      else if (label.indexOf('类型') >= 0) fields.type = value;
    }
    return fields;
  },

  __hasNextPage(html) {
    return /下一页|hl-page-wrap/i.test(html);
  },

  /// URL 片段：关键词可能是中文，按 UTF-8 逐字节百分号编码（沙箱无 TextEncoder）。
  __segment(text) {
    var str = String(text);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        if (/[A-Za-z0-9\-_.~]/.test(str.charAt(i))) out += str.charAt(i);
        else out += '%' + ('0' + code.toString(16)).slice(-2).toUpperCase();
      } else {
        var bytes = this.__utf8(str.charAt(i));
        for (var j = 0; j < bytes.length; j++) {
          out += '%' + ('0' + bytes[j].toString(16)).slice(-2).toUpperCase();
        }
      }
    }
    return out;
  },

  __utf8(text) {
    var str = String(text);
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return bytes;
  },

  async __get(url) {
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': BASE_URL + '/' }
    });
    if (!response || response.status !== 200) {
      var status = response ? response.status : 0;
      var body = response && response.body ? String(response.body) : '';
      if ((status === 403 || status === 503 || status === 429) &&
          /just a moment|__cf_chl|cf-chl|challenge-platform|cf-mitigated|checking your browser/i.test(body)) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP ' + status + ' ' + url + '）');
      }
      // 567 / 403：站点（腾讯 EdgeOne）与它的播放 CDN 都会**按 IP 地区**拦：
      // 实测同一地址国内直连 200，走境外代理出口就是 567（站点）或 403（m3u8 CDN），
      // 两者都没有 JS 挑战可过——网页视图救不回来，如实说明原因，别把用户引到验证窗。
      if (status === 567 || status === 403) {
        throw new Error('北觅影视拒绝了当前网络的访问（HTTP ' + status
          + '，站点按 IP 地区拦截）：' + url
          + '——请直连或换一个该站可用的网络出口（用境外代理/VPN 会被拦）。');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    return response.body || '';
  },

  __absolute(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (text.indexOf('http://') === 0 || text.indexOf('https://') === 0) return text;
    return BASE_URL + (text.charAt(0) === '/' ? text : '/' + text);
  },

  __match(text, pattern) {
    var match = pattern.exec(text);
    if (!match || match[1] == null) return '';
    return String(match[1]).trim();
  },

  __clean(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…')
      .replace(/\s+/g, ' ')
      .trim();
  }
};
