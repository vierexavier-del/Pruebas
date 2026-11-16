// Preselección de categoría y etiqueta para cada movimiento.
// Prioridad: 1) lo aprendido de tus correcciones, 2) diccionario inicial,
// 3) notas de tu historial en Wallet. Las retenciones de IVA digital copian
// la categoría de la compra a la que pertenecen.
import { merchantKey } from './parsers/common.js';
import { matchBuiltin, FEES_CATEGORY } from './rules.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function makeResolver({ categories, labels }) {
  const catByName = new Map(categories.filter((c) => !c.archived).map((c) => [norm(c.name), c.id]));
  const labByName = new Map(labels.filter((l) => !l.archived).map((l) => [norm(l.name), l.id]));
  return {
    cat: (name) => (name ? catByName.get(norm(name)) ?? null : null),
    label: (name) => (name ? labByName.get(norm(name)) ?? null : null),
  };
}

/** Índice token -> categorías, a partir de las notas del historial de Wallet. */
export function buildHistoryIndex(records) {
  const index = new Map(); // clave normalizada -> {categoryId: n}
  for (const r of records) {
    const text = r.counterParty || r.note;
    const catId = r.category?.id;
    if (!text || !catId || r.transfer) continue;
    const key = merchantKey(text);
    if (!key) continue;
    const slot = index.get(key) ?? {};
    slot[catId] = (slot[catId] ?? 0) + 1;
    index.set(key, slot);
  }
  return index;
}

function fromHistory(index, key) {
  const slot = index?.get(key);
  if (!slot) return null;
  return Object.entries(slot).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Devuelve { categoryId, labelIds, source } para un movimiento.
 * `learned` es un objeto { claveComercio: { categoryId, labelIds } }.
 */
export function suggest(item, { resolver, learned = {}, history = null }) {
  const key = merchantKey(item.merchant);
  const none = { categoryId: null, labelIds: [], source: null };

  if (item.kind === 'fee') {
    return { categoryId: resolver.cat(FEES_CATEGORY), labelIds: [], source: 'cargo' };
  }
  const l = learned[key];
  if (l) return { categoryId: l.categoryId ?? null, labelIds: l.labelIds ?? [], source: 'aprendido' };

  const b = matchBuiltin(key);
  if (b) {
    const labelId = resolver.label(b.label);
    return {
      categoryId: resolver.cat(b.cat),
      labelIds: labelId ? [labelId] : [],
      source: 'diccionario',
    };
  }
  const h = fromHistory(history, key);
  if (h) return { categoryId: h, labelIds: [], source: 'historial' };
  return none;
}

/** Aplica sugerencias a todos los movimientos; las retenciones heredan de su compra. */
export function applySuggestions(items, ctx) {
  const byId = new Map();
  for (const it of items) {
    if (it.kind !== 'tax-digital') {
      const s = suggest(it, ctx);
      it.categoryId = s.categoryId;
      it.labelIds = s.labelIds;
      it.suggestionSource = s.source;
    }
    byId.set(it.id, it);
  }
  for (const it of items) {
    if (it.kind !== 'tax-digital') continue;
    const buy = byId.get(it.linkedTo);
    it.categoryId = buy?.categoryId ?? null;
    it.labelIds = [...(buy?.labelIds ?? [])];
    it.suggestionSource = buy ? 'compra' : null;
  }
  return items;
}
