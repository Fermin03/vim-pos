# 08 — INVENTARIO DE PANTALLAS PARA MOCKUPS

> **Versión:** v1.1
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** octavo en la serie de arquitectura de VIM POS
> **Alcance:** catálogo exhaustivo de TODAS las pantallas que se necesitan diseñar en Adobe Illustrator antes de empezar a programar el MVP
> **Audiencia:** Fermín (diseñador), futuro equipo de desarrollo
> **Depende de:** Partes 1A-1E, 09-MATRIZ-ROLES-PERMISOS, 10-SETUP-INICIAL
> **Continúa en:** desarrollo del MVP

---

## 📋 Tabla de contenidos

- [0. Introducción y propósito](#0-introducción-y-propósito)
- [1. Plataformas y dispositivos objetivo](#1-plataformas-y-dispositivos-objetivo)
- [2. Convenciones de diseño compartidas](#2-convenciones-de-diseño-compartidas)
- [3. Pantallas de autenticación y acceso (12)](#3-pantallas-de-autenticación-y-acceso-12)
- [4. Wizard de onboarding (40)](#4-wizard-de-onboarding-40)
- [5. POS — Operación principal del cajero (28)](#5-pos--operación-principal-del-cajero-28)
- [6. POS — Mesas y cuentas (10)](#6-pos--mesas-y-cuentas-10)
- [7. POS — Caja, turnos, cortes (11)](#7-pos--caja-turnos-cortes-11)
- [8. KDS — Pantalla de cocina (5)](#8-kds--pantalla-de-cocina-5)
- [9. App Repartidor (8)](#9-app-repartidor-8)
- [10. App Mesero (8)](#10-app-mesero-8)
- [11. Admin — Catálogo (15)](#11-admin--catálogo-15)
- [12. Admin — Inventario (8)](#12-admin--inventario-8)
- [13. Admin — Clientes (4)](#13-admin--clientes-4)
- [14. Admin — Usuarios y permisos (7)](#14-admin--usuarios-y-permisos-7)
- [15. Admin — Configuración del negocio (15)](#15-admin--configuración-del-negocio-15)
- [16. Admin — Reportes y dashboards (22)](#16-admin--reportes-y-dashboards-22)
- [17. Admin — Reservaciones (5)](#17-admin--reservaciones-5)
- [18. Admin — Delivery y apps externas (8)](#18-admin--delivery-y-apps-externas-8)
- [19. Pantallas de sistema y errores (10)](#19-pantallas-de-sistema-y-errores-10)
- [20. Plantillas de impresión (8)](#20-plantillas-de-impresión-8)
- [21. Resumen consolidado y orden sugerido](#21-resumen-consolidado-y-orden-sugerido)
- [22. Lo que NO se diseña en MVP](#22-lo-que-no-se-diseña-en-mvp)

---

## 0. Introducción y propósito

### 0.1 Por qué este documento

Fermín diseñará todos los mockups visuales en Adobe Illustrator antes de empezar a programar. Este documento es el **checklist exhaustivo** de qué pantallas necesita dibujar, con suficientes especificaciones para que cada una sea diseñable sin tener que volver a leer las Partes 1A-1E.

Cada entrada tiene:
- **ID único** (formato: P-XXX para identificación cruzada en desarrollo)
- **Nombre descriptivo**
- **Dispositivo objetivo** (tableta landscape, móvil, desktop, etc.)
- **Roles que la usan**
- **Prioridad MVP** (P0 crítica, P1 importante, P2 deseable)
- **Datos principales a mostrar**
- **Acciones principales**
- **Estados que debe contemplar** (vacío, lleno, error)
- **Referencia cruzada** a documentos previos

### 0.2 Total de pantallas

**Para MVP: ~174 pantallas únicas**, agrupadas en 17 secciones funcionales. Es un número alto pero realista para un POS completo; muchas son variantes pequeñas del mismo flujo (ej. modal de PIN, diferentes pasos del wizard).

**Pueden compartir layout base.** El objetivo NO es 174 mockups completamente distintos — es 174 estados de pantalla que el equipo de desarrollo necesita poder construir. Muchos compartirán el mismo layout maestro con variaciones de contenido.

### 0.3 Decisiones declaradas

| # | Decisión | Notas |
|---|---|---|
| **D85** | Tres plataformas claramente diferenciadas: POS (tableta landscape), Apps móviles (mesero/repartidor), Admin (desktop) | §1 |
| **D86** | Modo oscuro NO en MVP (cocinas muy iluminadas, alto contraste mejor) | §2.4 |
| **D87** | Tipografía sans-serif geométrica para máxima legibilidad en pantallas baratas | §2.3 |
| **D88** | Todas las pantallas crít[icas tienen estado "vacío", "lleno", "cargando" y "error" diseñados | §2.6 |
| **D89** | Color de marca por tenant (no por VIM POS) — se diseña con accent neutro y se documenta cómo intercambiar | §2.1 |
| **D90** | Tablas/listas largas con paginación, no scroll infinito (mejor UX en táctil) | §2.7 |
| **D91** | Diálogos/modales para confirmaciones destructivas, drawers laterales para detalles | §2.8 |
| **D92** | Las cards de producto en el POS NO muestran precio (búsqueda rápida; precio vive en carrito, detalle y admin) | §2.9 |
| **D93** | NO se usan emojis en ninguna interfaz; iconografía de línea (SVG de trazo) consistente | §2.5 |
| **D94** | Shell de aplicación fija: `height:100vh`, sin scroll de página; header y footer anclados, solo el cuerpo scrollea internamente | §2.10 |
| **D95** | Sistema visual definitivo: acento naranja #E8502E puntual sobre tinta/blanco; Sora (display) + Inter Tight (body); minimalista | §2.1, §2.3 |

---

## 1. Plataformas y dispositivos objetivo

### 1.1 Tres plataformas

| Plataforma | Dispositivo objetivo | Resolución recomendada para mockups | Roles que lo usan |
|---|---|---|---|
| **POS** (operación de caja) | Tableta landscape 10-12" o laptop con touch | **1280×800** (artboard horizontal) | CAJERO, SUPERVISOR, OWNER, ADM_SUCURSAL |
| **App móvil** (mesero y repartidor) | Móvil Android/iOS | **390×844** (vertical, tamaño iPhone 14) | MESERO, REPARTIDOR |
| **KDS** (cocina) | Tableta o monitor montado | **1920×1080** (landscape, monitor 24") | COCINA |
| **Admin web** (gestión y reportes) | Laptop/desktop, Chrome | **1440×900** (artboard horizontal) | OWNER, ADM_SUCURSAL, SUPERVISOR, AUDITOR |

### 1.2 Responsividad

**En MVP, NO se diseña responsivo "perfecto" para todos los tamaños.** Se diseña para el dispositivo target principal de cada plataforma. Si el cliente usa un dispositivo distinto al recomendado, funciona pero no se ve igual de bien.

**Excepciones donde sí se debe pensar en variantes:**

- Admin web: debe funcionar bien también en tableta horizontal (1024×768)
- POS: debe funcionar tanto en tableta 10" como en laptop con touch screen
- App móvil: variantes para Android compacto (~360×640) y iPhone Plus (~430×932)

### 1.3 Touch vs mouse

- **POS y KDS:** primariamente touch. Botones grandes (mínimo 44×44 px), separación generosa, gestos básicos (tap, long-press para opciones).
- **Apps móviles:** 100% touch. Same standard.
- **Admin web:** primariamente mouse, pero todo accesible con touch para tablets.

### 1.4 Orientación

- **POS:** landscape obligatorio. No se rota a portrait.
- **KDS:** landscape obligatorio.
- **Apps móviles:** portrait. La rotación a landscape NO se soporta en MVP.
- **Admin:** landscape (desktop), también funcional en tablet landscape.

---

## 2. Convenciones de diseño compartidas

### 2.1 Colores (D89, D95)

> **Actualización v1.1:** el sistema visual se cerró con un design system real (archivo `mockups/00-design-system.html`). Esta es la paleta **definitiva**, no de referencia. El acento naranja es de VIM POS por default y es intercambiable por tenant.

**Filosofía: minimalista.** Tinta sobre blanco es el protagonista (90% de la interfaz). El acento naranja aparece SOLO en la acción principal de cada pantalla y poco más. Estados desaturados, discretos.

**Paleta definitiva (variables CSS reales):**

```
ACENTO (uso puntual; intercambiable por tenant):
  --accent:        #E8502E   naranja apetitoso — solo acción principal y selección
  --accent-hover:  #CF4525
  --accent-soft:   #FBF0EC   fondo de selección, casi imperceptible

TINTA (el protagonista — negro/gris):
  --ink:           #16161A   texto principal, casi negro
  --ink-2:         #5A5A60   texto secundario
  --ink-3:         #8E8E94   terciario, placeholders, hints

ESTADOS (desaturados, se usan poco):
  --success:       #2E7D52   pagado, listo
  --warning:       #9A6B12   pendiente, atención
  --danger:        #C0392B   cancelar, error
  --info:          #2C5AA0   en ruta, informativo

SUPERFICIES Y LÍNEAS:
  --bg:            #FFFFFF   fondo de página (blanco puro)
  --surface:       #FFFFFF   tarjetas, paneles
  --line:          #ECECE9   líneas y bordes sutiles
  --line-strong:   #DDDDD9   bordes con un poco más de presencia
  --hover:         #F6F6F4   hover de filas, zonas de imagen
```

> **Nota sobre intercambio por tenant:** solo `--accent` y sus variantes cambian por tenant. Todo lo demás (tinta, líneas, superficies, estados) es estructural y NO se toca. Esto garantiza que la marca del cliente personalice sin romper la legibilidad ni la coherencia.

### 2.2 Componentes visuales clave

Todos definidos y construidos en `mockups/00-design-system.html`. Asume estos componentes reutilizables (estilo minimalista, sin sombras pesadas):

- **Botón acento:** fondo naranja sólido, texto blanco — SOLO la acción principal de la pantalla
- **Botón primario:** fondo tinta (#16161A), texto blanco — navegación neutra
- **Botón secundario:** fondo blanco, borde fino #DDDDD9, texto tinta
- **Botón peligro:** texto + borde rojo sobre blanco; al hover se rellena de rojo
- **Botón ghost:** sin fondo ni borde, para acciones terciarias ("Saltar", "Atrás")
- **Cards:** background blanco, **borde 1px sutil (sin sombra)**, esquinas 8px, padding 16-24px
- **Inputs:** fondo blanco, borde 1px #DDDDD9; al focus el borde pasa a tinta (#16161A), no azul; esquinas 6px, altura ~44px
- **Modales:** centrados, sombra suave (no fuerte), borde fino, máximo ~380-600px ancho en desktop, full-screen en móvil
- **Drawers:** desde la derecha (admin web) o desde abajo (móvil), ancho/alto 400-500px

### 2.3 Tipografía (D87, D95)

> **Actualización v1.1:** decisión final tomada en el design system. Dos familias con rol claro (no Inter/Roboto genérico).

**Familias definitivas:**
- **Sora** → display y títulos (geométrica, con carácter, muy legible). Pesos 500/600/700.
- **Inter Tight** → texto de cuerpo, etiquetas, datos. Pesos 400/500/600/700.

Es minimalista mientras cada fuente tenga una función. Tracking ligeramente negativo (-0.01 a -0.03em) en títulos para un look refinado. Los **números** (precios, totales) usan Sora con `font-variant-numeric: tabular-nums` para alinear verticalmente en columnas.

**Jerarquía:**

```
DISPLAY (títulos de pantalla, Sora 600):
  font-size: 28-42px / letter-spacing: -0.03em

H2 (encabezados de sección, Sora 600):
  font-size: 24px / letter-spacing: -0.02em

H3 (subsecciones, Sora 600):
  font-size: 18-20px / letter-spacing: -0.02em

BODY large (POS — botones de catálogo, Inter Tight 500):
  font-size: 18px / line-height: 1.5

BODY (texto general, Inter Tight 400):
  font-size: 16px / line-height: 1.55

SMALL (labels, helpers, Inter Tight 400-500):
  font-size: 13-14px

TINY (timestamps, metadatos, Inter Tight 400):
  font-size: 12px

NÚMEROS (precios, totales, Sora 600 tabular):
  font-variant-numeric: tabular-nums  (el signo $ va en --ink-3 para destacar la cifra)
```

### 2.4 Modo oscuro (D86)

**NO en MVP.** Las cocinas mexicanas suelen ser muy iluminadas; el contraste alto del fondo blanco se ve mejor. Además, evitamos el doble trabajo de diseño.

Excepción visual posible: **KDS en modo "alto contraste"** (fondo casi negro con tipografía blanca/amarilla para visibilidad desde lejos) — se diseña como segunda variante del KDS si Fermín tiene tiempo.

### 2.5 Iconografía (D93)

**Regla absoluta: NO se usan emojis en ninguna interfaz.** Los emojis se ven inconsistentes entre dispositivos, poco profesionales, y rompen el minimalismo. Se usan **iconos de línea (SVG de trazo)**.

Set consistente, UN solo set en toda la app. Recomendaciones (todos de trazo, gratuitos):

- **Lucide** (gratis, MIT, set amplio) — recomendado
- **Phosphor** (gratis, set premium gratis)
- **Heroicons** (gratis, MIT, set medio)

**Especificaciones de los iconos:**
- Trazo (stroke) de **1.8px** estándar, 2-2.5px para iconos pequeños que necesitan presencia (palomitas, flechas)
- `stroke-linecap: round` y `stroke-linejoin: round` para suavidad
- Heredan el color del contexto (`currentColor`): tinta normal, naranja cuando el elemento está seleccionado/activo
- Tamaños: 16px en botones, 20-24px en cards y navegación, 22px en zonas de acción (drop de logo)

**Tamaño estándar:**
- Iconos en botones: 18-20px
- Iconos en navegación: 24px
- Iconos grandes (empty state, headers): 48-64px

### 2.6 Estados de pantalla (D88)

Cada pantalla crítica debe diseñarse en **4 estados**:

1. **Vacío** — sin datos todavía (ej. "No tienes productos aún. [Agregar el primero]")
2. **Lleno** — el estado normal con datos
3. **Cargando** — skeleton screens o spinner
4. **Error** — falla de red, datos corruptos, sin permiso

No es necesario diseñar los 4 estados para cada pantalla menor (ej. modales pequeños). Pero las pantallas listadas como **P0** en este documento sí los requieren.

### 2.7 Listas largas (D90)

- **Tabla con paginación**, no scroll infinito, especialmente en touch (más fácil de navegar).
- Mostrar 20-50 items por página.
- Filtros y búsqueda siempre visibles en el header de la tabla.
- Acciones masivas (seleccionar varios, eliminar lote) con checkbox por fila.

### 2.8 Modales vs drawers vs páginas (D91)

- **Modal centrado:** confirmaciones, alerts, inputs cortos (1-3 campos). Ejemplo: "¿Confirmas cancelar este ticket?"
- **Drawer lateral derecho:** ver detalle de un item de una lista sin perder contexto. Ejemplo: detalle de un ticket desde la lista de tickets.
- **Página completa:** flujos largos con muchos campos. Ejemplo: editar producto con tabs.

### 2.9 Precio en cards de producto del POS (D92)

**Las cards de producto del catálogo de venta (P-062) NO muestran precio.** Solo imagen + nombre.

Razón: en el momento de tomar el pedido, el cajero busca el producto rápido; el precio en cada botón es ruido visual. El total se va calculando en el carrito.

**Dónde SÍ vive el precio:**
- En el **carrito** (lado derecho del POS): por línea y total. Obligatorio.
- En el **detalle del producto** (P-065), al abrirlo para elegir modificadores — ahí los modificadores suman (ej. "+$15 tocino") y el precio debe verse.
- En el **admin / catálogo** (P-130 a P-138): visible y editable.

### 2.10 Shell de aplicación fija — sin scroll de página (D94)

**Regla absoluta para TODAS las plataformas (POS, Admin, Apps, Wizard, KDS): la aplicación es de altura fija (`height: 100vh`) y la página NUNCA hace scroll.** Debe sentirse como una aplicación nativa, no como una página web.

**Estructura del shell fijo:**

```
┌─────────────────────────────────────┐
│  HEADER          ← anclado, fijo     │  flex-shrink: 0
├─────────────────────────────────────┤
│  (barra de progreso / filtros)  fijo │  flex-shrink: 0
├─────────────────────────────────────┤
│                                       │
│  CUERPO         ← única zona que      │  flex: 1; min-height: 0;
│  (contenido)      scrollea si hace    │  overflow-y: auto
│                   falta, internamente │
│                                       │
├─────────────────────────────────────┤
│  FOOTER          ← anclado, fijo     │  flex-shrink: 0
│  (botones de navegación / acciones)   │
└─────────────────────────────────────┘
```

**Implementación CSS (referencia):**
- `html, body { height: 100%; overflow: hidden; }`
- Contenedor raíz: `height: 100vh; display: flex; flex-direction: column; overflow: hidden;`
- Header y footer: `flex-shrink: 0` (nunca se comprimen, siempre visibles)
- Cuerpo: `flex: 1; min-height: 0; overflow-y: auto` (absorbe el espacio restante y scrollea internamente solo si su contenido excede)

**Consecuencias de diseño:**
- El botón de acción principal (footer) SIEMPRE está visible, nunca hay que scrollear para encontrarlo.
- En el POS, el catálogo scrollea internamente pero el carrito y la barra de cobro permanecen fijos.
- En tablas largas del admin, el header de la tabla y los filtros quedan fijos; solo las filas scrollean.
- En el wizard, header + progreso arriba y botones Atrás/Continuar abajo quedan anclados; solo el formulario scrollea si no cabe (lo cual debe evitarse: preferir que cada paso quepa sin scroll).
- Cada pantalla se diseña para **caber en el viewport objetivo** (ver §1.1). Si no cabe, primero se intenta reducir/reagrupar contenido antes de aceptar scroll interno.

---

## 3. Pantallas de autenticación y acceso (12)

| ID | Pantalla | Dispositivo | Prioridad | Notas clave |
|---|---|---|---|---|
| **P-001** | Login (email + password) | Universal | P0 | Logo VIM POS arriba, campos email/password, "Olvidé contraseña", "Olvidé PIN". Ningún registro libre — solo invitación |
| **P-002** | Login en POS (selector rápido + PIN) | Tableta landscape | P0 | Después del primer login, en una caja compartida: muestra avatars de usuarios autorizados de la sucursal, tap → ingresa solo PIN. Más rápido que tipear email |
| **P-003** | Recuperar contraseña — paso 1: ingresar email | Universal | P0 | "Te enviaremos un link para resetear" |
| **P-004** | Recuperar contraseña — paso 2: confirmación de envío | Universal | P0 | "Revisa tu email. Si no llega en 5 min, [reenviar]" |
| **P-005** | Resetear contraseña (con token del email) | Universal | P0 | Capturar nueva contraseña 2 veces, validar fuerza |
| **P-006** | Activación de cuenta inicial (magic link) | Universal | P0 | Define password + PIN + acepta T&C. Solo se ve la primera vez |
| **P-007** | Cambio de PIN (perfil) | Universal | P0 | Capturar PIN actual + nuevo PIN + confirmación |
| **P-008** | Selector de sucursal | Universal | P0 | Si el usuario tiene acceso a varias, elige antes de continuar. Lista con dirección de cada una |
| **P-009** | Selector de caja (al iniciar turno) | POS tableta | P0 | Cuál caja física vas a operar. Muestra cuáles están libres vs ocupadas (con qué cajero) |
| **P-010** | Lock screen (PIN tras inactividad) | POS tableta | P0 | Después de 5 min de inactividad. Muestra nombre del cajero, pide solo PIN para desbloquear |
| **P-011** | Selector de rol (cuando usuario tiene múltiples) | Universal | P1 | Si Pedro es SUPERVISOR + CAJERO, elige con cuál opera la sesión actual |
| **P-012** | Sesión expirada — re-login | Universal | P0 | Cuando el JWT expira, modal con "Tu sesión expiró. Volver a iniciar" |

**Estados a contemplar:** todas las pantallas P-001 a P-007 necesitan estado de error (credenciales inválidas, bloqueo por intentos, etc.).

---

## 4. Wizard de onboarding (40)

Las pantallas del wizard son desktop. Cada fase del documento 10 se traduce en 1-N pantallas.

### 4.1 Fase 0 y activación

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-013** | Email de bienvenida (template) | P0 | Template HTML para email. Diseñar también en Illustrator como referencia |
| **P-014** | Activación inicial (define password + PIN + T&C) | P0 | Después de click en magic link |
| **P-015** | Bienvenida al wizard (Mario, vamos a configurar) | P0 | Hero con progreso 0/8 fases. Botón "Empezar" |

### 4.2 Fase 1 — Datos fiscales

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-016** | Fase 1.1 — Info general del negocio (nombre, vertical, logo) | P0 | Selector visual de vertical con iconos representativos |
| **P-017** | Fase 1.2 — Datos fiscales (RFC, razón social, régimen, CP) | P0 | Con tooltips de ayuda en cada campo |
| **P-018** | Fase 1.3 — PAC fiscal (selector) | P0 | 3 opciones: no factura / ya tengo PAC / contratar con VIM |
| **P-019** | Fase 1.4 — Día contable y zona horaria | P0 | Selector visual de hora con explicación del concepto |
| **P-020** | Fase 1.5 — Confirmación Fase 1 | P0 | Resumen de todo lo capturado, botón continuar |

### 4.3 Fase 2 — Estructura organizacional

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-021** | Fase 2.1 — Primera sucursal (nombre, dirección, modos servicio, horarios) | P0 | Selector visual de modos de servicio con iconos |
| **P-022** | Fase 2.2 — Cajas de la sucursal (cuántas + nombre + fondo inicial) | P0 | |
| **P-023** | Fase 2.3 — Áreas de cocina (una sola o múltiples) | P0 | Decision tree visual |
| **P-024** | Fase 2.4 — Mesas y secciones (solo FullService/CafeBar) | P0 | Editor visual: agregar sección, agregar mesas por sección |
| **P-025** | Fase 2.5 — Marcas virtuales (solo DK) | P0 | Lista de marcas con color y logo opcional |

### 4.4 Fase 3 — Usuarios

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-026** | Fase 3.1 — Confirmar tu propio rol (también cajero?) | P0 | |
| **P-027** | Fase 3.2 — Crear primer cajero | P0 | Form mínimo: nombre, email, sucursal, rol |
| **P-028** | Fase 3.3 — Invitar empleados bulk (lista + CSV) | P1 | Tabla con drag-add filas, opción importar CSV |
| **P-029** | Fase 3.4 — PIN y seguridad (configurar) | P0 | Sliders/selectores simples |

### 4.5 Fase 4 — Catálogo

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-030** | Fase 4.0 — Elección de camino: manual / CSV / plantilla | P0 | 3 cards grandes con preview |
| **P-031** | Fase 4.1A — Crear categorías (con sugeridas por vertical) | P0 | Lista editable, drag para reordenar |
| **P-032** | Fase 4.1B — Capturar producto manual (form completo) | P0 | Form con todas las opciones del producto |
| **P-033** | Fase 4.2 — Configurar modificadores (grupos + opciones) | P0 | Sub-flujo dentro del producto |
| **P-034** | Fase 4.3A — Importar CSV (subir archivo) | P0 | Drop zone + descarga de plantilla |
| **P-035** | Fase 4.3B — Importar CSV — preview con errores | P0 | Tabla con filas resaltadas si hay errores |
| **P-036** | Fase 4.3C — Importar CSV — confirmación final | P0 | "Vamos a importar 47 productos. Confirmar?" |
| **P-037** | Fase 4.4 — Plantilla por vertical (preview) | P0 | Preview del menú template con productos sugeridos |
| **P-038** | Fase 4.5 — Asignación productos a marcas (DK) | P1 | Tabla con checkboxes |
| **P-039** | Fase 4.6 — Promociones iniciales (opcional) | P2 | Decide saltar o crear |

### 4.6 Fase 5 — Configuraciones operativas

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-040** | Fase 5.1 — Métodos de pago | P0 | Checklist de métodos a aceptar |
| **P-041** | Fase 5.2 — Configuración de propinas | P0 | Percentages + método de reparto |
| **P-042** | Fase 5.3 — Impresión (impresoras y tests) | P0 | Selector de impresoras + botón "Imprimir prueba" |
| **P-043** | Fase 5.4 — Diseño de tickets | P1 | Editor visual con preview del ticket |
| **P-044** | Fase 5.5 — Configuración de turnos | P0 | |

### 4.7 Fases 6, 7, 8

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-045** | Fase 6.1 — Apps externas (selector) | P1 | |
| **P-046** | Fase 6.2 — Captura folios apps (modo de operación) | P1 | |
| **P-047** | Fase 6.3 — Áreas por marca (DK only) | P1 | |
| **P-048** | Fase 6.4 — Delivery propio (config) | P1 | |
| **P-049** | Fase 6.5 — Crear repartidores | P1 | Similar a crear cajeros |
| **P-050** | Fase 7.1 — ¿Activar inventario? (decisión) | P2 | |
| **P-051** | Fase 7.2 — Inventario simple (productos terminados) | P2 | |
| **P-052** | Fase 7.3 — Inventario completo (ingredientes + recetas) | P2 | Solo si lo elige |

### 4.8 Fase 8 — Pruebas y go-live

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-053** | Fase 8.1 — Resumen pre-vuelo (todo el setup) | P0 | Lista con ✅ por cada cosa lista, ⚠️ por pendientes |
| **P-054** | Fase 8.3 — Venta de prueba paso a paso (guía) | P0 | Wizard interno dentro del wizard, simula uso del POS |
| **P-055** | Fase 8.4 — Reporte X de prueba (preview) | P0 | Mostrar el reporte X recién generado |
| **P-056** | Fase 8.5 — Cierre + cancelación de prueba | P0 | Confirmación de limpieza de datos de prueba |
| **P-057** | Fase 8.6 — ¡Felicidades! Go-live | P0 | Confetti, próximos pasos, link al POS |

---

## 5. POS — Operación principal del cajero (28)

Estas son las pantallas más importantes y más usadas. **Cada una de las P0 debe tener los 4 estados (vacío/lleno/cargando/error) diseñados.**

### 5.1 Apertura y home

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-058** | Apertura de turno (declarar fondo inicial) | P0 | Captura monto + click "Abrir turno" |
| **P-059** | POS Home — Dashboard del cajero | P0 | Layout principal: catálogo a la izquierda, carrito a la derecha, header con info de turno |
| **P-060** | Lista de tickets activos (vista lateral o popover) | P0 | Tickets abiertos, en espera, recientes pagados |

### 5.2 Crear y editar ticket

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-061** | Selector de modo de servicio (al abrir ticket) | P0 | 5-6 botones grandes según modos activos |
| **P-062** | Catálogo de productos (vista grid) | P0 | Categorías arriba/lateral, productos en cards grandes (imagen + nombre + precio) |
| **P-063** | Catálogo de productos (vista lista) | P1 | Alternativa más compacta para menús grandes |
| **P-064** | Búsqueda de productos | P0 | Search bar con resultados en tiempo real |
| **P-065** | Detalle de producto con modificadores | P0 | Modal/drawer: imagen, descripción, selector de modificadores (radio/checkbox), nota, cantidad |
| **P-066** | Carrito (lateral derecho del POS Home) | P0 | Lista de items, subtotal, IVA, total. Botones: cobrar, en espera, cancelar |
| **P-067** | Editar item del carrito | P0 | Modal: cambiar cantidad, modificadores, nota, eliminar |
| **P-068** | Cancelar item (con motivo si es post-cocina) | P0 | Modal de confirmación + selector de motivo |

### 5.3 Cobranza

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-069** | Selector de método de pago | P0 | Botones grandes por método: Efectivo, Tarjeta, Transfer, App, Dividido |
| **P-070** | Pago efectivo (capturar recibido, mostrar cambio) | P0 | Numpad grande, sugerencias rápidas ($50, $100, $200, exacto) |
| **P-071** | Pago tarjeta (capturar folio aprobación) | P0 | Input de folio + opción "saltar captura" si terminal externa |
| **P-072** | Pago transferencia/SPEI (capturar referencia) | P0 | |
| **P-073** | Pago app externa (capturar folio Rappi/Uber) | P0 | Input del folio externo + tipo de app |
| **P-074** | Pago dividido (multi-método) | P0 | Lista de pagos parciales, ir agregando hasta cubrir total |
| **P-075** | Captura de propina | P0 | Botones rápidos 10/15/20% + monto libre + sin propina |
| **P-076** | Captura de cliente para factura | P0 | RFC, razón social, uso CFDI, email. Mostrar solo si activa "Quiero factura" |
| **P-077** | Confirmación de cobro + opciones de impresión | P0 | "Pagado $245. Imprimir ticket? Imprimir comanda? Enviar factura?" |

### 5.4 Operaciones especiales

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-078** | Aplicar descuento manual | P0 | Modal: tipo (% o monto), valor, motivo. Requiere PIN si supera umbral |
| **P-079** | Aplicar/ver promociones disponibles | P0 | Modal con lista de promos aplicables al ticket actual |
| **P-080** | Modal de PIN para autorización | P0 | Critical. Indica claramente qué se autoriza y quién debe ingresar PIN |
| **P-081** | Poner ticket en espera (con etiqueta) | P0 | Modal pidiendo etiqueta opcional ("Carlos", "Mesa 5", etc.) |
| **P-082** | Lista de tickets en espera | P0 | Cards con etiqueta, hora, monto, botón "Retomar" |
| **P-083** | Cancelar ticket abierto (con motivo) | P0 | Modal con selector de motivos + PIN |
| **P-084** | Generar CFDI desde ticket pagado | P1 | Sale del flujo normal de cobro |
| **P-085** | Estado de cocina del ticket (semáforo) | P0 | Para que cajero/mesero vea si ya está listo lo del cliente |

---

## 6. POS — Mesas y cuentas (10)

### 6.1 Mesas (Full Service)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-086** | Mapa de mesas (vista plano) | P0 | Layout visual con secciones, mesas color-coded por estado |
| **P-087** | Lista de mesas (vista alterna) | P1 | Tabla con # mesa, sección, estado, mesero, total acumulado |
| **P-088** | Detalle de mesa (drawer/modal) | P0 | Estado actual, ticket asociado, items, mesero, tiempo ocupada |
| **P-089** | Asignar mesa a ticket nuevo | P0 | Selector visual de mesa libre |
| **P-090** | Juntar mesas (selector secundaria) | P1 | Modal: "elige mesa secundaria a unir" |
| **P-091** | Transferir mesa (con PIN) | P0 | Modal: mesa origen → mesa destino + motivo + PIN |
| **P-092** | Cambiar estado de mesa (limpieza/fuera) | P1 | Modal simple |

### 6.2 Cuentas abiertas (Café & Bar)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-093** | Lista de cuentas abiertas | P0 | Cards: nombre cuenta, mesero, productos, total parcial |
| **P-094** | Abrir nueva cuenta (modal) | P0 | Form: nombre cuenta, mesero, cliente opcional |
| **P-095** | Split de cuenta (selector N partes) | P1 | Modal: cuántas partes, distribución automática equitativa |

---

## 7. POS — Caja, turnos, cortes (11)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-096** | Movimientos de caja del turno (lista) | P0 | Tabla cronológica de movimientos: pagos, inyecciones, retiros, devoluciones |
| **P-097** | Inyectar fondo a caja (con PIN) | P0 | Modal: monto + motivo + PIN |
| **P-098** | Retirar efectivo de caja (con PIN) | P0 | Modal: monto + motivo + destino (banco/personal) + PIN |
| **P-099** | Depósito bancario (con PIN) | P0 | Modal: monto + referencia bancaria + PIN |
| **P-100** | Pago a proveedor (caja chica) | P1 | Modal: monto + proveedor + concepto + PIN |
| **P-101** | Arqueo / Corte de caja — declaración por método | P0 | Tabla: por método de pago, esperado vs declarado, diferencia |
| **P-102** | Resultado del corte (con diferencias) | P0 | Resumen final con resaltado de diferencias |
| **P-103** | Cerrar turno (cambio personal sin Z) | P0 | Modal de confirmación + PIN |
| **P-104** | Generar Reporte Z (con PIN propio) | P0 | Modal final con preview antes de confirmar |
| **P-105** | Reporte X (visualización completa) | P0 | Pantalla completa con todos los datos del X |
| **P-106** | Reporte Z (visualización post-generación) | P0 | Similar al X pero con marca de "CERRADO" y opción de imprimir |

---

## 8. KDS — Pantalla de cocina (5)

Pantallas para tabletas montadas en cocina. Layout simple, gran tipografía, alto contraste.

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-107** | KDS Principal — tickets pendientes (vista área) | P0 | Cards grandes con items por preparar. Filtrado por área. Color por tiempo transcurrido |
| **P-108** | KDS — detalle de ticket | P0 | Items, modificadores, notas. Botones: "EN_COCINA", "LISTO" |
| **P-109** | KDS — vista multi-área (supervisor) | P1 | Si la cocina tiene varias áreas, vista consolidada |
| **P-110** | KDS — alerta de pedido vencido | P1 | Visual destacado cuando un ticket excede tiempo objetivo |
| **P-111** | KDS — alta contraste (modo cocina) | P2 | Variante visual con fondo oscuro, números amarillos grandes |

---

## 9. App Repartidor (8)

App móvil portrait, simple, optimizada para uso con una mano.

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-112** | Login repartidor (email + PIN) | P0 | Más simple que el general |
| **P-113** | Mis asignaciones activas (lista) | P0 | Cards con: cliente, dirección, total, productos, tiempo |
| **P-114** | Detalle de asignación | P0 | Toda la info del pedido + botones de acción |
| **P-115** | Mapa con ruta (opcional MVP) | P2 | Integración con Google Maps |
| **P-116** | Confirmar salida (botón grande) | P0 | "Salir a entregar" con confirmación |
| **P-117** | Confirmar entrega (con propina opcional) | P0 | Botón grande + captura de propina si aplica |
| **P-118** | Registrar no-entrega (selector motivo) | P0 | |
| **P-119** | Liquidación al regresar (declarar efectivo) | P0 | Cuánto trae en efectivo, cuánto en comprobantes |

---

## 10. App Mesero (8)

App móvil o tableta pequeña. Versión simplificada del POS enfocada en atender mesas.

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-120** | Login mesero (selector + PIN) | P0 | |
| **P-121** | Mis mesas activas (vista grid) | P0 | Cards de mesas con tiempo, items pendientes |
| **P-122** | Tomar orden (catálogo simplificado) | P0 | Versión light del POS con productos |
| **P-123** | Carrito de la mesa (items pendientes de enviar) | P0 | |
| **P-124** | Enviar a cocina (confirmación) | P0 | Botón grande "Enviar comanda" |
| **P-125** | Estado de pedidos (LISTO para entregar) | P0 | Notificación cuando cocina marca LISTO |
| **P-126** | Marcar entregado | P0 | Botón simple |
| **P-127** | Mis propinas del día | P1 | Acumulado pendiente de cierre de turno |

---

## 11. Admin — Catálogo (15)

Pantallas desktop. Todas son CRUD; comparten layout (tabla + filtros + acciones).

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-128** | Lista de categorías | P0 | Tabla simple con orden de visualización |
| **P-129** | Crear/editar categoría | P0 | Modal o página: nombre, descripción, orden, icono |
| **P-130** | Lista de productos (con filtros) | P0 | Tabla rica: imagen, nombre, categoría, precio, estado, área cocina |
| **P-131** | Crear producto (form completo, con tabs) | P0 | Tabs: General, Precios, Modificadores, Cocina, Visibilidad |
| **P-132** | Editar producto | P0 | Mismo form que crear, con datos cargados |
| **P-133** | Asignar grupos de modificadores a producto | P0 | |
| **P-134** | Lista de grupos de modificadores | P0 | Tabla |
| **P-135** | Crear/editar grupo de modificadores | P0 | Form: nombre, tipo (único/múltiple), obligatorio, min/max selecciones |
| **P-136** | Lista de opciones de modificador | P0 | |
| **P-137** | Crear/editar opción de modificador | P0 | Form: nombre, precio extra, naturaleza (extra/sustitución/quita) |
| **P-138** | Configurar precios por modo de servicio | P1 | Tabla: producto vs modos con override de precio |
| **P-139** | Lista de promociones | P0 | |
| **P-140** | Crear promoción (paso 1: tipo) | P0 | Selector visual de tipos: %, monto, 2x1, combo, etc. |
| **P-141** | Crear promoción (paso 2: condiciones) | P0 | Días, horas, productos aplicables, alcance |
| **P-142** | Lista y editor de marcas virtuales | P1 | Solo si tenant es DK |

---

## 12. Admin — Inventario (8)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-143** | Stock actual (lista de ingredientes/productos) | P1 | Tabla con stock, mínimo, estado (OK / bajo / agotado) |
| **P-144** | Detalle de producto en inventario | P1 | Historial de movimientos |
| **P-145** | Lista de recetas | P2 | |
| **P-146** | Crear/editar receta | P2 | Form: producto + lista de ingredientes con cantidades |
| **P-147** | Registrar entrada de inventario (compra) | P1 | Form: proveedor, productos, cantidades, costos |
| **P-148** | Ajuste manual de inventario (con PIN) | P1 | Form simple + motivo + PIN |
| **P-149** | Movimientos de inventario (historial filtrable) | P1 | Tabla |
| **P-150** | Reporte de inventario | P2 | Resumen consolidado |

---

## 13. Admin — Clientes (4)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-151** | Lista de clientes | P1 | Tabla con búsqueda |
| **P-152** | Crear/editar cliente (form) | P1 | Nombre, teléfono, email, RFC (opcional), direcciones |
| **P-153** | Detalle de cliente (histórico de compras) | P2 | Vista 360: tickets, total gastado, frecuencia |
| **P-154** | Direcciones del cliente (CRUD) | P1 | |

---

## 14. Admin — Usuarios y permisos (7)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-155** | Lista de usuarios | P0 | Tabla: nombre, email, rol(es), sucursal(es), estado |
| **P-156** | Crear usuario (form) | P0 | Form + asignación de rol + sucursal + invitación email |
| **P-157** | Editar usuario | P0 | Mismo form con datos cargados |
| **P-158** | Asignar/modificar roles de usuario | P0 | Múltiples roles, scope, sucursales |
| **P-159** | Resetear PIN de usuario | P0 | Modal con confirmación |
| **P-160** | Inactivar/reactivar usuario | P0 | Modal con confirmación y aviso de "sesiones serán cerradas" |
| **P-161** | Bitácora de cambios de rol (auditoría) | P1 | Tabla cronológica |

---

## 15. Admin — Configuración del negocio (15)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-162** | Datos generales del tenant | P0 | Nombre comercial, logo, vertical |
| **P-163** | Datos fiscales (editar post-onboarding) | P0 | RFC, razón social, régimen, CP |
| **P-164** | Configuración CFDI / PAC | P0 | Activar/desactivar, credenciales PAC, status |
| **P-165** | Lista de sucursales | P0 | Tabla con sucursales del tenant |
| **P-166** | Crear/editar sucursal | P0 | Form completo: dirección, horarios, modos de servicio |
| **P-167** | Lista de cajas (por sucursal) | P0 | |
| **P-168** | Crear/editar caja | P0 | |
| **P-169** | Lista de áreas de cocina | P0 | |
| **P-170** | Crear/editar área de cocina | P0 | Con asignación de impresora |
| **P-171** | Editor de mesas y secciones (visual) | P1 | Editor drag-and-drop simplificado |
| **P-172** | Lista de marcas virtuales (DK) | P1 | |
| **P-173** | Configuración de propinas (por sucursal) | P0 | Método de reparto, porcentajes |
| **P-174** | Configuración de impresión (por sucursal) | P0 | Impresoras por área, plantillas |
| **P-175** | Configuración de tickets (diseño) | P1 | Editor con preview |
| **P-176** | Apps externas — config (cuáles activas) | P1 | Credenciales por app |

---

## 16. Admin — Reportes y dashboards (22)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-177** | Dashboard principal (KPIs día) | P0 | Hero con métricas: ventas hoy, tickets, ticket promedio, vs ayer |
| **P-178** | Dashboard — selector de fecha/período | P0 | Quick filters: hoy, ayer, semana, mes, custom range |
| **P-179** | Estado de resultados día (detalle) | P0 | Tabla con todos los KPIs del día |
| **P-180** | Estado de resultados período | P0 | Igual pero agregando rango |
| **P-181** | Reporte Z histórico (lista) | P0 | Tabla cronológica de Zs generados |
| **P-182** | Reporte Z (detalle/preview) | P0 | Vista completa del Z específico |
| **P-183** | Reportes X históricos (lista) | P1 | |
| **P-184** | Ventas por categoría (gráfica + tabla) | P0 | Gráfica de barras + tabla |
| **P-185** | Ventas por producto / Top productos | P0 | Tabla ordenada por ventas |
| **P-186** | Ventas por mesero / Top meseros | P0 | Tabla con tickets atendidos, total, propinas |
| **P-187** | Ventas por área de cocina | P1 | |
| **P-188** | Ventas por modo de servicio | P1 | |
| **P-189** | Ventas por marca virtual (DK) | P1 | Solo si DK |
| **P-190** | Cumplimiento de tiempos cocina | P1 | Distribución de tiempos, p95, alertas |
| **P-191** | Cumplimiento de tiempos delivery | P1 | Por repartidor y agregado |
| **P-192** | No-shows reservaciones | P2 | |
| **P-193** | Descuentos por usuario (auditoría) | P1 | |
| **P-194** | Descuentos sospechosos (alertas) | P1 | Lista de alertas con detalles |
| **P-195** | Reimpresiones de comanda por cajero | P2 | |
| **P-196** | Cancelaciones por período (auditoría) | P1 | |
| **P-197** | Auditoría de eventos (log filtrable) | P1 | Tabla con filtros por categoría, usuario, fecha |
| **P-198** | Cortes de caja históricos | P0 | Lista de cortes con detalle por método |

---

## 17. Admin — Reservaciones (5)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-199** | Calendario de reservaciones (vista mes/semana) | P1 | Calendario con bloques de reservas |
| **P-200** | Lista de reservaciones del día | P0 | Tabla cronológica del día actual |
| **P-201** | Crear nueva reservación | P0 | Form: cliente, fecha/hora, comensales, mesa preferida |
| **P-202** | Editar / cancelar reservación | P0 | |
| **P-203** | Marcar llegada / no-show | P0 | Acciones rápidas desde la lista |

---

## 18. Admin — Delivery y apps externas (8)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-204** | Lista de asignaciones de delivery activas | P1 | Por repartidor, estado, tiempo |
| **P-205** | Detalle de asignación de delivery | P1 | Cronología completa |
| **P-206** | Historial de deliveries | P1 | Filtros por fecha/repartidor |
| **P-207** | Liquidaciones de repartidores (lista) | P1 | |
| **P-208** | Detalle de liquidación de repartidor | P1 | Con diferencias |
| **P-209** | Apps externas — subir CSV de liquidación | P1 | Upload + preview |
| **P-210** | Apps externas — vista de conciliación | P1 | Tickets POS vs liquidación app con matching |
| **P-211** | Apps externas — resolución manual de matching | P1 | Para items que no matched automáticamente |

---

## 19. Pantallas de sistema y errores (10)

| ID | Pantalla | Prioridad | Notas |
|---|---|---|---|
| **P-212** | Splash / loader inicial | P0 | Logo + spinner mientras carga la app |
| **P-213** | Pantalla offline (sin conexión) | P0 | Banner persistente cuando no hay internet |
| **P-214** | Sync en progreso (modal) | P0 | Cuando recupera conexión y sube datos offline |
| **P-215** | Resolución de conflictos de sync | P1 | Lista de conflictos pendientes con opciones |
| **P-216** | 404 — Página no encontrada | P1 | |
| **P-217** | 500 — Error de servidor | P1 | "Algo salió mal. [Reintentar] [Reportar]" |
| **P-218** | 403 — Acceso denegado por rol | P1 | "No tienes permisos para ver esta sección" |
| **P-219** | Tenant suspendido | P2 | "Tu cuenta está suspendida. Contacta soporte" |
| **P-220** | Sesión expirada — re-login modal | P0 | (duplicado funcional de P-012, mismo diseño) |
| **P-221** | Banner global de alertas/notificaciones | P0 | Toasts, banners persistentes (sync conflicts, errores menores) |

---

## 20. Plantillas de impresión (8)

Estas NO son pantallas de UI sino layouts para impresión térmica. Diseñar a 80mm de ancho (estándar térmica).

| ID | Plantilla | Prioridad | Notas |
|---|---|---|---|
| **P-222** | Ticket de venta (cliente) | P0 | Logo, nombre, dirección, items, totales, propina, gracias |
| **P-223** | Comanda de cocina | P0 | Folio, hora, modo servicio, items con modificadores y notas — GRANDE, claro |
| **P-224** | Cuenta provisional (sin cobrar) | P0 | Como ticket pero con leyenda "CUENTA — NO ES FACTURA" |
| **P-225** | Reporte X impreso | P0 | Resumen del turno en formato compacto |
| **P-226** | Reporte Z impreso | P0 | Más formal que X, con sello de cierre |
| **P-227** | Corte de caja impreso | P0 | Desglose por método con diferencias |
| **P-228** | Recibo de devolución | P0 | Con folio devolución, items, motivo |
| **P-229** | CFDI — representación impresa | P1 | PDF con info fiscal completa, código QR del SAT |

---

## 21. Resumen consolidado y orden sugerido

### 21.1 Resumen por prioridad

| Prioridad | Cantidad | Comentario |
|---|---|---|
| P0 (crítica MVP) | ~118 | Sin esto no se puede operar |
| P1 (importante MVP) | ~46 | Funciones que el negocio necesita pero pueden esperar 1-2 semanas tras lanzar |
| P2 (deseable, post-MVP cercano) | ~10 | Mejoras que enriquecen pero no bloquean |
| **TOTAL** | **~174** | |

### 21.2 Resumen por sección

| Sección | Pantallas | Prioridad dominante |
|---|---|---|
| 3. Autenticación y acceso | 12 | P0 |
| 4. Wizard de onboarding | 40 | P0/P1 |
| 5. POS — Operación principal | 28 | P0 |
| 6. POS — Mesas y cuentas | 10 | P0/P1 |
| 7. POS — Caja, turnos, cortes | 11 | P0 |
| 8. KDS — Pantalla de cocina | 5 | P0/P1 |
| 9. App Repartidor | 8 | P0 |
| 10. App Mesero | 8 | P0/P1 |
| 11. Admin — Catálogo | 15 | P0/P1 |
| 12. Admin — Inventario | 8 | P1/P2 |
| 13. Admin — Clientes | 4 | P1 |
| 14. Admin — Usuarios y permisos | 7 | P0 |
| 15. Admin — Configuración del negocio | 15 | P0/P1 |
| 16. Admin — Reportes | 22 | P0/P1 |
| 17. Admin — Reservaciones | 5 | P0/P1 |
| 18. Admin — Delivery/apps externas | 8 | P1 |
| 19. Sistema y errores | 10 | P0/P1 |
| 20. Plantillas de impresión | 8 | P0/P1 |

### 21.3 Orden sugerido para diseñar

Para no perderte y maximizar el aprendizaje del estilo visual, recomiendo este orden de trabajo:

**Bloque 1 — Sistema visual y patrones (Semana 1):**

1. Diseña la **pantalla más importante primero**: P-059 (POS Home — Dashboard del cajero). Aquí defines todo el sistema visual: colores, tipografía, componentes, espaciados.
2. Una vez que esa esté lista, diseña 5-10 componentes reutilizables como una "biblioteca": botón primario, secundario, destructivo; input; card; modal; drawer; tabla; toast/alert; navegación; header.
3. Estos componentes los reutilizas en TODAS las demás pantallas.

**Bloque 2 — Flujo crítico del POS (Semana 2):**

P-058, P-060, P-061, P-062, P-065, P-066, P-067, P-069, P-070, P-077, P-080.
Si estas funcionan, el POS funciona.

**Bloque 3 — Autenticación (Semana 2-3, paralelo):**

P-001 a P-012. Patrones más simples, se hacen rápido.

**Bloque 4 — Wizard de onboarding (Semana 3-4):**

P-013 a P-057. Es repetitivo (todos los pasos comparten layout), así que con 5-6 plantillas resuelves los 40.

**Bloque 5 — Admin web (Semana 4-5):**

P-128 a P-176. Aquí también hay mucho patrón compartido: tabla + filtros + form en modal.

**Bloque 6 — Apps móviles (Semana 5):**

P-112 a P-127. Variantes móviles de patrones ya establecidos.

**Bloque 7 — KDS y reportes (Semana 6):**

P-107 a P-111 (KDS) + P-177 a P-198 (reportes).

**Bloque 8 — Resto: sistema, errores, impresión (Semana 6-7):**

P-199 a P-229. Cierre.

### 21.4 Optimizaciones de tiempo

- **Diseña en componentes**, no en pantallas. Una vez que tienes 30 componentes bien definidos, ensamblar pantallas es rápido.
- **Reutiliza el wizard de onboarding como plantilla**: los 40 pasos comparten estructura (header de progreso + título + form + botones de navegación). Una sola plantilla maestra te genera 35 de ellos.
- **Las tablas del admin son todas iguales** estructuralmente. Una plantilla "Lista CRUD" + form modal te resuelve 50+ pantallas del admin.
- **Estados duplicados**: el modal de PIN (P-080) aparece en muchísimas pantallas. Diséñalo UNA vez, referénciaalo.

### 21.5 Tiempo estimado de diseño

Asumiendo dedicación parcial (~20 hrs/semana):

- Sistema visual y componentes base: **1 semana**
- POS principal: **1 semana**
- Wizard onboarding: **1 semana** (con plantillas)
- Admin completo: **2 semanas**
- Apps móviles: **0.5 semana**
- KDS y reportes: **1 semana**
- Cierre (sistema, errores, impresión): **0.5 semana**

**Total estimado: 7 semanas de diseño en Adobe Illustrator** para tener todos los mockups listos antes de empezar a programar.

---

## 22. Lo que NO se diseña en MVP

| Funcionalidad | Por qué se posterga | Cuándo |
|---|---|---|
| Modo oscuro | Doble esfuerzo, no es crítico inicialmente | Fase 2 |
| Multi-idioma (inglés además español) | Cliente es mexicano | Fase 4 |
| Dashboards interactivos avanzados (drilldown, drag-charts) | Sobre-engineering para MVP | Fase 2 |
| Tour interactivo / coachmarks dentro del POS | Documentación + wizard de onboarding cubren | Fase 2 |
| Personalización visual por tenant (themes, fuentes) | El accent color por tenant ya está; más customización después | Fase 3 |
| Apps nativas iOS/Android (Capacitor) | MVP es web responsive | Fase 3 |
| Variantes táctiles para impresoras antiguas (escala/contraste mayor) | Decidir según cliente | Bajo demanda |
| Soporte para báscula bluetooth | No es flujo común MVP | Fase 2 |
| Tablero de información para el cliente (cliente ve la cuenta en pantalla aparte) | Hardware extra requerido | Fase 2 |
| Vista de mapa para delivery con tracking en vivo | Requiere integración con GPS del repartidor | Fase 2 |

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Inventario completo de 229 pantallas únicas catalogadas (174 para MVP, 55 explícitamente diferidas). 7 decisiones de diseño (D85-D91). Organización en 17 secciones funcionales + 1 de impresión. 4 plataformas/dispositivos definidos con resoluciones específicas (POS 1280×800, móvil 390×844, KDS 1920×1080, Admin 1440×900). Sistema visual de referencia: paleta de colores neutra, tipografía Inter/SF Pro/Roboto, componentes base. Convenciones para estados (vacío/lleno/cargando/error), listas con paginación, modales vs drawers. Orden sugerido de diseño en 8 bloques distribuidos en ~7 semanas. Lista de lo que NO se diseña en MVP (10 items diferidos a Fase 2-4). |
| v1.1 | Mayo 2026 | Sistema visual cerrado con design system real (`mockups/00-design-system.html`) y primera pantalla piloto del wizard (`mockups/P-016-datos-negocio.html`). 4 decisiones nuevas (D92-D95): cards de producto del POS sin precio (D92, §2.9); prohibición de emojis, iconografía SVG de trazo (D93, §2.5); shell de aplicación fija sin scroll de página con header/footer anclados (D94, §2.10); sistema visual definitivo minimalista con acento naranja #E8502E + Sora/Inter Tight (D95, §2.1, §2.3). §2.1 Colores reemplazada: de paleta de referencia genérica a paleta definitiva minimalista. §2.3 Tipografía actualizada: de Inter/Roboto a Sora (display) + Inter Tight (body). §2.2 componentes ajustados a estilo sin sombras. Estilo objetivo confirmado: facilidad tipo Square. Wizard calibrado como balanceado (2-3 campos por paso), ayuda visual solo donde confunde, iconos de línea. |

---

**Fin del documento 08 — Inventario de Pantallas.**

Este es tu checklist completo para los mockups en Adobe Illustrator. Cuando termines de diseñar, lo ideal es organizar los archivos así:

```
mockups/
├── 00-sistema-visual/
│   ├── paleta-de-colores.ai
│   ├── tipografia.ai
│   └── componentes-base.ai
├── 01-autenticacion/
│   ├── P-001-login.ai
│   ├── P-002-login-pos.ai
│   └── ...
├── 02-wizard-onboarding/
│   ├── P-013-email-bienvenida.ai
│   ├── P-014-activacion-inicial.ai
│   └── ...
├── 03-pos-principal/
│   ├── P-058-apertura-turno.ai
│   ├── P-059-pos-home.ai
│   └── ...
├── (y así para cada sección)
└── 99-impresion/
    ├── P-222-ticket-cliente.ai
    └── ...
```

Mantener el ID (`P-XXX`) en el nombre del archivo es CRÍTICO para que el equipo de desarrollo pueda referenciar de vuelta a este documento.
