// LumeSource: {"id":"pornpaw_photo","name":"PornPaw 图集","version":"1.2.0","category":"photo","contentCategory":"adult","mirrors":["https://www.pornpaw.com","https://pornpaw.com"],"icon":"https://www.pornpaw.com/favicon.ico","network":"direct"}
// LumeRuntime: javascript
//
// 站点：PornPaw（https://www.pornpaw.com）成人图片站，服务端渲染 HTML，无需账号。
// 放在 photo/ 目录 → App 里落在「漫画 → 美图」分组（category 声明 photo，宿主归一成 comic 板块）。
//
// 实测结构（2026-11-17）：
//   · 最新：/                分页 /?page=N        每页 15 套
//   · 分类：/listcategory.php → /gallery/category/<slug>.html
//                             分页 /gallery/category/<slug>/<N>（第 1 页 = /1）
//   · 搜索：/search.php?search=<kw>  固定一次返回 30 套，忽略 page 参数（实测 page=2 与 page=1 同集合）
//   · 图集：/gallery/<gid>_<slug>.html   标题 + `N images in Tag, Tag` + 全部图片页缩略图
//           图片页 /gallery/<gid>_<slug>/<imgId>.html 里 <img id="main-image" src=".../<imgId>.jpg">
//   · CDN：https://cdn.pornpaw.com/images/<路径>/<imgId>.jpg 为大图，
//          同目录 <imgId>x160.jpg 为缩略图 → 大图 = 把 x160 去掉。CDN 无防盗链（不带 Referer 也 200）。
//   · 已删除的图片页返回 HTTP 410，图集详情页只列还有效的图，因此不额外过滤。
//
// v1.1.0：真机（2026-11-17 截图）出现「暂无首页推荐内容 + 分类只剩最新图集」——
// 那是 v1.0.0 把网络失败静默兜底了。现在改成：
//   · 域名/协议归一（用户只填 pornpaw.com 也能用）；
//   · 线路探测：https 主站 → http 主站 → 裸域，命中后缓存 6 小时，失败才逐个试；
//   · 分类/首页失败一律抛可读原因（含尝试过的线路与 HTTP 状态），不再伪装「没有内容」；
//   · 人机校验仍抛 NEED_WEBVIEW_VERIFY，让 App 给网页视图过校验。
// v1.2.0：站点在 Cloudflare 后面，只放行浏览器 UA —— python-urllib / URLSession 的
// CFNetwork 默认 UA 一律 403（2026-11-17 对照实测），所以每个请求自己带 UA；
// 映页（URLSession 不补 UA）与 LumeBox 都能直接跑。
// 18+

var SITE = 'https://www.pornpaw.com';
// Cloudflare 只放行浏览器 UA：同一个 URL 用 python-urllib / CFNetwork 默认 UA 会 403，
// 脚本必须自己带上，不能指望宿主补（映页的 URLSession 就不带）——实测见 2026-11-17 对照。
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 15;
var CAT_TTL_MS = 12 * 3600 * 1000;
var GALLERY_TTL_MS = 30 * 60 * 1000;
var HOST_TTL_MS = 6 * 3600 * 1000;

// 候选线路：先用户/镜像给的域名，再按 https → http → 裸域 依次试。
// 站点换域名或本机被 SNI 拦时，换到 http 常常还能通（App 有 ATS 兜底重发）。
var CANDIDATES = ['https://www.pornpaw.com', 'http://www.pornpaw.com', 'https://pornpaw.com', 'http://pornpaw.com'];
// 单次调用里最多试几条线路：脚本没有「单请求超时」能力，卡住的线路会吃掉整个调用预算，
// 所以只在快速失败（连接被拒 / DNS / HTTP 错误 / 人机校验）时换线，最多换一次。
var MAX_ATTEMPTS = 2;

var _origin = '';

function normalizeOrigin(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  text = text.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text.replace(/^\/+/, '');
  return text.replace(/\/+$/, '');
}

function configuredOrigin() {
  return normalizeOrigin(LumeSource.config && LumeSource.config.domain);
}

// 当前生效的线路；没探测过就用配置域名 / 主站（解析出的绝对地址都基于它）。
function site() {
  if (_origin) return _origin;
  return configuredOrigin() || SITE;
}

function decode(textValue) {
  return String(textValue == null ? '' : textValue)
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, function (whole, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function (whole, num) {
      return String.fromCharCode(Number(num));
    });
}

function plain(html) {
  return decode(String(html == null ? '' : html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  var value = decode(String(url == null ? '' : url)).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (value.charAt(0) === '/') return site() + value;
  return site() + '/' + value;
}

// ---------------------------------------------------------------- 宿主请求

function bodyOf(reply) {
  try {
    return reply && reply.text ? String(reply.text()) : String((reply && reply.body) || '');
  } catch (error) {
    return String((reply && reply.body) || '');
  }
}

function isChallenge(body) {
  return /Just a moment|cf-chl-|cf-turnstile|Attention Required|Enable JavaScript and cookies/i.test(body);
}

async function rawGet(url) {
  var reply = await LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: site() + '/',
    },
  });
  var status = reply && typeof reply.status === 'number' ? reply.status : 0;
  return { status: status, body: bodyOf(reply) };
}

async function readCache(key) {
  try {
    var raw = await LumeSource.fs.readText(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function writeCache(key, value) {
  try {
    await LumeSource.fs.writeText(key, JSON.stringify(value));
  } catch (error) {
    /* 缓存失败不影响浏览 */
  }
}

// 线路顺序：缓存命中的线路优先，其次用户设置的域名，再按 https → http → 裸域 依次备选。
// 注意这里只排顺序、不发探测请求 —— 抓不到就换下一条，正常情况只花一次请求。
async function originOrder() {
  var list = [];
  var seen = {};
  var push = function (value) {
    var origin = normalizeOrigin(value);
    if (!origin || seen[origin]) return;
    seen[origin] = true;
    list.push(origin);
  };
  var cached = await readCache('host.json');
  if (cached && cached.origin && Date.now() - Number(cached.at || 0) < HOST_TTL_MS) push(cached.origin);
  push(configuredOrigin());
  for (var i = 0; i < CANDIDATES.length; i++) push(CANDIDATES[i]);
  return list;
}

// 抓一个路径：按线路顺序真发请求，成功即缓存该线路；全部失败时把每条线路的真实原因拼进错误。
// `optional` 为 true 时不把 404/410 当失败（图集可能已被删）。
async function fetchHtml(path, optional) {
  var list = (await originOrder()).slice(0, MAX_ATTEMPTS);
  var tried = [];
  var challenged = '';
  for (var i = 0; i < list.length; i++) {
    var origin = list[i];
    var reply;
    try {
      reply = await rawGet(origin + path);
    } catch (error) {
      tried.push(origin + ' → ' + String((error && error.message) || error));
      continue;
    }
    var status = reply.status;
    if (isChallenge(reply.body) || status === 403 || status === 503 || status === 521) {
      challenged = origin + ' → HTTP ' + status;
      continue;
    }
    if (status === 404 || status === 410) {
      if (optional) return '';
      tried.push(origin + ' → HTTP ' + status);
      continue;
    }
    if (status === 429) {
      tried.push(origin + ' → HTTP 429 请求过于频繁');
      continue;
    }
    if (status < 200 || status >= 300) {
      tried.push(origin + ' → HTTP ' + status);
      continue;
    }
    _origin = origin;
    await writeCache('host.json', { at: Date.now(), origin: origin });
    return reply.body;
  }
  if (challenged) {
    throw new Error('NEED_WEBVIEW_VERIFY：PornPaw 触发了人机校验（' + challenged + '）');
  }
  throw new Error('PornPaw 线路都打不开：' + tried.join('；') + '。可在源设置里换域名，或确认本机网络能否访问该站。');
}

// ---------------------------------------------------------------- HTML 解析

// 列表页（首页 / 分类 / 搜索）里的图集块：
// <div class="mb-1"><a href="/gallery/3187062_mina-red-rose.html">标题</a> &mdash; 86 images in ...</div>
// 后面紧跟 6 张 <img data-src=".../<imgId>x160.jpg">
function galleryItems(html) {
  var source = String(html || '');
  var out = [];
  var seen = {};
  var re = /<a[^>]+href=["'](?:https?:\/\/[^"']+)?\/gallery\/(\d+)_([A-Za-z0-9\-_]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
  var matched;
  while ((matched = re.exec(source)) !== null) {
    var id = matched[1] + '_' + matched[2];
    if (seen[id]) continue;
    var title = plain(matched[3]);
    if (!title) continue;
    seen[id] = true;
    var ahead = source.slice(matched.index, matched.index + 2600);
    var countMatch = /(\d+)\s*images?\b/i.exec(plain(ahead.slice(0, 800)));
    var thumb = /<img[^>]+(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i.exec(ahead);
    out.push({
      id: id,
      title: title,
      cover: thumb ? absolute(thumb[1]) : '',
      subtitle: countMatch ? countMatch[1] + ' 张' : '',
      mediaType: 'photo',
    });
  }
  return out;
}

// 分页块（<nav ... Page navigation>）里最大的页码；没有分页块返回 null。
function maxPageIn(html) {
  var source = String(html || '');
  var at = source.indexOf('Page navigation');
  if (at < 0) return null;
  var chunk = source.slice(at, at + 2600);
  var re = /href=["']([^"']+)["']/gi;
  var numbers = [];
  var matched;
  while ((matched = re.exec(chunk)) !== null) {
    var num = /[?&]page=(\d+)/i.exec(matched[1]) || /\/(\d+)\/?$/.exec(matched[1]);
    if (num) numbers.push(Number(num[1]));
  }
  if (!numbers.length) return null;
  var max = 0;
  for (var i = 0; i < numbers.length; i++) if (numbers[i] > max) max = numbers[i];
  return max;
}

// 图集详情页：标题、标签、图片页顺序 → 大图地址
function parseGallery(html, id) {
  var source = String(html || '');
  var heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source);
  var title = heading ? plain(heading[1]) : '';

  var tags = [];
  var metaLine = /(\d+)\s*images?\s+in\s+([\s\S]{0,600}?)<\/p>/i.exec(source);
  if (metaLine) {
    var tagRe = /category\/([A-Za-z0-9\-_]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
    var tagMatch;
    while ((tagMatch = tagRe.exec(metaLine[2])) !== null) {
      var tagTitle = plain(tagMatch[2]);
      if (tagTitle && tags.indexOf(tagTitle) < 0) tags.push(tagTitle);
    }
  }

  var images = [];
  var seenImage = {};
  var pageRe = new RegExp(
    '<a[^>]+href=["\'](?:https?:\\/\\/[^"\']+)?\\/gallery\\/' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+)\\.html["\'][^>]*>([\\s\\S]{0,700}?)<\\/a>',
    'gi'
  );
  var pageMatch;
  while ((pageMatch = pageRe.exec(source)) !== null) {
    var thumb = /<img[^>]+(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i.exec(pageMatch[2]);
    if (!thumb) continue;
    var full = absolute(thumb[1]).replace(/x160\.(jpe?g|png|gif|webp)$/i, '.$1');
    if (!full || seenImage[full]) continue;
    seenImage[full] = true;
    images.push(full);
  }

  var countMatch = /(\d+)\s*images?\b/i.exec(plain(source.slice(0, 20000)));
  return {
    id: id,
    title: title,
    tags: tags,
    images: images,
    declaredCount: metaLine ? Number(metaLine[1]) : countMatch ? Number(countMatch[1]) : images.length,
  };
}

async function galleryData(id) {
  var key = 'g-' + id + '.json';
  var cached = await readCache(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < GALLERY_TTL_MS) return cached;
  var html = await fetchHtml('/gallery/' + id + '.html', true);
  if (!html) return null;
  var data = parseGallery(html, id);
  data.at = Date.now();
  if (data.title) await writeCache(key, data);
  return data;
}

// 分类表（listcategory.php）12 小时缓存；抓不到就抛，不吞。
async function categoryTable() {
  var cached = await readCache('categories.json');
  if (cached && cached.at && Array.isArray(cached.rows) && Date.now() - Number(cached.at) < CAT_TTL_MS) {
    return cached.rows;
  }
  var html = await fetchHtml('/listcategory.php', true);
  if (!html) throw new Error('PornPaw 分类页打不开（HTTP 410/404）');
  var rows = [];
  var seen = {};
  var re = /<a[^>]+href=["'](?:https?:\/\/[^"']+)?\/gallery\/category\/([A-Za-z0-9\-_]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
  var matched;
  while ((matched = re.exec(html)) !== null) {
    var slug = matched[1];
    if (seen[slug]) continue;
    var title = plain(matched[2]);
    if (!title) continue;
    seen[slug] = true;
    rows.push({ id: 'cat:' + slug, title: title });
  }
  if (!rows.length) throw new Error('PornPaw 分类页里没有解析到分类（站点可能改版）');
  await writeCache('categories.json', { at: Date.now(), rows: rows });
  return rows;
}

// 列表页 → {items, hasMore}；首页与分类共用，home() 也直接调它（不依赖 this）。
async function listPage(args) {
  var options = args || {};
  var page = Math.max(1, Math.floor(Number(options.page) || 1));
  var keyword = String(options.keyword == null ? '' : options.keyword).trim();
  var categoryId = String(options.categoryId == null ? '' : options.categoryId).trim();

  if (keyword) {
    // 搜索页固定返回 30 套且忽略 page 参数，因此没有第二页。
    var searchHtml = await fetchHtml('/search.php?search=' + encodeURIComponent(keyword));
    return { items: galleryItems(searchHtml), hasMore: false };
  }

  var path = '/?page=' + page;
  if (/^cat:[A-Za-z0-9\-_]+$/.test(categoryId)) {
    path = '/gallery/category/' + categoryId.slice(4) + '/' + page;
  }
  var html = await fetchHtml(path);
  var items = galleryItems(html);
  if (!items.length && page === 1) {
    throw new Error('PornPaw 列表页没有解析到图集（站点可能改版）：' + site() + path);
  }
  var maxPage = maxPageIn(html);
  // 页码越界时站点返回空列表且无分页块（实测 /gallery/category/teen/9999 → 0 条）。
  var hasMore = maxPage == null ? items.length >= PAGE_SIZE : maxPage > page;
  return { items: items, hasMore: hasMore };
}

// ---------------------------------------------------------------- 五个入口

var LumeSource = {
  id: 'pornpaw_photo',
  name: 'PornPaw 图集',
  version: '1.2.0',
  category: 'photo',
  contentCategory: 'adult',

  // 分类页抓不到就抛真实原因：不再退回「只有一个最新图集」的假象。
  async categories() {
    var rows = await categoryTable();
    var list = [{ id: 'latest', title: '最新图集' }];
    for (var i = 0; i < rows.length; i++) list.push(rows[i]);
    return list;
  },

  async home() {
    var page = await listPage({ page: 1 });
    return [{ title: '最新图集', moreUrl: 'latest', items: page.items.slice(0, PAGE_SIZE) }];
  },

  async list(argument) {
    return listPage(argument);
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!/^\d+_[A-Za-z0-9\-_]+$/.test(id)) return null;
    var data = await galleryData(id);
    if (!data || !data.title) return null;
    var count = data.images.length || data.declaredCount;
    return {
      id: data.id,
      title: data.title,
      cover: data.images.length ? data.images[0] : '',
      subtitle: count + ' 张 · 左右滑动',
      description: (data.tags.length ? data.tags.join(' · ') + '\n' : '') + '图片 ' + count + ' 张\n' + site() + '/gallery/' + data.id + '.html',
      mediaType: 'photo',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    var cached = await readCache('g-' + id + '.json');
    var count = cached && cached.images ? cached.images.length : 0;
    return [{ id: 'all', title: count ? '全部 ' + count + ' 张' : '全部图片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').trim();
    if (!/^\d+_[A-Za-z0-9\-_]+$/.test(id)) throw new Error('缺少图集 ID');
    var data = await galleryData(id);
    if (!data) throw new Error('图集打不开（可能已被删除）：' + id);
    if (!data.images.length) throw new Error('这套图集没有可读图片');
    return { kind: 'images', images: data.images };
  },
};
