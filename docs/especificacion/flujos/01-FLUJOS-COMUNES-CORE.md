# 🧩 FLUJOS COMUNES — `/core` VIM POS

## Manual operativo transversal a todos los verticales

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v3.3 — pre-desarrollo (decisiones Knock-Out integradas)
> Última actualización: Mayo 2026

---

## Propósito de este documento

Este documento describe **todos los flujos, entidades y reglas que comparten los 6 verticales** de VIM POS (Quick Service, Foodtruck, Full Service, Café & Bar, Dark Kitchen, Enterprise).

Estos flujos viven en el `/core` del software y se reutilizan tal cual en cada vertical. Cada módulo vertical agrega únicamente lo específico de su perfil operativo: la pantalla principal de venta, sus KPIs, sus reglas duras particulares y sus extensiones de configuración.

**Regla de oro de diseño:** si un flujo o entidad aplica a 2+ verticales **de manera idéntica o muy parecida**, vive en `/core`. Solo si es **estructuralmente distinto** entre verticales, cada uno lo implementa a su manera.

---

## Tabla de contenidos

### Parte I — Fundamentos
1. [Conceptos base del sistema](#1-conceptos-base-del-sistema)
2. [Roles y permisos](#2-roles-y-permisos)
3. [Flujo de autenticación e inicio de sesión](#3-flujo-de-autenticación-e-inicio-de-sesión)

### Parte II — Catálogo y entidades del negocio
4. [Entidades del catálogo: Producto, Categoría, Modificadores](#4-entidades-del-catálogo-producto-categoría-modificadores)
5. [Entidad Cliente y Direcciones (CRM básico)](#5-entidad-cliente-y-direcciones-crm-básico)
6. [Modos de servicio](#6-modos-de-servicio)

### Parte III — Operación de caja y turno
7. [Flujo de apertura de turno](#7-flujo-de-apertura-de-turno)
8. [Flujo de cambio de cajero (sin cierre de turno)](#8-flujo-de-cambio-de-cajero-sin-cierre-de-turno)
9. [Flujo de retiros de caja (sangrías)](#9-flujo-de-retiros-de-caja-sangrías)
10. [Flujo de depósitos a caja](#10-flujo-de-depósitos-a-caja)

### Parte IV — Operación del ticket
11. [Flujo de notas al ticket y a la cocina](#11-flujo-de-notas-al-ticket-y-a-la-cocina)
12. [Flujo de pedidos paralelos / "en espera"](#12-flujo-de-pedidos-paralelos--en-espera)
13. [Flujo de cancelación de ticket](#13-flujo-de-cancelación-de-ticket)
14. [Flujo de descuentos y cortesías](#14-flujo-de-descuentos-y-cortesías)
15. [Flujo de devoluciones](#15-flujo-de-devoluciones)
16. [Flujo de edición de pedido post-cobro](#16-flujo-de-edición-de-pedido-post-cobro)

### Parte V — Cobro y facturación
17. [Flujo de pago y métodos](#17-flujo-de-pago-y-métodos)
18. [Flujo de facturación CFDI 4.0](#18-flujo-de-facturación-cfdi-40)

### Parte VI — Producción y entrega
19. [Comanda y áreas de cocina](#19-comanda-y-áreas-de-cocina)
20. [Estado de cocina del ticket](#20-estado-de-cocina-del-ticket)
21. [Flujo de entrega del pedido al cliente](#21-flujo-de-entrega-del-pedido-al-cliente)
22. [Flujo de delivery propio](#22-flujo-de-delivery-propio)
23. [Flujo de apps externas (Rappi, Uber Eats, Didi)](#23-flujo-de-apps-externas-rappi-uber-eats-didi)

### Parte VII — Cierre y conciliación
24. [Flujo de cierre de turno (corte de caja)](#24-flujo-de-cierre-de-turno-corte-de-caja)
25. [Flujo de cierre de día (Z global)](#25-flujo-de-cierre-de-día-z-global)

### Parte VIII — Sistema y soporte
26. [Manejo de contingencias](#26-manejo-de-contingencias)
27. [Trazabilidad y auditoría](#27-trazabilidad-y-auditoría)
28. [Configuración del negocio](#28-configuración-del-negocio)
29. [Reportes del /core](#29-reportes-del-core)
30. [Subtipos extensibles del rol Personal](#30-subtipos-extensibles-del-rol-personal)

### Parte IX — Inventario y recetas (módulo opcional)
31. [Visión y activación del módulo](#31-visión-y-activación-del-módulo)
32. [Entidad Insumo](#32-entidad-insumo)
33. [Receta de producto](#33-receta-de-producto)
34. [Movimientos de inventario](#34-movimientos-de-inventario)
35. [Costeo y valuación](#35-costeo-y-valuación)
36. [Alertas y stock mínimo](#36-alertas-y-stock-mínimo)
37. [Reportes de inventario](#37-reportes-de-inventario)

### Cierre
- [Decisiones cerradas](#-decisiones-cerradas-en-esta-versión)
- [Pendientes / decisiones abiertas](#-pendientes--decisiones-abiertas)

---

# Parte I — Fundamentos

---

## 1. Conceptos base del sistema

Antes de los flujos, hay que entender el vocabulario que usa el sistema. Estos términos aplican a todos los verticales.

### 1.1 Jerarquía organizacional

```
Negocio (tenant)
└── Sucursal (uno o varios puntos físicos)
    └── Caja / Estación POS (dispositivo físico)
        └── Turno (sesión de trabajo)
            └── Tickets (ventas individuales)
                └── Pagos (uno o varios por ticket)
```

- **Negocio:** la entidad comercial completa (ej. "Knock-Out Burger"). Equivale al cliente del SaaS. Tiene un RFC, una marca, un dueño.
- **Sucursal:** punto físico de operación. Un negocio puede tener una o muchas. Cada sucursal tiene su dirección, horario y configuración local.
- **Caja / Estación POS:** dispositivo donde se opera el POS (tablet, PC). Una sucursal puede tener varias cajas operando simultáneamente.
- **Turno:** sesión de trabajo de una caja, entre apertura y cierre. Tiene un fondo inicial, un usuario responsable, movimientos y un cierre con conteo.
- **Ticket:** venta individual. Tiene productos, descuentos, impuestos, pagos y opcionalmente factura CFDI.
- **Pago:** transacción monetaria sobre un ticket. Un ticket puede tener uno o varios pagos (pago mixto).

### 1.2 Estados de un turno

```
[CERRADO] ──apertura──> [ABIERTO] ──cierre sin diferencia──> [CERRADO]
                            │
                            └──cierre con diferencia──> [PENDIENTE_VALIDACIÓN]
                                                              │
                                                  PIN admin libera ↓
                                                          [CERRADO]
```

- **CERRADO:** estado inicial y final. No se puede operar.
- **ABIERTO:** turno activo. Se pueden hacer ventas, retiros, depósitos.
- **PENDIENTE_VALIDACIÓN:** el cajero terminó el conteo y hubo diferencia entre el efectivo físico y el esperado. **La caja queda bloqueada** y no puede abrirse un nuevo turno hasta que un administrador ingrese su PIN y valide el cierre. Esta es la regla por defecto e inalterable.

### 1.3 Estados de un ticket

```
[BORRADOR] ──primer ítem──> [ABIERTO] ──cobro──> [PAGADO] ──facturación──> [FACTURADO]
                                │
                                └──cancelación──> [CANCELADO]
```

- **BORRADOR:** el cajero abrió un ticket pero no agregó nada (se descarta automáticamente).
- **ABIERTO:** tiene productos, no se ha cobrado. Puede modificarse.
- **PAGADO:** ya se cobró. No se modifica, solo se factura o devuelve.
- **FACTURADO:** tiene CFDI 4.0 emitido (solo cuando el módulo CFDI está activo — ver sección 18).
- **CANCELADO:** anulado por motivo justificado, con registro de quién y por qué.

> Adicionalmente, el `/core` define el atributo `estado_cocina` del ticket, paralelo al estado fiscal. Ver sección 20.

### 1.3.bis Numeración de tickets

- Cada ticket recibe un **folio interno único e irrepetible** en el momento de su creación
- La numeración es **consecutiva eterna en la base de datos** — nunca se reinicia, ni por día ni por turno
- Formato del folio: `[código_sucursal]-[año]-[consecutivo]`. Ejemplo: `K-2026-001043` (Knock-Out, año 2026, ticket #1043)
- Al cliente se le muestran solo los **últimos 3-4 dígitos** en pantalla del POS y en el ticket impreso, para evitar números engorrosos en operación rápida (ej. "tu pedido es el #1043")
- El folio completo siempre se conserva internamente para auditoría, búsqueda y facturación retroactiva

### 1.4 Tipos de movimiento de caja

Todo lo que afecta el efectivo en caja durante un turno se clasifica como **movimiento**. Esto es crítico para que el corte cuadre.

| Tipo | Suma o resta | Genera comprobante | Requiere autorización |
|---|---|---|---|
| Fondo de apertura | + | Sí | Configurable |
| Venta en efectivo | + | Sí (ticket) | No |
| Depósito durante turno | + | Sí | Sí (admin/supervisor) |
| Retiro / sangría | − | Sí | Sí (admin/supervisor) |
| Devolución en efectivo | − | Sí | Sí (admin/supervisor) |
| Cortesía / descuento manual (no es efectivo) | N/A | Sí (en ticket) | Sí (admin/supervisor) |

> **Importante:** ventas con tarjeta, transferencia o vales **no afectan el efectivo en caja** — se reportan por separado en el corte. Ventas de apps externas tampoco afectan caja (ver sección 23).

---

## 2. Roles y permisos

### 2.1 Roles base del `/core`

VIM POS define 5 roles base. Cada negocio puede personalizar más roles después, pero estos vienen por defecto:

| Rol | Descripción | Capacidades clave |
|---|---|---|
| **Dueño** | Cuenta master del negocio | Todo. Inalterable. Solo uno por negocio. |
| **Administrador** | Gerente, encargado de sucursal | Configurar productos, ver reportes, autorizar movimientos, gestionar usuarios, validar cortes con diferencia. |
| **Supervisor** | Jefe de turno, encargado de piso | Autorizar cancelaciones, descuentos, devoluciones y sangrías. Ver reportes de su turno. No configura. |
| **Cajero / Operador** | Personal de operación diaria en el POS | Abrir/cerrar turno propio, registrar ventas, cobrar, imprimir tickets. No autoriza nada por sí mismo. |
| **Personal / General** | Personal operativo sin acceso a caja (cocineros, ayudantes, repartidores, runners, hosts, baristas) | Login con PIN para registrar asistencia y, según el vertical y subtipo, operar funciones específicas (marcar comanda lista, recibir asignación de delivery, etc.). No registra ventas ni accede a caja. |

> **Nota sobre el rol Personal / General:** este rol es el "comodín" para todo el personal operativo que necesita estar en el sistema pero NO opera caja. Cada vertical define qué subtipos sugiere (cocinero, mesero, barista, host, repartidor, etc.) y qué puede hacer cada subtipo específicamente. Ver sección 30 para subtipos extensibles.

### 2.2 Matriz de permisos del `/core`

| Acción | Personal | Cajero | Supervisor | Admin | Dueño |
|---|---|---|---|---|---|
| Iniciar sesión con PIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| Registrar entrada/salida laboral | ✅ | ✅ | ✅ | ✅ | ✅ |
| Abrir turno de caja | ❌ | ✅ | ✅ | ✅ | ✅ |
| Registrar venta y cobrar | ❌ | ✅ | ✅ | ✅ | ✅ |
| Aplicar descuento **manual** (cualquier monto o %) | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Aplicar cortesía 100% **manual** | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Aceptar descuento **automático** (promo configurada, happy hour, cupón válido) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cancelar ticket abierto | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cancelar ticket pagado | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Hacer retiro / sangría | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Hacer depósito a caja | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Cerrar turno propio | ❌ | ✅ | ✅ | ✅ | ✅ |
| Validar corte con diferencia (desbloquear) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Marcar pedido como listo (cocina) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Marcar pedido como entregado | ✅ | ✅ | ✅ | ✅ | ✅ |
| Asignar/aceptar pedido de delivery propio | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reimprimir comanda | ❌ | ❌ → pide PIN | ✅ | ✅ | ✅ |
| Configurar productos | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gestionar usuarios | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver reportes globales del negocio | ❌ | ❌ | Solo su turno | ✅ | ✅ |
| Facturación masiva / global | ❌ | ❌ | ❌ | ✅ | ✅ |
| Modificar configuración fiscal | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cancelar/contratar plan SaaS | ❌ | ❌ | ❌ | ❌ | ✅ |
| Capacidades específicas del vertical | Definidas por módulo | Definidas por módulo | Definidas por módulo | Definidas por módulo | Definidas por módulo |

### 2.3 Patrón de autorización con PIN

Cuando un cajero intenta hacer una acción que requiere autorización superior, **no necesita cerrar sesión ni que el supervisor lo desplace físicamente del POS**. El sistema muestra un modal:

```
┌─────────────────────────────────────────┐
│  AUTORIZACIÓN REQUERIDA                 │
├─────────────────────────────────────────┤
│  Acción: Cancelar ticket #1043          │
│  Monto: $245.00                         │
│                                         │
│  Solicita autorización de un            │
│  supervisor o administrador.            │
│                                         │
│  PIN: [ _ _ _ _ ]                       │
│                                         │
│  Motivo: [campo libre obligatorio]      │
│                                         │
│         [ Cancelar ]  [ Autorizar ]     │
└─────────────────────────────────────────┘
```

El supervisor introduce su PIN sin desplazar al cajero. El sistema registra:
- Quién operaba (cajero)
- Quién autorizó (supervisor por PIN)
- Acción autorizada
- Motivo capturado
- Fecha y hora

Esto queda en la bitácora de auditoría (ver sección 27).

---

## 3. Flujo de autenticación e inicio de sesión

### 3.1 Modelo de acceso

VIM POS distingue dos contextos de acceso:

- **Acceso operativo (en la caja):** PIN numérico de 4-6 dígitos. Rápido, para cambio frecuente entre cajeros. No requiere correo.
- **Acceso administrativo (configuración, reportes):** usuario + contraseña + opcionalmente 2FA. Vía web en cualquier dispositivo.

Esto evita que el cajero esté tecleando contraseñas largas en la tablet durante el rush.

### 3.2 Flujo paso a paso — Inicio de jornada en la caja

**Precondición:** la caja está prendida, conectada a internet (idealmente), con la app de VIM POS abierta.

**Paso 1.** La pantalla muestra el selector de usuarios de la sucursal:

```
┌──────────────────────────────────────────┐
│         KNOCK-OUT BURGER                 │
│         Sucursal: León Centro            │
│                                          │
│   ¿Quién va a operar la caja?            │
│                                          │
│   [ 👤 María G. ] [ 👤 Carlos R. ]       │
│   [ 👤 Diana M. ] [ 👤 Luis P.  ]        │
│                                          │
└──────────────────────────────────────────┘
```

**Paso 2.** El cajero toca su nombre. Aparece el teclado numérico para PIN:

```
┌──────────────────────────────────────────┐
│   María G. — Cajera                      │
│                                          │
│   PIN: [● ● ● _]                         │
│                                          │
│         [1] [2] [3]                      │
│         [4] [5] [6]                      │
│         [7] [8] [9]                      │
│         [ ] [0] [⌫]                      │
│                                          │
│         [ ¿Olvidé mi PIN? ]              │
└──────────────────────────────────────────┘
```

**Paso 3.** PIN correcto → el sistema valida:

- ¿Hay un turno abierto en esta caja?
  - **No** → ofrece abrir turno (ver sección 7)
  - **Sí, pero es del mismo cajero** → entra directo a la pantalla de ventas
  - **Sí, pero es de otro cajero** → ofrece "Cambio de cajero" (sección 8) o "Cerrar turno anterior con autorización" si el otro cajero olvidó cerrar

**Paso 4.** El sistema registra el evento de login con timestamp.

### 3.3 Casos especiales

- **PIN olvidado:** "¿Olvidé mi PIN?" → solicita PIN de supervisor para resetear. El supervisor genera un PIN temporal de 4 dígitos. El cajero debe cambiarlo en su primer login.
- **Cajero bloqueado por administrador:** mensaje "Esta cuenta está desactivada. Contacta al administrador."
- **3 intentos fallidos:** bloqueo temporal de 5 minutos. 6 intentos = bloqueo hasta intervención de admin.
- **Caja no autorizada:** si el cajero no tiene asignada esta sucursal, error "No tienes acceso a esta sucursal".

---

# Parte II — Catálogo y entidades del negocio

---

## 4. Entidades del catálogo: Producto, Categoría, Modificadores

> Estas entidades son universales. Todos los verticales venden productos organizados en categorías, con modificadores aplicables. La UX de captura cambia por vertical, pero la estructura de datos es idéntica.

### 4.1 Producto

Producto es la entidad base del catálogo. Cada producto tiene:

- **Datos básicos:** nombre, descripción opcional, código (opcional), foto opcional, categoría
- **Precio:** precio base, precio con IVA, precio sin IVA (configuración fiscal del negocio decide cómo se maneja)
- **Estado:** activo / pausado / agotado
- **Configuración fiscal:** unidad SAT, clave SAT del producto, tasa IVA (default 16% en México)
- **Modificadores asociados:** lista de grupos de modificadores aplicables (ver 4.3)
- **Disponibilidad por modo de servicio:** ¿este producto está disponible para qué modos? (caso típico: bebidas en vaso grande "para aquí" no aplican para llevar)
- **Tiempo estimado de preparación:** opcional, en minutos. Usado para estimaciones al cliente
- **Área de cocina destino:** dónde se imprime la comanda (cocina caliente, fría, barra, etc.). Configurable por el negocio (ver sección 19)
- **Tipo de venta:** unidad / peso / volumen. Default: unidad. Peso y volumen para verticales específicos (Café & Bar usa volumen en cocteles; retail/supermercado futuro usará peso)
- **Marca virtual (opcional):** cuando el módulo multi-marca está activo (vertical Dark Kitchen), cada producto pertenece a una marca virtual específica del negocio. Este campo es nulo en verticales sin multi-marca. Ver módulo Dark Kitchen para detalles.

### 4.2 Categoría

Agrupación visual del catálogo. Existe para organizar la pantalla de venta. Ejemplos: "Hamburguesas", "Bebidas", "Acompañamientos", "Postres", "Cocteles", "Vinos", "Entradas".

- **Nombre, color (opcional), orden de visualización**
- **Productos que contiene**
- **Visible para qué modo de servicio:** opcional, por si quieres ocultar "Bebidas en vaso" cuando es para llevar
- **Visible para qué subtipo de personal:** opcional, por si quieres que el barista solo vea categorías de bar

### 4.3 Grupo de modificadores

Un grupo de modificadores es un conjunto de opciones aplicables a un producto. Ejemplos:

- "Término de cocción" → opciones: rojo, medio, tres cuartos, bien cocido
- "Sin ingredientes" → opciones: sin cebolla, sin tomate, sin pepinillos, sin lechuga
- "Extras con costo" → opciones: extra queso (+$15), extra tocino (+$20)
- "Tamaño de bebida" → opciones: chica, mediana, grande (cada una con su precio)
- "Tipo de leche" (Café & Bar) → opciones: entera, deslactosada, vegetal (+$10)
- "Punto de carne" (Full Service) → opciones: azul, rojo, medio, tres cuartos, bien cocido

Cada grupo tiene:

- **Nombre** visible al cajero/mesero
- **Tipo de selección:**
  - `UNICA_OBLIGATORIA` — debe elegir exactamente una (ej. término de cocción)
  - `UNICA_OPCIONAL` — puede elegir una o ninguna (ej. tipo de pan)
  - `MULTIPLE_OPCIONAL` — puede elegir varias o ninguna (ej. sin ingredientes)
  - `MULTIPLE_OBLIGATORIA_MIN_MAX` — debe elegir entre N y M (ej. "elige 2 salsas")
- **Opciones** (cada una con nombre, precio extra opcional, disponibilidad)
- **Aplicación:** a qué productos aplica (uno, varios o todos los de una categoría)

### 4.4 Notas al producto

Cada producto en un ticket puede llevar **una nota libre** capturada al agregarlo. Esto no es un modificador estructurado; es texto libre del tipo "bien doradito por favor", "que la salsa venga aparte", "no muy picante".

Las notas al producto:
- Se imprimen en la comanda junto al producto
- Aparecen en el ticket del cliente solo si el negocio lo configura así
- Quedan en bitácora con el ticket

### 4.5 Productos similares pero distintos

**Regla de pulgar para modelar el menú:**

> Si dos cosas **se preparan distinto en cocina**, son productos distintos.
> Si se preparan igual y solo cambia lo que les pones encima, es el mismo producto con modificadores.

Ejemplo correcto:
- "Hamburguesa Clásica" y "Hamburguesa BBQ" → productos distintos (preparación distinta)
- "Hamburguesa Clásica sin cebolla" → modificador, no producto

Esto simplifica el reporteo ("cuántas BBQ vendí") y la operación de cocina.

### 4.6 Producto agotado

Cualquier producto puede marcarse como `AGOTADO`. Cuando lo está:
- Aparece en gris en pantalla de venta con etiqueta "Agotado"
- No se puede agregar al ticket
- Tap muestra mensaje: "Este producto no está disponible. Confirma con tu encargado."
- El admin puede activarlo/desactivarlo manualmente desde el catálogo
- **Si el módulo de Inventario y Recetas (Parte IX) está activo,** el sistema marca automáticamente como `AGOTADO` los productos cuya receta requiere insumos cuyo stock cayó por debajo del mínimo para producir una unidad. El admin no tiene que hacerlo manualmente.
- En cualquier caso (manual o automático), el toggle siempre permite forzar el estado

### 4.7 Combos (futuro, no MVP)

Los combos (paquetes de productos con descuento) se diseñarán cuando haya datos reales de operación QSR. La decisión actual es: **sin combos al MVP**. La estructura del catálogo está preparada para agregarlos después sin refactor.

---

## 5. Entidad Cliente y Direcciones (CRM básico)

> Cliente es una entidad opcional pero útil. Aplica a todos los verticales con grado distinto: en QS es esporádico (mayoría de ventas anónimas), en Full Service es valioso para reservaciones, en Dark Kitchen viene del API de la app, en Foodtruck puede tener clientes corporativos recurrentes.

### 5.1 Datos del Cliente

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre | Texto | Sí | Puede ser solo nombre de pila |
| Teléfono | Texto | No | Recomendado, sirve para identificación rápida |
| Correo | Texto | No | Necesario para facturación electrónica |
| RFC | Texto | No (sí si factura) | Validado contra catálogo SAT |
| Razón social | Texto | No (sí si factura) | Auto-cargada con RFC válido |
| Régimen fiscal | Catálogo SAT | No (sí si factura) | Validado por régimen del RFC |
| CP fiscal | Texto | No (sí si factura) | Validado contra catálogo SAT |
| Uso CFDI default | Catálogo SAT | No | Sugerencia para próxima factura |
| Notas internas | Texto | No | Alergias, preferencias, observaciones |
| Estatus | Activo / Bloqueado | Sí | Default: Activo |
| Tipo | Persona física / Persona moral | No | Si factura, se infiere del RFC |

### 5.2 Histórico del Cliente

El sistema mantiene automáticamente, derivado de los tickets:

- Total de tickets asociados
- Monto total comprado (vida del cliente)
- Último pedido (fecha y monto)
- Frecuencia promedio (días entre compras)
- Productos favoritos (los más pedidos por este cliente)
- Modificadores frecuentes (le permite al cajero anticipar "siempre la pide sin cebolla")
- Tickets cancelados (alerta si patrón sospechoso)

### 5.3 Búsqueda de Cliente

El buscador acepta:
- Nombre completo o parcial
- Teléfono completo o últimos 4 dígitos
- RFC (para facturación rápida)
- Código del cliente (si el negocio asignó códigos)

Resultados ordenados por: frecuencia de compra reciente → recencia del último pedido → orden alfabético.

```
┌─────────────────────────────────────────┐
│   CLIENTE                               │
├─────────────────────────────────────────┤
│   Buscar:                               │
│   [ Nombre o teléfono... 🔍 ]           │
│                                         │
│   Sugerencias recientes:                │
│                                         │
│   👤 María López                        │
│      477 123 4567 — 8 pedidos          │
│      Última: hace 5 días                │
│                                         │
│   👤 Carlos Méndez                      │
│      477 987 6543 — 3 pedidos          │
│                                         │
│   [ + Nuevo cliente ]                   │
│   [ Cliente eventual (sin registro) ]   │
│                                         │
└─────────────────────────────────────────┘
```

### 5.4 Cliente eventual

Cuando el cajero/mesero elige "Cliente eventual (sin registro)", el ticket no se asocia a ningún cliente. Esto es lo normal en QS y Foodtruck — la mayoría de las ventas son anónimas.

### 5.5 Cuándo el cliente es obligatorio

Cliente obligatorio cuando:
- Se solicita factura (CFDI requiere datos fiscales)
- El modo de servicio es **delivery propio** (necesita teléfono y dirección)
- El módulo CRM & Lealtad Pro (add-on) está activado y el negocio configura "siempre identificar cliente"

Cliente opcional en el resto de los casos. El negocio puede configurar "siempre preguntar" como hint operativo, sin que sea bloqueante.

### 5.6 Bloqueo de Cliente

Un admin puede marcar un cliente como `BLOQUEADO`. Caso típico: cliente moroso en delivery propio que pidió y no pagó, o cliente que ha causado problemas recurrentes.

Al intentar asociar un cliente bloqueado a un ticket nuevo, el sistema avisa al cajero con un modal de advertencia que muestra el motivo del bloqueo. Un supervisor o admin puede desbloquearlo con PIN si lo considera apropiado.

### 5.7 Dirección de entrega

Aplica cuando el modo de servicio es **delivery propio**. Un cliente puede tener una o varias direcciones.

| Campo | Obligatorio |
|---|---|
| Etiqueta (casa, oficina, mamá) | No (default "Principal") |
| Calle y número | Sí |
| Colonia | Sí |
| Código postal | Sí |
| Ciudad | Sí |
| Estado | Sí |
| Referencias (timbres, color casa, perro) | No (muy recomendado) |
| Coordenadas GPS | No (futuro, capturado en mapa) |
| Notas para el repartidor | No |

Las direcciones se reutilizan: el cliente con direcciones guardadas las ve como tarjetas seleccionables y elige cuál usar para el pedido actual.

---

## 6. Modos de servicio

> Todos los verticales tienen modos de servicio, aunque las opciones cambian. El `/core` define el catálogo completo de modos posibles; cada vertical activa los que aplican.

### 6.1 Catálogo completo de modos

| Código interno | Nombre visible | Aplica a verticales |
|---|---|---|
| `COMER_AQUI` | Comer aquí | QS, Foodtruck, Café & Bar, Full Service |
| `PARA_LLEVAR` | Para llevar | QS, Foodtruck, Café & Bar, Full Service, Dark Kitchen |
| `DRIVE_THRU` | Drive-thru | QS (sucursales con ventanilla) |
| `DELIVERY_PROPIO` | Delivery propio | QS, Foodtruck, Café & Bar, Full Service, Dark Kitchen |
| `APP_RAPPI` | Rappi | Todos |
| `APP_UBEREATS` | Uber Eats | Todos |
| `APP_DIDI` | Didi Food | Todos |
| `APP_IFOOD` | iFood | Todos (futuro) |
| `APP_OTRO` | Otra app | Todos (catch-all configurable) |
| `MESA` | En mesa | Full Service, Café & Bar |
| `BARRA` | En barra | Café & Bar |
| `EVENTO_PRIVADO` | Evento privado | Foodtruck, Café & Bar |

### 6.2 Activación por negocio

Cada negocio activa solo los modos que usa. Ejemplos:

- **Knock-Out (QS sin drive-thru):** COMER_AQUI, PARA_LLEVAR, DELIVERY_PROPIO. En el futuro: APP_RAPPI, APP_UBEREATS.
- **Foodtruck en feria:** COMER_AQUI, PARA_LLEVAR, EVENTO_PRIVADO.
- **Restaurante de mariscos (Full Service):** MESA, PARA_LLEVAR.
- **Café especialidad:** COMER_AQUI, PARA_LLEVAR, BARRA, APP_RAPPI.
- **Dark Kitchen multi-marca:** APP_RAPPI, APP_UBEREATS, APP_DIDI, DELIVERY_PROPIO (si tiene flotilla).

### 6.3 Implicaciones operativas por modo

| Modo | Empaque | Indicación a cocina | Cobro |
|---|---|---|---|
| Comer aquí | Vajilla / charola del local | "PARA AQUÍ" o "MESA #" | Variable según vertical |
| Para llevar | Bolsa o contenedor para transportar | "PARA LLEVAR" en grande | Antes de mandar a cocina (default) |
| Drive-thru | Bolsa cerrada, bebidas tapadas | "DRIVE-THRU" + prioridad alta | Al pasar por ventanilla |
| Delivery propio | Contenedores aptos para traslado | "DELIVERY — [dirección breve]" | Variable: en POS o pago al recibir |
| Apps externas | El especificado por la marca, o estándar del negocio | "[NOMBRE_APP] — folio" | Conciliación posterior (no entra a caja) |
| Mesa | Vajilla | "MESA #" | Después del consumo |
| Barra | Vajilla de barra | "BARRA — asiento #" o "BARRA libre" | Después del consumo, o por ronda |
| Evento privado | Según contrato del evento | "EVENTO — [nombre]" | Variable: anticipo + saldo |

### 6.4 Modo de servicio como atributo del ticket

Todo ticket tiene un campo `modo_servicio` obligatorio. El sistema bloquea el cobro si no está definido (regla universal del `/core`, sección 17.4).

Sugerencia operativa: el cajero/mesero define el modo al inicio del pedido o al confirmar productos. La UX exacta depende del vertical.

### 6.5 Cambio de modo después de cobrar

Caso real: cliente pagó "para llevar" pero decide quedarse. Política universal:

- **Si la comanda no se ha mandado a cocina:** se puede cambiar libremente
- **Si ya se mandó a cocina:** se permite cambiar el modo (impacta empaque), pero el sistema imprime una nota a cocina: "PEDIDO #1043 — CAMBIO DE MODO: ahora COMER AQUÍ"
- En cualquier caso, queda registro en bitácora

### 6.6 Apps externas: tratamiento general

Para los modos `APP_*`, el comportamiento se describe en detalle en la sección 23. Lo esencial:

- El cajero captura manualmente lo que la app envió (pedido visto en el celular del repartidor o pantalla externa de la plataforma)
- Se captura el **folio externo** de la app (obligatorio)
- El cobro al negocio lo hace la app posteriormente (conciliación)
- En el corte de caja, NO afecta el efectivo

> **Importante:** los modos `APP_*` en cualquier vertical son captura manual. La integración API automática con Rappi/Uber/Didi es responsabilidad del módulo **Dark Kitchen** (`/modules/darkkitchen`), no del `/core`.

---

# Parte III — Operación de caja y turno

---

## 7. Flujo de apertura de turno

### 7.1 Cuándo se ejecuta

Cada vez que la primera persona inicia operación en una caja después de un cierre. Si la caja ya tiene un turno abierto, este flujo NO se ejecuta.

### 7.2 Flujo paso a paso

**Paso 1.** Cajero logueado, sistema detecta que no hay turno abierto en esta caja → muestra **directamente la captura por denominación** (modo por defecto):

```
┌─────────────────────────────────────────┐
│   ABRIR TURNO — FONDO DE CAJA           │
├─────────────────────────────────────────┤
│   Cajero: María G.                      │
│   Caja: Caja 01 — León Centro           │
│   Fecha: 17/05/2026 — 09:32             │
│                                         │
│   Billetes:                             │
│     $1,000  [  0 ]   = $0.00            │
│     $500    [  2 ]   = $1,000.00        │
│     $200    [  5 ]   = $1,000.00        │
│     $100    [ 10 ]   = $1,000.00        │
│     $50     [  4 ]   = $200.00          │
│     $20     [ 10 ]   = $200.00          │
│                                         │
│   Monedas:                              │
│     $10     [ 20 ]   = $200.00          │
│     $5      [ 20 ]   = $100.00          │
│     $2      [ 25 ]   = $50.00           │
│     $1      [ 50 ]   = $50.00           │
│     $0.50   [ 20 ]   = $10.00           │
│                                         │
│   TOTAL FONDO: $3,810.00                │
│                                         │
│   Notas (opcional):                     │
│   [____________________________________]│
│                                         │
│         [ Cancelar ]    [ Abrir turno ] │
└─────────────────────────────────────────┘
```

> **Por defecto, el sistema obliga captura por denominación** (más auditable, mejor práctica). El administrador puede activar en configuración del negocio el modo "Captura por monto total" si prefiere agilidad sobre rigor de auditoría.

**Paso 2 (solo si el admin activó modo monto total en configuración):** aparece pantalla simplificada:

```
┌─────────────────────────────────────────┐
│   ABRIR TURNO — FONDO DE CAJA (TOTAL)   │
├─────────────────────────────────────────┤
│   Cajero: María G.                      │
│   Caja: Caja 01 — León Centro           │
│   Fecha: 17/05/2026 — 09:32             │
│                                         │
│   Monto total: $ [  3,810.00 ]          │
│                                         │
│   Notas (opcional):                     │
│   [____________________________________]│
│                                         │
│         [ Cancelar ]    [ Abrir turno ] │
└─────────────────────────────────────────┘
```

**Paso 3.** Confirmación → el sistema:

- Crea el registro de turno con estado `ABIERTO`
- Guarda fondo inicial (con detalle de denominaciones si aplica), cajero responsable, timestamp, caja, sucursal
- Si hay impresora térmica configurada, **imprime comprobante de apertura**:

```
═══════════════════════════════════
       KNOCK-OUT BURGER
       León Centro — Caja 01
═══════════════════════════════════
       APERTURA DE TURNO

  Cajero:    María G.
  Fecha:     17/05/2026
  Hora:      09:32:14
  Turno #:   2026-05-17-C01-01

  Fondo inicial: $3,810.00

  Firma cajero: _______________
═══════════════════════════════════
```

**Paso 4.** Sistema entra a la pantalla principal de ventas (definida por el vertical).

### 7.3 Reglas y validaciones

- No se puede abrir un segundo turno en la misma caja mientras hay uno abierto.
- Si el cajero intentó cerrar el día anterior y quedó pendiente, el sistema avisa: "El turno anterior quedó sin cerrar formalmente. Notifica al administrador."
- **Por defecto, el fondo se captura por denominación.** El admin puede activar "modo monto total" en la configuración del negocio si prefiere agilidad sobre auditabilidad.
- El fondo de caja **no puede ser $0** (validación dura). Si el negocio realmente quiere iniciar sin fondo, el admin lo activa explícitamente en configuración avanzada.
- Si el negocio configura un **fondo estándar** (ej. siempre $3,000), aparece pre-llenado y el cajero solo confirma o ajusta diferencias.

---

## 8. Flujo de cambio de cajero (sin cierre de turno)

### 8.1 Cuándo se usa

Cuando un cajero termina su jornada pero el turno de caja sigue activo (otro cajero la usará). Esto evita cierres innecesarios y mantiene la continuidad operativa.

> ⚠️ **No confundir con cierre de turno.** Aquí el turno permanece abierto, solo cambia el responsable.

### 8.2 Flujo paso a paso

**Paso 1.** Cajero saliente toca menú → "Cambiar cajero":

```
┌─────────────────────────────────────────┐
│   CAMBIO DE CAJERO                      │
├─────────────────────────────────────────┤
│   Cajero saliente: María G.             │
│   Turno desde: 09:32                    │
│                                         │
│   Resumen de tu operación:              │
│     Ventas: $4,820.00                   │
│     Tickets: 32                         │
│     Efectivo recibido: $2,150.00        │
│                                         │
│   ¿Deseas hacer un conteo parcial       │
│   de efectivo? (recomendado)            │
│                                         │
│         [ Omitir ]   [ Contar caja ]    │
└─────────────────────────────────────────┘
```

**Paso 2 (si elige contar):** mismo flujo que el conteo de cierre (sección 24), pero al final NO cierra el turno, solo registra un **"corte parcial"** asociado al cajero saliente. Esta es la mejor práctica para deslindar responsabilidades en caja compartida.

**Paso 3.** Sistema regresa al selector de usuarios. Cajero entrante hace login con su PIN.

**Paso 4.** Sistema registra el cambio en la bitácora del turno:

```
Turno #2026-05-17-C01-01
├── 09:32 — Apertura por María G.
├── 14:00 — Corte parcial: $X efectivo, $Y tarjeta. Diferencia: $Z
├── 14:01 — Cambio de cajero: María G. → Carlos R.
└── (turno continúa)
```

**Paso 5.** Carlos opera normalmente. Al cerrar el turno al final del día, el reporte muestra ventas por cajero.

### 8.3 Reglas

- El cambio de cajero **no requiere autorización de supervisor** por defecto, pero el negocio puede activarlo en configuración.
- El conteo parcial es **opcional** pero altamente recomendado para auditoría.
- Toda venta queda registrada con el cajero que la procesó, no solo con el "responsable del turno".

---

## 9. Flujo de retiros de caja (sangrías)

### 9.1 Qué es y para qué sirve

Una **sangría** es la extracción de efectivo de la caja durante el turno, sin cerrar el turno. Casos típicos:

- Llenar el fondo de caja de otra estación
- Pagar a un proveedor que llegó (verdulero, repartidor de bebidas)
- Llevar efectivo al banco / caja fuerte porque ya hay demasiado en caja
- Pagar gastos menores autorizados (gasolina, ferretería, hielo)

### 9.2 Flujo paso a paso

**Paso 1.** Cajero toca menú → "Movimientos de caja" → "Retiro / Sangría":

```
┌─────────────────────────────────────────┐
│   RETIRO DE CAJA                        │
├─────────────────────────────────────────┤
│   Efectivo actual en caja: $5,420.00    │
│                                         │
│   Monto a retirar: $ [   1,500.00 ]     │
│                                         │
│   Motivo:                               │
│   ( ) Pago a proveedor                  │
│   ( ) Depósito a caja fuerte            │
│   ( ) Cambio para otra caja             │
│   ( ) Gasto operativo                   │
│   ( ) Otro: [______________________]    │
│                                         │
│   Descripción adicional (opcional):     │
│   [____________________________________]│
│                                         │
│   ⚠️ Requiere autorización de supervisor│
│                                         │
│         [ Cancelar ]   [ Continuar ]    │
└─────────────────────────────────────────┘
```

**Paso 2.** Aparece el modal de autorización por PIN (patrón de la sección 2.3). Supervisor introduce su PIN.

**Paso 3.** Sistema valida:

- Monto > 0
- Monto ≤ efectivo disponible en caja (no se puede retirar más de lo que hay)
- PIN válido y con permiso de autorizar sangrías

**Paso 4.** Confirmación final:

```
┌─────────────────────────────────────────┐
│   CONFIRMAR RETIRO                      │
├─────────────────────────────────────────┤
│   Monto:        $1,500.00               │
│   Motivo:       Pago a proveedor        │
│   Descripción:  Verdura semanal         │
│   Autorizó:     Luis P. (Supervisor)    │
│   Solicitó:     María G. (Cajera)       │
│                                         │
│   Efectivo en caja después: $3,920.00   │
│                                         │
│         [ Cancelar ]   [ Confirmar ]    │
└─────────────────────────────────────────┘
```

**Paso 5.** Sistema registra el movimiento e imprime comprobante por duplicado:

```
═══════════════════════════════════
       KNOCK-OUT BURGER
       León Centro — Caja 01
═══════════════════════════════════
       RETIRO DE CAJA
       Folio: SAN-2026-0142

  Fecha:        17/05/2026 13:45
  Turno #:      2026-05-17-C01-01

  Monto:        $1,500.00
  Motivo:       Pago a proveedor
  Descripción:  Verdura semanal

  Solicitó:     María G.
  Autorizó:     Luis P.

  Firma quien recibe: ____________
  Firma quien entrega:____________
═══════════════════════════════════
```

> Las dos copias permiten que tanto el cajero como el receptor firmen y conserven respaldo físico. Esto es estándar en restaurantería mexicana.

### 9.3 Reglas

- Toda sangría requiere autorización del supervisor o admin (configurable: el negocio puede permitir sangrías de monto bajo sin PIN, ej. < $200).
- Las sangrías afectan el cálculo del corte de caja al cierre: lo retirado se descuenta del efectivo esperado.
- Si la impresora falla, el sistema permite emitir el comprobante después, pero advierte.

---

## 10. Flujo de depósitos a caja

### 10.1 Qué es y cuándo se usa

Un **depósito** es el ingreso de efectivo a la caja que **no proviene de una venta**. Casos típicos:

- Reforzar el fondo porque se acabó el cambio
- Devolución de un préstamo entre cajas
- Inyección de capital del dueño
- Restitución de un faltante

### 10.2 Flujo paso a paso

Similar al retiro pero inverso:

```
┌─────────────────────────────────────────┐
│   DEPÓSITO A CAJA                       │
├─────────────────────────────────────────┤
│   Efectivo actual en caja: $3,920.00    │
│                                         │
│   Monto a depositar: $ [    500.00 ]    │
│                                         │
│   Motivo:                               │
│   ( ) Refuerzo de fondo                 │
│   ( ) Cambio enviado desde otra caja    │
│   ( ) Inyección del dueño               │
│   ( ) Restitución / reposición          │
│   ( ) Otro: [______________________]    │
│                                         │
│   Descripción adicional (opcional):     │
│   [____________________________________]│
│                                         │
│   ⚠️ Requiere autorización de supervisor│
│                                         │
│         [ Cancelar ]   [ Continuar ]    │
└─────────────────────────────────────────┘
```

Mismo flujo de autorización por PIN, confirmación e impresión de comprobante.

### 10.3 Reglas

- El depósito suma al efectivo esperado al cierre.
- Igual que la sangría, requiere autorización por defecto.

---

# Parte IV — Operación del ticket

---

## 11. Flujo de notas al ticket y a la cocina

Hay dos tipos de nota con destinos distintos. Ambos son universales a todos los verticales.

### 11.1 Nota al producto (va a cocina)

Capturada al agregar un producto al ticket o al editarlo. Va impresa en la comanda junto al producto. Casos típicos: "bien doradito por favor", "salsa aparte", "extra calientito".

- Es texto libre, sin estructura
- Se imprime en la comanda en negritas para que el cocinero no la pase
- Aparece en el ticket del cliente solo si el negocio lo configura así

### 11.2 Nota al ticket (general, va a cocina y al ticket del cliente)

Capturada con el botón "Nota" del panel del ticket:

```
┌─────────────────────────────────────────┐
│   NOTA AL PEDIDO                        │
├─────────────────────────────────────────┤
│   [_____________________________________│
│   _____________________________________ │
│   _____________________________________]│
│                                         │
│   Destino:                              │
│   [✓] Imprimir en comanda (cocina)      │
│   [✓] Imprimir en ticket (cliente)      │
│                                         │
│         [ Cancelar ]   [ Guardar ]      │
└─────────────────────────────────────────┘
```

Casos típicos:
- "Cumpleaños — favor de poner velitas"
- "Cliente alérgico al ajonjolí — confirmar pan"
- "Entregar en empaque doble"
- "Cliente VIP — atención especial"

### 11.3 Reglas

- Notas siempre visibles en pantalla mientras se arma el ticket
- Notas impresas en negritas en la comanda para que el cocinero no las pase
- Las notas quedan en bitácora con el ticket
- Una nota al ticket puede tener destinos múltiples (cocina, cliente, ambos) seleccionados por el cajero

---

## 12. Flujo de pedidos paralelos / "en espera"

### 12.1 El problema operativo

Universal a todos los verticales:

1. Cajero/mesero arma pedido del cliente A.
2. A está indeciso o tiene que ir por algo.
3. Llega cliente B con prisa.
4. Cajero necesita atender a B sin perder el pedido de A.

VIM POS resuelve esto con **pedidos en espera**.

### 12.2 Mantener pedido en espera

**Paso 1.** Cajero tiene el pedido de A armado parcialmente. Toca "Mantener en espera".

**Paso 2.** El sistema pide una **etiqueta para identificarlo**:

```
┌─────────────────────────────────────────┐
│   MANTENER PEDIDO EN ESPERA             │
├─────────────────────────────────────────┤
│   Etiqueta para identificarlo:          │
│   [ Cliente camisa azul ]               │
│                                         │
│   (Esto te ayudará a retomar el         │
│    pedido después)                      │
│                                         │
│         [ Cancelar ]   [ Mantener ]     │
└─────────────────────────────────────────┘
```

**Paso 3.** El pedido se guarda. La pantalla de venta se limpia. El cajero atiende a B normalmente.

**Paso 4.** Cuando A regresa, cajero toca "Pedidos en curso":

```
┌─────────────────────────────────────────┐
│   PEDIDOS EN CURSO                      │
├─────────────────────────────────────────┤
│   En espera (no cobrados):              │
│                                         │
│   📋 "Cliente camisa azul"              │
│      Hace 3 min — $145.00               │
│                                         │
│   📋 "Mesa 4 sin nota"                  │
│      Hace 8 min — $0.00                 │
│                                         │
│   ───────────────────────────────       │
│   Cobrados — en cocina:                 │
│                                         │
│   ✓ #1042 — Pedro M. — Listo            │
│   ✓ #1041 — Para llevar — En cocina     │
│                                         │
└─────────────────────────────────────────┘
```

**Paso 5.** Toca el pedido de A, lo retoma, completa y cobra.

### 12.3 Reglas

- Pedidos en espera **no van a cocina** (no se ha confirmado nada todavía)
- Si un pedido en espera lleva más de X minutos (configurable, default 30), el sistema avisa al cajero
- Al cerrar turno, si hay pedidos en espera sin cobrar, el sistema avisa y el cajero debe procesarlos o cancelarlos antes de cerrar
- Los pedidos en espera son visibles solo al cajero que los creó (o a un admin/supervisor con PIN)

### 12.4 Adaptaciones por vertical

Cada vertical adapta esta funcionalidad a su realidad:

- **Quick Service:** etiquetas libres ("Cliente camisa azul", "Mesa 1 sin pedir todavía")
- **Full Service:** los pedidos en espera están asociados a mesas (Mesa 7, Mesa 12). No requiere etiqueta libre; la mesa es la identificación natural
- **Café & Bar:** cuentas abiertas largas se gestionan como pedidos en espera persistentes (pueden durar horas)
- **Foodtruck:** etiquetas libres como QS
- **Dark Kitchen:** los pedidos vienen ya identificados por la app, no usa este flujo directamente

---

## 13. Flujo de cancelación de ticket

### 13.1 Dos escenarios distintos

**Caso A: Ticket abierto (todavía no se cobra).**
Es el caso simple. El cliente cambió de opinión, se equivocó el cajero, etc. No hay implicación fiscal porque no se ha cobrado.

**Caso B: Ticket pagado.**
Más delicado. Ya hay dinero involucrado. Si tiene CFDI emitido, también hay implicación fiscal (sustitución de factura).

### 13.2 Flujo — Caso A: cancelar ticket abierto

**Paso 1.** En la pantalla del ticket, cajero toca "Cancelar ticket":

```
┌─────────────────────────────────────────┐
│   CANCELAR TICKET #1043                 │
├─────────────────────────────────────────┤
│   Productos en el ticket:               │
│     2x Hamburguesa Clásica   $260.00    │
│     1x Papas medianas         $45.00    │
│     1x Refresco               $35.00    │
│                                         │
│   Subtotal:                  $340.00    │
│                                         │
│   Motivo de cancelación:                │
│   ( ) Cliente cambió de opinión         │
│   ( ) Error del cajero                  │
│   ( ) Producto no disponible            │
│   ( ) Otro: [______________________]    │
│                                         │
│   ⚠️ Esta acción no se puede deshacer.  │
│                                         │
│         [ No cancelar ]  [ Confirmar ]  │
└─────────────────────────────────────────┘
```

**Paso 2.** Si el monto del ticket supera el umbral configurado, pide PIN de supervisor. Si está por debajo, el cajero puede confirmar directamente.

**Paso 3.** Sistema marca el ticket como `CANCELADO`, registra motivo, quién canceló, quién autorizó (si aplicó), timestamp. El ticket **nunca se borra de la BD**, solo cambia de estado.

### 13.3 Flujo — Caso B: cancelar ticket pagado

**Paso 1.** Buscar el ticket en histórico (búsqueda por folio, hora, monto, o tocando "Tickets de este turno"):

```
┌─────────────────────────────────────────┐
│   CANCELAR TICKET PAGADO                │
├─────────────────────────────────────────┤
│   Ticket #1029 — 12:14                  │
│   Cajero: María G.                      │
│   Total: $485.00                        │
│   Método de pago: Efectivo              │
│                                         │
│   ¿Tiene factura CFDI emitida? Sí       │
│   Folio fiscal: ABC-12345               │
│                                         │
│   ⚠️ Cancelar un ticket pagado implica: │
│   • Devolver el dinero al cliente       │
│   • Cancelar el CFDI ante el SAT        │
│   • Registrar el movimiento de salida   │
│                                         │
│   Motivo: [obligatorio]                 │
│   [____________________________________]│
│                                         │
│   Requiere autorización del admin.      │
│                                         │
│         [ Volver ]     [ Continuar ]    │
└─────────────────────────────────────────┘
```

**Paso 2.** Autorización por PIN del admin (no basta supervisor para tickets pagados).

**Paso 3.** Sistema procesa la cancelación en cascada:

1. Marca el ticket como `CANCELADO` con motivo y autorización
2. Si tiene CFDI: dispara la cancelación ante el SAT (sustitución / cancelación 4.0)
3. Registra el movimiento de salida de efectivo si el pago fue en efectivo
4. Imprime comprobante de cancelación + ticket reverso
5. Si la comanda ya se había enviado a cocina, alerta visible a cocina para detener la preparación

### 13.4 Reglas

- Tickets cancelados aparecen en reportes con etiqueta visible.
- El folio del ticket se conserva (no se reutiliza).
- Si el pago fue con tarjeta, el reverso se hace en la terminal bancaria por separado — el sistema solo registra la intención de devolución.
- Tickets cancelados **no afectan ventas netas** del corte, pero sí aparecen en bitácora de auditoría.

---

## 14. Flujo de descuentos y cortesías

### 14.1 Distinción crítica: manual vs. automático

VIM POS reconoce dos categorías de descuento con tratamiento completamente distinto:

| Categoría | Origen | Requiere PIN | Quién lo activa |
|---|---|---|---|
| **Manual** | El cajero decide aplicarlo en el momento (a discreción) | **Siempre sí** | Cajero solicita, supervisor o superior autoriza con PIN |
| **Automático** | Configurado previamente por el admin como regla del sistema | **No** | Se aplica solo cuando se cumplen las condiciones |

**Filosofía:** la confianza ya se otorgó cuando el admin configuró la promoción. No tiene sentido pedir PIN cada vez. Pero un descuento improvisado en el momento ("le voy a hacer un 10% al cliente porque sí") siempre necesita aprobación.

**Roles autorizados a aprobar descuentos manuales (configurable por negocio):**

| Rol | Por default | Configurable |
|---|---|---|
| Dueño | ✅ Sí | No (siempre autoriza) |
| Admin | ✅ Sí | Sí (puede deshabilitarse) |
| Supervisor (incluyendo "Supervisor de turno") | ✅ Sí | Sí |
| Cajero | ❌ No | Sí (puede habilitarse si el negocio lo permite) |
| Personal | ❌ No | Sí |

**Configuración recomendada para QSR como Knock-Out:** **Dueño + Supervisor de turno**. Razón: pasar todo descuento por el dueño es cuello de botella (el dueño no siempre está en sitio), pero cualquier cajero abriría la puerta al abuso. Un supervisor designado por turno equilibra ambos. Cada turno tiene su supervisor (cocinero senior, cajero antiguo, gerente) con PIN propio.

### 14.2 Tipos de descuento por categoría

**Descuentos manuales (requieren PIN):**

| Tipo | Aplicación |
|---|---|
| Descuento manual por producto (% o monto) | Sobre un ítem específico |
| Descuento manual global (% o monto) | Sobre el subtotal del ticket |
| Cortesía manual 100% | Producto o ticket regalado a discreción |
| Ajuste de precio manual | Override del precio del producto al vuelo |

**Descuentos automáticos (NO requieren PIN):**

| Tipo | Cuándo se dispara |
|---|---|
| Happy hour | Por rango horario configurado (ej. cervezas 30% off de 18-20 hrs) |
| Promoción por día | Por día de la semana (ej. martes 2x1 en hamburguesas) |
| Promoción 2x1 / 3x2 | Cuando se cumplen las cantidades en el ticket |
| Combo / paquete | Cuando los ítems del combo están en el ticket |
| Cupón validado | Cliente presenta código válido y vigente |
| Descuento por lealtad | Cliente con CRM activado alcanza un umbral o usa puntos |
| Promoción por cliente frecuente | Identificado por teléfono / código en CRM |
| Descuento por método de pago | Ej. -5% pagando con transferencia (configurable) |
| Promoción por monto | Ej. compra > $500 obtiene -10% |

### 14.3 Flujo paso a paso — descuento manual

**Paso 1.** En el ticket abierto, cajero toca un ítem (o "Aplicar descuento al ticket") y elige "Descuento manual":

```
┌─────────────────────────────────────────┐
│   APLICAR DESCUENTO MANUAL              │
├─────────────────────────────────────────┤
│   Producto: Hamburguesa Clásica         │
│   Precio: $130.00                       │
│                                         │
│   Tipo de descuento:                    │
│   ( ) Porcentaje                        │
│   ( ) Monto fijo                        │
│   ( ) Cortesía 100%                     │
│                                         │
│   Valor: [  10  ] %                     │
│   Descuento: $13.00                     │
│   Precio final: $117.00                 │
│                                         │
│   Motivo:                               │
│   ( ) Cliente frecuente                 │
│   ( ) Inconveniencia operativa          │
│   ( ) Cortesía a invitado del negocio   │
│   ( ) Personal / staff                  │
│   ( ) Producto con defecto leve         │
│   ( ) Otro: [______________________]    │
│                                         │
│   🔒 Requiere autorización por PIN      │
│                                         │
│         [ Cancelar ]    [ Continuar ]   │
└─────────────────────────────────────────┘
```

**Paso 2.** Aparece el modal de autorización por PIN (patrón sección 2.3). Supervisor, admin o dueño introduce su PIN sin desplazar al cajero.

**Paso 3.** Descuento aplicado, ticket recalculado. La bitácora registra: monto, porcentaje, ítem afectado, motivo, cajero que solicitó, autorizador, timestamp.

### 14.4 Flujo paso a paso — descuento automático

**Paso 1.** El cajero agrega productos al ticket de manera normal, sin hacer nada especial.

**Paso 2.** El sistema **evalúa en tiempo real** las reglas de promoción configuradas. Si se cumplen condiciones, aplica el descuento solo y muestra una notificación visual:

```
┌─────────────────────────────────────────┐
│   TICKET #1043                          │
├─────────────────────────────────────────┤
│   2x Hamburguesa Clásica   $260.00      │
│   1x Papas medianas         $45.00      │
│   1x Refresco               $35.00      │
│                                         │
│   ✨ Promoción aplicada:                 │
│   "Martes 2x1 en Hamburguesas"          │
│   Descuento: -$130.00                   │
│                                         │
│   Subtotal:    $340.00                  │
│   Promociones: -$130.00                 │
│   Total:       $210.00                  │
└─────────────────────────────────────────┘
```

**Paso 3.** El cajero solo cobra. No firma nada, no pide PIN. La bitácora registra automáticamente la promoción aplicada, su nombre, condiciones cumplidas, descuento aplicado y al ticket.

### 14.5 Caso especial: el cliente reclama una promoción que el sistema NO detectó

Ejemplo: el cliente dice "tengo el cupón VIP" pero el código que captura no es válido, o pide "descuento del 10% como cliente frecuente" pero su teléfono no está en CRM.

**Tratamiento:** se convierte en descuento manual (con PIN). El cajero documenta el caso en el motivo y el supervisor decide si lo concede.

### 14.6 Configuración de promociones automáticas (panel admin)

El admin configura las promociones desde el panel web. Cada promoción tiene:

- **Nombre y descripción** (visible para el cajero y en el ticket)
- **Tipo** (porcentaje, monto, 2x1, combo, etc.)
- **Productos o categorías afectadas**
- **Condiciones de aplicación:** rango horario, día de semana, fechas vigencia, monto mínimo de ticket, método de pago requerido, código de cupón, cliente identificado en CRM
- **Límites:** máximo de usos por cliente, máximo total, no acumulable con X
- **Prioridad:** orden en que se evalúan cuando varias promociones aplican al mismo tiempo
- **Estado:** activa / pausada

### 14.7 Reglas

- Todo descuento (manual o automático) queda registrado en bitácora con su tipo, monto y origen.
- En el corte, los descuentos aparecen desglosados: "Descuentos manuales: $X (N tickets)" / "Promociones automáticas: $Y (M tickets)". Esto permite al dueño ver cuánto se está regalando por discreción vs. por estrategia.
- Si el negocio tiene CRM activado, descuentos aplicados a clientes registrados se asocian a su perfil para análisis de comportamiento.
- Una promoción automática **se puede cancelar manualmente** en el ticket si el cliente la rechaza (rara vez, pero pasa). El cajero toca la promoción y elige "Quitar". El sistema registra la decisión.
- **Las promociones automáticas nunca se acumulan entre sí salvo configuración explícita del admin.** Por defecto, se aplica la de mayor beneficio para el cliente.

---

## 15. Flujo de devoluciones

### 15.1 Cuándo aplica

El cliente regresa con producto ya pagado y consumido (o no) y se le devuelve el dinero total o parcial. Casos típicos en restaurante:

- Producto en mal estado servido al cliente
- Error en la preparación
- Insatisfacción del cliente (política de "satisfacción garantizada")

> **Distinción importante:** la devolución es diferente a la cancelación. La cancelación anula la venta completa. La devolución reconoce que la venta ocurrió pero se reembolsa el monto.

### 15.2 Flujo paso a paso

**Paso 1.** Cajero busca el ticket original:

```
┌─────────────────────────────────────────┐
│   DEVOLUCIÓN                            │
├─────────────────────────────────────────┤
│   Buscar ticket original:               │
│   [ Folio: 1029 ] [ Buscar ]            │
│                                         │
│   O escanear código del ticket...       │
└─────────────────────────────────────────┘
```

**Paso 2.** Sistema muestra el ticket y permite seleccionar qué se devuelve:

```
┌─────────────────────────────────────────┐
│   TICKET #1029 — 17/05/2026 12:14       │
├─────────────────────────────────────────┤
│   Selecciona los productos a devolver:  │
│                                         │
│   [✓] 1x Hamburguesa Clásica  $130.00   │
│   [ ] 1x Papas medianas        $45.00   │
│   [ ] 1x Refresco              $35.00   │
│                                         │
│   Monto a devolver: $130.00             │
│                                         │
│   Motivo:                               │
│   ( ) Producto en mal estado            │
│   ( ) Error de preparación              │
│   ( ) Cliente insatisfecho              │
│   ( ) Otro: [______________________]    │
│                                         │
│   Devolver en: ( ) Efectivo  ( ) Mismo  │
│                                         │
│         [ Cancelar ]    [ Continuar ]   │
└─────────────────────────────────────────┘
```

**Paso 3.** Autorización por PIN del supervisor.

**Paso 4.** Sistema:

1. Crea un registro de devolución vinculado al ticket original
2. Si es en efectivo: registra movimiento de salida de caja
3. Si es al mismo método (tarjeta): instrucción al cajero de hacer reverso en terminal
4. Imprime comprobante de devolución

### 15.3 Reglas

- La devolución no cancela el ticket original (mantiene su estado `PAGADO`).
- El corte de caja muestra ventas brutas, devoluciones y ventas netas.
- Devoluciones de productos con CFDI emitido requieren nota de crédito CFDI (flujo automatizado).

---

## 16. Flujo de edición de pedido post-cobro

### 16.1 El caso real

Cliente ya pagó pero recuerda "ah, y me das una Coca". O el cajero olvidó capturar algo. Universal a todos los verticales con cobro antes de servir.

### 16.2 Política

**Si la comanda no se ha mandado a cocina:** edición libre.

**Si ya se mandó a cocina:** el sistema permite **agregar productos** (no quitar) generando un ticket adicional vinculado al original:

```
┌─────────────────────────────────────────┐
│   AGREGAR AL PEDIDO #1043               │
├─────────────────────────────────────────┤
│   Pedido original: $394.40              │
│   Estado cocina: EN_COCINA              │
│                                         │
│   ⚠ La comanda original ya está en      │
│   cocina. Los nuevos productos se       │
│   imprimirán como comanda adicional:    │
│   "EXTRA — PEDIDO #1043"                │
│                                         │
│   Productos a agregar:                  │
│   1x Refresco — $35.00                  │
│                                         │
│   Total adicional: $40.60 (con IVA)     │
│                                         │
│         [ Cancelar ]    [ Cobrar extra ]│
└─────────────────────────────────────────┘
```

El nuevo cobro queda como un ticket hijo del original, vinculado en BD. En reportes y bitácora se ve como un solo evento para el cliente, dos transacciones contablemente.

### 16.3 Quitar productos después de cobrar

**No se permite** quitar productos por simple edición. Si hay que quitar algo, se hace por **devolución** del flujo de la sección 15. Esto fuerza a documentar el motivo y mantener trazabilidad.

### 16.4 Cambiar modo de servicio post-cobro

Permitido. Ver sección 6.5.

---

# Parte V — Cobro y facturación

---

## 17. Flujo de pago y métodos

### 17.1 Métodos de pago soportados

| Método | Afecta efectivo en caja | Requiere referencia | Comisión SaaS futura |
|---|---|---|---|
| **Efectivo** | Sí (+) | No | No |
| **Tarjeta crédito/débito** | No | Sí (últimos 4 dígitos opcional) | Posible (integración pagos) |
| **Transferencia / SPEI** | No | Sí (referencia o captura) | No |
| **Vales de despensa (Sodexo, Edenred, etc.)** | No | Sí (folio del vale) | No |
| **Cupón / promoción** | No | Sí (código) | No |
| **Cuenta interna / staff** | No | Sí (empleado) | No |
| **Pago dividido (mixto)** | Combinado | Combinado | N/A |
| **Pago por app externa** | No | Sí (folio de la app) | Conciliación posterior |
| **Pago al recibir (delivery propio)** | Sí (cuando regresa repartidor) | Indirecto | No |

> Los negocios pueden deshabilitar métodos que no usan (ej. Foodtruck sin vales). La configuración vive en la sección 28.

### 17.2 Flujo paso a paso — pago simple

**Paso 1.** Cajero toca "Cobrar" en el ticket abierto:

```
┌─────────────────────────────────────────┐
│   COBRAR TICKET #1043                   │
├─────────────────────────────────────────┤
│   Subtotal:                  $340.00    │
│   IVA (16%):                  $54.40    │
│   Total:                     $394.40    │
│                                         │
│   Método de pago:                       │
│                                         │
│   [ 💵 Efectivo  ] [ 💳 Tarjeta     ]   │
│   [ 🏦 Transfer. ] [ 🎟️ Vales       ]   │
│   [ ➕ Pago dividido            ]       │
│                                         │
└─────────────────────────────────────────┘
```

**Paso 2 (efectivo):**

```
┌─────────────────────────────────────────┐
│   PAGO EN EFECTIVO                      │
├─────────────────────────────────────────┤
│   Total a cobrar: $394.40               │
│                                         │
│   Recibido: $ [    500.00 ]             │
│                                         │
│   Cambio: $105.60                       │
│                                         │
│   Sugerencias rápidas:                  │
│   [ Exacto ] [ $400 ] [ $500 ] [ $1000 ]│
│                                         │
│         [ Volver ]      [ Confirmar ]   │
└─────────────────────────────────────────┘
```

**Paso 3.** Confirmación → ticket pasa a estado `PAGADO`.

> **En MVP (sin CFDI activo):** el sistema imprime directamente el ticket no fiscal (ver sección 18.2). El cliente conserva el folio interno por si después solicita facturación retroactiva cuando el módulo CFDI se active.

> **Cuando el módulo CFDI esté activo (Fase Final):** el sistema pregunta:

```
┌─────────────────────────────────────────┐
│   ¿Requiere factura?                    │
│                                         │
│   [ Sí, facturar ahora ]                │
│   [ No, solo ticket    ]                │
│   [ Después (ticket con QR para         │
│     auto-facturación)  ]                │
└─────────────────────────────────────────┘
```

**Paso 4.** Imprime ticket. Si eligió facturar, dispara el flujo de la sección 18.

### 17.3 Flujo — pago dividido (mixto)

```
┌─────────────────────────────────────────┐
│   PAGO DIVIDIDO                         │
├─────────────────────────────────────────┤
│   Total: $394.40                        │
│                                         │
│   Pagos aplicados:                      │
│   • Efectivo: $200.00              [x]  │
│   • Tarjeta:  $194.40              [x]  │
│                                         │
│   Restante: $0.00 ✓                     │
│                                         │
│   [ + Agregar otro método ]             │
│                                         │
│         [ Cancelar ]    [ Confirmar ]   │
└─────────────────────────────────────────┘
```

Cada pago se registra individualmente. El ticket pasa a `PAGADO` solo cuando la suma de pagos = total.

### 17.4 Validaciones críticas antes de cobrar

El botón "Cobrar" se mantiene **deshabilitado** si:

- No hay productos en el ticket
- No se ha definido modo de servicio
- Modo es delivery propio y falta cliente con dirección
- Modo es app externa y falta folio de la app
- Algún producto tiene modificador obligatorio sin elegir
- Hay descuento manual aplicado sin autorización válida (defensa en profundidad)

### 17.5 Reglas

- No se puede cerrar un ticket sin pago completo.
- Si el pago es mayor al total y es efectivo, el sistema calcula cambio. Si es tarjeta/transfer, no aplica cambio (debe coincidir exacto).
- Cada pago genera su propio registro en BD vinculado al ticket.

---

## 18. Flujo de facturación CFDI 4.0

> **Decisión de roadmap:** la facturación CFDI 4.0 es funcionalidad de **fase final** de VIM POS. El MVP arranca **sin facturación electrónica activa**. La arquitectura del sistema está preparada para integrarla cuando llegue ese momento, pero al inicio el sistema funciona perfectamente sin ella.

### 18.1 Comportamiento en MVP (sin CFDI activo)

Mientras el módulo CFDI no esté activo, el sistema:

- **Imprime ticket de venta NO fiscal** con la leyenda obligatoria: *"No es comprobante fiscal — Conserve este ticket para su facturación posterior"*
- **Asigna folio interno único e irrepetible** a cada venta (no es folio fiscal; es identificador del sistema)
- **Guarda todos los datos** necesarios para facturar el ticket **retroactivamente** cuando el módulo CFDI se active: productos, precios, IVA calculado, totales, método de pago, cliente si fue capturado
- **Permite capturar datos fiscales del cliente** (RFC, razón social, régimen, CP) y los guarda asociados al ticket — para cuando se active facturación, esos tickets ya tienen la información y se pueden timbrar sin pedirle al cliente nada de nuevo
- **NO emite, NO timbra, NO genera XML** — esa parte se activa después

### 18.2 Formato del ticket no fiscal (MVP)

```
═══════════════════════════════════
       KNOCK-OUT BURGER
       León Centro
═══════════════════════════════════
       TICKET DE VENTA
       Folio interno: K-2026-001043

  Fecha:      17/05/2026 14:32
  Cajero:     María G.
  Modo:       Para llevar

───────────────────────────────────
  2x Hamburguesa Clásica   $260.00
     - Término: tres cuartos
     - Sin cebolla
  1x Papas medianas         $45.00
  1x Refresco grande        $35.00
───────────────────────────────────
  Subtotal:               $340.00
  IVA (16%) incluido:      $46.90
  TOTAL:                  $340.00

  Pagó con: Efectivo $500.00
  Cambio:              $160.00

───────────────────────────────────
  *** NO ES COMPROBANTE FISCAL ***

  Conserve este ticket. Cuando el
  servicio de facturación esté
  habilitado, podrá solicitar su
  factura presentando el folio:

  K-2026-001043

  ¡Gracias por su compra!
═══════════════════════════════════
```

### 18.3 Activación futura del módulo CFDI

Cuando se active el módulo de facturación (fase final):

- Se contrata el PAC (proveedor de certificación) — **decisión actual: Facturama** como primera opción
- Se carga el CSD (Certificado de Sello Digital) del negocio
- Se configuran series, folios, plantillas de email, política de facturación global
- A partir de ese momento, **nuevos tickets pueden emitir CFDI inmediato**
- **Tickets viejos del MVP pueden facturarse retroactivamente** dentro del plazo fiscal (mismo ejercicio fiscal) usando el folio interno

### 18.4 Tres modalidades futuras de facturación (post-MVP)

Cuando el módulo CFDI esté activo, el sistema soportará tres modalidades:

| Modalidad | Cuándo se usa | Carga operativa |
|---|---|---|
| **Inmediata en caja** | El cliente pide factura al momento de pagar | Alta (cajero captura datos) |
| **Auto-facturación posterior** | Ticket con QR; cliente factura desde portal web del negocio | Baja (cliente captura solo) |
| **Global diaria (público en general)** | Tickets del día no facturados se agrupan en factura única | Cero (automática nocturna) |

### 18.5 Flujo futuro — facturación inmediata

**Paso 1.** Cliente pide factura. Cajero, en la pantalla post-pago, elige "Sí, facturar ahora":

```
┌─────────────────────────────────────────┐
│   DATOS FISCALES DEL CLIENTE            │
├─────────────────────────────────────────┤
│   RFC: [ XAXX010101000 ]  [ Validar ]   │
│                                         │
│   ▼ Datos auto-cargados:                │
│   Razón social: CLIENTE GENERICO        │
│   Régimen fiscal: 616 - Sin obligaciones│
│   CP fiscal:     [ 37000 ]              │
│                                         │
│   Uso CFDI:                             │
│   [ G03 - Gastos en general    ▼ ]      │
│                                         │
│   Email para envío:                     │
│   [ cliente@ejemplo.com           ]     │
│                                         │
│   [ Guardar como cliente frecuente ]    │
│                                         │
│         [ Cancelar ]    [ Facturar ]    │
└─────────────────────────────────────────┘
```

**Paso 2.** Validación contra catálogos SAT en tiempo real:

- RFC con formato y dígito verificador correcto
- Régimen fiscal válido para ese RFC
- CP existe en catálogo SAT
- Uso CFDI compatible con el régimen

**Paso 3.** Generación y timbrado:

- Sistema construye el CFDI con los datos del ticket
- Envía al PAC (Facturama por defecto)
- PAC devuelve UUID (folio fiscal)
- Sistema guarda XML + PDF + acuse

**Paso 4.** Entrega al cliente:

- Email automático con XML + PDF adjuntos
- Opcionalmente, imprime PDF en impresora térmica (resumen)
- Muestra QR del CFDI en pantalla para validación

### 18.6 Flujo futuro — facturación retroactiva (tickets del MVP)

Cuando se active el módulo CFDI, los tickets emitidos durante la etapa MVP podrán facturarse retroactivamente:

**Paso 1.** Cliente regresa con su ticket no fiscal (físico o por foto) y pide factura.

**Paso 2.** Cajero o admin busca el ticket por folio interno (K-2026-001043).

**Paso 3.** Sistema muestra el ticket con sus datos completos.

**Paso 4.** Captura datos fiscales del cliente (o los recupera si ya fueron capturados al momento de la venta).

**Paso 5.** Sistema valida que el ticket esté **dentro del plazo fiscal vigente** (mismo ejercicio fiscal donde se realizó la venta). Si está fuera de plazo, se rechaza.

**Paso 6.** Si está en plazo: timbra normalmente.

### 18.7 Flujo futuro — auto-facturación posterior

Si el cliente no pide factura al momento, el ticket se imprime con un **QR único**. El cliente, dentro del plazo fiscal (típicamente el mismo mes), escanea el QR y llega al portal de auto-facturación del negocio donde captura sus datos. El sistema timbra automáticamente sin intervención del cajero.

### 18.8 Flujo futuro — facturación global diaria

Para cumplir con la obligación de facturar todas las ventas (incluso a público general), VIM POS generará **automáticamente al cierre del día** una factura global que agrupa todos los tickets pagados que no se facturaron individualmente. Esto se ejecutará como tarea automática nocturna.

### 18.9 Manejo de errores (post-MVP)

- **RFC inválido:** "El RFC no existe en el padrón del SAT" → solicitar corrección
- **PAC caído:** sistema guarda en cola y reintenta. El cajero recibe el ticket con nota "Factura pendiente, se enviará al correo en breve"
- **Timbres agotados:** alerta al admin. El cajero puede seguir cobrando, pero la facturación queda en cola
- **CSD vencido o revocado:** alerta crítica al dueño, facturación detenida hasta resolución

### 18.10 Reglas

- En MVP: el ticket no fiscal es el comprobante operativo. El cliente lo conserva para su facturación posterior.
- En MVP: el sistema asigna folio interno único e irrepetible; ningún ticket comparte folio.
- Post-activación CFDI: el cliente tiene derecho a factura **siempre** que la pida dentro del mismo ejercicio fiscal en que se hizo la venta.
- Post-activación: cancelación de CFDI sigue el flujo 4.0 del SAT (con motivos: 01, 02, 03, 04).
- Post-activación: toda factura tiene su XML + PDF + acuse del PAC almacenados perpetuamente (backup obligatorio).
- VIM POS opera con un único PAC al inicio (Facturama). Arquitectura preparada para multi-PAC futuro si la confiabilidad lo justifica.

---

# Parte VI — Producción y entrega

---

## 19. Comanda y áreas de cocina

### 19.1 Diferencia entre ticket y comanda

| Documento | Audiencia | Contenido |
|---|---|---|
| **Ticket** | Cliente | Lo que pagó, total, IVA, método de pago, folio interno. En MVP: leyenda "No es comprobante fiscal". Cuando CFDI esté activo: QR de auto-facturación |
| **Comanda** | Cocina | Qué tiene que preparar, modificadores, notas |

Son documentos diferentes con diseño diferente. Ambos universales a todos los verticales.

### 19.2 Formato de comanda impresa

```
═══════════════════════════════════
       COMANDA — KNOCK-OUT
═══════════════════════════════════
   PEDIDO #1043
   17/05/2026 — 14:32
   Cajero: María G.

   *** PARA LLEVAR ***

   2x HAMBURGUESA CLÁSICA
      - Término: TRES CUARTOS
      - SIN CEBOLLA
      + Extra queso

   1x PAPAS MEDIANAS

   1x REFRESCO
      - Coca Cola Grande

   ──────────────────────────────
   ⚠ NOTA AL PEDIDO:
   Cliente alérgico al ajonjolí
   ──────────────────────────────

═══════════════════════════════════
```

El formato exacto es configurable por el negocio (logo, número de pedido en grande, información adicional).

### 19.3 Áreas de cocina (impresoras múltiples)

Un negocio puede tener múltiples impresoras de cocina en zonas distintas:

- **Cocina caliente** (parrilla, freidora, planchas)
- **Cocina fría** (ensaladas, postres, repostería)
- **Barra** (bebidas, café, cocteles)
- **Pizzas** (horno dedicado)
- **Otra área específica** del negocio

Cada producto está asignado a un área. La comanda se divide automáticamente: cada impresora recibe solo lo que le toca preparar. **El número de pedido (#1043) es el mismo en todas** para que en cocina sepan que es el mismo cliente.

> **Importante:** la lógica de "qué producto va a qué impresora" es configuración del producto (sección 4.1). Si un negocio tiene una sola impresora, todas las cosas van ahí. Si tiene varias, el admin asigna cada producto a su área.

### 19.4 Política de envío a cocina (configurable)

Cada negocio decide cuándo se envía la comanda:

| Política | Cuándo se manda a cocina |
|---|---|
| **Cobrar primero** | Después del cobro, automáticamente. Recomendado para QSR y Foodtruck |
| **Mandar a cocina al confirmar** | Al tocar "Mandar a cocina" antes de cobrar. Recomendado para Full Service y Café & Bar |
| **Ambos según modo** | Aquí: manda al confirmar; Llevar: manda al cobrar. Híbrido configurable |

Esta configuración vive en la sección 28 y se aplica al negocio completo o por vertical según la complejidad de la operación.

### 19.5 Reimpresión de ticket y comanda

**Reimpresión de ticket de venta (al cliente):** disponible para todos los roles operativos (cajero, supervisor, admin, dueño) por default. Casos típicos: cliente perdió su ticket, se rompió la impresora a media venta, el cliente quiere copia adicional. El admin puede restringir esta capacidad si su política lo requiere.

**Reimpresión de comanda (a cocina):** más restrictiva por su impacto operativo. Si la comanda se rasga, se mancha o se pierde, un usuario con permiso (supervisor o superior) puede reimprimir desde "Pedidos en curso" → ticket → "Reimprimir comanda". Cajeros pueden solicitar la reimpresión con PIN de supervisor (patrón de la sección 2.3).

Ambas reimpresiones quedan registradas en bitácora con quién, cuándo y de qué ticket/comanda.

### 19.6 Producto que involucra múltiples áreas

Caso real: un platillo que necesita carne (parrilla) + ensalada (cocina fría). Opciones:

- **Opción A (recomendada):** el producto se duplica en ambas impresoras con etiqueta "[1 de 2]" y "[2 de 2]" para que cocina coordine
- **Opción B:** se imprime en una impresora "principal" y se coordina verbalmente entre áreas

VIM POS implementa la Opción A por defecto. El admin puede configurar la Opción B por producto si lo prefiere.

### 19.7 Fallo de impresora

Si la impresora de cocina falla:
- El sistema marca el ticket con un ícono de advertencia
- Permite al cajero llevar el pedido a cocina verbalmente o mostrar pantalla
- Encola la comanda para reimprimir cuando la impresora vuelva
- Alerta al admin

---

## 20. Estado de cocina del ticket

### 20.1 Atributo paralelo al estado fiscal

El `/core` define el atributo `estado_cocina` del ticket, **paralelo** al estado fiscal (sección 1.3). Permite saber dónde está cada pedido sin mezclar conceptos.

```
[SIN_ENVIAR] ──cobro o envío manual──> [EN_COCINA] ──cocina marca listo──> [LISTO] ──entregar──> [ENTREGADO]
```

- **SIN_ENVIAR:** el ticket existe pero no se ha mandado a cocina todavía
- **EN_COCINA:** comanda impresa, cocina está preparando
- **LISTO:** cocina avisó que está listo (en MVP: por voz del cocinero o botón "Listo" desde una pantalla simple del rol Personal; en Fase 2: KDS)
- **ENTREGADO:** el cliente recibió su pedido

Un ticket puede estar `PAGADO` + `EN_COCINA`, o `PAGADO` + `LISTO`, o `PAGADO` + `ENTREGADO`.

### 20.2 Estados adicionales para delivery propio

Cuando el modo es `DELIVERY_PROPIO`, el `estado_cocina` se extiende:

```
... [LISTO] ──asignar repartidor──> [EN_RUTA] ──confirmar entrega──> [ENTREGADO_DOMICILIO]
```

- **EN_RUTA:** repartidor recogió el pedido y va camino al cliente
- **ENTREGADO_DOMICILIO:** repartidor confirmó entrega exitosa (puede incluir cobro si era "pago al recibir")

### 20.3 Transiciones permitidas

| Desde | A | Quién puede transicionar |
|---|---|---|
| `SIN_ENVIAR` | `EN_COCINA` | Sistema (al cobrar) o cajero (envío manual) |
| `EN_COCINA` | `LISTO` | Personal (cocinero) o cajero |
| `LISTO` | `ENTREGADO` | Personal (entrega), cajero |
| `LISTO` | `EN_RUTA` | Personal (repartidor) o cajero (delivery propio) |
| `EN_RUTA` | `ENTREGADO_DOMICILIO` | Personal (repartidor) o cajero |
| Cualquiera | (reversa) | Solo supervisor o admin con PIN, queda en bitácora |

### 20.4 Quién marca cada estado

Depende de la configuración del negocio y la presencia del rol Personal:

- **Negocios con personal de cocina registrado:** cada cocinero marca "listo" desde la pantalla simple de "Pedidos en curso" del rol Personal
- **Negocios pequeños (un foodtruck con un solo operador):** el mismo cajero marca todo
- **Fase 2 con KDS:** la transición se hace automáticamente desde la pantalla de cocina

---

## 21. Flujo de entrega del pedido al cliente

### 21.1 Métodos de aviso de "listo" (MVP)

En el MVP sin KDS, cocina avisa:

| Método | Cómo |
|---|---|
| **Voz** | Cocinero grita "1043 listo" o el nombre del cliente |
| **Display físico** | Pantalla externa (TV con folios) — opcional, no requiere KDS interactivo |
| **Buzzer** | Algunos negocios entregan un buzzer al cliente — fuera del scope inicial de software |
| **Notificación SMS/WhatsApp** | Fase 2, opcional con módulo de comunicaciones |

### 21.2 Marcar pedido como entregado

**Paso 1.** Usuario (cajero o Personal de entrega) ve el pedido en "Pedidos en curso" con estado `LISTO`.

**Paso 2.** Cuando el cliente recibe el pedido, toca "Marcar entregado":

```
┌─────────────────────────────────────────┐
│   ENTREGAR PEDIDO #1043                 │
├─────────────────────────────────────────┤
│   Cliente: Para llevar                  │
│   Productos: 4 ítems                    │
│                                         │
│   Verifica (opcional, configurable):    │
│   [ ] Pedido completo                   │
│   [ ] Empaque correcto                  │
│   [ ] Salsas/cubiertos incluidos        │
│                                         │
│         [ Cancelar ]   [ Entregado ]    │
└─────────────────────────────────────────┘
```

> El checklist de entrega es **opcional configurable** por el negocio (sección 28). Útil cuando el negocio nota errores de entrega frecuentes.

**Paso 3.** Ticket pasa a `estado_cocina = ENTREGADO`. Desaparece de "Pedidos en curso".

### 21.3 Reglas

- Un pedido debe pasar por `LISTO` antes de `ENTREGADO` (no se puede saltar)
- Si por error se marca como entregado antes de tiempo, supervisor puede revertir con PIN
- Tiempo desde cobro hasta entrega se registra para reportes de tiempos de preparación

---

## 22. Flujo de delivery propio

> Aplica a 4 verticales: Quick Service, Foodtruck, Café & Bar, Full Service. Por eso vive en el `/core`.

> **Nota MVP — versión simplificada para Knock-Out:**
>
> El MVP de Knock-Out implementa una **versión simplificada** del delivery propio que omite los estados intermedios pero mantiene la información crítica:
>
> | Componente | En MVP | En Fase 2+ |
> |---|---|---|
> | Asignación de repartidor | ✅ Sí | ✅ Sí |
> | Captura de dirección y cliente | ✅ Sí | ✅ Sí |
> | Cobro: efectivo al recibir o anticipado | ✅ Sí | ✅ Sí |
> | **Hora de salida** (timestamp) | ✅ Sí | ✅ Sí |
> | **Hora de regreso** (timestamp) | ✅ Sí | ✅ Sí |
> | Liquidación al regreso (monto cobrado vs esperado) | ✅ Sí | ✅ Sí |
> | Diferencia bloqueante en liquidación | ✅ Sí | ✅ Sí |
> | Estados intermedios `EN_RUTA`, `ENTREGADO_DOMICILIO` | ❌ No (solo PAGADO/CANCELADO) | ✅ Sí |
> | Reportes de tiempos promedio | ❌ No (datos guardados, sin cálculos) | ✅ Sí |
> | Dashboard "pedidos en ruta ahora" | ❌ No | ✅ Sí |
> | Tracking GPS del repartidor | ❌ No | ✅ Fase 3+ |
>
> **Razón arquitectónica:** los timestamps de salida/regreso quedan guardados en BD desde el MVP. Cuando Fase 2 agregue estados intermedios y reportes de tiempos, no requiere migración de datos — solo agrega lógica sobre datos existentes.

### 22.1 Precondiciones

- Modo del ticket = `DELIVERY_PROPIO`
- Cliente con teléfono capturado
- Dirección de entrega capturada
- Negocio tiene al menos un usuario con subtipo "Repartidor" (o el cajero mismo puede asumir el rol)

### 22.2 Flujo paso a paso

**Paso 1 — Toma del pedido:**
Cajero arma ticket, elige modo `DELIVERY_PROPIO`, captura cliente y dirección (ver secciones 5 y 6).

**Paso 2 — Cobro o pago al recibir:**
Al cobrar, el sistema pregunta cómo se procesa el pago:

```
┌─────────────────────────────────────────┐
│   COBRAR — DELIVERY PROPIO              │
├─────────────────────────────────────────┤
│   Total: $394.40                        │
│                                         │
│   ¿Cómo cobra el cliente?               │
│                                         │
│   ( ) Pagar ahora (efectivo/tarjeta/    │
│       transferencia en POS)             │
│                                         │
│   (•) Pagar al recibir                  │
│                                         │
│   Si elige "pagar al recibir":          │
│   El repartidor cobra en domicilio.     │
│   Método esperado:                      │
│   [ Efectivo ▼ ]                        │
│                                         │
│   Cambio que necesita el cliente:       │
│   $ [ 0.00 ] (opcional, para que el     │
│   repartidor lleve cambio)              │
│                                         │
│         [ Cancelar ]   [ Continuar ]    │
└─────────────────────────────────────────┘
```

**Paso 3 — Si "pagar ahora":** flujo normal de cobro (sección 17). Ticket pasa a `PAGADO` + `estado_cocina = SIN_ENVIAR` o `EN_COCINA` según política.

**Paso 4 — Si "pagar al recibir":**
- El ticket queda en estado `ABIERTO` (no `PAGADO`) hasta que el repartidor confirme el cobro
- La comanda se imprime y se manda a cocina igual
- El ticket muestra etiqueta visible "PAGO AL RECIBIR"

**Paso 5 — Cocina prepara:** flujo normal. Cuando termina, marca `LISTO`.

**Paso 6 — Asignar repartidor:**
Cuando el pedido está `LISTO`, aparece en una vista especial "Pedidos para repartir":

```
┌─────────────────────────────────────────┐
│   ASIGNAR REPARTIDOR                    │
├─────────────────────────────────────────┤
│   Pedido #1043                          │
│   Cliente: María López                  │
│   Dirección: Av. López Mateos 234       │
│   Tel: 477 123 4567                     │
│   Pago: Pendiente (al recibir, efectivo)│
│   Cambio para: $0.00                    │
│                                         │
│   Repartidores disponibles:             │
│   👤 Juan P. (2 entregas activas)       │
│   👤 Pedro M. (1 entrega activa)        │
│   👤 Luis G. (libre)                    │
│                                         │
│         [ Cancelar ]   [ Asignar ]      │
└─────────────────────────────────────────┘
```

Repartidor puede ser:
- Un usuario con subtipo "Repartidor" del rol Personal
- Un "repartidor eventual" (nombre libre, sin registro en el sistema)

**Paso 7 — Pedido en ruta:**
Ticket pasa a `estado_cocina = EN_RUTA`. El repartidor recoge el pedido físico y sale.

**Paso 8 — Confirmación de entrega:**
Cuando el repartidor regresa (o desde la app móvil si la tiene, futuro):

- **Si era "pagar ahora":** simplemente marca `ENTREGADO_DOMICILIO`
- **Si era "pagar al recibir":** busca el ticket en "Pendientes de cobro por delivery", captura el pago en efectivo (o el método real usado), cambio entregado, y marca `ENTREGADO_DOMICILIO`. El ticket pasa a `PAGADO`.

**Paso 9 — Casos especiales:**
- **Cliente no estuvo:** el repartidor regresa con el pedido. Cajero/supervisor decide: reintentar, devolver el dinero (si fue pago anticipado), o cancelar.
- **Cliente no quiso pagar (en pago al recibir):** ticket se cancela con motivo "Cliente no pagó" (sección 13). Si el producto se trae de regreso, se evalúa devolución a inventario.
- **Cliente recibió pero hubo problema:** queja se procesa con flujo de devolución (sección 15).

### 22.3 Reportes de delivery propio

Ver sección 29 para reportes específicos de delivery (tiempo promedio de entrega, entregas por repartidor, etc.).

### 22.4 Reglas

- Pedidos en `EN_RUTA` cuentan como "activos" para el repartidor — el sistema sabe cuántos lleva
- Tiempo desde `LISTO` hasta `ENTREGADO_DOMICILIO` se registra para análisis
- Si un repartidor lleva más de X minutos en `EN_RUTA` (configurable, default 60), el sistema alerta al admin
- Si el cliente tiene historial de "no pagó al recibir" repetidamente, el sistema sugiere bloquear o exigir pago anticipado

---

## 23. Flujo de apps externas (Rappi, Uber Eats, Didi)

> El `/core` define la captura manual de pedidos de apps externas. La integración API automática es del módulo Dark Kitchen (`/modules/darkkitchen`).

### 23.1 Cuándo aplica

Cuando el negocio recibe un pedido de Rappi/Uber/Didi/iFood mediante:
- Notificación en celular del repartidor de la app
- Pantalla externa de la plataforma (algunos negocios tienen una tablet de Rappi separada)
- Llamada de la app

El cajero **captura manualmente** el pedido en VIM POS para que la cocina lo prepare y para que la venta quede registrada en reportes.

### 23.2 Flujo paso a paso

**Paso 1.** Cajero arma el ticket normalmente con los productos pedidos.

**Paso 2.** Define modo como `APP_RAPPI` (o el que corresponda).

**Paso 3.** Al cobrar, el sistema pide el folio externo:

```
┌─────────────────────────────────────────┐
│   COBRAR — RAPPI                        │
├─────────────────────────────────────────┤
│   Total: $394.40                        │
│                                         │
│   Pedido capturado desde app externa.   │
│                                         │
│   Folio de la app:                      │
│   [ R-A4F92B__________________________ ]│
│                                         │
│   Esta venta se marcará como:           │
│   "Pagada por Rappi — pendiente         │
│    liquidación".                        │
│                                         │
│   El monto NO entra a caja física hoy.  │
│   Se concilia con el estado de cuenta   │
│   semanal/quincenal de Rappi.           │
│                                         │
│         [ Cancelar ]   [ Confirmar ]    │
└─────────────────────────────────────────┘
```

**Paso 4.** Ticket pasa a `PAGADO` (para fines de cocina e inventario), pero internamente queda etiquetado como "Pagada por [App] — pendiente liquidación".

**Paso 5.** Comanda se imprime y va a cocina como cualquier otro.

**Paso 6.** Cuando está listo, el repartidor de la app pasa por el pedido (no es repartidor del negocio).

### 23.3 Impacto en caja y reportes

- El monto **NO afecta el efectivo en caja** (el cliente no le pagó al negocio directamente)
- En el reporte del corte aparece desglosado: "Ventas por liquidar — Rappi: $X (N tickets)"
- Existe un reporte separado de "Ventas por liquidar por app" donde el admin concilia contra el estado de cuenta de cada plataforma cuando llega

### 23.4 Configuración por app

El admin puede configurar por cada app externa (sección 28):
- ¿Está activa esta app?
- Margen / comisión que cobra la app (para que el reporte de rentabilidad real sea preciso)
- Si el folio externo es obligatorio (default: sí)
- Si esta app permite cancelación desde el POS o no
- Si el menú en VIM POS difiere del menú en la app (los precios en apps suelen estar inflados para compensar la comisión)

### 23.5 Cancelación de pedido de app externa

Si la app cancela el pedido (cliente lo canceló en la plataforma):
- Cajero busca el ticket por folio externo
- Cancela el ticket con motivo "Cancelado por app"
- Si la comanda ya estaba en cocina, alerta a cocina para detener preparación
- Queda en bitácora con etiqueta especial para conciliación

### 23.6 Reglas

- Toda venta por app externa tiene folio externo obligatorio
- Una venta por app no genera CFDI inmediato; va a la global diaria (sección 18.4) — la facturación al cliente final es responsabilidad de la app
- Los reportes distinguen venta directa vs. venta por app para análisis de rentabilidad

---

# Parte VII — Cierre y conciliación

---

## 24. Flujo de cierre de turno (corte de caja)

> Este es el flujo más importante operativamente. Si falla, el dueño pierde control de su efectivo.

### 24.1 Cuándo se ejecuta

- Cuando el cajero termina su jornada y no entra otro a relevarlo
- Al final del día de operación
- En auditoría sorpresa (cierre forzado por admin)

### 24.2 Flujo paso a paso

**Paso 1.** Cajero toca menú → "Cerrar turno":

```
┌─────────────────────────────────────────┐
│   CERRAR TURNO                          │
├─────────────────────────────────────────┤
│   Cajero: María G.                      │
│   Turno desde: 09:32                    │
│   Hora actual: 22:14                    │
│                                         │
│   ⚠️ Antes de cerrar, asegúrate de:     │
│   • No haber dejado tickets abiertos    │
│   • Tener el efectivo físico contado    │
│   • Tener los vouchers de tarjeta       │
│                                         │
│   Tickets abiertos: 0 ✓                 │
│                                         │
│         [ Volver ]     [ Continuar ]    │
└─────────────────────────────────────────┘
```

Si hay tickets abiertos o pedidos en espera, el sistema **no permite cerrar** hasta resolverlos (cobrar o cancelar).

**Paso 2.** Resumen de operación (esperado, calculado por el sistema):

```
┌─────────────────────────────────────────┐
│   RESUMEN ESPERADO DEL TURNO            │
├─────────────────────────────────────────┤
│   VENTAS:                               │
│     Tickets cobrados:    87             │
│     Tickets cancelados:   3             │
│     Devoluciones:         1             │
│     Ventas brutas:    $24,560.00        │
│     Devoluciones:       -$130.00        │
│     Descuentos:         -$420.00        │
│     Ventas netas:    $24,010.00         │
│                                         │
│   POR MÉTODO DE PAGO:                   │
│     💵 Efectivo:      $8,420.00         │
│     💳 Tarjeta:      $12,580.00         │
│     🏦 Transferencia: $2,160.00         │
│     🎟️ Vales:           $850.00         │
│                                         │
│   VENTAS POR LIQUIDAR (NO EN CAJA):     │
│     📱 Rappi:         $1,840.00 (12)    │
│     📱 Uber Eats:       $920.00 (6)     │
│                                         │
│   MOVIMIENTOS DE CAJA:                  │
│     Fondo apertura:   $3,810.00         │
│     Sangrías:        -$1,500.00         │
│     Depósitos:         +$500.00         │
│                                         │
│   EFECTIVO ESPERADO EN CAJA:            │
│     $3,810 + $8,420 - $1,500 + $500     │
│     = $11,230.00                        │
│                                         │
│         [ Volver ]    [ Contar caja ]   │
└─────────────────────────────────────────┘
```

**Paso 3.** Conteo físico del efectivo:

```
┌─────────────────────────────────────────┐
│   CONTEO FÍSICO DE EFECTIVO             │
├─────────────────────────────────────────┤
│   Billetes:                             │
│     $1,000  [  5 ] = $5,000.00          │
│     $500    [  8 ] = $4,000.00          │
│     $200    [  6 ] = $1,200.00          │
│     $100    [  8 ] = $800.00            │
│     $50     [  2 ] = $100.00            │
│     $20     [  4 ] = $80.00             │
│                                         │
│   Monedas:                              │
│     $10     [ 3 ] = $30.00              │
│     $5      [ 2 ] = $10.00              │
│     $2      [ 3 ] = $6.00               │
│     $1      [ 4 ] = $4.00               │
│     $0.50   [ 0 ] = $0.00               │
│                                         │
│   TOTAL CONTADO: $11,230.00             │
│                                         │
│         [ Atrás ]    [ Continuar ]      │
└─────────────────────────────────────────┘
```

> **Importante:** el sistema **no muestra el monto esperado durante el conteo** para evitar que el cajero "cuadre a fuerzas". Solo lo revela en el siguiente paso, después de capturar el conteo real.

**Paso 4.** Comparación esperado vs. contado:

```
┌─────────────────────────────────────────┐
│   RESULTADO DEL CORTE                   │
├─────────────────────────────────────────┤
│   Esperado:    $11,230.00               │
│   Contado:     $11,230.00               │
│                                         │
│   Diferencia:    $0.00  ✓ CUADRA        │
│                                         │
│         [ Cerrar turno ]                │
└─────────────────────────────────────────┘
```

**Caso con diferencia:**

```
┌─────────────────────────────────────────┐
│   RESULTADO DEL CORTE                   │
├─────────────────────────────────────────┤
│   Esperado:    $11,230.00               │
│   Contado:     $11,180.00               │
│                                         │
│   Diferencia:   -$50.00  ⚠️ FALTANTE    │
│                                         │
│   Justificación (obligatoria):          │
│   ( ) Error en cambio dado al cliente   │
│   ( ) Billete falso detectado tarde     │
│   ( ) Pérdida no identificada           │
│   ( ) Sangría no registrada             │
│   ( ) Otro: [______________________]    │
│                                         │
│   Descripción:                          │
│   [____________________________________]│
│                                         │
│   🔒 LA CAJA QUEDARÁ BLOQUEADA hasta    │
│   que un administrador valide el cierre │
│   con su PIN. No podrá abrirse un       │
│   nuevo turno en esta caja hasta        │
│   entonces.                             │
│                                         │
│         [ Recontar ]   [ Continuar ]    │
└─────────────────────────────────────────┘
```

**Paso 5.** Cierre y comprobante.

- **Si cuadra** → turno pasa a `CERRADO` directamente. Caja queda libre para nueva apertura.
- **Si hay diferencia** → turno pasa a `PENDIENTE_VALIDACIÓN`. **La caja queda bloqueada**. El sistema:
  - Envía notificación inmediata al admin (push + email)
  - Bloquea el botón de "Abrir turno" en esta caja con el mensaje: "Caja bloqueada. Turno anterior pendiente de validación por administrador."
  - Imprime el comprobante con sello "PENDIENTE DE VALIDACIÓN"

**Paso 6 (validación por admin, asíncrono).** El admin se acerca a la caja (o entra desde el panel web) e introduce su PIN:

```
┌─────────────────────────────────────────┐
│   VALIDAR CIERRE PENDIENTE              │
├─────────────────────────────────────────┤
│   Turno #2026-05-17-C01-01              │
│   Cajero: María G.                      │
│   Cerrado: 17/05/2026 22:14             │
│                                         │
│   Esperado:    $11,230.00               │
│   Contado:     $11,180.00               │
│   Diferencia:   -$50.00 (FALTANTE)      │
│                                         │
│   Justificación del cajero:             │
│   "Error en cambio dado al cliente —    │
│    cliente joven, ticket de $487, di    │
│    cambio de un $500 sin cobrar."       │
│                                         │
│   ⚠️ Reincidencia: este cajero acumula  │
│   3 cierres con diferencia en 14 días.  │
│                                         │
│   Decisión del admin:                   │
│   ( ) Aceptar diferencia (asumir como   │
│       merma del negocio)                │
│   ( ) Dejar registrada como pendiente   │
│       de resolución externa             │
│   ( ) Marcar como pendiente investiga-  │
│       ción (no se cierra todavía)       │
│                                         │
│   Notas del admin:                      │
│   [____________________________________]│
│                                         │
│   PIN admin: [● ● ● ● ]                 │
│                                         │
│         [ Cancelar ]    [ Validar ]     │
└─────────────────────────────────────────┘
```

> **Importante:** el sistema **no aplica deducciones automáticas al cajero**. Si el dueño decide cargar la diferencia al cajero (por política interna del negocio), eso se resuelve **fuera del sistema** mediante acuerdos directos con el empleado. VIM POS solo registra qué pasó, quién operó, quién autorizó, y cuál fue la decisión del admin para fines de trazabilidad y nómina externa.

> **Alerta de reincidencia:** el sistema avisa al admin cuando un cajero acumula N cierres con diferencia en M días (configurable por el negocio, default: 3 cierres en 14 días). Esto permite al dueño detectar patrones sin que el sistema tome decisiones por él.

Si el admin elige las dos primeras opciones → turno pasa a `CERRADO`, caja se desbloquea. Si elige "pendiente investigación", el turno sigue en estado `PENDIENTE_VALIDACIÓN` y la caja sigue bloqueada hasta nueva decisión.

**Comprobante impreso (Reporte X / corte de caja):**

```
═══════════════════════════════════
       KNOCK-OUT BURGER
       León Centro — Caja 01
═══════════════════════════════════
       CORTE DE CAJA
       Turno #2026-05-17-C01-01

  Cajero:    María G.
  Apertura:  17/05/2026 09:32
  Cierre:    17/05/2026 22:14
  Duración:  12h 42min

───────────────────────────────────
VENTAS
  Brutas:           $24,560.00
  Descuentos:         -$420.00
  Devoluciones:       -$130.00
  NETAS:            $24,010.00

  Tickets cobrados:        87
  Cancelados:               3
  Ticket promedio:     $276.00

POR MÉTODO DE PAGO
  Efectivo:          $8,420.00
  Tarjeta:          $12,580.00
  Transferencia:     $2,160.00
  Vales:               $850.00

VENTAS POR LIQUIDAR
  Rappi:             $1,840.00
  Uber Eats:           $920.00

MOVIMIENTOS DE CAJA
  Fondo apertura:    $3,810.00
  Sangrías (2):     -$1,500.00
  Depósitos (1):       +$500.00

EFECTIVO
  Esperado:         $11,230.00
  Contado:          $11,180.00
  Diferencia:          -$50.00

───────────────────────────────────
PRODUCTOS TOP
  1. Hamb. Clásica       (42)
  2. Papas medianas      (38)
  3. Refresco            (35)

───────────────────────────────────
  Cajero:    _______________
  Supervisor: _______________
═══════════════════════════════════
```

### 24.3 Reglas

- Un turno cerrado **no se puede reabrir** (excepto por dueño, vía reporte de auditoría).
- Todo cierre con diferencia requiere justificación obligatoria.
- **Cierre con diferencia bloquea la caja físicamente:** no se puede abrir un nuevo turno en esa caja hasta que el admin valide con su PIN. Si la caja es la única de la sucursal, la operación se detiene — esto es intencional, fuerza al negocio a tomarse en serio las diferencias.
- El reporte se imprime automáticamente al cerrar; se puede reimprimir desde reportes.
- En caso de emergencia operativa (admin no disponible), el dueño puede desbloquear remotamente desde el panel web.

---

## 25. Flujo de cierre de día (Z global)

### 25.1 Diferencia con cierre de turno

- **Cierre de turno:** una caja, un cajero, una sesión.
- **Cierre de día (Z):** consolidación de todos los turnos de todas las cajas de la sucursal en el día contable.

### 25.2 Hora de ejecución del cierre de día

**Decisión cerrada:**

- **Default global:** **3:00 AM hora del negocio**
- Cubre la mayoría de casos restauranteros mexicanos (ya cerraron los bares, todavía no empieza la operación del día siguiente)
- Negocios con horarios atípicos pueden configurar otra hora (configuración del negocio §28)

### 25.3 Manejo de turnos que cruzan medianoche

**Decisión cerrada:** los turnos que cruzan la medianoche se asignan contablemente al **día en que se ABRIÓ el turno**, no al día en que se cobró.

**Ejemplo:** una cantina abrió turno el viernes 23 a las 8 PM. Cobró su último ticket el sábado 24 a las 2:30 AM. Todas esas ventas se asignan contablemente al **viernes 23**.

**Razones:**
- Es la práctica contable mexicana estándar
- Coincide con cómo el SAT espera el reporte
- IVA, reportes, conciliaciones — todo se asigna al día de apertura
- Coherente con la realidad operativa del negocio (es "el turno del viernes")

**Implementación técnica:** cada ticket lleva un campo `dia_contable` que se asigna al momento de apertura del turno y NO cambia, aunque el cobro suceda al día siguiente cronológico.

### 25.4 Flujo (mayormente automático)

**Paso 1.** A las 3:00 AM (hora del negocio), el sistema:

1. Verifica que todos los turnos del día contable estén cerrados
2. Si hay alguno abierto, envía alerta al admin (no ejecuta cierre)
3. Si todo está cerrado, ejecuta el cierre de día

**Paso 2.** Genera:

- Reporte Z consolidado del día (todas las cajas)
- Factura global de público en general (cuando módulo CFDI activo — Fase Final)
- Snapshot de inventario (si el módulo está activo)
- Sincronización de datos a backups y dashboard del dueño

**Paso 3.** Notificación al dueño y admin con resumen del día por email/push.

### 25.5 Modo manual

El admin también puede forzar el cierre de día desde su panel.

---

# Parte VIII — Sistema y soporte

---

## 26. Manejo de contingencias

### 26.1 Internet caído

**Comportamiento:** el sistema entra en **modo offline automáticamente** y permite:

- Registrar ventas
- Imprimir tickets (sin folio fiscal todavía)
- Recibir pagos
- Hacer corte de caja

**No permite (sin internet):**

- Timbrar CFDI inmediato (queda en cola para timbrar al recuperar conexión)
- Validar RFC en padrón SAT
- Procesar pagos con terminal integrada al sistema
- Sincronizar con dashboard del dueño en tiempo real

Cuando regresa la conexión, el sistema **sincroniza automáticamente** todas las operaciones pendientes.

### 26.2 Impresora caída

- El sistema permite seguir vendiendo
- Los tickets se guardan en cola para imprimir después
- Opcionalmente, se puede enviar el ticket por email/WhatsApp al cliente
- Alerta visible en pantalla hasta que se restablece

### 26.3 Caída del POS (apagón, crash de tablet)

- Al volver a abrir el sistema, recupera el último estado conocido
- Tickets en estado `ABIERTO` siguen disponibles
- El turno sigue activo si no se cerró formalmente

### 26.4 Falla del PAC (timbrado)

- Las facturas pendientes se acumulan en cola automática
- Sistema avisa al admin con notificación push y email
- Cuando el PAC vuelve, procesa la cola automáticamente sin intervención
- El cajero puede seguir cobrando todo el tiempo (no se detiene la operación de ventas)
- **Decisión de arquitectura:** VIM POS opera con un único PAC. La arquitectura está preparada para sumar PACs adicionales en el futuro si la confiabilidad lo justifica, pero al inicio se prioriza simplicidad operativa y un solo contrato con PAC.

---

## 27. Trazabilidad y auditoría

### 27.1 Principio

**Todo evento operativo queda registrado.** Nada se borra de la base de datos. Las operaciones "destructivas" (cancelar ticket, anular pago) son cambios de estado, no eliminaciones.

### 27.2 Eventos registrados en bitácora

- Login y logout de usuarios
- Apertura y cierre de turnos
- Creación, modificación, cancelación de tickets
- Aplicación de descuentos y cortesías (manuales y automáticos)
- Sangrías y depósitos
- Devoluciones
- Cambios de modo de servicio
- Reimpresiones de comanda
- Transiciones de estado_cocina (especialmente reversas)
- Cambios de configuración
- Errores y reintentos del sistema

Cada registro incluye: **quién, qué, cuándo, desde dónde (caja), por qué (motivo cuando aplica), quién autorizó (cuando aplica).**

### 27.3 Acceso a la bitácora

- **Admin y dueño:** acceso completo, búsqueda y exportación
- **Supervisor:** acceso a su turno y los eventos que autorizó
- **Cajero:** acceso solo a sus propios eventos

---

## 28. Configuración del negocio

> Esta sección concentra todo lo que es configurable por el admin del negocio. Antes estaba esparcido entre los flujos; aquí se ve panorámicamente.

> **Nota sobre plataformas soportadas:**
>
> | Fase del producto | Plataformas |
> |---|---|
> | **MVP (clientes internos)** | Web app: Chrome en Android (tablets y teléfonos) + Chrome en Desktop. iOS/iPad **no soportado** en MVP. |
> | **Fase 2 (SaaS comercial inicial)** | Sigue siendo web puro. Primeros clientes externos en Android/Desktop. |
> | **Fase 3 (SaaS comercial expandido)** | Migración a Capacitor: Android nativo + **iOS nativo** + Desktop + Web. Mismo código base. |
>
> Los flujos descritos en este documento son **agnósticos de la plataforma**. La experiencia operativa del cajero es la misma sea web puro o Capacitor nativo. La diferencia es solo de distribución, hardware soportado, y acceso a APIs periféricas avanzadas (USB completo, NFC, etc.) que llegan con Capacitor.

### 28.1 Configuración fiscal y de facturación

- RFC, razón social, régimen del negocio
- CSD (certificado de sello digital) cargado y vigente
- PAC contratado y credenciales
- Serie y folio inicial para CFDI
- Logo y datos de marca para tickets
- Plantillas de email para envío de facturas
- Política de facturación global: hora de cierre del día contable

### 28.2 Configuración de operación general

- **Modos de servicio activos** (subset del catálogo de la sección 6.1)
- **Política de captura de fondo de caja:** por denominación (default) / por monto total
- **Fondo de caja estándar:** monto pre-llenado al abrir turno (opcional)
- **Umbral de sangría sin autorización:** monto bajo permitido sin PIN (default $0, todas requieren)
- **Permisos personalizados:** ajustes finos sobre la matriz base
- **Política de cobro a cocina:** cobrar primero (default) / mandar a cocina primero / híbrido por modo
- **Checklist de entrega:** activar o no, qué ítems verificar
- **Tiempo de alerta para pedidos en espera abandonados:** default 30 min
- **Política de reimpresión de ticket pagado:** por default disponible para todos los roles operativos (cajero, supervisor, admin, dueño). El admin puede restringir si su política lo requiere
- **Política de reimpresión de comanda:** ver sección 19.5 — supervisor o superior por default, cajero con PIN
- **Alertas de reincidencia de diferencias por cajero:** activado por default. Umbrales configurables (default: 3 cierres con diferencia en 14 días disparan alerta al admin)
- **Política de redondeo en efectivo:** default sin redondeo (precio exacto). Configurable a "redondeo al peso" si el negocio lo requiere
- **Sugerencia de propina:** desactivada por default. Activar si aplica al vertical
- **Tiempo estimado al cliente:** desactivado por default. El sistema no comunica tiempos estimados al cliente final
- **Notificaciones SMS/WhatsApp al cliente:** no disponibles en MVP. Arquitectura preparada para activación futura

### 28.2.bis Módulos opcionales activables por negocio

VIM POS distingue funcionalidades **núcleo** (siempre activas) de funcionalidades **opcionales** que el negocio activa según necesidad. Cada módulo opcional puede activarse/desactivarse desde el panel admin:

| Módulo | Default | Quién lo activaría |
|---|---|---|
| **CFDI 4.0 (facturación electrónica)** | Inactivo en MVP | Cuando el negocio quiere emitir facturas (fase final del producto) |
| **Inventario y recetas** | Inactivo | Negocios que quieren control de insumos, costos, stock mínimo |
| **CRM avanzado (lealtad, puntos)** | Inactivo | Negocios con clientela recurrente (add-on pagado en SaaS) |
| **Display al cliente** | Inactivo | Negocios que quieren pantalla secundaria mostrando ticket en construcción |
| **Múltiples impresoras térmicas** | Configurable desde MVP | Negocios con áreas de cocina separadas |
| **Delivery propio** | Inactivo | Negocios con flotilla de repartidores propia |
| **Apps externas (Rappi/Uber/Didi)** | Inactivo | Negocios dados de alta en plataformas |

Cada módulo se documenta en su sección correspondiente y la arquitectura del software garantiza que **no estar activado no rompe nada**.

### 28.3 Configuración del catálogo

- **Categorías** (nombre, orden, color)
- **Productos** (nombre, precio, foto, categoría, modificadores aplicables, área de cocina, disponibilidad por modo, configuración fiscal SAT)
- **Grupos de modificadores** (nombre, tipo, opciones, productos aplicables)
- **Promociones automáticas** (sección 14.6)

### 28.4 Configuración de áreas de cocina

- **Lista de áreas activas** (cocina caliente, fría, barra, etc.)
- **Impresoras por área** (qué impresora térmica corresponde a cada área)
- **Asignación producto → área**
- **Formato de comanda por área** (campos visibles, tamaño de letra)

### 28.5 Configuración de delivery propio

- **Activación del modo:** sí / no
- **Zonas de cobertura** (futuro, no MVP)
- **Costo de envío:** gratis / fijo / por zona / por distancia
- **Tiempo estimado de entrega base**
- **Lista de repartidores fijos** (usuarios con subtipo Repartidor) + permitir eventuales

### 28.6 Configuración de apps externas

- **Apps activas** (Rappi, Uber Eats, Didi Food, iFood, otras)
- **Margen / comisión por app** (para reportes de rentabilidad real)
- **Folio externo obligatorio o no**
- **Menú diferenciado por app** (futuro, no MVP)

### 28.7 Configuración de métodos de pago

- **Métodos activos:** habilitar/deshabilitar cada método según realidad del negocio
- **Vales aceptados:** lista específica (Sodexo, Edenred, Vales Sí, etc.)
- **Política de cambio en efectivo:** sin redondeo por default (precio exacto). El negocio puede activar redondeo opcional al peso si su operación lo justifica
- **Sugerencias de propina:** opt-in del negocio. Si lo activa, define los porcentajes sugeridos (típico: 10%, 15%, 20%) y si aparece la opción "otro monto". Default: desactivado. Se vuelve relevante en verticales con servicio (Full Service, Café & Bar) y rara vez en QS

### 28.8 Configuración de sucursales y cajas

- **Lista de sucursales** con dirección y horario
- **Cajas por sucursal** con identificador
- **Asignación cajero → sucursal**
- **Configuraciones específicas por sucursal** (override de la del negocio cuando aplica)

### 28.9 Configuración de usuarios y roles

- **Lista de usuarios** con rol y PIN
- **Permisos personalizados** sobre cada rol
- **Subtipos del rol Personal** activos en este negocio (ver sección 30)
- **Política de bloqueo:** intentos máximos, tiempo de bloqueo

---

## 29. Reportes del `/core`

> Estos reportes son comunes a todos los verticales. Cada vertical agrega sus reportes específicos en su propio módulo.

### 29.1 Reportes operativos diarios

- **Ventas del día:** totales, por sucursal, por caja, por cajero
- **Tickets cobrados, cancelados, devoluciones**
- **Cortes de caja del día:** todos los turnos cerrados con sus diferencias
- **Productos más vendidos:** top N por unidades y por monto
- **Métodos de pago utilizados:** desglose con %
- **Ticket promedio**
- **Hora pico:** mayor cantidad de tickets por hora

### 29.2 Reportes financieros

- **Ventas vs. periodo anterior:** comparativos día, semana, mes, año
- **Descuentos otorgados:** desglosado manual vs. automático (sección 14.7)
- **Devoluciones:** monto, frecuencia, motivos más comunes
- **Flujo de efectivo:** entradas (ventas + depósitos), salidas (sangrías + devoluciones), neto
- **Ventas por liquidar (apps externas):** pendientes de conciliación con cada plataforma

### 29.3 Reportes fiscales

- **CFDIs emitidos** (con estatus SAT)
- **CFDIs cancelados**
- **Facturación global** (tickets sin factura individual agrupados)
- **Resumen IVA trasladado** del periodo
- **Reporte de timbres usados** vs. disponibles

### 29.4 Reportes de personal

- **Ventas por cajero**
- **Cortes con diferencias por cajero:** tendencias para identificar problemas
- **Cancelaciones autorizadas por supervisor**
- **Descuentos manuales autorizados:** quién autorizó, cuánto, frecuencia
- **Horas operadas por cajero**
- **Registro de asistencia** (entrada/salida) del rol Personal

### 29.5 Reportes de modo de servicio

- **Mix por modo:** % de tickets y monto por modo de servicio
- **Comparativo de modos por hora del día**
- **Modos más rentables** (con datos de costo por modo, si configurado)

### 29.6 Reportes de delivery propio

- **Tickets por repartidor**
- **Tiempo promedio de entrega** (de listo a entregado domicilio)
- **Repartidores con más entregas exitosas**
- **Cancelaciones / devoluciones por delivery**
- **Direcciones / zonas más frecuentes**
- **Patrón de "pago al recibir" exitoso vs. fallido**

### 29.7 Reportes de apps externas

- **Ventas por app** (Rappi, Uber, Didi, etc.)
- **Comparativo: precio en POS vs. precio que cobra la app al cliente**
- **Conciliación con estados de cuenta:** check de lo que la plataforma reportó vs. lo que VIM POS registró
- **Comisiones estimadas pagadas por app**

### 29.8 Reportes de cliente (CRM básico)

- **Clientes más frecuentes** (top por tickets o monto)
- **Clientes con factura solicitada repetidamente** (potenciales clientes corporativos)
- **Clientes bloqueados**
- **Nuevos clientes capturados** por período
- **Tasa de retención** (clientes que vuelven)

### 29.9 Reportes de auditoría

- **Bitácora filtrable y exportable**
- **Eventos críticos:** cancelaciones de monto alto, diferencias en caja, transiciones reversas de estado
- **Accesos administrativos**
- **Cambios de configuración**

### 29.10 Exportación

Todos los reportes pueden:
- Verse en pantalla (dashboard web)
- Exportarse a Excel/CSV
- Programarse como email automático periódico (diario, semanal, mensual)
- Compartirse vía link con expiración

---

## 30. Subtipos extensibles del rol Personal

### 30.1 Concepto

El rol **Personal** del `/core` (sección 2.1) es el "comodín" para personal operativo sin acceso a caja. Pero un cocinero y un repartidor tienen funciones muy distintas, aunque ambos sean "Personal".

VIM POS resuelve esto con **subtipos** del rol Personal. El admin del negocio asigna a cada usuario con rol Personal un subtipo que determina qué pantallas y funciones ve.

### 30.2 Subtipos sugeridos por defecto

| Subtipo | Vertical donde aplica | Capacidades específicas |
|---|---|---|
| **Cocinero** | QS, Foodtruck, Full Service, Café & Bar, Dark Kitchen | Ver cola de cocina, marcar comandas como listas, reportar producto agotado |
| **Ayudante de cocina** | QS, Foodtruck, Full Service, Café & Bar | Ver cola de cocina, NO puede marcar como listo (solo cocinero principal) |
| **Mesero** | Full Service, Café & Bar | Captura comanda asociada a mesa, ve mesas asignadas, gestiona cuentas abiertas, marca propinas |
| **Barista** | Café & Bar | Cola de barra (subset de cocina), gestiona cocteles/bebidas, puede capturar cuenta de barra |
| **Host / Hostess** | Full Service | Gestión de reservaciones y waitlist, asignación de mesas, recibimiento del cliente |
| **Runner / Entrega en mostrador** | QS, Foodtruck, Café & Bar | Ve pedidos listos, marca entregados, lleva pedidos del mostrador a la mesa |
| **Repartidor (delivery propio)** | QS, Foodtruck, Café & Bar, Full Service | Recibe asignación de pedidos, marca en ruta y entregado, captura cobro al recibir si aplica |
| **Armador (Dark Kitchen)** | Dark Kitchen | Confirma pedidos de apps, gestiona empaque multi-marca, marca listos por canal |
| **Personal general** | Todos | Solo asistencia, sin funciones operativas específicas |

### 30.3 Quién define los subtipos

- El `/core` provee la lista anterior como subtipos sugeridos
- El admin del negocio activa los que aplican y puede crear adicionales con nombre libre
- Cada subtipo tiene una pantalla inicial específica (pantalla de cocina, de barra, de repartidor, etc.) que cada vertical define

### 30.4 Capacidades base del rol Personal (universales)

Independientemente del subtipo, todo usuario con rol Personal puede:

- Login con PIN al sistema
- Registrar entrada y salida laboral (reloj checador básico)
- Ver y marcar pedidos según permisos de su subtipo
- Recibir notificaciones del sistema
- Cambiar su propio PIN

### 30.5 Lo que ningún subtipo de Personal puede hacer

- Registrar ventas o cobrar
- Acceder a configuración
- Ver reportes globales (solo los relacionados a su operación)
- Aplicar descuentos
- Cancelar tickets
- Acceder a movimientos de caja
- Modificar el catálogo

---

# Parte IX — Inventario y recetas (módulo opcional)

---

## 31. Visión y activación del módulo

### 31.1 ¿Qué hace este módulo?

El módulo de Inventario y Recetas permite al negocio:

- Llevar control de **insumos** (la materia prima que compra: pan, carne, queso, lechuga, refresco, vasos, etc.)
- Definir **recetas** por producto (qué insumos y cuánto se consumen al vender una unidad)
- **Descontar inventario automáticamente** cada vez que se vende un producto
- Conocer el **costo real** de cada producto y su margen
- **Alertar** cuando un insumo está por debajo del stock mínimo
- Generar **reportes de rotación, valuación y consumo**
- Marcar productos como **agotados automáticamente** cuando no hay insumos suficientes para producirlos

### 31.2 Activación

El módulo es **opcional** y se activa desde la configuración del negocio (sección 28.2.bis). Cuando NO está activo:

- El sistema funciona normalmente como POS de ventas
- El admin puede marcar productos como agotados manualmente (sección 4.6)
- Reportes de costos y márgenes no están disponibles
- No hay alertas de stock

Cuando SÍ está activo:

- Cada venta dispara el descuento automático de insumos según la receta
- Reportes de inventario, costos y márgenes están disponibles
- Alertas de stock mínimo se activan
- Productos sin insumos suficientes se marcan automáticamente como agotados

### 31.3 Filosofía

El módulo busca el balance entre **utilidad operativa real** y **carga de mantenimiento**:

- Captura simple: el admin captura los insumos básicos y las recetas. No requiere conocimiento contable
- Descuento automático: el cajero no hace nada extra al vender — el sistema descuenta solo
- Costos derivados: el sistema calcula costos de producto a partir de costo de insumos × cantidad usada
- Alertas accionables: cuando algo está bajo, el admin se entera antes de que falte
- Reportes simples: rotación, valuación, productos más rentables. No es un ERP completo.

### 31.4 Lo que NO incluye este módulo (por ahora)

Para mantener el alcance manejable:

- ❌ Flujo formal de órdenes de compra a proveedores (entrada de insumos es captura manual)
- ❌ Catálogo de proveedores (solo se anota el proveedor como texto en cada entrada si se desea)
- ❌ Control estructurado de caducidad por lote
- ❌ Transferencias automáticas entre sucursales (solo registros manuales de movimiento)
- ❌ Conteos físicos periódicos guiados (se puede hacer un ajuste manual)
- ❌ Análisis de mermas predictivo

Estas funcionalidades pueden venir como add-on "Inventario Avanzado" o módulo posterior.

---

## 32. Entidad Insumo

### 32.1 ¿Qué es un insumo?

Un **insumo** es cualquier cosa que el negocio compra para producir lo que vende. Ejemplos para Knock-Out Burger:

- Pan de hamburguesa (pieza)
- Carne de res molida (g)
- Queso amarillo (g)
- Tocino (g)
- Lechuga (g)
- Tomate (g)
- Cebolla (g)
- Aceite (ml)
- Sal (g)
- Coca Cola 600ml (pieza)
- Vasos desechables 16oz (pieza)
- Servilletas (pieza)
- Bolsas para llevar (pieza)

### 32.2 Datos del Insumo

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre | Texto | Sí | "Pan de hamburguesa", "Carne molida 80/20" |
| Código interno | Texto | No | Para facilitar búsqueda al admin |
| Categoría de insumo | Texto / catálogo | No | Cárnicos, Lácteos, Bebidas, Empaque, Vegetales, Otros |
| Unidad de medida | Catálogo: g / kg / ml / l / pieza / cm | Sí | Define cómo se almacena y cómo se consume |
| Stock actual | Decimal | Sí (se actualiza solo) | Calculado por movimientos |
| Stock mínimo | Decimal | No | Si se define, dispara alertas |
| Stock máximo | Decimal | No | Útil para informar compras |
| Costo unitario | Decimal | Sí (default 0) | Costo por unidad de medida. Ej. carne $180/kg → costo unitario $0.18/g |
| Método de valuación | Catálogo: último costo / promedio ponderado | Sí (default: promedio ponderado) | Cómo se actualiza el costo cuando entra inventario |
| Notas internas | Texto | No | "Comprar en mercado los lunes" |
| Estado | Activo / Pausado | Sí | Pausado: no aparece en recetas nuevas pero conserva histórico |
| Proveedor preferido | Texto libre | No | Sin catálogo formal todavía |

### 32.3 Insumos vs. Productos

| Aspecto | Insumo | Producto |
|---|---|---|
| ¿Qué es? | Materia prima que compras | Lo que vendes al cliente |
| ¿Lleva precio de venta? | No | Sí |
| ¿Aparece en pantalla de venta? | No | Sí |
| ¿Tiene receta? | No | Opcional (vincula a insumos) |
| ¿Se factura? | No | Sí |
| ¿Se inventaría? | Sí | No directamente; el inventario está en sus insumos |

> **Importante:** un producto **NO se inventaría a sí mismo** salvo casos especiales (ver 33.4 "producto sin receta"). El inventario vive en los **insumos** que componen al producto. Si vendes una hamburguesa, no descuentas "1 hamburguesa del stock" — descuentas 1 pan, 100g de carne, 30g de queso, etc.

### 32.4 Edición de un insumo

El admin puede:
- Crear nuevos insumos
- Editar nombre, unidad, costo, stock mínimo
- Pausar un insumo (no se puede eliminar si está en alguna receta histórica)
- Reactivar un insumo pausado

Cambiar la unidad de medida de un insumo con histórico requiere conversión y queda en bitácora.

---

## 33. Receta de producto

### 33.1 ¿Qué es una receta?

La receta de un producto define **qué insumos y cuánto** se consumen al producirlo. Ejemplo para "Hamburguesa Clásica" de Knock-Out:

| Insumo | Cantidad | Unidad |
|---|---|---|
| Pan de hamburguesa | 1 | pieza |
| Carne molida | 120 | g |
| Queso amarillo | 25 | g |
| Lechuga | 15 | g |
| Tomate | 20 | g |
| Cebolla | 10 | g |
| Aderezo casero | 15 | ml |
| Papel encerado | 1 | pieza |

Cuando se vende una hamburguesa clásica, el sistema descuenta automáticamente cada uno de esos insumos del stock.

### 33.2 Captura de receta

El admin captura la receta al configurar el producto (extensión de la sección 4.1):

```
┌─────────────────────────────────────────┐
│   RECETA — HAMBURGUESA CLÁSICA          │
├─────────────────────────────────────────┤
│   Insumos del producto:                 │
│                                         │
│   • Pan de hamburguesa     [ 1 ]  pza   │
│   • Carne molida           [ 120 ] g    │
│   • Queso amarillo         [ 25 ]  g    │
│   • Lechuga                [ 15 ]  g    │
│   • Tomate                 [ 20 ]  g    │
│   • Cebolla                [ 10 ]  g    │
│   • Aderezo casero         [ 15 ]  ml   │
│   • Papel encerado         [ 1 ]   pza  │
│                                         │
│   [ + Agregar insumo ]                  │
│                                         │
│   ─────────────────────────────────     │
│   Costo total del producto: $43.50      │
│   Precio de venta:         $130.00      │
│   Margen:                  $86.50 (67%) │
│                                         │
│         [ Cancelar ]    [ Guardar ]     │
└─────────────────────────────────────────┘
```

El costo total se calcula automáticamente: ∑(cantidad × costo_unitario_del_insumo). El margen aparece como referencia.

### 33.3 Modificadores y recetas

**Regla de oro de modificadores en inventario:**

> **Solo los modificadores de tipo "extra" (que agregan algo con costo extra para el cliente) descuentan insumos adicionales.**
> **Los modificadores tipo "sin X" (que quitan algo de la receta base) NO afectan el inventario.**

Razón: la cebolla ya se compró aunque el cliente no la quiera. Registrar "Hamburguesa sin cebolla = -10g cebolla del descuento" agrega complejidad de configuración sin valor real para el negocio.

**Cómo se configura un modificador "extra":**

Cada opción de modificador en el grupo (sección 4.3) puede tener su propia mini-receta de insumos adicionales:

```
┌─────────────────────────────────────────┐
│   MODIFICADOR: "Extra queso amarillo"   │
├─────────────────────────────────────────┤
│   Precio extra: $15.00                  │
│   Aplica a: Hamburguesas                │
│                                         │
│   Insumos adicionales que consume:      │
│   • Queso amarillo  [ 25 ] g            │
│                                         │
│   Costo adicional: $5.00                │
│   Margen del extra: $10.00 (67%)        │
│                                         │
│         [ Cancelar ]    [ Guardar ]     │
└─────────────────────────────────────────┘
```

Al vender "Hamburguesa Clásica con extra queso", el sistema descuenta los insumos de la receta base + los 25g adicionales de queso del modificador.

### 33.4 Producto sin receta

Algunos productos no tienen "receta" en el sentido estricto — son productos ya hechos que el negocio compra y revende tal cual. Ejemplos:

- Refresco en lata (compras lata, vendes lata)
- Galleta empaquetada
- Botella de agua
- Cerveza de barril (cuenta por ml)

Tratamiento:

- **Opción A — Producto con receta de 1 a 1:** el insumo es el mismo producto en su unidad de compra. Ejemplo: insumo "Coca Cola 600ml" cantidad 1 pieza. La receta del producto es: 1 pieza de ese insumo. Esto es la opción recomendada porque mantiene la lógica consistente.

- **Opción B — Producto sin inventario:** si el negocio no quiere llevar inventario de ese producto, deja la receta vacía. El sistema **permite la venta sin descuento de inventario** pero no puede reportar costos ni margen para ese producto. Queda registrado.

### 33.5 ¿Qué pasa cuando un producto no tiene receta y el módulo está activo?

> **Decisión cerrada:** permitir venta sin descontar inventario, marcar producto como "sin costeo" en reportes. Bloquear ventas por configuración incompleta es matar al negocio; el cajero no tiene la culpa de que el admin no configuró la receta.

El sistema **permite la venta** pero:
- No descuenta nada de inventario
- Marca el producto en reportes como "Sin costeo configurado"
- El reporte de costos lo muestra con costo $0 y margen 100% (aviso visual de que está sin configurar)
- El admin puede ver una lista de "productos sin receta" para completar configuración

Esto evita bloquear ventas mientras se configura el catálogo.

---

## 34. Movimientos de inventario

### 34.1 Tipos de movimiento

Todo cambio en el stock de un insumo pasa por un **movimiento de inventario**. Esto es la única forma en que el stock cambia (no hay edición directa del stock).

| Tipo | Suma/Resta | Quién dispara |
|---|---|---|
| **Entrada por compra** | + | Admin (captura manual al recibir mercancía) |
| **Salida automática por venta** | − | Sistema (al cobrar un ticket, descuenta receta) |
| **Salida automática por extra de modificador** | − | Sistema (al vender producto con modificador "extra") |
| **Cancelación de venta (reversa)** | + | Sistema (al cancelar ticket pagado, devuelve insumos) |
| **Merma** | − | Admin (captura manual: producto echado a perder, derrame, etc.) |
| **Ajuste por conteo físico** | ± | Admin (resultado de inventario físico real) |
| **Transferencia entre sucursales** | − origen / + destino | Admin |
| **Devolución a proveedor** | − | Admin |

### 34.2 Entrada por compra

Cuando el admin recibe insumos del proveedor, captura la entrada:

```
┌─────────────────────────────────────────┐
│   ENTRADA POR COMPRA                    │
├─────────────────────────────────────────┤
│   Proveedor:                            │
│   [ Carnes del Bajío           ]        │
│                                         │
│   Factura/Nota: [ A-12345          ]    │
│   Fecha:        [ 17/05/2026       ]    │
│                                         │
│   Insumos recibidos:                    │
│                                         │
│   • Carne molida 80/20                  │
│     Cantidad: [ 10 ] kg                 │
│     Costo total: $1,800.00              │
│     (= $180/kg = $0.18/g)               │
│                                         │
│   • Tocino rebanado                     │
│     Cantidad: [ 2 ] kg                  │
│     Costo total: $440.00                │
│                                         │
│   [ + Agregar otro insumo ]             │
│                                         │
│   TOTAL ENTRADA: $2,240.00              │
│                                         │
│   Notas: [______________________________│
│                                         │
│         [ Cancelar ]    [ Registrar ]   │
└─────────────────────────────────────────┘
```

Al registrar:
- Stock del insumo aumenta en la cantidad recibida
- Costo unitario se recalcula según método de valuación del insumo (promedio ponderado por default)
- Queda en bitácora: quién, cuándo, qué, cuánto, costo

### 34.3 Salida automática por venta

Disparado por el sistema cuando un ticket pasa a estado `PAGADO`:

1. El sistema lee cada producto del ticket
2. Para cada producto, lee su receta
3. Descuenta los insumos correspondientes × cantidad vendida
4. Para cada modificador "extra" aplicado, descuenta insumos adicionales del modificador
5. Si algún insumo cae por debajo del mínimo después del descuento, dispara alerta (sección 36)
6. Registra el movimiento en bitácora vinculado al ticket

**¿Qué pasa si un insumo queda con stock negativo después del descuento?**

> **Decisión cerrada:** permitir la venta y marcar el insumo como "stock negativo" para ajuste posterior por conteo físico.

- El sistema **permite la venta** (no bloquea operación)
- Marca el insumo con flag "stock negativo" para revisión del admin
- Genera alerta urgente
- En el reporte, ese insumo aparece destacado para ajuste por conteo físico

Razón: en operación real, los stocks teóricos suelen divergir de los reales (mermas no registradas, errores de captura, robos). No es válido detener ventas porque el sistema "no ve" el insumo — el negocio sabe que sí está. El sistema avisa para que se ajuste.

### 34.4 Reversa por cancelación de venta

> **Decisión cerrada:** cuando una venta pagada se cancela y el producto ya empezó a prepararse, **el admin decide al cancelar** mediante modal: ¿reintegrar insumos al stock o registrar como merma?

Cuando un ticket pagado se cancela (sección 13.3):
- Sistema lee qué insumos descontó al cobrar
- Los devuelve al stock (movimiento inverso)
- Si la cancelación ocurre **antes** de que la cocina prepare el producto, todos los insumos vuelven al stock automáticamente sin pregunta
- Si la cancelación ocurre **después** de preparar (cliente recibió pero rechazó, etc.), el sistema muestra modal al admin con dos opciones:
  - **Devolver al stock** (si el producto se puede reciclar — ej. refresco, ensalada armada que no se tocó)
  - **Marcar como merma** con motivo "cancelación post-preparación" (si ya no se puede reusar — ej. hamburguesa cocinada)
- La decisión queda en bitácora con motivo y autor

### 34.5 Merma

Captura manual cuando un insumo se echa a perder o se pierde sin venta:

```
┌─────────────────────────────────────────┐
│   REGISTRAR MERMA                       │
├─────────────────────────────────────────┤
│   Insumo: [ Carne molida 80/20   ▼ ]    │
│   Cantidad: [ 500 ] g                   │
│                                         │
│   Stock actual: 8,200 g                 │
│   Stock después: 7,700 g                │
│                                         │
│   Motivo:                               │
│   ( ) Caducidad                         │
│   ( ) Daño / derrame                    │
│   ( ) Error en preparación              │
│   ( ) Robo / pérdida                    │
│   ( ) Otro: [______________________]    │
│                                         │
│   Descripción: [_____________________]  │
│                                         │
│   Valor de la merma: $90.00             │
│                                         │
│         [ Cancelar ]    [ Registrar ]   │
└─────────────────────────────────────────┘
```

Requiere autorización del admin (PIN). Queda en bitácora con valor monetario para reportes de costos.

### 34.6 Ajuste por conteo físico

Cuando el negocio hace inventario físico (semanal/mensual/etc.):

```
┌─────────────────────────────────────────┐
│   AJUSTE POR CONTEO FÍSICO              │
├─────────────────────────────────────────┤
│   Insumo: [ Carne molida 80/20   ▼ ]    │
│                                         │
│   Stock según sistema: 7,700 g          │
│   Stock real contado: [ 7,500 ] g       │
│                                         │
│   Diferencia: -200 g (faltante)         │
│   Valor: -$36.00                        │
│                                         │
│   Motivo probable:                      │
│   ( ) Merma no registrada               │
│   ( ) Error de captura de recetas       │
│   ( ) Pérdida / robo                    │
│   ( ) Otro: [______________________]    │
│                                         │
│         [ Cancelar ]    [ Registrar ]   │
└─────────────────────────────────────────┘
```

El stock se ajusta al valor real contado. Queda registro de la diferencia y motivo.

### 34.7 Transferencia entre sucursales

Cuando una sucursal cede insumo a otra:
- Movimiento de salida en sucursal origen
- Movimiento de entrada en sucursal destino
- Vinculados como un solo evento "Transferencia #N"
- Requiere autorización en ambas sucursales (admin de cada una)

---

## 35. Costeo y valuación

### 35.1 Métodos de valuación de insumos

Cada insumo tiene su método de valuación configurado:

- **Promedio ponderado (default):** cada vez que entra inventario, el costo unitario se recalcula como `(stock_actual × costo_actual + cantidad_entrada × costo_entrada) / (stock_actual + cantidad_entrada)`. Es el método más estable y razonable para insumos perecederos.

- **Último costo:** el costo unitario es siempre el de la última entrada. Más reactivo a cambios de precio, pero puede distorsionar valuación si entran cantidades grandes con precios atípicos.

> No se implementan FIFO/LIFO en MVP por complejidad de seguimiento de lotes.

### 35.2 Costo del producto

Calculado automáticamente como ∑(cantidad_insumo × costo_unitario_insumo) para cada componente de la receta. Se recalcula cuando:
- Cambia el costo de un insumo
- Cambia la receta del producto

Aparece en:
- Configuración del producto (visible al admin)
- Reportes de margen
- Reporte de costos del día/periodo

### 35.3 Costo del ticket

Cada ticket tiene su costo total calculado como ∑(costos de productos vendidos). Permite calcular **margen real del ticket** = total ticket − costo total.

### 35.4 Valuación de inventario

En cualquier momento el negocio puede ver:
- **Valor total del inventario:** ∑(stock_actual × costo_unitario) para todos los insumos activos
- **Valor por categoría de insumo:** desglosado
- **Valor por sucursal:** desglosado si hay múltiples
- **Evolución histórica:** valuación al cierre de cada día/mes

---

## 36. Alertas y stock mínimo

### 36.1 Stock mínimo

Cada insumo tiene un **stock mínimo** opcional. Cuando se define:
- Si el stock cae por debajo del mínimo, se genera alerta
- La alerta llega al admin por:
  - Notificación push en el panel admin
  - Email (si está configurado)
  - Banner persistente en el dashboard hasta que se atienda

### 36.2 Producto auto-agotado

Cuando un insumo crítico de una receta cae a un nivel donde **no alcanza para producir una unidad más del producto**:
- El sistema marca el producto como `AGOTADO` automáticamente
- El producto aparece en gris en pantalla de venta (sección 4.6)
- El admin recibe alerta destacando qué insumo causó el agotado
- Cuando entra inventario y el insumo vuelve a niveles suficientes, el producto se re-activa automáticamente

### 36.3 Alertas configurables

Por insumo, el admin puede definir:
- Nivel de alerta amarilla (advertencia): "Stock bajo, revisa próxima compra"
- Nivel de alerta roja (crítica): "Stock crítico, compra urgente"
- Nivel cero (auto-agotado): productos vinculados se marcan agotados

### 36.4 Reporte de alertas activas

Vista permanente en el dashboard del admin:

```
┌─────────────────────────────────────────┐
│   🚨 ALERTAS DE INVENTARIO              │
├─────────────────────────────────────────┤
│   🔴 CRÍTICAS (3)                       │
│   • Pan de hamburguesa: 8 pzas          │
│     (mínimo: 30)                        │
│     Afecta: Hamb. Clásica, BBQ, Doble   │
│                                         │
│   • Aderezo casero: 200 ml              │
│     (mínimo: 500)                       │
│     Afecta: Hamb. Clásica, BBQ          │
│                                         │
│   🟡 ADVERTENCIAS (5)                   │
│   • Queso amarillo: 850 g (mínimo: 600) │
│   • Tocino: 350 g (mínimo: 200)         │
│   • ...                                 │
│                                         │
│   ⚫ AGOTADOS (1)                        │
│   • Lechuga (0 g)                       │
│     2 productos auto-agotados:          │
│     Hamb. Clásica, BBQ                  │
│                                         │
│   [ Registrar entrada por compra ]      │
└─────────────────────────────────────────┘
```

---

## 37. Reportes de inventario

### 37.1 Reportes incluidos

| Reporte | Qué muestra | Frecuencia útil |
|---|---|---|
| **Stock actual** | Listado completo de insumos con cantidad, costo unitario y valor | Diaria |
| **Valuación de inventario** | Valor total del stock por sucursal, por categoría | Mensual o al cierre fiscal |
| **Movimientos del periodo** | Bitácora de entradas, salidas, mermas, ajustes | Por turno / día / semana |
| **Rotación de insumos** | Cuántas veces se "vacía" el stock de un insumo en el periodo. Identifica los de más alta rotación (críticos para abasto) y los de baja rotación (potenciales mermas) | Mensual |
| **Costo de ventas (COGS)** | Costo total de los insumos vendidos en el periodo. Pieza clave para reporte de utilidad | Diaria / Mensual |
| **Margen por producto** | Cada producto con su precio, costo, margen $, margen % | Continuo |
| **Margen del periodo** | Total ventas, costo total, utilidad bruta del periodo | Diario / mensual |
| **Productos sin receta** | Lista de productos sin recetas configuradas (alerta de calidad de datos) | A demanda |
| **Mermas del periodo** | Insumos perdidos, monto, motivos más frecuentes | Mensual |
| **Top insumos por valor consumido** | Qué insumos representan el mayor gasto del negocio | Mensual |
| **Productos más rentables** | Ranking por margen absoluto y por margen % | Mensual |
| **Consumo proyectado** | Estimación de qué se va a consumir en los próximos N días según ventas históricas | Semanal (apoyo a compras) |

### 37.2 Exportación

Todos los reportes de inventario:
- Se pueden ver en pantalla
- Exportar a Excel/CSV
- Programar como email automático periódico

### 37.3 Integración con reportes generales

Los reportes del `/core` (sección 29) se enriquecen cuando el módulo está activo:

- El **reporte de ventas** muestra columna adicional de margen
- El **reporte de productos top** ordena también por rentabilidad, no solo por volumen
- El **dashboard del dueño** incluye widget de utilidad bruta del día

---

# Cierre

---

## 📌 Decisiones cerradas en esta versión

Las decisiones de diseño tomadas y aplicadas en este documento:

1. ✅ **Descuentos manuales siempre requieren PIN.** Cualquier descuento aplicado a discreción del cajero en el momento (porcentaje, monto fijo, cortesía 100%) exige autorización por PIN de supervisor, admin o dueño. **Descuentos automáticos** (promociones pre-configuradas por el admin: happy hour, 2x1, combos, cupones, lealtad CRM) **se aplican solos sin PIN** — la autorización ya se otorgó al configurar la regla.

2. ✅ **Captura de fondo: denominación por defecto.** Modo "monto total" disponible como configuración opt-in del admin.

3. ✅ **Cierre con diferencia bloquea la caja.** Estado `PENDIENTE_VALIDACIÓN` impide nuevo turno hasta que el admin libere con su PIN. Regla inalterable.

4. ✅ **CFDI 4.0 es funcionalidad de fase final.** El MVP arranca sin facturación electrónica activa. Los tickets son no fiscales con folio interno único. Cuando se active el módulo, los tickets viejos podrán facturarse retroactivamente dentro del plazo fiscal vigente. **PAC seleccionado: Facturama.**

5. ✅ **Rol Personal con subtipos extensibles.** Cinco roles base: Dueño, Admin, Supervisor, Cajero, Personal. El rol Personal es el comodín para personal operativo que no opera caja, con subtipos sugeridos (cocinero, mesero, barista, host, runner, repartidor, armador) que cada vertical refina.

6. ✅ **Entidades de catálogo, cliente y modos de servicio viven en `/core`.** Producto, Categoría, Grupos de modificadores, Cliente, Dirección y catálogo de Modos de servicio son universales. Los verticales solo activan/desactivan y agregan su UX de captura.

7. ✅ **Delivery propio vive en `/core` como módulo opcional.** Aplica a 4 verticales (QS, Foodtruck, Café & Bar, Full Service). Incluye asignación de repartidor, pago al recibir, gestión de direcciones del cliente y estados extendidos (`EN_RUTA`, `ENTREGADO_DOMICILIO`).

8. ✅ **Apps externas como captura manual en `/core`.** El `/core` permite capturar pedidos de Rappi/Uber/Didi manualmente y maneja la conciliación. La integración API automática es responsabilidad exclusiva del módulo Dark Kitchen.

9. ✅ **Comanda, áreas de cocina y estado_cocina en `/core`.** Toda la mecánica de envío a producción y seguimiento (`SIN_ENVIAR` → `EN_COCINA` → `LISTO` → `ENTREGADO`) es universal. Solo cambia la UX de cada vertical (KDS, ticket impreso, voz).

10. ✅ **Pedidos paralelos / "en espera" en `/core`.** El sistema universal de mantener pedidos sin cobrar y retomarlos después. Cada vertical adapta la identificación (etiqueta libre en QS, mesa en Full Service, persistencia larga en Café & Bar).

11. ✅ **Edición post-cobro: agregar sí, quitar vía devolución.** Política universal que mantiene trazabilidad fiscal.

12. ✅ **Configuración del negocio centralizada en `/core`.** Todo lo configurable (modos activos, política de cobro, métodos de pago, áreas de cocina, módulos opcionales, etc.) vive en la sección 28. Cada vertical extiende con su configuración específica.

13. ✅ **Reportes básicos en `/core`.** Los reportes universales (ventas, productos top, mix por modo, financieros, fiscales, personal, apps externas, CRM, auditoría) viven aquí. Cada vertical agrega sus reportes específicos.

14. ✅ **El sistema NO carga diferencias de caja al cajero.** Si el dueño decide hacerlo, se resuelve fuera del sistema. VIM POS solo registra para trazabilidad y nómina externa.

15. ✅ **Alerta de reincidencia activa.** Cuando un cajero acumula N cierres con diferencia en M días (default 3 en 14), el sistema avisa al admin. Configurable.

16. ✅ **Reimpresión de ticket de venta: todos los roles operativos.** Reimpresión de comanda: supervisor o superior. Cajeros pueden solicitarla con PIN.

17. ✅ **Numeración de tickets: consecutiva eterna en BD, formato `[sucursal]-[año]-[consecutivo]`.** Al cliente se le muestran los últimos 3-4 dígitos para operación rápida; el folio completo queda interno.

18. ✅ **Redondeo en efectivo: precio exacto por default.** Configurable a redondeo al peso si el negocio lo requiere.

19. ✅ **Sugerencia de propina: opt-in por negocio.** Cuando se activa, el admin define los porcentajes sugeridos.

20. ✅ **Notificaciones SMS/WhatsApp al cliente: no disponibles en MVP.** Arquitectura preparada para futuro.

21. ✅ **Múltiples impresoras térmicas: configurables desde el MVP.** Arquitectura lista para hardware flexible — desde una sola impresora hasta múltiples por áreas de cocina. La realidad operativa de cada negocio define la configuración.

22. ✅ **Display al cliente: no se desarrolla hasta que un cliente lo solicite.** Arquitectura preparada pero sin UI de display en MVP.

23. ✅ **Tiempo estimado al cliente: no se comunica.** El sistema no muestra al cliente cuándo estará listo su pedido.

24. ✅ **Inventario y recetas: módulo completo opcional desde el MVP.** Vive en la Parte IX del `/core`. Cualquier negocio puede activarlo o no. Alcance MVP: insumos con unidad de medida, recetas por producto, descuento automático al vender, movimientos (entradas/salidas/mermas/ajustes), costo unitario y costo del producto, stock mínimo con alertas, reportes de rotación y valuación. **Modificadores: solo los "extras" descuentan insumos; los "sin X" no afectan inventario.**

---

## 📌 Pendientes / decisiones abiertas

Cosas a definir antes o durante el desarrollo:

1. **Configuración fina de alertas de reincidencia:** umbrales default razonables (3 en 14 días sugerido), pero validar con datos de operación de Knock-Out tras 1-2 meses de uso.

2. **Plazo fiscal para facturación retroactiva:** confirmar las reglas exactas del SAT vigentes al momento de activar el módulo CFDI. En general es el mismo ejercicio fiscal, pero hay precisiones técnicas que validar con contador/PAC.

3. **Política de borrado de datos del cliente (LFPDPPP):** retención, derecho de olvido, exportación. Pendiente revisar con asesoría legal antes de lanzamiento comercial.

4. **Backup y exportación de datos:** política de respaldo de tickets, facturas, bitácora. Periodicidad, encriptación, ubicación. Pendiente para fase de despliegue productivo.

5. **Definición operativa de "cierre de día contable":** ¿a qué hora se hace el corte del día? Default 3:00 AM, configurable por negocio. Validar con Knock-Out su horario real.

6. **Integración con terminales bancarias:** ¿el POS se integra con la terminal (la terminal lee el monto del POS) o se opera por separado? Decisión técnica + comercial pendiente.

7. **Política de respaldo de XMLs (cuando CFDI esté activo):** dónde se almacenan los archivos fiscales, política de retención (mínimo legal: 5 años), redundancia.

8. **Casos límite del inventario:** ¿qué pasa si se vende un producto sin receta configurada? ¿Qué pasa si una receta requiere un insumo agotado? Ver Parte IX para tratamiento inicial, pero pendiente validar con casos reales.

---

*Documento de flujos comunes — `/core` VIM POS v3.1. Plan Maestro — Fermín, VIM Marketing.*
