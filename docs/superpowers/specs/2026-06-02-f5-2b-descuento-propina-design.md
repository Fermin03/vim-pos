# F5.2b — Descuento manual + Propina (diseño)

**Fecha:** 2026-06-02
**Fase:** F5.2b (POS operativo) — ajustes de venta sobre el ticket
**Autor:** Fermín + Claude Code
**Estado:** aprobado para plan de implementación

---

## 1. Objetivo y gate

Cerrar la **capa de ajustes de la venta** que se difirió de F5.2:

1. **Descuento manual** sobre un ticket abierto, con **autorización por PIN de supervisor** cuando el operador no tiene el permiso.
2. **Propina** capturada en el cobro.

De paso se construye la **primitiva reutilizable de autorización por PIN** (mockup P-080), que después reusan cancelación de ticket pagado, override de precio y reversa de cocina.

**Gate de salida (correctitud · 🔴 ALTA seguridad):**
- E2E descuento: cajero (sin permiso) pide descuento → modal PIN → un supervisor autoriza con su PIN → el descuento se registra con su `autorizacion_pin_id` y el `total_mxn` baja en BD; el operador con permiso aplica sin PIN.
- E2E propina: cobro con propina → el pago = `total + propina` persiste; `tickets.propina_mxn` queda registrado.
- Seguridad: el PIN del autorizador **nunca** se verifica en el cliente; un PIN de rol insuficiente es rechazado con motivo claro; RLS cross-tenant sigue **8/8**.

## 2. Alcance

**Dentro de F5.2b:**
- Descuento manual **a nivel ticket completo**, tipos **`PORCENTAJE`** y **`MONTO_FIJO`** (los dos que muestra P-078), con **motivo obligatorio** (chips: Cortesía, Producto defectuoso, Cliente VIP/frecuente, Ajuste de precio, Otro).
- Autorización: **por permiso de rol** (decisión §3.1). Operador con `descuento.manual_aplicar` (SUPERVISOR/ADMIN/DUEÑO) aplica directo; CAJERO requiere PIN de supervisor.
- **Primitiva de autorización por PIN** (Edge Function `autorizar-pin`), reutilizable.
- **Propina en el cobro**: sugerencias de `sucursal_propinas_config` (configurado en F4.4) + monto libre + sin propina.
- Verificación de los RPC de 0008 que nunca se ejecutaron (`aplicar_descuento_manual`, `aplicar_pago`) → smoke SQL + fix aditivo si truenan (como bugs #19/#20).

**Fuera de F5.2b (deuda explícita):**
- **Cortesía 100% (`CORTESIA_TOTAL`), descuento por ítem, override de precio.** El backend (`aplicar_descuento_manual`, `ticket_descuentos_manuales`) ya los soporta; se exponen en UI cuando se prioricen. P-078 solo muestra %/monto a nivel ticket.
- **Límite de descuento en pesos por cajero** (P-078 lo insinúa). No existe en el esquema; se omite a favor del modelo por permiso. Mejora futura.
- Impresión (F5.3), cierre X/Z (F5.4), promociones automáticas, devoluciones/cancelaciones (F6).

## 3. Decisiones de diseño

### 3.1 Cuándo se requiere PIN — por permiso de rol (aprobado)
Se usa el sistema de permisos existente (doc 09 / seed `rol_permisos`): el permiso `descuento.manual_aplicar` lo tienen SUPERVISOR(3)/ADMIN(4)/DUEÑO(5), no CAJERO(2).
- Operador **con** el permiso → aplica directo, registrando una **autorización propia** (solicitante = autorizó = él mismo).
- Operador **sin** el permiso → modal PIN; un autorizador con el permiso valida.

Descartado el "límite en pesos configurable": agrega esquema nuevo (¿por rol/usuario/sucursal?) sin estar modelado; YAGNI.

### 3.2 Primitiva de PIN — Edge Function (decisión propia, aprobada "tú decides")
Consistente con `pin-login` / `resetear-pin`: **el PIN siempre se verifica server-side con `service_role`**, nunca desde el cliente. Anti-fuerza-bruta y auditoría centralizadas. La verificación de PIN del cliente rompería el patrón del repo y el modelo de seguridad de la Parte 1F.

### 3.3 Dos caminos, un mismo contrato de salida
Ambos caminos (autorización propia / por supervisor) producen un **`autorizacion_pin_id`** que alimenta el RPC `aplicar_descuento_manual` ya existente. Esto desacopla *autorizar* de *aplicar* → la misma primitiva sirve para cancelación, override, etc.

### 3.4 Propina — tope de pago = total + propina
`tickets.propina_mxn` ya existe (marcada "Fase 2"). Se **establece la propina en el ticket** antes de pagar y se ajusta `aplicar_pago` para que el tope deje de ser `total_mxn` y pase a `total_mxn + propina_mxn`. La propina **no** entra en `total_mxn` (se mantiene la semántica de `recalcular_totales_ticket`); se cobra por encima. Cambio mínimo y localizado.

## 4. Arquitectura backend

### 4.1 Ya existe (verificar + arreglar si truena)
- `aplicar_descuento_manual(p_ticket_id, p_ticket_item_id, p_tipo, p_valor, p_motivo_categoria, p_motivo_texto, p_autorizacion_pin_id, p_usuario_solicitante_id, p_usuario_autorizo_id, p_client_id_local)` → calcula monto por tipo, inserta en `ticket_descuentos_manuales`, dispara `recalcular_totales_ticket` por trigger. **Nunca ejecutado.**
- `ticket_descuentos_manuales` (FK `autorizacion_pin_id` NOT NULL), `autorizaciones_pin`, `tickets.propina_mxn`, `recalcular_totales_ticket` (ya integra descuentos).

### 4.2 Nuevo — migración aditiva `0018_f52b_autorizacion_pin.sql`
- **`verificar_autorizacion_pin(p_pin, p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo, p_caja_id, p_turno_id, p_usuario_solicitante_id)`** — SECURITY DEFINER, `search_path` fijo (`public, extensions, pg_temp` por `crypt`). Espejo de `verificar_pin_login`:
  1. Resuelve al autorizador **solo por su PIN** (fiel a P-080, que pide únicamente el PIN sin identificar antes al supervisor): busca, entre los usuarios del tenant **que tienen el permiso `p_permiso_codigo`**, el `usuarios_perfil` cuyo `crypt(pin, pin_hash) = pin_hash` coincida. El set "usuarios con el permiso" es chico (supervisores/admins) → búsqueda acotada y segura. Si ninguno coincide entre los autorizados pero el PIN sí pertenece a alguien sin permiso, se devuelve `SIN_PERMISO` (mensaje de P-080); si no coincide con nadie, `PIN_INCORRECTO`.
  2. Valida permiso del autorizador (`rol_permisos` → `permiso_codigo`).
  3. Anti-fuerza-bruta reusando `pin_intentos` (igual que `verificar_pin_login`).
  4. Inserta `autorizaciones_pin` (solicitante, autorizó, acción, permiso, entidad, monto, motivo) → devuelve `{ ok, autorizacion_pin_id, motivo }`.
  - `REVOKE EXECUTE ... FROM authenticated, anon, public` (solo la Edge Function la invoca).
- **`registrar_autorizacion_propia(p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo)`** — SECURITY DEFINER, usa `auth.uid()`: valida que el operador tenga el permiso y registra la autorización (solicitante = autorizó = `auth.uid()`). `GRANT ... TO authenticated`. (No hay PIN externo que verificar → no necesita Edge Function.)
- **`establecer_propina_ticket(p_ticket_id, p_monto_mxn)`** — SECURITY INVOKER (corre bajo RLS del cajero): `UPDATE tickets SET propina_mxn = p_monto` si está ABIERTO. `GRANT ... TO authenticated`.
- **`aplicar_pago` (CREATE OR REPLACE):** el tope cambia de `v_ticket.total_mxn` a `v_ticket.total_mxn + v_ticket.propina_mxn`. Sin otros cambios.

### 4.3 Edge Function `autorizar-pin`
Espeja `resetear-pin`/`crear-empleado`: valida el JWT del solicitante (cajero), llama `verificar_autorizacion_pin` con `service_role`, mapea motivos (`PIN_INCORRECTO`, `SIN_PERMISO`, `BLOQUEADO`) a HTTP. Devuelve `{ ok, autorizacion_pin_id }`.

## 5. Arquitectura frontend (apps/pos)

- **`lib/autorizacion.ts`** (nuevo): `autorizarConPin(token, payload)` → Edge Function; `autorizacionPropia(token, payload)` → RPC; tipos Zod.
- **`lib/descuento.ts`** (nuevo): `aplicarDescuento(token, { ticketId, tipo, valor, motivoCategoria, motivoTexto, autorizacionPinId, solicitanteId, autorizoId })` → RPC `aplicar_descuento_manual`.
- **`components/modal-autorizacion-pin.tsx`** (nuevo, **reutilizable** — P-080): props `{ accion, descripcion, permisoCodigo, monto, ejecutaNombre, onAutorizado(id), onCancelar }`. Reusa `PinKeypad`. Maneja "PIN sin permiso suficiente".
- **`components/modal-descuento.tsx`** (nuevo — P-078): segmento %/monto, valor, chips de motivo, preview (total actual → descuento → nuevo total). Al aplicar: si el operador tiene el permiso → `autorizacionPropia`; si no → monta `modal-autorizacion-pin`; luego `aplicarDescuento` y recarga totales.
- **`components/modal-cobro.tsx`** (extender): paso de propina (sugerencias de la sucursal + libre + sin propina) → `establecer_propina_ticket` antes de `aplicar_pago`; el tope de pago ahora es `total + propina`.
- **`components/sidebar-ticket.tsx`** (extender): botón "Aplicar descuento" + línea de descuento en el resumen; el `Cobrar` usa el total releído.

El operador (rol) sale del JWT/`Empleado` que ya viaja por el POS, para decidir el camino de autorización.

## 6. Flujos

**Descuento (cajero sin permiso):** tap "Aplicar descuento" → modal P-078 → elige tipo/valor/motivo → "Aplicar" → como no tiene permiso, monta P-080 → supervisor teclea PIN → Edge Function valida PIN+permiso → `autorizacion_pin_id` → `aplicar_descuento_manual` → trigger recalcula → sidebar muestra nuevo total. Confirmación "Descuento aplicado".

**Descuento (supervisor/admin operando):** igual, pero al "Aplicar" se llama `registrar_autorizacion_propia` (sin modal PIN) → mismo `aplicar_descuento_manual`.

**Propina:** en el cobro, antes de elegir método/monto, se ofrece propina (sugerencias/libre/sin). Se fija `establecer_propina_ticket` y el cobro permite cubrir `total + propina`.

## 7. Plan de verificación (dos sub-rebanadas)

**F5.2b-1 Descuento:**
1. Smoke SQL (`smoke_descuento.sql`, rol postgres): crear ticket → `verificar_autorizacion_pin` → `aplicar_descuento_manual` → asserts de `total_mxn`. Fix aditivo si truena.
2. RLS (`rls_descuento.sql`, rol authenticated): grants + RLS OK.
3. E2E navegador: cajero → descuento → PIN supervisor (María no tiene permiso; el DUEÑO/un supervisor seed autoriza) → total baja. Operador con permiso aplica sin PIN.

**F5.2b-2 Propina:**
4. Smoke SQL: `establecer_propina_ticket` + `aplicar_pago` con `total + propina`.
5. E2E navegador: cobro con propina sugerida y libre → BD: `propina_mxn` + pago correctos.

`supabase test db` (RLS cross-tenant) **8/8** tras las migraciones. Commit por sub-rebanada.

## 8. Riesgos / notas

- **RPC sin ejecutar:** `aplicar_descuento_manual` y `aplicar_pago` casi seguro tienen bugs de columnas fantasma (patrón #19/#20). Se cazan en el smoke; fixes como migración aditiva.
- **Búsqueda de PIN del autorizador (fijado, §4.2):** se prueba el PIN contra el set de usuarios-con-permiso del tenant (chico) y se conserva el anti-fuerza-bruta por `pin_intentos`. Si el set creciera mucho en el futuro, se migra a "identificar supervisor → su PIN".
- **Seed:** hace falta un **SUPERVISOR** en el seed para probar la autorización por PIN (hoy hay DUEÑO con permiso, María cajera sin permiso). Se añade un supervisor fixture con PIN conocido.
- Semilla offline (`client_id_local`) ya soportada por los RPC → idempotencia gratis.
