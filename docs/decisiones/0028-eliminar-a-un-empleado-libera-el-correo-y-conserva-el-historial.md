# 0028 — Eliminar a un empleado libera su correo y conserva el historial

**Fecha:** 2026-10-04 · **Estado:** vigente

## Qué decía el plan

- **0004 y el admin:** un empleado se da de baja **desactivándolo** (`usuarios_acceso.activo =
  false`, `usuarios_perfil.estado = 'DESACTIVADO'`). No existe eliminarlo.
- **`crear-empleado`:** cada empleado es una cuenta de `auth.users` con su correo, y el correo es
  único en toda la plataforma, no por negocio.
- **ADR 0022:** el registro contesta `EMAIL_YA_REGISTRADO` si el correo ya tiene cuenta.

Juntas dejaban un callejón: quien fue empleada de un negocio y abre el suyo no puede registrarse
con su correo, y nadie —ni su ex patrón ni VIM— podía liberarlo desde un panel.

## Qué hacemos ahora

1. **Eliminar es el segundo paso de la baja**, igual que con un cliente (ADR 0023): solo sobre un
   empleado ya desactivado. Nunca el dueño, una caja, un operador del panel ni uno mismo.
2. **La cuenta no se borra: se vacía** (`eliminar_usuario`, 0154, solo `service_role`, una
   transacción). El correo pasa a `eliminado-<id>@eliminados.vimpos.com.mx`, se quitan contraseña,
   teléfono, foto, PIN, metadatos, identidades, sesiones y permisos personalizados, y la cuenta
   queda bloqueada. El correo real queda libre en ese instante.
3. **El historial se queda, con nombre.** Turnos, pagos, cortes y autorizaciones siguen apuntando
   a la misma cuenta. El nombre se conserva con la marca " (cuenta eliminada)" escrita en el propio
   nombre, para que salga igual en el admin, en la caja y en los reportes sin tocar cada consulta.
   (Decisión de Fermín, 4 oct: con nombre, para seguir sabiendo quién hizo cada corte.)
4. **Dos puertas.** El dueño o un administrador, desde Usuarios del admin (`eliminar-empleado`).
   Y un operador de VIM con su cuenta y segundo factor, desde `/platform` → Liberar correo,
   buscando por correo y con motivo: es el caso de soporte, cuando el ex patrón solo desactivó.
5. **No se deshace y no se reactiva** (`trg_usuarios_acceso_no_revivir`). Si la persona vuelve al
   negocio, se da de alta como usuario nuevo.
6. **El rastro** queda en `auditoria_eventos` del negocio (`usuario.eliminar`) y, desde el panel,
   también en `super_admin_accesos`. Ninguno guarda el correo: guardarlo sería no liberarlo.

## Por qué no se borra la fila

- Unas 17 tablas de dinero la referencian con llaves `NOT NULL` sin regla de borrado, y el reporte
  Z es inmutable. Ese historial es del negocio, no de la persona.
- La caja puede traer tickets de esa persona que aún no suben; sin la cuenta en la nube, la subida
  se rechazaría. Por eso tampoco se borra a quien "nunca vendió": la nube no puede saberlo.
- El pull de la caja es un snapshot sin tombstones: una fila borrada en la nube se quedaría en la
  caja con su PIN. Conservando `usuarios_acceso` (inactivo), la ficha vacía baja en el siguiente
  pull y la caja se entera. **No hace falta instalador nuevo.**

## Lo que queda fuera

- Una cuenta con acceso a dos negocios (`ACCESO_A_OTRO_NEGOCIO`) se revisa a mano.
- El correo del **dueño** de un negocio se libera eliminando el negocio (ADR 0023), no aquí.
- `pin_intentos` y `sesiones_login` de la persona se conservan: son la bitácora de seguridad del
  negocio.
