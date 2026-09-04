# El panel de plataforma como centro de control — diseño

**Fecha:** 2026-09-04 · **Decisión:** `docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md` ·
**Antecedentes:** `docs/diseno/platform.md` (reglas de diseño del panel), migración 0012
(provisioning), 0073 (señal de vida de la caja), 0081 (add-ons), 0086 (planes por paquete).

## 1. Problema

`apps/platform` es el único lugar desde el que VIM administra a sus clientes, y hoy tiene dos
fallas de fondo:

**Lo que se decide en el panel no llega al cliente.** Suspender o cancelar un tenant solo cambia
`tenants.estado`. Ni el POS web, ni el admin del dueño, ni la caja instalada leen ese campo: un
cliente suspendido sigue vendiendo exactamente igual. No existe ningún canal para mandarle un
aviso a una caja, la caja no reporta qué versión corre, y las tablas que la especificación
previó para módulos por cliente (`tenant_feature_flags`, 0002) y los límites de los planes
(`planes.max_sucursales`, `max_cajas_por_sucursal`) no los lee nadie.

**El panel es confuso.** Siete pestañas planas y un cajón lateral de 480 px donde se apilan diez
bloques sin jerarquía: plan, suscripción, onboarding, salud, add-ons, paquetes de folios, ajuste
de folios, notas, cambio de estado e impersonar. Las pantallas se cargan una vez y no se
refrescan. Y no cumple su propio documento de diseño: lo destructivo se confirma con un
`confirm()` del navegador y comparte fila con lo cotidiano.

Lo que sí funciona y se conserva: la bandeja de Atención como primera pantalla, el semáforo de
cajas con el origen de la señal, el detalle del último push rechazado, y la cartera CFDI
ordenada por urgencia.

## 2. Alcance

Cuatro entregas, en este orden. Cada una se publica sola.

| # | Entrega | Toca la caja instalada |
|---|---|---|
| 1 | Rediseño del panel + módulos y límites por cliente (§5) | No |
| 2 | Latido de la caja + bloqueo real por estado (§6, §7) | Sí (escritorio 0.4.58) |
| 3 | Avisos a las cajas (§8) | Sí (misma versión que 2 si coinciden) |
| 4 | Versiones de la caja desde el panel (§9) | Sí |

**No entra:** login individual de super-admin con MFA (A8 del roadmap; se mantiene la clave
compartida de `lib/server.ts`); cobro automático de suscripciones; Realtime hacia las cajas;
segunda instalación del mismo negocio (ADR 0004 sigue); firma asimétrica del manifiesto de
actualización (pendiente desde CN-008); notificaciones push al teléfono del dueño (ya existen en
el admin y no cambian).

## 3. Invariantes

- **La venta nunca se bloquea por falta de red.** Una caja sin latido reciente sigue operando con
  la última directiva que recibió. Solo bloquea una directiva que diga `bloqueado: true`.
- **Toda suspensión lleva gracia.** Entre "suspender" y "bloquear" hay días de aviso al cajero y
  al dueño. El panel no permite bloquear sin gracia salvo en cancelación por fraude, que exige
  motivo y confirmación escrita.
- **La caja no decide nada; obedece directivas.** No lee `tenants.estado` ni calcula gracia: la
  nube le manda un JSON ya resuelto y ella lo aplica tal cual.
- **Identidad por token, nunca por cuerpo.** El latido toma `caja_id` y `tenant_id` del JWT del
  dispositivo. El cuerpo solo trae versión y hechos locales.
- **Todo lo que escribe el panel queda en `super_admin_accesos`** con motivo. Sin excepciones.
- **Los datos son de otro** (`platform.md`): cada pantalla dice de qué cliente es lo que se ve.

## 4. Arquitectura

```
┌──────────────┐  escribe   ┌──────────────────────┐   latido cada 10 min    ┌──────────────┐
│ apps/platform│──────────▶ │ Postgres (nube)      │ ◀────────────────────── │ escritorio   │
│ service_role │            │ tenants · avisos     │   POST caja-latido      │ main.mjs     │
│ + auditoría  │            │ flags · límites      │ ─────────────────────▶  │ guarda JSON  │
└──────────────┘            │ versiones · cajas    │   { directivas }        └──────┬───────┘
                            └──────────┬───────────┘                                │ /__directivas
                                       │ RPC mi_acceso()                     ┌──────▼───────┐
                                       ▼                                     │ POS (UI)     │
                            ┌──────────────────────┐                         │ bloqueo /    │
                            │ POS web · admin      │                         │ aviso / banda│
                            └──────────────────────┘                         └──────────────┘
```

Un solo canal para las cuatro entregas: la función `resolver_directivas(tenant, caja)` calcula
en la nube el paquete completo, y lo consumen dos caminos distintos:

- **La caja instalada** por la Edge Function `caja-latido`, cada ciclo de sync, haya o no
  ventas. Lo guarda localmente y el POS lo lee por el servidor local, igual que hoy lee
  `/__estado-sync`.
- **El POS web y el admin** por la RPC `mi_acceso()`, bajo RLS, al montar la sesión y cada 10
  minutos.

Formato de las directivas (lo devuelven las dos rutas, idéntico):

```json
{
  "servidor_hora": "2026-09-04T18:20:00Z",
  "acceso": {
    "estado": "SUSPENDIDO",
    "bloqueado": false,
    "bloquea_desde": "2026-09-08T06:00:00Z",
    "mensaje": "Tu suscripción tiene un pago pendiente. Contacta a VIM antes del 8 de septiembre."
  },
  "modulos": { "delivery_apps": true, "kds": true, "recetas": false, "cfdi": true, "reservaciones": false },
  "limites": { "max_sucursales": 1, "max_cajas_por_sucursal": 2, "max_usuarios": 10 },
  "avisos": [
    { "id": "…", "nivel": "info", "titulo": "Mantenimiento", "cuerpo": "…", "requiere_confirmacion": false, "vigente_hasta": null }
  ],
  "version": { "minima": "0.4.58", "recomendada": "0.4.60", "url": "…", "sha512": "…", "notas": "…", "bloquea_bajo_minima": false }
}
```

## 5. Entrega 1 — Rediseño del panel

### 5.1 Navegación

De pestañas en la cabecera a **páginas del App Router** con barra lateral fija. La URL vuelve a
significar algo: un enlace a `/clientes/<id>` abre esa ficha, y el navegador puede recargar sin
perder el sitio.

| Ruta | Pantalla | Viene de |
|---|---|---|
| `/` | redirige a `/atencion` | — |
| `/atencion` | Bandeja de pendientes | pestaña Atención |
| `/clientes` | Lista de clientes con buscador y filtros por estado | pestaña Empresas |
| `/clientes/nuevo` | Alta de cliente | pestaña Nuevo cliente |
| `/clientes/[id]` | **Ficha de cliente** (§5.3) | cajón lateral |
| `/cfdi` | Cartera de facturación | pestaña CFDI |
| `/errores` | Errores de las apps | pestaña Errores |
| `/bitacora` | Bitácora de accesos | pestaña Bitácora |
| `/avisos` | Avisos a las cajas | nueva (entrega 3) |
| `/versiones` | Versiones de la caja | nueva (entrega 4) |

Métricas deja de ser pestaña: sus cuatro cifras (MRR, clientes, suspendidos/cancelados, folios
vendidos) pasan a una franja arriba de la lista de clientes. Eran una pantalla entera para
cuatro números.

La barra lateral muestra al lado de Atención el conteo de críticas, en `danger`, para que el
pendiente se vea desde cualquier pantalla.

### 5.2 Sesión

La clave de plataforma hoy vive en estado de React: al pasar a páginas, un refresco la perdería.
Se guarda en `sessionStorage` (muere al cerrar la pestaña, no sobrevive al navegador) y un
`layout.tsx` cliente envuelve todo: sin clave, pantalla de entrada; con clave inválida (401), se
borra y se vuelve a pedir. La API sigue igual: header `X-Platform-Key`, validado en
`lib/server.ts`. Esto no cambia el modelo de seguridad, solo dónde vive la clave durante la
sesión.

### 5.3 Ficha de cliente

Página completa, con cabecera fija (nombre comercial, código, vertical, pastilla de estado,
botón "Entrar como este cliente") y cuatro secciones navegables por anclas. El orden es el del
trabajo diario: primero saber si está operando, luego qué paga, luego lo que factura, y al final,
aparte y con fricción, lo que puede romperle el negocio.

**Operación.** Salud operativa (`SaludTenant`, sin cambios), semáforo de cajas, último push
rechazado. Más adelante aquí se verá la versión de cada caja (entrega 4) y los avisos vigentes
(entrega 3).

**Contrato.** Plan (selector, con el aviso de plan retirado que ya existe), suscripción (activar
cobro, pausar, reanudar), add-ons contratados, onboarding (fase y botones), y el bloque nuevo de
**módulos y límites** (§5.4). Notas internas al final.

**Facturación.** Datos fiscales, saldo de folios con base mensual, acreditar paquete y ajuste
manual. Es lo mismo que hoy, junto y con un solo encabezado.

**Zona peligrosa.** Fondo `danger/5`, borde `danger/30`, siempre al final y separada por un
espacio mayor. Contiene: suspender, cancelar y reactivar. Cada acción abre un diálogo propio
que:

1. Dice a quién afecta con nombre comercial y desde cuándo.
2. Pide motivo obligatorio (mínimo 10 caracteres).
3. Para suspender, pide días de gracia (por defecto 3; mínimo 1) y muestra la fecha resultante
   en hora de México.
4. Exige **escribir el nombre comercial** para habilitar el botón, como pide `platform.md`.
   Cancelar exige además marcar "Entiendo que el cliente dejará de poder vender".

Los `prompt()` y `confirm()` del navegador desaparecen del panel. Impersonar usa el mismo
componente de diálogo, con motivo obligatorio.

### 5.4 Módulos y límites por cliente

Dos capas, porque ya existen dos tablas con papeles distintos:

| Capa | Quién la mueve | Dónde vive | Qué significa |
|---|---|---|---|
| **Permitido** | VIM, desde el panel | `planes.features_incluidos` + `tenant_feature_flags` (override) | El cliente *puede* usar el módulo |
| **Encendido** | El dueño, desde su admin | `configuracion_tenant.modulo_*_activo` | El cliente *lo está usando* |

Un módulo no permitido no aparece encendible en el admin: la pantalla del dueño lo enseña
apagado con "No incluido en tu plan. Pídelo a VIM". La caja y el POS web reciben en
`directivas.modulos` el resultado de las dos capas (permitido AND encendido), y es lo único
que consultan.

Catálogo de módulos, fijo en código (`packages/db/modulos.ts`, un solo archivo compartido):

| Código | Nombre en pantalla | Hoy lo lee |
|---|---|---|
| `cfdi` | Facturación electrónica | `tenant_addon_activo('CFDI')` (0081) — se respeta: el add-on manda, el flag no lo pisa |
| `delivery_apps` | Apps de delivery (Uber, DiDi, Rappi) | integraciones del admin |
| `kds` | Pantalla de cocina | rol y áreas |
| `recetas` | Recetas e inventario | `modulo_inventario_activo` |
| `reservaciones` | Reservaciones | admin |
| `promociones` | Promociones | admin |

Límites: la fila del plan trae `max_sucursales`, `max_cajas_por_sucursal` y `max_usuarios`. Se
agrega la tabla `tenant_limites` (tenant_id PK, las tres columnas en NULL, `motivo`,
`updated_at`) para excepciones por cliente; el límite efectivo es `coalesce(override, plan)`. En
esta entrega los límites **se muestran y se editan**; la primera regla que los aplica es
"no se puede dar de alta una caja por encima del límite" en `provisionar-dispositivo`, y se hace
en esta misma entrega porque es una línea. Sucursales y usuarios se aplican en la entrega 2 vía
`mi_acceso()`.

Interfaz en la ficha: una lista de módulos con interruptor y tres estados por fila: "Incluido en
el plan", "Permitido por excepción" (con motivo visible) y "No incluido". Cambiarlo pide motivo.
Debajo, los tres límites con el valor del plan en gris y el override editable.

### 5.5 Migración `0102_platform_modulos_limites.sql`

- `CREATE TABLE tenant_limites (...)` con RLS negada a todos (solo service_role).
- `planes.features_incluidos` se rellena para los tres planes vigentes con el catálogo de
  módulos (los valores exactos por plan los fija Fermín al implementar; el default propuesto es
  todo `true` salvo `recetas` y `reservaciones` en el plan de entrada).
- Función `modulos_efectivos(p_tenant uuid) RETURNS jsonb`: permitido (plan + flags vigentes por
  fecha) AND encendido (`configuracion_tenant`). Para `cfdi`, permitido = `tenant_addon_activo`.
- Función `limites_efectivos(p_tenant uuid) RETURNS jsonb`.
- Ambas `SECURITY DEFINER`, ejecutables por `service_role` y `authenticated` (el admin las usa
  con `p_tenant = current_tenant_id()`, y devuelven `NULL` si el tenant no coincide).

### 5.6 Refresco

La bandeja de Atención, la lista de clientes y la ficha se recargan cada 60 segundos mientras la
pestaña está visible (`document.visibilityState`), y al volver a ella. Se muestra "actualizado
hace N s" en gris al pie. Sin websockets: el panel lo usa una persona.

### 5.7 API del panel

Las rutas existentes bajo `app/api/` se conservan. Se agregan:

- `PATCH /api/tenants/[id]` acciones nuevas: `modulo_permitir` / `modulo_quitar`
  (`{ codigo, motivo }`), `limites` (`{ max_sucursales?, max_cajas_por_sucursal?, max_usuarios?, motivo }`).
- `cambiar_estado` con `SUSPENDIDO` acepta `gracia_dias` (entero ≥ 1) y escribe
  `tenants.bloqueo_desde` (§6.2). Reactivar lo pone en NULL.

### 5.8 Diseño visual

Hereda `nucleo.md` y `platform.md`. Se carga la skill de diseño antes de escribir CSS
(`feedback_skills_emil`). Reglas concretas para esta app:

- Barra lateral de 220 px, fondo `surface`, borde `line`; el logotipo con la leyenda
  "Plataforma · interno" en `ink-3` para que no se confunda con el admin.
- Contenido con `max-width: 1100px`; la ficha de cliente puede llegar a 1200.
- Las tarjetas de sección tienen título en mayúsculas pequeñas `ink-3` como hoy.
- El azul de marca solo en un botón por pantalla; en la ficha ese botón es "Guardar" de la
  sección donde estés. La zona peligrosa usa `danger` aunque sea su acción principal.
- Componentes nuevos en `app/components/`: `barra-lateral.tsx`, `dialogo-confirmar.tsx`
  (motivo + nombre + gracia), `seccion.tsx`, `modulos-limites.tsx`. `page.tsx` se vacía y las
  funciones `Metricas`, `Empresas`, `DetalleDrawer` y `NuevoCliente` se mueven a sus páginas.

## 6. Entrega 2 — Latido y bloqueo real

### 6.1 Migración `0103_caja_latido_y_bloqueo.sql`

Columnas nuevas:

| Tabla | Columna | Para |
|---|---|---|
| `tenants` | `bloqueo_desde timestamptz NULL` | fecha a partir de la cual las directivas dicen `bloqueado: true`. NULL = sin bloqueo programado |
| `tenants` | `bloqueo_mensaje text NULL` | lo que verá el cajero; lo escribe el panel al suspender |
| `cajas` | `version_app text NULL` | última versión reportada |
| `cajas` | `ultimo_latido timestamptz NULL` | distinto de `ultima_conexion`: esta prueba que la caja está encendida aunque no venda |
| `cajas` | `so text NULL` | "Windows 11 10.0.26200", para soporte |

Funciones:

- `resolver_directivas(p_tenant uuid, p_caja uuid) RETURNS jsonb`. Compone `acceso` (estado,
  `bloqueado = estado IN ('SUSPENDIDO','CANCELADO') AND bloqueo_desde <= now()`, `bloquea_desde`,
  mensaje), `modulos_efectivos`, `limites_efectivos`, avisos vigentes (§8; vacío hasta esa
  entrega), y versión (§9; con lo que haya en `versiones_caja`, o `{}`). `SECURITY DEFINER`,
  solo `service_role`.
- `caja_latido(p_caja uuid, p_version text, p_so text, p_ip inet, p_avisos_vistos uuid[])
  RETURNS jsonb`: sella `ultimo_latido`, `ultima_ip`, `version_app`, `so`; registra lecturas de
  avisos; devuelve `resolver_directivas`. Solo `service_role`.
- `mi_acceso() RETURNS jsonb`: `resolver_directivas(current_tenant_id(), NULL)`. Ejecutable por
  `authenticated`. Como no lleva caja, no sella nada.

El semáforo del panel pasa a leer `ultimo_latido` como primera señal (antes de `ultima_conexion`,
`sync` y `venta`, que se conservan para cajas sin actualizar). `senal-caja.ts` gana una fuente
`latido` y su prueba.

### 6.2 Qué hace suspender

Desde la zona peligrosa: `estado = SUSPENDIDO`, `bloqueo_desde = hoy_mx + gracia_dias` a las
06:00 hora de México (para que el corte del día anterior ya esté cerrado), `bloqueo_mensaje` =
lo que escribió el operador (con un texto por defecto que menciona la fecha). Reactivar limpia
los tres. Cancelar pone `bloqueo_desde = now()` salvo que se capture gracia.

Nada de esto afecta al estado `INTERNO` ni a `TRIAL`; el trial vencido se sigue tratando desde
la bandeja de Atención y no bloquea solo.

### 6.3 Edge Function `caja-latido`

`POST /functions/v1/caja-latido`, `Authorization: Bearer <JWT del dispositivo>`. Misma
validación que `sync-push`: usuario válido, `tipo_identidad = DISPOSITIVO`. El `caja_id` sale
del correo sintético del dispositivo (`caja-<uuid>@dispositivos.vimpos.mx`, regla de
`desktop/src/auth.mjs`), nunca del cuerpo. Cuerpo: `{ version, so, avisos_vistos: [] }`. La IP
se toma de `x-forwarded-for`. Responde `{ directivas }`. Cualquier error del RPC responde 500 y
la caja conserva sus directivas anteriores.

### 6.4 Escritorio (0.4.58)

- En `sync-ciclo.mjs` el ciclo llama `latir()` **al principio de cada ciclo, siempre**, antes del
  push. Un fallo del latido no cuenta como fallo del ciclo ni dispara backoff: se registra y se
  sigue. Así el latido no puede frenar la subida de ventas.
- `directivas.mjs` (nuevo, sin dependencias de Electron, probado con reloj falso): guarda el JSON
  en `userData/directivas.json` con la hora de recepción, lo expone, y decide `bloqueado` solo
  con lo que dice el JSON. Si el archivo no existe (instalación nueva sin red), devuelve una
  directiva vacía que no bloquea nada.
- `ui-server.mjs` sirve `GET /__directivas` (solo caja, no cocina; sin datos del negocio más
  allá de lo que ya ve el cajero).
- La versión sale de `app.getVersion()`; el SO de `os.version()`.

### 6.5 POS (la interfaz de la caja y el POS web)

`apps/pos/app/lib/directivas.ts`: lee `/__directivas` si existe (escritorio) y, si no, llama
`mi_acceso()` (POS web). Función pura `evaluarAcceso(directivas, ahora)` →
`"ok" | "gracia" | "bloqueado"`, con prueba.

- **Gracia:** banda fija arriba en `warning` con el mensaje y la fecha; el cajero puede seguir.
  Se muestra también al abrir turno, en un diálogo que hay que cerrar.
- **Bloqueado:** pantalla completa antes del PIN, con el mensaje, el nombre del negocio, "Llama
  a VIM" y el teléfono de soporte. Sin salida. Las ventas locales que ya existen se siguen
  subiendo (el sync no se detiene) para que el cliente no pierda datos.
- El estado se reevalúa cada 60 s y en cada cambio de pantalla principal.

### 6.6 Admin del dueño

`AdminShell` llama `mi_acceso()` al montar y cada 10 minutos. En gracia: banda `warning` con el
mensaje. Bloqueado: el admin sigue entrando pero en **solo lectura** con banda `danger`: puede
ver reportes y su información fiscal (lo necesita para pagar y para cerrar su contabilidad), y
cualquier escritura devuelve un aviso. Los límites de sucursales y usuarios se aplican en las
pantallas de alta correspondientes con el mismo `mi_acceso()`.

## 7. Compatibilidad hacia atrás

Cajas con versión anterior a 0.4.58 no llaman al latido, no reciben directivas y no bloquean. El
panel las distingue: una caja con `version_app = NULL` se muestra como "sin latido · versión
anterior a 0.4.58" en gris, no en rojo. La entrega 4 sirve justamente para empujarlas a
actualizar.

## 8. Entrega 3 — Avisos a las cajas

### 8.1 Migración `0104_avisos_plataforma.sql`

```
avisos_plataforma (
  id uuid PK, tenant_id uuid NULL REFERENCES tenants,   -- NULL = todos los clientes
  nivel text CHECK (nivel IN ('info','warning','danger')),
  titulo varchar(120), cuerpo text,
  requiere_confirmacion boolean DEFAULT false,
  vigente_desde timestamptz DEFAULT now(), vigente_hasta timestamptz NULL,
  creado_por uuid, created_at, deleted_at
)
avisos_lecturas (aviso_id, caja_id, fecha, PRIMARY KEY (aviso_id, caja_id))
```

RLS: ninguna política para `anon`/`authenticated`; solo `service_role` y las funciones definer.
`resolver_directivas` incluye los avisos vigentes del tenant o globales, no borrados, ordenados
por nivel y fecha, máximo 10. `caja_latido` inserta en `avisos_lecturas` lo que venga en
`p_avisos_vistos` (ignorando ids que no existan).

### 8.2 Panel: `/avisos`

Lista de avisos vigentes y pasados, con "visto por N de M cajas" calculado desde
`avisos_lecturas`. Formulario: destinatario (todos, o buscador de cliente), nivel, título,
cuerpo (máximo 600 caracteres, sin HTML), vigencia, "requiere confirmación". Borrar es lógico y
queda auditado. Un aviso `danger` a todos los clientes pide escribir "TODOS" para enviarse.

En la ficha de cliente, la sección Operación enseña los avisos que le aplican y permite crear uno
para ese cliente sin salir.

### 8.3 Caja y POS

El POS muestra los avisos **al abrir turno** y **al volver de bloqueo de pantalla**, en un
diálogo con los avisos no vistos. Los `info` se cierran con un botón; los que piden confirmación
obligan a tocar "Entendido" y esa lectura se manda en el siguiente latido. Un aviso visto no se
vuelve a mostrar en esa caja (se guarda en `directivas.json`). En el POS web las lecturas se
registran vía RPC `marcar_aviso_visto(p_aviso uuid)` ejecutable por `authenticated`, con
`caja_id` NULL y el `usuario_id` de la sesión.

## 9. Entrega 4 — Versiones de la caja

### 9.1 Migración `0105_versiones_caja.sql`

```
versiones_caja (
  version text PK, url text, sha512 char(128), notas text, fecha date,
  publicada boolean DEFAULT true, es_minima boolean DEFAULT false,
  bloquea_bajo_minima boolean DEFAULT false, bloquea_desde timestamptz NULL,
  created_at
)
```

`resolver_directivas` devuelve como `recomendada` la versión publicada más alta y como `minima`
la marcada `es_minima` (solo una a la vez, con índice único parcial).

### 9.2 Panel: `/versiones`

Arriba, la tabla de cajas de todos los clientes con versión, SO, último latido y cliente, con
filtro "por debajo de la mínima". Abajo, el historial de versiones publicadas.

**Publicar versión:** el flujo actual (`npm run dist` → `release-manifest` → subir `latest.json`
a mano con `curl`) se reemplaza por un formulario que recibe el `latest.json` generado por
`release-manifest` (se pega o se sube). El servidor del panel valida el formato (versión semver,
URL en el dominio de releases, sha512 de 128 hex), inserta en `versiones_caja` y **sube el mismo
JSON al bucket `actualizaciones`** por la API de Storage con `x-upsert: true` y el header
`apikey` (ver `reference_publicar_latest_json`). El actualizador actual de la caja sigue
funcionando sin cambios: lee el mismo archivo de siempre.

**Exigir mínima:** marcar una versión como mínima pide motivo y confirmación. Con
`bloquea_bajo_minima` apagado (el default), las cajas viejas ven una banda `warning` permanente
"Hay una actualización pendiente" con botón para instalar. Encenderlo pide una fecha
(`bloquea_desde`) y confirmación escribiendo "BLOQUEAR"; a partir de ahí el POS de una caja por
debajo de la mínima se comporta como bloqueado (§6.5) con el mensaje "Actualiza para continuar" y
el botón de instalar disponible en esa pantalla.

### 9.3 Escritorio

`directivas.version` se compara con `app.getVersion()` usando `esMasNueva` de `updater.mjs`. Si
hay `recomendada` más nueva, se dispara el mismo flujo que hoy dispara el chequeo del feed (aviso
del sistema + entrada en la bandeja), sin esperar al chequeo horario. El bloqueo por mínima se
resuelve en `directivas.mjs` y se expone en `/__directivas` como `acceso.bloqueado` con
`motivo: "version"`, para que el POS use la misma pantalla.

## 10. Seguridad

- `apps/platform` sigue siendo la única app con `service_role` (regla dura 1). Nada de lo nuevo
  se llama desde el navegador con esa llave; todo pasa por `app/api/*` y `autorizar()`.
- `caja_latido` y `resolver_directivas` no tienen `GRANT` a `anon` ni `authenticated`. Solo la
  Edge Function las invoca. `mi_acceso()` sí es `authenticated`, pero solo devuelve lo del tenant
  de la sesión y no escribe.
- El cuerpo del latido se valida con Zod en la Edge Function: `version` semver de máximo 20
  caracteres, `so` máximo 80, `avisos_vistos` máximo 50 uuids. Nada del cuerpo llega a SQL sin
  pasar por ahí.
- Los avisos se guardan como texto plano y se renderizan como texto; nunca HTML.
- Publicar una versión valida que la URL apunte al dominio de releases configurado
  (`PLATFORM_RELEASES_HOST`) para que un operador no pueda apuntar a un binario ajeno por error.
- Toda acción nueva del panel escribe en `super_admin_accesos` con motivo. La bitácora gana
  filtros por acción y cliente.
- Se corre `security-review` al cerrar cada entrega.

## 11. Pruebas

**Entrega 1:** `vitest` para `evaluarConfirmacion` del diálogo (nombre exacto, motivo mínimo,
gracia ≥ 1) y para `modulos_efectivos`/`limites_efectivos` como pruebas SQL contra la base
local (`supabase db test` o el script `scripts/` que use el proyecto). Prueba manual en
`localhost:3002` contra Supabase local con el tenant Crazy Burgers: recorrer las nueve rutas,
suspender con gracia y ver `bloqueo_desde` en la base.

**Entrega 2:** `directivas.test.mjs` con reloj falso (sin archivo → no bloquea; JSON viejo →
sigue valiendo; `bloqueado: true` → bloquea). `sync-ciclo.test.mjs` extendido: el latido corre
siempre y su fallo no dispara backoff. `evaluarAcceso` en el POS. Prueba real: caja de
desarrollo vinculada al tenant de pruebas, suspender desde el panel con gracia de 1 día, ver la
banda; adelantar `bloqueo_desde` en la base, ver la pantalla de bloqueo en menos de 10 minutos;
reactivar, ver que se libera.

**Entrega 3:** aviso global con confirmación → aparece al abrir turno, "Entendido" → lectura en
`avisos_lecturas` y contador en el panel.

**Entrega 4:** publicar un manifiesto de prueba desde el panel → `latest.json` en el bucket con
el mismo contenido; marcar mínima → banda en la caja de desarrollo.

RLS cross-tenant: `mi_acceso()` con un JWT de otro tenant no devuelve nada del primero (prueba
SQL con `set role authenticated` y claims falsos, como las existentes).

## 12. Publicación

1. Entrega 1: migración 0102 con `supabase db push`, deploy de `apps/platform` en Vercel. Sin
   versión nueva de escritorio.
2. Entrega 2: migración 0103, `supabase functions deploy caja-latido` (funciona desde Windows,
   ver `reference_supabase_cli_token_windows`), deploy de `apps/pos` y `apps/admin`, escritorio
   **0.4.58** (`npm run dist` tarda más de 10 minutos, lanzar en segundo plano). Avisar a
   Knock-Out antes de que su caja se actualice.
3. Entrega 3: migración 0104 y redeploy de `caja-latido`. Si coincide en tiempo con la 2, va en
   la misma versión de escritorio.
4. Entrega 4: migración 0105, variable `PLATFORM_RELEASES_HOST` en Vercel, y a partir de ahí las
   versiones se publican desde el panel.

## 13. Riesgos y decisiones tomadas

- **Diez minutos de latencia** entre decidir en el panel y que la caja obedezca. Aceptado: toda
  acción que bloquea lleva días de gracia, y un aviso no necesita segundos.
- **Una caja apagada durante la gracia** verá el bloqueo al encender, sin haber visto la banda.
  Por eso el mensaje de bloqueo lleva teléfono y el admin del dueño también avisa.
- **La caja guarda las directivas en archivo, no en su Postgres**, para que estén disponibles
  aunque el backend local tarde en arrancar (el arranque intermitente de 0.4.56). Es un JSON de
  unos cientos de bytes.
- **Módulos con dos capas** y no una: fundir `tenant_feature_flags` con `configuracion_tenant`
  habría obligado a que el dueño y VIM escribieran la misma fila con permisos distintos.
- **La clave compartida sigue.** Cambiarla por login individual (A8) es otro proyecto y no
  bloquea nada de esto. Poner el panel detrás de Cloudflare Access sigue siendo la recomendación
  de menor esfuerzo mientras tanto.
- **No hay "deshacer" para cancelar.** Reactivar existe y limpia el bloqueo, pero un cliente
  cancelado que vuelve conserva su historial: no se borra nada. Eso ya era así.
