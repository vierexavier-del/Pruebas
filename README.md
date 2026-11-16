# Estados a Wallet

Sube el PDF de tu estado de cuenta (Banco Guayaquil o Banco Pichincha), revisa categoría,
etiqueta y cuenta de cada movimiento y súbelos a **Wallet de BudgetBakers** en lotes.
Pensada para usarse desde iPhone/iPad (se instala como app desde Safari).

## Cómo funciona

```
iPhone/iPad (Safari, PWA)                Cloudflare Worker                 Wallet API
  ├─ lee el PDF en el dispositivo  ──►   /api/wallet/*  (token guardado) ──► rest.budgetbakers.com
  ├─ interpreta movimientos                ├─ exige login de Cloudflare Access
  └─ pre-categoriza y deja revisar         └─ lista blanca: leer + crear registros
```

- **El PDF no sale de tu dispositivo.** Solo viajan a Wallet los registros que apruebes.
- **El token de Wallet vive solo en el Worker** (secreto). El navegador nunca lo ve.
- El Worker **no puede borrar ni editar** nada en Wallet: solo lee cuentas, categorías, etiquetas y
  registros, y crea registros.

## Reglas que aplica

| Caso | Tratamiento |
|---|---|
| Pagos de la tarjeta, saldo anterior | Excluidos (los registras tú) |
| Compras a cuotas (diferidos) | Solo la cuota del mes, con fecha del período |
| Cargos del banco (IVA, tarifas, contribuciones, costo de recaudación) | Línea separada en **Charges, fees** |
| IVA / retención de servicios digitales | Línea separada con la categoría y etiqueta de la compra (Netflix, Apple, Uber…) |
| IVA de la columna "IVA" de un cargo | Se suma al cargo |
| Devoluciones | Ingreso |
| Año de las fechas | Se deduce del período del estado |
| Banco Guayaquil → cuenta | Visa Gold (predeterminada) |
| Banco Pichincha (los 3 plásticos) → cuenta | Visa Signature (predeterminada) |

Cada estado se **valida contra su total** (`total a pagar = saldo anterior − pagos + consumos`).
Si no cuadra, la app lo muestra en rojo y pide confirmación extra antes de subir.

### Categorías sugeridas (en orden de prioridad)
1. Lo que ya corregiste antes (se aprende al subir).
2. Diccionario inicial de comercios (`web/js/rules.js`), cruzado por **nombre** con tus categorías y
   etiquetas reales de Wallet.
3. Notas de tu historial en Wallet (apoyo; tu historial guarda pocos comercios).

Lo que no se reconoce queda "sin categoría" para que lo elijas.

### Duplicados
Antes de subir se consultan los registros de la cuenta elegida en las fechas del estado. Si hay uno con
el mismo monto en ±3 días, el movimiento se marca "¿ya existe?" y queda sin seleccionar.
Además, lo ya subido desde este dispositivo se recuerda y no se vuelve a ofrecer.

## Despliegue (Cloudflare, gratis)

Resumen (la guía paso a paso detallada se entregó en el chat):

1. *Workers & Pages* → *Create* → *Import a repository* → elige este repositorio.
   - Rama de producción: `claude/friendly-hopper-wfhlap` (o `main` si la fusionas).
   - Build command: vacío. Deploy command: `npx wrangler deploy --config worker/wrangler.toml`.
2. En el Worker → *Settings* → *Variables and Secrets*: secreto `WALLET_TOKEN` (token **nuevo** de Wallet).
3. *Settings* → *Domains & Routes* → *Enable Cloudflare Access* en la URL `workers.dev`; ajusta la política
   para que permita **solo tu correo**.
4. Copia el valor `TEAM_DOMAIN` y la `POLICY_AUD` que muestra Cloudflare a *Variables and Secrets*.
5. En el iPhone: abre la URL en Safari → *Compartir* → *Añadir a pantalla de inicio*.

> Si `TEAM_DOMAIN` o `POLICY_AUD` faltan, la API responde 403 (falla cerrado). Las URLs de vista previa
> están desactivadas (`preview_urls = false`).

## Desarrollo

```bash
npm install
npm test                       # pruebas (parsers, categorías, seguridad del Worker)

# Contra tus PDFs reales (no se suben al repo: *.pdf está en .gitignore):
GUAYAQUIL_PDF=ruta/a.pdf PICHINCHA_PDF=ruta/b.pdf npm test

# Local con wrangler (sin Access):
printf 'WALLET_TOKEN=...\nDEV_ALLOW_NO_ACCESS=1\n' > worker/.dev.vars
npm run dev
```

## Límites conocidos

- Máx. 50 registros por petición a Wallet (la app parte en lotes sola); 450 peticiones/hora.
- Solo Banco Guayaquil y Banco Pichincha. Otro banco = nuevo parser en `web/js/parsers/`.
- Los PDF deben tener texto (no escaneados). Los dos formatos actuales sí lo tienen.
- Una sola etiqueta por movimiento en la interfaz (la API admite varias).
- Lo aprendido y lo ya subido se guarda en el navegador del dispositivo: si borras los datos de
  Safari, se pierde (la detección de duplicados contra Wallet sigue funcionando).
- Los pagos a la tarjeta no se registran: la API admite transferencias emparejadas, queda como mejora.
