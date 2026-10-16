// LumeSource: {"id":"litu100_comic","name":"丽图漫画","version":"1.0.0","category":"comic","icon":"https://litu100.xyz/images/sites/favicon/14.png"}
//
// 丽图·污漫画（litu100.xyz）—— 小黄书旗下的漫画站：韩漫 / 日漫 / 国漫 / 欧美。
// 真站是 SSR（PHP 模板），列表、详情、阅读页的图片地址都在 HTML 里，脚本直接解析
// （快照见 snapshots/litu_*）。
//
// 站点结构（2026-10-16 实测）：
//   分类      /comics.html（全部）｜/comics/kk-1|2|3.html（连载中 / 已完结 / 单行本）｜
//             /comics/kk-韩国|日本|中国|欧美.html（地区）
//   排序      /comics/sort-added|read|comment.html —— **独立路径**：与状态/地区页拼在
//             一起会被站点当成搜索词（实测 /comics/kk-1-sort-read.html → 无结果），
//             所以排序只在「全部漫画」下生效（筛选里已标注）
//   列表      GET <分类>[?page=N]   页号是查询参数、1 基（/comics.html?page=2 实测）
//   搜索      GET /search.html?keyword=<关键词>   —— 站点自己的搜索索引很薄（实测连站内
//             存在的标题都常查不到），脚本照原样返回，不假装有结果
//   详情      GET /comic/id-<24位id>.html   页面没有 h1（标题取 <title>，「书名 - 丽图·污漫画」）；
//                                           封面在 div[role=img] 的背景图里（img.xchina.io/comics/<id>/cover.jpg）；
//                                           地区 / 作者 / 状态在 div.country|author|status 里
//   剧集      GET /comic/id-<id>.html 里的 /comic/id-<id>/<话号>.html（升序）
//   正文      GET /comic/id-<id>/<话号>.html   属于这一话的
//             'img.xchina.io/comics/<id>/<话号>/<序号>.webp'（按序号升序，推荐位/其它话的图全部排除）
//
// 已知边界：图片在独立图床 img.xchina.io（站点自己的），请求头带站点 Referer；
// 需要登录/VIP 的章节站点自己会拦，脚本如实抛出可读原因。
var H = {
  base: '', name: 'Z8PT图库', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'' )).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); },
  entity: function(s) {return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,function(v){var map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[v])return map[v];var code=v.charAt(2)==='x'?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(code)?String.fromCodePoint(code):v;});},
  attr: function(s,k) {var m=new RegExp('(?:^|\\s)'+k+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s||'');return this.entity(m?(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'');},
  abs: function(u,from) {u=this.entity(u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.indexOf('//')===0)return 'https:'+u;var b=from||this.base;if(u.charAt(0)==='/')return /^https?:\/\/[^/]+/.exec(b)[0]+u;return b.replace(/[^/]*$/,'')+u;},
  headers: function(page) {return {'User-Agent':this.ua,'Referer':page||this.base+'/'};},
  response: function(r) {if(!r)throw new Error(this.name+'：没有网络响应');var s=r.status;if(s===403||s===503||s===521)throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+s+'）');if(s!==200)throw new Error(this.name+'：请求失败（HTTP '+s+'）');var b=String(r.body||'');if(/cf-chl-|Just a moment|cf-turnstile|<title>\s*人机校验/i.test(b))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证');return b;},
  get: async function(u) {return this.response(await LumeSource.http.get(this.abs(u,this.base+'/'),{headers:this.headers()}));},
  post: async function(u,data) {var h=this.headers();h['Content-Type']='application/x-www-form-urlencoded';h['X-Requested-With']='XMLHttpRequest';return this.response(await LumeSource.http.post(this.abs(u,this.base+'/'),data,{headers:h}));},
  json: async function(u) {try{return JSON.parse(await this.get(u));}catch(e){if(/NEED_WEBVIEW_VERIFY|HTTP/.test(String(e)))throw e;throw new Error(this.name+'：数据格式已变化');}},
  tree: function(html) {html=String(html).replace(/<!--[^]*?-->/g,'').replace(/<script\b[^]*?<\/script>|<style\b[^]*?<\/style>/gi,'');var root={tag:'root',attrs:{},children:[],raw:''},stack=[root],re=/<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi,m;while((m=re.exec(html))){var parent=stack[stack.length-1];if(m[3]){parent.children.push({tag:'#text',raw:m[3],attrs:{},children:[]});continue;}var tag=m[1].toLowerCase();if(m[0].charAt(1)==='/'){for(var i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}var attrs={},ar=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,a;while((a=ar.exec(m[2])))attrs[a[1].toLowerCase()]=H.entity(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);var node={tag:tag,attrs:attrs,children:[],raw:'',parent:parent};parent.children.push(node);if(!/^(?:img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(tag)&&! /\/$/.test(m[2]))stack.push(node);}return root;},
  all: function(node,pred) {var out=[];function visit(n){if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')return;n.children.forEach(visit);}visit(node);return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  text: function(node) {if(!node)return '';if(node.tag==='#text')return this.entity(node.raw);if(node.tag==='script'||node.tag==='style')return '';return this.clean(node.children.map(function(n){return H.text(n);}).join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\n':''));},
  first: function(node,pred) {return this.all(node,pred)[0];},
  links: function(node,pattern) {return this.all(node,function(n){return n.tag==='a'&&pattern.test(n.attrs.href||'');});},
  image: function(node) {var img=this.first(node,function(n){return n.tag==='img';});return img?this.abs(img.attrs['data-original']||img.attrs['data-src']||img.attrs['data-lazy-src']||img.attrs.src,this.base+'/'):null;},
  title: function(tree) {var h=this.first(tree,function(n){return n.tag==='h1';});if(h)return this.text(h);var meta=this.first(tree,function(n){return n.tag==='meta'&&(n.attrs.property==='og:title'||n.attrs.name==='title');});if(meta)return meta.attrs.content;return this.text(this.first(tree,function(n){return n.tag==='title';}));},
  cover: function(tree) {var n=this.first(tree,function(n){return n.tag==='meta'&&n.attrs.property==='og:image';});return n?this.abs(n.attrs.content):null;},
  unique: function(items) {var seen={};return items.filter(function(i){if(!i.id||seen[i.id]||!i.title)return false;seen[i.id]=true;return true;});},
  next: function(tree,page) {return this.links(tree,new RegExp('(?:[?&]page=|/page/|/page-)(?:'+(page+1)+')(?:\\D|$)')).length>0;},
  imageContent: function(images,page) {if(!images.length)throw new Error(this.name+'：没有读取到正文图片');var headers={};images.forEach(function(u){headers[u]=H.headers(page);});return {kind:'images',images:images,imageHeaders:headers};},
  textContent: function(text) {if(!text||text.length<20)throw new Error(this.name+'：没有读取到正文，请确认章节是否需要登录');return {kind:'text',text:text};}
};

H.base="https://litu100.xyz";H.name="丽图漫画";
var LumeSource={id:"litu100_comic",name:"丽图漫画",version:"1.0.0",category:"comic",
icon:"https://litu100.xyz/images/sites/favicon/14.png",

/// 分类：站点自己的列表页（状态 / 地区各一组，互斥）+ 排序页。
__CATEGORIES: [
  ['/comics.html', '全部漫画'],
  ['/comics/kk-1.html', '连载中'], ['/comics/kk-2.html', '已完结'], ['/comics/kk-3.html', '单行本'],
  ['/comics/kk-韩国.html', '韩国'], ['/comics/kk-日本.html', '日本'],
  ['/comics/kk-中国.html', '中国'], ['/comics/kk-欧美.html', '欧美']
],
/// 排序：站点自己的三条路径（真站实测；与分类页**不能叠加**——组合路径会被当成搜索，见下）。
__SORTS: [['', '最新更新'], ['added', '最新上架'], ['read', '最多阅读'], ['comment', '最多评论']],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片：div.item.comic —— a[href=/comic/id-<id>.html][title] + **背景图封面**
/// （`div[role=img].img` 的 style 里 background-image：img.xchina.io/comics/<id>/cover.jpg）
/// + div.text 里的「国家 / 标题 / 更新」+ div.tags 里的章节数。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return H.cls(n, 'item') && H.cls(n, 'comic');
    }).map(function (n) {
      var link = H.first(n, function (x) {
        return x.tag === 'a' && /^\/comic\/id-[A-Za-z0-9]+\.html$/.test(x.attrs.href || '');
      });
      var head = H.first(n, function (x) {
        return x.tag === 'div' && H.cls(x, 'title');
      });
      var headLink = head ? H.first(head, function (x) {
        return x.tag === 'a';
      }) : null;
      var bits = [];
      // 只要**叶子** div 的文案（外层包着标题与内层，全收会把标题拼进来）；标题那格跳过。
      H.all(n, function (x) {
        if (x.tag !== 'div' || H.cls(x, 'title')) return false;
        for (var i = 0; i < x.children.length; i++) {
          if (x.children[i].tag === 'div') return false;
        }
        var text = H.text(x);
        return text.length > 1 && text.length < 24;
      }).forEach(function (x) {
        var text = H.text(x);
        if (bits.indexOf(text) < 0 && bits.length < 3) bits.push(text);
      });
      var title = headLink ? H.clean(headLink.attrs.title || H.text(headLink)) : '';
      if (!title && link) title = H.clean(link.attrs.title || '');
      return {
        id: self.__path(link ? link.attrs.href : ''),
        title: title,
        cover: self.__cover(n),
        coverHeaders: H.headers(H.base + '/'),
        subtitle: bits.length ? bits.join(' · ') : null
      };
    })
  );
},

/// 封面：真站用背景图（不是 img）——别指望 H.image。
/// **必须认「这张是漫画封面」**：页面头部还有站点 logo 的背景图，取第一个 background-image
/// 会把 logo 当封面（实测踩过）；所以优先 role="img" 的容器，其次要求地址落在 /comics/ 下。
__cover: function (node) {
  var boxes = H.all(node, function (n) {
    return /background-image/i.test(n.attrs.style || '');
  });
  for (var i = 0; i < boxes.length; i++) {
    var m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(boxes[i].attrs.style);
    if (!m) continue;
    var url = H.abs(m[1], H.base + '/');
    if (/\/(?:comics|comic)\/[^/]+\/cover/i.test(url)) return url;
    if (boxes[i].attrs.role === 'img' && i === 0) return url;
  }
  for (var j = 0; j < boxes.length; j++) {
    var fallback = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(boxes[j].attrs.style);
    if (fallback && /\.(?:webp|jpg|jpeg|png)/i.test(fallback[1])) return H.abs(fallback[1], H.base + '/');
  }
  return H.image(node);
},

/// 还有下一页吗：站点是 `?page=N`（也认 rel=next 与「下一页」字样，任一条命中就算）。
__hasNext: function (tree, page) {
  var links = H.all(tree, function (n) {
    return n.tag === 'a';
  });
  for (var i = 0; i < links.length; i++) {
    var href = links[i].attrs.href || '';
    if (links[i].attrs.rel === 'next') return true;
    if (page && new RegExp('[?&]page=' + (page + 1) + '(?:\\D|$)').test(href)) return true;
    if (/下一页/.test(H.text(links[i]))) return true;
  }
  return false;
},

__pickSort: function (value) {
  var wanted = String(value == null ? '' : value).trim();
  for (var i = 0; i < this.__SORTS.length; i++) {
    if (this.__SORTS[i][0] === wanted) return wanted;
  }
  return '';
},

/// 首页：最新更新 / 韩国 / 日本 三块。
async home() {
  var defs = [['/comics.html', '最新更新'], ['/comics/kk-韩国.html', '韩国'], ['/comics/kk-日本.html', '日本']];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ page: 1, categoryId: defs[i][0] });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (i === 0) throw error;
    }
  }
  return boards;
},

/// 分类：站点自己的 8 个列表页（全部 / 状态 3 / 地区 4）。
async categories() {
  var out = [];
  for (var i = 0; i < this.__CATEGORIES.length; i++) {
    out.push({ id: this.__CATEGORIES[i][0], title: this.__CATEGORIES[i][1] });
  }
  return out;
},

/// 筛选：排序（真站是**独立路径** /comics/sort-<x>.html；与状态/地区页不能叠加——
/// 站点会把组合路径当搜索词，实测），所以排序只在「全部漫画」与关键词搜索下生效。
async filters() {
  var options = [];
  for (var i = 0; i < this.__SORTS.length; i++) options.push({ id: this.__SORTS[i][0], title: this.__SORTS[i][1] });
  return [{ id: 'sort', title: '排序（仅“全部漫画”生效）', options: options }];
},

/// 列表 / 搜索：
///   列表 GET <分类>[?page=N]（页号是查询参数，1 基：/comics.html?page=2 实测）
///   排序 GET /comics/sort-<x>.html[?page=N]（仅当分类是全部漫画、且选了排序）
///   搜索 GET /search.html?keyword=<关键词>（站点自己的搜索索引很薄：查不到就如实返回空）
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var category = this.__path(args.categoryId);
  var sort = this.__pickSort((args.filters || {}).sort);
  var url;
  if (keyword) {
    url = '/search.html?keyword=' + encodeURIComponent(keyword);
    if (sort) url = '/comics/sort-' + sort + '.html';
  } else if (category && category !== '/comics.html' && category !== '/') {
    url = category;
  } else {
    url = sort ? '/comics/sort-' + sort + '.html' : '/comics.html';
  }
  if (!keyword && page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree, page) };
},

/// 详情：页面没有 h1，标题取 <title>（形如「书名 - 丽图·污漫画」）；封面 og:image；
/// 副标题拼「地区 / 作者 / 状态」。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/comic\/id-[A-Za-z0-9]+\.html$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var doc = /<title>([^<]*)<\/title>/i.exec(html);
  var title = doc ? H.clean(doc[1]).replace(/\s*[-–—]\s*丽图.*$/, '').trim() : '';
  if (!title) title = H.title(tree);
  if (!title) return null;
  var self = this;
  var bits = [];
  ['country', 'author', 'status'].forEach(function (cls) {
    var node = H.first(tree, function (n) {
      return H.cls(n, cls) && /^(?:地区|作者|状态)/.test(H.clean(H.text(n))) && H.text(n).length < 40;
    });
    if (!node) return;
    var text = H.clean(H.text(node)).replace(/\s+/g, ' ');
    if (text) bits.push(text);
  });
  // 封面：页面没有 og:image，封面在 /comics/<书号>/cover.jpg（页面头部还有站点 logo，
  // 别被它骗走——按书号精确找）。
  var comicId = (/^\/comic\/id-([A-Za-z0-9]+)\.html$/.exec(id) || [])[1];
  var cover = H.cover(tree);
  if (!cover && comicId) {
    var m = new RegExp('https://img\\.xchina\\.io/comics/' + comicId + '/cover\\.[a-z]+', 'i').exec(html);
    cover = m ? m[0] : null;
  }
  if (!cover) cover = self.__cover(tree);
  return {
    id: id,
    title: title,
    cover: cover,
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ') : null,
    description: null
  };
},

/// 剧集：详情页里的 /comic/id-<id>/<n>.html（真站默认正序）；按 n 升序排一遍更稳。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  var comicId = (/^\/comic\/id-([A-Za-z0-9]+)\.html$/.exec(id) || [])[1];
  if (!comicId) return [];
  var self = this;
  var tree = H.tree(await H.get(id));
  var rows = [];
  var pattern = new RegExp('^/comic/id-' + comicId + '/(\\d+)\\.html$');
  H.all(tree, function (n) {
    return n.tag === 'a' && pattern.test(n.attrs.href || '');
  }).forEach(function (n) {
    var text = H.clean(n.attrs.title || H.text(n));
    rows.push({ id: n.attrs.href, title: text || ('第 ' + (pattern.exec(n.attrs.href || []) || [])[1] + ' 话') });
  });
  rows = H.unique(rows);
  rows.sort(function (a, b) {
    return Number((/\/(\d+)\.html$/.exec(a.id) || [])[1] || 0) - Number((/\/(\d+)\.html$/.exec(b.id) || [])[1] || 0);
  });
  if (!rows.length) throw new Error('丽图漫画：详情页没有取到剧集（可能需要登录，或站点已改版）');
  return rows;
},

/// 正文：阅读页里的 `img.xchina.io/comics/<书号>/<话号>/<序号>.webp`。
/// **只认这一话**（同一页还有推荐位与其它话的图，全部按路径过滤掉），按序号升序。
async content(argument) {
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  var m = /^\/comic\/id-([A-Za-z0-9]+)\/(\d+)\.html$/.exec(id);
  if (!m) throw new Error('丽图漫画：缺少章节地址');
  var comicId = m[1];
  var chapter = m[2];
  var html = await H.get(id);
  var pattern = new RegExp('https://img\\.xchina\\.io/comics/' + comicId + '/' + chapter + '/([0-9]+)(_[0-9]+x[0-9]+)?\\.(webp|jpg|jpeg|png)', 'gi');
  var byStem = {};
  var found;
  while ((found = pattern.exec(html)) !== null) {
    var stem = found[1];
    var withSize = !!found[2];
    var current = byStem[stem];
    if (!current || (withSize && !current.withSize)) byStem[stem] = { url: found[0], withSize: withSize };
  }
  var stems = Object.keys(byStem).sort(function (a, b) {
    return Number(a) - Number(b);
  });
  var images = [];
  for (var i = 0; i < stems.length; i++) images.push(byStem[stems[i]].url);
  if (!images.length) throw new Error('丽图漫画：这一话没有取到图片（可能需要登录，或站点已改版）');
  var page = H.abs(id, H.base + '/');
  var headers = {};
  for (var j = 0; j < images.length; j++) headers[images[j]] = H.headers(page);
  return { kind: 'images', images: images, imageHeaders: headers };
}

};
