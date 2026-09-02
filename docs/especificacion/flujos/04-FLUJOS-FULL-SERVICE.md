# 🍽️ FLUJOS DEL MÓDULO FULL SERVICE

## Manual operativo del vertical Full Service de VIM POS

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v1 — pre-desarrollo
> Última actualización: Mayo 2026
>
> **Prerrequisito de lectura:** este documento asume que ya leíste `01-FLUJOS-COMUNES-CORE.md` v3. Aquí solo se describe lo que es **específico de Full Service**.

---

## Propósito de este documento

Este documento describe **solo lo que el vertical Full Service agrega encima del `/core`**. Full Service es estructuralmente distinto a QS y Foodtruck porque introduce el concepto de **mesa con cuenta abierta prolongada y cobro al final del consumo**.

Los conceptos exclusivos de este vertical:

1. **Mapa de mesas (visual o lista)** — el "tablero de control" del restaurante
2. **Cuenta abierta por mesa** — el ticket vive por minutos u horas, se modifica continuamente
3. **Mesero como responsable** — asignación de mesas y comandas a usuarios específicos
4. **Cursos de cocina** — envío de la comanda por etapas (entradas → fuertes → postres)
5. **División de cuenta** — varias formas de dividir el total al cobrar
6. **Propinas asignadas a meseros** — registro estructurado de quién recibió cuánto
7. **Waitlist (lista de espera del día)** — gestión básica de clientes esperando mesa
8. **Operaciones de mesa** — transferir, unir, separar, reasignar mesero

Todo lo demás (caja, ticket en sí, cobro de cada cuenta, comanda, inventario, contingencias, reportes base) viene del `/core` y no se repite.

> **Regla:** si buscas algo y no está en este documento, está en el `/core`. Este manual asume conocimiento previo del documento `01-FLUJOS-COMUNES-CORE.md`.

---

## Tabla de contenidos

1. [Perfil operativo del vertical](#1-perfil-operativo-del-vertical)
2. [Hereda del /core y agrega lo específico](#2-hereda-del-core-y-agrega-lo-específico)
3. [Mapa de mesas (visual o lista)](#3-mapa-de-mesas-visual-o-lista)
4. [Estados de una mesa](#4-estados-de-una-mesa)
5. [Flujo principal: ciclo de vida de una mesa](#5-flujo-principal-ciclo-de-vida-de-una-mesa)
6. [Asignación de mesero a la mesa](#6-asignación-de-mesero-a-la-mesa)
7. [Captura de comanda — dos modelos soportados](#7-captura-de-comanda--dos-modelos-soportados)
8. [Cursos de cocina (envío por etapas)](#8-cursos-de-cocina-envío-por-etapas)
9. [Operaciones de mesa: transferir, unir, separar, reasignar mesero](#9-operaciones-de-mesa-transferir-unir-separar-reasignar-mesero)
10. [Cobro al final: cuenta del cliente y división](#10-cobro-al-final-cuenta-del-cliente-y-división)
11. [Propinas: registro y asignación a meseros](#11-propinas-registro-y-asignación-a-meseros)
12. [Waitlist (lista de espera del día)](#12-waitlist-lista-de-espera-del-día)
13. [Modos de servicio aplicables a Full Service](#13-modos-de-servicio-aplicables-a-full-service)
14. [Subtipos de Personal sugeridos para Full Service](#14-subtipos-de-personal-sugeridos-para-full-service)
15. [Configuración inicial específica del vertical](#15-configuración-inicial-específica-del-vertical)
16. [KPIs y reportes específicos](#16-kpis-y-reportes-específicos)
17. [Reglas duras específicas del vertical](#17-reglas-duras-específicas-del-vertical)
18. [Decisiones cerradas del vertical](#-decisiones-cerradas-del-vertical)
19. [Pendientes específicos de Full Service](#-pendientes-específicos-de-full-service)

---

## 1. Perfil operativo del vertical

### 1.1 ¿Qué es un Full Service?

Restaurante con servicio en mesa. El cliente:

1. Llega al restaurante (con o sin reservación; en MVP solo waitlist)
2. Es recibido y sentado en una mesa
3. Un mesero le toma la orden
4. La cocina prepara
5. El mesero sirve
6. El cliente consume (puede durar 30-120 minutos)
7. El cliente pide la cuenta
8. El mesero la lleva
9. El cliente paga (frecuentemente con división entre comensales)
10. El cliente deja propina
11. La mesa se desocupa y se limpia para el siguiente cliente

Ejemplos: marisquerías, restaurantes familiares, bistros, restaurantes regionales, casual dining, cantinas con comida formal, restaurantes de carnes.

### 1.2 Características operativas distintivas

| Característica | Valor típico |
|---|---|
| Tamaño | Desde 8 hasta 60 mesas (sistema escalable) |
| Volumen | 30-200 tickets/día por sucursal |
| Ticket promedio | $300-$1,500 MXN |
| Tiempo de mesa | 30 min - 2 hrs |
| Rotación por mesa | 1-4 sentadas por día |
| Personal | Hostess, meseros, runners, cocineros, cajeros |
| Cobro | **Al final del consumo** (default y universal) |
| Cuenta abierta | Vive minutos u horas; modifica continuamente |
| Pago | Frecuente división entre comensales |
| Propinas | 10-20% del total, asignadas al mesero |

### 1.3 Lo que Full Service prioriza

1. **Vista del salón siempre visible** — el hostess y el supervisor necesitan ver qué pasa en cada mesa de un vistazo
2. **Cuenta abierta robusta** — el ticket de una mesa vive por horas y se modifica decenas de veces sin perder coherencia
3. **Múltiples meseros simultáneos** — cada uno con sus mesas, sin pisarse
4. **División de cuenta sin fricción** — momento crítico de la experiencia del cliente
5. **Propinas registradas con precisión** — los meseros confían en que su propina les llegue exacta
6. **Cursos de cocina** — cuando el mesero quiere coordinar los tiempos (opt-in)

### 1.4 Lo que Full Service NO necesita en MVP

- Reservaciones futuras (módulo Reservaciones Pro, add-on $249/mes en plan maestro)
- Confirmación automática al cliente por SMS/WhatsApp
- KDS interactivo (Fase 2; MVP usa comanda impresa)
- Gestión de membresías o lealtad avanzada (módulo CRM Pro add-on)
- Pre-autorización de tarjeta antes de cobrar
- Pre-pago de eventos privados (los eventos privados se cobran al cerrar)

---

## 2. Hereda del `/core` y agrega lo específico

### 2.1 Lo que Full Service hereda tal cual del `/core`

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
| Pedidos paralelos (como mesas en este vertical) | 12 |
| Cancelación de ticket | 13 |
| Descuentos manuales y automáticos | 14 |
| Devoluciones | 15 |
| Edición post-cobro | 16 |
| Pago y métodos | 17 |
| Ticket no fiscal del MVP (CFDI fase final) | 18 |
| Comanda y áreas de cocina | 19 |
| Estado de cocina del ticket | 20 |
| Entrega al cliente (servir el plato) | 21 |
| Delivery propio completo (módulo opcional) | 22 |
| Apps externas (módulo opcional, para Full Service que también opera apps) | 23 |
| Cierre de turno con validación admin | 24 |
| Cierre de día Z | 25 |
| Contingencias | 26 |
| Auditoría | 27 |
| Configuración del negocio | 28 |
| Reportes base | 29 |
| Subtipos de Personal | 30 |
| Inventario y recetas (módulo opcional, Parte IX) | 31-37 |

### 2.2 Lo que Full Service agrega específicamente

Las funcionalidades distintivas del vertical:

1. **Mapa de mesas** (§3) — vista visual o lista del salón
2. **Estados de mesa** (§4) — libre, ocupada, sucia, reservada
3. **Ciclo de vida de la mesa** (§5) — desde sentar al cliente hasta liberar la mesa
4. **Asignación de mesero** (§6) — quién es responsable de cada mesa
5. **Dos modelos de captura** (§7) — tablet por mesero o estación central
6. **Cursos de cocina opt-in** (§8) — enviar a cocina por etapas si el mesero lo decide
7. **Operaciones de mesa** (§9) — transferir, unir, separar, reasignar
8. **División de cuenta** (§10) — por persona, por ítem, partes iguales
9. **Registro de propinas a meseros** (§11) — quién recibió cuánto
10. **Waitlist** (§12) — lista de espera del día (sin reservaciones futuras en MVP)

### 2.3 Sobre el módulo de Inventario en Full Service

El módulo de Inventario y Recetas (Parte IX del `/core`) es **muy valioso en Full Service** porque:

- El menú suele ser más amplio que en QS (30-100 productos)
- Las recetas son más complejas (platillos con muchos insumos)
- El control de mermas es crítico (productos perecederos en grandes volúmenes)
- El control de costo por plato es clave para fijar márgenes

**Recomendación para clientes Full Service:** activar el módulo desde el inicio, aunque la captura inicial de recetas tome más tiempo que en QS.

---

## 3. Mapa de mesas (visual o lista)

### 3.1 Dos modos: visual y lista

Cada restaurante elige cómo prefiere ver su salón. Es una **configuración del negocio** (sección 28 del `/core` extendida).

| Modo | Cuándo conviene |
|---|---|
| **Visual** | Restaurantes con disposición física distintiva (terraza, salón, barra, secciones), 20+ mesas |
| **Lista** | Restaurantes pequeños (8-20 mesas) o donde la distribución física no importa para operar |

El restaurante puede cambiar entre modos sin perder datos.

### 3.2 Modo visual — diseño del salón

El admin diseña el salón en un editor drag-and-drop:

```
┌──────────────────────────────────────────────────────────────────┐
│   EDITOR DE SALÓN — Restaurante Casa Aldama                      │
├──────────────────────────────────────────────────────────────────┤
│   Secciones:  [Terraza] [Salón Principal] [Privado] [Barra]      │
│                                                                  │
│   ┌──────── SALÓN PRINCIPAL ────────┐                            │
│   │                                  │                            │
│   │   [M01]   [M02]      [M03]       │   Herramientas:           │
│   │    2p     4p          6p         │   • Agregar mesa          │
│   │                                  │   • Agregar área          │
│   │   [M04]   [M05]      [M06]       │   • Renombrar             │
│   │    4p     4p          8p         │   • Cambiar capacidad     │
│   │                                  │   • Eliminar              │
│   │           [BARRA: 6 lugares]     │                            │
│   │                                  │                            │
│   └──────────────────────────────────┘                            │
│                                                                  │
│         [ Guardar disposición ]                                  │
└──────────────────────────────────────────────────────────────────┘
```

Cada mesa tiene:
- **Nombre/número** (M01, Mesa 12, Privado A)
- **Capacidad** (2p, 4p, 6p, 8p... — comensales máximo)
- **Sección** (Terraza, Salón Principal, Privado, Barra)
- **Posición XY** en el editor (solo modo visual)

### 3.3 Modo lista

Vista simple sin gráficos:

```
┌──────────────────────────────────────────┐
│   MESAS — Restaurante Casa Aldama        │
├──────────────────────────────────────────┤
│   SALÓN PRINCIPAL                        │
│   • M01  — 2 personas                    │
│   • M02  — 4 personas                    │
│   • M03  — 6 personas                    │
│   • M04  — 4 personas                    │
│   • M05  — 4 personas                    │
│   • M06  — 8 personas                    │
│                                          │
│   TERRAZA                                │
│   • T01  — 4 personas                    │
│   • T02  — 4 personas                    │
│                                          │
│   PRIVADO                                │
│   • P01  — 10 personas                   │
│                                          │
│   [ Editar mesas ]                       │
└──────────────────────────────────────────┘
```

### 3.4 Vista operativa del mapa de mesas

En **modo visual**, la pantalla principal del POS muestra el salón con cada mesa coloreada según su estado (ver §4):

```
┌──────────────────────────────────────────────────────────────────┐
│   CASA ALDAMA — León Centro                María G.   🌐 ⚙       │
├──────────────────────────────────────────────────────────────────┤
│   Vista: [SALÓN ▼]    [Terraza] [Privado] [Barra]                │
│                                                                  │
│   ┌──────── SALÓN PRINCIPAL ────────┐                            │
│   │                                  │                            │
│   │   🟢 M01    🔴 M02    🟡 M03     │   Leyenda:                │
│   │   Libre    Ocupada   Sucia        │   🟢 Libre               │
│   │            $485     (cliente     │   🔴 Ocupada              │
│   │            18min     pidió       │   🟡 Sucia                │
│   │            Carlos    cuenta)     │   🔵 Reservada            │
│   │                                  │   ⚫ Cerrada              │
│   │   🟢 M04    🔴 M05    🔴 M06     │                            │
│   │   Libre    Ocupada   Ocupada     │                            │
│   │            $1,240    $680        │   Resumen:                │
│   │            42min     8min        │   12 mesas activas        │
│   │            Luis      Diana       │   8 ocupadas              │
│   │                                  │   3 libres                │
│   │           [BARRA]                │   1 sucia                 │
│   │           🔵 reserva 14:00        │   Total abierto: $4,890  │
│   │                                  │                            │
│   └──────────────────────────────────┘                            │
│                                                                  │
│   [➕ Nueva mesa walk-in]  [📋 Waitlist (3)]  [Pedidos en curso] │
└──────────────────────────────────────────────────────────────────┘
```

En **modo lista**, la misma información en formato tabular:

```
┌──────────────────────────────────────────────────────────────────┐
│   MESAS ACTIVAS — Vista general                                  │
├──────────────────────────────────────────────────────────────────┤
│  Mesa  Estado    Mesero    Comensales  Cuenta    Tiempo          │
│ ──────────────────────────────────────────────────────────────── │
│  M01   🟢 Libre   —         —           —         —              │
│  M02   🔴 Ocupada Carlos    3           $485      18 min         │
│  M03   🟡 Sucia   —         —           —         (limpiar)     │
│  M04   🟢 Libre   —         —           —         —              │
│  M05   🔴 Ocupada Luis      4           $1,240    42 min         │
│  M06   🔴 Ocupada Diana     2           $680      8 min          │
│  T01   🔵 Reserva —         —           —         14:00 (15min)  │
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘
```

### 3.5 Tap en una mesa

Independientemente del modo (visual o lista), tap en una mesa abre el detalle:

- Si está **libre**: opción "Sentar comensales"
- Si está **ocupada**: opción de "Ver/editar cuenta", "Agregar items", "Pedir cuenta", "Operaciones de mesa"
- Si está **sucia**: opción "Marcar como limpia / libre"
- Si está **reservada**: detalle de la reserva del día, opción "Cancelar reserva" o "Acomodar ahora"

---

## 4. Estados de una mesa

### 4.1 Estados posibles

```
[CERRADA] ──habilitar──> [LIBRE] ──sentar──> [OCUPADA]
                            ▲                    │
                            │                    ↓
                       [SUCIA]<──cliente sale──[CUENTA_PEDIDA]
                            │                    │
                            └───limpiar───────────┘

(Estado paralelo opcional)
[LIBRE] ──reservar──> [RESERVADA] ──cumple hora──> [OCUPADA] (al sentar) 
                                                  o se libera si no llega
```

| Estado | Descripción | Color visual |
|---|---|---|
| **CERRADA** | Mesa deshabilitada (en reparación, sin uso, fuera de servicio) | ⚫ Negro/gris |
| **LIBRE** | Disponible para sentar comensales | 🟢 Verde |
| **OCUPADA** | Comensales sentados, cuenta abierta | 🔴 Rojo |
| **CUENTA_PEDIDA** | Cliente pidió la cuenta, esperando que se cobre | 🟠 Naranja |
| **SUCIA** | Cliente salió, esperando limpieza | 🟡 Amarillo |
| **RESERVADA** | Tiene reserva del día asignada (waitlist con hora) | 🔵 Azul |

### 4.2 Transiciones y quién las dispara

| Desde | A | Quién dispara |
|---|---|---|
| CERRADA → LIBRE | Admin habilita la mesa | Admin |
| LIBRE → OCUPADA | Hostess o mesero sienta clientes | Hostess, mesero, supervisor |
| LIBRE → RESERVADA | Hostess marca reserva del día | Hostess |
| RESERVADA → OCUPADA | Reserva llega y se sienta | Hostess |
| RESERVADA → LIBRE | Reserva no llega (no-show) | Hostess (con motivo) |
| OCUPADA → CUENTA_PEDIDA | Cliente pide la cuenta | Mesero |
| CUENTA_PEDIDA → SUCIA | Se cobró la cuenta, clientes salieron | Sistema (al cerrar ticket) |
| OCUPADA → SUCIA | Cliente sale sin pedir cuenta y mesero confirma | Mesero |
| SUCIA → LIBRE | Personal limpió la mesa | Personal, mesero, supervisor |
| Cualquiera → CERRADA | Admin saca de servicio | Admin |

### 4.3 ¿Por qué un estado "SUCIA" separado?

Razón operativa real: en un restaurante con rotación alta, después de que el cliente paga y se va, la mesa no puede recibir comensales de inmediato — necesita ser despejada y limpiada (1-5 minutos típico).

Tener un estado **SUCIA** explícito permite:
- El hostess sabe qué mesas NO ofrecer a clientes nuevos
- El personal de piso ve qué hay que limpiar
- Reportes miden tiempo promedio de "limpieza" (oportunidad de mejora)

Si el restaurante quiere, puede saltarse este estado con un setting: "Al cobrar, mesa pasa directamente a LIBRE". Pero por default existe SUCIA.

### 4.4 Tiempo en cada estado (visible)

La mesa visualmente muestra cuánto lleva en su estado actual:

- **Ocupada 18min** — operación normal
- **Ocupada 2h 15min** — quizás es VIP, quizás se les olvidaron
- **Cuenta pedida 4min** — cobrarla rápido
- **Sucia 7min** — alguien debería limpiarla

El sistema **alerta visualmente** cuando una mesa lleva demasiado tiempo en estados que no deberían durar (cuenta pedida >10min, sucia >15min, etc.). Configurable.

---

## 5. Flujo principal: ciclo de vida de una mesa

### 5.1 Flujo completo paso a paso

**Paso 1 — Cliente llega:**

- Hostess saluda
- Si hay mesa libre apropiada → tap en mesa libre → "Sentar comensales" → captura # de comensales, nombre opcional, observaciones → mesa pasa a OCUPADA
- Si no hay mesa libre → "Agregar a waitlist" (ver §12)

**Paso 2 — Asignación de mesero:**

- Al sentar, el hostess elige (o el sistema asigna automáticamente si está configurado) qué mesero atenderá. Ver §6
- La mesa queda asociada al mesero responsable

**Paso 3 — Captura de la orden:**

- Mesero llega a la mesa
- Captura la comanda desde su tablet/teléfono propio o desde la estación central (ver §7)
- Productos con modificadores, notas, etc. (heredado del `/core` §4 y §11)
- Cuando termina la captura inicial → "Enviar a cocina"
- Mesero puede **retener** ítems para enviar después (cursos, ver §8)

**Paso 4 — Cocina prepara, mesero sirve:**

- Cocina recibe comanda (heredado del `/core` §19)
- Cocina marca platillos como listos
- Mesero (o runner, ver §14) lleva los platos
- Cada plato se marca como `ENTREGADO` (heredado del `/core` §21)

**Paso 5 — Cliente consume:**

- Durante el consumo, mesero puede agregar más ítems (refresco extra, postre)
- Cada agregado va a cocina/barra inmediatamente o se retiene según preferencia del mesero
- La cuenta abierta de la mesa crece continuamente

**Paso 6 — Cliente pide la cuenta:**

- Mesero toca "Pedir cuenta" en la mesa
- Mesa pasa a estado CUENTA_PEDIDA (🟠 naranja)
- El sistema imprime una **pre-cuenta** (no es CFDI, es un resumen para el cliente — ver §10)

**Paso 7 — Cobro:**

- El mesero acerca la cuenta impresa al cliente
- Cliente revisa, pide división si quiere (ver §10.3)
- Se cobra (cajero o mesero según configuración) usando los métodos del `/core` §17
- Se aplica propina (ver §11)
- El ticket pasa a `PAGADO`

**Paso 8 — Cliente se va:**

- Mesa pasa automáticamente a SUCIA (🟡 amarillo)
- Personal de piso limpia y marca como LIBRE
- Mesa lista para siguiente cliente

### 5.2 Tiempos típicos

- **Sentado a primer pedido:** 3-8 min
- **Primer pedido a primer plato:** 5-15 min
- **Tiempo de consumo:** 30-120 min
- **Pedir cuenta a pagar:** 3-10 min (cuanto más largo, peor experiencia)
- **Sucia a libre:** 1-5 min

El sistema reporta estos tiempos para identificar cuellos de botella.

---

## 6. Asignación de mesero a la mesa

### 6.1 Tres modos de asignación

El admin elige cómo asignar meseros, configurable por restaurante:

| Modo | Cómo funciona |
|---|---|
| **Manual** (default) | El hostess elige el mesero al sentar a los comensales |
| **Por sección** | Cada sección del salón tiene meseros asignados; el sistema sugiere automáticamente |
| **Por turno equitativo** | El sistema reparte mesas entre meseros disponibles para equilibrar carga |

### 6.2 Cambio de mesero responsable

Caso real: el mesero original sale a comida, otro toma su mesa. Ver §9.4 (reasignación de mesero).

### 6.3 Identificación visual

En el mapa de mesas, cada mesa muestra el **nombre del mesero** asignado. En modo visual, las mesas de un mismo mesero pueden mostrar un indicador de color secundario (banda/borde) para identificarlas rápido.

### 6.4 Reglas

- Una mesa puede tener un solo mesero responsable a la vez
- El histórico de meseros que atendieron la mesa queda registrado (importante para reportes de propinas, ver §11)
- Un mesero puede tener múltiples mesas simultáneas
- Si un mesero está logueado y se va sin cerrar sesión, el sistema **no reasigna sus mesas automáticamente** — un supervisor debe hacerlo manualmente

---

## 7. Captura de comanda — dos modelos soportados

VIM POS soporta dos modelos de captura simultáneamente. El restaurante puede usar uno, otro, o mezcla.

### 7.1 Modelo A — tablet por mesero

Cada mesero tiene su dispositivo (tablet, teléfono propio o asignado).

**Ventajas:**
- Captura inmediata al lado del cliente
- Pocas idas al mostrador
- Reduce errores de memoria
- Cliente percibe servicio moderno

**Cómo funciona:**
- Mesero se loguea con su PIN en cualquier dispositivo
- Ve solo las mesas asignadas a él (más, si tiene permiso, ve "todas las mesas")
- Tap en mesa → captura comanda directamente
- Confirma → envía a cocina

### 7.2 Modelo B — estación central

Hay una o varias **estaciones POS fijas** (mostrador, área de servicio). El mesero apunta el pedido a mano o en su memoria y luego va a la estación a capturarlo.

**Ventajas:**
- Hardware concentrado, menor costo
- Útil en restaurantes pequeños donde caben pocas tablets

**Cómo funciona:**
- Mesero toma la orden en libreta o memoria
- Va a la estación
- Login con su PIN
- Selecciona la mesa → captura comanda → envía a cocina

### 7.3 Modelo C — híbrido

El restaurante puede tener algunas tablets de mesero **y** una o dos estaciones centrales (típicamente la del cajero principal donde se cobra). Cualquier mesero loguea en cualquier dispositivo y opera.

### 7.4 Permisos relacionados

- **Mesero** ve y modifica solo las mesas asignadas a él, salvo que el admin le otorgue permiso de "ver todas las mesas"
- **Supervisor** ve todas las mesas y puede operar en cualquiera
- **Hostess** ve todas las mesas pero solo modifica el estado (sentar/desocupar/limpiar) — no captura comandas salvo permiso explícito

### 7.5 Reglas

- El sistema **no asume** un modelo específico. El restaurante usa lo que tiene
- Login con PIN es rápido (menos de 3 segundos) para minimizar fricción en estaciones compartidas
- Si se opera offline (heredado del `/core` §26), la captura sigue funcionando localmente en cada dispositivo

---

## 8. Cursos de cocina (envío por etapas)

### 8.1 ¿Qué es un curso?

Un "curso" es una **agrupación de ítems** que se preparan y sirven juntos. Lo típico en restaurantes:

- **Curso 1 — Entradas:** sopa, ensalada, botanas
- **Curso 2 — Platos fuertes:** carnes, mariscos, pastas
- **Curso 3 — Postres:** café, postres

El cliente quiere disfrutar las entradas tranquilamente antes de que llegue el plato fuerte. Si la cocina manda todo junto, mata la experiencia.

### 8.2 Decisión: opt-in del mesero

VIM POS no fuerza estructura formal de cursos. **El mesero decide** cuándo enviar cada ítem a cocina:

- Si no quiere usar cursos → captura todo y envía a cocina junto. Funciona como QS
- Si quiere usar cursos → captura toda la orden y **retiene ítems específicos** para enviar después

### 8.3 Cómo se materializa en la UX

En la captura de la comanda, cada ítem tiene un toggle:

```
┌─────────────────────────────────────────┐
│   COMANDA — MESA 5                      │
├─────────────────────────────────────────┤
│   3 comensales — Mesero: Carlos R.      │
│                                         │
│   ✓ Entradas                            │
│   • Ceviche de pescado    $185   [✓Cocina ahora]
│   • Aguachile             $195   [✓Cocina ahora]
│                                         │
│   ⏸ Retenido para después               │
│   • Camarones a la diabla $385   [⏸ Retener]
│   • Filete de huachinango $420   [⏸ Retener]
│                                         │
│   • Postres se piden después            │
│                                         │
│   ───────────────────────────────       │
│                                         │
│   [   ENVIAR A COCINA (entradas)   ]    │
│                                         │
│   2 ítems se mandan ahora               │
│   2 ítems retenidos para después        │
│                                         │
└─────────────────────────────────────────┘
```

### 8.4 Liberar ítems retenidos

Cuando el mesero quiere mandar el siguiente curso:

- Abre la mesa
- Ve los ítems retenidos
- Tap "Enviar curso 2" → los ítems retenidos se mandan a cocina como nueva comanda
- La comanda impresa lleva etiqueta visible: **"CURSO 2 — Mesa 5"** para que la cocina sepa que es continuación

### 8.5 Estructura técnica

Cada ítem en el ticket tiene un atributo `estado_envio_cocina`:

- `PENDIENTE_RETENIDO` — capturado pero no se ha mandado
- `ENVIADO_A_COCINA` — comanda impresa, cocina está preparando
- `LISTO` — cocina marcó como listo
- `ENTREGADO` — mesero/runner lo llevó

La comanda agrupa ítems por estado de envío en el momento, no por la captura completa del ticket.

### 8.6 Reglas

- **El mesero NO está obligado a usar cursos.** Es completamente opt-in
- Un ítem retenido puede modificarse o cancelarse antes de enviarse a cocina (no requiere PIN)
- Una vez enviado a cocina, se rige por las reglas estándar de cancelación (sección 13 del `/core`)
- La cocina recibe múltiples comandas de la misma mesa con la misma identificación (Mesa 5) pero etiquetadas por curso
- En reportes, los tiempos de cocina se miden por curso, no por ticket completo

---

## 9. Operaciones de mesa: transferir, unir, separar, reasignar mesero

> Estas operaciones son la realidad operativa diaria de un restaurante. Sin ellas el sistema es inservible para Full Service.

### 9.1 Transferir cliente a otra mesa

**Caso real:** El cliente fue sentado en M02 pero pide cambiarse a la M06 que está cerca de la ventana. Los productos ya capturados deben moverse a M06.

**Flujo:**

1. Mesero abre M02 → menú "Operaciones de mesa" → "Transferir a otra mesa"
2. Sistema muestra mesas libres:

```
┌─────────────────────────────────────────┐
│   TRANSFERIR MESA 2 A...                │
├─────────────────────────────────────────┤
│   Mesa actual: M02 (3 comensales)       │
│   Mesero: Carlos R.                     │
│   Items en cuenta: 4 productos          │
│                                         │
│   Selecciona mesa destino (libre):      │
│   • M01 — 2p                            │
│   • M04 — 4p                            │
│   • M06 — 8p ★ (sugerida por capacidad) │
│   • T01 — 4p (Terraza)                  │
│                                         │
│   Motivo (opcional):                    │
│   [ Cliente pidió cambio          ]     │
│                                         │
│         [ Cancelar ]   [ Transferir ]   │
└─────────────────────────────────────────┘
```

3. Confirma → M02 pasa a SUCIA, M06 pasa a OCUPADA con la cuenta completa
4. Bitácora registra: quién, cuándo, de dónde a dónde, motivo
5. Si ya había comandas en cocina, se imprime aviso a cocina: "ATENCIÓN: Mesa 2 ahora es Mesa 6"

### 9.2 Unir mesas (combinar cuentas)

**Caso real:** Dos parejas se conocen en el restaurante y deciden cenar juntos. Sus mesas M03 y M04 se juntan físicamente y van a pagar con una sola cuenta.

**Flujo:**

1. Mesero abre M03 → "Operaciones de mesa" → "Unir con otra mesa"
2. Selecciona M04
3. Sistema confirma:

```
┌─────────────────────────────────────────┐
│   UNIR MESAS                            │
├─────────────────────────────────────────┤
│   Origen: M03 (Carlos R., 2p, $485)     │
│   Destino: M04 (Carlos R., 2p, $620)    │
│                                         │
│   ¿Cuál será la mesa principal?         │
│   (•) M04 (la cuenta de M03 se          │
│        transfiere a M04)                │
│   ( ) M03                               │
│                                         │
│   Nueva cuenta combinada: $1,105        │
│   Comensales totales: 4                 │
│                                         │
│         [ Cancelar ]   [ Unir ]         │
└─────────────────────────────────────────┘
```

4. Confirma → M03 pasa a SUCIA, M04 mantiene su estado OCUPADA pero con cuenta combinada
5. Si los meseros eran distintos, el sistema pregunta cuál queda como responsable
6. Las propinas se registran al mesero responsable de la cuenta final (con bitácora del histórico)

### 9.3 Separar cuenta a varias mesas

**Caso inverso:** En una sola mesa estaban 6 comensales pero deciden separarse en dos mesas para pagar por separado.

**Esto NO es división de cuenta (que sí se hace en el mismo ticket — ver §10).** Esto es **dividir físicamente en dos mesas distintas** porque el grupo se separó.

**Flujo:**

1. Mesero abre M06 → "Operaciones de mesa" → "Separar a otra mesa"
2. Selecciona ítems que se van a otra mesa
3. Selecciona mesa destino libre
4. Sistema crea nuevo ticket en mesa destino con los ítems seleccionados; los descuenta del ticket original
5. Ambos tickets quedan abiertos y se cobran independientemente

### 9.4 Reasignar mesero responsable

**Caso real:** El mesero Carlos termina su turno o sale a comer; el mesero Diana toma sus mesas.

**Flujo A — Reasignación individual (una mesa):**

1. Supervisor o admin abre la mesa → "Operaciones" → "Cambiar mesero responsable"
2. Selecciona nuevo mesero
3. Confirma

**Flujo B — Reasignación masiva (todas las mesas de un mesero):**

1. Supervisor entra al panel "Meseros activos"
2. Selecciona Carlos R. → "Reasignar todas sus mesas"
3. Elige a Diana
4. Sistema mueve todas las mesas de Carlos a Diana en una operación

```
┌─────────────────────────────────────────┐
│   REASIGNAR MESAS DE CARLOS R.          │
├─────────────────────────────────────────┤
│   Mesas activas de Carlos:              │
│   • M02 — 3p — $485                     │
│   • M04 — 4p — $1,240                   │
│   • M05 — 2p — $680                     │
│                                         │
│   Total: 3 mesas, $2,405 en cuenta      │
│                                         │
│   Asignar todas a:                      │
│   [ Diana M.  ▼ ]                       │
│                                         │
│   Motivo (obligatorio):                 │
│   ( ) Cambio de turno                   │
│   ( ) Mesero salió a comer              │
│   ( ) Mesero indispuesto                │
│   ( ) Otro                              │
│                                         │
│   ⚠️ Las propinas de mesas cobradas      │
│   después de este cambio se asignan a   │
│   Diana M. El histórico queda registrado│
│                                         │
│         [ Cancelar ]   [ Reasignar ]    │
└─────────────────────────────────────────┘
```

### 9.5 Reglas universales para operaciones de mesa

- Todas las operaciones de mesa quedan en bitácora con motivo
- Si hay autorización necesaria (movimientos grandes, cambios masivos), se pide PIN de supervisor con el patrón estándar del `/core` §2.3
- Las operaciones funcionan offline (heredado del `/core` §26)
- La integridad de los datos es prioridad: nunca se pierde un ítem, una propina, o se duplica un cobro
- En reportes, una mesa que tuvo varios meseros muestra el histórico para evitar disputas de propinas

---

## 10. Cobro al final: cuenta del cliente y división

### 10.1 Política universal: cobro al final del consumo

Esta es **la regla por default** en Full Service. La cocina prepara y sirve antes de cobrar. El cliente paga al final de la experiencia.

**Razón:** es la norma cultural mexicana. Si el cliente "paga al pedir" en un restaurante con servicio en mesa, percibe el lugar como QS o fonda, no como Full Service.

> Restaurantes que quieran "cobrar al pedir" deberían operar como Quick Service. Si un negocio Full Service quiere híbridos raros, se configura caso por caso, pero NO es el escenario default que diseñamos.

### 10.2 Flujo del cobro

**Paso 1 — Cliente pide la cuenta:**

Mesero recibe la solicitud verbal del cliente y tap en "Pedir cuenta" desde la mesa. Mesa pasa a estado CUENTA_PEDIDA (🟠). Se imprime la **pre-cuenta**.

**Paso 2 — Pre-cuenta impresa (no es CFDI, es un resumen):**

```
═══════════════════════════════════
   CASA ALDAMA
   León Centro
═══════════════════════════════════
   PRE-CUENTA — MESA 5
   Folio interno: K-2026-002143
   3 comensales — Mesero: Carlos R.

   2x Aguachile         $390.00
   1x Ceviche pescado   $185.00
   3x Camarones diabla $1,155.00
   1x Pasta marinara    $245.00
   3x Refresco          $120.00
   2x Café              $90.00
   2x Flan de coco      $130.00

───────────────────────────────────
   Subtotal:        $2,315.00
   IVA (16%) incl:    $319.31

   TOTAL:           $2,315.00

   *** PRE-CUENTA — NO ES UN PAGO ***
   Por favor confirme su consumo

   ¿Desea propina sugerida?
   10%: $231.50 — 15%: $347.25
   20%: $463.00
═══════════════════════════════════
```

**Paso 3 — Cliente revisa:**

El mesero entrega la pre-cuenta. Cliente verifica, eventualmente reclama algún error → se corrige (con flujo de edición o devolución del `/core` §15/16).

**Paso 4 — Cliente decide forma de pago:**

- Pago único → flujo estándar del `/core` §17
- División de cuenta → ver §10.3

**Paso 5 — Cobro:**

Mesero lleva la cuenta al cajero (o cobra él mismo si tiene permiso — configurable en el restaurante). Se captura propina (ver §11). Ticket pasa a `PAGADO`. Mesa pasa a SUCIA.

### 10.3 División de cuenta — tres modalidades

VIM POS soporta tres formas de dividir, accesibles desde la pantalla de cobro:

```
┌─────────────────────────────────────────┐
│   COBRO — MESA 5                        │
├─────────────────────────────────────────┤
│   Total: $2,315.00                      │
│                                         │
│   ¿Cómo se paga?                        │
│                                         │
│   [ 💳 Pago único              ]        │
│   [ 👥 Partes iguales          ]        │
│   [ 🍽️ Dividir por ítems       ]        │
│   [ 👤 Por persona específica  ]        │
│                                         │
└─────────────────────────────────────────┘
```

### 10.4 División A — Partes iguales

Cliente: "Somos 3, divide entre 3."

```
┌─────────────────────────────────────────┐
│   DIVIDIR EN PARTES IGUALES             │
├─────────────────────────────────────────┤
│   Total: $2,315.00                      │
│                                         │
│   Dividir entre: [ 3 ] personas         │
│                                         │
│   Cada persona paga: $771.67            │
│                                         │
│   ¿Incluir propina?                     │
│   [ ] Sí, sugerida [ 15% ▼ ]            │
│   Cada uno paga: $887.42                │
│                                         │
│   [ Generar 3 sub-cuentas ]             │
└─────────────────────────────────────────┘
```

Al confirmar, el sistema genera **3 sub-cuentas** con el mismo monto. Cada una se cobra independientemente (puede ser método distinto por sub-cuenta: uno paga efectivo, otra tarjeta).

### 10.5 División B — Por ítems específicos

Cliente: "Yo pago mis camarones, mi novia paga su pasta, fulano paga lo que él pidió."

```
┌─────────────────────────────────────────┐
│   DIVIDIR POR ÍTEMS                     │
├─────────────────────────────────────────┤
│   Asigna cada ítem a una cuenta:        │
│                                         │
│   Cuenta 1 (Persona A):                 │
│   [✓] Aguachile           $195.00       │
│   [✓] Camarones diabla    $385.00       │
│   [✓] Refresco             $40.00       │
│   Subtotal: $620.00                     │
│                                         │
│   Cuenta 2 (Persona B):                 │
│   [✓] Ceviche pescado     $185.00       │
│   [✓] Pasta marinara      $245.00       │
│   [✓] Refresco             $40.00       │
│   [✓] Café                 $45.00       │
│   [✓] Flan de coco         $65.00       │
│   Subtotal: $580.00                     │
│                                         │
│   Cuenta 3 (Persona C):                 │
│   [✓] Aguachile           $195.00       │
│   [✓] Camarones diabla    $385.00       │
│   [✓] Camarones diabla    $385.00       │
│   [✓] Refresco             $40.00       │
│   [✓] Café                 $45.00       │
│   [✓] Flan de coco         $65.00       │
│   Subtotal: $1,115.00                   │
│                                         │
│   ─────────────────────────────         │
│   Total dividido: $2,315.00 ✓           │
│   (cuadra con el ticket)                │
│                                         │
│   [ + Agregar otra cuenta ]             │
│   [ Generar sub-cuentas ]               │
└─────────────────────────────────────────┘
```

El sistema verifica que la suma de las sub-cuentas = total del ticket. Si no cuadra (un ítem sin asignar), avisa.

### 10.6 División C — Por persona específica (monto manual)

Cliente: "Mi amigo paga $500, yo el resto."

Caso menos común pero posible:

```
┌─────────────────────────────────────────┐
│   DIVIDIR POR MONTO MANUAL              │
├─────────────────────────────────────────┤
│   Total: $2,315.00                      │
│                                         │
│   Captura cada cuenta:                  │
│                                         │
│   Cuenta 1: $ [   500.00 ]              │
│   Cuenta 2: $ [ 1,815.00 ]  (calculado) │
│                                         │
│   [ + Agregar otra cuenta ]             │
│                                         │
│   Total dividido: $2,315.00 ✓           │
│                                         │
│   [ Generar sub-cuentas ]               │
└─────────────────────────────────────────┘
```

El sistema calcula la última cuenta como complemento. Si el usuario captura todas manualmente, el sistema valida que sumen el total.

### 10.7 Cobro de sub-cuentas

Cada sub-cuenta generada por división:

- Tiene su propio sub-folio (ej. K-2026-002143-A, K-2026-002143-B, K-2026-002143-C)
- Se cobra independientemente con cualquier método del `/core` §17
- Puede tener propina independiente (ver §11)
- Puede facturarse independientemente cuando el CFDI esté activo (cada uno con su RFC distinto)
- Los descuentos aplicados al ticket original se distribuyen proporcionalmente entre sub-cuentas (configurable)

### 10.8 Cancelar división y volver a una cuenta

Si por error se generaron sub-cuentas, mientras ninguna se haya cobrado, se puede revertir con "Cancelar división" → todo vuelve al ticket original.

Una vez que se cobra al menos una sub-cuenta, **no se puede deshacer la división**. Si hay error, se procesa con devolución y se vuelve a generar.

### 10.9 Reglas

- División de cuenta **solo aplica antes de cobrar**, no después
- El mesero puede generar la división, o el cajero al recibir la cuenta
- El total de las sub-cuentas siempre = total del ticket (validación dura)
- Sub-cuentas se imprimen como tickets separados al cobrar
- Los movimientos de inventario (si el módulo Parte IX está activo) ocurren una sola vez al ticket original, no se duplican

---

## 11. Propinas: registro y asignación a meseros

### 11.1 Filosofía

VIM POS **registra qué propina recibió qué mesero** para auditoría y trazabilidad. **El reparto operativo (tronco común, % por hora trabajada, etc.) es política del restaurante y se resuelve fuera del sistema.**

Esta decisión es coherente con la filosofía del `/core`: el sistema registra hechos, el negocio toma decisiones.

### 11.2 Captura de propina al cobrar

Al pagar (sea ticket único o sub-cuenta), aparece el paso de propina:

```
┌─────────────────────────────────────────┐
│   PROPINA — CUENTA $1,115.00            │
├─────────────────────────────────────────┤
│   Mesero asignado: Carlos R.            │
│                                         │
│   Sugerencias:                          │
│   [ Sin propina ]                       │
│   [ 10%: $111.50 ]                      │
│   [ 15%: $167.25 ] ★ sugerida           │
│   [ 20%: $223.00 ]                      │
│   [ Otro monto: $______ ]               │
│                                         │
│   Monto seleccionado: $167.25           │
│                                         │
│   ¿Quién recibe la propina?             │
│   (•) Carlos R. (mesero asignado)       │
│   ( ) Otro mesero/personal              │
│   ( ) Repartir entre varios             │
│                                         │
│   Método de la propina:                 │
│   ( ) En efectivo, directo al mesero    │
│   ( ) Junto con el pago (mismo método)  │
│                                         │
│   Total a cobrar: $1,282.25             │
│                                         │
│         [ Sin propina ]   [ Confirmar ] │
└─────────────────────────────────────────┘
```

### 11.3 Casos especiales

**Cambio de mesero durante la cuenta:**

Si en la mesa pasaron dos meseros (Carlos atendió la primera parte, Diana cobró), al momento de la propina el sistema avisa:

```
┌─────────────────────────────────────────┐
│   PROPINA — ASIGNACIÓN                  │
├─────────────────────────────────────────┤
│   Esta mesa fue atendida por:           │
│   • Carlos R. (de 19:30 a 20:45)        │
│   • Diana M. (de 20:45 a 21:30)         │
│                                         │
│   ¿A quién asignar la propina?          │
│   ( ) Carlos R. completa                │
│   ( ) Diana M. completa                 │
│   (•) Repartir:                         │
│     Carlos R.: $ [ 100.00 ]             │
│     Diana M.:  $ [  67.25 ]             │
│                                         │
│         [ Confirmar ]                   │
└─────────────────────────────────────────┘
```

**Repartir entre varios:**

Si el cliente dice "para todos los que nos atendieron, incluyendo el cocinero", se permite asignar a múltiples personas con montos específicos:

```
Diana M.    $80.00
Carlos R.   $50.00
Cocinero    $30.00
Hostess     $7.25
            ────────
Total       $167.25
```

### 11.4 Método de la propina

- **En efectivo, directo al mesero:** la propina NO se cobra junto con el ticket. El cliente le da el efectivo al mesero. El sistema solo registra el monto y el receptor. NO entra a caja.
- **Junto con el pago (mismo método):** la propina se cobra junto con el total. Si fue tarjeta, va al estado de cuenta del comercio (luego se reparte al mesero). Si fue efectivo, entra a caja y al cierre se separa.

### 11.5 Propinas en sub-cuentas (división)

Cada sub-cuenta puede tener propina independiente con monto y método propios.

### 11.6 Reportes de propinas

El módulo Full Service agrega reportes específicos (ver §16):

- **Propinas por mesero — del turno** (cuánto se llevó cada uno hoy)
- **Propinas por mesero — del periodo** (semanal, mensual)
- **Propinas por método** (efectivo vs. tarjeta vs. mixto)
- **% de mesas con propina** vs. sin propina
- **Propina promedio por ticket por mesero**

### 11.7 Reglas

- Toda propina queda registrada con: monto, método, mesero(s) que la reciben, ticket asociado
- La propina NO afecta el subtotal de la venta para fines fiscales (es ingreso del mesero, no del negocio)
- Cuando el módulo CFDI esté activo, las propinas tendrán el tratamiento fiscal correcto según normativa SAT
- El sistema **no calcula** repartos automáticos (tronco, %, etc.). Solo registra.
- La propina puede ser **$0** (cliente decidió no dejar)

---

## 12. Waitlist (lista de espera del día)

### 12.1 Alcance del MVP: solo waitlist, sin reservaciones futuras

> **Decisión cerrada:** en MVP solo manejamos la lista de espera del día. Las reservaciones futuras (calendarizadas con confirmación SMS, recordatorios, política de no-show) son **add-on** "Reservaciones Pro" según plan maestro ($249/mes).

La waitlist es esencial para operar; las reservaciones futuras son comercializables aparte.

### 12.2 Cuándo aparece la waitlist

El hostess agrega a la waitlist cuando:

- Llega un cliente y no hay mesa disponible inmediata
- Cliente llamó para pedir que lo anoten para "ahorita en 30 minutos"
- Cliente llegó antes de su llegada planeada y debe esperar

### 12.3 UX de la waitlist

Botón visible permanente en la pantalla principal (junto al mapa de mesas):

```
┌──────────────────────────────────────────┐
│   📋 WAITLIST DEL DÍA               (3)  │
├──────────────────────────────────────────┤
│                                          │
│   1. Familia González           4p       │
│      📞 477 123 4567                     │
│      Esperando desde: 13:15 (45 min)     │
│      Tiempo estimado: ~15 min            │
│      Notas: "Necesitan silla bebé"       │
│      [ Acomodar en mesa ▼ ]              │
│                                          │
│   2. María Hernández            2p       │
│      📞 477 987 6543                     │
│      Esperando desde: 13:25 (35 min)     │
│      Tiempo estimado: ~10 min            │
│      [ Acomodar en mesa ▼ ]              │
│                                          │
│   3. Pedro (sin apellido)       6p       │
│      Esperando desde: 13:40 (20 min)     │
│      Tiempo estimado: ~25 min            │
│      Notas: "Está en el coche"           │
│      [ Acomodar en mesa ▼ ]              │
│                                          │
│   [ + Agregar a waitlist ]               │
└──────────────────────────────────────────┘
```

### 12.4 Agregar a waitlist

```
┌─────────────────────────────────────────┐
│   AGREGAR A WAITLIST                    │
├─────────────────────────────────────────┤
│   Nombre del cliente:                   │
│   [ Familia López                    ]  │
│                                         │
│   Comensales: [ 4 ]                     │
│                                         │
│   Teléfono (opcional):                  │
│   [ 477 555 1234                     ]  │
│                                         │
│   Notas (opcional):                     │
│   [ Cliente frecuente, prefiere       ] │
│   [ terraza si es posible             ] │
│                                         │
│   Tiempo estimado de espera:            │
│   [ 20 ] minutos                        │
│                                         │
│         [ Cancelar ]   [ Agregar ]      │
└─────────────────────────────────────────┘
```

### 12.5 Acomodar cliente de la waitlist

Cuando una mesa apropiada se libera, hostess toca "Acomodar en mesa" en el cliente:

```
┌─────────────────────────────────────────┐
│   ACOMODAR EN MESA                      │
├─────────────────────────────────────────┤
│   Cliente: Familia González (4p)        │
│   Esperando: 45 min                     │
│                                         │
│   Mesas disponibles (4p o más):         │
│   • M04 — 4p (libre, salón)             │
│   • M06 — 8p (libre, salón)             │
│   • T01 — 4p (libre, terraza)           │
│                                         │
│   Asignar mesero:                       │
│   [ Carlos R. ▼ ]                       │
│                                         │
│         [ Cancelar ]   [ Acomodar ]     │
└─────────────────────────────────────────┘
```

Al acomodar:
- Mesa pasa de LIBRE → OCUPADA
- Cliente queda asociado a la mesa (el nombre y notas pasan)
- Cliente se quita de la waitlist
- Tiempo total de espera queda registrado para reportes

### 12.6 Quitar cliente de la waitlist sin acomodar

Si el cliente se cansa de esperar y se va:

```
Motivo:
( ) Cliente se cansó de esperar
( ) Cliente se fue sin avisar
( ) Cliente avisó que ya no viene
( ) Otro
```

Queda registro para reportes de "clientes perdidos".

### 12.7 Reportes de waitlist

- **Clientes en waitlist por día/hora pico**
- **Tiempo promedio de espera**
- **Tasa de "clientes perdidos"** (waitlist abandonada)
- **Hora del día con más espera**

### 12.8 Reglas

- La waitlist vive solo durante el día. Al cierre, se archiva.
- Clientes en waitlist NO ocupan mesa todavía — solo están registrados
- Una mesa marcada como RESERVADA (azul, sección §4) representa un cliente de waitlist al que ya se le asignó una mesa específica que está pendiente de llegada (raro en MVP sin reservaciones futuras, pero usable)

---

## 13. Modos de servicio aplicables a Full Service

### 13.1 Modos típicos en Full Service

Del catálogo del `/core` sección 6.1:

| Modo | Cuándo |
|---|---|
| `MESA` | El modo predominante. Cliente come en mesa del restaurante |
| `BARRA` | Si el restaurante tiene barra (algunos casuales sí, formales no) |
| `PARA_LLEVAR` | Cliente que solo viene a recoger comida (algunos restaurantes lo manejan) |
| `DELIVERY_PROPIO` | Si el restaurante tiene flotilla |
| `APP_RAPPI`, `APP_UBEREATS`, `APP_DIDI` | Si el restaurante está dado de alta en plataformas |

### 13.2 Modo MESA — particularidades

Cuando el modo del ticket es MESA:

- El ticket está asociado a una mesa específica (sección 5)
- Tiene mesero responsable (sección 6)
- El cobro es al final del consumo
- Aplica división de cuenta (sección 10)
- Aplica propinas asignadas (sección 11)

### 13.3 Modo BARRA

Caso de Full Service con barra (raro pero existe — ej. restaurantes con barra de tequila o bar dentro del restaurante):

- Asociado a un "asiento de barra" si están numerados, o "Barra libre"
- Puede tener cuenta abierta o cobro por ronda según el restaurante
- Comparte mucha mecánica con el vertical Café & Bar; si el restaurante usa mucho la barra, probablemente le conviene operar como Café & Bar

### 13.4 Modo PARA_LLEVAR en Full Service

Cliente que viene a recoger (puede haber llamado antes, o llega y pide):

- No ocupa mesa
- El ticket se trata como QS: cobro antes de cocina (o configurable)
- Sigue el flujo de QS, no de mesa

### 13.5 Modo DELIVERY_PROPIO

Heredado completamente del `/core` §22. Sin cambios.

### 13.6 Modos APP_*

Heredados del `/core` §23. Algunos restaurantes Full Service también operan apps externas, especialmente los casual dining.

---

## 14. Subtipos de Personal sugeridos para Full Service

Del catálogo del `/core` sección 30.2, en Full Service típicamente se activan **muchos** subtipos:

| Subtipo | Función en Full Service |
|---|---|
| **Mesero** | Captura comandas, atiende mesas, cobra (si tiene permiso), recibe propinas |
| **Hostess** | Recibe clientes, gestiona waitlist, asigna mesas, asigna meseros |
| **Cocinero** | Prepara, marca platillos como listos |
| **Ayudante de cocina** | Apoyo en cocina, sin marcar listos |
| **Runner** | Lleva platos de cocina a mesa (en restaurantes grandes) |
| **Barista** | Si hay barra de café o de cocteles |
| **Personal general** | Limpieza, atención al cliente |

**No aplican en Full Service:** Repartidor (a menos que delivery propio esté activo), Armador (de Dark Kitchen).

### 14.1 Capacidades por subtipo (extensión de la sección 30 del /core)

- **Mesero:**
  - Login con PIN
  - Ver mesas asignadas (o todas, según permiso)
  - Capturar comanda en sus mesas
  - Enviar a cocina (con o sin retención de cursos)
  - Marcar ítems como entregados al cliente
  - Pedir cuenta para la mesa
  - Cobrar (si configurado) o pasar al cajero
  - Asignar propina al cerrar cuenta
  - Hacer operaciones de mesa (transferir, unir, separar — algunas con autorización)

- **Hostess:**
  - Login con PIN
  - Ver mapa de mesas completo
  - Cambiar estado de mesa (sentar, marcar sucia, marcar limpia)
  - Asignar mesero al sentar
  - Gestionar waitlist (agregar, acomodar, quitar)
  - **NO** captura comandas (salvo permiso explícito)
  - **NO** cobra

- **Runner:**
  - Login con PIN
  - Ver cola de platillos listos en cocina
  - Marcar platillos como entregados al cliente

- **Cocinero y ayudantes:** ver definición en el `/core` §30.

---

## 15. Configuración inicial específica del vertical

### 15.1 Configuraciones que Full Service agrega al `/core` §28

Estas son configuraciones extra que un negocio Full Service necesita:

- **Modo de mapa de mesas:** visual (drag-and-drop) / lista numerada (sección §3)
- **Lista de mesas:** nombre, capacidad, sección, posición (modo visual)
- **Secciones del salón:** Salón, Terraza, Privado, Barra, otros (configurables)
- **Modo de asignación de mesero:** manual (default) / por sección / por turno equitativo (sección §6.1)
- **¿Mesero puede cobrar directamente?** Sí (default) / No, todo va al cajero
- **¿Mesero puede ver todas las mesas o solo las suyas?** Solo las suyas (default) / Todas
- **Política de estado SUCIA:** ¿al cobrar pasa a SUCIA o directo a LIBRE? Default: SUCIA
- **Alertas de tiempo en estado:**
  - Mesa ocupada >2h: notifica supervisor (default)
  - Mesa cuenta pedida >10min: notifica supervisor (default)
  - Mesa sucia >15min: notifica supervisor (default)
- **Sugerencia de propina:** porcentajes sugeridos (default: 10, 15, 20). Texto del mensaje
- **Pre-cuenta:** formato (incluir propinas sugeridas, no incluir, mostrar IVA desglosado, etc.)
- **Modos de servicio activos:** MESA siempre activo; resto según realidad del restaurante
- **Permitir captura desde tablets de mesero:** sí / no
- **Permitir captura desde estación central:** sí / no
- **Subtipos de personal activos:** mesero, hostess, runner, cocinero (default), más según necesidad
- **Cursos de cocina:** habilitar UX de retener ítems (default: sí)
- **Waitlist:** habilitar (default: sí)

### 15.2 Wizard de onboarding sugerido

Cuando el dueño crea un negocio Full Service, un wizard guía la configuración inicial:

```
Paso 1: Datos del negocio
Paso 2: Mesas — ¿cuántas tienes? ¿quieres mapa visual o lista?
Paso 3: Captura tus mesas (nombre, capacidad, sección)
Paso 4: Catálogo inicial (productos, modificadores)
Paso 5: Áreas de cocina (cocina caliente, fría, barra...)
Paso 6: Personal — meseros, hostess, cocineros
Paso 7: Configuración general (propinas, modos, política de pago)

Más detallado y largo que Foodtruck, pero asistido y por etapas
```

---

## 16. KPIs y reportes específicos

### 16.1 KPIs únicos del vertical

Más allá de los reportes base del `/core` §29, Full Service necesita:

- **Rotación por mesa:** cuántas veces se ocupó cada mesa hoy/semana
- **Tiempo promedio por mesa:** desde sentar hasta liberar
- **Ticket promedio por mesa**
- **Ventas por mesero** (mesero como vendedor)
- **Propinas por mesero** (sección §11.6)
- **Tiempo en cada estado de la mesa:** identificar cuellos (¿se tarda demasiado en limpiar? ¿en cobrar?)
- **% de mesas que dividen cuenta** y cómo dividen
- **Clientes en waitlist por hora** (presión de demanda)
- **% de clientes que abandonan waitlist** (clientes perdidos)
- **Cursos enviados por turno** (uso real del feature)

### 16.2 Reportes específicos

- **Reporte de turno por mesero:** ventas, mesas atendidas, propinas, ticket promedio, observaciones
- **Reporte de salón:** mapa de mesas con estadística por mesa (rotación, ventas, tiempo promedio)
- **Reporte de waitlist:** clientes atendidos, abandonados, tiempo promedio de espera
- **Reporte de horas pico:** demanda por hora del día, día de la semana
- **Reporte de propinas:** desglose por mesero, por método, comparativo histórico
- **Reporte de divisiones de cuenta:** % por modalidad, identifica patrones

### 16.3 Dashboard del supervisor en tiempo real

Durante el turno, el supervisor ve en su pantalla:

```
┌─────────────────────────────────────────┐
│   PISO — TIEMPO REAL                    │
├─────────────────────────────────────────┤
│   Mesas activas: 12 / 18                │
│   Ventas del turno: $34,580             │
│   Tickets cerrados: 28                  │
│   Tickets abiertos: 12 ($8,920)         │
│                                         │
│   Mesas con alerta:                     │
│   🔴 M03 — cuenta pedida hace 14 min    │
│   🟡 M12 — sucia hace 18 min            │
│                                         │
│   Meseros activos:                      │
│   Carlos R.: 4 mesas, $5,420            │
│   Diana M.: 3 mesas, $3,180             │
│   Luis P.: 5 mesas, $7,890              │
│                                         │
│   Waitlist: 2 personas (espera 25 min)  │
└─────────────────────────────────────────┘
```

---

## 17. Reglas duras específicas del vertical

Adicionales a las reglas duras del `/core`:

1. **El cobro es al final del consumo por default.** La cocina prepara y sirve antes de cobrar. Si un negocio quiere "cobrar al pedir", probablemente debería ser QS.

2. **Una mesa tiene un solo mesero responsable a la vez.** El histórico de meseros queda registrado.

3. **División de cuenta solo antes de cobrar.** Después no se puede deshacer.

4. **El total de sub-cuentas = total del ticket original.** Validación dura.

5. **Las propinas se REGISTRAN, no se reparten automáticamente.** El reparto es política externa del restaurante.

6. **Operaciones de mesa quedan en bitácora con motivo.** No hay operaciones invisibles.

7. **El sistema no fuerza estructura de cursos.** Es opt-in del mesero, ítem por ítem.

8. **Cursos: cada envío a cocina es una comanda independiente** etiquetada con el número de curso.

9. **El mapa de mesas siempre está actualizado en tiempo real.** Si el supervisor desde su tablet ve M05 ocupada, es porque está ocupada en este momento.

10. **Mesas en estado SUCIA no pueden recibir clientes nuevos.** Forzado por el sistema.

11. **Waitlist vive solo durante el día.** Al cierre se archiva.

12. **El mesero ve solo sus mesas asignadas por default.** Cambiar requiere permiso del admin.

13. **Si un mesero pasa una mesa a otro, la propina futura se asigna al nuevo.** El histórico queda registrado.

---

## 📌 Decisiones cerradas del vertical

Decisiones tomadas específicamente para Full Service:

1. ✅ **Sistema escalable: sirve desde 8 hasta 60+ mesas.** No nos casamos con un perfil específico.

2. ✅ **Mapa de mesas configurable: visual (drag-and-drop) o lista.** El restaurante elige según su tamaño y necesidad.

3. ✅ **División de cuenta estándar:** partes iguales, por ítem, por persona con monto manual. No incluimos drag-and-drop avanzado de ítems entre cuentas (Toast-level) en MVP.

4. ✅ **Solo waitlist en MVP. Reservaciones futuras son add-on "Reservaciones Pro"** ($249/mes según plan maestro).

5. ✅ **Cobro al final del consumo como política default y universal.** Otros modelos son excepciones configurables.

6. ✅ **Captura de comanda soporta ambos modelos:** tablet por mesero Y estación central. El restaurante usa lo que tenga.

7. ✅ **Cursos de cocina como opt-in del mesero.** Botón explícito de "Enviar a cocina" con opción de retener ítems específicos. Sin estructura formal de cursos (entrada/principal/postre forzada).

8. ✅ **Propinas: registro asignado a meseros, sin reparto automático.** El sistema registra quién recibió cuánto. El reparto operativo (tronco, % por horas, etc.) es política externa del restaurante.

9. ✅ **Operaciones de mesa completas desde MVP:** transferir mesa, unir mesas, separar cuenta a otra mesa, reasignar mesero (individual y masivo).

10. ✅ **Estado SUCIA explícito** entre OCUPADA y LIBRE. Configurable: si el restaurante quiere saltarlo, lo desactiva.

11. ✅ **El mesero puede cobrar directamente o pasar al cajero.** Configurable por restaurante.

12. ✅ **Subtipos de Personal específicos:** mesero, hostess, runner, cocinero, ayudante, barista, personal general.

---

## 📌 Pendientes específicos de Full Service

Cosas a definir antes o durante el desarrollo:

1. **Diseño detallado del editor visual de salón:** controles de drag-and-drop, escalado, secciones, formas de mesa (redonda, rectangular). Trabajo de UX importante para Fase de desarrollo.

2. **Política de "split bill" cuando algunas sub-cuentas ya se cobraron pero otras no:** ¿cómo se gestiona el estado intermedio? ¿la mesa sigue OCUPADA hasta que todas cobren? Probable: sí.

3. **Manejo de pre-autorización con tarjeta** (en restaurantes que quieren "preautorizar" la tarjeta del cliente al sentarse): no en MVP. Para Fase 2 con integración bancaria.

4. **Política de cancelación de waitlist al cierre del día:** ¿qué pasa con los clientes que están esperando cuando se hace cierre Z? Probable: alerta al supervisor antes de cierre.

5. **Integración con módulo "Reservaciones Pro" (add-on):** cómo se conecta la waitlist actual con el futuro sistema de reservaciones calendarizadas. Diseño de transición.

6. **¿El estado RESERVADA tiene sentido sin reservaciones futuras?** Probable: sí, como "mesa apartada para alguien que llamó hace 5 min y dijo 'voy en camino'". Confirmar.

7. **Política de propina cuando el cliente paga con tarjeta:** ¿la propina se incluye en el cargo a la tarjeta y luego se le da al mesero, o se separa? Decisión operativa del restaurante, configurable.

8. **Soporte de múltiples salones físicos** (algunos restaurantes tienen Salón Principal + Salón Eventos + Terraza con identidad propia): cubierto con secciones, pero validar.

9. **Comanda compartida en cocina:** cuando una mesa con cursos manda varias comandas, cómo se identifica visualmente en cocina (etiqueta "CURSO 2 — Mesa 5"). Confirmar formato de impresión.

10. **Cancelación parcial de mesa:** un comensal se va y deja la mitad del consumo sin pagar. ¿Cómo se gestiona? Probable: cancelación parcial de ítems específicos + cobro del resto.

11. **Integración con módulo de Inventario:** las recetas de Full Service tienden a ser más complejas que QS. ¿Hay UX especial para capturar recetas largas? Probable: igual al `/core` Parte IX, validar al usar.

12. **Reportes históricos de mesero:** ¿cuánto tiempo se guarda el detalle de propinas por mesero? Compromiso entre auditoría laboral y almacenamiento. Probable: vida del empleado en el sistema.

---

*Documento de flujos del módulo Full Service — VIM POS v1. Plan Maestro — Fermín, VIM Marketing.*

*Para flujos comunes a todos los verticales, consulta `01-FLUJOS-COMUNES-CORE.md` v3.*
