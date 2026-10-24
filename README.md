# LumeBox 订阅源

- [漫画 / 美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics)
- [视频 / 影视](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)
- [视频 / 影视综合（苹果CMS 系 7 站）](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-hd)
- [视频 / 影视综合 · jsDelivr CDN 版](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos-hd-cdn)
- [总订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all)

> 国内网络打不开 `raw.githubusercontent.com`（「添加订阅」直接报拉取失败）时，改用 CDN 版：
> `https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/videos-hd-cdn`
>
> **更新 ≠ 添加**：App 的「一键更新全部订阅」只刷新**已保存**的订阅地址，不会发现新清单。
> 新增的清单要先在「订阅管理 → 添加订阅地址」里添加一次，之后才会自动更新。

## 视频 / 影视综合（7 站）

`videos-hd` 这一份订阅的新增内容，全部本地实测通过（详情见各脚本文件头）：

| 源 | 站点 | 播放 | 备注 |
|---|---|---|---|
| 播剧网 | ysxq.cc | m3u8 直链 | 苹果CMS JSON 接口，42 万+ 影片 |
| A123TV | a123tv.com | m3u8 直链 | 服务端渲染 HTML |
| 饭搭子影视 | fdzys.com | m3u8 直链 | 定制模板 + player_aaaa |
| 飞流视频 | flixflop.com | m3u8 直链 | 不支持站内搜索 |
| 短剧网 | duanju2.com | m3u8 直链 | 短剧为主 |
| 欧乐影院 | olehdtv.com | m3u8 直链 | **需配代理**（直连被 WAF 拦 403） |
| 华视影院 | huavod.com | 网页播放器 | **需配代理**，播放走源站 P2P 播放器 |

> 需要代理的两个源：在「源设置 → 网络」里单独配代理即可；脚本在 403 时会抛
> `NEED_WEBVIEW_VERIFY`，也可以走 App 的网页视图过一次人机校验。
> 不要用 `dongpian12.com`（懂片帝AI）——它是 AI 找片应用，没有可脚本化的点播接口，
> 用 App 自带的「网页源」加它更合适。

所有脚本仅本地自用研究，不传播、不商用。
