// LumeSource: {"id":"dytt_video","name":"电影天堂","version":"1.0.0","category":"video"}
//
// 电影天堂的资源站接口（苹果 CMS V10 的 `api.php/provide/vod/`）。纯 JSON，无 CF、
// 无签名、无 Referer 门槛，因此这一份是**直连可用**的源里最省事的一个。
//
// ============================================================================
// Verified live API（2026-10-14 实测；base = http://caiji.dyttzyapi.com/api.php/provide/vod/）
// ============================================================================
//
//   GET ?ac=list&pg=N[&t=<type_id>]
//       -> {code:1, page, pagecount, total, limit:"20", list[], class[]}
//          列表项只有：vod_id / vod_name / type_id / type_name / vod_time / vod_remarks
//          —— **没有封面**（实测 20/20 条都没有 vod_pic 字段）。
//   GET ?ac=detail&pg=N[&t=<type_id>]
//       -> 同结构，但每条是**完整记录**（含 vod_pic / 简介 / vod_play_url…），
//          代价是体积：一页 20 条约 190KB（ac=list 只要 6KB）。
//   GET ?ac=detail&wd=<关键词>&pg=N        -> 搜索（20/页，pagecount 准确）
//   GET ?ac=detail&ids=<vod_id>            -> 单条完整记录
//
//   class[]：32 项。其中 type_pid=0 的 4 项（电影片 / 连续剧 / 综艺片 / 动漫片）
//   在本站**筛不出内容**（实测 t=1、t=4 返回 total=0；t=2 只回 1 条），
//   真正能用的是 28 个子类（动作片 / 欧美剧 / 日韩动漫…，实测 t=6/16/20/30/31 均正常）。
//   因此分类只列**子类**，标题带父类前缀（「电影片 · 动作片」）——列父类等于给用户
//   一个点进去必空的入口。
//
//   播放地址：`vod_play_from` / `vod_play_url` 都是 `$$$` 分隔的多条线路，线路内 `#`
//   分集、每集是「集名$地址」。本站两条线：
//     dytt      = 网页播放页 `https://vip.dytt-tvs.com/share/<hash>`
//                 （直连返回 200 但**空体**，是 JS 播放页，内核播不了 → 脚本跳过它）
//     dyttm3u8  = 直连 HLS `https://vip.dytt-tvs.com/<日期>/<id>_<hash8>/index.m3u8`
//                 （实测 200 + `audio/x-mpegurl`，**不需要 Referer**）
//   个别分集的文件在上游本身就是 404（资源站自己的空档，实测第 1 集就有；同一部剧的
//   第 2 集正常）。这个脚本预检不了——播放器报错时换一集或换另一条线路即可。
//
// ============================================================================
// 取舍与边界
// ============================================================================
//
// - 列表默认用 `ac=detail`：**为了封面**（视频板块是海报墙，没封面很难看）。
//   嫌首屏流量大就把下面 LIST_MODE 改成 'list'（快 30 倍，但整页没封面）。
// - 线路当成「清晰度」交给播放器（控制栏的「清晰度」菜单里能看到 dytt / dyttm3u8），
//   主地址优先挑**能直接播的那条**（.m3u8/.mp4），不把网页播放页塞给内核。
// - 站点是资源站（只提供接口，不提供网页播放体验）：它的数据来自采集，**链接可能
//   有空档或过期**；脚本不做假成功——取不到可播地址就抛出点名到原因的错误。
var BASE_URL = 'http://caiji.dyttzyapi.com/api.php/provide/vod/';

/// 列表模式：'detail' = 带封面（~190KB/页）；'list' = 极快（~6KB/页）但无封面。
var LIST_MODE = 'detail';

/// 分类缓存时长（毫秒）：class 表很少变，不必每次进页面都问一遍。
var CLASS_TTL = 6 * 60 * 60 * 1000;

/// 可直连给内核播的地址形态（其余形态——例如网页播放页——不进线路列表）。
var PLAYABLE = /\.(m3u8|mp4|flv)(\?|#|$)/i;

var LumeSource = {
  id: 'dytt_video',
  name: '电影天堂',
  version: '1.0.0',
  category: 'video',

  /// 分类 = 站点的 28 个子类（父类在本站筛不出内容，见文件头）。
  async categories() {
    var cached = await this.__cachedClasses();
    if (cached) return cached;
    // 没有缓存时用一次列表请求把 class 拿回来（6KB，很快）。
    var data = await this.__api('ac=list&pg=1');
    var groups = this.__categories(data && data.class);
    await this.__storeClasses(groups);
    return groups;
  },

  /// 列表 / 搜索。
  ///
  /// [categoryId] 是子类 type_id；[keyword] 非空时走搜索（站点自己按关键词匹配）。
  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var query = keyword
      ? 'ac=detail&wd=' + encodeURIComponent(keyword) + '&pg=' + page
      : (LIST_MODE === 'detail' ? 'ac=detail' : 'ac=list') + '&pg=' + page
        + (category ? '&t=' + encodeURIComponent(category) : '');
    var data = await this.__api(query);

    var items = [];
    var raw = (data && data.list) || [];
    for (var i = 0; i < raw.length; i++) {
      var item = this.__item(raw[i]);
      if (item) items.push(item);
    }
    // 顺手刷新分类缓存：列表响应里本来就带 class 表。
    if (data && data.class && data.class.length) {
      await this.__storeClasses(this.__categories(data.class));
    }
    return {
      items: items,
      // pagecount 由站点给，比「满不满一页」猜得准。
      hasMore: Number(data && data.pagecount ? data.pagecount : 0) > page
    };
  },

  /// 详情：单条完整记录。
  async detail(argument) {
    var id = argument && argument.id ? String(argument.id).trim() : '';
    if (!id) return null;
    var data = await this.__api('ac=detail&ids=' + encodeURIComponent(id));
    var record = ((data && data.list) || [])[0];
    if (!record) return null;
    return this.__detail(record);
  },

  /// 「章节」= 分集。线路（dytt / dyttm3u8）不在这里铺开：它是同一集的不同播放方式，
  /// 交给 [content] 当「清晰度」列出来，选集列表才不会被同一集刷屏两遍。
  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id).trim() : '';
    if (!id) return [];
    var record = await this.__record(id);
    if (!record) return [];
    var lines = this.__lines(record);
    var primary = this.__primaryLine(lines);
    if (!primary) return [];
    var chapters = [];
    for (var i = 0; i < primary.episodes.length; i++) {
      chapters.push({ id: 'e' + i, title: primary.episodes[i].title });
    }
    if (!chapters.length) throw new Error('电影天堂：该影片没有可播放的剧集');
    return chapters;
  },

  /// 播放地址：按分集序号把各条线路的地址收齐，优先给**能直连播的那条**做主地址，
  /// 其余线路放进 qualities（播放器控制栏的「清晰度」里可切换）。
  async content(argument) {
    var id = argument && argument.id ? String(argument.id).trim() : '';
    var chapterId = argument && argument.chapterId ? String(argument.chapterId) : '';
    if (!id) throw new Error('缺少影片 id，无法取播放地址');

    var indexed = /^e(\d+)$/.exec(chapterId);
    var index = indexed ? Number(indexed[1]) : 0;

    var record = await this.__record(id);
    if (!record) throw new Error('电影天堂：影片不存在或已从资源站下架（id=' + id + '）');
    var lines = this.__lines(record);
    var primary = this.__primaryLine(lines);
    if (!primary) throw new Error('电影天堂：这条影片没有剧集数据（vod_play_url 为空）');

    var target = primary.episodes[index];
    if (!target) {
      throw new Error('电影天堂：第 ' + (index + 1) + ' 集不在剧集表里（共 '
        + primary.episodes.length + ' 集）');
    }

    // 同一集在不同线路上的地址（按集名对齐，集名一致才收；集数不同的线路按序号兜底）。
    var labels = [];
    var seen = {};
    var candidates = [];
    for (var i = 0; i < lines.length; i++) {
      var episode = this.__episodeAt(lines[i], target.title, index);
      if (!episode || !episode.url) continue;
      if (seen[episode.url]) continue;
      seen[episode.url] = true;
      candidates.push({ label: lines[i].name || ('线路 ' + (i + 1)), url: episode.url });
    }

    var playable = [];
    var others = [];
    for (var j = 0; j < candidates.length; j++) {
      if (PLAYABLE.test(candidates[j].url)) playable.push(candidates[j]);
      else others.push(candidates[j]);
    }
    if (!playable.length) {
      var reason = others.length
        ? '（本站只给了 ' + others.length + ' 条**网页播放页**地址：'
          + others[0].url.slice(0, 80) + '，内核播不了这种页面）'
        : '（该集在所有线路上都没有地址）';
      throw new Error('电影天堂：这一集没有可直连的播放地址' + reason);
    }

    // 「清晰度」= 线路，但**只列能直连播的**：网页播放页（dytt）塞进内核只会得到
    // 一片黑，列出来等于给用户一个必错的选项（它连 200 空体都算，见文件头实测）。
    var qualities = [];
    for (var k = 0; k < playable.length; k++) {
      qualities.push({ label: playable[k].label, url: playable[k].url });
    }
    return { kind: 'video', url: playable[0].url, qualities: qualities };
  },

  // ------------------------------------------------------------------ 内部

  /// 发一次接口请求并解析 JSON（错误里带 HTTP 状态与原始 query，便于定位）。
  async __api(query) {
    var url = BASE_URL + '?' + query;
    var response = await LumeSource.http.get(url, {
      headers: { 'Accept': 'application/json, text/plain, */*', 'Referer': BASE_URL }
    });
    var status = response ? response.status : 0;
    if (status === 403 || status === 503) {
      throw new Error('电影天堂：资源站拦下了请求（HTTP ' + status + '）');
    }
    if (status !== 200) {
      throw new Error('电影天堂：拉取失败（HTTP ' + status + '）：' + query);
    }
    var data = null;
    try {
      data = JSON.parse(String(response.body || 'null'));
    } catch (error) {
      throw new Error('电影天堂：返回的不是合法 JSON（' + query + '）');
    }
    if (data && data.code !== undefined && Number(data.code) !== 1) {
      throw new Error('电影天堂：接口返回错误 ' + data.code + ' ' + (data.msg || ''));
    }
    return data;
  },

  /// 取单条完整记录（detail / chapters / content 共用）。
  async __record(id) {
    var data = await this.__api('ac=detail&ids=' + encodeURIComponent(id));
    return ((data && data.list) || [])[0] || null;
  },

  /// 列表项 → App 契约的 item。
  __item(record) {
    var id = record && record.vod_id != null ? String(record.vod_id) : '';
    if (!id) return null;
    var bits = [];
    if (record.type_name) bits.push(String(record.type_name));
    if (record.vod_year && String(record.vod_year) !== '0') bits.push(String(record.vod_year));
    if (record.vod_remarks) bits.push(String(record.vod_remarks));
    return {
      id: id,
      title: String(record.vod_name || id),
      cover: record.vod_pic ? this.__absolute(String(record.vod_pic)) : null,
      subtitle: bits.join(' · ')
    };
  },

  /// 完整记录 → 详情。
  __detail(record) {
    var bits = [];
    if (record.type_name) bits.push(String(record.type_name));
    if (record.vod_year && String(record.vod_year) !== '0') bits.push(String(record.vod_year));
    if (record.vod_area) bits.push(String(record.vod_area));
    if (record.vod_remarks) bits.push(String(record.vod_remarks));
    if (record.vod_score && Number(record.vod_score) > 0) bits.push('评分 ' + record.vod_score);
    var description = this.__clean(record.vod_content);
    if (record.vod_actor) description += '\n\n主演：' + record.vod_actor;
    if (record.vod_director) description += '\n导演：' + record.vod_director;
    return {
      id: String(record.vod_id || ''),
      title: String(record.vod_name || ''),
      cover: record.vod_pic ? this.__absolute(String(record.vod_pic)) : null,
      subtitle: bits.join(' · '),
      description: description.trim()
    };
  },

  /// 解析多线路结构：`vod_play_from` / `vod_play_url` 都是 `$$$` 分隔、一一对应。
  __lines(record) {
    var names = String((record && record.vod_play_from) || '').split('$$$');
    var groups = String((record && record.vod_play_url) || '').split('$$$');
    var lines = [];
    for (var i = 0; i < groups.length; i++) {
      var raw = String(groups[i] || '').trim();
      if (!raw) continue;
      var episodes = [];
      var parts = raw.split('#');
      for (var j = 0; j < parts.length; j++) {
        var entry = String(parts[j] || '').trim();
        if (!entry) continue;
        // 「集名$地址」：按**第一个** $ 切，地址里再出现 $ 也不受影响。
        var cut = entry.indexOf('$');
        var title;
        var url;
        if (cut < 0) {
          title = '第' + (episodes.length + 1) + '集';
          url = entry;
        } else {
          title = entry.slice(0, cut).trim();
          url = entry.slice(cut + 1).trim();
        }
        if (!url) continue;
        episodes.push({ title: title || ('第' + (episodes.length + 1) + '集'), url: url });
      }
      if (!episodes.length) continue;
      lines.push({ name: String(names[i] || ('线路 ' + (i + 1))), episodes: episodes });
    }
    return lines;
  },

  /// 选集顺序以「第一条**能直连播**的线路」为准：它才是用户真正会播的那条，
  /// 网页播放页线路（dytt）集名一致时按集名对齐，不一致就整条跳过。
  __primaryLine(lines) {
    var chosen = null;
    for (var i = 0; i < lines.length; i++) {
      var episodes = lines[i].episodes;
      var playable = 0;
      for (var j = 0; j < episodes.length; j++) {
        if (PLAYABLE.test(episodes[j].url)) playable++;
      }
      if (playable > 0) return lines[i];
      if (!chosen) chosen = lines[i];
    }
    return chosen;
  },

  /// 在一条线路里找某一集：先按集名（换线路时集名最可靠），找不到按序号。
  __episodeAt(line, title, index) {
    for (var i = 0; i < line.episodes.length; i++) {
      if (line.episodes[i].title === title) return line.episodes[i];
    }
    return line.episodes[index] || null;
  },

  /// class 表 → 分类列表（只列子类；父类在本站筛不出内容，见文件头）。
  __categories(classes) {
    if (!classes || !classes.length) return [];
    var parents = {};
    var i;
    for (i = 0; i < classes.length; i++) {
      if (Number(classes[i].type_pid) === 0) {
        parents[String(classes[i].type_id)] = String(classes[i].type_name || '');
      }
    }
    var result = [];
    for (i = 0; i < classes.length; i++) {
      var child = classes[i];
      if (Number(child.type_pid) === 0) continue;
      var parent = parents[String(child.type_pid)] || '';
      result.push({
        id: String(child.type_id),
        title: parent ? parent + ' · ' + String(child.type_name || '') : String(child.type_name || '')
      });
    }
    return result;
  },

  /// 分类缓存（进程内 + fs，双保险；fs 是按图源隔离的进程内存储）。
  async __cachedClasses() {
    try {
      var raw = await LumeSource.fs.readText('classes.json');
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || !box.at || !box.items || !box.items.length) return null;
      if (Date.now() - Number(box.at) > CLASS_TTL) return null;
      return box.items;
    } catch (error) {
      return null;
    }
  },

  async __storeClasses(items) {
    if (!items || !items.length) return;
    try {
      await LumeSource.fs.writeText('classes.json',
        JSON.stringify({ at: Date.now(), items: items }));
    } catch (error) {
      // 存不下就算了（下次再问一次站点，不影响浏览）。
    }
  },

  /// 相对地址补全（资源站偶尔回 `/upload/...` 这种）。
  __absolute(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return 'http://caiji.dyttzyapi.com' + (url.charAt(0) === '/' ? url : '/' + url);
  },

  /// 简介去标签与实体（资源站的简介里偶有 <p> / &nbsp;）。
  __clean(text) {
    return String(text == null ? '' : text)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
};
