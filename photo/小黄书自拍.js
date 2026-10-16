// LumeSource: {"id":"xchina_amateur","name":"小黄书自拍","version":"1.0.0","category":"comic","group":"美图","icon":"https://xchina.co/assets/img/favicon.png"}
//
// 小黄书 xChina 的**业余自拍**板块（2,584 套，108 页）。与套图同源不同目录：
// 列表 /amateurs、条目 /amateur/<id>、图片 img.xchina.io/amateurs/<id>/<序号>.webp。
//
// 站点结构（2026-10-16 实测）：
//   分类      /amateurs（更新时间）｜?sort=featured（精华自拍）｜?sort=comment｜?sort=recent
//   列表      GET /amateurs[/<页>][?sort=]   页号在路径里（/amateurs/2）
//   详情      GET /amateur/<24位id>          标题 h1、封面 og:image、og:description 里有张数
//   正文      GET /amateur/<id>              img.xchina.io/amateurs/<id>/<序号>.webp 全列表
//
// 已知边界：上传者头像走 upload.xchina.io/media/…、视频走别的路径——都按**这一套的路径**
// 过滤掉，只交图片；套图没有「章」，一条章节就是整套。
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

H.base="https://xchina.co";H.name="小黄书自拍";
var LumeSource={id:"xchina_amateur",name:"小黄书自拍",version:"1.0.0",category:"comic",group:"美图",
icon:"https://xchina.co/assets/img/favicon.png",

/// 排序：站点自己的 ?sort=（空串＝更新时间，站点的默认）。
__SORTS: [['', '更新时间'], ['featured', '精华自拍'], ['comment', '评论最多'], ['recent', '最近评论']],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片：a[href=/amateur/<id>]；封面 img[src]（img.xchina.io/amateurs/<id>/0001.webp），
/// 徽标给张数与评论数，卡片尾部还有上传者与日期。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/amateur\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
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

/// 首页：最新自拍 / 精华自拍 / 评论最多 三块。
async home() {
  var defs = [[{}, '最新自拍'], [{ sort: 'featured' }, '精华自拍'], [{ sort: 'comment' }, '评论最多']];
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

/// 分类：站点自己那四个入口（自拍页顶部一行）。
async categories() {
  return [
    { id: '/amateurs', title: '更新时间' },
    { id: '/amateurs?sort=featured', title: '精华自拍' },
    { id: '/amateurs?sort=comment', title: '评论最多' },
    { id: '/amateurs?sort=recent', title: '最近评论' }
  ];
},

/// 筛选：排序（与分类同源；分类里已带排序时以筛选为准）。
async filters() {
  var options = [];
  for (var i = 0; i < this.__SORTS.length; i++) options.push({ id: this.__SORTS[i][0], title: this.__SORTS[i][1] });
  return [{ id: 'sort', title: '排序', options: options }];
},

/// 列表：GET /amateurs[/<页>][?sort=]（**页号在路径里**：/amateurs/2）。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var url;
  if (keyword) {
    url = '/search?q=' + encodeURIComponent(keyword) + '&type=amateur' + (page > 1 ? '&page=' + page : '');
  } else {
    var category = this.__path(args.categoryId) || '/amateurs';
    var sort = this.__pickSort((args.filters || {}).sort);
    // 分类地址自身可能带查询（/amateurs?sort=featured）：拼接时用它自己的分隔符。
    var separator = category.indexOf('?') >= 0 ? '&' : '?';
    url = category + (page > 1 ? '/' + page : '') + (sort ? separator + 'sort=' + encodeURIComponent(sort) : '');
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 详情：标题（h1 / og:title）、封面（og:image）、张数与上传者。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/amateur\/[A-Za-z0-9]+$/.test(id)) return null;
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
  }
  return {
    id: id,
    title: H.clean(title),
    cover: H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ') : null
  };
},

/// 自拍也没有「章」：一条章节就是整套。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  return id ? [{ id: id, title: '全部图片' }] : [];
},

/// 正文：详情页里的 `img.xchina.io/amateurs/<id>/<序号>.webp`。
/// **只认这一套**：上传者头像走 upload.xchina.io/media/…，媒体（视频）走别的路径，都不混进来。
async content(argument) {
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  var setId = (/^\/amateur\/([A-Za-z0-9]+)$/.exec(id) || [])[1];
  if (!setId) throw new Error('小黄书自拍：缺少套图地址');
  var html = await H.get('/amateur/' + setId);
  var pattern = new RegExp('https://img\\.xchina\\.io/amateurs/' + setId + '/([0-9]+)(_[0-9]+x[0-9]+)?\\.(webp|jpg|jpeg|png)', 'gi');
  var byStem = {};
  var m;
  while ((m = pattern.exec(html)) !== null) {
    var stem = m[1];
    var withSize = !!m[2];
    var current = byStem[stem];
    if (!current || (withSize && !current.withSize)) byStem[stem] = { url: m[0], withSize: withSize };
  }
  var stems = Object.keys(byStem).sort(function (a, b) {
    return Number(a) - Number(b);
  });
  var images = [];
  for (var i = 0; i < stems.length; i++) images.push(byStem[stems[i]].url);
  if (!images.length) throw new Error('小黄书自拍：这套自拍没有取到图片（可能需要登录或 VIP）');
  var page = H.abs('/amateur/' + setId, H.base + '/');
  var headers = {};
  for (var j = 0; j < images.length; j++) headers[images[j]] = H.headers(page);
  return { kind: 'images', images: images, imageHeaders: headers };
}

};
