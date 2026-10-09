// marksix-research Worker
// 职责：抓取开奖记录 -> 校验数据完整性 -> 入库 -> 提供统计检验 API
// 本服务只输出描述性统计与检验结果，不产出任何投注推荐。

const SOURCE_URL = 'https://amkkjj.com/';

const DASHBOARD = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>开奖数据统计看板</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0f1115;color:#e6e8ee;font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding:16px 14px 60px;max-width:760px;margin:0 auto}
h1{font-size:19px;margin:0 0 4px}
.sub{color:#9aa3b2;font-size:12.5px;margin:0 0 18px}
.card{background:#171a21;border:1px solid #252a34;border-radius:12px;padding:14px 16px;margin-bottom:12px}
.card h2{font-size:14px;margin:0 0 10px;color:#c7d5ee}
.kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #22262f;font-size:13.5px}
.kv:last-child{border:0}
.kv span:first-child{color:#9aa3b2}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:12px;font-weight:600;color:#fff}
.warn{background:rgba(255,92,92,.1);border:1px solid rgba(255,92,92,.35);border-radius:10px;padding:11px 14px;margin-bottom:12px;font-size:13px;color:#ffb3b3}
.ok{background:rgba(62,207,142,.08);border:1px solid rgba(62,207,142,.3);border-radius:10px;padding:11px 14px;margin-bottom:12px;font-size:13px;color:#9fe8c6}
.bar{height:18px;border-radius:4px;background:linear-gradient(90deg,#4f8cff,#7aa9ff);margin:3px 0}
.row{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:5px}
.num{width:26px;text-align:right;color:#9aa3b2;font-variant-numeric:tabular-nums}
.loading{text-align:center;color:#6f7889;padding:40px 0;font-size:13px}
</style></head><body>
<h1>开奖数据统计看板</h1>
<p class="sub">描述性统计与随机性检验 · 独立随机事件不具可预测性</p>
<div id="app"><div class="loading">加载中…</div></div>
<script>
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
async function load(){
  var hs = await fetch('/api/history').then(function(r){return r.json()});
  var st = await fetch('/api/stats').then(function(r){return r.json()});
  var vd = await fetch('/api/validate').then(function(r){return r.json()});
  var app = document.getElementById('app');
  var html = '';

  // 概况
  html += '<div class="card"><h2>数据概况</h2>';
  html += '<div class="kv"><span>总期数</span><span>' + st.periods + '</span></div>';
  html += '<div class="kv"><span>期号范围</span><span>' + vd.periodRange[0] + ' – ' + vd.periodRange[1] + '</span></div>';
  html += '<div class="kv"><span>数据异常</span><span>' + vd.issues.length + ' 条</span></div>';
  html += '<div class="kv"><span>期望频次/号</span><span>' + st.expectedPerNumber.toFixed(2) + '</span></div>';
  html += '</div>';

  // 缺口
  if (st.gaps && st.gaps.length) {
    html += '<div class="warn"><b>期号缺口：</b>';
    st.gaps.forEach(function(g){ html += ' 第 ' + (g.from+1) + '–' + (g.to-1) + ' 期缺失（' + g.missing + ' 期）' });
    html += '<br>' + st.missWindowNote + '</div>';
  } else {
    html += '<div class="ok">期号连续，无缺口</div>';
  }

  // 卡方检验
  var crit = 65.17;
  var rej = st.chiSquare > crit;
  html += '<div class="card"><h2>卡方拟合优度检验</h2>';
  html += '<div class="kv"><span>χ² 统计量</span><span>' + st.chiSquare.toFixed(2) + '</span></div>';
  html += '<div class="kv"><span>自由度 df</span><span>' + st.degreesOfFreedom + '</span></div>';
  html += '<div class="kv"><span>临界值 (α=0.05)</span><span>' + crit + '</span></div>';
  html += '</div>';
  html += rej
    ? '<div class="warn">χ² &gt; ' + crit + '，<b>拒绝</b>「各号码等概率」的原假设（α=0.05）。</div>'
    : '<div class="ok">χ² ≤ ' + crit + '，<b>不拒绝</b>「各号码等概率」的原假设（α=0.05）——样本内未检出显著偏离。</div>';

  // 频次热力图
  var maxF = Math.max.apply(null, st.frequency.map(function(x){return x.total}));
  var minF = Math.min.apply(null, st.frequency.map(function(x){return x.total}));
  html += '<div class="card"><h2>号码频次热力图（越高频越亮）</h2><div class="grid">';
  st.frequency.forEach(function(f){
    var t = maxF === minF ? 0.5 : (f.total - minF) / (maxF - minF);
    var a = (0.18 + t * 0.82).toFixed(3);
    html += '<div class="cell" style="background:rgba(79,140,255,' + a + ')" title="出现 ' + f.total + ' 次">' + f.number + '</div>';
  });
  html += '</div></div>';

  // 遗漏排行
  var missTop = st.frequency.slice().sort(function(a,b){return b.miss - a.miss}).slice(0,10);
  var maxM = Math.max.apply(null, missTop.map(function(x){return x.miss})) || 1;
  html += '<div class="card"><h2>遗漏期数 TOP 10</h2>';
  missTop.forEach(function(f){
    html += '<div class="row"><span class="num">' + f.number + '</span>' +
      '<div class="bar" style="width:' + (f.miss/maxM*100).toFixed(1) + '%;min-width:4px"></div>' +
      '<span>' + f.miss + ' 期</span></div>';
  });
  html += '</div>';

  // 近30期频次
  var r30Top = st.frequency.slice().sort(function(a,b){return b.r30 - a.r30}).slice(0,10);
  var maxR = Math.max.apply(null, r30Top.map(function(x){return x.r30})) || 1;
  html += '<div class="card"><h2>近 30 期频次 TOP 10</h2>';
  r30Top.forEach(function(f){
    html += '<div class="row"><span class="num">' + f.number + '</span>' +
      '<div class="bar" style="width:' + (f.r30/maxR*100).toFixed(1) + '%;min-width:4px;background:linear-gradient(90deg,#3ecf8e,#7ae0b4)"></div>' +
      '<span>' + f.r30 + ' 次</span></div>';
  });
  html += '</div>';

  html += '<div class="card"><h2>说明</h2><p style="font-size:12.5px;color:#9aa3b2;margin:0">' +
    '开奖为独立随机事件，历史频次与遗漏值对未来结果不具预测力。本页仅呈现描述性统计与假设检验结果，不产出任何投注推荐。</p></div>';

  app.innerHTML = html;
}
load().catch(function(e){
  document.getElementById('app').innerHTML = '<div class="warn">加载失败：' + esc(e.message) + '</div>';
});
</script></body></html>`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ---------- 抓取 ----------
async function fetchSource() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resp = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!resp.ok) throw new Error('Source HTTP ' + resp.status);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseHistory(html) {
  const results = [];
  const blocks = html.split('hisList');
  for (const block of blocks.slice(1)) {
    const periodM = block.match(/<i>(\d{7})<\/i>/);
    const dateM = block.match(/hisTime[^"]*"><span>([\d-]+)<\/span>/);
    if (!periodM || !dateM) continue;
    const nums = [];
    const re = /history_block-lump-(?:red|blue|green)-a[^>]*>(\d+)</g;
    let m;
    while ((m = re.exec(block)) !== null) nums.push(parseInt(m[1], 10));
    if (nums.length === 7) {
      results.push({
        period: parseInt(periodM[1], 10),
        date: dateM[1],
        mains: nums.slice(0, 6),
        special: nums[6],
      });
    }
    if (results.length >= 30) break;
  }

  const latestM = html.match(/第\s*(\d{7})\s*期/);
  if (latestM) {
    const latest = parseInt(latestM[1], 10);
    if (!results.find((r) => r.period === latest)) {
      const idx = html.indexOf('hisList');
      const section = html.substring(0, idx > 0 ? idx : 5000);
      const balls = [];
      const ballRe = /class="[^"]*(?:red|blue|green)[^"]*"[^>]*>\s*(\d{1,2})\s*</g;
      let bm;
      while ((bm = ballRe.exec(section)) !== null) balls.push(parseInt(bm[1], 10));
      if (balls.length >= 7) {
        const dateM2 = section.match(/(\d{4}-\d{2}-\d{2})/);
        results.unshift({
          period: latest,
          date: dateM2 ? dateM2[1] : new Date().toISOString().slice(0, 10),
          mains: balls.slice(0, 6),
          special: balls[6],
        });
      }
    }
  }
  return results;
}

// ---------- 数据校验 ----------
function validate(records) {
  const issues = [];
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.period)) issues.push({ period: r.period, type: 'duplicate_period' });
    seen.add(r.period);

    const all = [...r.mains, r.special];
    if (r.mains.length !== 6) issues.push({ period: r.period, type: 'bad_main_count' });
    if (new Set(r.mains).size !== 6) issues.push({ period: r.period, type: 'main_duplicate_number', value: r.mains });
    if (r.mains.includes(r.special)) issues.push({ period: r.period, type: 'special_overlaps_main', value: r.special });
    if (!all.every((n) => Number.isInteger(n) && n >= 1 && n <= 49)) {
      issues.push({ period: r.period, type: 'out_of_range', value: all });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) issues.push({ period: r.period, type: 'bad_date', value: r.date });
  }

  // 期号连续性
  const periods = [...seen].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < periods.length; i++) {
    const diff = periods[i] - periods[i - 1];
    if (diff > 1) gaps.push({ from: periods[i - 1], to: periods[i], missing: diff - 1 });
  }

  return { issues, gaps, periodRange: [periods[0], periods[periods.length - 1]], count: records.length };
}

// ---------- 统计检验 ----------
function computeStats(records) {
  const sorted = [...records].sort((a, b) => a.period - b.period);

  // 期号缺口检测
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].period - sorted[i - 1].period;
    if (d > 1) gaps.push({ from: sorted[i - 1].period, to: sorted[i].period, missing: d - 1 });
  }

  // 遗漏值只在「最近一个连续段」内计算。
  // 缺口期的开奖结果未知，若跨缺口统计会系统性高估遗漏值。
  let segStart = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].period - sorted[i - 1].period > 1) segStart = i;
  }
  const contiguous = sorted.slice(segStart);

  const freq = new Array(50).fill(0);
  sorted.forEach((r) => {
    for (const n of [...r.mains, r.special]) freq[n]++;
  });

  const lastSeen = new Array(50).fill(-1);
  contiguous.forEach((r, i) => {
    for (const n of [...r.mains, r.special]) lastSeen[n] = i;
  });

  const n = sorted.length;
  const m = contiguous.length;
  const miss = new Array(50).fill(0);
  for (let k = 1; k <= 49; k++) {
    miss[k] = lastSeen[k] === -1 ? m : m - 1 - lastSeen[k];
  }

  // 卡方拟合优度检验：每期 7 个号码，49 个球，期望 = n*7/49
  const expected = (n * 7) / 49;
  let chi2 = 0;
  for (let k = 1; k <= 49; k++) {
    const d = freq[k] - expected;
    chi2 += (d * d) / expected;
  }

  const recent = sorted.slice(-30);
  const r30 = new Array(50).fill(0);
  for (const r of recent) for (const x of [...r.mains, r.special]) r30[x]++;

  const frequency = [];
  for (let k = 1; k <= 49; k++) {
    frequency.push({ number: k, total: freq[k], r30: r30[k], miss: miss[k] });
  }

  return {
    periods: n,
    gaps,
    contiguousFrom: contiguous.length ? contiguous[0].period : null,
    contiguousPeriods: m,
    missWindowNote: gaps.length ? '遗漏值仅在最近连续段内计算，缺口前的记录不参与' : null,
    expectedPerNumber: expected,
    chiSquare: chi2,
    degreesOfFreedom: 48,
    frequency,
  };
}

// ---------- 路由 ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      const kv = env.MARKSIX_DATA;
      if (!kv) return json({ error: 'KV binding MARKSIX_DATA 未配置' }, 500);

      // 同步：抓取 + 校验 + 入库
      if (path === '/api/sync' && request.method === 'POST') {
        const html = await fetchSource();
        const parsed = parseHistory(html);
        const report = validate(parsed);

        const existing = JSON.parse((await kv.get('history')) || '[]');
        const map = new Map(existing.map((r) => [r.period, r]));
        for (const r of parsed) if (!map.has(r.period)) map.set(r.period, r);
        const merged = [...map.values()].sort((a, b) => a.period - b.period);

        await kv.put('history', JSON.stringify(merged));
        await kv.put('last_sync', JSON.stringify({ at: new Date().toISOString(), report }));

        return json({ success: true, fetched: parsed.length, stored: merged.length, report });
      }

      // 统计看板
      if (path === '/' || path === '/dashboard') {
        return new Response(DASHBOARD, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // 历史数据
      if (path === '/api/history') {
        const history = JSON.parse((await kv.get('history')) || '[]');
        const lastSync = JSON.parse((await kv.get('last_sync')) || 'null');
        return json({ success: true, count: history.length, history, lastSync });
      }

      // 统计检验
      if (path === '/api/stats') {
        const history = JSON.parse((await kv.get('history')) || '[]');
        if (history.length === 0) return json({ error: '暂无数据，请先调用 POST /api/sync' }, 400);
        return json({ success: true, ...computeStats(history) });
      }

      // 数据体检报告
      if (path === '/api/validate') {
        const history = JSON.parse((await kv.get('history')) || '[]');
        return json({ success: true, ...validate(history) });
      }

      return json({ error: 'Not found', endpoints: ['GET /api/history', 'POST /api/sync', 'GET /api/stats', 'GET /api/validate'] }, 404);
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }
  },
};
