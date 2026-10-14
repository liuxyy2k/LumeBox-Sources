// LumeSource: {"id":"mh18_comic","name":"18mh漫畫","version":"1.0.0","category":"comic"}

// 站点：18mh（禁漫天堂系，本站为 18mh.net / 18mh.org 一家的镜像域名）。
//
// 结构（2026-10-15 用真站响应逐条核过，除 .org 需要网页验证外）：
//   分类      /comic/all 全部 ｜ /comic/rank 排行 ｜ /comic/hot 热门 ｜
//             /comic/freshest 最新 ｜ /comic/newest 新作
//   题材      /comic/all/<代码>：rb 日本H漫 / hg 韩国H漫 / jq 剧情 / xy 校园 /
//             aq 爱情 / bl BL / qh 奇幻 / tj 调教 / ll 乱伦 / dp 短篇 / db 单本 / tr 同人
//   列表      GET <分类>[/page/N]（1 基页号；`<link rel="next">` 是站点自己的下一页）
//   搜索      GET /comic/all?key_word=<关键词>&page=N（站点自己 ld+json 里给的形状）
//   详情      GET /comic/detail/<数字id>：标题在 <title>、封面 img[data-src]、简介 meta
//   章节      GET /comic/detail/<id> 里的 /comic/chapter/<id>/<n>（单页列全）
//   正文      GET /comic/chapter/<id>/<n>：img[data-src] 就是页面图（图床同域外链，
//             **不需要 Referer**，实测带与不带都 200）
//
// 换域名：两家镜像（net / org）互为备用，脚本按顺序探活；.org 有 Cloudflare 校验，
// 没在 App 内过验证时会 403 —— 那时会自动落到 net。
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

H.base="https://18mh.net";H.name="18mh漫畫";
var LumeSource={id:"mh18_comic",name:"18mh漫畫",version:"1.0.0",category:"comic",

/// 镜像域名（一家人的两个域名互为备用）：net 无校验先用，org 需要网页验证时再兜底。
__hosts: ['https://18mh.net','https://www.18mh.net','https://18mh.org','https://www.18mh.org'],
__host: '',

/// 内置题材（站点导航里的 12 个；抓不到时用它们兜底，抓到就用站点的实时列表）。
__known: [['/comic/all/rb','日本H漫'],['/comic/all/hg','韩国H漫'],['/comic/all/jq','剧情'],
  ['/comic/all/xy','校园'],['/comic/all/aq','爱情'],['/comic/all/bl','BL'],
  ['/comic/all/qh','奇幻'],['/comic/all/tj','调教'],['/comic/all/ll','乱伦'],
  ['/comic/all/dp','短篇'],['/comic/all/db','单本'],['/comic/all/tr','同人']],

/// 选一个能用的域名（脚本里所有请求都以它为准）。
async __pick() {
  if (this.__host) return this.__host;
  for (var i = 0; i < this.__hosts.length; i++) {
    var host = this.__hosts[i];
    try {
      var response = await LumeSource.http.get(host + '/', { headers: H.headers(host + '/') });
      if (!response || response.status !== 200) continue;
      var body = String(response.body || '');
      if (!/\/comic\/detail\/\d+/.test(body) && !/\/comic\/all/.test(body)) continue;
      this.__host = host;
      H.base = host;
      return host;
    } catch (error) {
      // 403 / 超时：换下一个域名（.org 需要 App 内网页验证，落回 net 就好）
    }
  }
  throw new Error('18mh漫畫：镜像域名都不可用（net / org 都没通，可能需要网页验证）');
},

/// 列表卡片：`li > a[href=/comic/detail/<id>]`，封面在 `img[data-src]`、标题在 img alt。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/comic\/detail\/\d+$/.test(n.attrs.href || '');
    }).map(function (a) {
      var img = H.first(a, function (x) {
        return x.tag === 'img';
      });
      var title = img ? H.clean(img.attrs.alt || '') : '';
      if (!title) title = H.clean(a.attrs.title || '');
      return {
        id: a.attrs.href,
        title: title,
        cover: img ? H.image(a) : null,
        coverHeaders: H.headers(self.__host + '/')
      };
    })
  );
},

/// 首页：热门 / 最新两块（站点自己的两个入口）。
async home() {
  var defs = [['/comic/hot', '热门'], ['/comic/freshest', '最新']];
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

/// 分类 = 站点自己的入口 + 12 个题材（从首页导航实时抓，抓不到用内置）。
async categories() {
  var fixed = [
    { id: '/comic/all', title: '全部' },
    { id: '/comic/rank', title: '排行' },
    { id: '/comic/hot', title: '热门' },
    { id: '/comic/freshest', title: '最新' },
    { id: '/comic/newest', title: '新作' }
  ];
  var found = [];
  var seen = {};
  try {
    var html = await H.get('/');
    var re = /href="(\/comic\/all\/[a-z0-9]{2})"[^>]*>\s*([^<]{1,14})</g, m;
    while ((m = re.exec(html)) !== null) {
      if (seen[m[1]]) continue;
      var title = H.clean(m[2]);
      if (!title) continue;
      seen[m[1]] = true;
      found.push({ id: m[1], title: title });
    }
  } catch (error) {
    console.warn('[18mh] 题材抓取失败，用内置列表：' + error);
  }
  if (!found.length) found = this.__known.map(function (x) {
    return { id: x[0], title: x[1] };
  });
  return fixed.concat(found);
},

/// 列表 / 搜索：分页是站点的 `/page/N`（第 1 页不带），搜索走 `?key_word=`。
async list(argument) {
  var args = argument || {};
  await this.__pick();
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var category = String(args.categoryId == null ? '' : args.categoryId).trim();
  var url;
  if (keyword) {
    url = '/comic/all?key_word=' + encodeURIComponent(keyword);
    if (page > 1) url += '&page=' + page;
  } else {
    url = category && category.charAt(0) === '/' ? category : '/comic/all';
    if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '') + '/page/' + page;
  }
  var html = await H.get(url);
  var tree = H.tree(html);
  var items = this.__items(tree);
  if (!items.length) console.warn('[18mh] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
  return { items: items, hasMore: H.next(tree, page) };
},

/// 详情：标题取站点自己的 `<title>`（去掉品牌后缀）、封面 img[data-src]、简介 meta。
async detail(argument) {
  await this.__pick();
  var id = String(argument && argument.id ? argument.id : '').trim();
  if (!/^\/comic\/detail\/\d+$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var title = H.title(tree).split('|')[0].split(' - ')[0].trim();
  if (!title) return null;
  // 封面：详情页自己的海报图最准（`img.detail-page__poster-img[data-src]`）。
  // 站点的 og:image 是 `/social-cover/<base64>` 这种**生成的分享图**，实测 404，
  // 不能当封面；ld+json 里的 image 是图床直链，作为兜底。
  var poster = H.first(tree, function (n) {
    return n.tag === 'img' && /detail-page__poster/.test(n.attrs.class || '');
  });
  var cover = poster ? H.abs(poster.attrs['data-src'] || poster.attrs.src) : '';
  var meta = this.__ld(html);
  if (!cover && meta && meta.image) cover = H.abs(meta.image);
  if (!cover) cover = H.cover(tree);
  if (cover && /\/social-cover\//.test(cover)) cover = '';
  var desc = H.first(tree, function (n) {
    return n.tag === 'meta' && n.attrs.name === 'description';
  });
  var tags = [];
  if (meta && meta.genre && meta.genre.length) {
    meta.genre.forEach(function (text) {
      var value = H.clean('' + text);
      if (value && tags.indexOf(value) < 0) tags.push(value);
    });
  }
  H.all(tree, function (n) {
    return n.tag === 'a' && /^\/comic\/all\/[a-z0-9]{2}$/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var text = H.clean(H.text(n));
    if (text && tags.indexOf(text) < 0) tags.push(text);
  });
  return {
    id: id,
    title: title,
    cover: cover || null,
    coverHeaders: H.headers(this.__host + '/'),
    description: desc ? H.clean(desc.attrs.content || '') : (meta && meta.description ? H.clean(meta.description) : null),
    tags: tags.length ? tags : undefined
  };
},

/// 详情页里的 ld+json（@type ComicStory）：拿到 cover / genre / description 的直链版。
__ld: function (html) {
  var blocks = String(html || '').match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (var i = 0; i < blocks.length; i++) {
    var raw = blocks[i].replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      var data = JSON.parse(raw);
      var list = data && data['@graph'] ? data['@graph'] : [data];
      for (var j = 0; j < list.length; j++) {
        var node = list[j];
        if (node && (node['@type'] === 'ComicStory' || node.genre || node.image)) return node;
      }
    } catch (error) {
      // 单个 block 解析失败不影响其它 block
    }
  }
  return null;
},

/// 章节：详情页里的 `/comic/chapter/<id>/<n>`（站点单页列全，按序号升序）。
async chapters(argument) {
  await this.__pick();
  var id = String(argument && argument.id ? argument.id : '').trim();
  var bookId = (/\d+/.exec(id) || [])[0];
  if (!bookId) return [];
  var html = await H.get('/comic/detail/' + bookId);
  var tree = H.tree(html);
  var rows = H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && new RegExp('^/comic/chapter/' + bookId + '/\\d+$').test(n.attrs.href || '');
    }).map(function (n) {
      return { id: n.attrs.href, title: H.clean(n.attrs.title || H.text(n)) };
    })
  );
  rows.sort(function (a, b) {
    return Number((/\/(\d+)$/.exec(a.id) || [])[1] || 0) - Number((/\/(\d+)$/.exec(b.id) || [])[1] || 0);
  });
  rows.forEach(function (row, index) {
    if (!row.title) row.title = '第 ' + (index + 1) + ' 话';
  });
  return rows;
},

/// 正文：章节页里的 `img[data-src]`（只留图床外链，页面图标/广告不计）。
async content(argument) {
  await this.__pick();
  var chapterId = String((argument && argument.chapterId) || (argument && argument.id) || '').trim();
  if (!/^\/comic\/chapter\/\d+\/\d+$/.test(chapterId)) {
    throw new Error('18mh漫畫：认不出章节地址（' + chapterId + '）——章节 id 应当来自 chapters()');
  }
  var page = H.abs(chapterId);
  var html = await H.get(chapterId);
  var images = [];
  var seen = {};
  var tag = /<img\b[^>]*>/gi, m;
  while ((m = tag.exec(html)) !== null) {
    var url = H.abs(H.attr(m[0], 'data-src') || H.attr(m[0], 'data-original') || '', page);
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\/static\//i.test(url)) continue;
    if (seen[url]) continue;
    seen[url] = true;
    images.push(url);
  }
  if (!images.length) throw new Error('18mh漫畫：本章节没有公开图片（可能需要登录或站点结构已变化）');
  return H.imageContent(images, page);
}

};
