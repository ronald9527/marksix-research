#!/usr/bin/env python3
"""由 docs/history.json 生成内联数据文件 docs/data.js
页面用它做离线兜底与首屏渲染，避免依赖网络请求。
"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'

ZODIAC_NUMS = {
    '马': [1, 13, 25, 37, 49], '蛇': [2, 14, 26, 38], '龙': [3, 15, 27, 39],
    '兔': [4, 16, 28, 40], '虎': [5, 17, 29, 41], '牛': [6, 18, 30, 42],
    '鼠': [7, 19, 31, 43], '猪': [8, 20, 32, 44], '狗': [9, 21, 33, 45],
    '鸡': [10, 22, 34, 46], '猴': [11, 23, 35, 47], '羊': [12, 24, 36, 48],
}
RED = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]
BLUE = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]
WUXING_GROUPS = [
    ([4, 5, 12, 13, 26, 27, 34, 35, 42, 43], '金'),
    ([8, 9, 16, 17, 24, 25, 38, 39, 46, 47], '木'),
    ([1, 14, 15, 22, 23, 30, 31, 44, 45], '水'),
    ([2, 3, 10, 11, 18, 19, 32, 33, 40, 41, 48, 49], '火'),
    ([6, 7, 20, 21, 28, 29, 36, 37], '土'),
]
ZODIAC_ORDER = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']


def main():
    hist = json.loads((DOCS / 'history.json').read_text(encoding='utf8'))
    hist.sort(key=lambda r: r['period'])

    # 完整性校验，有问题直接报错让 CI 停下来
    errs = []
    seen = set()
    for r in hist:
        alln = r['mains'] + [r['special']]
        if r['period'] in seen:
            errs.append('%s 期号重复' % r['period'])
        seen.add(r['period'])
        if len(set(r['mains'])) != 6 or len(r['mains']) != 6:
            errs.append('%s 正码异常' % r['period'])
        if any(not (1 <= n <= 49) for n in alln):
            errs.append('%s 号码越界' % r['period'])
        if r['special'] in r['mains']:
            errs.append('%s 特码与正码重复' % r['period'])
    if errs:
        raise SystemExit('数据校验失败: ' + '; '.join(errs[:5]))

    n2z = {}
    for z, nums in ZODIAC_NUMS.items():
        for n in nums:
            n2z[n] = z
    wux = {}
    for ns, w in WUXING_GROUPS:
        for n in ns:
            wux[n] = w

    payload = {
        'history': hist,
        'zodiacNums': ZODIAC_NUMS,
        'num2Zodiac': n2z,
        'red': RED,
        'blue': BLUE,
        'wuxing': wux,
        'zodiacOrder': ZODIAC_ORDER,
        'updated': datetime.now().strftime('%Y-%m-%d %H:%M'),
    }
    out = 'window.SEED=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';'
    (DOCS / 'data.js').write_text(out, encoding='utf8')
    print('data.js 已生成: %d 期, %d 字节' % (len(hist), len(out)))
    print('期号范围: %s ~ %s' % (hist[0]['period'], hist[-1]['period']))


if __name__ == '__main__':
    main()
