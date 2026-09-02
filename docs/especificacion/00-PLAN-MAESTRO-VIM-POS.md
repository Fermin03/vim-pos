# 00 — PLAN MAESTRO — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** raíz del proyecto. Fuente de verdad que ata visión, alcance, verticales, modelo de negocio, pricing, roadmap y arquitectura. Todos los demás documentos lo referencian como "Plan Maestro §X".
> **Audiencia:** interna (Fermín + equipo de desarrollo)
> **Estado:** vivo — se versiona en el changelog ante cualquier decisión estructural

---

## 📋 Tabla de contenidos

- [0. Propósito e índice maestro de documentos](#0-propósito-e-índice-maestro-de-documentos)
- [1. Visión y posicionamiento](#1-visión-y-posicionamiento)
- [2. Los 6 verticales](#2-los-6-verticales)
- [3. Filosofía de producto](#3-filosofía-de-producto)
- [4. Arquitectura en una página](#4-arquitectura-en-una-página)
- [5. Modelo multi-tenant](#5-modelo-multi-tenant)
- [6. Planes, folios CFDI y add-ons](#6-planes-folios-cfdi-y-add-ons)
- [7. Modelo de negocio y unit economics](#7-modelo-de-negocio-y-unit-economics)
- [8. Roadmap por fases](#8-roadmap-por-fases)
- [9. Alcance del MVP: dentro / fuera](#9-alcance-del-mvp-dentro--fuera)
- [10. Pilotos y criterios de éxito](#10-pilotos-y-criterios-de-éxito)
- [11. Decisiones globales cerradas](#11-decisiones-globales-cerradas)
- [12. Glosario y changelog](#12-glosario-y-changelog)

---

## 0. Propósito e índice maestro de documentos

### 0.1 Para qué sirve este documento

VIM POS se especificó en ~25,000 líneas de documentación de diseño antes de escribir código. Este Plan Maestro es el **punto de entrada**: define el qué y el porqué del producto, y enlaza el dónde está cada detalle. Cuando un documento técnico cita "Plan Maestro §5.1", apunta aquí.

**Regla de oro:** si una decisión es *global* (afecta a todos los verticales o al negocio completo), vive aquí. Si es *técnica de un subsistema*, vive en su documento de arquitectura. Si es *operativa de un flujo*, vive en su documento de flujos. Ante conflicto, el `/core` operativo (doc 01) manda sobre la implementación; este Plan Maestro manda sobre el alcance y el negocio.

### 0.2 Índice maestro de documentos

| Doc | Carpeta | Contenido | Estado |
|---|---|---|---|
| **00** | raíz | **Plan Maestro** (este documento) | v1.0 |
| 01 | FLUJOS | Flujos comunes `/core` (transversal a los 6 verticales) | v3.3 |
| 02 | FLUJOS | Flujos Quick Service | — |
| 03 | FLUJOS | Flujos Foodtruck | — |
| 04 | FLUJOS | Flujos Full Service | — |
| 05 | FLUJOS | Flujos Café & Bar | — |
| 06 | FLUJOS | Flujos Dark Kitchen | v1.1 |
| 07-1A | ARQUITECTURA | Núcleo multi-tenant (tenants, sucursales, usuarios, turnos, caja, auditoría) | v1.1 |
| 07-1B | ARQUITECTURA | Catálogo, CRM, promociones, inventario | v1.0 |
| 07-1C.1 | ARQUITECTURA | Operación de venta (tickets, items, pagos, descuentos) | v1.0 |
| 07-1C.2 | ARQUITECTURA | Post-venta (devoluciones, cancelaciones, CFDI, delivery, conciliación, sync offline) | v1.0 |
| 07-1D | ARQUITECTURA | Verticales (mesas, cuentas abiertas, multi-marca, reservaciones, propinas) | v1.0 |
| 07-1E | ARQUITECTURA | Reportes consolidados, cierres extendidos, contabilidad operativa | v1.0 |
| 07-1F | ARQUITECTURA | Autenticación, sesiones y JWT (hook, Edge Function PIN, offline) | v1.0 |
| 08 | ARQUITECTURA | Inventario de pantallas para mockups (wireframes) | v1.1 |
| 09 | ARQUITECTURA | Matriz de roles y permisos | — |
| 10 | ARQUITECTURA | Setup inicial (onboarding de un cliente) | v1.1 |
| 11 | GUÍA DE DESARROLLO | Guía de desarrollo (monorepo, migraciones, testing, CI) | v1.0 |
| 12 | ARQUITECTURA | Provisioning y panel de plataforma (super-admin VIM) | v1.0 |
| 13 | ARQUITECTURA | Orquestación del timbrado CFDI (motor, cola, global, CSD) | v1.0 |
| 14 | ARQUITECTURA | Realtime: KDS y comanda en vivo (canales, eventos, auth) | v1.0 |
| 15 | ARQUITECTURA | Operación, seguridad y cumplimiento (backups, observabilidad, LFPDPPP) | v1.0 |
| 16 | ARQUITECTURA | Impresión térmica y cajón de efectivo (ESC/POS, multi-ruta) | v1.0 |
| 17 | raíz | Prerrequisitos y go-live (cuentas, datos, hardware, legal) | v1.0 |
| 18 | GUÍA DE DESARROLLO | Playbook de ejecución (fases, gates, checkpoints, bitácora) — VIVO | v1.0 |
| MOCKUPS | MOCKUPS | 231 pantallas HTML (corregidas) | — |

**Verticales pendientes de documento de flujos propio:** Enterprise (se especifica en Fase 5; hereda del `/core` + Full Service).

---

## 1. Visión y posicionamiento

### 1.1 Qué es VIM POS

**Un punto de venta SaaS, multi-vertical y multi-tenant, diseñado para el restaurantero mexicano**, con facturación CFDI 4.0 nativa y operación offline-first. Un solo producto sirve a seis perfiles de negocio gastronómico distintos compartiendo un núcleo común (`/core`) y activando solo lo específico de cada vertical.

### 1.2 El problema que resuelve

El restaurantero mexicano pequeño y mediano vive entre tres malas opciones: POS extranjeros caros que no entienden el SAT, sistemas locales viejos sin offline ni nube, o el cuaderno y la calculadora. VIM POS ofrece un POS moderno, en español, con CFDI integrado, a un precio accesible y que **no se cae cuando se va el internet** — algo crítico en México.

### 1.3 Diferenciadores

1. **Multi-vertical real:** un mismo motor sirve foodtruck, taquería, restaurante con meseros, café/bar y dark kitchen. No seis productos, uno con módulos.
2. **Offline-first:** la operación no depende de la conexión (Fase 3 con sincronización robusta; ver §8).
3. **CFDI 4.0 nativo:** factura global, timbrado automático, sin salir del POS (Facturama Multiemisor).
4. **Precio mexicano:** desde $399 MXN/mes, con folios CFDI como consumible transparente.
5. **Diseñado desde la operación real:** piloto con Knock-Out Burger antes de vender a terceros.

### 1.4 Quién lo construye

Fermín (VIM Marketing) + Claude Code. Equipo pequeño, lo que disciplina cada decisión hacia simplicidad y mantenibilidad (un solo proyecto Supabase, schema compartido, sin microservicios).

---

## 2. Los 6 verticales

Cada vertical hereda el `/core` y agrega solo lo suyo. El plan que contrata el tenant determina qué vertical y módulos se activan.

| Vertical | Para quién | Agrega sobre el `/core` | Doc |
|---|---|---|---|
| **Foodtruck** | Food trucks, puestos móviles, eventos | Offline robusto, captura ultra-rápida, multi-evento | 03 |
| **Quick Service** | Hamburgueserías, taquerías, pizzerías | Modos de servicio (mostrador/pickup), áreas de cocina, KDS básico | 02 |
| **Café & Bar** | Cafeterías, bares, cantinas | Cuentas abiertas en barra, operación híbrida, happy hour | 05 |
| **Full Service** | Restaurantes con meseros, casual dining | Mesas, mapa de salón, propinas, cuenta por mesero, reservaciones | 04 |
| **Dark Kitchen** | Cocinas fantasma, operadores multi-marca | Marcas virtuales, apps externas (Rappi/Uber/Didi), conciliación, vista unificada de cocina | 06 |
| **Enterprise** | Cadenas, franquiciantes | Multi-sucursal avanzado, reporteo central, franquicias (Fase 5) | — |

El piloto y el MVP se centran en **Quick Service** (Knock-Out Burger).

---

## 3. Filosofía de producto

### 3.1 `/core` + módulos verticales

> **Regla de diseño:** si un flujo o entidad aplica a 2+ verticales de manera idéntica o muy parecida, vive en `/core`. Solo si es estructuralmente distinto, cada vertical lo implementa a su manera.

El `/core` (doc 01) cubre: autenticación, turnos y caja, catálogo, ticket, pago, cocina, cierres X/Z, CFDI, inventario, auditoría. Los módulos verticales solo agregan su pantalla principal de venta, sus KPIs y sus reglas duras.

### 3.2 Principios transversales

1. **Multi-tenant desde el día 1** (aunque MVP use un solo tenant). Ver §5.
2. **Offline-first:** el POS opera sin internet; sincroniza al reconectar (Fase 3 lo hace robusto).
3. **Trazabilidad total:** nada se borra en duro; soft delete + bitácora universal de auditoría.
4. **CFDI como ciudadano de primera:** el modelo fiscal está en el esquema desde el inicio, se activa cuando el tenant lo necesita.
5. **YAGNI disciplinado:** no se infla el esquema ni la UI antes de necesitarlos. Más de 100 decisiones de diseño (D1–D131) documentan cada "por qué".
6. **Español en todo:** naming, UI, documentación. Coherencia con el usuario final y el equipo.

---

## 4. Arquitectura en una página

### 4.1 Stack confirmado

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 15 (Supabase), Row Level Security en todas las tablas |
| Autenticación | Supabase Auth (GoTrue) + Custom Access Token Hook + Edge Function `pin-login` (doc 07-1F) |
| Realtime | Supabase Realtime (selectivo por canal: KDS, comanda) |
| Almacenamiento | Supabase Storage (XML/PDF de CFDI) |
| Cache local / offline | Dexie.js sobre IndexedDB + sincronización por batch (doc 07-1C.2 §10) |
| Frontend | Next.js 15 + TypeScript + Tailwind |
| App nativa / offline robusto | Capacitor (Fase 3; impresión térmica y hardware) |
| Hosting | Vercel |
| Timbrado CFDI | Facturama — Módulo API **Multiemisor** ($0.50/folio) |
| Cobro de suscripción | Stripe (webhooks → estados de tenant) |

### 4.2 Mapa de la arquitectura técnica (doc 07)

```
07-1A  Núcleo multi-tenant ......... tenants, planes, folios, sucursales, cajas,
                                      usuarios, roles, turnos, caja, auditoría
07-1B  Catálogo e inventario ....... productos, modificadores, CRM, promos,
                                      marcas virtuales, insumos, recetas
07-1C.1 Operación de venta ......... tickets, items, pagos, descuentos, promos
07-1C.2 Post-venta ................. devoluciones, cancelaciones, CFDI, delivery,
                                      conciliación apps, comanda, SYNC OFFLINE
07-1D  Verticales .................. mesas (FS), cuentas abiertas (CB),
                                      multi-marca (DK), reservaciones, propinas
07-1E  Reportes y cierres .......... X, Z, cortes, estado de resultados, KPIs
07-1F  Autenticación y JWT ......... 3 identidades, hook, pin-login, offline
```

Cimiento crítico: **el RLS de toda la arquitectura depende del claim `tenant_id` en el JWT**, que se inyecta vía el Custom Access Token Hook (07-1F). Sin él, nada filtra correctamente.

---

## 5. Modelo multi-tenant

### 5.1 Tenancy

VIM POS opera con **multi-tenant de schema compartido** (shared schema, shared database): un solo proyecto Supabase aloja a todos los negocios. Cada fila operativa lleva `tenant_id` como llave de aislamiento, y **Row Level Security** lo aísla a nivel del motor de base de datos.

```
Negocio (tenant)
└── Sucursal (uno o varios puntos físicos)
    └── Caja / Estación POS (dispositivo)
        └── Turno (sesión de trabajo)
            └── Tickets (ventas)
                └── Pagos
```

**Por qué shared schema:** un equipo pequeño mantiene el código; multi-schema multiplicaría migraciones por N tenants; backup, monitoreo y debugging son N veces más simples. Cuando el volumen lo justifique, se particiona por `tenant_id` sin refactor. (Detalle completo: doc 07-1A §1.)

### 5.2 Defensa en profundidad

1. **BD:** RLS aísla físicamente por `tenant_id`.
2. **Servicios:** los repositorios filtran por `tenant_id` de forma redundante.
3. **UI:** el usuario solo ve interfaces de su tenant.

El `service_role` (que ignora RLS) corre exclusivamente en el backend administrado de VIM, nunca en el cliente.

### 5.3 Un tenant por cuenta

Cada cuenta de Supabase Auth pertenece a **un solo tenant** para efectos del JWT (doc 07-1F, D67). En MVP hay un solo tenant activo (Knock-Out); toda la estructura multi ya existe pero no se ejercita aún.

---

## 6. Planes, folios CFDI y add-ons

### 6.1 Suscripción mensual (acceso al software, por vertical)

> ⚠️ **Superado.** Hoy el precio lo fija el tamaño del paquete (Esencial · Negocio · Cadena),
> no la vertical. Ver `vim-pos/docs/decisiones/0002-precios-por-paquete-no-por-vertical.md`.

| Plan | Código | $/mes MXN | Sucursales | Folios base/mes* |
|---|---|---|---|---|
| Foodtruck | FT | 399 | 1 | 30 |
| Quick Service | QS | 999 | 3 | 50 |
| Café & Bar | CB | 999 | 3 | 50 |
| Full Service | FS | 1,299 | 3 | 80 |
| Dark Kitchen | DK | 1,499 | 2 | 80 |
| Enterprise | ENT | 2,499 | ilimitadas | 200 |

\* **Folios base = cuota mensual NO acumulable** (use-it-or-lose-it) incluida en la suscripción. Cubre la factura global periódica + uso ligero, de modo que todo tenant cumple SAT "de fábrica". (Doc 07-1A §3.9, D96.)

### 6.2 Paquetes de folios CFDI (consumible prepagado)

Cuando un tenant agota su base mensual, compra paquetes de folios. **No expiran mientras la suscripción esté activa.** Es utilidad prepagada: costo VIM $0.50/folio (Facturama), sin exposición de margen.

| Paquete | Precio MXN | $/folio | Costo VIM | **Utilidad VIM** |
|---|---|---|---|---|
| 100 folios | 200 | 2.00 | 50 | 150 |
| 250 folios | 450 | 1.80 | 125 | 325 |
| 500 folios | 750 | 1.50 | 250 | 500 |
| 1,000 folios | 1,300 | 1.30 | 500 | 800 |
| 5,000 folios | 5,000 | 1.00 | 2,500 | 2,500 |

**Orden de consumo:** cada timbrado descuenta primero de la base mensual; al agotarla, del saldo de paquetes; si no hay saldo, se bloquea el timbrado individual y la UI obliga a comprar (la factura global tiene tolerancia para no romper cumplimiento). Reglas y ledger: doc 07-1A §3.9.

**Operativa:** folios no expiran con suscripción activa · alertas de saldo bajo · autorecarga opcional.

### 6.3 Add-ons (transversales, sobre cualquier plan)

| Add-on | $/mes MXN | Activa |
|---|---|---|
| Inventario Avanzado | 299 | Costeo avanzado, mermas, multi-almacén |
| CRM Pro | 399 | Lealtad, puntos, segmentación, histórico enriquecido |
| Reservaciones Pro | 249 | Reservaciones calendarizadas + recordatorios (vía WhatsApp Business API, ver §7.4) |
| Analítica | 499 | Dashboards avanzados, exportación, comparativos |

### 6.4 Plan anual

Opción de pago anual con **~17% de descuento** (≈2 meses gratis). Reduce comisiones Stripe (1 cobro/año vs. 12) y mejora el flujo de caja.

---

## 7. Modelo de negocio y unit economics

### 7.1 Ciclo de vida del tenant

```
TRIAL ──contrata──> ACTIVO ──pago vencido >7d──> SUSPENDIDO ──baja──> CANCELADO
                       ▲                              │
                       └──────regulariza pago─────────┘

INTERNO = tenant de uso interno de VIM (Knock-Out en MVP, no paga)
```

El cobro se gestiona vía **Stripe**; sus webhooks actualizan el estado del tenant (doc 07-1A §3).

### 7.2 Estructura de costos

**Costos de plataforma (fijos, se diluyen entre todos los tenants):**

| Concepto | MXN/mes |
|---|---|
| Supabase Pro ($25 USD) | ~450 |
| Vercel Pro ($20 USD) | ~360 |
| Facturama API (módulo anual / 12) | ~138 |
| **Total fijo** | **~948** |

Estos tiers soportan decenas de tenants (un POS genera poca data). Costo marginal por tenant: ~$47 a 20 tenants, ~$19 a 50.

**Costos variables por tenant:**

| Concepto | Monto |
|---|---|
| Comisión Stripe | ~3.6% + $3 MXN + IVA por cobro |
| Folios CFDI | $0.50/folio (cubierto por base + paquetes prepagados) |

### 7.3 Margen de contribución por plan (peor caso: base mensual 100% consumida)

| Plan | Precio | Stripe | Folios base | **Contribución** | % |
|---|---|---|---|---|---|
| Foodtruck | 399 | 20 | 15 | **364** | 91% |
| Quick Service | 999 | 45 | 25 | **929** | 93% |
| Café & Bar | 999 | 45 | 25 | **929** | 93% |
| Full Service | 1,299 | 58 | 40 | **1,201** | 92% |
| Dark Kitchen | 1,499 | 66 | 40 | **1,393** | 93% |
| Enterprise | 2,499 | 108 | 100 | **2,291** | 92% |

La base mensual reducida (30–200 folios) hace que el costo de timbres incluido sea trivial; el grueso del consumo se cubre con paquetes prepagados que son **utilidad, no costo**. Margen de contribución sano (>90%) en todos los planes.

### 7.4 Riesgos de margen y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Excedente de timbres come margen | Resuelto: paquetes prepagados ($1–2/folio sobre costo $0.50) → utilidad |
| Comisión Stripe 12×/año | Plan anual (1 cobro) |
| SMS de Reservaciones Pro caro | Usar **WhatsApp Business API** en vez de SMS |
| Facturama es prepago anual | Bolsa inicial de folios + recarga por umbral |
| Costo de bootstrap | Mientras Knock-Out (INTERNO) sea el único tenant, VIM absorbe ~$948/mes; se vuelve flujo-positivo en Fase 2 con 2 tenants pagando |

---

## 8. Roadmap por fases

Roadmap por **fases** (no por fechas calendario; las fechas se fijan al planear cada fase).

### Fase MVP — Knock-Out Burger (Quick Service)
- Tenant único `INTERNO`, online-first (conexión fija; offline llega en Fase 3).
- `/core` completo: auth (07-1F), turno y caja, catálogo, ticket, pago, cocina, cierres X/Z.
- CFDI básico (factura global + individual vía Facturama).
- Inventario y recetas (módulo opcional, activado para Knock-Out).
- Admin web + POS operativo. KDS básico (el cajero marca listo si no hay pantalla separada).

### Fase 2 — Primeros tenants comerciales
- Tenants Chick'n Go y Camtaritos (flujo-positivo).
- **KDS interactivo** (pantalla de cocina dedicada, tiempos por estación).
- **Impresión térmica** vía Capacitor (red local) — en MVP es WebUSB/PDF.
- Push notifications de eventos críticos.
- Panel super-admin de VIM (en MVP es Supabase Studio / scripts).

### Fase 3 — Offline robusto + Foodtruck
- App con **Capacitor** + sincronización offline robusta (Dexie ↔ sync_procesar_push).
- Vertical **Foodtruck** real (offline es su requisito central).
- Resolución de conflictos de sync con UI de operador.

### Fase 4 — Crecimiento
- Migración desde otros POS (Toast, Square, etc.).
- SSO (Google/Microsoft) para tenants empresariales.
- Multi-PAC (redundancia de timbrado si la confiabilidad lo justifica).

### Fase 5 — Enterprise
- Vertical **Enterprise**: multi-sucursal avanzado, reporteo central, franquicias.
- Roles delegados, permisos personalizados completos.

---

## 9. Alcance del MVP: dentro / fuera

Consolida los "MVP sí / Fase N no" dispersos en los documentos.

### 9.1 Dentro del MVP

- Quick Service completo (Knock-Out)
- Auth con PIN + sesión de dispositivo (07-1F)
- Turnos, caja, sangrías, arqueo, cierres X/Z
- Catálogo: productos, categorías, modificadores, áreas de cocina
- Ticket, pagos (efectivo, tarjeta, transferencia, app, mixto, dividido)
- Descuentos y promociones automáticas
- CFDI 4.0 (global + individual) con folios base + paquetes
- Inventario y recetas (opcional)
- Reportes base + X/Z
- Multi-tenant + RLS (estructura completa, un solo tenant activo)

### 9.2 Fuera del MVP (fase indicada)

- Offline robusto / Capacitor → Fase 3
- KDS interactivo → Fase 2
- Impresión térmica por red local → Fase 2
- Roles personalizados completos / overrides en tabla → Fase 2
- Migración desde otros POS → Fase 4
- SSO → Fase 4
- Multi-PAC → Fase 4
- Vertical Enterprise → Fase 5
- Báscula Bluetooth, app de repartidor avanzada → Fase 2+

---

## 10. Pilotos y criterios de éxito

### 10.1 Pilotos

| Tenant | Vertical | Fase | Rol |
|---|---|---|---|
| Knock-Out Burger (León, GTO) | Quick Service | MVP | Tenant interno, validación operativa real |
| Chick'n Go | Quick Service | Fase 2 | Primer tenant comercial |
| Camtaritos | Quick Service | Fase 2 | Segundo tenant comercial |

### 10.2 Criterios de "listo para vender"

1. Knock-Out opera un día completo de venta real sin caída ni pérdida de tickets.
2. Cierre Z cuadra con el arqueo físico de caja.
3. CFDI (global + individual) se timbra correctamente contra el SAT.
4. Onboarding de un tenant nuevo se completa en autoservicio (doc 10) en < 30 min hasta primera venta.
5. RLS validado: ningún tenant puede leer datos de otro (prueba cross-tenant).

---

## 11. Decisiones globales cerradas

Decisiones transversales al producto y al negocio. Las decisiones técnicas (D1–D131) viven en sus documentos de arquitectura; aquí se listan las **de negocio/alcance**.

| # | Decisión | Doc/§ |
|---|---|---|
| G1 | Multi-tenant shared schema + RLS desde el día 1 | 07-1A §1, D1/D2 |
| G2 | Un solo PAC (Facturama Multiemisor); multi-PAC solo si la confiabilidad lo justifica (Fase 4) | §4.1 |
| G3 | Offline-first; offline robusto con Capacitor en Fase 3 | §8 |
| G4 | Pricing: suscripción por vertical + base mensual de folios no acumulable + paquetes prepagados | §6, D96 |
| G5 | Excedente de timbres es utilidad prepagada (paquetes), no cuota ni cobro sorpresa | §6.2 |
| G6 | Cobro vía Stripe; estados de tenant dirigidos por webhooks | §7.1 |
| G7 | MVP = Quick Service con Knock-Out como tenant interno | §8, §10 |
| G8 | Español en naming, UI y documentación | §3.2 |
| G9 | Equipo pequeño (Fermín + Claude Code) → simplicidad sobre sofisticación | §1.4 |
| G10 | Reservaciones Pro usa WhatsApp Business API, no SMS, para proteger margen | §7.4 |
| G11 | Cada tenant es responsable de los datos de sus clientes; VIM es encargado (procesador) | Doc 15 §C.1, D126 |
| G12 | Backup en 3 capas (diario Pro + pg_dump 6h a R2 + PITR en Fase 2); retención fiscal 5 años | Doc 15 §A, D120/D128 |
| G13 | Tablet POS Android + impresión ESC/POS multi-ruta (red Epson ePOS primaria) | Doc 16, D132/D137 |

---

## 12. Glosario y changelog

### 12.1 Glosario

| Término | Definición |
|---|---|
| Tenant | El negocio cliente del SaaS (ej. Knock-Out Burger). |
| `/core` | Conjunto de flujos y entidades comunes a los 6 verticales. |
| Vertical | Perfil de negocio (QS, FT, FS, CB, DK, ENT) con su módulo específico. |
| Folio CFDI | Timbre fiscal. Base mensual (incluida) + paquetes prepagados. |
| Factura global | CFDI periódico que agrupa las ventas a público en general (sin factura individual). |
| Día contable | Fecha operativa inmutable, asignada al crear; soporta turnos que cruzan medianoche. |
| RLS | Row Level Security de PostgreSQL: aísla filas por `tenant_id`. |
| Multiemisor | Modo de Facturama: una cuenta timbra a nombre de muchos RFC (los tenants). |

### 12.2 Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento raíz inicial. Consolida visión, 6 verticales, filosofía, arquitectura, modelo multi-tenant, pricing (con modelo de folios base + paquetes, D96), unit economics, roadmap por fases, alcance MVP, pilotos y decisiones globales G1–G10. Establece el índice maestro (24 documentos + la carpeta de mockups corregida). |

---

> **Nota final:** este es el documento raíz. Cualquier decisión de alcance, pricing o negocio se registra aquí y se versiona en el changelog. La fuente de verdad operativa es el `/core` (doc 01); la técnica, el doc 07 (1A–1F). Si surge conflicto: el `/core` resuelve lo operativo, el Plan Maestro resuelve lo estratégico.
