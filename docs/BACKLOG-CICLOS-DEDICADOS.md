# 🧱 Backlog de ciclos dedicados (no son rebanadas rápidas)

> Esto documenta el trabajo que **NO** se puede cerrar como una sub-rebanada `.2` rápida porque
> toca arquitectura o un subsistema completo. Cada uno merece su propio ciclo de
> brainstorm → plan → ejecución. Aquí queda el diagnóstico hecho para que ese ciclo arranque rápido.

---

## 1. ✅ RESUELTO — Subsistema de DEVOLUCIONES (F6.3, Modelo B)

**Estado:** **CERRADO** (`837b6c3`). El dueño eligió el **Modelo B** ("venta intacta + documento
de devolución aparte"). El subsistema (`crear_devolucion` → `confirmar_devolucion` → triggers)
nunca se había ejecutado y tenía **6 bugs encadenados #28-#33**, todos resueltos:
- **#28** enum 'DEVOLUCION'→'VENTA' (0030) · **#30** trg_devolucion_pago_efectivo columnas reales (0031)
- **#31** contadores_folio varchar(20)→40 (0032) · **#32** (diseño) el trigger SOLO crea el movimiento
  de caja, no reescribe el ticket con pago negativo (0033) · **#33** (dinero) crear_devolucion sumaba
  IVA a un precio IVA-incluido → reembolsaba de más; ahora usa total_item_mxn (0034).

UI completa: `pantalla-devoluciones` + `ModalDevolucion` + `lib/devoluciones` + botón en topbar.
Smoke verde (venta queda PAGADA/120 intacta + documento CONFIRMADA + 120 exacto + movimiento de caja).
**Reversa de inventario (#29): resuelta en 0057.** La reversa explota la receta activa del producto
(igual que la venta) y aplica `REVERSA_CANCELACION` por insumo; si el módulo de inventario está
apagado no hace nada, que es lo correcto (si no se descontó al vender, no hay qué regresar). Las
existencias reales siguen dependiendo del módulo producto→insumos (sección 6): sin recetas cargadas
la reversa no tiene qué mover, pero ya no revienta.

<details><summary>Diagnóstico histórico (los 5 bugs originales encontrados)</summary>

Un smoke (`smoke_devolucion.sql`) destapó **5 bugs encadenados**:

| Bug | Qué | Fix derivado | ¿Resuelto? |
|-----|-----|--------------|-----------|
| #28 | `trg_devolucion_audit` usa categoria `'DEVOLUCION'` (no existe en `evento_categoria`) | → `'VENTA'` (ver SQL abajo) | Fix listo |
| #29 | `reversar_inventario_por_devolucion` llama `aplicar_movimiento_inventario` con `p_producto_id`/`p_tipo_movimiento`/`p_origen_referencia_*` pero la función espera `p_insumo_id`/`p_tipo`/`p_cantidad`/`p_usuario_id`. Requiere mapear producto→insumos (recetas) = **módulo de inventario** | Reversa vía recetas (0057), espejo de `descontar_inventario_por_venta`; tipo real `REVERSA_CANCELACION`; no-op si el módulo está apagado | **Resuelto (0057)** — también en `reversar_inventario_por_cancelacion`, que tenía el mismo bug y abortaba toda cancelación de folio pagado |
| #30 | `trg_devolucion_pago_efectivo` inserta en `movimientos_caja` con `tipo_movimiento` (col es `tipo`), `referencia_documento_tipo/id` (no existen), `usuario_id`+`created_by` (col es `usuario_solicitante_id`, no hay created_by) y sin `dia_contable` (NOT NULL). En `pagos` faltaba `dia_contable` | Re-crear trigger contra esquema real (SQL abajo) | Fix listo |
| #31 | `trg_movs_caja_folio` arma `'MOV_'||tipo` = `'MOV_DEVOLUCION_EFECTIVO'` (23) en `contadores_folio.tipo_documento` varchar(20) | Ampliar a varchar(40) | Fix listo |
| #32 | El pago negativo (`-total_devuelto`) que inserta el trigger viola `tickets_monto_pagado_mxn_check`. **Decisión de diseño:** ¿cómo reconcilia un reembolso con `monto_pagado_mxn`/`total_mxn` del ticket original? ¿pago negativo, columna `monto_devuelto`, o ticket espejo? | **Requiere diseño** | 🔴 Bloqueante |

**Por qué no se envió:** ningún smoke de devolución puede quedar verde sin resolver #32, y enviar
UI de "Devolver" que revienta sería peor que no enviarla. Los fixes #28/#30/#31 son correctos y
aditivos pero se sostienen hasta tener el ciclo completo (no se commitearon sueltos para no dejar
una cadena a medias en `main`).

### SQL de los fixes ya derivados (#28, #30, #31)

```sql
-- #28: trg_devolucion_audit categoria 'DEVOLUCION' -> 'VENTA' (patrón #26/#27)
CREATE OR REPLACE FUNCTION trg_devolucion_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (tenant_id, sucursal_id, caja_id, turno_id, usuario_id,
      usuario_autorizo_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload, dia_contable)
    VALUES (NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id, NEW.usuario_solicitante_id,
      NEW.usuario_autorizo_id, 'VENTA', 'devolucion.creada', 'devolucion', NEW.id,
      jsonb_build_object('folio', NEW.folio_completo, 'ticket_original_folio', NEW.ticket_folio_snapshot,
        'alcance', NEW.alcance, 'motivo', NEW.motivo, 'medio', NEW.medio_devolucion,
        'total_mxn', NEW.total_devuelto_mxn, 'reversar_inventario', NEW.reversar_inventario),
      NEW.dia_contable);
  END IF;
  RETURN NEW;
END; $$;

-- #30: trg_devolucion_pago_efectivo contra el esquema real de movimientos_caja + pagos
CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.estado<>'CONFIRMADA' AND NEW.estado='CONFIRMADA' AND NEW.medio_devolucion='EFECTIVO' THEN
    INSERT INTO movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, tipo, monto_mxn,
      dia_contable, motivo, usuario_solicitante_id)
    VALUES (NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id, 'DEVOLUCION_EFECTIVO',
      NEW.total_devuelto_mxn, NEW.dia_contable, 'Devolución folio '||NEW.folio_completo, NEW.usuario_solicitante_id);
    INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago,
      monto_mxn, estado, referencia, usuario_id, nota, created_by)
    VALUES (NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id, NEW.ticket_original_id, NEW.dia_contable,
      'EFECTIVO', -NEW.total_devuelto_mxn, 'APLICADO', 'Devolución '||NEW.folio_completo,
      NEW.usuario_solicitante_id, 'Reverso por devolución '||NEW.motivo::text, NEW.usuario_solicitante_id);
  END IF;
  RETURN NEW;
END; $$;

-- #31: contadores_folio.tipo_documento varchar(20) -> varchar(40)
ALTER TABLE contadores_folio ALTER COLUMN tipo_documento TYPE varchar(40);
```

**El ciclo dedicado debe:** decidir #32 (diseño de reconciliación del reembolso), aplicar #28/#30/#31,
resolver #29 (reversa de inventario por recetas, parte del módulo de inventario), agregar
`smoke_devolucion.sql` verde, y la UI (lista de ventas del turno P-? + modal de devolución P-228).

</details>

---

## 2. 🟠 Round-trip "cargar ticket persistido → carrito" (F18.2 keystone)

El carrito (`lib/carrito.ts`) está acoplado al `Producto` vivo del catálogo (`LineaCarrito.producto: Producto`),
pero un ticket persistido solo tiene snapshots (`producto_nombre_snapshot`, `precio_unitario_snapshot`).
Retomar una cuenta de mesa / ticket en espera al carrito requiere un **modo "ticket persistido"**:
o se reconstruye `Producto` casando snapshots con el catálogo, o el carrito opera sobre el ticket en BD
(agregar/quitar vía RPC, no estado local). Es un refactor de la capa de carrito.
**Desbloquea:** cuenta por mesa con edición, retomar tickets en espera, split con items.

---

## 3. 🟠 Apps separadas de mesero y repartidor (F18.2 / F19.2)

Superficies nuevas con su propio login (mockups P-120 mesero, P-112 repartidor). El mesero ve
"mis mesas" (P-121) y arma cuentas por mesa; el repartidor ve "mis entregas" + mapa de ruta (P-115).
Hoy mesas y delivery se operan desde el POS de caja (suficiente para QS/un local). Las apps separadas
son para FS con varios meseros y delivery con flota. Dependen en parte del #2 (carrito por ticket).

---

## 4. 🟠 Offline-first completo + Capacitor (F16.2)

Ya documentado en `docs/OFFLINE-ARQUITECTURA.md`. Capa repositorio Dexie + cola de mutaciones +
worker de sync por batch + empaquetado Capacitor. Toca toda la capa de escritura del POS. El backend
ya es idempotente (todas las RPCs aceptan `p_client_id_local`).

---

## 5. 🟢 Billing / suscripción del SaaS con Stripe (F22)

Cobrarle a los **tenants** (no a sus clientes). Stripe Checkout + webhooks + estados de suscripción
(TRIAL/ACTIVO/SUSPENDIDO) que ya existen en `tenants`. Servicio externo, se scaffoldea con adaptador
`@sin-verificar` igual que Facturapi. Necesario antes de vender masivamente; no bloquea el piloto.

---

## 6. 🟢 Módulo de inventario (insumos, recetas, mermas)

Existe el esquema (`insumos`, `aplicar_movimiento_inventario`, `descontar_inventario_por_venta`,
recetas producto→insumos) pero no está cableado en UI ni verificado end-to-end. Es prerequisito de
#29 (reversa de inventario en devoluciones). Ciclo propio: cargar insumos, recetas, ver existencias,
mermas, y conectar el descuento/reversa automático.
