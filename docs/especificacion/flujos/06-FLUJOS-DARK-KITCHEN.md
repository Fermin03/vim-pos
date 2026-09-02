# 👻 FLUJOS DEL MÓDULO DARK KITCHEN

## Manual operativo del vertical Dark Kitchen de VIM POS

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v1.1 — pre-desarrollo (correcciones de consistencia)
> Última actualización: Mayo 2026
>
> **Prerrequisito de lectura:** este documento asume que ya leíste `01-FLUJOS-COMUNES-CORE.md` v3. Aquí solo se describe lo que es **específico de Dark Kitchen**.

---

## Propósito de este documento

Este documento describe **solo lo que el vertical Dark Kitchen agrega encima del `/core`**. Dark Kitchen es operativamente el más distinto de todos los verticales porque elimina la atención presencial al cliente: no hay mostrador, no hay mesa, no hay barra. Toda la operación gira alrededor de **preparar pedidos que llegan vía apps de delivery** y entregarlos a repartidores externos.

Los conceptos exclusivos del vertical:

1. **Multi-marca dentro del mismo negocio** — la misma cocina física opera varias marcas virtuales con catálogos distintos
2. **Insumos compartidos entre marcas** — eficiencia operativa real
3. **Canales de venta (apps externas) como concepto central** — Rappi, Uber Eats, Didi son la operación, no un add-on
4. **Pausar/reanudar marca-en-canal** — control granular en tiempo real
5. **Vista unificada de cocina** — todas las marcas en una sola pantalla con prioridad por tiempo
6. **Registro del repartidor que recogió** — auditoría crítica
7. **Conciliación con apps** — flujo riguroso de cuadrar lo capturado vs. lo que cada app reporta

Todo lo demás (catálogo, ticket, inventario con recetas, caja, cierre, etc.) viene del `/core` y no se duplica.

> **Regla:** si buscas algo y no está aquí, está en el `/core`.

---

## Tabla de contenidos

1. [Perfil operativo del vertical](#1-perfil-operativo-del-vertical)
2. [Hereda del /core y agrega lo específico](#2-hereda-del-core-y-agrega-lo-específico)
3. [Marcas virtuales — la entidad central](#3-marcas-virtuales--la-entidad-central)
4. [Canales de venta (apps externas)](#4-canales-de-venta-apps-externas)
5. [Captura manual del pedido (MVP)](#5-captura-manual-del-pedido-mvp)
6. [Vista unificada de cocina](#6-vista-unificada-de-cocina)
7. [Pausar y reanudar marca-en-canal](#7-pausar-y-reanudar-marca-en-canal)
8. [Entrega del pedido al repartidor externo](#8-entrega-del-pedido-al-repartidor-externo)
9. [Delivery propio en Dark Kitchen](#9-delivery-propio-en-dark-kitchen)
10. [Conciliación con apps externas](#10-conciliación-con-apps-externas)
11. [Inventario y recetas en multi-marca](#11-inventario-y-recetas-en-multi-marca)
12. [Modos de servicio aplicables](#12-modos-de-servicio-aplicables)
13. [Subtipos de Personal sugeridos](#13-subtipos-de-personal-sugeridos)
14. [Configuración inicial específica del vertical](#14-configuración-inicial-específica-del-vertical)
15. [KPIs y reportes específicos](#15-kpis-y-reportes-específicos)
16. [Reglas duras específicas del vertical](#16-reglas-duras-específicas-del-vertical)
17. [Arquitectura preparada para integración API futura](#17-arquitectura-preparada-para-integración-api-futura)
18. [Decisiones cerradas del vertical](#-decisiones-cerradas-del-vertical)
19. [Pendientes específicos de Dark Kitchen](#-pendientes-específicos-de-dark-kitchen)

---

## 1. Perfil operativo del vertical

### 1.1 ¿Qué es un Dark Kitchen?

Cocina dedicada a preparar comida que se entrega a domicilio, **sin atención presencial al cliente**. Variantes:

- **Single-brand:** cocina opera una sola marca (ej. "Wings del Barrio") y vende solo por apps
- **Multi-marca / ghost kitchen:** la misma cocina física opera 2-7+ marcas virtuales diferentes (ej. una cocina prepara hamburguesas como "Burger Lab" para una app y bowls saludables como "Green Bowl" para otra)
- **Mixto:** un restaurante tradicional opera además una marca virtual propia para apps

Ejemplos reales del mercado mexicano:

- Operador individual que renta una cocina pequeña y vende wings por Rappi/Uber/Didi
- Cocina mediana de un emprendedor con 3 marcas virtuales (pizzas, hamburguesas, postres)
- Cadena con cocinas dedicadas a delivery (sin local de atención)
- Restaurante existente que lanzó una marca virtual paralela para aumentar ingresos

VIM POS sirve a **todos estos perfiles** con la misma arquitectura.

### 1.2 Características operativas distintivas

| Característica | Valor típico |
|---|---|
| Volumen | 30-500 pedidos/día por cocina (varía mucho) |
| Ticket promedio | $150-$500 MXN |
| Tiempo de preparación | 8-25 min |
| Tiempo de entrega total | 30-60 min (incluyendo viaje del repartidor) |
| Personal | Cocineros, armadores, repartidores (si tiene flotilla propia) |
| Marcas operadas | 1-7 marcas simultáneas en mismo establecimiento |
| Canales | 1-5 apps externas activas + delivery propio opcional |
| Cobro | **NO entra a caja del local** (apps cobran al cliente; concilian con el negocio) |
| Atención al cliente | **Ninguna presencial.** Todo via app |
| Hardware | Tablet en cocina + impresora térmica |

### 1.3 Lo que Dark Kitchen prioriza

1. **Velocidad de captura del pedido entrante** — cada minuto que pierdes en capturar le quita tiempo a la preparación
2. **Vista unificada de TODOS los pedidos por venir** — la cocina necesita ver todo junto, no marca por marca
3. **Tiempos de preparación respetados** — las apps penalizan retrasos (suspensión temporal del listing, peor visibilidad)
4. **Identificación clara de qué empacar para qué marca** — error frecuente que daña la reputación
5. **Registro del repartidor que recogió** — auditoría crítica para disputas
6. **Conciliación rigurosa** con cada app — el negocio debe cuadrar exactamente
7. **Control de pausar/reanudar** — cuando la cocina se satura, debes poder detener entradas selectivamente

### 1.4 Lo que Dark Kitchen NO necesita en MVP

- Sistema de mesas, cuenta abierta, división, propinas en mesa — no hay clientes presenciales
- Mapa de salón
- Hostess o waitlist
- CRM del cliente final (lo gestiona la app, el negocio no tiene contacto directo)
- Captura presencial al mostrador
- Cobro en caja por venta — no hay venta directa al consumidor final
- **Integración API automática con apps** (en MVP es captura manual; ver §17 para arquitectura futura)

---

## 2. Hereda del `/core` y agrega lo específico

### 2.1 Lo que Dark Kitchen hereda tal cual del `/core`

| Área | Sección del /core |
|---|---|
| Conceptos base, jerarquía, estados, numeración consecutiva | 1 |
| Roles base (Dueño, Admin, Supervisor, Cajero, Personal) | 2 |
| Autenticación con PIN | 3 |
| Entidades Producto, Categoría, Modificadores, Notas | 4 |
| Cliente (estructura base; aplica diferente, ver §5) | 5 |
| Catálogo de modos de servicio | 6 |
| Apertura de turno (aplicable aunque sin caja física activa, ver §1.2) | 7 |
| Cambio de cajero/operador | 8 |
| Notas al pedido y a cocina | 11 |
| Pedidos paralelos / "en espera" | 12 |
| Cancelación de pedido | 13 |
| Descuentos (raramente usados, las apps controlan promociones) | 14 |
| Devoluciones (raramente; las gestiona la app) | 15 |
| Edición post-cobro | 16 |
| Pago y métodos (con tratamiento especial, ver §10) | 17 |
| Ticket no fiscal del MVP (CFDI fase final) | 18 |
| Comanda y áreas de cocina | 19 |
| **Estado de cocina del ticket** (estados extendidos, ver §6) | 20 |
| Entrega al cliente (entrega al repartidor en este vertical, ver §8) | 21 |
| **Delivery propio completo** (módulo opcional para cocinas con flotilla, ver §9) | 22 |
| **Apps externas — captura manual base** (extendida masivamente en este vertical, ver §4 y §5) | 23 |
| Cierre de turno | 24 |
| Cierre de día Z | 25 |
| Contingencias | 26 |
| Auditoría | 27 |
| Configuración del negocio | 28 |
| Reportes base | 29 |
| Subtipos de Personal | 30 |
| Inventario y recetas (**imprescindible**, ver §11) | 31-37 |

### 2.2 Lo que Dark Kitchen agrega específicamente

Las funcionalidades únicas del vertical:

1. **Marcas virtuales** (§3) — entidad nueva, cada negocio tiene 1-N marcas
2. **Canales de venta activos por marca** (§4) — qué apps externas opera cada marca
3. **Captura manual robusta del pedido** (§5) — extensión completa de la captura manual del `/core` §23
4. **Vista unificada de cocina** (§6) — la pantalla más importante del vertical
5. **Pausar/reanudar marca-en-canal** (§7) — granularidad fina
6. **Registro del repartidor que recogió** (§8) — auditoría
7. **Conciliación con apps externas** (§10) — flujo riguroso
8. **Reportes específicos** (§15) — por marca, por canal, ROI por combinación

### 2.3 Sobre la caja física en Dark Kitchen

Algo importante: aunque no haya cobro directo al cliente final, **sí se mantiene el concepto de turno y caja física** del `/core` §7. ¿Para qué?

- Registrar el turno de operación (quién operó, cuándo)
- Gestionar gastos eventuales (compra de empaque urgente, propina al repartidor, etc.) vía sangrías
- Manejar pago de **delivery propio** si está activo (pago al recibir cae en caja)
- Mantener trazabilidad operativa del día

La caja **siempre arranca con fondo $0** si no hay actividad de efectivo. Si la cocina maneja efectivo (raramente), el fondo se captura normalmente.

---

## 3. Marcas virtuales — la entidad central

### 3.1 ¿Qué es una marca en Dark Kitchen?

Una **marca** es una identidad comercial bajo la cual la cocina vende. Tiene:

- Nombre comercial visible al cliente final (en la app)
- Logo y branding
- Catálogo propio de productos
- Listing activo en una o varias apps externas
- Empaque propio (cajas, bolsas, etiquetas)
- Reportes propios de ventas y rentabilidad

Una cocina puede operar **una sola marca** (caso simple) o **varias marcas** que comparten la cocina física y eventualmente insumos.

### 3.2 Estructura de marca

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre comercial | Texto | Sí | "Wings del Barrio", "Burger Lab", "Green Bowl" |
| Tipo de cocina | Catálogo: hamburguesas / pizzas / asiática / mexicana / saludable / postres / otro | No | Para reportes y filtros |
| Logo / imagen | Imagen | No | Para impresión de tickets/comandas y reportes |
| Estado | Activa / Pausada / Archivada | Sí | Default: Activa |
| Tiempo estimado de preparación base | Minutos | No | "Esta marca tarda 12 min promedio" |
| Empaque designado | Texto descriptivo | No | "Caja roja con logo Wings" |
| Notas internas | Texto | No | Observaciones del operador |

### 3.3 Catálogo por marca

Cada marca tiene **su propio catálogo de productos** que se muestra al cliente final. Esto es importante:

- "Wings del Barrio" vende sus 10 productos en su menú visible en Rappi
- "Burger Lab" vende sus 8 hamburguesas en SU menú visible en Rappi
- Ambas son la misma cocina, pero los menús que el cliente final ve son completamente distintos

En la práctica, esto significa:
- Cada producto vive en una marca específica (FK marca_id)
- Las categorías también pueden ser por marca (o compartidas si tiene sentido)
- Los modificadores aplican a productos de la marca

### 3.4 Insumos compartidos entre marcas

> **Decisión clave del vertical:** los productos son por marca, pero **los insumos son compartidos**.

Razón operativa: la salsa BBQ que usa "Wings del Barrio" en sus alitas es la misma salsa BBQ que usa "Burger Lab" en su hamburguesa BBQ. Tienen sentido económico y operativo:

- Una sola compra de salsa BBQ alimenta a ambas marcas
- Un solo stock que rota y se gestiona
- Reportes precisos de "cuánto salsa BBQ se consumió hoy en todas las marcas combinadas"

**Implicaciones técnicas (extensión del `/core` Parte IX):**

- La tabla `insumos` NO tiene FK a marca — son universales del negocio
- La tabla `recetas` tiene FK a producto, y el producto tiene FK a marca
- Cuando se vende un producto de cualquier marca, los insumos se descuentan del stock único
- Los reportes pueden filtrarse por marca (cuánto se vendió en Marca A) o por insumo (cuánto consumimos de salsa BBQ en total)

### 3.5 UX de catálogo multi-marca

En el panel admin, al gestionar el catálogo, el admin elige primero la marca:

```
┌─────────────────────────────────────────────────┐
│   CATÁLOGO — Negocio Dark Kitchen León          │
├─────────────────────────────────────────────────┤
│   Marca activa:                                 │
│   [ 🟢 Wings del Barrio ▼ ]                     │
│   [ 🟢 Burger Lab        ]                      │
│   [ 🟡 Green Bowl (pausada en Uber) ]           │
│   [ 🟢 Postre Express    ]                      │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Productos de "Wings del Barrio":              │
│                                                 │
│   • Combo 10 alitas BBQ        $215             │
│   • Combo 10 alitas BBQ extra  $245             │
│   • Combo 6 alitas mixtas      $145             │
│   • Boneless 12 piezas          $185             │
│   • Papas con queso             $75             │
│   • Refresco                    $35             │
│                                                 │
│   [ + Agregar producto a esta marca ]           │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Insumos (compartidos entre marcas):           │
│   [ Ver / Editar insumos del negocio → ]        │
└─────────────────────────────────────────────────┘
```

### 3.6 Reglas de marcas

- Un negocio Dark Kitchen tiene **mínimo 1 marca** (no puede existir sin al menos una)
- El número máximo es flexible, pero por UX se recomienda hasta 7-10 marcas
- Cada marca puede estar en estado **Activa, Pausada o Archivada**
- "Pausada" significa que no opera en NINGUNA app temporalmente (apagón total de la marca)
- Para pausar solo en una app específica, ver §7 (granularidad fina)
- Una marca archivada conserva su histórico pero ya no opera

---

## 4. Canales de venta (apps externas)

### 4.1 ¿Qué es un canal?

Un **canal** es una plataforma a través de la cual una marca recibe pedidos. Los principales en México:

| Canal | Cobertura | Comisión típica |
|---|---|---|
| **Rappi** | Nacional, líder | 25-30% |
| **Uber Eats** | Nacional, fuerte | 25-30% |
| **Didi Food** | Crecimiento | 20-28% |
| **iFood** | Limitada en México | Varía |
| **Otros** | Plataformas regionales o propias | Varía |
| **Delivery propio** | Flotilla propia del negocio | 0% (pero costo de flotilla) |
| **WhatsApp** | Pedidos por mensaje directo | 0% |

### 4.2 Relación marca × canal

Una marca puede estar activa en múltiples canales. El sistema modela esta relación N:M:

```
Wings del Barrio  ─→  Rappi
                  ─→  Uber Eats
                  ─→  Didi Food
                  ─→  Delivery propio

Burger Lab        ─→  Rappi
                  ─→  Uber Eats
                  (NO está en Didi)

Green Bowl        ─→  Rappi (pausada hoy)
                  ─→  Uber Eats

Postre Express    ─→  Rappi
```

Cada combinación marca-canal tiene su propio estado: Activa, Pausada, Sin listing.

### 4.3 Configuración de cada combinación marca-canal

```
┌─────────────────────────────────────────────────┐
│   CONFIGURAR: Wings del Barrio en Rappi         │
├─────────────────────────────────────────────────┤
│   Estado: 🟢 Activa                             │
│                                                 │
│   Folio del listing en Rappi:                   │
│   [ 8472635                              ]      │
│                                                 │
│   Comisión que cobra Rappi:                     │
│   [ 27 ] %                                      │
│                                                 │
│   Tiempo estimado de preparación:               │
│   [ 12 ] minutos                                │
│   (Rappi muestra este valor al cliente)         │
│                                                 │
│   Tiempo máximo permitido por la app:           │
│   [ 25 ] minutos                                │
│   (si nos pasamos, sanción)                     │
│                                                 │
│   Diferencia de precio en app vs. real:         │
│   [✓] Aplicar +20% a precios del listing        │
│   (compensa parte de la comisión)               │
│                                                 │
│   Métodos de pago aceptados por Rappi:          │
│   [✓] Tarjeta (cliente paga en app)             │
│   [✓] Efectivo (cliente paga al repartidor)     │
│                                                 │
│   Notas: [_____________________________________ │
│                                                 │
│         [ Cancelar ]    [ Guardar ]             │
└─────────────────────────────────────────────────┘
```

### 4.4 Diferencia de precio en app vs. precio real

Casi todos los Dark Kitchens **inflan los precios en apps** para compensar parcialmente la comisión. Ejemplos:

- Producto interno: precio normal $100
- En Rappi: el menú muestra $120 al cliente (+20%)
- Cliente paga $120 a Rappi → Rappi cobra 27% comisión = $32.40
- Neto que recibe el negocio: $87.60
- Sin el +20%, hubiera sido: $100 − $27 = $73

El sistema soporta esto: el admin define el % de incremento por canal y los precios mostrados al cliente se calculan automáticamente. **El precio interno del producto se mantiene** (es el precio "real" para reportes de margen).

### 4.5 Reglas de canales

- Un canal solo opera si está en el catálogo de modos de servicio activos del negocio (`/core` §6.2)
- Cada combinación marca-canal puede pausarse independientemente (§7)
- El folio del listing en cada app es crítico para conciliación (§10)
- La comisión configurada se usa para reportes de rentabilidad real, no para cobro al cliente (eso lo hace la app)

---

## 5. Captura manual del pedido (MVP)

> **Decisión del MVP:** captura manual robusta sin integración API. La integración con apps externas vendrá en Fase 2+. La arquitectura está preparada (§17), pero el MVP opera 100% manual.

### 5.1 ¿Cómo llega el pedido al operador?

Realidad operativa actual del Dark Kitchen sin integración:

1. La cocina tiene una tablet/teléfono dedicado por cada app (proveído por la app misma)
2. Cuando entra un pedido, la app suena en ese dispositivo
3. El operador ve el pedido en la app
4. El operador **captura manualmente** el pedido en VIM POS
5. La cocina prepara
6. Repartidor de la app recoge

VIM POS no reemplaza las tablets de las apps en MVP. Las complementa siendo el sistema central donde se reflejan todos los pedidos para gestión coherente, inventario, reportes y conciliación.

### 5.2 Pantalla de captura de pedido nuevo

El operador toca "Nuevo pedido" en la pantalla principal:

```
┌─────────────────────────────────────────────────┐
│   NUEVO PEDIDO ENTRANTE                         │
├─────────────────────────────────────────────────┤
│   ¿De qué canal viene?                          │
│                                                 │
│   [ 🛵 Rappi      ] [ 🛵 Uber Eats ]            │
│   [ 🛵 Didi Food  ] [ 🛵 Otro app  ]            │
│   [ 🚚 Delivery propio ] [ 💬 WhatsApp ]        │
│                                                 │
│   ¿Para qué marca?                              │
│                                                 │
│   ( ) Wings del Barrio                          │
│   ( ) Burger Lab                                │
│   ( ) Green Bowl                                │
│   ( ) Postre Express                            │
│                                                 │
│   ⚠️ Wings del Barrio está pausada en Uber Eats │
│                                                 │
│         [ Cancelar ]    [ Continuar ]           │
└─────────────────────────────────────────────────┘
```

Tras seleccionar canal y marca, aparece la pantalla de captura del pedido.

### 5.3 Pantalla de captura — productos

```
┌─────────────────────────────────────────────────┐
│   PEDIDO — Rappi → Wings del Barrio             │
├─────────────────────────────────────────────────┤
│   Folio Rappi: [ R-A4F92B            ]          │
│   ⏰ Hora del pedido: [ 14:23 ]                  │
│   ⏰ Hora máxima entrega: [ 14:48 ] (25 min)     │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Productos del pedido:                         │
│                                                 │
│   [ + Agregar producto ]                        │
│                                                 │
│   Captura como cualquier ticket de venta:       │
│   • Combo 10 alitas BBQ        $215             │
│   • Refresco                    $35             │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Datos del cliente (visibles en la app):       │
│   Nombre: [ María L.                  ]         │
│   Tel:    [ — ] (oculto por Rappi)              │
│                                                 │
│   Notas del cliente (visibles en app):          │
│   [ Sin cebolla, salsa picante aparte       ]   │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Datos del cobro:                              │
│   Total (en app): $300.00                       │
│   Método de pago: ( ) Tarjeta (ya pagó)         │
│                   (•) Efectivo (cobra repartidor)│
│   Comisión Rappi estimada (27%): -$81.00        │
│   Neto estimado para el negocio: $219.00        │
│                                                 │
│         [ Cancelar ]    [ Confirmar pedido ]    │
└─────────────────────────────────────────────────┘
```

### 5.4 Confirmación e impresión

Al confirmar:

1. Ticket se crea con todos los datos
2. Estado del ticket pasa a `PAGADO` (la app cobra al cliente final, internamente lo consideramos pagado)
3. Estado de cocina pasa a `EN_COCINA`
4. Insumos se descuentan automáticamente (módulo de inventario activo)
5. Se imprime **comanda de cocina** con etiqueta clara:

```
═══════════════════════════════════
   📥 PEDIDO RAPPI
   📌 Wings del Barrio
═══════════════════════════════════
   Folio interno:  K-2026-002847
   Folio Rappi:    R-A4F92B
   Cliente:        María L.
   Recibido:       14:23
   ⏰ ENTREGAR:    14:48 (25 min)
   
   ───────────────────────────────
   1x Combo 10 alitas BBQ
      - Sin cebolla
      - Salsa picante aparte
   
   1x Refresco
   ───────────────────────────────
   
   NOTAS:
   Sin cebolla, salsa picante aparte
═══════════════════════════════════
```

La comanda lleva claramente:
- A qué marca pertenece (etiqueta grande arriba)
- De qué app vino
- Folio interno + folio externo (para conciliación)
- Hora máxima de entrega (visible en grande para que cocina priorice)

### 5.5 Captura rápida vs. captura detallada

Para volúmenes altos, el sistema permite dos modos:

**Modo rápido:**
- Solo lo esencial: canal, marca, productos, folio externo, hora máxima
- Datos del cliente y notas se capturan después si se necesita
- Óptimo para horas pico

**Modo detallado:**
- Todo incluido desde el inicio
- Óptimo para volúmenes bajos o capturas tranquilas

El admin puede configurar cuál es el default.

### 5.6 Edición de pedido capturado

Si la app modifica el pedido (cliente agregó algo, canceló algo, cambió dirección):

- El operador busca el pedido por folio externo
- Edita aplicando los cambios
- El sistema mantiene histórico del cambio en bitácora
- Si la comanda ya se imprimió, se imprime una **comanda de modificación** clara: "MODIFICACIÓN — Pedido R-A4F92B — agregar 1x Refresco extra"

### 5.7 Cancelación desde la app

Si el cliente cancela el pedido en la app:

- El operador busca el pedido por folio externo
- Selecciona "Cancelar"
- Sistema marca como `CANCELADO` con motivo "Cancelado por cliente desde [app]"
- Si la cocina ya empezó a preparar, alerta visible para detener
- Insumos se reintegran al stock si la preparación no había avanzado significativamente

### 5.8 Reglas de captura

- El **folio externo de la app es obligatorio** (`/core` §23.4 — confirmado en este vertical)
- Cada pedido vive en una sola marca-canal (no se permite cambiar después)
- El precio capturado debe coincidir con lo que la app reporta (validar para evitar errores de captura)
- Notas del cliente son críticas (alergias, instrucciones especiales) — imprimirlas siempre en negritas

---

## 6. Vista unificada de cocina

> Esta es la pantalla más distintiva del vertical. Es donde sucede la operación real día a día.

> **Aclaración importante:** esta pantalla **NO es un KDS interactivo** (Kitchen Display System en sentido estricto, con funcionalidades avanzadas como ruteo dinámico de platillos entre estaciones, ajuste fino de tiempos por receta, etc. — eso se difiere a Fase 2 en QS, Full Service y Café & Bar). Esta es una **vista de cola ordenada por tiempo restante**, más simple pero específicamente diseñada para la operación multi-marca multi-canal de Dark Kitchen, donde la prioridad absoluta es no exceder los deadlines que cada app impone.

### 6.1 ¿Por qué unificada?

La cocina física es UNA. Los pedidos llegan de N marcas × M canales. Si la pantalla muestra cada marca por separado, el cocinero pierde tiempo cambiando entre vistas y pierde la perspectiva global de "qué urge más".

**Decisión:** una sola pantalla con TODOS los pedidos en curso, ordenados por **tiempo restante hasta deadline**.

### 6.2 Diseño de la pantalla

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  COCINA — DARK KITCHEN LEÓN                                  ⚙ Pausar canal │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  🔴 URGENTE — entregar pronto                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 03:42 ⚠️ R-A4F8X  [Rappi]                                            │    │
│  │ 🍔 BURGER LAB                                                        │    │
│  │ • Hamburguesa Clásica con tocino x2                                  │    │
│  │ • Papas grandes x1                                                   │    │
│  │ Notas: Sin cebolla                                                   │    │
│  │ [ Marcar LISTO ]                                                     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  🟡 EN PROGRESO — tiempo normal                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 09:15  R-B9M2K  [Rappi]                                              │    │
│  │ 🐔 WINGS DEL BARRIO                                                  │    │
│  │ • Combo 10 alitas BBQ + Refresco                                     │    │
│  │ • Boneless 12 pzas                                                   │    │
│  │ Notas: Salsa aparte                                                  │    │
│  │ [ Marcar LISTO ]                                                     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 12:48  UE-77J3  [Uber Eats]                                          │    │
│  │ 🥗 GREEN BOWL                                                        │    │
│  │ • Bowl quinoa-pollo + Aderezo balsámico                              │    │
│  │ [ Marcar LISTO ]                                                     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 14:22  D-3JK7B  [Didi Food]                                          │    │
│  │ 🍔 BURGER LAB                                                        │    │
│  │ • Hamburguesa BBQ Doble x1                                           │    │
│  │ • Refresco                                                           │    │
│  │ [ Marcar LISTO ]                                                     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────       │
│  🟢 LISTOS — esperando repartidor                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ ✓ R-K9F2L  Wings del Barrio  Listo hace 1:23  [Rappi]                │    │
│  │ ✓ UE-3B7M  Burger Lab        Listo hace 0:48  [Uber Eats]            │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│  Resumen: 4 en cocina · 2 listos · 3 entregados · 0 cancelados              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Mecánica del countdown

Cada pedido muestra su **tiempo restante** hasta la hora máxima de entrega configurada. Cálculo:

```
Tiempo restante = Hora máxima de entrega − Hora actual
```

Colores según urgencia:

| Tiempo restante | Color | Significado |
|---|---|---|
| > 10 min | Verde | Tiempo normal |
| 5-10 min | Amarillo | Atención |
| 0-5 min | Rojo | URGENTE — entregar pronto |
| Negativo (pasado) | Rojo intermitente ⚠️ | EXCEDIDO — sanción posible |

El orden automático en pantalla es de **menor tiempo restante a mayor** (los más urgentes arriba).

### 6.4 Etiquetas visuales por marca

Cada tarjeta de pedido lleva claramente:
- **Color/emoji por marca** (configurable por el admin al crear la marca)
- **Nombre de la marca grande**
- **Logo pequeño del canal** (Rappi/Uber/Didi)

Esto permite que la cocina identifique de un vistazo qué empaque preparar y qué marca cobrar.

### 6.5 Acciones disponibles desde la pantalla de cocina

Tap en una tarjeta abre opciones:

- **Marcar LISTO** — pasa a estado `LISTO` y se mueve a la sección verde
- **Ver detalle completo** — abre el ticket completo del `/core`
- **Reimprimir comanda** — útil si se perdió o manchó
- **Agregar nota a cocina** — observación interna ("falta tocino, usar carne sola")
- **Reportar problema** — escala al supervisor

### 6.6 Configuración de la vista

El admin puede ajustar:

- **Mostrar pedidos entregados:** sí / no (puede ocultar para minimizar ruido)
- **Tiempo a partir del cual se considera URGENTE:** default 5 min, configurable
- **Tamaño de fuente:** grande (cocina con poca visibilidad) / normal
- **Modo oscuro/claro:** preferencia visual
- **Filtros temporales:** ver solo pedidos de cierta marca o canal si lo prefiere

### 6.7 Pantalla secundaria de cocina (opcional)

Algunos Dark Kitchens tienen una TV grande en la cocina mostrando esta pantalla mientras el operador usa una tablet para capturar. VIM POS soporta abrir esta vista en una pantalla secundaria (basta con abrir la URL en otro dispositivo y logueado con permisos de cocina).

### 6.8 Reglas

- La pantalla es accesible para roles **Cocinero, Ayudante, Supervisor, Admin, Dueño**
- Solo Cocinero o superior pueden marcar pedidos como LISTO
- Cancelaciones se hacen desde el detalle del ticket (no desde esta pantalla)
- La pantalla se actualiza en tiempo real (heredado del `/core` con Supabase Realtime)

---

## 7. Pausar y reanudar marca-en-canal

### 7.1 ¿Por qué pausar?

Casos reales donde el operador necesita pausar la entrada de pedidos:

- **Cocina saturada:** no se da abasto, llega más pedidos de los que puede preparar a tiempo
- **Falta de insumo crítico:** se acabó la salsa BBQ; no se pueden preparar las wings esa marca
- **Personal reducido:** cocinero principal salió, capacidad temporal limitada
- **Problema técnico:** se descompuso la freidora; productos fritos no se pueden hacer
- **Cambio de turno:** durante 30 min hay menos personal

**Importante:** "pausar" en VIM POS significa **dejar de aceptar nuevos pedidos** de esa combinación. Los pedidos ya en cocina continúan normalmente.

### 7.2 Granularidad disponible

VIM POS soporta dos niveles de granularidad (decisión cerrada: ambas, P4 del diálogo de diseño):

| Granularidad | Caso |
|---|---|
| **Marca-en-canal** | "Pausar Wings del Barrio en Rappi por 1 hora" (la marca sigue activa en Uber y Didi, solo Rappi se detiene) |
| **Producto-en-canal** | "Pausar combo de wings con queso en Rappi" (solo ese producto deja de ofrecerse; el resto del menú sigue) |

Adicionalmente:
- **Marca completa:** desactivar en TODOS los canales simultáneamente
- **Producto completo:** desactivar en TODOS los canales (equivalente a marcar como agotado del `/core` §4.6)

### 7.3 UX para pausar

Pantalla "Estado de canales" accesible desde la cabecera de la app:

```
┌─────────────────────────────────────────────────┐
│   ESTADO DE CANALES                             │
├─────────────────────────────────────────────────┤
│   Marca: [ Wings del Barrio ▼ ]                 │
│                                                 │
│   Canales activos para esta marca:              │
│                                                 │
│   🟢 Rappi          [ Pausar ▼ ]                │
│   🟡 Uber Eats — pausada hasta 15:30            │
│      [ Reanudar ahora ]                         │
│   🟢 Didi Food      [ Pausar ▼ ]                │
│   🟢 Delivery propio[ Pausar ▼ ]                │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   Productos pausados en canales específicos:    │
│                                                 │
│   • Combo wings queso → pausado en Rappi        │
│     [ Reanudar ]                                │
│                                                 │
│   • Boneless premium → pausado en Uber Eats     │
│     [ Reanudar ]                                │
│                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│   [ + Pausar marca completa ]                   │
│   [ + Pausar producto específico ]              │
└─────────────────────────────────────────────────┘
```

### 7.4 Configuración de la pausa

Cuando el operador toca "Pausar":

```
┌─────────────────────────────────────────────────┐
│   PAUSAR Wings del Barrio en Rappi              │
├─────────────────────────────────────────────────┤
│   Duración:                                     │
│   ( ) 15 minutos                                │
│   ( ) 30 minutos                                │
│   ( ) 1 hora                                    │
│   ( ) 2 horas                                   │
│   (•) Hasta nuevo aviso                         │
│                                                 │
│   Motivo:                                       │
│   ( ) Cocina saturada                           │
│   ( ) Insumo agotado                            │
│   ( ) Falta personal                            │
│   ( ) Problema técnico                          │
│   ( ) Otro: [______________________]            │
│                                                 │
│   ⚠️ La pausa solo se refleja en VIM POS. Debes │
│   ALSO pausar manualmente en el panel de Rappi  │
│   (la app no se entera del estado en VIM POS)   │
│                                                 │
│         [ Cancelar ]    [ Pausar ]              │
└─────────────────────────────────────────────────┘
```

### 7.5 Limitación importante (sin integración API)

> **Limitación crítica del MVP:** la pausa en VIM POS es **interna**, no se refleja en la app externa. El operador debe pausar manualmente también en el panel de Rappi/Uber/Didi.

Sin embargo, marcar la pausa en VIM POS es valioso porque:

- Si por error entra un pedido durante la pausa, el sistema lo identifica con alerta
- Quedan registros para reportes ("pausamos Rappi 3 veces esta semana por cocina saturada")
- Cuando la integración API llegue (Fase 2+, ver §17), la pausa se sincronizará automáticamente

### 7.6 Pedido que entra durante la pausa

Caso: cocina pausó Rappi en VIM POS, pero olvidó pausar en el panel de Rappi y entra un pedido:

- Operador intenta capturar el pedido como nuevo
- Sistema avisa: "⚠️ Wings del Barrio está pausada en Rappi. ¿Capturar de todas formas?"
- Operador puede aceptar (el pedido entra) o cancelar y rechazar manualmente en Rappi
- Queda registro de la inconsistencia para auditoría

### 7.7 Reglas

- Solo Supervisor o superior puede pausar canales (configurable)
- Toda pausa queda en bitácora con motivo, duración y autor
- Las pausas con duración fija se reanudan automáticamente al cumplir el tiempo
- Las pausas "hasta nuevo aviso" requieren acción manual para reanudar
- Reanudar antes de tiempo se permite sin restricción
- El sistema NO modifica los listings de las apps externas (sin integración API)

---

## 8. Entrega del pedido al repartidor externo

### 8.1 ¿Quién recoge?

El repartidor de la app externa llega al local cuando el pedido está LISTO. Este repartidor:

- NO es empleado del negocio (es de Rappi, Uber, Didi o repartidor independiente afiliado)
- Tiene su propia app con la información del pedido
- Suele identificarse mostrando la pantalla de la app o un código

VIM POS no tiene contacto directo con el repartidor (sin integración API), pero **sí registra qué repartidor recogió qué pedido** para auditoría.

### 8.2 Flujo de entrega al repartidor

**Paso 1.** El pedido está LISTO. Aparece en la sección verde de la pantalla de cocina (§6.2).

**Paso 2.** Repartidor llega al local. Muestra al operador la información de la app: "Pedido R-A4F92B para Wings del Barrio".

**Paso 3.** Operador verifica que el empaque correcto del pedido esté listo (revisa folio, marca, productos).

**Paso 4.** Operador toca "Entregar al repartidor" en el pedido:

```
┌─────────────────────────────────────────────────┐
│   ENTREGAR AL REPARTIDOR                        │
├─────────────────────────────────────────────────┤
│   Pedido: R-A4F92B (Rappi)                      │
│   Marca: Wings del Barrio                       │
│   Cliente: María L.                             │
│                                                 │
│   Verificación de empaque:                      │
│   [✓] Productos completos                       │
│   [✓] Empaque correcto de Wings del Barrio      │
│   [✓] Salsas/extras incluidos                   │
│   [✓] Servilletas y cubiertos                   │
│                                                 │
│   Datos del repartidor (opcional pero recomenda-│
│   do para auditoría):                           │
│                                                 │
│   Nombre / ID: [ Juan P.                ]       │
│                                                 │
│   ¿Es pago al recibir? ( ) Sí (•) No (ya pagó) │
│                                                 │
│         [ Cancelar ]    [ Entregar ]            │
└─────────────────────────────────────────────────┘
```

**Paso 5.** Sistema marca el pedido como `ENTREGADO_DOMICILIO` (estado heredado del `/core` §20.2), aunque técnicamente sea "entregado al repartidor" — el cliente final lo recibe minutos después por mediación del repartidor.

### 8.3 Registro del repartidor

Capturar el nombre o ID del repartidor es **opcional pero altamente recomendado**. Para qué sirve:

- **Disputas con la app:** si el cliente reclama que nunca recibió, tienes registro de quién lo recogió
- **Auditoría de productos faltantes:** si las apps reportan que llegaron productos faltantes, puedes correlacionar con repartidores específicos
- **Reportes de tiempos:** cuánto tiempo entre listo y entregado al repartidor

El registro acepta:
- Nombre del repartidor (lo que diga visiblemente)
- ID/folio del repartidor (si la app lo muestra)
- Foto opcional (Fase 2)

### 8.4 Pago al recibir (raro en apps)

Algunos pedidos por app permiten pago en efectivo al repartidor:

- El cliente eligió "Efectivo" en la app
- La app le indica al repartidor cuánto cobrar
- El repartidor cobra al cliente y entrega al negocio (después)

Para Dark Kitchen, esto no afecta directamente la operación del POS:
- El pedido se marca como ENTREGADO_DOMICILIO al recibirlo el repartidor
- La conciliación con la app captura si fue pago en efectivo o no (§10)

### 8.5 Reglas

- Toda entrega al repartidor cambia el estado del pedido a `ENTREGADO_DOMICILIO`
- El registro del repartidor (nombre/ID) es opcional pero queda en bitácora para auditoría
- Si el operador olvida marcar la entrega, el pedido queda "listo" indefinidamente y aparece como alerta
- El sistema **NO valida** que el repartidor sea legítimo (sin integración API). Confía en el operador.

---

## 9. Delivery propio en Dark Kitchen

### 9.1 Cuándo aplica

Algunas cocinas Dark Kitchen tienen también flotilla propia, para:

- Pedidos directos por WhatsApp/teléfono del propio negocio (sin comisión de app)
- Suplir a las apps en horas pico
- Tener canal de respaldo cuando una app falla

### 9.2 Reúso del módulo Delivery Propio del `/core`

Todo el flujo de delivery propio está documentado en el `/core` §22:

- Asignar repartidor propio
- Pago al recibir o pago anticipado
- Estado EN_RUTA → ENTREGADO_DOMICILIO
- Tracking de tiempos

En Dark Kitchen, el delivery propio se integra a la vista unificada de cocina (§6) como un canal más. Aparecen pedidos del canal "Delivery propio" mezclados con los de apps externas.

### 9.3 Diferencia visual

Los pedidos de delivery propio se identifican con:
- Icono distinto al de apps externas (ej. 🚚 en lugar de 🛵)
- Color de fondo ligeramente distinto en la tarjeta
- En lugar de "entregar al repartidor [app]", muestra "asignar repartidor propio"

### 9.4 Flujo específico del delivery propio en Dark Kitchen

Igual al del `/core` §22, con dos adaptaciones:

1. **El pedido se captura sin app externa** — el cliente llamó/escribió por WhatsApp y tomó la orden el operador
2. **El cobro puede ir a caja** — si el cliente paga al recibir en efectivo, ese efectivo SÍ entra al negocio (a diferencia de los pedidos de apps externas)

### 9.5 Reglas

- Delivery propio es módulo opcional (`/core` §28.2.bis), activable por el negocio
- En Dark Kitchen es común activarlo como complemento; en cocinas pequeñas suele desactivarse
- El reparto y todo el flujo es el del `/core` §22

---

## 10. Conciliación con apps externas

> Este flujo es **crítico** en Dark Kitchen. Las apps cobran al cliente, retienen su comisión y depositan al negocio. Si el negocio no concilia rigurosamente, pierde dinero.

### 10.1 ¿Qué significa conciliar?

Cuadrar lo que el negocio capturó en VIM POS contra lo que cada app reporta como ventas, comisiones y depósitos.

### 10.2 Periodicidad

Cada app reporta en distintas frecuencias:

| App | Frecuencia típica de reporte | Frecuencia típica de depósito |
|---|---|---|
| **Rappi** | Diario o semanal | Semanal/quincenal |
| **Uber Eats** | Semanal | Semanal |
| **Didi Food** | Semanal | Semanal |
| **iFood** | Semanal | Quincenal |

El negocio recibe estados de cuenta detallados de cada app con: pedidos, totales, comisiones, ajustes, depósitos.

### 10.3 Reporte de pedidos por conciliar

En cualquier momento, el admin puede ver:

```
┌─────────────────────────────────────────────────┐
│   PEDIDOS POR CONCILIAR                         │
├─────────────────────────────────────────────────┤
│   Periodo: [ Última semana ▼ ]                  │
│                                                 │
│   ▶ RAPPI                                       │
│   Pedidos capturados:    142                    │
│   Total bruto:        $32,840                   │
│   Comisión estimada:  -$8,867 (27%)             │
│   Neto esperado:     $23,973                    │
│   Estado: ⏳ Pendiente conciliación             │
│   [ Conciliar con estado de cuenta ]            │
│                                                 │
│   ▶ UBER EATS                                   │
│   Pedidos capturados:    87                     │
│   Total bruto:        $19,205                   │
│   Comisión estimada:  -$4,801 (25%)             │
│   Neto esperado:     $14,404                    │
│   Estado: ✅ Conciliado (depósito 17/may)       │
│   [ Ver detalle ]                               │
│                                                 │
│   ▶ DIDI FOOD                                   │
│   Pedidos capturados:    34                     │
│   Total bruto:        $7,820                    │
│   Comisión estimada:  -$2,190 (28%)             │
│   Neto esperado:      $5,630                    │
│   Estado: ⏳ Pendiente conciliación             │
│   [ Conciliar con estado de cuenta ]            │
└─────────────────────────────────────────────────┘
```

### 10.4 Flujo de conciliación

**Paso 1.** El negocio recibe estado de cuenta de la app (PDF, CSV, descarga desde panel web).

**Paso 2.** En VIM POS, admin toca "Conciliar con estado de cuenta" en la app correspondiente.

**Paso 3.** Carga el archivo o captura manualmente los datos clave:

- Periodo del reporte
- Total reportado por la app
- Comisión cobrada
- Ajustes (bonificaciones, cancelaciones, descuentos)
- Monto del depósito
- Lista de folios de pedidos cobrados

**Paso 4.** Sistema compara lo capturado vs. el estado de cuenta:

```
┌─────────────────────────────────────────────────┐
│   CONCILIACIÓN RAPPI — Semana 15-21 mayo        │
├─────────────────────────────────────────────────┤
│   VIM POS dice:                                 │
│   • 142 pedidos                                 │
│   • Total bruto: $32,840                        │
│   • Comisión estimada: $8,867                   │
│   • Neto esperado: $23,973                      │
│                                                 │
│   Rappi reporta:                                │
│   • 144 pedidos (+2)                            │
│   • Total bruto: $33,290 (+$450)                │
│   • Comisión real: $9,124                       │
│   • Ajustes: -$120 (cancelaciones)              │
│   • Depósito enviado: $24,046                   │
│                                                 │
│   DIFERENCIAS:                                  │
│   ⚠️ 2 pedidos en Rappi que no están en VIM POS:│
│      • R-X9K2L  $230 (16/may 19:34)             │
│      • R-Y3M7B  $220 (18/may 14:12)             │
│   → Probablemente no capturados manualmente     │
│                                                 │
│   ⚠️ Diferencia neta: -$73 ($23,973 - $24,046)  │
│   → Diferencia menor explicable por redondeos   │
│      o ajustes pequeños                         │
│                                                 │
│   Acción del admin:                             │
│   ( ) Aceptar conciliación tal cual             │
│   ( ) Registrar los 2 pedidos faltantes después │
│   ( ) Marcar para investigación                 │
│                                                 │
│   Notas:                                        │
│   [_____________________________________________│
│                                                 │
│         [ Cancelar ]    [ Conciliar ]           │
└─────────────────────────────────────────────────┘
```

**Paso 5.** Admin valida la conciliación. El periodo queda como "conciliado" con detalle de diferencias.

### 10.5 Tratamiento de pedidos faltantes

Si la app reporta pedidos que VIM POS no tiene (operador olvidó capturarlos):

- Quedan listados para captura retroactiva
- Admin puede capturar los datos faltantes basándose en el reporte de la app
- O puede aceptar la diferencia sin captura (queda como nota en la conciliación)

### 10.6 Reportes financieros con conciliación

Una vez conciliado, los reportes de ingresos del negocio se ajustan:

- **Ventas brutas:** lo que el cliente final pagó (acumulado de todas las marcas en todas las apps)
- **Comisiones pagadas:** desglosado por app
- **Ingresos netos:** lo que efectivamente entró al negocio
- **Margen bruto:** ingresos netos − costo de insumos (cuando inventario está activo)
- **Tiempo de cobro promedio:** días desde pedido hasta depósito de la app

### 10.7 Reglas

- La conciliación es **manual** en MVP (sin integración API)
- Cada periodo de cada app se concilia por separado
- Las diferencias quedan documentadas con notas para revisión posterior
- La conciliación no afecta los pedidos ya cobrados al cliente final (eso ya pasó); solo organiza la información para reportes contables del negocio

---

## 11. Inventario y recetas en multi-marca

### 11.1 Recordatorio: módulo de inventario del /core

Todo lo del módulo de Inventario y Recetas (`/core` Parte IX) aplica completamente en Dark Kitchen. No se reinventa nada. Aquí solo se explican las **adaptaciones específicas para multi-marca**.

### 11.2 Insumos compartidos entre marcas

Como mencionado en §3.4:

- Los insumos viven a nivel **negocio**, no a nivel marca
- Un insumo ("Salsa BBQ") tiene un solo stock que alimenta a todas las marcas
- Las recetas de cada marca pueden usar los mismos insumos
- Reportes pueden filtrarse por marca o consolidarse

### 11.3 Recetas por producto, productos por marca

```
NEGOCIO: Dark Kitchen León
├── Marca: Wings del Barrio
│   ├── Producto: Combo 10 alitas BBQ
│   │   └── Receta:
│   │       • Alitas crudas: 350 g (insumo compartido)
│   │       • Salsa BBQ: 80 ml (insumo compartido)
│   │       • Papas fritas: 150 g (insumo compartido)
│   │       • Aderezo ranch: 30 ml (insumo compartido)
│   │       • Empaque: 1 caja Wings del Barrio (insumo específico de marca)
│   └── ...
├── Marca: Burger Lab
│   ├── Producto: Hamburguesa BBQ Doble
│   │   └── Receta:
│   │       • Carne molida: 200 g (insumo compartido)
│   │       • Pan de hamburguesa: 1 pieza (insumo compartido)
│   │       • Salsa BBQ: 30 ml (mismo insumo, compartido)
│   │       • Queso amarillo: 30 g (insumo compartido)
│   │       • Papel encerado: 1 pieza
│   │       • Empaque: 1 caja Burger Lab (insumo específico de marca)
│   └── ...
```

**El insumo "Salsa BBQ" se descuenta:**

- 80 ml cuando vende un combo de Wings del Barrio
- 30 ml cuando vende una Burger BBQ de Burger Lab
- Stock único acumula consumo de ambas marcas
- Si se acaba, ambos productos (de ambas marcas) se marcan automáticamente como agotados

### 11.4 Empaque diferenciado por marca

Los **empaques son insumos específicos por marca**:

- "Caja Wings del Barrio" es un insumo que solo se usa en recetas de Wings del Barrio
- "Caja Burger Lab" similar para Burger Lab
- El stock se gestiona por separado (compras y consumo independientes)

Esto permite reportes precisos: cuánto se gastó en empaque de Wings vs. Burger.

### 11.5 Reportes de costos por marca

Los reportes financieros se enriquecen:

- **Costo total por marca:** suma de costos de insumos consumidos por esa marca
- **Margen real por marca:** ventas netas (después de comisión app) − costo insumos − costo empaque
- **Marca más rentable:** ranking de marcas por margen absoluto y por margen %

Esto permite al dueño decidir qué marcas mantener y cuáles cerrar o repensar.

### 11.6 Reglas

- Los insumos son universales del negocio (sin FK a marca)
- Los productos sí pertenecen a una marca específica
- Las recetas usan insumos del pool universal
- Los empaques son insumos como cualquier otro pero típicamente específicos por marca
- El descuento de inventario es automático en la venta (heredado del `/core` §34.3)

---

## 12. Modos de servicio aplicables

### 12.1 Modos típicos en Dark Kitchen

Del catálogo del `/core` §6.1, Dark Kitchen activa principalmente:

| Modo | Cuándo |
|---|---|
| `APP_RAPPI` | Universal para Dark Kitchen |
| `APP_UBEREATS` | Universal |
| `APP_DIDI` | Universal |
| `APP_IFOOD` | Si el negocio está dado de alta |
| `APP_OTRO` | Apps regionales o propias |
| `DELIVERY_PROPIO` | Opcional para cocinas con flotilla (§9) |

### 12.2 Modos que Dark Kitchen NO usa

- `COMER_AQUI` — no aplica, no hay comedor
- `PARA_LLEVAR` — raramente (algunos Dark Kitchen aceptan pickup, pero es excepción)
- `DRIVE_THRU` — no aplica
- `MESA` / `BARRA` — no aplica
- `EVENTO_PRIVADO` — no aplica (los eventos los maneja el catering del restaurante tradicional)

### 12.3 Modo `PARA_LLEVAR` (pickup) en Dark Kitchen

Algunos Dark Kitchen aceptan que el cliente vaya a recoger directamente (sin app externa, sin comisión). En este caso:

- Cliente llamó o escribió por WhatsApp
- Cocina prepara como pedido normal
- Cliente llega al local a recoger
- Pago: efectivo, tarjeta-manual o transferencia (`/core` §17)
- Sí entra a caja del negocio

Esto se activa solo si el negocio lo configura. Suele ser una pequeña fracción del volumen.

---

## 13. Subtipos de Personal sugeridos

Del catálogo del `/core` §30.2, en Dark Kitchen típicamente se activan:

| Subtipo | Función en Dark Kitchen |
|---|---|
| **Cocinero** | Prepara los pedidos, marca como listos en la pantalla unificada |
| **Ayudante de cocina** | Apoyo en preparación, no marca como listos |
| **Armador** | **Subtipo característico del vertical.** Recibe el pedido listo, lo arma con empaque correcto de cada marca, agrega salsas/extras/cubiertos, lo coloca en la zona de pickup |
| **Repartidor** | Solo si el negocio tiene delivery propio activado |
| **Personal general** | Limpieza, organización del local |

**No aplican:** Mesero, Barista, Hostess, Runner (no hay clientes presenciales).

### 13.1 El subtipo Armador en detalle

El **Armador** es una pieza clave en Dark Kitchen multi-marca. Sus responsabilidades:

- Recibe los pedidos LISTOS de la cocina (sección verde de §6.2)
- Verifica que el empaque correcto esté disponible para cada marca
- Coloca los productos en el empaque (caja con logo de la marca, bolsa, etiquetas)
- Agrega salsas, cubiertos, servilletas, extras según el pedido
- Pone el ticket con folio para que el repartidor identifique
- Coloca el pedido en la zona de pickup esperando repartidor
- Cuando llega el repartidor, marca "Entregar al repartidor" (§8.2)

### 13.2 Capacidades del Armador (extensión del /core §30)

- Login con PIN
- Ver pantalla de cocina (pedidos listos)
- Marcar pedidos como entregados al repartidor
- Reportar problemas (productos faltantes, empaque insuficiente)
- NO captura pedidos ni cobra
- NO modifica catálogo

### 13.3 Reglas

- En Dark Kitchen pequeño, una sola persona puede asumir roles de Cocinero + Armador
- En operaciones grandes, son personas distintas para evitar errores
- El sistema permite configurar quién hace qué

---

## 14. Configuración inicial específica del vertical

### 14.1 Configuraciones que Dark Kitchen agrega al `/core` §28

- **Marcas del negocio:** lista de marcas con sus datos (sección §3)
- **Canales activos:** qué apps externas operan + delivery propio (sección §4)
- **Relación marca-canal:** matriz de qué marca está en qué canal con configuración por combinación
- **Listing folios por marca-canal:** ID en cada app para conciliación
- **Comisión por canal:** porcentaje que cobra cada app
- **Diferencia de precio en app vs. real:** porcentaje de incremento por canal (§4.4)
- **Tiempo máximo de preparación tolerado:** por canal (las apps tienen distintos)
- **Tiempos de URGENTE en pantalla de cocina:** default 5 min restantes
- **Captura rápida o detallada como default:** preferencia del operador (§5.5)
- **Pausar canales: quién puede:** supervisor por default
- **Registro de repartidor externo:** obligatorio / opcional / desactivado
- **Subtipos de Personal activos:** Cocinero, Ayudante, Armador, etc.
- **Conciliación: periodicidad esperada por app**

### 14.2 Wizard de onboarding sugerido

Cuando el dueño crea un negocio Dark Kitchen:

```
Paso 1: Datos del negocio
Paso 2: ¿Cuántas marcas vas a operar? (1, 2, 3, 4, 5+)
Paso 3: Captura cada marca (nombre, tipo de cocina, logo)
Paso 4: ¿Qué canales operas? (Rappi, Uber, Didi, otros, delivery propio)
Paso 5: Para cada marca-canal: folio del listing, comisión, diferencia de 
        precio en app
Paso 6: Catálogo inicial por marca (productos con precios reales)
Paso 7: Inventario y recetas (recomendado activar, especialmente con multi-marca)
Paso 8: Personal — cocineros, armadores
Paso 9: Configuración general
```

---

## 15. KPIs y reportes específicos

### 15.1 KPIs únicos del vertical

Más allá de los reportes base del `/core` §29, Dark Kitchen necesita:

- **Pedidos por marca por canal:** cuántos pedidos recibió cada combinación
- **Ventas brutas por marca-canal**
- **Comisiones pagadas por canal**
- **Ingresos netos por marca-canal:** después de comisión
- **Margen real por marca:** ingreso neto − costo insumos − costo empaque
- **Marca más rentable:** ranking absoluto y porcentual
- **Canal más rentable por marca** (Rappi puede ser mejor para Marca A, Uber para Marca B)
- **Tiempo promedio de preparación por marca**
- **% de pedidos entregados a tiempo** (antes del deadline) por marca-canal
- **Pedidos con sanción** (excedieron deadline)
- **Cancelaciones por canal** (clientes que cancelaron desde la app)
- **Productos top por marca**
- **Insumo más consumido entre todas las marcas**
- **Tasa de pausas por canal:** cuántas veces se pausó y duración acumulada
- **Conciliaciones pendientes**

### 15.2 Reportes específicos

- **Reporte por marca:** ventas, costos, margen, tendencias semanales/mensuales
- **Reporte por canal:** ingresos, comisiones, depósitos, ROI
- **Reporte de tiempos:** preparación, entrega al repartidor, comparación vs. deadlines
- **Reporte de mermas:** insumos perdidos por errores de preparación, pedidos cancelados, etc.
- **Reporte de conciliación:** estado de cuenta por app, diferencias, pendientes
- **Reporte de productos:** top vendedores por marca, productos con problemas
- **Reporte de pausas:** cuándo y por qué se pausaron canales

### 15.3 Dashboard del operador en tiempo real

Durante la operación, el supervisor o dueño ve:

```
┌─────────────────────────────────────────────────┐
│   DARK KITCHEN — TIEMPO REAL                    │
├─────────────────────────────────────────────────┤
│   Pedidos del día: 47 (vs. 52 ayer)             │
│   Ventas brutas: $11,820                        │
│   Ventas netas estimadas: $8,510                │
│                                                 │
│   Por marca:                                    │
│   • Wings del Barrio:  22 pedidos $5,490        │
│   • Burger Lab:        15 pedidos $4,200        │
│   • Green Bowl:         8 pedidos $1,840        │
│   • Postre Express:     2 pedidos $290          │
│                                                 │
│   Por canal:                                    │
│   • Rappi:        28 pedidos                    │
│   • Uber Eats:    14 pedidos                    │
│   • Didi Food:     5 pedidos                    │
│                                                 │
│   En cocina ahora: 4                            │
│   Listos esperando: 2                           │
│                                                 │
│   Alertas:                                      │
│   ⚠️ Burger Lab pausada en Rappi (1h 14min)     │
│   ⚠️ Salsa BBQ: stock crítico                   │
│                                                 │
│   Conciliación pendiente:                       │
│   • Rappi: semana actual                        │
│   • Didi: semana anterior                       │
└─────────────────────────────────────────────────┘
```

---

## 16. Reglas duras específicas del vertical

Adicionales a las reglas del `/core`:

1. **Un negocio Dark Kitchen tiene mínimo 1 marca.** No puede existir sin marcas configuradas.

2. **Cada pedido pertenece a una sola marca y un solo canal.** No se permite cambiar después de captura.

3. **El folio externo de la app es obligatorio** en cada pedido capturado (`/core` §23.4).

4. **Los insumos son universales del negocio**, no por marca. Las recetas usan el pool compartido.

5. **Los empaques son insumos específicos por marca** típicamente. Permite reportes precisos por marca.

6. **La pausa de canales en VIM POS NO se sincroniza con apps externas (MVP).** El operador debe pausar manualmente en cada app. Limitación documentada.

7. **El sistema NO modifica listings de apps externas (MVP).** Sin integración API. Arquitectura preparada para Fase 2+.

8. **Toda venta por app NO entra a caja del negocio.** Las apps cobran al cliente final y depositan al negocio según su periodicidad.

9. **El registro del repartidor que recogió es opcional pero recomendado** para auditoría.

10. **La pantalla unificada de cocina muestra TODOS los pedidos en curso de TODAS las marcas y canales**, ordenados por tiempo restante.

11. **Una marca pausada no acepta nuevos pedidos en VIM POS, pero los ya en cocina continúan.**

12. **Cocina cancelada o saturada NO genera devolución al cliente automáticamente.** Eso lo gestiona la app y el cliente reclama por ahí.

13. **Conciliación con apps externas es manual en MVP**, una vez por periodo de reporte por app.

14. **Multi-marca y multi-canal son nativos del vertical desde el MVP**, no add-ons.

---

## 17. Arquitectura preparada para integración API futura

### 17.1 Por qué documentar esto ahora

Aunque la integración API con Rappi/Uber/Didi sea Fase 2+, **la arquitectura del MVP está pensada para soportarla** sin refactor mayor. Esta sección documenta cómo.

### 17.2 Lo que ya está listo desde el MVP

- **Entidades modeladas correctamente:** marca, canal, pedido con folio externo, repartidor — todo en BD
- **Estados del pedido independientes del canal:** la lógica de estados (`SIN_ENVIAR` → `EN_COCINA` → `LISTO` → `ENTREGADO_DOMICILIO`) no depende del origen del pedido
- **Configuración por canal:** cada app es un objeto configurable con comisión, tiempo máximo, etc.
- **Pantalla de cocina indiferente al origen:** muestra pedidos venga de captura manual o de API
- **Conciliación con folio externo:** ya se captura, listo para que el API también lo provea

### 17.3 Lo que la integración API agregará (Fase 2+)

Cuando se integre con cada app:

- **Recepción automática de pedidos:** la API de Rappi notifica → VIM POS crea el pedido sin intervención humana
- **Sincronización de listings:** cambiar precio o pausar un producto en VIM POS → la API actualiza el listing
- **Estado del pedido bidireccional:** VIM POS marca LISTO → la API notifica al repartidor; la API confirma que repartidor recogió → VIM POS marca ENTREGADO
- **Conciliación automática:** la API provee el detalle de cada pedido y su estado contable
- **Pausa automática al saturarse:** si VIM POS detecta cocina saturada, pausa automáticamente en las apps

### 17.4 Estrategia de implementación gradual

Cuando llegue Fase 2:

1. **Empezar con una sola app** (probablemente Rappi por penetración o Uber Eats por documentación)
2. **Mantener captura manual como fallback** — si la API falla, el operador puede capturar manual
3. **UI dual:** durante la transición, la pantalla puede mostrar pedidos API + pedidos manuales mezclados, indistinguibles para la cocina
4. **Agregar apps adicionales una a una**

### 17.5 Riesgo asumido en el MVP

Documentar honestamente:

- **Captura manual es lento** en horas pico. Operador puede atrasarse y perder pedidos
- **Errores de captura** son posibles (precio mal copiado, productos olvidados)
- **No hay sincronización automática** de catálogos: si cambias un precio en VIM POS, no se refleja en la app
- **Pausar canales requiere acción manual doble** (VIM POS + panel de la app)

Estos riesgos son aceptables para el MVP. Se mitigan con UX bien diseñada y procesos operativos claros. Los clientes Dark Kitchen lo entienden como estándar de la industria sin API.

---

## 📌 Decisiones cerradas del vertical

Decisiones tomadas específicamente para Dark Kitchen:

1. ✅ **Vertical amplio:** cubre desde operador chico con una marca hasta cocinas grandes con 5+ marcas.

2. ✅ **Captura manual del pedido en MVP.** Sin integración API con Rappi/Uber/Didi en MVP. Arquitectura preparada para Fase 2+ (§17).

3. ✅ **Multi-marca nativo del vertical desde MVP.** Cada marca tiene su propio catálogo. Los insumos son universales y compartidos entre marcas.

4. ✅ **Empaques son insumos específicos por marca** típicamente, permitiendo reportes precisos por marca.

5. ✅ **Pausar/reanudar en dos granularidades:** marca-en-canal Y producto-en-canal. Cobertura completa.

6. ✅ **Vista unificada de cocina:** UNA sola pantalla con TODOS los pedidos de TODAS las marcas y canales, ordenados por tiempo restante hasta deadline. Colores por urgencia.

7. ✅ **Tracking de repartidor externo opcional pero recomendado** para auditoría (nombre/ID de quién recogió).

8. ✅ **Delivery propio integrado** (módulo del `/core` §22) para cocinas con flotilla. Se mezcla en la vista unificada.

9. ✅ **Conciliación manual con apps externas** en MVP. Soporte de captura de estados de cuenta, comparación con lo capturado, detección de diferencias.

10. ✅ **El subtipo "Armador" como personal específico del vertical**, responsable de empacar correctamente por marca.

11. ✅ **Pausa de canales es local** (VIM POS) en MVP. NO sincroniza con apps externas. Limitación documentada.

12. ✅ **Diferencia de precio en app vs. precio real:** soportada nativamente. El precio interno se mantiene; el precio mostrado al cliente en la app es el inflado.

13. ✅ **Multi-canal nativo:** Rappi, Uber Eats, Didi Food, iFood, otros, delivery propio, WhatsApp.

14. ✅ **Sin atención presencial al cliente** en MVP. PARA_LLEVAR (pickup) opcional configurable.

---

## 📌 Pendientes específicos de Dark Kitchen

Cosas a definir antes o durante el desarrollo:

1. **Estrategia y orden de integración API (Fase 2+):** ¿qué app primero? Rappi tiene más penetración pero su programa de partners es exigente. Uber Eats tiene mejor documentación. Decisión técnica + comercial.

2. **UX detallada de la pantalla unificada de cocina:** mockups específicos, comportamiento en pantallas grandes (TV) vs. tablets, modo oscuro para cocinas con poca luz.

3. **Templates de catálogo por tipo de marca:** "Crear marca de wings" pre-llena productos típicos; "Crear marca de pizzas" hace lo mismo. Acelera onboarding.

4. **Política de no-show del repartidor:** ¿qué pasa si el repartidor nunca llega? Probable: alerta después de X minutos de "listo", notificación al operador para reescalar con la app.

5. **Manejo de "pedido fantasma":** la app dice que hay un pedido pero el operador no lo encuentra ni en su tablet ni en VIM POS. ¿Cómo se gestiona? Probable: protocolo de verificación con cliente vía app.

6. **Importación masiva de catálogo:** cuando un cliente Dark Kitchen tiene 3-5 marcas con 30 productos cada una, capturar manualmente es lento. Importar desde CSV/Excel sería útil. ¿MVP o futuro?

7. **Customización del ticket de comanda por marca:** algunas marcas requieren branding específico en el ticket (no solo etiqueta). Profundizar diseño.

8. **Integración con sistemas de mensajería:** algunas Dark Kitchen quieren notificación en WhatsApp al cocinero cuando entra pedido urgente. Posible add-on futuro.

9. **Reportes para inversionistas (Kitchen Cloud):** si un operador renta cocina a marcas externas, necesita reportes específicos por "renta" o "tenant". No en MVP.

10. **Manejo de horarios de operación por marca-canal:** cada marca puede tener distintos horarios en distintas apps. ¿Configurable? Probable: sí, configuración semanal.

11. **Política de respuesta automática a la app cuando se rechaza un pedido:** sin integración API no aplica, pero pensar para Fase 2+.

12. **Backup operativo para fallas de impresora:** en Dark Kitchen alta velocidad, perder impresora paraliza la cocina. ¿Soporte de pantalla secundaria como respaldo? Probable: sí.

13. **Sincronización de "agotado" entre marcas:** si la salsa BBQ se acaba, todos los productos que la usan (en todas las marcas) deben marcarse agotados automáticamente. Esto está cubierto por el módulo de inventario del `/core` §36.2, pero validar en multi-marca.

14. **Soporte para combos cross-marca (futuro):** combo que mezcla productos de dos marcas (raro pero existe en operadores muy creativos). No en MVP.

---

*Documento de flujos del módulo Dark Kitchen — VIM POS v1.1. Plan Maestro — Fermín, VIM Marketing.*

*Para flujos comunes a todos los verticales, consulta `01-FLUJOS-COMUNES-CORE.md` v3.*
