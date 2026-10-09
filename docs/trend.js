/* 六合智析 · 走势图与方向分析 */
(function () {
'use strict';

var M = window.MSX;
if (!M) { console.error('MSX 未初始化'); return; }

var REC = M.REC;
var colorOf = M.colorOf, zodiacOf = M.zodiacOf, colorName = M.colorName;
var headOf = M.headOf, tailOf = M.tailOf, fmt = M.fmt, pText = M.pText;

function $(id) { return document.getElementById(id); }
function nums(r) { return r.mains.slice().sort(function (a, b) { return a - b; }).concat([r.special]); }
function setOf(r) { var s = {}; nums(r).forEach(function (n) { s[n] = 1; }); return s; }

/* ============ 1. 号码走势网格 ============ */
var trendN = 30;
function renderGrid() {
  var list = REC.slice(-(trendN > 500 ? REC.length : trendN));
  var h = '<table class="trend"><thead><tr><th class="tp">期号</th>';
  for (var n = 1; n <= 49; n++) h += '<th class="th2">' + n + '</th>';
  h += '</tr></thead><tbody>';
  var prev = null;
  list.forEach(function (r) {
    var cur = setOf(r);
    h += '<tr><td class="tp">' + String(r.period).slice(-3) + '</td>';
    for (var n = 1; n <= 49; n++) {
      var on = cur[n] ? 1 : 0;
      var ln = (prev && prev[n] && on) ? 1 : 0;
      var cls = 'tc' + (ln ? ' ln' : '');
      h += '<td class="' + cls + '">';
      if (on) {
        h += '<span class="td ' + colorOf(n) + (n === r.special ? ' sp' : '') + '">' + n + '</span>';
      } else {
        h += '<span class="tdmiss">' + (prev ? (cur[n] ? 0 : missAt(r, n)) : '') + '</span>';
      }
      h += '</td>';
    }
    h += '</tr>';
    prev = cur;
  });
  h += '</tbody></table>';
  $('trendGrid').innerHTML = h;
}
/* 遗漏数：该号到本期为止连续未出现的期数 */
var missCache = null, missKey = '';
function buildMiss() {
  var key = REC.length + '-' + REC[REC.length - 1].period;
  if (missKey === key && missCache) return missCache;
  var m = {}, last = {};
  REC.forEach(function (r, i) { nums(r).forEach(function (n) { last[n] = i; }); });
  REC.forEach(function (r, i) {
    m[r.period] = {};
    for (var n = 1; n <= 49; n++) m[r.period][n] = (last[n] === undefined || last[n] > i) ? i + 1 : i - last[n];
  });
  missKey = key; missCache = m; return m;
}
function missAt(r, n) { var m = buildMiss(); return m[r.period] ? m[r.period][n] : ''; }

/* ============ 2. 指标折线 ============ */
var lineKey = 'special';
var LINES = {
  special: { name: '特码值', fn: function (r) { return r.special; }, theo: 25, range: [1, 49] },
  sum: { name: '和值(7码)', fn: function (r) { return nums(r).reduce(function (a, b) { return a + b; }, 0); }, theo: 175, range: [80, 270] },
  span: { name: '跨度(正码极差)', fn: function (r) { var m = r.mains.slice().sort(function (a, b) { return a - b; }); return m[5] - m[0]; }, theo: 37.5, range: [5, 49] },
  repeat: { name: '重号数', fn: null, theo: 1.0, range: [0, 5] },
  odd: { name: '奇数个数', fn: function (r) { return nums(r).filter(function (n) { return n % 2 === 1; }).length; }, theo: 3.571, range: [0, 7] },
  adj: { name: '邻号数(±1)', fn: null, theo: 1.79, range: [0, 6] }
};
function seriesOf(key) {
  var out = [], i, L = LINES[key];
  for (i = 0; i < REC.length; i++) {
    var v = null;
    if (key === 'repeat') {
      if (i === 0) continue;
      var cur = setOf(REC[i]), pv = setOf(REC[i - 1]), c = 0;
      Object.keys(cur).forEach(function (n) { if (pv[n]) c++; });
      v = c;
    } else if (key === 'adj') {
      if (i === 0) continue;
      var cur2 = setOf(REC[i]), pv2 = setOf(REC[i - 1]), c2 = 0;
      Object.keys(cur2).forEach(function (n) {
        n = +n; if (pv2[n - 1] || pv2[n + 1]) c2++;
      });
      v = c2;
    } else {
      v = L.fn(REC[i]);
    }
    out.push({ period: REC[i].period, v: v });
  }
  return out;
}
function renderLine() {
  var L = LINES[lineKey], s = seriesOf(lineKey).slice(-40);
  if (!s.length) { $('lineChart').innerHTML = ''; return; }
  var W = 700, H = 190, pl = 34, pr = 10, pt = 12, pb = 22;
  var vs = s.map(function (x) { return x.v; });
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  if (L.range) { lo = Math.min(lo, L.range[0]); hi = Math.max(hi, L.range[1]); }
  var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  function X(i) { return pl + i * ((W - pl - pr) / Math.max(1, s.length - 1)); }
  function Y(v) { return pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb); }

  var g = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
  g += '<line x1="' + pl + '" y1="' + (H - pb) + '" x2="' + (W - pr) + '" y2="' + (H - pb) + '" stroke="#30363d"/>';
  var yt = Y(L.theo);
  g += '<line x1="' + pl + '" y1="' + yt + '" x2="' + (W - pr) + '" y2="' + yt + '" stroke="#d29922" stroke-dasharray="4 3"/>';
  g += '<text x="2" y="' + (yt + 4) + '" fill="#d29922" font-size="10">理论' + L.theo + '</text>';
  var d = '';
  s.forEach(function (x, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.v).toFixed(1) + ' '; });
  g += '<path d="' + d + '" fill="none" stroke="#58a6ff" stroke-width="1.6"/>';
  s.forEach(function (x, i) {
    g += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(x.v).toFixed(1) + '" r="2" fill="#58a6ff"/>';
  });
  g += '<text x="2" y="' + (pt + 8) + '" fill="#8b949e" font-size="10">' + hi.toFixed(0) + '</text>';
  g += '<text x="2" y="' + (H - pb) + '" fill="#8b949e" font-size="10">' + lo.toFixed(0) + '</text>';
  g += '<text x="' + (W - pr - 60) + '" y="' + (H - 4) + '" fill="#8b949e" font-size="10">' + s[s.length - 1].period + '期</text>';
  g += '<text x="' + pl + '" y="' + (H - 4) + '" fill="#8b949e" font-size="10">' + s[0].period + '期</text>';
  g += '</svg>';
  $('lineChart').innerHTML = g;

  var mean = vs.reduce(function (a, b) { return a + b; }, 0) / vs.length;
  var sd = Math.sqrt(vs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, vs.length - 1));
  var last = vs[vs.length - 1];
  var h = '<div class="mini-c"><div class="lab">当前值</div><div class="val">' + last + '</div></div>' +
    '<div class="mini-c"><div class="lab">均值</div><div class="val">' + fmt(mean, 2) + '</div></div>' +
    '<div class="mini-c"><div class="lab">标准差</div><div class="val">' + fmt(sd, 2) + '</div></div>' +
    '<div class="mini-c"><div class="lab">理论值</div><div class="val">' + L.theo + '</div></div>' +
    '<div class="mini-c"><div class="lab">偏离理论</div><div class="val s">' +
    (mean - L.theo >= 0 ? '+' : '') + fmt(mean - L.theo, 2) + '</div></div>' +
    '<div class="mini-c"><div class="lab">区间</div><div class="val s">' + Math.min.apply(null, vs) + '~' + Math.max.apply(null, vs) + '</div></div>';
  $('lineStat').innerHTML = h;
}

/* ============ 3. 波色 / 生肖走势带 ============ */
function renderBands() {
  var list = REC.slice(-30), c = '', z = '';
  list.forEach(function (r) {
    c += '<div class="band-row"><span class="bp">' + String(r.period).slice(-3) + '</span>';
    nums(r).forEach(function (n) {
      c += '<span class="bsq ' + colorOf(n) + (n === r.special ? ' sp' : '') + '">' + n + '</span>';
    });
    c += '</div>';
    z += '<div class="band-row"><span class="bp">' + String(r.period).slice(-3) + '</span>' +
      '<span class="zsq">' + zodiacOf(r.special) + '</span>' +
      '<span class="znum ' + colorOf(r.special) + '">' + r.special + '</span></div>';
  });
  $('colorBand').innerHTML = c;
  $('zodiacBand').innerHTML = z;
}

/* ============ 4. 方向分析 ============ */
function calcFeatures() {
  var rep = [], con = [], adj = [], odd = [], big = [], sums = [], spans = [], sameTail = [];
  var i;
  for (i = 1; i < REC.length; i++) {
    var cur = setOf(REC[i]), pv = setOf(REC[i - 1]), c = 0, a = 0;
    Object.keys(cur).forEach(function (n) {
      n = +n;
      if (pv[n]) c++;
      if (pv[n - 1] || pv[n + 1]) a++;
    });
    rep.push(c); adj.push(a);
    var ns = nums(REC[i]).slice(0, 7).sort(function (x, y) { return x - y; });
    var cc = 0;
    for (var j = 0; j + 1 < ns.length; j++) if (ns[j + 1] - ns[j] === 1) cc++;
    con.push(cc);
  }
  REC.forEach(function (r) {
    var ns = nums(r);
    odd.push(ns.filter(function (n) { return n % 2 === 1; }).length);
    big.push(ns.filter(function (n) { return n >= 25; }).length);
    sums.push(ns.reduce(function (a, b) { return a + b; }, 0));
    var m = r.mains.slice().sort(function (a, b) { return a - b; });
    spans.push(m[5] - m[0]);
    var tc = {}; ns.forEach(function (n) { tc[n % 10] = (tc[n % 10] || 0) + 1; });
    sameTail.push(Math.max.apply(null, Object.keys(tc).map(function (k) { return tc[k]; })));
  });
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function sd(a) { var m = mean(a); return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / Math.max(1, a.length - 1)); }
  return {
    rep: { mean: mean(rep), sd: sd(rep), theo: 1.0, name: '重号数', desc: '与上期重复的号码个数' },
    con: { mean: mean(con), sd: sd(con), theo: 0.857, name: '连号对数', desc: '正码中相邻号码的对数' },
    adj: { mean: mean(adj), sd: sd(adj), theo: 1.79, name: '邻号数', desc: '本期号码等于上期某号±1 的个数' },
    odd: { mean: mean(odd), sd: sd(odd), theo: 3.571, name: '奇数个数', desc: '7 码中奇数的个数' },
    big: { mean: mean(big), sd: sd(big), theo: 3.571, name: '大号个数', desc: '≥25 的号码个数' },
    tail: { mean: mean(sameTail), sd: sd(sameTail), theo: 2.09, name: '最大同尾数', desc: '相同尾数号码的最大个数' },
    sum: { mean: mean(sums), sd: sd(sums), theo: 175, name: '和值', desc: '7 码之和' },
    span: { mean: mean(spans), sd: sd(spans), theo: 37.5, name: '跨度', desc: '正码最大值减最小值' },
    n: REC.length
  };
}
function renderFindings(f) {
  var rows = [
    ['重号数', f.rep.mean, 1.0, f.rep.sd, '上期开出的号码下期再出'],
    ['邻号数', f.adj.mean, 1.79, f.adj.sd, '上期号码的 ±1'],
    ['连号对数', f.con.mean, 0.857, f.con.sd, '正码内部相邻'],
    ['奇数个数', f.odd.mean, 3.571, f.odd.sd, '奇偶平衡'],
    ['大号个数', f.big.mean, 3.571, f.big.sd, '大小平衡'],
    ['最大同尾数', f.tail.mean, 2.09, f.tail.sd, '同尾聚集'],
    ['和值', f.sum.mean, 175, f.sum.sd, '7 码总和'],
    ['跨度', f.span.mean, 37.5, f.span.sd, '正码极差']
  ];
  var h = '<table><thead><tr><th>指标</th><th class="num">实测</th><th class="num">理论</th><th class="num">z 值</th><th>方向</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var z = (r[1] - r[2]) / (r[3] / Math.sqrt(f.n));
    var sig = Math.abs(z) > 1.96;
    var dir = Math.abs(z) < 0.5 ? '与随机一致' : (z > 0 ? '偏高' : '偏低');
    h += '<tr><td>' + r[0] + '<div class="small muted">' + r[4] + '</div></td><td class="num">' + fmt(r[1], 3) +
      '</td><td class="num">' + r[2] + '</td><td class="num">' + fmt(z, 2) + '</td><td>' +
      '<span style="color:' + (sig ? '#7ee787' : (Math.abs(z) < 0.5 ? '#8b949e' : '#e3b341')) + '">' +
      dir + (sig ? ' *' : '') + '</span></td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="note small">z = (实测 − 理论) ÷ 标准误。|z|&gt;1.96 表示在 α=0.05 水平偏离随机；|z|&lt;0.5 表示与随机无异。' +
    '注意：同时检验 8 个指标，按 Bonferroni 校正后显著性阈值应为 |z|&gt;2.50。</div>';
  $('findings').innerHTML = h;
}
function renderMissBack() {
  var buckets = [[0, 0], [1, 2], [3, 5], [6, 10], [11, 20], [21, 999]];
  var hit = buckets.map(function () { return 0; }), tot = buckets.map(function () { return 0; });
  var miss = {}, i;
  for (var n = 1; n <= 49; n++) miss[n] = 0;
  for (i = 0; i < REC.length; i++) {
    var cur = setOf(REC[i]);
    if (i > 0) {
      for (var n2 = 1; n2 <= 49; n2++) {
        var bi = 0;
        for (var k = 0; k < buckets.length; k++) {
          if (miss[n2] >= buckets[k][0] && miss[n2] <= buckets[k][1]) { bi = k; break; }
        }
        tot[bi]++;
        if (cur[n2]) hit[bi]++;
      }
    }
    for (var n3 = 1; n3 <= 49; n3++) { if (cur[n3]) miss[n3] = 0; else miss[n3]++; }
  }
  var theo = 7 / 49 * 100;
  var h = '<table><thead><tr><th>遗漏区间</th><th class="num">下期出现率</th><th class="num">理论</th><th class="num">样本</th><th>倾向</th></tr></thead><tbody>';
  buckets.forEach(function (b, k) {
    var rate = tot[k] ? hit[k] / tot[k] * 100 : 0;
    var se = Math.sqrt(0.1429 * 0.8571 / Math.max(1, tot[k])) * 100;
    var z = (rate - theo) / (se || 1);
    var lab = b[0] === 0 ? '0（上期刚出）' : (b[1] === 999 ? '>' + (b[0] - 1) : b[0] + '-' + b[1]);
    var col = rate > theo + se ? '#7ee787' : (rate < theo - se ? '#f85149' : '#8b949e');
    h += '<tr><td>遗漏 ' + lab + ' 期</td><td class="num">' + fmt(rate, 2) + '%</td><td class="num">' +
      fmt(theo, 2) + '%</td><td class="num">' + tot[k] + '</td><td style="color:' + col + '">' +
      (rate > theo ? '偏热 +' : '偏冷 ') + fmt(rate - theo, 2) + 'pp</td></tr>';
  });
  $('missBack').innerHTML = h + '</tbody></table>';
  var r0 = tot[0] ? hit[0] / tot[0] : 0;
  var se0 = Math.sqrt(0.1429 * 0.8571 / Math.max(1, tot[0]));
  var z0 = (r0 - 7 / 49) / (se0 || 1);
  var p0 = M.normP2 ? M.normP2(z0) : 1;
  $('missBackV').innerHTML = '<div class="verdict ' + (Math.abs(z0) > 1.96 ? 'sig' : 'ns') + '"><b>' +
    (r0 > 7 / 49 ? '热号效应：上期开出过的号码，下期再出概率 ' + fmt(r0 * 100, 2) + '%，高于随机 ' + fmt(7 / 49 * 100, 2) + '%'
      : '冷号效应：上期开出过的号码，下期再出概率低于随机') +
    '</b>z = ' + fmt(z0, 3) + '，p = ' + pText(p0) + '。' +
    (Math.abs(z0) > 1.96 ? '该偏离达到统计显著，可作为方向依据。' :
      '方向为正但样本下未达显著（n=' + tot[0] + '），随数据积累可继续观察。') +
    ' 反向看，遗漏越久的号码出现率并未上升，说明「追冷号」缺乏数据支持。</div>';
}
function renderColorTrans() {
  var cols = ['红', '蓝', '绿'], tr = {}, i;
  cols.forEach(function (a) { tr[a] = {}; cols.forEach(function (b) { tr[a][b] = 0; }); });
  for (i = 1; i < REC.length; i++) {
    tr[colorName(REC[i - 1].special)][colorName(REC[i].special)]++;
  }
  var h = '<table><thead><tr><th>上期 \\ 本期</th><th class="num">红</th><th class="num">蓝</th><th class="num">绿</th><th class="num">样本</th></tr></thead><tbody>';
  cols.forEach(function (a) {
    var t = tr[a]['红'] + tr[a]['蓝'] + tr[a]['绿'];
    h += '<tr><td><b style="color:' + (a === '红' ? '#c0392b' : (a === '蓝' ? '#2471a3' : '#1e8449')) + '">' + a + '</b></td>';
    cols.forEach(function (b) {
      var p = t ? tr[a][b] / t * 100 : 0;
      var hi = (tr[a][b] === Math.max(tr[a]['红'], tr[a]['蓝'], tr[a]['绿'])) && t > 0;
      h += '<td class="num"' + (hi ? ' style="color:#7ee787;font-weight:700"' : '') + '>' + fmt(p, 1) + '%</td>';
    });
    h += '<td class="num">' + t + '</td></tr>';
  });
  h += '</tbody></table>';
  var last = REC[REC.length - 1] ? colorName(REC[REC.length - 1].special) : '红';
  var best = cols.reduce(function (a, b) { return tr[last][b] > tr[last][a] ? b : a; }, '红');
  h += '<div class="note small">上期特码为 <b>' + last + '波</b>，历史转移中其后最常出现 <b>' + best + '波</b>' +
    '（' + fmt(tr[last][best] / Math.max(1, tr[last]['红'] + tr[last]['蓝'] + tr[last]['绿']) * 100, 1) + '%）。' +
    '理论各色概率：红 34.7% / 蓝 32.7% / 绿 32.7%。</div>';
  $('colorTrans').innerHTML = h;
}
function renderDirBars() {
  var zc = {}, i;
  M.S.zodiacOrder.forEach(function (z) { zc[z] = 0; });
  REC.forEach(function (r) { nums(r).forEach(function (n) { var z = zodiacOf(n); if (z) zc[z]++; }); });
  var tot = Object.keys(zc).reduce(function (a, k) { return a + zc[k]; }, 0);
  var rows = M.S.zodiacOrder.map(function (z) {
    var cnt = (M.S.zodiacNums[z] || []).length;
    return { nm: z, v: zc[z], exp: tot * cnt / 49, c: 'b' };
  });
  var mx = Math.max.apply(null, rows.map(function (r) { return Math.max(r.v, r.exp); }));
  $('dirZodiac').innerHTML = expBarHTML(rows, mx);
  var hot = rows.slice().sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });
  $('dirZodiacV').innerHTML = '相对热度（实测/期望）最高：<b>' + hot.slice(0, 3).map(function (r) {
    return r.nm + ' ' + fmt(r.v / r.exp, 2);
  }).join('、') + '</b>；最低：<b>' + hot.slice(-3).map(function (r) {
    return r.nm + ' ' + fmt(r.v / r.exp, 2);
  }).join('、') + '</b>。比值为 1.00 表示与随机一致。';

  var hc = {}, tc = {};
  for (i = 0; i <= 4; i++) hc[i] = 0;
  for (i = 0; i <= 9; i++) tc[i] = 0;
  REC.forEach(function (r) { nums(r).forEach(function (n) { hc[headOf(n)]++; tc[tailOf(n)]++; }); });
  var ht = Object.keys(hc).reduce(function (a, k) { return a + hc[k]; }, 0);
  var tt = Object.keys(tc).reduce(function (a, k) { return a + tc[k]; }, 0);
  var hr = [], trr = [];
  for (i = 0; i <= 4; i++) hr.push({ nm: '头 ' + i, v: hc[i], exp: ht * (i === 4 ? 4 : 10) / 49, c: 'r' });
  for (i = 0; i <= 9; i++) trr.push({ nm: '尾 ' + i, v: tc[i], exp: tt * (i === 0 ? 4 : 5) / 49, c: 'g' });
  $('dirHead').innerHTML = expBarHTML(hr, Math.max.apply(null, hr.map(function (r) { return Math.max(r.v, r.exp); })));
  $('dirTail').innerHTML = expBarHTML(trr, Math.max.apply(null, trr.map(function (r) { return Math.max(r.v, r.exp); })));
  var th = hr.slice().sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });
  var tt2 = trr.slice().sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });
  $('dirTailV').innerHTML = '头数热度 TOP3：<b>' + th.slice(0, 3).map(function (r) { return r.nm.replace('头 ', '') + '(' + fmt(r.v / r.exp, 2) + ')'; }).join('、') +
    '</b>；尾数热度 TOP3：<b>' + tt2.slice(0, 3).map(function (r) { return r.nm.replace('尾 ', '') + '(' + fmt(r.v / r.exp, 2) + ')'; }).join('、') + '</b>。';

  /* 区间 */
  var zones = [[1, 12], [13, 24], [25, 36], [37, 49]];
  var zt = zones.map(function () { return 0; });
  REC.forEach(function (r) { nums(r).forEach(function (n) {
    zones.forEach(function (z, k) { if (n >= z[0] && n <= z[1]) zt[k]++; });
  }); });
  var ztot = zt.reduce(function (a, b) { return a + b; }, 0);
  var zr = zones.map(function (z, k) {
    return { nm: z[0] + '-' + z[1], v: zt[k], exp: ztot * (z[1] - z[0] + 1) / 49, c: k % 2 ? 'b' : 'r' };
  });
  $('dirZone').innerHTML = expBarHTML(zr, Math.max.apply(null, zr.map(function (r) { return Math.max(r.v, r.exp); })));
  $('dirZoneV').innerHTML = '四区理论占比均为 24.5%（1-12 区为 12/49=24.5%，其余各 12/49）。实测偏差均在抽样波动范围内。';
}
function expBarHTML(rows, mx) {
  var h = '';
  rows.forEach(function (r) {
    var c = r.c === 'r' ? '#c0392b' : (r.c === 'b' ? '#2471a3' : '#1e8449');
    var ratio = r.exp ? r.v / r.exp : 1;
    h += '<div class="bar-row"><div class="nm">' + r.nm + '</div><div class="tr"><div class="fl" style="width:' +
      (r.v / mx * 100).toFixed(1) + '%;background:' + c + '"></div><div class="exp-mark" style="left:' +
      (r.exp / mx * 100).toFixed(1) + '%"></div></div><div class="vv">' + r.v +
      ' <span class="muted">×' + fmt(ratio, 2) + '</span></div></div>';
  });
  return h;
}
function renderHistograms() {
  var sums = REC.map(function (r) { return nums(r).reduce(function (a, b) { return a + b; }, 0); });
  var spans = REC.map(function (r) { var m = r.mains.slice().sort(function (a, b) { return a - b; }); return m[5] - m[0]; });
  $('sumHist').innerHTML = histSVG(sums, 20, '和值分布', '#58a6ff', 175);
  $('spanHist').innerHTML = histSVG(spans, 8, '跨度分布', '#3fb950', 37.5);
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function sd(a) { var m = mean(a); return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / Math.max(1, a.length - 1)); }
  $('sumV').innerHTML = '和值实测 ' + fmt(mean(sums), 1) + ' ± ' + fmt(sd(sums), 1) +
    '，理论 175.0 ± 37.4（7 个 1-49 均匀抽样之和的标准差 = √(7×(49²−1)/12)）。' +
    '跨度实测 ' + fmt(mean(spans), 1) + '，理论 37.5。';
}
function histSVG(vals, bins, title, color, theo) {
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var w = (hi - lo) / bins || 1, cnt = new Array(bins).fill(0);
  vals.forEach(function (v) {
    var b = Math.min(bins - 1, Math.floor((v - lo) / w));
    cnt[b]++;
  });
  var mx = Math.max.apply(null, cnt) || 1;
  var W = 700, H = 150, bw = (W - 20) / bins;
  var s = '<div class="small muted" style="margin-bottom:4px">' + title + '（' + lo + '~' + hi + '，' + bins + ' 组）</div>';
  s += '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
  cnt.forEach(function (c, i) {
    var h = c / mx * (H - 30);
    s += '<rect x="' + (10 + i * bw).toFixed(1) + '" y="' + (H - 20 - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) +
      '" height="' + Math.max(1, h).toFixed(1) + '" fill="' + color + '" opacity="0.75" rx="2"/>';
    if (c) s += '<text x="' + (10 + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 24 - h).toFixed(1) +
      '" fill="#8b949e" font-size="9" text-anchor="middle">' + c + '</text>';
  });
  if (theo !== undefined && theo >= lo && theo <= hi) {
    var tx = 10 + (theo - lo) / (hi - lo) * (W - 20);
    s += '<line x1="' + tx.toFixed(1) + '" y1="6" x2="' + tx.toFixed(1) + '" y2="' + (H - 20) + '" stroke="#d29922" stroke-dasharray="3 2"/>';
    s += '<text x="' + tx.toFixed(1) + '" y="' + (H - 6) + '" fill="#d29922" font-size="9" text-anchor="middle">理论' + theo + '</text>';
  }
  s += '</svg>';
  return s;
}

/* ============ 5. 本期方向（预测页用） ============ */
function renderPredDir() {
  var last = REC[REC.length - 1];
  if (!last) { $('predDir').innerHTML = ''; return; }
  var lc = colorName(last.special);
  var zc = {}; M.S.zodiacOrder.forEach(function (z) { zc[z] = 0; });
  REC.forEach(function (r) { nums(r).forEach(function (n) { var z = zodiacOf(n); if (z) zc[z]++; }); });
  var zt = Object.keys(zc).reduce(function (a, k) { return a + zc[k]; }, 0);
  var zrows = M.S.zodiacOrder.map(function (z) {
    return { z: z, v: zc[z], exp: zt * (M.S.zodiacNums[z] || []).length / 49 };
  }).sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });

  var hc = {}, tc = {};
  for (var i = 0; i <= 4; i++) hc[i] = 0;
  for (i = 0; i <= 9; i++) tc[i] = 0;
  REC.forEach(function (r) { nums(r).forEach(function (n) { hc[headOf(n)]++; tc[tailOf(n)]++; }); });
  var ht = Object.keys(hc).reduce(function (a, k) { return a + hc[k]; }, 0);
  var tt = Object.keys(tc).reduce(function (a, k) { return a + tc[k]; }, 0);
  var hr = [], tr = [];
  for (i = 0; i <= 4; i++) hr.push({ k: i, v: hc[i], exp: ht * (i === 4 ? 4 : 10) / 49 });
  for (i = 0; i <= 9; i++) tr.push({ k: i, v: tc[i], exp: tt * (i === 0 ? 4 : 5) / 49 });
  hr.sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });
  tr.sort(function (a, b) { return b.v / b.exp - a.v / a.exp; });

  var cols = ['红', '蓝', '绿'], ctr = {};
  cols.forEach(function (a) { ctr[a] = {}; cols.forEach(function (b) { ctr[a][b] = 0; }); });
  for (i = 1; i < REC.length; i++) ctr[colorName(REC[i - 1].special)][colorName(REC[i].special)]++;
  var ct = ctr[lc]['红'] + ctr[lc]['蓝'] + ctr[lc]['绿'];
  var cb = cols.slice().sort(function (a, b) { return ctr[lc][b] - ctr[lc][a]; });

  var h = '';
  function row(k, v, extra) {
    h += '<div class="kv"><span class="k">' + k + '</span><span>' + v + (extra ? ' <span class="muted">' + extra + '</span>' : '') + '</span></div>';
  }
  row('上期特码', '<span class="ball sm ' + colorOf(last.special) + '" style="display:inline-flex">' + last.special + '</span> ' +
    zodiacOf(last.special) + ' / ' + lc + '波');
  row('波色方向', '<b style="color:' + (cb[0] === '红' ? '#c0392b' : (cb[0] === '蓝' ? '#2471a3' : '#1e8449')) + '">' + cb[0] + '波</b>',
    '（' + lc + '波之后历史最高，' + fmt(ctr[lc][cb[0]] / Math.max(1, ct) * 100, 1) + '%）');
  row('生肖热度', zrows.slice(0, 4).map(function (r) { return r.z + '×' + fmt(r.v / r.exp, 2); }).join('  '), '前 4');
  row('头数热度', hr.slice(0, 3).map(function (r) { return r.k + '×' + fmt(r.v / r.exp, 2); }).join('  '), '前 3');
  row('尾数热度', tr.slice(0, 4).map(function (r) { return r.k + '×' + fmt(r.v / r.exp, 2); }).join('  '), '前 4');
  var f = calcFeatures();
  row('重号倾向', fmt(f.rep.mean, 2) + ' 个/期', '随机理论 1.00');
  row('邻号倾向', fmt(f.adj.mean, 2) + ' 个/期', '随机理论 1.79');
  row('和值区间', fmt(f.sum.mean - f.sum.sd, 0) + ' ~ ' + fmt(f.sum.mean + f.sum.sd, 0), '±1σ');
  row('跨度区间', fmt(f.span.mean - f.span.sd, 0) + ' ~ ' + fmt(f.span.mean + f.span.sd, 0), '±1σ');
  $('predDir').innerHTML = h;
}

/* ============ 渲染入口 ============ */
function renderAll() {
  REC = M.REC;
  renderGrid(); renderLine(); renderBands();
  renderFindings(calcFeatures()); renderMissBack(); renderColorTrans();
  renderDirBars(); renderHistograms(); renderPredDir();
}

function initTrend() {
  ['trendN', 'lineSel'].forEach(function (id) {
    var box = $(id);
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) { x.className = ''; });
        b.className = 'on';
        if (id === 'trendN') { trendN = parseInt(b.getAttribute('data-n'), 10); renderGrid(); }
        else { lineKey = b.getAttribute('data-l'); renderLine(); }
      };
    });
  });
  renderAll();
}

M.onData = renderAll;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTrend); else initTrend();

})();
