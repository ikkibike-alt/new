// API キーなしでも画面を試せるデモ用データ（架空の 3 サイト・架空の販売店）。
// 同じ車両が複数サイトに違う価格で載っているケースも含めて、横断比較の動作を確認できる。
import type { Listing } from "../types.js";

const CARS: Array<[string, string, string[], string, number]> = [
  // maker, model, grades, body, 新車価格目安(万円)
  ["トヨタ", "プリウス", ["S", "A", "Aプレミアム"], "ハッチバック", 300],
  ["トヨタ", "アルファード", ["S Cパッケージ", "エグゼクティブラウンジ"], "ミニバン", 550],
  ["トヨタ", "ヤリス", ["X", "G", "Z"], "コンパクト", 180],
  ["トヨタ", "ハリアー", ["G", "Z レザーパッケージ"], "SUV", 400],
  ["ホンダ", "N-BOX", ["G", "L", "カスタム L ターボ"], "軽自動車", 170],
  ["ホンダ", "フィット", ["ホーム", "e:HEV リュクス"], "コンパクト", 200],
  ["ホンダ", "ヴェゼル", ["e:HEV X", "e:HEV Z"], "SUV", 300],
  ["日産", "セレナ", ["ハイウェイスター V", "e-POWER XV"], "ミニバン", 330],
  ["日産", "ノート", ["X", "AUTECH"], "コンパクト", 230],
  ["マツダ", "CX-5", ["20S プロアクティブ", "XD Lパッケージ"], "SUV", 350],
  ["スバル", "フォレスター", ["ツーリング", "スポーツ"], "SUV", 340],
  ["スズキ", "ジムニー", ["XG", "XC"], "軽自動車", 200],
  ["ダイハツ", "タント", ["X", "カスタムRS"], "軽自動車", 160],
  ["BMW", "3シリーズ", ["320i Mスポーツ", "320d xDrive"], "セダン", 600],
  ["メルセデス・ベンツ", "Cクラス", ["C200 アバンギャルド", "C220d"], "セダン", 650],
  ["フォルクスワーゲン", "ゴルフ", ["TSI アクティブ", "GTI"], "ハッチバック", 380],
];
const PREFS = ["東京都", "神奈川県", "埼玉県", "千葉県", "大阪府", "愛知県", "福岡県", "北海道", "宮城県", "兵庫県"];
const COLORS = ["パールホワイト", "ブラック", "シルバー", "ソウルレッド", "グレー", "ブルー"];
const SHOPS = ["オートギャラリー青葉", "カープラザ湾岸", "ユーズドモール東和", "モータース陽光", "くるま市場さくら", "オートステージ北斗"];
const SITES = ["デモ中古車ナビ", "デモカーマーケット", "デモ販売店直販"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function sampleListings(count = 180): Listing[] {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const out: Listing[] = [];
  for (let i = 0; i < count; i++) {
    const [maker, model, grades, body, base] = pick(CARS);
    const year = 2014 + Math.floor(r() * 11);
    const age = 2025 - year;
    const mileageKm = Math.round((age * 9000 + r() * 20000) / 100) * 100;
    const price = Math.max(30, Math.round(base * Math.pow(0.86, age) * (0.85 + r() * 0.3)));
    const grade = pick(grades);
    const shop = pick(SHOPS);
    const pref = pick(PREFS);
    const color = pick(COLORS);
    // 1〜3 サイトに同じ車両を掲載（サイトごとに価格が少し違う）
    const siteCount = 1 + Math.floor(r() * r() * 3);
    const sites = [...SITES].sort(() => r() - 0.5).slice(0, siteCount);
    sites.forEach((site, j) => {
      const p = j === 0 ? price : price + Math.round((r() - 0.3) * 8);
      out.push({
        source: site,
        sourceId: `demo-${i}-${j}`,
        url: `https://example.com/${encodeURIComponent(site)}/car/${i}`,
        title: `${maker} ${model} ${grade}`,
        maker,
        model,
        grade,
        year,
        mileageKm,
        priceMan: p,
        totalPriceMan: p + 12 + Math.round(r() * 15),
        color,
        bodyType: body,
        pref,
        shop,
        image: null,
        fetchedAt: new Date(now - Math.floor(r() * 7 * 86400000)).toISOString(),
      });
    });
  }
  return out;
}
