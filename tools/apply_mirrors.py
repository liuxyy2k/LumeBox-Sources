# -*- coding: utf-8 -*-
"""按实测结果重写各小说源的 mirrors（头 JSON + 源对象里的 mirrors 字段）。

依据 tools/probe_mirrors*.py 的实测：
- 只收「同一套 DOM 模板 + HTTP 200」的域名（换域名后选择器必须照样命中）；
- 桌面版与手机版模板不通用（实测重合度 0.03~0.17），不混放；
- 采墨阁只有明文 http 可用（https 证书不匹配 + 403），因此它的镜像全是 http。
"""
import io
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 文件 -> 新的 mirrors（第 0 个 = 主站，与用户给的入口域名一致）
NEW = {
    "zssq8": ["https://www.zssq8.cc", "https://zssq8.cc"],
    "wanben2": ["https://www.wanben2.com", "https://www.xwbsz.com", "https://www.xwbbook.com"],
    "jpxs123": ["https://jpxs123.top", "https://www.jpxs123.top", "https://m.jpxs123.top"],
    "51eshu": ["https://m.51eshu.com", "https://51eshu.com"],
    "suixkan": ["https://m.suixkan.com", "https://m.yueyouxs.com"],
    "101minc": ["https://www.101minc.com", "https://sg.101minc.com", "https://hk.101minc.com"],
    "powenwu11": ["https://www.powenwu11.com", "https://powenwu11.com"],
    "czbooks": ["https://czbooks.net"],
    "caimoge8": ["http://www.caimoge8.net", "http://www.caimoge.net", "http://caimoge8.net"],
    "po18vip": ["https://wap.po18vip.com"],
    "dingdian666": ["https://m.dingdian666.com"],
    "sspwk": ["https://sspwk.vip"],
}
FILES = {
    "zssq8": "novel/追书神器吧.js",
    "wanben2": "novel/完本神站.js",
    "jpxs123": "novel/精品小说网.js",
    "51eshu": "novel/无忧小说网.js",
    "suixkan": "novel/随看书.js",
    "101minc": "novel/101小说.js",
    "powenwu11": "novel/PO文屋.js",
    "czbooks": "novel/小說狂人.js",
    "caimoge8": "novel/采墨阁.js",
    "po18vip": "novel/PO18.js",
    "dingdian666": "novel/顶点小说.js",
    "sspwk": "novel/少数派文库.js",
}

HEADER = re.compile(r"^(// LumeSource: )(\{.*\})\s*$", re.M)


def fix_header(text, mirrors):
    m = HEADER.search(text)
    if not m:
        return text, "无头 JSON"
    info = json.loads(m.group(2))
    old = info.get("mirrors", [])
    info["mirrors"] = mirrors
    line = m.group(1) + json.dumps(info, ensure_ascii=False, separators=(",", ":"))
    return text[:m.start()] + line + text[m.end():], old


def fix_field(text, mirrors):
    """源对象里的 mirrors: [...] 字段（Venera 兼容用），有才改。"""
    pat = re.compile(r"(mirrors\s*:\s*)\[[^\]]*\]")
    if not pat.search(text):
        return text, None
    old = pat.search(text).group(0)
    new = pat.sub(lambda m: m.group(1) + json.dumps(mirrors, ensure_ascii=False), text, count=1)
    return new, old


def main():
    rc = 0
    for key, rel in FILES.items():
        path = os.path.join(REPO, rel)
        with io.open(path, encoding="utf-8") as fh:
            text = fh.read()
        mirrors = NEW[key]
        new_text, old = fix_header(text, mirrors)
        new_text, old_field = fix_field(new_text, mirrors)
        if new_text != text:
            with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(new_text)
            print("%-28s 头 %s -> %s" % (rel, old, mirrors))
            if old_field is not None:
                print("%-28s 字段 %s -> %s" % ("", old_field, mirrors))
        else:
            print("%-28s 未改动" % rel)
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
