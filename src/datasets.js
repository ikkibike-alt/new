// データセット定義（＝コックピットが受け付ける「元データ」の型）
// CSV のヘッダは英語キー（name）・日本語ラベル（label）・aliases のどれでも OK。

export const DATASETS = {
  employees: {
    domain: 'people',
    label: '人員マスタ',
    description: '社員1人1行。入社日・退職日から人数推移や離職率を算出します。',
    key: ['employee_id'],
    columns: [
      { name: 'employee_id', label: '社員ID', type: 'string', required: true },
      { name: 'name', label: '氏名', type: 'string', required: true },
      { name: 'department', label: '部署', type: 'string', required: true },
      { name: 'position', label: '役職', type: 'string' },
      { name: 'employment_type', label: '雇用形態', type: 'string', default: '正社員' },
      { name: 'hire_date', label: '入社日', type: 'date', required: true },
      { name: 'leave_date', label: '退職日', type: 'date' },
      { name: 'monthly_cost', label: '月額人件費', type: 'number', default: 0, aliases: ['人件費', '月給'] },
    ],
  },
  financials: {
    domain: 'money',
    label: '損益（実績・予算）',
    description: '月×事業×科目の金額。category は revenue/cogs/sga（売上/売上原価/販管費）。',
    key: ['month', 'business_unit', 'category', 'account', 'scenario'],
    columns: [
      { name: 'month', label: '年月', type: 'month', required: true },
      { name: 'business_unit', label: '事業', type: 'string', default: '全社', aliases: ['事業部', 'セグメント'] },
      {
        name: 'category', label: '区分', type: 'enum', required: true,
        values: { revenue: ['売上', '売上高'], cogs: ['売上原価', '原価'], sga: ['販管費', '販売費及び一般管理費'] },
      },
      { name: 'account', label: '勘定科目', type: 'string', default: '' , aliases: ['科目'] },
      { name: 'scenario', label: 'シナリオ', type: 'enum', default: 'actual', values: { actual: ['実績'], budget: ['予算', '計画'] } },
      { name: 'amount', label: '金額', type: 'number', required: true },
    ],
  },
  cash: {
    domain: 'money',
    label: '資金残高',
    description: '月末時点の口座別残高。合計をキャッシュポジションとして扱います。',
    key: ['month', 'account'],
    columns: [
      { name: 'month', label: '年月', type: 'month', required: true },
      { name: 'account', label: '口座', type: 'string', default: 'メイン' },
      { name: 'balance', label: '残高', type: 'number', required: true },
    ],
  },
  kpis: {
    domain: 'business',
    label: '事業KPI',
    description: '月×事業×KPIの実績と目標。direction=lower は「低いほど良い」指標（解約率など）。',
    key: ['month', 'business_unit', 'kpi'],
    columns: [
      { name: 'month', label: '年月', type: 'month', required: true },
      { name: 'business_unit', label: '事業', type: 'string', default: '全社', aliases: ['事業部', 'セグメント'] },
      { name: 'kpi', label: 'KPI', type: 'string', required: true, aliases: ['指標'] },
      { name: 'actual', label: '実績', type: 'number', required: true },
      { name: 'target', label: '目標', type: 'number' },
      { name: 'unit', label: '単位', type: 'string', default: '' },
      { name: 'direction', label: '方向', type: 'enum', default: 'higher', values: { higher: ['高', '高いほど良い'], lower: ['低', '低いほど良い'] } },
    ],
  },
};

const norm = (s) => String(s).trim().toLowerCase().replace(/[\s_\-（）()]/g, '');

/** CSV/JSON のヘッダ → カラム名 の対応表を作る */
function buildHeaderMap(def, headers) {
  const lookup = new Map();
  for (const col of def.columns) {
    for (const k of [col.name, col.label, ...(col.aliases || [])]) lookup.set(norm(k), col.name);
  }
  const map = {};
  for (const h of headers) {
    const c = lookup.get(norm(h));
    if (c) map[h] = c;
  }
  return map;
}

function toHalfWidth(s) {
  return s.replace(/[０-９．，－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function coerce(col, raw) {
  const s = raw === null || raw === undefined ? '' : toHalfWidth(String(raw)).trim();
  if (s === '') return { value: col.default ?? null };
  switch (col.type) {
    case 'number': {
      const n = Number(s.replace(/[,¥￥円\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
      return Number.isFinite(n) ? { value: n } : { error: `数値ではありません: "${raw}"` };
    }
    case 'date': {
      const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
      if (!m) return { error: `日付形式(YYYY-MM-DD)ではありません: "${raw}"` };
      return { value: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` };
    }
    case 'month': {
      const m = s.match(/^(\d{4})[-/.年](\d{1,2})(?:月|[-/.]\d{1,2}日?)?$/);
      if (!m || +m[2] < 1 || +m[2] > 12) return { error: `年月形式(YYYY-MM)ではありません: "${raw}"` };
      return { value: `${m[1]}-${m[2].padStart(2, '0')}` };
    }
    case 'enum': {
      for (const [key, labels] of Object.entries(col.values)) {
        if (norm(key) === norm(s) || labels.some((l) => norm(l) === norm(s))) return { value: key };
      }
      return { error: `"${raw}" は不正な値です（${Object.entries(col.values).map(([k, l]) => `${k}/${l[0]}`).join(', ')}）` };
    }
    default:
      return { value: s };
  }
}

/**
 * 生データ（オブジェクト配列）を検証・正規化する。
 * @returns {{rows: object[], errors: {line:number, message:string}[]}}
 */
export function normalizeRows(datasetId, records) {
  const def = DATASETS[datasetId];
  if (!def) throw new Error(`unknown dataset: ${datasetId}`);
  const errors = [];
  const rows = [];
  if (!records.length) return { rows, errors };

  const headers = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const hmap = buildHeaderMap(def, headers);
  const mapped = new Set(Object.values(hmap));
  const missing = def.columns.filter((c) => c.required && !mapped.has(c.name));
  if (missing.length) {
    errors.push({ line: 1, message: `必須列がありません: ${missing.map((c) => `${c.name}(${c.label})`).join(', ')}` });
    return { rows, errors };
  }

  records.forEach((rec, i) => {
    const line = i + 2; // ヘッダ行が1行目
    const out = {};
    const src = {};
    for (const [h, c] of Object.entries(hmap)) src[c] = rec[h];
    for (const col of def.columns) {
      const { value, error } = coerce(col, src[col.name]);
      if (error) errors.push({ line, message: `${col.label}: ${error}` });
      else if (col.required && (value === null || value === '')) errors.push({ line, message: `${col.label} は必須です` });
      out[col.name] = value ?? (col.type === 'string' ? '' : null);
    }
    rows.push(out);
  });
  return { rows, errors };
}

export function templateHeader(datasetId) {
  return DATASETS[datasetId].columns.map((c) => c.name);
}
