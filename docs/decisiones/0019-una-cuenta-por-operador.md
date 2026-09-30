# 0019 — Una cuenta por operador en el panel, y la clave compartida se retira sola

**Fecha:** 2026-09-30 · **Estado:** vigente

## Qué había

El panel interno (`platform.vimpos.com.mx`) se abría con una clave compartida
(`PLATFORM_PROVISION_KEY`). Con ella se lista a todos los clientes, se entra como cualquier dueño, se
mueven planes y folios y —desde el ADR 0014— se publica el instalador de todas las cajas. La
bitácora atribuía todo al mismo UUID de sistema, y quitarle el acceso a una persona obligaba a
cambiarle la clave a todos. Era el pendiente A8.

## Qué hacemos

- **Cada operador es una cuenta de Supabase Auth con contraseña y segundo factor (TOTP).** La lista
  de quién es operador vive en `plataforma_operadores` (0128), sin políticas de RLS: solo el
  servidor del panel la toca. En cada petición el servidor exige un token válido, con `aal2`, de
  una cuenta que siga activa: desactivar a alguien surte efecto en su siguiente clic.
- **La clave compartida deja de servir sola** en cuanto el primer operador entra con su segundo
  factor (`activado_at`). No hay que tocar variables en Vercel. Si un día se desactiva o
  restablece a todos, vuelve a servir: es la salida para no quedar fuera del propio panel.
- **Invitar no manda correo.** Genera un enlace de un solo uso a `/acceso`, con el token en el
  fragmento (no llega a ningún log). La página lo canjea directo contra Auth: no depende de que
  salga el correo de Supabase ni de registrar la URL entre las de redirección.
- **Cuentas exclusivas.** El correo de un operador no puede ser el de una cuenta que ya existe (un
  dueño de negocio): mezclar los dos accesos en una contraseña haría que cambiarla aquí la cambiara
  allá.
- **La bitácora dice quién.** `super_admin_accesos.super_admin_id` es el operador real;
  `tenant_id` admite nulo para lo que no es de un negocio (invitar, desactivar).

De paso: `/api/provisionar` no pedía autorización y reenviaba con la clave del servidor. Cualquiera
con la URL podía dar de alta un negocio en producción. Ahora pasa por el mismo `autorizar`.

## Cómo se arranca

1. Entrar con la clave compartida → Operadores → invitarse a uno mismo, con un correo exclusivo.
2. Abrir el enlace, elegir contraseña y dar de alta la app autenticadora.
3. Desde ese momento la clave compartida responde "ya no sirve".

Si TOTP estuviera apagado en el proyecto (Authentication → Multi-Factor), el paso 2 lo dice y la
clave sigue sirviendo mientras tanto: nadie queda fuera.

Recuperación si nadie puede entrar: `update plataforma_operadores set activado_at = null` por SQL
(o desactivar a todos) devuelve la clave compartida.
