# 🚚 FLUJOS DEL MÓDULO FOODTRUCK

## Manual operativo del vertical Foodtruck de VIM POS

> **Documento de diseño operativo**
> Parte de: Plan Maestro VIM POS
> Estado: Diseño detallado v1.2 — pre-desarrollo (decisiones técnicas integradas)
> Última actualización: Mayo 2026
>
> **Prerrequisitos de lectura:**
> - `01-FLUJOS-COMUNES-CORE.md` v3 (obligatorio)
> - `02-FLUJOS-QUICK-SERVICE.md` v3 (recomendado — Foodtruck reutiliza mucha mecánica de QS)

---

## Propósito de este documento

Este documento describe **solo lo que el vertical Foodtruck agrega encima del `/core` y de Quick Service**. Foodtruck es operativamente muy parecido a QS, pero con tres diferencias estructurales que justifican su propio módulo:

1. **Modo offline robusto (72 horas).** Internet inestable es la realidad del foodtruck, no la excepción.
2. **Eventos como contexto del turno.** Un foodtruck reporta por ubicación/evento, no solo por día.
3. **Geolocalización opcional** para ubicaciones cambiantes.

Todo lo demás (catálogo, caja, ticket, cobro, comanda, etc.) viene del `/core` y, donde aplica, se reusa la UX de QS.

> **Regla:** si buscas algo y no está en este documento, está en QS o en el `/core`. Este manual asume conocimiento previo de ambos.

---

## Tabla de contenidos

1. [Perfil operativo del vertical](#1-perfil-operativo-del-vertical)
2. [Hereda del /core y de QS, agrega lo específico](#2-hereda-del-core-y-de-qs-agrega-lo-específico)
3. [Modo offline robusto de 72 horas](#3-modo-offline-robusto-de-72-horas)
4. [Eventos: turno con contexto de ubicación o festival](#4-eventos-turno-con-contexto-de-ubicación-o-festival)
5. [Geolocalización opcional](#5-geolocalización-opcional)
6. [Configuración default minimalista del foodtruck](#6-configuración-default-minimalista-del-foodtruck)
7. [UX adaptaciones para pantalla pequeña](#7-ux-adaptaciones-para-pantalla-pequeña)
8. [Modos de servicio aplicables a Foodtruck](#8-modos-de-servicio-aplicables-a-foodtruck)
9. [Cobro con tarjeta sin integración](#9-cobro-con-tarjeta-sin-integración)
10. [KPIs y reportes específicos de Foodtruck](#10-kpis-y-reportes-específicos-de-foodtruck)
11. [Subtipos de Personal sugeridos para Foodtruck](#11-subtipos-de-personal-sugeridos-para-foodtruck)
12. [Reglas duras específicas de Foodtruck](#12-reglas-duras-específicas-de-foodtruck)
13. [Decisiones cerradas del vertical](#-decisiones-cerradas-del-vertical)
14. [Pendientes específicos de Foodtruck](#-pendientes-específicos-de-foodtruck)

---

## 1. Perfil operativo del vertical

### 1.1 ¿Qué es un Foodtruck?

Negocio de comida móvil o semi-fijo, operado desde un vehículo o unidad de venta acotada. Categoría amplia que incluye:

- **Foodtrucks tradicionales:** camionetas adaptadas que se mueven
- **Food bikes:** triciclos / bicicletas con cocina
- **Puestos móviles:** carritos, mesas, tiangues
- **Foodtrucks semi-fijos:** establecidos en una ubicación recurrente (parque, plaza, esquina) pero potencialmente movibles
- **Operadores en ferias/eventos:** participantes regulares de festivales, conciertos, eventos privados

VIM POS sirve a **todos estos perfiles** porque comparten más de lo que diferencian: pocos ítems en menú, alta rotación, conexión inestable, espacios pequeños, operación con 1-3 personas máximo.

### 1.2 Características operativas distintivas

| Característica | Valor típico en Foodtruck |
|---|---|
| Volumen | 30-200 tickets/día por unidad |
| Ticket promedio | $80-$250 MXN |
| Tiempo cliente-en-mostrador | 30-90 segundos (como QS) |
| Tiempo de preparación | 3-10 minutos |
| Modos de servicio típicos | Comer aquí (parado o en banca), para llevar |
| Cobro | Antes del servicio (universal) |
| Personal | 1-3 personas máximo (operación compacta) |
| Hardware típico | **Lo que el cliente tenga** — desde teléfono Android barato hasta tablet con impresora |
| Conexión a internet | **Inestable como regla** — la 72h offline es necesidad, no lujo |
| Volatilidad de ubicación | Variable: fijos, semi-fijos, itinerantes |

### 1.3 Lo que Foodtruck prioriza

1. **Funcionar sin internet por días enteros.** Una feria en Sayulita puede tener cero señal — el sistema debe operar 72h sin perder un dato.
2. **Bajo consumo de batería.** La tablet puede estar prendida 12h con un inversor del coche.
3. **UX para pantalla pequeña.** Muchos operan en teléfono o tablet de 8 pulgadas.
4. **Onboarding rápido.** El dueño es el operador. No hay tiempo para configurar 80 cosas. Default minimalista.
5. **Reporte por evento o ubicación.** Saber si la Feria de Aguascalientes valió la pena, no solo "ventas de mayo".

### 1.4 Lo que Foodtruck NO necesita en MVP

- KDS (Kitchen Display System) — el operador es el cocinero, no necesita pantalla intermedia
- Múltiples áreas de cocina — todo se prepara en el mismo lugar pequeño
- Layout de mesas — no hay mesas asignadas
- Reservaciones — no aplica
- Roles complejos — típicamente el dueño es admin + cajero + cocinero al mismo tiempo

---

## 2. Hereda del `/core` y de QS, agrega lo específico

### 2.1 Lo que Foodtruck hereda tal cual del `/core`

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
| Ticket no fiscal del MVP (CFDI fase final) | 18 |
| Comanda (a una sola impresora típicamente) | 19 |
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
| Inventario y recetas (módulo opcional, Parte IX) | 31-37 |

### 2.2 Lo que Foodtruck hereda de QS

Foodtruck es prácticamente "QS móvil con offline robusto". Hereda directamente de QS:

| Área de QS | Reúso en Foodtruck |
|---|---|
| Pantalla principal con grid de productos | ✅ Misma UX, adaptada a pantalla pequeña (ver §7) |
| Flujo de toma de pedido en mostrador | ✅ Idéntico (ver QS §4) |
| Comportamiento de modificadores | ✅ Idéntico |
| Política de cobro antes de cocina | ✅ Idéntico |
| Pedidos paralelos / "en espera" | ✅ Idéntico |
| Categoría "Populares" generada automáticamente | ✅ Idéntico |
| Reglas duras de QS | ✅ Idéntico (excepto drive-thru, que no aplica) |

### 2.3 Lo que Foodtruck agrega específicamente

Solo cuatro cosas exclusivas:

1. **Modo offline robusto 72h** (§3) — diferenciador comercial real
2. **Eventos como contexto del turno** (§4) — etiqueta + comisión opcional
3. **Geolocalización opcional** (§5) — para foodtrucks itinerantes
4. **Configuración default minimalista** (§6) — onboarding más rápido y limpio que QS

Y algunas adaptaciones de UX y reportes (§7, §10).

Todo lo demás es `/core` + QS.

---

## 3. Modo offline robusto de 72 horas

> Este es **el diferenciador comercial real del vertical Foodtruck**. Toast, Square, Loyverse y la mayoría de competidores colapsan o degradan severamente sin internet. VIM POS opera 72 horas sin perder operatividad ni datos.

### 3.1 Qué significa "offline 72h"

Durante hasta 72 horas sin conexión a internet, el sistema **mantiene operatividad completa de venta**:

| Operación | Funciona offline | Notas |
|---|---|---|
| Login de usuarios | ✅ | Credenciales cacheadas |
| Apertura y cierre de turno | ✅ | Con conteo de denominación, conteo físico, validación local |
| Catálogo de productos | ✅ | Cacheado al iniciar / cuando hubo conexión |
| Captura de tickets | ✅ | Con folio interno offline (ver §3.4) |
| Modificadores y notas | ✅ | Cacheados |
| Cobro de tickets (todos los métodos manuales) | ✅ | Efectivo, transferencia, vales, tarjeta-manual |
| Impresión de ticket | ✅ | Si la impresora está conectada por Bluetooth/USB local |
| Impresión de comanda | ✅ | Igual que ticket |
| Cancelación de ticket abierto | ✅ | Local |
| Devoluciones | ✅ | Local |
| Sangrías y depósitos | ✅ | Local con autorización por PIN |
| Descuentos manuales (con PIN local) | ✅ | El PIN del supervisor está cacheado |
| Promociones automáticas | ✅ | Si se configuraron antes |
| Inventario (módulo Parte IX) | ✅ | Descuento de insumos funciona local |
| Pedidos paralelos / espera | ✅ | Local |
| Cierre de turno con conteo y diferencia | ✅ | Validación admin con PIN local |
| Reportes del turno actual | ✅ | Generados localmente |
| Reportes históricos | ⚠️ Hasta donde haya cache | Reportes previos sí disponibles si estaban en cache |

| Operación | NO funciona offline | Comportamiento |
|---|---|---|
| Timbrado CFDI inmediato (cuando esté activo) | ❌ | Se encola para timbrar al recuperar conexión |
| Validación de RFC en padrón SAT | ❌ | Se guardan los datos y validan después |
| Sincronización al dashboard del dueño | ❌ | Se sincroniza al recuperar conexión |
| Apps externas (registro de folio Rappi/Uber) | ⚠️ Local sí, pero conciliación después | Captura manual sigue funcionando |
| Configuración nueva del negocio | ❌ | Cambios desde panel web se sincronizan al volver |

### 3.2 Cómo se materializa técnicamente

Sin entrar en código (eso es para después), la idea es:

- **Cache local persistente:** catálogo completo, usuarios, PINs, configuración, promociones, recetas (si inventario activo), clientes recientes, todo cargado al iniciar y refrescado cuando hay conexión.
- **Cola de eventos pendientes de sincronización:** todo lo que el cajero hace offline se guarda como evento en cola. Cuando vuelve la conexión, el sistema sube la cola en orden cronológico al servidor.
- **Folios offline únicos:** ver §3.4.
- **Validaciones diferidas:** lo que requiere validar contra servidor (RFC, padrón SAT, sincronización de stock entre múltiples cajas) queda marcado para validación posterior.
- **Indicador visible permanente** en pantalla cuando se está operando offline (ver §3.6).

> **Decisión técnica MVP:** la implementación del cache local usa **Dexie.js sobre IndexedDB** (capacidad ~50MB+ por defecto). La capa de almacenamiento está abstraída tras un repositorio (`repositories/`) para que, cuando se migre a Capacitor + SQLite nativo en Fase 3 comercial, el código de la app no requiera refactor mayor. Ver documento de arquitectura técnica para detalles.

### 3.3 Sincronización al recuperar conexión

Cuando vuelve internet:

1. **Sistema detecta conexión** y muestra notificación discreta: "Sincronizando..."
2. **Envía cola de eventos** en orden cronológico al servidor
3. **Procesa respuestas:**
   - Eventos aceptados → se marcan como sincronizados y se borran de cola local
   - Eventos con conflicto (raro: ej. mismo turno cerrado en dos lados) → escala al admin
4. **Recibe actualizaciones del servidor:** cambios de catálogo, nuevas promociones, etc.
5. **Indicador vuelve a "online"** cuando todo está sincronizado
6. **Reporte de sincronización** disponible en bitácora: cuántos eventos se subieron, cuáles fallaron

Si el cajero cierra la app a media sincronización, el proceso se reanuda al volver a abrirla.

### 3.4 Numeración de tickets en modo offline

**Problema:** si la caja A está offline y vende ticket #1043, y la caja B también está offline y vende ticket #1043, al sincronizar habría colisión.

**Solución:**

- Cada **caja** tiene un **prefijo único** dentro del negocio (asignado al registrar la caja)
- Formato del folio offline: `[código_sucursal]-[código_caja]-[año]-[consecutivo_local]`
- Ejemplo: `FT-C01-2026-001043` (Foodtruck, Caja 01, año 2026, ticket local #1043)
- Al sincronizar, el servidor preserva el folio (no se renumera)
- Esto es coherente con la numeración consecutiva eterna del `/core` (sección 1.3.bis), solo agrega el segmento de caja para evitar colisiones offline

### 3.5 Cierre de turno offline

Funciona local exactamente como online. Si hay diferencia, la caja queda bloqueada hasta validación admin con PIN. El admin puede validar con su PIN **cacheado localmente** sin necesidad de conexión. Cuando vuelve internet, el cierre completo se sincroniza al servidor con su decisión.

### 3.6 Indicador visual de estado de conexión

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🚚 TACOS DEL PRIMO — Feria Aguascalientes — Caja 01     María G.      🌐 ⚙│
│                                                          ↑                  │
│                                                       Estado:               │
│                                                                             │
│   🌐 Verde — Online, sincronizado                                          │
│   🟡 Amarillo — Online, sincronizando (cola pendiente)                     │
│   ⚫ Negro/gris — Offline, operando con cache local                         │
│   🔴 Rojo — Error: cache antiguo (>72h sin sincronizar)                     │
└────────────────────────────────────────────────────────────────────────────┘
```

Tap en el ícono muestra detalle:

```
┌─────────────────────────────────────────┐
│   ESTADO DE CONEXIÓN                    │
├─────────────────────────────────────────┤
│   ⚫ Offline                             │
│                                         │
│   Última sincronización:                │
│   hace 14 horas                         │
│                                         │
│   Operaciones pendientes:               │
│   • 47 tickets                          │
│   • 2 sangrías                          │
│   • 0 devoluciones                      │
│                                         │
│   Cache local:                          │
│   ✓ Catálogo (32 productos)             │
│   ✓ Usuarios (3)                        │
│   ✓ Recetas (32)                        │
│   ✓ Promociones activas (4)             │
│   ✓ Clientes recientes (218)            │
│                                         │
│   Sistema operando normalmente.         │
│   Se sincronizará al recuperar          │
│   conexión a internet.                  │
│                                         │
│         [ Reintentar conexión ]         │
└─────────────────────────────────────────┘
```

### 3.7 Alerta de "más de 72h offline"

Si pasan más de 72 horas sin sincronizar:

- Indicador cambia a rojo
- Sistema muestra advertencia al login: "Llevas más de 72h sin conexión a internet. El sistema sigue operando, pero algunos datos pueden estar desactualizados. Se recomienda buscar conexión cuanto antes."
- **El sistema NO se detiene.** Permite seguir vendiendo. Solo advierte.
- Cuando se sincronice, queda registro de cuánto tiempo operó offline para auditoría

### 3.8 Reglas

- El sistema **nunca pierde datos** offline. Si falla, se reintenta.
- El cajero **nunca debe verse bloqueado** por falta de internet. El offline es modo normal de operación.
- La sincronización es **transparente** — el cajero no hace nada manual.
- Funciones que dependen del servidor (CFDI, validación SAT, dashboard remoto) se posponen sin bloquear ventas.
- El periodo de 72h es **objetivo de diseño**. Técnicamente, el sistema puede aguantar más, pero a partir de 72h se recomienda enérgicamente sincronizar.

---

## 4. Eventos: turno con contexto de ubicación o festival

### 4.1 ¿Qué es un evento en el sistema?

Un **evento** es una etiqueta que se aplica al turno para identificar el contexto de operación. Ejemplos:

- "Feria de Aguascalientes 2026"
- "Festival Sayulita 2026"
- "Concierto Plaza Mayor — 14 mayo"
- "Boda López-Pérez (privado)"
- "Mérida Cervecera 2026"
- "Operación normal — Parque del Cardenal" (turnos sin evento específico)

Sirve para que los reportes muestren ventas no solo por día/semana, sino **por evento**. El dueño puede analizar si participar en cierto festival vale la pena o no.

### 4.2 Captura del evento al abrir turno

Al abrir un turno (extensión de la sección 7 del `/core`), el sistema pregunta:

```
┌─────────────────────────────────────────┐
│   APERTURA DE TURNO                     │
├─────────────────────────────────────────┤
│   Cajero: María G.                      │
│   Fecha: 17/05/2026 — 09:32             │
│                                         │
│   ▶ ¿Es un evento o ubicación especial? │
│                                         │
│   ( ) Operación normal                  │
│   (•) Sí, es un evento                  │
│                                         │
│   Nombre del evento:                    │
│   [ Feria Aguascalientes 2026      ]    │
│                                         │
│   ▶ Eventos recientes (sugerencias):    │
│   • Mérida Cervecera 2026               │
│   • Festival Sayulita 2026              │
│   • Concierto Plaza Mayor — 14 mayo     │
│                                         │
│   ¿El evento tiene comisión?            │
│   ( ) No                                │
│   (•) Sí, captura al cerrar turno       │
│                                         │
│   Notas del evento (opcional):          │
│   [_________________________________]   │
│                                         │
│         [ Continuar ]                   │
└─────────────────────────────────────────┘
```

### 4.3 Datos del evento

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre del evento | Texto libre | Sí (si activado) | "Feria Aguascalientes 2026" |
| Tipo | Catálogo: feria / festival / concierto / evento privado / corporativo / otro | No | Para clasificar reportes |
| ¿Tiene comisión? | Sí / No | Sí | Si sí, se capturará al cerrar |
| Comisión | Monto fijo / % de ventas | No (sí si "tiene comisión") | Captura al cerrar turno |
| Notas | Texto libre | No | Contacto del organizador, condiciones, observaciones |

### 4.4 Captura de comisión al cerrar turno

Si el turno tiene "tiene comisión = sí", al cerrar el turno (extensión de la sección 24 del `/core`) aparece un paso adicional **antes** del conteo físico:

```
┌─────────────────────────────────────────┐
│   COMISIÓN DEL EVENTO                   │
├─────────────────────────────────────────┤
│   Evento: Feria Aguascalientes 2026     │
│   Ventas del turno: $24,010.00          │
│                                         │
│   Tipo de comisión:                     │
│   (•) Porcentaje de ventas              │
│   ( ) Monto fijo                        │
│                                         │
│   Porcentaje: [ 15 ] %                  │
│   Comisión calculada: $3,601.50         │
│                                         │
│   Pago al organizador:                  │
│   ( ) Efectivo al cierre                │
│   ( ) Transferencia posterior           │
│   ( ) Ya descontado de ventas en sitio  │
│                                         │
│   Notas: [_____________________________]│
│                                         │
│         [ Saltar ]    [ Registrar ]     │
└─────────────────────────────────────────┘
```

Si la comisión se paga "en efectivo al cierre", el sistema genera un movimiento de sangría especial etiquetado como "Comisión evento" — esto descuenta del efectivo esperado y la diferencia se reporta correctamente.

### 4.5 Reportes por evento

El módulo Foodtruck agrega reportes específicos (ver §10):

- **Ventas por evento:** total bruto, total neto, comisión pagada, utilidad estimada
- **Comparativo de eventos:** "Feria Aguascalientes vs. Mérida Cervecera vs. operación normal"
- **Productos más vendidos por evento:** qué se vende mejor en festivales vs. ferias vs. parque
- **Días-evento más rentables:** ROI por día de cada evento

### 4.6 Reglas

- Cada turno tiene **un solo evento** asociado (o ninguno = operación normal)
- El nombre del evento es libre, pero el sistema **sugiere autocompletar** con eventos recientes (búsqueda en histórico)
- Los eventos NO son un catálogo formal en MVP — solo etiquetas con autocompletar. Si el negocio quiere convertir un evento recurrente en algo más estructurado, lo hará en una versión futura
- La comisión queda registrada en bitácora y aparece en reportes financieros como gasto del evento
- Si el cajero olvida marcar el evento, lo puede agregar después desde edición del turno (con autorización admin)

---

## 5. Geolocalización opcional

### 5.1 ¿Por qué opcional?

El plan maestro lista geolocalización como funcionalidad de Foodtruck. Pero la realidad es heterogénea:

- Un foodtruck **fijo en un parque** no necesita capturar GPS — siempre opera en la misma ubicación
- Un foodtruck **itinerante** que cambia 3 veces por semana sí necesita reportar dónde le va mejor
- Un operador en **ferias y eventos** ya tiene el dato del evento (§4); el GPS sería redundante

Por eso geolocalización es **opt-in** en la configuración del negocio.

### 5.2 Cuándo se activa y qué hace

El admin del negocio activa "Tracking de ubicación" en la configuración (sección 28 del `/core` extendida). Cuando está activo:

**Al abrir turno (después del paso de evento §4.2):**

```
┌─────────────────────────────────────────┐
│   UBICACIÓN DE OPERACIÓN                │
├─────────────────────────────────────────┤
│   Capturando ubicación GPS... 📍        │
│                                         │
│   Detectada: 21.8853, -102.2916         │
│   Aproximada: Aguascalientes, Centro    │
│                                         │
│   ¿Es correcta?                         │
│                                         │
│   Etiqueta de ubicación:                │
│   [ Centro histórico de Aguascalientes ]│
│                                         │
│   ▶ Ubicaciones recientes:              │
│   • Parque Cardenal — León              │
│   • Plaza Mayor — León                  │
│   • Centro Aguascalientes               │
│                                         │
│         [ Sin GPS ]    [ Continuar ]    │
└─────────────────────────────────────────┘
```

- Las coordenadas GPS se guardan junto con el turno
- La etiqueta de ubicación es texto libre (autocompletado con histórico)
- Si el GPS no está disponible (no hay permiso, no hay señal), se permite saltar con etiqueta manual

### 5.3 ¿Qué pasa si Ubicación + Evento están ambos activados?

Conviven sin conflicto:

- Evento: contexto de **por qué** se opera ahí ("Festival Sayulita 2026")
- Ubicación: dato GPS y etiqueta de **dónde** se opera ("Plaza principal Sayulita")

Ambos enriquecen los reportes.

### 5.4 Privacidad y permisos

- El sistema solo captura ubicación al **abrir el turno** y al **cerrarlo**. No hace tracking continuo del vehículo
- Si el dispositivo no otorga permiso de GPS, el sistema sigue funcionando sin capturar
- Los datos de ubicación quedan asociados al turno y son visibles solo al admin y dueño

### 5.5 Reportes con ubicación

Reportes adicionales cuando está activado:

- **Mapa de operaciones:** vista de mapa con pines de todas las ubicaciones donde se ha operado
- **Top ubicaciones por ventas**
- **Comparativo de ubicaciones:** ventas, ticket promedio, productos top por sitio
- **Sugerencia de ubicaciones:** "Has operado 12 veces aquí, ventas promedio: $X; vs. lugar Y, ventas: $Z" (informativo)

### 5.6 Reglas

- Geolocalización es **módulo opcional** activable por negocio
- Una vez activado, **no es obligatorio capturar** en cada turno (se puede saltar)
- Si está desactivado, el sistema **nunca pide GPS** al usuario
- Las coordenadas se guardan con precisión razonable; no se busca trazabilidad fina

---

## 6. Configuración default minimalista del foodtruck

### 6.1 Filosofía de onboarding

QS asume un dueño que ya tiene operación y quiere digitalizarla — el onboarding puede ser largo. Foodtruck asume que **el dueño es el operador**, no hay equipo de TI, y la cantidad de tiempo libre para configurar es mínima.

Por eso al crear un negocio del vertical Foodtruck, los defaults son **deliberadamente minimalistas**.

### 6.2 Módulos activos al crear el negocio

| Módulo | Default en QS | Default en Foodtruck |
|---|---|---|
| Catálogo y ventas básicas | ✅ Activo | ✅ Activo |
| Caja con denominación | ✅ Activo | ✅ Activo |
| Comanda a impresora | ✅ Activo | ✅ Activo (opcional, ver §6.4) |
| Inventario y recetas | Sugerido (recomendado activar) | ❌ Inactivo (decisión del dueño) |
| Delivery propio | Inactivo | ❌ Inactivo |
| Apps externas | Inactivo | ❌ Inactivo |
| Drive-thru | Si la sucursal tiene ventanilla | ❌ No aplica |
| Geolocalización | N/A | ❌ Inactivo (opt-in) |
| Eventos | N/A | ✅ Activo (es definitorio del vertical) |
| Modo offline 72h | Estándar | ✅ Activo (es definitorio del vertical) |
| CFDI 4.0 | Inactivo (fase final) | ❌ Inactivo (fase final) |

> **Nota sobre CRM básico:** la entidad Cliente del `/core` §5 está **siempre disponible en todos los verticales** (no es un módulo activable). En Foodtruck, su uso típico es **muy esporádico** — la mayoría de las ventas son anónimas. Solo se captura cliente cuando hay un cliente corporativo recurrente o cuando se factura. El sistema lo permite sin necesidad de activarlo, simplemente el operador casi nunca lo usa.

### 6.3 Modos de servicio activos por default

QS activa por default: comer aquí, para llevar, posiblemente drive-thru y delivery propio.

Foodtruck activa por default solo:

- `COMER_AQUI` (parado o en banca alrededor del foodtruck)
- `PARA_LLEVAR`
- `EVENTO_PRIVADO` (si el dueño activa eventos)

El resto está disponible para activar pero **inactivo al crear**.

### 6.4 Configuración de impresora — flexible desde el inicio

Como el hardware del foodtruck es muy variable:

- Si el foodtruck **no tiene impresora**, el sistema funciona sin imprimir. Ofrece compartir el ticket por WhatsApp/Email al cliente (esto requiere internet, así que es feature secundaria) o simplemente operar sin comprobante físico
- Si el foodtruck tiene **una impresora**, imprime ticket + comanda en la misma (configurable)
- Si tiene **dos impresoras** (raro pero posible), una para ticket y otra para comanda

El admin lo configura al onboarding sin asumir nada.

### 6.5 Wizard de onboarding sugerido

Cuando el dueño crea su negocio Foodtruck, un wizard guiado le pregunta solo lo esencial:

```
Paso 1: Datos del negocio (nombre, RFC opcional, contacto)
Paso 2: Tipo de operación (fijo / itinerante / mixto)
Paso 3: Catálogo inicial (sube fotos o agrega productos básicos)
Paso 4: Métodos de pago que aceptas (efectivo, tarjeta-manual, transferencia)
Paso 5: ¿Imprimes ticket? (sí/no, qué impresora)
Paso 6: ¿Trabajas eventos? (sí → activa módulo eventos)
Paso 7: Configura tu PIN

Listo: 7 minutos vs. 30 de un POS tradicional
```

Los módulos avanzados (inventario, geolocalización, CRM, delivery, apps externas) **no aparecen en el wizard**. El dueño los activa después si los necesita, en "Configuración → Módulos opcionales".

---

## 7. UX adaptaciones para pantalla pequeña

### 7.1 El problema

QS asume tablet de 10"+ o monitor. Foodtruck puede operar en:

- Teléfono Android de gama media (5-6")
- Tablet de 7-8"
- iPad mini
- Eventualmente, tablet completa de 10" si el negocio lo tiene

El sistema debe ser usable en todos.

### 7.2 Adaptaciones de la pantalla principal

La pantalla principal de QS (grid de productos + ticket lateral) se adapta:

**En tablet grande (10"+):** misma UX que QS, dos paneles lado a lado.

**En tablet mediana (7-8"):** dos paneles más comprimidos, productos en grid de 2 columnas en lugar de 3.

**En teléfono (5-6"):**

- Vista de **tabs** en lugar de paneles: tab "Productos" / tab "Ticket"
- Botón flotante para alternar entre vistas
- Botón "COBRAR" siempre visible en footer
- Grid de productos en 2 columnas con texto más legible
- Ticket en pantalla completa al tap del tab

```
┌──────────────────────┐
│ TACOS DEL PRIMO  🌐  │
│ Modo: [Para llevar▼] │
├──────────────────────┤
│ [Populares][Tacos]   │
│ [Bebidas][Otros]     │
├──────────────────────┤
│ ┌──────┐  ┌──────┐   │
│ │TACOS │  │TACOS │   │
│ │PASTOR│  │SUADER│   │
│ │ $25  │  │ $30  │   │
│ └──────┘  └──────┘   │
│                      │
│ ┌──────┐  ┌──────┐   │
│ │TACOS │  │QUESA-│   │
│ │CABEZA│  │DILLA │   │
│ │ $30  │  │ $45  │   │
│ └──────┘  └──────┘   │
├──────────────────────┤
│ Ticket: 4 items      │
│ Total: $135.00       │
│                      │
│ [   COBRAR $135   ]  │
│ [Ver ticket completo]│
└──────────────────────┘
```

### 7.3 Texto y botones

- **Tamaño de touch targets** mínimo 44×44 px (regla iOS) — el operador puede tener las manos con grasa
- **Contraste alto** — operación bajo sol, contraluz, polvo
- **Texto grande** en precios y total — visible a un brazo de distancia
- **Iconografía clara** — el sistema debe entenderse con poco texto
- **Botones de acción primaria** (COBRAR, AGREGAR) en colores fuertes y dominantes
- **Modo claro y modo oscuro** disponibles — algunos operan de día (claro) y de noche (oscuro ahorra batería y deslumbra menos)

### 7.4 Batería

Optimizaciones para preservar batería del dispositivo:

- Refresh rate de pantalla bajo cuando la app está activa pero idle
- Sin animaciones innecesarias
- Sincronización con servidor en lotes (no en tiempo real continuo) cuando hay conexión
- Modo offline no consume datos ni batería en intentos de red
- Bluetooth de impresora solo activo cuando se imprime

### 7.5 Reglas

- La app debe funcionar en pantallas desde **5 pulgadas** hacia arriba
- Tap targets nunca menores a 44×44 px
- El sistema **no asume** que el dispositivo tiene mouse o teclado físico
- Modo claro y oscuro disponibles

### 7.6 Plataformas soportadas según fase

| Fase del producto | Plataformas soportadas |
|---|---|
| **MVP (clientes internos Knock-Out, Chick'n Go, Camtaritos)** | Web app puro: Chrome en Android (tablets y teléfonos) + Chrome en Desktop |
| **Fase 2 (SaaS comercial inicial)** | Sigue siendo web puro; primeros clientes externos en Android/Desktop |
| **Fase 3 (SaaS comercial expandido)** | Migración a Capacitor: Android nativo + **iOS nativo (iPad y iPhone)** + Desktop + Web. Mismo código base, distribución multi-plataforma |

> **Importante para Foodtruck en particular:** la operación móvil del Foodtruck en Android es soportada desde MVP. Para clientes que insistan en usar iPad en MVP, se les indica que esa plataforma estará disponible en Fase 3.

---

## 8. Modos de servicio aplicables a Foodtruck

### 8.1 Modos típicos en Foodtruck

Del catálogo del `/core` sección 6.1, Foodtruck típicamente activa:

| Modo | Cuándo |
|---|---|
| `COMER_AQUI` | El cliente come parado o en banca alrededor del foodtruck |
| `PARA_LLEVAR` | El cliente se lleva la comida |
| `EVENTO_PRIVADO` | Operación bajo contrato (boda, evento corporativo) |

### 8.2 Modos opcionales

Activables si el negocio los necesita:

| Modo | Cuándo |
|---|---|
| `DELIVERY_PROPIO` | Si el foodtruck también hace delivery (raro pero existe; ej. foodtruck con flotilla auxiliar en eventos grandes) |
| `APP_RAPPI` / `APP_UBEREATS` / `APP_DIDI` | Algunos foodtrucks fijos también operan apps |

### 8.3 Modos que Foodtruck NO usa

- `DRIVE_THRU` — un foodtruck es drive-thru en sí mismo en cierto sentido, pero el modo formal del `/core` asume ventanilla de QS de cadena, no aplica
- `MESA` / `BARRA` — el foodtruck no tiene mesas asignadas

### 8.4 Implicaciones operativas

- **Comer aquí:** empaque ligero (charola, vajilla descartable). Tiempo de espera corto, el cliente espera al lado
- **Para llevar:** empaque cerrado, eventualmente con bolsa
- **Evento privado:** el modo recordatorio para reportes — el evento ya está en el contexto del turno (§4)

---

## 9. Cobro con tarjeta sin integración

### 9.1 La realidad del mercado

Muchos foodtruckers usan terminales móviles tipo Clip, iZettle, Mercado Pago Point, Stripe Terminal, etc. Cada uno con su propio app y su propio flujo de cobro.

**Decisión:** en MVP, VIM POS **no integra** con ninguna terminal específica. La integración API por proveedor es trabajo de Fase 2+.

### 9.2 Cómo funciona en MVP

**Paso 1.** Cajero llega al paso de cobro (sección 17 del `/core`).

**Paso 2.** Cliente paga con tarjeta. Cajero elige "Tarjeta" en el método de pago:

```
┌─────────────────────────────────────────┐
│   PAGO CON TARJETA — REGISTRO MANUAL    │
├─────────────────────────────────────────┤
│   Total: $185.00                        │
│                                         │
│   Procesa el cobro en tu terminal       │
│   externa (Clip / Mercado Pago / etc.)  │
│                                         │
│   Una vez completado el cobro:          │
│                                         │
│   Últimos 4 dígitos: [ 4892 ]   (opc.)  │
│   Referencia/Autorización: [ _____ ]    │
│   Tipo: ( ) Débito  (•) Crédito         │
│                                         │
│   ¿Cobro exitoso?                       │
│                                         │
│         [ Cancelar ]   [ Confirmar ]    │
└─────────────────────────────────────────┘
```

**Paso 3.** Si el cobro fue exitoso en la terminal externa, el cajero confirma. El ticket pasa a `PAGADO` con método "Tarjeta — terminal externa".

**Paso 4.** Si el cobro en la terminal falla, cajero cancela y elige otro método (efectivo, transferencia).

### 9.3 Reportes

- En el corte de caja, ventas con tarjeta aparecen agrupadas
- El cajero presenta los vouchers físicos de la terminal externa al cierre
- La conciliación con el estado de cuenta del proveedor de pagos es externa al sistema

### 9.4 Futuro (Fase 2+)

Integración API con proveedores específicos. Cuando llegue:

- El sistema lanza el cobro directamente a la terminal
- Recibe confirmación automática
- Asocia el comprobante de la terminal al ticket
- Conciliación automatizada con estados de cuenta

Mientras tanto, el flujo manual descrito funciona perfectamente.

---

## 10. KPIs y reportes específicos de Foodtruck

### 10.1 KPIs únicos del vertical

Más allá de los reportes base del `/core` y los específicos de QS, Foodtruck necesita medir:

- **Ventas por evento** (cuando el módulo de eventos está activo)
- **Ventas por ubicación** (cuando geolocalización está activa)
- **Comparativo de eventos** (ROI relativo)
- **Días offline acumulados** (auditoría operativa)
- **Tiempo promedio sincronizado vs. offline** por turno
- **Ratio ventas tarjeta vs. efectivo** (varía mucho según ubicación)
- **Tiempo de operación por turno** (días de feria suelen ser maratónicos)

### 10.2 Reporte específico: "Ventas por evento"

```
┌─────────────────────────────────────────────────┐
│   VENTAS POR EVENTO — 2026                      │
├─────────────────────────────────────────────────┤
│  Evento                  Días  Ventas  Comisión │
│ ─────────────────────────────────────────────── │
│  Feria Aguascalientes    8    $192,800  $28,920 │
│  Festival Sayulita       3     $84,500  $12,675 │
│  Mérida Cervecera        4    $112,300  $16,845 │
│  Concierto Plaza Mayor   1     $45,200   $6,780 │
│  Operación normal      183    $945,100       $0 │
│ ─────────────────────────────────────────────── │
│  TOTAL                       $1,379,900  $65,220│
│                                                 │
│  Eventos como % del total: 31.5%                │
│  Comisiones como % de ventas-evento: 14.9%      │
└─────────────────────────────────────────────────┘
```

Tap en cada evento abre detalle: días específicos, productos top, comparativo con operación normal.

### 10.3 Reporte específico: "Comparativo de eventos"

Permite al dueño decidir si vale la pena repetir un evento:

```
┌─────────────────────────────────────────────────┐
│   ¿VALE LA PENA ESTE EVENTO?                    │
├─────────────────────────────────────────────────┤
│   Feria Aguascalientes 2026 (8 días)            │
│                                                 │
│   Ventas brutas:     $192,800                   │
│   Comisión pagada:    $28,920 (15%)             │
│   Costo insumos:      $54,400 (28%)             │
│                       ────────                  │
│   Utilidad bruta:    $109,480                   │
│   Por día:            $13,685                   │
│                                                 │
│   Comparado con operación normal en parque:     │
│   Utilidad bruta promedio por día: $4,830       │
│                                                 │
│   ✅ Evento 2.8x más rentable que día normal    │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 10.4 Reporte específico: "Top ubicaciones"

Cuando geolocalización está activa:

```
┌─────────────────────────────────────────────────┐
│   TOP UBICACIONES — 2026                        │
├─────────────────────────────────────────────────┤
│  Ubicación                 Visitas  Ventas/día  │
│ ─────────────────────────────────────────────── │
│  Parque Cardenal — León    142     $3,820       │
│  Plaza Mayor — León         38     $5,210       │
│  Centro Histórico           24     $4,490       │
│  Otras 12 ubicaciones       45     varias       │
└─────────────────────────────────────────────────┘
```

### 10.5 Reporte específico: "Salud del modo offline"

Vista para el dueño preocupado por confiabilidad técnica:

```
┌─────────────────────────────────────────────────┐
│   SALUD DEL SISTEMA — Últimos 30 días           │
├─────────────────────────────────────────────────┤
│   Tickets totales:           1,847              │
│   Tickets capturados offline:  342 (18.5%)      │
│   Tickets sincronizados OK:  1,847 (100%)       │
│   Conflictos al sincronizar:     0              │
│                                                 │
│   Tiempo total offline:    47 horas             │
│   Sesión offline más larga: 14 horas            │
│                                                 │
│   ✅ Sistema operando con confiabilidad total   │
└─────────────────────────────────────────────────┘
```

---

## 11. Subtipos de Personal sugeridos para Foodtruck

Del catálogo del `/core` sección 30.2, en Foodtruck típicamente se activan pocos subtipos por la operación compacta:

| Subtipo | Función en Foodtruck |
|---|---|
| **Cocinero** | Prepara, marca pedidos como listos. En foodtruck es común que sea el mismo dueño |
| **Ayudante de cocina** | Ayuda en preparación, no marca listos |
| **Runner / entrega** | Entrega al cliente; en foodtruck pequeño no existe como rol separado |
| **Personal general** | Limpieza, atención al cliente |

**Realidad típica:** un foodtruck pequeño tiene una sola persona haciendo todo. El sistema permite que un solo usuario tenga rol "Dueño + cajero + cocinero" sin fricción.

**No aplican en Foodtruck:** Mesero, Barista, Host, Repartidor (delivery propio raro), Armador (de Dark Kitchen).

---

## 12. Reglas duras específicas de Foodtruck

Adicionales a las reglas duras del `/core` y QS:

1. **El sistema NUNCA se bloquea por falta de internet.** El cajero puede vender sin interrupción durante al menos 72 horas offline. Esta regla es **inalterable** — es el diferenciador comercial del vertical.

2. **Los folios offline son únicos por caja.** Formato `[sucursal]-[caja]-[año]-[consecutivo]` para evitar colisiones cuando varias cajas sincronizan después de operar offline.

3. **Sincronización transparente.** El cajero no decide cuándo sincronizar. El sistema lo hace automáticamente al detectar conexión.

4. **El evento es opcional en cada turno.** El cajero puede saltar la pregunta de evento → turno queda como "operación normal".

5. **La comisión del evento se captura al cierre, no al inicio.** El monto exacto suele conocerse al final del turno (cuando se sabe la venta total).

6. **Geolocalización solo si el negocio la activa.** Sin activación, el sistema nunca pide permisos de GPS.

7. **No se asume tipo de hardware específico.** La app debe funcionar en pantallas desde 5" hacia arriba, con o sin impresora, con o sin conexión.

8. **Configuración default minimalista.** Los módulos opcionales NO se activan automáticamente al crear el negocio Foodtruck. El dueño los activa explícitamente.

9. **Cobro con tarjeta en MVP es manual.** Sin integración API con terminales externas. El cajero registra que el cobro se hizo en la terminal del proveedor (Clip, Mercado Pago, etc.).

10. **Los reportes por evento son nativos del vertical** (no add-on). Si el módulo de eventos está activo, los reportes están disponibles sin costo adicional.

---

## 📌 Decisiones cerradas del vertical

Decisiones tomadas específicamente para Foodtruck:

1. ✅ **El sistema sirve a foodtrucks fijos, itinerantes y de eventos por igual.** La configuración por negocio se adapta al perfil real.

2. ✅ **Modo offline robusto de 72 horas activado por default** en todos los negocios del vertical Foodtruck. Es el diferenciador comercial principal.

3. ✅ **Geolocalización es módulo opt-in** del negocio. Por default desactivada porque hay foodtrucks fijos que no la necesitan.

4. ✅ **Eventos como contexto del turno** — etiqueta libre del turno + comisión opcional capturada al cierre. Estructura ligera, sin catálogo formal de eventos.

5. ✅ **Hardware flexible.** La app debe correr en teléfonos Android baratos, tablets pequeñas, tablets grandes — el dueño usa lo que tenga. UX adaptable a pantalla desde 5".

6. ✅ **Configuración default minimalista.** Wizard de onboarding de 7 pasos. Módulos opcionales (CRM, delivery, apps, inventario) inactivos por default — el dueño los activa cuando los necesite.

7. ✅ **Cobro con tarjeta en MVP es manual.** Integración con terminales (Clip, Mercado Pago, etc.) viene en Fase 2+.

8. ✅ **Foodtruck NO incluye en MVP:** KDS, drive-thru, múltiples áreas de cocina, layout de mesas, reservaciones, roles complejos. Operación simple y compacta.

9. ✅ **Reportes específicos del vertical:** ventas por evento, comparativo de eventos, top ubicaciones, salud del modo offline.

---

## 📌 Pendientes específicos de Foodtruck

Cosas a definir antes o durante el desarrollo:

1. **Estrategia de cache local:** ¿qué tecnología (IndexedDB, localStorage cifrado, SQLite con Capacitor)? Decisión técnica que se concreta en setup inicial.

2. **Tamaño máximo del cache local:** ¿cuántos tickets puede acumular offline antes de quedarse sin espacio? Probable: hasta 5,000 tickets sin problema en dispositivos modernos. Validar.

3. **Política de resolución de conflictos al sincronizar:** ¿qué pasa si dos cajas offline cierran el mismo turno por error? Documentar reglas.

4. **Wizard de onboarding:** diseño UX detallado del wizard de 7 pasos. Pendiente para fase de implementación.

5. **Plantilla de captura de eventos recurrentes:** los foodtrucks que repiten ferias año tras año podrían beneficiarse de "duplicar evento del año pasado". Futura mejora.

6. **Integración con terminales bancarias (Fase 2+):** ¿qué proveedor primero? Clip es el más común en México; Mercado Pago Point está creciendo. Decisión comercial.

7. **Modo "evento masivo":** algunos eventos grandes operan con varios cajeros móviles simultáneos. ¿El sistema soporta multi-caja offline en el mismo turno-evento? Sí en arquitectura, validar UX.

8. **Compartir ticket por WhatsApp/email cuando no hay impresora:** requiere conexión y cliente con número/email. Definir UX y prioridad.

9. **Backup local:** ¿el sistema hace export automático del cache cada N horas a almacenamiento local del dispositivo, por si la app se daña? Sugerencia para Fase 2.

10. **Permisos de cámara para escanear tickets de eventos (opcional futuro):** si el organizador del evento entrega tickets QR del show, escanearlos para conciliar.

---

*Documento de flujos del módulo Foodtruck — VIM POS v1.1. Plan Maestro — Fermín, VIM Marketing.*

*Para flujos comunes a todos los verticales, consulta `01-FLUJOS-COMUNES-CORE.md` v3.*
*Para mecánicas heredadas de QS (mostrador, modificadores, pantalla principal), consulta `02-FLUJOS-QUICK-SERVICE.md` v3.*
