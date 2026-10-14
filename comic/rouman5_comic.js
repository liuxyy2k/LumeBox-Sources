// LumeSource: {"id":"rouman5_comic","name":"肉漫屋","version":"1.0.0","category":"comic"}
//
// 肉漫屋（rouman5.com，繁中界面）—— TanStack Start 的 SSR 站点。
// 本文件对着**真站响应**写：用真实浏览器把首页 / 列表 / 搜索 / 详情 / 阅读页取回来存档，
// 解析内核就对着这些真响应跑（每条结构都是实测，不是照模板猜的）。
//
// 站点结构（2026-10-14 实测）：
//   分类      /books（全部）｜/books?continued=true（連載中）｜/books?continued=false（已完結）
//   列表      GET /books[?continued=…][&page=N]   卡片 a.site-comic
//             **页号是 0 基**：第 2 页是 /books?page=1（真站如此，实测）
//   搜索      GET /search?term=<关键词>[&page=N]  —— **不是** ?q=/?search=/?keyword=（那些参数被忽略，实测）
//   详情      GET /books/<24位id>                 标题 h1、封面 og:image、简介 og:description、
//                                                 信息栏 dl.site-book-data（作者/狀態/地區/更新）
//   剧集      GET /books/<id>                     链接形状 /books/<id>/<序号>（**0 基**，真站默认正序）
//   正文      GET /books/<id>/<序号>              SSR 载荷里的 imagePaths 数组（关掉 JS 也读得到，实测）
//
// 已知边界：
// - 封面与正文图都走站点自己的图片代理域名（kelv47.xyz / towm85.xyz）。实测这两处**无凭据可直连**；
//   代理地址里那段 base64 是原图路径，脚本用它核对「这张图是不是本书的」（排除广告图）。
// - 站点的书库筛选（?genre=）服务端不吃，别指望多分类：真站就三块书库标签。
var H = {
  base: '', name: '', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://rouman5.com";H.name="肉漫屋";
var LumeSource={id:"rouman5_comic",name:"肉漫屋",version:"1.0.0",category:"comic",

/// 一页最多取多少张章节图。
__MAX_IMAGES: 400,
/// 目录最多收多少话。
__MAX_CHAPTERS: 2000,

/// base64 解码（站点图床把原图路径编在地址里，脚本用它核对「这张图属于哪本书」）。
/// 不依赖 atob：沙盒里没有保证，自己解最稳。
__b64: function (raw) {
  var text = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < text.length; i++) {
    var value = chars.indexOf(text.charAt(i));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
},

/// 站点路径：绝对地址只留 path（源 id 一律存站内路径，换域名也不影响）。
__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 章节序号：/books/<id>/<序号> 的末段（0 基）。
__ind: function (path) {
  var m = /\/books\/[^/]+\/(\d+)\/?$/.exec(this.__path(path));
  return m ? Number(m[1]) : -1;
},

/// 标题去重：真站的标签是「第2话 第1話」（简繁两份），同一个话号只留前一份。
__tidyTitle: function (raw) {
  var text = H.clean(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  // 真站的标签是「第N话 第M話」（简繁两份，编号还对不上）：取**前一份**。
  var m = /^(第\s*\d+\s*[话話][^\s]*)\s+第\s*\d+\s*[话話]/.exec(text);
  return m ? m[1] : text;
},

/// 列表卡片：a.site-comic（a[href] + div.site-comic-cover img + h3[title] + span.site-comic-chapter）。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && H.cls(n, 'site-comic');
    }).map(function (n) {
      var path = self.__path(n.attrs.href);
      var head = H.first(n, function (x) {
        return x.tag === 'h3';
      });
      var chapter = H.first(n, function (x) {
        return H.cls(x, 'site-comic-chapter');
      });
      var note = chapter ? H.clean(chapter.attrs.title || H.text(chapter)) : '';
      return {
        id: path,
        title: head ? H.clean(head.attrs.title || H.text(head)) : '',
        cover: H.image(n),
        coverHeaders: H.headers(H.base + '/'),
        subtitle: note ? self.__tidyTitle(note) : null
      };
    })
  );
},

/// 还有下一页吗：分页器里的「下一頁」是链接（有下一页）还是禁用按钮（没有）。
__hasNext: function (tree) {
  var nav = H.first(tree, function (n) {
    return H.cls(n, 'site-pagination');
  });
  if (!nav) return false;
  var links = H.links(nav, /[?&]page=/);
  for (var i = 0; i < links.length; i++) {
    if (/下一[頁页]/.test(H.text(links[i]))) return true;
  }
  return false;
},

/// SSR 载荷里的章节图数组：imagePaths:$R[n]=["…","…"]。
/// TanStack Start 把路由数据直接打进 HTML（浏览器关掉 JS 也读得到，实测）。
__imagePaths: function (html) {
  var m = /imagePaths:\$R\[\d+\]=\[([\s\S]*?)\]/.exec(String(html || ''));
  if (!m) return [];
  var quoted = m[1].match(/"(https?:\/\/[^"]+)"/g) || [];
  var out = [];
  for (var i = 0; i < quoted.length; i++) out.push(quoted[i].slice(1, -1));
  return out;
},

/// 图片地址里编的原图路径（…/sr:0/<base64>.<ext>）：用它判断这张图属于哪本书。
__b64Path: function (url) {
  var m = /\/sr:\d+\/([A-Za-z0-9_\-=]+)(?:\.[A-Za-z0-9]+)?$/.exec(String(url || ''));
  return m ? this.__b64(m[1]) : '';
},

/// 兜底：站点载荷换形状时，整页扫图床地址，再按 base64 里的原图路径核对是不是本书的图。
///
/// 章节图的路径形状是 `…/images/<书号>/<子目录>/<页码>.webp`——**要求带这一层子目录**：
/// 封面就躺在 `images/<书号>/cover.jpg`（少一层），不排掉它正文会多出一张封面。
__scan: function (html, bookId) {
  var self = this;
  var text = String(html || '');
  var found = text.match(/https:\/\/[A-Za-z0-9.-]*kelv47\.xyz\/m\/[^"'\s)]+/g) || [];
  var seen = {};
  var out = [];
  for (var i = 0; i < found.length; i++) {
    var url = found[i];
    if (seen[url]) continue;
    var path = self.__b64Path(url);
    if (!/\.(?:jpe?g|png|webp|gif|avif)$/i.test(path)) continue;
    if (bookId && !new RegExp('/images/' + bookId + '/[^/]+/').test(path)) continue;
    seen[url] = true;
    out.push(url);
  }
  return out;
},

/// 首页：三块（最近上架 / 連載中 / 已完結）。某一块打不开不该拖垮整页。
async home() {
  var defs = [['all', '最近上架'], ['ongoing', '連載中'], ['completed', '已完結']];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ categoryId: defs[i][0], page: 1 });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (i === 0) throw error;
    }
  }
  return boards;
},

/// 分类 = 站点自己那三个书库标签（真站导航里逐条核对过）。
async categories() {
  return [
    { id: 'all', title: '全部' },
    { id: 'ongoing', title: '連載中' },
    { id: 'completed', title: '已完結' }
  ];
},

/// 列表 / 搜索。
/// **页号是 0 基**：真站第 2 页是 /books?page=1、搜索第 2 页是 /search?term=…&page=1（实测）。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var category = String(args.categoryId == null ? '' : args.categoryId).trim();
  var url;
  if (keyword) {
    url = '/search?term=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + (page - 1) : '');
  } else {
    var query = category === 'ongoing'
      ? '?continued=true'
      : (category === 'completed' ? '?continued=false' : '');
    url = '/books' + query + (page > 1 ? (query ? '&' : '?') + 'page=' + (page - 1) : '');
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 详情：标题 h1、封面 og:image、简介 og:description、信息栏 dl.site-book-data。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!id || id.indexOf('/books/') !== 0) return null;
  var tree = H.tree(await H.get(id));
  var title = H.title(tree);
  if (!title) return null;
  var desc = H.first(tree, function (n) {
    return n.tag === 'meta' && n.attrs.property === 'og:description';
  });
  var bits = [];
  var data = H.first(tree, function (n) {
    return H.cls(n, 'site-book-data');
  });
  if (data) {
    var rows = data.children.filter(function (n) {
      return n.tag === 'dt' || n.tag === 'dd';
    });
    for (var i = 0; i + 1 < rows.length; i += 2) {
      if (rows[i].tag !== 'dt' || rows[i + 1].tag !== 'dd') continue;
      var key = H.text(rows[i]);
      var value = H.text(rows[i + 1]);
      if (key && value) bits.push(key + '：' + value);
    }
  }
  return {
    id: id,
    title: title,
    cover: H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ') : null,
    description: desc ? desc.attrs.content : null
  };
},

/// 剧集：div.site-chapters 里的 a.site-chapter-link，**按 0 基序号升序**（阅读器的下一章才往前走）。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  if (!id) return [];
  var self = this;
  var tree = H.tree(await H.get(id));
  var rows = [];
  H.all(tree, function (n) {
    return n.tag === 'a' && H.cls(n, 'site-chapter-link');
  }).forEach(function (n) {
    var path = self.__path(n.attrs.href);
    if (self.__ind(path) < 0) return;
    var span = H.first(n, function (x) {
      return x.tag === 'span';
    });
    rows.push({ id: path, title: self.__tidyTitle((span && span.attrs.title) || H.text(n)) });
  });
  rows = H.unique(rows).sort(function (x, y) {
    return self.__ind(x.id) - self.__ind(y.id);
  });
  return rows.slice(0, this.__MAX_CHAPTERS);
},

/// 正文：章节页 SSR 载荷里的 imagePaths（图床是站点自己的代理域名，实测无凭据可直连）。
async content(argument) {
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!id || this.__ind(id) < 0) throw new Error('肉漫屋：缺少章节地址');
  var html = await H.get(id);
  var bookId = (/\/books\/([^/]+)\//.exec(id) || [])[1] || '';
  var self = this;
  var images = this.__imagePaths(html).filter(function (url) {
    if (!bookId) return true;
    var path = self.__b64Path(url);
    return !path || path.indexOf('images/' + bookId + '/') >= 0;
  });
  if (!images.length) images = this.__scan(html, bookId);
  if (!images.length) {
    throw new Error('肉漫屋：本章节没有取到图片（可能需要登录，或站点结构已变化）');
  }
  var headers = {};
  var page = H.abs(id, H.base + '/');
  for (var i = 0; i < images.length && i < this.__MAX_IMAGES; i++) {
    headers[images[i]] = H.headers(page);
  }
  return {
    kind: 'images',
    images: images.slice(0, this.__MAX_IMAGES),
    imageHeaders: headers
  };
}

};
