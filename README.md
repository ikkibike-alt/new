# 経営コックピット（MVP）

**人・金・事業** の数字を1画面で見るための経営ダッシュボードです。
元データは CSV アップロード・API・外部 URL からの定期取得のどれでも取り込めます。

- **依存パッケージなし**: Node.js 22.13+ だけで動作します（DB は Node 組み込みの SQLite）
- データは `data/cockpit.db` に保存されます

## 起動

```bash
npm start            # http://localhost:3000
npm run seed         # （任意）サンプルデータ投入 + samples/*.csv を書き出し
npm test
```

画面の「データ連携」タブからもサンプルデータを投入できます。

## 画面

| タブ | 見られるもの |
|---|---|
| **総合** | 主要KPIタイル（売上・営業利益・現預金・従業員数・離職率・KPI達成）、自動アラート、3領域のサマリー |
| **人** | 従業員数推移、入社・退職、離職率（12ヶ月）、人件費・人件費率、1人当たり売上、平均勤続、部署別・雇用形態別 |
| **金** | 売上/営業利益の予実、期累計（YTD）、現預金推移とランウェイ、販管費内訳、P/L サマリー（予算差異・前年同月） |
| **事業** | 事業別の売上・利益・予算比、事業KPIの実績/目標/達成状況（スパークライン付き） |
| **データ連携** | CSV アップロード（検証→取込）、テンプレートDL、エクスポート、外部コネクタ、API 説明、取込履歴 |

対象月はヘッダで切り替えられます（デフォルトは損益実績がある最新月）。

## 元データ（4つのデータセット）

CSV のヘッダは英語キー・日本語ラベルのどちらでも OK。UTF-8 / Shift_JIS（Excel 出力）に対応。
`2026/4`・`2026年4月`・`¥1,200,000`・`(500)`（負数）などの表記ゆれも吸収します。

| データセット | 領域 | キー | 主な列 |
|---|---|---|---|
| `employees` 人員マスタ | 人 | employee_id | name, department, position, employment_type, **hire_date**, leave_date, monthly_cost |
| `financials` 損益 | 金 | month+business_unit+category+account+scenario | **month**, business_unit, **category**(revenue/cogs/sga or 売上/売上原価/販管費), account, scenario(actual/budget or 実績/予算), **amount** |
| `cash` 資金残高 | 金 | month+account | **month**, account, **balance** |
| `kpis` 事業KPI | 事業 | month+business_unit+kpi | **month**, business_unit, **kpi**, **actual**, target, unit, direction(higher/lower) |

取込方法は `upsert`（キー一致は上書き）または `replace`（全件入れ替え）。
**1行でもエラーがあれば何も反映しません**（行番号付きでエラーを返します）。

## 他システムとの連携

### プッシュ型（API）
```bash
# CSV
curl -X POST "http://localhost:3000/api/datasets/financials/import?mode=upsert" \
  -H "Content-Type: text/csv" --data-binary @financials.csv
# JSON（配列 or {"rows": [...]}）
curl -X POST "http://localhost:3000/api/datasets/kpis/import" \
  -H "Content-Type: application/json" \
  -d '[{"month":"2026-10","business_unit":"SaaS事業","kpi":"MRR","actual":52000000,"target":50000000,"unit":"円"}]'
```
`?dryRun=1` で検証のみ。

### プル型（コネクタ）
「データ連携」タブで URL・形式（CSV/JSON）・JSON パス・HTTP ヘッダ・実行間隔を登録すると定期取得します。
会計/人事/CRM SaaS のレポート API、Google スプレッドシートの CSV 公開 URL などを想定。

### 指標の取り出し
`GET /api/cockpit?month=YYYY-MM` で全指標・アラートを JSON で取得できます（Slack 通知や BI 連携用）。

## 主な API

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/cockpit?month=` | 全指標 + アラート |
| GET | `/api/datasets` | データセット定義・件数・最終取込 |
| POST | `/api/datasets/:id/import?mode=&dryRun=` | 取込（CSV / JSON） |
| GET | `/api/datasets/:id/template.csv` / `export.csv` | テンプレート / エクスポート |
| DELETE | `/api/datasets/:id` | 全削除 |
| GET/POST | `/api/connectors` | コネクタ一覧 / 追加 |
| POST | `/api/connectors/:id/run` | コネクタ即時実行 |
| GET | `/api/imports` | 取込履歴 |

## 設定（環境変数）

| 変数 | 既定 | 説明 |
|---|---|---|
| `PORT` | 3000 | ポート |
| `COCKPIT_DB` | `data/cockpit.db` | DB ファイル |
| `FISCAL_START_MONTH` | 4 | 期首月（期累計の計算に使用） |
| `COCKPIT_USER` / `COCKPIT_PASSWORD` | – | 設定すると画面・API に Basic 認証 |
| `COCKPIT_API_TOKEN` | – | 設定すると API に `Authorization: Bearer <token>` でもアクセス可 |

## アラート条件（`src/metrics.js` の `buildAlerts`）

売上予算比 95% 未満 / 営業赤字 / ランウェイ 12ヶ月未満 / 離職率 15% 超 / 人件費率 50% 超 /
部署の12ヶ月退職率 25% 超 / 事業別の営業赤字 / KPI 目標比 90% 未満

## 構成

```
src/
  server.js      HTTP サーバ・API・認証
  datasets.js    データセット定義・検証・正規化（ここに列を足せば拡張可能）
  db.js          SQLite スキーマ・取込（アトミック）
  metrics.js     指標計算（純粋関数）
  connectors.js  外部 URL からの定期取得
  seed.js        サンプルデータ生成
public/          画面（素の JS + 自前 SVG チャート）
samples/         サンプル CSV（取込テスト用）
test/            node:test
```

## 次の一手（MVP 以降の候補）

- freee / マネーフォワード / SmartHR / Salesforce 等の専用コネクタ（OAuth）
- ユーザー・権限管理（役員/部門長で見える範囲を分ける）
- 部署 ↔ 事業のマッピング（事業別の人員・1人当たり利益）
- 予測（着地見込み）、シナリオ比較、コメント・注記
- アラートの Slack / メール通知
