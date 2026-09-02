# 🍔 FLUJOS DEL MÓDULO QUICK SERVICE

## Manual operativo del vertical Quick Service de VIM POS

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v3.2 — pre-desarrollo (decisiones de Knock-Out integradas)
> Última actualización: Mayo 2026
>
> **Prerrequisito de lectura:** este documento asume que ya leíste `01-FLUJOS-COMUNES-CORE.md` v3.3. Aquí solo se describe lo que es **específico de Quick Service**.

---

## Propósito de este documento

Este documento describe **solo lo que el vertical Quick Service agrega encima del `/core`**. Todo lo común (roles, caja, ticket, cobro, facturación, comanda, delivery, apps externas, reportes, configuración) vive en el `/core` y no se repite aquí.

> **Regla:** si buscas algo y no está en este documento, está en el `/core`. Este manual asume conocimiento previo del documento `01-FLUJOS-COMUNES-CORE.md`.

---

## Tabla de contenidos

1. [Perfil operativo del vertical](#1-perfil-operativo-del-vertical)
2. [Hereda del /core y agrega](#2-hereda-del-core-y-agrega)
3. [Pantalla principal de venta — UX característica de QS](#3-pantalla-principal-de-venta--ux-característica-de-qs)
4. [Flujo de toma de pedido en mostrador](#4-flujo-de-toma-de-pedido-en-mostrador)
5. [Política de cobro recomendada para QS](#5-política-de-cobro-recomendada-para-qs)
6. [Modos de servicio aplicables a QS](#6-modos-de-servicio-aplicables-a-qs)
7. [Drive-thru: variante específica del flujo](#7-drive-thru-variante-específica-del-flujo)
8. [KPIs y reportes específicos de QS](#8-kpis-y-reportes-específicos-de-qs)
9. [Subtipos de Personal sugeridos para QS](#9-subtipos-de-personal-sugeridos-para-qs)
10. [Reglas duras específicas de QS](#10-reglas-duras-específicas-de-qs)
11. [Decisiones cerradas del vertical](#-decisiones-cerradas-del-vertical)
12. [Pendientes específicos de QS](#-pendientes-específicos-de-qs)
13. [Pendientes específicos de Knock-Out (piloto)](#-pendientes-específicos-de-knock-out-piloto)

---

## 1. Perfil operativo del vertical

### 1.1 ¿Qué es un Quick Service?

Restaurante de comida rápida con mostrador. El cliente:

1. Llega al mostrador
2. Pide su comida directamente al cajero
3. Paga inmediatamente
4. Espera (5-15 minutos)
5. Recibe su pedido en mostrador o lo entregan a su mesa

Ejemplos: hamburgueserías, pizzerías de mostrador, taquerías, lugares de pollo frito, casual asiático. **Knock-Out Burger es QS.**

### 1.2 Características operativas distintivas

| Característica | Valor típico en QS |
|---|---|
| Volumen | 50-300 tickets/día por sucursal |
| Ticket promedio | $100-$350 MXN |
| Tiempo cliente-en-mostrador | 30-90 segundos |
| Tiempo de preparación | 5-15 minutos |
| Modos de servicio típicos | Comer aquí, para llevar, drive-thru, delivery |
| Cobro | Antes del servicio (universal en QS) |
| Personal en caja | 1-2 cajeros simultáneos |

### 1.3 Lo que QS prioriza

1. **Velocidad de captura** — el cajero debe poder armar un pedido típico (2-4 productos) en menos de 30 segundos
2. **Pocos toques** — productos frecuentes a un toque, modificadores comunes preconfigurados
3. **Resistencia a interrupciones** — el cajero atiende a un cliente, llega otro, suena el teléfono; el sistema debe manejar interrupciones (pedidos en espera, ver `/core` sección 12)
4. **Operación con ruido y prisa** — UI grande, contraste alto, feedback claro

---

## 2. Hereda del `/core` y agrega

### 2.1 Lo que QS hereda tal cual del `/core`

Todo esto se usa sin modificación. Consulta el `/core` para detalles:

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
| **Ticket no fiscal del MVP** (facturación CFDI es fase final, módulo opcional) | 18 |
| Comanda y áreas de cocina | 19 |
| Estado de cocina del ticket | 20 |
| Entrega al cliente | 21 |
| Delivery propio completo (módulo opcional) | 22 |
| Apps externas (captura manual) | 23 |
| Cierre de turno con validación admin | 24 |
| Cierre de día Z | 25 |
| Contingencias | 26 |
| Auditoría | 27 |
| Configuración del negocio (incluye módulos opcionales) | 28 |
| Reportes base | 29 |
| Subtipos de Personal | 30 |
| **Inventario y recetas** (módulo opcional, Parte IX) | 31-37 |

### 2.2 Lo que QS agrega específicamente

Solo cuatro cosas:

1. **Pantalla principal de venta característica:** grid de productos optimizado para captura rápida en mostrador (sección 3 de este documento)
2. **Flujo de toma de pedido en mostrador:** con el cliente parado al frente, secuencia específica (sección 4)
3. **Drive-thru como variante:** UX diferente cuando hay ventanilla (sección 7)
4. **KPIs y reportes específicos:** velocidad de captura, tiempo de preparación, mix por modo (sección 8)

Y dos decisiones cerradas de QS (sección "Decisiones cerradas del vertical"):
- **Sin combos al MVP** (arquitectura preparada para agregarlos después)
- **KDS en Fase 2** (MVP usa ticket impreso a cocina)

Todo lo demás es `/core`.

### 2.3 Sobre el módulo de Inventario en QS

El módulo de Inventario y Recetas (Parte IX del `/core`) es **especialmente útil en QS** porque:

- El menú es relativamente estable (mismas hamburguesas/tacos/pizzas todos los días)
- Las recetas son fáciles de capturar (pocos insumos por producto, cantidades estandarizadas)
- El volumen de tickets es alto, así que pequeñas mermas se acumulan rápido
- El control de costo por producto es crítico para fijar precios competitivos

**Recomendación para Knock-Out:** activar el módulo desde el día 1 y capturar recetas para todos los productos. La inversión inicial de captura paga rápidamente con datos de margen real.

---

## 3. Pantalla principal de venta — UX característica de QS

> Esta es la pantalla más usada de la aplicación en QS. Tiene que ser perfecta.

### 3.1 Layout general

```
┌────────────────────────────────────────────────────────────────────────────┐
│ KNOCK-OUT Burger — León Centro — Caja 01     Cajero: María G.    🌐 ⚙  │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────┐  ┌──────────────────────────────────────┐│
│ │ CATEGORÍAS                    │  │ TICKET #1043                         ││
│ │                               │  │ Modo: [ Para llevar ▼ ]              ││
│ │ [Populares]    [Hamburguesas] │  │ Cliente: [ Sin cliente ]   [Buscar 🔍│ │
│ │ [Acompañam.]   [Bebidas]      │  │                                      ││
│ │ [Postres]      [Combos]       │  │ ─────────────────────────────────── ││
│ │ [Promos]       [Otros]        │  │ 2x Hamb. Clásica          $260.00   ││
│ │                               │  │    - Término: tres cuartos          ││
│ │ ─────────────────────────────│  │    - Sin cebolla                     ││
│ │ PRODUCTOS                     │  │    [Editar]  [Quitar]                ││
│ │                               │  │                                      ││
│ │ ┌──────┐ ┌──────┐ ┌──────┐    │  │ 1x Papas medianas         $45.00    ││
│ │ │HAMB. │ │HAMB. │ │HAMB. │    │  │                                      ││
│ │ │CLÁS. │ │BBQ   │ │QUESO │    │  │ 1x Refresco grande        $35.00    ││
│ │ │$130  │ │$155  │ │$145  │    │  │                                      ││
│ │ └──────┘ └──────┘ └──────┘    │  │ ─────────────────────────────────── ││
│ │                               │  │ Subtotal:               $340.00     ││
│ │ ┌──────┐ ┌──────┐ ┌──────┐    │  │ IVA (16%):               $54.40     ││
│ │ │HAMB. │ │HAMB. │ │HAMB. │    │  │ TOTAL:                  $394.40     ││
│ │ │TOC.  │ │DOBLE │ │KIDS  │    │  │                                      ││
│ │ │$165  │ │$190  │ │ $95  │    │  │ [ + Nota ]  [ Descuento ]            ││
│ │ └──────┘ └──────┘ └──────┘    │  │                                      ││
│ │                               │  │ [   COBRAR   ]                       ││
│ │ ┌──────┐                      │  │ [ Mantener pedido en espera ]        ││
│ │ │AGOT. │                      │  │ [ Cancelar ticket ]                  ││
│ │ │BIG K │                      │  │                                      ││
│ │ │ ⚠️    │                      │  │                                      ││
│ │ └──────┘                      │  │                                      ││
│ └───────────────────────────────┘  └──────────────────────────────────────┘│
│ [Pedidos en curso 🔔 3]  [Modificadores]  [Funciones]                     │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Reglas de diseño de la pantalla principal

- **Grid de productos visible siempre** — el cajero no debe abrir menús para llegar a productos frecuentes
- **Categorías como tabs** en la parte superior — pestaña activa con highlight
- **"Populares" como categoría virtual** generada automáticamente con los más vendidos (configurable umbral)
- **Productos con foto cuando disponible** + nombre + precio en grande
- **Productos agotados en gris** con icono ⚠️ y no tocables (`/core` sección 4.6)
- **Ticket siempre visible a la derecha**, no en panel oculto — el cliente puede ver lo que se va capturando si la pantalla está orientada o reflejada
- **Botón COBRAR prominente** abajo del ticket, color contrastante
- **Modo de servicio en cabecera del ticket**, no escondido — siempre visible para evitar errores
- **Tap en producto = agregar al ticket inmediatamente**; si tiene modificadores obligatorios, se abre modal del modificador automáticamente

### 3.3 Comportamiento de modificadores en QS

Cuando el cajero toca un producto con modificadores obligatorios (ej. término de cocción), aparece un modal:

```
┌─────────────────────────────────────────┐
│   HAMBURGUESA CLÁSICA — $130.00         │
├─────────────────────────────────────────┤
│   Término de cocción: (obligatorio)     │
│   ( ) Rojo                              │
│   ( ) Medio                             │
│   (•) Tres cuartos                      │
│   ( ) Bien cocido                       │
│                                         │
│   Sin ingredientes: (opcional)          │
│   [ ] Sin cebolla                       │
│   [ ] Sin pepinillos                    │
│   [ ] Sin lechuga                       │
│   [ ] Sin tomate                        │
│                                         │
│   Extras: (con costo)                   │
│   [ ] Extra queso amarillo (+$15)       │
│   [ ] Extra tocino (+$20)               │
│   [ ] Extra carne (+$45)                │
│                                         │
│   Nota al producto (opcional):          │
│   [_________________________________]   │
│                                         │
│   Cantidad: [ – ]  [ 1 ]  [ + ]         │
│                                         │
│   Total: $130.00                        │
│                                         │
│         [ Cancelar ]   [ Agregar ]      │
└─────────────────────────────────────────┘
```

Si el producto no tiene modificadores obligatorios, el tap lo agrega directo al ticket. La cantidad se incrementa tocando el mismo producto otra vez.

### 3.4 Categoría "Populares"

Categoría virtual generada por el sistema con los **10 productos más vendidos** de los últimos 7 días en esta sucursal. Aparece como primera pestaña. El admin puede:

- Desactivar la categoría virtual
- Fijar productos específicos (siempre visibles aquí independiente de las ventas)
- Cambiar la ventana de tiempo (7/14/30 días)

Razón: el 80% de las ventas vienen del 20% del menú. Si el cajero llega a esos productos en un toque, gana segundos críticos.

---

## 4. Flujo de toma de pedido en mostrador

### 4.1 Contexto

El cliente está parado frente al cajero. La conversación es rápida y bidireccional. El cajero captura mientras escucha.

### 4.2 Secuencia típica

**Paso 1.** Cliente llega. Cajero saluda y pregunta si es para comer aquí o llevar.

**Paso 2.** Cajero define el modo en la cabecera del ticket (toca el selector "Modo: [..]" y elige). Esto puede tener un default configurable en sucursal (ver `/core` sección 28).

**Paso 3.** Cliente pide su primer ítem. Cajero toca el producto. Si tiene modificadores obligatorios, modal aparece y cajero confirma rápido (o lo deja en default si el cliente no especifica).

**Paso 4.** Cliente sigue pidiendo. Cajero sigue tocando productos. Cantidad se suma tocando el mismo producto.

**Paso 5.** Cliente termina ("eso es todo"). Cajero confirma verbalmente leyendo el ticket: "Entonces son 2 hamburguesas, 1 papa, 1 refresco — ¿correcto?"

**Paso 6.** Cliente confirma. Cajero toca COBRAR. Sigue flujo del `/core` sección 17.

**Paso 7.** Cajero entrega el ticket no fiscal impreso. Si el cliente solicita factura, en MVP se le informa que el módulo CFDI estará disponible próximamente y que conserve el folio interno (visible en el ticket) para facturar retroactivamente cuando se active. Ver `/core` sección 18.

**Paso 8.** Cajero entrega el ticket impreso al cliente. El sistema no comunica un tiempo estimado de preparación al cliente final (decisión cerrada del `/core` — ver sección 28.2).

**Paso 9.** Si el modo es para comer aquí, le da un número de mesa o le pide que espere a que lo llamen. Si es para llevar, queda esperando en el área designada.

### 4.3 Interrupciones típicas y cómo se manejan

| Interrupción | Acción |
|---|---|
| Cliente indeciso, "déjame pensarlo" | Cajero mantiene en espera (`/core` sección 12), atiende al siguiente |
| Cliente pregunta por un producto que no encuentra | Cajero busca con el buscador del catálogo, muestra el producto o explica que no existe/está agotado |
| Cliente pide algo "fuera del menú" | El cajero NO crea producto al vuelo; ofrece alternativas. (Si el negocio realmente lo permite, el admin agrega el producto y vuelve) |
| Producto se agotó durante el turno | Cajero (o cocina avisando) marca como agotado desde panel rápido; el producto pasa a gris en pantalla |
| Cliente pide cancelar después de cobrar | Sigue flujo de cancelación del `/core` sección 13.3 |
| Cliente pide cambiar de "llevar" a "aquí" | Cajero edita el modo; si la comanda ya se mandó, el sistema imprime aviso a cocina (`/core` sección 6.5) |

### 4.4 Velocidad esperada

Pedido típico de 2-4 productos sin modificadores complicados: **menos de 60 segundos** desde el saludo hasta el ticket impreso. Si el sistema tarda más, hay algo que arreglar (UX o configuración).

---

## 5. Política de cobro recomendada para QS

### 5.1 Recomendación universal para QS

**Cobrar antes de mandar a cocina.** Esta es la política recomendada para todos los negocios QS y la default sugerida al crear un negocio nuevo de este vertical.

Justificación:

- El cliente paga antes de irse del mostrador — sin riesgo de "se me olvidó pagar"
- Cocina solo recibe pedidos confirmados (no se desperdicia producto en pedidos cancelados)
- El cajero está libre para atender al siguiente cliente apenas cobra

### 5.2 Política alternativa permitida

El admin puede cambiar la política a "mandar a cocina al confirmar" (`/core` sección 19.4) si su modelo operativo lo justifica. Caso atípico en QS pero posible (ej. una hamburguesería con servicio a mesa que cobra al final del consumo).

### 5.3 Implicación: edición post-cobro

Como QS cobra antes, la edición post-cobro (`/core` sección 16) es relativamente frecuente. El flujo está diseñado para esto: agregar productos genera ticket adicional vinculado, quitar productos pasa por devolución.

---

## 6. Modos de servicio aplicables a QS

### 6.1 Modos activables en QS

Del catálogo del `/core` sección 6.1, QS típicamente activa:

| Modo | Cuándo |
|---|---|
| `COMER_AQUI` | Default en QS con área de comedor |
| `PARA_LLEVAR` | Universal en QS |
| `DRIVE_THRU` | Solo sucursales con ventanilla |
| `DELIVERY_PROPIO` | Opcional si el negocio tiene flotilla propia |
| `APP_RAPPI` / `APP_UBEREATS` / `APP_DIDI` | Opcional si el negocio está dado de alta en plataformas |

### 6.2 Modos que QS NO usa

`MESA`, `BARRA`, `EVENTO_PRIVADO` no aplican a QS. Si un negocio QS los activa, probablemente está mal categorizado y debería ser Café & Bar (para BARRA y EVENTO_PRIVADO), Full Service (para MESA) o Foodtruck (para EVENTO_PRIVADO).

### 6.3 Configuración por sucursal

Una misma marca puede tener sucursales con configuración diferente:

- Sucursal León Centro: comer aquí, para llevar, delivery propio
- Sucursal León Plaza Mayor: solo para llevar, delivery propio (sin comedor)
- Sucursal León Express: drive-thru, para llevar (ventanilla únicamente)

Cada sucursal hereda config del negocio y puede sobrescribir (`/core` sección 28.8).

### 6.4 Default del modo de servicio al iniciar ticket

> **Decisión cerrada (basada en mix observado de Knock-Out):** **default `PARA_LLEVAR`** para negocios QS donde el mix de pedidos para llevar supera el 40%.

**Datos del observado en Knock-Out (1 turno tranquilo):**

| Modo | Cantidad | % |
|---|---|---|
| Para llevar | 15 | 50% |
| Comer aquí | 8 | 27% |
| A domicilio | 7 | 23% |

**Implicación:** al iniciar un nuevo ticket, el sistema arranca con modo `PARA_LLEVAR` pre-seleccionado. El cajero solo cambia si el cliente especifica otra cosa. Esto ahorra clicks en el 50% de las ventas.

**Configurabilidad:** el default es configurable por sucursal (`/core` §28.8). Una sucursal con 80% comer aquí podría tener `COMER_AQUI` como default. Knock-Out actual = `PARA_LLEVAR`.

**Validación pendiente:** confirmar el patrón con observación de 1 día pico (sábado/viernes nocturno) antes de fijar como default permanente. Por ahora, decisión basada en el dato disponible.

---

## 7. Drive-thru: variante específica del flujo

### 7.1 Diferencias con mostrador

En drive-thru:

- El cliente está en su coche, separado físicamente del cajero (por intercom)
- La captura del pedido sucede ANTES del cobro (intercom → captura)
- El cobro pasa cuando el coche llega a la ventanilla
- La entrega es por la misma ventanilla, segundos después del cobro

### 7.2 Adaptaciones de UX

- El cajero captura el pedido mientras habla por intercom — sin cliente al frente
- El modo del ticket se fija automáticamente como `DRIVE_THRU` al iniciar
- El ticket queda en "espera" hasta que el coche llega a la ventanilla (`/core` sección 12)
- En la ventanilla: cajero confirma verbal, cobra y entrega
- **Empaque siempre cerrado y bebidas tapadas** (regla operativa, comanda con etiqueta especial "DRIVE-THRU")

### 7.3 Doble ventanilla (opcional)

Algunos QS grandes tienen dos ventanillas: la primera cobra, la segunda entrega. Si el negocio activa esta configuración, el sistema permite:

- Cobrar en ventanilla 1 → el ticket pasa a `PAGADO` + `EN_COCINA`
- Cliente avanza a ventanilla 2 → ahí ven el ticket en "Listos para entregar"
- Ventanilla 2 entrega y marca como `ENTREGADO`

### 7.4 Tiempo objetivo

Drive-thru exitoso: desde intercom hasta entrega = menos de 3 minutos. Si lleva más, se atasca la fila. Los KPIs específicos de drive-thru se reportan en sección 8.

---

## 8. KPIs y reportes específicos de QS

### 8.1 KPIs únicos del vertical

Más allá de los reportes base del `/core` sección 29, QS necesita medir:

- **Tiempo promedio de captura del pedido** (desde inicio del ticket hasta tocar COBRAR)
- **Tiempo promedio de preparación** (desde envío a cocina hasta marca de listo)
- **Tiempo promedio total** (desde inicio del ticket hasta entrega)
- **Tickets por hora por cajero** (medida de productividad)
- **Tickets por hora por sucursal** (medida de capacidad)
- **Tiempo en drive-thru** (intercom → entrega, si aplica)
- **% de pedidos con modificadores** (señal de complejidad del menú)
- **% de productos agotados durante el día** (señal de planeación de inventario)

### 8.2 Reporte específico: "Horas pico"

Análisis de tickets por hora del día y día de semana. Identifica:

- Cuándo entran más ventas → cuándo poner más personal
- Cuándo entra menos → cuándo cerrar antes o hacer mantenimiento
- Día con peor rendimiento (¿lunes? ¿martes?) → oportunidad de promo automática

### 8.3 Reporte específico: "Velocidad por cajero"

Por cada cajero del turno: tickets, ticket promedio, tiempo promedio de captura, cancelaciones, descuentos manuales solicitados. Útil para:

- Identificar quién es rápido y quién necesita capacitación
- Detectar patrones sospechosos (muchas cancelaciones, muchos descuentos solicitados)

### 8.4 Reporte específico: "Tiempos de cocina"

Tiempos de preparación promedio por producto:

- ¿Las hamburguesas BBQ tardan más que las clásicas?
- ¿Hay un producto que constantemente excede su tiempo estimado?
- ¿Hay productos que se pueden pre-preparar?

---

## 9. Subtipos de Personal sugeridos para QS

Del catálogo del `/core` sección 30.2, en QS típicamente se activan:

| Subtipo | Función en QS |
|---|---|
| **Cocinero** | Marca pedidos como listos desde la pantalla de cola de cocina del rol Personal |
| **Ayudante de cocina** | Prepara pero no marca como listo (debe pedir al cocinero principal) |
| **Runner / entrega en mostrador** | Lleva los pedidos listos al cliente o a la mesa que el cliente eligió |
| **Repartidor** | Para QS con delivery propio activado |
| **Personal general** | Limpieza, atención al cliente sin función operativa específica |

No aplican en QS: Mesero, Barista, Host (esos son de Full Service / Café & Bar / Dark Kitchen).

---

## 10. Reglas duras específicas de QS

Adicionales a las reglas duras del `/core`:

1. **Modo de servicio obligatorio antes de cobrar** — heredado del `/core` sección 17.4, pero especialmente crítico en QS porque la decisión "aquí o llevar" cambia el empaque.

2. **Producto agotado bloquea agregar al ticket** — heredado del `/core` sección 4.6. El sistema no permite "agregar de todas formas".

3. **Cobro antes de cocina por default** — política recomendada universal en QS. Se puede cambiar por sucursal pero requiere decisión consciente del admin.

4. **Pedidos en espera más de 30 min generan alerta** — heredado del `/core` sección 12.3. En QS este timeout es crítico por la rotación rápida.

5. **Sin combos al MVP** — los combos en QS son frecuentes en la industria, pero hasta tener datos de Knock-Out operando, no se desarrollarán. La arquitectura del catálogo (`/core` sección 4.7) está preparada para agregarlos sin refactor.

6. **KDS (Kitchen Display System) en Fase 2** — el MVP usa comanda impresa a cocina. KDS interactivo (pantalla touch en cocina que marca listos) llega después con datos reales de operación.

---

## 📌 Decisiones cerradas del vertical

Decisiones tomadas específicamente para Quick Service:

1. ✅ **Cuatro modos básicos soportados:** comer aquí, para llevar, drive-thru (sucursales con ventanilla), delivery propio. Más apps externas (Rappi/Uber/Didi/iFood) activables opcionalmente por el negocio.

2. ✅ **Cobro antes de cocina como política recomendada universal.** Configurable por sucursal pero default sugerido al onboarding.

3. ✅ **Sin combos al MVP.** Arquitectura preparada para agregarlos cuando haya datos de Knock-Out operando.

4. ✅ **KDS en Fase 2.** MVP usa comanda impresa a cocina con áreas configurables (`/core` sección 19).

5. ✅ **Categoría "Populares" generada automáticamente** con top 10 de últimos 7 días, fija-pinneable por admin.

6. ✅ **Pantalla principal con grid de productos siempre visible** (no menús anidados profundos). Captura óptima en ≤60 segundos para pedido típico de 2-4 productos.

---

## 📌 Pendientes específicos de QS

Decisiones de QS aún por definir:

1. **Configuración default del modo de servicio:** ¿el sistema sugiere un modo por sucursal? Probable que sí (ej. una sucursal de drive-thru express puro arranque siempre en modo "drive-thru"). Confirmar al onboarding de Knock-Out con datos reales.

2. **Cuándo activar combos (post-MVP):** después de cuántas semanas de operación de Knock-Out arrancamos el módulo de combos. Probable: 4-6 semanas.

3. **Métricas del KDS (Fase 2):** qué medirá específicamente el KDS interactivo (tiempos por estación, productos por estación, errores).

4. **Política de límite de modificadores por producto:** ¿hay un máximo razonable de modificadores que un cajero puede aplicar en un solo producto? (Performance + UX). Probable: no, dejarlo libre.

5. **Display al cliente:** mencionado en `/core` sección 28 como Fase 2 general. En QS es especialmente útil — el cliente ve lo que se captura y reduce errores. Decidir cuándo se materializa.

6. **Notificación al cliente cuando esté listo:** SMS/WhatsApp o display físico de números. Decisión a tomar con cada cliente piloto.

---

## 📌 Pendientes específicos de Knock-Out (piloto)

Estado consolidado tras decisiones tomadas en sesión:

1. **Menú completo de Knock-Out** ⏳ EN PROCESO — Fermín enviará foto del menú actual, Claude transcribe a tabla estructurada.

2. **Modelo de impresora térmica** ✅ RESUELTO PARCIAL — Knock-Out usa **impresora Ethernet/WiFi existente** (no Bluetooth). Pendiente confirmar modelo exacto. La impresora se accede vía HTTP/TCP a IP local con protocolo ESC/POS.

3. **% real de pedidos por modo de servicio** ✅ RESUELTO PARCIAL — Mix observado (1 turno tranquilo): 50% para llevar / 27% comer aquí / 23% domicilio. Default sugerido: `PARA_LLEVAR` (ver §6.4). Pendiente validar con día pico.

4. **Áreas de cocina en Knock-Out** ✅ RESUELTO — **Una sola estación de cocina**. No requiere configurar áreas separadas en `/core` §19.3. Simplifica setup: una impresora, una comanda.

5. **Política de descuentos manuales** ✅ RESUELTO — **Dueño + Supervisor de turno** con PIN propio. Configuración: 1 supervisor por turno (cocinero senior / cajero antiguo / gerente), cada uno con PIN. Detalle en `/core` §14.1.

6. **Delivery propio** ✅ RESUELTO — **SÍ se activa delivery propio desde MVP, en versión simplificada**:
   - Captura de dirección + asignación de repartidor
   - Timestamps de salida y regreso del repartidor
   - Liquidación bloqueante al regreso (diferencia bloquea hasta autorización admin)
   - **SIN** estados intermedios (EN_RUTA, ENTREGADO_DOMICILIO) — vienen en Fase 2
   - **SIN** reportes de tiempos promedio — datos guardados, cálculos en Fase 2
   - Detalle en `/core` §22 (nota MVP simplificado)

7. **Observación etnográfica** ⏳ EN PROCESO — Trabajo combinado:
   - **Claude:** documento `INVESTIGACION-PAIN-POINTS-QSR.md` ya entregado (24 pain points de mercado)
   - **Fermín:** 1-2 turnos completos en Knock-Out con libreta física (próximas 1-2 semanas)
   - Integración final cuando ambos estén completos

---

*Documento de flujos del módulo Quick Service — VIM POS v3.2. Plan Maestro — Fermín, VIM Marketing.*

*Para flujos comunes a todos los verticales, consulta `01-FLUJOS-COMUNES-CORE.md` v3.3.*
*Para mapa de pain points → soluciones, consulta `MAPA-SOLUCIONES-VIM-POS.md`.*
