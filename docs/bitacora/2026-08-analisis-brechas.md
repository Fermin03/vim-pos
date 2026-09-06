# 🔍 Análisis de brechas — VIM POS (7 Jun 2026)

> ## ⚠️ Actualizado el 6 sep 2026 — lee esto antes que las tablas de abajo
>
> Lo que sigue es la **foto del 7 de junio**, y buena parte ya no es cierta. Se conserva porque
> explica de dónde venía el producto; el estado real de cada brecha está en la sección
> [¿Qué sigue abierto?](#qué-sigue-abierto-al-6-sep-2026), justo debajo. Las tablas de Tiers
> llevan marcada cada fila que ya se cerró.
>
> Es la segunda vez que este documento se queda atrás sin avisar: en julio ya había tres brechas
> marcadas como pendientes que estaban construidas, y alguien planeó trabajo sobre eso. Un
> documento de estado que miente cuesta más que no tenerlo.

---

## ✅ Lo que se cerró entre junio y septiembre de 2026

Verificado en el repositorio el 6 sep 2026 (rutas y tamaños reales, no memoria).

| Brecha de junio | Estado hoy | Evidencia |
|---|---|---|
| Dashboard real del admin (*stub de 45 líneas*) | ✅ Hecho | `apps/admin/app/(panel)/dashboard/page.tsx` — 383 líneas |
| Inventario UI (*placeholder de 6 líneas*) | ✅ Hecho | `…/inventario/page.tsx` — 521 líneas; ADR 0013 (el inventario viaja por movimientos) |
| Clientes / CRM (*placeholder de 6 líneas*) | ✅ Hecho | `…/clientes/page.tsx` — 338 líneas |
| Importador de menú (*0%*) | ✅ Hecho | `…/catalogo/importar/page.tsx` — 177 líneas |
| Round-trip cargar-ticket→carrito (*keystone de Full Service*) | ✅ Hecho | `apps/pos/app/lib/cuenta-mesa.ts` → `reconstruirCarrito`; ADRs 0005 y 0006 |
| Reportes (*17 de 23 faltaban*) | ✅ Casi cerrado | 14 reportes en `…/reportes/`: mesero, área, marca, categoría, producto, modo de servicio, tiempos de cocina, no-shows, descuentos, reimpresiones, eventos, apps externas, consolidado, Z histórico |
| Recibos faltantes (devolución, corte) | ✅ Hecho | `apps/pos/app/lib/print/devolucion-builder.ts`, `reporte-z-builder.ts` |
| Promociones (*sin UI ni motor*) | ✅ Hecho | `…/promociones/page.tsx` — 247 líneas; `apps/pos/app/lib/promociones.ts` con pruebas |
| Reservaciones UI (*backend sí, UI 0%*) | ✅ Hecho | `…/reservaciones/page.tsx` — 204 líneas; `apps/pos/app/lib/reservaciones.ts` |
| Dark Kitchen: conciliación con apps (*0%*) | ✅ Hecho | `…/conciliacion/page.tsx` — 257 líneas; ADR 0011, Uber en producción (3 sep) |
| Café & Bar: alertas de cuentas prolongadas | ✅ Hecho | `apps/pos/app/lib/__tests__/alertas-mesa.test.ts` |
| Foodtruck: eventos como contexto del turno | ✅ Hecho | `apps/pos/app/lib/turno.ts` (`evento_nombre`) + reporte por evento |
| Offline-first completo (*F16, Dexie + batch*) | ✅ Resuelto **de otra forma** | ADR 0004: lo da el escritorio (Postgres local + sync por snapshot). Dexie queda como caché de lectura |
| Movimientos de caja P-097-100 (*4 pantallas*) | ✅ Superado por decisión | ADR 0007: dos movimientos, no cuatro |
| CFDI con PAC real (*mock en junio*) | ✅ En producción | ADR 0009 superado; timbrado y cancelación con acuse desde el 3 sep |

**Y cosas que en junio ni figuraban** porque no existían como idea:

- **Compras y proveedores** (ADR 0012) y **recetas** — `…/compras`, `…/proveedores`, `…/recetas`.
- **Integración con apps de delivery** (ADR 0011) — Uber en producción; DiDi solicitado.
- **Panel `/platform` como centro de control** (ADR 0014, cuatro entregas) — bloqueo por estado,
  avisos a las cajas, módulos y límites por cliente, y versiones de la caja.
- **Sitio web público** (`sitio-web/`), con su capa para agentes.

---

## ¿Qué sigue abierto? (al 6 sep 2026)

| Sigue abierto | Nota |
|---|---|
| **Onboarding / wizard de alta** (P-001-057) | Lo más grande que queda del Tier 1. Hay pantalla de `bienvenida` en admin y fases de onboarding en `/platform`, pero no el asistente self-serve completo. Cada alta sigue siendo acompañada. |
| **App separada de mesero** | El flujo de mesero vive **dentro** del POS (`apps/pos/app/lib/mesero.ts`): atribución, envío a cocina pre-pago y propinas. La app aparte sigue sin empezar — y habría que decidir si se quiere. |
| **App de repartidor** | Sin empezar. La cola de delivery sí está en el POS. |
| **Billing / Stripe (F22)** | Sin empezar: no hay una sola referencia a Stripe en el repo. Hoy se cobra fuera del producto. |
| **Enterprise (F24), SSO + multi-PAC (F23), Loyalty (F13+)** | Sin empezar. Crecimiento, no piloto. |
| **A8 — login individual de super-admin** | El panel sigue con clave compartida. Subió de prioridad con la entrega 4 del ADR 0014: esa clave ahora también publica el instalador de todas las cajas. |
| **Hardening final + pentest + LFPDPPP (F25)** | Sin empezar. La auditoría cyber-neo de agosto sí está cerrada salvo hallazgos de baja prioridad. |
| **Pantallas POS discretas del mockup** (Tier 3) | Sigue igual que en junio, y sigue siendo deliberado: los mockups dejaron de mandar (ADR 0001). |

**Veredicto al 6 sep 2026.** El producto ya no está limitado por las brechas de junio. Lo que
falta para **vender solo** es el onboarding self-serve y el cobro de la suscripción; lo que falta
para **dormir tranquilo** es A8 y el pentest. El piloto de Knock-Out no está bloqueado por código:
hoy la caja se usa a ratos, no a diario.

---

## 📅 La foto del 7 de junio (histórico)


Comparación entre la **especificación** (`docs/especificacion/`, entonces fuera del repo: plan maestro, playbook F0-F25, 6 docs de flujos, 16 docs de arquitectura, 231 mockups) y **lo construido** (monorepo `vim-pos`).

> **Lectura clave:** la métrica "23% de mockups implementados" **subestima** la realidad funcional. Una pantalla como `home-pos` cubre varios mockups (P-059..P-077) y los modales cubren los métodos de pago (P-070..P-074). La **ruta crítica de Quick Service** (login→venta→cobro→cocina→cierre→CFDI) está **~80% funcional**. Lo que está bajo es la **amplitud**: las otras 5 verticales, el onboarding y varios módulos de admin.

---

## ✅ Lo que está SÓLIDO (hecho + verificado por smoke/build/RLS)

| Área | Estado |
|---|---|
| **Núcleo (CORE)** | Auth PIN + sesión dispositivo + JWT + RLS · turno/caja · catálogo · ticket · pago (efectivo/tarjeta/transferencia/vale/dividido) · propina · descuento (global + ítem + override + cortesía) · cancelación (ítem + ticket) · **devolución (Modelo B)** · movimientos de caja · cierre X/Z |
| **Quick Service** | ~85% — grid de productos, modificadores, modos, envío a cocina al cobrar, recibos cliente+comanda |
| **KDS** | Tablero P-107 + multi-área P-109 + alto contraste P-111 + sonido + toasts (polling 5s) |
| **CFDI** | Timbrado borrador→timbrado con **PAC mock** (Facturapi @sin-verificar listo) + config emisor en admin |
| **Admin** | Catálogo **100%** (productos/categorías/modificadores/opciones/precios) · Usuarios (CRUD + reset PIN) · Configuración (negocio/fiscal/CFDI/sucursales/cajas/propinas/marcas) · 4 reportes (Z histórico, ventas por producto/categoría/modo) |
| **Plataforma** | Provisioning interno + signup self-service |
| **Impresión** | Pipeline ESC/POS + adapters (preview activo, Epson scaffold) · recibos P-222/P-223/P-226 |
| **Verticales (rebanada base)** | Mesas (mapa solo-lectura) · Delivery (cola + liquidación) · Marcas virtuales (CRUD + asignar productos) |
| **Calidad** | 16 smokes + vitest + RLS test + CI GitHub Actions + hardening cyber-neo |

---

## 🟥 BRECHAS — Tier 1: bloquean ESCALAR/VENDER (no el piloto)

| Brecha | Mockups | Estado | Por qué importa |
|---|---|---|---|
| **Onboarding / wizard de alta** | P-001-057 (~27 pantallas) | 11% | No hay setup guiado. Un dueño nuevo no puede configurar su negocio+menú solo; hoy se hace manual por admin. Bloquea el self-serve a escala. |
| ~~**Setup inicial de catálogo (CSV/asistido)**~~ ✅ | P-030-053 | ~~0%~~ → importador hecho | Cargar el menú es lo más laborioso del alta; sin importador es fricción alta por cliente. |
| ~~**Dashboard real del admin**~~ ✅ | P-177 | ~~Stub (45 líneas, sin queries)~~ → hecho | Es la primera pantalla que ve el dueño; hoy está vacía. |
| ~~**Clientes / CRM**~~ ✅ | P-151-154 | ~~Placeholder (6 líneas)~~ → hecho | Ruta existe, sin funcionalidad. Necesario para factura a cliente frecuente. |
| ~~**Inventario (UI)**~~ ✅ | P-144-150 | ~~Placeholder (6 líneas)~~ → hecho | Backend existe (insumos/recetas/movimientos). Bloquea: café/bar (recetas ml/oz), dark kitchen, y la **reversa de inventario en devoluciones (#29)**. |

---

## 🟧 BRECHAS — Tier 2: completar las VERTICALES (cada una su ciclo)

| Vertical | Falta | Estado |
|---|---|---|
| **Full Service** | Cuenta por mesa con carrito (abrir/retomar/editar), split UI, transferir/juntar UI, cursos de cocina, waitlist | Solo mapa lectura · necesita el **round-trip cargar-ticket→carrito** (keystone) |
| **App de mesero** | App separada: login P-120, mis mesas P-121, carrito por mesa P-123 | 0% |
| **Delivery / repartidor** | App repartidor (login P-112, asignaciones, mapa ruta P-115, no-entrega), admin delivery P-204-211 (liquidaciones, conciliación) | Cola en POS sí · app y admin 0% |
| **Café & Bar** | Cuentas abiertas prolongadas + alertas 2h/4h, happy hour por horario, barra libre sin numerar | Modo BARRA parcial |
| **Foodtruck** | Eventos como contexto del turno (modal al abrir + comisión al cerrar), reportes por evento, geoloc | Estructura BD, UI 0% |
| **Dark Kitchen** | Pausar/reanudar marca-en-canal, pausar producto, **conciliación con apps** (Rappi/Uber/Didi) | Captura manual sí · pausas/conciliación 0% |
| **Reservaciones** | Calendario P-199, CRUD reservación, no-show, recordatorio WhatsApp | Backend (crear/confirmar/no-show) sí · UI 0% |

---

## 🟨 BRECHAS — Tier 3: pulir POS + reportes + recibos

- **Pantallas POS discretas** P-060-084: selector de modo de servicio dedicado, pantallas de tarjeta/transferencia/app por separado, descuentos como pantalla, CFDI en cobro (P-084), tickets activos (P-060). *La FUNCIÓN existe vía modales; faltan algunas pantallas dedicadas del mockup.*
- **Movimientos de caja** P-097-100: inyectar fondo, retiro, depósito bancario, pago proveedor (hoy hay un modal genérico).
- **Reportes faltantes** (17 de 23): ventas por mesero/área/marca, tiempos de cocina, no-shows, descuentos, cancelaciones, aperturas, bitácora/auditoría, estado de resultados, cortes.
- **Recibos faltantes** P-224/225/227/228/229: cuenta provisional, X impreso, corte de caja, **recibo de devolución**, representación impresa del CFDI.
- **Promociones** P-139-141: estructura en BD, sin UI ni motor de aplicación automática.

---

## 🟦 BRECHAS — Tier 4: plataformas grandes (ciclo propio cada una)

| Módulo | Fase playbook | Estado |
|---|---|---|
| ~~**Offline-first completo**~~ ✅ (por el escritorio, ADR 0004) | F16 | ~~Solo detección de conexión + banner~~ → resuelto de otra forma |
| **Push notifications + KDS interactivo** | F15 | No iniciado |
| **Billing / Stripe** (suscripción del SaaS) | F22 | No iniciado |
| **Enterprise** (multi-sucursal consolidado, franquicias, permisos finos) | F24 | Estructura BD, UI 0% |
| **Migración + SSO + multi-PAC** | F23 | No iniciado |
| **Loyalty / CRM Pro** (add-on) | F13+ | No iniciado |
| **Hardening final + pentest + LFPDPPP** | F25 | No iniciado |

---

## 🚀 Prerequisitos de GO-LIVE (no es código — lo consigues tú)

**Bloquean el arranque:** Supabase Pro (~$25/mes) · Vercel · tablet Android 12+ · repo privado.
**Para venta real de Knock-Out:** Facturama/Facturapi ($1,650/año + $0.50/folio) · **CSD del SAT** de Knock-Out · Impresora **Epson TM-m30III** + cajón RJ11 · red local estable · **menú real capturado** · Cloudflare R2 (backups) · Sentry · aviso de privacidad + contrato encargado/responsable.

---

## 🎯 Recomendación de secuencia

**El piloto de Knock-Out (QS) NO está bloqueado por código** — la ruta crítica está completa. Lo que falta para el piloto es **go-live (hardware + PAC + CSD)**.

Para **escalar/vender** después, el orden de mayor ROI:
1. **Dashboard real + Onboarding wizard + Importador de menú** (Tier 1) — sin esto, cada alta es manual.
2. **Inventario UI** — desbloquea café/bar, dark kitchen y la reversa de devoluciones (#29).
3. **Round-trip cargar-ticket→carrito** — keystone que destraba Full Service y retomar cuentas.
4. **Offline-first (F16.2)** — robustez para foodtruck y caídas de WiFi.
5. **Stripe (F22)** — para cobrar suscripciones cuando haya varios clientes.
6. Apps de mesero/repartidor, Enterprise, SSO — cuando el mercado lo pida.

> **Veredicto:** producto **vendible hoy para Quick Service** (piloto). **Comercialmente completo (6 verticales + self-serve)** tras Tiers 1-3. Tier 4 es crecimiento.
