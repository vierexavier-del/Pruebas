// Parser del estado de cuenta de tarjeta Visa de Banco Pichincha.
import {
  isoDate, yearFor, parseMoney, round2, hashId, cleanMerchant, reconcile,
} from './common.js';

const EU = (s) => parseMoney(s, 'eu');
const US = (s) => parseMoney(s, 'us');

const LINE = new RegExp(
  '^\\s*(\\d{2})/(\\d{2})\\s+(\\d+)\\s+(.+?)\\s{2,}' +
  '(CONSUMO(?:\\s+[A-Z]{2})?|DIFERIDO\\s*\\(\\d+/\\d+\\)|N/D(?:\\s+[A-Z0-9]+)?)\\s+' +
  '([\\d.]+,\\d{2})(-)?(?:\\s+([\\d.]+,\\d{2}))?\\s*$',
);
const CARD_HDR = /(\d{4})-x{4}-x{4}-(\d{4})\s*\*\s*(.+?)(?:\s*\*|\s+ID:)/i;
const PAYMENT = /^\s*(\d{2})\/(\d{2})\s+(\d+)\s+SU PAGO.*?\s([\d.]+,\d{2})-\s*$/i;

export function detect(text) {
  return /BANCO\s+PICHINCHA/i.test(text);
}

export function parse(lines) {
  const text = lines.join('\n');
  const m = (re, label) => {
    const r = text.match(re);
    if (!r) throw new Error(`Pichincha: no se encontró ${label}`);
    return r;
  };

  const per = m(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s*$/m, 'período');
  const start = isoDate(per[3], per[2], per[1]);
  const end = isoDate(per[6], per[5], per[4]);
  const total = US(m(/TOTAL A PAGAR USD\s+([\d.,]+)/i, 'total a pagar')[1].replace(',', '.'));
  const prev = EU(m(/SALDO ANTERIOR\s+([\d.]+,\d{2})/i, 'saldo anterior')[1]);
  const payments = EU(m(/SUBTOTAL PAGOS\s+([\d.]+,\d{2})/i, 'pagos')[1]);

  const items = [];
  const excluded = [];
  const cards = new Set();
  let plastic = null;

  for (const line of lines) {
    const hdr = line.match(CARD_HDR);
    if (hdr) {
      plastic = hdr[2];
      cards.add(plastic);
      continue;
    }
    const pay = line.match(PAYMENT);
    if (pay) {
      const month = +pay[2];
      excluded.push({
        bank: 'pichincha', card: plastic, ref: pay[3], desc: 'SU PAGO "MUCHAS GRACIAS"',
        date: isoDate(yearFor(month, start, end), month, pay[1]),
        amount: EU(pay[4]), reason: 'Pago de la tarjeta',
      });
      continue;
    }
    const r = line.match(LINE);
    if (!r) continue;
    const [, dd, mm, ref, rawDesc, rawType, valor, minus, diferido] = r;
    const month = +mm;
    let date = isoDate(yearFor(month, start, end), month, dd);
    const value = EU(valor);
    const desc = cleanMerchant(rawDesc);
    const base = { bank: 'pichincha', card: plastic, ref, desc, merchant: desc };

    if (/SU PAGO/i.test(desc)) {
      excluded.push({ ...base, date, amount: value, reason: 'Pago de la tarjeta' });
      continue;
    }

    const installment = rawType.startsWith('DIFERIDO') ? rawType.match(/\((\d+\/\d+)\)/)[1] : null;
    // La fecha de un diferido es la de la compra original: se registra en este período.
    if (installment && (date < start || date > end)) date = end;

    let kind = 'purchase';
    if (installment) kind = 'installment';
    else if (rawType.startsWith('N/D') || /^COSTO DE LA TRANSACCION/i.test(desc)) kind = 'fee';
    else if (minus) kind = 'refund';

    items.push({
      ...base,
      id: hashId('P', plastic ?? '-', ref, date, desc, value),
      date,
      amount: minus ? value : -value,
      kind,
      installment,
      linkedTo: null,
      deferredBalance: diferido ? EU(diferido) : null,
    });
  }

  // Retención de IVA de servicios digitales: misma referencia que la compra.
  for (const it of items) {
    if (!/RET IVA SERV DIGITAL/i.test(it.desc)) continue;
    const buy = items.find((o) => o !== it && o.ref === it.ref && o.kind === 'purchase');
    if (buy) {
      it.kind = 'tax-digital';
      it.linkedTo = buy.id;
      it.merchant = buy.merchant;
    }
  }

  const check = reconcile({ total, prev, payments, items });
  return {
    bank: 'pichincha',
    cards: [...cards],
    period: { start, end },
    totals: { total: round2(total), prev, payments },
    items,
    excluded,
    check,
  };
}
