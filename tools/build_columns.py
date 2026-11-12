#!/usr/bin/env python3
"""コラムページを生成する。

columns/src/*.md (front matter + 簡易Markdown) から
  column/index.html        コラム一覧
  column/<slug>.html       各記事
を書き出し、トップの index.html のコラム欄（マーカー間）も更新する。

使い方: python3 tools/build_columns.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "columns" / "src"
OUT = ROOT / "column"
SITE = "MINIMAL INDEX"

IMAGES = {  # image key -> (file, width, height)
    "hero": ("hero.jpg", 1800, 1100), "cup": ("cup.jpg", 1200, 1500),
    "shirts": ("shirts.jpg", 1200, 1500), "wall": ("wall.jpg", 1800, 900),
    "books": ("books.jpg", 1800, 1100),
    "t-room": ("t-room.jpg", 640, 480), "t-clothes": ("t-clothes.jpg", 640, 480),
    "t-tidy": ("t-tidy.jpg", 640, 480), "t-money": ("t-money.jpg", 640, 480),
    "t-family": ("t-family.jpg", 640, 480), "t-work": ("t-work.jpg", 640, 480),
}

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500'
         '&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap" rel="stylesheet">')

CSS = """
:root{--paper:#ffffff;--ink:#141414;--sub:#6b6b6b;--faint:#a3a3a3;--rule:#e8e8e8;--wash:#f6f6f5;
--f-latin:"Jost","Zen Kaku Gothic New","Helvetica Neue",Arial,sans-serif;
--f-text:"Zen Kaku Gothic New","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#121212;--ink:#ececec;--sub:#9a9a9a;--faint:#6a6a6a;--rule:#2a2a2a;--wash:#1b1b1b;color-scheme:dark}
:root:not([data-theme="light"]) figure img,:root:not([data-theme="light"]) .thumb{filter:brightness(.82) contrast(1.05)}}
:root[data-theme="dark"]{--paper:#121212;--ink:#ececec;--sub:#9a9a9a;--faint:#6a6a6a;--rule:#2a2a2a;--wash:#1b1b1b;color-scheme:dark}
:root[data-theme="dark"] figure img,:root[data-theme="dark"] .thumb{filter:brightness(.82) contrast(1.05)}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--paper);color:var(--ink);font-family:var(--f-text);font-size:16px;line-height:2;letter-spacing:.03em;-webkit-font-smoothing:antialiased;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
a{color:inherit;text-decoration:none}
:focus-visible{outline:1px solid var(--ink);outline-offset:3px}
img{max-width:100%}
.wrap{max-width:1040px;margin:0 auto;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}
.top{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding-block:44px}
.mark{font-family:var(--f-latin);font-size:13px;letter-spacing:.38em}
.top nav{display:flex;gap:22px;font-size:12px;color:var(--sub)}
.top nav a:hover,.top nav a[aria-current]{color:var(--ink)}
.kick{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;font-size:11px;color:var(--sub);letter-spacing:.08em}
.kick .no{font-family:var(--f-latin);letter-spacing:.24em;color:var(--faint)}
.kick .date{font-family:var(--f-latin);font-variant-numeric:tabular-nums;color:var(--faint)}
/* article */
.article{max-width:680px;margin:0 auto;padding-block:120px 40px}
.article h1{font-weight:400;font-size:clamp(24px,4.2vw,34px);line-height:1.6;letter-spacing:.05em;margin-top:28px;word-break:auto-phrase}
.article .lead{margin-top:32px;color:var(--sub);font-size:15px}
.article figure{margin-block:72px 24px}
.article figure img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;background:var(--wash)}
.article figcaption{margin-top:12px;font-size:11px;color:var(--faint)}
.prose{margin-top:48px}
.prose h2{word-break:auto-phrase;font-weight:500;font-size:19px;letter-spacing:.06em;line-height:1.7;margin-top:88px;margin-bottom:24px;padding-top:28px;border-top:1px solid var(--rule)}
.prose p{margin-top:20px}
.prose ul,.prose ol{margin-top:20px;padding-left:1.4em}
.prose li{margin-top:8px;padding-left:.2em}
.prose li::marker{color:var(--faint);font-family:var(--f-latin)}
.prose strong{font-weight:500;background:linear-gradient(transparent 70%,var(--wash) 70%)}
.prose .summary{margin-top:88px;padding:36px 32px;background:var(--wash)}
.prose .summary h2{margin:0 0 12px;padding:0;border:0;font-size:12px;font-family:var(--f-latin);font-weight:400;letter-spacing:.24em;color:var(--sub)}
.prose .summary ul{margin-top:0;list-style:none;padding:0}
.prose .summary li{padding-left:1.4em;position:relative;font-size:15px}
.prose .summary li::before{content:"";position:absolute;left:0;top:1em;width:.7em;height:1px;background:var(--ink)}
.byline{margin-top:56px;font-size:12px;color:var(--faint)}
.pager{max-width:680px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--rule);padding-block:40px 120px}
.pager a{display:block;font-size:14px;line-height:1.7;word-break:auto-phrase}
.pager a:hover .pt{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
.pager small{display:block;font-family:var(--f-latin);font-size:10px;letter-spacing:.24em;color:var(--faint);margin-bottom:6px}
.pager .next{text-align:right;grid-column:2}
/* list */
.lhead{padding-block:144px 88px}
.lhead p:first-child{font-family:var(--f-latin);font-size:11px;letter-spacing:.28em;color:var(--faint)}
.lhead h1{font-weight:300;font-size:clamp(26px,4.6vw,40px);line-height:1.55;letter-spacing:.06em;margin-top:24px}
.lhead p.l{margin-top:28px;color:var(--sub);font-size:14px;max-width:34em}
.clist{list-style:none;border-top:1px solid var(--rule);margin-bottom:120px}
.clist li{border-bottom:1px solid var(--rule)}
.clist a{display:grid;grid-template-columns:240px minmax(0,1fr);gap:8px 40px;align-items:start;padding-block:40px}
.thumb{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:var(--wash);transition:opacity .3s}
.clist a:hover .thumb{opacity:.85}
.clist .t{font-weight:500;font-size:19px;line-height:1.65;margin-top:10px;word-break:auto-phrase}
.clist a:hover .t{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
.clist .s{font-size:14px;color:var(--sub);margin-top:10px}
footer{border-top:1px solid var(--rule);padding-block:64px 96px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--faint)}
footer .mark{font-size:11px;color:var(--sub)}
@media (max-width:760px){
 .article{padding-block:72px 24px}.article figure{margin-block:48px 16px}
 .prose h2{margin-top:64px}.prose .summary{padding:28px 20px;margin-top:64px}
 .lhead{padding-block:96px 56px}
 .clist a{grid-template-columns:112px minmax(0,1fr);gap:4px 18px;padding-block:28px}
 .clist .t{font-size:15px;margin-top:4px}.clist .s{display:none}
 .pager{grid-template-columns:1fr}.pager .next{grid-column:1;text-align:left}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
"""


def parse(path):
    raw = path.read_text(encoding="utf-8")
    _, fm, body = raw.split("---", 2)
    meta = {}
    for line in fm.strip().splitlines():
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    meta["no"] = path.stem
    meta["body"] = body.strip()
    meta["minutes"] = max(1, round(len(re.sub(r"\s", "", body)) / 500))
    return meta


def inline(s):
    s = html.escape(s, quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)


def md(body):
    out, lst, para, in_summary = [], None, [], False

    def flush():
        nonlocal lst, para
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []
        if lst:
            tag, items = lst
            out.append(f"<{tag}>" + "".join(f"<li>{inline(i)}</li>" for i in items) + f"</{tag}>")
            lst = None

    for line in body.splitlines():
        line = line.rstrip()
        if not line:
            flush()
            continue
        if line.startswith("## "):
            flush()
            title = line[3:]
            if in_summary:
                out.append("</aside>")
                in_summary = False
            if title == "この記事のまとめ":
                out.append('<aside class="summary"><h2>SUMMARY</h2>')
                in_summary = True
            else:
                out.append(f"<h2>{inline(title)}</h2>")
            continue
        m = re.match(r"^(-|\d+\.)\s+(.*)", line)
        if m:
            if para:
                flush()
            tag = "ul" if m.group(1) == "-" else "ol"
            if lst and lst[0] != tag:
                flush()
            if not lst:
                lst = (tag, [])
            lst[1].append(m.group(2))
            continue
        if lst:
            flush()
        para.append(line)
    flush()
    if in_summary:
        out.append("</aside>")
    return "\n".join(out)


def page(title, desc, body, prefix, current, ld):
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
{FONTS}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="mark" href="{prefix}index.html">MINIMAL INDEX</a>
  <nav aria-label="サイト"><a href="{prefix}index.html">トップ</a><a href="{prefix}column/index.html"{' aria-current="page"' if current == 'column' else ''}>コラム</a></nav>
</header>
{body}
<footer>
  <span class="mark">MINIMAL INDEX</span>
  <span>コラムはMINIMAL INDEX編集部のオリジナル記事です。</span>
</footer>
</div>
</body>
</html>
"""


def img(key, prefix, cls="", lazy=True, alt=""):
    f, w, h = IMAGES[key]
    c = f' class="{cls}"' if cls else ""
    l = ' loading="lazy"' if lazy else ""
    return f'<img{c} src="{prefix}images/{f}" width="{w}" height="{h}" alt="{html.escape(alt)}"{l}>'


def kick(a, date=True):
    return (f'<div class="kick"><span class="no">No.{a["no"]}</span><span>{html.escape(a["theme"])}</span>'
            + (f'<span class="date">{a["date"]}</span>' if date else "")
            + f'<span>{a["minutes"]}分で読めます</span></div>')


def main():
    arts = [parse(p) for p in sorted(SRC.glob("*.md"))]
    OUT.mkdir(exist_ok=True)

    for i, a in enumerate(arts):
        prev_a = arts[i - 1] if i > 0 else None
        next_a = arts[i + 1] if i + 1 < len(arts) else None
        pager = ""
        if prev_a:
            pager += f'<a class="prev" href="{prev_a["slug"]}.html"><small>PREV</small><span class="pt">{html.escape(prev_a["title"])}</span></a>'
        if next_a:
            pager += f'<a class="next" href="{next_a["slug"]}.html"><small>NEXT</small><span class="pt">{html.escape(next_a["title"])}</span></a>'
        body = f"""<main>
<article class="article">
  {kick(a)}
  <h1>{html.escape(a["title"])}</h1>
  <p class="lead">{html.escape(a["lead"])}</p>
  <figure>{img(a["image"], "../", lazy=False)}<figcaption>Illustration: MINIMAL INDEX</figcaption></figure>
  <div class="prose">
{md(a["body"])}
  </div>
  <p class="byline">文：MINIMAL INDEX 編集部</p>
</article>
<nav class="pager" aria-label="前後のコラム">{pager}</nav>
</main>"""
        ld = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"],
              "description": a["lead"], "datePublished": a["date"].replace(".", "-"),
              "inLanguage": "ja", "author": {"@type": "Organization", "name": f"{SITE} 編集部"},
              "articleSection": a["theme"], "image": f"../images/{IMAGES[a['image']][0]}"}
        (OUT / f'{a["slug"]}.html').write_text(
            page(f'{a["title"]}｜{SITE}', a["lead"], body, "../", "column", ld), encoding="utf-8")

    rows = "\n".join(
        f'<li><a href="{a["slug"]}.html">{img(a["image"], "../", "thumb")}<div>{kick(a, date=False)}'
        f'<div class="t">{html.escape(a["title"])}</div><div class="s">{html.escape(a["lead"])}</div></div></a></li>'
        for a in arts)
    body = f"""<main>
<div class="lhead">
  <p>COLUMN</p>
  <h1>暮らしを軽くする、<br>{len(arts)}のコラム。</h1>
  <p class="l">ミニマリズムの考え方と、今日から試せる手順を、編集部がまとめました。</p>
</div>
<ul class="clist">
{rows}
</ul>
</main>"""
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": f"{SITE} コラム",
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": a["title"],
                               "url": f'{a["slug"]}.html'} for i, a in enumerate(arts)]}
    (OUT / "index.html").write_text(
        page(f"コラム｜{SITE}", "ミニマリズムの考え方と実践をまとめた、MINIMAL INDEX編集部のオリジナルコラム。",
             body, "../", "column", ld), encoding="utf-8")

    # トップページのコラム欄とデータを更新
    top = ROOT / "index.html"
    t = top.read_text(encoding="utf-8")
    cards = "\n".join(
        f'      <a class="col" href="column/{a["slug"]}.html">{img(a["image"], "", "thumb")}'
        f'<span class="kick"><span class="no">No.{a["no"]}</span><span>{html.escape(a["theme"])}</span></span>'
        f'<span class="t">{html.escape(a["title"])}</span></a>'
        for a in arts[:4])
    block = f"""<!--COLUMNS:START-->
<section id="column">
  <div class="label">Column</div>
  <div class="body">
    <h2>コラム</h2>
    <div class="cols">
{cards}
    </div>
    <a class="more" href="column/index.html">すべてのコラムを見る（{len(arts)}本）</a>
  </div>
</section>
<script type="application/json" id="columns-data">{json.dumps([{"no": a["no"], "title": a["title"], "lead": a["lead"], "theme": a["theme"], "date": a["date"], "url": f'column/{a["slug"]}.html'} for a in arts], ensure_ascii=False)}</script>
<!--COLUMNS:END-->"""
    t, n = re.subn(r"<!--COLUMNS:START-->.*?<!--COLUMNS:END-->", lambda m: block, t, flags=re.S)
    assert n == 1, "index.html にコラム欄のマーカーがありません"
    top.write_text(t, encoding="utf-8")
    print(f"built {len(arts)} columns")


if __name__ == "__main__":
    main()
