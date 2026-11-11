import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import type { Listing } from "./types.js";
import { groupKey } from "./normalize.js";

mkdirSync("data", { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH ?? "data/cars.db");

db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  maker TEXT NOT NULL,
  model TEXT NOT NULL,
  grade TEXT,
  year INTEGER,
  mileage_km INTEGER,
  price_man REAL,
  total_price_man REAL,
  color TEXT,
  body_type TEXT,
  pref TEXT,
  shop TEXT,
  image TEXT,
  group_key TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_maker_model ON listings(maker, model);
CREATE INDEX IF NOT EXISTS idx_group ON listings(group_key);
CREATE INDEX IF NOT EXISTS idx_price ON listings(price_man);
`);

const upsertStmt = db.prepare(`
INSERT INTO listings (source, source_id, url, title, maker, model, grade, year, mileage_km,
  price_man, total_price_man, color, body_type, pref, shop, image, group_key, fetched_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, source_id) DO UPDATE SET
  url=excluded.url, title=excluded.title, maker=excluded.maker, model=excluded.model,
  grade=excluded.grade, year=excluded.year, mileage_km=excluded.mileage_km,
  price_man=excluded.price_man, total_price_man=excluded.total_price_man,
  color=excluded.color, body_type=excluded.body_type, pref=excluded.pref,
  shop=excluded.shop, image=excluded.image, group_key=excluded.group_key,
  fetched_at=excluded.fetched_at
`);

export function upsertListings(items: Listing[]): number {
  db.exec("BEGIN");
  try {
    for (const l of items) {
      upsertStmt.run(
        l.source, l.sourceId, l.url, l.title, l.maker, l.model, l.grade, l.year,
        l.mileageKm, l.priceMan, l.totalPriceMan, l.color, l.bodyType, l.pref,
        l.shop, l.image, groupKey(l), l.fetchedAt,
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return items.length;
}

export interface SearchQuery {
  q?: string;
  maker?: string;
  model?: string;
  pref?: string;
  source?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  mileageMax?: number;
  sort?: "price_asc" | "price_desc" | "year_desc" | "mileage_asc" | "new";
  page?: number;
  perPage?: number;
}

const SORTS: Record<NonNullable<SearchQuery["sort"]>, string> = {
  price_asc: "min_price IS NULL, min_price ASC",
  price_desc: "min_price DESC",
  year_desc: "year DESC",
  mileage_asc: "mileage_km IS NULL, mileage_km ASC",
  new: "fetched_at DESC",
};

/**
 * 横断検索。同一車両（group_key が同じもの）は 1 行にまとめ、
 * 掲載サイト一覧と最安値を一緒に返す。
 */
export function search(q: SearchQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.q) {
    where.push("(title LIKE ? OR maker LIKE ? OR model LIKE ? OR grade LIKE ?)");
    const like = `%${q.q}%`;
    params.push(like, like, like, like);
  }
  if (q.maker) { where.push("maker = ?"); params.push(q.maker); }
  if (q.model) { where.push("model = ?"); params.push(q.model); }
  if (q.pref) { where.push("pref = ?"); params.push(q.pref); }
  if (q.source) { where.push("source = ?"); params.push(q.source); }
  if (q.priceMin != null) { where.push("price_man >= ?"); params.push(q.priceMin); }
  if (q.priceMax != null) { where.push("price_man <= ?"); params.push(q.priceMax); }
  if (q.yearMin != null) { where.push("year >= ?"); params.push(q.yearMin); }
  if (q.mileageMax != null) { where.push("mileage_km <= ?"); params.push(q.mileageMax); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const perPage = Math.min(q.perPage ?? 24, 100);
  const page = Math.max(q.page ?? 1, 1);
  const order = SORTS[q.sort ?? "price_asc"] ?? SORTS.price_asc;

  const grouped = `
    SELECT group_key,
      MIN(price_man) AS min_price, MAX(price_man) AS max_price,
      MAX(year) AS year, MIN(mileage_km) AS mileage_km, MAX(fetched_at) AS fetched_at,
      json_group_array(json_object(
        'source', source, 'url', url, 'title', title, 'maker', maker, 'model', model,
        'grade', grade, 'year', year, 'mileageKm', mileage_km, 'priceMan', price_man,
        'totalPriceMan', total_price_man, 'color', color, 'bodyType', body_type,
        'pref', pref, 'shop', shop, 'image', image, 'fetchedAt', fetched_at
      )) AS offers
    FROM listings ${whereSql}
    GROUP BY group_key`;

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${grouped})`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`${grouped} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage) as Array<Record<string, unknown>>;

  return {
    total,
    page,
    perPage,
    items: rows.map((r) => {
      const offers = (JSON.parse(r.offers as string) as Array<Record<string, unknown>>).sort(
        (a, b) => ((a.priceMan as number) ?? Infinity) - ((b.priceMan as number) ?? Infinity),
      );
      return { groupKey: r.group_key, minPrice: r.min_price, maxPrice: r.max_price, offers };
    }),
  };
}

export function facets() {
  const all = (sql: string) => db.prepare(sql).all() as Array<{ v: string; n: number }>;
  return {
    makers: all("SELECT maker AS v, COUNT(*) AS n FROM listings GROUP BY maker ORDER BY n DESC"),
    models: db
      .prepare("SELECT maker, model AS v, COUNT(*) AS n FROM listings GROUP BY maker, model ORDER BY n DESC")
      .all(),
    prefs: all("SELECT pref AS v, COUNT(*) AS n FROM listings WHERE pref IS NOT NULL GROUP BY pref ORDER BY n DESC"),
    sources: all("SELECT source AS v, COUNT(*) AS n FROM listings GROUP BY source ORDER BY n DESC"),
    total: (db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number }).n,
  };
}
