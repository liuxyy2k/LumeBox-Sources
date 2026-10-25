# LumeBox 源仓库

在 APP 的“总订阅导入导出”中添加[总订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all)，一次导入全部分类；已有用户可用“一键同步全部订阅”更新。

## 分类入口

| 分类 | 独立源数 | 导入入口 | APP 所属板块 |
| --- | ---: | --- | --- |
| 漫画 | 48 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/comic.txt) | 漫画 |
| 美图 | 3 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/photo.txt) | 漫画 |
| 影视 | 10 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/movie.txt) | 视频 |
| 视频与直播 | 72 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/video.txt) | 视频 |
| 有声小说 | 6 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/audiobook.txt) | 视频 |

共 **139 个独立源**，按 ID 去重。每个源在总订阅中只出现一次，兼容副本与同 ID 重复脚本已删除。旧订阅清单入口保留，被删除文件的旧单独地址不再可用。

18+ 是内容分级，与上述内容类型分别管理；未分级不代表全年龄适用。图标、封面和播放实时可用性没有经过全站逐项验证，静态检查通过不代表站点可用。

## 查看与维护

- [完整源目录](docs/源目录.md)：名称、版本、分类、分级及兼容副本。
- [旧地址兼容表](docs/源分类与兼容地址.md)：已有订阅可以继续使用。
- [维护说明](docs/README.md)：生成清单与离线验证命令。
- `catalog.json` 是维护用索引，不是 APP 导入地址；`content-ratings.json` 保存分级依据。
- `comic/`、`photo/`、`movie/`、`video/`、`audiobook/` 保存脚本。实际分类以目录索引为准；影视和有声中仍有历史脚本位于 `video/`，分类清单已经分别归类。
- `tools/` 保存生成与测试工具；`snapshots/` 保存离线回归样本；`licenses/` 保存授权材料。

## 兼容综合入口

[漫画与美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics) · [影视、视频与有声](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)。新用户使用上方分类入口即可，无需叠加导入扩展清单。
