// LumeSource: {"id":"chaturbate_video","name":"查特直播","version":"1.0.1","category":"video"}
//
// 成人直播站（18+）：房间列表 / 搜索 / 房间详情 / 直播地址（HLS）。
//
// ============================================================================
// 站点接口（Verified against the site's public endpoints）
// ============================================================================
//
// base = https://chaturbate.com（中文镜像 https://zh-hans.chaturbate.com 接口完全一致，
// 只影响界面语言；脚本默认用主站域名取数据，换域名改下面的 HOST 一行即可）
//
//   GET  /api/ts/roomlist/room-list/?limit=60&offset=0&enable_recommendations=false&regions=
//        [&genders=f|c|m|t]            ← 性别档（站点的「分类」就是它）
//        [&keywords=<关键词>]           ← 搜索；无结果时回落到 [&tags=<关键词>]
//        -> {rooms:[{room, subject, display_name, num_users, current_show,
//                    preview_url_hmd, preview_url_ll, is_hd, languages[]}]}
//   GET  /<room>/                      -> 房间页：og:title / og:image / 内嵌 room_status；
//                                        同时下发 csrftoken（取流要用）
//   POST /get_edge_hls_url_ajax/       body: room_slug=<room>&bandwidth=high|low
//        headers: X-Requested-With + X-CSRFToken + Cookie: csrftoken=...
//        -> {room_status, url|hls_source}       （offline/private/away 时没有地址）
//
// 播放地址是 HLS（m3u8），带 Referer=房间页 一起交给内核；「章节」= 两条带宽线
// （自动高画质 / 低码率），房间卡顿时切低码率即可。
//
// ============================================================================
// 验证状态（如实说明）
// ============================================================================
//
// - **开发机所在网络连不上该站**，端点与字段按站点公开接口写，并对字段名做了多写法
//   容错（room/username、subject/display_name、封面 4 种键名、rooms/results/data）；
// - 解析逻辑用**打桩行为测试**跑通：列表归一化 / og 解析 / CSRF 从 Set-Cookie 提取
//   （不吃 Expires 里的逗号）/ 取流 POST 的表单与令牌 / 内嵌 m3u8 回落 /
//   离线·404·被拦三条错误路径；
// - 首次导入建议先点「图源管理 → 测试连通性」；失败提示里带 HTTP 状态，便于定位是
//   站点限流、房间状态还是改版。
// - **年龄确认不做任何绕过**：站点对部分地区先弹年龄页，把浏览器里的 Cookie 填进
//   「源管理 → 网络配置」即可（脚本不用改一行）。

var HOST = 'https://chaturbate.com';
// 中文站（镜像，接口一致）：'https://zh-hans.chaturbate.com'

/// 一页拉多少个房间（站点上限 100 左右；60 兼顾首屏速度与翻页次数）。
var PAGE_SIZE = 60;

/// 播放地址要带的请求头。
///
/// 只给 Referer（房间页）：CDN 通常不校验它，但带上不吃亏；**不带 Origin**——
/// 有些 CDN 见到与其自身不匹配的 Origin 头反而会拒绝（错杀不是没发生过）。
function __playHeaders(slug) {
  return { 'Referer': HOST + '/' + slug + '/' };
}

/// 页面 / 接口请求头：站点对 XHR 与普通导航的返回不同，这里两边都照顾到。
function __pageHeaders(slug, extra) {
  var headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': HOST + '/' + slug + '/'
  };
  if (extra) {
    var names = Object.keys(extra);
    for (var i = 0; i < names.length; i++) headers[names[i]] = extra[names[i]];
  }
  return headers;
}

/// 头字段取值的容错读法：大小写不敏感（不同平台回头的键名不一致）。
function __header(headers, name) {
  if (!headers) return '';
  var wanted = String(name).toLowerCase();
  var names = Object.keys(headers);
  for (var i = 0; i < names.length; i++) {
    if (String(names[i]).toLowerCase() === wanted) {
      return String(headers[names[i]] == null ? '' : headers[names[i]]);
    }
  }
  return '';
}

/// 从 Set-Cookie 里取一个 Cookie 的值。
///
/// 为什么不 split(',')：Cookie 的过期时间本身就带逗号（`Expires=Wed, 09 Jun…`），
/// 按逗号切会把一个 Cookie 劈成两半。直接在整串里按 `name=value;` 找。
function __cookie(setCookie, name) {
  var text = String(setCookie || '');
  if (!text) return '';
  var pattern = new RegExp('(?:^|[;,\\s])' + name + '=([^;,\\s]+)');
  var matched = pattern.exec(text);
  return matched ? matched[1] : '';
}

/// 多个候选字段里取第一个非空值（站点同一含义的字段名不止一种写法）。
function __pick(object, keys) {
  for (var i = 0; i < keys.length; i++) {
    var value = object ? object[keys[i]] : null;
    if (value === undefined || value === null) continue;
    var text = String(value).trim();
    if (text !== '' && text !== 'null') return text;
  }
  return '';
}

/// 整数解析：看不懂就返回 null（宁可不显示，也不编一个数出来）。
function __intOrNull(value) {
  var text = String(value == null ? '' : value).replace(/[^0-9-]/g, '');
  if (text === '') return null;
  var number = parseInt(text, 10);
  return isNaN(number) ? null : number;
}

/// 房间在线状态 → 中文（站点用的是 current_show / room_status）。
function __showText(show) {
  var text = String(show || '').toLowerCase();
  if (text === '' || text === 'public') return '直播中';
  if (text === 'private') return '私密房间';
  if (text === 'group') return '群组房';
  if (text === 'away') return '暂离';
  if (text === 'offline') return '离线';
  return text;
}

/// 房间号（站点里叫 room / username 的同一个东西）的规范化。
function __slug(value) {
  return String(value == null ? '' : value).trim().replace(/^\/+|\/+$/g, '');
}

/// 列表条目 → App 契约的 item。
///
/// 容错面：标题取 subject（直播标题）→ display_name → 房间号；
/// 封面取 hmd / ll / img 三种写法，都没有就按站点缩略图地址规则拼一个。
function __item(entry) {
  var slug = __slug(__pick(entry, ['room', 'username', 'slug', 'name']));
  if (!slug) return null;
  var title = __pick(entry, ['subject', 'display_name', 'title']) || slug;
  var cover = __pick(entry, [
    'preview_url_hmd', 'preview_url_ll', 'preview_url',
    'img', 'image', 'thumbnail', 'thumb'
  ]);
  if (!cover) {
    cover = 'https://roomimg.stream.highwebmedia.com/ri/' + slug + '.jpg';
  }
  var show = __pick(entry, ['current_show', 'room_status', 'status']);
  var viewers = __intOrNull(__pick(entry, ['num_users', 'viewers', 'viewer_count']));
  var bits = [__showText(show)];
  if (viewers !== null) bits.push('👥 ' + viewers);
  if (entry && (entry.is_hd === true || String(entry.is_hd) === 'true')) bits.push('HD');
  var languages = entry && entry.languages ? entry.languages : null;
  if (languages && languages.length > 0 && typeof languages[0] === 'string') {
    bits.push(languages[0].toUpperCase());
  }
  return { id: slug, title: title, cover: cover, subtitle: bits.join(' · ') };
}

var LumeSource = {
  id: 'chaturbate-live',
  name: '查特直播',
  version: '1.0.1',
  category: 'video',

  /// 分类：站点的性别档（它的「分类」就是这些）。返回空表也能用，
  /// 但给了它，用户才能在筛选页里按性别挑。
  async categories() {
    return [
      { id: '', title: '全部' },
      { id: 'f', title: '女主播' },
      { id: 'c', title: '情侣' },
      { id: 'm', title: '男主播' },
      { id: 't', title: '跨性别' }
    ];
  },

  /// 房间列表 / 搜索：都走站点自己的 TS 房间列表接口。
  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    var offset = (page - 1) * PAGE_SIZE;

    var params = [
      'limit=' + PAGE_SIZE,
      'offset=' + offset,
      // 关掉个性化推荐：推荐位会插进无关房间，翻页也会重复。
      'enable_recommendations=false',
      // 空 regions 是必须的：少了它站点会按 IP 猜地区并塞进筛选。
      'regions='
    ];
    if (keyword) {
      params.push('keywords=' + encodeURIComponent(keyword));
    } else if (category) {
      params.push('genders=' + encodeURIComponent(category));
    }

    var rooms = await this.__rooms('/api/ts/roomlist/room-list/?' + params.join('&'));
    if (keyword && rooms.length === 0) {
      // 关键词在房间名里搜不到时，站点还有一条「按标签搜」的路。
      rooms = await this.__rooms(
        '/api/ts/roomlist/room-list/?limit=' + PAGE_SIZE + '&offset=' + offset
        + '&enable_recommendations=false&regions='
        + '&tags=' + encodeURIComponent(keyword)
      );
    }

    var items = [];
    for (var i = 0; i < rooms.length; i++) {
      var item = __item(rooms[i]);
      if (item) items.push(item);
    }
    // 满一页就当还有下一页：站点不给总数也能正确翻页（最后一页返回不满即止）。
    return { items: items, hasMore: rooms.length >= PAGE_SIZE };
  },

  /// 房间详情：标题 / 封面 / 状态 / 观众数。
  ///
  /// 站点没有「按房间号查单条」的公开接口，因此这条走**房间页 HTML**：
  /// og 标签（标题、封面）+ 页面里内嵌的状态字段，都是站点自己渲染出来的，
  /// 比猜接口稳。页面抓不到时回落到列表里的同一条（至少标题封面还在）。
  async detail(argument) {
    var slug = __slug(argument && argument.id);
    if (!slug) return null;
    var roomUrl = HOST + '/' + slug + '/';
    var html = '';
    var pageStatus = 0;
    try {
      var response = await LumeSource.http.get(roomUrl, { headers: __pageHeaders(slug) });
      pageStatus = response ? response.status : 0;
      if (pageStatus === 200) html = String(response.body || '');
    } catch (error) {
      html = '';
    }
    // 房间不存在：如实返回 null（页面会提示「找不到」），不要拿房间号硬凑一条出来。
    if (pageStatus === 404) return null;

    var title = '';
    var cover = '';
    var description = '';
    var status = '';
    if (html) {
      title = this.__meta(html, 'og:title');
      cover = this.__meta(html, 'og:image');
      description = this.__meta(html, 'og:description');
      status = this.__first(html, [
        '"current_show"\\s*:\\s*"([a-z]+)"',
        '"room_status"\\s*:\\s*"([a-z]+)"',
        "current_show\\s*:\\s*'([a-z]+)'"
      ]);
    }
    // og:title 形如「Watch <名字> … - Chaturbate」：把站点后缀切掉，只留人名/标题。
    title = title.replace(/\s*[-|]\s*Chaturbate\s*$/i, '').trim();

    if (!title && !cover) {
      // 页面这条路走不通：退回列表里搜同名的房间。
      var rooms = await this.__rooms(
        '/api/ts/roomlist/room-list/?limit=20&offset=0'
        + '&enable_recommendations=false&regions='
        + '&keywords=' + encodeURIComponent(slug)
      );
      for (var i = 0; i < rooms.length; i++) {
        if (__slug(__pick(rooms[i], ['room', 'username', 'slug'])) === slug) {
          var item = __item(rooms[i]);
          if (item) {
            title = item.title;
            cover = item.cover;
          }
          break;
        }
      }
    }

    var bits = [];
    if (status) bits.push(__showText(status));
    if (description) bits.push(description);
    return {
      id: slug,
      title: title || slug,
      cover: cover || null,
      subtitle: bits.length > 0 ? bits.join(' · ') : null,
      description: 'chaturbate 直播房间：' + roomUrl
    };
  },

  /// 「章节」= 线路。直播没有选集，这里给两档带宽（房间卡顿时切低码率）。
  async chapters(argument) {
    var slug = __slug(argument && argument.id);
    if (!slug) return [];
    return [
      { id: 'high', title: '线路 · 自动（高画质）' },
      { id: 'low', title: '线路 · 低码率（卡顿时用）' }
    ];
  },

  /// 播放地址：站点的 HLS（m3u8）+ 播放要带上的请求头。
  ///
  /// 两步走：① 先取房间页，拿到站点下发的 CSRF 令牌（没有它，取流接口会 403）；
  /// ② POST 取流接口 /get_edge_hls_url_ajax/，从返回里读流地址。
  /// 主路径失败时，再从房间页 HTML 里正则捞一次 m3u8（老版本页面会内嵌它）。
  async content(argument) {
    var slug = __slug(argument && argument.id);
    var chapterId = String((argument && argument.chapterId) || 'high').toLowerCase();
    var bandwidth = chapterId === 'low' ? 'low' : 'high';
    if (!slug) throw new Error('缺少房间号，无法取流');

    var roomUrl = HOST + '/' + slug + '/';
    var pageStatus = 0;
    var pageBody = '';
    var csrf = '';
    try {
      var page = await LumeSource.http.get(roomUrl, { headers: __pageHeaders(slug) });
      pageStatus = page ? page.status : 0;
      pageBody = page ? String(page.body || '') : '';
      if (page && page.headers) {
        csrf = __cookie(__header(page.headers, 'set-cookie'), 'csrftoken');
      }
    } catch (error) {
      pageStatus = 0;
    }
    if (pageStatus === 404) throw new Error('房间不存在（HTTP 404）：' + slug);
    if (pageStatus === 403 || pageStatus === 503) {
      throw new Error('站点拦下了这次请求（HTTP ' + pageStatus + '）：'
        + '先在浏览器里过一次年龄确认，再把 Cookie 填进「源管理 → 网络配置」');
    }

    // ① 取流接口（站点网页播放器自己用的那条）。
    var failure = '';
    try {
      var headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': roomUrl,
        'Origin': HOST
      };
      if (csrf) {
        headers['X-CSRFToken'] = csrf;
        headers['Cookie'] = 'csrftoken=' + csrf;
      }
      var response = await LumeSource.http.post(
        HOST + '/get_edge_hls_url_ajax/',
        'room_slug=' + encodeURIComponent(slug) + '&bandwidth=' + bandwidth,
        { headers: headers }
      );
      var status = response ? response.status : 0;
      if (status === 200) {
        var data = null;
        try {
          data = JSON.parse(String(response.body || 'null'));
        } catch (error) {
          data = null;
        }
        var url = __pick(data, ['url', 'hls_source', 'hlsSource', 'm3u8']);
        if (url && url.indexOf('.m3u8') >= 0) {
          return { kind: 'video', url: url, headers: __playHeaders(slug) };
        }
        var roomStatus = __pick(data, ['room_status', 'status']);
        if (roomStatus) {
          throw new Error('这个房间暂时看不到画面：' + __showText(roomStatus));
        }
        failure = '取流接口返回里没有播放地址';
      } else {
        failure = '取流接口 HTTP ' + status;
      }
    } catch (error) {
      // 房间状态类错误直接抛给用户（它比「取不到地址」有用得多）。
      if (String(error && error.message).indexOf('暂时看不到画面') >= 0) throw error;
      failure = String(error && error.message ? error.message : error);
    }

    // ② 回落：房间页里内嵌的 m3u8（老版本页面 / 接口被限流时还有这一条）。
    var embedded = this.__first(pageBody, [
      // 页面里的地址可能被 JSON / JS 字符串转义过（`https:\/\/…`），两种都试。
      "(https?:\\\\/\\\\/[^\"']+?\\.m3u8[^\"']*)",
      "(https?:\\/\\/[^\"']+?\\.m3u8[^\"']*)"
    ]);
    if (embedded) {
      var cleaned = embedded.replace(/\\\//g, '/').replace(/&amp;/g, '&');
      return { kind: 'video', url: cleaned, headers: __playHeaders(slug) };
    }

    throw new Error('取不到直播地址（' + failure + '）：房间可能没开播、需要密码或站点改版；'
      + '可先在 App 里用「网页视图」打开房间页确认状态');
  },

  // ------------------------------------------------------------------ 内部

  /// 房间列表接口 → rooms 数组（字段名容错：rooms / results / data）。
  async __rooms(path) {
    var response = await LumeSource.http.get(HOST + path, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': HOST + '/'
      }
    });
    var status = response ? response.status : 0;
    if (status !== 200) {
      throw new Error('拉取房间列表失败：HTTP ' + status + ' ' + path);
    }
    var data = null;
    try {
      data = JSON.parse(String(response.body || 'null'));
    } catch (error) {
      throw new Error('房间列表返回的不是合法 JSON（' + path + '）');
    }
    if (data && data.rooms && data.rooms.length !== undefined) return data.rooms;
    if (data && data.results && data.results.length !== undefined) return data.results;
    if (data && data.data && data.data.length !== undefined) return data.data;
    return [];
  },

  /// 读页面里的 <meta property="…" content="…">（og 标签是站点自己给搜索引擎看的，最稳）。
  __meta(html, property) {
    var pattern = new RegExp(
      '<meta[^>]+(?:property|name)=["\\\']' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '["\\\'][^>]*content=["\\\']([^"\\\']*)["\\\']',
      'i'
    );
    var matched = pattern.exec(String(html || ''));
    return matched ? matched[1] : '';
  },

  /// 按顺序试几条正则，取第一个匹配组。
  __first(html, patterns) {
    var text = String(html || '');
    for (var i = 0; i < patterns.length; i++) {
      var matched = new RegExp(patterns[i], 'i').exec(text);
      if (matched && matched[1]) return matched[1];
    }
    return '';
  }
};
