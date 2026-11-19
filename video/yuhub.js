// LumeSource: {"id":"yuhub_video","name":"欲Hub","version":"1.0.1","category":"video","contentCategory":"adult","mirrors":["https://allpian.com"],"network":"direct","icon":"https://allpian.com/favicon.ico"}
//
// 站点：欲Hub（https://allpian.com，Nuxt 3 SPA，原 91TV 搬迁站；全站 18+）
//
// ── 页面是空壳，数据全在独立 API 域
//   站点域  https://allpian.com            （SPA 外壳，静态资源在 yyyhjs.jdec74.top）
//   接口域  https://alipa.mamnvbyiu5od.com （POST，路径直接挂在根上，没有 /api 前缀）
//
// ── ★ 每个请求都要加密 + 签名（2026-11-16 实测，全部由前端 bundle 逆出）
//   1) suffix  = 6 位随机串（字符表 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ）
//   2) 签名     encode_sign = md5( 所有 "k=v" 排序后 join('&') + '&' + SIGN_SALT )
//              参与签名的字段 = 业务参数 + timestamp（不含 encode_sign 本身）
//   3) 请求体   {"post-data": AES-256-CBC( JSON(参数 + encode_sign + timestamp) )}
//              key = AES_KEY（32 字节，UTF-8）
//              iv  = IV_PREFIX（10 字节）+ suffix  → 正好 16 字节
//              padding PKCS7，密文 base64
//   4) 请求头   suffix: <suffix>, lang: zh-cn
//   5) 响应      {suffix, data}；data 再用同一个 key、iv=IV_PREFIX+响应suffix 解一次 base64 → JSON
//   沙箱里用宿主原生能力：HOST.tools.digest / tools.aes / tools.base64Encode。
//
// ── 接口（都是 POST）
//   GET-ish 无参   /config/list  /video/channel  /video/tags  /title/lists  /rank/lists
//   视频列表       /video/list        {page, list_row, keyword?}  → data:{total, current_page, data:[…]}
//   视频详情       /video/info        {id}                        → data:{…, video_url, cat_info, tags}
//   ★ 参数名是 list_row 不是 pageSize/page_size。
//   ★ 分类筛选（cat_id / tag_id / channel_id …）实测全部不生效，只有 keyword 有效；
//     所以分类用「频道名 / 标签名 当关键词搜」这条路，见 categories()/filters()。
//
// ── 播放地址
//   /video/info 的 data.video_url 就是带签名的 m3u8：
//     https://vt.cheqiao.cc/…/index.m3u8?wsSecret=…&wsTime=…
//   ★ wsTime 只有 **5 分钟** 有效期（实测详情接口每次调用都发新的），
//     所以 content() 必须现场调 /video/info，不能用列表里缓存下来的地址。
//   ★ 分片是 AES-128 **标准加密**（key 16 字节直接可用，无混淆），
//     m3u8 里的 key/分片 URL 自带同一套签名，播放器按清单取即可。
//   ⚠ 分片的 Content-Type 被 CDN 配成了 text/vnd.trolltech.linguist（.ts 被当成 Qt 翻译文件），
//     严格的 iOS AVPlayer 可能拒播；Android 的 ExoPlayer / mpv 会嗅探内容所以正常。
//
// ── 来源与分级
//   comefrom_info 显示本站聚合了麻豆、乌拉、爱豆、Swag 等 260 个频道；
//   内容全部为成人向，contentCategory = adult。

// 宿主注入的 LumeSource（带 http/tools/fs）会在文件末尾被本源的导出对象覆盖，
// 所以先存一份引用，后面统一走 HOST.xxx。
var HOST = LumeSource;

var SITE = 'https://allpian.com';
var API = 'https://alipa.mamnvbyiu5od.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.1.0 Safari/537.36';

var AES_KEY = 'Vq234zBeSdGgYXzVTEfnnjjdmaTkk7A4';       // 32 字节 → AES-256
var IV_PREFIX = '-p9B[~PnPs';                            // 10 字节，+6 位 suffix = 16
var SIGN_SALT = 'm}q%ea6:LDcmS?aK)CeF287bPvd99@E,9Up^';
var SUFFIX_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var PAGE_LIMIT = 20;

// 实测能在标题里命中的大类关键词（keyword 搜索），用来当分类
var FEEDS = ['国产', '麻豆', 'Swag', '自拍', '中文字幕'];

var CHANNELS = null;   // {id,name,total}
var TAGS = null;

function randSuffix() {
  var out = '';
  for (var i = 0; i < 6; i++) out += SUFFIX_CHARS.charAt(Math.floor(Math.random() * SUFFIX_CHARS.length));
  return out;
}

/// 参与签名的字段：业务参数 + timestamp（与前端 Hx() 一致：排序后 join('&') 再拼 SALT）
async function signOf(params) {
  var parts = [];
  for (var k in params) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    var v = params[k];
    // 前端是 (n || n === 0 || n === '') 才收，空字符串也算
    if (v || v === 0 || v === '') parts.push(k + '=' + v);
  }
  parts.sort();
  return String(await HOST.tools.digest('md5', parts.join('&') + '&' + SIGN_SALT)).toLowerCase();
}

async function encryptBody(plain, suffix) {
  var b64 = await HOST.tools.base64Encode(plain);
  return HOST.tools.aes({
    key: btoa(AES_KEY),
    iv: btoa(IV_PREFIX + suffix),
    data: b64,
    mode: 'CBC',
    encrypt: true
  });
}

async function decryptBody(cipherB64, suffix) {
  var plainB64 = await HOST.tools.aes({
    key: btoa(AES_KEY),
    iv: btoa(IV_PREFIX + suffix),
    data: String(cipherB64),
    mode: 'CBC',
    encrypt: false
  });
  return HOST.tools.base64Decode(String(plainB64));
}

/// 一次完整的加密请求 → 解密后的 JSON
async function api(path, params) {
  if (HOST.config && HOST.config.domain) SITE = String(HOST.config.domain).replace(/\/+$/, '');
  var suffix = randSuffix();
  var timestamp = Date.now();
  var payload = {};
  var k;
  for (k in params || {}) {
    if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
  }
  payload.timestamp = timestamp;
  payload.encode_sign = await signOf(payload);

  var cipher = await encryptBody(JSON.stringify(payload), suffix);
  var reply = await HOST.http.post(
    API + path,
    JSON.stringify({ 'post-data': cipher }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Lume-Read-Only': '1',
        'User-Agent': UA,
        Referer: SITE + '/',
        Origin: SITE,
        suffix: suffix,
        lang: 'zh-cn'
      }
    }
  );
  var status = Number(reply && reply.status);
  var text = String((reply && reply.body) || '');
  if (status !== 200) throw new Error('欲Hub：接口 HTTP ' + status + '（' + path + '）');
  var outer;
  try { outer = JSON.parse(text); }
  catch (e) { throw new Error('欲Hub：接口返回不是 JSON（' + path + '）'); }

  if (outer && outer.data && outer.suffix) {
    var plain = await decryptBody(outer.data, String(outer.suffix));
    var inner;
    try { inner = JSON.parse(plain); }
    catch (e2) { throw new Error('欲Hub：响应解密后不是 JSON（' + path + '）'); }
    return inner;
  }
  return outer;
}

/* ------------------------------- 列表解析 ------------------------------- */

function abs(url) {
  var t = String(url == null ? '' : url).trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (t.indexOf('//') === 0) return 'https:' + t;
  if (t.charAt(0) === '/') return SITE + t;
  return SITE + '/' + t;
}

function clock(sec) {
  var total = Math.floor(Number(sec) || 0);
  if (!total) return '';
  var m = Math.floor(total / 60), s = total % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}

function toItem(row) {
  if (!row || !row.id) return null;
  var title = String(row.title || '').trim();
  if (!title) return null;
  var bits = [];
  if (row.cat_info && row.cat_info.cat_name) bits.push(String(row.cat_info.cat_name));
  if (row.duration) bits.push(clock(row.duration));
  if (row.play) bits.push(row.play + ' 播放');
  if (Number(row.is_vip) === 1) bits.push('VIP');
  return {
    id: String(row.id),
    title: title,
    cover: abs(row.thumb || row.preview || ''),
    subtitle: bits.join(' · ')
  };
}

function pageOf(reply) {
  var d = reply && reply.data ? reply.data : reply;
  var rows = Array.isArray(d) ? d : (Array.isArray(d && d.data) ? d.data : []);
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var it = toItem(rows[i]);
    if (it) items.push(it);
  }
  var total = Number((d && d.total) || 0);
  var current = Number((d && d.current_page) || 0);
  var per = Number((d && d.per_page) || PAGE_LIMIT) || PAGE_LIMIT;
  return { items: items, hasMore: total > current * per };
}

async function fetchPage(page, keyword) {
  var params = { page: page, list_row: PAGE_LIMIT };
  if (keyword) params.keyword = String(keyword);
  var reply = await api('/video/list', params);
  if (reply && reply.code !== undefined && reply.code !== 0) {
    throw new Error('欲Hub：列表失败（' + (reply.msg || 'code ' + reply.code) + '）');
  }
  return pageOf(reply);
}

/* ------------------------------- 频道 / 标签 ------------------------------- */

async function loadChannels() {
  if (CHANNELS) return CHANNELS;
  var reply = await api('/video/channel', {});
  var rows = Array.isArray(reply && reply.data) ? reply.data : [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i] || {};
    if (!c.id || !c.name) continue;
    out.push({ id: String(c.id), name: String(c.name), total: Number(c.total) || 0 });
  }
  out.sort(function (a, b) { return b.total - a.total; });
  CHANNELS = out;
  return CHANNELS;
}

async function loadTags() {
  if (TAGS) return TAGS;
  var reply = await api('/video/tags', {});
  var rows = Array.isArray(reply && reply.data) ? reply.data : [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i] || {};
    if (!t.name) continue;
    if (Number(t.is_show) === 0) continue;
    out.push({ id: String(t.key || t.id || t.name), name: String(t.name) });
  }
  out.sort(function (a, b) { return b.name.length - a.name.length; });
  TAGS = out;
  return TAGS;
}

/* ------------------------------- 导出 ------------------------------- */

var LumeSource = {
  id: 'yuhub_video',
  name: '欲Hub',
  version: '1.0.1',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://allpian.com'],

  async categories() {
    // 站点没有可用的分类树接口（cat_id / tag_id / channel_id 传了全不生效），
    // 只有 keyword 有效。下面这几个是 2026-11-16 实测能在标题里命中的大类关键词
    // （所谓「频道名」「运营标签」多数搜不到 0 条，比如「麻豆APP」「热门推荐」，别用）。
    var rows = [{ id: 'feed_latest', title: '最新' }];
    for (var i = 0; i < FEEDS.length; i++) rows.push({ id: 'kw_' + FEEDS[i], title: FEEDS[i] });
    return rows;
  },

  async home() {
    var terms = [''].concat(FEEDS.slice(0, 2));
    var outcomes = await Promise.all(terms.map(async function (keyword) {
      try {
        var result = await fetchPage(1, keyword);
        return { board: {title: keyword || '\u6700\u65b0',
          moreUrl: keyword ? 'kw_' + keyword : 'feed_latest',
          items: result.items.slice(0, keyword ? 12 : 18)} };
      } catch (error) { return {error: error}; }
    }));
    var boards = outcomes.filter(function (entry) {
      return entry.board && entry.board.items.length;
    }).map(function (entry) { return entry.board; });
    if (!boards.length) {
      for (var i = 0; i < outcomes.length; i++) {
        if (outcomes[i].error) throw outcomes[i].error;
      }
      throw new Error('No home items returned by source');
    }
    return boards;
  },

  /// 筛选：标签（用标签名当关键词）
  async filters() {
    try {
      var tags = await loadTags();
      return {
        groups: [{
          id: 'tag',
          title: '标签',
          options: tags.slice(0, 40).map(function (t) { return { id: t.name, title: t.name }; })
        }]
      };
    } catch (error) {
      return { groups: [] };
    }
  },

  async list(argument) {
    var arg = argument || {};
    var page = Number(arg.page || 1) || 1;
    if (page < 1) page = 1;

    var keyword = arg.keyword ? String(arg.keyword).trim() : '';
    if (keyword) return fetchPage(page, keyword);

    var categoryId = arg.categoryId ? String(arg.categoryId) : 'feed_latest';
    var pick = '';
    if (arg.filters) {
      if (arg.filters.tag) pick = String(arg.filters.tag).split(',')[0];
      else if (arg.filters.channel) pick = String(arg.filters.channel).split(',')[0];
    }
    if (pick) return fetchPage(page, pick);

    if (categoryId.indexOf('kw_') === 0) return fetchPage(page, categoryId.slice(3));
    return fetchPage(page, '');
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^\d]/g, '');
    if (!id) return null;
    var reply = await api('/video/info', { id: Number(id) });
    var d = (reply && reply.data) || {};
    if (!d.id) return null;
    var lines = [];
    if (d.cat_info && d.cat_info.cat_name) lines.push('频道：' + d.cat_info.cat_name);
    if (d.updated_at) lines.push('更新：' + String(d.updated_at).slice(0, 16));
    if (d.play) lines.push(d.play + ' 播放 · ' + (d.like || 0) + ' 赞');
    if (d.duration) lines.push('时长 ' + clock(d.duration));
    var tagNames = [];
    var ts = Array.isArray(d.tags) ? d.tags : [];
    for (var i = 0; i < ts.length; i++) if (ts[i] && ts[i].name) tagNames.push(String(ts[i].name));
    if (tagNames.length) lines.push('标签：' + tagNames.join(' / '));
    if (d.description && String(d.description) !== '-') lines.push('', String(d.description));
    return {
      id: id,
      title: String(d.title || id),
      cover: abs(d.thumb || d.preview || ''),
      desc: lines.join('\n')
    };
  },

  async chapters() {
    return [{ id: '0', title: '正片' }];
  },

  async content(argument) {
    var arg = argument || {};
    var id = String(arg.id || '').replace(/[^\d]/g, '');
    if (!id) throw new Error('欲Hub：缺少 id');

    // wsTime 只有 5 分钟，必须现场换一次新签名，不能用列表里带下来的旧地址
    var reply = await api('/video/info', { id: Number(id) });
    var d = (reply && reply.data) || {};
    if (!d.id) throw new Error('欲Hub：取不到详情（id ' + id + '）');

    var url = String(d.video_url || '').trim();
    if (!url) throw new Error('欲Hub：这条没有播放地址（可能已下架或需要 VIP）');

    return {
      kind: 'video',
      url: url,
      headers: {
        Referer: SITE + '/',
        Origin: SITE,
        'User-Agent': UA
      }
    };
  }
};
