// デモ用サンプルデータ生成（決定的乱数なので毎回同じ結果）
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDb, importRecords } from './db.js';
import { monthRange } from './metrics.js';
import { toCsv } from './csv.js';
import { templateHeader } from './datasets.js';

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function generateSample(endMonth = '2026-10') {
  const rand = rng(42);
  const months = monthRange(endMonth, 24);
  const BUS = [
    { name: 'SaaS事業', base: 42_000_000, growth: 0.025, cogs: 0.28 },
    { name: 'コンサル事業', base: 26_000_000, growth: 0.008, cogs: 0.55 },
    { name: '新規事業', base: 3_000_000, growth: 0.07, cogs: 0.45 },
  ];
  const SGA = [
    ['人件費', 0.22], ['広告宣伝費', 0.07], ['地代家賃', 0.035], ['外注費', 0.04], ['その他販管費', 0.03],
  ];

  const financials = [];
  months.forEach((ym, i) => {
    let totalRev = 0;
    for (const bu of BUS) {
      const trend = bu.base * (1 + bu.growth) ** i;
      const season = 1 + 0.06 * Math.sin((i / 12) * Math.PI * 2);
      const budgetRev = Math.round(trend * season * 1.04);
      // 新規事業は直近で伸び悩むシナリオ
      const miss = bu.name === '新規事業' && i > 17 ? 0.78 : 1;
      const actRev = Math.round(trend * season * (0.93 + rand() * 0.14) * miss);
      totalRev += actRev;
      for (const [sc, rev] of [['actual', actRev], ['budget', budgetRev]]) {
        financials.push({ month: ym, business_unit: bu.name, category: 'revenue', account: '売上高', scenario: sc, amount: rev });
        financials.push({ month: ym, business_unit: bu.name, category: 'cogs', account: '売上原価', scenario: sc, amount: Math.round(rev * bu.cogs * (sc === 'actual' ? 0.97 + rand() * 0.08 : 1)) });
      }
      for (const [acc, r] of SGA) {
        const bRev = budgetRev;
        const fixed = bu.name === '新規事業' ? 2.2 : 1; // 新規事業は先行投資で販管費が重い
        financials.push({ month: ym, business_unit: bu.name, category: 'sga', account: acc, scenario: 'budget', amount: Math.round(bRev * r * fixed) });
        financials.push({ month: ym, business_unit: bu.name, category: 'sga', account: acc, scenario: 'actual', amount: Math.round(bRev * r * fixed * (0.95 + rand() * 0.12)) });
      }
    }
    void totalRev;
  });

  // 資金残高: 営業利益の積み上げ + 季節的な支出
  const cash = [];
  let balance = 180_000_000;
  months.forEach((ym, i) => {
    const op = financials.filter((r) => r.month === ym && r.scenario === 'actual')
      .reduce((a, r) => a + (r.category === 'revenue' ? r.amount : -r.amount), 0);
    balance += op * 0.85 - (i % 6 === 5 ? 18_000_000 : 0) - 6_000_000;
    cash.push({ month: ym, account: '三井住友 普通', balance: Math.round(balance * 0.7) });
    cash.push({ month: ym, account: 'みずほ 普通', balance: Math.round(balance * 0.3) });
  });

  // 社員
  const DEPTS = [
    ['開発部', 34, 330_000], ['営業部', 22, 270_000], ['コンサルティング部', 26, 310_000],
    ['カスタマーサクセス部', 12, 230_000], ['管理部', 9, 250_000], ['新規事業室', 6, 320_000],
  ];
  const LAST = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '松本', '井上', '木村'];
  const FIRST = ['翔太', '美咲', '大輔', '彩', '健', '陽菜', '拓也', '結衣', '直樹', '真由', '亮', '舞', '悠斗', '葵', '誠', '玲奈'];
  const employees = [];
  let id = 1;
  const startTs = Date.parse(`${months[0]}-01`);
  const endTs = Date.parse(`${endMonth}-28`);
  const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
  for (const [dept, size, cost] of DEPTS) {
    // 既存社員
    for (let k = 0; k < size; k++) {
      const hire = iso(Date.parse('2015-04-01') + rand() * (startTs - Date.parse('2015-04-01')));
      const leaves = rand() < (dept === 'カスタマーサクセス部' ? 0.45 : 0.14);
      employees.push({
        employee_id: `E${String(id++).padStart(4, '0')}`,
        name: `${LAST[Math.floor(rand() * LAST.length)]} ${FIRST[Math.floor(rand() * FIRST.length)]}`,
        department: dept,
        position: rand() < 0.15 ? 'マネージャー' : rand() < 0.3 ? 'リーダー' : 'メンバー',
        employment_type: rand() < 0.85 ? '正社員' : rand() < 0.6 ? '契約社員' : 'パート',
        hire_date: hire,
        leave_date: leaves ? iso(startTs + rand() * (endTs - startTs)) : '',
        monthly_cost: Math.round(cost * (0.7 + rand() * 0.7) / 1000) * 1000,
      });
    }
    // 期間中の採用
    const newHires = Math.round(size * 0.3);
    for (let k = 0; k < newHires; k++) {
      employees.push({
        employee_id: `E${String(id++).padStart(4, '0')}`,
        name: `${LAST[Math.floor(rand() * LAST.length)]} ${FIRST[Math.floor(rand() * FIRST.length)]}`,
        department: dept, position: 'メンバー', employment_type: rand() < 0.8 ? '正社員' : '契約社員',
        hire_date: iso(startTs + rand() * (endTs - startTs)), leave_date: '',
        monthly_cost: Math.round(cost * (0.7 + rand() * 0.4) / 1000) * 1000,
      });
    }
  }

  // KPI
  const kpis = [];
  const KPI_DEF = [
    { bu: 'SaaS事業', kpi: 'MRR', unit: '円', start: 38_000_000, g: 0.025, noise: 0.02, tg: 0.99 },
    { bu: 'SaaS事業', kpi: '有料顧客数', unit: '社', start: 410, g: 0.02, noise: 0.015, tg: 0.99 },
    { bu: 'SaaS事業', kpi: '解約率', unit: '%', start: 1.4, g: 0.01, noise: 0.15, tg: 0.85, lower: true },
    { bu: 'SaaS事業', kpi: '商談数', unit: '件', start: 120, g: 0.015, noise: 0.12, tg: 0.95 },
    { bu: 'コンサル事業', kpi: '稼働率', unit: '%', start: 78, g: 0.001, noise: 0.05, tg: 1.03 },
    { bu: 'コンサル事業', kpi: '受注残', unit: '円', start: 90_000_000, g: 0.01, noise: 0.08, tg: 0.97 },
    { bu: 'コンサル事業', kpi: '平均単価', unit: '円', start: 1_600_000, g: 0.004, noise: 0.03, tg: 1.0 },
    { bu: '新規事業', kpi: '登録ユーザー数', unit: '人', start: 1200, g: 0.09, noise: 0.05, tg: 1.15 },
    { bu: '新規事業', kpi: 'CAC', unit: '円', start: 18_000, g: 0.015, noise: 0.08, tg: 0.85, lower: true },
  ];
  for (const d of KPI_DEF) {
    months.forEach((ym, i) => {
      const base = d.start * (1 + d.g) ** i;
      const actual = base * (1 + (rand() - 0.5) * 2 * d.noise);
      const round = (v) => (d.unit === '%' ? Math.round(v * 100) / 100 : Math.round(v));
      kpis.push({ month: ym, business_unit: d.bu, kpi: d.kpi, actual: round(actual), target: round(base * d.tg), unit: d.unit, direction: d.lower ? 'lower' : 'higher' });
    });
  }
  return { employees, financials, cash, kpis };
}

export function seed(db, endMonth) {
  const sample = generateSample(endMonth);
  const results = {};
  for (const [ds, rows] of Object.entries(sample)) {
    results[ds] = importRecords(db, ds, rows, { mode: 'replace', source: 'sample' });
  }
  return results;
}

// `npm run seed` で直接実行した場合: DB 投入 + samples/*.csv を書き出し
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const r = seed(db);
  console.log(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.ok ? `${v.rows} rows` : v.errors])));
  mkdirSync('samples', { recursive: true });
  for (const [ds, rows] of Object.entries(generateSample())) writeFileSync(`samples/${ds}.csv`, '﻿' + toCsv(templateHeader(ds), rows));
  console.log('samples/*.csv を書き出しました');
}
