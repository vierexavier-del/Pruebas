// Diccionario inicial de comercios -> categoría / etiqueta de Wallet.
// Se usan NOMBRES (no IDs) y se resuelven contra las categorías y etiquetas reales
// de la cuenta. "*" al final de una palabra = prefijo. Todo es editable en la app:
// lo que el usuario corrija se aprende y tiene prioridad sobre este diccionario.

export const BUILTIN_RULES = [
  // Supermercados
  { k: ['SUPERMAXI*', 'MEGAMAXI*'], cat: 'Groceries', label: 'Supermaxi' },
  { k: ['HIPERMARKET'], cat: 'Groceries' },
  { k: ['AKI', 'GRAN AKI', 'SUPER AKI'], cat: 'Groceries', label: 'Aki' },
  { k: ['TIA', 'ALMACENES TIA'], cat: 'Groceries', label: 'Tía' },
  { k: ['TUTI'], cat: 'Groceries', label: 'Tuti' },
  { k: ['SANTA MARIA'], cat: 'Groceries', label: 'Santa María' },
  // Salud
  { k: ['FYBECA', 'SANA SANA', 'PHARMACYS', 'CRUZ AZUL'], cat: 'Drugstore', label: 'Fybeca' },
  // Streaming y suscripciones
  { k: ['NETFLIX*'], cat: 'Tv, streaming', label: 'Netflix' },
  { k: ['HBO*', 'MAX COM'], cat: 'Tv, streaming', label: 'HBO Max' },
  { k: ['PARAMOUNT*'], cat: 'Tv, streaming', label: 'Paramount+' },
  { k: ['APPLE COM BILL', 'APPLE COM', 'ITUNES'], cat: 'Suscripciones Apps', label: 'Apple TV , music y storage' },
  { k: ['GOOGLE ONE', 'GOOGLE*'], cat: 'Suscripciones Apps', label: 'Google One' },
  { k: ['SUSCRIPCION LIFEMILES*', 'LIFEMILES'], label: 'Avianca lifemiles' },
  // Compras en línea
  { k: ['AMAZON', 'AMZN', 'TEMU', 'ALIEXPRESS'], cat: 'Shopping', label: 'Compras Amazon/Temu/Ext.' },
  // Transporte
  { k: ['UBER RIDES', 'UBER TRIP', 'CABIFY*', 'INDRIVE*', 'TAXI*'], cat: 'Taxi' },
  { k: ['METRORED', 'METRO DE QUITO'], cat: 'Public transport' },
  { k: ['PETRONORTE', 'TERPEL*', 'PRIMAX*', 'ATIMASA*', 'EDS', 'GASOLINERA*', 'PETROECUADOR*'], cat: 'Fuel' },
  { k: ['PARQUEADERO*', 'METROPARQUEOS', 'PARKING*', 'ESTACIONAMIENTO*'], cat: 'Parking' },
  // Comunicación
  { k: ['TIGO', 'CLARO', 'CNT', 'ETAPA'], cat: 'Phone, cell phones' },
  { k: ['MOVISTAR*'], cat: 'Phone, cell phones', label: 'Movistar' },
  // Entretenimiento
  { k: ['SUPERCINES*', 'CINEMARK*', 'MULTICINES*'], cat: 'Cine, cultura, eventos deportivos' },
  // Restaurantes y comida a domicilio
  {
    k: ['PEDIDOSYA*', 'RAPPI*', 'BURGER*', 'KFC', 'MCDONALD*', 'CREPES*', 'CREPERIA*', 'SWEET COFFEE*',
      'REPUBLICA DEL CACAO', 'MARISQUE*', 'STEAK*', 'SEA FOOD', 'HELADERIA*', 'MANABICHE*', 'PRIETA',
      'RESTAURANT*', 'PIZZA*', 'CAFE*', 'COFFEE*', 'SUSHI*', 'GRILL*', 'CALZONERIA*', 'VARAKO*'],
    cat: 'Restaurants & fast food',
  },
  // Educación, impuestos, seguros
  { k: ['UDLA*', 'PTP UDLA*'], cat: 'Education & development' },
  { k: ['SRI*', 'MUNICIPIO*'], cat: 'Taxes' },
  { k: ['SEGUROS*', 'ATLANTIDA*'], cat: 'Insurances' },
  { k: ['VETERINARIA*'], cat: 'Pets & animals', label: 'Veterinaria Fry' },
];

export const FEES_CATEGORY = 'Charges, fees';

function kwToRegex(kw) {
  const esc = kw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*$/, '[A-Z]*');
  return new RegExp(`(^| )${esc}( |$)`);
}

const COMPILED = BUILTIN_RULES.map((r) => ({ ...r, res: r.k.map(kwToRegex) }));

/** Primera regla del diccionario que coincide con la clave del comercio. */
export function matchBuiltin(key) {
  for (const r of COMPILED) if (r.res.some((re) => re.test(key))) return r;
  return null;
}
