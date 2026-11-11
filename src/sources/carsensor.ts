// リクルートWEBサービス「カーセンサーnet 中古車API」から取得する。
// スクレイピングではなく公式 API なので、利用規約の範囲で安全に使える。
// キー発行: https://webservice.recruit.co.jp/
import type { Listing } from "../types.js";
import { normalizeMaker, normalizeModel, parseMileage, parsePriceMan, parseYear } from "../normalize.js";

const ENDPOINT = "https://webservice.recruit.co.jp/carsensor/usedcar/v1/";

interface CarsensorCar {
  id: string;
  brand?: { name?: string };
  model?: string;
  grade?: string;
  price?: string | number;
  odd?: string;
  year?: string | number;
  color?: string;
  body?: { name?: string };
  shop?: { name?: string; pref?: { name?: string } };
  photo?: { main?: { l?: string; s?: string } };
  urls?: { pc?: string };
}

export async function fetchCarsensor(opts: {
  keyword?: string;
  brand?: string; // ブランドコード（例: TO = トヨタ）
  pages?: number;
}): Promise<Listing[]> {
  const key = process.env.CARSENSOR_API_KEY;
  if (!key) {
    console.warn("[carsensor] CARSENSOR_API_KEY が未設定のためスキップ");
    return [];
  }
  const out: Listing[] = [];
  const pages = opts.pages ?? 1;
  for (let p = 0; p < pages; p++) {
    const params = new URLSearchParams({ key, format: "json", count: "100", start: String(p * 100 + 1) });
    if (opts.keyword) params.set("keyword", opts.keyword);
    if (opts.brand) params.set("brand", opts.brand);
    const res = await fetch(`${ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(`[carsensor] HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { usedcar?: CarsensorCar[]; error?: unknown } };
    if (json.results?.error) throw new Error(`[carsensor] API error: ${JSON.stringify(json.results.error)}`);
    const cars = json.results?.usedcar ?? [];
    const now = new Date().toISOString();
    for (const c of cars) {
      const maker = normalizeMaker(c.brand?.name);
      const model = normalizeModel(c.model);
      out.push({
        source: "カーセンサー",
        sourceId: c.id,
        url: c.urls?.pc ?? "",
        title: [maker, model, c.grade].filter(Boolean).join(" "),
        maker,
        model,
        grade: c.grade ?? null,
        year: parseYear(c.year ?? null),
        mileageKm: parseMileage(c.odd ?? null),
        priceMan: parsePriceMan(c.price ?? null),
        totalPriceMan: null,
        color: c.color ?? null,
        bodyType: c.body?.name ?? null,
        pref: c.shop?.pref?.name ?? null,
        shop: c.shop?.name ?? null,
        image: c.photo?.main?.l ?? c.photo?.main?.s ?? null,
        fetchedAt: now,
      });
    }
    if (cars.length < 100) break;
  }
  return out;
}
