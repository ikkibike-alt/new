# くるまよこぐし — 中古車横断検索（MVP）

複数の中古車サイトから車両情報を集め、**1 つの画面でまとめて検索・価格比較**できるサイトのプロトタイプです。
同じ車両が複数サイトに載っている場合は 1 枚のカードにまとめ、サイトごとの価格を並べて表示します。

## しくみ

```
 ┌──────────── 収集（npm run collect / 定期実行）────────────┐
 │ ① 公式API      カーセンサーnet API（リクルートWEBサービス）│
 │ ② AI抽出       任意サイトの一覧HTML → Claude が構造化JSONに │
 │ ③ サンプル     デモ用の架空データ                          │
 └──────────────┬──────────────────────────────┘
                ▼  正規化（メーカー表記ゆれ・万円/km・和暦→西暦）
           SQLite（data/cars.db）  ← 同一車両を group_key で束ねる
                ▼
     Express API（/api/search, /api/facets） → ブラウザUI（public/）
```

- `src/sources/carsensor.ts` — カーセンサー公式 API から取得
- `src/sources/ai-scraper.ts` — HTML を軽量テキスト化 → Claude（構造化出力）で車両データを抽出。サイトごとのパーサー不要
- `src/normalize.ts` — 表記ゆれの吸収と同一車両判定キー
- `src/db.ts` — 保存と横断検索（同一車両をグループ化して最安値順など）

## 使い方

```bash
npm install
cp .env.example .env   # 必要に応じてキーを設定
npm run collect        # データ収集（キーなしでもサンプルデータで動く）
npm run dev            # http://localhost:3000
```

### 取得元の設定（`sources.json`）

```json
{
  "sample": true,
  "carsensor": [{ "keyword": "プリウス", "pages": 1 }],
  "aiScrape": [
    { "name": "○○モータース", "url": "https://example-dealer.jp/stock/", "pages": ["https://example-dealer.jp/stock/?page=2"] }
  ]
}
```

## ⚠️ データ収集のルール

- **公式 API がある所は API を使う**（カーセンサーはリクルートWEBサービスで無料提供）。
- 大手ポータル（グーネット等）は**利用規約でスクレイピングや転載を禁止**していることが多いです。
  AI抽出は、自社サイト・提携販売店・許諾を得たサイトに限って使ってください。
- `ai-scraper` は robots.txt を確認し、ページ間に 2 秒の待機を入れています。
- 掲載は「要約＋元ページへのリンク」にとどめ、画像や文章の無断転載は避けるのが安全です。

## 次の拡張アイデア

- 同一車両判定を AI で補強（グレード表記ゆれ・店舗名の違いを Claude に判定させる）
- 価格推移の記録と「値下がり通知」
- 自然文検索（「家族4人で乗れる100万円以下の燃費いい車」→ 検索条件に変換）
- 定期収集（cron / GitHub Actions）と、掲載終了車両の自動削除
