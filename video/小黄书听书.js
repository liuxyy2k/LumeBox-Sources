// LumeSource: {"id":"xchina_audiobook","name":"小黄书听书","version":"1.0.0","category":"video","group":"听书","icon":"https://xchina.co/assets/img/favicon.png"}
//
// 小黄书 xChina 的**有声小说（听书）**：站点把有声作品放在「有声小说」题材下
// （/fiction-tag/999，实测 2,039 部），每一章的语音版是页面里的
// <audio src="https://upload.xchina.io/mp3/<书号>/<章序>.mp3"> ——**直链音频**，
// 不带加密、不签名（实测 200 audio/mpeg）。
//
// 为什么放在**视频板块**：App 的小说阅读器只认文本（拿到音频会提示「该章节不是文本
// 内容」），而视频播放器拿 kind:'video' 的音频地址能直接播。所以这份源以
// category:"video" + group:"听书" 交付：现在就能听。等 App 支持在小说板块内播音频，
// 把 category 改成 novel、文件挪到 audiobook/ 目录即可（内容不用动）。
//
// 站点结构（2026-10-16 实测）：
//   目录      /fiction-tag/999[/<页>][?sort=&length=]   排序 read|comment、篇幅 1|2|3
//   详情      /fiction/<24位id>                        标题 h1、封面 og:image
//   剧集      LD+JSON hasPart（一章一条）
//   播放      /fiction/<id>/<章序>                      页内 <audio src=…mp3>；
//                                                      页面没给 audio 时按 /mp3/<书号>/<章序-1>.mp3 兜底
//
// 已知边界：站点只给部分作品配音（没有 audio 的章节脚本会如实报「本章没有语音版」）；
// 搜索沿用站点自己的 /search（结果里可能混入没有配音的作品，打开时会看到上面那句提示）。
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

H.base="https://xchina.co";H.name="小黄书听书";
var LumeSource={id:"xchina_audiobook",name:"小黄书听书",version:"1.0.0",category:"video",group:"听书",
icon:"https://xchina.co/assets/img/favicon.png",

/// 真站的「有声小说」题材（/fiction-tag/999）就是听书目录。
__TAG: '/fiction-tag/999',
__SORTS: [['', '更新时间'], ['read', '浏览最多'], ['comment', '评论最多']],
__LENGTHS: [['', '不限'], ['1', '短篇'], ['2', '中长篇'], ['3', '超长篇']],

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 卡片（与小说页同一套标记）：a.card[href=/fiction/<id>]。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return n.tag === 'a' && H.cls(n, 'card') && /^\/fiction\/[A-Za-z0-9]+$/.test(n.attrs.href || '');
    }).map(function (n) {
      var img = H.first(n, function (x) {
        return x.tag === 'img' && /^https?:\/\//.test(x.attrs.src || '');
      });
      var title = H.first(n, function (x) {
        return H.cls(x, 'line-clamp-1');
      });
      var bits = [];
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
        subtitle: bits.length ? '🎧 ' + bits.join(' · ') : '🎧 有声'
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
    if (table[i][0] === wanted) return table[i][0];
  }
  return '';
},

__data: function (html) {
  var re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    try {
      var data = JSON.parse(m[1]);
      var list = Array.isArray(data) ? data : [data];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (list[i].hasPart || list[i]['@type'] === 'CreativeWork')) return list[i];
      }
    } catch (error) {
      // 换下一个脚本块。
    }
  }
  return {};
},

/// 首页：有声小说最新 + 最多浏览。
async home() {
  var defs = [[{}, '最新有声'], [{ filters: { sort: 'read' } }, '最多浏览']];
  var boards = [];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ page: 1, filters: defs[i][0].filters });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (i === 0) throw error;
    }
  }
  return boards;
},

/// 分类：有声小说（最新 / 最多浏览 / 评论最多）——听书只有一个目录页，排序就是它的分类维度。
async categories() {
  return [
    { id: this.__TAG, title: '有声小说' },
    { id: this.__TAG + '?sort=read', title: '最多浏览' },
    { id: this.__TAG + '?sort=comment', title: '评论最多' }
  ];
},

/// 筛选：排序 + 篇幅（与小说页同一套；分类里已带排序时以筛选为准）。
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

/// 列表 / 搜索：GET /fiction-tag/999[/<页>][?sort=&length=]；搜索走站点自己的 /search?q=&type=fiction。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var url;
  if (keyword) {
    url = '/search?q=' + encodeURIComponent(keyword) + '&type=fiction' + (page > 1 ? '&page=' + page : '');
  } else {
    var category = this.__path(args.categoryId) || this.__TAG;
    var filters = args.filters || {};
    var query = [];
    var sort = this.__pick(this.__SORTS, filters.sort);
    var length = this.__pick(this.__LENGTHS, filters.length);
    if (sort) query.push('sort=' + encodeURIComponent(sort));
    if (length) query.push('length=' + encodeURIComponent(length));
    // 分类地址自身可能带查询（/fiction-tag/999?sort=read）：拼接时用它自己的分隔符。
    var separator = category.indexOf('?') >= 0 ? '&' : '?';
    url = category + (page > 1 ? '/' + page : '') + (query.length ? separator + query.join('&') : '');
  }
  var tree = H.tree(await H.get(url));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree) };
},

/// 详情：标题 h1、封面 og:image / LD+JSON image。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  if (!/^\/fiction\/[A-Za-z0-9]+$/.test(id)) return null;
  var html = await H.get(id);
  var tree = H.tree(html);
  var data = this.__data(html);
  var title = data.name || data.headline || H.title(tree);
  if (!title) return null;
  var bits = ['🎧 有声小说'];
  if (data.author && data.author.name) bits.push('作者：' + data.author.name);
  return {
    id: id,
    title: H.clean(title),
    cover: data.image || H.cover(tree),
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.join(' · '),
    description: data.description ? H.clean(data.description) : null
  };
},

/// 剧集：与小说同源（LD+JSON hasPart = 每一章）；一章一个音频。
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
  }
  return rows.length ? rows : [{ id: id, title: '第 1 章' }];
},

/// 播放：章节页里的 `<audio src="https://upload.xchina.io/mp3/<书号>/<序号>.mp3">`。
///
/// 真站每章都有语音版（同一段文字配一条 mp3）；页面没给 audio 标签时按站点自己的
/// 命名规则兜底（`/mp3/<书号>/<章序>.mp3`，章序从 0 开始）。播放头带 Referer，
/// mp3 宿主认站点来源。**注意**：这类站点的 mp3 在独立域名上，音频本体不走 CF 会话。
async content(argument) {
  var chapterPath = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!chapterPath) throw new Error('小黄书听书：缺少章节地址');
  var html = await H.get(chapterPath);
  var tree = H.tree(html);
  var audio = H.first(tree, function (n) {
    return n.tag === 'audio' && /\.mp3(\?|$)/i.test(n.attrs.src || '');
  }) || H.first(tree, function (n) {
    return n.tag === 'source' && /\.mp3(\?|$)/i.test(n.attrs.src || '');
  });
  var url = audio ? H.abs(audio.attrs.src, H.base + '/') : '';
  if (!url) {
    var m = /\/fiction\/([A-Za-z0-9]+)\/(\d+)$/.exec(chapterPath);
    if (m) url = 'https://upload.xchina.io/mp3/' + m[1] + '/' + (Number(m[2]) > 0 ? Number(m[2]) - 1 : 0) + '.mp3';
  }
  if (!url) throw new Error('小黄书听书：本章没有语音版（站点只给部分作品配音）');
  var page = H.abs(chapterPath, H.base + '/');
  return {
    kind: 'video',
    url: url,
    qualities: [{ label: '语音版', url: url }],
    headers: H.headers(page)
  };
}

};
