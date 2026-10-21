# 网站源适配记录（2026-10-14）

## 结论与范围

按用户提供的站点，新增 17 个 LumeSource 脚本，并重新实现 BAKA MH 2.0.0，并更新三个板块的两种订阅清单。公开页面的普通请求、网页验证后的 DOM 结构和脱敏测试用于核对解析规则。没有把账号密码、浏览器 Cookie、临时媒体签名或原站正文放入测试仓库。付费和登录限制保留。此记录是接口适配分析，severity 为 n/a_re，flavor 为 null，不是漏洞报告。

授权范围：用户在 2026-10-14 明确要求把这些网址做成应用源，并手动完成 Hanime1、HHHBook、Hlib 网页验证。网络范围限于指定站点及其公开关联资源；验证会话只用于本地检查。听书网的离线分析授权记录保存在应用项目的 `work/ting13-source/scope.md`；该工作目录及原始抓取数据不发布。

## 验证结果

| 验证方式 | 结果与边界 |
| --- | --- |
| Node 脚本回归 | 56 项通过；6 项因为已移除旧源而跳过，不算通过 |
| 原生 QuickJS | 18 个新增或重写脚本全部加载成功，接口与 HTML 解析探针通过 |
| 实际普通 HTTP 响应 | 楠楠漫画、AliceSW、Book18、MM-CG、金书阁、三四漫画、XChina、ASMR Honey、亚洲声色、漫蛙、Z8PT、AACCOO 取到列表和至少一章内容/播放地址 |
| 验证后浏览器 DOM | Hanime1 的 720/480/1080 三档地址结构、HHHBook 文章正文、Hlib `pre#content` 正文确认 |
| 普通 HTTP 仍被拦截 | Hanime1、HHHBook、Hlib、听书网部分页面需要网页验证；不能据此宣称 iPhone 全链路已通过 |
| 漫蛙实际图片前缀 | 解码后的 16 字节前缀包含 RIFF / WEBP；不发布图片内容 |

未对所有作品、付费章节、全部镜像、全部分类和全文分页穷举测试。部分新增源暂采用当前页标题筛选，后续可完善站点原生搜索；这不是全站检索。ASMR 和音频适配归入视频板块，走现有播放链路。Z8PT 是图片集源，归入漫画板块。

## Evidence → Finding → Path

| E-id | source_ref | repro_command | content_hash |
| --- | --- | --- | --- |
| E-01 | `tools/requested_sources_test.js` 脱敏结构与独立 Node AES 测试向量 | `node --test tools/requested_sources_test.js` | 5ee30d1204e39d97db130f09d8f1bd0d02998d8c5de3a49baddd42da768630db |
| E-02 | 漫蛙公开 `/static/js/ch.js` 的图片解码代码 | 打开公开阅读页，检查 `.content-img` 的 `data-r-src` 和阅读器资源；运行 E-01 图片元数据测试 | n/a：线上内容会更新 |
| E-03 | Z8PT 的公开 `zipaiimg.js` 和 `.showimg[rdata]` | 运行 E-01 的 ECB 地址解码测试 | n/a：线上内容会更新 |
| E-04 | 听书网公开阅读器脚本及 `/api/mapi/play` 调用 | 对公开播放器接口核对 nid/cid/sort、sc/sp 字段；本地离线探针不发布会话数据 | n/a：线上内容会更新 |
| E-05 | Hanime1 用户验证后的 `video#player source[size]`；Hlib `pre#content` | 运行 E-01 的最高画质、验证页识别及正文提取测试 | n/a：人工浏览器观察 |

| F-id | severity | evidence_ids | confidence | location | status |
| --- | --- | --- | --- | --- | --- |
| F-01 | n/a_re | E-01, E-02 | 高 | 漫蛙内容图片 | 需要 AES-CBC/PKCS7 字节解码；新版 App 接入，内部元数据不发给服务器 |
| F-02 | n/a_re | E-01, E-03 | 高 | Z8PT 图片 URL | 公共 AES-ECB 地址解码完成 |
| F-03 | n/a_re | E-04 | 中 | 听书网播放接口 | 固定公开接口字段适配完成；部分页面仍需验证，未宣称所有音频实播成功 |
| F-04 | n/a_re | E-01, E-05 | 高 | Hanime1 / Hlib | 播放前按分辨率排序；HTTP-200 人机验证页必须触发验证提示 |

P-01，path_type=callflow：列表 → 作品详情 → 章节 → 图片 URL → 图片网络管线 → 按内部编码元数据解码 → 图片缓存与显示（E-02 / F-01）。

P-02，path_type=callflow：播放页 → 提取实时 source 地址 → 按 size 降序排序 → 第一次打开最高画质地址（E-05 / F-04）；签名地址不写进源脚本。

## 时间线

1. 2026-10-14：读取指定站点的公开列表、章节和资源结构。
2. 2026-10-14：用户手动通过 Hanime1、HHHBook、Hlib 验证，核对正常 DOM。
3. 2026-10-14：还原公开阅读器的地址和图片编码，建立脱敏回归测试。
4. 2026-10-14：完成原生引擎与应用回归检查，更新订阅清单。

## 使用与维护

更新对应板块订阅即可导入新增脚本。网页验证站点需在 App 内重新验证，本地桌面浏览器验证不会自动转移到手机。漫蛙需包含 `image_bytes_decoder.dart` 的新版安装包。默认站点图标取可用的 PNG，缺图标时应用显示统一首字图标；缺作品封面时应用显示统一标题封面并保留重试。

新增脚本含有按许可证内嵌的 CryptoJS，许可证见 `licenses/CryptoJS-MIT.txt`。应用仅引入所需的 PointyCastle AES 组件，见 https://pub.dev/packages/pointycastle 。

## 追加：BAKA MH 与禁漫天堂

用户确认替换已经删除的 BAKA MH 旧实现，新脚本 2.0.0 以 `bakamh.com` 为默认地址，分类、分页、章节和正文按当前 Madara 页面重新实现。保留远端删除提交，不恢复旧代码。浏览器核对了正常首页和详情的章节结构，普通 HTTP 仍可能需要网页验证。

禁漫天堂（18comic.vip）以站点的 `thumb-overlay-albums`、`book-name`、`btn-toolbar`、`/photo/` 和 `/media/photos/` 结构取列表、章节与图片。E-06：公开 `jquery.photo-0.4.js` 的 `get_num` 与 `onImageLoaded`；repro_command 为 `node --test tools/requested_sources_test.js`，content_hash 为 n/a（线上会更新）。F-05：severity=n/a_re，evidence_ids=E-06，confidence=高，location=禁漫阅读器，status=已实现原生图片横条还原。P-03，path_type=callflow：读取 scramble_id 和章节 ID → MD5 尾字符按 ID 区间计算横条数 → 图片管线反向排列横条并保留首条余数行 → 缓存还原后的图片。

测试覆盖 268850、421925、421926 分界点，低 ID 与 GIF 不还原，并以独立逐行色块检查整数高度和带余数高度的每一个像素行。新版 App 完整回归 1631 项通过；这个处理不能证明所有收费章节或所有 CDN 在线。

## 北觅影视请求头与限制

北觅影视更新到 1.1.1。旧实现为媒体强加站点 Referer 和 `Mozilla/5.0`，这不是播放数据声明的要求，现改成只转发播放数据提供的头；两种情况的回归测试通过。用户原日志记录 AVPlayer / CoreMedia HTTP 403；本地重新请求播放元数据时站点返回 HTTP 567，未取得新媒体链接，因此未宣称已恢复实播。默认请求头修正不能解除来源服务的拒绝，仍需在手机上复测并核对新日志。


### 2026-10-21 账号登录反馈

巴卡漫画 2.1.0 在正文确实返回锁定标记、且用户已配置账号密码时，尝试站点 WordPress 登录后重新读取章节。普通公开章节不发送账号；自动提交仅限脚本内公布的 HTTPS 镜像，表单变化、账号错误、仍需购买都会给出明确提示，同一运行上下文不会反复提交失败凭据。App 同时提供原站网页登录并检查会话的入口。

离线 Node 回归 106 项通过，新增覆盖账号编码、失败不重复提交、公开章节不登录、购买权限及自定义域名不接收自动提交。当前本机访问 wp-login.php 返回 403，未使用用户账号进行在线登录，不声明真人账号已验收。JComic 主站返回 200，但图片域名的 Cloudflare 拒绝访问问题仍独立存在。
