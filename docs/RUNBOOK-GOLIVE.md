# 🚀 Runbook de Go-Live — Knock-Out Burger (F11)

> **Qué es esto:** la lista de pasos para llevar VIM POS de "verde en local" a "operando
> en producción con Knock-Out Burger". El software de la ruta crítica está completo y
> verificado (F0–F10). Lo que queda son pasos de **infraestructura, hardware y servicios
> externos** que requieren a Fermín presente. Marca cada casilla al completarla.

**Estado del software (al 6 Jun 2026):** ruta crítica completa — login → turno → venta →
cobro (efectivo/tarjeta/transferencia/app/dividido/propina) → impresión (preview) → descuento
/cortesía → cancelación ítem/ticket → movimientos de caja → cierre Z estilo Soft → KDS de
cocina. Admin: catálogo, usuarios, config, datos fiscales, CFDI/PAC. Plataforma: provisioning.
CFDI: pipeline de timbrado con PAC mock (Facturapi @sin-verificar). Seguridad: hardening
Cyber-Neo aplicado (RLS, headers, CORS allowlist, fixture gate, .npmrc).

---

## 1. Proyecto cloud Supabase

- [ ] Crear el proyecto en Supabase cloud (región más cercana a México: `us-east-1` o similar).
- [ ] `supabase link --project-ref <ref>` y `supabase db push` (aplica las **27 migraciones** 0001–0027 en orden).
- [ ] `supabase functions deploy pin-login autorizar-pin crear-empleado resetear-pin timbrar-cfdi provisionar-tenant`
- [ ] Verificar que `supabase_realtime` no expone tablas sensibles (hoy está vacía; si se activa Realtime para el KDS, agregar **solo** `tickets` con RLS).

## 2. Secretos y configuración (ver `.env.example`)

- [ ] **Generar secretos nuevos y fuertes** (NO reutilizar los de dev):
  - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (del dashboard del proyecto cloud).
  - `PLATFORM_PROVISION_KEY` = `openssl rand -hex 32`.
- [ ] `supabase secrets set VIM_JWT_SECRET=<jwt secret> FACTURAPI_API_KEY=<...> PLATFORM_PROVISION_KEY=<...> VIM_CORS_ORIGINS="https://pos.vimpos.mx,https://admin.vimpos.mx,https://app.vimpos.mx"`
- [ ] `.env.local` de cada app (pos/admin/platform) con las públicas (URL + anon) y, para platform, las secretas server-side.
- [ ] **Rotar** cualquier secreto que haya tocado disco en dev (CN del reporte cyber-neo).

## 3. Seguridad pre-go-live (del reporte Cyber-Neo — `~/Desktop/cyber-neo-report-vim-pos-*.md`)

- [ ] **CN-005 (alta prioridad):** endurecer `pin-login` para que valide el JWT del dispositivo
      antes de aceptar intentos de PIN (hoy cualquiera con la anon key puede intentar; solo el
      lockout del RPC protege). Hay un chip/tarea de fondo creada para esto — hacerla **con E2E
      de login** para no romper el acceso del piloto.
- [ ] Confirmar `VIM_CORS_ORIGINS` configurado (CN-004) → CORS deja de ser `*`.
- [ ] Confirmar cabeceras de seguridad activas en pos/admin/platform (CN-003, ya en código).
- [ ] (Opcional) Bumps de deps dev: vitest 2→4, postcss ≥8.5.10 (CN-001/007). Correr la suite tras el bump.
- [ ] (Opcional) Pipeline CI con gate de RLS + `pnpm audit` + secret scan (CN-013).

## 4. Datos del cliente (provisioning + admin)

- [ ] **Provisionar el tenant** Knock-Out desde `apps/platform` (o la Edge Function
      `provisionar-tenant`): código `knockout-burger`, vertical QUICK_SERVICE, plan QS, dueño +
      correo. Devuelve la contraseña temporal del dueño → comunicársela.
- [ ] El dueño entra a `apps/admin` y captura:
  - **Datos fiscales** (P-163): RFC, razón social, régimen, CP fiscal, correo. *(El Z y el ticket ya leen esto.)*
  - **Sucursal(es)** con dirección completa (sale en el encabezado del Z y del ticket).
  - **Cajas** y **usuarios** (cajeros/supervisores con sus PIN).
  - **Catálogo** real (categorías, productos, modificadores, precios).
  - **Propinas** y, si va a facturar, **CFDI/PAC** (P-018): emisor + proveedor + modo.

## 5. CFDI real (si Knock-Out factura) — F8 @sin-verificar

- [ ] Contratar Facturapi.io (o el PAC elegido) y **subir el CSD** del emisor.
- [ ] `supabase secrets set FACTURAPI_API_KEY=<...>` → `timbrar-cfdi` deja el mock y usa Facturapi.
- [ ] **Validar end-to-end** un timbrado real en sandbox: ticket pagado → solicitar factura →
      revisar el XML/PDF contra una factura conocida. Ajustar el mapeo de **conceptos/impuestos
      CFDI 4.0** (hoy `facturapi.ts` manda un concepto agregado; producción suele querer ítem por ítem).
- [ ] Implementar el almacenamiento de **XML/PDF en Storage** (bucket privado `cfdi/`) — hoy se
      registran las rutas lógicas pero no se sube el archivo.
- [ ] (Si aplica) UI de "solicitar factura" desde ticket pagado + portal de autofacturación del cliente.

## 6. Impresión real — F5.3 @sin-verificar (checklist doc 16 §11)

- [ ] Conseguir la **impresora Epson** (TM-m30 / TM-T20 con ePOS o red).
- [ ] Activar `EpsonEposAdapter` (hoy el POS usa `PreviewAdapter`; `obtenerImpresora()` selecciona).
- [ ] Validar **code page** (hoy `escpos.ts` translitera acentos a ASCII), **corte** de papel y **cajón** de dinero.
- [ ] Probar el recibo cliente (P-222), la comanda de cocina (P-223) y los reportes X/Z impresos.

## 7. Hardware del piloto

- [ ] **Tablet Android** para la caja (o monitor para el navegador del POS).
- [ ] **Pantalla de cocina** para el KDS (`Cocina` en la topbar del POS → tablero P-107).
- [ ] Red estable en el local (el POS hoy es online; offline robusto es F16).
- [ ] Dominios + TLS: `pos.vimpos.mx`, `admin.vimpos.mx`, `app.vimpos.mx` (o subdominios por tenant).

## 8. Checklist de smoke E2E en producción (antes de abrir caja real)

- [ ] Login por PIN de un cajero real.
- [ ] Abrir turno con fondo.
- [ ] Vender (varios productos + modificadores + nota) y cobrar (efectivo con cambio + tarjeta).
- [ ] Ver la comanda entrar al **KDS** y marcarla LISTO → ENTREGADO.
- [ ] Aplicar un descuento con autorización (PIN supervisor).
- [ ] Cancelar un ítem y un ticket completo.
- [ ] Registrar una **sangría** y un **refuerzo de fondo**.
- [ ] **Cerrar el turno**: arqueo + Reporte Z. Verificar que cuadra contra el efectivo físico.
- [ ] (Si factura) Timbrar una factura real de un ticket pagado.

---

## Lo que NO bloquea el go-live (fases posteriores)

- F12 onboarding self-service · F13 reportes admin · F14 endurecimiento · F15 push/KDS avanzado ·
  F16 offline+Capacitor · F17–F21 otras verticales · F22 billing Stripe · F23 multi-PAC · F25 hardening final.

> **Resumen:** el código está listo. Go-live = **secretos + datos del cliente + PAC real + Epson +
> tablet + CN-005**. Los tres `@sin-verificar` (Epson, Facturapi, y el CSD) son los únicos que
> exigen un servicio/hardware externo que no se puede validar desde el entorno de desarrollo.
