// 外部システム連携（プル型）
// 任意の URL から CSV / JSON を取得してデータセットに取り込む。
// 例: 会計SaaS・人事SaaSのレポートAPI、BI のエクスポートURL、Google スプレッドシートの CSV 公開URL など。
// プッシュ型は server.js の POST /api/datasets/:id/import を外部から叩く。

import { csvToObjects } from './csv.js';
import { importRecords } from './db.js';

export function getByPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export async function runConnector(db, c, fetchImpl = fetch) {
  let result;
  try {
    const headers = JSON.parse(c.headers || '{}');
    const res = await fetchImpl(c.url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let records;
    if (c.format === 'json') {
      records = getByPath(await res.json(), c.json_path);
      if (!Array.isArray(records)) throw new Error(`JSON パス "${c.json_path || '(root)'}" が配列ではありません`);
    } else {
      records = csvToObjects(await res.text());
    }
    result = importRecords(db, c.dataset, records, { mode: c.mode, source: `connector:${c.name}` });
  } catch (e) {
    result = { ok: false, errors: [{ line: 0, message: e.message }] };
  }
  const message = result.ok ? `${result.rows}件取込` : result.errors.map((e) => (e.line ? `${e.line}行目: ` : '') + e.message).slice(0, 3).join(' / ');
  db.prepare(`UPDATE connectors SET last_run_at = datetime('now'), last_status = ?, last_message = ? WHERE id = ?`)
    .run(result.ok ? 'ok' : 'error', message, c.id);
  return result;
}

/** interval_minutes > 0 のコネクタを定期実行 */
export function startScheduler(db, { tickMs = 60_000 } = {}) {
  const running = new Set();
  const tick = async () => {
    const due = db.prepare(`
      SELECT * FROM connectors WHERE interval_minutes > 0 AND (
        last_run_at IS NULL OR datetime(last_run_at, '+' || interval_minutes || ' minutes') <= datetime('now'))`).all();
    for (const c of due) {
      if (running.has(c.id)) continue;
      running.add(c.id);
      runConnector(db, c).finally(() => running.delete(c.id));
    }
  };
  const timer = setInterval(tick, tickMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
