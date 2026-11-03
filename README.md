# LumeBox 源仓库

订阅入口统一放在 `subscriptions/`，分类与分级数据放在 `metadata/`。根目录只保留说明和各功能目录。

订阅格式：总入口是 JSON，分类 TXT 文件列出 JS / Python 脚本地址；TXT 本身是地址清单。实际源文件为 `.js` 或 `.py`，由 App 按运行时标记加载。HTML 网页放在 `web/`，需从网页主页导入，不混入脚本订阅。

## 一次导入

- [国内 CDN 线路](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/all.json)
- [GitHub 原站线路](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/all.json)

在 APP 的“总订阅导入导出”中选择线路或粘贴链接。国内 CDN 线路的清单和脚本都走 CDN；能否直连取决于当前网络，更新可能有 CDN 缓存延迟。两条线路内容相同，选择一条即可。

## PY 合集

用户提供的 PY 合集已去重入库，并作为独立清单接入上方总订阅。也可仅导入 [PY 原站订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/python.json) 或 [PY 国内 CDN 订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/python.json)。304 份通过离线宿主加载；未逐站保证播放。13 份加载失败脚本保存在 archive/python，不进入订阅；本地管理工具与示例排除。详见 [合集记录](docs/PY合集入库.md)。

## 按需分类

| 分类 | 独立源数 | 原站 | 国内 CDN |
| --- | ---: | --- | --- |
| 漫画 | 51 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/comic.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/comic.txt) |
| 美图 | 5 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/photo.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/photo.txt) |
| 影视 | 34 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/movie.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/movie.txt) |
| 视频与直播 | 128 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/video.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/video.txt) |
| 有声小说 | 7 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/audiobook.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/audiobook.txt) |
| 文字小说 | 0 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/novel.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/novel.txt) |
| PY 合集 | 304 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/python.json) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/python.json) |

共 **529 个独立源**，同 ID 不重复收录。漫画、美图、文字小说、有声导入 APP 漫画板块；影视、视频导入视频板块。

## 2026-11-03 爱丽丝书屋（comic/爱丽丝书屋.js）

`alicesw.com` 成人网络小说站（全站 18+，diyquge 模板的静态 HTML，无接口无加密）。本源按**文字小说**交付：
列表/详情声明 `mediaType:"novel"`，正文返回 `kind:"text"`，App 归入漫画板块的「小说」分类并打开文字阅读器。

- 结构：题材分类 `/lists/{id}.html?page=N`、总列表 `/all/order/{排序}+desc.html?page=N`、
  题材+排序 `/all/id/{id}/order/{排序}+desc.html`、原创专区 `/original.html`、
  排行 `/other/rank_hits/order/hits_day|hits_week|hits_month|hits.html`（单页 30 条、不分页）、
  搜索 `/search.html?q={词}&f=_all&sort=relevance&p=N`（10 条/页）、详情 `/novel/{id}.html`、
  目录 `/other/chapters/id/{id}.html`（**一次给全**，实测 6972 章 / 666 KB 单页）、
  正文 `/book/{书号}/{章节hash}.html`。
- 注意 `/novel/{id}` 与 `/book/{书号}` 的编号**不是同一个**，章节地址只能从目录页取。
- 35 个分类（最近更新 / 四个排行 / 原创专区 / 29 个题材）+ 排序筛选（最近更新 / 人气最高 / 字数最多）；
  排行与原创专区走站点固定路径，排序对它们不生效。
- 发布页 `alicesw.click`（另有 `www.asw5.cc`）写进源设置；镜像 `alicesw.com`（海外主站）、
  `alicesw1.homes`（大陆备用，简体同源）、`alicesw.tw`（繁体站，结构一致）。发布页给出的
  `alicesw.quest` 只是另一个发布页（没有正文）。源站按 IP 拒美国 Utah，源标注 `network:"proxy"`。
- **1.1.0 列表封面**：站点列表页没有封面，源里按 id 并发抓详情页取 `.imgbox img`
  （32 并发、单请求 1500ms 超时、列表 2400ms / 首页 3200ms 预算），封面 URL 用 `LumeSource.fs`
  缓存 12 小时、最多 380 条。冷启动 `list()` 2.5s 覆盖 31/31，缓存命中 0.78s；`home()` 2.7s 覆盖 34/48。
- 验证：`node tools/lume-source-check.mjs sources/comic/alicesw.js` → PASS
  （home 6 板块 34/48 有封面 / list 31 条 31/31 有封面 / detail 封面+标签 / chapters 8 / content 13693 字正文约 390ms）。

## 2026-11-01 漫蛙 v2.0.0（comic/漫蛙.js）

原源打 `manwa.me`，整站 403「Just a moment…」（Cloudflare），App 里打开是空白；`/book/<id>`、`/booklist?gender=` 这些老路径也已不存在。
本版换到实测可用的 **manwa2.com**，并把章节正文的加密解开了：

- 详情 `/comic/<数字>`、章节 `/chapter/<漫画>/<话>`、正文在章节页 `var params='<base64>'` 里，
  AES-128-CBC（key `9S8$vJnU2ANeSRoF`）解出 `{"images":[…80 张…]}`；明文前 16 字节是随机填充，
  按 16 字节块边界试 JSON.parse；图片本身是明文 webp（旧版那层 `my2ecret782ecret` 图片加密已不需要）。
- **镜像自动切换**：`H.get` 先用手选/默认域名，403 / 非 200 / 连不上就换下一个（manwa2.com ↔ manwa.me），成功即记住。
- 实测：manwa2.com 可用；manwa.me 官方域名有 Cloudflare（留作手选）；manwa3/4/5、manwa1/7/9 全 302 到
  `gotowww.aipages.dev` 广告页（已废）；manwa2.top / manwa360.cc 只是导航壳（1.2 KB SPA）。
- 验证：`node tools/lume-source-check.mjs` → PASS（home 12 / list 40 / chapters 21 / content 80 张图 / 首图 200 webp）；
  镜像切换单测：domain 指到 manwa.me（403）→ 自动落到 manwa2.com 拿到 30 条。

## 仓库目录

| 目录 | 内容 |
| --- | --- |
| `subscriptions/` | 所有订阅入口；`cdn/` 是国内 CDN 线路；`legacy/` 为迁移用旧子集 |
| `metadata/` | 唯一源目录、18+ 分级与旧地址迁移表 |
| `comic/`、`photo/` | 漫画、美图源脚本 |
| `movie/`、`video/`、`audiobook/` | 影视、视频、有声源脚本，分别存放 |
| `web/` | 可下载导入的 HTML 网页主页（不进入脚本订阅） |
| `docs/` | 使用与维护说明 |
| `tools/`、`snapshots/`、`licenses/` | 工具、回归样本、授权 |

[完整源目录](docs/源目录.md) · [地址迁移说明](docs/源分类与兼容地址.md) · [维护说明](docs/README.md)

旧根目录订阅文件已收起，需要配套新版 APP 自动迁移旧地址，或使用上方新入口。18+ 是内容分级；未分级不代表全年龄。目录整理与离线检查不代表所有封面、图标和播放当前可用。
