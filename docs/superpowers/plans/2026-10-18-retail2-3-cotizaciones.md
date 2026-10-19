# Retail 2 · Entrega 3 (cotizaciones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una tienda arme una cotización como un ticket, la guarde con folio COT y vigencia, la imprima o la mande por WhatsApp con un enlace que el cliente puede abrir y guardar como PDF, y la convierta en venta con los precios de hoy. El dueño ve en el admin las cotizaciones y cuáles se volvieron venta.

**Architecture:**
- **Tablas propias** `cotizaciones` y `cotizacion_items`, con las mismas instantáneas que `ticket_items`. **No se usa `tickets`**: gastaría folios de venta, aparecería como cuenta abierta y no subiría en el sync, que solo sube tickets terminales.
- **Folio:** `'COT-' || generar_folio(sucursal, 'COTIZACION')`. Hereda la serie W de la nube.
- **Interruptor y vigencia** en `configuracion_tenant`, con el patrón del crédito (0208).
- **Convertir en venta:**
  1. carga los renglones al carrito con los productos del catálogo de hoy;
  2. avisa si venció o si cambió algún precio;
  3. al cobrarse, marca la cotización CONVERTIDA con el ticket.
- **WhatsApp:** `enlaceWhatsapp` de `@vim/db/soporte` con un texto corto y un **enlace público** `https://<portal factura>/c/<token>` a una página de solo lectura en `apps/factura`, que el cliente puede imprimir o guardar como PDF. La lee una RPC pública por token, como la autofactura.

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`, `apps/factura`), escritorio (`desktop/src`), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-retail-2-design.md`: §2 «Cotizaciones» y «Crédito y cotizaciones los enciende el dueño»; el punto de la barra inferior y «Más»; §3; y lo que decidieron las entregas 1 y 2.

## Global Constraints

- **Todo en local.**
  - Rama `feat/retail2-cotizaciones`, encima de `feat/retail2-credito` (HEAD 2c10967a).
  - 0188–0211 no se editan.
  - Las migraciones nuevas son 0212 (base) y 0213 (sync), aplicadas al Docker local y registradas.
- **Configuración del negocio:**
  - `configuracion_tenant.modulo_cotizaciones_activo boolean DEFAULT false`.
  - `configuracion_tenant.cotizacion_vigencia_dias int DEFAULT 15 CHECK (1..365)`.
  - Solo un administrador del negocio las cambia, con una guardia como la del crédito.
  - `modulos_efectivos` publica `cotizaciones`.
- **Folio:** `COT-` seguido de lo que devuelve `generar_folio(sucursal_id, 'COTIZACION')`. Es único por negocio.
- **Estados:** `VIGENTE | CONVERTIDA | CANCELADA`. «Vencida» no es un estado: se calcula con `vigente_hasta < hoy` en `tenants.timezone`.
- **Una cotización:**
  - no descuenta existencias;
  - no es venta;
  - no entra al corte, a los reportes de ventas ni a la lealtad;
  - no se factura.
- **Convertir:**
  - los precios son los de hoy, del catálogo, y el carrito ya funciona así;
  - el aviso dice cuántos renglones cambiaron de precio y si venció;
  - un producto que ya no existe o está agotado se omite con aviso;
  - la cotización se marca CONVERTIDA solo cuando su venta queda PAGADO.
- **Enlace público:**
  - `token_publico` aleatorio de 24 o más caracteres;
  - la RPC `cotizacion_publica(p_token)` es SECURITY DEFINER, con EXECUTE para anon;
  - devuelve solo lo que va impreso (negocio, sucursal, folio, fecha, vigencia, renglones, totales y, si hay, el nombre del cliente);
  - nada más, ni ids internos.
- **Los restaurantes no cambian:** con el módulo apagado no aparece nada.
- Ponytail; español; sin `any`; dinero en `numeric(12,2)` y centavos en TS.
- Suites: smokes, pos/admin/platform/factura test y typecheck, tipografía, 0040, escritorio.

## Review Focus

1. **Precio cambiado al convertir.** Se cotizan 2 piezas de $100 y el precio sube a $120: el carrito cobra $240 y el aviso dice «1 producto cambió de precio». → Task 4.
2. **Cotización hecha en la caja sin internet.** Sube en el sync. Si después se convierte, el cambio a CONVERTIDA también sube, porque la huella cambia. → Task 2.
3. **El enlace público con un token inventado o de otro negocio** no devuelve nada, y no expone ids ni datos de otros clientes. → Task 1.
4. **Convertir una venta que no se cobra.** Se abandona o se cancela: la cotización sigue VIGENTE. → Task 4.
5. **La cotización no se cuela en ningún reporte de ventas, corte o cuenta abierta.** → Task 1, con un smoke de que `reporte_x` y `vw_ventas_*` no cambian.

---

### Task 1: Cotizaciones en la base (0212)

**Files:**
- Create: `supabase/migrations/0212_cotizaciones.sql`:
  - **Configuración y módulo:** las dos columnas de `configuracion_tenant` con su guardia (patrón de 0208:12-46) y `modulos_efectivos` (cuerpo vigente de la 0208), publicando `cotizaciones`.
  - **`cotizaciones`:**
    - `id`, `tenant_id`, `sucursal_id`, `caja_id`;
    - `folio varchar(40)`, UNIQUE por negocio;
    - `cliente_id` NULL;
    - `estado`;
    - `vigente_hasta date`;
    - `subtotal_mxn`, `iva_mxn`, `total_mxn` en `numeric(12,2)`;
    - `token_publico` UNIQUE;
    - `ticket_id` (la venta, si se convirtió) NULL;
    - `client_id_local` UNIQUE por negocio;
    - `usuario_id`, `created_at`, `updated_at`.
  - **`cotizacion_items`:** columnas de instantánea como `ticket_items` (0008:541-601):
    - `producto_id`, `cantidad numeric(12,3) > 0`;
    - nombre, sku, precio unitario, tasa de IVA, IVA incluido, clave SAT y unidad SAT;
    - `subtotal_bruto_mxn`, `iva_item_mxn`, `total_item_mxn`;
    - `orden_visualizacion`.
    - Sin combos en esta versión: se rechazan.
  - **RLS:** lectura por negocio. Escritura solo por RPC: sin INSERT, UPDATE ni DELETE directos para `authenticated`.
  - **`guardar_cotizacion(p_sucursal_id, p_caja_id, p_cliente_id, p_items jsonb, p_client_id_local) RETURNS jsonb {id, folio, vigente_hasta, total, token_publico}`:**
    - toma los precios del catálogo en la base (`precio_producto_en_sucursal`, como `agregar_item_a_ticket` 0152:246-356) y no confía en los del cliente;
    - calcula los totales con la misma regla de IVA que `ticket_items`;
    - vigencia = hoy (en la zona del negocio) + `cotizacion_vigencia_dias`;
    - es idempotente por `client_id_local`;
    - exige el módulo encendido;
    - rechaza los padres de variantes y los combos.
  - **`cancelar_cotizacion(p_id)`**, solo si está VIGENTE.
  - **`marcar_cotizacion_convertida(p_cotizacion_id, p_ticket_id)`:** el ticket debe ser del mismo negocio y estar PAGADO o FACTURADO, y la cotización VIGENTE (vencida también vale). Es idempotente.
  - **`cotizacion_publica(p_token text) RETURNS jsonb`:** SECURITY DEFINER, `search_path` fijo, EXECUTE para anon y authenticated. Devuelve solo lo de Global Constraints, o NULL.
- Smoke `supabase/scripts/smoke_cotizaciones.sql`:
  - módulo apagado → rechazo;
  - guardar 2 renglones (uno a granel, 1.250 kg): folio `COT-…`, total con IVA correcto, vigencia = hoy + 15;
  - el precio del cliente se ignora;
  - idempotencia;
  - no mueve existencias;
  - `reporte_x` y `vw_ventas_*` no cambian, y no aparece en las cuentas abiertas;
  - cancelar;
  - marcar convertida con un ticket PAGADO, y rechazo con uno ABIERTO;
  - `cotizacion_publica`: el token correcto devuelve los datos sin ids; uno inventado devuelve NULL; anon puede llamarla;
  - RLS: un cajero no hace INSERT directo y otro negocio no lee.

- [ ] Smoke que falla → 0212 → aplicar/registrar → suite de smokes y 0040 → commit `"BD: cotizaciones con folio, vigencia y enlace público (0212)"`.

### Task 2: Las cotizaciones viajan con la caja (0213 + escritorio)

**Files:**
- Create: `supabase/migrations/0213_cotizaciones_sync.sql`:
  - `sync_push_snapshot` (cuerpo vigente de la 0210) acepta `cotizaciones` y `cotizacion_items` de la caja, con un aplicador al estilo de `_vim_aplicar_credito_caja` (0210:82-163):
    - valida negocio, sucursal, caja y cliente (con su alias);
    - las cotizaciones se aplican con upsert por `id`, que actualiza estado, `ticket_id` y `updated_at`;
    - los renglones son de solo inserción.
  - `sync_pull_snapshot` **no** las baja. Las cotizaciones de otras cajas no se ven en esta, igual que sus tickets.
- Modify: `desktop/src/sync-push.mjs`. Las cotizaciones suben por **huella** (patrón `LIBRETAS`/`HUELLA_FILA`, sync-push.mjs:251-310), para que el cambio a CONVERTIDA o CANCELADA vuelva a subir. Sus renglones van con ella.
- Tests: escritorio (sube una vez; vuelve a subir al cambiar de estado) y smoke (dos push iguales no duplican; otro negocio se rechaza; el cambio de estado se aplica).

- [ ] Pruebas que fallan → 0213 y escritorio → `node --test desktop/src/*.test.mjs` y smokes → commit `"Sync: las cotizaciones suben con la caja (0213)"`.

### Task 3: Admin: encender, vigencia y lista

**Files:**
- Create: `apps/admin/app/(panel)/configuracion/cotizaciones/page.tsx`, con el interruptor «Hacer cotizaciones» y «Vigencia: N días», siguiendo el molde de `configuracion/credito/page.tsx` y `lib/credito.ts:15-47`. Más su entrada en `config-sidenav.tsx`.
- Create: `apps/admin/app/(panel)/cotizaciones/page.tsx`, más la entrada en NAV (`admin-shell.tsx:49`), `MIN_JERARQUIA` (`lib/acceso.ts:25`) y `rutasOcultas`/`conCotizaciones` (`lib/operacion.ts:25-55`):
  - lista con folio, fecha, cliente, total, estado (Vigente, Vencida, Convertida en venta con su folio, Cancelada) y sucursal, con filtro por estado;
  - totales arriba: cotizado este mes y cuánto se convirtió.
- Tests: las rutas ocultas sin módulo y el armado de la lista (estado calculado, vencida).

- [ ] Pruebas → implementar → `pnpm --filter @vim/admin test` y typecheck → commit `"Admin: cotizaciones encendibles y su lista"`.

### Task 4: Caja: guardar, imprimir, mandar y convertir

**Files:**
- Modify: `sidebar-ticket.tsx` (`opcionesMenu` :200-219) y `home-pos.tsx` (:3154-3166). En el menú «⋯» de Cobrar aparece **«Guardar como cotización»** si `modulos.cotizaciones` está encendido y el ticket tiene renglones y no está guardado como cuenta. Al guardar:
  1. se llama `guardar_cotizacion`;
  2. se abre la vista de la cotización con «Imprimir» y «Mandar por WhatsApp»;
  3. se limpia el carrito.
- Create: `apps/pos/app/components/seccion-cotizaciones.tsx`, más la entrada temporal en Configuración (`contenido-menu.tsx`, con el patrón de «Créditos»: :31, :57-64, :136-138, y `home-pos.tsx:220-221`, :3219-3241):
  - lista de vigentes y vencidas de esta caja, con búsqueda por folio o cliente;
  - el detalle trae «Reimprimir», «Mandar por WhatsApp», «Convertir en venta», «Cancelar cotización» y **«Nueva cotización»**, que regresa a Cobrar con el modo cotización.
- **Convertir en venta:**
  - arma el carrito con `dispatch({tipo:"cargar", …})` usando los productos del catálogo de hoy, como `reconstruirCarrito`/`agruparPadresHijos` (`lib/cuenta-mesa.ts:53-172`);
  - avisa: «Precios de hoy: N producto(s) cambiaron» y «Esta cotización venció el …»; también avisa de lo omitido;
  - guarda el `cotizacionId` en el estado de la venta. Al quedar PAGADO, `cobroTerminado` llama `marcar_cotizacion_convertida` sin bloquear el cobro si falla: se reintenta en el siguiente cobro o al abrir la sección.
- **Impresión:**
  - Create: `apps/pos/app/lib/print/cotizacion-builder.ts` (molde: `devolucion-builder.ts`), con su vista en pantalla.
  - Contenido: encabezado del negocio, **«COTIZACIÓN»**, folio COT completo, fecha, «Válida hasta: dd/mm/aaaa», cliente si hay, renglones con unidad («1.250 kg Jitomate / $28.00/kg»), Subtotal/IVA/TOTAL y «Precios sujetos a cambio después de la vigencia».
  - Sin pagos, sin QR de factura y sin lealtad.
  - `PrintJob.tipo` (`lib/print/tipos.ts:15`) gana `"COTIZACION"` si hace falta.
- **WhatsApp:** `enlaceWhatsapp(telefono del cliente o vacío, texto)` de `@vim/db/soporte`. Texto: «Cotización COT-… de <negocio>: $<total>, válida hasta <fecha>. Ver: <url pública>». La URL sale de la variable de entorno del portal de factura que el POS ya use; si no hay, de la configuración existente. En el escritorio se abre en el navegador del sistema.
- Tests:
  - armado del texto de WhatsApp;
  - aviso de precios cambiados y vencida;
  - builder de la cotización (sin pagos ni QR, con la unidad);
  - la opción del menú «⋯» solo con el módulo.

- [ ] Pruebas → implementar → `pnpm --filter @vim/pos test`, typecheck y tipografía → navegador (controlador) → commit `"Caja: guardar, imprimir, mandar y convertir cotizaciones"`.

### Task 5: La página pública de la cotización

**Files:**
- Create: una ruta en `apps/factura` (el portal público de autofactura; revisa su estructura y cómo llama a Supabase con la llave anónima): `/c/[token]`.
  - Llama `cotizacion_publica(token)`.
  - Muestra la cotización (mismo contenido que el impreso), con un botón **«Guardar como PDF»** (`window.print()` con CSS de impresión).
  - Con un token inválido dice «Esta cotización no existe o ya no está disponible».
  - Sin cookies ni rastreo nuevos.
- Tests: el armado de la vista y el token inválido.

- [ ] Pruebas → implementar → test y typecheck de `apps/factura` → navegador (controlador) → commit `"Portal: ver una cotización por su enlace"`.

### Task 6: Documentos y revisión final

- `docs/diseno/pos-retail.md`: «Guardar como cotización», la sección Cotizaciones, convertir y WhatsApp.
- El spec: «Entrega 3, hecha». La página pública vive en el portal de factura; el sitio y el PDF de prospectos siguen pendientes.
- Matriz de permisos: quién crea, convierte y cancela (cualquier cajero) y quién enciende (dueño o administrador).
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- «Mandar por WhatsApp como PDF» se resuelve con un enlace a la cotización que el cliente abre y guarda como PDF desde su teléfono. WhatsApp no deja adjuntar archivos por enlace, y el repo no genera PDF.
- Sin combos en cotizaciones en esta versión.
- La cotización de otra caja no se ve ni se convierte en esta, igual que pasa con las ventas. Sí se ve en el admin y en el POS web.
- Cancelar una cotización la puede hacer cualquier cajero (no mueve dinero).
