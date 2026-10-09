/* 在 Node 中模拟最小 DOM，真实执行 app.js，验证运行时与统计数值 */
const fs = require('fs');
const vm = require('vm');

function fakeEl(id) {
  const e = {
    id, textContent: '', innerHTML: '', className: '',
    value: (id === 'winSize' ? '60' : (id === 'btStart' ? '30' : (id === 'btSim' ? '2000' : ''))),
    style: {}, files: [],
    onclick: null, onchange: null,
    getAttribute(k) { return this['_attr_' + k] || null; },
    setAttribute(k, v) { this['_attr_' + k] = v; },
    addEventListener() {},
    querySelector() { return fakeEl(id + '-q'); },
    querySelectorAll() { return []; },
    appendChild() {}, click() {},
  };
  return e;
}
const els = {};
function getEl(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; }

const sandbox = {
  console,
  Math, Date, JSON, Set, Map, Array, Object, String, Number, parseInt, parseFloat, isNaN,
  setTimeout: (f) => f(),
  confirm: () => false,
  URL: { createObjectURL: () => 'blob:x' },
  Blob: function () {},
  FileReader: function () {},
  fetch: () => Promise.reject(new Error('offline')),
  localStorage: {
    _s: {},
    getItem(k) { return this._s[k] || null; },
    setItem(k, v) { this._s[k] = v; },
  },
  document: {
    readyState: 'complete',
    getElementById: getEl,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (t) => fakeEl('new-' + t),
    addEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(__dirname + '/../docs/data.js', 'utf8'), sandbox);

let src = fs.readFileSync(__dirname + '/../docs/app.js', 'utf8');
// 注入测试出口
src = src.replace(
  'if (document.readyState === \'loading\') document.addEventListener(\'DOMContentLoaded\', boot); else boot();',
  'window.__T = { chi2P:chi2P, hyperP:hyperP, chi2Fit:chi2Fit, runBacktest:runBacktest, topK:topK, '
  + 'missOf:missOf, gapsOf:gapsOf, autocorr:autocorr, runsTest:runsTest, MODELS:MODELS, freqOf:freqOf, '
  + 'REC:REC, drawNums:drawNums, mulberry32:mulberry32, lgamma:lgamma, erf:erf, normCdf:normCdf, '
  + 'predict:predict, renderStats:renderStats, renderRecords:renderRecords }; boot();'
);
vm.runInContext(src, sandbox);

const T = sandbox.__T;
const E = (id) => getEl(id);
const ok = (c, m) => console.log((c ? '  PASS ' : '  FAIL ') + m);

console.log('=== 1. 分布函数正确性 ===');
// chi2P(65.17, 48) 应约等于 0.05
const p1 = T.chi2P(65.17, 48);
ok(Math.abs(p1 - 0.05) < 0.002, 'chi2P(65.17,48) = ' + p1.toFixed(5) + ' (期望≈0.05)');
const p2 = T.chi2P(0, 48);
ok(Math.abs(p2 - 1) < 1e-6, 'chi2P(0,48) = ' + p2.toFixed(5) + ' (期望 1)');
const p3 = T.chi2P(200, 48);
ok(p3 >= 0 && p3 < 1e-10, 'chi2P(200,48) = ' + p3.toExponential(2) + ' (下溢至 0，展示层显示 <1e-15)');
// 正态
ok(Math.abs(T.normCdf(1.96) - 0.975) < 0.001, 'normCdf(1.96) = ' + T.normCdf(1.96).toFixed(5) + ' (期望≈0.975)');
// 超几何概率和 = 1
let s = 0;
for (let k = 0; k <= 7; k++) s += T.hyperP(k, 7, 7);
ok(Math.abs(s - 1) < 1e-9, '超几何分布 Σ P(k) = ' + s.toFixed(10) + ' (期望 1)');
// 期望值
let ex = 0;
for (let k = 0; k <= 7; k++) ex += k * T.hyperP(k, 7, 7);
ok(Math.abs(ex - 1) < 1e-9, '抽7码期望命中 = ' + ex.toFixed(6) + ' (期望 1.0)');
let ex14 = 0;
for (let k = 0; k <= 7; k++) ex14 += k * T.hyperP(k, 7, 14);
ok(Math.abs(ex14 - 2) < 1e-9, '抽14码期望命中 = ' + ex14.toFixed(6) + ' (期望 2.0)');

console.log('\n=== 2. 数据层 ===');
const REC = T.REC;
ok(REC.length === 114, '库内期数 = ' + REC.length + ' (期望 114)');
ok(REC[0].period === 161 && REC[113].period === 282, '期号范围 = ' + REC[0].period + '~' + REC[113].period);
const g = T.gapsOf(REC);
ok(g.length === 1 && g[0][0] === 248 && g[0][1] === 255, '期号缺口 = ' + JSON.stringify(g));
let fmtErr = 0;
REC.forEach(r => {
  const all = r.mains.concat([r.special]);
  if (r.mains.length !== 6) fmtErr++;
  if (new Set(r.mains).size !== 6) fmtErr++;
  if (all.some(n => !(n >= 1 && n <= 49))) fmtErr++;
  if (r.mains.indexOf(r.special) >= 0) fmtErr++;
});
ok(fmtErr === 0, '格式校验错误数 = ' + fmtErr + ' (期望 0)');

console.log('\n=== 3. 统计检验 ===');
const c = T.chi2Fit(REC);
console.log('  χ² = ' + c.chi2.toFixed(3) + ', df = 48, p = ' + c.p.toFixed(4) + ', 理论期望/号 = ' + c.exp.toFixed(2));
ok(c.chi2 > 0 && c.p >= 0 && c.p <= 1, '卡方与 p 值在合法区间');
const rt = T.runsTest(REC);
console.log('  游程检验 Z = ' + rt.z.toFixed(4) + ', p = ' + rt.p.toFixed(4));
const ac = T.autocorr(REC, 1);
console.log('  一阶自相关 r = ' + ac.toFixed(5) + ' (95%界限 ±' + (1.96 / Math.sqrt(REC.length)).toFixed(4) + ')');
ok(Math.abs(ac) < 1, '自相关在 (-1,1) 内');

console.log('\n=== 4. 模型与回测 ===');
const startIdx = 30, K = 7, simN = 2000;
console.log('  回测 ' + (REC.length - startIdx) + ' 期，码数 ' + K + '，蒙特卡洛 ' + simN + ' 次');
const res = {};
Object.keys(T.MODELS).forEach(k => { res[k] = T.runBacktest(REC, k, startIdx, K, simN); });
Object.keys(res).forEach(k => {
  const r = res[k];
  console.log('  ' + r.name.padEnd(22) + ' 平均命中 ' + r.mean.toFixed(4) +
    ' | 基线 ' + r.baseMean.toFixed(4) + ' | 理论 ' + r.theory.toFixed(4) +
    ' | p = ' + r.p.toFixed(4) + (r.p < 0.05 ? '  *显著' : ''));
});
const baseOK = Object.keys(res).every(k => Math.abs(res[k].baseMean - 1.0) < 0.06);
ok(baseOK, '随机基线均值均接近理论值 1.0');
const pOK = Object.keys(res).every(k => res[k].p >= 0 && res[k].p <= 1);
ok(pOK, '所有 p 值在 [0,1] 区间');

console.log('\n=== 5. 渲染输出 ===');
ok(E('predBalls').innerHTML.length > 50, '本期预测号码区已渲染 (' + E('predBalls').innerHTML.length + ' 字符)');
ok(E('heat').innerHTML.length > 500, '热力图已渲染 (' + E('heat').innerHTML.length + ' 字符)');
ok(E('recList').innerHTML.length > 500, '记录列表已渲染 (' + E('recList').innerHTML.length + ' 字符)');
ok(E('stChi').textContent !== '', '卡方值已输出: ' + E('stChi').textContent);
ok(E('topCount').textContent === 114, '顶栏期数 = ' + E('topCount').textContent);
ok(E('health').innerHTML.indexOf('缺口') >= 0, '数据体检已标注期号缺口');
const predTxt = E('predBalls').innerHTML;
const nums = [...predTxt.matchAll(/>(\d+)<\/div>/g)].map(m => +m[1]);
ok(nums.length === 7, '预测输出号码数 = ' + nums.length + ' → [' + nums.join(' ') + ']');
ok(new Set(nums).size === 7, '预测号码无重复');

console.log('\n=== 6. 边界：码数切换 ===');
[10, 14, 20].forEach(k => {
  const r = T.runBacktest(REC, 'freq', startIdx, k, 300);
  console.log('  ' + k + ' 码: 平均命中 ' + r.mean.toFixed(3) + ', 理论 ' + r.theory.toFixed(3) +
    ', 基线 ' + r.baseMean.toFixed(3) + ', p = ' + r.p.toFixed(4));
});
console.log('\n完成。');
