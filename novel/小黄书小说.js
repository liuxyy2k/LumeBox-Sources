// LumeSource: {"id":"xchina_novel","name":"小黄书小说","version":"2.0.0","category":"novel","icon":"https://xchina.co/assets/img/favicon.png"}
//
// 小黄书 xChina（xchina.co）的成人小说板块。**本版是照真站重写**（旧版只有一个
// 「最新小说」分类、翻页写成 ?page= 其实站点用的是路径页号、封面也常掉）：
// 拿真实浏览器把列表 / 题材页 / 搜索 / 详情 / 章节页逐个取回来存档，解析内核就对着
// 这些真响应跑（见 snapshots/xchina_*）。
//
// 站点结构（2026-10-16 实测）：
//   题材      /fiction-tag/<编号>   真站导航 23 个（人妻女友…耽美小说、编辑推荐、
//                                   长篇连载、经典回忆、漫画小说、有声小说、色友发表）
//   列表      GET /fictions[/<页>][?sort=&length=]
//             **页号在路径里**（/fictions/2 = 第 2 页），排序 ?sort=read|comment、
//             篇幅 ?length=1|2|3；搜索是 /search?q=<词>&type=fiction[&page=]，全在 HTML 里
//   详情      GET /fiction/<24位id>   标题 h1、封面 og:image / LD+JSON image、
//                                     作者 / 字数 / 题材都在页内 LD+JSON 与信息栏里
//   剧集      GET /fiction/<id>       LD+JSON hasPart（分章）；单页小说没有 hasPart
//   正文      GET /fiction/<id>/<章序>  article[data-reader]（真站排版容器）；
//                                     单页小说退回 LD+JSON articleBody
//
// 已知边界：
// - 封面在独立图床 upload.xchina.io（站点自己的），请求头里带上站点 Referer；
// - VIP / 会员章节站点自己会拦（脚本如实抛出可读原因，不绕过）；
// - 「有声小说」题材在这份源里只当分类浏览（正文仍是文字）；要听语音版用听书源。
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
  all: function(node,pred) {var out=[],stack=[node];while(stack.length){var n=stack.pop();if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')continue;for(var i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);}return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  text: function(root) {if(!root)return '';if(root.tag==='#text')return this.entity(root.raw);if(root.tag==='script'||root.tag==='style')return '';var frames=[{node:root,i:0,parts:[]}];while(true){var top=frames[frames.length-1],node=top.node;if(top.i<node.children.length){var child=node.children[top.i++];if(child.tag==='#text'){top.parts.push(this.entity(child.raw));continue;}if(child.tag==='script'||child.tag==='style'){top.parts.push('');continue;}frames.push({node:child,i:0,parts:[]});continue;}var rendered=this.clean(top.parts.join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\n':''));frames.pop();if(!frames.length)return rendered;frames[frames.length-1].parts.push(rendered);}},
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

H.base="https://xchina.co";H.name="小黄书小说";
var LumeSource={id:"xchina_novel",name:"小黄书小说",version:"2.0.0",category:"novel",
icon:"https://xchina.co/assets/img/favicon.png",

/// 站点自己的题材编号（真站导航里逐条核对过；id 直接进 /fiction-tag/<id>）。
__TAGS: [
  [1, '人妻女友'], [2, '学生校园'], [3, '伴侣交换'], [4, '都市生活'],
  [5, '动漫游戏'], [6, '名人明星'], [7, '经验故事'], [8, '古典玄幻'],
  [9, '家庭乱伦'], [10, '多人群交'], [11, '公司职场'], [12, '露出暴露'],
  [13, '强暴性虐'], [14, '西方主题'], [15, '同性主题'], [16, '绿帽主题'],
  [99, '耽美小说'], [101, '编辑推荐'], [102, '长篇连载'], [103, '经典回忆'],
  [998, '漫画小说'], [999, '有声小说'], [1000, '色友发表']
],
/// 排序：站点自己的 ?sort=（空串＝更新时间，站点的默认）。
__SORTS: [['', '更新时间'], ['read', '浏览最多'], ['comment', '评论最多']],
/// 篇幅：站点自己的 ?length=（空串＝不限）。
__LENGTHS: [['', '不限'], ['1', '短篇'], ['2', '中长篇'], ['3', '超长篇']],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片：a.card[href=/fiction/<id>]（封面 img[src]、标题 span.line-clamp-1、简介 span.line-clamp-2、尾部作者/章数/字数/状态）。
///
/// **封面就在卡片里**（`upload.xchina.io/fiction/<id>.jpg`，独立图床）：真站的 img 是
/// 懒加载但 `src` 已经写好，所以照 src 取即可——旧版把封面交给「卡片里第一个 img」，
/// 遇到站点混进来的占位/图标就会取空，现在显式认「卡片封面容器里的那张」。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && H.cls(n, 'card') && /^\/fiction\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).map(function (n) {
      var img = H.first(n, function (x) {
        return x.tag === 'img' && /(?:fiction|default)\//.test(x.attrs.src || '') || (x.tag === 'img' && /^https?:\/\//.test(x.attrs.src || ''));
      });
      var title = H.first(n, function (x) {
        return H.cls(x, 'line-clamp-1');
      });
      var intro = H.first(n, function (x) {
        return H.cls(x, 'line-clamp-2');
      });
      var bits = [];
      var author = H.first(n, function (x) {
        return x.tag === 'span' && !H.cls(x, 'line-clamp-1') && !H.cls(x, 'line-clamp-2') && /^\s*[^0-9]/.test(H.text(x)) && H.text(x).length < 24;
      });
      if (author) bits.push(H.text(author));
      var meta = H.first(n, function (x) {
        return H.cls(x, 'flex-wrap');
      });
      if (meta) {
        H.all(meta, function (x) {
          return x.tag === 'span';
        }).forEach(function (x) {
          var text = H.text(x);
          if (text && bits.indexOf(text) < 0 && text.length < 24) bits.push(text);
        });
      }
      return {
        id: self.__path(n.attrs.href),
        title: title ? H.text(title) : H.clean(img ? img.attrs.alt : ''),
        // 站点自带占位图（/default/fiction.jpg）不是封面：交 null，让 App 显示「暂无封面」而不是同一张通用图。
        cover: img && !/\/default\//.test(img.attrs.src || '') ? H.abs(img.attrs.src, H.base + '/') : null,
        coverHeaders: H.headers(H.base + '/'),
        subtitle: bits.length ? bits.join(' · ') : (intro ? H.text(intro).slice(0, 60) : null)
      };
    })
  );
},

/// 还有下一页吗：站点用的是 `<a rel="next">下一页</a>` / `/fictions/<n>`。
__hasNext: function (tree) {
  return H.all(tree, function (n) {
    return n.tag === 'a' && (n.attrs.rel === 'next' || /下一页/.test(H.text(n)));
  }).length > 0;
},

/// 详情页的 LD+JSON（书名/作者/字数/章节都在里面）。
__data: function (html) {
  var re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    try {
      var data = JSON.parse(m[1]);
      var list = Array.isArray(data) ? data : [data];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (list[i].hasPart || list[i].articleBody || list[i]['@type'] === 'CreativeWork')) return list[i];
      }
    } catch (error) {
      // 站点的 JSON 偶有截断：换下一个脚本块继续找。
    }
  }
  return {};
},

/// 列表 / 搜索：
///   列表 GET /fictions[/<页>][?sort=&length=]   （**页号在路径里**，不是 ?page= —— 旧版写成
///        ?page= 于是「翻页永远是第 1 页」）
///   题材 GET /fiction-tag/<编号>[/<页>][?sort=&length=]
///   搜索 GET /search?q=<关键词>&type=fiction[&page=]
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var category = this.__path(args.categoryId);
  var filters = args.filters || {};
  var url;
  if (keyword) {
    url = '/search?q=' + encodeURIComponent(keyword) + '&type=fiction' + (page > 1 ? '&page=' + page : '');
  } else {
    var base = category && category !== '/' ? category : '/fictions';
    var query = [];
    var sort = this.__pick(this.__SORTS, filters.sort);
    var length = this.__pick(this.__LENGTHS, filters.length);
    if (sort) query.push('sort=' + encodeURIComponent(sort));
    if (length) query.push('length=' + encodeURIComponent(length));
    if (page > 1 && !this.__serverPage(base)) {
      url = base + '/' + page + (query.length ? '?' + query.join('&') : '');
    } else {
      url = base + (query.length ? '?' + query.join('&') : '');
    }
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 有些列表页的页号是自己那段路径（/fictions/2），搜索与题材页则用 ?page=；这里判断用哪种。
__serverPage: function (path) {
  return String(path).indexOf('/search') === 0;
},

/// 白名单取值：认不出的筛选值一律退回默认，不把任意串拼进地址。
__pick: function (table, value) {
  var wanted = String(value == null ? '' : value).trim();
  for (var i = 0; i < table.length; i++) {
    if (table[i][0] === wanted) return table[i][0];
  }
  return '';
},

/// 首页：最新 / 浏览最多 / 有声小说 三块。
async home() {
  var defs = [
    [{ categoryId: '/fictions' }, '最新小说'],
    [{ categoryId: '/fictions', filters: { sort: 'read' } }, '浏览最多'],
    [{ categoryId: '/fiction-tag/999' }, '有声小说']
  ];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ page: 1, categoryId: defs[i][0].categoryId, filters: defs[i][0].filters });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (i === 0) throw error;
    }
  }
  return boards;
},

/// 分类：全部 + 站点自己的 23 个题材（含「有声小说」「色友发表」）。
async categories() {
  var out = [{ id: '/fictions', title: '全部小说' }];
  for (var i = 0; i < this.__TAGS.length; i++) {
    out.push({ id: '/fiction-tag/' + this.__TAGS[i][0], title: this.__TAGS[i][1] });
  }
  return out;
},

/// 筛选：排序 + 篇幅（真站列表页右上角那两组）。
async filters() {
  var sorts = [];
  for (var i = 0; i < this.__SORTS.length; i++) sorts.push({ id: this.__SORTS[i][0], title: this.__SORTS[i][1] });
  var lengths = [];
  for (var j = 0; j < this.__LENGTHS.length; j++) lengths.push({ id: this.__LENGTHS[j][0], title: this.__LENGTHS[j][1] });
  return [
    { id: 'sort', title: '排序', options: sorts },
    { id: 'length', title: '篇幅', options: lengths }
  ];
},

/// 详情：标题 h1、封面 og:image、作者 / 字数 / 题材（LD+JSON + 信息栏）。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/fiction\/[A-Za-z0-9]+$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var data = this.__data(html);
  var title = data.name || data.headline || H.title(tree);
  if (!title) return null;
  var bits = [];
  if (data.author && data.author.name) bits.push('作者：' + data.author.name);
  if (data.wordCount) bits.push(Math.round(Number(data.wordCount) / 1000) + ' 千字');
  var tags = [];
  H.all(tree, function (n) {
    return n.tag === 'a' && /^\/fiction-tag\/\d+$/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var text = H.text(n);
    if (text && tags.indexOf(text) < 0 && H.cls(n, 'text-brand-600')) tags.push(text);
  });
  if (tags.length) bits.push(tags.join(' / '));
  return {
    id: id,
    title: H.clean(title),
    cover: data.image || H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ') : null,
    description: data.description ? H.clean(data.description) : null
  };
},

/// 剧集：LD+JSON 的 hasPart（真站分章）；单页小说没有分章 → 给一条「正文」。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  if (!id) return [];
  var data = this.__data(await H.get(id));
  var rows = [];
  if (data.hasPart && data.hasPart.length) {
    for (var i = 0; i < data.hasPart.length; i++) {
      var part = data.hasPart[i];
      if (!part || !part.url) continue;
      rows.push({ id: this.__path(part.url), title: H.clean(part.name || ('第 ' + (i + 1) + ' 章')) });
    }
    if (rows.length) return rows;
  }
  return [{ id: id, title: '正文' }];
},

/// 正文：章节页里 `article[data-reader]` 的段落（真站排版容器）；单页小说退回 LD+JSON 的 articleBody。
/// 有声作品的页面顶部有一段「🎧 本章节有语音版…」的播放提示，那是界面不是正文，剔掉。
async content(argument) {
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!id) throw new Error('小黄书小说：缺少章节地址');
  var html = await H.get(id);
  var tree = H.tree(html);
  var box = H.first(tree, function (n) {
    return n.attrs['data-reader-body'] !== undefined;
  }) || H.first(tree, function (n) {
    return n.tag === 'article';
  });
  var text = '';
  if (box) {
    var lines = [];
    H.all(box, function (n) {
      return n.tag === 'p';
    }).forEach(function (n) {
      var line = H.clean(H.text(n));
      if (line && !/^🎧|本章节有语音版/.test(line)) lines.push(line);
    });
    text = lines.length ? lines.join('\n') : H.clean(H.text(box));
  }
  if (!text || text.length < 20) {
    var data = this.__data(html);
    text = data.articleBody ? H.clean(data.articleBody) : text;
  }
  if (!text || text.length < 20) {
    throw new Error('小黄书小说：本章没有取到正文（可能需要登录或 VIP，站点结构也可能已变）');
  }
  return H.textContent(text);
}

};
