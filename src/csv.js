// RFC 4180 準拠の最小 CSV パーサ / シリアライザ（依存なし）
// - ダブルクォート、カンマ・改行を含むフィールド、"" エスケープに対応
// - UTF-8 BOM を除去（Excel 出力 CSV 対策）

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // 完全な空行は除外
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** ヘッダ行付き CSV をオブジェクト配列に変換 */
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}
