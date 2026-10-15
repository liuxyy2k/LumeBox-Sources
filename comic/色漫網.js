// LumeSource: {"id":"cartoon18_comic","name":"色漫網","version":"1.0.0","category":"comic"}

// 站点：https://www.cartoon18.com （色漫網；同一家的导航还有 色片 / 色文 / 色圖）
//
// 结构（2026-10-15 用真站响应逐条核过）：
//   列表      GET /           最新（默认）
//             GET /?sort=hits | /?sort=likes | /?sort=score   最多 / 最好 / 推薦
//             GET /?page=N&per-page=24                        翻页（1 基）
//   搜索      GET /?q=<关键词>（实测可用，26 条/页）
//   分类      GET /category   站点的完整标签索引（74 个），每个是 `/q/<标签>`
//   详情      GET /v/<短id>：标题在 <title>（去掉品牌后缀）、封面 og:image、
//             章节是 `/story/<数字id>/full` 的链接（标签形如 01話）
//   正文      GET /story/<id>/full：**单页整话**，页面图就是 `img[data-src]`
//             （图床 img.cartoon18.com，**AVIF 格式**；实测带不带 Referer 都 200，
//              新版 App 的 Flutter 能直接解 AVIF）
var H = {
  base: '', name: '色漫網', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://www.cartoon18.com";H.name="色漫網";
var LumeSource={id:"cartoon18_comic",name:"色漫網",version:"1.0.0",category:"comic",

/// 列表卡片：`a[href=/v/<短id>]`（同一张漫画在封面与标题上各有一个链接，按 id 去重）。
/// 封面在 `img.lazyimage[data-src]`（AVIF），标题在 img alt 或标题行链接的文字。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/v\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).map(function (a) {
      var img = H.first(a, function (x) {
        return x.tag === 'img';
      });
      var title = img ? H.clean(img.attrs.alt || '') : '';
      if (!title) title = H.clean(a.attrs.title || H.text(a));
      return {
        id: a.attrs.href,
        title: title,
        cover: img ? H.image(a) : null,
        coverHeaders: H.headers(H.base + '/')
      };
    })
  );
},

/// 列表 / 搜索：`/?q=` 是站点的搜索；分页是 `?page=N&per-page=24`。
__listUrl: function (categoryId, keyword, page) {
  var url = keyword
    ? '/?q=' + encodeURIComponent(keyword)
    : (String(categoryId == null ? '' : categoryId).trim() || '/');
  if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page + '&per-page=24';
  return url;
},

/// 首页：最新 + 最多 + 推薦 三块（站点自己的三种排序入口）。
async home() {
  var defs = [['/', '最新'], ['/?sort=hits', '最多'], ['/?sort=score', '推薦']];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ categoryId: defs[i][0], page: 1 });
      if (result && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (!boards.length) throw error;
    }
  }
  return boards;
},

/// 分类 = 站点自己的排序入口 + `/category` 页的**完整标签索引**（74 个）。
/// 标签从页面实时抓；抓不到只给排序入口，不编造站上没有的分类。
async categories() {
  var fixed = [
    { id: '/', title: '最新' },
    { id: '/?sort=hits', title: '最多' },
    { id: '/?sort=likes', title: '最好' },
    { id: '/?sort=score', title: '推薦' }
  ];
  var tags = [];
  var seen = {};
  try {
    var html = await H.get('/category');
    var re = /href="(\/q\/[^"]+)"[^>]*>([\s\S]{1,40}?)<\/a>/g, m;
    while ((m = re.exec(html)) !== null) {
      var id = m[1];
      var title = H.clean(m[2]);
      if (!id || !title || seen[id]) continue;
      if (title.length > 14) continue;
      seen[id] = true;
      tags.push({ id: id, title: title });
    }
  } catch (error) {
    console.warn('[cartoon18] 标签索引抓取失败：' + error);
  }
  if (!tags.length) {
    try {
      var home = await H.get('/');
      var re2 = /href="(\/q\/[^"]+)"[^>]*>([\s\S]{1,40}?)<\/a>/g, m2;
      while ((m2 = re2.exec(home)) !== null) {
        var id2 = m2[1];
        var title2 = H.clean(m2[2]);
        if (!id2 || !title2 || seen[id2] || title2.length > 14) continue;
        seen[id2] = true;
        tags.push({ id: id2, title: title2 });
      }
    } catch (error) {
      console.warn('[cartoon18] 首页标签也抓不到：' + error);
    }
  }
  return fixed.concat(tags);
},

async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var url = this.__listUrl(args.categoryId, keyword, page);
  var html = await H.get(url);
  var tree = H.tree(html);
  var items = this.__items(tree);
  if (!items.length) console.warn('[cartoon18] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
  return { items: items, hasMore: H.next(tree, page) };
},

/// 详情：标题取 `<title>`（去掉品牌后缀）、封面 og:image、章节 `/story/<id>/full`。
async detail(argument) {
  var id = String(argument && argument.id ? argument.id : '').trim();
  if (!/^\/v\/[A-Za-z0-9]+$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  // 标题里混着站点的 Vue 占位（`{{ node.likes + node.hits}}`）与包装符号，都去掉。
  var title = H.title(tree)
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .split('|')[0]
    .split(' - ')[0]
    .replace(/^\s*[\[【][^\]】]*[\]】]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return null;
  return {
    id: id,
    title: title,
    cover: H.cover(tree),
    coverHeaders: H.headers(this.base + '/')
  };
},

/// 章节：详情页里的 `/story/<数字id>/full`（标签形如 01話），按路径里的数字升序。
async chapters(argument) {
  var id = String(argument && argument.id ? argument.id : '').trim();
  if (!id) return [];
  var tree = H.tree(await H.get(id));
  var rows = H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/story\/\d+\/full$/.test(n.attrs.href || '');
    }).map(function (n) {
      return { id: n.attrs.href, title: H.clean(n.attrs.title || H.text(n)) };
    })
  );
  rows.sort(function (a, b) {
    return Number((/\/story\/(\d+)/.exec(a.id) || [])[1] || 0) - Number((/\/story\/(\d+)/.exec(b.id) || [])[1] || 0);
  });
  rows.forEach(function (row, index) {
    if (!row.title) row.title = '第 ' + (index + 1) + ' 話';
  });
  if (!rows.length) throw new Error('色漫網：这个作品没有读取到章节（站点结构可能已变化）');
  return rows;
},

/// 正文：整话一页（`/story/<id>/full`），页面图就是 img[data-src]（AVIF）。
async content(argument) {
  var chapterId = String((argument && argument.chapterId) || (argument && argument.id) || '').trim();
  if (!/^\/story\/\d+\/full$/.test(chapterId)) {
    throw new Error('色漫網：认不出章节地址（' + chapterId + '）——章节 id 应当来自 chapters()');
  }
  var page = H.abs(chapterId);
  var html = await H.get(chapterId);
  var images = [];
  var seen = {};
  var tag = /<img\b[^>]*>/gi, m;
  while ((m = tag.exec(html)) !== null) {
    // 阅读页的页面图在 `src` 上（列表卡片才用 data-src），两种都认。
    var url = H.abs(
      H.attr(m[0], 'data-src') || H.attr(m[0], 'data-original') || H.attr(m[0], 'src'),
      page
    );
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\/imgdef\/|\/logo\.png$|\/static\//i.test(url)) continue;
    if (seen[url]) continue;
    seen[url] = true;
    images.push(url);
  }
  if (!images.length) throw new Error('色漫網：这一话没有读取到图片（可能需要登录，或站点结构已变化）');
  return H.imageContent(images, page);
}

};
