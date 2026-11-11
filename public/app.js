import { timeChart, hbars, sparkline, hideTip } from './charts.js';

// ───────────── ユーティリティ ─────────────
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);

const yen = (v) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e10 ? 0 : 2)}億円`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}万円`;
  return `${Math.round(v).toLocaleString()}円`;
};
const yenAxis = (v) => {
  const a = Math.abs(v);
  if (a >= 1e8) return `${+(v / 1e8).toFixed(1)}億`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}万`;
  return v.toLocaleString();
};
const pct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : '—');
const num = (v, d = 0) => (isNum(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
const kpiFmt = (v, unit) => {
  if (!isNum(v)) return '—';
  if (unit === '円') return yen(v);
  if (unit === '%') return `${v.toFixed(2)}%`;
  return `${num(v, 2)}${esc(unit || '')}`;
};
const ml = (ym) => `${ym.slice(2, 4)}/${ym.slice(5)}`;
const monthJa = (ym) => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;

/** 増減表示。goodWhenUp=false なら減少が良い */
function delta(v, { goodWhenUp = true, format = (x) => pct(Math.abs(x)), label = '' } = {}) {
  if (!isNum(v)) return `<span class="muted">${label} —</span>`;
  const up = v >= 0;
  const cls = v === 0 ? '' : up === goodWhenUp ? 'up' : 'down';
  return `<span class="${cls}">${label} ${up ? '▲' : '▼'}${format(v)}</span>`;
}
const statusOf = (ach) => (!isNum(ach) ? 'none' : ach >= 1 ? 'good' : ach >= 0.9 ? 'warning' : 'critical');
const STATUS_LABEL = { good: '達成', warning: '注意', critical: '未達', none: '目標なし' };
const statusChip = (s, text = STATUS_LABEL[s]) => `<span class="status ${s}">${esc(text)}</span>`;

function tile({ domain, label, value, unit = '', meta = '', meter }) {
  return `<div class="card tile">
    <div class="label">${domain ? `<span class="domain">${domain}</span>` : ''}${esc(label)}</div>
    <div class="value">${value}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    ${meter && isNum(meter) ? `<div class="meter ${statusOf(meter)}" title="${pct(meter)}"><i style="width:${Math.min(100, Math.max(0, meter * 100))}%"></i></div>` : ''}
  </div>`;
}

function card(title, sub = '', body = '') {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML = `<h3>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</h3>`;
  if (typeof body === 'string') d.insertAdjacentHTML('beforeend', body);
  else if (body) d.appendChild(body);
  return d;
}

function grid(cls, children) {
  const d = document.createElement('div');
  d.className = `grid ${cls}`;
  for (const c of children) typeof c === 'string' ? d.insertAdjacentHTML('beforeend', c) : d.appendChild(c);
  return d;
}

function sectionTitle(html) {
  const d = document.createElement('div');
  d.className = 'section-title';
  d.innerHTML = html;
  return d;
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok && res.status !== 422) throw new Error(body.error || res.statusText);
  return body;
}

// ───────────── 状態とルーティング ─────────────
const state = { month: null, cockpit: null };
const TABS = ['overview', 'people', 'money', 'business', 'data'];
const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview');

async function load() {
  state.cockpit = await api(`/api/cockpit${state.month ? `?month=${state.month}` : ''}`);
  state.month = state.cockpit.month;
  const sel = $('#month');
  const months = [...new Set([...state.cockpit.months, state.month])].sort().reverse();
  sel.innerHTML = months.map((m) => `<option value="${m}" ${m === state.month ? 'selected' : ''}>${monthJa(m)}</option>`).join('');
}

async function render() {
  hideTip();
  const tab = currentTab();
  document.querySelectorAll('nav.tabs a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${tab}`));
  $('#month-wrap').style.visibility = tab === 'data' ? 'hidden' : 'visible';
  const main = $('main');
  main.innerHTML = '';
  try {
    if (tab === 'data') return await renderData(main);
    if (!state.cockpit) await load();
    const c = state.cockpit;
    const hasData = c.months.length || c.people.headcount || c.people.series.some((s) => s.headcount);
    if (!hasData) return renderEmpty(main);
    ({ overview: renderOverview, people: renderPeople, money: renderMoney, business: renderBusiness })[tab](main, c);
  } catch (e) {
    main.innerHTML = `<div class="card result err">読み込みに失敗しました: ${esc(e.message)}</div>`;
  }
}

function renderEmpty(main) {
  main.innerHTML = `<div class="card empty">
    <h2>まだデータがありません</h2>
    <p>「データ連携」から CSV をアップロードするか、API・外部コネクタでデータを送ってください。<br>まずは動きを見たい場合はサンプルデータを投入できます。</p>
    <div class="actions" style="justify-content:center">
      <button class="btn primary" id="seed">サンプルデータを投入</button>
      <a class="btn" href="#data">データ連携へ</a>
    </div></div>`;
  $('#seed').onclick = seedSample;
}

async function seedSample() {
  if (!confirm('サンプルデータで全データセットを置き換えます。よろしいですか？')) return;
  await api('/api/sample', { method: 'POST' });
  state.month = null; state.cockpit = null;
  location.hash = '#overview';
  render();
}

// ───────────── 総合 ─────────────
function renderOverview(main, c) {
  const { money: m, people: p, business: b } = c;
  const totalKpi = b.kpis.length;
  main.appendChild(grid('tiles', [
    tile({ domain: '金', label: '売上（当月）', value: yen(m.actual.revenue), meta: `予算比 ${pct(m.revenueAchievement)} ${delta(m.revenueYoY, { label: '前年比' })}`, meter: m.revenueAchievement }),
    tile({ domain: '金', label: '営業利益（当月）', value: yen(m.actual.op), meta: `利益率 ${pct(m.actual.opMargin)}・予算 ${yen(m.budget.op)}`, meter: m.opAchievement }),
    tile({ domain: '金', label: '現預金残高', value: yen(m.cash.balance), meta: m.cash.runwayMonths ? `ランウェイ ${m.cash.runwayMonths.toFixed(1)}ヶ月` : '資金は増加傾向' }),
    tile({ domain: '人', label: '従業員数', value: num(p.headcount), unit: '名', meta: `${delta(p.headcount - p.prevHeadcount, { format: (x) => `${Math.abs(x)}名`, label: '前月比' })} 入社${p.hires}・退職${p.leavers}` }),
    tile({ domain: '人', label: '離職率（直近12ヶ月）', value: pct(p.turnoverRate12), meta: `退職 ${p.leavers12}名 / 採用 ${p.hires12}名` }),
    tile({ domain: '事業', label: 'KPI 達成', value: `${b.kpiCounts.good}<span class="unit">/ ${totalKpi}</span>`, meta: `${statusChip('warning', `注意 ${b.kpiCounts.warning}`)} ${statusChip('critical', `未達 ${b.kpiCounts.critical}`)}`, meter: totalKpi ? b.kpiCounts.good / totalKpi : null }),
  ]));

  const alerts = c.alerts.length
    ? `<ul class="alerts">${c.alerts.map((a) => `<li class="${a.level}"><span class="icon" aria-label="${a.level === 'critical' ? '重大' : '注意'}">${a.level === 'critical' ? '!' : '△'}</span><span class="dom">${a.domain}</span><span>${esc(a.message)}</span></li>`).join('')}</ul>`
    : '<div class="ok-msg">✓ 要注意事項はありません</div>';
  main.appendChild(sectionTitle(`アラート <span class="muted">${monthJa(c.month)}時点</span>`));
  main.appendChild(card('要確認事項', `${c.alerts.length}件`, alerts));

  main.appendChild(sectionTitle('3領域サマリー'));
  const labels = m.series.map((s) => ml(s.month));
  const people = card('<span class="domain-tag">人</span> 従業員数の推移', '直近12ヶ月', timeChart({
    labels, lines: [{ name: '従業員数', values: p.series.map((s) => s.headcount), color: 'var(--s1)' }], format: (v) => `${v}名`, axisFormat: (v) => `${v}`, zeroBase: false, height: 200,
  }));
  const money = card('<span class="domain-tag">金</span> 売上 実績 vs 予算', '直近12ヶ月', timeChart({
    labels, bars: [{ name: '実績', values: m.series.map((s) => s.revenue), color: 'var(--s1)' }],
    lines: [{ name: '予算', values: m.series.map((s) => s.revenueBudget), color: 'var(--muted)', dashed: true }], format: yen, axisFormat: yenAxis, height: 200,
  }));
  const buRows = b.businessUnits.map((u) => `<tr>
    <td>${esc(u.business_unit)}</td><td class="num">${yen(u.revenue)}</td>
    <td class="num">${statusChip(statusOf(u.revenueAchievement), pct(u.revenueAchievement))}</td>
    <td class="num ${u.op < 0 ? 'down' : ''}">${yen(u.op)}</td>
    <td>${u.kpiStatus.critical ? statusChip('critical', `未達${u.kpiStatus.critical}`) : u.kpiStatus.warning ? statusChip('warning', `注意${u.kpiStatus.warning}`) : u.kpiStatus.good ? statusChip('good', 'OK') : '<span class="muted">—</span>'}</td></tr>`).join('');
  const biz = card('<span class="domain-tag">事業</span> 事業別サマリー', monthJa(c.month), `<div class="table-wrap"><table class="data">
    <thead><tr><th>事業</th><th class="num">売上</th><th class="num">予算比</th><th class="num">営業利益</th><th>KPI</th></tr></thead>
    <tbody>${buRows || '<tr><td colspan="5" class="muted">データなし</td></tr>'}</tbody></table></div>`);
  main.appendChild(grid('cols-3', [people, money, biz]));
}

// ───────────── 人 ─────────────
function renderPeople(main, c) {
  const p = c.people;
  main.appendChild(grid('tiles', [
    tile({ label: '従業員数', value: num(p.headcount), unit: '名', meta: delta(p.headcount - p.prevHeadcount, { format: (x) => `${Math.abs(x)}名`, label: '前月比' }) }),
    tile({ label: '当月 入社 / 退職', value: `${p.hires}<span class="unit">名</span> / ${p.leavers}<span class="unit">名</span>` }),
    tile({ label: '離職率（直近12ヶ月）', value: pct(p.turnoverRate12), meta: `退職 ${p.leavers12}名・採用 ${p.hires12}名` }),
    tile({ label: '人件費（月額）', value: yen(p.laborCost), meta: `人件費率 ${pct(p.laborCostRatio)}` }),
    tile({ label: '1人当たり売上（月）', value: yen(p.revenuePerHead) }),
    tile({ label: '平均勤続年数', value: num(p.avgTenure, 1), unit: '年' }),
  ]));
  const labels = p.series.map((s) => ml(s.month));
  main.appendChild(sectionTitle('推移'));
  main.appendChild(grid('cols-2', [
    card('従業員数', '月末時点', timeChart({ labels, lines: [{ name: '従業員数', values: p.series.map((s) => s.headcount), color: 'var(--s1)' }], format: (v) => `${v}名`, zeroBase: false })),
    card('入社・退職', '月別', timeChart({ labels, bars: [{ name: '入社', values: p.series.map((s) => s.hires), color: 'var(--s1)' }, { name: '退職', values: p.series.map((s) => s.leavers), color: 'var(--s2)' }], format: (v) => `${v}名` })),
  ]));
  main.appendChild(sectionTitle('組織'));
  const rows = p.departments.map((d) => `<tr><td>${esc(d.department)}</td><td class="num">${d.headcount}</td><td class="num">${d.hires12}</td>
    <td class="num ${d.headcount && d.leavers12 / d.headcount > 0.25 ? 'down' : ''}">${d.leavers12}</td><td class="num">${yen(d.laborCost)}</td><td class="num">${num(d.avgTenure, 1)}年</td></tr>`).join('');
  main.appendChild(grid('cols-2', [
    card('部署別', '退職・採用は直近12ヶ月', `<div class="table-wrap"><table class="data"><thead><tr><th>部署</th><th class="num">人数</th><th class="num">採用</th><th class="num">退職</th><th class="num">人件費/月</th><th class="num">平均勤続</th></tr></thead><tbody>${rows}</tbody></table></div>`),
    card('雇用形態別', `${p.headcount}名`, hbars(p.employmentTypes.map((t) => ({ label: t.type, value: t.headcount })), (v) => `${v}名`)),
  ]));
}

// ───────────── 金 ─────────────
function renderMoney(main, c) {
  const m = c.money;
  main.appendChild(grid('tiles', [
    tile({ label: '売上', value: yen(m.actual.revenue), meta: `予算比 ${pct(m.revenueAchievement)} ${delta(m.revenueMoM, { label: '前月比' })}`, meter: m.revenueAchievement }),
    tile({ label: '粗利', value: yen(m.actual.gross), meta: `粗利率 ${pct(m.actual.grossMargin)}` }),
    tile({ label: '営業利益', value: yen(m.actual.op), meta: `利益率 ${pct(m.actual.opMargin)}・予算 ${yen(m.budget.op)}`, meter: m.opAchievement }),
    tile({ label: `売上 期累計（${monthJa(m.ytd.from)}〜）`, value: yen(m.ytd.actual.revenue), meta: `予算比 ${pct(m.ytd.revenueAchievement)}`, meter: m.ytd.revenueAchievement }),
    tile({ label: '現預金残高', value: yen(m.cash.balance) }),
    tile({ label: '資金ランウェイ', value: m.cash.runwayMonths ? m.cash.runwayMonths.toFixed(1) : '∞', unit: m.cash.runwayMonths ? 'ヶ月' : '', meta: isNum(m.cash.monthlyBurn) ? `月次増減（3ヶ月平均） ${yen(-m.cash.monthlyBurn)}` : '' }),
  ]));
  const labels = m.series.map((s) => ml(s.month));
  main.appendChild(sectionTitle('推移'));
  main.appendChild(grid('cols-2', [
    card('売上 実績 vs 予算', '', timeChart({ labels, bars: [{ name: '実績', values: m.series.map((s) => s.revenue), color: 'var(--s1)' }], lines: [{ name: '予算', values: m.series.map((s) => s.revenueBudget), color: 'var(--muted)', dashed: true }], format: yen, axisFormat: yenAxis })),
    card('営業利益 実績 vs 予算', '', timeChart({ labels, bars: [{ name: '実績', values: m.series.map((s) => s.op), color: 'var(--s3)' }], lines: [{ name: '予算', values: m.series.map((s) => s.opBudget), color: 'var(--muted)', dashed: true }], format: yen, axisFormat: yenAxis })),
    card('現預金残高', '月末', timeChart({ labels, lines: [{ name: '現預金', values: m.cash.series.map((s) => s.balance), color: 'var(--s1)' }], format: yen, axisFormat: yenAxis })),
    card('販管費内訳', monthJa(c.month), m.sgaBreakdown.length ? hbars(m.sgaBreakdown.map((s) => ({ label: s.account, value: s.amount })), yen) : '<div class="muted">データなし</div>'),
  ]));

  const L = [['売上高', 'revenue'], ['売上原価', 'cogs'], ['売上総利益', 'gross'], ['販管費', 'sga'], ['営業利益', 'op']];
  const costLike = new Set(['cogs', 'sga']);
  const rows = L.map(([label, k]) => {
    const a = m.actual[k], b = m.budget[k], diff = a - b;
    const good = costLike.has(k) ? diff <= 0 : diff >= 0;
    return `<tr class="${k === 'op' ? 'total' : ''}"><td>${label}</td><td class="num">${yen(a)}</td><td class="num">${yen(b)}</td>
      <td class="num ${b ? (good ? 'up' : 'down') : ''}">${b ? (diff >= 0 ? '+' : '') + yen(diff) : '—'}</td>
      <td class="num">${pct(b ? a / b : null)}</td><td class="num">${yen(m.lastYear[k])}</td>
      <td class="num">${yen(m.ytd.actual[k])}</td><td class="num">${yen(m.ytd.budget[k])}</td></tr>`;
  }).join('');
  main.appendChild(sectionTitle('損益計算書'));
  main.appendChild(card('P/L サマリー', monthJa(c.month), `<div class="table-wrap"><table class="data">
    <thead><tr><th></th><th class="num">当月実績</th><th class="num">当月予算</th><th class="num">予算差異</th><th class="num">達成率</th><th class="num">前年同月</th><th class="num">期累計 実績</th><th class="num">期累計 予算</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`));
}

// ───────────── 事業 ─────────────
function renderBusiness(main, c) {
  const b = c.business;
  main.appendChild(sectionTitle(`事業別 <span class="muted">${monthJa(c.month)}</span>`));
  main.appendChild(grid('cols-3', b.businessUnits.map((u) => {
    const d = card(esc(u.business_unit), u.revenueAchievement ? `予算比 ${pct(u.revenueAchievement)}` : '', `
      <div class="nums">
        <div><span>売上</span><b>${yen(u.revenue)}</b></div>
        <div><span>営業利益</span><b class="${u.op < 0 ? 'down' : ''}">${yen(u.op)}</b></div>
        <div><span>利益率</span><b>${pct(u.opMargin)}</b></div>
      </div>
      ${isNum(u.revenueAchievement) ? `<div class="meter ${statusOf(u.revenueAchievement)}"><i style="width:${Math.min(100, u.revenueAchievement * 100)}%"></i></div>` : ''}
      <div class="chips">${statusChip('good', `達成 ${u.kpiStatus.good}`)}${statusChip('warning', `注意 ${u.kpiStatus.warning}`)}${statusChip('critical', `未達 ${u.kpiStatus.critical}`)}</div>`);
    d.classList.add('bu-card');
    d.appendChild(timeChart({ labels: u.series.map((s) => ml(s.month)), bars: [{ name: '売上', values: u.series.map((s) => s.revenue), color: 'var(--s1)' }], format: yen, axisFormat: yenAxis, height: 140 }));
    return d;
  })));

  main.appendChild(sectionTitle('KPI 一覧'));
  const rows = b.kpis.map((k) => {
    const chg = isNum(k.prev) && k.prev ? (k.actual - k.prev) / Math.abs(k.prev) : null;
    return `<tr><td>${esc(k.business_unit)}</td><td>${esc(k.kpi)}${k.direction === 'lower' ? ' <span class="muted">(↓が良)</span>' : ''}</td>
      <td class="num">${kpiFmt(k.actual, k.unit)}</td><td class="num">${kpiFmt(k.target, k.unit)}</td>
      <td class="num">${pct(k.achievement)}</td><td>${statusChip(k.status)}</td>
      <td class="num">${delta(chg, { goodWhenUp: k.direction !== 'lower' })}</td>
      <td>${sparkline(k.series.map((s) => s.actual), k.series.map((s) => s.target))}</td></tr>`;
  }).join('');
  main.appendChild(card('KPI', '実線=実績 / 破線=目標（12ヶ月）', `<div class="table-wrap"><table class="data">
    <thead><tr><th>事業</th><th>KPI</th><th class="num">実績</th><th class="num">目標</th><th class="num">達成率</th><th>状態</th><th class="num">前月比</th><th>推移</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="muted">KPI データがありません</td></tr>'}</tbody></table></div>`));
}

// ───────────── データ連携 ─────────────
async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('shift_jis').decode(buf); } // Excel 由来の Shift_JIS CSV
}

function resultHtml(r, dry) {
  if (r.ok) return `<div class="result ok">✓ ${r.rows}件 ${dry ? 'を検証しました（まだ取り込まれていません）' : 'を取り込みました'}</div>`;
  return `<div class="result err">✗ ${r.errorCount ?? r.errors.length}件のエラー（何も取り込まれていません）<ul>${r.errors.slice(0, 8).map((e) => `<li>${e.line ? `${e.line}行目: ` : ''}${esc(e.message)}</li>`).join('')}</ul></div>`;
}

async function renderData(main) {
  const [datasets, connectors, imports] = await Promise.all([api('/api/datasets'), api('/api/connectors'), api('/api/imports')]);
  const domainName = { people: '人', money: '金', business: '事業' };

  main.appendChild(sectionTitle('データセット <span class="muted">CSV アップロード（UTF-8 / Shift_JIS、日本語ヘッダ可）</span>'));
  main.appendChild(grid('cols-2', datasets.map((d) => {
    const el = card(`<span class="domain">${domainName[d.domain]}</span> ${esc(d.label)} <code class="muted">${d.id}</code>`, `${d.rowCount.toLocaleString()}行`);
    el.classList.add('ds-card');
    el.insertAdjacentHTML('beforeend', `
      <div class="desc">${esc(d.description)}${d.lastImport ? `<br>最終取込: ${esc(d.lastImport.created_at)} UTC（${esc(d.lastImport.source)}）` : ''}</div>
      <div class="cols">${d.columns.map((c) => `<code class="${c.required ? 'req' : ''}" title="${esc(c.label)}">${c.name}</code>`).join(' ')} <span>（太字=必須）</span></div>
      <div class="drop" tabindex="0">CSV をドロップ、またはクリックして選択<input type="file" accept=".csv,text/csv" hidden></div>
      <div class="actions">
        <select class="mode"><option value="upsert">追加・更新（キー一致は上書き）</option><option value="replace">全件入れ替え</option></select>
        <button class="btn primary import" disabled>取り込む</button>
        <a class="btn" href="/api/datasets/${d.id}/template.csv">テンプレート</a>
        <a class="btn" href="/api/datasets/${d.id}/export.csv">エクスポート</a>
        <button class="btn danger clear">全削除</button>
      </div>
      <div class="out"></div>`);
    const drop = $('.drop', el), input = $('input', el), out = $('.out', el), btn = $('.import', el);
    let text = null;
    const pick = async (file) => {
      if (!file) return;
      text = await decodeFile(file);
      drop.textContent = `📄 ${file.name}`;
      const r = await api(`/api/datasets/${d.id}/import?dryRun=1`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
      out.innerHTML = resultHtml(r, true);
      btn.disabled = !r.ok;
    };
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); };
    input.onchange = () => pick(input.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
    btn.onclick = async () => {
      const mode = $('.mode', el).value;
      if (mode === 'replace' && !confirm(`${d.label} の既存データをすべて置き換えます。よろしいですか？`)) return;
      btn.disabled = true;
      const r = await api(`/api/datasets/${d.id}/import?mode=${mode}&source=csv`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
      out.innerHTML = resultHtml(r, false);
      if (r.ok) { state.cockpit = null; setTimeout(render, 900); }
    };
    $('.clear', el).onclick = async () => {
      if (!confirm(`${d.label} のデータをすべて削除します。よろしいですか？`)) return;
      await api(`/api/datasets/${d.id}`, { method: 'DELETE' });
      state.cockpit = null; render();
    };
    return el;
  })));

  // 外部コネクタ
  main.appendChild(sectionTitle('外部システム連携 <span class="muted">プル型：URL から CSV / JSON を定期取得</span>'));
  const connList = connectors.map((c) => `<tr><td>${esc(c.name)}</td><td><code>${c.dataset}</code></td><td style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${esc(c.url)}</td>
    <td>${c.format.toUpperCase()}</td><td>${c.interval_minutes ? `${c.interval_minutes}分毎` : '手動'}</td>
    <td>${c.last_status ? statusChip(c.last_status === 'ok' ? 'good' : 'critical', c.last_message || c.last_status) : '<span class="muted">未実行</span>'}</td>
    <td><button class="btn small run" data-id="${c.id}">今すぐ同期</button> <button class="btn small danger del" data-id="${c.id}">削除</button></td></tr>`).join('');
  const conn = card('コネクタ', `${connectors.length}件`, `
    ${connectors.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>名前</th><th>先</th><th>URL</th><th>形式</th><th>頻度</th><th>最終結果</th><th></th></tr></thead><tbody>${connList}</tbody></table></div>` : '<p class="muted">会計・人事・CRM 等の SaaS のレポート API、スプレッドシートの CSV 公開 URL などを登録すると定期的に取り込みます。</p>'}
    <form class="connector" style="margin-top:12px">
      <label>名前<input type="text" name="name" required placeholder="例: freee 月次PL"></label>
      <label>取込先<select name="dataset">${datasets.map((d) => `<option value="${d.id}">${esc(d.label)}</option>`).join('')}</select></label>
      <label>形式<select name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></label>
      <label>取込方法<select name="mode"><option value="upsert">追加・更新</option><option value="replace">全件入れ替え</option></select></label>
      <label>実行間隔（分, 0=手動）<input type="number" name="interval_minutes" value="60" min="0"></label>
      <label>JSON パス（配列の位置）<input type="text" name="json_path" placeholder="例: data.items"></label>
      <label class="wide">URL<input type="url" name="url" required placeholder="https://..."></label>
      <label class="wide">HTTP ヘッダ（JSON・認証トークン等）<input type="text" name="headers" placeholder='{"Authorization": "Bearer xxxx"}'></label>
      <div><button class="btn primary">コネクタを追加</button></div>
    </form><div class="out"></div>`);
  $('form', conn).onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { await api('/api/connectors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); render(); }
    catch (err) { $('.out', conn).innerHTML = `<div class="result err">${esc(err.message)}</div>`; }
  };
  conn.querySelectorAll('.run').forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = '同期中…';
    await api(`/api/connectors/${b.dataset.id}/run`, { method: 'POST' });
    state.cockpit = null; render();
  }));
  conn.querySelectorAll('.del').forEach((b) => (b.onclick = async () => {
    if (!confirm('このコネクタを削除しますか？')) return;
    await api(`/api/connectors/${b.dataset.id}`, { method: 'DELETE' }); render();
  }));

  const origin = location.origin;
  const apiDoc = card('API で送る', 'プッシュ型', `
    <p class="muted" style="margin-top:0">他システムやバッチ（Zapier, GAS, cron 等）から直接投入できます。CSV でも JSON でも OK。全件検証に通った場合のみ反映されます。</p>
    <pre class="code">curl -X POST "${origin}/api/datasets/financials/import?mode=upsert" \\
  -H "Content-Type: text/csv" --data-binary @financials.csv</pre>
    <pre class="code">curl -X POST "${origin}/api/datasets/kpis/import" \\
  -H "Content-Type: application/json" \\
  -d '[{"month":"2026-10","business_unit":"SaaS事業","kpi":"MRR","actual":52000000,"target":50000000,"unit":"円"}]'</pre>
    <p class="muted">指標は <code>GET /api/cockpit?month=YYYY-MM</code> で JSON 取得できます（Slack 通知や BI 連携に）。<code>?dryRun=1</code> で検証のみ。</p>`);
  main.appendChild(grid('cols-2', [conn, apiDoc]));

  main.appendChild(sectionTitle('取込履歴'));
  const logRows = imports.map((l) => `<tr><td>${esc(l.created_at)}</td><td><code>${l.dataset}</code></td><td>${esc(l.source)}</td><td>${l.mode}</td><td class="num">${l.rows}</td>
    <td>${statusChip(l.status === 'error' ? 'critical' : l.status === 'ok' ? 'good' : 'none', l.status)}</td><td class="muted" style="white-space:normal">${esc(l.message || '')}</td></tr>`).join('');
  const log = card('直近50件', 'UTC', `<div class="table-wrap"><table class="data"><thead><tr><th>日時</th><th>データセット</th><th>ソース</th><th>方法</th><th class="num">行数</th><th>結果</th><th>メッセージ</th></tr></thead><tbody>${logRows || '<tr><td colspan="7" class="muted">履歴なし</td></tr>'}</tbody></table></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="seed">サンプルデータを投入</button><span class="muted">デモ用。全データセットを置き換えます。</span></div>`);
  main.appendChild(log);
  $('#seed').onclick = seedSample;
}

// ───────────── 起動 ─────────────
$('#month').onchange = async (e) => { state.month = e.target.value; await load(); render(); };
addEventListener('hashchange', render);
let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => document.querySelectorAll('.chart').forEach((c) => c._redraw?.()), 150); });
render();
