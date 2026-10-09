/* 六合智析 · 学术研究版 —— 统计模型 / 回测 / 显著性检验 */
(function () {
'use strict';

/* ===================== 常量与映射 ===================== */
var N = 49, NPICK = 7;
var S = window.SEED || { history: [], num2Zodiac: {}, wuxing: {}, zodiacOrder: [], red: [], blue: [] };
var N2Z = S.num2Zodiac || {}, WUX = S.wuxing || {}, ZORDER = S.zodiacOrder || [];
var REDS = {}, BLUES = {};
(S.red || []).forEach(function (n) { REDS[n] = 1; });
(S.blue || []).forEach(function (n) { BLUES[n] = 1; });

function colorOf(n) { return REDS[n] ? 'r' : (BLUES[n] ? 'b' : 'g'); }
function colorName(n) { return REDS[n] ? '红' : (BLUES[n] ? '蓝' : '绿'); }
function zodiacOf(n) { return N2Z[n] || ''; }
function wuxOf(n) { return WUX[n] || ''; }
function headOf(n) { return Math.floor(n / 10); }
function tailOf(n) { return n % 10; }

/* ===================== 数据层 ===================== */
var LS_REC = 'ms_user_records_v1';   // 用户录入/覆盖
var LS_DEL = 'ms_deleted_v1';        // 删除的期号

function loadLS(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

var USER = loadLS(LS_REC), DELS = loadLS(LS_DEL);

function allRecords() {
  var map = {};
  (S.history || []).forEach(function (r) { map[r.period] = r; });
  USER.forEach(function (r) { map[r.period] = r; });
  DELS.forEach(function (p) { delete map[p]; });
  var arr = Object.keys(map).map(function (k) { return map[k]; });
  arr.sort(function (a, b) { return a.period - b.period; });
  return arr;
}
function validRec(p, d, mains, sp) {
  if (!p || p < 0) return '期号无效';
  if (!d) return '日期不能为空';
  if (!mains || mains.length !== 6) return '正码需 6 个';
  if (new Set(mains).size !== 6) return '正码不能重复';
  if (mains.some(function (n) { return !(n >= 1 && n <= 49); })) return '正码需在 1-49';
  if (!(sp >= 1 && sp <= 49)) return '特码需在 1-49';
  if (mains.indexOf(sp) >= 0) return '特码不能与正码重复';
  return null;
}
function upsert(rec) {
  USER = USER.filter(function (r) { return r.period !== rec.period; });
  USER.push(rec); saveLS(LS_REC, USER);
  DELS = DELS.filter(function (p) { return p !== rec.period; }); saveLS(LS_DEL, DELS);
}
function removeRec(p) {
  USER = USER.filter(function (r) { return r.period !== p; }); saveLS(LS_REC, USER);
  if (DELS.indexOf(p) < 0) { DELS.push(p); saveLS(LS_DEL, DELS); }
}

/* ===================== 统计分布函数 ===================== */
function lgamma(x) {
  var g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; var a = 0.99999999999980993, t = x + 7.5;
  for (var i = 0; i < 8; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gammP(s, x) { /* 正则化下不完全 gamma P(s,x) */
  if (x <= 0) return 0;
  if (x < s + 1) {
    var ap = s, sum = 1 / s, del = sum;
    for (var n = 1; n < 10000; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - lgamma(s));
  }
  var b = x + 1 - s, c = 1e300, d = 1 / b, h = d, i2;
  for (var i = 1; i < 10000; i++) {
    var an = -i * (i - s);
    b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; var de = d * c; h *= de;
    if (Math.abs(de - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - lgamma(s)) * h;
}
function chi2P(x, k) { return 1 - gammP(k / 2, x / 2); }        // 上尾概率
function erf(x) {
  var s = x < 0 ? -1 : 1; x = Math.abs(x);
  var t = 1 / (1 + 0.3275911 * x);
  var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function normP2(z) { return 2 * (1 - normCdf(Math.abs(z))); }   // 双尾

function logC(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }
function hyperP(k, K, n) { /* N=49 中 K 个有效，抽 n 个，命中 k 的概率 */
  if (k < 0 || k > K || n - k < 0 || n - k > N - K) return 0;
  return Math.exp(logC(K, k) + logC(N - K, n - k) - logC(N, n));
}

/* ===================== 描述统计 ===================== */
function freqOf(recs) {
  var f = new Array(50).fill(0);
  recs.forEach(function (r) { r.mains.concat([r.special]).forEach(function (n) { f[n]++; }); });
  return f;
}
function missOf(recs) { /* 遗漏值：只在最后一个连续段内计算 */
  var last = new Array(50).fill(-1);
  recs.forEach(function (r, i) { r.mains.concat([r.special]).forEach(function (n) { last[n] = i; }); });
  var m = new Array(50).fill(0), n = recs.length;
  for (var k = 1; k <= 49; k++) m[k] = last[k] === -1 ? n : n - 1 - last[k];
  return m;
}
function gapsOf(recs) {
  var g = [];
  for (var i = 1; i < recs.length; i++) {
    if (recs[i].period - recs[i - 1].period > 1) g.push([recs[i - 1].period + 1, recs[i].period - 1]);
  }
  return g;
}
function chi2Fit(recs) {
  var f = freqOf(recs), n = recs.length, exp = n * NPICK / N, x = 0;
  for (var k = 1; k <= 49; k++) { var d = f[k] - exp; x += d * d / exp; }
  return { chi2: x, df: 48, p: chi2P(x, 48), exp: exp, freq: f };
}
function runsTest(recs) { /* 对「特码大小」序列做游程检验 */
  var seq = recs.map(function (r) { return r.special > 24.5 ? 1 : 0; });
  var n1 = seq.filter(function (v) { return v === 1; }).length, n0 = seq.length - n1;
  if (!n1 || !n0) return { z: 0, p: 1 };
  var runs = 1;
  for (var i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
  var mu = 2 * n1 * n0 / (n1 + n0) + 1;
  var va = (2 * n1 * n0 * (2 * n1 * n0 - n1 - n0)) / ((n1 + n0) * (n1 + n0) * (n1 + n0 - 1));
  var z = (runs - mu) / Math.sqrt(va);
  return { runs: runs, mu: mu, z: z, p: normP2(z) };
}
function autocorr(recs, lag) { /* 特码序列一阶自相关 */
  var xs = recs.map(function (r) { return r.special; }), n = xs.length;
  if (n <= lag + 2) return 0;
  var m = xs.reduce(function (a, b) { return a + b; }, 0) / n, num = 0, den = 0;
  for (var i = 0; i < n; i++) den += (xs[i] - m) * (xs[i] - m);
  for (var j = 0; j + lag < n; j++) num += (xs[j] - m) * (xs[j + lag] - m);
  return den === 0 ? 0 : num / den;
}

/* ===================== 预测模型 ===================== */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var rndState = 20261009;
function rnd() { rndState = (rndState * 1103515245 + 12345) & 0x7fffffff; return rndState / 0x7fffffff; }

/* 固定种子保证回测可复现；「重新抽样」按钮可手动换种子 */
var UNIFORM_SEED = 20261009;
var MODELS = {
  uniform: {
    name: '均匀随机基线', short: '随机',
    desc: '49 个号码等概率随机抽样（种子固定，结果可复现）。作为对照基准：任何模型若不能显著优于它，即视为无预测力。',
    score: function (train) {
      var f = new Array(50).fill(0), r = mulberry32(UNIFORM_SEED);
      for (var k = 1; k <= 49; k++) f[k] = r();
      return f;
    }
  },
  freq: {
    name: '全局频次加权', short: '频次',
    desc: '按训练窗口内各号码出现总次数打分，假设「历史出现多的更可能再出现」（热号策略）。',
    score: function (train) {
      var f = freqOf(train); return f;
    }
  },
  ewma: {
    name: '近期指数加权 (λ=0.97)', short: 'EWMA',
    desc: '对历史频次做指数衰减加权，近期权重更高。经典时间序列平滑方法。',
    score: function (train) {
      var f = new Array(50).fill(0), L = 0.97, n = train.length;
      train.forEach(function (r, i) {
        var w = Math.pow(L, n - 1 - i);
        r.mains.concat([r.special]).forEach(function (x) { f[x] += w; });
      });
      return f;
    }
  },
  miss: {
    name: '遗漏值倒序（冷号）', short: '遗漏',
    desc: '按当前遗漏期数打分，遗漏越久分越高。假设「久未开出更可能开出」（赌徒谬误型策略）。',
    score: function (train) {
      return missOf(train);
    }
  },
  hot10: {
    name: '近 10 期热度', short: '热度',
    desc: '只统计最近 10 期出现次数，短窗口动量策略。',
    score: function (train) {
      return freqOf(train.slice(-10));
    }
  },
  markov: {
    name: '一阶马尔可夫转移', short: '马尔可夫',
    desc: '统计「上一期开出 a 时，下一期开出 b」的条件频次，以上一期号码为状态做转移打分。序列建模方法。',
    score: function (train) {
      var T = [], i, j;
      for (i = 0; i <= 49; i++) { T[i] = new Array(50).fill(0); }
      for (i = 1; i < train.length; i++) {
        var prev = train[i - 1].mains.concat([train[i - 1].special]);
        var cur = train[i].mains.concat([train[i].special]);
        prev.forEach(function (a) { cur.forEach(function (b) { T[a][b]++; }); });
      }
      var f = new Array(50).fill(0);
      if (train.length) {
        var lastS = train[train.length - 1].mains.concat([train[train.length - 1].special]);
        for (j = 1; j <= 49; j++) {
          var s = 0; lastS.forEach(function (a) { s += T[a][j]; });
          f[j] = s;
        }
      }
      return f;
    }
  }
};

function topK(score, k) {
  var arr = [];
  for (var n = 1; n <= 49; n++) arr.push({ n: n, s: score[n] });
  arr.sort(function (a, b) { return b.s - a.s || a.n - b.n; });
  return arr.slice(0, k).map(function (x) { return x.n; });
}

/* ===================== 回测 ===================== */
var _pool = new Array(49);
function drawNums(count, rng) { /* 从 1..49 抽 count 个不重复（复用数组，避免高频 GC） */
  var i, out = [];
  for (i = 0; i < 49; i++) _pool[i] = i + 1;
  for (i = 0; i < count; i++) {
    var j = i + Math.floor(rng() * (49 - i));
    var t = _pool[i]; _pool[i] = _pool[j]; _pool[j] = t;
    out.push(_pool[i]);
  }
  return out;
}
function runBacktest(recs, modelKey, startIdx, K, simN) {
  var model = MODELS[modelKey], hits = [], i;
  for (i = startIdx; i < recs.length; i++) {
    var train = recs.slice(Math.max(0, i - winSize()), i);
    var sc = model.score(train);
    var pick = topK(sc, K);
    var actual = recs[i].mains.concat([recs[i].special]);
    var h = pick.filter(function (n) { return actual.indexOf(n) >= 0; }).length;
    hits.push({ period: recs[i].period, hit: h, pick: pick, actual: actual });
  }
  var n = hits.length, tot = 0;
  hits.forEach(function (x) { tot += x.hit; });
  var mean = n ? tot / n : 0;
  var va = 0; hits.forEach(function (x) { va += (x.hit - mean) * (x.hit - mean); });
  var sd = n > 1 ? Math.sqrt(va / (n - 1)) : 0;

  /* 随机基线蒙特卡洛：每次模拟对全部期各随机抽 K 码，求平均命中 */
  var rng = mulberry32(12345), baseMeans = [], bTot = 0;
  for (var s = 0; s < simN; s++) {
    var t = 0;
    for (i = startIdx; i < recs.length; i++) {
      var pk = drawNums(K, rng);
      var ac = recs[i].mains.concat([recs[i].special]);
      for (var q = 0; q < K; q++) if (ac.indexOf(pk[q]) >= 0) t++;
    }
    var mm = t / n; baseMeans.push(mm); bTot += mm;
  }
  var baseMean = bTot / simN;
  baseMeans.sort(function (a, b) { return a - b; });
  var ge = 0;
  for (i = 0; i < simN; i++) if (baseMeans[i] >= mean - 1e-12) ge++;
  var p = (ge + 1) / (simN + 1);
  return {
    model: modelKey, name: model.name, n: n, mean: mean, sd: sd, total: tot,
    baseMean: baseMean, p: p, hits: hits,
    best: hits.reduce(function (a, b) { return b.hit > a.hit ? b : a; }, { hit: -1, period: 0 }),
    theory: K * NPICK / N
  };
}

/* ===================== DOM 工具 ===================== */
function $(id) { return document.getElementById(id); }
function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}
function ballHTML(n, cls) {
  var c = 'ball ' + colorOf(n) + (cls ? ' ' + cls : '');
  return '<div class="' + c + '">' + n + '</div>';
}
function ballRow(nums, cls) {
  var h = '<div class="balls">';
  nums.forEach(function (n) { h += ballHTML(n, cls); });
  return h + '</div>';
}
function pText(p) {
  if (p <= 0) return '<1e-15';
  if (p < 1e-6) return p.toExponential(1);
  return p.toFixed(4);
}
function fmt(x, d) { return (Math.round(x * Math.pow(10, d || 2)) / Math.pow(10, d || 2)).toFixed(d === undefined ? 2 : d); }

/* ===================== 状态 ===================== */
var REC = allRecords();
var curK = 7;
function winSize() { var v = parseInt($('winSize').value, 10); return isNaN(v) ? 60 : v; }

/* ===================== 本期预测 ===================== */
function initModels() {
  var sel = $('modelSel'), h = '';
  Object.keys(MODELS).forEach(function (k) {
    h += '<option value="' + k + '">' + MODELS[k].name + '</option>';
  });
  sel.innerHTML = h; sel.value = 'markov';
  sel.onchange = function () { $('modelDesc').textContent = MODELS[sel.value].desc; };
  $('modelDesc').textContent = MODELS[sel.value].desc;

  Array.prototype.forEach.call(document.querySelectorAll('#kSel button'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('#kSel button'), function (x) { x.className = ''; });
      b.className = 'on'; curK = parseInt(b.getAttribute('data-k'), 10); predict();
    };
  });
  $('btnPredict').onclick = predict;
  $('btnReroll').onclick = function () {
    UNIFORM_SEED = (UNIFORM_SEED * 7919 + 104729) & 0x7fffffff;
    if ($('modelSel').value === 'uniform') predict(); else { $('modelSel').value = 'uniform'; $('modelDesc').textContent = MODELS.uniform.desc; predict(); }
  };
}

var lastPred = null;
function predict() {
  var key = $('modelSel').value, model = MODELS[key];
  var train = REC.slice(Math.max(0, REC.length - winSize()));
  var sc = model.score(train);
  var pick = topK(sc, curK).sort(function (a, b) { return a - b; });
  lastPred = { key: key, pick: pick, score: sc, train: train.length };
  renderPred(pick, sc, key);
}
function renderPred(pick, sc, key) {
  var model = MODELS[key];
  $('predMeta').textContent = '第 ' + (REC.length ? REC[REC.length - 1].period + 1 : 1) + ' 期 · ' + model.name +
    ' · 训练 ' + lastPred.train + ' 期' + (key === 'uniform' ? ' · 种子 ' + UNIFORM_SEED : '');
  $('predBalls').innerHTML = ballRow(pick);
  var K = pick.length, exp = K * NPICK / N;
  $('predCov').textContent = fmt(K / N * 100, 1) + '%';
  $('predExp').textContent = fmt(exp, 2);
  /* 95% 区间：用超几何分布累积求区间 */
  var lo = 0, hi = K, cum = 0;
  var probs = [];
  for (var k = 0; k <= Math.min(K, NPICK); k++) { var pv = hyperP(k, NPICK, K); probs.push(pv); }
  var cl = 0; for (k = 0; k < probs.length; k++) { if (cl + probs[k] > 0.025) { lo = k; break; } cl += probs[k]; }
  cl = 0; for (k = 0; k < probs.length; k++) { if (cl + probs[k] > 0.975) { hi = k; break; } cl += probs[k]; }
  $('predCI').textContent = lo + ' ~ ' + hi;

  var lastBt = window.__bt && window.__bt[key] ? window.__bt[key] : null;
  var vh = '';
  if (lastBt) {
    var sig = lastBt.p < 0.05;
    vh = '<div class="verdict ' + (sig ? 'sig' : 'ns') + '"><b>' +
      (sig ? '该模型回测显著优于随机 (p=' + pText(lastBt.p) + ')' : '回测未显著优于随机 (p=' + pText(lastBt.p) + ')') +
      '</b>回测 ' + lastBt.n + ' 期，平均命中 ' + fmt(lastBt.mean, 3) + '，随机基线 ' + fmt(lastBt.baseMean, 3) +
      '，理论期望 ' + fmt(lastBt.theory, 3) + '。</div>';
  } else {
    vh = '<div class="warn small">尚未运行回测，无法判断该模型是否优于随机。前往「回测验证」页运行一次即可显示 p 值。</div>';
  }
  $('predVerdict').innerHTML = vh;

  var arr = [];
  for (var n = 1; n <= 49; n++) arr.push({ n: n, s: sc[n] });
  arr.sort(function (a, b) { return b.s - a.s; });
  var missT = missOf(REC);
  var rows = '';
  arr.slice(0, 15).forEach(function (x, i) {
    rows += '<tr><td class="num">' + (i + 1) + '</td><td>' + ballHTML(x.n, 'sm') +
      '</td><td>' + zodiacOf(x.n) + ' / ' + colorName(x.n) + ' / ' + wuxOf(x.n) +
      '</td><td class="num">' + fmt(x.s, 3) + '</td><td class="num">' + missT[x.n] + '</td></tr>';
  });
  $('scoreList').innerHTML = '<table><thead><tr><th class="num">#</th><th>号码</th><th>生肖/波色/五行</th><th class="num">分数</th><th class="num">遗漏</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ===================== 回测页 ===================== */
function runAllBacktest() {
  var startIdx = parseInt($('btStart').value, 10) || 30;
  var simN = parseInt($('btSim').value, 10) || 2000;
  if (startIdx >= REC.length - 2) { $('btStatus').textContent = '起始期太大，可回测期数不足'; return; }
  $('btStatus').textContent = '正在回测 ' + Object.keys(MODELS).length + ' 个模型，共 ' + (REC.length - startIdx) + ' 期 × ' + simN + ' 次蒙特卡洛…';
  setTimeout(function () {
    var res = {};
    Object.keys(MODELS).forEach(function (k) { res[k] = runBacktest(REC, k, startIdx, curK, simN); });
    window.__bt = res;
    renderBT(res, curK);
    $('btStatus').textContent = '回测完成：' + (REC.length - startIdx) + ' 期，码数 ' + curK + '，蒙特卡洛 ' + simN + ' 次。';
    predict();
  }, 30);
}
function renderBT(res, K) {
  var tb = $('btTable').querySelector('tbody'), rows = '';
  Object.keys(res).forEach(function (k) {
    var r = res[k], sig = r.p < 0.05;
    rows += '<tr><td>' + r.name + '</td><td class="num">' + fmt(r.mean, 3) + '</td><td class="num">' +
      fmt(r.baseMean, 3) + '</td><td class="num">' + pText(r.p) + '</td><td>' +
      '<span style="color:' + (sig ? '#7ee787' : '#e3b341') + '">' + (sig ? '显著' : '不显著') + '</span></td></tr>';
  });
  tb.innerHTML = rows;

  var sigs = Object.keys(res).filter(function (k) { return res[k].p < 0.05; });
  var vh;
  if (sigs.length === 0) {
    vh = '<div class="verdict ns"><b>结论：全部模型均未显著优于随机基线</b>' +
      '在 α=0.05 水平下，' + Object.keys(res).length + ' 个模型的平均命中率与「随机抽 ' + K +
      ' 码」无统计差异。这与「开奖为独立随机事件」的假设一致——历史信息不携带可用于预测下一期的信号。' +
      '该结果本身即为有效的学术研究结论。</div>';
  } else {
    vh = '<div class="verdict sig"><b>发现 ' + sigs.length + ' 个模型 p&lt;0.05</b>' +
      '注意：同时检验多个模型时存在多重比较问题，建议用 Bonferroni 校正（α/m=' +
      fmt(0.05 / Object.keys(res).length, 4) + '）后重新判定。</div>';
  }
  $('btVerdict').innerHTML = vh;

  var cur = res[$('modelSel').value] || res[Object.keys(res)[0]];
  drawChart(cur);
  $('btN').textContent = cur.n;
  $('btTot').textContent = cur.total;
  $('btBest').textContent = cur.best.hit + ' (' + cur.best.period + ')';
  $('btSd').textContent = fmt(cur.sd, 3);
  renderRecent(cur);
  renderDist(cur, K);
}
function renderRecent(r) {
  var rows = '', list = r.hits.slice(-15);
  list.forEach(function (x) {
    var picked = '<div class="balls">';
    x.pick.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
      var on = x.actual.indexOf(n) >= 0;
      picked += ballHTML(n, 'sm' + (on ? '' : ' out'));
    });
    picked += '</div>';
    var act = '<div class="balls">';
    x.actual.slice().sort(function (a, b) { return a - b; }).forEach(function (n) { act += ballHTML(n, 'sm'); });
    act += '</div>';
    rows += '<tr><td class="num">' + x.period + '</td><td>' + picked + '</td><td>' + act +
      '</td><td class="num"><b style="color:' + (x.hit >= 3 ? '#58a6ff' : (x.hit >= 2 ? '#3fb950' : '#8b949e')) +
      '">' + x.hit + '</b></td></tr>';
  });
  $('btRecent').innerHTML = '<table><thead><tr><th class="num">期号</th><th>模型预测（灰色=未中）</th><th>实际开奖</th><th class="num">命中</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
}
function drawChart(r) {
  var W = 700, H = 180, pad = 22, n = r.hits.length;
  if (!n) { $('btChart').innerHTML = ''; return; }
  var maxH = Math.max(2, Math.max.apply(null, r.hits.map(function (x) { return x.hit; })));
  var bw = Math.max(2, (W - pad * 2) / n - 1);
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
  s += '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#30363d"/>';
  var yb = H - pad - (r.baseMean / maxH) * (H - pad * 2);
  s += '<line x1="' + pad + '" y1="' + yb + '" x2="' + (W - pad) + '" y2="' + yb + '" stroke="#d29922" stroke-dasharray="4 3"/>';
  r.hits.forEach(function (x, i) {
    var h = (x.hit / maxH) * (H - pad * 2);
    var x0 = pad + i * ((W - pad * 2) / n);
    s += '<rect x="' + x0 + '" y="' + (H - pad - h) + '" width="' + bw + '" height="' + Math.max(1, h) +
      '" fill="' + (x.hit >= 3 ? '#58a6ff' : (x.hit >= 2 ? '#3fb950' : '#30363d')) + '" rx="1"/>';
  });
  s += '</svg>';
  s += '<div class="small muted" style="margin-top:4px">每根柱为一期命中数（0-' + maxH + '），黄色虚线为随机基线均值 ' +
    fmt(r.baseMean, 3) + '。</div>';
  $('btChart').innerHTML = s;
}
function renderDist(r, K) {
  var cnt = {}, i;
  for (i = 0; i <= NPICK; i++) cnt[i] = 0;
  r.hits.forEach(function (x) { cnt[x.hit]++; });
  var rows = '', chi = 0, used = 0;
  for (i = 0; i <= Math.min(K, NPICK); i++) {
    var pv = hyperP(i, NPICK, K), ex = pv * r.n;
    rows += '<tr><td class="num">' + i + '</td><td class="num">' + cnt[i] + '</td><td class="num">' +
      fmt(ex, 2) + '</td><td class="num">' + fmt(pv * 100, 2) + '%</td></tr>';
    if (ex >= 5) { chi += Math.pow(cnt[i] - ex, 2) / ex; used++; }
  }
  $('distTable').querySelector('tbody').innerHTML = rows;
  var df = Math.max(1, used - 1), p = chi2P(chi, df);
  $('distVerdict').innerHTML = '<div class="verdict ' + (p < 0.05 ? 'sig' : 'ns') + '"><b>命中数分布拟合检验 χ²=' +
    fmt(chi, 3) + '，df=' + df + '，p=' + pText(p) + '</b>' +
    (p < 0.05 ? '实测命中分布偏离超几何理论分布，需进一步核查模型实现或数据。'
      : '实测命中分布与「随机抽样」的理论分布无显著差异，说明该模型的命中表现可由随机性完全解释。') + '</div>';
}

/* ===================== 统计分析页 ===================== */
function renderStats() {
  var c = chi2Fit(REC);
  $('stChi').textContent = fmt(c.chi2, 2);
  var p = c.p;
  $('stP').textContent = pText(p);
  var vh = p < 0.05
    ? '<div class="verdict sig"><b>拒绝原假设：号码分布不均匀</b>χ²=' + fmt(c.chi2, 2) + ' &gt; 临界值 65.17，p=' + pText(p) +
    '。样本量有限时该结果常见于抽样波动，建议增大样本或换用更长期数据复核。</div>'
    : '<div class="verdict ns"><b>不能拒绝原假设：未发现不均匀证据</b>χ²=' + fmt(c.chi2, 2) + ' &lt; 临界值 65.17，p=' + pText(p) +
    '。当前样本下各号码出现频次与均匀分布一致，支持「等概率随机」假设。</div>';
  $('stVerdict').innerHTML = vh;

  var rt = runsTest(REC);
  $('stRuns').textContent = fmt(rt.z, 3);
  $('stRunsP').textContent = pText(rt.p);
  var ac = autocorr(REC, 1), lim = 1.96 / Math.sqrt(REC.length);
  $('stAc').textContent = fmt(ac, 4);
  $('stAcV').textContent = (Math.abs(ac) > lim ? '超出 ±' + fmt(lim, 3) : '在 ±' + fmt(lim, 3) + ' 内');

  var miss = missOf(REC);
  /* 热力图 */
  var mx = 0; for (var i = 1; i <= 49; i++) mx = Math.max(mx, c.freq[i]);
  var h = '';
  for (i = 1; i <= 49; i++) {
    var t = mx ? c.freq[i] / mx : 0;
    var bg = colorOf(i) === 'r' ? '201,57,43' : (colorOf(i) === 'b' ? '36,113,163' : '30,132,73');
    h += '<div class="g49" style="background:rgba(' + bg + ',' + (0.25 + 0.75 * t).toFixed(2) + ');position:relative">' +
      i + '<div style="position:absolute;bottom:2px;left:0;right:0;font-size:8px;color:#fff;opacity:.9">' + c.freq[i] + '</div></div>';
  }
  $('heat').innerHTML = h;

  /* 遗漏 TOP10 */
  var arr = []; for (i = 1; i <= 49; i++) arr.push({ n: i, m: miss[i] });
  arr.sort(function (a, b) { return b.m - a.m; });
  $('missBars').innerHTML = barHTML(arr.slice(0, 10).map(function (x) {
    return { nm: x.n + ' ' + zodiacOf(x.n), v: x.m, c: colorOf(x.n) };
  }), arr[0].m, '期');
  var g = gapsOf(REC);
  $('missNote').innerHTML = g.length
    ? '⚠️ 检测到期号缺口：' + g.map(function (x) { return x[0] === x[1] ? x[0] : x[0] + '-' + x[1]; }).join('、') +
    ' 期。遗漏值仅在最后一个连续段内计算，缺口前的记录不参与遗漏统计，避免系统性高估。'
    : '期号连续，无缺口。遗漏值基于全部 ' + REC.length + ' 期计算。';

  /* 波色 */
  var col = { '红': 0, '蓝': 0, '绿': 0 };
  REC.forEach(function (r) { r.mains.concat([r.special]).forEach(function (n) { col[colorName(n)]++; }); });
  var totC = col['红'] + col['蓝'] + col['绿'];
  var expC = { '红': totC * 17 / 49, '蓝': totC * 16 / 49, '绿': totC * 16 / 49 };
  $('colorBars').innerHTML = expBarHTML([
    { nm: '红波 (17)', v: col['红'], exp: expC['红'], c: 'r' },
    { nm: '蓝波 (16)', v: col['蓝'], exp: expC['蓝'], c: 'b' },
    { nm: '绿波 (16)', v: col['绿'], exp: expC['绿'], c: 'g' }
  ]);

  /* 生肖 */
  var zc = {}; ZORDER.forEach(function (z) { zc[z] = 0; });
  REC.forEach(function (r) { r.mains.concat([r.special]).forEach(function (n) { var z = zodiacOf(n); if (z) zc[z]++; }); });
  var ztot = Object.keys(zc).reduce(function (a, k) { return a + zc[k]; }, 0);
  var zrows = ZORDER.map(function (z) {
    var cntNums = (S.zodiacNums && S.zodiacNums[z]) ? S.zodiacNums[z].length : 4;
    return { nm: z, v: zc[z], exp: ztot * cntNums / 49, c: 'b' };
  });
  $('zodiacBars').innerHTML = expBarHTML(zrows);

  /* 头尾 */
  var hc = {}, tc = {};
  for (i = 0; i <= 4; i++) { hc[i] = 0; }
  for (i = 0; i <= 9; i++) { tc[i] = 0; }
  REC.forEach(function (r) { r.mains.concat([r.special]).forEach(function (n) { hc[headOf(n)]++; tc[tailOf(n)]++; }); });
  var ht = Object.keys(hc).reduce(function (a, k) { return a + hc[k]; }, 0);
  var tt = Object.keys(tc).reduce(function (a, k) { return a + tc[k]; }, 0);
  var hrows = [], trows = [];
  [0, 1, 2, 3, 4].forEach(function (k) { hrows.push({ nm: '头 ' + k, v: hc[k], exp: ht * (k === 4 ? 4 : 10) / 49, c: 'r' }); });
  for (i = 0; i <= 9; i++) trows.push({ nm: '尾 ' + i, v: tc[i], exp: tt * (i === 0 ? 4 : 5) / 49, c: 'g' });
  $('headBars').innerHTML = expBarHTML(hrows);
  $('tailBars').innerHTML = expBarHTML(trows);
}
function barHTML(rows, maxV, unit) {
  var mx = maxV || Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
  var h = '';
  rows.forEach(function (r) {
    var c = r.c === 'r' ? '#c0392b' : (r.c === 'b' ? '#2471a3' : '#1e8449');
    h += '<div class="bar-row"><div class="nm">' + r.nm + '</div><div class="tr"><div class="fl" style="width:' +
      (r.v / mx * 100).toFixed(1) + '%;background:' + c + '"></div></div><div class="vv">' + r.v + (unit || '') + '</div></div>';
  });
  return h;
}
function expBarHTML(rows) {
  var mx = Math.max.apply(null, rows.map(function (r) { return Math.max(r.v, r.exp); })) || 1;
  var h = '';
  rows.forEach(function (r) {
    var c = r.c === 'r' ? '#c0392b' : (r.c === 'b' ? '#2471a3' : '#1e8449');
    h += '<div class="bar-row"><div class="nm">' + r.nm + '</div><div class="tr"><div class="fl" style="width:' +
      (r.v / mx * 100).toFixed(1) + '%;background:' + c + '"></div><div class="exp-mark" style="left:' +
      (r.exp / mx * 100).toFixed(1) + '%"></div></div><div class="vv">' + r.v + ' <span class="muted">/' + fmt(r.exp, 1) + '</span></div></div>';
  });
  return h;
}

/* ===================== 记录页 ===================== */
function renderRecords() {
  $('recMeta').textContent = '共 ' + REC.length + ' 期 · 本地录入 ' + USER.length + ' 条';
  var issues = [], per = REC.map(function (r) { return r.period; }), seen = {};
  REC.forEach(function (r) {
    var all = r.mains.concat([r.special]);
    if (r.mains.length !== 6) issues.push(r.period + ' 期：正码数量异常');
    if (new Set(r.mains).size !== r.mains.length) issues.push(r.period + ' 期：正码重复');
    if (all.some(function (n) { return !(n >= 1 && n <= 49); })) issues.push(r.period + ' 期：号码越界');
    if (r.mains.indexOf(r.special) >= 0) issues.push(r.period + ' 期：特码与正码重复');
    if (seen[r.period]) issues.push(r.period + ' 期：期号重复');
    seen[r.period] = 1;
  });
  var g = gapsOf(REC);
  var h = '<div class="kv"><span class="k">期号范围</span><span>' + per[0] + ' ~ ' + per[per.length - 1] + '</span></div>' +
    '<div class="kv"><span class="k">期号缺口</span><span>' + (g.length ? g.map(function (x) { return x[0] === x[1] ? x[0] : x[0] + '-' + x[1]; }).join('、') + ' 期（' + g.reduce(function (a, x) { return a + (x[1] - x[0] + 1); }, 0) + ' 期缺失）' : '无') + '</span></div>' +
    '<div class="kv"><span class="k">格式校验</span><span>' + (issues.length ? issues.length + ' 处异常' : '全部通过') + '</span></div>';
  if (issues.length) h += '<div class="warn small">' + issues.slice(0, 8).join('<br>') + '</div>';
  if (g.length) h += '<div class="note small">缺口期无法从源站补回（源站仅保留最近 5 期且无历史接口）。若你手上有这些期号的号码，用「录入开奖」手动补录即可。</div>';
  $('health').innerHTML = h;

  var lh = '';
  REC.slice().reverse().slice(0, 200).forEach(function (r) {
    var bs = '<div class="bs">';
    r.mains.forEach(function (n) { bs += ballHTML(n, 'sm'); });
    bs += ballHTML(r.special, 'sm spec');
    bs += '</div>';
    lh += '<div class="rec" data-p="' + r.period + '"><div class="p">' + r.period + ' 期</div><div class="d">' +
      r.date + '</div>' + bs +
      '<div class="op"><button class="btn sm" data-edit="' + r.period + '">编辑</button>' +
      '<button class="btn sm d" data-del="' + r.period + '">删除</button></div></div>';
  });
  $('recList').innerHTML = lh;
  Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
    b.onclick = function () { openModal(parseInt(b.getAttribute('data-edit'), 10)); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
    b.onclick = function () {
      var p = parseInt(b.getAttribute('data-del'), 10);
      if (confirm('确认删除第 ' + p + ' 期？')) { removeRec(p); refresh(); }
    };
  });
}

/* 弹窗 */
var editing = null;
function openModal(p) {
  editing = p;
  var rec = null;
  REC.forEach(function (r) { if (r.period === p) rec = r; });
  $('mTitle').textContent = rec ? '编辑第 ' + p + ' 期' : '录入开奖';
  $('mPeriod').value = rec ? rec.period : (per0());
  $('mDate').value = rec ? rec.date : new Date().toISOString().slice(0, 10);
  var mh = '';
  for (var i = 0; i < 6; i++) {
    mh += '<input type="number" class="mm" value="' + (rec ? rec.mains[i] : '') + '" min="1" max="49">';
  }
  $('mMains').innerHTML = mh;
  $('mSpec').value = rec ? rec.special : '';
  $('mDel').className = rec ? 'btn d' : 'btn d hide';
  $('mErr').className = 'warn hide';
  $('mask').className = 'mask on';
}
function per0() { return REC.length ? REC[REC.length - 1].period + 1 : 1; }
function closeModal() { $('mask').className = 'mask'; }
function saveModal() {
  var p = parseInt($('mPeriod').value, 10);
  var d = $('mDate').value;
  var mains = Array.prototype.map.call(document.querySelectorAll('#mMains input'), function (i) { return parseInt(i.value, 10) || 0; });
  var sp = parseInt($('mSpec').value, 10);
  var err = validRec(p, d, mains, sp);
  var e = $('mErr');
  if (err) { e.textContent = err; e.className = 'warn'; return; }
  upsert({ period: p, date: d, mains: mains.slice().sort(function (a, b) { return a - b; }), special: sp });
  closeModal(); refresh();
}

/* ===================== 刷新 ===================== */
function refresh() {
  REC = allRecords();
  $('topCount').textContent = REC.length;
  $('topLast').textContent = REC.length ? REC[REC.length - 1].period + ' 期' : '-';
  predict(); renderStats(); renderRecords();
}

/* ===================== 事件绑定 ===================== */
function initTabs() {
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.className = 'tab'; });
      t.className = 'tab on';
      Array.prototype.forEach.call(document.querySelectorAll('section'), function (s) { s.className = 'hide'; });
      $('tab-' + t.getAttribute('data-tab')).className = '';
    };
  });
}
function initRecordBtns() {
  $('btnAdd').onclick = function () { openModal(null); };
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = saveModal;
  $('mDel').onclick = function () {
    if (editing && confirm('确认删除第 ' + editing + ' 期？')) { removeRec(editing); closeModal(); refresh(); }
  };
  $('mask').onclick = function (ev) { if (ev.target === $('mask')) closeModal(); };
  $('btnSync').onclick = function () {
    $('recStatus').textContent = '正在检查更新…';
    fetch('history.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!Array.isArray(d)) throw new Error('格式错误');
        var before = REC.length;
        S.history = d;
        REC = allRecords();
        $('recStatus').innerHTML = '<span style="color:#7ee787">已同步：远程 ' + d.length + ' 期，合并后库内 ' +
          REC.length + ' 期（原 ' + before + ' 期）</span>';
        $('topCount').textContent = REC.length;
        $('topLast').textContent = REC[REC.length - 1].period + ' 期';
        predict(); renderStats(); renderRecords();
      })
      .catch(function (e) { $('recStatus').textContent = '同步失败：' + e.message + '（离线时属正常）'; });
  };
  $('btnExport').onclick = function () {
    var blob = new Blob([JSON.stringify(REC, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marksix-history-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  };
  $('btnImport').onclick = function () { $('fileIn').click(); };
  $('fileIn').onchange = function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!Array.isArray(d)) throw new Error('需为数组');
        var cnt = 0;
        d.forEach(function (r) {
          if (validRec(r.period, r.date, r.mains, r.special) === null) { upsert(r); cnt++; }
        });
        $('recStatus').innerHTML = '<span style="color:#7ee787">导入成功 ' + cnt + ' 条</span>';
        refresh();
      } catch (e) { $('recStatus').textContent = '导入失败：' + e.message; }
    };
    fr.readAsText(f);
    ev.target.value = '';
  };
  $('btnClear').onclick = function () {
    if (confirm('清空本地录入与删除标记？内置数据不受影响。')) {
      USER = []; DELS = []; saveLS(LS_REC, USER); saveLS(LS_DEL, DELS); refresh();
    }
  };
  $('btnBacktest').onclick = runAllBacktest;
  $('winSize').onchange = predict;
  $('modelSel').onchange = function () {
    $('modelDesc').textContent = MODELS[this.value].desc;
    predict();
    if (window.__bt) renderBT(window.__bt, curK);
  };
}

/* ===================== 启动 ===================== */
function boot() {
  initModels(); initTabs(); initRecordBtns();
  $('topCount').textContent = REC.length;
  $('topLast').textContent = REC.length ? REC[REC.length - 1].period + ' 期' : '-';
  $('footSrc').textContent = '内置数据 ' + (S.history || []).length + ' 期 · 更新于 ' + (S.updated || '-') +
    ' · 源站 amkkjj.com';
  predict(); renderStats(); renderRecords();
  setTimeout(autoBacktest, 300);
}
function autoBacktest() {
  try {
    $('btStatus').textContent = '首次自动回测中…';
    runAllBacktest();
  } catch (e) {
    $('btStatus').textContent = '自动回测跳过：' + e.message;
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})();
