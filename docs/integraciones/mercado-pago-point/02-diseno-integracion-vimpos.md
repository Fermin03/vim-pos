# Cómo va a funcionar el cobro con terminal dentro de VIM POS

**Estado:** propuesta de diseño (8 oct 2026) con las decisiones del dueño de ese día ya
incorporadas (documento 03 §B). Falta el ADR. Se apoya en lo que ya existe en el repo y en lo aprendido en `01-resumen-api.md`. Nada de esto
está construido.

## 0. Lo que ya existe y se reutiliza

| Ya existe | Dónde | Para qué sirve aquí |
|---|---|---|
| `metodo_pago` con `TARJETA_CREDITO` y `TARJETA_DEBITO` | enum, `pagos.metodo_pago` | El cobro con terminal **no necesita método nuevo**: Mercado Pago dice cuál de los dos fue |
| `pagos.referencia` y `pagos.terminal_aprobacion` | 0008; `aplicar_pago` ya recibe `p_referencia` y `p_terminal_aprobacion` (0102) | Ahí cae la referencia del cobro. Hoy `terminal_aprobacion` nadie la llena |
| `aplicar_pago` idempotente por `p_client_id_local` | `apps/pos/app/lib/cobro.ts` | El pago se aplica una sola vez aunque el aviso de «aprobado» llegue dos veces |
| Propina capturada en el POS antes de cobrar | `establecer_propina_ticket`, `sucursal_propinas_config` | Plan B de la propina (§6): si la terminal no puede preguntarla, se manda el total **con propina** |
| Pago dividido | `modal-cobro.tsx` | Cada parte con tarjeta es un cobro de terminal aparte |
| Conexión OAuth desde el admin, con el secreto solo en Supabase | `delivery-uber-conexion`, `apps/admin/app/lib/integraciones.ts` | Mismo patrón para «Conectar Mercado Pago» |
| Receptor de webhooks público que valida firma y responde rápido | `delivery-webhook-uber` | Mismo patrón para los avisos de `order` |
| La caja de escritorio reenvía funciones a la nube con el token del dispositivo | `desktop/src/gateway.mjs` (`/functions/v1/delivery-accion`, `lealtad-canje`) | Así llega la caja a Mercado Pago sin ver ningún secreto. Sin nube responde `503 FUNCION_REQUIERE_NUBE` |
| `urlFuncion()` / `encabezadosFuncion()` | `apps/pos/app/lib/supabase.ts` | Para llamar la función nueva también desde una segunda caja de la red local |
| `_shared/cors.ts`, `_shared/errores.ts`, `_shared/identidad.ts` | `supabase/functions/_shared/` | Base de las funciones nuevas |

Lo que **no** existe: tablas para la conexión con Mercado Pago, para ligar terminal y caja y para
el cobro en curso; el adaptador; las pantallas; y el paso «esperando a la terminal» del cobro.

## 1. Principio: VIM es el integrador, el restaurante solo autoriza

- VIM registra **una** aplicación en Mercado Pago. Su `client_id`, `client_secret` y la clave
  secreta de webhooks viven como **secrets de Supabase**. Nunca en tablas del tenant ni en el
  navegador.
- El restaurante **no captura credenciales**: pulsa «Conectar Mercado Pago» en el admin, entra a su
  cuenta y autoriza (OAuth, `01` §3).
- **Diferencia importante con Uber:** allá el token del dueño se desecha tras activar la tienda.
  Aquí **hay que guardarlo**, porque cada cobro se hace con el Access Token del restaurante. Ese
  token permite cobrar y devolver dinero en su cuenta: es el dato más sensible de toda la
  integración (§8).
- El dinero va directo a la cuenta de Mercado Pago del restaurante. VIM no lo toca ni ve tarjetas.

## 2. Arquitectura

```
  CAJA (POS)                         NUBE (Supabase)                         MERCADO PAGO
  ──────────                         ───────────────                         ────────────
  modal de cobro
    │ "Tarjeta · terminal"
    ├─ crear ──▶ gateway ──▶ terminal-cobro ──── POST /v1/orders ─────────▶  order `created`
    │                          │ guarda terminal_cobros (EN_TERMINAL)              │
    │                          │                                            la terminal la toma
    │  cada ~2 s               │                                            el cliente paga
    ├─ estado ─▶ gateway ──▶ terminal-cobro                                        │
    │                          │ lee terminal_cobros  ◀── terminal-webhook-mp ◀── webhook `order.*`
    │                          │                          (pública, valida firma,
    │  APROBADO                ▼                           responde < 2 s)
    └─ aplicar_pago (RPC local, idempotente) ──▶ el pago entra al ticket como hoy
```

- **Un adaptador** `_shared/pagos-terminal/mercado-pago.ts` detrás de una interfaz chica
  (`crearCobro`, `cancelarCobro`, `reembolsar`, `consultar`, `listarTerminales`, `ponerModoPdv`,
  `normalizarAviso`). El orden es Mercado Pago, luego Clip (`../clip-pinpad/`), luego Netpay: la interfaz es
  para que el segundo proveedor no obligue a tocar la caja. No se construye nada del segundo ahora.
- **Regla dura respetada:** el POS y el admin nunca hablan con Mercado Pago ni ven secretos; todo
  pasa por Edge Functions con `service_role`.
- **Quién aplica el pago: la caja, no la nube.** En el escritorio el ticket vive en el Postgres
  local y sube por snapshot; cuando se cobra, la nube puede no tener ese ticket todavía. Por eso
  la nube solo dice «aprobado» y es el POS quien llama a `aplicar_pago` contra su base, igual que
  con cualquier otro método (regla 5 de `CLAUDE.md`).
- **La caja pregunta a nuestra tabla, no a Mercado Pago.** Mercado Pago desaconseja consultar la
  order seguido; el webhook actualiza `terminal_cobros` y la caja lee eso. Solo si pasan ~15 s sin
  aviso la función hace **una** consulta directa de respaldo.

## 3. Funciones

| Función | Quién la llama | Qué hace |
|---|---|---|
| `terminal-mp-conexion` | Admin (Dueño/Administrador, jerarquía ≥ 4) | Canjea el `code`, guarda tokens, crea sucursal y caja en Mercado Pago, lista terminales, liga terminal ↔ caja, pone modo PDV, desconecta |
| `terminal-cobro` | La caja (token de dispositivo vía gateway; token de empleado en el POS web) | `crear`, `estado`, `cancelar`, `reembolsar`, `pendientes`, `confirmar` |
| `terminal-webhook-mp` | Mercado Pago | Valida `x-signature`, guarda el aviso (idempotente por su `id`), actualiza el cobro. Pública: `verify_jwt = false` en `config.toml`, y **desplegarla antes de mezclar** |
| (tarea programada) | `pg_cron` | Renueva los Access Token que venzan en menos de 30 días y guarda el `refresh_token` nuevo |

## 4. Tablas (propuesta)

Todas con `tenant_id` y RLS. Numeración: la siguiente migración libre al momento de construir.

- **`terminal_conexiones`** — una por cuenta de Mercado Pago autorizada: `tenant_id`,
  `proveedor` (`MERCADO_PAGO`), `cuenta_id_externo` (el `user_id`), `estado` (`ACTIVA`, `ERROR`,
  `DESCONECTADA`), `vence_at`, `ultimo_error`, `conectada_at`. Lectura para el admin del tenant;
  **sin los tokens**.
- **`terminal_credenciales`** — `conexion_id`, `access_token`, `refresh_token`, `vence_at`.
  **Sin política de lectura para ningún rol de cliente**: solo `service_role`. Tabla aparte a
  propósito, para que un `select *` de la conexión nunca los arrastre (mismo criterio que
  `delivery_credenciales_app`).
- **`terminal_dispositivos`** — la terminal física y su caja: `conexion_id`, `sucursal_id`,
  `caja_id` (única: una caja, una terminal), `terminal_id_externo` (único),
  `sucursal_id_externo`, `caja_id_externo`, `modo`, `activa`.
- **`terminal_config_sucursal`** — lo que el cliente decide en el admin, por sucursal:
  `conexion_id` (qué cuenta de Mercado Pago usa esa sucursal), `imprime_terminal` (su comprobante
  o nada), `espera_segundos` (cuánto dura el cobro antes de vencer; 180 de inicio, entre 30 y
  10 800), `propina_en_terminal`.
- **`terminal_cobros`** — un intento de cobro. El `id` (uuid) **es** la `external_reference` y la
  `X-Idempotency-Key`. Campos: `sucursal_id`, `caja_id`, `dispositivo_id`, `ticket_id` (**sin llave
  foránea**: el ticket puede no haber subido), `folio`, `monto_mxn numeric(12,2)`, `estado`,
  `detalle`, `orden_id_externo`, `pago_id_externo`, `tipo_tarjeta`, `marca`, `mensualidades`,
  `referencia`, `reembolsado_mxn`, `aplicado_at`, `empleado_id`, tiempos.
- **`terminal_eventos`** — bitácora cruda de avisos: `id_externo` (único), `accion`, `payload`,
  `procesado_at`. Con retención, como `delivery_eventos`.

Estados de `terminal_cobros`, mapeados desde los de Mercado Pago (`01` §6):

| Nuestro | Viene de | Qué ve el cajero |
|---|---|---|
| `EN_TERMINAL` | `created`, `at_terminal` | «Cobra en la terminal» + botón Cancelar |
| `APROBADO` | `processed` / `accredited` | El pago entra solo al ticket |
| `RECHAZADO` | `failed` | El motivo en claro (fondos, tarjeta bloqueada, banco) + Reintentar |
| `CANCELADO` | `canceled` | Vuelve al selector de pago |
| `VENCIDO` | `expired` | Vuelve al selector de pago |
| `REVISAR` | `action_required` | «¿La terminal dice aprobado?» (§6) |
| `DEVUELTO` | `refunded` (total o parcial) | En el historial del ticket |

## 5. Conexión del restaurante (una vez, en el admin)

Admin → Integraciones → **Terminal de tarjetas**.

1. **Conectar Mercado Pago.** Redirige a `auth.mercadopago.com` con `state` aleatorio; vuelve a
   `https://admin.vimpos.com.mx/integraciones/mercado-pago/callback`; `terminal-mp-conexion` canjea el `code` y guarda los
   tokens.
2. **Por cada sucursal:** el cliente elige qué cuenta conectada usa (la misma para todas o una
   por sucursal: se pueden conectar varias). La función crea la sucursal en Mercado Pago (`external_id` = id de la
   sucursal en VIM; dirección y coordenadas salen de la ficha de la sucursal) y una caja por cada
   caja de VIM que vaya a tener terminal (`external_id` = id de la caja).
3. **Ligar la terminal (lo único manual, lo hace el dueño con la terminal en la mano):** encender,
   escanear el QR con su app de Mercado Pago, elegir en la terminal la sucursal y la caja recién
   creadas. La pantalla del admin lo explica con pasos.
4. **Detectar.** El admin lista las terminales (`GET /terminals/v1/list`), muestra a qué caja
   quedó ligada cada una y, con un botón, la pone en modo PDV. Aviso en pantalla: **hay que
   reiniciar la terminal**.
5. **Probar.** Botón «Cobro de prueba de $1» que se devuelve solo. Si pasa, queda activa.

Desconectar: marca la conexión `DESCONECTADA`, borra los tokens y regresa las terminales a
`STANDALONE` para que el restaurante pueda seguir cobrando a mano.

## 6. Flujo de cobro en la caja

1. En el modal de cobro, si la caja tiene terminal activa, «Tarjeta» cobra por la terminal. El
   registro manual de hoy **se queda** como segunda opción («La cobré en otra terminal»).
2. El POS genera el `id` del cobro y llama `terminal-cobro crear` con ticket, folio y monto. El
   monto es lo pendiente del ticket (o la parte del pago dividido). Propina: ver abajo.
3. La función crea la order: `external_reference` = id del cobro, `description` = folio del ticket
   (sin nombres ni teléfonos), `expiration_time` y `print_on_terminal` según la configuración de la
   sucursal, `terminal_id` de la caja.
4. La caja muestra «Cobra $348.00 en la terminal» y pregunta el estado cada ~2 s.
5. **Aprobado:** el POS llama `aplicar_pago` con el método según el tipo de tarjeta, la referencia
   en `p_referencia`/`p_terminal_aprobacion`, y `p_client_id_local` derivado del id del cobro.
   Después `terminal-cobro confirmar` sella `aplicado_at`. El ticket impreso lleva la referencia.
6. **Rechazado / vencido / cancelado:** mensaje claro y de vuelta al selector de pago.
7. **Cancelar desde la caja:** llama a cancelar. Si la terminal ya tenía el cobro, la respuesta no
   es definitiva: la caja sigue en «Cancelando…» hasta el aviso. Si mientras tanto el cliente pagó,
   llega `APROBADO` y se aplica: **gana lo que pasó en la terminal**.
8. **`REVISAR` (no se sabe si pasó):** la caja pregunta «¿La terminal dice aprobado?». *Sí* pide
   **PIN de encargado** (`autorizar-pin`) y aplica el pago marcándolo como confirmado a mano; *No*
   lo descarta. Queda en la bitácora quién contestó y quién autorizó.
9. **La terminal ya tiene un cobro esperando** (`already_queued_order_for_terminal`): «Hay un
   cobro pendiente en la terminal» con opción de cancelarlo y reintentar.

### Propina

Decisión del dueño: **que el cliente la elija en la terminal**. La documentación no confirma que
la terminal la pregunte en modo PDV (documento 03 §C); se resuelve con la terminal en la mano antes
de construir el cobro.

- **Si se puede:** la caja manda el total sin propina y no la pregunta. Lo cobrado de más llega en
  el aviso; el POS lo registra con `establecer_propina_ticket` **antes** de `aplicar_pago`, para
  que el pago cuadre con el total del ticket. Ojo: Mercado Pago no permite devolución parcial de
  un cobro con propina (`partial_refund_forbidden_with_tips`).
- **Si no se puede:** queda como hoy. La propina se captura en VIM y se manda el total.

### Si la caja se apaga a medio cobro

Es el caso que más duele: el cliente pagó y el ticket quedó abierto. Al abrir sesión, el POS llama
`terminal-cobro pendientes` (cobros `APROBADO` de esa caja sin `aplicado_at`) y termina de aplicar
cada uno; `aplicar_pago` es idempotente, así que repetir no duplica. Mientras exista uno sin
aplicar, el ticket lo avisa.

### Sin internet

- El cobro integrado **necesita internet en la caja y en la terminal**. Sin él, el gateway
  responde `FUNCION_REQUIERE_NUBE` y el POS ofrece el registro manual, como hoy.
- Si quien no tiene internet es solo la caja, el cajero puede cobrar tecleando el monto: el modo se
  cambia desde la propia terminal (*Más opciones > Ajustes > Modo de vinculación*) y hay que
  reiniciarla. Va en la guía de uso del restaurante.
- El ticket nunca se queda atorado por la terminal: siempre existe la salida manual.

## 7. Devoluciones

- Hoy la devolución de un pago con tarjeta se hace aparte en la terminal y VIM solo registra la
  intención (`flujos/01-FLUJOS-COMUNES-CORE.md`). Con la integración, si el pago tiene cobro de
  terminal asociado, la devolución sale de VIM: `terminal-cobro reembolsar`, total o parcial.
- Mismo permiso y misma autorización con PIN que ya pide una devolución.
- Límite de Mercado Pago: 90 días. Después de eso, VIM lo dice y manda al panel de Mercado Pago.
- Si el ticket ya tiene CFDI, la devolución de dinero no cancela el comprobante: eso sigue su flujo.

## 8. Seguridad

- Tokens del restaurante: solo en `terminal_credenciales`, solo `service_role`. Valorar cifrarlos
  en reposo (Vault de Supabase) antes de construir: es decisión del ADR.
- `client_secret` y clave de webhooks: secrets de Supabase, con juego de prueba y de producción.
- Webhook: se rechaza con 401 todo lo que no traiga `x-signature` válida; se enruta por `user_id`
  → `terminal_conexiones`; un aviso de una cuenta desconocida se guarda y se ignora.
- `terminal-cobro` valida que la caja del token sea la dueña de la terminal y que el monto sea
  positivo y con dos decimales. El monto viaja como texto, nunca como `float`.
- `state` de OAuth firmado y de un solo uso (ata la respuesta al tenant que la pidió).
- Aviso `mp-connect` / `application.deauthorized`: la conexión pasa a `DESCONECTADA` y se avisa al
  dueño; la caja vuelve sola al registro manual.
- Nada de datos personales en `external_reference` ni en `description` (lo exige Mercado Pago).

## 9. Pruebas

- RLS entre tenants en las cinco tablas (no negociable).
- Unitarias del adaptador con los ejemplos de `referencia-api/` y `guias/notifications.md`:
  normalización de avisos, mapeo de estados, validación de firma.
- Flujo completo contra la terminal virtual (`…__SBX0000001`) y el simulador de estados: aprobado,
  cada rechazo, vencido, cancelado, `action_required`, devolución.
- Caja apagada a medio cobro: matar el POS tras `APROBADO` y comprobar que al volver se aplica una
  sola vez.
- Prueba final con tarjeta real en una Point Smart 2 y devolución del cobro. De ahí sale también el
  `order_id` para la medición de calidad de Mercado Pago (mínimo 73 puntos).

## 10. Entregas propuestas

1. **Conexión.** Migración, `terminal-mp-conexion`, pantalla del admin, renovación de tokens.
2. **Cobro.** `terminal-cobro` (crear/estado/confirmar), webhook, paso «esperando a la terminal»
   en el modal, reenvío en el gateway. Todo contra el simulador.
3. **Bordes.** Cancelar, `REVISAR`, cobro pendiente en la terminal, caja apagada a medio cobro,
   sin internet.
4. **Devoluciones** desde VIM.
5. **Prueba real** con Knock-Out Burger como piloto, medición de calidad, guía de uso para el
   restaurante, instalador (0.x.0: es función nueva) y texto del sitio.

Va **incluido en todos los paquetes**: no hay add-on ni llave que lo encienda por plan.

Las entregas 1 y 2 no necesitan terminal física ni cuenta real, pero la terminal llega el 9 oct
2026: conviene resolver con ella la duda de la propina antes de la entrega 2.
