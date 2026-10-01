# 0024 — La sucursal y la caja adicional son extras por cantidad; la caja adicional es UNA caja, no una por sucursal

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

   > base = la excepción de `tenant_limites` si existe; si no, el plan · `NULL` = sin límite

   - **Sucursales:** efectivo = base + `SUCURSAL_EXTRA` × cantidad. Cada una es una sucursal más.
   - **Cajas — "$249 por cada caja nueva que se abra"** (decisión del dueño, 1 oct 2026). La base
     es **por sucursal** y no se le suma nada. `CAJA_EXTRA.cantidad` son cajas adicionales para
     **todo el negocio**, usables en la sucursal que sea:

     > excedente = Σ por sucursal de max(0, cajas activas − base)
     > se puede abrir una caja si su sucursal está bajo la base, **o** si excedente < adicionales

     La primera versión de esta migración sumaba el extra a la base por sucursal: con tres
     sucursales, una caja adicional de $249 daba tres cajas. Se corrigió antes de aplicarla.

   Vive en `limites_efectivos()` (SQL): `max_cajas_por_sucursal` es la base, y dos llaves nuevas,
   `cajas_adicionales` y `cajas_adicionales_en_uso`, dicen el resto. Todos lo expresan igual, con
   `textoLimiteCajas()` de `@vim/db/cobro`: **"3 cajas por sucursal + 2 cajas adicionales (1 en
   uso)"** — nunca un número sumado. `resolver_directivas` no se tocó (solo quita `del_plan` y
   `excepcion`), así que las dos llaves nuevas también llegan a la caja.

3. **Una sola puerta para cambiarlos:** `fijar_extra_tenant(tenant, código, cantidad, precio)`,
   solo `service_role`. Cantidad 0 = quitar. Rechaza:
   - `SIN_LIMITE` — una caja adicional donde el plan ya no limita las cajas (Cadena);
   - `EXTRA_EN_USO` — bajar la cantidad por debajo de lo que el cliente ya usa (sucursales
     activas; cajas adicionales en uso), diciendo cuánto usa y cuántas tiene que desactivar antes.

   Cambiar la cantidad **el mismo día** actualiza la fila de hoy (`addon_unico_activo` es una alta
   por día, no "uno activo"); otro día cierra la vigente y abre otra, y así la historia dice
   cuántas tuvo y desde cuándo. Sin precio nuevo se conserva el **último pactado** con ese
   cliente, aunque el extra ya se le hubiera quitado: quitarlo y volver a ponerlo no le sube el
   precio en silencio. El alta y la baja de los add-ons de siempre **no** aceptan estos
   dos códigos: ese camino no sabe de cantidades ni comprueba el uso.

4. **Cambio de plan:** los extras se **conservan** — se pagan aparte. Dos casos:
   - el plan nuevo no limita las cajas (o las sucursales): el extra correspondiente se retira en
     la misma transacción y sale en `addons.retirados` (pagaría por nada). La vista previa del
     panel lo dice antes de confirmar, con lo que deja de pagar;
   - el plan nuevo da **menos cajas por sucursal** y las ya abiertas no caben ni con sus
     adicionales: el cambio se **rechaza** (`CAJAS_EXCEDEN_PLAN`) diciendo cuántas sobran. O
     contrata las adicionales que faltan o desactiva cajas, y entonces sí.

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

- **El candado de cajas ya no es "N por sucursal" a secas.** Una caja se rechaza cuando su
  sucursal está en la base Y no queda adicional libre en todo el negocio; el mensaje dice cuántas
  adicionales usa y lo que cuesta otra. Para contar las de todas las sucursales, el trigger pasó
  a `SECURITY DEFINER` (solo lee).
- **Una adicional no pertenece a una sucursal.** Si se desactiva la caja de más en una, la
  adicional queda libre para cualquier otra.
- **Las excepciones son cortesías, no ventas.** En producción no hay ninguna fila en
  `tenant_limites`, así que no hubo nada que convertir. Siguen existiendo —la excepción reemplaza
  la base del plan y los extras cuentan encima—, y el panel las llama por su nombre: **"Excepción
  sin cobro"**, con su motivo. Crecer se vende como extra; la excepción es para una cortesía o
  algo temporal.
- **Bajar de plan puede rechazarse** por cajas que no caben (antes no se comprobaba nada). Las
  sucursales siguen sin comprobarse al bajar.
- **Con una excepción encima de un plan sin límite** (o al revés) puede quedar un extra que no
  amplía nada. La ficha lo dice ("su plan trae cajas sin límite") y deja quitarlo.
- **Bajar de plan no comprueba las sucursales** (ya era así: el candado actúa al dar de alta).
  Un cliente que baja de Cadena a Negocio con tres sucursales las conserva hasta que desactive
  alguna; no podrá crear más.
- **El MRR sube** el día que esto se despliega solo si ya hay add-ons de pago vigentes: antes no
  contaba ninguno (ni facturación ni delivery de Esencial).
- **La regla vive en dos lenguajes**, como la del precio vigente. `smoke_extras.sql` y
  `total-mensual.test.ts` prueban los mismos casos.
- Los pagos ya registrados no cambian: cada uno guarda su monto.
