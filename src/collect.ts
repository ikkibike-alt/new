// 収集バッチ: `npm run collect` で sources.json に書かれた取得元からデータを集めて DB に保存する。
// cron や GitHub Actions で定期実行する想定。
import { readFileSync, existsSync } from "node:fs";
import { upsertListings } from "./db.js";
import { fetchCarsensor } from "./sources/carsensor.js";
import { scrapeWithAI, type ScrapeTarget } from "./sources/ai-scraper.js";
import { sampleListings } from "./sources/sample.js";

interface SourcesConfig {
  sample?: boolean;
  carsensor?: Array<{ keyword?: string; brand?: string; pages?: number }>;
  aiScrape?: ScrapeTarget[];
}

export async function collectAll(configPath = "sources.json") {
  const cfg: SourcesConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8"))
    : { sample: true };

  let total = 0;
  const run = async (label: string, fn: () => Promise<Parameters<typeof upsertListings>[0]>) => {
    try {
      const items = await fn();
      total += upsertListings(items);
      console.log(`✔ ${label}: ${items.length} 件`);
    } catch (e) {
      console.error(`✖ ${label}:`, e instanceof Error ? e.message : e);
    }
  };

  if (cfg.sample) await run("サンプルデータ", async () => sampleListings());
  for (const c of cfg.carsensor ?? []) {
    await run(`カーセンサーAPI ${c.keyword ?? c.brand ?? ""}`, () => fetchCarsensor(c));
  }
  for (const t of cfg.aiScrape ?? []) {
    await run(`AI抽出 ${t.name}`, () => scrapeWithAI(t));
  }
  console.log(`合計 ${total} 件を保存しました`);
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await collectAll(process.argv[2]);
}
