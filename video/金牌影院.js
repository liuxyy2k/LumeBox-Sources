// LumeSource: {"id":"jpyy2_video","name":"金牌影院","version":"1.0.1","category":"video"}

// 站点：https://jpyy2.com（Next.js 前端 + 自建 JSON API）
//
// jpyy2.com 是 **金牌影院** 的镜域：302 跳到主域 www.vv3nwjk.com（同一套后端、
// 同一套 API）。三个域名指向同一个站：jpyy2.com / vv3nwjk.com / m.vv3nwjk.com。
//
// ## 关键实测：主域挂了 WAF，**手机域（m.）没挂**
//
//   · `www.vv3nwjk.com` 整站（HTML 与 /api/mw-movie/** 一并）在 **OKooK-CDN 的
//     Google reCAPTCHA v3 WAF** 后面：未过验证的客户端（curl / 本 App 的网络层
//     一样）拿到 `521`，响应体是一段「跳转到自身并带 waf_captcha_marker」的脚本，
//     随后是人机验证页（`/okokcdn_recaptcha_verify` + reCAPTCHA v3）。
//     这类放行绑浏览器会话与服务端 IP 信誉，**导不出可复用 Cookie**，网页视图
//     过完校验也没法把状态搬给 HTTP 客户端（早期结论，逐项实测过）；
//   · `m.vv3nwjk.com` 的同一套 `/api/mw-movie/**` **没有这道 WAF**：同样的签名头
//     下去直接 200（本文档里所有接口都是在 m. 域上跑通的）。因此本源默认走手机域，
//     主域只作兜底；真的全被拦下时抛固定标记 `WAF_RECAPTCHA_V3`，App 据此提示
//     「需要配置外部无头浏览器桥接」（`LumeSource.bridge`，见 __api 的桥接分支）。
//
// ## 签名（从站点前端 chunk 里还原、并用线上请求逐个核对）
//
//     t    = Date.now()
//     g    = GET：参数按 key 升序拼 `k=v&k=v`（**值不做百分号编码**）；参数为空时 g 为空串
//     h    = (g ? g + '&' : '') + 'key=' + SIGN_KEY + '&t=' + t
//     sign = sha1(md5(h))        // 十六进制小写
//     SIGN_KEY = cb808529bae6b6be45ecfab29a4889bc（前端内置常量）
//   请求头另需 `client-type: 1`、`deviceId`（一个稳定的 32 位 UUID）、
//   `authorization`（未登录传空串即可）、`sign`、`t`。
//   沙箱里没有 Node 的 crypto，MD5 / SHA1 在本脚本内用纯 JS 实现（__md5 / __sha1，
//   下方保留标准测试向量校验过的实现）。
//
// ## 接口一览（均需上面那套头；实测全部在 m.vv3nwjk.com 上 200）
//
//   GET /anonymous/get/filer/type              顶级分类（电影/电视剧/综艺/动漫/短剧/体育直播）
//   GET /anonymous/get/filer/getClassByType?type1=  某分类的剧情标签（dictCode=FILTER_PLOT）
//   GET /anonymous/v1/home/all/list            首页各板块（实时抓，做 home()）
//   GET /anonymous/video/list?type1=&typeId=&page=&pageSize=   分类列表（分页）
//   GET /anonymous/video/searchByWordPageable?keyword=&page=&pageSize=   搜索
//   GET /anonymous/video/detail?id=            详情 + episodeList
//   GET /anonymous/v2/video/episode/url?clientType=1&id=&nid=  播放地址（多清晰度）
//
// 播放地址实测：1080/720/480 三条 m3u8（`needLogin` 只在标清上为 false，但三条
// URL 都能直接取到播放列表——脚本把三条都作为「清晰度」交给播放器，默认选标清）。
// 图床与 m3u8 实测**不需要 Referer**（裸请求即 200），仍带上站点 Referer 兜底。

var SITE_URL = 'https://jpyy2.com';
var API_PATH = '/api/mw-movie';
var SIGN_KEY = 'cb808529bae6b6be45ecfab29a4889bc';
var PAGE_SIZE = 24;
var DEVICE_KEY = 'jpyy2/device-id';
var HOST_KEY = 'jpyy2/api-host';

// 直连候选：手机域优先（实测没有 WAF），主域与镜域兜底。
// 顺序即重试顺序；某次请求撞上 WAF 就把它标记掉、换下一个。
var API_HOSTS = ['https://m.vv3nwjk.com', 'https://www.vv3nwjk.com', SITE_URL];

// 首页板块（接口字段 → 界面标题 / 「更多」指向的分类 id）。
var HOME_BOARDS = [
  { key: 'homeNewMoviePageData', title: '最新电影', more: '1' },
  { key: 'newestTvPageData', title: '最新剧集', more: '2' },
  { key: 'newestVarietyPageData', title: '最新综艺', more: '3' },
  { key: 'newestCartoonPageData', title: '最新动漫', more: '4' }
];
var HOME_LIMIT = 12;

var LumeSource = {
  id: 'jpyy2_video',
  name: '金牌影院',
  version: '1.0.1',
  category: 'video',

  // ---------------------------------------------------------------- 契约方法

  async categories() {
    var types = await this.__api('/anonymous/get/filer/type', {});
    var list = types && types.data && types.data.length ? types.data : [];
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      if (item.typeId == null) continue;
      result.push({ id: String(item.typeId), title: String(item.typeName || item.typeId) });
    }
    // 接口认不出时给站点自己的固定分类（站点导航就是这么几项，非编造）。
    if (!result.length) {
      result = [
        { id: '1', title: '电影' }, { id: '2', title: '电视剧' }, { id: '3', title: '综艺' },
        { id: '4', title: '动漫' }, { id: '88', title: '短剧' }
      ];
    }
    return result;
  },

  /// 首页：站点自己的四个板块（一次请求拿全套，再按板块切片）。
  async home() {
    var payload = await this.__api('/anonymous/v1/home/all/list', {
      clientType: '1',
      pageNum: 1,
      pageSize: HOME_LIMIT
    });
    var data = payload && payload.data ? payload.data : {};
    var boards = [];
    for (var i = 0; i < HOME_BOARDS.length; i++) {
      var board = HOME_BOARDS[i];
      var section = data[board.key];
      var raw = section && section.list && section.list.length ? section.list : [];
      if (!raw.length) continue;
      var items = [];
      for (var j = 0; j < raw.length; j++) items.push(this.__toItem(raw[j]));
      boards.push({ title: board.title, moreUrl: board.more, items: items.slice(0, HOME_LIMIT) });
    }
    return boards;
  },

  /// 筛选标签：本站的剧情标签是**按分类给的**（FILTER_PLOT 每组不通用的值域），
  /// 而 filters() 契约没有分类入参——因此这里每个顶级分类出一组，组 id 带上分类
  /// （`plot-{type1}`），选项 id 形如 `{type1}|{值}`；list() 收到后按 id 还原
  /// （选中的筛选优先于当前分类，见 list()）。认证不出标签就返回空数组。
  async filters() {
    var categories = await this.categories();
    var groups = [];
    var pending = [];
    for (var i = 0; i < categories.length; i++) {
      var category = categories[i];
      if (!/^\d+$/.test(category.id)) continue;
      pending.push({ title: category.title, task: this.__plotGroup(category) });
    }
    for (var j = 0; j < pending.length; j++) {
      try {
        var group = await pending[j].task;
        if (group) groups.push(group);
      } catch (error) {
        console.warn('[jpyy2] 筛选标签「' + pending[j].title + '」失败：' + error);
      }
    }
    return { groups: groups };
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    var plot = this.__pickPlot(argument && argument.filters ? argument.filters : {});
    // 筛选里带的分类优先（选项 id 是 `{type1}|{值}`，本身就说清了属于哪个分类）。
    if (plot.type1) category = plot.type1;

    if (keyword) {
      var search = await this.__api('/anonymous/video/searchByWordPageable', {
        clientType: '1',
        keyword: keyword,
        pageNum: page,
        pageSize: PAGE_SIZE
      });
      return this.__pageOf(search, page);
    }

    if (!category || category === 'all') category = '1';
    var params = {
      clientType: '1',
      type1: category,
      // 分页参数名是 **pageNum**（实测：传 `page` 时接口**忽略它**、每次返回第 1 页，
      // 只有 pageNum 会真的翻页；搜索接口同理）。
      pageNum: page,
      pageSize: PAGE_SIZE
    };
    if (plot.typeId) params.typeId = plot.typeId;
    var response = await this.__api('/anonymous/video/list', params);
    return this.__pageOf(response, page);
  },

  async detail(argument) {
    var id = this.__id(argument);
    var response = await this.__api('/anonymous/video/detail', { clientType: '1', id: id });
    var info = response && response.data ? response.data : null;
    if (!info || !info.vodName) return null;
    return {
      id: String(info.vodId != null ? info.vodId : id),
      title: String(info.vodName),
      cover: info.vodPic ? String(info.vodPic) : '',
      subtitle: this.__remark(info),
      description: this.__clean(info.vodContent || info.vodBlurb || ''),
      tags: this.__tags(info),
      extra: {
        year: info.vodYear || info.vodPubdate || '',
        area: info.vodArea || '',
        actors: info.vodActor || '',
        director: info.vodDirector || '',
        score: info.vodDoubanScore || info.vodScore || ''
      }
    };
  },

  async chapters(argument) {
    var id = this.__id(argument);
    var response = await this.__api('/anonymous/video/detail', { clientType: '1', id: id });
    var info = response && response.data ? response.data : {};
    var episodes = info.episodeList && info.episodeList.length ? info.episodeList : [];
    var chapters = [];
    for (var i = 0; i < episodes.length; i++) {
      var episode = episodes[i] || {};
      if (episode.nid == null) continue;
      var name = String(episode.name || '').trim();
      chapters.push({ id: String(episode.nid), title: name || ('第 ' + (i + 1) + ' 集') });
    }
    if (!chapters.length) throw new Error('金牌影院：这一部没有可播放的剧集（id=' + id + '）');
    return chapters;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('金牌影院：缺少剧集 ID（请先选择一集）');
    var response = await this.__api('/anonymous/v2/video/episode/url', {
      clientType: '1',
      id: id,
      nid: chapterId
    });
    var payload = response && response.data ? response.data : {};
    var list = payload.list && payload.list.length ? payload.list : [];
    var qualities = [];
    // 站点给每条线路标了 needLogin：**只有标清那条是 false**（实测 480=标清、
    // 720/1080 都是 true）。默认线路按这个标记挑，不按文案猜——resolutionName
    // 是「标清/高清/蓝光」，里面没有「480」这种数字（踩过：按标签找 480 永远落空，
    // 默认线路会落到 1080 的 needLogin 线上）。
    var standard = -1;
    for (var i = 0; i < list.length; i++) {
      var entry = list[i] || {};
      var url = entry.url ? String(entry.url) : '';
      if (!url) continue;
      var label = String(entry.resolutionName || '').trim();
      if (!label && entry.resolution) label = String(entry.resolution) + 'P';
      if (!label) label = '线路 ' + (qualities.length + 1);
      if (standard < 0 && entry.needLogin !== true) standard = qualities.length;
      qualities.push({ label: label, url: url });
    }
    if (!qualities.length) throw new Error('金牌影院：该剧集暂无播放地址');
    var chosen = qualities[standard >= 0 ? standard : 0];
    return {
      kind: 'video',
      url: chosen.url,
      // Referer 必须用**我们实际请求的那个域**（手机域 / 主域），**不能**用镜域 jpyy2.com：
      // 实测部分 CDN 直链（如 ppvod011.blbtgg.com）对 `Referer: https://jpyy2.com/`
      // 直接回 **403**（同一地址不带 Referer 或带 m.vv3nwjk.com 都是 200），
      // App 会把这个头透传给播放器 → m3u8/分片全 403 → 「播放连接中断」。
      headers: { 'Referer': (await this.__originOf(await this.__activeHost())) + '/' },
      qualities: qualities
    };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    else if (argument && argument.vodId != null) id = String(argument.vodId).trim();
    if (!id) throw new Error('金牌影院：缺少视频 ID');
    return id;
  },

  /// 从 filters 里取剧情选择：值形如 `{type1}|{值}`（多选以逗号相连，取第一个）。
  __pickPlot(filters) {
    var keys = Object.keys(filters || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf('plot') !== 0) continue;
      var raw = String(filters[key] || '').split(',')[0];
      if (!raw) continue;
      var parts = raw.split('|');
      if (parts.length === 2 && parts[1]) return { type1: parts[0], typeId: parts[1] };
    }
    return { type1: '', typeId: '' };
  },

  /// 某一分类的剧情标签组（接口不认就返回 null：这一组不显示，不影响其它组）。
  async __plotGroup(category) {
    var response = await this.__api('/anonymous/get/filer/getClassByType', { type1: category.id });
    var raw = response && response.data ? response.data : [];
    var options = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i] || {};
      if (String(item.dictCode || '') !== 'FILTER_PLOT') continue;
      if (item.itemValue == null) continue;
      var value = String(item.itemValue);
      if (seen[value]) continue;
      seen[value] = true;
      options.push({ id: category.id + '|' + value, title: String(item.itemText || value) });
    }
    if (!options.length) return null;
    return { id: 'plot-' + category.id, title: category.title + '剧情', options: options };
  },

  /// 列表分页结果 → 契约形状（items + hasMore）。
  __pageOf(response, page) {
    var payload = response && response.data ? response.data : {};
    var raw = payload.list && payload.list.length ? payload.list : [];
    var items = [];
    for (var i = 0; i < raw.length; i++) items.push(this.__toItem(raw[i]));
    var total = Number(payload.totalCount) || 0;
    var totalPage = Number(payload.totalPage) || 0;
    var hasMore;
    if (totalPage > 0) {
      hasMore = page < totalPage;
    } else if (total > 0) {
      hasMore = page * PAGE_SIZE < total;
    } else {
      hasMore = raw.length >= PAGE_SIZE;
    }
    return { items: items, hasMore: hasMore };
  },

  __toItem(item) {
    item = item || {};
    return {
      id: String(item.vodId != null ? item.vodId : item.id),
      title: String(item.vodName || item.vodId || ''),
      cover: item.vodPic ? String(item.vodPic) : '',
      subtitle: this.__remark(item)
    };
  },

  __remark(item) {
    var parts = [];
    if (item.vodRemarks) parts.push(String(item.vodRemarks));
    if (item.vodScore || item.vodDoubanScore) parts.push('评分 ' + (item.vodScore || item.vodDoubanScore));
    if (item.vodVersion) parts.push(String(item.vodVersion));
    if (!parts.length && item.vodTotal) parts.push('共 ' + item.vodTotal + ' 集');
    return parts.join(' · ');
  },

  __tags(info) {
    var raw = String(info.vodClass || '').split(',');
    var tags = [];
    for (var i = 0; i < raw.length; i++) {
      var text = raw[i].trim();
      if (text) tags.push(text);
    }
    return tags;
  },

  __clean(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // ---------------------------------------------------------------- 网络与签名

  /// 所有接口唯一的出口：拼签名头、选可用域、发请求、解析 JSON 外壳。
  ///
  /// 域的顺序：**桥接地址**（配置了就用它，普通 HTTP 代理无效）→ 沙盒里记住的
  /// 可用域 → 候选表。某个域被 WAF 拦下（521 / 验证页）就跳过它试下一个；
  /// 全都不行时抛 `WAF_RECAPTCHA_V3`（App 认出后给「配置桥接服务」的提示）。
  async __api(path, params) {
    var deviceId = await this.__deviceId();
    var t = new Date().getTime();
    var sign = this.__sign(params, t);
    var query = this.__query(params);
    var wire = API_PATH + path + (query ? '?' + query : '');

    var hosts = await this.__hosts();
    var lastFailure = '';
    var sawWaf = false;
    var sawBlocked = false;
    for (var i = 0; i < hosts.length; i++) {
      var url = hosts[i] + wire;
      var response = await LumeSource.http.get(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'client-type': '1',
          'deviceId': deviceId,
          'authorization': '',
          'sign': sign,
          't': String(t),
          'Referer': this.__origin(hosts[i]) + '/'
        }
      });
      var status = response ? Number(response.status) : 0;
      var body = response && response.body ? String(response.body) : '';
      if (status === 521 || /waf_captcha_marker|okokcdn_recaptcha_verify|请进行安全验证/.test(body)) {
        // 本站自己的 reCAPTCHA v3 WAF：这个域废了，换下一个。
        lastFailure = 'HTTP ' + status + ' ' + url;
        sawWaf = true;
        await this.__forgetHost(hosts[i]);
        continue;
      }
      if (status === 403 || status === 503 || status === 429) {
        // 另一类拦截（地域 / IP 封禁 / 限流）：也先换域；全都不行时按
        // 「网页视图」给用户一个出口（与其它源同一口径）。
        lastFailure = 'HTTP ' + status + ' ' + url;
        sawBlocked = true;
        await this.__forgetHost(hosts[i]);
        continue;
      }
      if (status !== 200) {
        throw new Error('拉取失败：HTTP ' + status + ' ' + url);
      }
      var parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (error) {
        throw new Error('金牌影院返回的不是合法 JSON：' + path);
      }
      if (parsed && parsed.code != null && Number(parsed.code) !== 200) {
        throw new Error('金牌影院接口错误：' + (parsed.msg || parsed.code) + ' ' + path);
      }
      await this.__rememberHost(hosts[i]);
      return parsed;
    }
    // 两类拦截都在时以 reCAPTCHA v3 为准（那是本站真实的那道 WAF，
    // 网页视图对它是死路，得给桥接提示）。
    if (sawBlocked && !sawWaf) {
      throw new Error('NEED_WEBVIEW_VERIFY：金牌影院被站点防护拦下（' + lastFailure
        + '）——可在网页视图里过一次校验再重试');
    }
    throw new Error(
      'WAF_RECAPTCHA_V3：金牌影院（jpyy2.com / vv3nwjk.com）启用了 reCAPTCHA v3 WAF'
      + '（' + (lastFailure || '全部候选域都被拦下') + '）。'
      + '放行状态绑在浏览器会话与服务端 IP 信誉上，没有可复用的 Cookie。'
    );
  },

  /// 候选域列表：桥接地址（配置了就只有它）→ 记住的可用域 → 默认候选表。
  /// 当前生效的域（记忆优先 → 候选表首个），给 Referer 用。
  async __activeHost() {
    var hosts = await this.__hosts();
    return hosts.length ? hosts[0] : SITE_URL;
  },

  /// 域 → origin（去路径）。
  __originOf(host) {
    var match = /^https?:\/\/[^\/]+/.exec(String(host || ''));
    return match ? match[0] : SITE_URL;
  },

  async __hosts() {
    var bridge = '';
    try {
      if (typeof LumeSource !== 'undefined' && LumeSource.bridge) {
        bridge = String(LumeSource.bridge).replace(/\/+$/, '');
      }
    } catch (error) { /* 读不到就没有桥接 */ }
    if (bridge) return [bridge];

    var hosts = [];
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved && saved.indexOf('http') === 0) hosts.push(saved);
    } catch (error) { /* 读不到就按默认顺序 */ }
    for (var i = 0; i < API_HOSTS.length; i++) {
      if (hosts.indexOf(API_HOSTS[i]) < 0) hosts.push(API_HOSTS[i]);
    }
    return hosts;
  },

  async __rememberHost(host) {
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved !== host) await LumeSource.fs.writeText(HOST_KEY, host);
    } catch (error) { /* 存不下也能用 */ }
  },

  async __forgetHost(host) {
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved === host) await LumeSource.fs.remove(HOST_KEY);
    } catch (error) { /* 删不掉也不影响本次 */ }
  },

  __origin(host) {
    var text = String(host || '');
    var match = /^https?:\/\/[^\/]+/.exec(text);
    return match ? match[0] : SITE_URL;
  },

  /// 稳定设备号：一台设备只生成一次，存在沙盒存储里。
  async __deviceId() {
    try {
      var saved = await LumeSource.fs.readText(DEVICE_KEY);
      if (saved) return saved;
    } catch (error) { /* 读不到就重新生成 */ }
    var id = this.__uuid();
    try { await LumeSource.fs.writeText(DEVICE_KEY, id); } catch (error) { /* 存不下也能用 */ }
    return id;
  },

  __uuid() {
    var chars = '0123456789abcdef';
    var out = '';
    for (var i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * 16));
    return out.slice(0, 8) + '-' + out.slice(8, 12) + '-' + out.slice(12, 16)
      + '-' + out.slice(16, 20) + '-' + out.slice(20, 32);
  },

  /// GET 查询串：参数按 key 升序、**值做百分号编码**（与站点前端一致）。
  __query(params) {
    var keys = Object.keys(params || {}).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      parts.push(encodeURIComponent(keys[i]) + '=' + encodeURIComponent(params[keys[i]]));
    }
    return parts.join('&');
  },

  /// 签名串：参数按 key 升序、**值原样**（不编码）拼 `k=v&k=v`。
  __sign(params, t) {
    var keys = Object.keys(params || {}).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) parts.push(keys[i] + '=' + params[keys[i]]);
    var g = parts.join('&');
    var h = (g ? g + '&' : '') + 'key=' + SIGN_KEY + '&t=' + t;
    return this.__sha1(this.__md5(h));
  },

  // ---------------------------------------------------------------- 哈希
  // 纯 JS 的 MD5 / SHA1，输出十六进制小写（沙箱没有 Node 的 crypto）。
  // 已用标准测试向量校验（"abc" → 900150983cd24fb0d6963f7d28e17f72 /
  // a9993e364706816aba3e25717850c26c9cd0d89d）。

  __md5(str) {
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function rotl(n, c) { return ((n << c) | (n >>> (32 - c))) >>> 0; }
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32(rotl(a, s), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    function hexLE(v) {
      var s = '';
      for (var i = 0; i < 4; i++) s += ('0' + ((v >>> (i * 8)) & 255).toString(16)).slice(-2);
      return s;
    }

    var bytes = this.__utf8Bytes(str);
    var n = bytes.length;
    var total = ((n + 8) >> 6 << 4) + 16;
    var x = [];
    var z;
    for (z = 0; z < total; z++) x[z] = 0;
    for (z = 0; z < n; z++) x[z >> 2] |= bytes[z] << ((z % 4) * 8);
    x[n >> 2] |= 0x80 << ((n % 4) * 8);
    x[total - 2] = n * 8;

    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (z = 0; z < total; z += 16) {
      var oa = a, ob = b, oc = c, od = d;
      a = ff(a, b, c, d, x[z], 7, -680876936); d = ff(d, a, b, c, x[z + 1], 12, -389564586);
      c = ff(c, d, a, b, x[z + 2], 17, 606105819); b = ff(b, c, d, a, x[z + 3], 22, -1044525330);
      a = ff(a, b, c, d, x[z + 4], 7, -176418897); d = ff(d, a, b, c, x[z + 5], 12, 1200080426);
      c = ff(c, d, a, b, x[z + 6], 17, -1473231341); b = ff(b, c, d, a, x[z + 7], 22, -45705983);
      a = ff(a, b, c, d, x[z + 8], 7, 1770035416); d = ff(d, a, b, c, x[z + 9], 12, -1958414417);
      c = ff(c, d, a, b, x[z + 10], 17, -42063); b = ff(b, c, d, a, x[z + 11], 22, -1990404162);
      a = ff(a, b, c, d, x[z + 12], 7, 1804603682); d = ff(d, a, b, c, x[z + 13], 12, -40341101);
      c = ff(c, d, a, b, x[z + 14], 17, -1502002290); b = ff(b, c, d, a, x[z + 15], 22, 1236535329);
      a = gg(a, b, c, d, x[z + 1], 5, -165796510); d = gg(d, a, b, c, x[z + 6], 9, -1069501632);
      c = gg(c, d, a, b, x[z + 11], 14, 643717713); b = gg(b, c, d, a, x[z], 20, -373897302);
      a = gg(a, b, c, d, x[z + 5], 5, -701558691); d = gg(d, a, b, c, x[z + 10], 9, 38016083);
      c = gg(c, d, a, b, x[z + 15], 14, -660478335); b = gg(b, c, d, a, x[z + 4], 20, -405537848);
      a = gg(a, b, c, d, x[z + 9], 5, 568446438); d = gg(d, a, b, c, x[z + 14], 9, -1019803690);
      c = gg(c, d, a, b, x[z + 3], 14, -187363961); b = gg(b, c, d, a, x[z + 8], 20, 1163531501);
      a = gg(a, b, c, d, x[z + 13], 5, -1444681467); d = gg(d, a, b, c, x[z + 2], 9, -51403784);
      c = gg(c, d, a, b, x[z + 7], 14, 1735328473); b = gg(b, c, d, a, x[z + 12], 20, -1926607734);
      a = hh(a, b, c, d, x[z + 5], 4, -378558); d = hh(d, a, b, c, x[z + 8], 11, -2022574463);
      c = hh(c, d, a, b, x[z + 11], 16, 1839030562); b = hh(b, c, d, a, x[z + 14], 23, -35309556);
      a = hh(a, b, c, d, x[z + 1], 4, -1530992060); d = hh(d, a, b, c, x[z + 4], 11, 1272893353);
      c = hh(c, d, a, b, x[z + 7], 16, -155497632); b = hh(b, c, d, a, x[z + 10], 23, -1094730640);
      a = hh(a, b, c, d, x[z + 13], 4, 681279174); d = hh(d, a, b, c, x[z], 11, -358537222);
      c = hh(c, d, a, b, x[z + 3], 16, -722521979); b = hh(b, c, d, a, x[z + 6], 23, 76029189);
      a = hh(a, b, c, d, x[z + 9], 4, -640364487); d = hh(d, a, b, c, x[z + 12], 11, -421815835);
      c = hh(c, d, a, b, x[z + 15], 16, 530742520); b = hh(b, c, d, a, x[z + 2], 23, -995338651);
      a = ii(a, b, c, d, x[z], 6, -198630844); d = ii(d, a, b, c, x[z + 7], 10, 1126891415);
      c = ii(c, d, a, b, x[z + 14], 15, -1416354905); b = ii(b, c, d, a, x[z + 5], 21, -57434055);
      a = ii(a, b, c, d, x[z + 12], 6, 1700485571); d = ii(d, a, b, c, x[z + 3], 10, -1894986606);
      c = ii(c, d, a, b, x[z + 10], 15, -1051523); b = ii(b, c, d, a, x[z + 1], 21, -2054922799);
      a = ii(a, b, c, d, x[z + 8], 6, 1873313359); d = ii(d, a, b, c, x[z + 15], 10, -30611744);
      c = ii(c, d, a, b, x[z + 6], 15, -1560198380); b = ii(b, c, d, a, x[z + 13], 21, 1309151649);
      a = ii(a, b, c, d, x[z + 4], 6, -145523070); d = ii(d, a, b, c, x[z + 11], 10, -1120210379);
      c = ii(c, d, a, b, x[z + 2], 15, 718787259); b = ii(b, c, d, a, x[z + 9], 21, -343485551);
      a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
    }
    return hexLE(a) + hexLE(b) + hexLE(c) + hexLE(d);
  },

  __sha1(str) {
    function rotl(n, c) { return ((n << c) | (n >>> (32 - c))) >>> 0; }
    function hexBE(v) {
      var s = '';
      for (var i = 0; i < 4; i++) s += ('0' + ((v >>> ((3 - i) * 8)) & 255).toString(16)).slice(-2);
      return s;
    }

    var bytes = this.__utf8Bytes(str);
    var n = bytes.length;
    var total = ((n + 8) >> 6 << 4) + 16;
    var w = [];
    var z;
    for (z = 0; z < total; z++) w[z] = 0;
    for (z = 0; z < n; z++) w[z >> 2] |= bytes[z] << (24 - (z % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    w[total - 1] = n * 8;

    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    for (var j = 0; j < total; j += 16) {
      var ww = w.slice(j, j + 16);
      for (var k = 16; k < 80; k++) {
        ww[k] = rotl(ww[k - 3] ^ ww[k - 8] ^ ww[k - 14] ^ ww[k - 16], 1);
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (k = 0; k < 80; k++) {
        var f, g;
        if (k < 20) { f = (b & c) | (~b & d); g = 0x5A827999; }
        else if (k < 40) { f = b ^ c ^ d; g = 0x6ED9EBA1; }
        else if (k < 60) { f = (b & c) | (b & d) | (c & d); g = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; g = 0xCA62C1D6; }
        var t2 = (rotl(a, 5) + f + e + g + ww[k]) | 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = t2;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return hexBE(h0) + hexBE(h1) + hexBE(h2) + hexBE(h3) + hexBE(h4);
  },

  // 把 JS 字符串按 UTF-8 编成字节数组（沙箱没有 TextEncoder 时也能用）。
  __utf8Bytes(text) {
    var str = String(text);
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        var next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return bytes;
  }
};
