# Entrega 5 (tienda pública, `apps/tienda`) — hechos del repo

Levantado el 9 oct 2026 en el worktree `vim-pos-tienda`, rama `feat/tienda-caja` (HEAD `cecdb606`).
Solo lectura. Cada afirmación lleva `archivo:línea`. Lo que NO se pudo comprobar en el repo se marca
**(sin verificar)**.

Abreviaturas de rutas:

- `F/` = `supabase/functions/` · `M/` = `supabase/migrations/`
- `SPEC` = `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md`
- `P1` = `docs/superpowers/plans/2026-10-08-tienda-en-linea-1-base.md`
- `P2` = `…/2026-10-08-tienda-en-linea-2-funcion.md` · `P3` = `…/2026-10-08-tienda-en-linea-3-admin.md`
- `P4` = `…/2026-10-09-tienda-en-linea-4-caja.md`
- `0161`…`0164` = `M/0161_tienda_en_linea_base.sql`, `M/0162_tienda_funcion.sql`, `M/0163_tienda_admin.sql`, `M/0164_tienda_caja.sql`

---

## 0. Lo que más errores evita (léelo primero)

1. **`apps/factura` NO es precedente de «servidor que llama a la función».** Es 100 % cliente: llama a
   `autofacturar` desde el navegador con la llave anónima (`apps/factura/app/lib/portal.ts:1`, `:10-11`,
   `:75-79`). La tienda necesita lo contrario (ruta de servidor con secreto, `SPEC:88-90`). El único
   precedente de servidor→función con secreto está en `apps/platform`
   (`apps/platform/app/api/tenants/[id]/route.ts:559-577`) y el de «IP real en Vercel» en
   `apps/platform/app/lib/server.ts:60-66`.
2. **`VIM_TIENDA_URL` no es la URL de la función.** Es un secreto de Supabase que usa la función para
   armar el enlace del correo: `${VIM_TIENDA_URL}/${slug}/pedido/${codigo}` (`F/tienda/index.ts:188`,
   `:198`). La ruta de seguimiento de la app **tiene que ser** `/[negocio]/pedido/[codigo]`.
3. **La CSP compartida bloquea las fotos.** `img-src 'self' data: blob:` y no hay parámetro para
   ampliarla (`packages/config/cabeceras-seguridad.mjs:23`, `:39`). Las fotos y el logo viven en
   `<SUPABASE_URL>/storage/v1/object/public/productos/…` (`0163:99-102`).
4. **Poner `TURNSTILE_HOSTNAMES` reemplaza el valor por omisión.** Hoy en producción no está puesto y
   vale `admin.vimpos.com.mx` (`F/_shared/turnstile.ts:16`, `:34-37`; `docs/operacion/registro-publico.md:14-15`).
   Al ponerlo para la tienda hay que escribir **los dos** dominios o se rompe el registro del admin.
5. **El menú no dice si el precio lleva IVA.** `precio_mxn` es el precio de lista (`0162:247`, `:312`);
   la cotización suma IVA cuando el producto lo lleva por fuera (`0162:360-368`, `:517`). Lo mismo el
   envío (`0162:591-593`). Solo `cotizar` da el número que se cobra.
6. **Las opciones de modificador usan `agotada`; productos y opciones de slot usan `agotado`**
   (`0162:213` frente a `0162:281`, `:314`).
7. **`pedir` con 200 y `folio_corto`/`total_mxn`/`vence_aceptacion` en `null` = el pedido SÍ existe**
   (`F/tienda/index.ts:179-184`; `P2:1349`). Llevar al seguimiento, no reintentar.
8. **Sin la caja 0.8.0 (no publicada) una sucursal con caja instalada sale `CAJA_NO_LISTA`** salvo que
   haya un POS web abierto con turno (`docs/operacion/tienda-en-linea-caja.md:8-14`;
   `docs/operacion/instalador-0.8.0-pendiente.md:3-6`).

---

## 1. La función `tienda` — contrato

### 1.1 Transporte, cabeceras y secreto

- `POST <SUPABASE_URL>/functions/v1/tienda`, cuerpo JSON `{ accion, negocio, … }` (`F/tienda/index.ts:3-4`).
- `verify_jwt = false` en el gateway (`supabase/config.toml:52-55`): no exige `Authorization`. La
  prueba de producción del plan usó solo la cabecera del secreto (`P2:1306`). Que el gateway acepte la
  llamada sin `apikey` **(sin verificar aquí)**.
- **Cabeceras exigidas:**
  - `x-vim-tienda: <VIM_TIENDA_SECRET>` — obligatoria en toda petición (`F/tienda/index.ts:72-73`).
  - `x-tienda-ip: <IP del cliente final>` — no es obligatoria para pasar, pero sin ella (o si no parece
    IP) la IP es `"desconocida"` y todos comparten contador (`F/_shared/tienda/respuesta.ts:15-18`). En
    `pedir` deja además una línea `IP_CLIENTE_DESCONOCIDA` en el log (`F/tienda/index.ts:93`). Se lee
    **solo** de esa cabecera y nunca de `x-forwarded-for` (`F/tienda/index.ts:17-19`).
  - `Content-Type: application/json` (no se valida; el cuerpo se lee como texto, `F/tienda/index.ts:75`).
- **Validación del secreto:** `secretoInternoValido(recibido, configurado)`; comparación en tiempo
  constante, y un secreto no configurado o vacío es SIEMPRE inválido (`F/_shared/delivery/interno.ts:15-17`;
  `F/tienda/index.ts:71-73` hace `.trim()` al configurado). Sin `VIM_TIENDA_SECRET` todo es 401
  (`F/tienda/index.ts:19-20`).
- **Sin CORS:** `OPTIONS` recibe 405 como cualquier método que no sea `POST`, sin
  `Access-Control-Allow-*` (`F/tienda/index.ts:9-12`, `:70`). El navegador nunca puede llamarla.
- **Respuestas:** siempre JSON con `Cache-Control: no-store` (`F/tienda/index.ts:51-52`).
- **Tope de cuerpo:** 32 768 bytes (`F/tienda/index.ts:47`, `:75-76`).

### 1.2 Orden de comprobaciones (igual para toda acción)

`F/tienda/index.ts:68-104`:

1. Método ≠ POST → 405 `METODO_NO_PERMITIDO` (`:70`).
2. Secreto → 401 `NO_AUTORIZADO` (`:73`).
3. Cuerpo > 32 KB → 413 `CUERPO_DEMASIADO_GRANDE` (`:76`); con NUL (literal o `\u0000`) o JSON
   inválido → 400 `CUERPO_INVALIDO` (`:78-84`; `F/_shared/tienda/validar.ts:82-84`).
4. Forma (`leerCuerpo`) → 400 con su código (`:85-86`).
5. Cupo por IP → 429 `DEMASIADOS_INTENTOS`, o 503 `SERVICIO_NO_DISPONIBLE` si el control no responde
   **y** la acción es `pedir` (`:94-96`, `:65-66`).
6. `tienda_negocio(p_slug)`; `NULL` → 404 `TIENDA_NO_DISPONIBLE` (`:100-103`). Es la misma respuesta
   si no existe, está de baja/bloqueado o no tiene el módulo (`:99`; `0163:113-123`).
7. En `menu`, `cotizar`, `pedir`: `sucursal_id` debe estar entre las sucursales que participan; si no,
   404 `TIENDA_NO_DISPONIBLE` (`:116-117`).

Consecuencia: **toda acción (también `seguimiento`) ejecuta `tienda_negocio`**, que calcula el estado
de cada sucursal dos veces (`0163:135-137`).

### 1.3 Tabla de errores (HTTP → código)

| HTTP | `error` | Cuándo | Fuente |
|---|---|---|---|
| 405 | `METODO_NO_PERMITIDO` | no es POST (incluye OPTIONS) | `F/tienda/index.ts:70` |
| 401 | `NO_AUTORIZADO` | falta/no coincide `x-vim-tienda`, o secreto sin configurar | `F/tienda/index.ts:73` |
| 413 | `CUERPO_DEMASIADO_GRANDE` | > 32 768 bytes | `F/tienda/index.ts:76` |
| 400 | `CUERPO_INVALIDO` | NUL, JSON roto o no es objeto | `F/tienda/index.ts:78-84`; `validar.ts:87` |
| 400 | `ACCION_INVALIDA` | `accion` no es una de las cinco | `validar.ts:89-91` |
| 400 | `NEGOCIO_INVALIDO` | slug no cumple `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` (tras `trim().toLowerCase()`) | `validar.ts:26`, `:92-93` |
| 400 | `CODIGO_INVALIDO` | código de seguimiento no cumple `^[A-Za-z0-9_-]{22}$` | `validar.ts:96-98`; `seguimiento.ts:5` |
| 400 | `SUCURSAL_INVALIDA` | `sucursal_id` no es UUID | `validar.ts:100` |
| 400 | `MODO_INVALIDO` | `modo` ≠ `RECOGER`/`DOMICILIO` | `validar.ts:104` |
| 400 | `ZONA_INVALIDA` | `zona_id` presente y no UUID | `validar.ts:106-107` |
| 400 | `CARRITO_INVALIDO` | `items` no es arreglo de 1 a 40 objetos | `validar.ts:29`, `:109` |
| 400 | `CLIENTE_INVALIDO` | sin `cliente`, nombre vacío, teléfono no normalizable o correo mal formado | `validar.ts:119-125` |
| 400 | `DIRECCION_INVALIDA` | a domicilio falta/está mal; al recoger viene una | `validar.ts:127-133` |
| 400 | `PAGO_INVALIDO` | `pago` inválido, `paga_con` mal o con TARJETA, `total_esperado` mal | `validar.ts:135-139` |
| 404 | `TIENDA_NO_DISPONIBLE` | negocio sin tienda, o sucursal que no participa | `F/tienda/index.ts:103`, `:117` |
| 404 | `PEDIDO_NO_ENCONTRADO` | `tienda_seguimiento` devolvió `NULL` | `F/tienda/index.ts:112` |
| 403 | `CAPTCHA_INVALIDO` | Turnstile no pasó (solo `pedir`) | `respuesta.ts:65-71`; `F/tienda/index.ts:146-153` |
| 429 | `DEMASIADOS_INTENTOS` | cupo agotado | `F/tienda/index.ts:65-66` |
| 409 | `<CODIGO SQL>` (+ `detalle` a veces) | rechazo de negocio de una RPC | `respuesta.ts:93-100`; `F/tienda/index.ts:58-62` |
| 503 | `SERVICIO_NO_DISPONIBLE` | RPC falló sin código de negocio; control de cupos caído en `pedir`; antirobot sin configurar | `respuesta.ts:95`, `:68-69`; `F/tienda/index.ts:66` |
| 500 | `ERROR_INTERNO` | excepción no prevista | `F/tienda/index.ts:211-218` |

**Códigos 409 que puede emitir el SQL** (formato `RAISE EXCEPTION 'CODIGO: detalle'`; se reconoce por
`^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:: ?…)?$`, `respuesta.ts:76`):

| Código | `detalle` que SÍ sale | Origen |
|---|---|---|
| `TIENDA_CERRADA` | el motivo (ver 4.2) | `0162:649` |
| `PRODUCTO_NO_DISPONIBLE` | id del producto del carrito | `0162:506` |
| `MODIFICADORES_INVALIDOS` | id del producto | `0162:515` |
| `COMBO_INVALIDO` | id del combo | `0162:524`, `:535`, `:538`, `:560` |
| `TOTAL_CAMBIO` | el total nuevo, `^\d+\.\d{2}$` | `0162:669`; `respuesta.ts:82-86` |
| `ZONA_INVALIDA` | — | `0162:480`, `:482` |
| `MODO_INVALIDO` | — | `0162:484` |
| `CARRITO_INVALIDO` | — | `0162:489`, `:499`, `:512` |
| `PRECIO_INVALIDO` | — | `0162:567` |
| `SUCURSAL_DE_OTRO_NEGOCIO` | — | `0162:239`, `:472`, `:646` |
| `CLIENTE_INVALIDO` | — | `0162:655` |
| `PAGO_INVALIDO` | — (forma de pago no habilitada, o `paga_con` fuera de rango) | `0162:661`, `:675` |
| `DIRECCION_INVALIDA` | — | `0162:689`, `:692` |
| `SEGUIMIENTO_INVALIDO`, `CUENTA_INVALIDA` | — (no alcanzables desde la tienda bien hecha) | `0162:697`, `:704` |
| `NO_SE_PUDO_CREAR` | — (teléfono bloqueado **o** ya tiene 3 pedidos vivos; mismo texto a propósito) | `0162:707-730` |

El detalle solo sale para los cinco primeros y solo si cumple su forma (`respuesta.ts:80-86`, `:97-99`).
`MODO_INVALIDO`, `ZONA_INVALIDA`, `CARRITO_INVALIDO`, `CLIENTE_INVALIDO`, `DIRECCION_INVALIDA` y
`PAGO_INVALIDO` existen **dos veces**: 400 (forma, en Deno) y 409 (regla, en SQL).

### 1.4 Límites (cupos)

`F/_shared/tienda/respuesta.ts:49-59`, sobre `consumir_cupo` (`F/_shared/limite.ts:104-120`):

| Acción | Clave | Tope | Si el control falla |
|---|---|---|---|
| `negocio`, `menu`, `cotizar`, `seguimiento` | `tienda:lee:ip:<ip>` | 120 cada 600 s | deja pasar (`"abrir"`) |
| `pedir`, antes del antirobot | `tienda:pide:ip:<ip>` | 5 cada 3600 s | niega (`"cerrar"`) → 503 |
| `pedir`, después del antirobot | `tienda:pide:negocio:<slug>` | 60 cada 3600 s | niega → 503 |

- `<ip>`: IPv4 completa; IPv6 por su `/64`; `::ffff:a.b.c.d` cuenta como IPv4; lo que no se entiende,
  `desconocida` (`respuesta.ts:27-41`).
- El cupo por IP de `pedir` se gasta **en cada intento**, también los que fallan después (captcha,
  `TOTAL_CAMBIO`, validación SQL): se consume en `F/tienda/index.ts:94-96`, antes de todo lo demás.
  El cupo de 5/h «se comparte entre negocios y cuentan los intentos fallidos» (`P2:1355`).
- El cupo de lecturas es por IP y **no** por negocio: un sondeo de seguimiento cada 10 s gasta 60 de
  las 120 lecturas de 10 min, y las operadoras móviles comparten IPv4 (`P2:1344`).
- Además, en SQL: **3 pedidos vivos por teléfono** por negocio. «Vivo» = estado `RECIBIDO`,
  `ACEPTADO`, `EN_PREPARACION` o `LISTO`, de las últimas 6 horas y sin ticket ya cobrado/facturado/
  cancelado en la nube (`0162:719-730`). Responde `NO_SE_PUDO_CREAR`.

### 1.5 Antirobot (solo `pedir`)

- Servicio: Cloudflare Turnstile, `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
  (`F/_shared/turnstile.ts:15`, `:58-67`), con 5 s de límite (`:66`).
- Secreto: `TURNSTILE_SECRET_KEY`, **el mismo** que usa el registro de negocios (`F/tienda/index.ts:139`;
  `P2:1205`). La función solo conoce un secreto ⇒ el widget de la tienda debe ser **el mismo widget**
  (misma pareja de llaves) que el del admin, con el dominio nuevo añadido.
- Qué espera en el cuerpo: `captcha` (texto ≤ 4096; si no, se trata como ausente —
  `validar.ts:144`; Turnstile rechaza > 2048, `turnstile.ts:55-56`).
- Qué verifica: `success === true`; que `hostname` esté en `TURNSTILE_HOSTNAMES` (`turnstile.ts:77-78`);
  que `action === "tienda_pedido"` (`F/tienda/index.ts:142`; `turnstile.ts:79`). Manda `remoteip` = la
  IP completa de `x-tienda-ip` si se conoce (`turnstile.ts:59`; `F/tienda/index.ts:144`).
- Resultado: sin `TURNSTILE_SECRET_KEY` (y sin `CAPTCHA_OPCIONAL=1`) → 503 `SERVICIO_NO_DISPONIBLE`;
  cualquier otro fallo (sin token, rechazado, otro dominio, otra acción, Cloudflare no responde) →
  403 `CAPTCHA_INVALIDO` (`respuesta.ts:65-71`; motivos en `turnstile.ts:24`).
- `CAPTCHA_OPCIONAL=1` solo local: sin secreto se omite la verificación (`turnstile.ts:53`;
  `F/tienda/index.ts:140`, `:154`).
- Un token sirve una vez: hay que pedir otro tras cada `pedir` fallido (`P2:1341`;
  `apps/admin/app/components/captcha.tsx:11`, `:80-86`).
- Orden en `pedir`: cupo IP → negocio y sucursal → antirobot → cupo del negocio → alta
  (`F/tienda/index.ts:135`).

### 1.6 Acción `negocio`

**Cuerpo:** `{ "accion": "negocio", "negocio": "<slug>" }` (`validar.ts:15`, `:95`).

**Respuesta 200** = el objeto `publico` de `tienda_negocio` (`F/tienda/index.ts:107`; `0163:150-160`):

```json
{
  "slug": "knockout",
  "nombre": "<tenants.nombre_comercial>",
  "logo_ruta": "<tenant_id>/<uuid>.(jpg|png|webp)" | null,
  "color": "#RRGGBB",
  "descripcion": "hasta 200 caracteres" | null,
  "pago_efectivo": true,
  "pago_tarjeta": false,
  "sucursales": [
    { "id": "uuid", "nombre": "…", "telefono": "…" | null,
      "direccion": "Calle Número, Colonia, Ciudad" | null,
      "recoger": true, "domicilio": false,
      "horario": { "1": ["13:00","22:00"], "7": ["13:00","02:00"] },
      "estado": { "recoger": null | "<MOTIVO>", "domicilio": null | "<MOTIVO>" },
      "zonas": [ { "id": "uuid", "nombre": "Centro", "costo_mxn": "35.00" } ] }
  ]
}
```

- Sucursales: solo las que `participa`, activas y no borradas, ordenadas por nombre (`0163:144-148`).
- `direccion` es **un solo texto** concatenado (`0163:129-131`): no trae ciudad ni estado por separado.
- `estado.<modo>`: `null` = recibe pedidos ahora; si no, el motivo (ver 4.2) (`0163:135-137`).
- `zonas`: activas y no borradas, por `orden, nombre`; `costo_mxn` es `numeric(12,2)::text`
  (`0163:138-143`; `M/0116_*.sql:21`). Es el costo de la zona **sin** el IVA que el ticket pueda sumarle.
- **`logo_ruta` → URL pública:** `<SUPABASE_URL>/storage/v1/object/public/productos/<logo_ruta>`
  (`0163:99-102`; `P3:446`). Almacén `productos`, público (`0161:699-701`). La forma de la ruta la
  garantiza un CHECK amarrado al `tenant_id` (`0163:17-21`).
- **No trae:** `tenant_id` (nunca sale, `F/tienda/index.ts:104`), `minutos_aceptacion`, `aceptacion`,
  zona horaria de la sucursal, `pausa_hasta`, próxima hora de apertura, ciudad/estado sueltos, compra
  mínima.
- `color` por omisión `#111111`, formato `^#[0-9a-fA-F]{6}$` (`0161:567`). `descripcion varchar(200)`
  (`0161:568`).

### 1.7 Acción `menu`

**Cuerpo:** `{ "accion": "menu", "negocio": "<slug>", "sucursal_id": "<uuid>" }` (`validar.ts:16`, `:100-102`).

**Respuesta 200** = salida de `tienda_menu` (`F/tienda/index.ts:119-122`; `0162:228-328`):

```json
{ "categorias": [
  { "id": "uuid", "nombre": "Hamburguesas",
    "productos": [
      { "id": "uuid", "nombre": "…", "descripcion": "…" | null, "imagen_url": "…" | null,
        "precio_mxn": "120.00", "agotado": false, "es_combo": false,
        "grupos": [
          { "id": "uuid", "nombre": "Término", "tipo_seleccion": "UNICA_OBLIGATORIA",
            "minimo": 1, "maximo": 1,
            "opciones": [ { "id": "uuid", "nombre": "…", "precio_extra_mxn": "0.00",
                            "agotada": false, "es_default": false } ] } ],
        "slots": [] },
      { "id": "uuid", "nombre": "Combo", "precio_mxn": "150.00", "agotado": false, "es_combo": true,
        "grupos": [],
        "slots": [
          { "id": "uuid de combo_grupos", "nombre": "Papas", "minimo": 1, "maximo": 1,
            "opciones": [ { "producto_id": "uuid", "nombre": "Papas Gajo", "precio_extra_mxn": "0.00",
                            "agotado": false, "es_default": true, "grupos": [ … ] } ] } ] }
    ] } ] }
```

Reglas con su línea:

- Importes: **texto con dos decimales**; `minimo`/`maximo` son los únicos números (`0162:229`).
- Qué productos salen: del negocio, no borrados, `visible_en_pos`, y cuyo
  `motivo_no_disponible_en_sucursal` es `NULL` o `AGOTADO` (`0162:258-259`). Los que no se venden en
  esa sucursal no aparecen; los agotados aparecen con `agotado: true`.
- Qué categorías salen: activas, no borradas y con al menos un producto visible (`0162:302`, `:319-323`).
  Orden: `orden_visualizacion, nombre` en categorías y productos (`0162:299`, `:318`).
- `precio_mxn` = `precio_producto_en_sucursal(producto, sucursal)` (`0162:247`): precio de lista de esa
  sucursal, **sin** sumar IVA aunque el producto lo lleve por fuera.
- `agotado` de un producto: agotado en la sucursal, **o** un grupo obligatorio se quedó sin ninguna
  opción pedible (`0162:249-253`); en un combo, además, si a un slot obligatorio no le queda opción
  vendible (`0162:272`, `:313-314`).
- `grupos` (modificadores): `minimo`/`maximo` ya normalizados — `UNICA_OBLIGATORIA` = 1/1,
  `UNICA_OPCIONAL` = 0/1, los demás `minimo_selecciones` (o 0) y `maximo_selecciones`, que **puede ser
  `null` = sin tope** (`0162:202-207`, `:409`). Opciones: activas, no borradas y con precio ≥ 0
  (`0162:216-218`); una opción agotada **se enseña** marcada `agotada: true` (`0162:191`).
- Un combo no lleva `grupos` propios (`0162:256-257`); los modificadores van en cada opción de slot
  (`0162:283`).
- `slots[].opciones[].precio_extra_mxn` = precio del producto si el slot es `SUMA_PRECIO_PRODUCTO`, más
  el delta de la opción; **puede ser negativo** en teoría (`0162:278-280`, `:565-567`).
- `slots[].maximo` es `NOT NULL` (`M/0111_combos.sql:21-22`).
- `imagen_url`: se devuelve **tal cual** la columna `productos.imagen_url` (`0162:246`, `:311`), que
  es `text` libre (`M/0007_catalogo_inventario.sql:68`). Ver 4.1.
- Los combos **sí son comprables** (ver 1.8). Límite conocido: el mismo producto elegido dos veces en
  un combo se rechaza (`0162:550-553`); un combo con dos slots obligatorios que solo admiten el mismo
  producto no se puede comprar, y el aviso de eso quedó para esta entrega (`P3:441`, `P3:446`).

### 1.8 Acción `cotizar`

**Cuerpo** (`validar.ts:17`, `:104-116`):

```json
{ "accion": "cotizar", "negocio": "<slug>", "sucursal_id": "<uuid>",
  "modo": "RECOGER" | "DOMICILIO", "zona_id": "<uuid>" | null,
  "items": [
    { "producto_id": "uuid", "cantidad": 2, "nota": "sin cebolla",
      "modificadores": [ { "opcion_id": "uuid", "cantidad": 1 } ] },
    { "producto_id": "uuid-combo", "cantidad": 1,
      "componentes": [ { "grupo_id": "uuid del slot", "producto_id": "uuid", "cantidad": 1,
                         "modificadores": [ { "opcion_id": "uuid", "cantidad": 1 } ] } ] }
  ] }
```

(Forma del carrito: `P2:58-69`.)

Reglas de entrada:

- `items`: 1 a 40 renglones, cada uno objeto (`validar.ts:109`; `0162:488-490`).
- `cantidad` del renglón: **entero JSON** de 1 a 50 — `2` vale; `2.0`, `"2"`, `1.5`, `null` no
  (`0162:339-355`, `:496-500`).
- `cantidad` de un modificador: entero JSON de 1 a 10, **obligatoria** (`0162:392`, `:407`; `P2:1343`).
- `cantidad` de un componente de combo: entero JSON ≥ 1, **obligatoria**, por unidad de combo; el tope
  real es el `maximo` del slot (`0162:533`, `:546`, `:555-559`).
- Un producto simple no lleva `componentes`; un combo no lleva `modificadores` en su línea
  (`0162:511-513`, `:522-525`).
- `nota` de renglón: se limpia y recorta a 200 caracteres; vacía = se omite (`validar.ts:112-115`).
- `zona_id`: a domicilio, obligatoria, de esa sucursal y activa; al recoger debe ser `null`
  (`0162:475-485`).
- Modificadores: todos ofrecidos por el menú para ese producto, ninguno agotado, sin repetir opción,
  y cada grupo dentro de su mínimo/máximo (`0162:404-413`).

**Respuesta 200** (`F/tienda/index.ts:126-132`; `respuesta.ts:140-146`):

```json
{ "renglones": [ { "nombre": "…", "cantidad": 2, "detalle": "Extra queso, …" | null, "total_mxn": "270.00" } ],
  "subtotal_mxn": "270.00", "envio_mxn": "35.00", "envio_total_mxn": "35.00", "total_mxn": "305.00" }
```

- `renglones[].total_mxn`: lo que el ticket cobrará por ese renglón, **con IVA** si va por fuera
  (`0162:438-440`, `:517`, `:562`, `:581-585`). En un combo incluye padre + hijos.
- `renglones[].detalle`: nombres de modificadores/elecciones separados por coma, **sin cantidades**
  (`0162:584`; `P2:1347`).
- `subtotal_mxn` = suma de esos totales (`0162:586`). `envio_mxn` = costo de la zona; `envio_total_mxn`
  = lo que el envío le cuesta al cliente, con el IVA del **primer** renglón del carrito si aplica; una
  zona de $0 no cobra (`0162:435-437`, `:589-593`). `total_mxn = subtotal_mxn + envio_total_mxn`.
- La clave interna `items` **no sale** (`respuesta.ts:139-146`).
- **No mira si la tienda está abierta** ni la forma de pago: se puede cotizar con la tienda cerrada
  (`0162:430-431`).
- Costo: arma el menú entero de la sucursal en cada llamada (`0162:441-443`, `:492`).

### 1.9 Acción `pedir`

**Cuerpo** = el de `cotizar` más (`validar.ts:18-22`, `:118-145`):

```json
{ "accion": "pedir", …carrito…,
  "cliente": { "nombre": "…", "telefono": "477 123 4567", "email": "a@b.com" | null },
  "direccion": null | { "calle": "…", "numero_exterior": "…", "numero_interior": "…" | null,
                         "colonia": "…", "codigo_postal": "37000", "ciudad": "…", "estado": "…",
                         "referencias": "…" | null },
  "pago": "EFECTIVO" | "TARJETA",
  "paga_con": "500.00" | null,
  "nota": "…" | null,
  "captcha": "<token de Turnstile>",
  "total_esperado": "305.00" | null }
```

- `cliente.nombre`: 1 a 100 caracteres tras limpiar (`validar.ts:120`; `0162:652`).
- `cliente.telefono`: se normaliza a **10 dígitos nacionales**; admite espacios y `()+-.`, quita `52`
  o `521`; la lada no empieza en 0 ni 1; con una letra se rechaza (`validar.ts:38-46`).
- `cliente.email`: opcional; vacío = ausente; solo ASCII, ≤ 254 (`validar.ts:28`, `:122-125`).
- `direccion`: a domicilio obligatoria con `calle` ≤ 255, `numero_exterior` ≤ 20, `colonia` ≤ 150,
  `ciudad` ≤ 100, `estado` ≤ 50, `codigo_postal` de 5 dígitos; `numero_interior` ≤ 20 y `referencias`
  ≤ 300 opcionales. Al recoger **debe ser `null`** (`validar.ts:59-67`, `:127-133`; `0162:681-693`).
- `pago`: debe estar habilitado por el negocio (`pago_efectivo` / `pago_tarjeta`) o 409 `PAGO_INVALIDO`
  (`0162:659-662`).
- `paga_con`: opcional, solo con `EFECTIVO`; texto o número con ≤ 2 decimales y ≤ 999999
  (`validar.ts:71-77`, `:136-137`); debe estar entre el total y el total + 5000 (`0162:674-676`).
- `nota`: ≤ 300 (`validar.ts:144`; `0162:750`).
- `total_esperado`: opcional, misma regla de importe; si viene y el total recalculado es distinto →
  409 `TOTAL_CAMBIO` con `detalle` = el total de ahora, y **no se crea nada** (`validar.ts:21-22`,
  `:138-139`; `0162:613-615`, `:666-670`). `null` = no se compara.
- Los precios y renglones **nunca** son los del cliente: son los de `tienda_cotizar` (`0162:610-611`,
  `:666`).

Validaciones de `tienda_crear_pedido`, en orden (`0162:643-730`): sucursal del negocio → tienda abierta
en ese modo (`TIENDA_CERRADA: <motivo>`) → cliente → forma de pago → cotización + `TOTAL_CAMBIO` →
«paga con» → dirección → huella → cuenta → bloqueado / 3 vivos.

**Respuesta 200** (`F/tienda/index.ts:208`; `respuesta.ts:124-137`):

```json
{ "codigo": "<22 caracteres base64url>", "folio_corto": "TAB12C",
  "total_mxn": "305.00", "vence_aceptacion": "2026-10-09T19:05:00+00:00" }
```

- `codigo`: 128 bits al azar, 22 caracteres `[A-Za-z0-9_-]` (`seguimiento.ts:5-12`). **Solo existe en
  esta respuesta y en el correo**; en la base va su SHA-256 (`F/tienda/index.ts:164-166`;
  `seguimiento.ts:18-21`).
- `folio_corto`: `'T'` + 5 hex en mayúsculas (`0162:745`).
- `vence_aceptacion`: `now() + minutos_aceptacion` (3 a 15; 5 de fábrica) (`0162:751`; `0161:570`).
- Caso degradado: 200 con `{ codigo, folio_corto: null, total_mxn: null, vence_aceptacion: null }` —
  el pedido existe (`F/tienda/index.ts:179-184`).
- El pedido nace `RECIBIDO`, canal `TIENDA`, `gestion` = `ESCRITORIO` si la sucursal tiene caja
  instalada viva, si no `NUBE` (`0162:741-754`).
- Correo de confirmación: solo si hay `email`, `VIM_TIENDA_URL` y `VIM_SMTP_HOST`; sale después de
  responder y su fallo no afecta al pedido (`F/tienda/index.ts:186-206`). Texto y botón «Ver cómo va mi
  pedido» en `F/_shared/tienda/correo-pedido.ts:7-26`.
- `p_cuenta` va siempre `null`; `tienda_crear_pedido` ya acepta el parámetro para la entrega 6
  (`F/tienda/index.ts:175`; `0162:624`, `:700-705`).
- **No es idempotente:** cada llamada genera un código nuevo (`F/tienda/index.ts:165`); un reintento
  tras un tiempo de espera crea un segundo pedido (`P2:1346`).

### 1.10 Acción `seguimiento`

**Cuerpo:** `{ "accion": "seguimiento", "negocio": "<slug>", "codigo": "<22 caracteres>" }`
(`validar.ts:23`, `:96-98`).

**Respuesta 200** (`F/tienda/index.ts:109-113`; `0162:814-846`):

```json
{ "folio_corto": "TAB12C", "modo": "RECOGER" | "DOMICILIO",
  "estado": "EN_PROCESO" | "EN_PREPARACION" | "EN_CAMINO" | "LISTO_PARA_RECOGER" | "ENTREGADO" | "CANCELADO",
  "motivo": null | "SIN_RESPUESTA" | "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO",
  "renglones": [ { "nombre": "…", "cantidad": 2, "detalle": "…" | null } ],
  "subtotal_mxn": "270.00", "envio_total_mxn": "35.00", "total_mxn": "305.00",
  "pago": "EFECTIVO" | "TARJETA",
  "recibido_at": "<timestamptz>",
  "sucursal": { "nombre": "…", "telefono": "…" | null } }
```

Traducción de estados (`0162:817-825`) y textos del diseño (`SPEC:146-152`; la función devuelve
**códigos**, los textos los pone la tienda):

| Estado interno | Código al cliente | Texto del diseño |
|---|---|---|
| `RECIBIDO`, `ERROR` | `EN_PROCESO` | En proceso |
| `ACEPTADO`, `EN_PREPARACION` | `EN_PREPARACION` | En preparación |
| `LISTO` a domicilio | `EN_CAMINO` | En camino |
| `LISTO` para recoger | `LISTO_PARA_RECOGER` | Listo para recoger |
| `ENTREGADO` | `ENTREGADO` | Entregado |
| `RECHAZADO`, `CANCELADO`, `EXPIRADO` | `CANCELADO` | Cancelado, con motivo |

- `motivo`: `SIN_RESPUESTA` si expiró; en rechazo/cancelación, solo uno de `AGOTADO`, `CERRADO`,
  `SATURADO`, `OTRO` (cualquier otra cosa = `OTRO`); nunca texto libre del cajero; `null` si no está
  cancelado (`0162:777-781`, `:826-832`).
- **Sin datos personales:** ni teléfono, ni correo, ni dirección, ni nombre (`0162:769-770`). Tampoco
  `paga_con`, nota, zona ni `vence_aceptacion`.
- `renglones` **sin importes por renglón** y `detalle` sin cantidades (`0162:833-839`).
- Con gestión `NUBE` el estado se deriva del ticket al leer; con `ESCRITORIO`, de lo que reporta la
  caja (`0162:772-775`, `:799-810`).
- El pedido se busca por huella **y** negocio: un código válido con otro slug da 404
  (`0162:794-796`). Cambiar la dirección de la tienda rompe los enlaces vivos (`P2:1327`).
- Tras la retención de 30 días la huella se borra y el enlace da 404 (`0161:63-65`).
- Sin tiempo estimado en ningún lado (`SPEC:58`).
- Sondeo previsto: cada 10 s, sin Realtime (`SPEC:258`).

### 1.11 Cuentas: qué hay y qué no

- **No hay ninguna acción de cuentas.** `leerCuerpo` solo acepta las cinco; cualquier otra es 400
  `ACCION_INVALIDA` (`validar.ts:89-91`). `registrar`, `entrar`, `salir`, `recuperar_*`, `cuenta`,
  `direcciones`, `mis_pedidos`, `eliminar_cuenta` son de la entrega 6 (`SPEC:287-289`; `P2:1315`).
- Las tablas ya existen: `tienda_cuentas`, `tienda_sesiones`, `tienda_recuperaciones`,
  `tienda_direcciones`, cerradas a todo rol salvo `service_role` (`0161:628-691`).
- Pendiente de la 6: amarrar sesiones/recuperaciones/direcciones al negocio con llave compuesta
  (`P1:1690`).
- Lo que la 5 no debe cerrar: la arquitectura ya prevé que la ruta de servidor añade la sesión por
  cookie `HttpOnly` de primera parte (`SPEC:75`, `:88-90`, `:383-384`) y la ruta `/[negocio]/cuenta`
  (`SPEC:248`).

### 1.12 Lo que NO existe y la tienda pública necesitaría

| Falta | Por qué importa | Evidencia |
|---|---|---|
| Saber si un precio lleva IVA por fuera (menú no trae `tasa_iva` ni `iva_incluido_en_precio`) | El precio pintado puede ser menor al cobrado | `0162:307-317` frente a `:360-368` |
| Costo de envío con IVA en `negocio.zonas` | El selector de zona muestra el costo sin IVA | `0163:139` frente a `0162:591-593` |
| Próxima apertura / zona horaria de la sucursal | El diseño pide «el aviso y la hora de apertura»; `negocio` solo da `horario` crudo y el motivo | `SPEC:262-263`; `0163:134-137` |
| `pausa_hasta` | No se puede decir «vuelve a las X» en pausa | `0163:125-143` |
| `minutos_aceptacion` / `aceptacion` en `negocio` | Solo llega `vence_aceptacion` al pedir; el seguimiento no lo trae | `0163:150-160`; `0162:814-846` |
| Ciudad y estado de la sucursal por separado | El formulario de dirección los exige y no hay con qué prellenarlos | `0163:129-131`; `validar.ts:62-64` |
| Validar que la dirección cae en la zona | La zona la elige el cliente de una lista por nombre; nada la cruza con la dirección | `0162:475-480`; `M/0116_*.sql:16-27` |
| Compra mínima | No existe; es de la tercera entrega | `SPEC:38-39` |
| Idempotencia de `pedir` | Reintento = segundo pedido | `P2:1346` |
| Importe por renglón y cantidades de modificadores en `seguimiento` | El resumen del seguimiento es más pobre que el de `cotizar` | `0162:833-839`; `P2:1347` |
| Aviso de combos no comprables | Quedó expresamente para esta entrega | `P3:441`, `P3:446` |
| Direcciones reservadas propias de la tienda | Ampliar antes de que exista ninguna tienda | `P3:446`; hoy: `0163:30-33` |
| Acciones de cuentas | Entrega 6 | `validar.ts:89-91` |

---

## 2. Cómo está hecha una app pública del monorepo (`apps/factura`) y cómo se añade otra

### 2.1 `apps/factura` tal cual

- **Archivos (todos):** `app/layout.tsx`, `app/page.tsx`, `app/[negocio]/page.tsx`, `app/lib/portal.ts`,
  `app/globals.css`, `app/icon.svg`, `next.config.mjs`, `package.json`, `postcss.config.mjs`,
  `tailwind.config.ts`, `tsconfig.json`. Sin `middleware.ts`, sin rutas `/api`, sin `vercel.json`, sin
  pruebas.
- **`package.json`** (`apps/factura/package.json:1-28`): nombre `@vim/factura`; scripts `dev`
  (`next dev --port 3004`), `build`, `start`, `typecheck` (`tsc --noEmit`) — **no tiene `test`**.
  Dependencias: `@vim/fecha`, `@vim/ui` (workspace), `next ^15.5.25`, `react ^19`, `react-dom ^19`.
  Dev: `@types/*`, `@vim/config`, `autoprefixer`, `postcss`, `tailwindcss ^3.4`, `typescript ^5.6`.
- **`next.config.mjs`** (`apps/factura/next.config.mjs:1-11`): `reactStrictMode`,
  `transpilePackages: ["@vim/ui", "@vim/config"]` y `headers()` con `cabecerasSeguridad()` sin opciones
  sobre `/:path*`.
- **`tsconfig.json`** extiende `@vim/config/tsconfig.base.json` (`apps/factura/tsconfig.json:1-10`):
  `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`packages/config/tsconfig.base.json:8-15`).
- **Tailwind:** preset `@vim/config/tailwind-preset` y `content` que incluye
  `../../packages/ui/src/**/*.{ts,tsx}` (`apps/factura/tailwind.config.ts:1-7`).
- **CSS:** `@import "@vim/ui/tokens.css"` + las tres capas de Tailwind + `body` con `var(--font)`,
  `rgb(var(--bg))`, `rgb(var(--ink))` (`apps/factura/app/globals.css:1-13`).
- **Tipografías:** `<link>` a Google Fonts en el `layout` — Inter Tight 400–700 y Sora 500–700; **no**
  carga JetBrains Mono (`apps/factura/app/layout.tsx:18-23`).
- **SEO:** `robots: { index: false, follow: false }` porque cada URL lleva un folio
  (`apps/factura/app/layout.tsx:7-9`).
- **Cómo llama a su función:** desde el **navegador**, `fetch(${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/autofacturar)`
  con `apikey` y `Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>` (`apps/factura/app/lib/portal.ts:10-11`,
  `:72-79`). No hay secreto ni servidor intermedio; la IP la saca la propia función de las cabeceras
  de la plataforma (`F/autofacturar/index.ts:73`). El módulo y las dos páginas son `"use client"`
  (`portal.ts:1`; `app/page.tsx:1`; `app/[negocio]/page.tsx:1`).
- **Parámetros de ruta:** `params` y `searchParams` son promesas y se leen con `use()` (Next 15)
  (`apps/factura/app/[negocio]/page.tsx:69-77`).
- **Errores:** clase `ErrorPortal` con `mensaje`, `campo`, `estado` y `datos`; fallo de red →
  «No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.»; el mensaje para el usuario viene
  **del servidor** (`d.mensaje`) (`portal.ts:56-93`). (La función `tienda` no manda `mensaje`: solo
  códigos; los textos los pone la app.)
- **Uso de `@vim/ui`:** `Button`, `LogoVim` (`app/page.tsx:4`; `app/[negocio]/page.tsx:4`). Campos a
  mano con `h-12`, `text-16`, foco con anillo de `--accent` (`app/[negocio]/page.tsx:31-43`).
- **Logo del negocio:** `<img>` directo con un data URI (`app/[negocio]/page.tsx:704-706`); cabe en la
  CSP porque `img-src` admite `data:`.
- **`localStorage`:** recuerda el receptor bajo `vim.factura.receptor` (`app/[negocio]/page.tsx:48`).

### 2.2 Cabeceras y CSP compartidas

`packages/config/cabeceras-seguridad.mjs`:

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS de 2 años con `preload`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` (`:27-31`).
- CSP: `default-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`;
  **`img-src 'self' data: blob:`**; `font-src 'self' data: https://fonts.gstatic.com`;
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`;
  `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` solo en desarrollo) (`:25`, `:35-45`).
- `connect-src` por omisión abre `https://*.supabase.co`, `*.supabase.in` y el stack local (`:11-12`).
- Opciones que admite: `scriptExtra`, `frameSrc`, `connectSrc`, `hsts` (`:17-23`). **No hay opción
  para `img-src`.**
- Precedente de Turnstile: el admin pasa `scriptExtra` y `frameSrc` =
  `https://challenges.cloudflare.com` (`apps/admin/next.config.mjs:4-14`).

### 2.3 Precedentes que `apps/tienda` sí necesita y `factura` no da

- **Ruta de servidor que llama a una función con secreto:** `fetch(${supabaseUrl}/functions/v1/…)` con
  cabecera propia desde un `route.ts` (`apps/platform/app/api/tenants/[id]/route.ts:556-577`).
- **IP real en Vercel:** `x-vercel-forwarded-for` ?? `x-real-ip`, y `x-forwarded-for` solo como último
  recurso (`apps/platform/app/lib/server.ts:55-66`).
- **Widget antirobot:** `apps/admin/app/components/captcha.tsx:14-90` — lee
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, carga `api.js?render=explicit`, `appearance: "interaction-only"`,
  `reinicio` para pedir token nuevo. Su tipo de acción es `"registro" | "reenvio"` (`:48`): no admite
  `"tienda_pedido"`, y vive en `apps/admin`, no en `packages/ui`.
- **Vitest:** `apps/admin/vitest.config.ts:1-14` (entorno `node`, `include: ["app/**/*.test.ts"]`);
  script `"test": "vitest run"` y `vitest ^3.2.7` (`apps/admin/package.json:10`, `:33`).
- **Reglas de horario ya escritas (en el admin):** `leerHorario`, `cruzaMedianoche`, `DIAS`
  (`apps/admin/app/lib/tienda-reglas.ts:31-56`, `:67-70`). Usarlas en una segunda app las haría subir
  a un paquete (`docs/diseno/nucleo.md:257-259`).
- **Base de la tienda:** `BASE_TIENDA = "pedidos.vimpos.com.mx"` (`apps/admin/app/lib/tienda-reglas.ts:4`);
  el admin arma `https://${BASE_TIENDA}/${direccion}` en «Compartir»
  (`apps/admin/app/components/tienda-compartir.tsx:17`). El botón «ver mi tienda» se añade en esta
  entrega (`P3:323`, `P3:432`).

### 2.4 Workspace, CI y Vercel: qué hace falta para una app nueva

**Workspace**

- `apps/*` ya está en el workspace (`pnpm-workspace.yaml:1-3`): basta crear `apps/tienda/package.json`
  y correr `pnpm install` para actualizar `pnpm-lock.yaml` (el CI instala con `--frozen-lockfile`,
  `.github/workflows/ci.yml:54-57`).
- `pnpm@9.12.0`, Node ≥ 22 (`package.json:5-8`).
- Puertos de desarrollo tomados: 3000 pos, 3001 admin, 3002 platform, 3003 kds, 3004 factura
  (`apps/*/package.json:6`). Libre: 3005.
- `turbo.json`: `globalEnv` lista las variables que invalidan caché (`turbo.json:3-12`); las nuevas de
  la tienda no están. Tareas `build`, `typecheck`, `test` (`turbo.json:18-27`).

**CI** (`.github/workflows/ci.yml`, job `build-and-test`) — todo se engancha solo por convención:

| Paso | Comando | Qué necesita la app nueva | Línea |
|---|---|---|---|
| Escala tipográfica | `pnpm tipografia` | nada: revisa todo `git ls-files apps packages` (`.ts/.tsx/.js/.jsx/.css`) | `ci.yml:59-61`; `scripts/tipografia.mjs:42-44` |
| Typecheck | `pnpm --filter "./apps/*" -r typecheck` | un script `typecheck` | `ci.yml:63-66` |
| Build | `pnpm -r build` con solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` de mentira | **compilar sin** `VIM_TIENDA_SECRET` ni otras | `ci.yml:68-74` |
| Vitest | `pnpm -r test` | un script `test` (factura no lo tiene) | `ci.yml:76-81` |
| Funciones | `pnpm test:functions` | ya incluye `_shared/tienda/*.test.ts` | `ci.yml:89-98`; `package.json:17` |
| Auditoría | `pnpm audit --prod --audit-level=high` (bloquea) | dependencias limpias | `ci.yml:100-102` |

- **No hay lint**: ninguna app tiene ESLint (`ci.yml:79-80`).
- `tipografia` falla ante cualquier `text-[Npx]` menor de 60 px (`scripts/tipografia.mjs:16-17`, `:28`, `:62`).
- Reglas locales de los planes: nunca `next build`, ni CLI `supabase` en local, ni `git stash`
  (`P2:35`; `P4:42`).

**Vercel**

- Un proyecto por app, mismo repo, **Root Directory = `apps/<app>`**, desplegando desde la raíz para
  que resuelva `@vim/*` (`docs/operacion/deploy-vercel.md:6-12`). Receta por API/CLI en `:17-31`.
  El documento dice «3 apps» y está desactualizado en eso (`:3`); el proyecto de factura se llama
  `vim-factura` (`:68`).
- Auto-despliegue al hacer push a `main` con el proyecto conectado a GitHub (`deploy-vercel.md:42-44`).
- **No hay `vercel.json`** en ninguna app ni en la raíz; el único es `sitio-web/vercel.json`
  (`git ls-files | grep -i vercel`).
- **«Ignored build step»:** no hay script en el repo. Lo que existe es el «skip unaffected projects»
  de Vercel apoyado en el workspace: lo que está fuera del workspace cuenta como cambio global y
  despliega todas las apps; por eso `supabase/migrations`, `supabase/scripts`, `sitio-web` y `docs`
  están dentro (`pnpm-workspace.yaml:4-13`). Ahí mismo consta el límite de **100 despliegues diarios**
  del plan (`pnpm-workspace.yaml:6-7`). Una app más = un despliegue más por cada cambio en `@vim/ui` o
  `@vim/config`.
- Proyecto previsto: **`vim-tienda`**, dominio `pedidos.vimpos.com.mx` (`SPEC:441-442`).
- Las URLs `.vercel.app` con Deployment Protection redirigen al login (`deploy-vercel.md:72-74`).
- La función `tienda` se despliega **antes** del merge de la entrega que la usa (`SPEC:443-444`).

---

## 3. Diseño

- **Qué manda:** `packages/ui/tokens.css` (valores) → `docs/diseno/nucleo.md` + el documento de la app
  (`docs/diseno/nucleo.md:26-30`). Los mockups ya no mandan (`nucleo.md:35-36`).
- **`docs/diseno/tienda.md` no existe** (`docs/diseno/`: admin, factura, kds, nucleo, pantalla-cliente,
  platform, pos, sitio). El diseño aprobado dice que la tienda sigue `nucleo.md` y **estrena su propio
  documento**, y que «el color principal es el del negocio» (`SPEC:248-250`).
- **Pariente más cercano:** `docs/diseno/factura.md` — la marca que se ve es la del restaurante, VIM
  discreto al pie (`:13-17`); móvil primero de verdad, una columna, botón al alcance del pulgar
  (`:19-23`); los errores dicen qué pasó, por qué y qué hacer (`:31-35`); 44 px mínimo (`:45-46`).
- **Pantallas del diseño** (`SPEC:252-259`): Menú (logo, nombre, abierto/cerrado con horario, selector
  de sucursal si hay más de una, recoger/domicilio, categorías y productos con foto, precio y agotado),
  Producto (modificadores y combos, cantidad, nota), Carrito (renglones, subtotal, envío, total, pago
  con «¿con cuánto pagas?» o tarjeta), Tus datos, Seguimiento (estado, resumen, llamar o WhatsApp al
  restaurante). Carrito en `localStorage` (`SPEC:261`). Cerrada/en pausa/sin caja: el menú se ve
  completo y el botón de pedir se cambia por el aviso (`SPEC:262-263`).
- **Rutas del diseño:** `/[negocio]`, `/[negocio]/pedido/[codigo]`, `/[negocio]/cuenta`,
  `/[negocio]/privacidad` (`SPEC:248`).
- **Tokens:** `--accent` `#0078C9` y sus `-hover`/`-soft` en **canales RGB**, no hex
  (`packages/ui/tokens.css:13-20`, `:27-29`); `Button` primario es `bg-accent text-white hover:bg-accent-hover`
  (`packages/ui/src/components/button.tsx:22`). El color del negocio llega como `#RRGGBB` y por omisión
  es `#111111` (`0161:567`); el admin lo captura con un `<input type="color">` sin comprobar contraste
  (`apps/admin/app/components/tienda-datos.tsx:113-126`).
- **Tipografías:** Inter Tight (interfaz), Sora (títulos, botones y dinero, con `tabular-nums`),
  JetBrains Mono (folios) (`nucleo.md:141-151`; `tokens.css:70-72`).
- **Escala:** 11·12·13·14·15·16·18·20·24·28·32·40; campos en celular a 16 px o iOS hace zoom
  (`nucleo.md:153-167`; `packages/config/tailwind-preset.js:59-62`). `pnpm tipografia` revisa
  `apps/` y `packages/` (`scripts/tipografia.mjs:42-44`).
- **Espaciado y radios:** múltiplos de 4; radios 4/6/8 (`nucleo.md:189-196`).
- **Controles:** `h-11` por omisión, `h-14` la acción dominante; nada táctil bajo 36 px; todo responde
  al presionar; el hover es solo para mouse (`nucleo.md:200-223`). Una sola acción de acento por
  pantalla (`nucleo.md:46-51`).
- **Movimiento:** 150–250 ms, solo `transform` y `opacity`, respeta `prefers-reduced-motion`
  (`nucleo.md:225-237`).
- **Componentes en `@vim/ui/styles`:** `cn`, `Button`/`botonClases`, `PinKeypad`, `Modal`,
  `useConfirmar`, `DialogoPeligro`, `Aviso`, `StatusChip`, `LogoVim` (`packages/ui/src/index.ts:1-9`).
  No hay tarjeta de producto, selector de cantidad, hoja inferior ni campo de formulario compartidos.
- **Regla de subida:** un patrón en dos apps sube a `@vim/ui` (`nucleo.md:257-259`).
- **Skills que los planes exigen para pantallas:** `ponytail`, `frontend-design`, `ui-ux-pro-max`,
  `emil-design-eng`, y leer `nucleo.md` (`P4:34`).

---

## 4. Datos que la tienda pinta

### 4.1 Imágenes, logo y color

- **Almacén `productos`:** público, 1 MB, `image/jpeg|png|webp` (`0161:699-701`). Leer por URL pública
  no pide sesión; escribir y borrar, solo dueño/admin dentro de su carpeta (`0161:703-720`).
- **Foto de producto:** `productos.imagen_url` guarda la **URL pública completa** (`P3:381`), con forma
  `<SUPABASE_URL>/storage/v1/object/public/productos/<tenant_id>/<uuid>.(jpg|png|webp)`; lado máximo
  1200 px (`apps/admin/app/lib/foto-producto.ts:14`, `:25`, `:59`).
- **Ojo:** la columna es texto libre que un administrador puede escribir por la API. Pintarla **solo**
  si tiene esa forma exacta, solo como `src` de imagen y con CSP limitada a ese origen (`P3:446`). La
  tienda no recibe `tenant_id` (`F/tienda/index.ts:104`), así que no puede comprobar la carpeta contra
  el negocio: solo la forma.
- **Logo:** `publico.logo_ruta` (ruta, no URL); 800 px de lado máximo, recomendado cuadrado y con
  fondo transparente (`0163:17-23`; `apps/admin/app/lib/foto-producto.ts:19`; `P3:386`). Puede ser `null`.
- **Color:** `publico.color`, `#RRGGBB` (`0161:567`). **Descripción:** hasta 200 caracteres (`0161:568`).

### 4.2 Horario y estado de la sucursal

- `horario`: `{"1": ["13:00","22:00"], …}`, 1 = lunes … 7 = domingo; día ausente = cerrado; cierre ≤
  apertura = cierra pasada la medianoche (si son iguales, no cierra) (`0162:15-17`; `0161:590-592`).
  Un horario mal formado cuenta como cerrado (`0162:17`, `:31`).
- Zona horaria: `COALESCE(sucursales.timezone, tenants.timezone)`, por omisión `America/Mexico_City`
  (`0162:79`, `:34`). **No llega a la tienda.**
- Un solo horario para recoger y domicilio (`SPEC:41`).
- `tienda_estado_sucursal(sucursal, modo)` devuelve `NULL` (recibe) o el motivo, **en este orden**
  (`0162:69-113`):

| Motivo | Cuándo | Línea |
|---|---|---|
| `TIENDA_NO_DISPONIBLE` | sucursal/negocio inactivo, bloqueado, sin configuración o sin módulo | `0162:85`, `:87-90` |
| `NO_PARTICIPA` | la sucursal no vende en la tienda | `0162:92-93` |
| `MODO_NO_DISPONIBLE` | ese modo está apagado; a domicilio también si no hay ninguna zona activa; o modo desconocido | `0162:95-106` |
| `EN_PAUSA` | `pausa_hasta` en el futuro (la pone el cajero: 30 min, 1 h o hasta reanudar = `2999-12-31`) | `0162:108`; `P4:62` |
| `FUERA_DE_HORARIO` | fuera del horario | `0162:109` |
| `CAJA_NO_LISTA` | ninguna caja activa reportó turno abierto en los últimos 90 s | `0162:110`; `0161:851-856` |

- El mismo valor llega en `negocio.sucursales[].estado.<modo>` y como `detalle` de `TIENDA_CERRADA`.
- La señal de caja lista depende de un sondeo de 30 s con ventana de 90 s: una caja con internet
  inestable hace que la tienda abra y cierre (`SPEC:218-220`, `:457-458`).

### 4.3 Zonas de envío, mínimo y pago

- Tabla `zonas_envio`: `sucursal_id`, `nombre varchar(60)`, `costo_mxn numeric(12,2) ≥ 0`, `orden`,
  `activa`, `deleted_at`; por sucursal, nombre único (`M/0116_*.sql:16-37`).
- Cómo se elige: el cliente escoge una de `negocio.sucursales[].zonas` y manda su `zona_id`; el
  servidor comprueba que es de esa sucursal y está activa (`0162:475-480`). No hay cálculo por
  dirección ni por distancia.
- Costo: el de la zona en ese momento; al ticket entra como un renglón más con el IVA del primer
  producto del carrito (`0162:589-593`).
- **Compra mínima:** no existe (`SPEC:38-39`).
- **Formas de pago:** `pago_efectivo` (de fábrica `true`) y `pago_tarjeta` (de fábrica `false`), al
  menos una (`0161:571-575`). Tarjeta = terminal al recibir; no se toca ningún dato de tarjeta
  (`SPEC:28`, `:405`).
- **`minutos_aceptacion`:** 3 a 15, 5 de fábrica (`0161:570`); pasado ese tiempo sin aceptar, el cron
  marca `EXPIRADO` → el cliente ve `CANCELADO` / `SIN_RESPUESTA` (`0164:179-183`; `0162:827`).
- **`aceptacion`:** `MANUAL` de fábrica o `AUTO` (`0161:569`).

---

## 5. Seguridad y privacidad ya decididas

- **Una puerta:** `apps/tienda` no tiene llave de servicio y su navegador nunca llama a Supabase; todo
  pasa por una ruta de servidor propia (`SPEC:88-90`, `:378`).
- **Aislamiento:** el negocio sale del slug en el servidor; ninguna acción acepta `tenant_id`
  (`SPEC:277-278`, `:379-380`).
- **IP real:** mandarla siempre en `x-tienda-ip` (`P2:1340`).
- **Antirobot:** Turnstile en `pedir` (y en `registrar`, entrega 6); añadir `pedidos.vimpos.com.mx` a
  sus dominios (`SPEC:400-401`). Añadir, no reemplazar; sin eso todo `pedir` da 403 (`P2:1348`).
- **Cotizar justo antes de pedir y mandar `total_esperado`** (`P2:1342`).
- **Límites:** sección 1.4 (`SPEC:388-396`). Las acciones que escriben se niegan si el control de cupos
  no responde (`SPEC:398-399`).
- **Seguimiento:** código de 128 bits en el enlace, nunca el folio (`SPEC:387`). Dejar el enlace
  **fuera de analítica y de cabeceras `Referer`** (`P2:1345`). La política por omisión es
  `strict-origin-when-cross-origin` (`packages/config/cabeceras-seguridad.mjs:29`).
- **Registros:** nunca contraseñas, tokens ni códigos de seguimiento (`SPEC:402`;
  `F/tienda/index.ts:26-28`).
- **Datos personales:** los pedidos se anonimizan a los 30 días (`SPEC:403`); cron diario
  `delivery-retencion` (`M/0095_delivery_retencion.sql:53`); borra nombre, teléfono, correo, dirección
  y huella de seguimiento en pedidos terminados (`0161:52-69`). Un pedido de invitado **sí** crea un
  cliente y una dirección permanentes en el negocio (`SPEC:162-165`; `P2:1354`); el aviso de privacidad
  es de la entrega 7 (`SPEC:436`).
- **Invitado:** nombre, teléfono, correo opcional y dirección si aplica; «no guarda nada» (`SPEC:267-268`).
- **Caché:** guardar en caché `negocio` y `menu` **del lado del servidor** (`P2:1344`). No hay
  duración decidida. La función responde `no-store` (`F/tienda/index.ts:51-52`). «Agotado» marcado en
  la caja tarda hasta 10 minutos en llegar al menú de la nube (`P2:1334`); el estado abierto/cerrado
  cambia con granularidad de ~90 s (`0161:851-856`).
- **SEO:** el diseño **no decide** si la tienda es indexable. El único precedente (factura) es
  `noindex` por llevar folios en la URL (`apps/factura/app/layout.tsx:7-9`).
- **Direcciones reservadas hoy** (16): `api`, `admin`, `pedido`, `cuenta`, `privacidad`, `terminos`,
  `static`, `assets`, `vim`, `vimpos`, `soporte`, `login`, `pago`, `ayuda`, `www`, `tienda`
  (`0163:30-33`; espejo en `apps/admin/app/lib/tienda-reglas.ts:7-10`, con prueba que las compara).
  El formato del slug no admite punto ni guion bajo (`0163:31`), así que `robots.txt`, `favicon.ico`,
  `icon.svg` y `_next` no pueden chocar; sí chocaría cualquier ruta de primer nivel sin extensión que
  la app defina. Pendiente: añadir `seguimiento`, `carrito`, `entrar`, `registro`, `icon`,
  `manifest`…, y parecidos a VIM (`vim-pos`, `soporte-vim`) (`P3:446`). Cambiar el CHECK es una
  migración nueva (siguiente número libre: **0165**, a confirmar contra `origin/main`).
- **Sesión (entrega 6, no cerrarle el paso):** cookie `HttpOnly`, `Secure`, `SameSite=Lax`, 30 días
  (`SPEC:383-384`).
- **Revisión de seguridad completa** de la función pública antes de la salida (`SPEC:421`).

---

## 6. Variables de entorno, secretos y pasos de una persona

### 6.1 Ya definidos en el repo

| Nombre | Dónde vive | Para qué | Fuente |
|---|---|---|---|
| `VIM_TIENDA_SECRET` | Supabase (secreto de la función) **y** Vercel `vim-tienda` (servidor) | cabecera `x-vim-tienda` | `F/tienda/index.ts:72`; `SPEC:441-443`; `P2:1304` |
| `VIM_TIENDA_URL` | **solo Supabase** | base de los enlaces del correo (`https://pedidos.vimpos.com.mx`) | `F/tienda/index.ts:188`; `P2:1304` |
| `TURNSTILE_SECRET_KEY` | solo Supabase (ya puesto, 30 sep) | verificar el token | `F/tienda/index.ts:139`; `registro-publico.md:14` |
| `TURNSTILE_HOSTNAMES` | solo Supabase (hoy sin poner) | dominios aceptados | `F/tienda/index.ts:143`; `turnstile.ts:34-37` |
| `CAPTCHA_OPCIONAL` | solo local | omitir el antirobot | `F/tienda/index.ts:140`; `.env.example:85-87` |
| `VIM_SMTP_*` | solo Supabase | correo de confirmación | `F/tienda/index.ts:190` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel (hoy solo en `admin`) | pintar el widget | `apps/admin/app/components/captcha.tsx:14`; `.env.example:79` |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Vercel | base de `/functions/v1/tienda` y de las URLs de imágenes | `.env.example:8`, `:13`; `turbo.json:5-7` |

- El secreto se guardó (según el plan) en `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt`; «la
  entrega 5 lo pondrá también en Vercel»; no escribirlo en el chat ni en el repo (`P2:1304`). Que ese
  paso y el despliegue de la función ya se hicieron en producción **(sin verificar aquí)**.
- **No hay nombre definido** para «la URL de funciones» del lado de la app: el diseño solo dice
  «variables `VIM_TIENDA_SECRET` y la URL de funciones» (`SPEC:441-442`).
- `.env.example` no menciona ninguna variable de la tienda (`.env.example:1-102`).
- La app **no** necesita `NEXT_PUBLIC_SUPABASE_ANON_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` (`SPEC:378`;
  `supabase/config.toml:52-55`).

### 6.2 Pasos que requieren a una persona (Fermín)

1. Crear el proyecto Vercel `vim-tienda` con Root Directory `apps/tienda` y conectarlo al repo
   (`SPEC:441`; `deploy-vercel.md:9-12`, `:42-44`).
2. Dominio `pedidos.vimpos.com.mx` en Vercel + registro DNS (`SPEC:441`).
3. Variables en Vercel: `VIM_TIENDA_SECRET` (secreta, del archivo de llaves), la URL de Supabase y la
   llave pública de Turnstile.
4. Cloudflare Turnstile: añadir `pedidos.vimpos.com.mx` al widget existente (hoy: `admin.vimpos.com.mx`
   y `localhost`, `registro-publico.md:32`).
5. Supabase: `TURNSTILE_HOSTNAMES=admin.vimpos.com.mx,pedidos.vimpos.com.mx` (los dos), y confirmar
   que `CAPTCHA_OPCIONAL` no está en producción (`P2:1352`).
6. Conceder el complemento `TIENDA` a un negocio interno para probar: está inactivo y no aparece en el
   panel de VIM hasta la entrega 7 (`0161:726-742`;
   `docs/superpowers/plans/anexos/2026-10-08-tienda-3-hechos-del-admin.md:158`).
7. Visto bueno antes de tocar producción (regla de todos los planes: `P2:34`, `P2:1297-1299`).
8. Para un recorrido real de punta a punta: una caja con la 0.8.0 (no publicada) o un POS web abierto
   con turno (`docs/operacion/tienda-en-linea-caja.md:8-14`; `P4:26`). Riesgo anotado: caja 0.7.0 y POS
   web abiertos a la vez en la misma sucursal (`P4:281`).

### 6.3 Desarrollo local

- Las funciones de la nube **no corren en local** en este proyecto (`P4:263`), y los planes prohíben
  el CLI de `supabase` en local (`P2:35`). El plan tiene que decidir contra qué se desarrolla y se
  verifica en el navegador (ver «Decisiones abiertas» 3).
- Antes de depender de ella: ejercitar `negocio`, `menu` y `cotizar` en producción contra un negocio
  interno (`P2:1357`).

---

## 7. Decisiones abiertas (con recomendación)

1. **Fotos frente a la CSP** (`img-src 'self' data: blob:`). → Añadir un parámetro `imgSrc` a
   `cabecerasSeguridad` y pasarle solo el origen de Supabase; más simple y barato que montar `next/image`.
2. **Forma de la capa de servidor** (una ruta `/api` genérica frente a páginas de servidor + acciones). →
   Menú y negocio en componentes de servidor con caché; `cotizar`, `pedir` y `seguimiento` por una sola
   ruta `POST` propia que reenvía con el secreto y la IP.
3. **Contra qué se desarrolla en local.** → Módulo cliente de la función con `fetch` inyectable y
   pruebas con respuestas de mentira; verificación en navegador contra la función de producción con un
   negocio interno, con el visto bueno de Fermín.
4. **Duración de la caché de `negocio` y `menu`.** → 30 s para ambos (el estado abierto/cerrado se
   mueve cada ~90 s); `seguimiento`, `cotizar` y `pedir` nunca.
5. **Precio con IVA por fuera en el menú.** → Migración 0165 que haga a `tienda_menu` devolver el
   precio ya con IVA (y `negocio.zonas` el costo final), en vez de calcularlo en el cliente.
6. **«Abre a las X».** → Calcularlo en la app con `horario` asumiendo hora de México, y dejar la zona
   horaria/próxima apertura del servidor para cuando haya un negocio fuera de esa zona.
7. **Color del negocio en la interfaz.** → Sobrescribir `--accent` por negocio y elegir texto blanco o
   negro según la luminancia; `--accent-hover` y `--accent-soft` derivados con `color-mix`.
8. **Widget antirobot.** → Subir `Captcha` a `@vim/ui` admitiendo la acción `tienda_pedido`, mismo
   widget de Cloudflare que el admin (la función solo tiene un secreto).
9. **Doble pedido por reintento.** → Deshabilitar el botón mientras envía y, ante tiempo de espera, no
   reintentar solo; la idempotencia en servidor queda para la entrega 7.
10. **Ciudad y estado del domicilio.** → Pedirlos en el formulario prellenados con lo último que
    escribió el cliente (en `localStorage`); no tocar `tienda_negocio` por esto.
11. **SEO.** → Menú indexable (es la vitrina del restaurante); seguimiento con `noindex` y
    `Referrer-Policy: no-referrer`.
12. **Direcciones reservadas.** → Ampliarlas en la misma migración 0165 y en `tienda-reglas.ts`, antes
    de que exista ninguna tienda.
13. **Dónde viven las reglas de horario.** → Moverlas de `apps/admin` a un paquete compartido en vez
    de copiarlas.
14. **Sondeo del seguimiento frente al cupo de lecturas.** → 10 s mientras el pedido está vivo, parar
    en estado final y con la pestaña oculta; así cabe en las 120 lecturas por 10 minutos.
15. **Pruebas de la app.** → Vitest desde el primer día (carrito, cliente de la función, textos de
    estado y de error), con la configuración del admin.
16. **Aviso de combos no comprables y «ver mi tienda» en el admin.** → Incluir los dos en esta entrega,
    como quedó anotado en el plan 3.
17. **Selector de sucursal y de zona.** → Con una sola sucursal no se pregunta; la zona se elige de la
    lista por nombre con su costo, sin validar contra la dirección.
18. **Analítica.** → Ninguna en esta entrega; si se añade, excluir `/pedido/*`.
