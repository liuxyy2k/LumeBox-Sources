// LumeSource: {"id":"relamanhua_comic","name":"熱辣漫畫","version":"1.0.0","category":"comic"}

// 站点：https://www.relamanhua.com （熱辣漫畫，前端是 Vue 单页；后端是 copymanga v3 接口）
//
// **实测（2026-10-15）**：网站本体只发一个 SPA 壳，数据全在 API 上；接口域名平时由
// 站点自己下发（`api:["api.manga2026.xyz"]`），脚本按内置域名表探活。
// 逐条核过的接口：
//   首页      GET /api/v3/h5/homeIndex                    → results.{recComics, rankWeeklyFreeComics,
//                                                            updateWeeklyFreeComics, …}.list[]
//   题材      GET /api/v3/h5/filter/comic/tags?type=1     → results.theme[] {name, path_word, count}
//   列表      GET /api/v3/comics?limit=&offset=&ordering=&theme=<题材 path_word>
//                                                          → results.{list,total}
//   搜索      GET /api/v3/search/comic?q=&limit=&offset=  → results.list[]
//   详情      GET /api/v3/comic2/<path_word>?platform=1    → results.comic{…} + results.groups{…}
//   章节      GET /api/v3/comic/<path_word>/group/<组>/chapters?limit=&offset=
//                                                          → results.list[] {uuid, name, index}
//   正文      GET /api/v3/comic/<path_word>/chapter/<章节 uuid>?platform=1
//                                                          → results.chapter.contents[].url
// 条目字段：{name, path_word, cover, author[{name}], theme[{name}], popular, datetime_updated}。
// 图床（sr.mangafunb.fun / s3.mangafunb.fun）实测**不需要 Referer**。
var H = {
  base: '', name: '熱辣漫畫', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://www.relamanhua.com";H.name="熱辣漫畫";
var LumeSource={id:"relamanhua_comic",name:"熱辣漫畫",version:"1.0.0",category:"comic",

/// 接口域名表（站点自己也是这么下发 + 探活的）：按顺序试，第一个通的记住。
__apiHosts: ['https://api.manga2026.xyz','https://mapi.mangafuna.site'],
__api: '',

/// 一次接口调用：统一带 `platform: 1`（站点自己的请求头就这么带）。
async __get(path) {
  if (!this.__api) {
    var picked = '';
    for (var i = 0; i < this.__apiHosts.length; i++) {
      var host = this.__apiHosts[i];
      try {
        var probe = await LumeSource.http.get(host + '/api/v3/h5/homeIndex', {
          headers: {
            'User-Agent': H.ua,
            'Accept': 'application/json',
            'platform': '1',
            'Referer': H.base + '/'
          }
        });
        if (!probe || probe.status !== 200) continue;
        var body = String(probe.body || '');
        if (body.indexOf('"code":200') < 0) continue;
        picked = host;
        break;
      } catch (error) {
        // 这个域名不通，换下一个
      }
    }
    if (!picked) throw new Error('熱辣漫畫：接口域名都不可用（' + this.__apiHosts.join(' / ') + '）');
    this.__api = picked;
  }
  var response = await LumeSource.http.get(this.__api + path, {
    headers: {
      'User-Agent': H.ua,
      'Accept': 'application/json',
      'platform': '1',
      'Referer': H.base + '/'
    }
  });
  if (!response) throw new Error('熱辣漫畫：没有网络响应');
  if (response.status === 403 || response.status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：熱辣漫畫 需要网页验证（HTTP ' + response.status + '）');
  }
  if (response.status !== 200) throw new Error('熱辣漫畫：请求失败（HTTP ' + response.status + '）');
  var text = String(response.body || '');
  var data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error('熱辣漫畫：数据格式已变化');
  }
  if (!data || data.code !== 200) {
    throw new Error('熱辣漫畫：接口返回 ' + ((data && data.message) || '未知错误'));
  }
  return data.results;
},

/// 接口条目 → 统一列表项（封面不需要 Referer，仍带上站点头以防万一）。
__item: function (row) {
  if (!row || !row.path_word || !row.name) return null;
  return {
    id: row.path_word,
    title: H.clean(row.name),
    cover: row.cover ? H.abs(row.cover) : null,
    coverHeaders: H.headers(H.base + '/'),
    subtitle: row.author && row.author.length
      ? '作者：' + row.author.map(function (a) { return a.name; }).join('、')
      : null
  };
},

/// 首页：推荐 / 本週免費排行 / 本週免費更新（都取自站点自己的首页接口）。
async home() {
  var results = await this.__get('/api/v3/h5/homeIndex');
  var boards = [];
  var defs = [
    ['recComics', '推薦'],
    ['rankWeeklyFreeComics', '本週排行'],
    ['updateWeeklyFreeComics', '本週更新']
  ];
  for (var i = 0; i < defs.length; i++) {
    var group = results ? results[defs[i][0]] : null;
    var list = (group && group.list) || [];
    var items = H.unique(list.map(this.__item.bind(this)).filter(Boolean));
    if (items.length) boards.push({ title: defs[i][1], items: items.slice(0, 12) });
  }
  if (!boards.length) {
    var page = await this.list({ page: 1 });
    if (page.items.length) boards.push({ title: '最新', items: page.items.slice(0, 12) });
  }
  return boards;
},

/// 分类 = 站点接口给的题材（`results.theme`，每项带 path_word 与作品数）。
async categories() {
  var results = await this.__get('/api/v3/h5/filter/comic/tags?type=1');
  var themes = (results && results.theme) || [];
  var rows = themes.map(function (theme) {
    return {
      id: String(theme.path_word || ''),
      title: H.clean(theme.name || '') + (theme.count ? '（' + theme.count + '）' : '')
    };
  }).filter(function (row) {
    return !!row.id && !!row.title;
  });
  return [{ id: '', title: '最新' }].concat(rows);
},

/// 列表 / 搜索：题材走 `theme=`，排序走 `ordering=`，分页是 limit/offset。
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var limit = 30;
  var offset = (page - 1) * limit;
  var keyword = H.clean(args.keyword || '').trim();
  var theme = String(args.categoryId == null ? '' : args.categoryId).trim();
  var path;
  if (keyword) {
    path = '/api/v3/search/comic?q=' + encodeURIComponent(keyword) + '&limit=' + limit + '&offset=' + offset;
  } else {
    path = '/api/v3/comics?limit=' + limit + '&offset=' + offset + '&ordering=-datetime_updated';
    if (theme) path += '&theme=' + encodeURIComponent(theme);
  }
  var results = await this.__get(path);
  var list = (results && results.list) || [];
  var items = H.unique(list.map(this.__item.bind(this)).filter(Boolean));
  if (!items.length && !keyword && !theme && page === 1) {
    console.warn('[relamanhua] 列表为空：' + path);
  }
  var total = Number((results && results.total) || 0);
  return { items: items, hasMore: total > 0 ? offset + items.length < total : items.length >= limit };
},

/// 详情：`results.comic` 就是条目信息（简介 / 题材 / 作者 / 状态都在里面）。
async detail(argument) {
  var id = String(argument && argument.id ? argument.id : '').trim();
  if (!id) return null;
  var results = await this.__get('/api/v3/comic2/' + encodeURIComponent(id) + '?platform=1');
  var comic = (results && results.comic) || null;
  if (!comic || !comic.name) return null;
  var tags = [];
  (comic.theme || []).forEach(function (theme) {
    var name = H.clean('' + (theme && theme.name ? theme.name : theme));
    if (name && tags.indexOf(name) < 0) tags.push(name);
  });
  (comic.parodies || []).forEach(function (item) {
    var name = H.clean('' + (item && item.name ? item.name : item));
    if (name && tags.indexOf(name) < 0) tags.push(name);
  });
  var extras = [];
  if (comic.status && comic.status.display) extras.push('状态：' + comic.status.display);
  if (comic.last_chapter && comic.last_chapter.name) extras.push('最新：' + comic.last_chapter.name);
  return {
    id: id,
    title: H.clean(comic.name),
    cover: comic.cover ? H.abs(comic.cover) : null,
    coverHeaders: H.headers(H.base + '/'),
    subtitle: extras.length ? extras.join(' · ') : null,
    description: comic.brief ? H.clean('' + comic.brief) : null,
    tags: tags.length ? tags : undefined
  };
},

/// 章节：详情里的 `groups`（default / 单行本 / 合作汉化…）逐个取章节列表，按组内顺序拼。
async chapters(argument) {
  var id = String(argument && argument.id ? argument.id : '').trim();
  if (!id) return [];
  var results = await this.__get('/api/v3/comic2/' + encodeURIComponent(id) + '?platform=1');
  var groups = (results && results.groups) || {};
  var names = Object.keys(groups);
  // 先按组收齐，最后再决定要不要给章节名加「[组名]」前缀：只有一个组有章节时
  // 不加（copymanga 系默认组叫「默認」，加上去纯属噪音）。
  var byGroup = [];
  for (var i = 0; i < names.length; i++) {
    var group = groups[names[i]] || {};
    var groupPath = String(group.path_word || names[i]);
    if (!groupPath) continue;
    var limit = 500;
    var offset = 0;
    var total = Number(group.count || 0);
    for (var round = 0; round < 40; round++) {
      var chunk = await this.__get(
        '/api/v3/comic/' + encodeURIComponent(id) + '/group/' + encodeURIComponent(groupPath) +
        '/chapters?limit=' + limit + '&offset=' + offset
      );
      var list = (chunk && chunk.list) || [];
      if (!list.length) break;
      var collected = [];
      list.forEach(function (chapter) {
        if (!chapter || !chapter.uuid) return;
        collected.push({
          id: id + '|' + groupPath + '|' + chapter.uuid,
          title: H.clean('' + (chapter.name || ''))
        });
      });
      if (collected.length) {
        byGroup.push({ name: H.clean('' + (group.name || groupPath)), rows: collected });
      }
      offset += list.length;
      if (total > 0 ? offset >= total : list.length < limit) break;
    }
  }
  if (!byGroup.length) throw new Error('熱辣漫畫：这个作品没有读取到章节（可能需要登录）');
  var rows = [];
  var multi = byGroup.length > 1;
  byGroup.forEach(function (group) {
    group.rows.forEach(function (row, index) {
      rows.push({
        id: row.id,
        title: (multi ? '[' + group.name + '] ' : '') + (row.title || '第 ' + (index + 1) + ' 話')
      });
    });
  });
  return H.unique(rows);
},

/// 正文：章节 uuid 换页面图（`results.chapter.contents[].url`）。
async content(argument) {
  var chapterId = String((argument && argument.chapterId) || (argument && argument.id) || '').trim();
  var parts = chapterId.split('|');
  if (parts.length < 3) {
    throw new Error('熱辣漫畫：认不出章节地址（' + chapterId + '）——章节 id 应当来自 chapters()');
  }
  var pathWord = parts[0];
  var uuid = parts[2];
  var results = await this.__get(
    '/api/v3/comic/' + encodeURIComponent(pathWord) + '/chapter/' + encodeURIComponent(uuid) + '?platform=1'
  );
  var chapter = (results && results.chapter) || null;
  var contents = (chapter && chapter.contents) || [];
  var images = [];
  var seen = {};
  contents.forEach(function (item) {
    var url = item && item.url ? String(item.url).trim() : '';
    if (!/^https?:\/\//i.test(url) || seen[url]) return;
    seen[url] = true;
    images.push(url);
  });
  if (!images.length) throw new Error('熱辣漫畫：这一话没有读取到图片（可能需要登录，或站点结构已变化）');
  var page = H.base + '/comic/' + encodeURIComponent(pathWord);
  return H.imageContent(images, page);
}

};
