# 从 LumeBox App 发布源文件增删

App 入口为“设置 → 内容与订阅 → GitHub 仓库源管理”。令牌需要此仓库 Contents 读写、Actions 只读权限，账号需有仓库写入权限。

App 把 UTF-8 `.js`／`.py` 源的新增或整源（含别名）删除提交到 `lumebox/manage-*` 分支。`app-source-publish.yml` 检查该提交仅增删允许的源文件、父提交仍是当前 main，校验元数据、重复 ID 与语法，然后用现有 `build_catalog.py` 生成两条线路订阅，快进发布至 main。

发布后刷新 CDN，并实际下载 GitHub raw 与 jsDelivr 内容对照提交字节；已删文件必须在两条线路都返回 404。Actions 完成前不能将候选提交视为已发布。main 并发变化、分支保护或 CDN 核对失败会显示流程失败；CDN 失败时 main 可能已更新，应先核对状态。

上传限制为单源 4MB、元数据 JSON 头、合法 ID、板块与内容分类。工具只做格式与语法验证，不执行上传源代码，也不替代站点分类、搜索、封面和播放实测。18+ 源的仓库分级由声明同步登记。

开发验证：

```powershell
python -m unittest discover -s tools -p test_app_publication.py -v
python -m unittest discover -s tools -p test_cdn_purge.py -v
python -m unittest discover -s tools -p test_python_catalog.py -v
python tools/build_catalog.py --check
```

`workflow_dispatch` 只运行测试和目录生成校验，不向 main 写入或增删源。可用于部署后校验远端执行环境；它不代表真实 App 增删和双线路发布验收。
