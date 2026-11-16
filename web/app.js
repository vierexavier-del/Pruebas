import { extractLines } from './js/pdftext.js';
import { parseStatement } from './js/parsers/index.js';
import { merchantKey } from './js/parsers/common.js';
import { wallet, toWalletRecord } from './js/wallet.js';
import { makeResolver, applySuggestions, buildHistoryIndex } from './js/categorize.js';
import { store } from './js/store.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_ACCOUNT_NAME = { guayaquil: 'Visa Gold', pichincha: 'Visa Signature' };
const BANK_NAME = { guayaquil: 'Banco Guayaquil', pichincha: 'Banco Pichincha' };
const KIND_LABEL = { fee: 'cargo', 'tax-digital': 'IVA digital', refund: 'devolución' };

const state = {
  accounts: [], categories: [], labels: [], resolver: null, history: null,
  stmt: null, items: [], accountId: null, uploading: false,
};

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) n.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
  return n;
}
const money = (n) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;
const show = (id, on) => ($(id).hidden = !on);
const addDays = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);

// ---------- Arranque ----------

async function boot() {
  try {
    const me = await fetch('/api/me');
    if (me.status === 403) throw new Error('Acceso denegado. Revisa Cloudflare Access y las variables ACCESS_*.');
    const info = await me.json();
    if (!info.walletConfigured) throw new Error('Falta configurar el secreto WALLET_TOKEN en el Worker.');
    $('bootMsg').textContent = 'Cargando cuentas, categorías y etiquetas…';
    const [accounts, categories, labels] = await Promise.all([wallet.accounts(), wallet.categories(), wallet.labels()]);
    state.accounts = accounts.filter((a) => !a.archived);
    state.categories = categories.filter((c) => !c.archived);
    state.labels = labels.filter((l) => !l.archived);
    state.resolver = makeResolver({ categories: state.categories, labels: state.labels });
    $('conn').textContent = `${state.accounts.length} cuentas`;
    $('conn').className = 'pill ok';
    show('boot', false);
    show('pick', true);
    loadHistory();
  } catch (e) {
    $('bootMsg').textContent = e.message;
    $('bootMsg').className = 'error';
    $('conn').textContent = 'sin conexión';
    $('conn').className = 'pill bad';
  }
}

async function loadHistory() {
  const cached = store.history();
  if (cached && Date.now() - cached.at < 7 * 864e5) {
    state.history = new Map(cached.entries);
    $('histMsg').textContent = `Historial de Wallet listo (${state.history.size} comercios con nota).`;
    return;
  }
  try {
    $('histMsg').textContent = 'Leyendo tu historial de Wallet para sugerir categorías…';
    const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
    const recs = await wallet.history(since);
    state.history = buildHistoryIndex(recs);
    store.setHistory([...state.history]);
    $('histMsg').textContent = `Historial leído: ${recs.length} registros, ${state.history.size} comercios con nota.`;
  } catch {
    $('histMsg').textContent = 'No se pudo leer el historial; se usará solo el diccionario y lo que corrijas.';
  }
}

// ---------- Lectura del PDF ----------

$('file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  $('pickErr').hidden = true;
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const lines = await extractLines(window.pdfjsLib, data);
    const stmt = parseStatement(lines);
    if (!stmt.items.length) throw new Error('No encontré movimientos en este PDF.');
    await openStatement(stmt);
  } catch (e) {
    $('pickErr').textContent = e.message;
    $('pickErr').hidden = false;
  }
});

async function openStatement(stmt) {
  state.stmt = stmt;
  const uploaded = store.uploaded();
  const ctx = { resolver: state.resolver, learned: store.learned(), history: state.history };
  state.items = applySuggestions(
    stmt.items.map((it) => ({ ...it, labelIds: [], status: uploaded[it.id] ? 'done' : 'pending', selected: !uploaded[it.id] })),
    ctx,
  );

  const remembered = store.accountFor(stmt.bank);
  const byName = state.accounts.find((a) => a.name === DEFAULT_ACCOUNT_NAME[stmt.bank]);
  state.accountId = state.accounts.some((a) => a.id === remembered) ? remembered : byName?.id ?? state.accounts[0]?.id;

  renderHeader();
  renderRows();
  renderExcluded();
  show('pick', false);
  show('review', true);
  show('bar', true);
  refreshBar();
  await markDuplicates();
}

function renderHeader() {
  const { stmt } = state;
  $('stmtTitle').textContent = `${BANK_NAME[stmt.bank]} · ${stmt.cards.map((c) => '…' + c).join(' ')}`;
  $('stmtMeta').textContent = `Período ${stmt.period.start} → ${stmt.period.end} · ${stmt.items.length} movimientos · total $${stmt.totals.total.toFixed(2)}`;
  const c = stmt.check;
  $('checkPill').textContent = c.ok ? 'Cuadra ✓' : `No cuadra (${c.diff > 0 ? '+' : ''}${c.diff})`;
  $('checkPill').className = 'pill ' + (c.ok ? 'ok' : 'bad');

  const sel = $('account');
  sel.replaceChildren();
  const cards = state.accounts.filter((a) => a.accountType === 'CreditCard');
  const others = state.accounts.filter((a) => a.accountType !== 'CreditCard');
  const group = (label, list) =>
    el('optgroup', { label }, [...list].sort((a, b) => a.name.localeCompare(b.name)).map((a) => el('option', { value: a.id }, a.name)));
  sel.append(group('Tarjetas de crédito', cards), group('Otras cuentas', others));
  sel.value = state.accountId;
  sel.onchange = async () => {
    state.accountId = sel.value;
    store.setAccountFor(state.stmt.bank, sel.value);
    await markDuplicates();
  };
}

function renderExcluded() {
  const ex = state.stmt.excluded;
  show('excluded', ex.length > 0);
  $('exclCount').textContent = ex.length;
  $('exclList').replaceChildren(...ex.map((e) => el('li', {}, `${e.date} · ${e.desc} · $${e.amount.toFixed(2)} — ${e.reason}`)));
}

// ---------- Tarjetas de movimientos ----------

function categorySelect(item) {
  const groups = new Map();
  for (const c of state.categories) {
    if (!groups.has(c.group.name)) groups.set(c.group.name, []);
    groups.get(c.group.name).push(c);
  }
  const sel = el('select', { 'aria-label': 'Categoría' }, el('option', { value: '' }, '— sin categoría —'));
  for (const [g, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    sel.append(el('optgroup', { label: g }, list.sort((a, b) => a.name.localeCompare(b.name)).map((c) => el('option', { value: c.id }, c.name))));
  }
  sel.value = item.categoryId ?? '';
  sel.addEventListener('change', () => {
    item.categoryId = sel.value || null;
    item.manual = true;
    propagate(item);
  });
  return sel;
}

function labelSelect(item) {
  const sel = el('select', { 'aria-label': 'Etiqueta' }, el('option', { value: '' }, '— sin etiqueta —'),
    [...state.labels].sort((a, b) => a.name.localeCompare(b.name)).map((l) => el('option', { value: l.id }, l.name)));
  sel.value = item.labelIds?.[0] ?? '';
  sel.addEventListener('change', () => {
    item.labelIds = sel.value ? [sel.value] : [];
    item.manual = true;
    propagate(item);
  });
  return sel;
}

/** Al cambiar una compra, sus retenciones de IVA digital la siguen. */
function propagate(item) {
  for (const o of state.items) {
    if (o.linkedTo === item.id && o.kind === 'tax-digital') {
      o.categoryId = item.categoryId;
      o.labelIds = [...item.labelIds];
      refreshRow(o);
    }
  }
}

function refreshRow(item) {
  const root = document.querySelector(`[data-id="${item.id}"]`);
  if (!root) return;
  const [cat, lab] = root.querySelectorAll('select');
  cat.value = item.categoryId ?? '';
  lab.value = item.labelIds?.[0] ?? '';
}

function makeRow(item) {
  const done = item.status === 'done';
  const cb = el('input', { type: 'checkbox', 'aria-label': 'Subir', disabled: done });
  cb.checked = item.selected && !done;
  cb.addEventListener('change', () => {
    item.selected = cb.checked;
    refreshBar();
  });
  item.cb = cb;

  const badges = [];
  if (item.installment) badges.push(el('span', { class: 'pill' }, `cuota ${item.installment}`));
  if (KIND_LABEL[item.kind]) badges.push(el('span', { class: 'pill' }, KIND_LABEL[item.kind]));
  if (item.card) badges.push(el('span', { class: 'pill' }, '…' + item.card));
  if (item.suggestionSource) badges.push(el('span', { class: 'src' }, `sugerido: ${item.suggestionSource}`));
  item.statusEl = el('span', { class: 'pill', hidden: true });
  badges.push(item.statusEl);

  const note = el('input', { type: 'text', placeholder: 'Nota adicional (opcional)' });
  note.addEventListener('input', () => (item.noteExtra = note.value));

  const node = el('div', { class: 'card item' + (done ? ' done' : ''), 'data-id': item.id },
    cb,
    el('div', {}, el('div', { class: 'merchant' }, item.merchant), el('div', { class: 'muted small' }, item.date)),
    el('div', { class: 'amount' + (item.amount > 0 ? ' inc' : '') }, money(item.amount)),
    el('div', { class: 'sub' }, badges),
    el('div', { class: 'pickers' }, categorySelect(item), labelSelect(item)),
    el('details', { class: 'more' }, el('summary', {}, 'Nota'), note),
  );
  item.node = node;
  setStatus(item);
  return node;
}

function setStatus(item) {
  const map = {
    done: ['subido ✓', 'ok'],
    dup: ['¿ya existe?', 'warn'],
    error: [item.error ?? 'error', 'bad'],
  };
  const [text, cls] = map[item.status] ?? [null, null];
  item.statusEl.hidden = !text;
  if (text) {
    item.statusEl.textContent = text;
    item.statusEl.className = 'pill ' + cls;
  }
  item.node?.classList.toggle('done', item.status === 'done');
}

function renderRows() {
  const parents = state.items.filter((i) => i.kind !== 'tax-digital').sort((a, b) => a.date.localeCompare(b.date));
  const ordered = [];
  for (const p of parents) {
    ordered.push(p, ...state.items.filter((o) => o.linkedTo === p.id));
  }
  ordered.push(...state.items.filter((o) => o.kind === 'tax-digital' && !o.linkedTo));
  $('rows').replaceChildren(...ordered.map(makeRow));
}

// ---------- Duplicados ----------

async function markDuplicates() {
  const msg = $('barMsg');
  const pending = state.items.filter((i) => i.status !== 'done');
  for (const i of pending) if (i.status === 'dup') i.status = 'pending';
  try {
    msg.textContent = 'Buscando duplicados en Wallet…';
    const dates = state.items.map((i) => i.date).sort();
    const existing = await wallet.recordsInRange(state.accountId, addDays(dates[0], -3), addDays(dates.at(-1), 3));
    const pool = existing.map((r) => ({ v: r.amount?.value ?? r.amount, d: r.recordDate.slice(0, 10), used: false }));
    for (const it of pending) {
      const hit = pool.find((p) => !p.used && Math.abs(p.v - it.amount) < 0.005 &&
        Math.abs(Date.parse(p.d) - Date.parse(it.date)) <= 3 * 864e5);
      if (hit) {
        hit.used = true;
        it.status = 'dup';
        it.selected = false;
        it.cb.checked = false;
      }
    }
  } catch {
    /* sin detección de duplicados: el usuario decide */
  }
  for (const it of state.items) setStatus(it);
  refreshBar();
}

// ---------- Barra inferior y selección ----------

function selected() {
  return state.items.filter((i) => i.selected && i.status !== 'done');
}

function refreshBar() {
  const sel = selected();
  const total = sel.reduce((s, i) => s + i.amount, 0);
  $('barMsg').textContent = sel.length ? `${sel.length} seleccionados · ${money(total)}` : 'Nada seleccionado';
  $('upload').disabled = state.uploading || sel.length === 0;
  $('upload').textContent = state.uploading ? 'Subiendo…' : `Subir (${sel.length})`;
}

$('selPending').addEventListener('click', () => {
  for (const i of state.items) {
    i.selected = i.status === 'pending' || i.status === 'error';
    if (i.cb) i.cb.checked = i.selected;
  }
  refreshBar();
});
$('selNone').addEventListener('click', () => {
  for (const i of state.items) {
    i.selected = false;
    if (i.cb) i.cb.checked = false;
  }
  refreshBar();
});
$('newFile').addEventListener('click', () => {
  state.stmt = null;
  state.items = [];
  show('review', false);
  show('bar', false);
  show('pick', true);
});

// ---------- Subida ----------

$('upload').addEventListener('click', async () => {
  const sel = selected();
  if (!sel.length || state.uploading) return;
  const acc = state.accounts.find((a) => a.id === state.accountId);
  const sinCat = sel.filter((i) => !i.categoryId).length;
  const total = sel.reduce((s, i) => s + i.amount, 0);
  const warn = [
    sinCat ? `${sinCat} sin categoría.` : '',
    state.stmt.check.ok ? '' : 'El estado NO cuadra con su total.',
  ].filter(Boolean).join(' ');
  if (!confirm(`¿Subir ${sel.length} registros (${money(total)}) a "${acc?.name}"?${warn ? '\n\n' + warn : ''}`)) return;

  state.uploading = true;
  refreshBar();
  let ok = 0;
  let failed = 0;
  try {
    for (let i = 0; i < sel.length; i += 50) {
      const chunk = sel.slice(i, i + 50);
      $('barMsg').textContent = `Subiendo ${Math.min(i + 50, sel.length)} de ${sel.length}…`;
      let results;
      try {
        results = await wallet.createRecords(chunk.map((it) => toWalletRecord(it, state.accountId)));
      } catch (e) {
        for (const it of chunk) { it.status = 'error'; it.error = e.message; setStatus(it); failed++; }
        break;
      }
      chunk.forEach((it, idx) => {
        const r = results.find((x) => x.inputIndex === idx) ?? results[idx];
        if (r?.success) {
          it.status = 'done';
          it.selected = false;
          it.cb.checked = false;
          it.cb.disabled = true;
          store.markUploaded(it.id, r.id);
          if (it.categoryId && it.kind !== 'fee' && it.kind !== 'tax-digital') {
            store.learn(merchantKey(it.merchant), { categoryId: it.categoryId, labelIds: it.labelIds });
          }
          ok++;
        } else {
          it.status = 'error';
          it.error = (typeof r?.error === 'string' ? r.error : r?.error?.message) ?? 'rechazado';
          failed++;
        }
        setStatus(it);
      });
    }
  } finally {
    state.uploading = false;
    refreshBar();
    $('barMsg').textContent = `Subidos ${ok}${failed ? ` · con error ${failed}` : ''}`;
  }
});

boot();
