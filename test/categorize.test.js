import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeResolver, suggest, applySuggestions, buildHistoryIndex } from '../web/js/categorize.js';
import { matchBuiltin } from '../web/js/rules.js';
import { merchantKey } from '../web/js/parsers/common.js';

const categories = ['Groceries', 'Taxi', 'Fuel', 'Charges, fees', 'Tv, streaming', 'Restaurants & fast food'].map((name, i) => ({ id: 'c' + i, name, archived: false }));
const labels = ['Supermaxi', 'Netflix', 'Aki'].map((name, i) => ({ id: 'l' + i, name, archived: false }));
const resolver = makeResolver({ categories, labels });
const idOf = (n) => categories.find((c) => c.name === n).id;

test('diccionario: comercios de Ecuador por palabra completa o prefijo', () => {
  assert.equal(matchBuiltin(merchantKey('SUPERMAXI GRANDA CENTENO'))?.cat, 'Groceries');
  assert.equal(matchBuiltin(merchantKey('SUPER AKI EL LABRADOR 166'))?.label, 'Aki');
  assert.equal(matchBuiltin(merchantKey('TIA LA LUZ 473'))?.cat, 'Groceries');
  assert.equal(matchBuiltin(merchantKey('UBER RIDES'))?.cat, 'Taxi');
  assert.equal(matchBuiltin(merchantKey('AMAZON MKTPL*5Q12D5C11'))?.cat, 'Shopping');
  assert.notEqual(matchBuiltin(merchantKey('SWEET & COFFEE AMAZONA'))?.cat, 'Shopping', 'la av. Amazonas no es Amazon');
  assert.equal(matchBuiltin(merchantKey('PETIA STORE')), null, 'TIA no debe coincidir dentro de otra palabra');
});

test('prioridad: aprendido > diccionario > historial; cargos siempre a Charges, fees', () => {
  const item = { merchant: 'SUPERMAXI X', kind: 'purchase' };
  assert.equal(suggest(item, { resolver }).categoryId, idOf('Groceries'));
  const learned = { [merchantKey('SUPERMAXI X')]: { categoryId: idOf('Fuel'), labelIds: [] } };
  assert.equal(suggest(item, { resolver, learned }).categoryId, idOf('Fuel'));
  assert.equal(suggest({ merchant: 'IVA', kind: 'fee' }, { resolver, learned }).categoryId, idOf('Charges, fees'));
});

test('historial: usa notas de registros existentes y no mira transferencias', () => {
  const hist = buildHistoryIndex([
    { note: 'Helados Urcuqui', category: { id: idOf('Restaurants & fast food') } },
    { note: 'Helados Urcuqui', category: { id: idOf('Restaurants & fast food') }, transfer: { x: 1 } },
    { note: '', category: { id: 'x' } },
  ]);
  assert.equal(hist.size, 1);
  const s = suggest({ merchant: 'HELADOS URCUQUI', kind: 'purchase' }, { resolver, history: hist });
  assert.equal(s.categoryId, idOf('Restaurants & fast food'));
  assert.equal(s.source, 'historial');
});

test('la retención de IVA digital copia categoría y etiqueta de su compra', () => {
  const items = [
    { id: 'a', merchant: 'NETFLIX.COM', kind: 'purchase' },
    { id: 'b', merchant: 'NETFLIX.COM', kind: 'tax-digital', linkedTo: 'a' },
  ];
  applySuggestions(items, { resolver });
  assert.equal(items[1].categoryId, idOf('Tv, streaming'));
  assert.deepEqual(items[1].labelIds, items[0].labelIds);
  assert.equal(items[0].labelIds.length, 1);
});

test('nombres inexistentes en tu cuenta no rompen: quedan sin categoría', () => {
  const r = makeResolver({ categories: [], labels: [] });
  assert.equal(suggest({ merchant: 'SUPERMAXI X', kind: 'purchase' }, { resolver: r }).categoryId, null);
});
