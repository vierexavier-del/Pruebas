// Líneas sintéticas con el mismo formato que los estados reales (sin datos personales).
export const GUAYAQUIL = `
Banco Guayaquil S.A
NOMBRE DE PRUEBA                       Fecha de Corte / Emisión: 29/SEP/2026
                                       Periodo desde: 27/AGO/2026
                                       Hasta: 29/SEP/2026
Resumen Tarjeta N.° 454086 XXXXXX 1111          Detalle
                                       Saldo Anterior:     +$100.00
                                       Total a pagar:      $319.50
Movimientos
 Saldo anterior                                              +$ 100.00
 Pagos/Créditos
  SEP/01   260901074420   PAGO en OFIC. MATRIZ   PAGO   $ 100.00   −
  Subtotal Pagos/Créditos                                     $ 100.00
 Consumos Rotativos Titular
  AGO/31   244939862432   SUPERMAXI PRUEBA        CONS.   $ 50.00   +
                          EC       U$          50.00
  SEP/09   247933862520   NETFLIX.COM             CONS.   $ 20.00   +
  SEP/09   506006         IVA X SERVICIO DIGITAL  N/D     $ 3.00   +
  SEP/14   500558         COSTO SERV RECAUD PAGOS TERCEROS   N/D   $ 0.31   $ 0.05   +
  SEP/20   111111111      DEVOLUCION TIENDA       CONS.   $ 10.00   −
 Consumos Diferidos Titular
  DEC/16   844881         PMZ SEGUROS PRUEBA      DIF. 1/3   $ 100.00   +   $ 200.00
`.replace('DEC/16', 'SEP/16').split('\n');

export const PICHINCHA = `
BANCO PICHINCHA C.A.
   FECHA DE EMISIÓN      FECHA MÁXIMA DE PAGO SIN RECARGOS      PERÍODO DESDE      PERÍODO HASTA
      15 SEP 2026               30 SEP 2026                   16/08/2026         15/09/2026
DETALLE DE MOVIMIENTOS
Fecha     Referencia          Descripción                                Operación               Valores           Diferido
                                SALDO ANTERIOR                                                       500,00
19/08              415953       SU PAGO "MUCHAS GRACIAS"                                             500,00-
                                SUBTOTAL PAGOS                                                       500,00
15/08             3088333       IVA                                         N/D IVA                      0,03
15/08             3088333       TARIFA CONSUMO GASOLINERA                   N/D T15                      0,20
MADERA PRUEBA    4514-xxxx-xxxx-2222 * ADICIONAL PRUEBA *    ID: 1
15/08             3088333       PETRONORTE           U              CONSUMO EC                 40,00
MADERA PRUEBA    4697-xxxx-xxxx-1621 * PRINCIPAL PRUEBA        ID: 1
09/06             180836        PTP - UDLA PRUEBA        DIFERIDO (4/6)                    275,00                 550,00
09/09             6159671       UBER RIDES           S                      CONSUMO CR                   3,05
09/09             6159671       RET IVA SERV DIGITAL 100%                   N/D                          0,46
12/09             6458355       SUPERMAXI PRUEBA          CONSUMO EC                 10,00
13/09             6458356       DEVOLUCION               CONSUMO EC                 5,00-
                                SIGUE. . . .
    TOTAL CONSUMOS MES                                                                   323.74
    TOTAL A PAGAR USD                                  323.74
`.split('\n');
