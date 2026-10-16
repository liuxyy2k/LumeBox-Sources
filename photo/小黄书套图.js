// LumeSource: {"id":"xchina_photo","name":"小黄书套图","version":"1.0.0","category":"comic","group":"美图","icon":"https://xchina.co/assets/img/favicon.png"}
//
// 小黄书 xChina 的**情色套图**板块（14,247 套，620 页）。真站是 SSR：列表、系列页、
// 详情页的图片地址都在 HTML 里，脚本直接解析（快照见 snapshots/xchina_photo*）。
//
// 站点结构（2026-10-16 实测）：
//   分类      /photos（全部）｜16 个系列 /photo-series/<id>（AI图区、国模套图、PANS、
//             私购流出、秀人网、韩模套图、黄甫、JVID、行色、书籍扫描、日模套图、
//             其他中国工作室、台模套图、相约中国、风吟鸟唱、街拍）——**系列是从列表页现抓的**，
//             抓不到才用内置兜底表
//   列表      GET <分类>[/<页>][?sort=]  页号在路径里（/photos/2）；排序 sort=hot|comment|recent
//   详情      GET /photo/<24位id>        标题 h1、封面 og:image（img.xchina.io 上的 _600x0 规格）
//   正文      GET /photo/<id>            同一页里 'img.xchina.io/photos/<id>/<序号>_600x0.webp' 全列表
//
// 已知边界：
// - 套图没有「章」，一条章节就是整套（阅读器一次翻完）；
// - 图片在独立图床 img.xchina.io（真实浏览器里 200；它偶发 403，属于站点侧的拦截，
//   脚本把站点 Referer 一起交出，不绕过）；
// - 套图里夹带的视频（.mp4）不进图片列表（阅读器只排版图片）。
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

H.base="https://xchina.co";H.name="小黄书套图";
var LumeSource={id:"xchina_photo",name:"小黄书套图",version:"1.0.0",category:"comic",group:"美图",
icon:"https://xchina.co/assets/img/favicon.png",

/// 排序：站点自己的 ?sort=（空串＝最新，站点的默认）。
__SORTS: [['', '最新'], ['hot', '最热门'], ['comment', '评论最多'], ['recent', '最近评论']],
/// 系列抓不到时的兜底（真站「全部系列」下拉里的 16 个，实测）。
__SERIES: [
  ['/photo-series/6443d480eb757', 'AI图区'], ['/photo-series/64be21c972ca4', '国模套图'],
  ['/photo-series/6310ce9b90056', 'PANS'], ['/photo-series/66600a3a227ee', '私购流出'],
  ['/photo-series/5f1476781eab4', '秀人网'], ['/photo-series/64be22b4a0fa0', '韩模套图'],
  ['/photo-series/665f8bafab4bc', '黄甫'], ['/photo-series/637b2029d2347', 'JVID'],
  ['/photo-series/64f44d99ce673', '行色'], ['/photo-series/6860e3d718c78', '书籍扫描'],
  ['/photo-series/64be2283bf3af', '日模套图'], ['/photo-series/665f7d787d681', '其他中国工作室'],
  ['/photo-series/64be21ef4cc51', '台模套图'], ['/photo-series/5f1dcdeaee582', '相约中国'],
  ['/photo-series/6666a7ac3ba9c', '风吟鸟唱'], ['/photo-series/6836cd1a2d51d', '街拍']
],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片：a[href=/photo/<id>]（套图本体；**别把 /photo-series/<id> 系列页当条目**）。
/// 封面 img[src] 在 img.xchina.io（独立图床），徽标 pill 给「系列 / 卷号 / 张数」。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/photo\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).map(function (n) {
      var img = H.first(n, function (x) {
        return x.tag === 'img';
      });
      var bits = [];
      H.all(n, function (x) {
        return H.cls(x, 'cover-pill');
      }).forEach(function (x) {
        var text = H.text(x);
        if (text && text.length < 20 && bits.indexOf(text) < 0) bits.push(text);
      });
      var title = H.first(n, function (x) {
        return x.tag === 'span' && H.cls(x, 'text-sm') && H.text(x).length > 1;
      });
      return {
        id: self.__path(n.attrs.href),
        title: title ? H.text(title) : H.clean(img ? img.attrs.alt : ''),
        cover: img ? H.abs(img.attrs.src, H.base + '/') : null,
        coverHeaders: H.headers(H.base + '/'),
        subtitle: bits.length ? bits.join(' · ') : null
      };
    })
  );
},

__hasNext: function (tree) {
  return H.all(tree, function (n) {
    return n.tag === 'a' && (n.attrs.rel === 'next' || /下一页/.test(H.text(n)));
  }).length > 0;
},

__pickSort: function (value) {
  var wanted = String(value == null ? '' : value).trim();
  for (var i = 0; i < this.__SORTS.length; i++) {
    if (this.__SORTS[i][0] === wanted) return wanted;
  }
  return '';
},

/// 首页：最新 / 最热门 / 评论最多 三块。
async home() {
  var defs = [[{}, '最新套图'], [{ sort: 'hot' }, '最热门'], [{ sort: 'comment' }, '评论最多']];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ page: 1, filters: defs[i][0] });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (i === 0) throw error;
    }
  }
  return boards;
},

/// 分类：全部 + 16 个系列（系列列表**从站点现抓**，抓不到用兜底表）。
async categories() {
  var out = [{ id: '/photos', title: '全部套图' }];
  var found = [];
  try {
    var tree = H.tree(await H.get('/photos'));
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/photo-series\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).forEach(function (n) {
      var title = H.text(n);
      if (!title || title.length > 12) return;
      for (var i = 0; i < found.length; i++) {
        if (found[i].id === n.attrs.href) return;
      }
      found.push({ id: n.attrs.href, title: title });
    });
  } catch (error) {
    found = [];
  }
  if (!found.length) {
    for (var i = 0; i < this.__SERIES.length; i++) found.push({ id: this.__SERIES[i][0], title: this.__SERIES[i][1] });
  }
  return out.concat(found);
},

/// 筛选：排序（真站列表页顶部那一行）。
async filters() {
  var options = [];
  for (var i = 0; i < this.__SORTS.length; i++) options.push({ id: this.__SORTS[i][0], title: this.__SORTS[i][1] });
  return [{ id: 'sort', title: '排序', options: options }];
},

/// 列表：GET <分类>[/<页>][?sort=]（**页号在路径里**：/photos/2、/photo-series/<id>/2）；
/// 搜索走站点自己的 /search?q=&type=photo。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var url;
  if (keyword) {
    url = '/search?q=' + encodeURIComponent(keyword) + '&type=photo' + (page > 1 ? '&page=' + page : '');
  } else {
    var category = this.__path(args.categoryId) || '/photos';
    var sort = this.__pickSort((args.filters || {}).sort);
    url = category + (page > 1 ? '/' + page : '') + (sort ? '?sort=' + encodeURIComponent(sort) : '');
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 详情：标题 h1、封面 og:image、副标题取 og:description 里的「N 张图片…」那一段。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/photo\/[A-Za-z0-9]+$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var title = H.title(tree);
  if (!title) return null;
  var desc = H.first(tree, function (n) {
    return n.tag === 'meta' && n.attrs.property === 'og:description';
  });
  var bits = [];
  if (desc) {
    var m = /(\d+\s*张图片[^。]*)/.exec(desc.attrs.content || '');
    if (m) bits.push(H.clean(m[1]));
    var series = (/，\s*([^，。]+)\s*，\s*\d+\s*张图片/.exec(desc.attrs.content || []) || [])[1];
    if (series) bits.push(series);
  }
  return {
    id: id,
    title: H.clean(title),
    cover: H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ') : null,
    description: desc ? H.clean(desc.attrs.content || '').replace(/^[^，]+，/, '') : null
  };
},

/// 套图没有「章」：一条章节就是整套（阅读器一次翻完）。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  return id ? [{ id: id, title: '全部图片' }] : [];
},

/// 正文：详情页里的 `img.xchina.io/photos/<id>/<序号>_600x0.webp`。
/// **只认这一套、这个规格**：视频海报（video-posters）、模特头像、界面的 img 都不混进来；
/// 同一张图若同时出现缩略与原始地址，按序号去重并保留站点在用的那张。
async content(argument) {
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  var photoId = (/^\/photo\/([A-Za-z0-9]+)$/.exec(id) || [])[1];
  if (!photoId) throw new Error('小黄书套图：缺少套图地址');
  var html = await H.get('/photo/' + photoId);
  var pattern = new RegExp('https://img\\.xchina\\.io/photos/' + photoId + '/([0-9]+)(_[0-9]+x[0-9]+)?\\.(webp|jpg|jpeg|png)', 'gi');
  var byStem = {};
  var m;
  while ((m = pattern.exec(html)) !== null) {
    var stem = m[1];
    var withSize = !!m[2];
    var current = byStem[stem];
    // 带规格后缀的是站点展示用的缩略；同一序号优先留缩略地址。
    if (!current || (withSize && !current.withSize)) byStem[stem] = { url: m[0], withSize: withSize };
  }
  var stems = Object.keys(byStem).sort(function (a, b) {
    return Number(a) - Number(b);
  });
  var images = [];
  for (var i = 0; i < stems.length; i++) images.push(byStem[stems[i]].url);
  if (!images.length) throw new Error('小黄书套图：这套图没有取到图片（可能需要登录或 VIP）');
  var page = H.abs('/photo/' + photoId, H.base + '/');
  var headers = {};
  for (var j = 0; j < images.length; j++) headers[images[j]] = H.headers(page);
  return { kind: 'images', images: images, imageHeaders: headers };
}

};
