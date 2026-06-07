# 📴 Arquitectura Offline-First + Capacitor (F16)

> **Estado:** detección de conexión + banner de aviso **implementados** (`lib/conexion.ts` + banner en `home-pos`). El **offline-first completo** (cola local + sync por batch) es el siguiente esfuerzo grande y se diseña aquí. Hoy el POS es **online-first**: si se cae la red, avisa y bloquea cobros (mejor que un error silencioso).

## Por qué importa
Un POS de restaurante no puede dejar de vender porque se cayó el WiFi. La regla #5 de `CLAUDE.md` lo dice: *"El POS no habla directo a Supabase en operación: pasa por la capa repositorio sobre Dexie y sincroniza por batch (doc 1C.2 §10)."* Hoy esa regla **aún no se cumple** — el POS llama a Supabase directo. F16 la cierra.

## Diseño objetivo

### 1. Capa repositorio sobre Dexie (IndexedDB)
- `packages/db` o `apps/pos/app/lib/repo/` con tablas Dexie espejo de las operativas: `tickets`, `ticket_items`, `pagos`, `movimientos_caja`, `mutations_queue`.
- Toda escritura del POS (abrir ticket, agregar ítem, cobrar, etc.) va a Dexie **primero** (optimista) y encola una mutación en `mutations_queue` con: `{ id_local, tipo_rpc, payload, client_id_local, intentos, estado }`.
- Toda lectura del POS lee de Dexie (que el sync mantiene fresco).

### 2. Idempotencia (ya soportada en BD ✅)
- Todas las RPCs operativas (`abrir_ticket`, `agregar_item_a_ticket`, `aplicar_pago`, `registrar_movimiento`…) aceptan `p_client_id_local` y son **idempotentes**: si la mutación se reintenta, la BD devuelve el registro existente en vez de duplicar. Esto ya está en el esquema (0008/0020/etc).

### 3. Motor de sincronización (batch)
- Un worker que, cuando hay conexión, drena `mutations_queue` en orden, llamando la RPC correspondiente con el `client_id_local`.
- Resuelve conflictos: la BD es la autoridad; ante divergencia, re-lee el estado servidor y reconcilia.
- Backoff exponencial en fallos; marca mutaciones como `ERROR` tras N intentos para revisión manual.

### 4. Capacitor (app nativa instalable)
- Envolver `apps/pos` con Capacitor → APK/IPA para tablet de caja.
- Plugins: `@capacitor/network` (estado de red nativo, mejor que `navigator.onLine`), `@capacitor/preferences` (sesión de dispositivo segura — resuelve también **CN-006**, las creds en localStorage), impresión por USB/BT nativa (cierra el adaptador Epson nativo).

## Qué ya está hecho (F16.1)
- `lib/conexion.ts` — `useConexion()`: combina `navigator.onLine` + ping HEAD al gateway de Supabase + eventos `online`/`offline` + re-chequeo cada 20s.
- Banner ámbar en el POS cuando se pierde la conexión, avisando que no se puede cobrar/guardar hasta reconectar.

## Pendiente (F16.2 — el esfuerzo grande)
1. Tablas Dexie + capa repositorio.
2. Cola de mutaciones + worker de sync con backoff.
3. Cambiar las libs del POS (cobro, carrito, etc.) para escribir a Dexie en vez de Supabase directo.
4. Tests de sync: vender offline → reconectar → la venta llega 1 sola vez (idempotencia).
5. Capacitor: empaquetar, `@capacitor/network`, storage seguro de creds, impresión nativa.

> **Recomendación:** F16.2 merece su propio ciclo de brainstorm+plan dedicado (toca toda la capa de escritura del POS). El backend ya está listo (idempotencia en todas las RPCs); el trabajo es el cliente.
