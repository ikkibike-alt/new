# MINIMAL INDEX｜ミニマリスト情報まとめ

ミニマリストの最新トピック、Instagram・YouTubeの発信者、ブログ、オリジナルコラムを
テーマ別・男女別・考え方のタイプ別に探せる情報サイトです。白基調のシンプルなデザインで、
ページを分けた構成になっています。

## ページ構成

- `index.html` — ホーム
- `news/` — 最新トピック（テーマで絞り込み）
- `themes/` — テーマ一覧と、6つのテーマ別ページ
- `creators/` — 発信者（性別・SNS・タイプで絞り込み）
- `column/` — コラム一覧と記事10本
- `guide/` — はじめての方へ（タイプ診断、基本、FAQ）
- `picks/` — 注目の動画・投稿
- `assets/style.css`, `assets/app.js` — 共通のデザインと動き
- `data.json`, `llms.txt` — AI・検索向けのデータ（画面には出しません）
- `columns/src/*.md` — コラムの原稿

各ページは静的なHTMLです。`index.html` をブラウザで開けば動きます。
GitHub Pages で公開する場合は、Settings → Pages でこのブランチのルートを指定してください。
`robots.txt` と `sitemap.xml` のURLは仮（example.com）なので、公開先が決まったら書き換えてください。

## 画像

`images/` のイラストは `tools/illustrations/` のコードで描いています（Playwright が必要）。

```
node tools/illustrations/render.js "$PWD/tools/illustrations/draw.html" images
node tools/illustrations/render-art.js "$PWD/tools/illustrations/art.html" images
```
