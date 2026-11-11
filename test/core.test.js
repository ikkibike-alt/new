import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseCsv, csvToObjects, toCsv } from '../src/csv.js';
import { normalizeRows } from '../src/datasets.js';
import { openDb, importRecords, allRows } from '../src/db.js';
import { buildCockpit, addMonths, kpiAchievement } from '../src/metrics.js';
import { generateSample } from '../src/seed.js';
import { createApp } from '../src/server.js';
import { runConnector } from '../src/connectors.js';

test('CSV: quotes, commas, newlines, BOM round-trip', () => {
  const text = '﻿a,b\r\n"x,1","he said ""hi"""\n"multi\nline",2\n\n';
  assert.deepEqual(parseCsv(text), [['a', 'b'], ['x,1', 'he said "hi"'], ['multi\nline', '2']]);
  const rows = csvToObjects(text);
  assert.deepEqual(csvToObjects(toCsv(['a', 'b'], rows)), rows);
});

test('normalize: Japanese headers, enums, number/date formats', () => {
  const { rows, errors } = normalizeRows('financials', [
    { 年月: '2026/4', 事業: 'A', 区分: '売上', 金額: '¥1,200,000', シナリオ: '予算' },
    { 年月: '2026年5月', 区分: '販管費', 科目: '広告', 金額: '(500)' },
  ]);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].month, '2026-04');
  assert.equal(rows[0].category, 'revenue');
  assert.equal(rows[0].scenario, 'budget');
  assert.equal(rows[0].amount, 1200000);
  assert.equal(rows[1].business_unit, '全社');
  assert.equal(rows[1].amount, -500);
  assert.equal(rows[1].scenario, 'actual');
});

test('normalize: reports line numbers and missing columns', () => {
  const r1 = normalizeRows('employees', [{ employee_id: '1', name: 'x' }]);
  assert.match(r1.errors[0].message, /必須列/);
  const r2 = normalizeRows('employees', [
    { employee_id: '1', name: 'a', department: 'd', hire_date: '2020-01-01' },
    { employee_id: '2', name: 'b', department: 'd', hire_date: 'yesterday' },
  ]);
  assert.equal(r2.errors.length, 1);
  assert.equal(r2.errors[0].line, 3);
});

test('import is atomic and upsert overwrites by key', () => {
  const db = openDb(':memory:');
  const base = { month: '2026-01', account: 'A', balance: 100 };
  assert.equal(importRecords(db, 'cash', [base]).ok, true);
  assert.equal(importRecords(db, 'cash', [{ ...base, balance: 200 }]).ok, true);
  assert.deepEqual(allRows(db, 'cash').map((r) => r.balance), [200]);
  const bad = importRecords(db, 'cash', [{ ...base, account: 'B' }, { month: 'x', balance: 1 }]);
  assert.equal(bad.ok, false);
  assert.equal(allRows(db, 'cash').length, 1);
  importRecords(db, 'cash', [{ month: '2026-02', account: 'Z', balance: 1 }], { mode: 'replace' });
  assert.deepEqual(allRows(db, 'cash').map((r) => r.account), ['Z']);
});

test('metrics: P&L, headcount, turnover, KPI status', () => {
  const data = {
    financials: [
      { month: '2026-03', business_unit: 'A', category: 'revenue', account: '', scenario: 'actual', amount: 1000 },
      { month: '2026-03', business_unit: 'A', category: 'cogs', account: '', scenario: 'actual', amount: 300 },
      { month: '2026-03', business_unit: 'A', category: 'sga', account: '家賃', scenario: 'actual', amount: 500 },
      { month: '2026-03', business_unit: 'A', category: 'revenue', account: '', scenario: 'budget', amount: 1250 },
    ],
    cash: [{ month: '2025-12', account: 'x', balance: 1300 }, { month: '2026-03', account: 'x', balance: 1000 }],
    employees: [
      { employee_id: '1', department: 'D', hire_date: '2020-01-01', leave_date: null, monthly_cost: 10 },
      { employee_id: '2', department: 'D', hire_date: '2026-03-10', leave_date: null, monthly_cost: 20 },
      { employee_id: '3', department: 'D', hire_date: '2020-01-01', leave_date: '2026-03-15', monthly_cost: 30 },
    ],
    kpis: [{ month: '2026-03', business_unit: 'A', kpi: '解約率', actual: 2, target: 1.5, unit: '%', direction: 'lower' }],
  };
  const c = buildCockpit(data);
  assert.equal(c.month, '2026-03');
  assert.equal(c.money.actual.op, 200);
  assert.equal(c.money.revenueAchievement, 0.8);
  assert.equal(c.money.cash.monthlyBurn, 100);
  assert.equal(c.money.cash.runwayMonths, 10);
  assert.equal(c.people.headcount, 2);
  assert.equal(c.people.prevHeadcount, 2);
  assert.equal(c.people.hires, 1);
  assert.equal(c.people.leavers, 1);
  assert.equal(c.people.laborCost, 30);
  assert.equal(c.business.kpis[0].status, 'critical');
  assert.ok(c.alerts.some((a) => a.domain === '金' && /予算未達/.test(a.message)));
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(kpiAchievement({ actual: 1, target: 1.5, direction: 'lower' }), 1.5);
});

test('sample data imports cleanly and produces a full cockpit', () => {
  const db = openDb(':memory:');
  for (const [ds, rows] of Object.entries(generateSample('2026-10'))) assert.equal(importRecords(db, ds, rows).ok, true, ds);
  const data = Object.fromEntries(['employees', 'financials', 'cash', 'kpis'].map((d) => [d, allRows(db, d)]));
  const c = buildCockpit(data);
  assert.equal(c.month, '2026-10');
  assert.ok(c.people.headcount > 50);
  assert.ok(c.money.actual.revenue > 0);
  assert.equal(c.business.businessUnits.length, 3);
});

async function withServer(env, fn) {
  const db = openDb(':memory:');
  const srv = http.createServer(createApp({ db, env })).listen(0);
  await new Promise((r) => srv.once('listening', r));
  try { await fn(`http://127.0.0.1:${srv.address().port}`, db); } finally { srv.close(); }
}

test('HTTP API: CSV import, dry run, cockpit, auth', async () => {
  await withServer({}, async (base) => {
    const csv = '年月,口座,残高\n2026-01,A,"1,000"\n';
    let r = await fetch(`${base}/api/datasets/cash/import?dryRun=1`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
    assert.equal((await r.json()).rows, 1);
    r = await fetch(`${base}/api/datasets/cash/import`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/datasets/cash/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[{"month":"bad","balance":1}]' });
    assert.equal(r.status, 422);
    const c = await (await fetch(`${base}/api/cockpit`)).json();
    assert.equal(c.money.cash.balance, 1000);
    assert.equal((await fetch(`${base}/api/datasets/nope/rows`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  });
  await withServer({ COCKPIT_USER: 'u', COCKPIT_PASSWORD: 'p', COCKPIT_API_TOKEN: 't' }, async (base) => {
    assert.equal((await fetch(`${base}/api/datasets`)).status, 401);
    assert.equal((await fetch(`${base}/api/datasets`, { headers: { Authorization: 'Bearer t' } })).status, 200);
    assert.equal((await fetch(`${base}/api/datasets`, { headers: { Authorization: `Basic ${btoa('u:p')}` } })).status, 200);
  });
});

test('connector pulls JSON from a URL', async () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO connectors (name, dataset, url, format, json_path) VALUES ('t', 'cash', 'http://x', 'json', 'data.items')`).run();
  const c = db.prepare('SELECT * FROM connectors').get();
  const fakeFetch = async () => new Response(JSON.stringify({ data: { items: [{ month: '2026-01', account: 'A', balance: 5 }] } }));
  const r = await runConnector(db, c, fakeFetch);
  assert.equal(r.ok, true);
  assert.equal(db.prepare('SELECT last_status FROM connectors').get().last_status, 'ok');
});
