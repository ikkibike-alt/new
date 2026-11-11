import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DATASETS, normalizeRows } from './datasets.js';

const SQL_TYPE = { number: 'REAL', string: 'TEXT', date: 'TEXT', month: 'TEXT', enum: 'TEXT' };

export function openDb(file = process.env.COCKPIT_DB || 'data/cockpit.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  for (const [id, def] of Object.entries(DATASETS)) {
    const cols = def.columns.map((c) => `"${c.name}" ${SQL_TYPE[c.type]}`).join(', ');
    db.exec(`CREATE TABLE IF NOT EXISTS ds_${id} (${cols}, PRIMARY KEY (${def.key.map((k) => `"${k}"`).join(', ')}))`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset TEXT NOT NULL, source TEXT NOT NULL, mode TEXT NOT NULL,
      rows INTEGER NOT NULL, status TEXT NOT NULL, message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS connectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, dataset TEXT NOT NULL, url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'csv', json_path TEXT DEFAULT '',
      headers TEXT DEFAULT '{}', mode TEXT NOT NULL DEFAULT 'upsert',
      interval_minutes INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT, last_status TEXT, last_message TEXT
    );
  `);
  return db;
}

function logImport(db, { dataset, source, mode, rows, status, message }) {
  db.prepare('INSERT INTO import_log (dataset, source, mode, rows, status, message) VALUES (?, ?, ?, ?, ?, ?)')
    .run(dataset, source, mode, rows, status, message ?? null);
}

/**
 * レコード配列を検証してデータセットに取り込む（全件成功 or 全件ロールバック）。
 * mode: 'upsert'（キー一致は上書き） | 'replace'（データセットを全入れ替え）
 */
export function importRecords(db, datasetId, records, { mode = 'upsert', source = 'api', dryRun = false } = {}) {
  const def = DATASETS[datasetId];
  if (!def) return { ok: false, errors: [{ line: 0, message: `不明なデータセット: ${datasetId}` }] };
  if (!['upsert', 'replace'].includes(mode)) return { ok: false, errors: [{ line: 0, message: `mode は upsert / replace` }] };

  const { rows, errors } = normalizeRows(datasetId, records);
  if (!rows.length && !errors.length) errors.push({ line: 0, message: 'データ行がありません' });
  if (errors.length || dryRun) {
    if (errors.length && !dryRun) {
      logImport(db, { dataset: datasetId, source, mode, rows: 0, status: 'error', message: `${errors.length}件のエラー: ${errors[0].message}` });
    }
    return { ok: !errors.length, rows: rows.length, errors: errors.slice(0, 100), errorCount: errors.length, preview: rows.slice(0, 10) };
  }

  const names = def.columns.map((c) => c.name);
  const quoted = names.map((n) => `"${n}"`).join(', ');
  const updates = names.filter((n) => !def.key.includes(n)).map((n) => `"${n}" = excluded."${n}"`).join(', ');
  const stmt = db.prepare(
    `INSERT INTO ds_${datasetId} (${quoted}) VALUES (${names.map(() => '?').join(', ')})` +
      ` ON CONFLICT (${def.key.map((k) => `"${k}"`).join(', ')}) DO ${updates ? `UPDATE SET ${updates}` : 'NOTHING'}`,
  );
  db.exec('BEGIN');
  try {
    if (mode === 'replace') db.exec(`DELETE FROM ds_${datasetId}`);
    for (const r of rows) stmt.run(...names.map((n) => r[n]));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    logImport(db, { dataset: datasetId, source, mode, rows: 0, status: 'error', message: e.message });
    return { ok: false, errors: [{ line: 0, message: e.message }] };
  }
  logImport(db, { dataset: datasetId, source, mode, rows: rows.length, status: 'ok' });
  return { ok: true, rows: rows.length, errors: [] };
}

export function allRows(db, datasetId) {
  return db.prepare(`SELECT * FROM ds_${datasetId}`).all().map((r) => ({ ...r }));
}

export function datasetSummary(db) {
  return Object.entries(DATASETS).map(([id, def]) => {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ds_${id}`).get();
    const last = db.prepare(`SELECT created_at, source, rows FROM import_log WHERE dataset = ? AND status = 'ok' ORDER BY id DESC LIMIT 1`).get(id);
    return { id, ...def, rowCount: n, lastImport: last ? { ...last } : null };
  });
}

export function clearDataset(db, datasetId) {
  db.exec(`DELETE FROM ds_${datasetId}`);
  logImport(db, { dataset: datasetId, source: 'ui', mode: 'clear', rows: 0, status: 'cleared', message: '全件削除' });
}
