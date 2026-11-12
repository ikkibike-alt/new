# MINIMAL INDEX｜ミニマリスト情報まとめ

ミニマリストの最新トピック、Instagram・YouTube、ブログを
テーマ別・男女別・考え方のタイプ別に探せるシンプルな情報インデックスです。

## 構成

- `index.html` — トップページ（HTML / CSS / JS）
  - テーマ別・男女/タイプ別の絞り込み
  - 最新トピック、コラム、基本の考え方、FAQ
  - schema.org の構造化データ（JSON-LD）と、AI向けJSON（`#ai-data`、画面には非表示）
- `column/` — コラムページ（自動生成。直接編集しない）
- `columns/src/*.md` — コラムの原稿

## 見方

`index.html` をブラウザで開くだけで動きます。
GitHub Pages で公開する場合は、リポジトリの Settings → Pages で
このブランチのルートを指定してください。

## 更新のしかた

`index.html` 内のスクリプトにあるデータを編集します。

- `news` — 最新トピック
- `accounts` — Instagram の発信者
- `channels` — YouTube チャンネル
- `blogs` — ブログ・メディア
- `EMBEDS` — 注目の動画・投稿（URLを足すと「PICK UP」欄が表示されます）
- `news` / `blogs` の各項目に `img:"画像URL"` を足すと、イラストの代わりにその画像を表示します
  （掲載許可を得た画像に限って使ってください）

## コラムの追加

1. `columns/src/` に `11.md` のように原稿を追加（先頭の `---` の間にタイトルなどを書く。既存の原稿を参考に）
2. `python3 tools/build_columns.py` を実行
   → `column/` のページと、トップのコラム欄が更新されます

## 画像

`images/` のイラスト（`t-*.jpg` は記事のテーマ別サムネイル）は `tools/illustrations/draw.html` で描いて書き出したものです。
描き直すときは次のコマンドを実行します（Playwright が必要です）。

```
node tools/illustrations/render.js "$PWD/tools/illustrations/draw.html" images
```
