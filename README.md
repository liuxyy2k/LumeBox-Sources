# LumeBox 订阅源

JS 文件仍按小说、听书、漫画、美图、影视、视频分别放在原有目录，不合并脚本。
对外订阅入口合并为三个：

- [novels：小说 / 听书](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novels)
- [comics：漫画 / 美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics)
- [videos：视频 / 影视](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)

[总订阅 all](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all) 包含以上三个版块的订阅地址，使用 App「全局设置 → 总订阅导入导出」导入，自动分配到对应版块。
总订阅是 JSON 地址清单，不是打包后的 JS 文件；导出文件保留订阅地址和启用状态。猫源订阅仍单独管理。

原 audiobooks、photos、movies 入口仅用于旧版兼容，不再作为独立推荐订阅。旧中文订阅清单及脚本兼容地址继续保留。小说入口沿用小写 novels，避免旧地址失效。

## 成人内容标识

含成人内容的站点在 App 源列表中显示 **18+** 图标。以下为已明确识别的源；未列出的源表示尚未完成分级，不能据此认定为适合未成年人。

| 分类 | 含成人内容（18+） |
| --- | --- |
| 小说 | CA小说、X小说、夜读小说、HHH书屋、H图书馆、中文成人小说网、小黄书小说、爱丽丝书屋、禁书阁、色文网、PO18、PO文屋、小說狂人 |
| 漫画 | 18H漫画、18禁漫、十八漫画、十八韩漫、漫蛙、禁漫天堂、肉漫屋、色友漫画、色漫網、丽图漫画、小黄书套图、小黄书自拍 |
| 视频 | H动漫一号、H動漫網、成人动漫、查特直播、黄果剧场、小黄书听书 |

成人内容分级的机器可读说明见 [content-ratings.json](content-ratings.json)。未分级表示未知，不能解释为适合未成年人。

## 2026-10-16 第六批：小黄书家族（小说重写 + 听书 + 套图 + 自拍）与黄果 / 丽图

六个源都是**对着真站响应写的**：用真实浏览器把列表 / 题材页 / 搜索 / 详情 / 章节 / 阅读页逐页取回来存档，
解析内核就对着这些真响应跑；快照在 `snapshots/`，22 项断言在 `tools/xchina_family_regression_test.js`。

| 源 | 订阅地址（单订用）| 说明 |
| --- | --- | --- |
| 小黄书小说（重写 v2.0.0） | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/小黄书小说.js` | 题材**给全 23 个**（含有声小说 / 色友发表）+ 排序（浏览最多 / 评论最多）+ 篇幅（短 / 中长 / 超长）；**修掉了封面取不到**（封面就在卡片里，走 upload.xchina.io，请求头带站点 Referer）；**修掉了翻页**（真站页号在路径里 /fictions/2，旧版写成 ?page= 所以永远停在第 1 页）|
| 小黄书听书 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/小黄书听书.js` | 站点「有声小说」题材（2,039 部）的**每章语音 mp3 直链**（页内 <audio>，实测 200 audio/mpeg）。放在视频板块是因为 App 的小说阅读器目前只认文本；等 App 支持小说板块内播音频，改 category 挪到 audiobook/ 即可 |
| 小黄书套图 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/photo/小黄书套图.js` | /photos 情色套图（14,247 套）：系列 16 个**从列表页现抓**，排序 4 档；正文只收这一套的 `_600x0` 规格图（视频海报不算） |
| 小黄书自拍 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/photo/小黄书自拍.js` | /amateurs 业余自拍（2,584 套）：四个排序入口；正文只收 `amateurs/<id>/` 下的图（上传者头像不算） |
| 黄果剧场 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/黄果剧场.js` | huangguo.video（AI 成人短剧）：分类 5 个 + **尺度分级 3 档 + 情节标签 16 个（可多选，逗号相连）**；连续剧的选集**按集号升序**（真站默认倒序）；播放地址取页面 data-hls（站内 m3u8，带页面 Referer）|
| 丽图漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/丽图漫画.js` | litu100.xyz（小黄书旗下漫画站）：全部 / 状态 3 / 地区 4 共 8 个分类 + 排序路径；封面是背景图（按书号精确认，不认站点 logo）；正文只收这一话的图（推荐位与其它话全部排除）|

已知边界（都写在各脚本头部）：小黄书的图在独立图床 `img.xchina.io` / `upload.xchina.io`（不挑 Referer，但偶发 403 属于站点侧拦截，脚本不绕过）；
VIP / 会员章节站点自己会拦，脚本如实给出可读原因；丽图漫画**站点自己的搜索索引很薄**（实测连站内存在的标题都常查不到），脚本照原样返回，不假装有结果。
