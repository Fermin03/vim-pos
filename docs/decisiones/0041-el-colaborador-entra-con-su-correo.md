# 0041 — El colaborador entra con su correo

**Fecha:** 20 de octubre de 2026 · **Estado:** vigente (entrega 4 de 4 del giro de belleza)

## Qué había antes

La agenda solo vivía en la caja. Un colaborador que quería ver sus citas o marcar «Llegó» y «Terminé»
tenía que acercarse a la recepción. El celular del colaborador no es un dispositivo vinculado, y no
debe serlo: no queremos cajas ni PIN en teléfonos personales.

## Qué hacemos ahora

- **Correo y contraseña.** El dueño pulsa «Dar acceso a su celular» en Colaboradores; el colaborador
  recibe un enlace, pone su contraseña y entra a `/mi-agenda` del POS. Es una sesión web normal de
  Supabase Auth, no la de la caja.
- **Rol de base dedicado, `colaborador_web`.** El hook del token pone ese rol a todo login web (con
  `session_id`) de un usuario sin acceso activo de jerarquía 3 o más. Solo puede ejecutar cinco RPC:
  `mi_agenda`, `mi_cita_empezar`, `mi_cita_terminar`, `mis_comisiones` y `mi_periodo_comisiones`. No
  tiene privilegios sobre ninguna tabla. Las dos de comisiones son envolturas que filtran a
  `auth.uid()`; no se expone `comisiones_periodo`.
- **Segunda capa en RLS (0228).** `es_sesion_web_limitada()` saca a esas sesiones de clientes, citas,
  servicios de la cita, anticipos, cotizaciones y reservaciones, aunque el rol cambiara. La caja
  (dispositivo y PIN) y dueño, administrador y supervisor no cambian.
- **Las funciones de borde lo rechazan.** `servir()` contesta 403 `SIN_PERMISO` a cualquier token con
  ese rol antes de llamar al manejador, y `tenantDeClaims` devuelve nulo para él. Así ninguna Edge
  Function que actúa con `service_role` puede usarse con una cuenta de celular.
- **No ve datos de la clienta.** Ni teléfono ni correo.

## Lo que aceptamos

- **El rol queda fijo hasta que se renueve el token.** El hook decide al emitir el token. Si el dueño
  asciende a un colaborador (o le quita el acceso), el cambio llega al renovar el token (hasta una hora
  con la configuración actual) o al volver a entrar. Es aceptable porque la sesión del celular solo
  puede menos que la del panel.
- **La sesión vive en el navegador.** En un celular o computadora compartidos, la sesión persiste hasta
  «Cerrar sesión», que está siempre arriba en `/mi-agenda`. Quien use un equipo ajeno debe cerrarla. Un
  JWT acuñado fuera de GoTrue sin `session_id` (pin-login, escritorio) no recibe este límite: hoy son
  los únicos y no son sesiones web.
- **Cuentas de caja que entran al panel** ahora ven errores de permiso además del bloqueo por jerarquía.

## Descartado

- PIN o caja vinculada en el celular: mezcla identidades y abre la caja a un teléfono personal.
- Dar `EXECUTE` en `comisiones_periodo`: es INVOKER y con ese rol devolvería a todos.
