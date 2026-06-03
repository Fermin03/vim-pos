# F5.2 — Carrito + Cobro (diseño)

**Fecha:** 2026-06-02
**Fase:** F5.2 (POS operativo) — primera venta que persiste en BD
**Autor:** Fermín + Claude Code
**Estado:** aprobado para plan de implementación

---

## 1. Objetivo y gate

Que el cajero arme un ticket en el POS y **una venta real persista en Postgres con RLS**, con totales calculados por la BD. Es el corazón del producto y desbloquea el resto de F5 (impresión, cierre Z).

**Gate de salida (correctitud):** E2E de la ruta crítica
`login → abrir turno → agregar productos (con modificadores) → seleccionar modo de servicio → cobro (incluido dividido + propina + cambio) → ticket PAGADO con folio`,
verificando en BD que `tickets.total_mxn` coincide con lo cobrado y que el total mostrado en cliente coincide con el autoritativo de la BD. Verificación en navegador (Preview).

## 2. Alcance

**Dentro de F5.2:**
- Carrito local (en memoria) con líneas: producto, cantidad, modificadores, nota de cocina por línea.
- Selección de modificadores por producto (respeta requerido / min / max por grupo; naturaleza EXTRA / SUSTITUCIÓN / OBSERVACIÓN).
- Selector de **modo de servicio** del ticket (Comer aquí / Para llevar / Drive-thru).
- **Cobro con métodos soportados por los RPC actuales**: efectivo (con cálculo de cambio), tarjeta crédito/débito, transferencia, apps y **pago dividido** (varios pagos hasta cubrir el total).
- Persistencia del ticket completo vía los RPC existentes de la migración 0008.
- Seed de grupos + opciones de modificadores para Knock-Out (para E2E confiable).

**Fuera de F5.2 (diferido):**
- **Descuento manual → F5.2b.** Requiere una primitiva nueva de autorización por PIN de supervisor (migración + Edge Function), transversal y reusada después por cancelación de ítem, override de precio y reversa de cocina. Se construye bien y una sola vez en su propia fase.
- **Propina → F5.2b.** `tickets.propina_mxn` está marcada "Fase 2": `recalcular_totales_ticket()` no la integra en `total_mxn` y `aplicar_pago` rechaza pagos que excedan `total_mxn`. Cobrar propina requiere cambios de BD (extender el cálculo de totales y/o `aplicar_pago`). Se hace junto al descuento en F5.2b para no tocar migraciones en F5.2.
- Impresión de ticket/comanda → F5.3.
- Cierre X/Z → F5.4.
- Promociones automáticas, cliente/CFDI, mesas/KDS → fases posteriores.

## 3. Enfoque arquitectónico (decisión C: carrito local, commit al cobrar)

Se evaluaron tres modelos de persistencia:

- **A — Ticket vivo en BD:** cada acción del carrito hace RPC inmediato. Cero drift, pero latencia por tap y editar línea = cancelar+re-agregar. Es el **menos** compatible con el futuro offline-first.
- **B — Carrito local, commit al cobrar:** todo en estado de React; ráfaga de RPC al cobrar. Rápido, pero el cliente recalcula totales con riesgo de drift en lo registrado.
- **C — Híbrido (elegido):** carrito local para armar (taps snappy, editar/quitar en memoria); al "Cobrar" se **persiste el ticket completo** y el modal de cobro muestra los **totales autoritativos releídos de la BD**; pagos contra el ticket real.

**Por qué C:** la arquitectura final de VIM POS es offline-first con Dexie + sync por batch (CLAUDE.md regla 5, hoy diferida). C ya tiene la silueta del sync por batch — cuando entre Dexie, el "commit" pasa de "RPC directo" a "encolar + sincronizar" sin rediseñar el carrito. Mantiene la regla de oro: **cada peso persistido lo calcula la BD** (`recalcular_totales_ticket()` por triggers). El total durante el armado es solo display.

## 4. Componentes y contratos

### 4.1 Estado del carrito (cliente)
`app/lib/carrito.ts` (nuevo) — `useReducer` o hook `useCarrito`:
- Estado: `{ modoServicio, lineas: Linea[] }`.
- `Linea = { clientId: uuid, producto, cantidad, modificadores: ModificadorSel[], notaCocina?: string }`.
- Acciones: `agregarLinea`, `cambiarCantidad`, `quitarLinea`, `editarModificadores`, `setNota`, `setModoServicio`, `limpiar`.
- `clientId` es uuid local estable por línea → se manda como `client_id_local` (idempotencia).
- Cálculo de display: `precio_unitario + Σ modificadores`, IVA derivado de `iva_incluido_en_precio`. **Solo para mostrar.**

### 4.2 Lectura de modificadores
`app/lib/modificadores.ts` (nuevo) — lee `productos_grupos_modificadores` → `grupos_modificadores` → `opciones_modificador` para un producto. RLS por tenant. Expone `obtenerGruposDeProducto(token, productoId)` con `{ grupo, requerido, min, max, naturaleza, opciones[] }`. Espeja el patrón del lib de admin (`apps/admin/app/lib/modificadores.ts`).

### 4.3 Orquestación de cobro
`app/lib/cobro.ts` (nuevo) — tipos Zod + secuencia:
1. `abrir_ticket(sucursal_id, caja_id, turno_id, modo_servicio, client_id_local)` → `ticket_id`.
2. por cada línea: `agregar_item_a_ticket(ticket_id, producto_id, cantidad, nota_cocina, modificadores_jsonb, client_id_local)`.
   - `modificadores_jsonb`: `[{ "opcion_modificador_id": uuid, "cantidad": int }]`.
3. **releer fila `tickets`** → totales autoritativos.
4. por cada pago: `aplicar_pago(ticket_id, metodo_pago, monto_mxn, monto_recibido_mxn?, referencia?, ...)`.
   - efectivo: `monto_recibido_mxn` → la BD calcula `cambio_mxn`.
   - dividido: varias llamadas; la BD valida que la suma no exceda el total.
5. `aplicar_pago` invoca `cerrar_ticket_si_pagado` solo → al detectar `estado_fiscal=PAGADO`, devolver folio.

**Idempotencia / red:** todo `client_id_local` es uuid estable. Si la ráfaga falla a media, el ticket queda BORRADOR/ABIERTO recuperable; reintentar con los mismos `client_id_local` no duplica (los RPC devuelven la fila existente).

### 4.4 UI (componentes nuevos en `apps/pos/app/components/`)
- `sidebar-ticket.tsx` — reemplaza el placeholder de `home-pos.tsx`: líneas, cantidades, subtotal/IVA/total de display, botón "Cobrar".
- `modal-modificadores.tsx` — selección de opciones con validación requerido/min/max + nota de cocina.
- `modal-cobro.tsx` — totales autoritativos de BD, selector de método, efectivo con cambio, dividido, propina, confirmación + folio.
- `selector-modo-servicio.tsx` — Comer aquí / Para llevar / Drive-thru (default Comer aquí).
- `home-pos.tsx` (tocado) — cablea carrito, abre modales, maneja el ciclo de cobro.

### 4.5 Seed
`supabase/seed.sql` (tocado) — sembrar catálogo de Knock-Out (categorías + productos si no están ya en seed) y **grupos + opciones de modificadores** (ej. "Término", "Extras", "Sin…") ligados a productos vía `productos_grupos_modificadores`, para que la BD local tras `db reset` permita probar modificadores y el E2E.

## 5. Flujo de datos

```
[catálogo en grid]  --tap-->  ¿producto tiene grupos?
   sí → ModalModificadores → (valida min/max/req) → agregarLinea(local)
   no → agregarLinea(local)
[sidebar-ticket]  edita cantidad / quita / nota / modo servicio   (todo local)
   --"Cobrar"-->  cobro.ts:
       abrir_ticket → agregar_item (×N) → releer tickets (totales BD)
       → ModalCobro (métodos, dividido, propina, cambio)
       → aplicar_pago (×M) → PAGADO + folio → limpiar carrito
```

## 6. Manejo de errores
- Validación de modificadores en cliente (requerido/min/max) antes de agregar línea.
- Errores de RPC (turno no abierto, producto eliminado, pago excede total) → toast/alert legible; el ticket persistido queda recuperable.
- Drift display vs BD: el ModalCobro **siempre** muestra el total de la BD; si difiere del display, manda la BD (no se cobra el número de cliente).
- Reintento de commit seguro vía `client_id_local`.

## 7. Pruebas (gate de la fase)
- **E2E ruta crítica** (Preview headless): login → turno → 2–3 productos con modificadores → modo servicio → cobro dividido (efectivo+tarjeta) con propina y cambio → PAGADO con folio.
- **Verificación en BD:** `tickets.total_mxn`, `monto_pagado_mxn`, `cambio_mxn`, `propina_mxn` cuadran; `ticket_items` + `ticket_item_modificadores` con snapshots correctos.
- **Display vs BD:** el total mostrado antes de cobrar coincide (±redondeo) con el autoritativo.

## 8. Dependencias — resueltas al planificar
1. **GRANT/EXECUTE de los RPC de 0008**: son `SECURITY INVOKER` y **no** tienen `REVOKE` (a diferencia de `verificar_pin_login`/`crear_perfil_con_pin`), por lo que `authenticated` los ejecuta por default bajo la RLS del empleado. ✔
2. **Propina**: confirmado que `recalcular_totales_ticket()` no la integra y `aplicar_pago` rechaza pagos > `total_mxn` → **diferida a F5.2b** (ver §2). ✔
3. **Modificadores**: `grupos_modificadores` (`tipo_seleccion`, `minimo_selecciones`, `maximo_selecciones`, `naturaleza`, opción `es_default`), `opciones_modificador` (`precio_extra_mxn`, `agotada`, `activa`, `orden_visualizacion`), unión `productos_grupos_modificadores` (`orden_visualizacion`). El RPC `agregar_item_a_ticket` toma el snapshot del modificador server-side; el cliente solo envía `[{opcion_modificador_id, cantidad}]`. ✔
   - Enum `modificador_tipo_seleccion`: `UNICA_OBLIGATORIA` (exactamente 1, pre-selecciona `es_default`), `UNICA_OPCIONAL` (0–1), `MULTIPLE_OPCIONAL` (0–N), `MULTIPLE_OBLIGATORIA_RANGO` (min–max del grupo).
4. **Modos de servicio**: `abrir_ticket` toma `p_modo_servicio` a nivel ticket; `agregar_item_a_ticket` guarda `modos_servicio_snapshot` pero **no valida** contra el modo del ticket en F5.2. ✔

## 9. Archivos
**Nuevos:** `apps/pos/app/lib/carrito.ts`, `apps/pos/app/lib/modificadores.ts`, `apps/pos/app/lib/cobro.ts`, `apps/pos/app/components/sidebar-ticket.tsx`, `apps/pos/app/components/modal-modificadores.tsx`, `apps/pos/app/components/modal-cobro.tsx`, `apps/pos/app/components/selector-modo-servicio.tsx`.
**Tocados:** `apps/pos/app/components/home-pos.tsx`, `supabase/seed.sql`.
**No se tocan migraciones** (los RPC de venta ya existen en 0008). Descuento manual (migración 0016 + Edge Function) es F5.2b.
