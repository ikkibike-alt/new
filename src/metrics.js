// 元データ → 経営指標 の計算ロジック（純粋関数。DB に依存しない）

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = y * 12 + (m - 1) + n;
  return `${Math.floor(d / 12)}-${String((d % 12) + 1).padStart(2, '0')}`;
}

export function monthRange(endYm, count) {
  return Array.from({ length: count }, (_, i) => addMonths(endYm, i - count + 1));
}

const monthEnd = (ym) => `${ym}-31`; // 文字列比較用（YYYY-MM-DD <= YYYY-MM-31）
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const ratio = (a, b) => (b ? a / b : null);
const groupBy = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {});

export function availableMonths(data) {
  const s = new Set();
  for (const r of data.financials) s.add(r.month);
  for (const r of data.cash) s.add(r.month);
  for (const r of data.kpis) s.add(r.month);
  return [...s].sort();
}

export function latestMonth(data) {
  const actual = data.financials.filter((r) => r.scenario === 'actual').map((r) => r.month).sort();
  if (actual.length) return actual.at(-1);
  const all = availableMonths(data);
  if (all.length) return all.at(-1);
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ───────────────────────── 金 ─────────────────────────
function pl(rows) {
  const revenue = sum(rows.filter((r) => r.category === 'revenue'), (r) => r.amount);
  const cogs = sum(rows.filter((r) => r.category === 'cogs'), (r) => r.amount);
  const sga = sum(rows.filter((r) => r.category === 'sga'), (r) => r.amount);
  const gross = revenue - cogs;
  const op = gross - sga;
  return { revenue, cogs, sga, gross, op, grossMargin: ratio(gross, revenue), opMargin: ratio(op, revenue) };
}

function fiscalStart(ym, startMonth) {
  const [y, m] = ym.split('-').map(Number);
  const fy = m >= startMonth ? y : y - 1;
  return `${fy}-${String(startMonth).padStart(2, '0')}`;
}

export function moneyMetrics(data, month, { fiscalStartMonth = 4 } = {}) {
  const fin = data.financials;
  const byKey = groupBy(fin, (r) => `${r.scenario}|${r.month}`);
  const plOf = (scenario, ym) => pl(byKey[`${scenario}|${ym}`] || []);
  const window = monthRange(month, 12);

  const actual = plOf('actual', month);
  const budget = plOf('budget', month);
  const prev = plOf('actual', addMonths(month, -1));
  const lastYear = plOf('actual', addMonths(month, -12));

  const fyStart = fiscalStart(month, fiscalStartMonth);
  const inFy = (r) => r.month >= fyStart && r.month <= month;
  const ytdActual = pl(fin.filter((r) => r.scenario === 'actual' && inFy(r)));
  const ytdBudget = pl(fin.filter((r) => r.scenario === 'budget' && inFy(r)));

  const series = window.map((ym) => {
    const a = plOf('actual', ym);
    const b = plOf('budget', ym);
    return { month: ym, revenue: a.revenue, revenueBudget: b.revenue, op: a.op, opBudget: b.op, gross: a.gross };
  });

  const sgaBreakdown = Object.entries(
    groupBy(fin.filter((r) => r.scenario === 'actual' && r.month === month && r.category === 'sga'), (r) => r.account || 'その他'),
  )
    .map(([account, rows]) => ({ account, amount: sum(rows, (r) => r.amount) }))
    .sort((a, b) => b.amount - a.amount);

  // 資金
  const cashByMonth = Object.fromEntries(Object.entries(groupBy(data.cash, (r) => r.month)).map(([m, rows]) => [m, sum(rows, (r) => r.balance)]));
  const cashSeries = window.map((ym) => ({ month: ym, balance: cashByMonth[ym] ?? null }));
  const cashNow = cashByMonth[month] ?? null;
  const cash3 = cashByMonth[addMonths(month, -3)];
  const monthlyBurn = cashNow !== null && cash3 !== undefined ? (cash3 - cashNow) / 3 : null; // 正 = 減少
  const runwayMonths = monthlyBurn && monthlyBurn > 0 ? cashNow / monthlyBurn : null;

  return {
    actual, budget, prev, lastYear,
    revenueAchievement: ratio(actual.revenue, budget.revenue),
    opAchievement: budget.op > 0 ? ratio(actual.op, budget.op) : null,
    revenueMoM: ratio(actual.revenue - prev.revenue, prev.revenue),
    revenueYoY: ratio(actual.revenue - lastYear.revenue, lastYear.revenue),
    ytd: { from: fyStart, actual: ytdActual, budget: ytdBudget, revenueAchievement: ratio(ytdActual.revenue, ytdBudget.revenue) },
    series, sgaBreakdown,
    cash: { balance: cashNow, monthlyBurn, runwayMonths, series: cashSeries },
  };
}

// ───────────────────────── 人 ─────────────────────────
export function peopleMetrics(data, month, revenue = 0) {
  const emps = data.employees;
  const activeAt = (ym) => emps.filter((e) => e.hire_date <= monthEnd(ym) && (!e.leave_date || e.leave_date > monthEnd(ym)));
  const window = monthRange(month, 12);

  const series = window.map((ym) => ({
    month: ym,
    headcount: activeAt(ym).length,
    hires: emps.filter((e) => e.hire_date?.startsWith(ym)).length,
    leavers: emps.filter((e) => e.leave_date?.startsWith(ym)).length,
  }));
  const active = activeAt(month);
  const headcount = active.length;
  const prevHeadcount = activeAt(addMonths(month, -1)).length;
  const leavers12 = sum(series, (s) => s.leavers);
  const hires12 = sum(series, (s) => s.hires);
  const avgHead = sum(series, (s) => s.headcount) / series.length;
  const laborCost = sum(active, (e) => e.monthly_cost);

  const refDate = new Date(`${monthEnd(month).slice(0, 7)}-28`);
  const tenure = (e) => (refDate - new Date(e.hire_date)) / (365.25 * 864e5);

  const inWindow = (d) => d && d >= `${window[0]}-01` && d <= monthEnd(month);
  const departments = Object.entries(groupBy(emps, (e) => e.department || '未設定'))
    .map(([department, list]) => {
      const act = list.filter((e) => active.includes(e));
      return {
        department,
        headcount: act.length,
        hires12: list.filter((e) => inWindow(e.hire_date)).length,
        leavers12: list.filter((e) => inWindow(e.leave_date)).length,
        laborCost: sum(act, (e) => e.monthly_cost),
        avgTenure: act.length ? sum(act, tenure) / act.length : null,
      };
    })
    .filter((d) => d.headcount || d.leavers12)
    .sort((a, b) => b.headcount - a.headcount);

  const employmentTypes = Object.entries(groupBy(active, (e) => e.employment_type || '未設定'))
    .map(([type, list]) => ({ type, headcount: list.length }))
    .sort((a, b) => b.headcount - a.headcount);

  return {
    headcount, prevHeadcount,
    hires: series.at(-1).hires, leavers: series.at(-1).leavers,
    hires12, leavers12,
    turnoverRate12: ratio(leavers12, avgHead),
    laborCost,
    laborCostRatio: ratio(laborCost, revenue),
    revenuePerHead: ratio(revenue, headcount),
    avgTenure: headcount ? sum(active, tenure) / headcount : null,
    series, departments, employmentTypes,
  };
}

// ───────────────────────── 事業 ─────────────────────────
export function kpiAchievement(k) {
  if (k.target === null || k.target === undefined || k.target === 0) return null;
  if (k.direction === 'lower') return k.actual === 0 ? 2 : k.target / k.actual;
  return k.actual / k.target;
}

export function kpiStatus(ach) {
  if (ach === null) return 'none';
  if (ach >= 1) return 'good';
  if (ach >= 0.9) return 'warning';
  return 'critical';
}

export function businessMetrics(data, month) {
  const window = monthRange(month, 12);
  const kpiGroups = groupBy(data.kpis, (k) => `${k.business_unit}|${k.kpi}`);
  const kpis = Object.values(kpiGroups)
    .map((rows) => {
      const byM = Object.fromEntries(rows.map((r) => [r.month, r]));
      const cur = byM[month];
      if (!cur) return null;
      const prev = byM[addMonths(month, -1)];
      const ach = kpiAchievement(cur);
      return {
        business_unit: cur.business_unit, kpi: cur.kpi, unit: cur.unit, direction: cur.direction,
        actual: cur.actual, target: cur.target, prev: prev?.actual ?? null,
        achievement: ach, status: kpiStatus(ach),
        series: window.map((ym) => ({ month: ym, actual: byM[ym]?.actual ?? null, target: byM[ym]?.target ?? null })),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.business_unit.localeCompare(b.business_unit, 'ja') || a.kpi.localeCompare(b.kpi, 'ja'));

  const finM = data.financials.filter((r) => r.month === month);
  const units = [...new Set([...finM.map((r) => r.business_unit), ...kpis.map((k) => k.business_unit)])].sort((a, b) => a.localeCompare(b, 'ja'));
  const businessUnits = units.map((bu) => {
    const a = pl(finM.filter((r) => r.business_unit === bu && r.scenario === 'actual'));
    const b = pl(finM.filter((r) => r.business_unit === bu && r.scenario === 'budget'));
    const ks = kpis.filter((k) => k.business_unit === bu);
    const series = window.map((ym) => ({
      month: ym,
      revenue: pl(data.financials.filter((r) => r.month === ym && r.business_unit === bu && r.scenario === 'actual')).revenue,
    }));
    return {
      business_unit: bu,
      revenue: a.revenue, revenueBudget: b.revenue, op: a.op, opBudget: b.op, opMargin: a.opMargin,
      revenueAchievement: ratio(a.revenue, b.revenue),
      kpiStatus: { good: ks.filter((k) => k.status === 'good').length, warning: ks.filter((k) => k.status === 'warning').length, critical: ks.filter((k) => k.status === 'critical').length },
      series,
    };
  });

  const counts = { good: 0, warning: 0, critical: 0, none: 0 };
  for (const k of kpis) counts[k.status]++;
  return { kpis, businessUnits, kpiCounts: counts };
}

// ───────────────────────── 総合 ─────────────────────────
export function buildAlerts({ money, people, business }, thresholds = {}) {
  const t = { revenueAch: 0.95, runway: 12, turnover: 0.15, laborRatio: 0.5, ...thresholds };
  const alerts = [];
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (money.revenueAchievement !== null && money.revenueAchievement < t.revenueAch)
    alerts.push({ level: money.revenueAchievement < 0.9 ? 'critical' : 'warning', domain: '金', message: `売上が予算未達（達成率 ${pct(money.revenueAchievement)}）` });
  if (money.actual.revenue && money.actual.op < 0) alerts.push({ level: 'critical', domain: '金', message: '営業利益が赤字' });
  if (money.cash.runwayMonths !== null && money.cash.runwayMonths < t.runway)
    alerts.push({ level: money.cash.runwayMonths < 6 ? 'critical' : 'warning', domain: '金', message: `資金ランウェイ ${money.cash.runwayMonths.toFixed(1)}ヶ月` });
  if (people.turnoverRate12 !== null && people.turnoverRate12 > t.turnover)
    alerts.push({ level: 'warning', domain: '人', message: `直近12ヶ月の離職率 ${pct(people.turnoverRate12)}` });
  if (people.laborCostRatio !== null && people.laborCostRatio > t.laborRatio)
    alerts.push({ level: 'warning', domain: '人', message: `人件費率 ${pct(people.laborCostRatio)}` });
  for (const d of people.departments) {
    if (d.headcount >= 5 && d.leavers12 / d.headcount > 0.25)
      alerts.push({ level: 'warning', domain: '人', message: `${d.department}: 12ヶ月で${d.leavers12}名退職` });
  }
  for (const bu of business.businessUnits) {
    if (bu.revenue && bu.op < 0) alerts.push({ level: 'critical', domain: '事業', message: `${bu.business_unit}: 営業赤字` });
  }
  for (const k of business.kpis.filter((k) => k.status === 'critical'))
    alerts.push({ level: 'critical', domain: '事業', message: `${k.business_unit} / ${k.kpi}: 目標比 ${pct(k.achievement)}` });
  const order = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export function buildCockpit(data, month, opts = {}) {
  const m = month || latestMonth(data);
  const money = moneyMetrics(data, m, opts);
  const people = peopleMetrics(data, m, money.actual.revenue);
  const business = businessMetrics(data, m);
  return { month: m, months: availableMonths(data), money, people, business, alerts: buildAlerts({ money, people, business }) };
}
