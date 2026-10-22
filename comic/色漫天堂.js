// LumeSource: {"id":"smtt6_comic","name":"色漫天堂","version":"1.0.0","category":"comic","mirrors":["https://smtt6.com","https://www.smtt6.com"]}

// 站点：https://smtt6.com （色漫天堂，韩漫 / 日漫 / 真人 / 3D，HS 系模板）
//
// 结构（2026-10-22 用真站逐页核过）：
//   首页      GET /               五个板块：热门漫画 / 最新更新 / 站长推荐 / 新上架漫画 / 已完结漫画，
//                                  每块 24 条，「更多」各自指向下面的分类路径。
//   分类      GET /man-hua-lei-bie/<类型>/ob/<排序>/st/<状态>[/page/N]
//             类型：all / 日漫 / 韩漫 / 真人 / 3D漫画 / 同性
//             排序：time / hits      状态：all / completed / serialized
//             分页是路径式 `/page/N`，页头写「X / Y页」，末页不再有 N+1 的链接。
//   固定列表  GET /xin-man-hua（最新，单页不翻）、/re-men-man-hua（排行，单页不翻）、
//             /xin-man-hua/recommend（站长推荐）、/xin-man-hua/nb（新上架）。
//   搜索      GET /man-hua-sou-suo/<关键词>/ob/time/st/all[/page/N]（实测可用，路径式分页）
//   详情      GET /man-hua-yue-du/<id>.html
//             标题 h1.hl-dc-title、封面 .hl-dc-pic span[data-original]、
//             状态 / 作者 / TAG / 简介都在 `hl-vod-data` 的 li 里。
//   章节     详情页 ul#hl-plays-list 的 a.module-play-list-link（标题在 title 属性，
//             形如「漫画名-第1话-小标题」），顺序就是站点顺序（第1话在前）。
//   正文     GET /man-hua-yue-du/<id>/<hash>.html
//             页面图是 `img[data-original]`（图床 p3p / p4p / p6.18rouman.vip，懒加载）。
//             实测图床带不带 Referer 都 200；仍统一带站内 Referer，换图床时不至于裸奔。
//
// 已知站点行为（不是脚本漏解析）：章节列表是站点**自己**给的，长连载可能缺号
// （实测《小姐》详情页只列出 1-105 与 168-175，站点上就没有 106-167 的入口）。
// 脚本按站点给的来，不凭空补章节。
var H = {
  base: '', name: '色漫天堂', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'' )).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); },
  entity: function(s) {return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,function(v){var map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[v])return map[v];var code=v.charAt(2)==='x'?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(code)?String.fromCodePoint(code):v;});},
  attr: function(s,k) {var m=new RegExp('(?:^|\\s)'+k+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s||'');return this.entity(m?(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'');},
  abs: function(u,from) {u=this.entity(u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.indexOf('//')===0)return 'https:'+u;var b=from||this.base;if(u.charAt(0)==='/')return /^https?:\/\/[^/]+/.exec(b)[0]+u;return b.replace(/[^/]*$/,'')+u;},
  headers: function(page) {return {'User-Agent':this.ua,'Referer':page||this.base+'/'};},
  response: function(r) {if(!r)throw new Error(this.name+'：没有网络响应');var s=r.status;if(s===403||s===503||s===521)throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+s+'）');if(s===404)throw new Error(this.name+'：页面不存在（HTTP 404）');if(s!==200)throw new Error(this.name+'：请求失败（HTTP '+s+'）');var b=String(r.body||'');if(/cf-chl-|Just a moment|cf-turnstile|<title>\s*人机校验/i.test(b))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证');return b;},
  get: async function(u) {return this.response(await LumeSource.http.get(this.abs(u,this.base+'/'),{headers:this.headers()}));},
  tree: function(html) {html=String(html).replace(/<!--[^]*?-->/g,'').replace(/<script\b[^]*?<\/script>|<style\b[^]*?<\/style>/gi,'');var root={tag:'root',attrs:{},children:[],raw:''},stack=[root],re=/<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi,m;while((m=re.exec(html))){var parent=stack[stack.length-1];if(m[3]){parent.children.push({tag:'#text',raw:m[3],attrs:{},children:[]});continue;}var tag=m[1].toLowerCase();if(m[0].charAt(1)==='/'){for(var i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}var attrs={},ar=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,a;while((a=ar.exec(m[2])))attrs[a[1].toLowerCase()]=H.entity(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);var node={tag:tag,attrs:attrs,children:[],raw:'',parent:parent};parent.children.push(node);if(!/^(?:img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(tag)&&! /\/$/.test(m[2]))stack.push(node);}return root;},
  all: function(node,pred) {var out=[],stack=[node];while(stack.length){var n=stack.pop();if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')continue;for(var i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);}return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  text: function(root) {if(!root)return '';if(root.tag==='#text')return this.entity(root.raw);if(root.tag==='script'||root.tag==='style')return '';var frames=[{node:root,i:0,parts:[]}];while(true){var top=frames[frames.length-1],node=top.node;if(top.i<node.children.length){var child=node.children[top.i++];if(child.tag==='#text'){top.parts.push(this.entity(child.raw));continue;}if(child.tag==='script'||child.tag==='style'){top.parts.push('');continue;}frames.push({node:child,i:0,parts:[]});continue;}var rendered=this.clean(top.parts.join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\n':''));frames.pop();if(!frames.length)return rendered;frames[frames.length-1].parts.push(rendered);}},
  first: function(node,pred) {return this.all(node,pred)[0];},
  unique: function(items) {var seen={};return items.filter(function(i){if(!i.id||seen[i.id]||!i.title)return false;seen[i.id]=true;return true;});},
  imageContent: function(images,page) {if(!images.length)throw new Error(this.name+'：没有读取到正文图片');var headers={};images.forEach(function(u){headers[u]=H.headers(page);});return {kind:'images',images:images,imageHeaders:headers};}
};

H.defaultBase = 'https://smtt6.com';
H.useDomain = function () {
  var config = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  this.base = String((config && config.domain) || this.defaultBase).replace(/\/+$/, '');
  return this.base;
};
H.base = H.defaultBase;
H.name = '色漫天堂';

/// 章节目录：按站点顺序；长连载缺号是站点自己没给入口，不补。
function chapterTitle(raw, fallback) {
  var text = H.clean(raw || '');
  var tail = /(第\s*\d+\s*[话話][\s\S]*)$/.exec(text);
  if (tail) return tail[1].trim();
  var last = /((?:最终|番外|后记|序章|特別篇)[\s\S]*)$/.exec(text);
  if (last) return last[1].trim();
  return text || H.clean(fallback || '');
}

var LumeSource = {
  id: 'smtt6_comic',
  name: '色漫天堂',
  version: '1.0.0',
  category: 'comic',
  mirrors: ['https://smtt6.com', 'https://www.smtt6.com'],

  /// 列表卡片：`li.hl-list-item`（封面链接与标题链接各一个，按 id 去重）。
  __items: function (tree) {
    var self = this;
    return H.unique(
      H.all(tree, function (n) {
        return n.tag === 'li' && H.cls(n, 'hl-list-item');
      }).map(function (li) {
        var link = H.first(li, function (n) {
          return n.tag === 'a' && /^\/man-hua-yue-du\/\d+\.html$/.test(n.attrs.href || '');
        });
        if (!link) return { id: '', title: '' };
        var thumb = H.first(li, function (n) {
          return n.attrs && n.attrs['data-original'] !== undefined;
        });
        var sub = H.first(li, function (n) {
          return n.tag === 'div' && H.cls(n, 'hl-item-sub');
        });
        var title = H.clean(link.attrs.title || '') || H.clean(H.text(link));
        return {
          id: link.attrs.href,
          title: title,
          cover: thumb ? H.abs(thumb.attrs['data-original']) : null,
          coverHeaders: H.headers(H.base + '/'),
          subtitle: sub ? H.clean(H.text(sub)) : ''
        };
      })
    );
  },

  /// 分类 / 搜索的地址。站点是**路径式**筛选：
  /// `/man-hua-lei-bie/<类型>/ob/<排序>/st/<状态>[/page/N]`
  __listUrl: function (categoryId, keyword, page, filters) {
    var raw = String(categoryId == null ? '' : categoryId).trim();
    var f = filters || {};
    var order = f.order === 'hits' ? 'hits' : 'time';
    var status = f.status === 'completed' || f.status === 'serialized' ? f.status : 'all';
    var url;
    if (keyword) {
      url = '/man-hua-sou-suo/' + encodeURIComponent(keyword) + '/ob/' + order + '/st/' + status;
    } else if (/^\/man-hua-lei-bie\/[^/]+\/ob\/[^/]+\/st\/[^/]+$/.test(raw)) {
      // 用户点的是分类页自带的某一档（含「已完结」「按阅读」这类入口）：换掉排序 / 状态即可。
      var parts = raw.split('/');
      parts[4] = order;
      parts[6] = status;
      url = parts.join('/');
    } else if (/^\/man-hua-lei-bie\/[^/]+$/.test(raw)) {
      url = raw + '/ob/' + order + '/st/' + status;
    } else if (raw && /^\/(?:xin-man-hua|re-men-man-hua)(?:\/[A-Za-z0-9-]+)?$/.test(raw)) {
      // 最新 / 排行 / 站长推荐 / 新上架：站点自己就是单页，不套筛选、不翻页。
      url = raw;
    } else {
      url = '/man-hua-lei-bie/all/ob/' + order + '/st/' + status;
    }
    if (page > 1 && !/^\/(?:xin-man-hua|re-men-man-hua)(?:\/|$)/.test(url)) {
      url += '/page/' + page;
    }
    return url;
  },

  /// 首页：站点自己的五个板块，各取前 12 条；「更多」用站点给的分类路径。
  async home() {
    H.useDomain();
    var html = await H.get('/');
    var starts = [];
    var re = /<div class="hl-rb-head/g, m;
    while ((m = re.exec(html)) !== null) starts.push(m.index);
    if (!starts.length) throw new Error('色漫天堂：首页没认出板块（站点可能改版）');
    var boards = [];
    for (var i = 0; i < starts.length; i++) {
      var block = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);
      var head = block.slice(0, 800);
      var title = H.clean((/<h[23][^>]*>([\s\S]*?)<\/h[23]>/.exec(head) || [])[1] || '');
      if (!title) {
        var headText = H.clean(head);
        title = (headText.split('更多')[0] || '').trim();
      }
      var more = /class="[^"]*hl-rb-more[^"]*"[^>]*href="([^"]+)"/.exec(head);
      var items = this.__items(H.tree(block));
      if (!items.length) continue;
      boards.push({
        title: title || '推荐',
        moreUrl: more ? more[1] : null,
        items: items.slice(0, 12)
      });
    }
    if (!boards.length) throw new Error('色漫天堂：首页板块里没有条目（站点可能改版）');
    return boards;
  },

  /// 分类＝站点自己的分类族 + 四个固定列表。
  async categories() {
    return [
      { id: '/man-hua-lei-bie/all', title: '全部' },
      { id: '/man-hua-lei-bie/日漫', title: '日漫' },
      { id: '/man-hua-lei-bie/韩漫', title: '韩漫' },
      { id: '/man-hua-lei-bie/真人', title: '真人' },
      { id: '/man-hua-lei-bie/3D漫画', title: '3D漫画' },
      { id: '/man-hua-lei-bie/同性', title: '同性' },
      { id: '/man-hua-lei-bie/all/ob/time/st/completed', title: '已完结' },
      { id: '/xin-man-hua', title: '最新更新' },
      { id: '/re-men-man-hua', title: '人气排行' },
      { id: '/xin-man-hua/nb', title: '新上架' }
    ];
  },

  /// 筛选：类型 / 排序 / 状态，值与站点筛选条逐项对应。
  async filters() {
    return { groups: [
      { id: 'type', title: '类型', options: [
        { id: 'all', title: '全部' }, { id: '日漫', title: '日漫' }, { id: '韩漫', title: '韩漫' },
        { id: '真人', title: '真人' }, { id: '3D漫画', title: '3D漫画' }, { id: '同性', title: '同性' }
      ] },
      { id: 'order', title: '排序', options: [
        { id: 'time', title: '按更新' }, { id: 'hits', title: '按阅读' }
      ] },
      { id: 'status', title: '状态', options: [
        { id: 'all', title: '全部' }, { id: 'serialized', title: '更新中' }, { id: 'completed', title: '已完结' }
      ] }
    ] };
  },

  async list(argument) {
    H.useDomain();
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = H.clean(args.keyword || '').trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    // 选了「类型」就把分类换成对应族；没选则沿用用户点的分类。
    if (!keyword && filters.type && /^\/man-hua-lei-bie\/[^/]+$/.test(category)) {
      category = '/man-hua-lei-bie/' + filters.type;
    }
    var url = this.__listUrl(category, keyword, page, filters);
    var html = await H.get(url);
    var tree = H.tree(html);
    var items = this.__items(tree);
    if (!items.length) console.warn('[smtt6] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
    var total = /hl-page-total">([^<]*)</.exec(html);
    var hasMore;
    if (total) {
      var pair = /(\d+)\s*\/\s*(\d+)/.exec(H.clean(total[1]));
      hasMore = pair ? Number(pair[1]) < Number(pair[2]) : false;
    } else {
      hasMore = new RegExp('/page/' + (page + 1) + '(?!\\d)').test(html);
    }
    return { items: items, hasMore: hasMore };
  },

  /// 详情：标题 / 封面 / 状态 + 作者 / TAG / 简介。
  async detail(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!/^\/man-hua-yue-du\/\d+\.html$/.test(id)) return null;
    var html = await H.get(id);
    var tree = H.tree(html);
    var head = H.first(tree, function (n) {
      return n.tag === 'h1' && H.cls(n, 'hl-dc-title');
    });
    var title = head ? H.clean(H.text(head)) : '';
    if (!title) return null;
    var coverNode = H.first(tree, function (n) {
      return n.tag === 'span' && H.cls(n, 'hl-item-thumb') && n.attrs['data-original'];
    });
    var cover = coverNode ? H.abs(coverNode.attrs['data-original']) : null;
    var status = H.clean(((/状态：<\/em>\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(html)) || [])[1] || '');
    var author = H.clean(((/作者：<\/em>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(html)) || [])[1] || '');
    var tags = [];
    var tagBox = /TAG：<\/em>([\s\S]*?)<\/li>/.exec(html);
    if (tagBox) {
      var tagRe = /<a[^>]+href="\/man-hua-lei-bie\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g, tm;
      while ((tm = tagRe.exec(tagBox[1])) !== null) {
        var tag = H.clean(tm[1]);
        if (tag && tags.indexOf(tag) < 0) tags.push(tag);
      }
    }
    var blurb = /简介：<\/em>([\s\S]*?)<\/li>/.exec(html);
    var description = blurb ? H.clean(blurb[1]) : '';
    var subtitle = [];
    if (status) subtitle.push(status);
    if (author) subtitle.push('作者：' + author);
    if (tags.length) subtitle.push('TAG：' + tags.join(' / '));
    return {
      id: id,
      title: title,
      cover: cover,
      coverHeaders: H.headers(H.base + '/'),
      subtitle: subtitle.join(' · '),
      description: description
    };
  },

  /// 章节：详情页 ul#hl-plays-list（站点顺序=第 1 话在前）。
  async chapters(argument) {
    H.useDomain();
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!id) return [];
    var html = await H.get(id);
    var rows = [];
    var seen = {};
    var re = /<a class="module-play-list-link" href="([^"]+)" title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, m;
    while ((m = re.exec(html)) !== null) {
      var href = m[1];
      if (!/^\/man-hua-yue-du\/\d+\/[^/]+\.html$/.test(href) || seen[href]) continue;
      seen[href] = true;
      rows.push({ id: href, title: chapterTitle(m[2], m[3]) });
    }
    rows.forEach(function (row, index) {
      if (!row.title) row.title = '第 ' + (index + 1) + ' 话';
    });
    if (!rows.length) throw new Error('色漫天堂：这个作品没有读取到章节（站点结构可能已变化）');
    return rows;
  },

  /// 正文：整话一页，页面图是 `img[data-original]`（图床 18rouman.vip）。
  async content(argument) {
    H.useDomain();
    var chapterId = String((argument && argument.chapterId) || (argument && argument.id) || '').trim();
    if (!/^\/man-hua-yue-du\/\d+\/[^/]+\.html$/.test(chapterId)) {
      throw new Error('色漫天堂：认不出章节地址（' + chapterId + '）——章节 id 应当来自 chapters()');
    }
    var page = H.abs(chapterId);
    var html = await H.get(chapterId);
    var images = [];
    var seen = {};
    var tag = /<img\b[^>]*>/gi, m;
    while ((m = tag.exec(html)) !== null) {
      var url = H.abs(H.attr(m[0], 'data-original') || H.attr(m[0], 'data-src') || H.attr(m[0], 'src'), page);
      if (!/^https?:\/\//i.test(url)) continue;
      // 统计像素、站点 logo、图标一律不算正文。
      if (/mc\.yandex\.ru|\/imgs\/|\/static\/|\/logo\./i.test(url)) continue;
      if (seen[url]) continue;
      seen[url] = true;
      images.push(url);
    }
    if (!images.length) throw new Error('色漫天堂：这一话没有读取到图片（站点结构可能已变化）');
    return H.imageContent(images, page);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
