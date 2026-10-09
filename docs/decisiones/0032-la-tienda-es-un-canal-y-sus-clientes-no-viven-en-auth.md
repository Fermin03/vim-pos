# 0032 — La tienda en línea es un canal de `delivery_pedidos` y sus clientes no viven en Supabase Auth

**Fecha:** 9 de octubre de 2026 · **Estado:** vigente · **Cambia** un punto del diseño de la tienda
(`docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` §10): las contraseñas van con bcrypt
en la base, no con scrypt en la función.

## Qué había antes

La especificación no contemplaba una tienda propia: los pedidos de fuera llegaban solo por las apps
de reparto (Uber), a `delivery_pedidos`, y las únicas personas con cuenta en el sistema eran
empleados y dueños, en Supabase Auth, con su `tenant_id` en el JWT y RLS encima.

El diseño de la tienda (8 oct 2026) pedía cuentas para los comensales y proponía cifrar sus
contraseñas con scrypt dentro de la Edge Function.

## Qué hacemos ahora

**1. La tienda es un canal más, no un sistema aparte.** Un pedido de la tienda es una fila de
`delivery_pedidos` con `canal = 'TIENDA'` (`app` = `DRIVE_THRU` para recoger, `DELIVERY_PROPIO` a
domicilio; `conexion_id` nulo). La caja y el POS lo atienden en la misma bandeja «Pedidos en línea»
que los de Uber, y el camino de Uber (`canal = 'APP'`) no cambió.

**2. Los clientes de la tienda viven en tablas propias, por restaurante.** `tienda_cuentas`,
`tienda_sesiones`, `tienda_recuperaciones` y `tienda_direcciones` (0161, 0166). Una cuenta es de la
tienda de UN restaurante: el mismo correo en dos restaurantes son dos cuentas que no se conocen.
Las tablas están cerradas a todo rol salvo `service_role`; no hay política RLS que las abra porque
ningún navegador ni ninguna app con sesión de empleado las lee.

**3. Contraseñas con bcrypt en SQL (`pgcrypto`, coste 10).** Verificar, contar fallos, bloquear y
abrir sesión ocurren en una sola función SQL (`_tienda_password_ok` y las que la llaman), con la
fila de la cuenta bloqueada mientras tanto. La contraseña mide de 8 caracteres a 72 **bytes** (lo
que bcrypt mira), tal cual se escribió: ni se recorta ni se normaliza.

**4. Sesión por token opaco, no por JWT.** La función genera 128 bits al azar; a la base va solo su
huella SHA-256. El servidor de `apps/tienda` lo guarda en una cookie `HttpOnly` por negocio con
prefijo `__Host-` (`Secure`, `Path=/`, sin `Domain`) y lo reenvía a la función en la cabecera
`x-tienda-sesion`. El JavaScript del navegador nunca lo ve. Dura 30 días; cambiar o recuperar la
contraseña cierra las demás. El enlace de recuperación (30 minutos, un uso) lleva su token en el
fragmento (`#t=`), que no llega al servidor.

**5. Una sola puerta.** Todo pasa por la Edge Function `tienda`, que solo atiende al servidor de la
tienda (secreto compartido, sin CORS). El negocio sale siempre del slug y toda función SQL recibe
`p_tenant` y filtra por él: una sesión, un enlace o una dirección de otro negocio se comportan como
si no existieran. La cuenta de un pedido sale solo de la sesión, nunca del cuerpo.

## Por qué

**Por qué un canal.** La bandeja, el sonido, la aceptación, el ticket, la impresión y el espejo
hacia la caja ya existían para `delivery_pedidos`. Una tabla de pedidos nueva habría obligado a
duplicar todo eso y a enseñarle al cajero dos sitios donde mirar.

**Por qué no Supabase Auth.** Auth es un solo espacio de usuarios para todo el proyecto: ahí viven
los empleados, y de su JWT sale el `tenant_id` del que depende toda la RLS. Meter comensales ahí
mezcla dos poblaciones con permisos opuestos, no permite que el mismo correo sea cliente de dos
restaurantes sin que uno sepa del otro, y ata el borrado de una cuenta de comensal a las reglas de
las de empleado (ADR 0028). Un comensal no necesita un JWT: nunca le habla a la base.

**Por qué bcrypt en la base y no scrypt en la función.** Es el mecanismo que el proyecto ya usa y
tiene probado (los PIN del POS), y deja la verificación, el contador de fallos, el bloqueo y la
sesión en una transacción que los smokes sí cubren. El handler de la función no tiene arnés de
pruebas; con scrypt ahí, la parte más delicada habría quedado sin probar y el contador de fallos
habría necesitado un segundo viaje a la base, con su carrera.

## Consecuencias

Las que conviene tener presentes, dichas sin adornos:

- **`registrar` permite deducir si un correo ya es cliente de un restaurante.** El alta nueva
  contesta con la cuenta y abre sesión; el correo ya usado contesta un `ok` sin cuenta y la pantalla
  dice «Revisa tu correo para continuar». Es consecuencia directa de una decisión de producto: al
  registrarse se entra de una vez, sin confirmar el correo, porque el registro va dentro del flujo
  de compra. «Entra de una vez» y «responde igual exista o no» no caben juntas; se eligió la
  primera. Lo acotan el antirobot, 5 intentos por hora por IP y 3 por hora por correo, y tiene un
  coste para quien pregunta: si el correo NO era cliente, deja una cuenta creada y una bienvenida en
  ese buzón. `entrar` y `recuperar_pedir` sí contestan lo mismo, y hacen el mismo trabajo, exista o
  no la cuenta.
- **El bloqueo por 5 contraseñas malas le sirve a un tercero para estorbar.** Quien conoce el
  correo de alguien puede dejarlo 15 minutos sin poder entrar, y repetirlo: 5 fallos caben en el
  cupo de `entrar` (10 cada 10 minutos por IP). Durante el bloqueo tampoco se puede cambiar la
  contraseña ni eliminar la cuenta desde una sesión abierta. No se pierde nada: las sesiones ya
  abiertas siguen sirviendo para pedir, y un enlace de recuperación desbloquea. Se aceptó a cambio
  de frenar la adivinación de contraseñas.
- **bcrypt corre en la base del POS.** Cada intento de entrar es CPU del mismo Postgres que usan
  las cajas, y `entrar` no lleva antirobot ni tope global (solo por IP). Con muchas IP a la vez es
  carga real. Es lo primero que hay que vigilar al publicar la tienda; el remedio, si hiciera falta,
  es antirobot en `entrar` o un tope por negocio.
- **Los correos de cuenta van a direcciones sin verificar.** Por eso no llevan el nombre que se
  tecleó en el formulario (sería texto de un desconocido con nuestro remitente) y `registrar` y
  `recuperar_pedir` tienen tope por destinatario. Ese tope lo puede agotar otro: la víctima ve
  «demasiados intentos» una hora.
- **Todas las tiendas comparten origen** (`pedidos.vimpos.com.mx/<slug>`). Las cookies van por
  negocio y con nombre exacto, pero un XSS en una tienda alcanzaría las sesiones de las demás. No
  hay ninguno conocido; es una razón más para no pintar HTML de terceros.
- **Eliminar la cuenta borra la cuenta, no la venta.** Se borran cuenta, sesiones y direcciones
  guardadas, y los pedidos se desligan. El restaurante conserva en su sistema al cliente y los
  pedidos que ya le hicieron; la copia de un pedido en una caja conserva el identificador de la
  cuenta borrada (un uuid sin dato personal). El aviso de privacidad lo dice.
- **Sin SMTP o sin `VIM_TIENDA_URL` no sale ningún correo de cuenta** y la pantalla dice «revisa tu
  correo» igual. Recuperar la contraseña depende de esos secretos.

## Qué se dejó para después

- **Verificar el correo.** Es lo que cerraría la primera consecuencia (el alta nueva tampoco
  abriría sesión hasta confirmar) y quitaría de en medio los correos a direcciones ajenas. Cambia la
  decisión de producto de «entra de una vez»: necesita su propio visto bueno. La columna
  `email_verificado_at` ya existe y se sella al usar un enlace de recuperación.
- **Ligar la cuenta a la lealtad.** La cuenta guarda el teléfono en 10 dígitos, la misma forma por
  la que lealtad reconoce a un cliente (ADR 0030); falta conectarlas.
- **Idempotencia de `pedir`.** Un pedido reenviado tras una respuesta perdida puede crear dos. Hoy
  la pantalla lo evita no reintentando sola y mandando a llamar al restaurante.
- **Antirobot o tope global en `entrar`**, si la carga de bcrypt lo pide.
