# 14 — REALTIME: KDS Y COMANDA EN VIVO — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** contrato de canales Realtime para la pantalla de cocina (KDS) y la comanda en vivo: transporte, nombres de canal, eventos, autorización, snapshot y reconexión.
> **Depende de:** 07-1C.1 (`ticket_items`, `estado_cocina`, D36), 07-1C.2 §9 (mecánica de comanda), 07-1B §4 (áreas de cocina), 07-1D §5 (áreas por marca, D57), 07-1F (JWT/`tenant_id`)
> **Stack:** Supabase Realtime (Broadcast desde la base de datos) + RLS sobre `realtime.messages`
> **Mockups:** P-107 a P-111 (KDS), P-223 (comanda)

---

## 📋 Tabla de contenidos

- [0. Propósito y alcance](#0-propósito-y-alcance)
- [1. Transporte: Broadcast desde la base de datos](#1-transporte-broadcast-desde-la-base-de-datos)
- [2. Nombres de canal y topología](#2-nombres-de-canal-y-topología)
- [3. Catálogo de eventos y payload](#3-catálogo-de-eventos-y-payload)
- [4. Trigger emisor](#4-trigger-emisor)
- [5. Autorización por canal](#5-autorización-por-canal)
- [6. Snapshot inicial y resync](#6-snapshot-inicial-y-resync)
- [7. Alerta de vencido](#7-alerta-de-vencido)
- [8. Multi-marca (Dark Kitchen)](#8-multi-marca-dark-kitchen)
- [9. Degradación y presence](#9-degradación-y-presence)
- [10. Decisiones de diseño (D113–D119)](#10-decisiones-de-diseño-d113d119)
- [11. Checklist de validación](#11-checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Propósito y alcance

La cocina necesita ver los pedidos **en vivo**: cuando entra una comanda, cuando un item cambia de estado, cuando algo se vence. El stack ya fija "Supabase Realtime selectivo por canal", pero nada definía **qué canales, qué eventos, cómo se autorizan y cómo se reconecta**. Este documento lo cierra.

**Cubre:** transporte, nombres de canal (por área de cocina), catálogo de eventos, trigger emisor, autorización por canal, snapshot/resync, alerta de vencido, multi-marca.

**No cubre:** la UI del KDS (mockups P-107–P-111) ni el modelo de `estado_cocina` (1C.1, D36) ni la mecánica de comanda (1C.2 §9).

---

## 1. Transporte: Broadcast desde la base de datos

> **D113 — Se usa Broadcast desde la base de datos, NO `postgres_changes`.**

Supabase Realtime ofrece dos caminos:

| | `postgres_changes` | **Broadcast desde BD (elegido)** |
|---|---|---|
| Cómo funciona | El cliente escucha el WAL de Postgres | Un trigger llama `realtime.broadcast_changes()` y emite a un topic |
| Escala | Cada cliente filtra todo el WAL; límite de mensajes/seg por conexión | Desacoplado del WAL; escala a muchas estaciones |
| Acoplamiento | La UI depende de la forma de la tabla | La UI consume un evento con payload estable |
| Autorización | RLS de la tabla por cada evento | RLS sobre `realtime.messages` por canal (más barato) |

Para una cocina con varias estaciones suscritas durante horas, **broadcast desde BD** es la opción correcta: el trigger decide exactamente qué emitir y a qué canal, y el payload es un contrato estable e independiente del esquema.

---

## 2. Nombres de canal y topología

> **D114 — Un canal por área de cocina:** `kds:{sucursal_id}:{area_id}`.

```
Sucursal León Centro (suc_A)
├── kds:suc_A:area_parrilla     ← KDS de la parrilla escucha aquí
├── kds:suc_A:area_freidora     ← KDS de la freidora escucha aquí
└── kds:suc_A:area_bebidas      ← KDS de bebidas escucha aquí
```

- Cada pantalla KDS se suscribe **al canal de su área**.
- Una vista de supervisor puede suscribirse a **varios** canales de la sucursal.
- El `tenant_id` no va en el nombre del canal (se valida en la autorización, §5), pero el `sucursal_id` aísla físicamente entre sucursales.
- En MVP Knock-Out opera "una sola cocina" → un solo canal de área; la topología por área ya queda lista para cocinas grandes (Fase 2) sin cambiar backend.

---

## 3. Catálogo de eventos y payload

Cada mensaje lleva un `event` y un `payload jsonb` **versionado** (`v`), para evolucionar sin romper clientes viejos.

| `event` | Cuándo se emite | Payload (campos clave) |
|---|---|---|
| `comanda.nueva` | Se envían items a esa área (pedido nuevo o ampliación) | `comanda_id`, `ticket_id`, `folio`, `mesa`/`canal`, `items[]`, `creada_at`, `tiempo_objetivo_seg` |
| `item.estado` | Cambia `estado_cocina` de un item (`PENDIENTE→EN_PREPARACION→LISTO`) | `ticket_item_id`, `comanda_id`, `estado`, `por_usuario_id`, `at` |
| `item.cancelado` | Se cancela un item en cocina | `ticket_item_id`, `comanda_id`, `motivo`, `at` |
| `comanda.reimpresion` | Se solicita reimpresión de comanda | `comanda_id`, `por_usuario_id`, `at` |

### 3.1 Esquema de `comanda.nueva` (ejemplo)

```json
{
  "v": 1,
  "comanda_id": "uuid",
  "ticket_id": "uuid",
  "folio": "LC-2026-001234",
  "origen": { "tipo": "MESA", "ref": "Mesa 7" },
  "creada_at": "2026-05-30T18:42:10Z",
  "tiempo_objetivo_seg": 720,
  "items": [
    { "ticket_item_id": "uuid", "nombre": "Hamburguesa Doble", "cantidad": 2,
      "modificadores": ["Sin cebolla"], "nota_cocina": "Término medio", "estado": "PENDIENTE" }
  ],
  "marca_virtual": null
}
```

> `tiempo_objetivo_seg` viaja en el payload para que el KDS calcule el vencido en el cliente (§7).

---

## 4. Trigger emisor

Un trigger sobre `ticket_items` emite al canal del área cuando un item se inserta (entra a cocina) o cambia su `estado_cocina`.

```sql
CREATE OR REPLACE FUNCTION trg_kds_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sucursal_id uuid;
  v_topic       text;
  v_evento      text;
BEGIN
  -- Resolver sucursal y área del item (área en ticket_items, sucursal vía ticket→turno→caja)
  SELECT t.sucursal_id INTO v_sucursal_id
    FROM tickets t WHERE t.id = NEW.ticket_id;

  IF NEW.area_cocina_id IS NULL OR v_sucursal_id IS NULL THEN
    RETURN NEW;  -- item que no va a cocina (ej. bebida embotellada sin área)
  END IF;

  v_topic := format('kds:%s:%s', v_sucursal_id, NEW.area_cocina_id);

  -- Decidir el evento
  IF TG_OP = 'INSERT' THEN
    v_evento := 'comanda.nueva';
  ELSIF NEW.estado_cocina IS DISTINCT FROM OLD.estado_cocina THEN
    v_evento := 'item.estado';
  ELSE
    RETURN NEW;  -- cambio irrelevante para cocina
  END IF;

  -- Emitir (payload mínimo; el cliente puede pedir snapshot si necesita más)
  PERFORM realtime.broadcast_changes(
    v_topic,                 -- topic / canal
    v_evento,                -- event
    TG_OP,                   -- operation
    TG_TABLE_NAME,           -- table
    TG_TABLE_SCHEMA,         -- schema
    NEW,                     -- registro nuevo
    OLD                      -- registro anterior
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_items_kds
  AFTER INSERT OR UPDATE OF estado_cocina ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_kds_broadcast();
```

> Para `comanda.nueva` con el payload enriquecido (§3.1), la capa de servicios puede componer el mensaje con `realtime.broadcast()` directo al crear la comanda; el trigger cubre el camino base y los cambios de estado.

---

## 5. Autorización por canal

> **D115 — RLS sobre `realtime.messages` aísla los canales por tenant y sucursal.**

Solo un usuario con acceso vigente a esa sucursal (vía `usuarios_acceso` + `tenant_id` del JWT, doc 07-1F) puede suscribirse al canal de cocina.

```sql
-- Realtime Authorization: política sobre realtime.messages
CREATE POLICY "kds_canal_acceso"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  split_part(realtime.topic(), ':', 1) = 'kds'
  AND EXISTS (
    SELECT 1
    FROM usuarios_acceso ua
    WHERE ua.usuario_id = auth.uid()
      AND ua.tenant_id  = (auth.jwt() ->> 'tenant_id')::uuid
      AND ua.activo = true
      AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
      -- acceso a toda la sucursal (sucursal_id NULL) o a esta sucursal específica
      AND (ua.sucursal_id IS NULL
           OR ua.sucursal_id = (split_part(realtime.topic(), ':', 2))::uuid)
  )
);
```

- El `tenant_id` del JWT garantiza que un tenant **no** puede escuchar la cocina de otro, aunque adivine el `sucursal_id`.
- Se aplica tanto a recibir (`SELECT`) como, si se usara broadcast cliente→cliente, a emitir (`INSERT`) — en MVP solo el servidor emite.

---

## 6. Snapshot inicial y resync

> **D117 — El KDS nunca se queda con estado viejo: al conectar/reconectar, hace snapshot y luego escucha deltas.**

```
Al montar la pantalla KDS o al reconectar:
1. PULL snapshot: comandas ABIERTAS de su área (query directa, RLS normal)
   SELECT ... FROM comandas + ticket_items
   WHERE sucursal_id = $1 AND area_cocina_id = $2
     AND estado_cocina <> 'LISTO'      -- lo que sigue activo en cocina
2. Renderiza el estado actual
3. Se suscribe al canal kds:{sucursal}:{area} y aplica los deltas que lleguen
```

- Si la conexión Realtime se cae y vuelve, se repite el snapshot → cero pérdida de eventos perdidos durante la desconexión. **D117.**
- El snapshot usa RLS de las tablas (no el canal), así que respeta el aislamiento por tenant igual que cualquier query.

---

## 7. Alerta de vencido

> **D116 — El "vencido" se calcula en el cliente, no en el servidor.**

- Cada comanda llega con `creada_at` + `tiempo_objetivo_seg` (del área / marca).
- El KDS corre un temporizador local: `transcurrido = now − creada_at`.
  - `transcurrido < objetivo` → verde
  - cercano al objetivo → ámbar
  - `> objetivo` → rojo intermitente (mockup P-110)
- **Por qué cliente:** no requiere emitir eventos por tiempo desde el servidor (que serían miles); el reloj local es exacto y barato. El servidor solo emite cambios de datos.

---

## 8. Multi-marca (Dark Kitchen)

En DK, las áreas de cocina son **filtrables por marca** (tabla puente `marcas_areas_cocina`, 1D §5, D57). Como el canal es por **área**, el filtrado por marca ya queda cubierto:

- Una estación que solo prepara la marca "Wings del Barrio" se suscribe al canal de su área; solo recibe los items ruteados a esa área.
- Si una misma área física sirve varias marcas, el payload incluye `marca_virtual` para que el KDS agrupe/etiquete por marca (vista unificada de cocina del vertical DK).

No se necesita un nivel de canal por marca: el área es la unidad de ruteo y el `marca_virtual` del payload basta para la UI. **D118.**

---

## 9. Degradación y presence

### 9.1 Degradación offline

El KDS es un dispositivo online. Si pierde conexión:

- Muestra banner "Reconectando…" + el último estado conocido (no se borra la pantalla).
- Al reconectar → snapshot (§6) → continúa.
- La operación de cocina nunca depende de que el evento llegue: si el KDS estuvo caído, el snapshot al volver lo pone al día.

### 9.2 Presence (Fase 2)

Supabase Realtime Presence permitirá ver **qué estaciones están conectadas** (ej. "freidora offline") para alertar al supervisor. **Fuera de MVP.** **D119.**

---

## 10. Decisiones de diseño (D113–D119)

| # | Decisión | Justificación |
|---|---|---|
| **D113** | Broadcast **desde la base de datos**, no `postgres_changes` | Escala con muchas estaciones; payload estable; autorización por canal más barata |
| **D114** | Un canal por área: `kds:{sucursal_id}:{area_id}` | Cada estación ve solo lo suyo; aísla por sucursal; listo para cocinas grandes |
| **D115** | RLS sobre `realtime.messages` valida tenant + sucursal vía `usuarios_acceso` + JWT | Una cocina no puede escuchar la de otro tenant ni de otra sucursal sin acceso |
| **D116** | Alerta de "vencido" calculada en el cliente con `tiempo_objetivo_seg` del payload | Evita miles de eventos por tiempo; reloj local exacto y barato |
| **D117** | Snapshot al conectar/reconectar + deltas por canal | Cero pérdida de estado tras una desconexión |
| **D118** | DK no necesita canal por marca; el área rutea y el payload lleva `marca_virtual` | Reaprovecha el filtrado área↔marca (D57); menos canales |
| **D119** | Presence (estaciones conectadas) se difiere a Fase 2 | No es necesario para operar el MVP |

---

## 11. Checklist de validación

- [ ] Trigger `trg_ticket_items_kds` emite `comanda.nueva` (INSERT) e `item.estado` (cambio de `estado_cocina`)
- [ ] Items sin `area_cocina_id` no emiten (no van a cocina)
- [ ] Canal `kds:{sucursal_id}:{area_id}` recibe los eventos correctos
- [ ] Política RLS en `realtime.messages`: usuario sin acceso a la sucursal NO puede suscribirse
- [ ] Test cross-tenant: token del tenant A no recibe eventos de cocina del tenant B
- [ ] Snapshot inicial trae las comandas abiertas del área; reconexión re-snapshot
- [ ] Vencido calculado en cliente con `tiempo_objetivo_seg`; cambia verde→ámbar→rojo (P-110)
- [ ] DK: estación de un área recibe solo sus items; `marca_virtual` presente para agrupar
- [ ] Degradación: KDS offline muestra banner y último estado; resync al volver
- [ ] Payload versionado (`v`) en todos los eventos

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Contrato Realtime para KDS/comanda: transporte Broadcast-desde-BD, canal por área `kds:{sucursal}:{area}`, catálogo de eventos con payload versionado, trigger emisor, autorización RLS sobre `realtime.messages`, snapshot+resync, alerta de vencido en cliente, multi-marca DK, degradación y presence (Fase 2). Decisiones D113–D119. |
