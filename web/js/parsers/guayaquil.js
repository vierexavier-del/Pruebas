// Parser del estado de cuenta de tarjeta Visa de Banco Guayaquil.
import {
  MONTHS_ES, isoDate, yearFor, parseMoney, round2, hashId,
  cleanMerchant, sameCents, reconcile,
} from './common.js';

const US = (s) => parseMoney(s, 'us');
const DATE_HDR = /(\d{2})\/([A-Z]{3})\/(\d{4})/;

const LINE = new RegExp(
  '^\\s*([A-Z]{3})/(\\d{2})\\s+(\\d+)\\s+(.+?)\\s{2,}' +
  '(CONS\\.|N/D|DIF\\.\\s*\\d+/\\d+|PAGO)\\s+\\$\\s*([\\d,]+\\.\\d{2})' +
  '(?:\\s+\\$\\s*([\\d,]+\\.\\d{2}))?\\s+([+\\u2212-])',
);

export function detect(text) {
  return /Banco\s+Guayaquil/i.test(text);
}

export function parse(lines) {
  const text = lines.join('\n');

  const m = (re, label) => {
    const r = text.match(re);
    if (!r) throw new Error(`Guayaquil: no se encontró ${label}`);
    return r;
  };
  const toIso = (r) => isoDate(r[3], MONTHS_ES[r[2]], r[1]);

  const start = toIso(m(new RegExp('Periodo desde:\\s*' + DATE_HDR.source), 'período desde'));
  const end = toIso(m(new RegExp('Hasta:\\s*' + DATE_HDR.source), 'período hasta'));
  const total = US(m(/Total a pagar:\s*\$\s*([\d,]+\.\d{2})/i, 'total a pagar')[1]);
  const prev = US(m(/Saldo Anterior:\s*\+?\$\s*([\d,]+\.\d{2})/i, 'saldo anterior')[1]);
  const payments = US(m(/Subtotal Pagos\/Créditos\s+\$\s*([\d,]+\.\d{2})/i, 'pagos')[1]);
  const last4 = m(/Resumen Tarjeta N\.?\s*°?\s*\d{4,6}\s*X+\s*(\d{4})/i, 'tarjeta')[1];

  const items = [];
  const excluded = [];

  for (const line of lines) {
    const r = line.match(LINE);
    if (!r) continue;
    const [, mon, day, ref, rawDesc, type, valor, iva, sign] = r;
    const month = MONTHS_ES[mon];
    if (!month) continue;
    let date = isoDate(yearFor(month, start, end), month, day);
    const value = round2(US(valor) + (iva ? US(iva) : 0));
    const desc = cleanMerchant(rawDesc);
    const base = { bank: 'guayaquil', card: last4, ref, desc, merchant: desc };

    if (type === 'PAGO') {
      excluded.push({ ...base, date, amount: value, reason: 'Pago de la tarjeta' });
      continue;
    }

    const isCredit = sign !== '+';
    const installment = type.startsWith('DIF') ? type.replace(/\s+/g, '').slice(4) : null;
    if (installment && (date < start || date > end)) date = end;

    const kind = installment ? 'installment' : type === 'N/D' ? 'fee' : isCredit ? 'refund' : 'purchase';
    items.push({
      ...base,
      id: hashId('G', last4, ref, date, desc, value),
      date,
      amount: isCredit ? value : -value,
      kind,
      installment,
      linkedTo: null,
    });
  }

  // IVA de servicios digitales: va con la categoría de la compra (15% del mismo día).
  for (const it of items) {
    if (!/IVA\s+X\s+SERVICIO\s+DIGITAL/i.test(it.desc)) continue;
    const buy = items.find(
      (o) => o.kind === 'purchase' && o.date === it.date && sameCents(Math.abs(o.amount) * 0.15, -it.amount),
    );
    if (buy) {
      it.kind = 'tax-digital';
      it.linkedTo = buy.id;
      it.merchant = buy.merchant;
    }
  }

  const check = reconcile({ total, prev, payments, items });
  return {
    bank: 'guayaquil',
    cards: [last4],
    period: { start, end },
    totals: { total, prev, payments },
    items,
    excluded,
    check,
  };
}
