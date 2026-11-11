const $ = (s) => document.querySelector(s);
const filters = $("#filters");
const searchForm = $("#search");
let page = 1;
let facetData = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtPrice = (v) => (v == null ? "応談" : `${Number(v).toFixed(1).replace(/\.0$/, "")}`);
const fmtKm = (v) => (v == null ? "-" : v >= 10000 ? `${(v / 10000).toFixed(1)}万km` : `${v.toLocaleString()}km`);

function fillSelect(name, items, label = (x) => `${x.v}（${x.n}）`) {
  const sel = filters.elements[name];
  const keep = sel.value;
  sel.length = 1;
  for (const it of items) sel.add(new Option(label(it), it.v));
  sel.value = keep;
}

async function loadFacets() {
  facetData = await (await fetch("/api/facets")).json();
  fillSelect("maker", facetData.makers);
  fillSelect("pref", facetData.prefs);
  fillSelect("source", facetData.sources);
  updateModels();
  const y = filters.elements.yearMin;
  for (let yr = new Date().getFullYear(); yr >= 2005; yr--) y.add(new Option(`${yr}年以降`, yr));
  $("#stats").textContent = `${facetData.sources.length} サイト・${facetData.total.toLocaleString()} 件の掲載を横断中`;
}

function updateModels() {
  const maker = filters.elements.maker.value;
  const models = facetData.models.filter((m) => !maker || m.maker === maker);
  fillSelect("model", models);
}

function params() {
  const p = new URLSearchParams();
  const q = searchForm.elements.q.value.trim();
  if (q) p.set("q", q);
  for (const el of filters.elements) if (el.name && el.value) p.set(el.name, el.value);
  p.set("sort", $("#sort").value);
  p.set("page", page);
  return p;
}

function card(item) {
  const top = item.offers[0];
  const sites = new Set(item.offers.map((o) => o.source));
  const img = item.offers.find((o) => o.image)?.image;
  const offers = item.offers
    .map((o, i) => `<a class="offer ${i === 0 && item.offers.length > 1 ? "best" : ""}" href="${esc(o.url)}" target="_blank" rel="noopener nofollow">
        <span>${esc(o.source)}</span><span class="p">${fmtPrice(o.priceMan)}万円${o.totalPriceMan ? `<small>（総額${fmtPrice(o.totalPriceMan)}）</small>` : ""}</span></a>`)
    .join("");
  return `<article class="card">
    <div class="thumb">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : "NO IMAGE"}</div>
    <div class="body">
      <div class="maker">${esc(top.maker)} ${sites.size > 1 ? `<span class="badge">${sites.size}サイトで比較</span>` : ""}</div>
      <h3 class="name">${esc(top.model)} ${esc(top.grade ?? "")}</h3>
      <div class="price"><b>${fmtPrice(item.minPrice)}</b><small>万円${item.maxPrice !== item.minPrice ? `〜${fmtPrice(item.maxPrice)}万円` : ""}</small></div>
      <ul class="specs">
        <li>${top.year ?? "-"}年</li><li>${fmtKm(top.mileageKm)}</li>
        <li>${esc(top.color ?? "")}</li><li>${esc(top.pref ?? "")}</li><li>${esc(top.shop ?? "")}</li>
      </ul>
      <div class="offers">${offers}</div>
    </div>
  </article>`;
}

async function run() {
  const res = await (await fetch(`/api/search?${params()}`)).json();
  $("#count").innerHTML = `<b>${res.total.toLocaleString()}</b> 台`;
  $("#list").innerHTML = res.items.length ? res.items.map(card).join("") : `<p class="empty">条件に合う車両がありません</p>`;
  const pages = Math.ceil(res.total / res.perPage);
  const btns = [];
  for (let i = Math.max(1, page - 3); i <= Math.min(pages, page + 3); i++) {
    btns.push(`<button data-p="${i}" ${i === page ? 'aria-current="page"' : ""}>${i}</button>`);
  }
  $("#pager").innerHTML = pages > 1 ? btns.join("") : "";
}

const reset = () => { page = 1; run(); };
searchForm.addEventListener("submit", (e) => { e.preventDefault(); reset(); });
filters.addEventListener("change", (e) => { if (e.target.name === "maker") { filters.elements.model.value = ""; updateModels(); } reset(); });
filters.addEventListener("reset", () => setTimeout(() => { updateModels(); reset(); }));
$("#sort").addEventListener("change", reset);
$("#pager").addEventListener("click", (e) => {
  const p = e.target.dataset?.p;
  if (p) { page = Number(p); run(); window.scrollTo({ top: 0, behavior: "smooth" }); }
});

loadFacets().then(run);
