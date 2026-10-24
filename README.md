# LumeBox 订阅源

- [漫画 / 美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics)
- [视频 / 影视](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)
- [视频 / 影视综合（苹果CMS 系 7 站）](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-hd)
- [视频 / 影视综合 · jsDelivr CDN 版](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-hd-cdn)
- [视频 · 18+ 成人向（含 Hentai2W）](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-18plus)
- [视频 · 18+ · jsDelivr CDN 版](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-18plus-cdn)
- [总订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all)

> 国内网络打不开 `raw.githubusercontent.com`（「添加订阅」直接报拉取失败）时，改用 CDN 版：
> `https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/videos-hd-cdn`
> （18+ 那份对应 `.../videos-18plus-cdn`）。代价：jsDelivr 对 `@main` 有缓存（最长约 12 小时）。
>
> **更新 ≠ 添加**：App 的「一键更新全部订阅」只刷新**已保存**的订阅地址，不会发现新清单。
> 新增的清单要先在「订阅管理 → 添加订阅地址」里添加一次，之后才会自动更新。

## 视频 / 影视综合（7 站，`videos-hd`）

全部本地实测通过（详情见各脚本文件头）：

| 源 | 站点 | 播放 | 备注 |
|---|---|---|---|
| 播剧网 | ysxq.cc | m3u8 直链 | 苹果CMS JSON 接口，42 万+ 影片 |
| A123TV | a123tv.com | m3u8 直链 | 服务端渲染 HTML，54 个分类 |
| 饭搭子影视 | fdzys.com | m3u8 直链 | 定制模板 + player_aaaa |
| 飞流视频 | flixflop.com | m3u8 直链 | 不支持站内搜索 |
| 短剧网 | duanju2.com | m3u8 直链 | 短剧为主 |
| 欧乐影院 | olehdtv.com | m3u8 直链 | **需配代理**（直连被 WAF 拦 403） |
| 华视影院 | huavod.com | 网页播放器 | **需配代理**，播放走源站 P2P 播放器 |

> 需要代理的两个源：在「源设置 → 网络」里单独配代理即可；脚本在 403 时会抛
> `NEED_WEBVIEW_VERIFY`，也可以走 App 的网页视图过一次人机校验。
> 不要用 `dongpian12.com`（懂片帝AI）——它是 AI 找片应用，没有可脚本化的点播接口，
> 用 App 自带的「网页源」加它更合适。

## 视频 · 18+ 成人向（`videos-18plus`）

单独成册，避免不想看成人内容的人在「影视综合」里被动拿到。

| 源 | 站点 | 播放 | 备注 |
|---|---|---|---|
| Hentai2W | hentai2w.com | m3u8 直链 | **需配代理**；脚本自动过年龄门（拿 age_confirmed Cookie）；1746 部番剧、489 个标签 |

收录前做过内容自查，记录写在清单文件与 `content-ratings.json` 里：
站方 RTA 标注 18+；自带标签表（genre/theme/cast 共 489 个）无 `loli`/`shota`/`child` 类标签；
站内检索 `shota`、`lolicon` 均为 0 条，`loli` 仅命中 1 部而其标签是 OVAs/Creampie/Paizuri
（用词碰巧出现在简介里）。同类的 zzcartoon、rule34video 因为检索确有此类结果，**没有**收录。

所有脚本仅本地自用研究，不传播、不商用。
