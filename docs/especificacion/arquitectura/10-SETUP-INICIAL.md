# 10 — SETUP INICIAL — Onboarding de un nuevo cliente en VIM POS

> **Versión:** v1.1
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** décimo en la serie de arquitectura de VIM POS
> **Alcance:** flujo paso a paso desde "Fermín crea un tenant" hasta "el restaurante cobra su primera venta"
> **Audiencia:** Fermín (operador), nuevo cliente piloto (Knock-Out Burger, Chick'n Go, Camtaritos), futuro equipo de onboarding/soporte de VIM Marketing
> **Depende de:** Partes 1A-1E (arquitectura técnica), 09 (matriz de roles y permisos), **12 (provisioning — nomenclatura canónica)**
> **Continúa en:** desarrollo del MVP

---

> ## ⚠️ Nota de reconciliación de nomenclatura (v1.1)
>
> Este documento se escribió antes de cerrar el schema 1A y el doc 12. Donde el texto use nombres antiguos, **la nomenclatura canónica está en el doc 12 §8 y es la que manda.** Mapeo rápido para leer este documento:
>
> | Aquí dice (antiguo) | Léase (canónico) |
> |---|---|
> | `estado INVITADO` (del tenant) | `tenants.estado = TRIAL` (o `INTERNO`) + `tenant_onboarding_estado.fase = INVITADO` |
> | `estado EN_ONBOARDING, fase actual = N` | `tenant_onboarding_estado.fase = EN_CONFIGURACION`, `fase_wizard = N` (el estado comercial sigue siendo TRIAL/INTERNO) |
> | `PRODUCTIVO` / fin de Fase 8 | `tenant_onboarding_estado.fase = GO_LIVE` |
> | tabla `usuarios_acceso_roles` | tabla `usuarios_acceso` (única, con `rol_id`) |
> | rol `DUENO` | rol `DUENO` |
> | scope `TENANT_COMPLETO` | `usuarios_acceso.sucursal_id = NULL` |
> | vertical `'QSR'` (literal SQL/enum) | `'QUICK_SERVICE'` (enum `vertical_tipo`) |
> | función de alta (pseudo-código) | `crear_tenant_con_owner()` real en doc 12 §4 |
>
> El SQL de este documento es **pseudo-código ilustrativo del flujo UX**; la implementación real vive en 1A, 1F y 12. La abreviatura "QSR" en prosa equivale a "Quick Service" y es inofensiva.

---

## 📋 Tabla de contenidos

- [0. Introducción y propósito](#0-introducción-y-propósito)
- [1. Filosofía del onboarding](#1-filosofía-del-onboarding)
- [2. Convenciones](#2-convenciones)
- [3. Pre-requisitos](#3-pre-requisitos)
- [4. Fase 0 — Creación del tenant (Fermín)](#4-fase-0--creación-del-tenant-fermín)
- [5. Fase 1 — Configuración fiscal y datos del negocio](#5-fase-1--configuración-fiscal-y-datos-del-negocio)
- [6. Fase 2 — Estructura organizacional](#6-fase-2--estructura-organizacional)
- [7. Fase 3 — Usuarios y roles](#7-fase-3--usuarios-y-roles)
- [8. Fase 4 — Catálogo](#8-fase-4--catálogo)
- [9. Fase 5 — Configuraciones operativas](#9-fase-5--configuraciones-operativas)
- [10. Fase 6 — Apps externas y delivery](#10-fase-6--apps-externas-y-delivery)
- [11. Fase 7 — Inventario y recetas (opcional)](#11-fase-7--inventario-y-recetas-opcional)
- [12. Fase 8 — Pruebas y go-live](#12-fase-8--pruebas-y-go-live)
- [13. Defaults inteligentes por vertical](#13-defaults-inteligentes-por-vertical)
- [14. Manejo de errores y recuperación](#14-manejo-de-errores-y-recuperación)
- [15. Casos especiales por vertical](#15-casos-especiales-por-vertical)
- [16. Checklist de validación](#16-checklist-de-validación)

---

## 0. Introducción y propósito

### 0.1 Por qué este documento existe

Tener una arquitectura técnica completa y una matriz de roles definida no sirve de nada si el primer cliente tarda 3 semanas en configurar el sistema. El onboarding **es** el primer producto que el cliente experimenta. Si es confuso, frustrante, o requiere conocimiento técnico que el dueño del restaurante no tiene, **el cliente abandona antes de cobrar su primera venta**.

Este documento define el flujo paso a paso para que un dueño de restaurante mexicano (con conocimiento básico de computación, sin saber SQL, sin entender RFC vs Razón Social) pueda llevar VIM POS de **cuenta vacía a primera venta cobrada en menos de 90 minutos**.

**El producto NO es solo el POS. El producto incluye el camino para llegar al POS funcionando.**

### 0.2 Alcance

**Este documento define:**

- ✅ El flujo de 8 fases del onboarding
- ✅ Qué información se le pide en cada paso, con qué validaciones
- ✅ Defaults pre-aprobados por vertical (QSR, Foodtruck, Full Service, Café & Bar, Dark Kitchen)
- ✅ Pasos opcionales y skip-friendly
- ✅ Sample data (catálogos modelo) importables para acelerar
- ✅ Procedimiento de recuperación si algo falla
- ✅ Casos especiales: tenant con múltiples sucursales desde el día 1, tenant con marcas virtuales, tenant que solo opera vía apps externas
- ✅ Métricas de éxito del onboarding (tiempo, abandono, completitud)

**Este documento NO define:**

- ❌ Las pantallas visuales del wizard (eso va en 08-WIREFRAMES — los wireframes vendrán después)
- ❌ Migración desde otro POS (Toast, Square, etc.) — Fase 4 con módulo de import dedicado
- ❌ Capacitación del personal del cliente — responsabilidad humana, no del software
- ❌ Soporte post-onboarding (problemas operativos reportados por cliente activo)
- ❌ Renovación de certificados CFDI vencidos (módulo operativo, no onboarding)
- ❌ Cambio de PAC fiscal (operación admin, no onboarding inicial)

### 0.3 Métricas de éxito

El onboarding se considera exitoso si el cliente:

1. **Completa Fase 0 a 4** (datos básicos, sucursal, caja, 1 usuario cajero, 1 producto) en menos de **30 minutos**
2. **Logra cobrar primera venta real** (no de prueba) en menos de **90 minutos** desde el inicio
3. **Configura su catálogo completo** (todos sus productos reales) en menos de **4 horas acumuladas**
4. **NO requiere intervención técnica de Fermín** después de Fase 1 (lo demás es autoservicio guiado)
5. **NO abandona** el proceso entre fases (medido por días sin avanzar)

**Anti-métrica:** si el cliente llama a Fermín por dudas de configuración 3+ veces, el wizard falló en su trabajo. Esa llamada es una bandera para mejorar el documento.

### 0.4 Decisiones cerradas que este documento declara

Continuación de D67-D75 del documento 09.

| # | Decisión | Materialización |
|---|---|---|
| **D76** | Onboarding por fases con guardado automático entre cada una | §1.3 — modelo de "save and continue" |
| **D77** | Setup wizard interactivo con UI dedicada + opción de import CSV para catálogo | §8.6 — bulk import opcional |
| **D78** | Defaults pre-aprobados por vertical (QSR, Foodtruck, Full Service, Café & Bar, Dark Kitchen) | §13 — catálogo de defaults |
| **D79** | Tenant puede operar con **setup mínimo**: datos fiscales + 1 sucursal + 1 caja + 1 producto + 1 usuario cajero | §12.2 — definición de mínimo viable |
| **D80** | Fases opcionales explícitas (inventario, recetas, promociones iniciales son skip-friendly) | §1.5 — fases marcadas como obligatorias/opcionales |
| **D81** | Recovery automático en caso de fallo a mitad del wizard | §14 — estado persistido en BD desde el primer save |
| **D82** | Sample data importable opcionalmente para acelerar pruebas | §13.5 — paquetes pre-armados por vertical |
| **D83** | Tiempo objetivo: <30 min para mínimo viable, <90 min hasta primera venta, <4h para setup completo | §0.3 — métricas |
| **D84** | Onboarding es "self-service guiado": el cliente lo hace solo, con prompts y validaciones, no Fermín haciéndolo por él | §1.2 — filosofía |

---

## 1. Filosofía del onboarding

### 1.1 El cliente NO sabe nada de POS técnicos

El dueño del restaurante:
- No sabe qué es un RFC vs una Razón Social
- No conoce la diferencia entre `tipo_persona='FISICA'` y `MORAL`
- No sabe qué es un PAC fiscal
- No entiende por qué "número de caja" es importante
- Confunde "área de cocina" con "estación de cocina"
- Quiere vender hamburguesas, no aprender vocabulario técnico

**El wizard habla en su idioma**, no en el del programador. Cada campo tiene:
- Etiqueta clara ("Nombre del restaurante", no "Razón social")
- Ayuda contextual ("Es como aparece en tus facturas — pregunta a tu contador si no estás seguro")
- Ejemplo visible ("Ejemplo: Hamburguesas Knock-Out, S.A. de C.V.")
- Validación amigable (no "error 400", sino "Este RFC parece incorrecto, debe tener 12 o 13 caracteres")

### 1.2 Self-service guiado (D84)

**Lo que NO queremos:** Fermín conectándose por TeamViewer a cada cliente, llenando formularios por él. Eso no escala más allá de los 3 pilotos.

**Lo que SÍ queremos:** el cliente sigue los pasos solo, con un wizard inteligente que:
- Le pregunta lo necesario en orden lógico
- Le explica el por qué de cada dato
- Le valida lo que ingresa antes de avanzar
- Le permite saltar lo opcional
- Le ofrece defaults inteligentes por vertical (D78)
- Le permite volver atrás sin perder lo avanzado (D81)

Fermín entra solo en **dos momentos**:
- **Fase 0:** él crea el tenant cuando cierra la venta (1-2 minutos)
- **Soporte reactivo:** si el cliente reporta problema específico

### 1.3 Guardado entre fases (D76)

Cada fase termina con un "Guardar y continuar". Cada save persiste el estado en BD. Si el cliente cierra el navegador, la luz se va, o decide continuar mañana:

1. Vuelve a entrar
2. El sistema lo recibe: "Hola Mario, continuemos donde lo dejaste. Estabas configurando productos."
3. Sigue exactamente en el paso donde quedó

**Implementación técnica:** tabla `tenant_onboarding_estado` con `fase_actual`, `subpaso_actual`, `payload_borrador jsonb`. Se actualiza en cada save.

### 1.4 Validar lo crítico, postergar lo opcional

Algunas cosas DEBEN estar bien desde el inicio:
- **RFC** (si está mal, ningún CFDI funcionará después)
- **Día contable** (si está mal, todos los reportes Z saldrán cortados raro)
- **Estructura de cajas** (mover cajas después de tener tickets es complicado)

Otras cosas pueden corregirse después sin dolor:
- Foto del producto
- Color de la marca virtual
- Porcentajes sugeridos de propina
- Categorías del menú (se pueden reorganizar)

El wizard distingue claramente entre **validaciones bloqueantes** (no puedes avanzar hasta arreglarlo) y **advertencias** (te marcamos esto en amarillo, pero puedes seguir).

### 1.5 Fases obligatorias vs opcionales (D80)

| Fase | Status | Saltable | Notas |
|---|---|---|---|
| 0. Creación del tenant | Obligatoria | No (la hace Fermín) | Pre-requisito de todo |
| 1. Datos fiscales y del negocio | Obligatoria | No | Necesario para CFDI |
| 2. Estructura organizacional | Obligatoria | No | Mínimo 1 sucursal y 1 caja |
| 3. Usuarios y roles | Obligatoria | No | Mínimo el OWNER (ya creado) + 1 CAJERO |
| 4. Catálogo | Obligatoria | No | Mínimo 1 categoría y 1 producto |
| 5. Configuraciones operativas | Obligatoria | Parcialmente | Modos de servicio obligatorio; propinas y promociones opcionales |
| 6. Apps externas y delivery | **Opcional** | Sí | Solo si el cliente las usa |
| 7. Inventario y recetas | **Opcional** | Sí | Recomendado pero no requerido para operar |
| 8. Pruebas y go-live | Obligatoria | No | Validación final + primera venta de prueba |

### 1.6 Defaults inteligentes por vertical (D78)

Cuando el cliente declara "soy un foodtruck" o "soy un restaurante full service", el wizard preconfigura cosas que el 90% de los negocios de ese tipo quieren:

- Modos de servicio típicos
- Áreas de cocina típicas
- Categorías de menú típicas
- Métodos de propina típicos

El cliente puede modificar cualquier default, pero arranca con algo razonable, no con una pantalla en blanco.

### 1.7 Pruebas antes de producción real

Antes de que el cliente cobre su primera venta REAL a un cliente REAL, el wizard fuerza:

1. **Venta de prueba** (entorno de pruebas o ticket cancelado): el cliente abre un ticket, agrega productos, simula pago, confirma que todo funciona.
2. **Impresión de prueba** (si tiene impresora): comanda y ticket de venta salen por la impresora correcta.
3. **Reporte X de prueba**: ver que se ve bien.
4. **(Opcional) CFDI de prueba**: emitir CFDI con RFC genérico XAXX010101000 al PAC en sandbox.

Solo después de pasar estas pruebas el sistema marca el tenant como "PRODUCTIVO" y permite operar normalmente.

---

## 2. Convenciones

- **Fases** numeradas del 0 al 8.
- **Pasos** dentro de cada fase numerados (1.1, 1.2, etc.).
- En descripciones de campos:
  - **Obligatorio:** ⚠️
  - **Opcional:** (opcional)
  - **Con default:** [default: valor]
  - **Bloqueante de validación:** 🛑
  - **Advertencia:** ⚠️ amarillo
- **Tiempo estimado** indicado al inicio de cada fase.
- **Roles que ejecutan**: indicado por fase.

---

## 3. Pre-requisitos

### 3.1 Lo que debe estar listo antes de empezar Fase 0

**De Fermín (VIM Marketing):**

- ✅ Plataforma VIM POS en producción (Supabase + Vercel desplegados)
- ✅ Acceso SUPER_ADMIN configurado
- ✅ Cuentas con los PACs fiscales activas (Facturapi, Solucionfactible)
- ✅ Contrato firmado con el cliente
- ✅ Plan/tier asignado para el tenant (define límites: # sucursales, # usuarios, módulos disponibles)

**Del cliente (dueño del restaurante):**

- ✅ Decidió usar VIM POS y firmó contrato
- ✅ Tiene su RFC y constancia de situación fiscal a la mano (o pide ayuda a su contador)
- ✅ Tiene un email funcional (para recibir invitación y notificaciones)
- ✅ Tiene una computadora o tableta con navegador moderno
- ✅ Conexión a internet (idealmente fija; offline llegará después con Capacitor en Fase 3)
- ✅ Lista mental (o en papel/Excel) de su menú actual con precios

**Opcional pero recomendado:**

- ✅ Logo del negocio (PNG/JPG, máx 1MB)
- ✅ Lista de empleados con sus emails (para invitarlos)
- ✅ Datos de contacto del contador (puede crearle un acceso AUDITOR_LECTOR)
- ✅ Si ya emite CFDI: certificados FIEL/CSD para el PAC

### 3.2 Lo que NO necesita tener listo

- ❌ Estructura técnica resuelta (cuál es mi "caja" — el wizard lo explica)
- ❌ Comprensión de conceptos POS técnicos
- ❌ Catálogo digital (puede dictarlo verbalmente con la app)
- ❌ Configuración fiscal avanzada (PAC, certificados — se puede hacer después de Fase 4)
- ❌ Hardware especial (impresora térmica funciona si la tiene, pero no es obligatoria)

### 3.3 Hardware soportado (referencia para sales)

Para que Fermín pueda asesorar al cliente al cerrar venta:

| Tipo | Recomendado | Mínimo viable |
|---|---|---|
| Dispositivo POS | Tableta Android 12+ o iPad con iOS 16+ o laptop con Chrome | Cualquier navegador moderno (Chrome 120+, Safari 16+, Edge 120+) |
| Impresora de ticket | Térmica USB/Bluetooth 80mm (Epson TM-T20, Star TSP143) | Compartir PDF (sin impresora) |
| Impresora de comanda | Térmica de red para cocina (Epson TM-T82, Star SP742) | Misma impresora del ticket (cocina lee de pantalla) |
| Lector de tarjetas | Terminal de banco/CLIP/Mercado Pago (independiente del POS) | Captura manual del folio de aprobación |
| Cajón de dinero | Eléctrico conectado a impresora | Cajón manual + botón "abrir cajón" digital |
| Báscula | Bluetooth (Fase 2+) | Manual con captura de gramos |

> **Nota MVP:** la integración directa con impresoras térmicas vía red local viene en Fase 2 con Capacitor. En MVP, las impresoras se conectan vía driver del navegador (WebUSB/WebBluetooth) o el usuario imprime PDF.

### 3.4 Datos que el cliente DEBE recolectar antes (lista para entregarle al cerrar venta)

Esta lista es lo que Fermín envía al cliente como "tarea previa" antes de la cita de onboarding:

```
Para tu sesión de onboarding con VIM POS, ten lista esta información:

📋 DATOS FISCALES (consulta a tu contador si no tienes claro):
   • RFC del negocio
   • Razón social completa (como aparece en facturas)
   • Régimen fiscal (lo dice tu constancia de situación fiscal)
   • Código postal de tu domicilio fiscal
   • Email para recibir copia de las facturas que emitas

🏪 ESTRUCTURA DEL NEGOCIO:
   • ¿Cuántos locales tienes operando? (Sucursales)
   • Direcciones de cada uno
   • ¿Cuántas cajas registradoras tienes en cada sucursal?
   • Horarios de operación de cada sucursal

👥 EQUIPO:
   • Lista de empleados con sus emails
   • Para cada uno: ¿qué hace? (cocinero, cajero, mesero, repartidor, supervisor)

🍔 MENÚ:
   • Tu lista de productos actual con precios
   • Categorías cómo los agrupas mentalmente (entradas, principales, bebidas, postres)
   • Productos con variantes (¿tienes hamburguesa sencilla y doble carne?)

📱 OPCIONAL:
   • Logo del negocio (archivo PNG/JPG)
   • Si usas Rappi/Uber/Didi: cuáles
   • Si emites facturas (CFDI): qué PAC usas o si quieres que te lo configuremos
```

---

## 4. Fase 0 — Creación del tenant (Fermín)

**Quién ejecuta:** SUPER_ADMIN (Fermín o equipo VIM Marketing)
**Tiempo estimado:** 2-5 minutos
**Estado del tenant al finalizar:** `INVITADO` (esperando que el dueño complete Fase 1)

### 4.1 Paso 0.1: Captura de información del nuevo cliente

Fermín entra al panel de administración de VIM Marketing (Fase 2; en MVP es Supabase Studio o un script).

**Información que captura:**

| Campo | Tipo | Validación | Nota |
|---|---|---|---|
| Nombre del negocio | varchar | ⚠️ Obligatorio | "Knock-Out Burger" |
| Email del dueño | email | 🛑 Único en plataforma | Recibirá invitación aquí |
| Nombre del dueño | varchar | ⚠️ Obligatorio | "Mario Hernández" |
| Teléfono del dueño | varchar | (opcional) | Para soporte |
| Vertical principal | enum | ⚠️ Obligatorio | QUICK_SERVICE, FOODTRUCK, FULL_SERVICE, CAFE_BAR, DARK_KITCHEN |
| Plan | enum | ⚠️ Obligatorio | Código de plan: QS, FT, CB, FS, DK, ENT (1A §3.2). Piloto sin costo = `estado INTERNO` |
| Notas internas | text | (opcional) | "Piloto, contacto Fermín, sin contrato firmado todavía" |

### 4.2 Paso 0.2: Sistema crea el tenant

El sistema ejecuta automáticamente:

```sql
-- Pseudo-código. Firma real en doc 12 §4. El alta es de dos pasos:
-- Paso 1 (app, service_role): supabase.auth.admin.createUser({ email }) → owner_user_id
-- Paso 2 (SQL):
SELECT crear_tenant_con_owner(
  p_owner_user_id    => '<uuid devuelto por Auth Admin API>',
  p_codigo           => 'knockout',
  p_nombre_comercial => 'Knock-Out Burger',
  p_nombre_owner     => 'Mario Hernández',
  p_telefono_owner   => '+52 477 123 4567',
  p_vertical         => 'QUICK_SERVICE',
  p_plan_codigo      => 'QS',
  p_estado           => 'INTERNO',          -- piloto sin costo
  p_notas_internas   => 'Piloto Fermín, mayo 2026'
);
```

Esta función es `crear_tenant_con_owner()`, definida en el **doc 12 §4**. Resumen de lo que inserta:

1. Fila en `tenants` con `estado = TRIAL` (o `INTERNO` para Knock-Out)
2. Usuario del dueño vía Supabase Auth Admin API (email + contraseña temporal)
3. Fila en `usuarios_perfil` (perfil del dueño)
4. Fila en `usuarios_acceso` con rol `DUENO` y `sucursal_id = NULL` (todas las sucursales)
5. Fila en `tenant_folios_saldo` (base mensual del plan) — D96
6. Fila en `tenant_onboarding_estado` con `fase = INVITADO`
7. Envía email de invitación al dueño con magic link

### 4.3 Paso 0.3: Email de invitación al dueño

El dueño recibe email con:

```
Asunto: Tu nueva cuenta de VIM POS está lista, Mario 🎉

Hola Mario,

¡Bienvenido a VIM POS!

Tu cuenta para "Knock-Out Burger" ya está creada. Solo necesitas activarla:

[BOTÓN] Activar mi cuenta y empezar a configurar →

(También puedes copiar esta URL: https://app.vimpos.mx/activar?token=...)

El proceso de configuración inicial toma alrededor de 90 minutos y puedes
hacerlo de una sola vez o por partes (guardamos automáticamente).

Si tienes dudas durante el proceso, contacta a Fermín:
WhatsApp: +52 477 XXX XXXX
Email: soporte@vimpos.mx

Nos vemos del otro lado,
Equipo VIM POS
```

### 4.4 Paso 0.4: Dueño hace clic en activar

Al hacer clic:
1. Magic link valida el token
2. Sistema verifica que el tenant está en estado `INVITADO`
3. Solicita al dueño:
   - **Definir contraseña nueva** (mínimo 8 caracteres, al menos 1 mayúscula, 1 número)
   - **Definir PIN de 4-6 dígitos** (para autorizar operaciones sensibles después)
   - **Aceptar términos y condiciones** (checkbox obligatorio)
4. Al confirmar:
   - Estado del tenant cambia a `EN_ONBOARDING`
   - Email del dueño se marca como verificado
   - Se le redirige al wizard de Fase 1

**Importante:** si el dueño no activa en 7 días, se le envía recordatorio. Si no activa en 30 días, Fermín recibe alerta y decide si suspender el tenant o contactar al cliente.

---

## 5. Fase 1 — Configuración fiscal y datos del negocio

**Quién ejecuta:** DUENO
**Tiempo estimado:** 10-15 minutos
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 2

### 5.1 Paso 1.1: Información general del negocio

Pantalla del wizard:

```
Empecemos por conocer mejor tu negocio
─────────────────────────────────────────

📍 Nombre comercial del negocio
   [Knock-Out Burger          ]
   (Es el nombre con el que tus clientes te conocen)

📍 Tipo de negocio
   ( ) Restaurante de comida rápida (QSR)        [recomendado para ti]
   ( ) Foodtruck
   ( ) Restaurante con servicio en mesa (Full Service)
   ( ) Café o Bar
   ( ) Dark Kitchen / Cocina virtual
   (Si tu negocio combina varios tipos, elige el principal — podrás ajustar después)

📍 Logo del negocio (opcional)
   [ Subir archivo... ]
   (PNG o JPG, máximo 1MB. Aparecerá en tickets y facturas)

[ Continuar → ]
```

**Validaciones:**
- Nombre: 3-100 caracteres, alfanumérico + espacios + acentos
- Logo: si se sube, validar formato y tamaño

### 5.2 Paso 1.2: Datos fiscales

Pantalla más delicada, requiere clarity.

```
Datos fiscales (para emitir facturas CFDI)
─────────────────────────────────────────

⚠️ Si no usas factura electrónica, puedes saltar esta sección y configurarla después.
   [ Saltar este paso → ]

📍 RFC del negocio ⚠️
   [HABE850101XXX          ]
   (Tu RFC tal cual aparece en tu Constancia de Situación Fiscal)

📍 Razón social ⚠️
   [Hamburguesas Knock-Out, S.A. de C.V.            ]
   (El nombre legal de tu negocio. Si eres persona física, tu nombre completo)

📍 Régimen fiscal ⚠️
   [▼ Selecciona tu régimen]
     601 — General de Ley Personas Morales
     612 — Personas Físicas con Actividades Empresariales y Profesionales
     621 — Incorporación Fiscal
     626 — Régimen Simplificado de Confianza (RESICO)
     ... (catálogo SAT completo)

📍 Código postal del domicilio fiscal ⚠️
   [37000                    ]

📍 Email para enviar copia de facturas ⚠️
   [facturacion@knockout.com         ]
   (Recibirás copia de cada CFDI emitido)

[ ← Atrás ]  [ Continuar → ]
```

**Validaciones (bloqueantes):**
- 🛑 RFC: formato válido. Persona física = 13 caracteres, persona moral = 12 caracteres. Regex específico.
- 🛑 Si el RFC empieza con letras MM, FF, NN o secuencias inválidas → rechazado
- 🛑 RFC `XAXX010101000` (público en general) NO se acepta como RFC del emisor
- 🛑 Código postal: 5 dígitos numéricos válidos en catálogo SAT
- 🛑 Email: formato válido

**Advertencias (no bloqueantes, amarillo):**
- ⚠️ Si el RFC parece de persona física pero la razón social parece de moral, alertar

### 5.3 Paso 1.3: PAC fiscal (Proveedor Autorizado de Certificación)

```
¿Quién emitirá tus facturas? (PAC fiscal)
─────────────────────────────────────────

VIM POS necesita un PAC para timbrar facturas con el SAT.
Si no tienes uno, te ayudamos a contratar uno.

Opciones:

( ● ) No emito facturas todavía
       (Podrás configurar esto después cuando tengas un PAC)

( ) Ya tengo PAC contratado
       [▼ Selecciona]: Facturapi / Solucionfactible / Finkok / Edicom / Prodigia / Otro
       API Key: [.................................]
       (La encuentras en el panel de tu PAC. Pregunta a tu contador.)

( ) Quiero contratar PAC con VIM POS (te lo configuramos)
       [Te contactaremos en 24-48h para activarte. Costo: $0.50 por CFDI emitido.]

[ ← Atrás ]  [ Continuar → ]
```

**Si elige la primera opción:** se marca `tenant.cfdi_activado = false`. El POS funciona sin facturación. Las funciones `cfdi_*` no son llamadas. El dueño puede activar después.

**Si elige la segunda:** se prueban credenciales contra el PAC con un timbrado de prueba (CFDI de $1 a RFC genérico, en sandbox del PAC). Si falla, se le pide volver a ingresar.

**Si elige la tercera:** se crea ticket de soporte interno para Fermín. El tenant continúa sin CFDI por ahora.

### 5.4 Paso 1.4: Configuración del día contable

```
¿A qué hora cierra tu día operativo?
─────────────────────────────────────────

El "día contable" determina cuándo se cuentan tus ventas.
Si vendes una hamburguesa el sábado a las 2 AM, ¿es venta del viernes o del sábado?

Recomendaciones por tipo de negocio:
• Restaurante de comida rápida: cierre a las 4 AM ← [tu vertical]
• Foodtruck: cierre a las 4 AM
• Restaurante full service: cierre a las 4 AM
• Bar / Café nocturno: cierre a las 6 AM
• Dark kitchen 24/7: cierre a las 5 AM

📍 Hora de cierre del día contable
   [▼ 04:00 AM (recomendado para QSR)]
   (Puedes cambiar esto después si lo necesitas)

📍 Zona horaria
   [▼ America/Mexico_City (UTC-6)]

[ ← Atrás ]  [ Guardar y continuar → ]
```

**Default:** 04:00 AM para QSR/FoodTruck/FullService/DK, 06:00 AM para Cafe_Bar.

**Crítico:** este valor se usa en `calcular_dia_contable()` y afecta a TODOS los reportes Z, agregados diarios, etc. Cambiarlo después es posible pero los datos previos quedan con el cálculo viejo. Por eso es obligatorio definirlo ahora.

### 5.5 Paso 1.5: Confirmación de Fase 1

```
✅ Datos del negocio guardados

Resumen:
• Nombre: Knock-Out Burger
• Tipo: Restaurante de comida rápida (QSR)
• RFC: HABE850101XXX
• Razón social: Hamburguesas Knock-Out, S.A. de C.V.
• Día contable cierra: 04:00 AM
• Facturas CFDI: No activadas (se puede activar después)

[ Editar datos ]  [ Continuar a configurar sucursales → ]
```

### 5.6 Datos persistidos al fin de Fase 1

```sql
UPDATE tenants
SET nombre_comercial = 'Knock-Out Burger',
    vertical_principal = 'QUICK_SERVICE',
    logo_storage_path = '...',
    rfc = 'HABE850101XXX',
    razon_social = 'Hamburguesas Knock-Out, S.A. de C.V.',
    regimen_fiscal = '601',
    codigo_postal_fiscal = '37000',
    email_facturacion = 'facturacion@knockout.com',
    cfdi_activado = false,                        -- saltado
    hora_cierre_dia_contable = '04:00:00',
    timezone = 'America/Mexico_City',
    estado = 'EN_ONBOARDING',
    fase_onboarding_actual = 2
WHERE id = <tenant_id>;
```

---

## 6. Fase 2 — Estructura organizacional

**Quién ejecuta:** DUENO
**Tiempo estimado:** 5-10 minutos
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 3

### 6.1 Paso 2.1: Configurar primera sucursal

Por ahora forzamos al menos 1 sucursal. Si el cliente tiene varias, las agrega después.

```
Tu primera sucursal
─────────────────────────────────────────

📍 Nombre de la sucursal ⚠️
   [Knock-Out Centro                ]
   (Ejemplos: "Sucursal Centro", "Foodtruck Principal", "Cocina Norte")

📍 Dirección
   [Av. Insurgentes 234, Col. Centro, León, Gto.    ]

📍 Teléfono de contacto (opcional)
   [477 123 4567        ]

📍 Horarios de operación
   Lunes a Viernes:   [10:00] hasta [22:00]
   Sábado:            [11:00] hasta [23:00]
   Domingo:           [11:00] hasta [21:00]
   [ + Configuración avanzada por día ]

📍 Modos de servicio que ofreces aquí ⚠️ [varias permitidas]
   ☑ Para llevar (PARA_LLEVAR)         [recomendado QSR]
   ☑ Comer aquí (COMER_AQUI)           [recomendado QSR]
   ☐ Delivery propio (DELIVERY_PROPIO)
   ☐ Apps externas (Rappi/Uber/Didi)   [configuraremos después]
   ☐ Drive-thru                         (Fase 2)

[ ← Atrás ]  [ Continuar → ]
```

**Defaults por vertical:**

| Vertical | Modos pre-marcados |
|---|---|
| QSR | PARA_LLEVAR, COMER_AQUI |
| FOODTRUCK | PARA_LLEVAR |
| FULL_SERVICE | COMER_AQUI |
| CAFE_BAR | COMER_AQUI, PARA_LLEVAR |
| DARK_KITCHEN | APP_RAPPI, APP_UBEREATS, DELIVERY_PROPIO |

### 6.2 Paso 2.2: Cajas de la sucursal

```
¿Cuántas cajas tienes en Knock-Out Centro?
─────────────────────────────────────────

Una "caja" es cada punto donde alguien cobra. Si tienes 2 cajeros trabajando
simultáneamente, son 2 cajas. Si solo hay 1 cajero, es 1 caja.

📍 Número de cajas ⚠️
   [▼ 1 caja]
   1 caja
   2 cajas
   3 cajas
   4 cajas
   Más de 4 (contactar soporte)

(Continúa abajo según selección)

Para cada caja, asigna un nombre identificable:
   Caja 1: [Caja Principal           ]
   Caja 2: [Caja Barra               ]

📍 Fondo inicial de caja (efectivo con que abre cada caja)
   [$ 500.00]
   (Dinero en billetes/monedas para dar cambio. Se aplica a cada caja al iniciar turno.)

[ ← Atrás ]  [ Continuar → ]
```

### 6.3 Paso 2.3: Áreas de cocina

```
¿Cómo está organizada tu cocina?
─────────────────────────────────────────

Las "áreas de cocina" son las estaciones donde se prepara distinto tipo de comida.
Cada área puede tener su propia impresora de comanda (lo configuras después).

Para tu tipo de negocio (QSR), recomendamos:
☑ Cocina (todo se prepara en una estación)        [tu default]
☐ Bebidas (separar bebidas de comida)
☐ Postres

¿Cómo lo quieres configurar?

( ● ) Una sola área de cocina (más simple)
( ) Configurar áreas separadas
       [+ Agregar área]
       Área 1: [Plancha          ]
       Área 2: [Fría / Ensaladas ]
       Área 3: [Postres          ]
       Área 4: [Bebidas          ]

[ ← Atrás ]  [ Continuar → ]
```

**Defaults por vertical:**

| Vertical | Áreas sugeridas |
|---|---|
| QSR | Cocina (una sola) |
| FOODTRUCK | Cocina (una sola) |
| FULL_SERVICE | Cocina caliente, Cocina fría, Postres, Bar |
| CAFE_BAR | Barra (café), Cocina (snacks) |
| DARK_KITCHEN | Por marca virtual (config después en §10.3) |

### 6.4 Paso 2.4: Mesas y secciones (solo Full Service y Café & Bar)

Si vertical es QSR/FoodTruck/DK, este paso se salta automáticamente.

Si es Full_Service o Cafe_Bar:

```
¿Tienes mesas para clientes?
─────────────────────────────────────────

Configura el plano básico de tu salón.

📍 Secciones del salón
   [+ Agregar sección]
   Sección 1: [Salón Principal] - color [#blue]
   Sección 2: [Terraza        ] - color [#green]
   Sección 3: [Barra          ] - color [#orange]

📍 Mesas por sección
   Salón Principal:
   • Mesa 1 (4 personas)  Mesa 2 (4)  Mesa 3 (4)  Mesa 4 (6)  Mesa 5 (6)
   [+ Agregar mesa] [Importar lote (CSV)]

   Terraza:
   • Mesa T-1 (2)  Mesa T-2 (2)  Mesa T-3 (4)  Mesa T-4 (4)

   Barra:
   • B-1, B-2, B-3, B-4, B-5 (1 persona cada una)

📍 Total: 17 mesas, capacidad total 60 personas

[ ← Atrás ]  [ Continuar → ]
```

### 6.5 Paso 2.5: Marcas virtuales (solo Dark Kitchen)

Si vertical es DARK_KITCHEN:

```
¿Cuántas marcas virtuales operas en esta cocina?
─────────────────────────────────────────

Una "marca virtual" es un nombre de restaurante que el cliente ve en las apps
(Rappi/Uber). Una sola cocina física puede operar múltiples marcas.

📍 Marcas virtuales activas
   [+ Agregar marca]
   Marca 1: [Knock-Out Burger]  color [#red]    logo [opcional]
   Marca 2: [Chick'n Go      ]  color [#yellow] logo [opcional]
   Marca 3: [Camtaritos      ]  color [#orange] logo [opcional]

(Configurarás los productos de cada marca en la Fase 4)

[ ← Atrás ]  [ Continuar → ]
```

### 6.6 Datos persistidos al fin de Fase 2

```sql
-- Sucursal
INSERT INTO sucursales (tenant_id, nombre, direccion, telefono,
  horarios_jsonb, modos_servicio_activos, ...)
VALUES (...);

-- N cajas
INSERT INTO cajas (tenant_id, sucursal_id, nombre, fondo_inicial_mxn, ...)
VALUES (...), (...);

-- Áreas de cocina
INSERT INTO areas_cocina (tenant_id, sucursal_id, nombre, ...)
VALUES (...);

-- Secciones + mesas (si aplica)
INSERT INTO secciones (...);
INSERT INTO mesas (...);

-- Marcas virtuales (si aplica)
INSERT INTO marcas_virtuales (...);
```

---

## 7. Fase 3 — Usuarios y roles

**Quién ejecuta:** DUENO
**Tiempo estimado:** 5-15 minutos según número de empleados
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 4

### 7.1 Paso 3.1: Confirmar tu propio rol

```
Hola Mario, ya estás dado de alta como dueño 👑

Como OWNER del tenant, puedes ver y modificar TODO en tu negocio.

¿Operarás personalmente la caja también? (Es común en negocios pequeños)
( ● ) Sí, también atenderé la caja          → te asignamos rol CAJERO adicional
( ) No, solo administro                    → otros empleados operarán

[ Continuar → ]
```

Si elige "Sí", se le agrega rol CAJERO con `sucursal_id` = sucursal recién creada.

### 7.2 Paso 3.2: Mínimo viable — un cajero

```
Necesitas al menos un usuario que opere la caja.
─────────────────────────────────────────

(Si Mario va a operar la caja, ya está cubierto en el paso anterior. Saltar.)

¿Quieres crear el primer cajero ahora?
( ● ) Sí, voy a invitar a alguien
( ) No, lo haré después

Si "Sí":
📍 Nombre completo
   [Pedro García         ]

📍 Email
   [pedro@knockout.com   ]

📍 Sucursal
   [▼ Knock-Out Centro]

📍 Rol
   [▼ Cajero]

[ Crear y enviar invitación ]
```

Al crear:
- Se inserta en `auth.users` con contraseña temporal
- Se inserta en `usuarios_acceso` (rol + sucursal del empleado)
- Se envía email con magic link
- Aparece en la lista de usuarios con estado "Invitación enviada"

### 7.3 Paso 3.3: Bulk: invitar más empleados

```
¿Quieres invitar a más empleados ahora?
─────────────────────────────────────────

Tu equipo actual:
• Mario Hernández  - OWNER + CAJERO   (activo)
• Pedro García     - CAJERO            (invitación enviada)

[ + Invitar a otro empleado ]

[ Importar lista desde CSV ]
(formato: nombre,email,rol,sucursal)

[ Saltar — agregaré más después → ]

Roles disponibles:
• Cajero - opera el POS, cobra
• Mesero - atiende mesas (Full Service)
• Cocina - marca pedidos como LISTO
• Supervisor - autoriza descuentos, cancelaciones
• Admin de Sucursal - gerente operativo
• Repartidor - delivery propio
• Auditor (solo lectura) - típicamente tu contador
```

### 7.4 Paso 3.4: PIN para autorizaciones

```
Para operaciones sensibles, VIM POS pide un PIN de un supervisor o admin.
─────────────────────────────────────────

Ejemplo: si un cajero quiere aplicar un descuento mayor a $500, el sistema
le pide ingresar el PIN de un Supervisor o de ti.

📍 Tu PIN ya está configurado (lo definiste al activar la cuenta)
   ¿Quieres cambiarlo ahora? [ Cambiar PIN ]

📍 Configuración de seguridad
   Bloquear cuenta después de [▼ 5] intentos fallidos
   Tiempo de bloqueo: [▼ 15 minutos]
   PIN expira cada: [▼ Nunca]
       (Recomendado: cada 90 días para roles supervisor+)

[ Continuar → ]
```

### 7.5 Datos persistidos al fin de Fase 3

```sql
-- Para cada usuario invitado (pseudo-código; nomenclatura canónica 1A §5):
-- 1) supabase.auth.admin.createUser({ email }) → usuario_id
INSERT INTO usuarios_perfil (id, nombre, telefono, estado) VALUES (usuario_id, ...);
INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id, subtipo_personal_id)
  VALUES (usuario_id, tenant_id, sucursal_id, rol_id, subtipo_id);

-- Configuración de seguridad
UPDATE tenants SET configuracion = configuracion || jsonb_build_object(
  'pin_max_intentos', 5,
  'pin_tiempo_bloqueo_min', 15,
  'pin_expiracion_dias', null
) WHERE id = <tenant_id>;
```

---

## 8. Fase 4 — Catálogo

**Quién ejecuta:** DUENO
**Tiempo estimado:** 30-60 minutos según tamaño del menú
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 5

Esta es la fase más larga y la más diferenciada por vertical. El wizard ofrece **3 caminos**:

```
¿Cómo prefieres crear tu menú?
─────────────────────────────────────────

( ● ) Capturar producto por producto (lo más simple para menús pequeños)
( ) Importar desde CSV/Excel (recomendado si tienes 30+ productos)
( ) Empezar desde plantilla [vertical] (te damos un menú base, lo editas)

[ Continuar → ]
```

### 8.1 Paso 4.1A: Captura manual (camino 1)

```
Construyamos tu menú paso a paso.
─────────────────────────────────────────

Primero las categorías (cómo agrupas tu menú):

📍 Categorías sugeridas para QSR:
   ☑ Hamburguesas
   ☑ Acompañamientos
   ☑ Bebidas
   ☑ Postres
   ☐ Combos / Paquetes
   ☐ Especiales

[ + Agregar otra categoría: [______________] ]

[ Continuar a productos → ]
```

Luego, para cada categoría se le pide capturar productos:

```
Categoría: Hamburguesas
─────────────────────────────────────────

📍 Producto 1
   Nombre ⚠️:       [Knock-Out Clásica           ]
   Descripción:     [Hamburguesa con queso, lechuga, jitomate y nuestra salsa especial]
   Precio ⚠️:       [$ 95.00]
   ¿IVA incluido?   [▼ Sí, incluido en el precio] [recomendado]
   Categoría:       [▼ Hamburguesas]
   Área de cocina:  [▼ Cocina]
   Imagen:          [ Subir... ]
   Clave SAT:       [▼ 50211503 - Alimentos preparados] [autocompletado]

   ¿Modos de servicio donde aplica? ☑ Comer aquí ☑ Para llevar
   ¿Está activo?    [▼ Sí, vender]

   [ + Agregar modificadores (extras, sin algo, sustituciones) ]

[ Guardar producto ] [ Guardar y agregar otro ]
```

### 8.2 Paso 4.1B: Modificadores

Si se agregan modificadores al producto:

```
Modificadores para "Knock-Out Clásica"
─────────────────────────────────────────

Plantillas sugeridas para hamburguesa:
( ) "Extras" (agregar cosas, costo adicional)
( ) "Sin algo" (quitar ingredientes, sin costo)
( ) "Punto de cocción" (selección obligatoria, sin costo)
( ) "Tipo de pan" (sustitución, posible costo adicional)

📍 Grupo: Extras
   Tipo: [▼ Múltiples (puede elegir varios)]
   Es obligatorio: [▼ No]

   Opciones:
   • Tocino crujiente        +$15.00
   • Doble queso             +$10.00
   • Aguacate                +$15.00
   • Huevo                   +$12.00
   • Champiñones salteados   +$10.00
   [ + Agregar opción ]

📍 Grupo: Punto de cocción
   Tipo: [▼ Única (debe elegir solo una)]
   Es obligatorio: [▼ Sí, debe elegir]

   Opciones:
   • Bien cocida              +$0
   • Término medio            +$0  [default]
   • Tres cuartos             +$0
   [ + Agregar opción ]

[ Guardar grupo ] [ + Otro grupo ]
```

### 8.3 Paso 4.2: Importar desde CSV (camino 2)

```
Importar menú desde archivo
─────────────────────────────────────────

📥 Descarga la plantilla CSV: [ plantilla_menu_vim_pos.csv ]
   (Llena la plantilla con tu menú y luego súbela)

📤 O sube tu archivo:
   [ Seleccionar archivo... ]
   Formatos: .csv, .xlsx
   Tamaño máx: 5MB

Columnas requeridas:
• categoria (texto)
• nombre_producto (texto)
• precio (número)
• iva_incluido (sí/no)
• descripcion (opcional)
• area_cocina (opcional, default "Cocina")
• modos_servicio (opcional, default todos)

[ ← Atrás ]  [ Subir y validar → ]
```

Tras subir, el sistema:
1. Valida formato
2. Detecta errores: filas con precio negativo, categoría vacía, etc.
3. Muestra preview: "Vamos a crear 47 productos en 6 categorías. ¿Confirmar?"
4. Permite editar errores antes de importar
5. Importa en lote

### 8.4 Paso 4.3: Plantilla por vertical (camino 3)

```
Plantilla para Restaurante de Comida Rápida (QSR)
─────────────────────────────────────────

Te damos un menú base de 25 productos típicos.
Después puedes editar precios, nombres, agregar/quitar productos.

Vista previa:
HAMBURGUESAS:
• Hamburguesa Clásica          $89.00
• Hamburguesa con Tocino       $99.00
• Hamburguesa BBQ              $99.00
...

ACOMPAÑAMIENTOS:
• Papas Fritas (chicas)        $35.00
• Papas Fritas (grandes)       $55.00
• Aros de Cebolla              $45.00
...

BEBIDAS:
• Refresco 355ml               $25.00
• Refresco 600ml               $35.00
• Agua embotellada             $20.00
...

[ ← Atrás ]  [ Importar este menú y personalizar → ]
```

Al confirmar:
- Se importan los productos con precios del template
- El cliente cae en la lista de productos donde puede editar cualquiera
- Después puede agregar más o desactivar lo que no usa

### 8.5 Paso 4.4: Productos por marca virtual (solo DK)

Si el vertical es DARK_KITCHEN:

```
Asignación de productos a marcas virtuales
─────────────────────────────────────────

Has configurado 3 marcas: Knock-Out Burger, Chick'n Go, Camtaritos

Productos creados: 35

Para cada producto, asigna a qué marca(s) pertenece:

Producto: "Hamburguesa Clásica"
☑ Knock-Out Burger
☐ Chick'n Go
☐ Camtaritos

Producto: "Boneless Buffalo"
☐ Knock-Out Burger
☑ Chick'n Go
☐ Camtaritos

...

[ + Acción masiva: asignar todos los seleccionados a... ]
[ Continuar → ]
```

### 8.6 Promociones iniciales (opcional)

```
¿Tienes promociones que aplican siempre?
─────────────────────────────────────────

Ejemplos comunes:
• Lunes 2x1 en Hamburguesas
• Combo Familiar -15%
• Cumpleañeros 20% off (con identificación)

[ + Crear promoción ] [ Saltar — agregaré después ]

(Puedes crear promociones temporales después también)
```

### 8.7 Validaciones de Fase 4

**Bloqueantes:**
- 🛑 Al menos 1 categoría creada
- 🛑 Al menos 1 producto activo
- 🛑 Todo producto debe tener precio > 0
- 🛑 Todo producto debe tener área de cocina asignada (default "Cocina" si solo hay una)

**Advertencias:**
- ⚠️ Producto sin imagen (recomendamos agregarla)
- ⚠️ Producto sin descripción (mejor experiencia con descripción)
- ⚠️ Modificador obligatorio sin opción default (cajero debe seleccionar siempre — ¿es lo deseado?)

---

## 9. Fase 5 — Configuraciones operativas

**Quién ejecuta:** DUENO
**Tiempo estimado:** 5-10 minutos
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 6

### 9.1 Paso 5.1: Métodos de pago aceptados

```
¿Qué métodos de pago aceptas?
─────────────────────────────────────────

☑ Efectivo                  (siempre activado)
☑ Tarjeta de crédito/débito (terminal externa, capturas folio)
☐ Transferencia electrónica (SPEI con captura de referencia)
☐ Mercado Pago link
☐ App: Rappi
☐ App: Uber Eats
☐ App: Didi Food
☐ App: iFood

📍 Para tarjetas, ¿quieres registrar diferencia entre crédito y débito?
   ( ● ) No, es indiferente (más simple)
   ( ) Sí, separarlos en reportes

[ Continuar → ]
```

### 9.2 Paso 5.2: Configuración de propinas

```
Captura de propina al cobrar
─────────────────────────────────────────

Para tu sucursal: Knock-Out Centro

☑ Activar captura de propina al cobrar

📍 Porcentajes sugeridos en pantalla
   [10] [15] [20]                       [ + Agregar ]
   (El cliente elige uno, o ingresa monto libre)

📍 Permitir propina en monto libre  ☑
📍 Permitir "sin propina"            ☑

📍 ¿Cómo se reparten las propinas? (relevante para Full Service y Café & Bar)
   ( ● ) Cada mesero se queda con las propinas de sus mesas (POR_MESA_ATENDIDA)
   ( ) Fondo común: dividir en partes iguales entre meseros del turno
   ( ) Por horas trabajadas (requiere módulo RH, no disponible en MVP)
   ( ) Distribución manual (supervisor decide al final)

📍 ¿Incluir al cajero/bartender en fondo común?
   ☐ Cajero  ☐ Bartender

[ Continuar → ]
```

Para QSR/FoodTruck/DK donde no hay meseros, el wizard salta automáticamente la sección de reparto.

### 9.3 Paso 5.3: Configuración de impresión

```
¿Tienes impresoras térmicas?
─────────────────────────────────────────

VIM POS funciona sin impresoras (puedes mostrar la cuenta en pantalla),
pero si tienes una impresora térmica, podemos imprimir tickets y comandas.

( ● ) Sí, tengo impresora(s)
( ) No, opero todo digital

Si "Sí":
   📍 Para tickets de venta (cliente)
      Impresora: [▼ Conectada vía WebUSB - Epson TM-T20]
      Tamaño: [▼ 80mm (estándar)]
      [ Imprimir prueba ]

   📍 Para comandas de cocina (área "Cocina")
      Impresora: [▼ Misma que tickets / Otra impresora de red]
      Si es otra: IP/Nombre: [192.168.1.50]
      [ Imprimir prueba ]

[ Continuar → ]
```

### 9.4 Paso 5.4: Configuración de tickets

```
¿Cómo se ven tus tickets impresos?
─────────────────────────────────────────

Encabezado del ticket:
☑ Mostrar logo del negocio
☑ Mostrar nombre comercial
☑ Mostrar dirección de la sucursal
☑ Mostrar teléfono
☐ Mostrar RFC del negocio
☐ Mostrar mensaje personalizado:
   [¡Gracias por tu visita! Síguenos en @knockout_burger        ]

Pie del ticket:
☑ "¡Gracias por su compra!"
☐ Mostrar leyenda fiscal específica
☐ Código QR para encuesta de satisfacción (Fase 2)

[ Vista previa ] [ Continuar → ]
```

### 9.5 Paso 5.5: Configuración de turnos

```
¿Cómo manejas los turnos?
─────────────────────────────────────────

Un "turno" es el período de operación de una caja.

📍 ¿Quién puede abrir turno?
   ( ● ) Cualquier cajero
   ( ) Solo con autorización de supervisor

📍 ¿Cuántos turnos por día típicamente?
   ( ● ) 1 turno (apertura mañana, cierre noche)
   ( ) 2 turnos (mañana y tarde-noche)
   ( ) 3 turnos (rotación 24/7)

📍 Validar fondo inicial al abrir turno
   ☑ El cajero debe declarar y contar el efectivo inicial (default $500)

📍 Imprimir reporte Z al cerrar turno
   ☑ Automáticamente al cerrar (recomendado)

[ Continuar → ]
```

### 9.6 Datos persistidos al fin de Fase 5

```sql
-- Métodos de pago activos
UPDATE tenants SET configuracion = configuracion || jsonb_build_object(
  'metodos_pago_activos', '["EFECTIVO","TARJETA_CREDITO","TARJETA_DEBITO"]'::jsonb,
  'separar_tarjeta_credito_debito', false
) WHERE id = <tenant_id>;

-- Propinas por sucursal
INSERT INTO sucursal_propinas_config (...) VALUES (...);

-- Configuración de impresión (jsonb en sucursales o tabla aparte)
UPDATE sucursales SET configuracion_impresion = jsonb_build_object(
  'impresora_tickets', '{"tipo":"WEBUSB","modelo":"Epson TM-T20"}',
  'impresora_comanda', '{"tipo":"NETWORK","ip":"192.168.1.50"}',
  'ticket_encabezado_jsonb', {...}
) WHERE id = <sucursal_id>;
```

---

## 10. Fase 6 — Apps externas y delivery

**Quién ejecuta:** DUENO
**Tiempo estimado:** 5-10 minutos
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 7
**Saltable:** ✅ sí, si no usas apps ni tienes delivery propio

### 10.1 Paso 6.1: ¿Operas con apps externas?

```
¿Recibes pedidos de Rappi, Uber Eats, Didi o iFood?
─────────────────────────────────────────

( ) No, no uso apps                                   [ Saltar al siguiente ]
( ● ) Sí, uso una o varias apps

Si "Sí":
☑ Rappi
☑ Uber Eats
☐ Didi Food
☐ iFood

[ Continuar → ]
```

### 10.2 Paso 6.2: Captura de folios de apps

```
Captura de pedidos de apps externas
─────────────────────────────────────────

Cuando llega un pedido por Rappi/Uber, el cajero capturará un folio en VIM POS.

📍 ¿Cómo identificas cada pedido?
   ( ● ) Capturamos el número de orden de la app
         (Ej: "R-A4F92B" para Rappi)
   ( ) No capturamos folio, solo registramos como "venta app"
         (Más rápido pero no se puede conciliar después)

📍 Conciliación de liquidaciones
   ☑ Recibirme reportes para subir CSV de liquidación semanal
      (Te recordamos cada lunes que subas el reporte que te envió la app)

[ Continuar → ]
```

### 10.3 Paso 6.3: Áreas de cocina por marca (solo DK)

Para Dark Kitchen con múltiples marcas:

```
Asignación de áreas de cocina por marca virtual
─────────────────────────────────────────

Cada marca puede operar en una o más áreas de cocina.
Si dejas en blanco, la marca usa todas las áreas disponibles.

Áreas en tu cocina: Plancha, Fría, Postres, Bebidas

Knock-Out Burger:
☑ Plancha
☑ Fría
☑ Bebidas
☐ Postres

Chick'n Go:
☑ Plancha
☑ Fría
☑ Bebidas
☐ Postres

Camtaritos:
☑ Plancha
☑ Postres
☑ Bebidas
☐ Fría

[ Continuar → ]
```

### 10.4 Paso 6.4: Delivery propio

```
¿Tienes repartidores propios (no de apps)?
─────────────────────────────────────────

( ● ) No, solo apps                          [ Saltar ]
( ) Sí, tengo repartidores propios

Si "Sí":
📍 ¿Cuántos repartidores tienes?
   [▼ 1-2 repartidores]
   1-2 repartidores
   3-5 repartidores
   6-10 repartidores
   Más de 10

📍 Tiempo de promesa al cliente (típico)
   [▼ 30 minutos]
   (Se muestra al cliente al confirmar pedido)

📍 ¿Aceptan pago al recibir?
   ☑ Efectivo al recibir
   ☑ Tarjeta al recibir (con terminal móvil)
   ☐ Transferencia previa

📍 Liquidación de repartidores
   ¿Cuándo declaran el efectivo que traen?
   ( ● ) Al regresar a la sucursal (recomendado)
   ( ) Al fin del turno

[ Continuar → ]
```

Los repartidores se invitan en la siguiente sección como usuarios con rol REPARTIDOR.

### 10.5 Paso 6.5: Crear cuentas de repartidores

```
Invitar repartidores
─────────────────────────────────────────

Te ayudamos a crear las cuentas de tus repartidores.

📍 Repartidor 1
   Nombre:    [Juan López                ]
   Email:     [juan@knockout.com         ]
   Teléfono:  [477 555 1234              ]
   Sucursal:  [▼ Knock-Out Centro]

[ + Agregar otro repartidor ]
[ Saltar — los agrego después ]

[ Continuar → ]
```

---

## 11. Fase 7 — Inventario y recetas (opcional)

**Quién ejecuta:** DUENO
**Tiempo estimado:** Variable (puede ser largo si tienen muchos ingredientes)
**Estado al finalizar:** `EN_ONBOARDING`, fase actual = 8
**Saltable:** ✅ sí, recomendado postponer si están abriendo hoy

### 11.1 Paso 7.1: ¿Activar control de inventario?

```
Control de inventario
─────────────────────────────────────────

Con inventario activado, VIM POS lleva el stock de ingredientes y descuenta
automáticamente cuando vendes. Es muy útil pero requiere configurar:
- Tus ingredientes y unidades de medida
- Las recetas (qué ingredientes lleva cada producto)
- Stock inicial al activar

⚠️ Esto puede tomar 1-3 horas adicionales según tamaño de catálogo.

¿Cómo prefieres?
( ● ) Saltar por ahora, lo activo cuando esté listo
       (puedes operar sin inventario y activarlo cuando quieras)
( ) Configurar ahora (recomendado solo si tienes 2+ horas disponibles)
( ) Configurar inventario simple (solo productos terminados, sin recetas)

[ Continuar → ]
```

> **Nota MVP:** este módulo NO es bloqueante para operar. Si lo saltas, el sistema simplemente NO descuenta inventario al vender. Toda la operación POS funciona igual.

### 11.2 Paso 7.2: Inventario simple (camino rápido)

Si elige "Configurar inventario simple":

```
Inventario simple: solo controlar productos terminados
─────────────────────────────────────────

No te pediremos recetas. Cuando vendes 1 hamburguesa, descontamos 1 hamburguesa
del stock. Útil para:
- Productos pre-empaquetados (bebidas, postres comprados)
- Negocios pequeños sin necesidad de costeo detallado

📍 ¿Para qué productos quieres llevar stock?
   ☑ Todas las bebidas (Coca, Pepsi, Aguas, etc.)
   ☐ Hamburguesas (no recomendado — descuenta unidades, no ingredientes)
   ☑ Postres pre-empaquetados
   ...

📍 Stock inicial
   Para cada producto seleccionado:
   • Coca-Cola 355ml:  stock inicial [120]
   • Pepsi 355ml:      stock inicial [80]
   • Agua 500ml:       stock inicial [60]
   ...

[ Continuar → ]
```

### 11.3 Paso 7.3: Inventario completo con recetas

Si elige configurar completo:

```
Inventario con recetas
─────────────────────────────────────────

Vamos a configurar:
1. Ingredientes (con unidades de medida)
2. Recetas (qué ingredientes lleva cada producto)
3. Stock inicial

(Este proceso puede llevar tiempo. Puedes salir y continuar después.)

[ Empezar configuración guiada → ]
```

El flujo guiado:

1. Capturar ingredientes uno por uno (nombre, unidad, costo unitario opcional)
2. Para cada producto, capturar la receta (qué ingredientes y cantidades)
3. Capturar stock inicial de cada ingrediente
4. Validar que todos los productos tengan receta antes de activar

Este flujo es **largo** y se recomienda hacerlo en sesión separada con un asesor de VIM Marketing (Fase 2 — servicio de "Onboarding Pro").

---

## 12. Fase 8 — Pruebas y go-live

**Quién ejecuta:** DUENO
**Tiempo estimado:** 10-15 minutos
**Estado al finalizar:** `PRODUCTIVO` ✅

### 12.1 Paso 8.1: Resumen pre-vuelo

```
🎉 ¡Casi listos! Revisemos todo antes de operar
─────────────────────────────────────────

Tu configuración:

✅ Datos del negocio: Knock-Out Burger
✅ Datos fiscales: RFC HABE850101XXX (CFDI sin configurar — se puede activar después)
✅ 1 sucursal: Knock-Out Centro
✅ 1 caja: Caja Principal (fondo $500)
✅ 1 área de cocina: Cocina
✅ 2 usuarios: Mario (OWNER + CAJERO), Pedro (CAJERO — invitación enviada)
✅ Catálogo: 25 productos en 4 categorías
✅ Métodos de pago: Efectivo + Tarjeta
✅ Propinas: 10%, 15%, 20% sugeridos
✅ Impresora: Epson TM-T20 conectada

⚠️ Pendientes (puedes seguir y configurar después):
  • Facturación CFDI no activada
  • Apps externas: no configuradas
  • Inventario: no activado

[ Modificar algo ]  [ Continuar a pruebas → ]
```

### 12.2 Paso 8.2: Setup mínimo viable confirmado (D79)

Antes de pasar a producción, el sistema verifica el **mínimo viable**:

```sql
-- Validación final antes de marcar onboarding como GO_LIVE
SELECT
  EXISTS (SELECT 1 FROM sucursales WHERE tenant_id = $1 AND activa = true)      AS tiene_sucursal,
  EXISTS (SELECT 1 FROM cajas WHERE tenant_id = $1 AND activa = true)            AS tiene_caja,
  EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
          WHERE ua.tenant_id = $1 AND r.codigo = 'CAJERO' AND ua.activo = true)  AS tiene_cajero,
  EXISTS (SELECT 1 FROM productos WHERE tenant_id = $1 AND activo = true)       AS tiene_producto,
  EXISTS (SELECT 1 FROM categorias WHERE tenant_id = $1 AND activa = true)      AS tiene_categoria
```

Los 5 deben ser `true`. Si falta alguno, el wizard regresa al paso correspondiente.

### 12.3 Paso 8.3: Venta de prueba

```
Hagamos una venta de prueba juntos
─────────────────────────────────────────

Vamos a abrir un turno, abrir un ticket, agregar productos y cobrar.
Este será un ticket de PRUEBA que cancelaremos al final.

Paso 1: Abrir turno
   Caja: [▼ Caja Principal]
   Fondo inicial: [$ 500.00]
   [ Abrir turno ]

Paso 2: Abrir ticket
   ✅ Turno abierto. Ahora abrimos un ticket nuevo.
   Modo de servicio: [▼ Para llevar]
   [ Abrir ticket ]

Paso 3: Agregar productos
   ✅ Ticket abierto (folio K-2026-000001)
   [Botones del menú con productos]

   Carrito actual:
   • Knock-Out Clásica × 1     $95.00
   • Coca-Cola 355ml × 1       $25.00
   ─────────────────────────────
   Subtotal: $120.00
   IVA (16%): incluido
   Total: $120.00

Paso 4: Cobrar
   Método: [▼ Efectivo]
   Cliente paga: [$ 150.00]
   Cambio: $ 30.00
   [ Cobrar ]

Paso 5: Imprimir
   ✅ Pago aplicado. Ticket PAGADO.
   [ Imprimir ticket ] [ Imprimir comanda ]
```

### 12.4 Paso 8.4: Reporte X de prueba

```
Veamos un Reporte X
─────────────────────────────────────────

El Reporte X es la lectura intermedia del turno. Lo puedes consultar
cuantas veces quieras durante el turno.

[ Generar Reporte X ]

Resultado:

📊 Reporte X — Turno T-2026-000001
   Caja Principal • 21 May 2026 14:32

   Ventas:
   • Tickets cobrados: 1
   • Total: $120.00
   • Propinas: $0.00

   Pagos:
   • Efectivo: $120.00

   Efectivo esperado en caja: $620.00 (fondo $500 + ventas $120)

   ✅ Todo se ve coherente
```

### 12.5 Paso 8.5: Cancelar ticket de prueba

```
Limpiar ticket de prueba
─────────────────────────────────────────

Para que no quede una venta de prueba en tus reportes reales, vamos a:
1. Cancelar el ticket de prueba (con devolución total automática)
2. Cerrar el turno
3. Marcar tu tenant como LISTO PARA OPERAR

[ Cancelar ticket de prueba y cerrar turno → ]

✅ Ticket cancelado
✅ Turno cerrado (con Reporte Z generado)
```

### 12.6 Paso 8.6: ¡Felicidades! 🎉

```
¡Tu VIM POS está listo para operar!
═════════════════════════════════════════

🎉 Mario, tu negocio "Knock-Out Burger" ya está listo.

Tu primera venta de prueba:
✅ Abriste turno
✅ Cobraste ticket por $120
✅ Generaste reporte X
✅ Cerraste turno con Z
✅ Sistema funciona end-to-end

Próximos pasos:

1. 🎯 Cobra tu primera venta REAL (ya puedes operar normalmente)

2. ⚙️ Pendientes opcionales que puedes hacer cuando quieras:
   • Activar facturación CFDI (te ayudamos a contratar PAC)
   • Conectar Rappi/Uber/Didi (necesitamos tus credenciales)
   • Activar control de inventario
   • Invitar a más empleados
   • Personalizar más el diseño de tickets

3. 📞 Soporte
   • WhatsApp: +52 477 XXX XXXX
   • Email: soporte@vimpos.mx
   • Documentación: https://docs.vimpos.mx

[ Ir al POS y empezar a operar → ]
[ Configurar lo que falta primero ]
```

### 12.7 Cambio de estado final

```sql
UPDATE tenants
SET estado = 'PRODUCTIVO',
    fase_onboarding_actual = NULL,  -- ya no está en onboarding
    fecha_primer_setup_completo = now(),
    fecha_primera_venta_prueba = (
      SELECT fecha_pago FROM tickets
      WHERE tenant_id = <tenant_id>
        AND estado_fiscal IN ('PAGADO', 'CANCELADO')
      ORDER BY fecha_pago LIMIT 1
    )
WHERE id = <tenant_id>;
```

A partir de aquí, el tenant opera normalmente.

---

## 13. Defaults inteligentes por vertical

Esta sección documenta los **valores precargados** que el wizard sugiere según el vertical del cliente. Estos defaults reducen drásticamente el tiempo de onboarding.

### 13.1 QSR (Restaurante de Comida Rápida)

```yaml
vertical: QSR
ejemplos: McDonald's, Knock-Out Burger, taquerías formales

defaults:
  modos_servicio:
    - PARA_LLEVAR
    - COMER_AQUI
  areas_cocina:
    - Cocina (una sola)
  categorias_menu:
    - Hamburguesas / Platos principales
    - Acompañamientos
    - Bebidas
    - Postres
  hora_cierre_dia_contable: "04:00"
  metodos_pago_defaults:
    - EFECTIVO
    - TARJETA_CREDITO
    - TARJETA_DEBITO
  propinas_defaults:
    capturar: true
    porcentajes: [10, 15, 20]
    metodo_reparto: POR_MESA_ATENDIDA  # aunque no hay meseros, en QSR raramente se reparte
  ticket_promedio_estimado_mxn: 150
  tiempo_objetivo_servicio_min: 5
  setup_minutos_estimado: 60
```

### 13.2 FOODTRUCK

```yaml
vertical: FOODTRUCK
ejemplos: Camtaritos, tacos al pastor en camioneta

defaults:
  modos_servicio:
    - PARA_LLEVAR (único)
  areas_cocina:
    - Cocina (una sola)
  categorias_menu:
    - Especialidad de la casa
    - Bebidas
    - Extras
  hora_cierre_dia_contable: "04:00"
  metodos_pago_defaults:
    - EFECTIVO  # mayoritario
    - TARJETA_CREDITO  # con CLIP/Mercado Pago
    - TRANSFERENCIA  # SPEI cada vez más común
  propinas_defaults:
    capturar: true
    porcentajes: [10, 15]
    metodo_reparto: POR_MESA_ATENDIDA
  cajas_defaults: 1
  usuarios_tipicos:
    - 1 OWNER+CAJERO (el dueño opera)
    - 1-2 personal de cocina
  ticket_promedio_estimado_mxn: 80
  tiempo_objetivo_servicio_min: 3
  setup_minutos_estimado: 30  # más simple
```

### 13.3 FULL_SERVICE

```yaml
vertical: FULL_SERVICE
ejemplos: restaurantes con mesero, salón comedor

defaults:
  modos_servicio:
    - COMER_AQUI (principal)
    - PARA_LLEVAR (secundario)
  areas_cocina:
    - Cocina caliente
    - Cocina fría / Ensaladas
    - Postres
    - Bar
  categorias_menu:
    - Entradas
    - Sopas
    - Platos principales
    - Postres
    - Bebidas
    - Vinos / Cervezas
  hora_cierre_dia_contable: "04:00"
  metodos_pago_defaults:
    - EFECTIVO
    - TARJETA_CREDITO
    - TARJETA_DEBITO
    - TRANSFERENCIA
  propinas_defaults:
    capturar: true
    porcentajes: [10, 15, 20]
    metodo_reparto: POR_MESA_ATENDIDA  # cada mesero su propina
  mesas_recomendadas: 10-30 (depende tamaño)
  secciones_recomendadas:
    - Salón principal
    - Terraza (si aplica)
    - Bar
  usuarios_tipicos:
    - 1 OWNER + ADM_SUCURSAL
    - 1-2 SUPERVISOR (capitanes)
    - 2-3 CAJERO
    - 4-8 MESERO
    - 2-3 COCINA
  ticket_promedio_estimado_mxn: 400
  tiempo_objetivo_servicio_min: 45  # mesa completa
  setup_minutos_estimado: 120  # más datos a configurar
```

### 13.4 CAFE_BAR

```yaml
vertical: CAFE_BAR
ejemplos: cafeterías, bares de copas, lounges

defaults:
  modos_servicio:
    - COMER_AQUI
    - PARA_LLEVAR
  areas_cocina:
    - Barra (café/bebidas)
    - Cocina (snacks, opcional)
  categorias_menu:
    - Café
    - Té e infusiones
    - Bebidas frías
    - Postres y panadería
    - Snacks
    - (Bar) Cocteles
    - (Bar) Cervezas
    - (Bar) Vinos
  hora_cierre_dia_contable: "06:00"  # nocturno
  cuentas_abiertas: true  # típico de bar
  metodos_pago_defaults:
    - EFECTIVO
    - TARJETA_CREDITO
    - TARJETA_DEBITO
  propinas_defaults:
    capturar: true
    porcentajes: [10, 15, 20]
    metodo_reparto: FONDO_COMUN
    incluir_bartender_en_fondo: true
  ticket_promedio_estimado_mxn: 250
  setup_minutos_estimado: 90
```

### 13.5 DARK_KITCHEN

```yaml
vertical: DARK_KITCHEN
ejemplos: cocinerías virtuales, multi-marca en una cocina

defaults:
  modos_servicio:
    - APP_RAPPI
    - APP_UBEREATS
    - APP_DIDI
    - DELIVERY_PROPIO
    # NO COMER_AQUI ni PARA_LLEVAR en mostrador
  areas_cocina:
    - (varía por marca, se configura después)
    - Default: Plancha, Fría, Bebidas, Postres
  marcas_virtuales_recomendado: 2-5
  hora_cierre_dia_contable: "05:00"
  metodos_pago_defaults:
    - APP_RAPPI
    - APP_UBEREATS
    - APP_DIDI
    - EFECTIVO  # delivery propio cobra al recibir
  propinas_defaults:
    capturar: false  # las apps ya capturan propina al checkout
    # Solo aplica si tiene delivery propio
  usuarios_tipicos:
    - 1 OWNER + ADM_SUCURSAL
    - 1 SUPERVISOR
    - 1-2 CAJERO (captura órdenes de apps)
    - 2-4 COCINA
    - 1-3 REPARTIDOR (si tiene delivery propio)
  ticket_promedio_estimado_mxn: 200
  setup_minutos_estimado: 90
```

### 13.6 Plantillas de menú por vertical (sample data)

Paquetes pre-armados que se cargan con un clic en Fase 4.3:

```
templates/
├── qsr_hamburguesas.csv         (25 productos: hamburguesas, papas, bebidas, postres)
├── qsr_tacos.csv                (20 productos: tacos, quesadillas, gringas, refrescos)
├── qsr_pollo.csv                (22 productos: pollo entero, piezas, acompañamientos)
├── foodtruck_general.csv        (15 productos genéricos para foodtruck)
├── full_service_mexicana.csv    (60 productos: típica carta mexicana)
├── full_service_italiana.csv    (50 productos: pizzas, pastas, ensaladas, vinos)
├── cafe_basico.csv              (40 productos: café, té, postres, snacks)
├── bar_cocteles.csv             (35 productos: cocteles clásicos, cervezas, vinos)
└── dark_kitchen_multimarca.csv  (45 productos: hamburguesa + pollo + postres marca)
```

Cada CSV trae:
- Categoría
- Nombre
- Descripción genérica
- Precio sugerido para Bajío (León, GTO — el cliente puede ajustar)
- Clave SAT precalculada
- Área de cocina sugerida

> **Decisión:** los precios son sugerencias del mercado mexicano promedio en mayo 2026. El cliente los ajusta. Esto reduce significativamente el tiempo de Fase 4.

---

## 14. Manejo de errores y recuperación

### 14.1 Estados de error frecuentes

| Error | Causa probable | Recovery |
|---|---|---|
| El email de invitación no llega | Email mal escrito o filtro de spam | OWNER reenvía desde panel de usuarios |
| RFC no válido | Cliente confunde RFC con CURP | Mostrar diferencia con ejemplos, sugerir validar en SAT |
| Logo no se sube | Archivo muy grande o formato no soportado | Validación previa y feedback claro |
| Importación CSV con errores | Columnas mal nombradas, datos faltantes | Preview con errores resaltados antes de importar |
| Impresora de prueba no funciona | Driver del navegador no detecta dispositivo | Documentación específica por modelo + fallback a PDF |
| PAC rechaza datos fiscales | RFC inactivo en SAT, régimen mal | Mostrar mensaje del PAC tal cual, sugerir contactar contador |
| Venta de prueba falla en cobrar | Bug raro de cálculo en producto con modificadores | Capturar stacktrace, mostrar mensaje genérico al usuario, alerta a Fermín |

### 14.2 Estado persistido al cerrar sin completar

Cuando el cliente cierra el navegador a mitad de Fase 4:

```sql
-- tabla pendiente de agregar en migración aditiva 070+
-- (no existía en Partes 1A-1E, se materializa en una migración menor)

tenant_onboarding_estado (
  id uuid PK,
  tenant_id uuid FK UNIQUE,
  fase_actual integer,         -- 1..8
  subpaso_actual varchar,      -- '4.2', '5.3', etc.
  payload_borrador jsonb,      -- snapshot del formulario incompleto
  ultima_actualizacion timestamptz,
  iniciado_at timestamptz,
  completado_at timestamptz NULL
)
```

Al volver a entrar, la lógica de bootstrap detecta el estado y reenruta al cliente al paso correcto:

```typescript
// Pseudocódigo del bootstrap del wizard
async function bootstrap(tenantId: string) {
  const estado = await getOnboardingEstado(tenantId);

  if (!estado) {
    // Primer acceso
    return redirectTo('/wizard/fase-1');
  }

  if (estado.completado_at) {
    return redirectTo('/dashboard');  // tenant ya operando
  }

  // Reanudar exactamente donde quedó
  return redirectTo(`/wizard/fase-${estado.fase_actual}`,
                    { paso: estado.subpaso_actual,
                      borrador: estado.payload_borrador });
}
```

### 14.3 Abandono prolongado

Si un tenant no completa onboarding en:

- **7 días:** email automático de "Hola Mario, ¿necesitas ayuda con tu configuración?"
- **15 días:** email de Fermín ofreciendo sesión 1:1
- **30 días:** alerta interna a Fermín para llamar
- **90 días:** considerar suspender el tenant (con aviso previo)

Métrica clave: tasa de "abandono entre fases" como indicador de qué paso del wizard necesita mejora.

### 14.4 Errores de validación que el wizard sugiere

Cuando una validación bloqueante falla, el mensaje debe ser **específico y accionable**:

❌ Mal: "Error de validación"
✅ Bien: "El RFC HABE850101XX tiene solo 12 caracteres pero parece ser de persona física (debería tener 13). Verifica con tu Constancia de Situación Fiscal o contacta a tu contador."

❌ Mal: "Campo obligatorio"
✅ Bien: "Necesitamos al menos un producto activo antes de continuar. Puedes capturar uno rápido (ej. 'Producto de prueba $0') o importar el menú con la plantilla."

### 14.5 Rollback de tenant fallido

Si un tenant queda "atorado" sin posibilidad de recuperación (raro, pero posible si hubo bug serio):

1. Fermín revisa estado en `tenant_onboarding_estado` y `auditoria_eventos`
2. Decide: reparar manualmente o resetear el onboarding
3. Si resetear: función `resetear_onboarding_tenant(tenant_id)` borra datos creados durante onboarding y vuelve a fase 1 (solo aplicable si NO hubo ventas reales)

> **Política:** un tenant con al menos 1 ticket PAGADO NO se resetea. Si necesita re-empezar, se crea tenant nuevo y se migra lo necesario.

---

## 15. Casos especiales por vertical

### 15.1 Caso: Cliente migrando desde otro POS

Frecuente: el cliente ya operaba con Toast, Square, Aspel, etc., y quiere migrar.

**MVP:** no hay módulo de migración automática. Se gestiona como:

1. El cliente exporta su catálogo desde el POS viejo (CSV o Excel)
2. Llena la plantilla de VIM POS (sección 8.3)
3. Importa
4. Productos importados se revisan manualmente

**Fase 4 (post-MVP):** módulo de migración con conectores específicos.

### 15.2 Caso: Cliente con múltiples sucursales desde el día 1

Aunque el wizard guía con "una sucursal", el cliente puede tener 3-5 sucursales para configurar.

Recomendación al cliente:
- Configura la primera sucursal completamente (Fases 0-5)
- Antes de Fase 8, agrega las demás sucursales (vuelve a Fase 2 con botón "Agregar sucursal")
- Asigna usuarios y cajas a cada una
- Las configuraciones de catálogo se comparten a nivel tenant (no se reconfigura por sucursal)
- Excepción: precios pueden variar por sucursal (Parte 1B §3)

### 15.3 Caso: Cliente sin internet estable

Si el cliente sabe que su sucursal tiene internet inestable:

1. Durante onboarding, idealmente desde lugar con buena conexión (casa, otra oficina)
2. Una vez completo, el cliente NO tendrá problema porque MVP requiere internet
3. **Cuando llegue Fase 2 con Capacitor**, el cliente operará offline con sync automático

> **Nota:** durante el onboarding, si la conexión se cae, se pierden los datos no guardados del paso actual. Por eso el guardado automático en cada paso es crucial.

### 15.4 Caso: Cliente solo opera vía apps externas (no atiende mostrador)

Una dark kitchen pura:

- Vertical: DARK_KITCHEN
- Sucursal: "Cocina Norte" sin dirección visible al público
- Modos de servicio: solo APP_RAPPI, APP_UBEREATS, APP_DIDI
- Caja: 1 caja virtual (la persona que captura pedidos en la pantalla)
- Usuarios típicos:
  - 1 OWNER + ADM
  - 1 CAJERO (que captura órdenes de apps)
  - 2-3 COCINA
  - Sin meseros, sin repartidores

El wizard se adapta y NO le pregunta cosas que no aplican (mesas, propinas con reparto a meseros).

### 15.5 Caso: Cliente con CFDI activado desde el día 1

Algunos clientes ya tienen contador, PAC contratado, y quieren emitir factura desde la primera venta:

- Fase 1.3: ingresan credenciales del PAC
- El sistema valida con timbrado de prueba en sandbox
- Si OK, `tenant.cfdi_activado = true`
- En cada venta, el cajero ve botón "Generar factura" disponible

Si la primera factura real falla (datos del cliente mal capturados, etc.), el cajero recibe error claro y puede reintentar o cobrar sin factura (la factura se puede emitir después).

### 15.6 Caso: Cliente que cambia de vertical

Raro pero posible: "Empecé como foodtruck, ahora abrí restaurante full service".

**MVP:** el vertical NO cambia automáticamente. El cliente puede:
- Agregar nueva sucursal con vertical distinto (cada sucursal puede comportarse diferente)
- Solicitar a soporte cambiar el vertical principal (modifica defaults para futuras configuraciones)
- Los productos creados siguen vigentes en ambos modelos

---

## 16. Checklist de validación

### 16.1 Validaciones operativas (probar con cliente piloto)

- [ ] **VOnB-01** Fermín crea tenant para "Knock-Out Burger" desde panel admin. El dueño Mario recibe email en 30 segundos.
- [ ] **VOnB-02** Mario hace clic en link de activación. Define contraseña y PIN. Entra al wizard.
- [ ] **VOnB-03** Mario completa Fase 1 (datos fiscales) en < 15 min, incluyendo RFC, razón social, régimen 601.
- [ ] **VOnB-04** Mario configura 1 sucursal, 1 caja, 1 área de cocina (default QSR) en < 5 min.
- [ ] **VOnB-05** Mario invita a 1 cajero (Pedro). Pedro recibe email, define password+PIN, aparece como "activo" en la lista.
- [ ] **VOnB-06** Mario captura 5 productos manualmente. Cada uno con categoría, precio, IVA incluido.
- [ ] **VOnB-07** Mario activa modos de pago: efectivo y tarjeta crédito/débito.
- [ ] **VOnB-08** Mario configura propinas: 10%, 15%, 20%.
- [ ] **VOnB-09** Mario salta Fase 6 (no usa apps) y Fase 7 (no activa inventario).
- [ ] **VOnB-10** Mario llega a Fase 8. Sistema valida mínimo viable (sucursal, caja, cajero, categoría, producto) — OK.
- [ ] **VOnB-11** Mario hace venta de prueba: abre turno, abre ticket, agrega 2 productos, cobra en efectivo, recibe cambio. Imprime ticket (o PDF).
- [ ] **VOnB-12** Mario genera reporte X. Ve sus $X de ventas. Coherente.
- [ ] **VOnB-13** Mario cancela ticket de prueba. Cierra turno con Z. Sistema marca tenant como PRODUCTIVO.
- [ ] **VOnB-14** Mario llega al dashboard del POS y puede empezar a operar.

### 16.2 Validaciones de tiempo

- [ ] **VOnB-15** Tiempo total desde recibir email hasta operar: < 90 min para QSR estándar.
- [ ] **VOnB-16** Tiempo total para foodtruck pequeño: < 60 min.
- [ ] **VOnB-17** Tiempo total para full service con 30 productos y 15 mesas: < 3 horas.
- [ ] **VOnB-18** Si el cliente sale a mitad y vuelve al día siguiente, el sistema reanuda exactamente donde quedó.

### 16.3 Validaciones de errores

- [ ] **VOnB-19** Mario captura RFC inválido. El sistema explica qué está mal antes de avanzar.
- [ ] **VOnB-20** Mario intenta avanzar Fase 4 sin productos. El sistema lo regresa y explica que necesita al menos 1.
- [ ] **VOnB-21** Mario sube CSV mal formateado. El sistema muestra errores línea por línea antes de importar.
- [ ] **VOnB-22** Mario intenta crear segundo DUENO sin permisos. El sistema lo rechaza.
- [ ] **VOnB-23** Mario cierra navegador a mitad de Fase 3. Vuelve a entrar. Sistema lo recibe en Fase 3 con datos parciales recuperados.

### 16.4 Validaciones de defaults

- [ ] **VOnB-24** Cliente declara vertical=QSR. Sistema sugiere PARA_LLEVAR y COMER_AQUI por default.
- [ ] **VOnB-25** Cliente declara vertical=DARK_KITCHEN. Sistema sugiere APP_RAPPI, APP_UBEREATS, APP_DIDI por default.
- [ ] **VOnB-26** Cliente importa plantilla "qsr_hamburguesas.csv". Se crean 25 productos con precios sugeridos.
- [ ] **VOnB-27** Cliente declara vertical=CAFE_BAR. Sistema sugiere día contable cierra 6 AM (no 4 AM).

### 16.5 Validaciones técnicas

- [ ] **VOnB-28** Estado `tenant_onboarding_estado` se actualiza en cada save.
- [ ] **VOnB-29** Al completar Fase 8, estado del tenant pasa de EN_ONBOARDING a PRODUCTIVO.
- [ ] **VOnB-30** Auditoría registra cada paso completado: `onboarding.fase_X.completada`.
- [ ] **VOnB-31** Sample data importado tiene IDs y secuencias correctas (no entra en conflicto con productos custom).

### 16.6 Cosas que esta documentación deja para después

- ❌ Wireframes visuales de cada pantalla del wizard (08-WIREFRAMES)
- ❌ Módulo de migración desde Toast/Square/Aspel (Fase 4)
- ❌ Capacitación visual del personal del cliente (videos tutoriales, Fase 3)
- ❌ Servicio premium "Onboarding Pro" con asesor humano (Fase 2)
- ❌ Wizard de re-onboarding cuando un cliente migra a otra vertical (caso 15.6)
- ❌ Importación incremental de catálogo (Fase 2; en MVP, importar reemplaza)
- ❌ Integración directa con CRMs del cliente (Mailchimp, HubSpot — Fase 5)

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. 9 decisiones nuevas (D76-D84). 8 fases de onboarding documentadas paso a paso (Fase 0 creación tenant por Fermín, Fase 1 datos fiscales, Fase 2 estructura organizacional, Fase 3 usuarios y roles, Fase 4 catálogo con 3 caminos: manual/CSV/plantilla, Fase 5 configuraciones operativas, Fase 6 apps externas y delivery — opcional, Fase 7 inventario y recetas — opcional, Fase 8 pruebas y go-live). Defaults inteligentes pre-aprobados por los 5 verticales (QSR, FOODTRUCK, FULL_SERVICE, CAFE_BAR, DARK_KITCHEN). Sample data en 9 plantillas CSV. Manejo de errores y recovery automático con `tenant_onboarding_estado` para guardado entre fases. 6 casos especiales documentados (migración desde otro POS, múltiples sucursales día 1, internet inestable, solo apps externas, CFDI desde día 1, cambio de vertical). 31 validaciones (VOnB-01 a VOnB-31) cubriendo flujo operativo, tiempos objetivo, manejo de errores, defaults por vertical, técnicas. Objetivos: <30 min setup mínimo, <90 min hasta primera venta, <4 horas setup completo. Anti-métrica: si el cliente llama a Fermín 3+ veces por dudas de configuración, el wizard falló. |

---

**Fin del documento 10 — Setup Inicial.**

Con esto se cierra la **especificación completa del MVP de VIM POS**:

- **Documentos de arquitectura técnica** (07-1A a 07-1E): 16,637 líneas de SQL ejecutable
- **Documento de roles y permisos** (09): 1,528 líneas operativas
- **Documento de setup inicial** (10): 1,700+ líneas de flujo de onboarding

Total acumulado: ~20,000 líneas de especificación entre arquitectura técnica y procedimientos operativos.

**Lo único pendiente antes de empezar desarrollo es 08-WIREFRAMES** (diseño visual), que puede ser un trabajo paralelo a las primeras pantallas del MVP. El desarrollador puede empezar a construir las migraciones SQL y la primera pantalla del POS con todo lo que ya está documentado.
