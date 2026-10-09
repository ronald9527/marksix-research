#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从源站抓取开奖记录并合并进 docs/history.json

源站期号为 7 位（如 2026282 = 2026 年第 282 期），统一转换为 3 位期号存储。
只做增量合并，已有的期号不覆盖。
"""
import gzip
import io
import json
import os
import re
import sys
import urllib.request

SOURCE = "https://www.amkkjj.com/"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "history.json")

UA = ("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")


def fetch_html():
    req = urllib.request.Request(SOURCE, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        # 只请求 gzip/deflate，避免 brotli 无法解压
        "Accept-Encoding": "gzip, deflate",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        enc = (r.headers.get("Content-Encoding") or "").lower()
    if "gzip" in enc:
        raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
    elif "deflate" in enc:
        import zlib
        raw = zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw.decode("utf-8", errors="ignore")


def parse(html):
    out = []
    for block in html.split("hisList")[1:]:
        pm = re.search(r"<i>\s*(\d{7})\s*</i>", block)
        dm = re.search(r'hisTime[^"]*"><span>([\d-]+)</span>', block)
        if not pm or not dm:
            continue
        nums = [int(m.group(1)) for m in
                re.finditer(r'history_block-lump-(?:red|blue|green)-a[^>]*>(\d+)<', block)]
        if len(nums) != 7:
            continue
        full = int(pm.group(1))
        period = full % 1000          # 2026282 -> 282
        mains = sorted(nums[:6])
        special = nums[6]
        # 校验
        if len(set(mains)) != 6:
            continue
        if special in mains:
            continue
        if not all(1 <= n <= 49 for n in mains + [special]):
            continue
        out.append({"period": period, "date": dm.group(1),
                    "mains": mains, "special": special})
    return out


def main():
    html = fetch_html()
    got = parse(html)
    print("源站解析到 %d 期" % len(got))

    path = os.path.abspath(OUT)
    cur = []
    if os.path.exists(path):
        cur = json.load(open(path, encoding="utf-8"))
    known = {r["period"] for r in cur}

    added = []
    for r in got:
        if r["period"] not in known:
            cur.append(r)
            added.append(r)

    cur.sort(key=lambda x: x["period"])
    json.dump(cur, open(path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    print("库内原有 %d 期，新增 %d 期" % (len(cur) - len(added), len(added)))
    for r in added:
        print("  + 第%d期 %s 正码%s 特码%d" % (r["period"], r["date"], r["mains"], r["special"]))
    print("当前最新: 第%d期 %s" % (cur[-1]["period"], cur[-1]["date"]))
    return len(added)


if __name__ == "__main__":
    sys.exit(0 if main() >= 0 else 1)
