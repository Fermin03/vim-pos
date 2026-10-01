# 0024 — La sucursal y la caja adicional son extras por cantidad: suben el límite y se suman a la excepción

**Fecha:** 2026-10-01 · **Estado:** vigente

## Qué había

- La página de precios vende "Sucursal adicional $599/mes" y "Caja adicional $249/mes". En el
  catálogo `addons` solo existían CFDI y DELIVERY.
- En la práctica VIM subía el límite a mano con una **excepción** (`tenant_limites`, 0103) y el
  cargo no estaba en ningún lado: el panel, el dueño y el MRR seguían viendo solo el plan.
- **ADR 0014:** `limites_efectivos()` es la única lectura de límites — "excepción si existe, si no
  el plan" — y de ella cuelgan los candados de cajas y sucursales, las directivas de la caja y
  `crear-empleado`.
- **ADR 0021:** cambiar de plan mueve en una transacción lo que el plan *incluye* (CFDI,
  delivery). De los extras no decía nada porque no existían.

## Qué hacemos ahora (migración 0147)

1. **Dos add-ons con cantidad.** `SUCURSAL_EXTRA` ($599) y `CAJA_EXTRA` ($249), y
   `tenant_addons.cantidad` (1 por omisión). `precio_mensual_mxn` es el precio **unitario**; se
   paga precio × cantidad.

2. **La precedencia de los límites, escrita:**

   > base = la excepción de `tenant_limites` si existe; si no, el plan
   > efectivo = base + extras vigentes × cantidad · `NULL` (sin límite) sigue siendo `NULL`

   Vive en `limites_efectivos()` (SQL) y en `limiteConExtras()` de `@vim/db/cobro` (TS, para
   pintar el desglose). Las llaves del JSON no cambian, así que `resolver_directivas` no se tocó
   y a la caja le sigue llegando solo el número final.

3. **Una sola puerta para cambiarlos:** `fijar_extra_tenant(tenant, código, cantidad, precio)`,
   solo `service_role`. Cantidad 0 = quitar. Rechaza:
   - `SIN_LIMITE` — una caja adicional donde el plan ya no limita las cajas (Cadena);
   - `EXTRA_EN_USO` — bajar la cantidad por debajo de lo que el cliente ya usa, diciendo cuánto
     usa y cuántas tiene que desactivar antes.

   Cambiar la cantidad **el mismo día** actualiza la fila de hoy (`addon_unico_activo` es una alta
   por día, no "uno activo"); otro día cierra la vigente y abre otra, y así la historia dice
   cuántas tuvo y desde cuándo. Sin precio nuevo se conserva el **último pactado** con ese
   cliente, aunque el extra ya se le hubiera quitado: quitarlo y volver a ponerlo no le sube el
   precio en silencio. El alta y la baja de los add-ons de siempre **no** aceptan estos
   dos códigos: ese camino no sabe de cantidades ni comprueba el uso.

4. **Cambio de plan:** los extras se **conservan** — se pagan aparte. La única excepción es la que
   dejaría al cliente pagando por nada: si el plan nuevo no limita las cajas (o las sucursales),
   el extra correspondiente se retira en la misma transacción y sale en `addons.retirados`. La
   vista previa del panel lo dice antes de confirmar, con lo que deja de pagar.

5. **Un solo total.** `totalMensual()` de `@vim/db/cobro` = precio vigente de la suscripción
   (ADR 0021) + add-ons vigentes × cantidad. Lo marcado `incluido_en_plan` vale cero siempre,
   aunque su fila traiga un precio. Lo usan el MRR, la alerta de cobro vencido, el monto
   que propone "Registrar pago", la ficha y "Plan y pagos" del dueño. Sin cobro activo el total es
   cero: en prueba no se cobra nada, ni los extras.

## Por qué

- **La excepción es base y no tope.** Si la excepción fuera el número final, un extra contratado
  encima no haría nada: el cliente pagaría $249 por una caja que el sistema le niega. Como base,
  las excepciones que ya existen valen exactamente lo mismo que antes (sin extras, base =
  efectivo) y lo que se cobra siempre se nota.
- **Sumar dentro de `limites_efectivos` y no en cada candado:** es la lectura única del ADR 0014.
  Otra función "con extras" habría dejado a alguno de sus cuatro usuarios leyendo el número viejo.
- **La regla de uso va en la base:** la comprobación y la escritura tienen que ser la misma
  transacción, con el tenant bloqueado. En la ruta del panel serían dos pasos con una ventana
  entre ellos.
- **No se validó "debe quitar el extra antes de subir a Cadena":** obligaría a dos operaciones
  para algo que tiene una sola respuesta correcta. Se retira solo y se avisa.

## Consecuencias

- **El límite de cajas es por sucursal**, así que una caja adicional sube el tope de *cada*
  sucursal. Con una sola sucursal (Esencial, Negocio) es exacto. Con varias, un cliente que paga
  una caja adicional puede poner una más en cada una. Se acepta mientras los clientes con varias
  sucursales sean pocos; si deja de valer, el arreglo es contar cajas por negocio y no por
  sucursal, y es otro ADR.
- **Las excepciones existentes no se convirtieron en extras de pago.** Quien hoy tiene una caja de
  más por excepción la sigue teniendo sin pagar. Cobrársela es cambiarle el contrato, y eso se
  habla con él: se quita la excepción y se le da de alta el extra.
- **Con una excepción encima de un plan sin límite** (o al revés) puede quedar un extra que no
  amplía nada. La ficha lo dice ("su plan trae cajas sin límite") y deja quitarlo.
- **Bajar de plan sigue sin comprobar el uso** (ya era así: los candados actúan al dar de alta).
  Un cliente que baja de Cadena a Negocio con tres sucursales las conserva hasta que desactive
  alguna; no podrá crear más.
- **El MRR sube** el día que esto se despliega solo si ya hay add-ons de pago vigentes: antes no
  contaba ninguno (ni facturación ni delivery de Esencial).
- **La regla vive en dos lenguajes**, como la del precio vigente. `smoke_extras.sql` y
  `total-mensual.test.ts` prueban los mismos casos.
- Los pagos ya registrados no cambian: cada uno guarda su monto.
