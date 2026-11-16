// Cliente del Worker. El navegador nunca ve el token de Wallet: todas las
// llamadas van a /api/wallet/*, que las reenvía a la API de BudgetBakers.

const BASE = '/api/wallet/';
const PAGE = 20; // la API devuelve máx. 20 en cuentas, categorías y etiquetas

async function call(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const res = await fetch(BASE + path + qs, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok && res.status !== 207 && res.status !== 400) {
    const msg = typeof data === 'object' && data?.message ? data.message : text.slice(0, 200);
    throw new Error(`Wallet ${res.status}: ${msg}`);
  }
  return { status: res.status, data };
}

async function paged(path, key, query = {}, { limit = PAGE, max = Infinity } = {}) {
  const out = [];
  let offset = 0;
  while (out.length < max) {
    const { data } = await call(path, { query: { ...query, limit, offset } });
    out.push(...(data[key] ?? []));
    if (data.nextOffset == null) break;
    offset = data.nextOffset;
  }
  return out;
}

export const wallet = {
  accounts: () => paged('accounts', 'accounts'),
  categories: () => paged('categories', 'categories'),
  labels: () => paged('labels', 'labels'),

  /** Registros de una cuenta en un rango de fechas (para detectar duplicados). */
  recordsInRange(accountId, fromIso, toIso) {
    return paged(
      'records',
      'records',
      { accountId, recordDate: `gte.${fromIso}`, sortBy: '-recordDate' },
      { limit: 200 },
    ).then((rs) => rs.filter((r) => r.recordDate.slice(0, 10) <= toIso));
  },

  /** Historial reciente de todas las cuentas (para aprender comercios). */
  history: (sinceIso, max = 3000) =>
    paged('records', 'records', { recordDate: `gte.${sinceIso}`, sortBy: '-recordDate' }, { limit: 200, max }),

  /** Crea hasta 50 registros. Devuelve un resultado por posición. */
  async createRecords(records) {
    if (records.length < 1 || records.length > 50) throw new Error('Un lote debe tener entre 1 y 50 registros');
    const { data } = await call('records', { method: 'POST', body: records, query: { returnData: 'false' } });
    return data.results ?? [];
  },
};

/** Convierte un movimiento revisado en el cuerpo que espera Wallet. */
export function toWalletRecord(item, accountId) {
  const note = [item.noteExtra, `${item.bank === 'guayaquil' ? 'BG' : 'BP'}${item.card ? ' ' + item.card : ''}`]
    .concat(item.installment ? [`cuota ${item.installment}`] : [])
    .filter(Boolean)
    .join(' · ')
    .slice(0, 255);
  const rec = {
    accountId,
    amount: { value: item.amount },
    counterParty: String(item.merchant).slice(0, 255),
    note,
    recordDate: `${item.date}T12:00:00Z`,
  };
  if (item.categoryId) rec.categoryId = item.categoryId;
  if (item.labelIds?.length) rec.labelIds = item.labelIds;
  return rec;
}
