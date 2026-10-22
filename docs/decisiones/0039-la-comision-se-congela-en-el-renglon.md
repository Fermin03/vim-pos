# 0039 — La comisión se congela en el renglón, se calcula al leer, y el anticipo es un pago que no se declara

**Fecha:** 19 de octubre de 2026 · **Estado:** vigente (entrega 2 de 4 del giro de belleza)

## Qué había antes

Un renglón de venta no sabía quién lo hizo, y nadie cobraba comisión. La cita (ADR 0038) era un
ticket por venir, pero no había forma de cobrarla, ni de dejar un anticipo al apartar.

## Qué hacemos ahora

- **El colaborador va en el renglón** (`ticket_items.colaborador_id`), no en el ticket. Una venta
  puede mezclar servicios de dos personas y productos sin nadie. Un servicio exige colaborador; un
  producto puede ir sin él y entonces no da comisión.
- **La regla de comisión se congela al insertar el renglón.** Un disparador copia al propio renglón
  tipo, valor y base, con esta precedencia: la excepción del colaborador en ese servicio
  (`servicio_colaborador`), luego la del servicio (`servicios_agenda`), y solo para productos el %
  del negocio. Si el dueño cambia las reglas mañana, las ventas de ayer no se mueven. Si el renglón
  ya trae su regla (lo que sube la caja por el sync, donde el disparador no corre) no se pisa.
- **La comisión no se guarda: se calcula al leer** (`vw_comisiones_renglon`). No hay tabla de
  comisiones que cuadrar; devolver o cancelar una venta la saca del reporte sin tocar nada más.
- **Base COBRADO o LISTA**, la elige el negocio y también se congela. COBRADO es el total del
  renglón sin IVA, ya con descuentos; el descuento de todo el ticket (y el canje de lealtad) se
  **prorratea** entre los renglones por un factor, para que la suma de comisiones no pase de lo
  cobrado. LISTA es el precio de lista sin IVA y **no incluye modificadores**.
- **El sueldo** solo se suma al reporte cuando el rango es exactamente un periodo del negocio
  (semanal o quincenal). En rangos libres salen solo las comisiones.
- **El anticipo es un método de pago, `ANTICIPO`, que el corte nunca declara** y tiene su propia
  tabla, `anticipos_cita`. El dinero entra al corte del turno que lo recibe (como un abono a crédito);
  después se resuelve una sola vez: APLICADO (paga su venta), DEVUELTO o RETENIDO («Anticipo no
  reembolsable»). Solo se escribe por RPC y un anticipo resuelto no se edita a mano.
- **La única vuelta atrás es del sistema.** Si la venta se cancela sin haberse pagado, o se cancela
  o se devuelve regresando el dinero con EFECTIVO o MISMO_METODO_PAGO, el anticipo APLICADO vuelve a
  VIGENTE para cobrar la cita en otra venta. Con CORTESIA, VALE, NOTA_CREDITO o cancelando sin
  devolver dinero queda APLICADO (si no, la clienta recibiría ese valor dos veces).
- **Devolver o retener un anticipo**, con cualquier método, pide el mismo permiso que devolver una
  venta (`venta.devolucion`) o el PIN de un supervisor, en un turno abierto de la caja que lo hace.
- **Editar un renglón** conserva su colaborador: su precio y su regla de comisión.
- **Un anticipo retenido no es venta ni factura** en esta entrega: sale en el corte y en los reportes.

## Cómo se despliega (no es obvio)

- **0216–0223 a la nube a mano y antes del merge, en orden y cada archivo en su propia
  transacción.** 0220 solo agrega valores de enum (`COBRADA`, `ANTICIPO`) y tiene que quedar
  confirmada antes de correr 0221: Postgres no deja usar un valor en la transacción que lo crea, y
  0222 lo usa al crear el disparador de pagos. Después, el instalador con 0216–0223.
- Una caja vieja no se rompe con la nube nueva: no baja pagos, no tiene agenda (el pull ignora
  `citas` y `anticipos_cita`), guarda solo las columnas que conoce y no sube nada nuevo (sus
  renglones sin colaborador entran igual). Solo no tiene la función, así
  que ningún negocio debe usar anticipos ni el cobro de citas mientras sus cajas no tengan el
  instalador.
- Los conflictos del sync se registran en `sync_eventos`: gana la nube cuando los dos lados
  resolvieron un anticipo distinto, o cuando una cita quedó cobrada en dos ventas pagadas de cajas
  distintas (o cobrada en la caja y cancelada en la nube). La caja reintenta si deshace algo que la
  nube aún no ve, incluido el recobro de una cita cuya primera venta se canceló en otro lote.

## Por qué

Congelar la regla hace que el reporte de ayer diga lo mismo mañana, sin reconstruir historia.
Calcular al leer evita una tabla que habría que corregir en cada cancelación o devolución. Y el
anticipo no es ingreso del día ni dinero que la cajera cuente: tratarlo como un pago aparte, con
su estado, impide perderlo o contarlo dos veces.

Spec: `docs/superpowers/specs/2026-10-18-giros-belleza-design.md`. Antecedente: ADR 0038.
