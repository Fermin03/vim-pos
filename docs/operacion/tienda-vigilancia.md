# Tienda en línea — qué vigilar después de encenderla

Para saber si la tienda está funcionando sin esperar a que un cliente se queje. Todo sale de la base
de producción; **no hay tablero todavía**: son consultas que se copian y se pegan en Supabase → SQL
Editor. Ninguna cambia nada (todas son `SELECT`).

**Quién las corre:** Claude, cuando se lo pidas («corre la consulta 2 de vigilancia»), o tú mismo en
el SQL Editor. Las horas salen en hora del centro de México.

> Las consultas se probaron el 9 oct 2026 contra una base local recién creada con las migraciones
> hasta la 0166 (todas corren sin error; la base estaba vacía, así que no se vio ningún resultado
> real). Las tres que miran los procesos programados (`cron.…`, consulta 10) **no se pudieron probar**:
> esa parte solo existe en producción. Si alguna marca error la primera vez, se corrige aquí.

Qué significan los estados de un pedido, en llano:

| Estado | Qué pasó |
|---|---|
| `RECIBIDO` | Llegó y nadie lo ha aceptado todavía |
| `ACEPTADO` | Lo aceptaron, pero la caja todavía no avisa que ya le creó su cuenta |
| `EN_PREPARACION` | La caja ya tiene la cuenta («ya lo tengo») |
| `LISTO` | Se imprimió el ticket o se le asignó repartidor |
| `ENTREGADO` | Se cobró |
| `EXPIRADO` | Nadie lo aceptó a tiempo y se venció solo |
| `RECHAZADO` | El cajero (o la caja) lo rechazó antes de aceptarlo |
| `CANCELADO` | Se canceló después de aceptado |

---

## Qué mirar la primera semana

Cada mañana, cinco minutos:

1. **Consulta 1** — ¿hubo pedidos ayer y cómo terminaron? Lo sano es que casi todos acaben en
   `ENTREGADO`.
2. **Consulta 2** — vencidos sin aceptar. Uno suelto es normal; varios en la misma sucursal quiere
   decir que la tienda está abierta y nadie mira la caja (sin sonido, sin internet, sin gente).
   Llamar al negocio.
3. **Consulta 3** — atascados. Debe salir **vacía**. Si sale algo, es un error nuestro: avisar a
   Claude con el folio.
4. **Consulta 4** — cancelados solos. Si un negocio acumula varios, casi siempre es que cambia
   precios o apaga productos a media venta, o que su caja se apaga con pedidos aceptados.
5. **La carga de la base** en el panel de Supabase (Reports → Database → CPU). Entrar a una cuenta
   gasta procesador de la misma base que usan las cajas; si la CPU sube sin que haya más ventas,
   mirar la **consulta 8** (topes) y avisar a Claude.

Una vez en la semana: consultas 7 (cajas viejas en negocios con tienda), 9 (cuentas) y 10 (que los
procesos automáticos corren). Y los registros de la función `tienda` en Supabase (Edge Functions →
tienda → Logs), buscando estas cuatro frases:

- `CUPO_NEGOCIO_AGOTADO` — un restaurante llegó a su tope de pedidos por hora (60). O le va muy
  bien, o alguien lo está llenando de pedidos falsos.
- `CUPO_ENTRADAS_AGOTADO` — un restaurante llegó a su tope de entradas a cuentas (300 en 10
  minutos): alguien está probando contraseñas contra sus clientes.
- `sin correo de` — falta un secreto del correo: los clientes no reciben el enlace de su pedido ni
  el de recuperar contraseña, y la pantalla no avisa.
- `IP_CLIENTE_DESCONOCIDA` — la tienda no está pasando la dirección del visitante; los topes dejan
  de distinguir a un cliente de otro.

Lo que **no** se registra, para no buscarlo: los pedidos que salieron bien, los registros y las
entradas a cuentas no dejan línea en los registros. Eso se ve en la base (consultas 1 y 9).

---

## 1. Pedidos por día, negocio y desenlace

```sql
SELECT (p.recibido_at AT TIME ZONE 'America/Mexico_City')::date AS dia,
       t.nombre_comercial AS negocio,
       p.estado,
       count(*) AS pedidos,
       sum(p.total_cliente_mxn) AS total_mxn
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
 WHERE p.canal = 'TIENDA'
   AND p.recibido_at > now() - interval '14 days'
 GROUP BY 1, 2, 3
 ORDER BY 1 DESC, 2, 3;
```

Para ver solo cuánto tardan en aceptar (en minutos, por negocio, última semana):

```sql
SELECT t.nombre_comercial AS negocio,
       count(*) AS aceptados,
       round(avg(extract(epoch FROM p.aceptado_at - p.recibido_at) / 60)::numeric, 1) AS minutos_promedio,
       round(max(extract(epoch FROM p.aceptado_at - p.recibido_at) / 60)::numeric, 1) AS minutos_el_peor
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
 WHERE p.canal = 'TIENDA' AND p.aceptado_at IS NOT NULL
   AND p.recibido_at > now() - interval '7 days'
 GROUP BY 1
 ORDER BY 3 DESC;
```

## 2. Vencidos sin aceptar

La tienda estaba abierta, el cliente pidió y nadie contestó.

```sql
SELECT (p.recibido_at AT TIME ZONE 'America/Mexico_City') AS recibido,
       t.nombre_comercial AS negocio,
       s.nombre AS sucursal,
       p.folio_corto,
       p.gestion,
       p.total_cliente_mxn
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
  JOIN sucursales s ON s.id = p.sucursal_id
 WHERE p.canal = 'TIENDA' AND p.estado = 'EXPIRADO'
   AND p.recibido_at > now() - interval '7 days'
 ORDER BY p.recibido_at DESC;
```

`gestion` dice quién debía atenderlo: `ESCRITORIO` = una caja instalada; `NUBE` = el POS abierto en
el navegador.

## 3. Atascados (debe salir vacía)

Pedidos que llevan demasiado tiempo en un estado de paso. Hay cuatro formas de atascarse y la
columna `por_que` dice cuál.

```sql
SELECT t.nombre_comercial AS negocio,
       s.nombre AS sucursal,
       p.folio_corto,
       p.estado,
       p.gestion,
       (p.recibido_at AT TIME ZONE 'America/Mexico_City') AS recibido,
       (p.ticket_id IS NOT NULL) AS con_cuenta_en_la_nube,
       CASE
         WHEN p.estado = 'RECIBIDO' THEN 'venció y nadie lo marcó: el proceso de cada minuto no corre (consulta 10)'
         WHEN p.estado = 'ACEPTADO' AND p.gestion = 'ESCRITORIO' THEN 'la caja lo aceptó y no avisó que ya lo tiene; debió cancelarse solo a los 15 minutos'
         WHEN p.gestion = 'NUBE' THEN 'cuenta del POS web abierta mucho tiempo (más de 7 días ya no se pone al día sola)'
         ELSE 'la caja dejó de reportar: apagada, sin internet o cuenta sin cobrar'
       END AS por_que
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
  JOIN sucursales s ON s.id = p.sucursal_id
 WHERE p.canal = 'TIENDA'
   AND (   (p.estado = 'RECIBIDO' AND p.vence_aceptacion < now() - interval '5 minutes')
        OR (p.estado = 'ACEPTADO' AND p.gestion = 'ESCRITORIO' AND p.aceptado_at < now() - interval '20 minutes')
        OR (p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO') AND p.recibido_at < now() - interval '6 hours'))
 ORDER BY p.recibido_at;
```

El último caso (más de 6 horas sin terminar) también lo produce algo inocente: una cuenta de
Domicilio o Pick-up que el negocio dejó sin cobrar. Si es un solo negocio y siempre al cierre, es
eso; decirle que cobre o cancele sus cuentas.

## 4. Cancelados solos por la caja, y por qué

La nube solo sabe que el pedido se canceló con el motivo genérico (`OTRO`); **el porqué exacto lo
tiene la caja**, en la tarjeta del pedido y en su registro. Esta consulta separa los casos que sí
se distinguen desde aquí:

```sql
SELECT (p.cancelado_at AT TIME ZONE 'America/Mexico_City') AS cancelado,
       t.nombre_comercial AS negocio,
       s.nombre AS sucursal,
       p.folio_corto,
       p.estado,
       CASE
         WHEN p.estado = 'RECHAZADO' THEN 'la caja no pudo armarlo antes de aceptarlo (precio, zona o producto que cambió)'
         WHEN p.ticket_id IS NULL AND p.cancelado_at >= p.aceptado_at + interval '15 minutes'
              THEN 'aceptado, y en 15 minutos la caja no avisó que ya lo tenía (caja apagada o sin turno)'
         WHEN p.ticket_id IS NULL THEN 'la caja lo aceptó y no pudo armarlo (precio, zona o producto que cambió)'
         ELSE 'alguien canceló la cuenta en la caja'
       END AS probable_causa,
       round(extract(epoch FROM p.cancelado_at - p.aceptado_at) / 60) AS minutos_tras_aceptar
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
  JOIN sucursales s ON s.id = p.sucursal_id
 WHERE p.canal = 'TIENDA' AND p.gestion = 'ESCRITORIO'
   AND p.estado IN ('CANCELADO', 'RECHAZADO')
   AND p.motivo_cancelacion = 'OTRO'
   AND p.cancelado_at > now() - interval '7 days'
 ORDER BY p.cancelado_at DESC;
```

- `probable_causa` es una deducción, no un dato: un cajero que rechaza eligiendo «Otro» sale igual
  que un rechazo de la caja. Para el motivo cierto, pedir al negocio lo que dice la tarjeta del
  pedido, o el archivo `%APPDATA%\vim-pos-desktop\vim-pos.log` de esa caja (buscar `[espejo]` y el
  folio). Ver [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md).
- `con cuenta en la nube` puede tardar: la caja sube sus cuentas cada 10 minutos, así que un pedido
  recién cancelado puede salir «sin cuenta» y sí tenerla.

Los rechazos y cancelaciones que el cajero hizo con motivo (para ver de qué se quejan los clientes):

```sql
SELECT t.nombre_comercial AS negocio, p.estado, p.motivo_cancelacion, count(*) AS pedidos
  FROM delivery_pedidos p
  JOIN tenants t ON t.id = p.tenant_id
 WHERE p.canal = 'TIENDA' AND p.estado IN ('CANCELADO', 'RECHAZADO')
   AND p.cancelado_at > now() - interval '7 days'
 GROUP BY 1, 2, 3
 ORDER BY 1, 4 DESC;
```

`AGOTADO` = se acabó algo; `SATURADO` = demasiados pedidos; `CERRADO` = ya iban a cerrar; `OTRO` =
lo demás.

## 5. Negocios con el complemento y tiendas encendidas

```sql
SELECT t.nombre_comercial AS negocio,
       t.estado,
       pl.codigo AS plan,
       ta.incluido_en_plan,
       ta.precio_mensual_mxn AS precio,
       COALESCE(c.modulo_tienda_activo, false) AS tienda_encendida,
       tc.slug AS direccion
  FROM tenant_addons ta
  JOIN addons a ON a.id = ta.addon_id AND a.codigo = 'TIENDA'
  JOIN tenants t ON t.id = ta.tenant_id
  LEFT JOIN planes pl ON pl.id = t.plan_actual_id
  LEFT JOIN configuracion_tenant c ON c.tenant_id = t.id
  LEFT JOIN tienda_config tc ON tc.tenant_id = t.id
 WHERE ta.activo
   AND ta.fecha_inicio <= (now() AT TIME ZONE 'America/Mexico_City')::date
   AND (ta.fecha_fin IS NULL OR ta.fecha_fin >= (now() AT TIME ZONE 'America/Mexico_City')::date)
 ORDER BY tienda_encendida DESC, 1;
```

- `tienda_encendida = true` y `direccion` con valor: su tienda está en
  `pedidos.vimpos.com.mx/<direccion>`.
- `tienda_encendida = false`: tiene permiso y no la ha encendido (lo normal al principio).

El estado del complemento en el catálogo (antes de encender debe decir `activo = false`):

```sql
SELECT codigo, activo, precio_mensual_mxn FROM addons WHERE codigo = 'TIENDA';
```

## 6. Sucursales que de verdad reciben pedidos ahora

Una tienda encendida no recibe nada si su sucursal no tiene una caja con turno abierto avisando.
Esta consulta dice, **en este momento**, quién está recibiendo.

```sql
SELECT t.nombre_comercial AS negocio,
       s.nombre AS sucursal,
       ts.recoger,
       ts.domicilio,
       sucursal_recibe_pedidos(ts.sucursal_id) AS recibe_ahora,
       (ts.pausa_hasta IS NOT NULL AND ts.pausa_hasta > now()) AS en_pausa,
       (SELECT max(cj.espejo_turno_abierto_at) AT TIME ZONE 'America/Mexico_City'
          FROM cajas cj WHERE cj.sucursal_id = ts.sucursal_id AND cj.activa) AS ultimo_aviso_de_turno
  FROM tienda_sucursales ts
  JOIN sucursales s ON s.id = ts.sucursal_id
  JOIN tenants t ON t.id = ts.tenant_id
  JOIN configuracion_tenant c ON c.tenant_id = ts.tenant_id AND c.modulo_tienda_activo
 WHERE ts.participa
 ORDER BY recibe_ahora DESC, 1, 2;
```

`recibe_ahora = false` a una hora en que el negocio está abierto: o no han abierto turno, o la caja
no tiene internet, o es una caja anterior a la 0.8.0 (consulta 7). Esta consulta no mira el horario
que configuró el dueño: fuera de su horario la tienda tampoco recibe aunque diga `true`.

## 7. Cajas con versión anterior a la 0.8.0 en negocios con la tienda encendida

Una caja anterior a la 0.8.0 no recibe pedidos de la tienda ni avisa que tiene turno abierto.

```sql
SELECT t.nombre_comercial AS negocio,
       s.nombre AS sucursal,
       cj.nombre AS caja,
       COALESCE(cj.version_app, 'sin dato') AS version,
       (cj.ultimo_latido AT TIME ZONE 'America/Mexico_City') AS ultima_senal
  FROM cajas cj
  JOIN sucursales s ON s.id = cj.sucursal_id
  JOIN tenants t ON t.id = cj.tenant_id
  JOIN configuracion_tenant c ON c.tenant_id = cj.tenant_id AND c.modulo_tienda_activo
 WHERE cj.activa
   AND cj.ultimo_latido > now() - interval '14 days'
   AND CASE WHEN cj.version_app ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
            THEN string_to_array(cj.version_app, '.')::int[] < ARRAY[0, 8, 0]
            ELSE true END
 ORDER BY 1, 2, 3;
```

Debe salir vacía. Lo que salga: pedirle al negocio que actualice esa caja. Solo salen cajas que
dieron señal en los últimos 14 días (las demás están guardadas en un cajón).

La misma revisión **antes** de que un negocio encienda (por ejemplo Knock-Out), cambiando el nombre:

```sql
SELECT s.nombre AS sucursal, cj.nombre AS caja, COALESCE(cj.version_app, 'sin dato') AS version,
       (cj.ultimo_latido AT TIME ZONE 'America/Mexico_City') AS ultima_senal
  FROM cajas cj
  JOIN sucursales s ON s.id = cj.sucursal_id
  JOIN tenants t ON t.id = cj.tenant_id
 WHERE t.nombre_comercial ILIKE '%knock%' AND cj.activa
 ORDER BY 1, 2;
```

## 8. Topes alcanzados

La tienda limita cuántas veces se puede pedir, entrar, registrarse o recuperar contraseña desde
una misma red o para un mismo restaurante. Esta consulta enseña quién llegó a su tope **en la
ventana que está corriendo** (los contadores viejos se borran solos, así que no hay historia).

```sql
SELECT x.tope,
       x.clave,
       x.usos,
       x.maximo,
       (x.expira_en AT TIME ZONE 'America/Mexico_City') AS se_libera
  FROM (
    SELECT l.clave, l.usos, l.expira_en,
           CASE
             WHEN l.clave LIKE 'tienda:pide:negocio:%'  THEN 'pedidos por restaurante'
             WHEN l.clave ~ '^tienda:pide:ip:([0-9.]+|.*/64|desconocida)$' THEN 'pedidos por red, entre todos los restaurantes'
             WHEN l.clave LIKE 'tienda:pide:ip:%'       THEN 'pedidos por red'
             WHEN l.clave LIKE 'tienda:entra:negocio:%' THEN 'entradas por restaurante'
             WHEN l.clave LIKE 'tienda:entra:ip:%'      THEN 'entradas por red'
             WHEN l.clave LIKE 'tienda:registra:%'      THEN 'registros'
             WHEN l.clave LIKE 'tienda:recupera:%'      THEN 'recuperar contraseña'
             ELSE 'otro'
           END AS tope,
           CASE
             WHEN l.clave LIKE 'tienda:pide:negocio:%'  THEN 60
             WHEN l.clave ~ '^tienda:pide:ip:([0-9.]+|.*/64|desconocida)$' THEN 40
             WHEN l.clave LIKE 'tienda:pide:ip:%'       THEN 8
             WHEN l.clave LIKE 'tienda:entra:negocio:%' THEN 300
             WHEN l.clave LIKE 'tienda:entra:ip:%'      THEN 10
             WHEN l.clave LIKE 'tienda:registra:ip:%'   THEN 5
             WHEN l.clave LIKE 'tienda:registra:%'      THEN 3
             WHEN l.clave LIKE 'tienda:recupera:%'      THEN 3
           END AS maximo
      FROM limites_cupo l
     WHERE l.clave LIKE 'tienda:%' AND l.expira_en > now()
  ) x
 WHERE x.maximo IS NOT NULL AND x.usos >= x.maximo
 ORDER BY x.usos DESC;
```

Cómo leerla:

- **`pedidos por restaurante`** (60 por hora): el restaurante dejó de recibir pedidos hasta que se
  libere. Es lo más serio de la lista; también sale `CUPO_NEGOCIO_AGOTADO` en los registros.
- **`entradas por restaurante`** (300 cada 10 minutos): alguien está probando contraseñas contra las
  cuentas de ese restaurante, y mientras tanto ninguno de sus clientes puede entrar a su cuenta
  (pedir como invitado sigue funcionando). Avisar a Claude. También sale `CUPO_ENTRADAS_AGOTADO` en
  los registros.
- **`pedidos por red`** (8 por hora) o **`entradas por red`** (10 cada 10 minutos): una red llegó a
  su tope. Una o dos filas son normales (una oficina, una red de celular). Muchas redes distintas a
  la vez contra el mismo restaurante, no.
- **`pedidos por red, entre todos los restaurantes`** (40 por hora): una sola red intentó pedir 40
  veces en una hora, sumando todos los restaurantes. No es un cliente: es un programa. Si se repite,
  avisar a Claude.
- Los números de esta consulta son los topes vigentes al escribirla; si se cambian en la función
  `tienda`, hay que cambiarlos aquí.

Para ver cuánto movimiento hay en general, sin importar el tope:

```sql
SELECT split_part(l.clave, ':', 2) AS que, count(*) AS contadores_vivos, sum(l.usos) AS usos
  FROM limites_cupo l
 WHERE l.clave LIKE 'tienda:%' AND l.expira_en > now()
 GROUP BY 1
 ORDER BY 3 DESC;
```

## 9. Cuentas creadas y bloqueadas

```sql
SELECT t.nombre_comercial AS negocio,
       count(*) FILTER (WHERE cu.deleted_at IS NULL) AS cuentas,
       count(*) FILTER (WHERE cu.deleted_at IS NULL AND cu.created_at > now() - interval '7 days') AS nuevas_esta_semana,
       count(*) FILTER (WHERE cu.deleted_at IS NULL AND cu.bloqueada_hasta > now()) AS bloqueadas_ahora,
       count(*) FILTER (WHERE cu.deleted_at IS NULL AND cu.intentos_fallidos > 0) AS con_intentos_fallidos
  FROM tienda_cuentas cu
  JOIN tenants t ON t.id = cu.tenant_id
 GROUP BY 1
 ORDER BY 2 DESC;
```

- `bloqueadas_ahora`: cuentas con cinco contraseñas equivocadas seguidas; se desbloquean solas a los
  15 minutos. Una o dos es gente que olvidó su contraseña. Muchas a la vez en un mismo restaurante
  es alguien probando contraseñas (ver consulta 8).
- Muchas cuentas nuevas en un día sin pedidos que las acompañen (consulta 1): alguien está
  preguntando qué correos son clientes. Lo que se aceptó a sabiendas está en
  [`decisiones/0032`](../decisiones/0032-la-tienda-es-un-canal-y-sus-clientes-no-viven-en-auth.md).

Sesiones y enlaces de recuperación que ya vencieron y siguen guardados (deben ser pocos: se barren
solos una vez al día):

```sql
SELECT (SELECT count(*) FROM tienda_sesiones WHERE expira_at < now()) AS sesiones_vencidas,
       (SELECT count(*) FROM tienda_recuperaciones WHERE expira_at < now()) AS enlaces_vencidos,
       (SELECT count(*) FROM tienda_sesiones WHERE expira_at >= now()) AS sesiones_abiertas;
```

## 10. Que los dos procesos automáticos corren

La tienda depende de dos procesos programados en la base:

- **`delivery-expirados`**, cada minuto: vence los pedidos sin aceptar, pone al día los que se
  atienden desde el POS web y cancela los aceptados que la caja nunca confirmó.
- **`delivery-retencion`**, una vez al día (22:10, hora de México): borra los datos personales de
  los pedidos de más de 30 días.

Que están programados y activos:

```sql
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname IN ('delivery-expirados', 'delivery-retencion');
```

Deben salir los dos, con `active = true`.

Cuándo corrieron por última vez y cómo les fue:

```sql
SELECT j.jobname,
       (max(d.start_time) AT TIME ZONE 'America/Mexico_City') AS ultima_vez,
       count(*) FILTER (WHERE d.status = 'failed' AND d.start_time > now() - interval '24 hours') AS fallas_en_24_h
  FROM cron.job j
  LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
 WHERE j.jobname IN ('delivery-expirados', 'delivery-retencion')
 GROUP BY 1;
```

`delivery-expirados` debe haber corrido hace menos de dos minutos; `delivery-retencion`, anoche.
`fallas_en_24_h` debe ser 0. Para leer el error de una falla:

```sql
SELECT j.jobname, (d.start_time AT TIME ZONE 'America/Mexico_City') AS cuando, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname IN ('delivery-expirados', 'delivery-retencion') AND d.status = 'failed'
 ORDER BY d.start_time DESC
 LIMIT 10;
```

Y que la limpieza de datos personales sí está limpiando: pedidos de la tienda de más de 31 días que
todavía guardan algo del cliente. **Debe dar 0.**

```sql
SELECT count(*) AS pedidos_viejos_con_datos
  FROM delivery_pedidos p
 WHERE p.canal = 'TIENDA'
   AND p.recibido_at < now() - interval '31 days'
   AND (p.cliente_telefono IS NOT NULL OR p.cliente_email IS NOT NULL
        OR p.direccion IS NOT NULL OR p.nota_cliente IS NOT NULL OR p.seguimiento_hash IS NOT NULL
        OR jsonb_path_exists(p.items, '$[*] ? (@.nota != "")'));
```

---

## Lo que estas consultas no ven

- **La pantalla del cliente.** Si la tienda no carga por un problema de Vercel, del dominio o del
  antirobot, aquí simplemente dejan de aparecer pedidos. Si un negocio que vendía deja de recibir
  de golpe, abrir su tienda desde un teléfono antes de mirar la base.
- **Los correos.** Que un correo no haya salido solo se ve en los registros de la función.
- **Lo que pasa dentro de una caja sin internet.** La nube lo ve cuando la caja se reconecta.
