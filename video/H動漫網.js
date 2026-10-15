// LumeSource: {"id":"hanime_video","name":"H動漫網","version":"1.0.0","category":"video"}
//
// H動漫網（www.hanime.xyz）—— 成人动漫（H動漫）视频站，Bootstrap 服务端渲染。
// 本文件对着**真站响应**写（首页 / 排序页 / 详细页 / 搜索页都取回来存档核过）。
//
// 站点结构（2026-10-14 实测）：
//   分类      /（最新）｜/?sort=hits（最多观看）｜/?sort=score（推荐）｜/?sort=likes（最多点赞）
//   列表      GET /[?sort=…][&page=N]            卡片 div.item（24/页）
//   搜索      GET /?q=<关键词>                    —— 网站自己的搜索表单就是 action="/" + name="q"
//   详情      GET /<数字id>.html                 标题 h1、封面 <video poster>、副标题 p.text-muted
//   正文      GET /<数字id>.html                 播放地址就在页面里：<video><source src="…/index.m3u8">
//                                                （页内 LD+JSON 的 contentUrl 是同一地址，做兜底）
//
// 已知边界：
// - 单页一集（没有选集），所以 chapters() 只给一项「播放」。
// - m3u8 在独立播放域名上（非 443 端口），脚本把详细页地址作 Referer 一起交出去。
// - 站点导航里的「色文 / 色漫 / 色圖 / 追劇」指向**别的域名**（站群），本脚本只管视频这一站。
var H = {
  base: '', name: 'H動漫網', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://www.hanime.xyz";H.name="H動漫網";
var LumeSource={id:"hanime_video",name:"H動漫網",version:"1.0.0",category:"video",

/// 列表卡片：div.item > div.card（封面 img.card-img-top + a[href=/<id>.html] + 时长/播放量角标）。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return H.cls(n, 'item') && H.first(n, function (x) {
        return x.tag === 'a' && /^\/\d+\.html$/.test(x.attrs.href || '');
      });
    }).map(function (n) {
      var link = H.first(n, function (x) {
        return x.tag === 'a' && /^\/\d+\.html$/.test(x.attrs.href || '');
      });
      var title = '';
      var anchors = H.all(n, function (x) {
        return x.tag === 'a' && /^\/\d+\.html$/.test(x.attrs.href || '');
      });
      for (var i = 0; i < anchors.length; i++) {
        var text = H.clean(H.text(anchors[i]));
        if (text.length > title.length) title = text;
      }
      var img = H.first(n, function (x) {
        return x.tag === 'img';
      });
      if (!title && img) title = H.clean(img.attrs.alt || '');
      var badge = H.first(n, function (x) {
        return H.cls(x, 'badge');
      });
      return {
        id: self.__path(link ? link.attrs.href : ''),
        title: title,
        cover: H.image(n),
        coverHeaders: H.headers(H.base + '/'),
        subtitle: badge ? H.clean(H.text(badge)) : null
      };
    })
  );
},

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 播放地址：详细页的 <video><source src>（站点自己就是这么播的）；
/// 载荷里那份 LD+JSON 的 contentUrl 是同一地址，作为兜底。
__source: function (html) {
  var text = String(html || '');
  var m = /<source[^>]+src=["']([^"']+\.m3u8[^"']*)["']/i.exec(text);
  if (m) return m[1];
  m = /<source[^>]+src=["'](https?:\/\/[^"']+)["']/i.exec(text);
  if (m) return m[1];
  m = /"contentUrl"\s*:\s*"([^"]+)"/.exec(text);
  if (m) return m[1].replace(/\\\//g, '/');
  m = /<video[^>]+src=["'](https?:\/\/[^"']+)["']/i.exec(text);
  return m ? m[1] : '';
},

/// 首页：四种排序各一块（站点导航的「最新 / 最多 / 推荐 / 最好」）。
async home() {
  var defs = [['/', '最新'], ['/?sort=hits', '最多观看'], ['/?sort=score', '推荐'], ['/?sort=likes', '最多点赞']];
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

/// 分类 = 站点自己的四种排序（导航里逐条核对过）。
async categories() {
  return [
    { id: '/', title: '最新' },
    { id: '/?sort=hits', title: '最多观看' },
    { id: '/?sort=score', title: '推荐' },
    { id: '/?sort=likes', title: '最多点赞' }
  ];
},

/// 列表 / 搜索：搜索是首页的 `?q=`（`?keyword=`/`?search=` 都无效，实测）。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var url = keyword
    ? '/?q=' + encodeURIComponent(keyword)
    : (String(args.categoryId == null ? '' : args.categoryId).trim() || '/');
  if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: H.next(tree, page) };
},

/// 标题：h1 里的链接文本（h1 里还挂着「点赞」按钮的 Vue 占位，整段取会把 {{…}} 带出来）。
__title: function (tree) {
  var head = H.first(tree, function (n) {
    return n.tag === 'h1';
  });
  if (head) {
    var link = H.first(head, function (n) {
      return n.tag === 'a' && H.clean(H.text(n)).length > 2;
    });
    var text = H.clean(link ? H.text(link) : H.text(head));
    if (text) return text;
  }
  return H.title(tree).replace(/\{\{[^}]*\}\}/g, '').replace(/\s+/g, ' ').trim();
},

/// 详情：h1 标题、<video poster> 封面、p.text-muted 副标题。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!id) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var title = this.__title(tree);
  if (!title) return null;
  var video = H.first(tree, function (n) {
    return n.tag === 'video';
  });
  var note = H.first(tree, function (n) {
    return n.tag === 'p' && H.cls(n, 'text-muted');
  });
  return {
    id: id,
    title: title,
    cover: video && video.attrs.poster ? H.abs(video.attrs.poster, H.base + '/') : H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: note ? H.clean(H.text(note)) : null
  };
},

/// 单集视频：一页一集，播放项就一项。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  return id ? [{ id: id, title: '播放' }] : [];
},

/// 播放地址：m3u8 直链（站点播放器用的就是它）。Referer 带上详细页，图床同理。
async content(argument) {
  var page = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!page) throw new Error('H動漫網：缺少视频地址');
  var html = await H.get(page);
  var url = this.__source(html);
  if (!url) throw new Error('H動漫網：播放页没有可播放地址，请先完成网页验证');
  return {
    kind: 'video',
    url: H.abs(url, H.base + '/'),
    qualities: [{ label: '原画', url: H.abs(url, H.base + '/') }],
    headers: H.headers(H.abs(page, H.base + '/'))
  };
}

};
