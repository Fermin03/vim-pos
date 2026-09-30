# 0021 — El precio vigente sale de una regla, y cambiar de plan ajusta lo que el plan incluye

**Fecha:** 2026-09-30 · **Estado:** vigente

## Qué había

- `suscripciones.precio_mensual_mxn` era el único precio. El piloto (mes 1 gratis, meses 2 a 7 a
  $499, del 8 en adelante $699, solo Esencial — `sitio-web/precios.md`) no se podía capturar: al
  activar el cobro se guardaba $699, el dueño veía $699 y el MRR contaba $699. Y nadie iba a
  acordarse de subirlo en el mes 8.
- La prueba no tenía fin. La alerta "Trial por vencer" buscaba `suscripciones.estado = 'TRIAL'`,
  un valor que el enum no tiene.
- Cambiar de plan movía `tenants.plan_actual_id` y nada más: los folios del mes seguían en los del
  plan viejo, subir a Negocio no daba la facturación que incluye y bajar a Esencial se la dejaba.
- "Plan y pagos" pedía el comprobante sin decir a qué cuenta pagar.

## Qué hacemos ahora (migración 0141)

**Precio vigente.** La suscripción guarda el precio de lista y, encima, una promoción opcional con
fecha de fin (`precio_promocional_mxn`, `promocion_hasta`, `promocion_nombre`). La regla:

> precio vigente = el de promoción si hoy, en hora de México, es ≤ `promocion_hasta`; si no, el de lista.

Vive en `precio_vigente_suscripcion()` (SQL) y en `precioVigente()` de `@vim/db/cobro` (TS), con
los mismos casos probados en `smoke_cobro_plan.sql` y en `cobro-promocion.test.ts`. Todo lo que
enseña o suma precio (MRR, alertas, ficha, registro de pagos, Plan y pagos del dueño) usa esa
regla. Al registrar varios meses de una vez, cada mes se cobra al precio de su fecha de cobro.
El botón "Piloto 5 negocios" pone $499 hasta el día anterior al sexto aniversario del inicio del
cobro: el séptimo cobro ya sale a lista.

**Prueba con fecha.** `tenants.prueba_hasta`, que un trigger pone a +30 días (México) en toda alta
en `TRIAL`. No bloquea: avisa al dueño (dashboard y Plan y pagos) y al panel ("Prueba por vencer",
"Prueba vencida sin cobro"). Suspender sigue siendo manual, con gracia (ADR 0014/0020).

**Cambio de plan con lo que incluye.** `cambiar_plan_tenant()` hace en una transacción: el plan,
los folios base del mes (`tenant_folios_saldo.folios_base_mensuales`), los add-ons que el plan
incluye y el precio del cobro vigente.

- Qué incluye un plan: `planes.features_incluidos.cfdi_incluido` (ya existía) y
  `delivery_incluido` (nueva, con la misma lista de planes que `precioAltaDelivery`).
- Qué se dio por el plan: `tenant_addons.incluido_en_plan`. Al subir, se da a $0 y se cierra la
  fila que pagaba aparte; al bajar, se retira **solo** lo marcado — lo pagado aparte o de cortesía
  se queda. `addon_unico_activo` es una alta por día: subir-bajar-subir el mismo día reactiva la
  fila de hoy en vez de insertar.
- El alta (`crear_tenant_con_owner`) usa la misma función.
- La suscripción se actualiza **en su lugar**: los pagos cuelgan de ella y su ancla de cobro sale
  de su fecha de alta. El cambio queda en `suscripciones.notas` y en la bitácora. La promoción se
  quita (se pactó para el plan anterior).

**Datos de pago.** `plataforma_datos_pago` (una fila, solo service_role) y
`datos_pago_plataforma()` para el dueño/admin del negocio. CLABE validada con su dígito de control
en SQL y TS. El panel la edita confirmando con `TODOS`.

## Por qué

Un precio que cambia solo en una fecha es una regla, no un dato: si cada pantalla la reimplementa,
el panel y el dueño acaban viendo cantidades distintas. Y lo que el plan incluye tiene que moverse
con el plan en la misma transacción, o el cliente paga por algo que el sistema le niega (o al revés).

## Consecuencias

- La regla vive en dos lenguajes. Los comentarios de cada lado apuntan al otro y los casos de
  prueba son los mismos; si se toca una, se toca la otra.
- Un cliente que pagaba delivery o facturación aparte y sube de plan, y luego baja, pierde el
  add-on (su fila pagada se cerró al subir). La vista previa del panel lo dice antes de confirmar.
- Los clientes de Negocio/Cadena dados de alta antes de 0141 no tienen delivery a $0: se les da al
  cambiar de plan o a mano. No se hizo un relleno para no tocar contratos sin hablarlo.
- La prueba vencida no corta nada. Si nadie mira las alertas, el cliente sigue gratis.
