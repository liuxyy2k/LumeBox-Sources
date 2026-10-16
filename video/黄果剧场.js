// LumeSource: {"id":"huangguo_video","name":"黄果剧场","version":"1.0.0","category":"video","icon":"https://huangguo.video/favicon.ico"}
//
// 黄果剧场（huangguo.video）—— AI 成人短剧站：连续剧按集更新、短片单集播完。
// 真站是 SSR，筛选条（分类 / 尺度 / 情节标签）也全在 HTML 里，脚本逐条解析
// （快照见 snapshots/huangguo_*）。
//
// 站点结构（2026-10-16 实测）：
//   分类      /videos?category=all|1|2|3|4   全部 / MV·音乐剧 / 短片 / 连续剧 / 片段
//   筛选      ?rating=1|2|3（安全 / 裸露 / 限制级）、?tags=1,2（**情节标签可多选，逗号相连**，
//             真站 16 个标签：都市 人妻 玄幻 古风 乱伦 校园 职场 NTR 同人 欧美 穿越
//             二次元 女同 男同 露出 衍生）
//   列表      GET /videos?category=…[&rating=][&tags=a,b][&page=N]
//   搜索      GET /search?q=<关键词>[&page=N]（结果与列表同一套卡片标记）
//   详情      GET /series/<id>（连续剧）｜/video/<id>（短片）   标题 h1、封面 og:image
//   剧集      /series/<id> 里 a.series-ep-chip（title="第N集 · 时长"，真站默认倒序 → 脚本升序）
//   播放      div[data-hg-player][data-hls="/uploads/content/…/master.m3u8"]（站内相对路径）
//
// 已知边界：播放地址是站内 m3u8，脚本补全后带页面 Referer 交出；VIP 专属剧集站点自己会拦，
// 脚本如实报「这一集没有可播放地址（可能需要 VIP）」，不绕过。
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

H.base="https://huangguo.video";H.name="黄果剧场";
var LumeSource={id:"huangguo_video",name:"黄果剧场",version:"1.0.0",category:"video",
icon:"https://huangguo.video/favicon.ico",

/// 分类：站点自己的 category（首页/视频页顶部一行）。
__CATEGORIES: [
  ['all', '全部视频'], ['1', 'MV/音乐剧'], ['2', '短片'], ['3', '连续剧'], ['4', '片段']
],
/// 尺度分级：站点自己的 ?rating=。
__RATINGS: [['', '全部'], ['1', '安全'], ['2', '裸露'], ['3', '限制级']],
/// 情节标签：站点自己的 ?tags=（可多选，逗号相连；真站列表页那一行，实测）。
__TAGS: [
  ['1', '都市'], ['2', '人妻'], ['40', '玄幻'], ['7', '古风'], ['8', '乱伦'],
  ['5', '校园'], ['6', '职场'], ['9', 'NTR'], ['4', '同人'], ['57', '欧美'],
  ['39', '穿越'], ['59', '二次元'], ['55', '女同'], ['56', '男同'], ['42', '露出'], ['3', '衍生']
],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片：article.video-card > a[href=/series/<id> 或 /video/<id>]
/// （封面 img.video-cover-img[src]，角标给「限制级 / 更新至第N集」）。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && /^\/(?:series|video)\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).map(function (n) {
      var img = H.first(n, function (x) {
        return x.tag === 'img';
      });
      var pill = H.first(n, function (x) {
        return H.cls(x, 'cover-pill-text') && /更新至|完结|全集/.test(H.text(x));
      });
      var title = H.first(n, function (x) {
        return x.tag === 'p' && H.cls(x, 'font-display');
      });
      var rating = H.first(n, function (x) {
        return H.cls(x, 'cover-pill-text') && /级$/.test(H.text(x));
      });
      var bits = [];
      if (rating) bits.push(H.text(rating));
      if (pill) bits.push(H.text(pill));
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

__pick: function (table, value) {
  var wanted = String(value == null ? '' : value).trim();
  for (var i = 0; i < table.length; i++) {
    if (table[i][0] === wanted) return wanted;
  }
  return '';
},

/// 多选标签：真站用逗号相连（tags=1,2 实测「都市·人妻」）；认不出的值一律丢掉。
__tagValue: function (value) {
  var raw = String(value == null ? '' : value).split(',');
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var picked = this.__pick(this.__TAGS, raw[i]);
    if (picked && out.indexOf(picked) < 0) out.push(picked);
  }
  return out.join(',');
},

/// 首页：最新发布 / 连续剧 / 短片 三块。
async home() {
  var defs = [['all', '最新发布'], ['3', '连续剧'], ['2', '短片']];
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

/// 分类：站点自己的 5 个分类 + 两个内容入口（更新 / 排行）。
async categories() {
  var out = [];
  for (var i = 0; i < this.__CATEGORIES.length; i++) {
    out.push({ id: '/videos?category=' + this.__CATEGORIES[i][0], title: this.__CATEGORIES[i][1] });
  }
  out.push({ id: '/updates', title: '最近更新' });
  out.push({ id: '/ranking', title: '排行榜' });
  return out;
},

/// 筛选：尺度分级 + 情节标签（多选）。
async filters() {
  var ratings = [];
  for (var i = 0; i < this.__RATINGS.length; i++) ratings.push({ id: this.__RATINGS[i][0], title: this.__RATINGS[i][1] });
  var tags = [];
  for (var j = 0; j < this.__TAGS.length; j++) tags.push({ id: this.__TAGS[j][0], title: this.__TAGS[j][1] });
  return [
    { id: 'rating', title: '尺度', options: ratings },
    { id: 'tags', title: '情节标签', options: tags }
  ];
},

/// 列表 / 搜索：
///   列表 GET /videos?category=<分类>[&rating=][&tags=a,b][&page=N]
///   搜索 GET /search?q=<关键词>[&page=N]
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var filters = args.filters || {};
  var url;
  if (keyword) {
    url = '/search?q=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
  } else {
    var category = this.__path(args.categoryId);
    var query = [];
    if (category.indexOf('/videos') === 0) {
      var params = /[?&]category=([A-Za-z0-9]+)/.exec(category);
      url = '/videos?category=' + (this.__pick(this.__CATEGORIES, params ? params[1] : '') || 'all');
    } else if (category === '/updates' || category === '/ranking') {
      url = category;
    } else {
      url = '/videos?category=all';
    }
    var rating = this.__pick(this.__RATINGS, filters.rating);
    var tags = this.__tagValue(filters.tags);
    if (rating) query.push('rating=' + encodeURIComponent(rating));
    if (tags) query.push('tags=' + encodeURIComponent(tags));
    if (page > 1) query.push('page=' + page);
    if (query.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 详情：标题 h1、封面 og:image；连续剧与短片同页。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/(?:series|video)\/[A-Za-z0-9]+$/.test(id)) return null;
  var tree = H.tree(await H.get(id));
  var title = H.title(tree);
  if (!title) return null;
  var bits = [];
  H.all(tree, function (n) {
    return H.cls(n, 'cover-pill-text') || (n.tag === 'span' && /更新至|完结|全\d+集|^\d+集$/.test(H.text(n)) && H.text(n).length < 14);
  }).forEach(function (n) {
    var text = H.text(n);
    if (text && bits.indexOf(text) < 0 && text.length < 20) bits.push(text);
  });
  return {
    id: id,
    title: H.clean(title),
    cover: H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.slice(0, 3).join(' · ') : null
  };
},

/// 剧集：连续剧的选集（a.series-ep-chip，title="第N集 · 时长"，真站默认倒序 → 脚本按集号升序）；
/// 短片只有一个播放项。
async chapters(argument) {
  var id = this.__path(argument && argument.id);
  if (!id) return [];
  var tree = H.tree(await H.get(id));
  var rows = [];
  H.all(tree, function (n) {
    return n.tag === 'a' && H.cls(n, 'series-ep-chip') && /^\/video\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var label = n.attrs.title || H.text(n);
    rows.push({ id: n.attrs.href, title: H.clean(label) || '播放' });
  });
  rows = H.unique(rows);
  if (!rows.length) return [{ id: id, title: '播放' }];
  rows.sort(function (a, b) {
    var x = Number((/第\s*(\d+)\s*集/.exec(a.title) || [])[1] || 0);
    var y = Number((/第\s*(\d+)\s*集/.exec(b.title) || [])[1] || 0);
    return x - y;
  });
  return rows;
},

/// 播放：播放页的 `div[data-hg-player][data-hls]`（站点自己的播放器标记，真站实测）。
/// 地址是站内相对路径，补全后连同页面 Referer 一起交出（播放域名认站点来源）。
async content(argument) {
  var page = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!page) throw new Error('黄果剧场：缺少播放地址');
  var html = await H.get(page);
  var tree = H.tree(html);
  var player = H.first(tree, function (n) {
    return n.attrs['data-hg-player'] !== undefined || (n.attrs['data-hls'] || '').length > 0;
  });
  var raw = player ? String(player.attrs['data-hls'] || '') : '';
  if (!raw) {
    var m = /data-hls="([^"]+)"/.exec(html);
    raw = m ? m[1] : '';
  }
  if (!raw) throw new Error('黄果剧场：这一集没有可播放地址（可能需要 VIP 或站点已改版）');
  var url = H.abs(raw, H.base + '/');
  return {
    kind: 'video',
    url: url,
    qualities: [{ label: '自适应', url: url }],
    headers: H.headers(H.abs(page, H.base + '/'))
  };
}

};
