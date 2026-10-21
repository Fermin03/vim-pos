# Entrega 6 (cuentas de clientes de la tienda) — hechos del repo

Levantado el 9 oct 2026 en el worktree `vim-pos-tienda`, rama `feat/tienda-publica` (con la entrega 5).
Solo lectura. Cada afirmación lleva `archivo:línea`. Lo que NO se pudo comprobar en el repo se marca
**(sin verificar)**.

Abreviaturas:

- `F/` = `supabase/functions/` · `M/` = `supabase/migrations/` · `T/` = `apps/tienda/app/`
- `SPEC` = `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md`
- `P1`…`P5` = `docs/superpowers/plans/2026-10-0*-tienda-en-linea-{1-base,2-funcion,3-admin,4-caja,5-publica}.md`
- `A5` = `docs/superpowers/plans/anexos/2026-10-09-tienda-5-hechos-de-la-tienda-publica.md`
- `0161`…`0165` = `M/0161_tienda_en_linea_base.sql`, `M/0162_tienda_funcion.sql`, `M/0163_tienda_admin.sql`,
  `M/0164_tienda_caja.sql`, `M/0165_tienda_publica.sql`

Decisiones del dueño que este documento da por cerradas (`SPEC:51-53`, `:206-208`, `:383-384`): registrarse
o invitado; cuenta por restaurante con correo y contraseña; todos los datos para conectar lealtad después;
tablas propias (no Supabase Auth); cookie `HttpOnly` de primera parte puesta por el servidor de la tienda.

---

## 0. Lo que más errores evita (léelo primero)

1. **El pedido NO crea al cliente del negocio; lo crea el ticket.** `tienda_crear_pedido` solo guarda
   nombre/teléfono/correo/dirección en `delivery_pedidos` (`0162:734-756`). El `clientes` y la
   `direcciones_cliente` nacen al ACEPTAR, en `crear_ticket_desde_tienda` (`0161:437-448`, `:478-497`), que
   en un negocio con caja corre **en la caja**, donde las cuentas no existen (`0161:26-29`). Una cuenta no
   puede recibir su `cliente_id` «al pedir».
2. **Una acción nueva cae sola en el cupo de «lecturas» y abre si la base falla.** `cuposDe` trata todo lo
   que no es `seguimiento` ni `pedir` como lectura: 120/10 min por IP, `alFallar: "abrir"`
   (`F/_shared/tienda/respuesta.ts:54-59`). `entrar`, `registrar` y `recuperar_*` necesitan su rama propia.
3. **La app convierte en 503 cualquier estado que no esté en su lista.** `ESTADOS_CONOCIDOS` =
   200, 400, 403, 404, 409, 413, 429, 503 (`T/lib/servidor/funcion.ts:19`, `:53-56`). Un `401` de la función
   se registra como «revisa VIM_TIENDA_SECRET». «Sin sesión» o «contraseña incorrecta» no pueden viajar
   como 401 ni 423 sin tocar esa lista.
4. **Un solo dominio, muchas tiendas.** Todas viven en `pedidos.vimpos.com.mx/<slug>` (`T/lib/sitio.ts:2`) y
   la única puerta es `/api/tienda` (`T/api/tienda/route.ts:1`): una cookie con `Path=/<slug>` no llegaría a
   la ruta. La cuenta es por restaurante, así que el nombre de la cookie (o la validación) tiene que
   distinguir negocio. El spec exige la prueba «sesión de un negocio usada en otro» (`SPEC:416`).
5. **La ruta de servidor tira lo que no conoce, y hay pruebas que lo exigen.** Solo acepta `cotizar`,
   `pedir`, `seguimiento` (`route.ts:83`) y filtra claves (`route.ts:60-61`, `:93-98`); la prueba manda
   `p_cuenta` y `tenant_id` y comprueba que no pasan (`T/lib/__tests__/servidor.test.ts:329-339`). La cuenta
   de un pedido solo puede salir de la sesión, nunca del cuerpo (`P1:1682`).
6. **Los smokes existentes insertan cuentas con `password_hash = 'x'` y `telefono = '1'`**
   (`supabase/scripts/smoke_tienda_rls.sql:23-28`; `smoke_tienda_pedido.sql:62-65`). Un `CHECK` nuevo sobre
   la forma del hash o del teléfono los rompe: hay que ajustarlos en la misma entrega.
7. **El spec dice `scrypt` de `node:crypto` (`SPEC:381`), pero ninguna función del repo importa `node:`**
   (los únicos imports externos son `jsr:@supabase/supabase-js`, `djwt`, `npm:web-push` y `denomailer`:
   `F/_shared/http.ts:4`, `F/pin-login/index.ts:10`, `F/enviar-push/index.ts`, `F/_shared/correo.ts:50`). El
   precedente probado de contraseñas/PIN es bcrypt en SQL con `pgcrypto` (§4.1). Ver «Decisiones abiertas» 1.
8. **Los códigos de error de SQL necesitan al menos un guion bajo** para salir como rechazo de negocio
   (409): regex `CODIGO` en `respuesta.ts:82`; cualquier otro texto es 503 `SERVICIO_NO_DISPONIBLE`
   (`respuesta.ts:99-106`). Y el detalle solo sale para los códigos listados en `CON_DETALLE`
   (`respuesta.ts:89-92`).
9. **«Vaciar los datos de la cuenta» choca con los `NOT NULL`.** `email`, `password_hash`, `nombre` y
   `telefono` son `NOT NULL` (`0161:631-635`); el spec pide borrar sesiones y direcciones y vaciar la cuenta
   (`SPEC:404-405`). O se borra la fila (todo cuelga con `ON DELETE CASCADE`, `0161:648`, `:657`, `:666`) o
   se rellena con marcadores.
10. **La migración corre también en la caja.** Las 0163–0165 lo declaran y evitan `storage.*`, `cron.*`,
    `net.*` (`0163:7`, `0164:13`, `0165:6`). Las cuatro tablas de cuentas existen en la caja, vacías; no
    entran al sync (búsqueda sin resultados en `desktop/src/*.mjs`, `F/sync-pull`, `F/sync-push`). Siguiente
    número libre: **0166**, a confirmar contra `origin/main` **(sin verificar)**.
11. **`tienda_*` no está en la prueba de privilegios de funciones definer.** `supabase/tests/0003_grants_secdef.test.sql`
    pide «Al añadir una nueva RPC exclusiva de service_role, agrégala aquí» y no lista ninguna función
    `tienda_*` (búsqueda de «tienda» en el archivo: sin resultados). Sí están las tablas en
    `_rls_exentas` (`supabase/tests/0002_rls_cobertura.test.sql:33-36`).

---

## 1. Las tablas que ya existen

Todas en `0161` §4. Ninguna migración posterior (0162–0165) las toca: 0162 solo **lee** `tienda_cuentas`
(`0162:702-703`); 0163–0165 no las nombran.

### 1.1 `tienda_cuentas` (`0161:628-644`)

| Columna | Tipo y restricción | Línea |
|---|---|---|
| `id` | `uuid` PK, `DEFAULT gen_random_uuid()` | `0161:629` |
| `tenant_id` | `uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | `0161:630` |
| `email` | `citext NOT NULL` | `0161:631` |
| `password_hash` | `text NOT NULL` (sin formato ni algoritmo declarado) | `0161:632` |
| `nombre` | `varchar(100) NOT NULL` | `0161:633` |
| `apellido` | `varchar(100) NULL` | `0161:634` |
| `telefono` | `varchar(20) NOT NULL` (sin `CHECK` de 10 dígitos) | `0161:635` |
| `fecha_nacimiento` | `date NULL` | `0161:636` |
| `acepto_privacidad_at` | `timestamptz NULL` | `0161:637` |
| `intentos_fallidos` | `integer NOT NULL DEFAULT 0` | `0161:638` |
| `bloqueada_hasta` | `timestamptz NULL` | `0161:639` |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | `0161:640-641` |
| `deleted_at` | `timestamptz NULL` | `0161:642` |

- Único índice: `tienda_cuentas_email_uq` **único y parcial** sobre `(tenant_id, email) WHERE deleted_at IS NULL`
  (`0161:644`). Como `email` es `citext`, `ANA@…` choca con `ana@…` (probado: `smoke_tienda_rls.sql:26-31`).
  El mismo correo vive en dos negocios (mismo smoke, `:23-24`). Una cuenta con `deleted_at` libera su correo.
- **Lo que falta:**
  - disparador de `updated_at` (pendiente anotado: `P1:1690`; `tienda_config` y `tienda_sucursales` sí lo
    tienen, `0161:619-620`);
  - `UNIQUE (id, tenant_id)`, requisito de cualquier llave compuesta hacia ella (el molde es
    `sucursales_id_tenant_uq` + FK compuesta, `0161:582`, `:596-597`);
  - **no hay `cliente_id`** ni ninguna relación con `clientes`;
  - no hay columna de verificación de correo (`email_verificado_at` o parecida);
  - no hay `ultimo_acceso_at` ni fecha de cambio de contraseña;
  - no hay versión del aviso aceptado (solo la marca de tiempo; el registro de negocios guarda versión:
    `F/_shared/alta.ts:16`);
  - no hay índice por teléfono.

### 1.2 `tienda_sesiones` (`0161:646-653`)

| Columna | Tipo y restricción | Línea |
|---|---|---|
| `token_hash` | `text` PK — SHA-256 del token; el token solo vive en la cookie | `0161:647` |
| `cuenta_id` | `uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE` | `0161:648` |
| `tenant_id` | `uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | `0161:649` |
| `expira_at` | `timestamptz NOT NULL` | `0161:650` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | `0161:651` |

- Índice: `idx_tienda_sesiones_cuenta (cuenta_id)` (`0161:653`).
- **Falta:** que `tenant_id` sea el de la cuenta (hoy son dos FK independientes: se puede insertar una sesión
  del negocio A apuntando a una cuenta de B; `P1:1690`); índice por `expira_at` para purgar; nada purga las
  vencidas (no hay cron ni función); no hay `ultimo_uso_at`; `token_hash` sin `CHECK` de forma (el molde
  es `^[0-9a-f]{64}$`, `0162:696`).

### 1.3 `tienda_recuperaciones` (`0161:655-662`)

| Columna | Tipo y restricción | Línea |
|---|---|---|
| `token_hash` | `text` PK | `0161:656` |
| `cuenta_id` | `uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE` | `0161:657` |
| `tenant_id` | `uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | `0161:658` |
| `expira_at` | `timestamptz NOT NULL` | `0161:659` |
| `usada_at` | `timestamptz NULL` | `0161:660` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | `0161:661` |

- **Sin ningún índice aparte de la PK**: ni por `cuenta_id` (el `ON DELETE CASCADE` y «anular los enlaces
  anteriores» recorrerían la tabla). Misma falta de llave compuesta (`P1:1690`). Nada purga las vencidas.
- El spec la listaba sin `tenant_id` (`SPEC:203`); la migración sí lo trae (`0161:658`).

### 1.4 `tienda_direcciones` (`0161:664-680`)

| Columna | Tipo y restricción | Línea |
|---|---|---|
| `id` | `uuid` PK, `DEFAULT gen_random_uuid()` | `0161:665` |
| `cuenta_id` | `uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE` | `0161:666` |
| `tenant_id` | `uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` | `0161:667` |
| `etiqueta` | `varchar(50) NOT NULL DEFAULT 'Casa'` | `0161:668` |
| `calle` | `varchar(255) NOT NULL` | `0161:669` |
| `numero_exterior` | `varchar(20) NOT NULL` | `0161:670` |
| `numero_interior` | `varchar(20) NULL` | `0161:671` |
| `colonia` | `varchar(150) NOT NULL` | `0161:672` |
| `codigo_postal` | `varchar(5) NOT NULL` (sin `CHECK` de dígitos) | `0161:673` |
| `ciudad` | `varchar(100) NOT NULL` | `0161:674` |
| `estado` | `varchar(50) NOT NULL` | `0161:675` |
| `referencias` | `text NULL` (sin tope; el pedido la corta a 300: `0162:686`; `F/_shared/tienda/validar.ts:66`) | `0161:676` |
| `zona_envio_id` | `uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL` | `0161:677` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | `0161:678` |

- Índice: `idx_tienda_direcciones_cuenta (cuenta_id)` (`0161:680`).
- Las longitudes son las mismas de `direcciones_cliente` (`M/0007_catalogo_inventario.sql:588-594`) y de la
  validación del pedido (`0162:685-686`; `validar.ts:61-66`). Ojo con el nombre: aquí la columna es `estado`;
  en `direcciones_cliente` es `estado_geo` (`0007:594`); en el JSON del pedido la clave es `estado`
  (`0162:686`).
- **Falta:** llave compuesta con el negocio (`P1:1690`); que la zona sea del mismo negocio (la FK es solo a
  `zonas_envio(id)`; las zonas son **por sucursal**, `A5` §4.3, así que una dirección guardada con zona solo
  sirve en esa sucursal); `updated_at`; marca de «principal»; tope de direcciones por cuenta.

### 1.5 RLS y permisos de las cuatro (`0161:682-691`)

- `ENABLE` + `FORCE ROW LEVEL SECURITY`, **sin ninguna política** (`0161:686-687`).
- `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role`
  (`0161:688-689`). Ni el dueño las lee (`smoke_tienda_rls.sql:97-109`, que pregunta al catálogo y no con un
  `SELECT`).
- Registradas como exentas de política en `supabase/tests/0002_rls_cobertura.test.sql:33-36`. Una tabla
  nueva de cuentas tendría que añadirse ahí o la prueba `0002` falla (`:66`).
- Con `FORCE`, una función `SECURITY DEFINER` cuyo dueño no tenga `BYPASSRLS` no vería filas: el dueño de
  las funciones es quien aplica la migración (`postgres` en la nube y en la caja), y `tienda_crear_pedido`
  ya lee `tienda_cuentas` siendo definer y su smoke pasa (`0162:627`, `:702-703`; `smoke_tienda_pedido.sql:388-399`).

### 1.6 Cómo se relaciona hoy una cuenta con un pedido

- `delivery_pedidos.tienda_cuenta_id uuid NULL`, **sin llave foránea a propósito**: la tabla se espeja en la
  caja, donde las cuentas no existen (`0161:19`, `:26-29`). Sin índice (los únicos índices nuevos de 0161
  sobre esa tabla son el de seguimiento, `0161:34-35`).
- `tienda_crear_pedido(…, p_cuenta uuid DEFAULT NULL, p_total_esperado numeric DEFAULT NULL)` (`0162:616-625`):
  - paso 8: si `p_cuenta` viene, exige que exista con `tenant_id = p_tenant` y `deleted_at IS NULL`; si no,
    `CUENTA_INVALIDA` (`0162:700-705`); probado con cuenta de otro negocio, borrada e inexistente
    (`smoke_tienda_pedido.sql:388-399`);
  - la guarda en la fila (`0162:738`, `:750`); probado (`smoke_tienda_pedido.sql:220`);
  - **no usa la cuenta para nada más**: nombre, teléfono y correo salen de `p_cliente` (`0162:632-634`,
    `:749`) y la dirección de `p_direccion` (`0162:681-693`). No compara el teléfono del pedido con el de la
    cuenta.
  - Solo `service_role` (`0162:765-766`).
- La función `tienda` manda siempre `p_cuenta: null` (`F/tienda/index.ts:175`).
- La caja recibe `tienda_cuenta_id` en el espejo (`F/delivery-espejo/index.ts:32`;
  `desktop/src/delivery-espejo-plan.mjs:16`) pero nada lo usa.
- La retención de 30 días blanquea nombre, teléfono, correo, dirección y huella de seguimiento, pero **no
  `tienda_cuenta_id` ni `items` ni importes** (`0161:52-63`): el historial de la cuenta sobrevive sin el
  enlace de seguimiento.

### 1.7 El cliente del negocio (`clientes`) y un invitado hoy

- `tienda_crear_pedido` **no** inserta en `clientes`. Solo consulta, para bloquear: cliente `BLOQUEADO` por
  teléfono (`lealtad_resolver_cliente`) o más de 2 pedidos vivos del mismo teléfono → `NO_SE_PUDO_CREAR`,
  el mismo error en ambos casos (`0162:707-730`), con candado por negocio+teléfono (`0162:719`).
- Al aceptar, `crear_ticket_desde_tienda`:
  - resuelve al cliente **por teléfono** (`0161:438`); si no existe lo crea con `nombre`, `telefono` (solo
    dígitos), `email` del pedido y `created_by` = quien abrió el turno (`0161:439-444`); si existe y está
    bloqueado, `CLIENTE_BLOQUEADO` (`0161:445-448`). Si ya existía, **no actualiza** su nombre ni su correo;
  - a domicilio, busca en `direcciones_cliente` una igual (calle, exterior, interior, colonia, CP) y si no
    hay la crea con etiqueta `'Tienda en línea'` y la zona del pedido (`0161:478-496`), y la pone en el
    ticket (`0161:497`);
  - abre el ticket con ese `cliente_id` (`0161:458-461`) y `nombre_cliente` (`0161:525`).
- `clientes` (`M/0007_catalogo_inventario.sql:504-555`): `nombre varchar(200)`, `apellido_paterno`,
  `apellido_materno`, `telefono varchar(20)`, `email citext`, `estado`, `deleted_at`… **No tiene fecha de
  nacimiento** (la única `fecha_nacimiento` del esquema es la de `tienda_cuentas`, `0161:636`). Teléfono
  único por negocio entre vivos (`0007:566-568`).
- Consecuencia ya anotada: un pedido de invitado deja un cliente y una dirección **permanentes** en el
  negocio (`P2:1354`; `SPEC:460-461`).

### 1.8 Lealtad (0156–0160): por dónde se conectará la cuenta

- Los puntos se llevan **por `cliente_id`**: `lealtad_saldos` tiene PK `cliente_id` (`M/0156_lealtad.sql:89-97`)
  y `lealtad_movimientos.cliente_id NOT NULL` (`0156:55-58`).
- La identidad del cliente es el **teléfono**: `lealtad_resolver_cliente(p_tenant, p_cliente_id, p_telefono)`
  devuelve el cliente por id, por alias, o por teléfono comparado por dígitos, el más antiguo (`0156:952-967`;
  índice `idx_clientes_telefono_digitos`, `0156:134-136`; `SPEC:7`).
- `lealtad_saldo(p_tenant, p_cliente_id, p_telefono)` da saldo, vencimiento y mecánica (`0156:969-987`); solo
  `service_role` (`supabase/tests/0003_grants_secdef.test.sql`, fila `lealtad_saldo`).
- `clientes.codigo_publico` ya existe, inadivinable, «para la página pública de consulta (entrega 3)»
  (`0156:142-146`).
- Un pedido de la tienda aceptado es un ticket normal con `cliente_id`: acumula puntos sin código especial
  (`SPEC:117`). O sea: **hoy la cuenta y la lealtad ya se tocan por el teléfono que el cliente escribió**.
- Decidido: la cuenta «solo ve lo que ella misma creó»; **no** ve historial ni saldo de lealtad de ese
  teléfono, porque cualquiera puede escribir un teléfono ajeno; se abre en la tercera entrega con teléfono
  verificado (`SPEC:270-273`, `:38`).
- Para «quedar lista»: lo que una cuenta puede aportar a ese enlace futuro es su `telefono` normalizado a
  10 dígitos (misma regla que el pedido: `validar.ts:40-46`; `0162:653`) y, cuando haya verificación, una
  marca de teléfono verificado. No existe ninguna de las dos columnas de verificación (§1.1).

---

## 2. La función `tienda`

### 2.1 Cómo atiende hoy (orden de comprobaciones)

`F/tienda/index.ts`, función `atender`:

1. Solo `POST`; lo demás 405, también `OPTIONS` (no hay CORS) (`index.ts:70`, `:9-12`).
2. Secreto `x-vim-tienda` contra `VIM_TIENDA_SECRET` en tiempo constante; vacío = 401 siempre
   (`index.ts:72-73`; `F/_shared/delivery/interno.ts:15-17`).
3. Cuerpo acotado a 32 768 bytes → 413; NUL → 400; JSON → 400; forma con `leerCuerpo` → 400 con su código
   (`index.ts:47`, `:75-87`).
4. Cliente `service_role` e IP de `x-tienda-ip` (solo después del secreto) (`index.ts:90-91`;
   `respuesta.ts:15-18`).
5. **Cupo por IP antes de tocar el negocio** (`index.ts:94-96`); agotado → 429 `DEMASIADOS_INTENTOS`; base
   caída → 503 solo si la acción cierra (`index.ts:65-66`).
6. Negocio por slug con `tienda_negocio`; no existe / de baja / sin módulo → el mismo 404
   `TIENDA_NO_DISPONIBLE` (`index.ts:100-104`). `p_tenant` sale de ahí y nunca va en una respuesta.
7. Por acción (`index.ts:107-208`). En `pedir`: sucursal → antirobot → cupo del negocio → alta → correo en
   segundo plano (`index.ts:135-206`).
8. Cualquier excepción → log + 500 `ERROR_INTERNO` (`index.ts:211-219`).

Respuestas siempre con `Cache-Control: no-store` (`index.ts:51-52`). El handler **no tiene pruebas** (Deno y
la base); lo probado vive en `_shared/tienda/*.ts` con `node --test` (`index.ts:24-25`; `package.json:17`).

### 2.2 Qué hay que tocar para añadir una acción

- **`F/_shared/tienda/validar.ts`**
  - El tipo `Peticion` es una unión por `accion` (`validar.ts:14-23`).
  - `leerCuerpo` rechaza toda acción fuera de las cinco con `ACCION_INVALIDA` (`validar.ts:89-91`) y valida
    el slug antes que nada (`validar.ts:92-93`).
  - Validación **a mano, sin Zod**: estos módulos se prueban con Node, que no resuelve `npm:`
    (`validar.ts:1-2`; mismo criterio en `F/_shared/alta.ts:5-7`).
  - Reutilizable tal cual: `esUuid` (`:34-36`), `normalizarTelefono` → 10 dígitos o null (`:40-46`),
    `textoLimpio(x, max)` (quita controles e invisibles, recorta por caracteres) (`:51-57`), `leerDireccion`
    (no exportada; devuelve la forma `Direccion`) (`:59-67`), regex `CORREO` solo ASCII (no exportada, `:28`),
    `tieneNul` (`:82-84`).
  - El correo se normaliza a minúsculas y tope 254 (`validar.ts:124-125`).
- **`F/_shared/tienda/respuesta.ts`**
  - `cuposDe(accion, ip, negocio)` → `{ antes, despuesDelCaptcha, alFallar }` (`respuesta.ts:52-65`). La
    clave por IP usa `claveDeIp` (IPv6 por /64) (`:27-41`). Claves de hoy: `tienda:sigue:ip:…`,
    `tienda:lee:ip:…`, `tienda:pide:ip:…`, `tienda:pide:negocio:<slug>`.
  - `respuestaDeRpc(mensaje)`: `CODIGO: detalle` → 409 `{error, detalle?}`; lo demás → 503 (`:99-106`).
  - `respuestaDeCaptcha` (`:71-77`), `leerNegocio` (`:119-128`).
  - Aquí vive «qué parte de lo que devuelve la base puede salir» (`leerPedido`, `cotizacionPublica`,
    `:137-152`): el lugar para un `cuentaPublica` que no deje salir `password_hash`, `tenant_id` ni ids
    internos.
- **`F/tienda/index.ts`**: la rama de la acción y, si lleva sesión, leerla del sitio donde la mande la app
  (hoy la función solo lee dos cabeceras: `x-vim-tienda` y `x-tienda-ip`, `index.ts:73`, `:91`).
- **`F/_shared/turnstile.ts`**: `AccionCaptcha` es `"registro" | "reenvio" | "tienda_pedido"` (`turnstile.ts:18`);
  una acción de antirobot para el registro de clientes hay que añadirla ahí **y** en el componente
  (`packages/ui/src/components/captcha.tsx:46`).
- **`package.json:17`**: `test:functions` ya incluye `supabase/functions/_shared/tienda/*.test.ts`; un módulo
  nuevo en esa carpeta entra solo.
- **`supabase/functions/README.md`**: documenta contratos de funciones; **no tiene sección de `tienda`**
  (las apariciones de «tienda» ahí son de Uber y de 0164).

### 2.3 Helpers reutilizables, uno por necesidad

| Necesidad | Qué hay | Dónde |
|---|---|---|
| Token aleatorio | `nuevoCodigo()`: 128 bits, 22 caracteres base64url | `F/_shared/tienda/seguimiento.ts:7-12` |
| Forma del token | `esCodigo` (`^[A-Za-z0-9_-]{22}$`) | `seguimiento.ts:5`, `:14-16` |
| Huella | `huellaDe()`: SHA-256 en hex (64) con WebCrypto, corre igual en Node | `seguimiento.ts:18-21` |
| Huella corta de un correo para claves de cupo | `huella()` local de `signup-tenant` (SHA-256, 16 bytes, minúsculas) — no exportada | `F/signup-tenant/index.ts:46-49` |
| Comparación en tiempo constante | `igualesEnTiempoConstante(a, b)` (cadenas) | `F/_shared/delivery/firma.ts:11-16` |
| HMAC | `hmacSha256Hex` | `firma.ts:3-8` |
| Límites | `consumirCupo(s)`, `cupoAgotado` (pregunta sin sumar: «contar solo fallos»), tipo `Cupo` | `F/_shared/limite.ts:50-57`, `:104-150` |
| Antirobot | `verificarTurnstile` (fail-closed, hostname y acción), `hostnamesPermitidos` | `F/_shared/turnstile.ts:34-81` |
| Correo | `enviarCorreo({to, subject, html})`, `esc`, `soloAscii`, `enSegundoPlano` | `F/_shared/correo.ts:11-110` |
| Errores al log sin filtrar al cliente | `registrarError(funcion, codigo, causa)`, `textoDeError` | `F/_shared/errores.ts:13-22` |
| Cliente service_role | `clienteAdmin()` | `F/_shared/http.ts:10-11` |
| Cuerpo acotado | `leerCuerpoAcotado(req, max)` | `limite.ts:159-181` |

- **Hash de contraseñas: no hay ningún helper en TypeScript.** No existe en `_shared/` nada de PBKDF2,
  scrypt, bcrypt ni argon (búsqueda en `supabase/functions`: sin resultados). Lo que el código ya usa de
  WebCrypto: `crypto.getRandomValues`, `crypto.subtle.digest`, `crypto.subtle.importKey/sign` HMAC
  (`seguimiento.ts:8`, `:19`; `firma.ts:5-6`; `F/pin-login/index.ts:22-28`). `crypto.subtle.deriveBits` con
  PBKDF2 es WebCrypto estándar y `node:crypto.scrypt` existe en Deno, pero **ninguno se usa en el repo** y
  los límites de CPU del runtime de Supabase no están medidos aquí **(sin verificar)**.
- **Contraseñas/PIN en SQL (el precedente probado):** `pgcrypto` se crea en `M/0001_extensiones_y_helpers.sql:9`;
  los PIN se guardan con `crypt(p_pin, gen_salt('bf', 10))` (`M/0064_endurecer_pin.sql:44`, `:67`, `:126`;
  coste subido de 6 a 10 en `0064:5-7`) y se verifican con `crypt(p_pin, hash) = hash`
  (`M/0006_auditoria_y_auth_hook.sql:324`). Las funciones que lo usan fijan
  `SET search_path = public, extensions, pg_temp` porque en la nube `pgcrypto` vive en `extensions`
  (`0006:270`; `M/0047_cambiar_pin_propio.sql:9`). **En la caja también está**, en `public`
  (`desktop/sql/00-compat-shim.sql:146`; la caja lo usa para entrar: `desktop/src/auth.mjs:92`).
  Contradicción a tener presente: `M/0135_cfdi_emisor_verificado.sql:54-56` evitó `pgcrypto` «porque no hay
  garantía de que esté» en la caja, y `0156:143` generó un código «sin pgcrypto».
- **Correo, en detalle:**
  - SMTP de Hostinger con `VIM_SMTP_HOST/USER/PASS/PORT`; sin ellos devuelve `{enviado:false, motivo:"SIN_SMTP"}`
    sin lanzar (`correo.ts:26-32`). `from` es **siempre el buzón autenticado de VIM** (Hostinger rechaza otro),
    no el restaurante (`correo.ts:62`).
  - El asunto debe ser ASCII (`soloAscii`, `correo.ts:11-16`); todo texto ajeno va por `esc` (`:19-23`).
  - No se espera el envío: `enSegundoPlano` usa `EdgeRuntime.waitUntil` (`correo.ts:107-110`); así se manda el
    de pedido, después de responder (`index.ts:191-203`). Responder antes de enviar también iguala el tiempo
    de respuesta exista o no la cuenta.
  - El motivo de un fallo SMTP no se registra: «puede traer la dirección del cliente» (`index.ts:201-202`).
  - Plantillas existentes: pedido de la tienda, puro y probado (`F/_shared/tienda/correo-pedido.ts:7-26`,
    `correo-pedido.test.ts`); bienvenida al dueño (`F/_shared/bienvenida.ts:66`); aviso de alta a VIM
    (`F/_shared/alta.ts:209-228`). **No existe** plantilla de recuperación de contraseña ni de bienvenida al
    cliente de la tienda, que el spec prevé (`SPEC:304-305`).
  - Cómo se probó: las partes puras con `node --test` (`F/_shared/correo.test.ts:5-30`); `enviarCorreo` solo
    corre en Deno y se probó contra producción (`correo.ts:1-7`, `:34-44`, `:71-79`).
  - Base de los enlaces: secreto `VIM_TIENDA_URL`, sin barra final (`index.ts:188`); el enlace de seguimiento
    es `${base}/${slug}/pedido/${codigo}` (`index.ts:198`).
  - El correo de recuperaciones de Supabase Auth comparte un cupo de envíos del proyecto con invitaciones
    (`docs/operacion/registro-publico.md:65`); el de la tienda va por SMTP propio, no por GoTrue.
- **Registro sin datos personales:** nunca el cuerpo, el código, el secreto ni el token del captcha; el slug
  sí puede ir (`index.ts:22-28`). `registrarError` escribe `[funcion] CODIGO: mensaje` (`errores.ts:20-22`):
  no pasarle un correo ni un token como `causa`. La app registra el estado sin el cuerpo
  (`T/lib/servidor/funcion.ts:50`, `:54`, `:60`).

---

## 3. La app `apps/tienda`

### 3.1 La ruta de servidor `T/api/tienda/route.ts`

- Solo exporta `POST` (`route.ts:63`).
- **Mismo origen:** si viene `Origin` y su host no es el `Host` de la petición → 403 `ORIGEN_NO_PERMITIDO`;
  **sin `Origin` pasa** (`route.ts:64-72`; probado: `servidor.test.ts:313`).
- No mira `Content-Type`: hace `JSON.parse` de lo que llegue (`route.ts:74-79`).
- Cuerpo acotado a 32 KB leyendo por trozos (`route.ts:11`, `:43-58`).
- Acciones: `cotizar`, `pedir`, `seguimiento`; otra → 400 `ACCION_INVALIDA` (`route.ts:83`). `negocio` y
  `menu` no pasan por aquí: los leen componentes de servidor (`route.ts:81`).
- Slug y código se revisan antes de gastar una llamada (`route.ts:84`, `:88`).
- Filtrado de claves: `DE_CARRITO`, `DE_PEDIDO` (`route.ts:60-61`), por renglón y por modificador
  (`route.ts:24-36`), `cliente` y `direccion` (`route.ts:95-98`).
- Reenvía con `llamarTienda(limpio, ipDe(req.headers))` y devuelve el mismo estado y JSON con `no-store`
  (`route.ts:16`, `:102-103`).
- **No lee ni escribe ninguna cookie.** En todo el monorepo no hay un solo uso de `cookies()` ni de
  `Set-Cookie` (búsqueda en `apps/` y `packages/`): **no hay precedente** que copiar.

### 3.2 `T/lib/servidor/funcion.ts`

- `import "server-only"` (`funcion.ts:6`).
- `llamarTienda(cuerpo, ip)`: URL `${SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tienda`; cabeceras
  **exactamente** `content-type`, `x-vim-tienda`, `x-tienda-ip`; `cache: "no-store"`; límite 10 s
  (`funcion.ts:33-48`). Devuelve `{ estado, json }`; **no expone las cabeceras de la respuesta** de la función
  (`funcion.ts:13`, `:57-58`): la función no puede poner la cookie por sí misma; la pone la ruta.
- Estados que pasan tal cual: 200, 400, 403, 404, 409, 413, 429, 503 (`funcion.ts:19`); lo demás → 503
  (`funcion.ts:53-56`).
- `leer()` (negocio y menú): llama a **`headers()`** para sacar la IP, fuera de la caché (`funcion.ts:82`), y
  guarda con `unstable_cache` 30 s por clave `["tienda-negocio", slug]` / `["tienda-menu", slug, sucursal]`
  (`funcion.ts:68`, `:91`, `:103`, `:116`); no guarda errores, sí el 404 (`funcion.ts:83-97`).
  - **Confirmado: las páginas ya son dinámicas** — toda página que usa `negocioDeLaPeticion`/`leerMenu` lee
    `headers()` en cada petición (`funcion.ts:82`; `T/[negocio]/layout.tsx:12`; `T/[negocio]/page.tsx:49`,
    `:79`). Lo que se cachea es el **dato** del menú, no la página.
  - La IP entra por la clausura, no por la clave: «la entrada es del negocio, no del visitante»
    (`funcion.ts:79`). Una sesión leída de la cookie tiene que quedarse igual de fuera de la clave y del
    cuerpo cacheado.
- `negocioDeLaPeticion = cache(leerNegocio)`: una lectura por petición para layout, página y metadatos
  (`funcion.ts:110`).
- `ipDe`: `x-vercel-forwarded-for` → `x-real-ip` → primera de `x-forwarded-for` (`T/lib/servidor/ip.ts:8-11`).

### 3.3 `T/lib/api.ts` (navegador)

- `llamar()` hace `fetch("/api/tienda", { method: "POST", headers: {content-type}, body })` sin `credentials`
  explícito (`api.ts:45-47`); al ser mismo origen el navegador manda las cookies por omisión. Límite 20 s
  (`api.ts:34`).
- Devuelve `Resultado<T>` = `{ok:true, datos}` | `{ok:false, error, detalle}`; nunca lanza (`api.ts:13`,
  `:38-61`). Un 200 que no cumple el contrato es error (`api.ts:53-54`).
- Funciones: `cotizar`, `seguimiento`, `pedir` (`api.ts:66-85`). `CuerpoPedido` (`api.ts:20-32`).

### 3.4 `T/lib/contrato.ts`

- Tipos y lectores `unknown → tipo | null`: `negocioDe` (`contrato.ts:134`), `menuDe` (`:157`),
  `cotizacionDe` (`:179`), `pedidoDe` (`:189`), `seguimientoDe` (`:198`), `errorDe` (`:213`).
- Formas compartidas: `FORMA_SLUG`, `FORMA_UUID`, `FORMA_CODIGO` (`contrato.ts:80-82`).
- No hay ningún tipo de cuenta, sesión ni dirección guardada.

### 3.5 «Tus datos»: `T/lib/cliente.ts`, `T/components/datos.tsx`, `T/lib/envio.ts`

- Formulario plano de 12 campos: `nombre`, `telefono`, `email`, los ocho de dirección y `pagaCon`
  (`cliente.ts:11-17`); límites por campo (`cliente.ts:24-27`); reglas iguales a la función
  (`cliente.ts:51-67`); `datosDelPedido()` arma `cliente`, `direccion`, `pago`, `paga_con`
  (`cliente.ts:91-103`). Un solo campo `nombre` (no hay apellido).
- **Datos recordados:** `localStorage`, clave `vim.tienda.cliente` — **sin el negocio**: «es de todas las
  tiendas» (`cliente.ts:107-109`). Guarda nombre, teléfono, correo y la última dirección; nunca código,
  nota ni pago (`cliente.ts:106-110`). `leerCliente` (`:113-130`), `guardarCliente` solo tras un pedido que
  entró (`:136-142`; `datos.tsx:161`), `olvidarCliente` (`:145-147`).
- En pantalla: lo recordado se lee tras hidratar y **solo rellena lo vacío** (`datos.tsx:123-126`); hay un
  borrador en memoria del módulo (`datos.tsx:79`, `:99-102`); aviso «Llenamos tus datos con los de tu último
  pedido… Olvidar mis datos» (`datos.tsx:295-302`); texto legal y enlace al aviso (`datos.tsx:291-294`).
- Campos con `autoComplete` del navegador (`datos.tsx:234-236`, `:246-256`). No hay campo de contraseña en
  ninguna pantalla.
- Envío: `mandar()` construye el cuerpo con `datosDelPedido(datos, …)` y llama a `pedir`
  (`datos.tsx:148-168`); antirobot con `Captcha accion="tienda_pedido"` (`datos.tsx:309`).
- `PropsDelPasoDeDatos` no recibe cuenta ni sesión (`datos.tsx:23-37`). `PasoDeDatos` se monta dentro de la
  hoja del carrito en `T/components/tienda.tsx:203-205`; `<Tienda>` recibe `negocio`, `sucursal`, `menu`,
  `ahora` desde la página (`T/[negocio]/page.tsx:84`).
- `envio.ts`: mapa de códigos a qué hace la pantalla (`envio.ts:35-38`, `:41-57`). `CUENTA_INVALIDA` ya
  tiene texto genérico (`T/lib/textos.ts:78`) pero ningún tratamiento propio (cae en «reintentar»).
- Textos por código de error: `T/lib/textos.ts:62-95`; ahí no hay ninguno de cuentas.

### 3.6 Layout, pie, robots, cabeceras

- `T/layout.tsx`: metadatos por omisión y fuentes; sin nada por visitante (`layout.tsx:6-27`).
- `T/[negocio]/layout.tsx` (servidor): cabecera con logo/inicial y nombre enlazando a `/<slug>`
  (`layout.tsx:17-31`); pie «Pedidos con VIM POS» + enlace «Aviso de privacidad» (`layout.tsx:33-43`). **Es
  el sitio natural para «Entrar / Mi cuenta»** y no tiene hoy nada dependiente de quién visita.
- Rutas existentes bajo `[negocio]`: `page.tsx`, `pedido/[codigo]/page.tsx`, `privacidad/page.tsx`. **No
  existen** `cuenta`, `entrar`, `registro` ni `recuperar`.
- `T/robots.ts`: `allow: "/"`, `disallow: ["/*/pedido/", "/api/"]` (`robots.ts:5-7`). Las rutas de cuenta
  quedarían indexables salvo que se añadan.
- `apps/tienda/next.config.mjs`: `cabecerasSeguridad` para todo (`:22`) y, para `/:negocio/pedido/:path*`,
  `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow` (`:25-31`). El enlace de recuperación
  llevará un token en la URL: es el mismo caso que el de seguimiento.
- CSP compartida: `form-action 'self'`, `connect-src 'self' …`, `frame-ancestors 'none'`
  (`packages/config/cabeceras-seguridad.mjs:36-45`). Nada que impida una cookie de primera parte.
- Aviso de privacidad provisional (`T/[negocio]/privacidad/page.tsx:36-88`): dice que se piden nombre,
  teléfono, correo opcional y dirección; que quitar los datos se pide al restaurante por teléfono; **no
  menciona cuentas, contraseñas ni cookies**. El texto definitivo es de la entrega 7 (`P5:32`; `SPEC:437`).
- Diseño: `docs/diseno/tienda.md:9` describe al cliente como alguien que «No tiene cuenta»; no hay sección
  de cuentas.
- Next `^15.5.25`, React 19 (`apps/tienda/package.json:15-17`).

### 3.7 Qué habría que tocar (hechos que lo condicionan)

- **Poner / leer / borrar la cookie.** Solo la ruta de servidor puede: `llamarTienda` no devuelve cabeceras
  (§3.2) y la función no ve el navegador. Hoy `responder()` arma la respuesta con `Response.json(json, {status,
  headers})` (`route.ts:16`): ahí cabe un `Set-Cookie`. El token tendría que venir en el JSON de la función
  y **quitarse antes de contestar al navegador** (regla vigente: la ruta devuelve «el mismo JSON»,
  `route.ts:102-103`; `P5:78`).
- **Reenviar la sesión a la función.** Dos caminos y ninguno existe: una cabecera nueva (hoy son tres fijas,
  `funcion.ts:44`) o un campo del cuerpo puesto por el servidor después del filtrado (`route.ts:93-99`). La
  función registra errores sin cuerpo ni cabeceras (`index.ts:26-27`).
- **Sesión en los componentes de servidor.** `leer()` cachea por slug (`funcion.ts:91`): la sesión no puede
  entrar ahí. Una lectura de cuenta sería otra llamada, sin `unstable_cache`, que además gasta cupo del
  visitante (`index.ts:94-96`).
- **CSRF.** Ya hay: comprobación de `Origin` (`route.ts:64-72`) y solo `POST`. Con `SameSite=Lax`
  (`SPEC:383`) el navegador no manda la cookie en un `POST` entre sitios. Huecos a decidir: sin `Origin` pasa
  (`route.ts:67`) y no se exige `Content-Type: application/json` (`route.ts:74-79`).
- **«Entrar / Mi cuenta» sin romper la caché del menú.** La página ya es dinámica y lo cacheado es el dato
  (§3.2): pintar según la cookie en `T/[negocio]/layout.tsx` no invalida `unstable_cache`. La cookie es
  `HttpOnly`, así que el navegador no puede saber por sí mismo si hay sesión.
- **Prellenar «Tus datos».** El formulario ya acepta un parcial que «solo rellena lo vacío»
  (`datos.tsx:123-126`). La cuenta trae `nombre` + `apellido` separados y el formulario un solo `nombre`
  (`0161:633-634`; `cliente.ts:11-15`). Las direcciones guardadas usan las mismas claves que el pedido salvo
  `zona_envio_id` (§1.4).
- **`pedir` con sesión.** `index.ts:175` pasa `p_cuenta: null`; el cuerpo que llega del navegador no puede
  traer la cuenta (§0.5).
- **Pruebas.** `T/lib/__tests__/servidor.test.ts` ya simula `fetch`, `next/cache` y `next/headers`
  (`servidor.test.ts:6-18`, `:31-45`) y cubre la ruta (`:223-370`); `next/headers` solo simula `headers`,
  no `cookies`.

---

## 4. Precedentes de autenticación propia

### 4.1 `pin-login` + `verificar_pin_login`

- La función autentica primero al llamante y solo entonces prueba el PIN (`F/pin-login/index.ts:41-52`).
- Toda la lógica vive en una RPC definer solo para `service_role` (`M/0006_auditoria_y_auth_hook.sql:263-355`):
  - **amarra caja → negocio → acceso ANTES de verificar o de mover el contador**, para que nadie bloquee a
    un empleado de otro negocio (`0006:287-310`);
  - si está bloqueada: responde sin verificar (`0006:318-321`);
  - fallo: suma `intentos_pin_fallidos`, bloquea 5 min a los 3, bloqueo de administrador a los 6, y registra
    el intento (`0006:324-338`);
  - éxito: contador a 0 y `bloqueado_hasta = NULL` (`0006:341-346`).
- Formato de respuesta: `{ok:false, motivo, intentos_restantes?, bloqueado_hasta?}` (`0006:336-337`); la
  función lo traduce a 401 / 423 / 403 (`pin-login/index.ts:74-80`). (423 no está entre los estados que la
  app de la tienda deja pasar: §0.3.)
- Un usuario que no existe contesta lo mismo que un PIN malo (`0006:281-285`).
- Sesión: JWT firmado, 12 h (`pin-login/index.ts:83-97`); no hay tabla de sesiones que copiar.

### 4.2 `resetear-pin`, `cambiar_pin_propio`

- `resetear-pin` valida formato, permisos y jerarquía y delega en la RPC (`F/resetear-pin/index.ts:29`,
  `:54-78`). El hash se hace en SQL (`0064:126`).
- `cambiar_pin_propio` exige el PIN actual antes de cambiarlo (`0064:64-67`) — el patrón para «cambiar mi
  contraseña» estando dentro.

### 4.3 Registro público de negocios (`signup-tenant`, `_shared/alta.ts`)

- Orden: **cupos antes de validar** («un intento inválido también cuesta»), luego captcha, luego crear
  (`F/signup-tenant/index.ts:13-15`, `:63-90`; `alta.ts:145-152`).
- Fail-closed si la base de cupos no responde (`signup-tenant/index.ts:85-87`).
- Política de contraseña: mínimo 8, máximo 72 («tope de bcrypt») (`alta.ts:95-96`).
- Teléfono a 10 dígitos (`alta.ts:41-46`); términos obligatorios y versión sellada (`alta.ts:16`, `:66-68`).
- **No revelar existencia — dos comportamientos:**
  - el **alta** sí contesta `EMAIL_YA_REGISTRADO` (409) (`alta.ts:157`); es un riesgo aceptado y escrito
    (`docs/operacion/registro-publico.md:106-113`), con la salida prevista: «contestar siempre "revisa tu
    correo" y mandar al correo existente un aviso de "ya tienes cuenta"» (`registro-publico.md:112-113`);
  - el **reenvío** contesta siempre lo mismo (`alta.ts:187-204`) y aplica un cupo de «uno por correo por
    minuto» **exista o no** la cuenta, con la clave hecha de la huella del correo (`signup-tenant/index.ts:66-74`,
    `:46-49`).
- Verificación de correo y recuperación: las hace GoTrue (`signup-tenant/index.ts:138-143`); no hay
  implementación propia que copiar.
- Códigos en MAYÚSCULAS y `detalle` solo cuando sirve; el texto crudo de GoTrue va al log (`alta.ts:158`).

### 4.4 Sesiones de dispositivo

- Cuentas sintéticas en Supabase Auth (`F/_shared/dispositivo.ts:17-31`) y validación «la caja sigue activa»
  en cada uso (`dispositivo.ts:47-52`). No aplica a las cuentas de clientes; el patrón útil es **revalidar el
  estado de la cuenta en cada petición**, no solo la firma.

---

## 5. Seguridad y privacidad ya decididas

| Tema | Lo decidido | Fuente |
|---|---|---|
| Una puerta | Ninguna tabla ni RPC nueva para `anon`; la app no tiene llave de servicio | `SPEC:378` |
| Aislamiento | El negocio sale del slug; sesiones, cuentas y pedidos llevan `tenant_id` y toda consulta filtra por él | `SPEC:277-278`, `:379-380` |
| Contraseñas | `scrypt` de `node:crypto`, sal por cuenta, comparación en tiempo constante; **mínimo 8 caracteres** | `SPEC:381-382` |
| Sesión | Token aleatorio en cookie `HttpOnly`, `Secure`, `SameSite=Lax`, **30 días**; en la base solo su SHA-256 | `SPEC:383-384` |
| Cierre | Acción `salir`; **cambiar la contraseña cierra las demás sesiones** | `SPEC:287`, `:384` |
| Recuperación | Token de **un solo uso**, **30 minutos**, guardado como huella | `SPEC:385` |
| Sin enumeración | **Registro y recuperación responden igual exista o no el correo** | `SPEC:386` |
| Límite `entrar` | 10 cada 10 min por IP; **5 fallos seguidos bloquean la cuenta 15 min** | `SPEC:393` |
| Límite `registrar` | 5 por hora por IP | `SPEC:394` |
| Límite `recuperar_pedir` | 3 por hora por correo y por IP | `SPEC:395` |
| Fallo del control de cupos | Las acciones que escriben se niegan | `SPEC:399-400` |
| Antirobot | Turnstile en `pedir` y `registrar` | `SPEC:401-402` |
| Registros | Nunca contraseñas, tokens ni códigos de seguimiento | `SPEC:403` |
| Borrado de cuenta | «Borra sesiones y direcciones y vacía los datos de la cuenta» | `SPEC:404-405` |
| Retención de pedidos | Se anonimizan a los 30 días con el proceso existente (cron diario 04:10) | `SPEC:404`; `M/0095_delivery_retencion.sql:53` |
| Verificar correo | **Registro dentro del flujo de compra, sin confirmar correo antes de pedir** | `SPEC:270` |
| Qué ve la cuenta | Solo lo que ella creó: sus direcciones y sus pedidos en línea; ni historial ni saldo de la caja | `SPEC:270-273` |
| «Mi cuenta» | Datos, direcciones, historial con «pedir de nuevo», cerrar sesión, eliminar cuenta | `SPEC:259` |
| Acciones | `registrar`, `entrar`, `salir`, `recuperar_pedir`, `recuperar_aplicar`, `cuenta`, `direcciones`, `mis_pedidos`, `eliminar_cuenta` (las cuatro últimas exigen sesión) | `SPEC:287-289` |
| Correos | Confirmación de pedido, recuperación de contraseña y bienvenida | `SPEC:304-305` |
| Cuenta del pedido | `tienda_cuenta_id` solo desde la sesión y del mismo negocio | `P1:1682` |
| Pruebas exigidas | Sesión de un negocio usada en otro; token de recuperación reusado; cupos agotados | `SPEC:415-416` |
| Responsable de los datos | El restaurante; VIM trata por encargo | `SPEC:449-450` |
| ADR | Uno nuevo: la tienda es un canal y sus clientes no viven en Supabase Auth (el último es el 0031) | `SPEC:447-448`; `docs/decisiones/` |

Lo que **no** está decidido en ningún documento: longitud máxima de la contraseña; qué se conserva en el
negocio al eliminar la cuenta (el `clientes` y la `direcciones_cliente` que creó un ticket no cuelgan de la
cuenta: §1.7) ni qué pasa con `delivery_pedidos.tienda_cuenta_id` de sus pedidos; purga de sesiones y
enlaces vencidos; si «salir» cierra una sesión o todas; qué se registra de un inicio de sesión (no hay tabla
de intentos como `pin_intentos`, `0006:282-283`); edición de datos de la cuenta (el spec dice «Datos» sin
más, `SPEC:259`).

---

## 6. Smokes y pruebas existentes

- **Runner:** `cd desktop && npm run smokes [-- archivo.sql]` (`desktop/package.json:38`). Levanta un Postgres
  embebido recién sembrado, corre **todos** los `supabase/scripts/smoke_*.sql` (`desktop/scripts/smokes.mjs:22-24`),
  cada uno en una transacción que revierte (`smokes.mjs:41-49`), **como `postgres`, que se salta RLS**
  (`smokes.mjs:11-12`). Bloquean el merge. Ese Postgres tiene `pgcrypto` (§2.3): un smoke puede ejercitar
  `crypt()`.
- **Los que tocan estas tablas:**
  - `smoke_tienda_rls.sql`: correo repetido por negocio y `citext` (`:23-31`); privilegios y RLS forzada de
    las cuatro tablas (`:97-109`).
  - `smoke_tienda_pedido.sql`: fixture de tres cuentas (`:62-65`), `tienda_cuenta_id` guardado (`:220`),
    `CUENTA_INVALIDA` en tres casos (`:388-399`). Su constante `c_firma` fija la firma de
    `tienda_crear_pedido` (`:13`): cambiarla obliga a tocar el smoke.
  - Los demás `smoke_tienda_*.sql` (admin, caja_lista, canal, cotizar, estado*, menu*, modulo, seguimiento,
    ticket) no tocan cuentas.
- **pgTAP** (`supabase test db`, job `rls-tests`): `0002_rls_cobertura` (tablas exentas, `:33-36`) y
  `0003_grants_secdef` (lista de funciones solo-`service_role`; sin `tienda_*`, §0.11).
- **Funciones:** `pnpm test:functions` = `node --test --experimental-strip-types` sobre `_shared/**.test.ts`,
  incluida `_shared/tienda/` (`package.json:17`). Existentes: `validar.test.ts`, `respuesta.test.ts`,
  `seguimiento.test.ts`, `correo-pedido.test.ts`.
- **App:** `pnpm --filter ./apps/tienda test` (vitest, `apps/tienda/package.json:10`); `servidor.test.ts`
  cubre la ruta y el cliente de la función.
- **Cómo probar las funciones SQL nuevas** (con los moldes de arriba): un `smoke_tienda_cuentas.sql` con el
  fixture de dos negocios de `smoke_tienda_pedido.sql:57-65`, llamando a las RPC como `postgres` y
  comprobando: registro y correo repetido (mismo negocio / otro negocio); entrar bien, mal, cinco fallos y
  bloqueo, y que un intento contra el slug de otro negocio no mueve el contador (molde `0006:287-310`);
  sesión vencida, cerrada y **usada con el `tenant_id` de otro negocio**; recuperación usada dos veces y
  vencida; cambio de contraseña que borra las otras sesiones; direcciones de otra cuenta; eliminar cuenta y
  qué queda; y al final el bloque de privilegios (`has_function_privilege('anon'|'authenticated', …)` falso,
  como pide `P2:1303`). El tiempo se controla pasando `p_ahora` como hace `tienda_negocio`
  (`0163:103`), no con `CURRENT_DATE`.
- En local las Edge Functions no corren y el CLI de `supabase` está prohibido (`P2:35`; `P4:263`): la entrega
  5 verificó en navegador con un servidor de prueba que llama a las mismas funciones SQL (`P5:204`). El
  handler de la función sigue sin prueba automática.

---

## 7. Decisiones abiertas (con recomendación en una línea)

1. **Dónde se verifica la contraseña (Deno con scrypt, como dice `SPEC:381`, o SQL con `pgcrypto`).** →
   SQL con `crypt()`/bcrypt coste ≥ 10: es el único precedente probado (`0006:324`, `0064`), está en la nube
   y en la caja, deja verificación + contador + sesión en una transacción que los smokes sí cubren; que
   las cuentas solo vivan en la nube hace irrelevante la caja salvo para que la migración aplique. Es un
   cambio respecto al spec: anotarlo en el ADR.
2. **Longitud máxima de la contraseña.** → 72, como el registro de negocios (`alta.ts:96`); bcrypt ignora lo
   que pase de ahí.
3. **Cookie con varias tiendas en un dominio.** → Una cookie por negocio (nombre con el slug, `Path=/`,
   `HttpOnly; Secure; SameSite=Lax`, 30 días) y, además, la base exige `tenant_id` de la sesión = negocio
   del slug.
4. **Cómo viaja la sesión de la app a la función.** → Cabecera propia puesta solo por el servidor
   (`x-tienda-sesion`), junto a `x-vim-tienda`; así el filtrado del cuerpo no cambia y nada del navegador
   puede fijarla.
5. **Estado HTTP de «sin sesión» y «credenciales incorrectas».** → 403 con código (`SESION_INVALIDA`,
   `CREDENCIALES_INVALIDAS`), que la app ya deja pasar; no tocar la regla del 401.
6. **Mensajes sin enumeración.** → `entrar`: un solo error para correo inexistente, contraseña mala y cuenta
   bloqueada; `recuperar_pedir`: siempre «si existe, te escribimos»; `registrar` con correo ya usado:
   misma respuesta de éxito y un correo «ya tienes cuenta» al dueño del correo (la salida prevista en
   `registro-publico.md:112-113`), **sin** abrir sesión.
7. **Sesión inmediata tras registrarse sin verificar el correo.** → Sí abrir sesión (lo pide `SPEC:270`),
   pero solo cuando el correo era nuevo; el caso «ya existía» no entra (punto 6).
8. **¿Verificar el correo antes de pedir?** → No (decidido en `SPEC:270`); añadir desde ya la columna
   `email_verificado_at` vacía y sellarla cuando el cliente use un enlace de recuperación.
9. **Bloqueo por 5 fallos sin dejar que un tercero bloquee a alguien.** → Mantener los 15 min del spec pero
   contar los fallos solo después del cupo por IP y del negocio correcto (molde `0006:287-310`), y que un
   enlace de recuperación usado levante el bloqueo.
10. **Antirobot en `entrar` y `recuperar_pedir`.** → Solo en `registrar` (decidido) y en `recuperar_pedir`
    (manda correo a terceros); `entrar` queda con cupos y bloqueo. Acciones nuevas `tienda_registro` y
    `tienda_recuperar` en `turnstile.ts:18` y `captcha.tsx:46`.
11. **Relación cuenta ↔ `clientes`.** → No guardar `cliente_id` en esta entrega (el cliente nace en la caja al
    aceptar); el vínculo sigue siendo el teléfono normalizado, igual que lealtad.
12. **Invitado que luego se registra con el mismo teléfono (o correo).** → No se fusiona nada ni se le
    muestran pedidos anteriores: la cuenta ve solo lo creado con sesión (`SPEC:270-273`); el negocio lo
    sigue viendo como un solo cliente por teléfono.
13. **Teléfono de la cuenta frente al teléfono del pedido.** → Con sesión, el pedido usa el teléfono de la
    cuenta prellenado pero editable para ese pedido; no se impone desde el servidor.
14. **Llaves compuestas pendientes (`P1:1690`).** → `UNIQUE (id, tenant_id)` en `tienda_cuentas` y FK
    `(cuenta_id, tenant_id)` en las tres tablas hijas, más el disparador de `updated_at`, en la 0166.
15. **Eliminar cuenta: qué se borra y qué queda.** → Borrar la fila (cascada a sesiones, enlaces y
    direcciones) y poner en `NULL` `tienda_cuenta_id` de sus pedidos; el cliente y sus direcciones en el
    negocio se quedan (son del restaurante) y el aviso de privacidad lo dice. Exigir la contraseña para
    confirmar.
16. **«Salir».** → Cierra solo la sesión de ese navegador; cambiar o recuperar la contraseña cierra todas
    las demás (`SPEC:384`).
17. **Purga de sesiones y enlaces vencidos.** → Borrado oportunista dentro de las propias RPC (como
    `consumir_cupo`, `M/0136_limites_y_sync_pull.sql:30-32`), sin cron nuevo.
18. **«Mis pedidos»: de dónde sale y cuánto dura.** → De `delivery_pedidos` por `tienda_cuenta_id` + negocio,
    con índice parcial nuevo; estado con la regla de `tienda_seguimiento`; tras 30 días queda el resumen sin
    enlace de seguimiento.
19. **«Pedir de nuevo».** → Reconstruir el carrito en el navegador desde los `items` del pedido y dejar que
    `cotizar` diga qué ya no existe; nada nuevo en el servidor.
20. **Direcciones guardadas y zona.** → Guardar la dirección sin atarla a la zona como dato obligatorio (la
    zona es por sucursal); al pedir, el cliente confirma la zona como hoy. Tope de 5 por cuenta.
21. **Nombre y apellido.** → Registro con nombre y apellido separados (para lealtad); al pedir se manda
    `nombre + apellido` en el campo único que ya existe.
22. **Fecha de nacimiento.** → Opcional en «Mi cuenta», no en el registro (menos fricción al comprar).
23. **Cupos de las acciones de cuenta.** → Rama propia en `cuposDe` por acción con `alFallar: "cerrar"` en las
    que escriben; lecturas de «Mi cuenta» en su propia bolsa por IP para no gastar la del menú.
24. **Cómo sabe la interfaz si hay sesión.** → El layout del negocio mira solo si la cookie existe para
    pintar «Mi cuenta» o «Entrar»; la validez real la decide la función al usarla (sin llamada extra por
    página).
25. **Rutas de la app.** → `/[negocio]/entrar`, `/[negocio]/registro`, `/[negocio]/recuperar` (pedir y aplicar
    con el token) y `/[negocio]/cuenta`; van bajo el slug, así que no chocan con direcciones de negocio, y
    las de primer nivel equivalentes ya están reservadas (`0165:181-188`: `cuenta`, `entrar`, `registro`,
    `salir`, `login`) — falta `recuperar` solo si algún día fuera de primer nivel.
26. **Buscadores y `Referer` en las rutas nuevas.** → `noindex` en las cuatro, y `Referrer-Policy:
    no-referrer` en `/recuperar` (lleva token), con el mismo bloque de `next.config.mjs:25-31` y
    `robots.ts`.
27. **`localStorage` `vim.tienda.cliente` con sesión abierta.** → La cuenta manda sobre lo recordado; no se
    escribe `localStorage` cuando hay sesión, y «Olvidar mis datos» se queda para invitados.
28. **Endurecer la ruta antes de usar cookies.** → Exigir `Content-Type: application/json` y, en las acciones
    con sesión, `Origin` presente e igual al propio.
29. **Prueba de privilegios de funciones.** → Añadir las RPC nuevas (y de paso las `tienda_*` existentes) a
    `0003_grants_secdef.test.sql`.
30. **Aviso de privacidad.** → Actualizar el provisional con cuentas, contraseña cifrada, cookie de sesión
    y «elimina tu cuenta desde Mi cuenta»; el definitivo sigue siendo de la entrega 7.
