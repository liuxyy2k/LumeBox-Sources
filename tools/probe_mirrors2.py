# -*- coding: utf-8 -*-
"""第二轮：逐个验证候选域名是否同站镜像（可达性 + 标题 + 是否共用同一套模板）。"""
import re
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PROXY = "http://127.0.0.1:7890"
UA_M = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
UA_D = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36")

CANDIDATES = [
    ("zssq8", "https://www.zssq8.cc"), ("zssq8", "https://zssq8.cc"),
    ("zssq8", "http://www.zssq8.cc"), ("zssq8", "https://m.zssq8.cc"),
    ("zssq8", "https://www.zssq8.com"), ("zssq8", "https://www.zssq8.net"),
    ("jpxs123", "https://jpxs123.top"), ("jpxs123", "https://www.jpxs123.top"),
    ("jpxs123", "http://jpxs123.top"), ("jpxs123", "https://m.jpxs123.top"),
    ("51eshu", "https://m.51eshu.com"), ("51eshu", "https://www.51eshu.com"),
    ("51eshu", "https://51eshu.com"), ("51eshu", "https://m.51eshu.cc"),
    ("suixkan", "https://m.suixkan.com"), ("suixkan", "https://www.suixkan.com"),
    ("suixkan", "https://m.yueyouxs.com"), ("suixkan", "https://www.yueyouxs.com"),
    ("suixkan", "https://yueyouxs.com"),
    ("sspwk", "https://www.wxscs.com"), ("sspwk", "https://sspwk.vip"),
    ("sspwk", "https://www.sspwk.vip"), ("sspwk", "https://sspwk.com"),
    ("sspwk", "https://www.wxscs.net"), ("sspwk", "https://wxscs.com"),
    ("caimoge8", "https://www.caimoge8.net"), ("caimoge8", "http://www.caimoge8.net"),
    ("caimoge8", "https://caimoge8.net"), ("caimoge8", "https://www.caimoge8.com"),
    ("caimoge8", "https://www.caimoge.net"),
    ("po18vip", "https://wap.po18vip.com"), ("po18vip", "https://www.po18vip.com"),
    ("po18vip", "https://po18vip.com"), ("po18vip", "https://www.po18.tw"),
    ("po18vip", "https://po18.tw"), ("po18vip", "https://m.po18vip.com"),
    ("czbooks", "https://czbooks.net"), ("czbooks", "https://www.czbooks.net"),
    ("czbooks", "https://m.czbooks.net"), ("czbooks", "https://www.drxsw.com"),
    ("czbooks", "http://www.drxsw.com"),
    ("dingdian666", "https://m.dingdian666.com"), ("dingdian666", "https://www.dingdian666.com"),
    ("dingdian666", "https://dingdian666.com"), ("dingdian666", "https://m.dingdian666.cc"),
    ("powenwu11", "https://www.powenwu11.com"), ("powenwu11", "https://powenwu11.com"),
    ("powenwu11", "https://m.powenwu11.com"), ("powenwu11", "https://www.powenwu11.cc"),
    ("wanben2", "https://www.wanben2.com"), ("wanben2", "https://www.xwbsz.com"),
    ("wanben2", "https://www.xwbbook.com"), ("wanben2", "https://m.xwbbook.com"),
    ("101minc", "https://www.101minc.com"), ("101minc", "https://sg.101minc.com"),
    ("101minc", "https://tw.101minc.com"), ("101minc", "https://hk.101minc.com"),
]

NO_VERIFY = ssl.create_default_context()
NO_VERIFY.check_hostname = False
NO_VERIFY.verify_mode = ssl.CERT_NONE


def fetch(url, insecure=False):
    ctx = NO_VERIFY if insecure else None
    hs = urllib.request.HTTPSHandler(context=ctx) if ctx else urllib.request.HTTPSHandler()
    o = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}), hs)
    req = urllib.request.Request(url, headers={"User-Agent": UA_M,
                                              "Accept-Language": "zh-CN,zh;q=0.9"})
    try:
        r = o.open(req, timeout=25)
        body = r.read(200000).decode("utf-8", "replace")
        t = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
        marker = ""
        for probe in ("search", "book", "list", "novel", "info", "read"):
            pass
        # 站点特征：列表链接形态，用于判断是否同一套模板
        feats = {
            "/book/": body.count("/book/"),
            "/novel/": body.count("/novel/"),
            "/list/": body.count("/list/"),
            "/read/": body.count("/read/"),
            "/chapter": body.count("/chapter"),
            "/xs/": body.count("/xs/"),
        }
        top = sorted([f"{k}{v}" for k, v in feats.items() if v], key=lambda s: -int(re.sub(r"\D", "", s) or 0))[:3]
        return (url, r.geturl(), r.status,
                (t.group(1).strip()[:70] if t else ""), ",".join(top), "")
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        short = re.sub(r"<[^>]+>", "", msg)[:110]
        if "CERTIFICATE_VERIFY_FAILED" in msg or "Hostname mismatch" in msg:
            return (url, url, -1, "证书不匹配", "", short)
        return (url, url, 0, "", "", short)


def run(item):
    key, url = item
    r = fetch(url)
    if r[2] == -1:
        r = fetch(url, insecure=True)
        r = (r[0] + "  [忽略证书]", r[1], r[2], r[3], r[4], r[5])
    return (key,) + r


def main():
    with ThreadPoolExecutor(max_workers=6) as ex:
        rows = list(ex.map(run, CANDIDATES))
    cur = None
    for key, url, final, status, title, feat, err in rows:
        if key != cur:
            print("=" * 74)
            cur = key
        tag = {200: "OK ", 0: "ERR", -1: "TLS", 301: "3xx", 302: "3xx"}.get(status, str(status))
        line = "  %-4s %-42s" % (tag, url)
        if final != url and status == 200:
            line += " -> " + final
        print(line)
        if title:
            print("       %s   [%s]" % (title, feat))
        if err and status != 200:
            print("       %s" % err)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
