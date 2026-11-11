import { z } from "zod";

/** 全ソース共通の正規化済み車両データ */
export interface Listing {
  source: string; // 取得元サイト名（例: "カーセンサー", "sample-dealer"）
  sourceId: string; // 取得元での ID（なければ URL）
  url: string;
  title: string;
  maker: string; // 正規化済みメーカー名（例: "トヨタ"）
  model: string; // 車種名（例: "プリウス"）
  grade: string | null;
  year: number | null; // 初度登録年（西暦）
  mileageKm: number | null;
  priceMan: number | null; // 車両本体価格（万円）
  totalPriceMan: number | null; // 支払総額（万円）
  color: string | null;
  bodyType: string | null;
  pref: string | null; // 都道府県
  shop: string | null;
  image: string | null;
  fetchedAt: string; // ISO8601
}

/** Claude に抽出させる 1 台分のスキーマ（strict な JSON 出力用） */
export const ExtractedCarSchema = z.object({
  title: z.string().describe("掲載タイトル（車名＋グレードなど）"),
  url: z.string().describe("その車両の詳細ページURL。相対URLならそのまま。不明なら空文字"),
  maker: z.string().describe("メーカー名（日本語表記。例: トヨタ, ホンダ, BMW）"),
  model: z.string().describe("車種名（例: プリウス, N-BOX）"),
  grade: z.string().nullable(),
  year: z.number().int().nullable().describe("初度登録年を西暦で。和暦なら変換する"),
  mileage_km: z.number().nullable().describe("走行距離をkm単位で。'3.2万km' なら 32000"),
  price_man: z.number().nullable().describe("車両本体価格を万円単位で。'1,980,000円' なら 198"),
  total_price_man: z.number().nullable().describe("支払総額を万円単位で"),
  color: z.string().nullable(),
  body_type: z.string().nullable(),
  pref: z.string().nullable().describe("所在地の都道府県"),
  shop: z.string().nullable().describe("販売店名"),
  image: z.string().nullable().describe("車両画像URL"),
});

export const ExtractionResultSchema = z.object({
  cars: z.array(ExtractedCarSchema),
});

export type ExtractedCar = z.infer<typeof ExtractedCarSchema>;
