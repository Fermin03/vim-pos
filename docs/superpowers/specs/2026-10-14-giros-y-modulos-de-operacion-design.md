# Giros y módulos de operación

**Fecha:** 14 oct 2026
**Estado:** diseño aprobado por Fermín sección por sección, pendiente de plan
**Antecedentes:** ADR 0002 (precio por paquete, no por giro; el giro "sigue configurando el
producto"), ADR 0014 (el panel manda a la caja por latido; dos capas: VIM permite, el dueño
enciende), migración 0002 (`vertical_tipo`, `tenants.vertical_principal`), 0003
(`configuracion_tenant.modos_servicio_activos` y `politica_cobro_cocina`, sin uso), 0086 (planes por
paquete), 0103/0161 (`modulos_efectivos`), 0105 (`resolver_directivas`).

## 1. El problema

Cada negocio guarda su giro al registrarse, pero el producto casi no lo usa: lo único que cambia es
el bloque de "evento" al abrir turno, que solo sale en food truck (`apps/pos/app/components/abrir-turno.tsx:46`).
Una dark kitchen ve "Comedor", un food truck ve "Repartidores" y una cafetería ve "Ventas por
mesero". Mesas, meseros, domicilio, repartidores, marcas virtuales y reservaciones no se pueden
apagar. Las banderas `kds`, `reservaciones` y `promociones` se calculan en `modulos_efectivos`, pero
ninguna app las respeta.

## 2. Decisiones de Fermín

| Tema | Decisión |
|---|---|
| Qué cambia por giro | **Solo la experiencia.** El precio sigue por tamaño (Esencial / Negocio / Cadena); se respeta el ADR 0002 |
| Rigidez | **Punto de partida.** El giro enciende un juego inicial de módulos; después se ajusta cliente por cliente |
| Quién ajusta | **Solo VIM**, desde /platform, para cualquier giro (por ejemplo, encenderle Domicilio a un food truck que ya tiene repartidores). El dueño ve qué tiene encendido, pero no lo cambia: lo pide a soporte |
| Editar el juego de cada giro desde /platform | **No.** La tabla de §5 se cambia con una migración y solo afecta a los registros nuevos |
| Cadena / franquicia | **No es un giro.** Es el plan Cadena, que se suma a cualquier giro |
| Giros que se ofrecen | Comida rápida, Restaurante con meseros, Food truck, Dark kitchen, **Bar**, **Cafetería** (separada de Bar) y **Taquería / cocina económica** |
| Enfoque | **A:** módulos de operación con interruptor; el giro solo es un juego inicial. Ninguna pantalla pregunta por el giro |
| Cuentas por nombre en barra | **Entran en la fase 1** |
| Clientes existentes | Conservan **todo encendido**, como hoy |

## 3. Alcance

**Entra**, en tres entregas, cada una con su propio plan:

1. **Núcleo (base de datos).** Catálogo de módulos de operación, juegos iniciales por giro, los
   nuevos giros, reglas de dependencia y `modulos_efectivos` con las llaves nuevas. Incluye el
   **ADR 0034 "El giro arma el juego inicial; VIM lo ajusta"**, que completa el ADR 0002.
2. **Pantallas.** La caja (escritorio y web), el admin, los reportes, el registro y la primera vez
   obedecen los módulos. /platform gana los interruptores por cliente y el cambio de giro. El admin
   gana la página de consulta **Configuración → Cómo vende tu negocio**.
3. **Cuentas por nombre en barra.** Una cuenta abierta sin mesa que se identifica por nombre.

**No entra:** precios por giro; módulos que VIM cobre aparte (los complementos CFDI, apps de
delivery, tienda y lealtad siguen exactamente igual); interruptores para el dueño; una pantalla
para editar el juego de cada giro; candados en el servidor para los módulos de
operación (ver §6); cambios al sitio web (la sección `#giros` se actualiza aparte, con James);
funciones nuevas por giro distintas de las cuentas en barra.

## 4. Módulos de operación

Son interruptores de VIM, uno por cliente, que se mueven desde /platform. No se cobran y el dueño no
los cambia.

| Llave | Qué controla | Requiere |
|---|---|---|
| `mostrador` | Para llevar y Pick-up en la caja | — |
| `comedor` | Mesas, mapa, cuentas abiertas por mesa, dividir cuenta, configuración de mesas | — |
| `meseros` | Asignar mesero, propinas por mesero, reporte "Ventas por mesero" | `comedor` |
| `domicilio` | Pedidos a domicilio propios y zonas de envío | — |
| `repartidores` | Asignación de repartidores (ADR 0016) | `domicilio` |
| `kds` | Pantalla de cocina por estación | plan (`modulos.kds`), como hoy |
| `reservaciones` | Reservaciones | plan (`modulos.reservaciones`), como hoy |
| `marcas` | Marcas virtuales | — |
| `eventos` | Bloque de evento al abrir turno | — |
| `cuentas_barra` | Cuentas por nombre en barra (§8) | — |

`kds` y `reservaciones` ya existen como banderas de plan. A partir de ahora su valor efectivo es
**plan Y interruptor de operación**.

**Siempre disponibles, sin interruptor:** combos, modificadores, pantalla del cliente, corte ciego.
Inventario y recetas siguen como hoy (plan + interruptor).

**Plan Cadena, no giro:** consolidado de sucursales y menú por sucursal. Que el plan los cierre es
otro trabajo; aquí no se tocan.

## 5. Juego inicial por giro

● encendido al darse de alta · ○ apagado (VIM lo enciende desde /platform si el cliente lo pide)

| Módulo | Comida rápida | Restaurante | Food truck | Dark kitchen | Bar | Cafetería | Taquería |
|---|---|---|---|---|---|---|---|
| mostrador | ● | ● | ● | ● | ● | ● | ● |
| comedor | ○ | ● | ○ | ○ | ● | ○ | ● |
| meseros | ○ | ● | ○ | ○ | ● | ○ | ● |
| domicilio | ● | ○ | ○ | ● | ○ | ○ | ● |
| repartidores | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| kds | ● | ● | ○ | ● | ○ | ○ | ○ |
| reservaciones | ○ | ● | ○ | ○ | ○ | ○ | ○ |
| marcas | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| eventos | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| cuentas_barra | ○ | ○ | ○ | ○ | ● | ○ | ○ |

Ajustes que ya existen y cuyo valor inicial también depende del giro:

| Ajuste | Comida rápida | Restaurante | Food truck | Dark kitchen | Bar | Cafetería | Taquería |
|---|---|---|---|---|---|---|---|
| `politica_cobro_cocina` | COBRO_PRIMERO | COCINA_PRIMERO | COBRO_PRIMERO | COBRO_PRIMERO | COCINA_PRIMERO | COBRO_PRIMERO | COCINA_PRIMERO |
| Sugerir propina (`capturar_propina` de la sucursal) | No | Sí | No | No | Sí | No | No |

`ENTERPRISE` (valor viejo, ya no se ofrece) y cualquier giro sin juego definido reciben **todo
encendido**.

## 6. Diseño técnico

### 6.1 Datos

- **Giros.** Al tipo `vertical_tipo` se le agregan `BAR`, `CAFETERIA` y `TAQUERIA`.
  `CAFE_BAR` y `ENTERPRISE` se quedan en el tipo (Postgres no los borra fácil), pero el registro ya
  no los ofrece. Si hay clientes en `CAFE_BAR`, la migración los pasa a `BAR`.
- **Interruptores.** Nueva columna `tenants.operacion jsonb NOT NULL` con las diez llaves de §4.
  Su valor por defecto es **todo encendido**: así los clientes existentes no cambian sin que nadie
  haga nada. Se guarda en `tenants` y no en `configuracion_tenant` porque esta última la puede
  escribir el dueño (política `config_tenant FOR ALL`, 0003), mientras que en `tenants` las apps
  solo leen (`REVOKE UPDATE`, 0132). Así, que "solo VIM" decida lo garantiza la base y no solo la
  pantalla.
- **Juego inicial.** Una función `juego_inicial_de_giro(vertical_tipo) RETURNS jsonb` es la única
  fuente de la tabla §5. La usan el alta y el cambio de giro.
- **Se reaprovecha:** `politica_cobro_cocina` (ya existe, se fija al darse de alta).
  `modos_servicio_activos` y `modo_servicio_default` no se usan y se dejan como están (no se
  agregan dos fuentes para lo mismo).

### 6.2 Reglas

- Un disparador en `tenants` impone las dependencias: apagar `comedor` apaga
  `meseros`; encender `meseros` exige `comedor`. Lo mismo con `domicilio` → `repartidores`.
- **No se puede apagar `comedor` ni `cuentas_barra` mientras haya cuentas abiertas de ese tipo** en
  cualquier sucursal. La función que guarda responde con cuántas son, y /platform lo muestra.
- **Apagar un módulo solo lo esconde: no borra datos.** Mesas, repartidores, marcas y zonas siguen
  en la base y reaparecen al volver a encenderlo.
- No hay candado en el servidor para usar un módulo apagado (por ejemplo, asignar mesero por API).
  No es algo que se cobre: el candado está en quién cambia el interruptor, no en cada función, y
  esconder la pantalla basta.

### 6.3 Funciones

- `alta_autoservicio` / `crear_tenant_con_owner`: después de crear el negocio, escriben
  `operacion := juego_inicial_de_giro(giro)` y la política de cobro. La propina inicial por giro
  va en la entrega 2: la sucursal se crea después del alta, desde la primera vez, y
  `sucursal_propinas_config` todavía no baja a la caja, así que fijarla antes no llegaría a ella.
- `operacion_cambiar(p_tenant, p_cambios jsonb)`: enciende o apaga módulos aplicando las reglas de
  §6.2, y responde con lo que quedó y con lo que no se pudo cambiar, explicando por qué.
- `cambiar_giro(p_tenant, p_giro, p_reaplicar boolean)`: cambia `vertical_principal` y, si
  `p_reaplicar`, vuelve a aplicar el juego inicial respetando las reglas de §6.2 (si hay cuentas
  abiertas en comedor, el comedor se queda encendido y lo avisa).
- Las dos funciones son solo para `service_role`, igual que el resto de lo que mueve /platform:
  `REVOKE EXECUTE` de `anon` y `authenticated`. Las llama /platform desde su API del lado del
  servidor (`apps/platform/app/api/tenants/[id]/route.ts`) y quedan en su bitácora.
- `modulos_efectivos`: se agregan las diez llaves de operación a `efectivos` (y a `permitidos` como
  `true`, salvo `kds` y `reservaciones`, que siguen dependiendo del plan). Nada más cambia en su
  contrato.

### 6.4 Cómo llega a la caja

Por el camino que ya existe: `modulos_efectivos` → `resolver_directivas` → latido (ADR 0014) →
`desktop/src/directivas.mjs` → POS. Sin canal nuevo.

- **Cajas viejas** que no conocen las llaves nuevas las ignoran y muestran todo, como hoy. Es seguro.
- **Cambio a media jornada:** la caja aplica el cambio en el siguiente latido. Si localmente todavía
  tiene cuentas abiertas de un módulo que se apagó, lo sigue mostrando hasta cerrarlas.
- **Sin internet:** la caja usa los últimos módulos que recibió.

## 7. Pantallas

| Superficie | Cambio |
|---|---|
| Caja, inicio (`pantalla-inicio.tsx`, `home-pos.tsx`) | Solo aparecen los accesos de módulos encendidos: Comedor, Para llevar / Pick-up, Domicilio, Barra |
| Caja, abrir turno (`abrir-turno.tsx`) | El bloque de evento depende de `eventos`, ya no del giro |
| Caja, cuenta | Asignar mesero solo con `meseros`; dividir cuenta solo con `comedor` o `cuentas_barra` |
| Admin, menú lateral (`admin-shell.tsx`) | Se esconden Mesas, Repartidores, Zonas de envío, Marcas y Reservaciones cuando están apagados |
| Admin, reportes | "Ventas por mesero" solo con `meseros` |
| Admin, **Configuración → Cómo vende tu negocio** (nueva, solo lectura) | Muestra el giro y qué módulos tiene encendidos, con una línea que explica cada uno. Abajo: "¿Necesitas otro? Escríbenos" con el WhatsApp de soporte. Reemplaza el giro de solo lectura de `configuracion/negocio` |
| Registro (`apps/admin/app/registro/page.tsx`, `_shared/alta.ts`) | Ofrece los 7 giros con sus nombres; `PLAN_DE_VERTICAL` y `GIRO_ETIQUETA` se actualizan |
| Primera vez (#47) | Se salta los pasos que no aplican (por ejemplo, alta de mesas sin `comedor`) |
| Panel de VIM (`apps/platform`), ficha del cliente | Nueva sección **Operación**, junto a Módulos y límites (`modulos-limites.tsx`): los diez interruptores sin importar el giro, con las dependencias a la vista, el aviso de cuentas abiertas cuando algo no se puede apagar y el botón "Cambiar giro" (muestra qué se encenderá y qué se apagará antes de confirmar). El cambio llega a la caja en el siguiente latido |
| `solicitar-demo` | Acepta los giros nuevos |

Las pantallas siguen `docs/diseno/` y `tokens.css`; la página nueva reutiliza los interruptores que
ya usan Lealtad y Tienda.

## 8. Cuentas por nombre en barra

En un bar, la cuenta se abre a nombre de una persona ("Luis, camisa azul") y no a una mesa.

- **Datos:** `tickets` gana `nombre_cuenta varchar(60) NULL`. Una cuenta de barra es un ticket
  abierto con `modo_servicio = 'BARRA'` (el valor ya existe en el tipo), con `nombre_cuenta` y sin
  fila en `tickets_mesas`.
- **Caja:** un acceso **Barra** en el inicio muestra las cuentas abiertas como tarjetas con el
  nombre, el total y el tiempo abierta; un botón **Abrir cuenta** pide el nombre. Dentro, la cuenta
  funciona igual que una de mesa: agregar, mandar a cocina, dividir, cobrar.
- **Reglas:** nombre obligatorio; no puede haber dos cuentas abiertas con el mismo nombre en la misma
  sucursal (si se repite, la caja propone "Luis 2"). Una cuenta de barra se puede pasar a una mesa y
  al revés, si `comedor` está encendido.
- **Ticket impreso y comanda:** muestran el nombre de la cuenta donde hoy va la mesa.
- **Sync:** `nombre_cuenta` viaja con el ticket por el camino de sync que ya existe; hay que
  agregarlo a la lista de columnas del push y del pull del escritorio.
- **Reportes:** las ventas de barra se cuentan aparte (`modo_servicio = 'BARRA'`), igual que hoy
  Para llevar.

Requiere instalador nuevo de la caja (ver la regla de empaquetado y la lista antes de publicar).

## 9. Pruebas

- **Smokes SQL** (`npm run smokes`, bloquean el merge):
  - `juego_inicial_de_giro` devuelve la tabla §5 para cada giro y todo encendido para
    `ENTERPRISE`/desconocido.
  - Un cliente existente queda con todo encendido después de la migración.
  - Las dependencias del disparador (apagar comedor apaga meseros, etc.).
  - No se puede apagar comedor ni barra con cuentas abiertas.
  - `modulos_efectivos` trae las diez llaves y `kds` es plan Y interruptor.
  - `nombre_cuenta` único entre cuentas abiertas de la sucursal.
  - Un usuario `authenticated` (dueño incluido) no puede cambiar `tenants.operacion` ni ejecutar
    `operacion_cambiar` ni `cambiar_giro`; `service_role` sí.
  - Nada de `CURRENT_DATE` contra fechas de negocio.
- **Caja (Playwright):** el inicio con el juego de cada giro (7 capturas), abrir, dividir y cobrar
  una cuenta de barra, y una caja con llaves desconocidas que muestra todo.
- **/platform:** la sección Operación enciende y apaga módulos en cualquier giro (por ejemplo,
  Domicilio en un food truck), respeta las dependencias, muestra el aviso de cuentas abiertas, y la
  caja lo refleja después del latido.
- **Admin:** la página nueva muestra lo encendido y no tiene controles.
- **Sync de barra:** una cuenta de barra creada sin internet sube con su nombre.

## 10. Riesgos

- **Knock-Out** opera a diario: con todo encendido por defecto no ve ningún cambio hasta que alguien
  ajuste sus módulos. No se le aplica el juego de su giro sin avisar.
- **El enum de Postgres** no permite usar un valor nuevo en la misma transacción en que se agrega:
  agregar los valores en una migración y usarlos en la siguiente.
- **Migraciones a producción a mano y antes del merge** (regla del proyecto).
