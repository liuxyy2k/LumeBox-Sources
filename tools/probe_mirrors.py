# -*- coding: utf-8 -*-
"""探测各小说站的真实备用域名（footer 备用网址 / 跳转目标 / 页面内出现的同站域名）。

只读：逐站取首页，抓「备用 / 永久 / 发布页 / 防走失 / 最新网址」附近的域名，并列出
页面里出现过的所有域名及出现次数，便于人工判断哪些是同站镜像。
"""
import re
import sys
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

PROXY = "http://127.0.0.1:7890"
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

SITES = [
    ("zssq8", "https://www.zssq8.cc"),
    ("wanben2", "https://www.wanben2.com"),
    ("jpxs123", "https://jpxs123.top"),
    ("51eshu", "https://m.51eshu.com"),
    ("suixkan", "https://m.suixkan.com"),
    ("sspwk", "https://www.wxscs.com"),
    ("101minc", "https://www.101minc.com"),
    ("powenwu11", "https://www.powenwu11.com"),
    ("czbooks", "https://czbooks.net"),
    ("caimoge8", "https://www.caimoge8.net"),
    ("po18vip", "https://wap.po18vip.com"),
    ("dingdian666", "https://m.dingdian666.com"),
]

KEYWORDS = re.compile(
    r"(备用|永久|发布页|防走失|防丢失|收藏本?站|最新网址|新网址|请记住|记住本站|域名|网址|"
    r"mirror|备用地址|线路)")
HOST_RE = re.compile(r"https?://([0-9a-zA-Z._-]+)")


def opener():
    o = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
    return o


def fetch(url):
    o = opener()
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    })
    try:
        r = o.open(req, timeout=25)
        return r.geturl(), r.status, r.read(600000).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return url, 0, "ERR: %s" % e


def probe(item):
    key, url = item
    final, status, body = fetch(url)
    if status == 0:
        return key, url, final, status, [], [], body[:160]
    hosts = {}
    for m in HOST_RE.finditer(body):
        h = m.group(1).lower()
        hosts[h] = hosts.get(h, 0) + 1
    hits = []
    for m in KEYWORDS.finditer(body):
        s = max(0, m.start() - 90)
        seg = body[s:m.end() + 160]
        seg = re.sub(r"<[^>]+>", " ", seg)
        seg = re.sub(r"\s+", " ", seg).strip()
        for h in HOST_RE.findall(body[max(0, m.start() - 200):m.end() + 300]):
            hits.append((h.lower(), seg[:120]))
    title = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    return key, url, final, status, hits[:12], sorted(hosts.items(), key=lambda x: -x[1])[:14], \
        (title.group(1).strip()[:80] if title else "")


def main():
    with ThreadPoolExecutor(max_workers=6) as ex:
        for key, url, final, status, hits, hosts, title in ex.map(probe, SITES):
            print("=" * 78)
            print("[%s] %s -> HTTP %s%s" % (key, url, status,
                                            ("  最终: " + final) if final != url else ""))
            print("  标题: %s" % title)
            if hits:
                print("  ---- 备用/网址 相关片段 ----")
                seen = set()
                for h, seg in hits:
                    if h in seen:
                        continue
                    seen.add(h)
                    print("    %-30s | %s" % (h, seg))
            print("  ---- 页面内域名 TOP ----")
            for h, n in hosts:
                print("    %-32s x%d" % (h, n))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
