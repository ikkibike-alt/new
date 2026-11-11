import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { openDb, importRecords, allRows, datasetSummary, clearDataset } from './db.js';
import { DATASETS, templateHeader } from './datasets.js';
import { buildCockpit } from './metrics.js';
import { csvToObjects, toCsv } from './csv.js';
import { runConnector, startScheduler } from './connectors.js';
import { seed } from './seed.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY = 20 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'ファイルが大きすぎます（上限 20MB）');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeEq(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** COCKPIT_USER/COCKPIT_PASSWORD → 画面と API に Basic 認証。COCKPIT_API_TOKEN → API に Bearer 認証も許可。 */
function authorized(req, env) {
  const { COCKPIT_USER: u, COCKPIT_PASSWORD: p, COCKPIT_API_TOKEN: t } = env;
  if (!(u && p) && !t) return true;
  const h = req.headers.authorization || '';
  if (t && h.startsWith('Bearer ') && safeEq(h.slice(7), t)) return true;
  if (u && p && h.startsWith('Basic ')) {
    const [user, ...rest] = Buffer.from(h.slice(6), 'base64').toString().split(':');
    return safeEq(user, u) && safeEq(rest.join(':'), p);
  }
  return false;
}

function parseRecords(body, contentType) {
  if (contentType.includes('json')) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new HttpError(400, 'JSON の形式が不正です'); }
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(rows)) throw new HttpError(400, 'JSON は配列、または { "rows": [...] } で送ってください');
    return rows;
  }
  return csvToObjects(body);
}

export function createApp({ db = openDb(), env = process.env } = {}) {
  const opts = { fiscalStartMonth: Number(env.FISCAL_START_MONTH) || 4 };

  const ds = (id) => {
    if (!DATASETS[id]) throw new HttpError(404, `不明なデータセット: ${id}`);
    return id;
  };

  const routes = [
    ['GET', /^\/api\/cockpit$/, (req, url) => buildCockpit(loadAll(), url.searchParams.get('month') || undefined, opts)],
    ['GET', /^\/api\/datasets$/, () => datasetSummary(db)],
    ['GET', /^\/api\/datasets\/(\w+)\/template\.csv$/, (req, url, [id]) => csvFile(`${ds(id)}_template.csv`, templateHeader(id), [])],
    ['GET', /^\/api\/datasets\/(\w+)\/export\.csv$/, (req, url, [id]) => csvFile(`${ds(id)}.csv`, templateHeader(id), allRows(db, id))],
    ['GET', /^\/api\/datasets\/(\w+)\/rows$/, (req, url, [id]) => {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 5000);
      return db.prepare(`SELECT * FROM ds_${ds(id)} LIMIT ?`).all(limit).map((r) => ({ ...r }));
    }],
    ['POST', /^\/api\/datasets\/(\w+)\/import$/, async (req, url, [id]) => {
      const records = parseRecords(await readBody(req), req.headers['content-type'] || '');
      const result = importRecords(db, ds(id), records, {
        mode: url.searchParams.get('mode') || 'upsert',
        dryRun: url.searchParams.get('dryRun') === '1',
        source: url.searchParams.get('source') || (req.headers['content-type']?.includes('json') ? 'api' : 'csv'),
      });
      return [result.ok ? 200 : 422, result];
    }],
    ['DELETE', /^\/api\/datasets\/(\w+)$/, (req, url, [id]) => (clearDataset(db, ds(id)), { ok: true })],
    ['GET', /^\/api\/imports$/, () => db.prepare('SELECT * FROM import_log ORDER BY id DESC LIMIT 50').all().map((r) => ({ ...r }))],
    ['POST', /^\/api\/sample$/, () => seed(db)],
    ['GET', /^\/api\/connectors$/, () => db.prepare('SELECT * FROM connectors ORDER BY id').all().map((r) => ({ ...r }))],
    ['POST', /^\/api\/connectors$/, async (req) => {
      let c;
      try { c = JSON.parse(await readBody(req)); } catch { throw new HttpError(400, 'JSON の形式が不正です'); }
      if (!c.name || !c.url) throw new HttpError(400, 'name と url は必須です');
      ds(c.dataset);
      if (!/^https?:\/\//.test(c.url)) throw new HttpError(400, 'url は http(s) で指定してください');
      try { JSON.parse(c.headers || '{}'); } catch { throw new HttpError(400, 'headers は JSON で指定してください'); }
      const r = db.prepare(`INSERT INTO connectors (name, dataset, url, format, json_path, headers, mode, interval_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(c.name, c.dataset, c.url, c.format === 'json' ? 'json' : 'csv', c.json_path || '', c.headers || '{}', c.mode === 'replace' ? 'replace' : 'upsert', Number(c.interval_minutes) || 0);
      return { ok: true, id: Number(r.lastInsertRowid) };
    }],
    ['DELETE', /^\/api\/connectors\/(\d+)$/, (req, url, [id]) => (db.prepare('DELETE FROM connectors WHERE id = ?').run(Number(id)), { ok: true })],
    ['POST', /^\/api\/connectors\/(\d+)\/run$/, async (req, url, [id]) => {
      const c = db.prepare('SELECT * FROM connectors WHERE id = ?').get(Number(id));
      if (!c) throw new HttpError(404, 'コネクタが見つかりません');
      const r = await runConnector(db, c);
      return [r.ok ? 200 : 422, r];
    }],
  ];

  function loadAll() {
    return Object.fromEntries(Object.keys(DATASETS).map((id) => [id, allRows(db, id)]));
  }

  function csvFile(name, header, rows) {
    return { __raw: '﻿' + toCsv(header, rows), type: 'text/csv; charset=utf-8', headers: { 'Content-Disposition': `attachment; filename="${name}"` } };
  }

  async function serveStatic(res, pathname) {
    const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
    try {
      const buf = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }

  return async function handler(req, res) {
    try {
      if (!authorized(req, env)) {
        return send(res, 401, { error: 'unauthorized' }, 'application/json; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="cockpit", charset="UTF-8"' });
      }
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
        return serveStatic(res, url.pathname);
      }
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (!m || req.method !== method) continue;
        let out = await fn(req, url, m.slice(1));
        let status = 200;
        if (Array.isArray(out) && typeof out[0] === 'number' && out.length === 2) [status, out] = out;
        if (out && out.__raw !== undefined) return send(res, status, out.__raw, out.type, out.headers);
        return send(res, status, out);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      send(res, e.status || 500, { error: e.message });
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const port = Number(process.env.PORT) || 3000;
  http.createServer(createApp({ db })).listen(port, () => {
    console.log(`経営コックピット: http://localhost:${port}`);
  });
  startScheduler(db);
}
