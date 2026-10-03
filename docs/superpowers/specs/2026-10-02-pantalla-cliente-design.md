# Pantalla del cliente — diseño

Fecha: 2 oct 2026 · Estado: aprobado por Fermín, pendiente de plan de implementación

## Qué es

Un segundo monitor conectado a la computadora de la caja, de cara al cliente. Mientras el cajero
captura, muestra los artículos y el total. Cuando no se está capturando nada, muestra anuncios que
el dueño sube desde `/admin`.

La especificación original ya la preveía como módulo opcional («Display al cliente»,
`flujos/01-FLUJOS-COMUNES-CORE.md` §28.2.bis). Este diseño la concreta y cambia una cosa: no es un
módulo que el dueño activa en el admin, se enciende sola al detectar el monitor. Eso va en el
ADR 0026.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Hardware | Segundo monitor en la misma PC de la caja. Tablet por red queda fuera. |
| Detección | Automática: si hay un segundo monitor, la pantalla se abre sola, sin configurar nada. |
| Ventana | Pantalla completa, sin bordes ni barra de título. |
| Anuncios | Solo imágenes, en carrusel. Sin video. |
| Dónde se administran | Los anuncios en `/admin`. En el POS solo apagar la pantalla o elegir monitor. |
| Plan | Incluida en todos los planes. Sin candado. |
| Alcance de los anuncios | Por negocio: los mismos en todas las sucursales. |

## Arquitectura

Tres piezas, cada una con una sola responsabilidad:

1. **Ventana del cliente** (escritorio, proceso principal): decide si hay monitor, abre y cierra la
   ventana.
2. **Vista del cliente** (`apps/pos`, modo `?cliente`): dibuja lo que recibe. No inicia sesión ni
   lee la base.
3. **Publicador** (`apps/pos`, dentro de la caja): traduce el estado de la venta a un mensaje
   limpio y lo emite.

La cuenta en captura vive solo en memoria (`useReducer` en `home-pos.tsx`) hasta que se envía o se
cobra. Por eso la vista no puede leerla de la base: la caja se la publica.

### 1. Ventana del cliente (`desktop/`)

Módulo nuevo `desktop/src/pantalla-cliente.mjs`, llamado desde `main.mjs` solo en el rol caja.

**Detección automática.** Al arrancar y en cada evento `display-added`, `display-removed` y
`display-metrics-changed` de `screen`:

- Monitor de la caja = el que contiene la ventana principal (`getDisplayMatching`).
- Monitor del cliente = el elegido en la configuración local si sigue conectado; si no hay elegido,
  el primer monitor que no sea el de la caja.
- Si existe y la pantalla no está apagada: abrir la ventana ahí (o moverla si cambió). Si no
  existe: cerrarla.

Con un solo monitor no pasa nada y no se muestra ningún aviso.

**La ventana.**

- `frame: false`, `fullscreen: true`, colocada con los `bounds` del monitor destino.
- `focusable: false` y `skipTaskbar: true`: el teclado y el lector de códigos se quedan siempre en
  la caja, y el cajero no puede perder la ventana con Alt+Tab.
- Sin menú. Mismas `webPreferences` que la ventana principal (`contextIsolation`, `sandbox`) y la
  misma lista de navegación permitida.
- Carga `http://localhost:54360/?cliente`.
- `powerSaveBlocker('prevent-display-sleep')` mientras esté abierta.
- La ventana principal nunca se mueve de su monitor. Cerrar la caja cierra también esta ventana.

**Configuración local.** Archivo `pantalla-cliente.json` en `userData`:
`{ "modo": "auto" | "apagada", "displayId": number | null }`. Por omisión `auto` y sin monitor
elegido. Es local por la misma razón que la impresora (`print/config.ts`): el hardware es de cada
computadora.

**Endpoint en el ui-server** (patrón de `/__imprimir`):

- `GET /__pantalla-cliente` → `{ modo, displayId, abierta, monitores: [{ id, etiqueta, ancho, alto, esDeLaCaja }] }`
- `POST /__pantalla-cliente` → guarda `{ modo, displayId }` y reevalúa de inmediato.

### 2. Canal entre ventanas

`BroadcastChannel('vim-pantalla-cliente')`. Las dos ventanas comparten origen y sesión, así que no
hace falta servidor ni IPC, y se prueba en un navegador con dos pestañas.

Mensajes (validados con Zod en el receptor, con `v: 1`):

- Caja → vista: `{ tipo: 'estado', v: 1, vista: VistaCliente }`
- Caja → vista: `{ tipo: 'negocio', v: 1, nombre, logoUrl }` (solo al saludar; el logo es un data
  URI y no debe viajar en cada cambio)
- Vista → caja: `{ tipo: 'hola' }` al montar; la caja responde con `negocio` y `estado`.

`VistaCliente` es una unión discriminada:

```ts
type VistaCliente =
  | { fase: 'reposo' }
  | { fase: 'cuenta'; renglones: RenglonCliente[]; envio: { nombre: string; importe: Dinero } | null; total: Dinero }
  | { fase: 'cobro'; total: Dinero }
  | { fase: 'pagado'; total: Dinero; cambio: Dinero };

type RenglonCliente = {
  id: string;            // clientId de la línea, para animar altas y bajas
  cantidad: number;
  nombre: string;
  detalle: string[];     // modificadores y componentes del combo, ya como texto
  importe: Dinero;
};
```

`Dinero` es el mismo tipo que ya usan `carrito.ts` y `cobro.ts`; el plan lo confirma al leerlos.
No se introduce float.

**Vida del estado.** La caja republica su estado cada 5 s mientras no esté en reposo. Si la vista
pasa 15 s sin recibir nada, vuelve a reposo. Así una caja colgada o recargada no deja una cuenta
vieja a la vista del siguiente cliente.

### 3. Publicador (`apps/pos`)

- `apps/pos/app/lib/pantalla-cliente/vista.ts`: función pura
  `construirVista({ estadoCarrito, ticketBd, totalesCobro, cobroAbierto, confirmacion, tasaIva })`
  → `VistaCliente`. Aquí vive toda la lógica y se prueba sola.
- `apps/pos/app/lib/pantalla-cliente/canal.ts`: abrir canal, publicar, responder al `hola`.
- `home-pos.tsx` solo agrega un hook `usePublicarPantallaCliente(...)` con lo que ya tiene en
  estado. No se le mete lógica nueva a ese componente.

Reglas de `construirVista`:

| Situación en la caja | Fase |
|---|---|
| Sin líneas y sin cuenta abierta | `reposo` |
| Hay líneas (venta nueva o cuenta de mesa abierta en pantalla) | `cuenta` |
| `ModalCobro` abierto | `cobro` |
| Cobro completado (`confirmacion`) | `pagado`, y a los 5 s `reposo`, igual que `cobro-completado.tsx` |

Totales: en venta nueva, `calcularTotalesDisplay` (lo mismo que ve el cajero en el costado). Con
cuenta ya guardada o al cobrar, los totales de la base (`TotalesTicket`), que sí traen descuentos y
promociones. El total del cliente siempre coincide con el del cajero.

**Nunca se publica:** `notaCocina`, `notaOrden`, `nombreCuenta`, `clienteDomicilio`,
`clienteCuenta`, ni nada del cajero. `construirVista` arma el mensaje campo por campo; no copia
objetos del carrito.

### 4. Vista del cliente (`apps/pos`, `?cliente`)

Mismo mecanismo que `MODO_KDS` en `apps/pos/app/page.tsx`: un modo del mismo export estático, sin
ruta nueva. Componente `pantalla-cliente.tsx` con un subcomponente por fase.

- **Reposo:** carrusel de anuncios a pantalla completa, con fundido entre imágenes. Sin anuncios
  (o antes de la entrega 2): logo y nombre del negocio sobre fondo de marca.
- **Cuenta:** lista de renglones (cantidad, nombre, detalle, importe), envío al final si aplica, y
  el total fijo abajo, en grande. Si la lista no cabe, se desplaza sola para que el último renglón
  agregado quede visible.
- **Cobro:** «Total a pagar» y el monto.
- **Pagado:** «Gracias», el cambio si lo hay.
- Se adapta a monitor horizontal y vertical. Sin cursor, sin selección de texto, sin scroll manual.
- Respeta `prefers-reduced-motion`.

El aspecto sigue `docs/diseno/nucleo.md` y `tokens.css`; se agrega `docs/diseno/pantalla-cliente.md`.

### 5. Ajuste en el POS

En el mismo lugar que la configuración de impresora, un apartado «Pantalla del cliente»:

- Estado: «Abierta en *monitor X*» o «No hay un segundo monitor conectado».
- Interruptor para apagarla (por si el segundo monitor se usa para otra cosa).
- Selector de monitor, solo visible si hay más de dos.

Solo aparece en el escritorio (`__VIM_DESKTOP`).

## Anuncios (entrega 2)

### Datos — migración `0150_anuncios_pantalla.sql`

- Tabla `anuncios_pantalla`: `id uuid`, `tenant_id`, `ruta` (ruta en el almacén), `orden int`,
  `activo bool default true`, `segundos int null` (tiempo propio; null = el general), `ancho int`, `alto int`, `bytes int`, `created_at`, `updated_at`.
- RLS por `tenant_id`, con el mismo patrón de `0116_zonas_envio.sql`: lectura para el negocio y sus
  dispositivos, escritura para quien administra la configuración.
- Disparador que rechaza el anuncio número 11 por negocio.
- `configuracion_tenant.pantalla_cliente_segundos int not null default 8 check (between 3 and 60)`.
  Esa tabla ya baja a la caja.
- Almacén `anuncios`, de lectura pública (son anuncios), con rutas `<tenant_id>/<uuid>.<ext>`.
  Políticas de escritura y borrado restringidas a la carpeta del propio negocio. La creación del
  almacén va protegida para que la migración corra en el Postgres de la caja, que no tiene
  `storage` (precedente en `0135`).
- `sync_pull_snapshot` se vuelve a crear con la clave `anuncios_pantalla`, y la tabla se agrega a
  `PULL_ORDER` en `desktop/src/sync-pull.mjs`.
- `pnpm db:types`.

Decidido en el plan: el pull no trae lápidas, así que una fila borrada en la nube se quedaría viva
en la caja. Por eso la baja es lógica, con `deleted_at` (no `DELETE`), y la caja borra su copia de
lo que ya no está vivo. `activo` queda solo para pausar. Ver el ADR 0026.

### Admin

Página `configuracion/pantalla-cliente` y entrada en `config-sidenav.tsx`:

- Subir imagen: se reduce en el navegador con `reescalarImagen` (lado mayor 1920 px, tope ~600 KB)
  y se sube al almacén; luego se inserta la fila.
- Lista con miniatura: reordenar, pausar/activar, eliminar (con `DialogoPeligro`).
- Tiempo en pantalla: un tiempo general (3 a 60 s, 8 por omisión) y, en cada imagen, un tiempo propio opcional que le gana al general.
- Estado vacío que explica qué es y qué medida conviene (1920×1080 horizontal).
- Contador «3 de 10».

### Copia local en la caja

Después de cada pull, `desktop/src/anuncios.mjs`:

- Lee `anuncios_pantalla` de la base local, **solo del negocio al que está vinculada la caja**: el
  del último snapshot, que el pull anota en `_vim_sync` (`clave = 'tenant'`). El pull solo hace
  upsert, así que una caja revinculada conserva las filas del negocio anterior; sin este filtro la
  pantalla los mezclaría. Sin negocio anotado no hay anuncios.
- Descarga a `userData/anuncios/` los archivos que falten. Borra los que ya no estén en la lista
  (con eso se van solas las imágenes de un negocio anterior).
- Si una descarga falla, se salta y se reintenta en el siguiente pull.

El ui-server los sirve:

- `GET /__anuncios` → `{ segundos, anuncios: [{ id, url, segundos }] }`, solo activos y ya
  descargados, en orden. `segundos` de cada anuncio es su tiempo propio o, si no tiene, el general.
- Si la lista no se pudo leer (la base falló), responde **503** con un cuerpo de error, no una lista
  vacía: la pantalla conserva la lista que ya tenía. Una lista vacía de verdad (`200`) sí quita el
  carrusel. El
  ui-server responde la lista vacía cuando arrancó sin el gancho `anuncios`; un POS sin escritorio
  detrás no tiene la ruta `/__anuncios`, así que `leerAnuncios` recibe una respuesta fallida (`null`)
  y conserva su lista.
- `GET /__anuncios/<archivo>` → la imagen. El nombre se valida **por forma** (`<uuid>.<ext>`, con
  `ext` jpg, png o webp), no contra la lista: sin rutas libres, y un nombre que no está en disco da
  404.

La vista consulta `/__anuncios` al montar y cada vez que vuelve a reposo. Sin internet sigue
mostrando lo que ya tiene en disco.

## Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Se desconecta el monitor del cliente | La ventana se cierra; la caja no se inmuta. |
| Se reconecta | Se reabre sola. |
| La caja se recarga o se cuelga | La vista vuelve a reposo a los 15 s. |
| La vista se recarga | Saluda y la caja le reenvía negocio y estado. |
| Mensaje con forma inesperada | Se ignora (Zod), la vista conserva lo último válido. |
| Una imagen no carga | Se salta a la siguiente; si no queda ninguna, logo y nombre. |
| Rol cocina | No abre pantalla del cliente. |
| POS en navegador (sin escritorio) | No hay ventana automática. Fuera de alcance. |

## Pruebas

- **Unitarias** de `construirVista`: cada fase, combos, modificadores, envío, cuenta de mesa, y una
  prueba explícita de que ningún dato privado aparece en la salida.
- **Unitarias** de la elección de monitor (`pantalla-cliente.mjs`, función pura sobre una lista de
  monitores): uno solo, dos, tres con elegido, elegido desconectado, apagada.
- **Playwright**, dos pestañas: agregar y quitar artículos, cobrar, ver el cambio, volver a reposo;
  y el regreso a reposo cuando la caja deja de publicar.
- **Smoke SQL** de RLS entre negocios para `anuncios_pantalla`, y del tope de 10.
- **En el instalador**, a mano: abre sola al arrancar con dos monitores, sin bordes y a pantalla
  completa; desconectar y reconectar; el foco no se va de la caja; monitor vertical.

## Entregas

1. **Pantalla.** Ventana automática, canal, publicador, vista con las cuatro fases (reposo = logo y
   nombre), ajuste en el POS. Sin migración. Un instalador.
2. **Anuncios.** Migración 0150, admin, copia local, carrusel. La migración se aplica a producción
   antes de mezclar; el admin se despliega solo y la caja necesita otro instalador.

Cada entrega pasa por la lista previa a publicar y espera el visto bueno de Fermín.

## Documentación

- ADR `0026`: la pantalla del cliente se enciende sola por hardware, no es módulo del admin; los
  anuncios viven en un almacén y no dentro del sync.
- `docs/diseno/pantalla-cliente.md`.
- `desktop/RUNBOOK.md`: cómo probar con dos monitores.

## Fuera de alcance

Tablet o dispositivo por red, video, anuncios por sucursal u horario, anuncios armados con texto,
edición de anuncios desde la caja, propina o firma del cliente en la pantalla, QR de factura o de
pago.
