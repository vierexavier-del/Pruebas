import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseStatement } from '../web/js/parsers/index.js';
import { yearFor, parseMoney, merchantKey, cleanMerchant } from '../web/js/parsers/common.js';
import { extractLines } from '../web/js/pdftext.js';
import { GUAYAQUIL, PICHINCHA } from './fixtures.js';

test('yearFor resuelve el año cuando el período cruza diciembre-enero', () => {
  assert.equal(yearFor(12, '2026-12-05', '2027-01-04'), 2026);
  assert.equal(yearFor(1, '2026-12-05', '2027-01-04'), 2027);
  assert.equal(yearFor(8, '2026-08-16', '2026-09-15'), 2026);
});

test('parseMoney entiende ambos formatos', () => {
  assert.equal(parseMoney('1,234.56', 'us'), 1234.56);
  assert.equal(parseMoney('9.571,25', 'eu'), 9571.25);
});

test('merchantKey ignora números, símbolos y una letra suelta de ciudad', () => {
  assert.equal(merchantKey('SUPER AKI EL LABRADOR 16Q'), 'SUPER AKI EL LABRADOR 16Q'.replace(/16Q/, '').trim().replace(/\s+/g, ' '));
  assert.equal(cleanMerchant('PETRONORTE           U'), 'PETRONORTE');
});

test('Guayaquil: líneas, cargos, IVA digital, devolución, diferido y cuadre', () => {
  const s = parseStatement(GUAYAQUIL);
  assert.equal(s.bank, 'guayaquil');
  assert.deepEqual(s.period, { start: '2026-08-27', end: '2026-09-29' });
  assert.equal(s.excluded.length, 1); // el pago
  const by = (re) => s.items.find((i) => re.test(i.desc));
  assert.equal(by(/SUPERMAXI/).amount, -50);
  const iva = by(/IVA X SERVICIO/);
  assert.equal(iva.kind, 'tax-digital');
  assert.equal(iva.linkedTo, by(/NETFLIX/).id);
  const fee = by(/COSTO SERV/);
  assert.equal(fee.kind, 'fee');
  assert.equal(fee.amount, -0.36, 'el IVA de la columna se suma al cargo');
  assert.equal(by(/DEVOLUCION/).amount, 10);
  assert.equal(by(/DEVOLUCION/).kind, 'refund');
  const dif = by(/PMZ/);
  assert.equal(dif.installment, '1/3');
  assert.equal(dif.amount, -100);
});

test('Guayaquil: el chequeo detecta un total que no cuadra', () => {
  const bad = GUAYAQUIL.map((l) => l.replace('$319.50', '$999.99'));
  assert.equal(parseStatement(bad).check.ok, false);
});

test('Pichincha: plásticos, pagos, retención, diferido con fecha de período y cuadre', () => {
  const s = parseStatement(PICHINCHA);
  assert.equal(s.bank, 'pichincha');
  assert.deepEqual(s.cards.sort(), ['1621', '2222']);
  assert.equal(s.excluded.length, 1);
  const by = (re) => s.items.find((i) => re.test(i.desc));
  assert.equal(by(/PETRONORTE/).card, '2222');
  assert.equal(by(/UBER/).card, '1621');
  const ret = by(/RET IVA/);
  assert.equal(ret.kind, 'tax-digital');
  assert.equal(ret.linkedTo, by(/UBER/).id);
  assert.equal(by(/^IVA$/).kind, 'fee');
  const dif = by(/UDLA/);
  assert.equal(dif.kind, 'installment');
  assert.equal(dif.amount, -275);
  assert.equal(dif.date, '2026-09-15', 'un diferido se registra en la fecha de corte');
  assert.equal(by(/DEVOLUCION/).amount, 5);
  assert.equal(s.check.ok, true, JSON.stringify(s.check));
});

test('rechaza PDFs de otros bancos', () => {
  assert.throws(() => parseStatement(['Banco Desconocido']), /No reconozco/);
});

// --- Contra PDFs reales (opcional): GUAYAQUIL_PDF=... PICHINCHA_PDF=... npm test ---
const require = createRequire(import.meta.url);
for (const [name, env, total, count] of [
  ['Guayaquil', 'GUAYAQUIL_PDF', 667.85, 24],
  ['Pichincha', 'PICHINCHA_PDF', 945.98, 58],
]) {
  const path = process.env[env];
  test(`PDF real de ${name}`, { skip: !path || !fs.existsSync(path) }, async () => {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const s = parseStatement(await extractLines(pdfjs, new Uint8Array(fs.readFileSync(path))));
    assert.equal(s.check.ok, true, JSON.stringify(s.check));
    assert.equal(s.totals.total, total);
    assert.equal(s.items.length, count);
  });
}
