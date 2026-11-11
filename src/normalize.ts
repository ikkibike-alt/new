// サイトごとに表記がバラバラな値を共通形式にそろえる

const MAKER_ALIASES: Record<string, string[]> = {
  トヨタ: ["toyota", "トヨタ自動車"],
  レクサス: ["lexus"],
  日産: ["nissan", "ニッサン"],
  ホンダ: ["honda", "本田"],
  マツダ: ["mazda"],
  スバル: ["subaru"],
  スズキ: ["suzuki"],
  ダイハツ: ["daihatsu"],
  三菱: ["mitsubishi", "ミツビシ"],
  BMW: ["bmw", "ビーエムダブリュー"],
  "メルセデス・ベンツ": ["mercedes", "mercedes-benz", "ベンツ", "メルセデスベンツ", "mベンツ"],
  フォルクスワーゲン: ["volkswagen", "vw"],
  アウディ: ["audi"],
  ポルシェ: ["porsche"],
  ボルボ: ["volvo"],
  ミニ: ["mini", "bmw mini"],
  ジープ: ["jeep"],
  テスラ: ["tesla"],
};

const aliasIndex = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(MAKER_ALIASES)) {
  aliasIndex.set(canonical.toLowerCase(), canonical);
  for (const a of aliases) aliasIndex.set(a.toLowerCase(), canonical);
}

/** 全角英数→半角、空白の統一 */
export function toHalfWidth(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMaker(raw: string | null | undefined): string {
  if (!raw) return "不明";
  const s = toHalfWidth(raw);
  return aliasIndex.get(s.toLowerCase()) ?? s;
}

export function normalizeModel(raw: string | null | undefined): string {
  return raw ? toHalfWidth(raw) : "不明";
}

/** "3.2万km" / "32,000km" / "32000" → 32000 */
export function parseMileage(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = toHalfWidth(raw).replace(/,/g, "");
  const man = s.match(/([\d.]+)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const n = s.match(/[\d.]+/);
  return n ? Math.round(parseFloat(n[0])) : null;
}

/** "198万円" / "1,980,000円" / 1980000 → 198（万円） */
export function parsePriceMan(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return raw > 100000 ? raw / 10000 : raw;
  const s = toHalfWidth(raw).replace(/,/g, "");
  const man = s.match(/([\d.]+)\s*万/);
  if (man) return parseFloat(man[1]);
  const n = s.match(/[\d.]+/);
  if (!n) return null;
  const v = parseFloat(n[0]);
  return v > 100000 ? v / 10000 : v;
}

/** "2019(R01)" / "令和1年" / "H30" → 西暦 */
export function parseYear(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const s = toHalfWidth(raw);
  const west = s.match(/(19|20)\d{2}/);
  if (west) return parseInt(west[0], 10);
  const era = s.match(/(令和|R|平成|H)\s*(\d{1,2}|元)/i);
  if (era) {
    const n = era[2] === "元" ? 1 : parseInt(era[2], 10);
    return /令和|R/i.test(era[1]) ? 2018 + n : 1988 + n;
  }
  return null;
}

/**
 * 同一車両（同じ店の同じクルマが複数サイトに掲載されているケース）を束ねるためのキー。
 * メーカー・車種・年式・走行距離（500km 単位）・店舗名でざっくり一致させる。
 */
export function groupKey(l: {
  maker: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
  shop: string | null;
}): string {
  const mileageBucket = l.mileageKm == null ? "?" : Math.round(l.mileageKm / 500);
  const shop = (l.shop ?? "?").replace(/\s|株式会社|\(株\)|㈱/g, "").toLowerCase();
  return [l.maker, l.model.toLowerCase(), l.year ?? "?", mileageBucket, shop].join("|");
}
