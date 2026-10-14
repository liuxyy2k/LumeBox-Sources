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
| 巴卡漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/bakamh_comic.js` |
| HANMAN18 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/hanman18_comic.js` |
| K漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/kmh001_comic.js` |
| X漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/xman6_comic.js` |
| G社漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/gmh_comic.js` |
| MYCOMIC | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/mycomic_comic.js` |
| CA情色小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/99xs_novel.js` |
| X小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xxiaoshuo_novel.js` |
| 夜读小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xnovel_novel.js` |
| 瓜子影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/gztv5_video.js` |
| 大哥视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/dage_video.js` |
| 北觅影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/luttt_video.js` |
| 金牌影院 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/jpyy2_video.js` |
| XAnimu | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/xanimu_video.js` |
| Chaturbate 直播 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/chaturbate_video.js` |

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
| comic/mycomic_comic.js | `mycomic_comic` | MYCOMIC | 1.0.1 | 服务端渲染（30/页、共 1845 页）；筛选/排序就是站点自己的查询串（`filter[tag|audience|country|end|year|author]`、`sort=-update\|-views`），分组与选项从列表页实时抓；目录在页面的 Alpine `chapters:` JSON 里（站点倒序 → 脚本翻成升序）；**整站在 Cloudflare 托管校验后面**，被拦时抛 `NEED_WEBVIEW_VERIFY` 走 App 的网页视图流程 |
| comic/bakamh_comic.js | `bakamh_comic` | 巴卡漫画 | 2.0.0 | 以 `https://bakamh.com/` 重新实现 Madara 页面适配；分页、AJAX 搜索、当前作品的章节去重与顺序、独立图片 Referer / UA、实际登录锁识别。主域名 502/404 时尝试发布页已列出的镜像；遇到网页验证如实提示。重写版 7 项脱敏回归通过；浏览器正常首页和详情结构已核对，手机端仍需完成自己的验证。 |
| comic/hanman18_comic.js | `hanman18_comic` | HANMAN18 | 1.0.0 | hanman18.com（禁漫天堂）：**用真实浏览器取回真站页面存档后逐条核过**，不照抄旧模板。列表 `div.story_item`（**真站有两套卡片模板**：顶部轮播 `story_name`、下方网格 `mg_name`，两套都认）；最新更新第 1 页 `/`、第 2 页起 `/latest-release/<页>`；漫画列表 `/list-manga/<页>`（20/页）；搜索 `/list-manga?search=`（**单页结果**）；详情 `/manhwa/<id>`（标题 `detail_name`、封面 `detail_avatar`、简介 `detail_reviewContent`、信息栏是英文标签 Other name/Author/Artist/Status/Categories/Views）；章节在 `chapter_box` 里按**站内 /manhwa/<作品>/<章>** 形状取（同一卡片里还挂着网盘外链，已排除），按话号升序；正文是章节页 `slides_p_path` 的 **base64 数组**（脚本内纯 JS 解码）。**实测三件事已据实调整**：`?order_by=` 排序无效（不再提供排序分类）、`/manga-list/<题材>` 302 回首页（不提供题材分类）、搜索无分页。验证：对着真站存档跑通 10 项断言（首页 42 部唯一作品 / 第2页 41 / 搜索 3 条 / 详情字段 / 56 章升序 / 正文 159 张图全 https 不混源）|
| comic/kmh001_comic.js | `kmh001_comic` | K漫画 | 1.0.0 | kmh001.com（备用域 kmh.sex）= **Next.js App Router SSR**：数据**不在独立 JSON 接口里**，而是内嵌在 HTML 的 RSC 载荷（一连串 `self.__next_f.push([1,"…"])`）——脚本抽载荷再按站点字段取数。地址：首页 `/home`、连载按周 `/weekly/0..6`（0=周日）、完本 `/complete`、搜索 `/search?key=`、详情 `/comic/<24位id>`、正文 `/chapter/<24位id>`；章节在 `{"comicID":…,"data":[{_id,subtitle,title,ordinal}]}` 里（按 ordinal 升序，**括号配对切数组**，正则切会被带方括号的标题截断）；正文图片数组带 `sourceName`（多图源）→ **取图最多的那个源**，不混源；图片统一升 https。**/category 分类页未做**：那页的服务端响应里没有卡片数据（浏览器二次请求才有），与其猜不如不做。**验证方式：本机 curl 打不开该站，改用真实浏览器取回 6 个页面完整响应存档，解析内核对着真响应跑通 12 项断言**（列表/搜索/详情/章节升序/正文多图源）|
| comic/rouman5_comic.js | `rouman5_comic` | 肉漫屋 | 1.0.0 | rouman5.com（繁中韩漫站）= TanStack Start SSR：列表 `/books[?continued=…][&page=N]`（**页号 0 基**）、搜索 `/search?term=`（`?q=`/`?keyword=` 无效）、详情 `h1`+`og:image`+`dl.site-book-data`、剧集 `/books/<id>/<序号>`（0 基、默认正序）；正文取章节页 SSR 载荷里的 `imagePaths` 数组（图床是站点自己的代理域名 kelv47.xyz / towm85.xyz，脚本用地址里那段 base64 核对该图属于哪本书，广告图混不进来）。**对着真站取回 5 个页面存档跑通 7 项断言** |
| comic/fxcomic_comic.js | `fxcomic_comic` | 漫小肆 | 1.0.0 | freexcomic.com 是**地址发布页**（页面里一行 `location.href="…"` 指当前站址，本版是 jjmhw9.top）：先探已知域名、不通再读发布页，换域名不用改脚本。列表 `/booklist[?end=0|1][&page=N]`、更新 `/update`、搜索 `/search?keyword=`；详情 `h1`+banner 封面+`p.subtitle`/`p.tip`（别名/作者/状态/地区/标签）+`p.content` 简介；剧集 `#detail-list-select` 的 `/chapter/<数字id>`（升序）；正文 `div.comiclist` 的 `img[data-original]`（只收 `/static/upload/` 本站图床）。封面是 CSS 背景图（`p.mh-cover` 的 style），按此解析。**对着真站 7 个页面存档跑通 6 项断言** |
| novel/99xs_novel.js | `99xs_novel` | CA情色小说 | 2.1.0 | 根路径有「继续访问」拦截页，源自带 cookie |
| novel/xxiaoshuo_novel.js | `xxiaoshuo_novel` | X小说 | 1.0.0 | 直连可用 |
| novel/xnovel_novel.js | `xnovel_novel` | 夜读小说 | 1.0.0 | Tailwind 站：列表 `a.list-card`（`/novels/{N}`、`/tag/{slug}/{N}`、`/search?q=&page=`）；正文取 `article#read-article` 的 `<p>` 并剔掉 `div.extra_c_2` 广告块；目录第 1 章要做「工具条 / 开始阅读」去噪；正常页里带 CF 的 jsd 信标**不能**当校验页判据，反诈拦截页（200 + 3KB）会给出可读原因 |
| novel/sspwk_novel.js | `sspwk_novel` | 少数派文库 | 1.0.0 | sspwk.vip（御宅屋系模板）：分类 `/booksort/<栏目号>/<页>.html`（12 个栏目号取自站点导航）；列表 `div.common-bookele`（30/页）；搜索是 **POST `/search/`**（`searchkey=`，GET 参数无效）；书名在正文「《书名》简介」的 h3 里（比 `<title>` 干净）、简介在 `<pre>`；目录 `/indexlist/<书号>/<页>/` 逐页收齐（整页重复就停）；正文取 `div#nr1` 的段落，**站点自己那条 `<ecmsxs>` 公告要剔掉**。小说没有封面，cover 如实为 null。**对着真站 6 个页面存档跑通 6 项断言** |
| video/gztv5_video.js | `gztv5_video` | 瓜子影视 | 3.0.0 | Nuxt SPA + 独立 API；偶发 CF |
| video/dage_video.js | `dage_video` | 大哥视频 | 2.3.0 | 响应是「编码信封」，脚本内含纯 JS 解码 |
| video/luttt_video.js | `luttt_video` | 北觅影视 | 1.1.1 | MacCMS 页面与播放地址适配；媒体只使用播放数据明确声明的请求头，不再强加站点 Referer 和通用 UA。当前桌面网络返回 HTTP 567，用户旧日志为播放器 HTTP 403，实际播放仍需手机复测。 |
| video/xanimu_video.js | `xanimu_video` | XAnimu | 1.0.0 | 成人动漫视频站（WordPress + kolortube 主题，中文前缀 `/zh-CN/`）：列表/分类 `?filter=latest\|most-viewed\|longest`、搜索 `?s=`、详情 `?p={数字id}`；播放是 nosofiles CDN 的两条 mp4（high/low，带站点 `verify` 令牌）；**多镜域**（xanimu.art 首选 / .one / .com 同站，按可用性自动换并记住），域名在国内常被连接重置 |
| video/jpyy2_video.js | `jpyy2_video` | 金牌影院 | 1.0.1 | jpyy2.com（= vv3nwjk.com）：自建 JSON API + 签名头（md5→sha1，脚本内实现）。**主域挂在 reCAPTCHA v3 WAF 后面（521），手机域 `m.vv3nwjk.com` 没有**——脚本按「手机域 → 主域 → 镜域」试，全被拦才抛 `WAF_RECAPTCHA_V3` 提示配桥接；分页参数是 `pageNum` |
| video/chaturbate_video.js | `chaturbate_video` | Chaturbate 直播 | 1.0.0 | 成人直播站（18+）：列表/搜索走站点 TS 房间接口、详情读房间页 og、播放地址取 `/get_edge_hls_url_ajax/`（**要先取房间页拿 csrftoken 再带 `X-CSRFToken`+`Cookie` POST**）；「章节」= 两条带宽线（自动/低码率）；主路径失败回落到房间页内嵌 m3u8。开发机网络连不上该站，解析逻辑用打桩行为测试跑通，导入后建议先「测试连通性」 |
| video/hanime_video.js | `hanime_video` | H動漫網 | 1.0.0 | www.hanime.xyz（成人动漫）：列表/排序 `/`、`/?sort=hits|score|likes`、搜索 `/?q=`；详情 `/<数字id>.html`（标题取 h1 里的链接文本——h1 尾上挂着点赞按钮的 Vue 占位，整段取会把 `{{…}}` 带出来）；正文就是页面里的 `<video><source src="…/index.m3u8">`（页内 LD+JSON 的 contentUrl 兜底），单页一集 → `chapters` 只给一项「播放」；播放地址在独立播放域名上，把详细页地址作 Referer 一起交出。**对着真站 4 个页面存档跑通 3 项断言** |

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

## 2026-10-14 新增网站适配

本批新增 17 个脚本，并按 bakamh.com 重写 BAKA MH 源，已加入各板块 `sources.js` 与 `sources.txt`。有网页验证的站点需在 App 内完成验证；不会把浏览器 Cookie、订阅密码或临时播放签名写进仓库。

| 板块 | 新增源 |
| --- | --- |
| 漫画 / 图库 | 楠楠漫画、MM-CG 漫画、三四漫画、漫蛙、Z8PT 图库、禁漫天堂（18comic.vip） |
| 小说 | AliceSW、Book18、金书阁、XChina、HHHBook、H图书馆、AACCOO |
| 视频 / 音频 | ASMR Honey、亚洲声色、听书网、Hanime1 |

实际响应验证与限制见 [适配记录](docs/2026-10-14_JS-source-adaptation-report.md)。Hanime1 每次播放读取当时有效的地址，先按分辨率选择最高画质；漫蛙需要新版 App 的图片解码管线。

BAKA MH 原实现已替换为 2.0.0，默认站点为 `https://bakamh.com/`，只在服务端故障时使用站点发布页列出的镜像。禁漫天堂为独立源，与现有「18禁漫」（18jm18.com）不同；阅读图片需要包含横条还原功能的新版 App。

## 2026-10-14 第二批：肉漫屋 / 漫小肆（freexcomic 发布页）/ 少数派文库 / H動漫網

四个源都**对着真站响应写**（用真实浏览器取回完整页面存档，解析内核就对着这些真响应跑），
快照与断言在 `snapshots/` 与 `tools/latest_sources_regression_test.js`（21 项）：

| 源 | 订阅地址（粘进 App 即可单订）|
|----|------------------|
| 肉漫屋（漫画） | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/rouman5_comic.js` |
| 漫小肆（漫画，含地址发布页发现） | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/fxcomic_comic.js` |
| 少数派文库（小说） | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/sspwk_novel.js` |
| H動漫網（视频） | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/hanime_video.js` |

也可以用各板块的清单一次拉全（`comic/sources.js`、`novel/sources.js`、`video/sources.js`）。
被 Cloudflare 拦下的站点按老规矩抛 `NEED_WEBVIEW_VERIFY`，在 App 里用「网页视图」过一次校验即可——
校验取回的会话（`cf_clearance`）由 App 保管，脚本不接触 Cookie。

## 2026-10-15：禁漫天堂分类筛选补全；北觅影视按 IP 拦截的提示

用户反馈「禁漫天堂里的分类筛选没做全，网页里有很多」，以及北觅影视播放页 403。

- `comic/jmcomic_comic.js`：`categories()` 不再只从首页锚点里捞出「最新/热门」两条，
  改为**站点自己的地址**组成 50 项——三个书库族（同人 / 单本 / 短篇 / 韩漫 / 美漫 /
  其他 + 各自 `/sub/xxx` 子类）、五个排行榜（总/月/周/天）、以及 28 个站内标签
  （走站点的搜索页 `/search/photos?search_query=…`）。新增 `filters()` 三组
  （更新 `t=`、排序 `o=`、分流 `shunt=`）与 `__withFacets()` 改写；**分类地址自带的
  `o=`/`t=` 不会被「没选排序」抹掉**（否则月排行会退化成默认排序）。
  回归：`tools/source_facets_test.js` 新增 `jmcomicCheck()`（分类数量与必需项、
  三组筛选、地址改写、白名单兜底、排行参数的保留）。
- `video/luttt_video.js`：403 与 567 一样按「站点按 IP 地区拦截」报错。实测同一
  m3u8 地址国内直连 200、走境外代理出口即 403（站点本身是 567 的腾讯 EdgeOne
  拦截页），因此文案明确写「换直连或换该站可用的网络出口」，不再把用户引向
  网页验证窗（那两类拦截都没有 JS 挑战可过）。
- Hanime1：播放地址在**独立播放域名**上、按播放时读取的签名地址播放；主站会话
  不复制给第三方域名（这是既有纪律）。手机侧仍需在 App 内完成网页验证。
