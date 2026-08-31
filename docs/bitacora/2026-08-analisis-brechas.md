# 🔍 Análisis de brechas — VIM POS (7 Jun 2026)

Comparación entre la **especificación** (`RECURSOS PARA DESARROLLO/`: plan maestro, playbook F0-F25, 6 docs de flujos, 16 docs de arquitectura, 231 mockups) y **lo construido** (monorepo `vim-pos`).

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
| **Setup inicial de catálogo (CSV/asistido)** | P-030-053 | 0% | Cargar el menú es lo más laborioso del alta; sin importador es fricción alta por cliente. |
| **Dashboard real del admin** | P-177 | Stub (45 líneas, sin queries) | Es la primera pantalla que ve el dueño; hoy está vacía. |
| **Clientes / CRM** | P-151-154 | Placeholder (6 líneas) | Ruta existe, sin funcionalidad. Necesario para factura a cliente frecuente. |
| **Inventario (UI)** | P-144-150 | Placeholder (6 líneas) | Backend existe (insumos/recetas/movimientos). Bloquea: café/bar (recetas ml/oz), dark kitchen, y la **reversa de inventario en devoluciones (#29)**. |

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
| **Offline-first completo** (Dexie + sync por batch + Capacitor) | F16 | Solo detección de conexión + banner |
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
