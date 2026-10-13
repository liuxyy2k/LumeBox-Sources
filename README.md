# LumeBox 源仓库（小说 / 漫画 / 视频）

LumeBox 的内置源**不随 App 打包**，统一放在这里。App 侧「导入图源 → 订阅地址」
粘贴下面的链接即可。

## 订阅链接（每板块一个 `.js`）

| 板块 | 订阅地址（粘进 App） |
|------|----------------------|
| 小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/sources.js` |
| 漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/sources.js` |
| 视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/sources.js` |

>`sources.js` 是**地址清单**：一行一个脚本地址（`#` 或 `//` 开头是注释——
>两种都认；App 侧严格解析早期只放行 `#`，因此本仓库统一用 `#`）。同目录下的
>`sources.txt` 是**同内容别名**，给早前拿到的旧链接用——两个地址都能拉。App 认得两种订阅：
**正文就是脚本**，或**正文是一行一个地址的清单**——所以这一个链接会把这板块的
源全部拉进来。想只订某一个源，直接粘那个源的 `.js` 地址（见下表）。

## 单源订阅地址（每个源一个 `.js`）

| 源 | 订阅地址 |
|----|----------|
| 92漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/92mh_comic.js` |
| P5漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/p5mh_comic.js` |
| 色友漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/seyoumanhua_comic.js` |
| NN韩漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/nnhanman_comic.js` |
| 18禁漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/jm18_comic.js` |
| X漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/xman6_comic.js` |
| JComic | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/jcomic_comic.js` |
| G社漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/gmh_comic.js` |
| MYCOMIC | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/mycomic_comic.js` |
| CA情色小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/99xs_novel.js` |
| xChina 小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xchina_novel.js` |
| X小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xxiaoshuo_novel.js` |
| 夜读小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xnovel_novel.js` |
| 瓜子影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/gztv5_video.js` |
| 大哥视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/dage_video.js` |
| 北觅影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/luttt_video.js` |
| 金牌影院 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/jpyy2_video.js` |
| XAnimu | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/xanimu_video.js` |

要点：

- 导入后每份脚本记的是**自己的地址**（不是清单地址），「更新订阅源」各更各的；
- **新增**源：把脚本加进目录、把地址加进 `sources.js`，再在 App 里重新粘一次该板块
  的订阅链接即可（已有的会被覆盖为最新，新增的会被导入）；
- 仓库是 **public**：App 拉订阅不带 Token，私有仓库会 404。

## 目录

```
novel/   小说源 + sources.js 清单
comic/   漫画源 + sources.js 清单
video/   视频源 + sources.js 清单
snapshots/  站点快照（写脚本时站点的样子；自检与协议回归用它，不参与 App 运行）
docs/    早期源文档（QUICKSTART / README / SUMMARY）
tools/   快照自检脚本（Node：node --test tools/snapshot_test.js）
```

## 脚本清单

| 文件 | id | 名称 | 版本 | 备注 |
|------|----|------|------|------|
| comic/92mh_comic.js | `mh92_comic` | 92漫画 | 1.0.0 | 整站 Cloudflare：被拦时抛 `NEED_WEBVIEW_VERIFY`，App 拉起网页视图过校验 |
| comic/p5mh_comic.js | `p5mh_comic` | P5漫画 | 1.0.0 | 直连可用 |
| comic/seyoumanhua_comic.js | `seyoumanhua_comic` | 色友漫画 | 1.0.0 | 直连可用 |
| comic/nnhanman_comic.js | `nnhanman_comic` | NN韩漫 | 1.3.0 | qTcms 手机模板：解析按**真站快照**写（列表走 `/comics/<类>/ob/time/st/all/page/N`，封面 `img src`） |
| comic/jm18_comic.js | `jm18_comic` | 18禁漫 | 1.1.0 | MacCMS + conch 主题：列表 `li.hl-list-item`（封面只在 `data-original`）、`/comic-lists/{类}/ob/time/st/all/page/N` 分页 |
| comic/xman6_comic.js | `xman6_comic` | X漫 | 1.1.0 | 另一套 MacCMS 皮肤（含筛选：状态/排序）：列表 `li.vodlist_item`、`/mcata/{类}/ob/time/st/all/page/N`；排行页是 `li.ranklist_item`（另一套标记）；正文图在 `img[data-src]` |
| comic/gmh_comic.js | `gmh_comic` | G社漫画 | 1.0.0 | Astro 静态前端 + 自建 API（v2.apikk.top）：列表 `a[href=/manga/{slug}]`（18/页、`/manga/page/N`）；详情走作品页 `data-mid` + `/api/v2/manga/get`；**正文图片是加密串，脚本把站点自己的 `/assets/runtime/chapter-decoder.js` 取进沙箱、配最小浏览器垫片后 eval 再调它的 `r()`**（不逆向、不改写它的算法）；**站点没有搜索**，关键词如实拒绝 |
| comic/mycomic_comic.js | `mycomic_comic` | MYCOMIC | 1.0.0 | 服务端渲染（30/页、共 1845 页）；筛选/排序就是站点自己的查询串（`filter[tag|audience|country|end|year|author]`、`sort=-update\|-views`），分组与选项从列表页实时抓；目录在页面的 Alpine `chapters:` JSON 里（站点倒序 → 脚本翻成升序）；**整站在 Cloudflare 托管校验后面**，被拦时抛 `NEED_WEBVIEW_VERIFY` 走 App 的网页视图流程 |
| comic/jcomic_comic.js | `jcomic_comic` | JComic | 1.0.0 | 条目有 `/eps/`（多话）与 `/page/`（单页）两形态，**作品 id 存路径**；正文图是 `JCOMIC_TRAPS_` 倒序 base64，脚本内解码；**图片直链是 60 秒签名 S3 地址**（站点限制，见脚本头部） |
| novel/99xs_novel.js | `99xs_novel` | CA情色小说 | 2.1.0 | 根路径有「继续访问」拦截页，源自带 cookie |
| novel/xchina_novel.js | `xchina_novel` | xChina 小说 | 1.0.0 | 详情/正文常被 CF 拦：抛标记走网页视图 |
| novel/xxiaoshuo_novel.js | `xxiaoshuo_novel` | X小说 | 1.0.0 | 直连可用 |
| novel/xnovel_novel.js | `xnovel_novel` | 夜读小说 | 1.0.0 | Tailwind 站：列表 `a.list-card`（`/novels/{N}`、`/tag/{slug}/{N}`、`/search?q=&page=`）；正文取 `article#read-article` 的 `<p>` 并剔掉 `div.extra_c_2` 广告块；目录第 1 章要做「工具条 / 开始阅读」去噪；正常页里带 CF 的 jsd 信标**不能**当校验页判据，反诈拦截页（200 + 3KB）会给出可读原因 |
| video/gztv5_video.js | `gztv5_video` | 瓜子影视 | 3.0.0 | Nuxt SPA + 独立 API；偶发 CF |
| video/dage_video.js | `dage_video` | 大哥视频 | 2.3.0 | 响应是「编码信封」，脚本内含纯 JS 解码 |
| video/luttt_video.js | `luttt_video` | 北觅影视 | 1.1.0 | 苹果CMS：筛选条（地区/年份/语言/字母/排序）从列表页实时抓；直连可用（境外出口会被 567 拦） |
| video/xanimu_video.js | `xanimu_video` | XAnimu | 1.0.0 | 成人动漫视频站（WordPress + kolortube 主题，中文前缀 `/zh-CN/`）：列表/分类 `?filter=latest\|most-viewed\|longest`、搜索 `?s=`、详情 `?p={数字id}`；播放是 nosofiles CDN 的两条 mp4（high/low，带站点 `verify` 令牌）；**多镜域**（xanimu.art 首选 / .one / .com 同站，按可用性自动换并记住），域名在国内常被连接重置 |
| video/jpyy2_video.js | `jpyy2_video` | 金牌影院 | 1.0.1 | jpyy2.com（= vv3nwjk.com）：自建 JSON API + 签名头（md5→sha1，脚本内实现）。**主域挂在 reCAPTCHA v3 WAF 后面（521），手机域 `m.vv3nwjk.com` 没有**——脚本按「手机域 → 主域 → 镜域」试，全被拦才抛 `WAF_RECAPTCHA_V3` 提示配桥接；分页参数是 `pageNum` |

## 写一个源（契约速查）

脚本头部声明元信息（App 靠它认 id / 归属板块）：

```js
// LumeSource: {"id":"my_comic","name":"我的漫画","version":"1.0.0","category":"comic"}
```

`category` 取 `novel` / `comic` / `video`，与导入的板块不一致会被拒。入口可以是
对象式（`LumeSource.list(argument)`）或函数式（`async function getList(page)`），
网络走全局 `fetch` 或 `LumeSource.http`。

被 Cloudflare 拦下时抛固定标记，App 会拉起网页视图过一次校验并自动重试：

```js
throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP ' + status + ' ' + fullUrl + '）');
```

> 注意把 `fullUrl` 换成**作用域里真有的**请求地址。曾经的坑：文案里引用了不存在的
> 变量，真机被 CF 拦下时抛 `ReferenceError`，用户看到的是一个没有出口的红字，
> 而不是网页视图按钮。
