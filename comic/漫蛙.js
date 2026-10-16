// LumeSource: {"id":"manwa_comic","name":"漫蛙","version":"1.0.0","category":"comic","icon":"https://mwappimgs.cc/static/images/apple-touch-icon-192x192.png"}
// Embedded into each source by tools/build_requested_sources.py; no remote code imports.
var H = {
  base: '', name: '漫蛙', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://manwa.me";H.name="漫蛙";
var LumeSource={id:"manwa_comic",name:"漫蛙",version:"1.0.0",category:"comic",
async home(){var r=await this.list({page:1});return [{title:"最新",items:r.items.slice(0,12)}];},

// 分类（用户口径：分类筛选要按网页给全）：站点自己的入口 + 筛选条上的五组。
//   分类分类 gender：-1 全部 / 2 一般向 / 0 BL向 / 1 禁漫 / 3 TL向 / 4 GL向
//   地区 area：'' 全部 / 2 韩国 / 3 日漫 / 4 国漫 / 5 台漫 / 6 其他 / 1 未分类
//   状态 end：'' 全部 / 2 连载中 / 1 完结
//   排序 sort：-1 最新 / 0 最旧 / 1 收藏 / 2 新漫
//   标签 tag：站点 booklist 页 tags 那一排（下面按站点自己的值列全）
// 这些 id 就是站点 `/booklist?...` 查询串里的值，list() 原样拼回去。
async categories(){
  return [
    {id:'/',title:'推荐'},
    {id:'/booklist',title:'全部'},
    {id:'/update',title:'最近更新'},
    {id:'/rank',title:'排行榜'},
    {id:'/rank?type=end',title:'完结榜'}
  ];
},
async filters(){
  return {groups:[
    {id:'gender',title:'分类',options:[
      {id:'-1',title:'全部'},{id:'2',title:'一般向'},{id:'0',title:'BL向'},
      {id:'1',title:'禁漫'},{id:'3',title:'TL向'},{id:'4',title:'GL向'}
    ]},
    {id:'area',title:'地区',options:[
      {id:'',title:'全部'},{id:'2',title:'韩国'},{id:'3',title:'日漫'},
      {id:'4',title:'国漫'},{id:'5',title:'台漫'},{id:'6',title:'其他'},
      {id:'1',title:'未分类'}
    ]},
    {id:'end',title:'状态',options:[
      {id:'',title:'全部'},{id:'2',title:'连载中'},{id:'1',title:'完结'}
    ]},
    {id:'sort',title:'排序',options:[
      {id:'-1',title:'最新'},{id:'0',title:'最旧'},{id:'1',title:'收藏'},{id:'2',title:'新漫'}
    ]},
    {id:'tag',title:'标签',options:[
      {id:'',title:'全部'},{id:'中文',title:'中文'},{id:'巨乳',title:'巨乳'},
      {id:'中出',title:'中出'},{id:'口交',title:'口交'},{id:'19R',title:'19R'},
      {id:'透视',title:'透视'},{id:'全彩',title:'全彩'},{id:'日漫',title:'日漫'},
      {id:'群交',title:'群交'},{id:'校服',title:'校服'},{id:'日文',title:'日文'},
      {id:'女性向',title:'女性向'},{id:'乳交',title:'乳交'},{id:'韩漫',title:'韩漫'},
      {id:'肛交',title:'肛交'}
    ]}
  ]};
},

/// 把筛选选择拼进书库地址（站点自己的查询串参数）。
///
/// 值走白名单：认不出的（含 App 把空 id 换成标题的「全部」）一律当作没选，
/// 不把任意串拼进地址。筛选是书库页的功能，选了筛选就落到 `/booklist`。
__withFacets: function (url, filters) {
  var base = String(url == null ? '' : url).trim() || '/booklist';
  var wanted = {
    gender: this.__facetValue(filters && filters.gender, ['-1', '0', '1', '2', '3', '4']),
    area: this.__facetValue(filters && filters.area, ['1', '2', '3', '4', '5', '6']),
    end: this.__facetValue(filters && filters.end, ['1', '2']),
    sort: this.__facetValue(filters && filters.sort, ['-1', '0', '1', '2'])
  };
  var tag = this.__facetText(filters && filters.tag);
  var picked = false;
  for (var key in wanted) {
    if (wanted[key]) picked = true;
  }
  if (tag) picked = true;
  if (!picked) return base;
  if (base.indexOf('/booklist') !== 0) base = '/booklist';
  var parts = base.split('?');
  var params = {};
  var order = [];
  var query = parts.length > 1 ? parts[1] : '';
  query.split('&').forEach(function (pair) {
    if (!pair) return;
    var i = pair.indexOf('=');
    var name = i < 0 ? pair : pair.slice(0, i);
    var value = i < 0 ? '' : pair.slice(i + 1);
    if (!name || order.indexOf(name) >= 0) return;
    order.push(name);
    params[name] = value;
  });
  for (var name2 in wanted) {
    if (wanted[name2]) params[name2] = wanted[name2];
  }
  if (tag) params.tag = tag;
  var out = [];
  order.forEach(function (name) {
    if (params[name] !== undefined) out.push(name + '=' + params[name]);
  });
  ['tag', 'gender', 'area', 'end', 'sort'].forEach(function (name) {
    if (params[name] === undefined || order.indexOf(name) >= 0) return;
    out.push(name + '=' + params[name]);
  });
  return parts[0] + (out.length ? '?' + out.join('&') : '');
},

__facetValue: function (value, allowed) {
  var text = String(value == null ? '' : value).split(',')[0];
  return allowed.indexOf(text) >= 0 ? text : '';
},

__facetText: function (value) {
  var text = String(value == null ? '' : value).split(',')[0].trim();
  if (!text || text === '全部') return '';
  if (!/^[^&#?\/]+$/.test(text)) return '';
  return encodeURIComponent(text);
},

/// 分页：站点自己的分页器是 `<a data-page="N">`（**没有 href**），
/// 只看链接会永远判成「没有下一页」，书库就翻不动。
__hasMore: function (html, page) {
  var next = page + 1;
  var text = String(html);
  if (text.indexOf('data-page="' + next + '"') >= 0) return true;
  if (text.indexOf("data-page='" + next + "'") >= 0) return true;
  if (new RegExp('[?&]page=' + next + '(\\D|$)').test(text)) return true;
  return false;
},
async list(a){
  a=a||{};
  var p=Number(a.page)||1;
  if(p<1)p=1;
  var u=this.__withFacets(a.categoryId||'/',a.filters);
  if(p>1)u+=(u.indexOf('?')>=0?'&':'?')+'page='+p;
  var html=await H.get(u);
  var t=H.tree(html);
  var items=H.unique(H.links(t,/^\/book\/\d+$/).map(function(n){var scope=n;for(var i=0;i<2&&scope.parent;i++)scope=scope.parent;var title=H.text(n)||H.text(H.first(scope,function(x){return H.cls(x,'manga-list-2-title');}));return {id:n.attrs.href,title:title,cover:H.image(scope),coverHeaders:H.headers()};}));
  if(a.keyword)items=items.filter(function(i){return i.title.indexOf(a.keyword)>=0;});
  var more=this.__hasMore(html,p);
  if(!items.length)console.warn('[manwa] 列表没解析出条目：'+u+'（'+html.length+' 字符）');
  return {items:items,hasMore:more};
},
/// 详情：标题 `h1.detail-main-info-title`、封面 `div.detail-main-cover` 里的 img。
///
/// **封面必须只认站点图床**（`/static/upload…`）：之前是「从标题往上找第一个 img」，
/// 结果抓到页头的站点 logo（`/static/images/new_logo.svg`）——SVG 解不了码，
/// 真机日志里一串「图片解码失败: new_logo.svg」就是这么来的。
async detail(a){
  var t=H.tree(await H.get(a.id));
  var title=H.first(t,function(n){return H.cls(n,'detail-main-info-title');});
  var box=H.first(t,function(n){return H.cls(n,'detail-main-cover');});
  var cover=H.first(box||t,function(n){
    return n.tag==='img'&&/\/static\/upload/.test(n.attrs['data-original']||n.attrs['data-src']||n.attrs.src||'');
  });
  var url=cover?(cover.attrs['data-original']||cover.attrs['data-src']||cover.attrs.src):'';
  if(!url&&box)url=H.image(box)||'';
  return {id:a.id,title:H.text(title)||H.title(t),cover:url?H.abs(url,H.base+'/'):null,coverHeaders:H.headers()};
},
async chapters(a){var t=H.tree(await H.get(a.id));return H.unique(H.links(t,/^\/chapter\/\d+$/).map(function(n){return {id:n.attrs.href,title:H.text(n)};}));},
async content(a){var page=H.abs(a.chapterId),t=H.tree(await H.get(page));var images=H.all(t,function(n){return n.tag==='img'&&H.cls(n,'content-img');}).map(function(n){return H.abs(n.attrs['data-r-src']||'');}).filter(Boolean);var result=H.imageContent(images,page);images.forEach(function(u){result.imageHeaders[u]['X-Lume-Image-Encoding']='aes-cbc-pkcs7';result.imageHeaders[u]['X-Lume-Image-Key']='my2ecret782ecret';result.imageHeaders[u]['X-Lume-Image-IV']='my2ecret782ecret';});return result;}

};
