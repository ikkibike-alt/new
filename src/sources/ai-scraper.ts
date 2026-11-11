// 任意の中古車一覧ページを取得し、Claude に「車両情報だけ」を構造化抽出させる汎用コレクター。
// サイトごとに HTML 構造が違っても、パーサーを書かずに取り込めるのがポイント。
//
// ⚠️ 取得先サイトの利用規約・robots.txt を必ず守ること。
//    多くの大手ポータルは規約でスクレイピングを禁止している。
//    自社サイト、提携販売店のサイト、許諾を得たサイトを対象にする想定。
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as cheerio from "cheerio";
import { ExtractionResultSchema, type Listing } from "../types.js";
import { normalizeMaker, normalizeModel } from "../normalize.js";

const USER_AGENT = "CarAggregatorBot/0.1 (+https://example.com/bot)";
const MODEL = "claude-opus-5-5";
const CHUNK_CHARS = 120_000;

export interface ScrapeTarget {
  name: string; // 表示用のサイト名
  url: string; // 一覧ページ URL
  pages?: string[]; // 追加で読む URL（2 ページ目以降など）
}

const client = new Anthropic();

/** robots.txt の User-agent: * の Disallow を簡易チェック */
async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  try {
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return true;
    const lines = (await res.text()).split(/\r?\n/);
    let applies = false;
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || USER_AGENT.toLowerCase().includes(v.toLowerCase());
      else if (applies && /^disallow$/i.test(k) && v && u.pathname.startsWith(v)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** HTML からノイズを除き、テキスト＋リンク＋画像 URL を残した軽量表現にする */
function htmlToCompactText(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, header nav, footer").remove();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!;
    try {
      $(el).append(` [link:${new URL(href, baseUrl).href}]`);
    } catch { /* 無効な URL は無視 */ }
  });
  $("img").each((_, el) => {
    const src = $(el).attr("data-src") ?? $(el).attr("src");
    if (src) {
      try {
        $(el).replaceWith(` [img:${new URL(src, baseUrl).href}] `);
      } catch { /* noop */ }
    }
  });
  return $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function chunk(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) out.push(text.slice(i, i + CHUNK_CHARS));
  return out;
}

const SYSTEM = `あなたは中古車掲載ページから車両データを抽出するアシスタントです。
ページ内に掲載されている中古車 1 台ごとに、指定スキーマで情報を抽出してください。
- ページに書かれていない値は推測せず null にする
- 価格は万円、走行距離は km の数値に換算する（例: "3.2万km" → 32000, "198.0万円" → 198）
- 和暦は西暦に変換する（例: R3 → 2021, H30 → 2018）
- url は [link:...] で示された詳細ページの URL を使う。image は [img:...] の URL を使う
- 広告・おすすめ記事・ナビゲーションなど車両でないものは含めない
- 車両が 1 台もなければ cars を空配列にする`;

async function extract(text: string, pageUrl: string) {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 安全分類器に断られた場合はサーバー側で別モデルにフォールバック
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractionResultSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `ページURL: ${pageUrl}\n\n---\n${text}` }],
  });
  if (res.stop_reason === "refusal") {
    console.warn(`[ai-scraper] 抽出を拒否されました: ${pageUrl}`);
    return [];
  }
  if (res.stop_reason === "max_tokens") {
    console.warn(`[ai-scraper] 出力上限に達しました（一部の車両が欠ける可能性）: ${pageUrl}`);
  }
  return res.parsed_output?.cars ?? [];
}

export async function scrapeWithAI(target: ScrapeTarget): Promise<Listing[]> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn("[ai-scraper] ANTHROPIC_API_KEY が未設定のためスキップ");
    return [];
  }
  const urls = [target.url, ...(target.pages ?? [])];
  const out: Listing[] = [];
  for (const url of urls) {
    if (!(await allowedByRobots(url))) {
      console.warn(`[ai-scraper] robots.txt で禁止されているためスキップ: ${url}`);
      continue;
    }
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.warn(`[ai-scraper] HTTP ${res.status}: ${url}`);
      continue;
    }
    const text = htmlToCompactText(await res.text(), url);
    const now = new Date().toISOString();
    for (const part of chunk(text)) {
      for (const c of await extract(part, url)) {
        const maker = normalizeMaker(c.maker);
        const model = normalizeModel(c.model);
        const detailUrl = c.url ? new URL(c.url, url).href : url;
        out.push({
          source: target.name,
          sourceId: c.url ? detailUrl : `${url}#${maker}-${model}-${c.year}-${c.mileage_km}-${c.price_man}`,
          url: detailUrl,
          title: c.title,
          maker,
          model,
          grade: c.grade,
          year: c.year,
          mileageKm: c.mileage_km,
          priceMan: c.price_man,
          totalPriceMan: c.total_price_man,
          color: c.color,
          bodyType: c.body_type,
          pref: c.pref,
          shop: c.shop,
          image: c.image,
          fetchedAt: now,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 2000)); // 相手サーバーに負荷をかけない
  }
  return out;
}
