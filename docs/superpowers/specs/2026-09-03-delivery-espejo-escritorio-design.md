# Delivery — Espejo de pedidos de apps en la caja de escritorio

Fecha: 2026-09-03. Estado: aprobado por Fermín en chat. Construye sobre F1/F1b/A6/A7 (ADR 0011,
migraciones 0090–0095) y sobre el escritorio local‑first (sync por snapshot, 0055/0056/0073).

## El problema

Para una sucursal que opera con el programa instalado (el piloto), la integración de hoy no sirve:

1. El pedido de Uber llega a la nube y, si hay turno abierto, **la nube crea el ticket en la nube**.
   El sync solo baja catálogo y configuración (0055) y los tickets solo suben (0056): ese ticket
   **nunca llega a la caja ni al KDS del escritorio**.
2. Cada base genera folios con su propio contador por sucursal (`generar_folio`): un ticket creado
   en la nube choca con el siguiente que cree la caja.
3. La pantalla "Pedidos de apps" del escritorio lee su base local (vacía) y sus acciones van al
   gateway local, que responde `FUNCION_REQUIERE_NUBE`.

## Decisiones

- **Fuente de verdad del pedido: la nube.** El escritorio espeja `delivery_conexiones` y
  `delivery_pedidos` de su sucursal en su base local (mismas tablas, mismas migraciones) y todo
  cambio de estado pasa por la nube (`delivery-accion`).
- **El ticket se crea donde está la cocina.** Si una caja de escritorio de la sucursal está viva
  (latido de menos de 90 s), el pedido se gestiona en **ESCRITORIO**: la nube no crea ticket; lo
  crea el agente del escritorio en su base local (folio local, KDS local, comanda impresa). Si no
  hay caja de escritorio viva, se gestiona en **NUBE** como hasta hoy (POS web).
- **Sin configuración manual**: la decisión la toma el webhook con `cajas.espejo_apps_at`, que
  sella el agente en cada lectura.
- **Varias cajas de escritorio en una sucursal**: la primera que reclama el pedido lo gestiona
  (`delivery_pedidos.gestion_caja_id`, reclamo atómico); las demás solo lo espejan.
- **El gateway local hace de puente** para `delivery-accion` con el token de dispositivo; la
  pantalla del POS no cambia.
- Fuera de alcance: DiDi/Rappi (el agente es por app pero solo Uber existe), cancelar
  automáticamente el ticket local cuando la app cancela (se avisa al cajero), sonido en escritorio
  (la pantalla ya suena al ver un pedido nuevo en la base local).

## Modelo de datos — migración `0096_delivery_espejo_escritorio.sql`

```sql
ALTER TABLE delivery_pedidos
  ADD COLUMN gestion         text NOT NULL DEFAULT 'NUBE' CHECK (gestion IN ('NUBE','ESCRITORIO')),
  ADD COLUMN gestion_caja_id uuid NULL REFERENCES cajas(id);
ALTER TABLE cajas ADD COLUMN espejo_apps_at timestamptz NULL;   -- último latido del agente de espejo

-- ¿Hay caja de escritorio viva en la sucursal? (lo consulta el webhook; service_role)
CREATE FUNCTION sucursal_con_espejo(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean …
  SELECT EXISTS (SELECT 1 FROM cajas WHERE sucursal_id = p_sucursal AND activa
                 AND espejo_apps_at > now() - make_interval(secs => p_segundos));

-- Reclamo atómico del pedido por una caja (service_role desde delivery-accion)
CREATE FUNCTION delivery_reclamar_pedido(p_pedido uuid, p_caja uuid) RETURNS boolean …
  UPDATE delivery_pedidos SET gestion_caja_id = p_caja
   WHERE id = p_pedido AND gestion = 'ESCRITORIO' AND (gestion_caja_id IS NULL OR gestion_caja_id = p_caja)
  RETURNING true;

-- Enlace ticket ↔ pedido cuando el ticket sube por el push (service_role desde sync-push)
CREATE FUNCTION delivery_enlazar_tickets(p_tenant uuid) RETURNS integer …
  UPDATE delivery_pedidos p SET ticket_id = t.id
    FROM tickets t
   WHERE p.tenant_id = p_tenant AND p.ticket_id IS NULL AND t.tenant_id = p_tenant
     AND t.origen_creacion = 'API_EXTERNA' AND t.folio_externo_app = p.id_externo AND t.modo_servicio = p.app;

-- crear_ticket_desde_app: además de RECIBIDO/ERROR acepta ACEPTADO con ticket_id NULL
-- (el pedido lo aceptó la nube por orden del cajero y el escritorio crea el ticket después).
```

Vista/estado: `gestion` y `gestion_caja_id` viajan en el espejo; `espejo_apps_at` no se espeja.

## Nube

### `procesar-uber.ts` (webhook)

Tras insertar el pedido `RECIBIDO`: `deps.db.rpc("sucursal_con_espejo", { p_sucursal })`.
- `true` → `UPDATE delivery_pedidos SET gestion = 'ESCRITORIO'` y devuelve
  `accion: "PENDIENTE_ESCRITORIO"` (**no** auto‑acepta ni crea ticket).
- `false` → flujo actual (auto‑aceptar en nube si procede).

### `delivery-accion` (JWT de empleado **o de dispositivo**)

- Acción nueva `reclamar` (`pedido_id`): solo dispositivos (`tipo_identidad = DISPOSITIVO`);
  `delivery_reclamar_pedido(pedido, caja_del_dispositivo)`; 409 `RECLAMADO_POR_OTRA_CAJA` si falla.
- `aceptar` cuando `pedido.gestion = 'ESCRITORIO'`: **no** llama `crear_ticket_desde_app`; llama
  `uber.aceptar` (ready time con `tiempo_prep_min` o `body.tiempo_prep_min`) y pasa el pedido a
  `ACEPTADO` con `ticket_id NULL` (el enlace llega con el push). Si el llamante es un dispositivo,
  además reclama el pedido para su caja (idempotente). Si es un empleado desde el POS de
  escritorio (vía gateway), el token que llega ya es el del dispositivo: mismo camino.
- El resto (`rechazar`, `listo`, `tienda_*`) no cambia; funcionan con token de dispositivo porque
  resuelven tenant por `usuarios_acceso`.
- El id de caja del dispositivo sale de `usuarios_acceso.sucursal_id` + `cajas.dispositivo_usuario_id`
  (o el claim `caja_id` del JWT del dispositivo si existe; se verifica en la implementación).

### Edge Function nueva `delivery-espejo` (solo dispositivos)

`POST { desde?: iso }` → sella `cajas.espejo_apps_at = now()` para la caja del dispositivo y
devuelve, de **su sucursal**:
- `conexiones`: filas completas de `delivery_conexiones` (sin `credencial_*`).
- `pedidos`: filas completas de `delivery_pedidos` con estado activo (`RECIBIDO, ACEPTADO,
  EN_PREPARACION, LISTO, ERROR`) **o** `recibido_at` en las últimas 24 h, sin `payload_raw`
  (pesa y no hace falta en la caja).
- `ahora`: reloj de la nube (para el countdown local sin depender del reloj de la caja).

### `sync-push`

Tras `sync_push_snapshot`, llama `delivery_enlazar_tickets(p_tenant)` y devuelve `enlazados`.

## Escritorio

### `desktop/src/delivery-espejo-plan.mjs` (puro, probado con `node --test`)

```js
planificarEspejo({ conexiones, pedidos, localPedidos, turnoAbierto, cajaId, ahora })
→ { upserts: PedidoLocal[], aCrear: string[], avisos: { pedidoId, motivo }[] }
```
- `upserts`: cada pedido de la nube convertido a fila local. `ticket_id` = el local si la fila
  local ya lo tiene; si no, `null` (los tickets no bajan). `payload_raw` = `{}`.
- `aCrear`: pedidos con `gestion = 'ESCRITORIO'`, sin ticket local, y
  (a) `RECIBIDO` con `auto_aceptar` de su conexión y turno abierto y `puedeCrear`
      (ítems mapeados o producto genérico), **o**
  (b) `ACEPTADO` (lo aceptó el cajero por la nube) sin ticket local.
  En ambos casos solo si `gestion_caja_id` es nulo o es esta caja.
- `avisos`: pedidos `CANCELADO`/`EXPIRADO` en la nube cuyo ticket local existe y no está
  cancelado → `ultimo_error = "La app canceló este pedido: cancela el ticket <folio>"`.

### `desktop/src/delivery-espejo.mjs` (ciclo)

Cada **10 s** mientras haya credenciales de nube (`tokenDeNube()`, cacheado 20 min):
1. `POST delivery-espejo` → conexiones + pedidos.
2. Upsert local de `delivery_conexiones` y `delivery_pedidos` (transacción; `ON CONFLICT (id)`).
3. Por cada `aCrear`, en orden de `vence_aceptacion`:
   a. `POST delivery-accion { accion: "reclamar" }` → si 409, saltar (otra caja lo tiene).
   b. `SELECT crear_ticket_desde_app(id)` en local (folio local, KDS, comanda).
   c. Si el pedido estaba `RECIBIDO`: `POST delivery-accion { accion: "aceptar", pedido_id,
      tiempo_prep_min }` → Uber recibe el accept. Si falla por red, se reintenta en el siguiente
      ciclo (idempotente: 409 `YA_PROCESADA` cuenta como éxito). Si el ticket local ya existe y
      la nube sigue `RECIBIDO`, solo se reintenta el accept.
4. `avisos` → `UPDATE delivery_pedidos SET ultimo_error` local.
5. Sin red: el ciclo se salta y la pantalla sigue mostrando lo último espejado.

Se arranca desde `main.mjs` junto al ciclo de sync (solo rol caja, no cocina) y se detiene en
`cerrarTodo`. Log `· [espejo]`.

### Gateway (`desktop/src/gateway.mjs`)

`POST /functions/v1/delivery-accion`: valida el bearer local como sesión de empleado o
dispositivo de esta caja (`getUser`), obtiene `tokenDeNube()` del proceso principal (inyectado en
`backend` como `nube()`), y reenvía cuerpo y respuesta a `${cloudUrl}/functions/v1/delivery-accion`
con `apikey` + `Authorization: Bearer <token de dispositivo>`. Sin nube → 503
`FUNCION_REQUIERE_NUBE` (la pantalla ya muestra "Sin conexión con la nube").

### POS (sin cambios de pantalla)

`leerPedidosApps` sigue leyendo la base local (espejada). La tarjeta muestra `ultimo_error`
cuando el estado es `CANCELADO`/`EXPIRADO` y hay ticket (hoy solo lo muestra en `ERROR`): un
cambio de una condición.

## Seguridad

- `delivery-espejo` y `reclamar` exigen `tipo_identidad = DISPOSITIVO`; la sucursal y la caja
  salen del propio dispositivo, nunca del cuerpo.
- El gateway nunca expone el token de dispositivo al navegador; solo lo usa en el reenvío.
- RLS: el dispositivo lee `delivery_pedidos` de su tenant; la función filtra además por sucursal.
- El espejo no baja `payload_raw` ni `credencial_*`.

## Pruebas

- `delivery-espejo-plan.test.mjs`: upsert conserva ticket local; aCrear por auto‑aceptar / por
  ACEPTADO sin ticket / no si es de otra caja / no sin turno; avisos por cancelación.
- `procesar-uber.test.ts`: con `sucursal_con_espejo = true` → `PENDIENTE_ESCRITORIO`, sin ticket.
- pgTAP `0008_delivery_espejo.test.sql`: reclamo atómico (dos cajas), enlace por
  `folio_externo_app`, `crear_ticket_desde_app` con ACEPTADO sin ticket.
- Gateway: prueba con `node --test` del reenvío (fetch falso) y del 503 sin nube.
- Verificación real: backend embebido + funciones (cuando Docker vuelva, `functions serve`; si no,
  contra la nube con la caja de desarrollo `…cc` y un pedido insertado a mano).

## Documentación

- ADR 0011: nota "el ticket se crea donde está la cocina".
- Runbook delivery: sección "Escritorio".
- `desktop/RUNBOOK.md`: el agente de espejo y su log.
- Roadmap: "espejo en escritorio ✅".
