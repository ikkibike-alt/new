# MINIMAL INDEX｜ミニマリスト情報まとめ

ミニマリストの最新トピック、Instagram・YouTube、ブログを
テーマ別・男女別・考え方のタイプ別に探せるシンプルな情報インデックスです。

## 構成

- `index.html` — サイト本体（1ファイル完結。HTML / CSS / JS）
  - テーマ別・男女/タイプ別の絞り込み
  - 最新トピック、基本の考え方、FAQ
  - schema.org の構造化データ（JSON-LD）と、AI向けJSONのコピー機能

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

## 画像

`images/` のイラストは `tools/illustrations/draw.html` で描いて書き出したものです。
描き直すときは次のコマンドを実行します（Playwright が必要です）。

```
node tools/illustrations/render.js "$PWD/tools/illustrations/draw.html" images
```
