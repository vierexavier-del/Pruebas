// Utilidades compartidas por los parsers de estados de cuenta.

export const MONTHS_ES = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
};

const pad = (n) => String(n).padStart(2, '0');

export function isoDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Año de un día/mes sin año, usando el período del estado de cuenta. */
export function yearFor(month, periodStart, periodEnd) {
  const sy = +periodStart.slice(0, 4);
  const ey = +periodEnd.slice(0, 4);
  if (sy === ey) return ey;
  const sm = +periodStart.slice(5, 7);
  return month >= sm ? sy : ey;
}

/** "1.234,56" (formato europeo) o "1,234.56" (formato US) -> número. */
export function parseMoney(str, format) {
  let s = String(str).trim();
  if (format === 'eu') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: "${str}"`);
  return n;
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Hash FNV-1a (hex) para identificar un movimiento de forma estable. */
export function hashId(...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Limpia el comercio tal como viene en el estado: sin columnas de ciudad ni espacios dobles. */
export function cleanMerchant(desc) {
  return String(desc).split(/\s{2,}/)[0].replace(/\s+/g, ' ').trim();
}

/** Clave normalizada para comparar comercios (mayúsculas, sin dígitos ni símbolos). */
export function merchantKey(desc) {
  return cleanMerchant(desc)
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .join(' ');
}

/** Empareja las retenciones de IVA digital con la compra original. */
export function sameCents(a, b, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

/**
 * Valida que lo extraído coincida con el total del estado:
 * total a pagar = saldo anterior - pagos + consumos.
 */
export function reconcile({ total, prev, payments, items }) {
  const consumos = round2(items.reduce((s, it) => s - it.amount, 0));
  const expected = round2(total - prev + payments);
  return {
    ok: Math.abs(consumos - expected) < 0.005,
    expected,
    got: consumos,
    diff: round2(consumos - expected),
    total,
  };
}
