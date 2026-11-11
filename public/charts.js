// 依存なしの小さな SVG チャート群（棒＋線の単一軸チャート、横棒、スパークライン）
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let tip;
function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; document.body.appendChild(tip); }
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = 'block';
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}
export function hideTip() { if (tip) tip.style.display = 'none'; }

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
function scale(min, max, count = 4) {
  if (min === max) { max = min + 1; }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

export function legend(items) {
  const d = document.createElement('div');
  d.className = 'legend';
  d.innerHTML = items.map((s) => `<span><i class="${s.type === 'line' ? 'line' : ''} ${s.dashed ? 'dashed' : ''}" style="background:${s.color};color:${s.color}"></i>${esc(s.name)}</span>`).join('');
  return d;
}

// 上端だけ角丸の棒（負の値なら下端）
function barPath(x, y0, y1, w, r) {
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1), h = bottom - top;
  r = Math.min(r, w / 2, h);
  if (y1 <= y0) return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
  return `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${top}Z`;
}

/**
 * 時系列チャート（単一の Y 軸）。bars は棒（グループ化）、lines は折れ線。
 * series: { name, values: (number|null)[], color, dashed? }
 */
export function timeChart({ labels, bars = [], lines = [], format = String, axisFormat = format, height = 220, zeroBase = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const all = [...bars, ...lines];
  if (all.length >= 2) wrap.appendChild(legend([...bars.map((s) => ({ ...s, type: 'bar' })), ...lines.map((s) => ({ ...s, type: 'line' }))]));
  const holder = document.createElement('div');
  wrap.appendChild(holder);

  const draw = () => {
    holder.innerHTML = '';
    const width = Math.max(260, holder.clientWidth || 600);
    const vals = all.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (!vals.length) { holder.innerHTML = '<div class="muted" style="padding:24px 0;text-align:center">データがありません</div>'; return; }
    let min = Math.min(...vals), max = Math.max(...vals);
    if (zeroBase || bars.length) { min = Math.min(0, min); max = Math.max(0, max); }
    else { const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1; min -= pad; max += pad; }
    const sc = scale(min, max);
    const m = { l: 8, r: 8, t: 8, b: 22 };
    const svg = el('svg', { width, height, role: 'img' }, holder);
    // Y 軸ラベル幅を測る
    const probe = el('text', {}, svg);
    let lw = 0;
    for (const t of sc.ticks) { probe.textContent = axisFormat(t); lw = Math.max(lw, probe.getComputedTextLength?.() || 40); }
    probe.remove();
    m.l = Math.ceil(lw) + 10;
    const pw = width - m.l - m.r, ph = height - m.t - m.b;
    const y = (v) => m.t + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
    const n = labels.length;
    const band = pw / n;
    const cx = (i) => m.l + band * (i + 0.5);

    for (const t of sc.ticks) {
      el('line', { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t), class: t === 0 ? 'base-line' : 'grid-line' }, svg);
      const tx = el('text', { x: m.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, svg);
      tx.textContent = axisFormat(t);
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 46)));
    labels.forEach((lab, i) => {
      if ((n - 1 - i) % every) return;
      const tx = el('text', { x: cx(i), y: height - 6, 'text-anchor': 'middle' }, svg);
      tx.textContent = lab;
    });

    // 棒
    if (bars.length) {
      const gw = band * 0.72;
      const bw = Math.min(28, (gw - 2 * (bars.length - 1)) / bars.length);
      const total = bw * bars.length + 2 * (bars.length - 1);
      bars.forEach((s, k) => {
        s.values.forEach((v, i) => {
          if (v === null || v === undefined || v === 0) return;
          const x = cx(i) - total / 2 + k * (bw + 2);
          el('path', { d: barPath(x, y(0), y(v), bw, 4), fill: s.color }, svg);
        });
      });
    }
    // 線
    for (const s of lines) {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null || v === undefined) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${cx(i)},${y(v)}`;
        pen = true;
      });
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '5 4' : 'none' }, svg);
      // 最終点のマーカー
      const li = s.values.findLastIndex((v) => v !== null && v !== undefined);
      if (li >= 0 && !s.dashed) el('circle', { cx: cx(li), cy: y(s.values[li]), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    }

    // ホバー層
    const cross = el('line', { y1: m.t, y2: m.t + ph, class: 'crosshair', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - m.l) / band)));
      cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.setAttribute('visibility', 'visible');
      const rows = all.map((s) => `<div class="r"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><b>${s.values[i] === null || s.values[i] === undefined ? '—' : esc(format(s.values[i]))}</b></div>`).join('');
      showTip(`<div class="t">${esc(labels[i])}</div>${rows}`, e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  };
  requestAnimationFrame(draw);
  wrap._redraw = draw;
  return wrap;
}

/** 横棒リスト（HTML） */
export function hbars(items, format = String, color = 'var(--s1)') {
  const max = Math.max(...items.map((d) => Math.abs(d.value)), 1);
  const d = document.createElement('div');
  d.className = 'hbars';
  d.innerHTML = items.map((it) => `
    <div class="hbar"><div class="row"><span>${esc(it.label)}</span><b>${esc(format(it.value))}</b></div>
    <div class="track"><i style="width:${(Math.abs(it.value) / max) * 100}%;background:${color}"></i></div></div>`).join('');
  return d;
}

/** スパークライン（実績＝実線、目標＝破線）を SVG 文字列で返す */
export function sparkline(actual, target = [], { width = 120, height = 28, color = 'var(--s1)' } = {}) {
  const vals = [...actual, ...target].filter((v) => v !== null && v !== undefined);
  if (!vals.length) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const n = actual.length;
  const x = (i) => 2 + (i / Math.max(1, n - 1)) * (width - 4);
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const path = (arr) => {
    let d = '', pen = false;
    arr.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const li = actual.findLastIndex((v) => v !== null && v !== undefined);
  return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true">
    ${target.some((v) => v !== null && v !== undefined) ? `<path d="${path(target)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 3"/>` : ''}
    <path d="${path(actual)}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${li >= 0 ? `<circle cx="${x(li)}" cy="${y(actual[li])}" r="2.5" fill="${color}"/>` : ''}
  </svg>`;
}
