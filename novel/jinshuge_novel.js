// LumeSource: {"id":"jinshuge_novel","name":"禁书阁","version":"1.0.0","category":"novel"}
// Site-specific adapter. Live requests checked 2026-10-14; membership restrictions remain enforced.

// Embedded into each source by tools/build_requested_sources.py; no remote code imports.
var H = {
  base: '', name: '', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'' )).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); },
  entity: function(s) {return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,function(v){var map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[v])return map[v];var code=v.charAt(2)==='x'?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(code)?String.fromCodePoint(code):v;});},
  attr: function(s,k) {var m=new RegExp('(?:^|\\s)'+k+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s||'');return this.entity(m?(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'');},
  abs: function(u,from) {u=this.entity(u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.indexOf('//')===0)return 'https:'+u;var b=from||this.base;if(u.charAt(0)==='/')return /^https?:\/\/[^/]+/.exec(b)[0]+u;return b.replace(/[^/]*$/,'')+u;},
  headers: function(page) {return {'User-Agent':this.ua,'Referer':page||this.base+'/'};},
  response: function(r) {if(!r)throw new Error(this.name+'：没有网络响应');var s=r.status;if(s===403||s===503||s===521)throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+s+'）');if(s!==200)throw new Error(this.name+'：请求失败（HTTP '+s+'）');var b=String(r.body||'');if(/cf-chl-|Just a moment|cf-turnstile/i.test(b))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证');return b;},
  get: async function(u) {return this.response(await LumeSource.http.get(this.abs(u,this.base+'/'),{headers:this.headers()}));},
  post: async function(u,data) {var h=this.headers();h['Content-Type']='application/x-www-form-urlencoded';h['X-Requested-With']='XMLHttpRequest';return this.response(await LumeSource.http.post(this.abs(u,this.base+'/'),data,{headers:h}));},
  json: async function(u) {try{return JSON.parse(await this.get(u));}catch(e){if(/NEED_WEBVIEW_VERIFY|HTTP/.test(String(e)))throw e;throw new Error(this.name+'：数据格式已变化');}},
  tree: function(html) {html=String(html).replace(/<!--[^]*?-->/g,'').replace(/<script\b[^]*?<\/script>|<style\b[^]*?<\/style>/gi,'');var root={tag:'root',attrs:{},children:[],raw:''},stack=[root],re=/<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi,m;while((m=re.exec(html))){var parent=stack[stack.length-1];if(m[3]){parent.children.push({tag:'#text',raw:m[3],attrs:{},children:[]});continue;}var tag=m[1].toLowerCase();if(m[0].charAt(1)==='/'){for(var i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}var attrs={},ar=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,a;while((a=ar.exec(m[2])))attrs[a[1].toLowerCase()]=H.entity(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);var node={tag:tag,attrs:attrs,children:[],raw:'',parent:parent};parent.children.push(node);if(!/^(?:img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(tag)&&! /\/$/.test(m[2]))stack.push(node);}return root;},
  all: function(node,pred) {var out=[];function visit(n){if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')return;n.children.forEach(visit);}visit(node);return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  text: function(node) {if(!node)return '';if(node.tag==='#text')return this.entity(node.raw);if(node.tag==='script'||node.tag==='style')return '';return this.clean(node.children.map(function(n){return H.text(n);}).join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\n':''));},
  first: function(node,pred) {return this.all(node,pred)[0];},
  links: function(node,pattern) {return this.all(node,function(n){return n.tag==='a'&&pattern.test(n.attrs.href||'');});},
  image: function(node) {var img=this.first(node,function(n){return n.tag==='img';});if(!img)return null;var url=this.abs(img.attrs['data-original']||img.attrs['data-src']||img.attrs['data-lazy-src']||img.attrs.src,this.base+'/');return this.isPlaceholder(url)?null:url;},
  /// 站点自己的「没有封面」占位图（金书阁实测：`/packs/mccms/empty.png`）。
  /// 交给 App 只会得到一张空白/破图，不如如实返回 null，让 App 用书名占位封面。
  isPlaceholder: function(url) {return /(?:empty|no[-_]?(?:img|cover|pic)|placeholder|default[-_]?cover|nophoto)\.(?:png|jpe?g|gif|webp)(?:\?|$)/i.test(String(url||''));},
  title: function(tree) {var h=this.first(tree,function(n){return n.tag==='h1';});if(h)return this.text(h);var meta=this.first(tree,function(n){return n.tag==='meta'&&(n.attrs.property==='og:title'||n.attrs.name==='title');});if(meta)return meta.attrs.content;return this.text(this.first(tree,function(n){return n.tag==='title';}));},
  cover: function(tree) {var n=this.first(tree,function(n){return n.tag==='meta'&&n.attrs.property==='og:image';});return n?this.abs(n.attrs.content):null;},
  unique: function(items) {var seen={};return items.filter(function(i){if(!i.id||seen[i.id]||!i.title)return false;seen[i.id]=true;return true;});},
  next: function(tree,page) {return this.links(tree,new RegExp('(?:[?&]page=|/page/|/page-)(?:'+(page+1)+')(?:\\D|$)')).length>0;},
  imageContent: function(images,page) {if(!images.length)throw new Error(this.name+'：没有读取到正文图片');var headers={};images.forEach(function(u){headers[u]=H.headers(page);});return {kind:'images',images:images,imageHeaders:headers};},
  textContent: function(text) {if(!text||text.length<20)throw new Error(this.name+'：没有读取到正文，请确认章节是否需要登录');return {kind:'text',text:text};}
};

H.base="https://jinshuge.net";H.name="禁书阁";
var LumeSource={id:"jinshuge_novel",name:"禁书阁",version:"1.0.0",category:"novel",
async home(){var r=await this.list({page:1});return [{title:'最新',items:r.items.slice(0,12)}];},

async categories(){var t=H.tree(await H.get('/book'));return [{id:'/book',title:'全部'}].concat(H.unique(H.links(t,/\/book\/category\/list\/\d+/).map(function(n){return {id:n.attrs.href,title:H.text(n)};})));},
async list(a){a=a||{};var p=Number(a.page)||1;var u=a.categoryId||'/book';if(a.keyword)u='/index.php/book/search?key='+encodeURIComponent(a.keyword);if(/\/book\/category\/list\//.test(u)&&p>1)u+='/page/'+p;else u+=(u.indexOf('?')>=0?'&':'?')+'page='+p;var t=H.tree(await H.get(u));return {items:H.unique(H.links(t,/\/book\/info\//).map(function(n){var img=H.first(n,function(x){return x.tag==='img';});return {id:n.attrs.href,title:(img&&img.attrs.alt)||H.text(n)||H.text(n.parent),cover:H.image(n),coverHeaders:H.headers()};})),hasMore:H.next(t,p)};},
async detail(a){var t=H.tree(await H.get(a.id));return {id:a.id,title:H.title(t),cover:H.cover(t)||H.image(t),coverHeaders:H.headers(),description:H.text(H.first(t,function(n){return H.cls(n,'j-info-desc');}))};},
async chapters(a){var t=H.tree(await H.get(a.id));var scope=H.first(t,function(n){return H.cls(n,'catalog-list')||H.cls(n,'catalog-content');})||t;return H.unique(H.links(scope,/\/book\/read\/\d+\/\d+/).map(function(n){return {id:n.attrs.href,title:H.text(n)};}));},
async content(a){var t=H.tree(await H.get(a.chapterId));var n=H.first(t,function(n){return H.cls(n,'chapter-preview');});return H.textContent(H.text(n));}

};
