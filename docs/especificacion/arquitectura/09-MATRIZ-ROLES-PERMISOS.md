# 09 — MATRIZ DE ROLES Y PERMISOS — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** noveno en la serie de arquitectura de VIM POS — primero **no técnico** (no es SQL)
> **Alcance:** qué roles existen, qué puede hacer cada uno, qué requiere autorización superior, cómo se configura por tenant
> **Audiencia:** Fermín + onboarding de cada nuevo cliente piloto (Knock-Out Burger, Chick'n Go, Camtaritos)
> **Depende de:** Partes 1A-1E de la arquitectura técnica (todas)
> **Continúa en:** 10-SETUP-INICIAL (wizard de onboarding del primer tenant)

---

## 📋 Tabla de contenidos

- [0. Introducción y propósito](#0-introducción-y-propósito)
- [1. Filosofía de los permisos en VIM POS](#1-filosofía-de-los-permisos-en-vim-pos)
- [2. Convenciones](#2-convenciones)
- [3. Catálogo de roles](#3-catálogo-de-roles)
- [4. Matriz de permisos por flujo](#4-matriz-de-permisos-por-flujo)
- [5. PINs de autorización](#5-pins-de-autorización)
- [6. Configuración multi-sucursal](#6-configuración-multi-sucursal)
- [7. Roles personalizables (override por tenant)](#7-roles-personalizables-override-por-tenant)
- [8. Implementación técnica](#8-implementación-técnica)
- [9. Mapeo a funciones SQL específicas](#9-mapeo-a-funciones-sql-específicas)
- [10. Onboarding de un nuevo usuario](#10-onboarding-de-un-nuevo-usuario)
- [11. Auditoría y revocación](#11-auditoría-y-revocación)
- [12. Casos especiales y excepciones](#12-casos-especiales-y-excepciones)
- [13. Checklist de validación](#13-checklist-de-validación)

---

## 0. Introducción y propósito

### 0.1 Por qué este documento existe

Antes de escribir código de UI o configurar un cliente real, necesitamos respuestas inequívocas a:

- ¿Puede un cajero cancelar un ticket pagado solo? No.
- ¿Puede un mesero ver el reporte Z del día? No.
- ¿Puede un supervisor de la sucursal A autorizar un descuento en la sucursal B? No.
- ¿Puede el dueño del restaurante ver datos de otros restaurantes? Jamás (RLS).
- ¿Puede un repartidor abrir un ticket nuevo? No, solo recibe asignaciones.
- ¿Puede un auditor externo (contador) modificar algo? Nunca.

Sin matriz clara, el código de la UI termina con `if (usuario.rol === 'admin' || usuario.rol === 'supervisor' || ...) { ... }` mal pegado en 40 lugares. Y peor: el cliente se sorprende cuando algo funciona o no funciona.

**Este documento es la fuente de verdad operativa.** Cualquier ambigüedad se resuelve aquí, no en el código.

### 0.2 Alcance

**Este documento define:**

- ✅ Los 9 roles canónicos del sistema VIM POS
- ✅ Matriz completa rol × flujo: qué puede hacer cada uno en cada operación
- ✅ Catálogo de PINs de autorización: quién puede autorizar qué
- ✅ Configuración de scope (alcance) por sucursal
- ✅ Cómo se materializa en tablas (`usuarios_acceso`, `usuarios_acceso_roles`, `autorizaciones_pin`)
- ✅ Mapeo de permisos a las ~100 funciones SQL de las Partes 1A-1E
- ✅ Procedimiento de onboarding de nuevo usuario (con o sin PIN)
- ✅ Procedimiento de revocación y auditoría
- ✅ Casos especiales: usuarios con múltiples roles, cambios de rol, vacaciones, despidos

**Este documento NO define:**

- ❌ La UI de gestión de usuarios (eso va en 08-WIREFRAMES)
- ❌ El flujo completo de onboarding del tenant (eso va en 10-SETUP-INICIAL)
- ❌ Esquemas SQL nuevos (todo se construyó en Partes 1A-1E)
- ❌ Reglas fiscales/legales mexicanas (responsabilidad del cliente/contador)
- ❌ Políticas de RR.HH. (vacaciones pagadas, días libres, etc.)

### 0.3 Cómo leer este documento

- **Fermín** lo lee de principio a fin la primera vez, después usa §4 (matriz) y §5 (PINs) como referencia rápida.
- **El desarrollador frontend** lo usa para implementar `<RoleGuard>` y `<RequirePIN>` componentes.
- **El nuevo cliente piloto** (dueño del restaurante) lee §3 (qué roles existen) y §6 (sucursales) en sesión de onboarding.
- **El nuevo cajero** no lee este documento — solo recibe las llaves que su admin le configura.

### 0.4 Decisiones cerradas que este documento declara

Continuación de la cronología D1-D66 de las Partes 1A-1E. Estas decisiones son operativas, no técnicas, pero se materializan en la BD.

| # | Decisión | Materialización |
|---|---|---|
| **D67** | 9 roles canónicos del sistema, NO se permite crear roles nuevos | §3 — catálogo cerrado |
| **D68** | Roles tienen "scope" (alcance): TENANT_COMPLETO, SUCURSAL_ASIGNADA, MULTI_SUCURSAL_ASIGNADAS | §6 — configuración de scope |
| **D69** | PINs de autorización son por evento, NO por usuario | §5 — todos los eventos requieren PIN nuevo cada vez |
| **D70** | Un usuario puede tener N roles simultáneos (puente N:N en `usuarios_acceso_roles`) | §7 — multi-rol soportado |
| **D71** | Tenant puede override matriz de permisos solo de forma **restrictiva** (quitar permisos), nunca aditiva | §7 — restricciones extra OK, ampliaciones NO |
| **D72** | Roles del sistema NO se modifican, pero hay un rol "PERSONALIZADO" para casos donde se necesita combinación específica | §7 — escape hatch controlado |
| **D73** | El SUPER_ADMIN solo existe a nivel de plataforma (Fermín + equipo VIM Marketing), nunca asignable por tenant | §3.1 — separación clara |
| **D74** | Revocación de rol invalida sesiones activas inmediatamente | §11 — flujo de logout forzado |
| **D75** | Auditoría obligatoria de cambios de rol (todo CRUD sobre `usuarios_acceso_roles` se registra) | §11 — eventos en `auditoria_eventos` |

---

## 1. Filosofía de los permisos en VIM POS

### 1.1 Tres niveles de control superpuestos

Cada operación que un usuario intenta hacer pasa por tres filtros:

```
1. RLS (Row Level Security) → ¿pertenece este dato a tu tenant?
2. Rol → ¿tu rol permite esta operación?
3. PIN (solo eventos sensibles) → ¿tienes autorización superior aquí y ahora?
```

Si cualquiera de los tres falla, la operación se bloquea. Los tres son independientes y se aplican en orden:

- **RLS** se aplica a nivel de PostgreSQL automáticamente. El usuario no puede saltarlo.
- **Rol** se aplica en la capa de aplicación (Next.js) antes de invocar funciones SQL. Si el rol no permite, el botón ni siquiera aparece. Y si por bug aparece, el endpoint lo rechaza.
- **PIN** se aplica en operaciones específicas (cancelar pagado, descuento manual, reimpresión, transferir mesa con motivo): el usuario ejecuta normalmente, la app pide PIN antes de ejecutar la operación destructiva/sensible.

### 1.2 Principio de mínimo privilegio

Cada rol tiene el mínimo conjunto de permisos para hacer su trabajo. **No se acumulan privilegios "por si acaso"**:

- Un cajero NO puede ver el reporte Z. Aunque sea curioso, no es su trabajo.
- Un mesero NO ve la configuración de productos. No la necesita.
- Un repartidor NO ve los reportes financieros. Tampoco.

El dueño SIEMPRE puede ver todo de su tenant, pero **no opera el POS por default** — si quiere usar la caja, se le asigna además el rol CAJERO (multi-rol, §7).

### 1.3 PIN ≠ rol

Una confusión común: pensar que "tener PIN de supervisor" equivale al rol SUPERVISOR. **No es así.**

El **rol** define qué pantallas y operaciones ve el usuario normalmente.
El **PIN** es una autorización puntual que un rol superior da al rol que está operando.

Ejemplo: el cajero quiere cancelar un ticket pagado. El cajero NO puede cancelar tickets pagados (rol no lo permite). El cajero llama al supervisor. El supervisor ingresa SU PIN en la pantalla del cajero. El sistema valida que ese PIN pertenezca a un usuario con rol SUPERVISOR o superior, registra el evento de autorización, y permite que la cancelación se ejecute. **La cancelación queda registrada como ejecutada por el cajero, autorizada por el supervisor.**

Esto es importante porque:

- El cajero NO usa la cuenta del supervisor (no se da sesión completa, solo autorización puntual)
- El evento queda con doble atribución (quién ejecutó + quién autorizó)
- Si el cajero abusa pidiendo PIN del supervisor 50 veces al día, el reporte de auditoría lo expone

### 1.4 Roles fijos, pero scope flexible

D67: los **roles** son fijos (no se pueden inventar nuevos). Esto evita el caos de "rol_cajero_v2" o "supervisor_extendido" que existe en otros POS.

Pero el **scope** (alcance) es flexible:

- Un supervisor puede ser de UNA sucursal (lo más común)
- Un supervisor puede ser de VARIAS sucursales (cadena con supervisor regional)
- Un admin puede ser de TODO EL TENANT (dueño operativo)

Esto permite cubrir prácticamente todas las estructuras organizacionales sin inflar el catálogo de roles.

### 1.5 Restrictividad, no aditividad (D71)

Un tenant puede customizar la matriz, pero solo de forma **restrictiva**:

- ✅ "En mi tenant, los meseros NO pueden ver el monto total del ticket" → se permite (quitar un permiso default)
- ❌ "En mi tenant, los cajeros SÍ pueden cancelar tickets pagados sin PIN" → NO se permite (sería aditivo y peligroso)

La razón: las restricciones son seguras (siempre se puede hacer menos). Las ampliaciones son peligrosas (un tenant podría debilitar controles antifraude).

### 1.6 Auditoría sobre todo

Todo cambio de rol, toda asignación, toda revocación, toda autorización de PIN, queda en `auditoria_eventos`. Si mañana alguien pregunta "¿cómo es que Juan canceló un ticket de $5000?", el log responde.

---

## 2. Convenciones

- **Roles** en MAYÚSCULAS con guión bajo (ej. `SUPER_ADMIN`, `OWNER_TENANT`).
- **Permisos** descritos en infinitivo: "Crear ticket", "Aplicar descuento manual", "Generar reporte Z".
- **Scope** con tres valores: `TENANT_COMPLETO`, `SUCURSAL_ASIGNADA`, `MULTI_SUCURSAL_ASIGNADAS`.
- **Niveles de jerarquía** numerados del 1 (mínimo) al 9 (máximo) para comparaciones rápidas.
- En matrices: ✅ permitido, ❌ prohibido, 🔐 requiere PIN, 👁️ solo lectura, ⚙️ requiere configuración explícita del admin del tenant.

---

## 3. Catálogo de roles

### 3.1 Vista general

| # | Rol | Nivel | Scope típico | ¿Quién es? |
|---|---|---|---|---|
| 1 | `SUPER_ADMIN` | 9 | Plataforma | Fermín + equipo VIM Marketing (D73) |
| 2 | `OWNER_TENANT` | 8 | TENANT_COMPLETO | Dueño del restaurante |
| 3 | `ADMIN_SUCURSAL` | 7 | SUCURSAL_ASIGNADA o MULTI | Gerente operativo de sucursal |
| 4 | `SUPERVISOR` | 6 | SUCURSAL_ASIGNADA | Jefe de turno, capitán de meseros |
| 5 | `CAJERO` | 5 | SUCURSAL_ASIGNADA | Persona en la caja |
| 6 | `MESERO` | 4 | SUCURSAL_ASIGNADA | Toma órdenes (Full Service) |
| 7 | `COCINA` | 3 | SUCURSAL_ASIGNADA | Operario de cocina (marca LISTO) |
| 8 | `REPARTIDOR` | 2 | SUCURSAL_ASIGNADA | Delivery propio |
| 9 | `AUDITOR_LECTOR` | 1 | TENANT_COMPLETO | Contador externo, asesor fiscal |

**Total: 9 roles.** Catálogo cerrado (D67). Hay además un comodín `PERSONALIZADO` (§7.3) para casos especiales que el OWNER_TENANT puede configurar manualmente, pero NO crea un rol nuevo: usa la infraestructura existente con permisos custom.

### 3.2 Detalle por rol

#### SUPER_ADMIN (Nivel 9)

**Quién:** Fermín y el equipo de VIM Marketing/soporte técnico.

**Scope:** Plataforma — TODOS los tenants. Ignora RLS (D73).

**Qué puede hacer:**

- Acceso a la consola de Anthropic/Supabase con service_role key
- Crear, suspender, eliminar tenants
- Acceder a datos de cualquier tenant para soporte técnico (con auditoría reforzada)
- Modificar el catálogo de productos SAT global
- Modificar plantillas de email, configuración de PACs
- Ejecutar migraciones de BD
- NO opera el POS directamente — si necesita probar, crea su propio tenant de prueba

**Cómo se autentica:** Cuenta interna de Anthropic SSO + 2FA obligatoria + IP allowlist para producción.

**No existe en `usuarios_acceso`:** este rol vive a nivel de plataforma, no a nivel de tenant. Sus acciones se registran en una tabla separada `super_admin_accesos` (Fase 2, MVP solo usa logs de Supabase).

#### OWNER_TENANT (Nivel 8)

**Quién:** El dueño del restaurante. Una sola persona por tenant (puede haber co-dueños = múltiples usuarios con este rol).

**Scope:** TENANT_COMPLETO. Ve todo lo de su tenant, no ve lo de otros tenants.

**Qué puede hacer:**

- Crear/editar/inactivar sucursales
- Crear/editar/inactivar cajas
- Crear/editar/inactivar usuarios y asignarles roles
- Configurar todo: catálogo de productos, categorías, modificadores, promociones, marcas virtuales
- Configurar áreas de cocina, impresoras
- Configurar propinas y métodos de reparto por sucursal
- Configurar facturación (PAC, certificados, RFC)
- Ver todos los reportes (X, Z, estado de resultados, ventas por dimensión)
- Generar Z (con PIN propio, autoriza a sí mismo)
- Cancelar tickets pagados (con PIN propio)
- Aprobar/rechazar conflictos de sync
- Resolver problemas: ajustes manuales de inventario, conciliación apps
- **NO opera el POS por default**: para operar, requiere también rol CAJERO (multi-rol D70)

**Recibe del setup inicial:** una invitación por email cuando el SUPER_ADMIN crea el tenant.

#### ADMIN_SUCURSAL (Nivel 7)

**Quién:** Gerente operativo, encargado de una sucursal (o un grupo de ellas en cadenas medianas).

**Scope:** SUCURSAL_ASIGNADA (default) o MULTI_SUCURSAL_ASIGNADAS para gerentes regionales.

**Qué puede hacer (en sus sucursales asignadas):**

- Crear/editar/inactivar usuarios de su(s) sucursal(es) — EXCEPTO otros ADMIN_SUCURSAL u OWNER_TENANT
- Configurar áreas de cocina y mesas/secciones
- Modificar precios de productos por modo de servicio (no la receta base)
- Activar/desactivar promociones existentes (no crear nuevas — eso es OWNER)
- Ver TODOS los reportes de su sucursal (X, Z, ventas, tiempos)
- Generar reporte Z (con PIN propio)
- Cancelar tickets pagados (con PIN propio)
- Autorizar descuentos manuales mayores al límite del supervisor
- Resolver conflictos de sync de su sucursal
- Ver inventario y hacer ajustes (con auditoría)
- Ver auditoría de su sucursal
- NO ve datos de otras sucursales (a menos que tenga MULTI scope)
- NO modifica configuración global del tenant (productos del catálogo maestro, PAC fiscal)

#### SUPERVISOR (Nivel 6)

**Quién:** Jefe de turno, capitán de meseros, encargado del piso.

**Scope:** SUCURSAL_ASIGNADA. Casi siempre una sola.

**Qué puede hacer:**

- Operar el POS como cajero (incluye permisos de CAJERO)
- Autorizar descuentos manuales (PIN) hasta el límite configurado del tenant (default: $500)
- Autorizar cancelaciones de items en cocina (PIN)
- Autorizar reimpresiones de comanda (PIN)
- Autorizar transferencias de mesa (PIN)
- Autorizar ediciones de items en tickets abiertos
- Cerrar turno y generar reporte Z (con PIN propio)
- Realizar arqueo de caja (corte) intermedio o final
- Ver reportes X de su sucursal
- Ver KPIs del día de su sucursal
- Asignar repartidores a tickets de delivery
- Resolver conflictos de sync menores
- NO crea usuarios (responsabilidad del ADMIN_SUCURSAL)
- NO cancela tickets pagados (requiere ADMIN_SUCURSAL u OWNER)

#### CAJERO (Nivel 5)

**Quién:** La persona detrás de la caja. La que cobra.

**Scope:** SUCURSAL_ASIGNADA. Y dentro de la sucursal, asignado a una CAJA específica al iniciar turno.

**Qué puede hacer:**

- Abrir turno (con PIN propio si lo requiere la sucursal — depende de config)
- Abrir tickets nuevos
- Agregar items a tickets propios o en su caja
- Aplicar modificadores
- Aplicar pagos (efectivo, tarjeta, transferencia, apps externas)
- Capturar propinas
- Cancelar items PRE-cocina (sin PIN)
- Aplicar descuentos manuales (CON PIN de SUPERVISOR o superior)
- Solicitar autorización para reimprimir comanda
- Hacer movimientos de caja (inyección, retiro con PIN)
- Realizar corte de caja (arqueo)
- Cerrar turno (con autorización de SUPERVISOR si es cierre de día)
- Ver reporte X de su turno
- Imprimir tickets de cocina
- Solicitar timbrado de CFDI (la operación la dispara, el PAC se llama desde server)
- NO ve reportes Z ni de otros turnos
- NO ve ventas de otras cajas
- NO modifica productos ni catálogo
- NO cancela tickets pagados (autorización requerida)

#### MESERO (Nivel 4)

**Quién:** El que toma órdenes y atiende mesas en Full Service.

**Scope:** SUCURSAL_ASIGNADA.

**Qué puede hacer:**

- Abrir tickets asociados a su nombre (`mesero_id = self`)
- Asignar mesas a sus tickets
- Agregar items a sus tickets
- Aplicar modificadores
- Marcar pedido como ENTREGADO al cliente (cocina ya lo marcó LISTO)
- Ver el estado de sus mesas y sus tickets
- Ver propinas que le tocan al cierre del turno (su `propinas_distribucion`)
- Transferir mesa (con PIN de SUPERVISOR)
- Solicitar cancelación de item con autorización
- NO cobra (eso es responsabilidad del CAJERO)
- NO ve totales de la sucursal
- NO ve tickets de otros meseros (a menos que sea un release del SUPERVISOR de la sucursal)
- NO modifica catálogo

> **Nota:** en sucursales pequeñas o foodtrucks, una sola persona puede ser CAJERO + MESERO (multi-rol). En cadenas grandes, los roles están claramente separados.

#### COCINA (Nivel 3)

**Quién:** Operario(s) de cocina. Específicamente quien marca pedidos como LISTO. NO es el cocinero que prepara — es la persona que decide "este pedido ya está listo para que mesero lo entregue".

**Scope:** SUCURSAL_ASIGNADA.

**Qué puede hacer:**

- Ver pedidos pendientes de cocina (estado `SIN_ENVIAR → EN_COCINA → LISTO`)
- Marcar pedidos como `EN_COCINA` (cuando empieza preparación)
- Marcar pedidos como `LISTO` (cuando está terminado)
- Ver comandas impresas / pantalla de cocina
- Solicitar reimpresión de comanda (con PIN de SUPERVISOR si ya se imprimió)
- Ver tiempo transcurrido desde el envío del pedido
- NO cancela items
- NO ve precios ni totales
- NO ve datos financieros
- NO opera el POS

> **Fase 2 (KDS):** este rol cobra más relevancia cuando se introduce pantalla de cocina (Kitchen Display System). En MVP, este rol existe principalmente para operaciones donde la cocina marca pedidos desde un dispositivo separado al POS del cajero. Si no existe esa separación, el CAJERO marca pedidos como LISTO también.

#### REPARTIDOR (Nivel 2)

**Quién:** El repartidor del delivery propio del restaurante.

**Scope:** SUCURSAL_ASIGNADA.

**Qué puede hacer:**

- Ver sus asignaciones de delivery activas (donde `repartidor_id = self`)
- Marcar salida de sucursal (estado `ASIGNADO → EN_RUTA`)
- Marcar llegada al destino (opcional, `EN_RUTA → EN_DESTINO`)
- Confirmar entrega exitosa (`EN_DESTINO → ENTREGADO` o `EN_RUTA → ENTREGADO`)
- Registrar no-entrega con motivo (`EN_RUTA → NO_ENTREGADO`)
- Capturar propina del cliente al recibir
- Ver dirección y datos del cliente para la entrega
- Liquidar al regresar: declarar efectivo y comprobantes (entrega a SUPERVISOR/CAJERO)
- NO abre tickets
- NO modifica items ni precios
- NO ve reportes
- NO autoriza nada

#### AUDITOR_LECTOR (Nivel 1)

**Quién:** Contador externo, asesor fiscal, persona que solo viene a revisar números.

**Scope:** TENANT_COMPLETO, pero solo lectura.

**Qué puede hacer:**

- Ver reportes consolidados (estado de resultados, ventas por dimensión)
- Ver auditoría de eventos
- Ver CFDIs emitidos y cancelados
- Descargar XMLs de CFDI
- Ver propinas distribuidas
- Ver cortes de caja
- NO modifica absolutamente nada
- NO ve PINs ni contraseñas
- NO opera el POS

**Por qué existe:** los contadores siempre han pedido "denme acceso al sistema" y han recibido la cuenta del dueño. Eso es un riesgo. Mejor crear un rol limitado para ellos.

### 3.3 Jerarquía y herencia (importante)

VIM POS **NO usa herencia de roles** (un SUPERVISOR no automáticamente "tiene también todos los permisos del CAJERO"). En su lugar:

- Si un SUPERVISOR necesita operar el POS, se le asigna **además** el rol CAJERO (multi-rol, D70)
- Si un ADMIN_SUCURSAL necesita atender mesas en una emergencia, se le asigna además MESERO

Esto es más explícito y auditable. Si en el log dice "Juan operó como SUPERVISOR + CAJERO", queda claro. Si fuera por herencia, no se sabría si Juan realmente está cobrando o si es un bug.

**Excepción única:** el OWNER_TENANT en la práctica tiene acceso TOTAL a su tenant (es su negocio). En código, esto se resuelve con una validación especial en cada función: si el usuario tiene rol OWNER_TENANT, salta otras validaciones de rol (sigue respetando RLS y validaciones de datos, pero no rol). El log siempre registra "ejecutado por OWNER_TENANT".

---

## 4. Matriz de permisos por flujo

Las matrices están agrupadas por área operativa. Convenciones:

- ✅ Permitido directamente
- ❌ Prohibido (rol no lo permite)
- 🔐 Permitido CON autorización por PIN (otro rol superior)
- 👁️ Solo lectura
- ⚙️ Configurable por el OWNER_TENANT (default es restrictivo, puede activar)

Las columnas usan abreviaturas:
- **SUP** = SUPER_ADMIN
- **OWN** = OWNER_TENANT
- **ADM** = ADMIN_SUCURSAL
- **SPV** = SUPERVISOR
- **CAJ** = CAJERO
- **MES** = MESERO
- **COC** = COCINA
- **REP** = REPARTIDOR
- **AUD** = AUDITOR_LECTOR

### 4.1 Operación del POS (ventas)

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Abrir ticket nuevo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Agregar items a ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aplicar modificadores | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancelar item pre-cocina | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancelar item en cocina | ✅ | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ |
| Aplicar descuento manual (hasta $500) | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Aplicar descuento manual ($500+) | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Aplicar cortesía total | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Override de precio (item) | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Aplicar promoción automática | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancelar promoción aplicada | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Aplicar pago (efectivo/tarjeta/etc) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pago dividido (múltiples métodos) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Poner ticket en espera | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Retomar ticket en espera | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver tickets propios (del turno) | 👁️ | 👁️ | 👁️ | ✅ | ✅ | ✅ | ❌ | 👁️* | ❌ |
| Ver tickets de otros (mismo turno) | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ⚙️ | ❌ | ❌ | ❌ |
| Ver tickets de turnos anteriores | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |

\* REPARTIDOR solo ve los tickets que tiene asignados, no la lista completa.

### 4.2 Post-venta (devoluciones, cancelaciones, CFDI)

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Cancelar ticket ABIERTO sin pago | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Cancelar ticket PAGADO (con devolución) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cancelar ticket FACTURADO | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear devolución parcial | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Crear devolución total | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Confirmar devolución (irrevocable) | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Devolución con reverso de inventario | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Solicitar emisión CFDI | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Solicitar cancelación CFDI ante SAT | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Generar nota de crédito CFDI | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Ver CFDIs emitidos | 👁️ | 👁️ | 👁️ | 👁️ | 👁️* | ❌ | ❌ | ❌ | 👁️ |
| Descargar XML/PDF de CFDI | ✅ | ✅ | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ✅ |
| Ver bitácora CFDI/SAT | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |

\* CAJERO solo ve CFDIs que él generó o que pertenecen a su sucursal.

### 4.3 Cocina y comanda

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Imprimir comanda inicial (al confirmar items) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reimprimir comanda | ✅ | ✅ | ✅ | ✅ | 🔐 | 🔐 | 🔐 | ❌ | ❌ |
| Marcar pedido `EN_COCINA` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Marcar pedido `LISTO` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Marcar pedido `ENTREGADO` (Full Service) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reversar estado de cocina (LISTO→EN_COCINA) | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | 🔐 | ❌ | ❌ |
| Ver tiempos de cocina por ticket | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ | ❌ | 👁️ |
| Ver áreas de cocina activas | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ |

### 4.4 Delivery y apps externas

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Crear ticket DELIVERY_PROPIO | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Asignar repartidor a ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reasignar repartidor (cambio) | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Confirmar salida del repartidor | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Confirmar entrega delivery | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Registrar no-entrega con motivo | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Liquidar delivery (entrega de efectivo) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver mis asignaciones de delivery | n/a | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ✅ | 👁️ |
| Ver asignaciones de otros repartidores | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | 👁️ |
| Crear ticket APP_EXTERNA (Rappi/Uber/etc) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Capturar folio externo de app | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Subir CSV de liquidación de app | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Conciliar liquidación con tickets POS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver diferencias de conciliación | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |

### 4.5 Mesas, cuentas, reservaciones

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Asignar mesa a ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Juntar mesas (mesa secundaria) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Transferir mesa | ✅ | ✅ | ✅ | ✅ | 🔐 | 🔐 | ❌ | ❌ | ❌ |
| Cambiar mesa a EN_LIMPIEZA / FUERA_SERVICIO | ✅ | ✅ | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ | ❌ |
| Crear sección / mesa nueva | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Abrir cuenta (Café & Bar) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cerrar cuenta (cobrar) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Split de cuenta entre N personas | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Crear reservación | ✅ | ✅ | ✅ | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ |
| Confirmar llegada de reservación | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancelar reservación | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Marcar NO_SHOW | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver mapa de mesas | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | 👁️ |

### 4.6 Turnos, cajas, cortes

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Abrir turno | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cerrar turno (sin Z, solo cambio de personal) | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Generar Reporte X (lectura intermedia) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Generar Reporte Z (cierre fiscal) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Arquear caja (corte con declaración) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inyectar fondo a caja | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Retirar efectivo de caja | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Depósito bancario (movimiento) | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Pago a proveedor en efectivo (caja chica) | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ajuste de caja (sobrante/faltante) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver historial de turnos (sucursal) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Ver cortes de caja históricos | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |

### 4.7 Propinas

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Capturar propina al cobrar | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅* | ❌ |
| Configurar método de reparto | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar porcentajes sugeridos | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver mi propia distribución de propinas | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ | ❌ |
| Ver distribución de todos (sucursal) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Marcar propina como ENTREGADA | ✅ | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ |
| Ajustar manualmente distribución | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* REPARTIDOR captura propina cuando recibe efectivo del cliente al entregar.

### 4.8 Catálogo (productos, modificadores, promociones)

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Crear categoría | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear producto | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Editar producto (precio, descripción) | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Activar/desactivar producto | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear grupo de modificadores | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear opción de modificador | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear promoción | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Activar/desactivar promoción | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar precios por modo de servicio | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear marca virtual (DK) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Asignar productos a marca virtual | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear área de cocina | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar impresora por área | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver catálogo completo | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ |

### 4.9 Inventario y recetas

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Crear receta de producto | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear ingrediente | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Registrar entrada de inventario (compra) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ajuste manual de inventario | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Merma / desperdicio | ✅ | ✅ | ✅ | 🔐 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver stock actual | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | 👁️ | ❌ | 👁️ |
| Ver historial de movimientos | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Generar reporte de inventario | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |

### 4.10 Usuarios y configuración

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Crear usuario en el tenant | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Asignar rol a usuario | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Asignar sucursal a usuario | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Inactivar usuario | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Resetear PIN de usuario | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear sucursal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar PAC fiscal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar día contable / hora cierre | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurar propinas sucursal | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver auditoría de eventos | 👁️ | 👁️ | 👁️ | 👁️* | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Ver auditoría de cambios de rol | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ |

\* ADMIN_SUCURSAL solo puede crear/editar usuarios de **su(s) sucursal(es) asignada(s)** y NO puede asignar rol OWNER_TENANT u otro ADMIN_SUCURSAL.
\* SUPERVISOR ve auditoría solo de su sucursal y solo del día actual.

### 4.11 Reportes

| Flujo | SUP | OWN | ADM | SPV | CAJ | MES | COC | REP | AUD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Reporte X (turno propio) | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | 👁️ |
| Reporte X (otro turno mismo día) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Reporte Z (de cualquier turno cerrado) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Estado de resultados día (sucursal) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Estado de resultados periodo | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| KPIs dashboard | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Top productos / categorías | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Ventas por mesero | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Tiempos de cocina (agregado) | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | 👁️ | ❌ | 👁️ |
| Tiempos de delivery | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | 👁️* | 👁️ |
| Descuentos sospechosos | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Auditoría cancelaciones | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Conciliación apps externas | 👁️ | 👁️ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | 👁️ |
| Reporte multi-sucursal | 👁️ | 👁️ | 👁️* | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ |

\* REPARTIDOR solo ve sus propios tiempos de delivery.
\* ADMIN_SUCURSAL con MULTI_SUCURSAL_ASIGNADAS ve reportes consolidados de SUS sucursales solamente.

---

## 5. PINs de autorización

### 5.1 Concepto

Una operación marcada como 🔐 en la matriz requiere autorización por PIN ANTES de ejecutarse. El flujo es:

1. El usuario operativo (cajero, mesero) intenta la operación
2. La app detecta que requiere PIN según matriz × rol
3. Aparece modal: "Esta operación requiere autorización"
4. Llega un usuario con rol superior, ingresa SU PIN (4-6 dígitos)
5. El backend valida: ¿PIN correcto? ¿Usuario activo? ¿Rol del autorizador permite?
6. Si OK: registra `autorizaciones_pin` con `usuario_solicitante_id`, `usuario_autorizo_id`, `operacion`, timestamp
7. La operación se ejecuta. El registro en `auditoria_eventos` referencia `autorizacion_pin_id`

### 5.2 Catálogo de operaciones que requieren PIN

(Resumen consolidado de los 🔐 en §4.)

| # | Operación | Roles que pueden ejecutar | Roles que pueden autorizar | Notas |
|---|---|---|---|---|
| 1 | Cancelar item EN_COCINA | CAJ, MES | SPV, ADM, OWN | Item ya enviado a preparación |
| 2 | Descuento manual hasta $500 | CAJ | SPV, ADM, OWN | Umbral configurable por tenant |
| 3 | Descuento manual >$500 | CAJ, SPV | ADM, OWN | Umbral configurable |
| 4 | Cortesía total (100%) | CAJ, SPV | ADM, OWN | Independiente del monto |
| 5 | Override de precio en item | CAJ, SPV | ADM, OWN | Cambiar precio individual |
| 6 | Cancelar promoción aplicada | CAJ, SPV | ADM, OWN | Quitar promo ya calculada |
| 7 | Cancelar ticket ABIERTO sin pago | CAJ | SPV, ADM, OWN | Sin items en cocina |
| 8 | Cancelar ticket PAGADO | (solo ADM, OWN) | OWN | Genera devolución automática |
| 9 | Crear devolución parcial | CAJ, SPV | SPV(para CAJ), ADM, OWN | Items específicos |
| 10 | Crear devolución total | CAJ | SPV, ADM, OWN | Todo el ticket |
| 11 | Confirmar devolución | CAJ | SPV, ADM, OWN | Paso irrevocable |
| 12 | Reimprimir comanda | CAJ, MES, COC | SPV, ADM, OWN | Anti-fraude |
| 13 | Reversar estado cocina (LISTO→EN_COCINA) | CAJ, SPV, COC | SPV(para CAJ/COC), ADM, OWN | Excepcional |
| 14 | Transferir mesa | CAJ, MES | SPV, ADM, OWN | Auditoría obligatoria |
| 15 | Reasignar repartidor | CAJ | SPV, ADM, OWN | Cambio en medio de proceso |
| 16 | Split de cuenta | CAJ | SPV, ADM, OWN | Múltiples tickets generados |
| 17 | Inyectar fondo a caja | CAJ | SPV, ADM, OWN | Movimiento monetario |
| 18 | Retirar efectivo de caja | CAJ | SPV, ADM, OWN | Movimiento monetario |
| 19 | Depósito bancario | CAJ | SPV, ADM, OWN | Movimiento monetario |
| 20 | Pago a proveedor (caja chica) | SPV | ADM, OWN | Excepcional |
| 21 | Cerrar turno (cambio personal sin Z) | CAJ | SPV, ADM, OWN | No es cierre fiscal |
| 22 | Generar Reporte Z | SPV, ADM, OWN | (PIN propio del que genera) | Cierre fiscal |
| 23 | Marcar propina como ENTREGADA | CAJ | SPV, ADM, OWN | Movimiento de efectivo |
| 24 | Ajuste manual de inventario | ADM | OWN | Cambia el stock sin movimiento |
| 25 | Merma / desperdicio | SPV, ADM | SPV(self), ADM, OWN | Salida no-venta |
| 26 | Cancelar item ticket (post-cobro abierto) | SPV | ADM, OWN | Caso muy raro |

### 5.3 Configuración del PIN

- **Longitud:** 4 a 6 dígitos numéricos (configurable por tenant, default 4)
- **Almacenamiento:** hash bcrypt en `usuarios_acceso.pin_hash` (nunca en texto plano)
- **Cambio obligatorio:** primer ingreso del usuario en el sistema
- **Expiración:** opcional, configurable por tenant (default: nunca; recomendado: cada 90 días para roles SPV+)
- **Bloqueo por intentos fallidos:** 5 intentos consecutivos fallidos → bloqueo temporal (15 min) y notificación a admin
- **Reseteo:** ADM/OWN puede resetear PIN de usuarios bajo su scope; OWN solo puede ser reseteado por OWNER co-tenant o vía soporte SUPER_ADMIN

### 5.4 Reglas de autorización (D68)

**Cada autorización es PUNTUAL**: un PIN sirve UNA sola vez para UNA operación específica. Si el cajero necesita autorizar 3 cosas, el supervisor ingresa PIN 3 veces.

**Razones:**

1. Anti-abuso: el supervisor no se queda "logueado" en la caja del cajero
2. Trazabilidad: cada autorización tiene su propio registro
3. Reportes: "el supervisor X autorizó 50 descuentos hoy" es una métrica clara

**Excepción NO permitida:** ningún modo "autorizar sesión completa por 1 hora". Si la operación lo justifica, el supervisor se loguea como tal en su propia pantalla.

### 5.5 Tabla `autorizaciones_pin` (recordatorio)

Esta tabla ya existe en Parte 1A §7.3. Recordatorio de campos clave:

```sql
-- (ya definida en Parte 1A — solo recordatorio)
autorizaciones_pin (
  id, tenant_id, sucursal_id, caja_id, turno_id,
  usuario_solicitante_id,   -- el cajero/mesero que pidió la autorización
  usuario_autorizo_id,      -- el supervisor/admin que ingresó su PIN
  operacion,                -- string del tipo de operación (catálogo §5.2)
  entidad_tipo, entidad_id, -- a qué entidad aplica (ticket, item, etc.)
  resultado,                -- AUTORIZADO / RECHAZADO / EXPIRADO
  intentos_realizados,      -- cuántos intentos antes de éxito
  fecha_solicitud, fecha_autorizacion,
  payload_contexto jsonb,   -- snapshot del estado al momento (monto, motivo, etc.)
  created_at
)
```

### 5.6 Auditoría de PINs

Reportes que el ADMIN_SUCURSAL revisa periódicamente:

- **Por autorizador:** ¿cuántas autorizaciones dio el supervisor X esta semana? ¿En qué operaciones?
- **Por solicitante:** ¿cuántas autorizaciones pidió el cajero Y? ¿Cuáles? Detección de cajeros que abusan.
- **Por operación:** ¿cuántas cancelaciones de items en cocina hubo esta semana? Métricas operativas.
- **PINs fallidos:** intentos fallidos por usuario, sucursal, hora. Detección de intentos sospechosos.

Funciones SQL (a implementar en la app sobre tablas existentes):

```sql
-- Pendiente de incluir en una migración aditiva si se desea:
-- vw_autorizaciones_por_supervisor (puede crearse desde 1A existing data)
-- vw_autorizaciones_por_operacion
-- vw_pins_fallidos
```

> **Nota:** estas vistas se construyen directamente sobre `autorizaciones_pin` sin necesidad de tablas nuevas. No están en la migración SQL formal porque son consultas que la app puede hacer directamente. Si se vuelven críticas, se promueven a vistas formales en una migración 060+.

---

## 6. Configuración multi-sucursal

### 6.1 Scope de un rol

Cada asignación de rol a un usuario tiene un **scope** que define a qué sucursales aplica.

```
TENANT_COMPLETO        → todas las sucursales del tenant (presente y futuras)
SUCURSAL_ASIGNADA      → una sola sucursal específica
MULTI_SUCURSAL_ASIGNADAS → un conjunto explícito de sucursales
```

### 6.2 Restricciones de scope por rol

| Rol | Scopes permitidos | Default |
|---|---|---|
| SUPER_ADMIN | (plataforma, no aplica) | n/a |
| OWNER_TENANT | TENANT_COMPLETO | TENANT_COMPLETO |
| ADMIN_SUCURSAL | SUCURSAL_ASIGNADA, MULTI_SUCURSAL_ASIGNADAS | SUCURSAL_ASIGNADA |
| SUPERVISOR | SUCURSAL_ASIGNADA, MULTI_SUCURSAL_ASIGNADAS (raro) | SUCURSAL_ASIGNADA |
| CAJERO | SUCURSAL_ASIGNADA | SUCURSAL_ASIGNADA |
| MESERO | SUCURSAL_ASIGNADA | SUCURSAL_ASIGNADA |
| COCINA | SUCURSAL_ASIGNADA | SUCURSAL_ASIGNADA |
| REPARTIDOR | SUCURSAL_ASIGNADA | SUCURSAL_ASIGNADA |
| AUDITOR_LECTOR | TENANT_COMPLETO | TENANT_COMPLETO |

> Los roles operativos (CAJERO/MESERO/COCINA/REPARTIDOR) NO pueden tener MULTI_SUCURSAL_ASIGNADAS. La razón: una persona física opera en una sola sucursal a la vez. Si una persona trabaja en 2 sucursales, se le asignan 2 instancias del rol con scopes distintos (o se confirma que en realidad es ADM/SPV regional).

### 6.3 Asignación a una sucursal específica

Para roles SUCURSAL_ASIGNADA, el usuario tiene una fila en `usuarios_acceso_roles` por cada (rol × sucursal). Ejemplo:

```
Juan tiene:
- rol: CAJERO, scope: SUCURSAL_ASIGNADA, sucursal: Sucursal Centro
- rol: CAJERO, scope: SUCURSAL_ASIGNADA, sucursal: Sucursal Norte

Esto significa: Juan puede operar la caja en cualquiera de las dos sucursales (las que su admin le habilite). Al iniciar sesión, elige cuál sucursal opera ese día.
```

### 6.4 Asignación regional (MULTI)

Para gerentes regionales (ADM con MULTI):

```
María tiene:
- rol: ADMIN_SUCURSAL, scope: MULTI_SUCURSAL_ASIGNADAS, sucursales: [Centro, Norte, Sur]

María ve reportes consolidados de las 3 sucursales. Puede crear usuarios en cualquiera de las 3. NO ve sucursales fuera de esa lista.
```

### 6.5 Una sucursal nueva — ¿quién la ve automáticamente?

Cuando se crea una sucursal nueva en el tenant:

- ✅ Todos los OWNER_TENANT (scope TENANT_COMPLETO) la ven automáticamente
- ✅ Todos los AUDITOR_LECTOR (scope TENANT_COMPLETO) la ven automáticamente
- ❌ Los ADM con MULTI NO la ven hasta que se les asigne explícitamente
- ❌ Los demás roles NO la ven

Este es un diseño deliberado: nuevas sucursales NO se "rocían" a todos los gerentes regionales automáticamente. El OWNER decide quién las administra.

---

## 7. Roles personalizables (override por tenant)

### 7.1 Override restrictivo permitido (D71)

Un OWNER_TENANT puede customizar la matriz solo para **quitar** permisos a roles de su tenant. Casos comunes:

- "En mi negocio, los MESEROS NO ven el monto total del ticket, solo los items" → ✅ permitido
- "En mi negocio, los CAJEROS no pueden aplicar promociones automáticas (se desactiva la lógica de promos)" → ✅ permitido
- "En mi negocio, los REPARTIDORES NO pueden ver la dirección hasta confirmar salida" → ✅ permitido (override de timing)

### 7.2 Ampliación NO permitida (D71)

- "En mi negocio, los CAJEROS SÍ pueden cancelar tickets pagados sin PIN" → ❌ rechazado
- "En mi negocio, los MESEROS SÍ pueden ver reportes Z" → ❌ rechazado
- "En mi negocio, el SUPERVISOR SÍ puede cancelar tickets PAGADOS" → ❌ rechazado

La razón: las restricciones son seguras (defensa en profundidad), las ampliaciones rompen los controles antifraude que protegen al propio dueño.

### 7.3 Rol PERSONALIZADO (D72)

Para casos genuinamente especiales que no encajan en los 9 roles, existe un rol comodín `PERSONALIZADO`:

```
Caso real: Knock-Out Burger necesita un rol "JEFE_DE_PARRILLA" que puede:
- Marcar pedidos LISTO (como COCINA)
- Ver tiempos de cocina (como COCINA)
- Pero también
- Ver reporte de área de cocina (extra)
- Recibir alertas de pedidos vencidos

Solución: se le asigna rol PERSONALIZADO con permisos explícitos:
  - "marcar_pedido_listo": ✅
  - "ver_tiempos_cocina": ✅
  - "ver_vw_ventas_por_area_cocina": ✅
  - "recibir_alertas_pedidos_vencidos": ✅
```

Tabla puente `permisos_personalizados`:

```sql
-- Esta tabla NO existe en Partes 1A-1E.
-- Decisión D72: si se requiere, se agrega vía migración aditiva 060+.
-- En MVP, esta funcionalidad NO se implementa. Si un cliente lo pide,
-- se evalúa caso por caso. Para los 3 pilotos no se anticipa necesidad.

permisos_personalizados (
  id uuid PK,
  tenant_id uuid FK,
  usuario_id uuid FK,
  permiso_codigo varchar(80),    -- catálogo de strings
  scope_sucursal_id uuid NULL,
  habilitado boolean,
  configurado_por uuid FK,
  created_at, updated_at
)
```

**MVP:** este escape hatch NO se implementa todavía. Los 9 roles cubren los pilotos. Si después de Knock-Out, Chick'n Go y Camtaritos surge necesidad, se construye en Fase 2.

### 7.4 Configuración del tenant: tabla `tenant_permisos_overrides`

Para overrides restrictivos (§7.1) a nivel de tenant entero:

```sql
-- También pendiente para Fase 2. En MVP, los overrides son hardcoded
-- por feature flag del tenant en su configuración.

tenant_permisos_overrides (
  id uuid PK,
  tenant_id uuid FK,
  rol varchar(20),               -- rol cuyo permiso se override
  permiso_codigo varchar(80),    -- qué permiso
  habilitado boolean,            -- solo se permite FALSE (restrictivo)
  motivo text,
  created_by, created_at
)
```

**MVP:** los overrides comunes (ej. "meseros no ven total") se manejan con feature flags del tenant en JSONB simple en `tenants.configuracion`.

---

## 8. Implementación técnica

### 8.1 Tablas involucradas (recordatorio de Parte 1A)

```
usuarios_acceso              -- 1 fila por usuario del tenant (auth.users + metadata)
usuarios_acceso_sucursales   -- N filas: a qué sucursales tiene acceso (puente)
usuarios_acceso_roles        -- N filas: qué roles tiene (puente N:N rol-sucursal)
autorizaciones_pin           -- N filas: cada PIN ingresado para autorizar algo
tenants.configuracion        -- jsonb con flags y overrides
```

### 8.2 Función `current_user_tiene_rol(rol, sucursal_id)` (helper)

Esta función está pendiente de agregarse a Parte 1A. Recomendada para usar en triggers y validaciones:

```sql
CREATE OR REPLACE FUNCTION current_user_tiene_rol(
  p_rol           varchar,
  p_sucursal_id   uuid DEFAULT NULL    -- si NULL, verifica para cualquier sucursal
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM usuarios_acceso_roles uar
    WHERE uar.usuario_id = v_user_id
      AND uar.tenant_id = current_tenant_id()
      AND uar.rol = p_rol
      AND uar.activo = true
      AND (
        uar.scope = 'TENANT_COMPLETO'
        OR (p_sucursal_id IS NULL)
        OR (uar.scope = 'SUCURSAL_ASIGNADA' AND uar.sucursal_id = p_sucursal_id)
        OR (uar.scope = 'MULTI_SUCURSAL_ASIGNADAS'
            AND p_sucursal_id = ANY(uar.sucursales_asignadas))
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION current_user_tiene_rol(varchar, uuid) TO authenticated;
```

### 8.3 Función `current_user_puede_operar_en_sucursal(sucursal_id)`

```sql
CREATE OR REPLACE FUNCTION current_user_puede_operar_en_sucursal(
  p_sucursal_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- OWNER y AUDITOR tienen acceso a todo el tenant
  IF current_user_tiene_rol('OWNER_TENANT') OR current_user_tiene_rol('AUDITOR_LECTOR') THEN
    RETURN true;
  END IF;

  -- Verificar asignación específica de sucursal
  RETURN EXISTS (
    SELECT 1
    FROM usuarios_acceso_roles uar
    WHERE uar.usuario_id = v_user_id
      AND uar.tenant_id = current_tenant_id()
      AND uar.activo = true
      AND (
        uar.scope = 'TENANT_COMPLETO'
        OR (uar.scope = 'SUCURSAL_ASIGNADA' AND uar.sucursal_id = p_sucursal_id)
        OR (uar.scope = 'MULTI_SUCURSAL_ASIGNADAS' AND p_sucursal_id = ANY(uar.sucursales_asignadas))
      )
  );
END;
$$;
```

### 8.4 Validación en frontend vs backend

**Frontend (Next.js):**

- Oculta botones y secciones que el rol no permite
- Muestra mensajes amigables ("Esta acción requiere autorización")
- Previene UX inválida

**Backend (funciones SQL + Route Handlers):**

- Cada función pública verifica el rol con `current_user_tiene_rol()` o validación explícita
- Cualquier intento por API directa que el frontend "deja pasar" se bloquea
- RLS adicional impide leer datos cross-tenant

> **Regla de oro:** el frontend OCULTA, el backend BLOQUEA. Nunca confiar solo en el frontend.

### 8.5 Componente `<RoleGuard>` en Next.js (referencia)

```tsx
// Pseudocódigo de referencia para la UI

interface RoleGuardProps {
  roles: Rol[];
  sucursalId?: string;
  fallback?: ReactNode;       // qué mostrar si no tiene el rol
  children: ReactNode;
}

<RoleGuard roles={['SUPERVISOR', 'ADMIN_SUCURSAL', 'OWNER_TENANT']}>
  <BotonGenerarReporteZ />
</RoleGuard>

// Con PIN requerido:
<RequirePIN
  operacion="descuento_manual_alto"
  rolesAutorizadores={['ADMIN_SUCURSAL', 'OWNER_TENANT']}
  onAuthorized={(autorizacionId) => aplicarDescuento(autorizacionId)}
>
  <BotonAplicarDescuento />
</RequirePIN>
```

### 8.6 Cómo se asigna scope a una sucursal nueva

Cuando OWNER_TENANT crea sucursal nueva, la función `crear_sucursal()` (Parte 1A) debe:

1. Crear la sucursal
2. Para cada usuario con rol scope TENANT_COMPLETO (OWNER, AUDITOR): no requiere acción adicional (ya la ven automáticamente).
3. Para los demás: queda al admin asignar usuarios explícitamente

```sql
-- Pseudocódigo de extensión (a agregar en función existente):

CREATE OR REPLACE FUNCTION crear_sucursal(...) RETURNS uuid AS $$
DECLARE
  v_sucursal_id uuid;
BEGIN
  -- ... lógica existente ...
  INSERT INTO sucursales (...) VALUES (...) RETURNING id INTO v_sucursal_id;

  -- Registrar evento de auditoría con OWNERS que ya tienen acceso
  INSERT INTO auditoria_eventos (...) VALUES (
    ...,
    'sucursal.creada',
    jsonb_build_object(
      'sucursal_id', v_sucursal_id,
      'visible_para_owners', (
        SELECT array_agg(usuario_id)
        FROM usuarios_acceso_roles
        WHERE tenant_id = current_tenant_id()
          AND rol IN ('OWNER_TENANT', 'AUDITOR_LECTOR')
          AND activo = true
      )
    )
  );

  RETURN v_sucursal_id;
END;
$$;
```

---

## 9. Mapeo a funciones SQL específicas

### 9.1 Función → Rol mínimo / PIN requerido

Esta tabla mapea las ~100 funciones SQL de las Partes 1A-1E a los roles que pueden invocarlas. Críticas para el desarrollo frontend.

#### 9.1.1 Operación venta (Parte 1C.1)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `abrir_ticket()` | CAJERO | No |
| `agregar_item_a_ticket()` | CAJERO o MESERO (suyo) | No |
| `cancelar_item_ticket()` | CAJERO o MESERO (suyo) | Sí si item ya en cocina |
| `aplicar_descuento_manual()` | CAJERO | Sí (SUPERVISOR+ o ADMIN+ según monto) |
| `evaluar_promociones_aplicables()` | CAJERO | No |
| `aplicar_pago()` | CAJERO | No |
| `cerrar_ticket_si_pagado()` | CAJERO | No (interno) |
| `poner_ticket_en_espera()` | CAJERO o MESERO | No |
| `retomar_ticket()` | CAJERO o MESERO | No |
| `marcar_pedido_listo()` | COCINA, CAJERO, SUPERVISOR | No |
| `marcar_pedido_entregado()` | MESERO, CAJERO, SUPERVISOR | No |
| `transicionar_estado_cocina_con_autorizacion()` | CAJERO, SUPERVISOR, COCINA | Sí (SUPERVISOR+) |

#### 9.1.2 Post-venta (Parte 1C.2)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `crear_devolucion()` | CAJERO | Sí (SUPERVISOR+) |
| `confirmar_devolucion()` | CAJERO | Sí (SUPERVISOR+) |
| `reversar_inventario_por_devolucion()` | (interna, no se llama directo) | n/a |
| `cancelar_ticket_pagado()` | ADMIN_SUCURSAL | Sí (PIN propio del ADM o OWN) |
| `reversar_inventario_por_cancelacion()` | (interna) | n/a |
| `cfdi_crear_borrador()` | CAJERO | No |
| `cfdi_marcar_timbrado()` | (system, callback PAC) | n/a |
| `cfdi_marcar_error()` | (system) | n/a |
| `cfdi_marcar_cancelado_sat()` | ADMIN_SUCURSAL | Sí |
| `asignar_delivery()` | CAJERO, SUPERVISOR | No |
| `confirmar_salida_delivery()` | REPARTIDOR, CAJERO, SUPERVISOR | No |
| `confirmar_entrega_delivery()` | REPARTIDOR, CAJERO, SUPERVISOR | No |
| `registrar_no_entrega_delivery()` | REPARTIDOR, CAJERO, SUPERVISOR | No |
| `liquidar_delivery()` | CAJERO, SUPERVISOR | No |
| `imprimir_comanda()` | CAJERO, MESERO, COCINA | Sí si es REIMPRESION_CAJERO |
| `sync_procesar_push()` | (system, cliente offline) | n/a |
| `sync_aplicar_operacion()` | (interna) | n/a |
| `sync_obtener_catalogo()` | CAJERO+ (cualquier rol operativo) | No |
| `sync_resolver_conflicto()` | ADMIN_SUCURSAL | No |

#### 9.1.3 Verticales (Parte 1D)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `asignar_mesa_a_ticket()` | CAJERO, MESERO | No |
| `transferir_mesa()` | CAJERO, MESERO | Sí (SUPERVISOR+) |
| `abrir_cuenta()` | CAJERO, MESERO | No |
| `split_cuenta()` | CAJERO, SUPERVISOR | Sí (SUPERVISOR+) |
| `crear_reservacion()` | CAJERO, SUPERVISOR | No |
| `confirmar_llegada_reservacion()` | CAJERO, MESERO, SUPERVISOR | No |
| `cancelar_reservacion()` | CAJERO, SUPERVISOR | No |
| `marcar_no_show_reservacion()` | CAJERO, SUPERVISOR | No |
| `auto_marcar_no_shows()` | (system, pg_cron) | n/a |
| `calcular_distribucion_propinas()` | (interna, trigger al cerrar turno) | n/a |
| `entregar_propina()` | SUPERVISOR, ADM, OWN | Sí (SUPERVISOR+ ingresa PIN) |

#### 9.1.4 Reportes (Parte 1E)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `reporte_x()` | CAJERO+ | No |
| `reporte_z()` | SUPERVISOR | Sí (PIN propio del que genera) |
| `obtener_reporte_z()` | SUPERVISOR+ | No |
| `calcular_efectivo_esperado()` | CAJERO+ | No |
| `arquear_caja()` | CAJERO, SUPERVISOR | No |
| `estado_resultados_periodo()` | SUPERVISOR+ | No |
| `kpis_dia_sucursal()` | SUPERVISOR+ | No |
| `top_productos()` | SUPERVISOR+ | No |
| `top_meseros()` | SUPERVISOR+ | No |
| `detectar_descuentos_sospechosos()` | ADMIN_SUCURSAL+ | No |
| `reporte_cancelaciones_periodo()` | SUPERVISOR+ | No |

#### 9.1.5 Núcleo (Parte 1A)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `abrir_turno()` | CAJERO, SUPERVISOR | Opcional según config |
| `cerrar_turno()` | (cambio personal) CAJERO | Sí (SUPERVISOR+) |
| `cerrar_turno_con_z()` | SUPERVISOR+ | Sí (PIN propio del que cierra) |
| `crear_movimiento_caja()` | CAJERO, SUPERVISOR | Sí según tipo de movimiento |
| `crear_corte_caja()` | CAJERO, SUPERVISOR | No |
| `validar_pin()` | (interna) | n/a |
| `registrar_autorizacion_pin()` | (interna) | n/a |
| `generar_folio()` | (interna) | n/a |

#### 9.1.6 Catálogo (Parte 1B)

| Función | Rol mínimo | PIN requerido |
|---|---|---|
| `descontar_inventario_por_venta()` | (trigger) | n/a |
| `aplicar_movimiento_inventario()` | ADMIN_SUCURSAL | Sí si es ajuste manual |
| `crear_producto()` | OWNER_TENANT | No |
| `editar_producto_precio()` | ADMIN_SUCURSAL (precios sucursal) o OWNER | No |
| `crear_promocion()` | OWNER_TENANT | No |
| `activar_promocion()` | ADMIN_SUCURSAL+ | No |

---

## 10. Onboarding de un nuevo usuario

### 10.1 Flujo general

```
1. ADMIN_SUCURSAL u OWNER_TENANT inicia "Crear usuario"
2. Captura: nombre completo, email, teléfono opcional
3. Selecciona rol(es) y sucursal(es) asignadas
4. Configura PIN inicial (4 dígitos) o lo deja en "el usuario lo establece"
5. Sistema:
   - Crea fila en auth.users (Supabase Auth) con email + password temporal
   - Crea fila en usuarios_acceso
   - Crea filas en usuarios_acceso_roles por cada rol asignado
   - Envía email de invitación
6. Usuario recibe email, hace clic, define contraseña personal y PIN
7. Usuario ya puede operar
```

### 10.2 Diagrama de estados del usuario

```
INVITADO (email enviado, no ha aceptado)
   ↓ acepta invitación
ACTIVO (puede operar)
   ↓ admin inactiva
INACTIVO (no puede iniciar sesión; datos históricos conservan referencia)
   ↓ admin reactiva
ACTIVO
   ↓ baja definitiva (raro, solo por error de captura inicial)
ELIMINADO (soft delete; datos históricos siguen con referencia "usuario eliminado")
```

### 10.3 Validaciones críticas

- **Email único por tenant** (un usuario no puede estar duplicado dentro del mismo tenant)
- **Email puede repetirse entre tenants** (mismo contador trabaja para 5 restaurantes)
- **Asignación de rol requiere validar que el creador tenga permisos** (un ADMIN_SUCURSAL no puede crear un OWNER_TENANT)
- **PIN no se acepta si es trivial** (1234, 1111, 0000, dígitos repetidos) — UI lo valida y backend también
- **Al asignar SUCURSAL_ASIGNADA**, validar que esa sucursal existe y pertenece al tenant

### 10.4 Caso especial: primer usuario del tenant

Cuando se crea un tenant nuevo (Fermín lo crea para Knock-Out Burger), automáticamente:

1. El tenant se crea
2. El usuario del dueño se crea como OWNER_TENANT con scope TENANT_COMPLETO
3. El dueño recibe email de bienvenida con onboarding (vinculado a 10-SETUP-INICIAL)
4. El dueño establece su PIN y empieza a configurar sucursales, productos, etc.

### 10.5 Multi-rol explícito

Para asignar 2+ roles a un usuario, en la pantalla de creación se permite seleccionar varios. Ejemplo:

```
Pantalla: Crear usuario
  Nombre: Pedro García
  Email: pedro@knockout.com
  
  Roles asignados:
  ☑ SUPERVISOR (Sucursal Centro)
  ☑ CAJERO     (Sucursal Centro)
  ☐ MESERO
  ☐ COCINA
  ...
```

Resultado en BD: 2 filas en `usuarios_acceso_roles` para Pedro, ambas con `sucursal_id = Centro`.

Al iniciar sesión, Pedro elige (o el sistema decide por defecto) con qué rol opera. Puede cambiar de rol durante la sesión sin re-loguearse, pero los cambios de rol quedan auditados.

### 10.6 Asignación a múltiples sucursales

Para asignar un cajero a 2 sucursales:

```
Pantalla: Crear usuario
  Nombre: Ana López
  Email: ana@knockout.com
  
  Rol: CAJERO
  Sucursales:
  ☑ Sucursal Centro
  ☑ Sucursal Norte
  ☐ Sucursal Sur
```

Resultado en BD: 2 filas en `usuarios_acceso_roles`, ambas con `rol = CAJERO`, una con `sucursal_id = Centro` y otra con `sucursal_id = Norte`.

Al iniciar sesión, Ana elige sucursal del día.

---

## 11. Auditoría y revocación

### 11.1 Cambios de rol — siempre auditados (D75)

Cada INSERT, UPDATE, DELETE en `usuarios_acceso_roles` dispara evento en `auditoria_eventos`:

```sql
-- Ya cubierto por triggers de auditoría general de Parte 1A,
-- pero se enfatiza aquí: estos eventos son CRÍTICOS.

evento_codigo: 'usuario.rol.asignado' / 'usuario.rol.removido' / 'usuario.rol.modificado'
categoria: 'USUARIOS'
payload: {
  usuario_afectado_id,
  usuario_afectado_email,
  rol_anterior,
  rol_nuevo,
  scope_anterior,
  scope_nuevo,
  sucursales_anterior,
  sucursales_nuevo,
  motivo (opcional),
  ip_origen,
  user_agent
}
```

### 11.2 Revocación de rol

**Cuándo se revoca:**

- Despido / renuncia del empleado
- Cambio de funciones (deja de ser cajero, pasa a mesero)
- Detección de fraude/abuso (revocación inmediata)
- Vacaciones largas (inactivar temporalmente)

**Flujo de revocación inmediata (D74):**

1. ADM/OWN inicia "Revocar acceso"
2. Sistema:
   - Marca todas las filas en `usuarios_acceso_roles` del usuario como `activo = false`
   - Invalida tokens JWT activos (lista de revocación o token rotativo)
   - Cierra sesiones activas en todos los dispositivos
   - Si el usuario está operando en este momento, su próxima request falla con 401
   - Auditoría registra evento `usuario.acceso.revocado` con motivo
3. El usuario NO se elimina físicamente; sus tickets, autorizaciones, propinas distribuidas, etc., conservan su referencia.

**Diferencia con eliminación:**

- **Inactivar:** soft delete, reversible, datos históricos visibles
- **Eliminar definitivamente:** rara, solo para usuarios creados por error inmediato (sin operaciones registradas)

### 11.3 Re-ingreso después de revocación

Si un empleado revocado vuelve a la empresa:

1. ADM/OWN busca su usuario en lista de inactivos
2. "Reactivar usuario"
3. Revisa/actualiza roles y sucursales
4. Reactiva (cambia `activo = true`)
5. El email del usuario es el mismo, recibe email de bienvenida con instrucciones para resetear contraseña

> **Importante:** no se crea usuario nuevo si ya existió antes (mantiene historial).

### 11.4 Reportes de auditoría obligatorios

Estos reportes se generan automáticamente y el OWNER_TENANT puede consultarlos:

- **Cambios de rol últimos 30 días:** quién cambió qué rol a quién
- **PINs fallidos últimos 7 días:** intentos de adivinar PINs
- **Operaciones autorizadas por PIN últimos 7 días:** qué supervisores están autorizando más
- **Usuarios inactivos:** cuáles llevan >30 días sin iniciar sesión (candidatos a inactivar)
- **Sesiones simultáneas detectadas:** mismo usuario en 2+ dispositivos al mismo tiempo (¿comparte contraseña?)

---

## 12. Casos especiales y excepciones

### 12.1 Foodtruck: una sola persona hace todo

En un foodtruck operado por el dueño:

```
Roles asignados al dueño:
- OWNER_TENANT (TENANT_COMPLETO)
- CAJERO (Sucursal Foodtruck)
- COCINA (Sucursal Foodtruck)
```

Al operar, el dueño:
- Cobra como CAJERO
- Marca pedidos LISTO como COCINA
- Cierra turno como OWNER (no requiere autorización externa)
- Genera reporte Z autorizándose a sí mismo con su PIN

### 12.2 Sucursal con cocina ciega (DK pura)

En una dark kitchen sin caja física, solo apps externas:

```
Roles típicos:
- ADMIN_SUCURSAL (gerente de la DK)
- CAJERO (la persona que captura las órdenes que llegan por Rappi/Uber)
- COCINA (los cocineros que marcan LISTO)
- REPARTIDOR (si hay delivery propio)

No hay MESERO. No hay mesas.
```

### 12.3 Café con barra y mesas

Combinación común:

```
- OWNER + ADMIN_SUCURSAL
- 2 CAJEROS (uno en barra, uno en caja registradora)
- 3 MESEROS (atienden las mesas del salón)
- 1 COCINA (cocina caliente)
- (no hay COCINA dedicada para bebidas; el cajero de barra prepara)
```

### 12.4 Cadena de 10 sucursales

```
- 2 OWNER_TENANT (los socios dueños) - TENANT_COMPLETO
- 2 ADMIN_SUCURSAL regional norte (5 sucursales MULTI) y regional sur (5 sucursales MULTI)
- 1 SUPERVISOR por sucursal (10 total)
- 3-5 CAJEROS por sucursal (rotativos por turnos)
- 4-8 MESEROS por sucursal (depende del tamaño)
- 1-2 COCINA por sucursal
- 2-4 REPARTIDORES por sucursal (algunos compartidos en horas pico)
- 1 AUDITOR_LECTOR (contador externo del corporativo)
```

### 12.5 Empleado renuncia con turno abierto

Escenario delicado: Pedro (cajero) renuncia a mitad del turno y se va.

1. SUPERVISOR llega, no puede usar la cuenta de Pedro
2. SUPERVISOR usa su propio rol CAJERO (tiene multi-rol)
3. Continúa operando en la misma caja
4. Al cerrar turno con Z, el turno aparece con `usuario_apertura_id = Pedro` y `usuario_cierre_id = SUPERVISOR`
5. La auditoría refleja la realidad

> **Alternativa fea:** que el supervisor "tome" la sesión de Pedro. **NO se permite.** Cada usuario opera con su propia cuenta.

### 12.6 Turno cerrado pero no se generó Z (cierre forzoso)

Si por crash de sistema o emergencia el turno cerró sin Z formal:

1. El turno queda en estado `CERRADO_SIN_Z` (estado intermedio, requiere agregar en migración futura)
2. ADM/OWN ve alerta "Turno X cerrado sin Z desde hace N horas"
3. ADM/OWN genera Z retroactivo con función `reporte_z()` 
4. El sistema lo permite porque la función es idempotente y solo bloquea si ya hay Z
5. Auditoría registra "Z generado retroactivamente"

> **MVP:** este estado intermedio `CERRADO_SIN_Z` no existe explícitamente. La función `reporte_z()` actual asume turno ABIERTO. Si en producción ocurre, se requerirá ajuste menor. Lo dejamos como deuda técnica conocida.

### 12.7 Co-dueños (2+ OWNER_TENANT)

Algunos tenants tienen 2+ socios dueños:

```
- Socio 1 (Mario): OWNER_TENANT
- Socio 2 (Luis): OWNER_TENANT
```

Ambos ven todo. Ambos pueden autorizar. Ambos pueden inactivar usuarios.

**Excepción:** un OWNER_TENANT NO puede inactivar a otro OWNER_TENANT. Para eso, contactar a SUPER_ADMIN (soporte VIM Marketing) o usar mecanismo de "renuncia voluntaria" donde el OWNER se auto-inactiva.

### 12.8 Mesero que también es repartidor

Caso real: en sucursal pequeña, Juan a veces atiende mesas, a veces reparte:

```
Roles asignados a Juan:
- MESERO (Sucursal Norte)
- REPARTIDOR (Sucursal Norte)
```

Al iniciar sesión, Juan elige modo de trabajo del día.
- Como MESERO, ve mesas y atiende tickets
- Como REPARTIDOR, ve asignaciones de delivery

### 12.9 Supervisor con multi-sucursal y cobertura cruzada

Caso real: María es SUPERVISOR de Centro pero ocasionalmente cubre Norte cuando falta personal:

```
Roles asignados a María:
- SUPERVISOR (Centro) — principal
- SUPERVISOR (Norte) — solo cuando hay necesidad
```

ADMIN_SUCURSAL puede asignar/desasignar el rol "SUPERVISOR Norte" temporalmente con un campo `fecha_expiracion` (atributo a agregar en Fase 2). En MVP, simplemente se asigna y se quita manualmente.

---

## 13. Checklist de validación

### 13.1 Validaciones operativas (probar con un cliente piloto antes de producción)

- [ ] **V-01** Crear tenant nuevo. El dueño recibe email, define password+PIN, ve dashboard vacío.
- [ ] **V-02** Dueño crea sucursal. La ve solo él al inicio (no hay otros usuarios).
- [ ] **V-03** Dueño crea cajero. El cajero recibe email, define password+PIN. Solo ve el POS, no ve reportes.
- [ ] **V-04** Cajero intenta entrar a "Reportes" → la pantalla no aparece en el menú (frontend) y la URL directa rechaza (backend).
- [ ] **V-05** Cajero aplica descuento de $100. UI pide PIN. Supervisor ingresa SU PIN. Descuento aplica. Auditoría refleja "ejecutado por cajero, autorizado por supervisor".
- [ ] **V-06** Cajero intenta cancelar ticket pagado. UI muestra "Esta operación requiere un ADMINISTRADOR DE SUCURSAL". No puede ejecutarla ni con PIN (porque ningún SUPERVISOR puede autorizarla — solo ADM+).
- [ ] **V-07** Mesero abre ticket y atiende mesa. NO ve total del ticket si está configurado el override del tenant.
- [ ] **V-08** Repartidor inicia sesión. Solo ve sus asignaciones, no ve el POS.
- [ ] **V-09** Supervisor cierra turno con Reporte Z. Ingresa SU PIN. Z se genera, propinas se distribuyen automáticamente.
- [ ] **V-10** Mismo supervisor intenta cerrar el mismo turno otra vez con Z. Recibe "YA_EXISTE" sin error.
- [ ] **V-11** Cajero intenta consultar Reporte Z de otro turno. Bloqueado.
- [ ] **V-12** Auditor (rol AUDITOR_LECTOR) inicia sesión. Ve todos los reportes pero no tiene botones de edición.
- [ ] **V-13** OWNER crea segundo sucursal. La asigna a ADMIN_SUCURSAL "regional". El ADM ahora ve 2 sucursales en su selector.
- [ ] **V-14** OWNER asigna mismo cajero a 2 sucursales. Al iniciar sesión, el cajero elige cuál.
- [ ] **V-15** OWNER revoca acceso de cajero. El cajero, que estaba operando en este momento, recibe error en la próxima acción y debe re-loguearse. Al intentar, falla.
- [ ] **V-16** OWNER reactiva al cajero al día siguiente. El cajero recibe email para resetear contraseña. Después puede operar normalmente.
- [ ] **V-17** Cajero ingresa PIN incorrecto 5 veces seguidas. Cuenta se bloquea 15 minutos. ADM recibe notificación.
- [ ] **V-18** Cajero olvida su PIN. ADM lo resetea. Cajero recibe email para definir nuevo PIN.
- [ ] **V-19** Cliente AUDITOR_LECTOR descarga XML de un CFDI. Funciona. Cliente intenta cancelar un CFDI. Bloqueado.
- [ ] **V-20** Mismo email (mismo contador) trabaja para 3 tenants distintos. Tiene 3 sesiones independientes (no se mezclan). Cada sesión solo ve los datos de su tenant.

### 13.2 Validaciones técnicas (testing automatizado)

- [ ] **T-01** Función `current_user_tiene_rol()` con rol válido y sucursal asignada → true.
- [ ] **T-02** Misma función con sucursal NO asignada → false.
- [ ] **T-03** OWNER_TENANT con sucursal cualquiera → true (scope TENANT_COMPLETO).
- [ ] **T-04** Usuario sin sesión (auth.uid() = null) → false.
- [ ] **T-05** Usuario con rol inactivo → false.
- [ ] **T-06** RLS: tenant A no ve usuarios_acceso de tenant B (incluso con SQL directo).
- [ ] **T-07** Función `aplicar_descuento_manual()` sin PIN cuando es requerido → excepción.
- [ ] **T-08** Función `reporte_z()` sin PIN → excepción.
- [ ] **T-09** Función `cancelar_ticket_pagado()` invocada por SUPERVISOR → excepción.
- [ ] **T-10** Función `cancelar_ticket_pagado()` invocada por ADMIN_SUCURSAL con su PIN → éxito.
- [ ] **T-11** `usuarios_acceso_roles` permite N filas por usuario (multi-rol).
- [ ] **T-12** Auditoría de creación de rol queda registrada en `auditoria_eventos`.
- [ ] **T-13** Auditoría de revocación queda registrada.
- [ ] **T-14** PIN bloqueado después de 5 intentos fallidos → 6to intento falla incluso con PIN correcto.

### 13.3 Cosas que esta matriz deja explícitamente para después

- ❌ Rol PERSONALIZADO completo con tabla `permisos_personalizados` (Fase 2)
- ❌ Overrides restrictivos por tenant en tabla `tenant_permisos_overrides` (Fase 2; en MVP, JSONB en `tenants.configuracion`)
- ❌ Fecha de expiración en asignación de rol (vacaciones, contratos temporales) (Fase 2)
- ❌ Auditoría avanzada con dashboards visuales (UI, 08-WIREFRAMES)
- ❌ 2FA obligatorio para roles SUPERVISOR+ (Fase 2)
- ❌ Single Sign-On con Google/Microsoft Workspace para tenants empresariales (Fase 4)
- ❌ Roles delegados (un OWNER puede "delegar temporalmente" todo su poder a un OWNER suplente) (Fase 3)
- ❌ Notificaciones push de eventos críticos por rol (Fase 2)
- ❌ Estado intermedio `CERRADO_SIN_Z` para turnos (deuda técnica conocida, ver §12.6)

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. 9 roles canónicos definidos (D67). Scope con 3 valores (D68). PINs puntuales por evento (D69). Multi-rol soportado N:N (D70). Override restrictivo permitido, ampliación no (D71). Escape hatch PERSONALIZADO declarado para Fase 2 (D72). SUPER_ADMIN separado a nivel plataforma (D73). Revocación inmediata invalida sesiones (D74). Auditoría obligatoria de cambios de rol (D75). Matriz completa rol × flujo en 11 secciones (operación POS, post-venta, cocina, delivery/apps, mesas/cuentas/reservaciones, turnos/cajas/cortes, propinas, catálogo, inventario, usuarios/config, reportes). 26 operaciones requieren PIN (§5.2). Mapeo a ~50 funciones SQL específicas de Partes 1A-1E. Funciones helper `current_user_tiene_rol()` y `current_user_puede_operar_en_sucursal()`. 9 casos especiales documentados (foodtruck, DK, café+mesas, cadena 10 sucursales, renuncia mid-turno, etc.). 20 validaciones operativas (V-01 a V-20) + 14 validaciones técnicas (T-01 a T-14). 9 cosas explícitamente fuera de alcance del MVP. |

---

**Fin del documento 09 — Matriz de Roles y Permisos.**

Con este documento más las Partes 1A-1E de arquitectura técnica, VIM POS tiene completa la **especificación de modelo de datos + seguridad y permisos** para implementar el MVP. Los siguientes documentos (08-WIREFRAMES y 10-SETUP-INICIAL) son operativos: pantallas y flujo de onboarding. Después de eso, **arrancar desarrollo** del MVP es viable.
