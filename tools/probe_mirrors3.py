# -*- coding: utf-8 -*-
"""第三轮：同一站点的多个候选域名，是否同一套模板（结构签名重合度）。

镜像切换的本质要求是「换域名后同一批 CSS 选择器仍然命中」，所以这里不比对文本，
而是比对 DOM 结构签名：页面里出现的 id / class 记号集合的 Jaccard 重合度。
重合度高（>0.6）视为同模板、可互为镜像；低则不能混进 mirrors。
"""
import re
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PROXY = "http://127.0.0.1:7890"
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

GROUPS = [
    ("zssq8", ["https://www.zssq8.cc", "https://zssq8.cc"]),
    ("jpxs123", ["https://jpxs123.top", "https://www.jpxs123.top", "https://m.jpxs123.top"]),
    ("51eshu", ["https://m.51eshu.com", "https://www.51eshu.com", "https://51eshu.com"]),
    ("suixkan", ["https://m.suixkan.com", "https://m.yueyouxs.com", "https://www.yueyouxs.com"]),
    ("sspwk", ["https://sspwk.vip", "https://www.wxscs.com"]),
    ("caimoge8", ["http://www.caimoge8.net", "http://www.caimoge.net", "http://caimoge8.net"]),
    ("po18vip", ["https://wap.po18vip.com", "https://www.po18vip.com", "https://po18vip.com"]),
    ("czbooks", ["https://czbooks.net"]),
    ("dingdian666", ["https://m.dingdian666.com", "https://www.dingdian666.com",
                     "https://dingdian666.com"]),
    ("powenwu11", ["https://www.powenwu11.com", "https://powenwu11.com"]),
    ("wanben2", ["https://www.wanben2.com", "https://www.xwbsz.com", "https://m.xwbsz.com",
                 "https://www.xwbbook.com", "https://m.xwbbook.com"]),
    ("101minc", ["https://www.101minc.com", "https://sg.101minc.com", "https://tw.101minc.com",
                 "https://hk.101minc.com"]),
    ("wxscs", ["https://www.wxscs.com", "https://wxscs.com"]),
]

TOKEN = re.compile(r'(?:id|class)\s*=\s*"([^"]*)"')


def fetch(url):
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}),
        urllib.request.HTTPSHandler(context=CTX))
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                              "Accept-Language": "zh-CN,zh;q=0.9"})
    try:
        r = opener.open(req, timeout=25)
        body = r.read(400000).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return url, None, "ERR " + re.sub(r"<[^>]+>", "", str(e))[:60]
    toks = set()
    for m in TOKEN.finditer(body):
        for t in m.group(1).split():
            t = t.strip()
            if t:
                toks.add(t)
    return url, toks, ""


def main():
    for key, urls in GROUPS:
        print("=" * 74)
        print("[%s]" % key)
        with ThreadPoolExecutor(max_workers=4) as ex:
            rows = list(ex.map(fetch, urls))
        base_url, base_toks, base_err = rows[0]
        if base_toks is None:
            print("  基准失败 %s %s" % (base_url, base_err))
            continue
        for url, toks, err in rows:
            if toks is None:
                print("  %-38s %s" % (url, err))
                continue
            inter = len(base_toks & toks)
            union = len(base_toks | toks)
            j = inter / union if union else 0
            flag = "同模板" if j >= 0.6 else ("部分相似" if j >= 0.35 else "不同模板")
            print("  %-38s 记号 %4d  重合 %.2f  %s" % (url, len(toks), j, flag))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
