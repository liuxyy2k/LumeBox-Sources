# LumeBox 源仓库使用说明

小说源已移除。当前有效脚本和订阅入口见仓库根目录 README；App 保留漫画、视频和猫源。

完整脚本名称、版本与分类见[源目录](源目录.md)。

在对应板块的源选择页点击「+」，导入脚本或粘贴订阅地址。脚本分类必须与目标板块一致。

## 维护和验证

`tools/source_files.json` 保存旧文件名到现有文件名的映射。修改脚本时同步首行元数据与 `LumeSource` 内的版本。

在仓库根目录运行离线回归：

```powershell
$sourceTests = (Get-ChildItem tools -Filter '*_test.js').FullName
node --test $sourceTests
```

快照用例验证解析规则；通过不代表站点实时可达。登录、验证码、付费限制和独立图片域名验证仍由网站决定。

分类与兼容地址见[源分类说明](源分类与兼容地址.md)。
