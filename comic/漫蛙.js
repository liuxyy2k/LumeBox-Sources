// LumeSource: {"id":"manwa_comic","name":"漫蛙","version":"2.0.0","category":"comic","mirrors":["https://manwa2.com","https://manwa.me"],"icon":"https://manwa2.com/template/wap/manwame/img/apple-touch-icon-192x192.png"}
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
,
// ---- 纯 JS 加密原语（base64 / UTF-8 / AES-128-CBC），从 sources/comic/ihanman.js 复用 ----
    __b64decode(text) {
      var map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var out = [];
      var buf = 0;
      var bits = 0;
      var str = String(text || '');
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '=') break;
        var v = map.indexOf(ch);
        if (v < 0) continue;
        buf = ((buf << 6) | v) & 0xffffff;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push((buf >> bits) & 0xff);
        }
      }
      return out;
    },

    __b64encode(text) {
      var map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var bytes = this.__utf8Bytes(String(text));
      var out = '';
      var i = 0;
      while (i < bytes.length) {
        var b0 = bytes[i++];
        var b1 = i < bytes.length ? bytes[i++] : -1;
        var b2 = i < bytes.length ? bytes[i++] : -1;
        var n = (b0 << 16) | ((b1 < 0 ? 0 : b1) << 8) | (b2 < 0 ? 0 : b2);
        out += map.charAt((n >> 18) & 63) + map.charAt((n >> 12) & 63);
        out += b1 < 0 ? '=' : map.charAt((n >> 6) & 63);
        out += b2 < 0 ? '=' : map.charAt(n & 63);
      }
      return out;
    },

    __utf8Bytes(text) {
      var out = [];
      for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);
        if (code < 0x80) out.push(code);
        else if (code < 0x800) {
          out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
          var low = text.charCodeAt(i + 1);
          var cp = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
      }
      return out;
    },

    __utf8(bytes) {
      var out = '';
      var i = 0;
      while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) {
          out += String.fromCharCode(b);
        } else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) {
          out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        } else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length) {
          var c1 = bytes[i++];
          var c2 = bytes[i++];
          out += String.fromCharCode(((b & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f));
        } else if (b >= 0xf0 && i + 2 < bytes.length) {
          var d1 = bytes[i++];
          var d2 = bytes[i++];
          var d3 = bytes[i++];
          var cp = ((b & 0x07) << 18) | ((d1 & 0x3f) << 12) | ((d2 & 0x3f) << 6) | (d3 & 0x3f);
          cp -= 0x10000;
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
      }
      return out;
    },

    __unpad(bytes) {
      var n = bytes.length ? bytes[bytes.length - 1] : 0;
      if (n > 0 && n <= 16 && n <= bytes.length) return bytes.slice(0, bytes.length - n);
      return bytes;
    },

    __aesCbcDecrypt(key, iv, ct) {
      this.__aesInit();
      var w = this.__aesExpandKey(key);
      var out = [];
      var prev = iv.slice(0);
      var i;
      var j;
      for (i = 0; i + 16 <= ct.length; i += 16) {
        var block = this.__aesDecryptBlock(w, ct.slice(i, i + 16));
        for (j = 0; j < 16; j++) out.push((block[j] ^ prev[j]) & 0xff);
        prev = ct.slice(i, i + 16);
      }
      return out;
    },

    __aesInit() {
      if (this.__sbox) return;
      var sbox = new Array(256);
      var inv = new Array(256);
      var p = 1;
      var q = 1;
      var guard = 0;
      do {
        if (++guard > 400) break;
        p = (p ^ ((p << 1) & 0xff) ^ ((p & 0x80) ? 0x1b : 0)) & 0xff;
        q = (q ^ (q << 1)) & 0xff;
        q = (q ^ (q << 2)) & 0xff;
        q = (q ^ (q << 4)) & 0xff;
        if (q & 0x80) q = (q ^ 0x09) & 0xff;
        var x = (q ^ this.__rotl(q, 1) ^ this.__rotl(q, 2) ^ this.__rotl(q, 3) ^ this.__rotl(q, 4)) & 0xff;
        sbox[p] = (x ^ 0x63) & 0xff;
      } while (p !== 1);
      sbox[0] = 0x63;
      for (var i = 0; i < 256; i++) inv[sbox[i]] = i;
      this.__sbox = sbox;
      this.__inv = inv;
    },

    __rotl(value, n) {
      return ((value << n) | (value >>> (8 - n))) & 0xff;
    },

    __xtime(value) {
      return ((value << 1) ^ ((value & 0x80) ? 0x1b : 0)) & 0xff;
    },

    __aesExpandKey(key) {
      var w = new Array(176);
      var i;
      for (i = 0; i < 16; i++) w[i] = key[i] & 0xff;
      var rcon = 1;
      for (i = 16; i < 176; i += 4) {
        var t0 = w[i - 4];
        var t1 = w[i - 3];
        var t2 = w[i - 2];
        var t3 = w[i - 1];
        if (i % 16 === 0) {
          var tmp = t0;
          t0 = this.__sbox[t1] ^ rcon;
          t1 = this.__sbox[t2];
          t2 = this.__sbox[t3];
          t3 = this.__sbox[tmp];
          rcon = this.__xtime(rcon);
        }
        w[i] = w[i - 16] ^ t0;
        w[i + 1] = w[i - 15] ^ t1;
        w[i + 2] = w[i - 14] ^ t2;
        w[i + 3] = w[i - 13] ^ t3;
      }
      return w;
    },

    __aesDecryptBlock(w, input) {
      var s = input.slice(0);
      this.__addRoundKey(s, w, 10);
      for (var round = 9; round >= 1; round--) {
        this.__invShiftRows(s);
        this.__invSubBytes(s);
        this.__addRoundKey(s, w, round);
        this.__invMixColumns(s);
      }
      this.__invShiftRows(s);
      this.__invSubBytes(s);
      this.__addRoundKey(s, w, 0);
      return s;
    },

    __addRoundKey(s, w, round) {
      var base = round * 16;
      for (var i = 0; i < 16; i++) s[i] = (s[i] ^ w[base + i]) & 0xff;
    },

    __invSubBytes(s) {
      for (var i = 0; i < 16; i++) s[i] = this.__inv[s[i]];
    },

    __invShiftRows(s) {
      var copy = s.slice(0);
      for (var r = 1; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          s[r + 4 * c] = copy[r + 4 * ((c - r + 4) % 4)];
        }
      }
    },

    __invMixColumns(s) {
      for (var c = 0; c < 4; c++) {
        var i = 4 * c;
        var a0 = s[i];
        var a1 = s[i + 1];
        var a2 = s[i + 2];
        var a3 = s[i + 3];
        s[i] = (this.__gmul(a0, 14) ^ this.__gmul(a1, 11) ^ this.__gmul(a2, 13) ^ this.__gmul(a3, 9)) & 0xff;
        s[i + 1] = (this.__gmul(a0, 9) ^ this.__gmul(a1, 14) ^ this.__gmul(a2, 11) ^ this.__gmul(a3, 13)) & 0xff;
        s[i + 2] = (this.__gmul(a0, 13) ^ this.__gmul(a1, 9) ^ this.__gmul(a2, 14) ^ this.__gmul(a3, 11)) & 0xff;
        s[i + 3] = (this.__gmul(a0, 11) ^ this.__gmul(a1, 13) ^ this.__gmul(a2, 9) ^ this.__gmul(a3, 14)) & 0xff;
      }
    },

    __gmul(a, b) {
      var p = 0;
      var x = a & 0xff;
      var y = b & 0xff;
      for (var i = 0; i < 8; i++) {
        if (y & 1) p ^= x;
        var high = x & 0x80;
        x = (x << 1) & 0xff;
        if (high) x ^= 0x1b;
        y >>= 1;
      }
      return p & 0xff;
    },

    // ---------------------------------------------------------------- 基础工具

    async __get(url) {
      var response = await LumeSource.http.get(url, {
        headers: {
          'Referer': BASE_URL + '/',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        }
      });
      var status = response ? response.status : 0;
      var body = response && response.body ? String(response.body) : '';
      if (status !== 200) {
        if (status === 403 || status === 503 || status === 429 ||
          /just a moment|__cf_chl|challenge-platform|cf-mitigated/i.test(body)) {
          throw new Error('NEED_WEBVIEW_VERIFY：爱韩漫 需要网页视图过一次 Cloudflare 校验（HTTP ' + status + ' ' + url + '）');
        }
        throw new Error('拉取失败：HTTP ' + status + ' ' + url);
      }
      if (/<title>\s*Just a moment/i.test(body)) {
        throw new Error('NEED_WEBVIEW_VERIFY：爱韩漫 需要网页视图过一次 Cloudflare 校验（' + url + '）');
      }
      return body;
    },


  /// 漫蛙章节页里 `var params = '<base64>'`：AES-128-CBC(PKCS7)，key 固定，
  /// 明文前 16 字节是站点的随机填充（用任何 IV 解都只会坏掉第一块），所以解完从第一个 `{` 开始解析。
  __decryptManwa(blob) {
    var bytes = this.__b64decode(String(blob || ''));
    if (bytes.length < 32) throw new Error('章节数据太短（' + bytes.length + ' 字节）');
    var key = [];
    var keyText = '9S8$vJnU2ANeSRoF';
    for (var i = 0; i < keyText.length; i++) key.push(keyText.charCodeAt(i) & 0xff);
    var iv = [];
    for (var j = 0; j < 16; j++) iv.push(0);
    var plain = this.__unpad(this.__aesCbcDecrypt(key, iv, bytes));
    // 明文开头是站点塞的 16 字节随机填充（UTF-8 解码会炸），JSON 一定从 16 字节边界开始，
    // 所以按块边界逐个试，取第一个能 parse 的。
    for (var off = 0; off + 16 <= plain.length; off += 16) {
      if (plain[off] !== 0x7b) continue;
      try {
        return JSON.parse(this.__utf8(plain.slice(off)));
      } catch (e) { /* 继续试下一块 */ }
    }
    throw new Error('章节数据解不开（站点可能换密钥）');
  },
};


H.hosts=["https://manwa2.com","https://manwa.me"];H.name="漫蛙";
H.base=(LumeSource.config&&LumeSource.config.domain?String(LumeSource.config.domain):"").replace(/\/+$/,"")||H.hosts[0];

/// 镜像自动切换：先用手选/默认的域名，失败（连不上 / 403 人机校验 / 非 200）就挨个换下一个。
/// 哪个成功就把 H.base 记住，后面同一批请求都走它，不会每次重试。
H.get=async function(u){
  var list=[this.base].concat(this.hosts.filter(function(h){return h!==this.base;}));
  var lastErr=null;
  for(var i=0;i<list.length;i++){
    var b=list[i];
    try{
      var r=await LumeSource.http.get(this.abs(u,b+'/'),{headers:this.headers(b+'/')});
      if(r&&(r.status===403||r.status===503||r.status===521))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+r.status+' '+b+'）');
      if(!r||r.status!==200)throw new Error(this.name+'：'+b+' 请求失败（HTTP '+(r&&r.status)+'）');
      var body=String(r.body||'');
      if(/cf-chl-|Just a moment|challenge-platform/i.test(body))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（'+b+'）');
      this.base=b;
      return body;
    }catch(e){lastErr=e;}
  }
  throw lastErr||new Error(this.name+'：所有镜像都连不上');
};
var LumeSource={id:"manwa_comic",name:"漫蛙",version:"2.0.0",category:"comic",
icon:"https://manwa2.com/template/wap/manwame/img/apple-touch-icon-192x192.png",
mirrors:H.hosts,

settings:[
  {key:'publishPage',type:'action',action:'openWebsite',title:'打开发布页',url:'https://manwa2.top/',
   description:'漫蛙的官方导航页（会给出当前可用的域名）'},
  {key:'note',type:'info',title:'站点说明',
   description:'漫蛙漫画。本源按 manwa2.com 的页面结构解析：/comic/<数字> 详情、/chapter/<漫画>/<话> 章节、' +
     '整章图片在章节页的 var params 里（AES-128-CBC，源里用纯 JS 解）。镜像：manwa2.com（实测可用）、' +
     'manwa.me（官方域名，有 Cloudflare 人机校验，需要网页视图过验证）；换镜像时域名后面的路径完全一样，' +
     '所以把域名填进「切换线路」即可。这个镜像没有筛选条、也没有 ?page= 翻页，所以只给四个入口、不做假筛选。'}
],

// 首页：拿「最近更新」（这个镜像是服务端渲染，能稳定出 30 条）
async home(){const r=await this.list({categoryId:"/custom/update",page:1});return [{title:"最近更新",items:r.items.slice(0,12)}];},

// 分类：镜像站点自己的四个入口（全部/最近更新/排行榜 + 首页推荐）
async categories(){
  return [
    {id:'/',title:'推荐'},
    {id:'/category',title:'全部'},
    {id:'/custom/update',title:'最近更新'},
    {id:'/custom/top',title:'排行榜'}
  ];
},

// 筛选：这个镜像（manwa2）没有筛选条，也没有 `?page=` 分页（两页都返回同一批），
// 所以如实不给假选项——不给空壳筛选，也不伪造翻页。
async filters(){return {groups:[]};},

async list(a){
  a=a||{};
  var u=String(a.categoryId||'/').trim()||'/';
  var html=await H.get(u);
  var t=H.tree(html);
  var items=H.unique(H.links(t,/^\/comic\/\d+$/).map(function(n){
    var id=n.attrs.href;
    var title=(n.attrs.title||'').trim()||H.text(n);
    var scope=n;
    for(var i=0;i<2&&scope.parent;i++)scope=scope.parent;
    var cover=H.image(scope);
    if(!cover){var up=n;for(var k=0;k<3&&up.parent;k++){up=up.parent;cover=H.image(up);if(cover)break;}}
    return {id:id,title:title,cover:cover,coverHeaders:H.headers()};
  }));
  if(a.keyword){
    var kw=String(a.keyword);
    items=items.filter(function(i){return i.title.indexOf(kw)>=0;});
  }
  if(!items.length)console.warn('[manwa] 列表没解析出条目：'+u+'（'+html.length+' 字符）');
  return {items:items,hasMore:false};
},

// 详情：h1.detail-main-info-title / .detail-main-cover 里的封面（图床是 img1.baipiaoguai.org、newmwtuyuan23.cc 这些）
async detail(a){
  var html=await H.get(a.id);
  var t=H.tree(html);
  var title=H.first(t,function(n){return H.cls(n,'detail-main-info-title');});
  var box=H.first(t,function(n){return H.cls(n,'detail-main-cover');});
  var img=box?H.first(box,function(n){return n.tag==='img';}):null;
  var url=img?(img.attrs['data-original']||img.attrs['data-src']||img.attrs.src||''):'';
  return {
    id:a.id,
    title:H.text(title)||H.title(t),
    cover:url?H.abs(url,H.base+'/'):null,
    coverHeaders:H.headers(),
    description:''
  };
},

// 章节：/chapter/<comic>/<chapter>，标题在 `title` 或链接文字里（第001话）
async chapters(a){
  var t=H.tree(await H.get(a.id));
  return H.unique(H.links(t,/^\/chapter\/\d+\/\d+$/).map(function(n){
    return {id:n.attrs.href,title:(n.attrs.title||'').trim()||H.text(n)};
  }));
},

// 正文：整章图片的地址在 `var params` 里，AES 解出来是 {images:[…]}；图片本身是明文 webp。
async content(a){
  var page=H.abs(a.chapterId);
  var html=await H.get(page);
  var m=/var\s+params\s*=\s*'([^']+)'/.exec(html);
  if(!m)throw new Error(H.name+'：章节页里没有 params（可能要求登录或站点改版）');
  var data=H.__decryptManwa(m[1]);
  var images=(data&&data.images||[]).map(function(u){return H.abs(u,H.base+'/');}).filter(Boolean);
  return H.imageContent(images,page);
}

};
if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
