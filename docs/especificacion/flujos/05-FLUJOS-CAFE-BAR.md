# ☕ FLUJOS DEL MÓDULO CAFÉ & BAR

## Manual operativo del vertical Café & Bar de VIM POS

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v1.1 — pre-desarrollo (correcciones de consistencia)
> Última actualización: Mayo 2026
>
> **Prerrequisitos de lectura:**
> - `01-FLUJOS-COMUNES-CORE.md` v3 (obligatorio)
> - `02-FLUJOS-QUICK-SERVICE.md` v3 (recomendado — modelo barra/mostrador comparte mecánica)
> - `04-FLUJOS-FULL-SERVICE.md` v1 (recomendado — modelo mesa con cuenta abierta comparte mecánica)

---

## Propósito de este documento

Este documento describe **solo lo que el vertical Café & Bar agrega encima del `/core`, QS y Full Service**. Café & Bar es estructuralmente híbrido: un mismo negocio puede operar simultáneamente como QS (mostrador, cobro al pedir) y como Full Service (mesa con cuenta abierta, cobro al final).

Lo que distingue al vertical:

1. **Operación híbrida configurable** — el mismo negocio puede tener mostrador + mesa + barra simultáneamente
2. **Cuentas abiertas prolongadas** — el cliente puede quedarse 4 horas; el sistema lo soporta con alertas
3. **Cobro por ronda y pre-pago** — modelos adicionales al cobro tradicional
4. **Recetas con cantidades en ml** — cocteles, espressos, mezclas con costeo preciso (mediante módulo de Inventario)
5. **Happy hour y promociones por horario** — uso intensivo del motor de promociones del `/core`
6. **Asientos de barra** — equivalente a mesas pero con menor estructura

Todo lo demás (caja, ticket, cobro, comanda, división de cuenta cuando aplica, propinas, inventario, mapa de mesas) viene del `/core` + Full Service + QS y no se duplica.

> **Regla:** si buscas algo y no está aquí, está en QS, Full Service o `/core`.

---

## Tabla de contenidos

1. [Perfil operativo del vertical](#1-perfil-operativo-del-vertical)
2. [Hereda del /core, QS y Full Service](#2-hereda-del-core-qs-y-full-service)
3. [Tres modelos operativos configurables](#3-tres-modelos-operativos-configurables)
4. [Asientos de barra](#4-asientos-de-barra)
5. [Cuentas abiertas prolongadas (clientes que se quedan horas)](#5-cuentas-abiertas-prolongadas-clientes-que-se-quedan-horas)
6. [Cobro por ronda](#6-cobro-por-ronda)
7. [Pre-pago al pedir (modelo bar de alto volumen)](#7-pre-pago-al-pedir-modelo-bar-de-alto-volumen)
8. [Recetas con cantidades por volumen (ml/oz)](#8-recetas-con-cantidades-por-volumen-mloz)
9. [Happy hour y promociones por horario](#9-happy-hour-y-promociones-por-horario)
10. [Modos de servicio aplicables a Café & Bar](#10-modos-de-servicio-aplicables-a-café--bar)
11. [Subtipos de Personal sugeridos](#11-subtipos-de-personal-sugeridos)
12. [Configuración inicial específica del vertical](#12-configuración-inicial-específica-del-vertical)
13. [KPIs y reportes específicos](#13-kpis-y-reportes-específicos)
14. [Reglas duras específicas del vertical](#14-reglas-duras-específicas-del-vertical)
15. [Decisiones cerradas del vertical](#-decisiones-cerradas-del-vertical)
16. [Pendientes específicos de Café & Bar](#-pendientes-específicos-de-café--bar)

---

## 1. Perfil operativo del vertical

### 1.1 ¿Qué es un Café & Bar?

Vertical amplio que cubre negocios donde el producto principal son **bebidas** (con o sin alcohol), normalmente acompañadas de comida ligera, en un ambiente donde el cliente se queda a consumir.

Ejemplos del rango cubierto:

- **Cafeterías de especialidad:** baristas con técnica, espresso bar, latte art, granos seleccionados
- **Coffee shops casuales:** estilo Starbucks, alta rotación, bebidas con jarabes y customización
- **Juice bars y bowls:** smoothies, jugos detox, açai bowls
- **Cantinas con comida:** botana cortesía, tequila, mezcal, cerveza
- **Bares y mezcalerías:** especialización en destilados, cocteles de autor
- **Cervecerías artesanales / tap rooms:** cerveza de barril, flights de degustación
- **Pulquerías:** pulques curados, tradicionales
- **Wine bars:** vinos por copa, maridajes

### 1.2 Características operativas distintivas

| Característica | Valor típico |
|---|---|
| Volumen | 40-300 tickets/día por sucursal |
| Ticket promedio | $80-$600 MXN (varía enormemente) |
| Tiempo de cliente | 30 min - 4 hrs (los bares son los más largos) |
| Mix de productos | 60-95% bebidas, 5-40% comida |
| Personal | Baristas/bartenders, meseros (si hay mesas), runners, cocineros (si hay cocina) |
| Cobro | **Variable según modelo:** mostrador (al pedir), mesa (al final), ronda (al servir), pre-pago |
| Promociones | Happy hour, descuento por hora, 2x1 en cerveza, ladies night |
| Operación | Híbrida común: mostrador + mesa + barra simultáneos |

### 1.3 Lo que Café & Bar prioriza

1. **Flexibilidad del modelo de cobro** — el mismo negocio puede operar varios modelos en paralelo
2. **Captura rápida de bebidas con modificadores** — "espresso con leche de avena, descafeinado, sin azúcar"
3. **Cuentas abiertas que aguantan horas** — sin perder coherencia ni datos
4. **Costeo preciso de cocteles** — el margen del bar depende del costo exacto por ml
5. **Promociones por horario automatizadas** — happy hour, ladies night, descuento por hora
6. **Manejo de propinas a baristas/bartenders** — registro y trazabilidad

### 1.4 Lo que Café & Bar NO necesita en MVP

- KDS (Kitchen Display System) — el bartender es el operador, no necesita pantalla intermedia
- Reservaciones futuras (add-on Reservaciones Pro)
- Programa de membresía / suscripción de café (mensualidades) — futura mejora
- Pre-pago de cuentas con tarjeta como garantía (Fase 2)
- Integración con apps de marca propia (algunos cafés tienen su app de lealtad)

---

## 2. Hereda del `/core`, QS y Full Service

### 2.1 Lo que Café & Bar hereda tal cual del `/core`

| Área | Sección del /core |
|---|---|
| Conceptos base, jerarquía, estados, numeración consecutiva | 1 |
| Roles base (Dueño, Admin, Supervisor, Cajero, Personal) | 2 |
| Autenticación con PIN | 3 |
| Entidades Producto, Categoría, Modificadores, Notas | 4 |
| Cliente y Direcciones (CRM básico) | 5 |
| Catálogo de modos de servicio | 6 |
| Apertura de turno con denominación | 7 |
| Cambio de cajero | 8 |
| Sangrías y depósitos | 9, 10 |
| Notas al ticket y a cocina | 11 |
| Pedidos paralelos / "en espera" | 12 |
| Cancelación de ticket | 13 |
| Descuentos manuales y automáticos | 14 |
| Devoluciones | 15 |
| Edición post-cobro | 16 |
| Pago y métodos | 17 |
| Ticket no fiscal del MVP (CFDI fase final) | 18 |
| Comanda y áreas de cocina/barra | 19 |
| Estado de cocina del ticket | 20 |
| Entrega al cliente | 21 |
| Delivery propio completo (módulo opcional) | 22 |
| Apps externas (módulo opcional) | 23 |
| Cierre de turno con validación admin | 24 |
| Cierre de día Z | 25 |
| Contingencias | 26 |
| Auditoría | 27 |
| Configuración del negocio | 28 |
| Reportes base | 29 |
| Subtipos de Personal | 30 |
| Inventario y recetas (módulo muy recomendado, Parte IX) | 31-37 |

### 2.2 Lo que hereda de Quick Service

Cuando el negocio opera con modelo **mostrador/barra de café** (ver §3.1), se reutiliza casi toda la mecánica de QS:

| Área de QS | Reúso en Café & Bar |
|---|---|
| Pantalla principal con grid de productos | ✅ Idéntica, adaptada a categorías de bebidas |
| Flujo de toma de pedido en mostrador | ✅ Idéntico (Café & Bar §4 del QS) |
| Cobro antes de cocina/preparación | ✅ Idéntico (configurable) |
| Pedidos paralelos / "en espera" | ✅ Idéntico, muy usado en café (cliente paga, espera a que esté listo, se lleva o se queda) |
| Categoría "Populares" automática | ✅ Idéntica |

### 2.3 Lo que hereda de Full Service

Cuando el negocio opera con modelo **mesa con cuenta abierta** (ver §3.2), se reutiliza casi toda la mecánica de Full Service:

| Área de Full Service | Reúso en Café & Bar |
|---|---|
| Mapa de mesas (visual o lista) | ✅ Igual, agregando "asientos de barra" (§4) |
| Estados de mesa | ✅ Igual |
| Ciclo de vida de la mesa | ✅ Igual (con adaptación para barra) |
| Asignación de mesero/bartender | ✅ Igual, con subtipo barista/bartender |
| Cursos de cocina (opt-in) | ✅ Igual, raramente usado en bar pero soportado |
| Operaciones de mesa (transferir, unir, separar, reasignar) | ✅ Idéntico |
| División de cuenta | ✅ Idéntico, muy usado en bares (4 amigos pagan separado) |
| Propinas asignadas a personal | ✅ Idéntico, asignadas a barista o mesero |
| Waitlist del día | ✅ Igual (relevante en bares con espera) |

### 2.4 Lo que Café & Bar agrega específicamente

Solo cinco cosas estructuralmente exclusivas:

1. **Tres modelos operativos configurables** (§3) — mostrador, mesa, y barra coexisten en el mismo negocio
2. **Asientos de barra como entidad** (§4) — diferentes a mesa, mismo tratamiento de cuenta abierta
3. **Cuentas prolongadas con alerta** (§5) — soporte explícito para cuentas que viven horas
4. **Cobro por ronda y pre-pago** (§6 y §7) — modalidades adicionales al cobro tradicional
5. **Templates de promociones por horario** (§9) — pre-cargar happy hour típicos al onboarding

Todo lo demás es `/core` + QS + Full Service.

---

## 3. Tres modelos operativos configurables

Un negocio del vertical Café & Bar puede operar simultáneamente con uno, dos o los tres modelos. La configuración es por **zona del negocio**, no por todo el negocio en bloque.

### 3.1 Modelo A — Mostrador / barra de café (estilo QS)

**Cómo funciona:**
- Cliente llega al mostrador o barra de café
- Pide su bebida directamente al barista
- Paga inmediatamente (cobro antes de preparación, default)
- Espera la preparación (1-5 min)
- Recibe la bebida y se va, o se sienta a consumirla

**Cuándo conviene:**
- Coffee shops casuales (Starbucks-like)
- Juice bars
- Tomas rápidas (espresso para llevar)
- Negocios con alta rotación

**Mecánica heredada:** flujo completo de QS (`02-FLUJOS-QUICK-SERVICE.md`).

### 3.2 Modelo B — Mesa con cuenta abierta (estilo Full Service)

**Cómo funciona:**
- Cliente llega y se sienta en mesa
- Mesero/bartender toma orden en mesa
- Cuenta vive abierta durante el consumo (puede ser horas)
- Más pedidos van agregándose
- Cliente pide la cuenta al final
- Se cobra (con o sin división, propina) y mesa se libera

**Cuándo conviene:**
- Cafeterías con área de mesas para trabajar/conversar
- Bares y cantinas
- Mezcalerías
- Wine bars
- Cervecerías con tap room

**Mecánica heredada:** flujo completo de Full Service (`04-FLUJOS-FULL-SERVICE.md`).

### 3.3 Modelo C — Barra con asientos

**Cómo funciona:**
- Cliente se sienta en un asiento de barra (numerado o "barra libre")
- Bartender toma la orden directamente (sin mesero intermediario)
- Cuenta puede vivir abierta como mesa, o cobrar por ronda, o pre-pago

**Cuándo conviene:**
- Bares con barra (lo más común)
- Cantinas tradicionales
- Cervecerías con clientes en barra

**Es un híbrido:** comparte la cuenta abierta de Full Service pero la captura es directa del bartender (sin mesero intermediario). Ver §4.

### 3.4 Configuración del negocio: zonas y modelos

El admin configura el negocio en zonas, cada una con su modelo:

```
┌─────────────────────────────────────────────────┐
│   CONFIGURACIÓN DE OPERACIÓN — Café Aldama      │
├─────────────────────────────────────────────────┤
│   Zona 1: Mostrador (entrada)                   │
│   Modelo: Mostrador / barra de café (QS)        │
│   Cobro: Al pedir                               │
│   ✓ Activo                                      │
│                                                 │
│   Zona 2: Mesas del salón                       │
│   Modelo: Mesa con cuenta abierta (Full Service)│
│   Cobro: Al final del consumo                   │
│   Cursos: Sí                                    │
│   ✓ Activo                                      │
│                                                 │
│   Zona 3: Terraza                               │
│   Modelo: Mesa con cuenta abierta               │
│   Cobro: Al final                               │
│   ✓ Activo                                      │
│                                                 │
│   Zona 4: Barra (asientos)                      │
│   Modelo: Barra con asientos                    │
│   Cobro: ( ) Cuenta abierta                     │
│           (•) Por ronda                         │
│           ( ) Pre-pago                          │
│   ✓ Activo                                      │
│                                                 │
│   [ + Agregar zona ]                            │
└─────────────────────────────────────────────────┘
```

### 3.5 Pantalla principal del POS — selector de zona

Cuando el operador entra al POS, ve un selector de zona en la cabecera:

```
┌──────────────────────────────────────────────────────────────────┐
│  CAFÉ ALDAMA  |  Zona: [Mostrador ▼] [Mesas] [Terraza] [Barra]  │
├──────────────────────────────────────────────────────────────────┤
│  (la pantalla se adapta al modelo de la zona seleccionada)       │
└──────────────────────────────────────────────────────────────────┘
```

- **Zona "Mostrador":** muestra grid de productos al estilo QS, ticket lateral, cobro al cerrar el ticket
- **Zona "Mesas" o "Terraza":** muestra mapa de mesas al estilo Full Service
- **Zona "Barra":** muestra asientos de barra (§4)

Un usuario con permisos puede operar en varias zonas. Un mesero asignado solo a la zona "Mesas" no verá el grid del mostrador.

### 3.6 Reglas de los modelos

- Un negocio puede operar **uno, dos o los tres modelos simultáneamente**
- Cada zona tiene su modelo configurado; el cambio de modelo de una zona se hace desde configuración del negocio
- Un ticket nace **en una zona específica** y mantiene su modelo durante toda su vida
- Si un cliente pidió en mostrador y luego se sienta en mesa, son **dos tickets distintos** (uno cobrado, otro abierto en mesa) salvo que el barista decida transferir el segundo a la cuenta de la mesa antes de cobrar

---

## 4. Asientos de barra

### 4.1 ¿Qué es un asiento de barra?

Una posición física en la barra del negocio donde un cliente se sienta a consumir. Es operativamente similar a una mesa pero:

- **Capacidad** es 1 (un asiento = una persona) por default
- **Sin mesero intermediario** — el bartender toma directamente la orden
- **Numeración** opcional: barra con asientos numerados (B1, B2, B3...) o "barra libre" sin numerar
- **Cuenta abierta** puede tratarse igual que mesa, o configurarse para cobro por ronda

### 4.2 Modos de operación de la barra

| Modo | Cómo funciona | Cuándo aplica |
|---|---|---|
| **Asientos numerados con cuenta** | Cada asiento es identificable, cliente sentado tiene cuenta propia | Bares con barra grande, mezcalerías |
| **Barra libre con cuenta por cliente** | No hay asientos numerados; el bartender crea "tab" por cliente (con nombre o descripción) | Bares casuales, cervecerías |
| **Cobro por ronda** | Sin cuenta acumulada, cada bebida se cobra al servirla | Bares de antros, alta rotación |
| **Pre-pago** | Cliente paga primero, luego se sirve | Bares de eventos, conciertos, alta concurrencia |

### 4.3 Configuración de la barra

```
┌─────────────────────────────────────────┐
│   CONFIGURAR BARRA                      │
├─────────────────────────────────────────┤
│   Nombre: [ Barra principal         ]   │
│                                         │
│   Modo de operación:                    │
│   ( ) Asientos numerados con cuenta     │
│   (•) Barra libre con cuenta por cliente│
│   ( ) Cobro por ronda                   │
│   ( ) Pre-pago al pedir                 │
│                                         │
│   Número de asientos: [ 8 ]             │
│   ¿Numerar asientos? [✓]                │
│   (B1, B2, B3, ... B8)                  │
│                                         │
│   Bartenders asignados:                 │
│   • Pedro M.                            │
│   • Ana L.                              │
│                                         │
│         [ Cancelar ]   [ Guardar ]      │
└─────────────────────────────────────────┘
```

### 4.4 UX de la barra — vista principal

**Si la barra tiene asientos numerados con cuenta:**

```
┌─────────────────────────────────────────────┐
│   BARRA PRINCIPAL — 4 de 8 ocupados         │
├─────────────────────────────────────────────┤
│   B1   B2   B3   B4   B5   B6   B7   B8     │
│   🔴   🟢   🔴   🟢   🔴   🟢   🟢   🔴     │
│   $245 —    $180 —    $90  —    —    $410   │
│   25min     35min     8min                   │
│                                              │
│   Bartender activo: Pedro M.                 │
│                                              │
│   [ + Tab libre (sin asiento) ]              │
└─────────────────────────────────────────────┘
```

Tap en asiento ocupado abre la cuenta del cliente; tap en asiento libre permite "sentar" un nuevo cliente.

**Si la barra es libre con tabs por cliente:**

```
┌─────────────────────────────────────────────┐
│   BARRA — Tabs abiertas (5)                 │
├─────────────────────────────────────────────┤
│   • Tab "Hombre playera azul"  $185  25min  │
│   • Tab "Marisol y amigas"     $410  18min  │
│   • Tab "Mesa 3 amigos"        $620  42min  │
│   • Tab "Cliente del cumple"   $90    8min  │
│   • Tab "Grupo Eder"           $1,240 1h05  │
│                                              │
│   [ + Nuevo tab ]                            │
└─────────────────────────────────────────────┘
```

El tab se identifica con una etiqueta descriptiva o el nombre del cliente. Funciona como un "pedido en espera" del `/core` §12 con tratamiento de cuenta abierta de Full Service.

### 4.5 Ciclo de vida del cliente de barra

Análogo al ciclo de vida de mesa (Full Service §5):

1. Cliente se sienta o se acerca a barra
2. Bartender lo identifica (asiento o tab libre)
3. Captura la orden directa
4. Si modo "cuenta abierta": la cuenta crece con cada pedido. Cliente cierra al irse
5. Si modo "por ronda" o "pre-pago": cada pedido se cobra inmediatamente (§6, §7)
6. Cliente paga (con división si aplica) y deja propina al bartender
7. Asiento o tab se libera

### 4.6 Reglas

- Un asiento puede tener una sola cuenta activa
- Un tab libre puede acumular varios consumos del mismo cliente
- Si un cliente cambia de asiento, se aplica "transferir mesa" del `/core` (Full Service §9.1)
- Si dos clientes en barra deciden combinar cuentas, se aplica "unir mesas" (Full Service §9.2)
- El bartender es el "mesero responsable" para fines de propina

---

## 5. Cuentas abiertas prolongadas (clientes que se quedan horas)

### 5.1 El problema operativo

En un bar o cantina, es completamente normal que un cliente se quede 3-4 horas. La cuenta sigue abierta, va creciendo, y el bartender debe poder gestionarla sin perder el hilo.

VIM POS no fuerza el cierre por tiempo, pero sí **alerta** cuando una cuenta lleva mucho tiempo abierta.

### 5.2 Configuración de alertas

Configurable por negocio:

```
┌─────────────────────────────────────────┐
│   ALERTAS DE CUENTAS ABIERTAS           │
├─────────────────────────────────────────┤
│   Mesa/asiento ocupada >2h:             │
│   [✓] Notificar al bartender/mesero     │
│   Mensaje: "Cliente lleva 2h, ¿todo OK?"│
│                                         │
│   Mesa/asiento ocupada >4h:             │
│   [✓] Notificar al supervisor           │
│   Mensaje: "Mesa con cuenta muy larga"  │
│                                         │
│   Cuenta sin movimiento >1h:            │
│   [✓] Notificar al mesero               │
│   Mensaje: "Mesa sin pedidos nuevos"    │
│                                         │
│   [ Guardar ]                           │
└─────────────────────────────────────────┘
```

### 5.3 Comportamiento de las alertas

Las alertas son **informativas, no bloqueantes**. El sistema:

- Muestra un ícono de advertencia ⚠️ en la mesa/asiento
- Genera notificación al operador asignado (push o banner en la app)
- Queda registro en bitácora para análisis posterior

**No fuerza ninguna acción.** El bartender decide si revisar al cliente, si está bien la cuenta abierta, o si quiere cerrarla.

### 5.4 Cierre forzado al cambio de turno

**Decisión:** NO se fuerza el cierre al cambio de turno. La cuenta se traspasa al siguiente bartender con todos los datos. Esto es consistente con la realidad operativa (no quieres incomodar al cliente solo porque cambia el shift).

El nuevo bartender ve las cuentas heredadas con etiqueta visible "Heredada de Pedro M. — abierta hace 1h 45min".

### 5.5 Cierre al cerrar el local del día

Cuando el negocio cierra (cierre de día Z, sección 25 del `/core`):

- Sistema avisa al admin si hay cuentas abiertas
- El admin elige: forzar cobro de cada una, o postergar el cierre del día
- Si hay clientes que ya se fueron sin pagar (chamarra olvidada, etc.), el admin puede cancelar la cuenta con motivo o cargar como cuenta incobrable
- Las cuentas que cruzan medianoche y se cobran al día siguiente se asignan contablemente al día en que se abrieron

### 5.6 Reglas

- Las cuentas no tienen tiempo máximo de vida (más allá del día contable)
- El sistema alerta visualmente pero NO bloquea operación
- Cambio de bartender/mesero traspasa la cuenta sin interrupción
- Antes del cierre del día, todas las cuentas deben resolverse (cobrar, cancelar o postergar)

---

## 6. Cobro por ronda

### 6.1 ¿Qué es cobro por ronda?

Modalidad donde cada bebida (o grupo de bebidas pedidas juntas) se cobra **al momento de servirla**, sin acumular cuenta. Caso típico:

- Cliente pide 4 cervezas
- Bartender prepara las 4 cervezas
- Le cobra al cliente las 4 cervezas inmediatamente
- Cliente recibe sus bebidas y voucher/ticket
- Más tarde, cliente pide otra ronda; mismo proceso desde cero

### 6.2 Cuándo aplica

- Bares populares de alta rotación donde el cliente no se queda en barra
- Cervecerías donde la cuenta abierta es engorrosa
- Negocios con alto riesgo de "se fueron sin pagar"
- Eventos masivos (conciertos, ferias)

### 6.3 Configuración

El modo "cobro por ronda" se configura por **zona** (sección §3.4). Si una zona del negocio opera con este modo, todos los pedidos en esa zona se cobran al servirse.

### 6.4 Flujo paso a paso

**Paso 1.** Cliente pide en barra. Bartender captura productos en pantalla:

```
┌─────────────────────────────────────────┐
│   NUEVA RONDA — Barra (cobro por ronda) │
├─────────────────────────────────────────┤
│   4x Cerveza IPA          $260.00       │
│   1x Tequila reposado     $90.00        │
│   ────────────────────────              │
│   Subtotal:               $350.00       │
│                                         │
│   [   COBRAR RONDA   ]                  │
│   [ Agregar otro item ]                 │
└─────────────────────────────────────────┘
```

**Paso 2.** Tap "COBRAR RONDA" → flujo estándar de cobro del `/core` §17.

**Paso 3.** Ticket pasa a `PAGADO` inmediatamente.

**Paso 4.** Comanda se imprime/manda a barra para preparación.

**Paso 5.** Bartender prepara y entrega la ronda.

**Paso 6.** Cliente recibe. Si quiere otra ronda, vuelve a paso 1.

### 6.5 Diferencia con cuenta abierta

| Aspecto | Cuenta abierta | Cobro por ronda |
|---|---|---|
| Cuándo se cobra | Al final del consumo | Al servir cada ronda |
| Número de tickets | 1 ticket por cliente/mesa | N tickets (uno por ronda) |
| Propina | Se asigna al final, al mesero responsable | Se puede asignar en cada ronda o en la última |
| División de cuenta | Sí, al final | Cada ronda se cobra completa, no se divide internamente |
| Riesgo "se fue sin pagar" | Alto | Cero (ya cobró) |

### 6.6 Propinas en cobro por ronda

Cuando el cliente cierra su visita, **no hay momento natural de propina** (porque ya pagó cada ronda). Soluciones soportadas:

- **Propina por ronda:** cada ronda incluye sugerencia de propina como en QS
- **Propina manual al final:** cliente le da una propina en efectivo al bartender; el bartender la registra manualmente desde "Registrar propina manual" en la barra
- **Sin propina formal:** algunos negocios con este modelo no esperan propina (eventos, etc.)

### 6.7 Reglas

- En zona configurada como "cobro por ronda" no se permite cuenta abierta
- Cada ronda es un ticket independiente con folio propio
- Los pedidos del mismo cliente no se "agrupan" automáticamente; son tickets sueltos
- En reportes, las "rondas" se reportan como tickets normales (no hay distinción especial)

---

## 7. Pre-pago al pedir (modelo bar de alto volumen)

### 7.1 ¿Qué es pre-pago?

Modalidad donde el cliente **paga antes** de recibir la bebida. Caso típico:

- Cliente llega a barra de evento (concierto, feria)
- Pide su bebida y paga inmediatamente
- Recibe un voucher / ticket impreso
- Acerca el voucher al barista que prepara
- Recibe la bebida

Es esencialmente el modelo QS aplicado a bar, donde la urgencia es alta y la disciplina de cobro es prioritaria.

### 7.2 Diferencia con cobro por ronda

| Aspecto | Pre-pago | Cobro por ronda |
|---|---|---|
| Quién cobra | Una persona (cajero dedicado) | El bartender mismo |
| Preparación | Después de pagar (siempre) | Después de pagar (igual) |
| Estaciones | Cajero ≠ bartender (separados) | Mismo bartender cobra y prepara |
| Volumen | Muy alto (eventos masivos) | Alto pero manejable |

### 7.3 Flujo paso a paso

**Paso 1.** Cliente llega a la caja (no a la barra todavía).

**Paso 2.** Cajero captura la orden, cobra, imprime voucher/ticket con folio grande:

```
═══════════════════════════════════
       CONCIERTO LUNARIO 2026
       BARRA - VOUCHER
═══════════════════════════════════
       FOLIO: 4321
       Pedido:
       1x Cerveza grande
       1x Mezcalita

       Total pagado: $180.00
       
       Acerque este voucher al
       bartender para recibir su
       bebida.
═══════════════════════════════════
```

**Paso 3.** Cliente camina a la barra con el voucher.

**Paso 4.** Bartender toma el voucher, lo escanea (futuro) o lo verifica visualmente, prepara y entrega.

**Paso 5.** Bartender puede marcar el voucher como "entregado" en pantalla (heredado del `/core` §21).

### 7.4 Configuración

Modo pre-pago se configura por zona (§3.4). Suele activarse en zonas tipo "Caja de bar evento" con bartenders en barras separadas.

### 7.5 Reglas

- En zona pre-pago, la captura y el cobro siempre van juntos (no hay cuenta abierta)
- El voucher impreso es crítico para que el bartender sepa qué preparar
- Cajero y bartender son típicamente personas distintas
- Si no hay impresora, el voucher se puede mostrar en pantalla del POS o enviar al móvil del cliente (futuro)

---

## 8. Recetas con cantidades por volumen (ml/oz)

> Esta sección complementa la Parte IX del `/core`. No reemplaza nada; solo agrega consideraciones específicas del vertical.

### 8.1 El problema operativo del bar

El costo del bar se vuela por mediciones imprecisas. Si el bartender sirve 60ml de tequila en lugar de los 45ml de la receta, en una noche con 200 tragos se pierde dinero significativo.

VIM POS, mediante el módulo de Inventario y Recetas (Parte IX del `/core`), permite capturar recetas con cantidades exactas en ml/oz.

### 8.2 Ejemplo: receta de un Margarita clásico

| Insumo | Cantidad | Unidad |
|---|---|---|
| Tequila blanco | 45 | ml |
| Triple sec | 22 | ml |
| Jugo de limón fresco | 30 | ml |
| Jarabe natural | 10 | ml |
| Sal | 1 | g |
| Hielo (cubos) | 8 | pieza |
| Limón (rodaja decoración) | 0.1 | pieza |

Al vender un Margarita, el sistema descuenta automáticamente esos volúmenes del stock de cada insumo (§34.3 del `/core`).

### 8.3 Conversión entre unidades

El sistema soporta cambio entre unidades cuando es necesario:

- Botella de tequila viene de **750 ml**
- Cada margarita usa **45 ml** de tequila
- Por cada botella, el sistema descuenta correctamente: una botella = ~16 margaritas

El admin captura el insumo en la unidad que compra (botellas) y la receta en la unidad que sirve (ml). El sistema hace la conversión transparente.

### 8.4 Recetas con modificadores

Aplicando la regla del `/core` §33.3 ("solo extras descuentan insumos"):

| Modificador | Tipo | Descuenta del inventario |
|---|---|---|
| "Margarita con sal" (estándar de la receta) | Default | No descuenta extra |
| "Margarita sin sal" | "Sin X" | No afecta inventario (la sal ya se compró igual) |
| "Margarita doble" | Extra (con costo) | Descuenta 45ml extra de tequila + 22ml extra triple sec |
| "Margarita con tequila premium" | Extra (con costo) | Descuenta del insumo "Tequila premium" en lugar de "Tequila blanco estándar" — esto se modela como producto distinto, no como modificador |

### 8.5 Recetas de espresso y café

Para cafeterías, las recetas son igual de importantes:

| Producto | Insumos |
|---|---|
| Espresso simple | 9g café molido + 30ml agua filtrada |
| Espresso doble | 18g café molido + 60ml agua |
| Cappuccino | 18g café + 60ml agua + 120ml leche + 1g cacao |
| Latte deslactosado | 18g café + 60ml agua + 240ml leche deslactosada (extra con costo si aplica) |

Modificadores típicos:
- "Con leche de avena (+$15)" → descuenta del insumo "Leche de avena" en lugar de leche normal (modelado como producto/variante distinta o modificador extra)
- "Doble shot (+$10)" → descuenta 9g extra de café
- "Descafeinado" → descuenta del insumo "Café descafeinado" en lugar de regular

### 8.6 Mermas frecuentes en bar

Casos donde el inventario se descuenta sin ser venta:

- **Cocteles regalados** (cortesía de la casa): se vende con descuento 100%, igual descuenta inventario
- **Errores de preparación** (se preparó mal y se tiró): registrar como merma manual (§34.5 del `/core`)
- **Pruebas de catación / cliente probando antes de pedir**: configurable como producto "muestra" con descuento 100% o merma

### 8.7 Reglas

- Las recetas con ml/oz son una **aplicación específica** del módulo de inventario del `/core`, no requieren funcionalidad nueva
- Cafés y bares **deberían activar el módulo de inventario** desde el inicio: el ROI es mucho mayor que en otros verticales por la naturaleza del costeo
- Las conversiones entre unidades de compra y de servicio son automáticas
- El admin captura recetas una vez; el sistema descuenta para siempre

---

## 9. Happy hour y promociones por horario

### 9.1 La realidad del vertical

Happy hour, ladies night, 2x1 los martes, descuento por hora — todos estos son **fundamentales** en Café & Bar. Sin estas promociones automatizadas, el negocio pierde competitividad o gasta operativamente tiempo aplicándolas manualmente.

### 9.2 ¿Cómo lo resolvemos? Con la mecánica del `/core`

> **Decisión:** Café & Bar no inventa una mecánica nueva. **Reutiliza el motor de descuentos automáticos del `/core` (sección 14.2)** que ya soporta rango horario, día de semana, monto mínimo, productos afectados, etc.

Lo que Café & Bar agrega son **templates pre-configurados** en el onboarding para acelerar el setup.

### 9.3 Templates de promociones incluidos

Al crear un negocio del vertical Café & Bar, el wizard ofrece templates listos para activar:

```
┌─────────────────────────────────────────────────┐
│   PROMOCIONES SUGERIDAS — Café Aldama           │
├─────────────────────────────────────────────────┤
│   Activa los templates que apliquen a ti:       │
│                                                 │
│   [✓] Happy hour clásico                        │
│       Horario: 18:00 - 20:00                    │
│       Descuento: -30% en cervezas, vinos        │
│                                                 │
│   [ ] Ladies night                              │
│       Día: Jueves                               │
│       Descuento: 2x1 en cocteles                │
│       Aplica si: cliente identificado como dama │
│                                                 │
│   [ ] 2x1 en cervezas martes y miércoles       │
│       Horario: 17:00 - 22:00                    │
│                                                 │
│   [ ] Descuento por hora                        │
│       18:00-19:00: -20%                         │
│       19:00-20:00: -15%                         │
│       20:00-21:00: -10%                         │
│                                                 │
│   [ ] Promoción "Sangría + botana"              │
│       -$50 al pedir sangría + nachos juntos     │
│                                                 │
│   [ ] Café de la mañana                         │
│       Horario: 07:00 - 10:00                    │
│       Descuento: -15% en cafés                  │
│                                                 │
│   [ ] Hora del té (cafetería)                   │
│       Horario: 16:00 - 18:00                    │
│       Descuento: -25% al pedir café + galleta   │
│                                                 │
│         [ Saltar ]   [ Activar seleccionados ]  │
└─────────────────────────────────────────────────┘
```

> **Nota:** los "combos formales" (paquetes de productos con precio único) son módulo **post-MVP** según decisión del `/core` §4.7. Las promociones de arriba se modelan como **descuentos automáticos** sobre productos individuales que se compran juntos, no como un combo formal. Funcionan con la mecánica existente del `/core` §14 sin necesidad del módulo de combos.

El dueño activa los que aplican a su negocio. Cada template puede personalizarse después (cambiar horario, cambiar porcentaje, agregar productos).

### 9.4 Promociones combinadas con CRM

Cuando el módulo CRM esté activado (futuro):

- Descuento por cliente VIP
- Bebida gratis al N-ésimo consumo
- Cumpleaños del cliente: bebida cortesía
- Tarjetas digitales de lealtad

Esto es responsabilidad del módulo CRM, no del vertical Café & Bar específicamente.

### 9.5 Visibilidad de la promoción al cliente

En la pre-cuenta y ticket final, las promociones aplicadas aparecen desglosadas:

```
═══════════════════════════════════
   CAFÉ ALDAMA — BARRA
═══════════════════════════════════
   
   2x Cerveza IPA       $260.00
   1x Mezcal joven      $120.00
   
   ✨ Happy hour aplicado
   -30% en cervezas      -$78.00
   
   Subtotal:            $302.00
   ...
═══════════════════════════════════
```

Esto refuerza al cliente la sensación de obtener el descuento (psicología comercial).

### 9.6 Reglas

- Las promociones se aplican automáticamente sin PIN (`/core` §14.1)
- El cajero/bartender ve la promoción aplicada en la cuenta y puede informar al cliente
- Por default, **una sola promoción aplica por ticket** (la de mayor beneficio para el cliente, configurable)
- Los reportes desglosan promociones aplicadas (`/core` §14.7)

---

## 10. Modos de servicio aplicables a Café & Bar

### 10.1 Modos típicos

Del catálogo del `/core` §6.1:

| Modo | Cuándo |
|---|---|
| `COMER_AQUI` | Cliente consume en mesa, terraza, barra |
| `PARA_LLEVAR` | Bebidas para llevar (café para oficina, smoothies) |
| `MESA` | Específicamente para zona de mesas con cuenta abierta |
| `BARRA` | Asientos de barra o tab libre |
| `DELIVERY_PROPIO` | Si el negocio tiene flotilla (raro pero existe; cafeterías con delivery) |
| `APP_RAPPI`, `APP_UBEREATS`, `APP_DIDI` | Si está dado de alta en plataformas |
| `EVENTO_PRIVADO` | Cafés y bares con servicio para eventos privados |

### 10.2 Configuración por zona vs. por ticket

Cada **zona del negocio** (§3.4) tiene modos típicos asociados:

- Zona "Mostrador": COMER_AQUI, PARA_LLEVAR
- Zona "Mesas": MESA, COMER_AQUI
- Zona "Barra": BARRA, COMER_AQUI

Cuando un cajero crea un ticket en una zona, los modos disponibles para ese ticket son los de la zona. Esto evita que el cajero de barra se equivoque eligiendo "MESA" cuando captura.

### 10.3 Reglas

- Los modos `MESA` y `BARRA` activan el flujo de cuenta abierta (Full Service)
- Los modos `COMER_AQUI` y `PARA_LLEVAR` en zona mostrador activan el flujo de QS
- Los apps externas se manejan como en cualquier otro vertical (`/core` §23)

---

## 11. Subtipos de Personal sugeridos

Del catálogo del `/core` §30.2, en Café & Bar típicamente se activan:

| Subtipo | Función específica |
|---|---|
| **Barista** | Especialista en café; opera mostrador o barra de café. Marca pedidos como listos, captura órdenes en zona mostrador, asigna propinas. **Subtipo nativo del vertical** |
| **Bartender / Cantinero** | Especialista en bar; opera la barra de licores. Captura órdenes directas, cobra rondas si aplica, recibe propinas. Variante del subtipo Barista |
| **Mesero** | Para zona de mesas (modelo Full Service). Toma orden en mesa, lleva a cocina/barra |
| **Hostess** | En cafeterías o bares grandes con waitlist |
| **Cocinero** | Si hay cocina de comida |
| **Ayudante de cocina / Bar back** | Apoyo al bartender (rellena hielo, copas, limpia barra) |
| **Runner** | Lleva bebidas de barra a mesa en bares con áreas separadas |
| **Personal general** | Limpieza, atención |

### 11.1 Capacidades del Barista (extensión de la sección 30 del /core)

- Login con PIN
- Operar en zona mostrador (captura y cobro tipo QS)
- Operar en zona barra (asientos con cuenta abierta o ronda)
- Marcar pedidos como listos
- Recibir propinas asignadas
- Aplicar promociones automáticas (sin PIN, ya están configuradas)
- Solicitar autorización para descuentos manuales (con PIN supervisor)

### 11.2 Capacidades del Bartender

Idénticas al Barista, con énfasis en:
- Manejo de cuentas abiertas largas
- Cobro por ronda (si aplica)
- Pre-pago (si aplica en zona)
- Reportes específicos del bar (ventas por categoría de licor)

### 11.3 Permisos de operación

- **Barista/Bartender:** opera mostrador + barra, pero no necesariamente zona "Mesas" (esa es del Mesero)
- **Mesero:** opera zona "Mesas", no opera mostrador ni barra a menos que el admin le otorgue permiso
- **Hostess:** sienta clientes, gestiona waitlist; no captura pedidos
- **Supervisor/Admin:** opera todas las zonas

---

## 12. Configuración inicial específica del vertical

### 12.1 Configuraciones que Café & Bar agrega al `/core` §28

- **Zonas del negocio:** lista de zonas con modelo asignado (mostrador/mesa/barra) — sección §3
- **Configuración de cada barra:** modo (asientos numerados, libre, ronda, pre-pago), capacidad, bartenders asignados (§4)
- **Alertas de cuentas prolongadas:** umbrales (2h, 4h, sin movimiento >1h) y receptores de alerta (§5)
- **Promociones automáticas pre-cargadas:** selección de templates de happy hour, etc. (§9.3)
- **Modos de servicio activos por zona:** restringidos a los lógicos de cada modelo (§10.2)
- **Categorías de inventario sugeridas:** Cafés, Tés, Bebidas frías, Licores, Cervezas, Vinos, Mezcales, Comida ligera (acelerar setup)
- **Templates de recetas sugeridas:** algunas recetas clásicas pre-cargadas (espresso, americano, margarita, cuba) para acelerar el inventario inicial
- **Subtipos de Personal específicos:** barista, bartender, mesero, hostess, runner, bar back

### 12.2 Wizard de onboarding sugerido

Cuando el dueño crea un negocio Café & Bar:

```
Paso 1: Datos del negocio
Paso 2: ¿Qué tipo de negocio es? (café especialidad / café casual / juice bar / 
        cantina / mezcalería / cervecería / wine bar / otro)
Paso 3: Zonas del negocio — captura mostrador, mesas, barra, terraza según aplique
Paso 4: Modelo operativo de cada zona (mostrador-QS, mesa-FS, barra-modo)
Paso 5: Catálogo inicial — selección de templates de productos según tipo
Paso 6: Inventario y recetas (recomendado activar para Café & Bar)
        Templates de recetas según tipo de negocio
Paso 7: Promociones automáticas — selección de templates de happy hour, etc.
Paso 8: Personal — baristas, bartenders, meseros
Paso 9: Configuración general
```

El wizard tiene templates específicos por subtipo de negocio para acelerar la captura inicial.

---

## 13. KPIs y reportes específicos

### 13.1 KPIs únicos del vertical

Más allá de los reportes base del `/core` §29, Café & Bar necesita:

- **Mix de ventas: bebidas vs. comida** — proporción que define el negocio
- **Ticket promedio por modelo** (mostrador vs. mesa vs. barra)
- **Tiempo de cuenta abierta promedio** por mesa/asiento
- **Productos top por categoría** (cocteles más vendidos, cafés más vendidos)
- **Costo % por categoría de bebida** (margen real de cocteles vs. cervezas vs. cafés)
- **Efectividad de promociones automáticas:** descuento total aplicado, % de tickets con promo, productos más promocionados
- **Productos con mayor merma** (importante en bar con licor)
- **Ventas por hora del día** (identifica happy hour real vs. el configurado)
- **Propinas por barista/bartender** (sección §11 + Full Service §11)
- **Cuentas largas:** mesas con >3h, frecuencia, valor

### 13.2 Reportes específicos

- **Reporte de barra:** ventas por bebida, costo, margen, top vendedores
- **Reporte de happy hour:** ventas durante promoción vs. ventas normales, descuento aplicado, ROI estimado
- **Reporte de zonas:** ventas por zona (mostrador, mesas, barra), ticket promedio, rotación
- **Reporte de propinas:** desglose por barista/bartender/mesero
- **Reporte de inventario líquido:** stock actual en ml/oz, días de cobertura por insumo, alertas
- **Reporte de costo de coctel:** por receta, costo real, precio sugerido vs. precio actual

### 13.3 Dashboard del bar en tiempo real

Durante la operación, el supervisor ve:

```
┌─────────────────────────────────────────┐
│   BARRA — TIEMPO REAL                   │
├─────────────────────────────────────────┤
│   Tickets cerrados: 47   Abiertos: 12   │
│   Ventas turno: $18,420                 │
│                                         │
│   Categorías top:                       │
│   • Cocteles: $7,200 (40 unidades)      │
│   • Cervezas: $4,800 (60 unidades)      │
│   • Mezcal: $3,200 (32 unidades)        │
│   • Comida: $3,220                      │
│                                         │
│   Alertas:                              │
│   ⚠️ Mesa 5 abierta 3h 12min            │
│   ⚠️ Tequila premium: stock crítico     │
│   ✨ Happy hour activo (cervezas -30%)  │
│                                         │
│   Bartenders activos:                   │
│   Pedro M.: $8,420 (3 mesas, 18 rondas) │
│   Ana L.: $10,000 (4 asientos, 22 rondas)│
└─────────────────────────────────────────┘
```

---

## 14. Reglas duras específicas del vertical

Adicionales a las reglas del `/core`, QS y Full Service:

1. **Un negocio puede operar simultáneamente mostrador + mesa + barra.** No se fuerza un modelo único.

2. **Cada zona tiene su modelo configurado.** El cajero ve la UX apropiada según la zona seleccionada.

3. **Las cuentas abiertas no tienen tiempo máximo de vida** (más allá del cierre del día), pero el sistema alerta cuando son prolongadas.

4. **Cambio de bartender/mesero NO fuerza cierre de cuenta.** La cuenta se traspasa al siguiente con todos los datos.

5. **Antes del cierre de día, todas las cuentas abiertas deben resolverse** (cobrar, cancelar o postergar con autorización admin).

6. **Cobro por ronda y cuenta abierta son mutuamente excluyentes por zona.** Una zona configurada como "ronda" no puede tener cuenta abierta.

7. **Pre-pago al pedir requiere zona dedicada** con cajero separado del bartender.

8. **Las promociones automáticas usan la mecánica del `/core` §14.** No se inventa motor nuevo.

9. **Por default una sola promoción aplica por ticket** (la de mayor beneficio para el cliente), configurable a "acumulables".

10. **Las recetas con ml/oz son módulo de inventario estándar** (`/core` Parte IX). No requieren infraestructura nueva.

11. **Bartender es un subtipo del rol Personal, no un rol nuevo.** Hereda permisos del barista con variantes.

12. **Asientos de barra y mesas comparten mecánicas de cuenta abierta**, división, propinas, operaciones de transferencia. Diferencia es solo de UX (asiento vs. mesa).

13. **El módulo de inventario es muy recomendable, no obligatorio.** Pero sin él, no se pueden calcular costos de cocteles ni márgenes reales — desperdicia el valor del vertical.

---

## 📌 Decisiones cerradas del vertical

Decisiones tomadas específicamente para Café & Bar:

1. ✅ **Vertical amplio:** cubre cafeterías de especialidad, coffee shops casuales (Starbucks-like), juice bars, cantinas, bares, mezcalerías, cervecerías, wine bars, pulquerías. Es un vertical "ancho" no "delgado".

2. ✅ **Operación híbrida configurable por zona.** Un mismo negocio puede operar mostrador (QS) + mesa (Full Service) + barra (intermedio) simultáneamente. Cada zona elige su modelo.

3. ✅ **Tres modelos operativos soportados:** mostrador-QS, mesa-FS, barra (con sub-modos: cuenta abierta, ronda, pre-pago).

4. ✅ **Inventario por unidad apropiada (ml/oz/g/pieza) gestionado por el módulo Parte IX del `/core`.** No se inventa funcionalidad nueva; se usa la existente con templates de recetas pre-cargadas.

5. ✅ **Happy hour y promociones por horario usan la mecánica genérica del `/core` §14.** Templates de promociones pre-cargados en el onboarding para acelerar setup.

6. ✅ **Cuentas abiertas prolongadas con alerta configurable** (mesa >2h, >4h, sin movimiento >1h). Alertas son informativas, no bloqueantes.

7. ✅ **Cobro por ronda soportado:** capturar y cobrar al servir, sin acumular cuenta. Modo configurable por zona.

8. ✅ **Pre-pago soportado:** cliente paga primero, luego se sirve. Modo configurable por zona (típico en eventos de alto volumen).

9. ✅ **Bartender como subtipo de Personal**, variante del Barista, especializado en bar con licores.

10. ✅ **Asientos de barra como entidad híbrida:** mecánica de cuenta abierta (Full Service), captura directa del bartender (QS), UX dedicada.

11. ✅ **Templates de catálogo y recetas según subtipo de negocio** para acelerar el onboarding.

12. ✅ **Módulo de Inventario es altamente recomendado** para Café & Bar por la naturaleza del costeo. Sin él, no hay margen real medible.

---

## 📌 Pendientes específicos de Café & Bar

Cosas a definir antes o durante el desarrollo:

1. **Diseño detallado de las "tabs libres" de barra:** UX de etiquetar tabs descriptivamente ("Hombre playera azul") sin que sea engorroso para el bartender. Validar con bartenders reales en operación.

2. **Política de propinas en cobro por ronda:** ¿se sugiere propina en cada ronda o solo en la última? Configurable por negocio.

3. **Integración con sistema de barriles (cervecerías):** algunas cervecerías necesitan tracking de barriles activos, cuánto les queda, cambios de barril. Posible add-on futuro.

4. **Pesado de licor en barra (ground-truth de servir):** algunas barras usan jiggers (medidores físicos) o balanzas digitales para precisión. El POS podría integrarse con balanzas conectadas. Fase futura.

5. **Programa de membresía / suscripción de café:** algunas cafeterías ofrecen "café ilimitado por X pesos al mes". No en MVP, futuro CRM.

6. **Customización de bebidas detalladas (lattes a la Starbucks):** sistema robusto de modificadores ya cubre la mayoría. Validar con cafetería casual real.

7. **Integración con apps de café propias:** algunas cadenas tienen su propia app de pedidos y lealtad. No en MVP.

8. **Reservaciones de wine bar / cata:** algunos wine bars hacen catas con reserva previa. Cubierto por add-on Reservaciones Pro futuro.

9. **Inventario de barril de vino abierto (mermas por vencimiento):** los vinos abiertos duran 1-3 días. Tracking de fechas y alertas. Posible mejora del módulo de inventario.

10. **Flights / kits de degustación:** vender un "flight de mezcales" (3 mezcales pequeños a precio especial). Modelado como producto combo en el catálogo, pero la UX de mostrar al cliente puede mejorarse.

11. **Servicio de catering:** algunos cafés y bares ofrecen servicio para eventos privados externos. ¿Cómo se gestiona? Probable: como modo `EVENTO_PRIVADO` con cuenta separada.

12. **Tarjetas de regalo / gift cards:** muchos cafés venden tarjetas pre-pagadas. No en MVP, módulo futuro.

13. **Soporte para múltiples baristas atendiendo la misma barra:** en cafeterías casuales con 2-3 baristas atrás, ¿cada uno captura por separado o uno solo es el principal? Validar UX.

---

*Documento de flujos del módulo Café & Bar — VIM POS v1.1. Plan Maestro — Fermín, VIM Marketing.*

*Para flujos comunes a todos los verticales, consulta `01-FLUJOS-COMUNES-CORE.md` v3.*
*Para mecánicas heredadas de QS (mostrador), consulta `02-FLUJOS-QUICK-SERVICE.md` v3.*
*Para mecánicas heredadas de Full Service (mesa, cuenta abierta, división, propinas), consulta `04-FLUJOS-FULL-SERVICE.md` v1.*
