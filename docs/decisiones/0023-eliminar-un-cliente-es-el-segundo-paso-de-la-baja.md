# 0023 — Eliminar un cliente es el segundo paso de la baja, y la base decide si se puede

**Fecha:** 2026-10-01 · **Estado:** vigente

## Qué decía el plan

- **Doc 12 §9 y ADR 0014:** el panel administra el ciclo de vida de un tenant por su `estado`
  (`TRIAL`, `ACTIVO`, `SUSPENDIDO`, `CANCELADO`). Cancelar "no borra su historial y se puede
  reactivar". No existe la eliminación: todas las llaves a `tenants` son `ON DELETE RESTRICT` a
  propósito.
- **0010 y 0133:** el reporte Z no se borra nunca (`trg_reporte_z_inmutable`) y las tablas de
  dinero no admiten DELETE desde el cliente (`guardia_escritura_directa`).
- **0130:** un pago de suscripción "se anula, no se borra".

## Qué hacemos ahora

1. **Dos pasos.** Solo se elimina un cliente que ya está `CANCELADO`. Un `INTERNO`, nunca. El
   botón vive en la Zona peligrosa de la ficha y solo aparece con el cliente cancelado.
2. **Guardia fiscal, sin excepción.** Con un solo CFDI que haya llegado al SAT (`uuid_fiscal`,
   vigente o cancelado) no se elimina: "Tiene facturas timbradas: se conservan por obligación
   fiscal. Queda dado de baja." Tampoco con un timbrado a medias (`EN_PROCESO_TIMBRADO`).
3. **La base decide y borra, en una transacción** (`eliminar_tenant`, 0144, solo `service_role`).
   No hay lista de tablas escrita a mano: salen del catálogo (toda tabla de `public` con
   `tenant_id`) y se borran en **una sola sentencia**, con las llaves foráneas encendidas. Postgres
   las comprueba al terminar la sentencia, así que el orden y los ciclos (tickets ↔ mesas ↔
   cuentas) no importan, y cualquier fila ajena que apunte al negocio hace fallar todo. Al final se
   recorre el catálogo otra vez: una fila que quede con ese `tenant_id` aborta la transacción.
4. **Qué queda.** Una fila en `tenants_eliminados` (id, código, nombre, giro, plan, fechas de
   alta/baja/eliminación, motivo, quién, cuántas filas se borraron por tabla, copia de
   `suscripciones` y `pagos_suscripcion`, y nombre/correo/teléfono del dueño) y la bitácora:
   las filas de `super_admin_accesos` del negocio se quedan sin la llave y con
   `payload.tenant_eliminado`, más un asiento `tenant.eliminar` escrito en la misma transacción.
5. **Qué se va.** Todo lo demás, incluidas las cuentas de `auth.users` que solo eran de ese
   negocio (dueño, empleados, dispositivos `caja-…@dispositivos…`). Una cuenta con acceso a otro
   negocio, dueña de otro, de un operador del panel, o citada desde filas de otro negocio, se
   conserva y solo pierde este acceso. Los archivos de Storage los borra el servidor del panel
   por la API **después** del commit; sus nombres salen del id del CFDI, no de `*_storage_path`.
6. **El código queda libre**: el mismo negocio puede volver a registrarse.
7. **Confirmación:** motivo (10+), el nombre del negocio y además la palabra `ELIMINAR`. Antes de
   pedir nada, el diálogo enseña lo que se va a borrar, leído de la base en ese momento.

### Cómo pasa las guardas de dinero

- `guardia_escritura_directa` (0133) **no se toca**: solo actúa en escrituras REST directas a
  tabla de un rol sujeto a RLS, y esto es una RPC que corre como el dueño de la función.
- `trg_reporte_z_inmutable` rechaza todo DELETE, venga de quien venga. Se le añade **una**
  excepción, `_eliminando_tenant(OLD.tenant_id)`, que exige las dos cosas: la variable de
  transacción `vim.eliminando_tenant` con ese mismo tenant (la pone y la quita `eliminar_tenant`)
  **y** que quien ejecuta no esté sujeto a RLS. `authenticated` no cumple lo segundo nunca, así
  que fijar la variable desde una sesión del negocio no abre nada (pgTAP 0028 lo prueba con una
  política de DELETE abierta a propósito). No se desactiva ningún trigger.

## Por qué

- El registro público (0142) deja altas de prueba y pruebas abandonadas con el código tomado.
  Cancelarlas no las quita de las cifras ni libera el código.
- `session_replication_role = replica` habría sido lo fácil (sin triggers ni llaves), pero el rol
  de las migraciones no puede fijarlo en Supabase, y apagar las llaves es justo lo contrario de
  "que falle si queda algo".
- Una lista de tablas a mano se pudre con la primera migración que añada una; un `CASCADE` en las
  88 llaves a `tenants` convertiría un `DELETE` suelto en la pérdida de un cliente.
- El asiento de bitácora va dentro de la función y no en la ruta: una eliminación sin rastro no
  puede existir, ni siquiera si el servidor del panel se cae entre el commit y el `auditar`.

## Consecuencias

- **No hay vuelta atrás ni respaldo propio.** Lo único que rescata a un cliente eliminado por
  error es el respaldo de la plataforma (PITR), y restaurarlo es restaurar la base entera.
- **Un cliente que facturó no se elimina nunca** desde el panel. Si algún día hace falta (ARCO),
  es una decisión con contador de por medio, no un botón.
- **Se guarda un dato personal del dueño** (correo y teléfono) después de eliminarlo, para el
  seguimiento comercial. Si pide que se borre, se vacía `tenants_eliminados.contacto` a mano.
- **La caja instalada de un cliente eliminado** se queda sin cuenta: `caja-latido`, `sync-pull`
  y `sync-push` contestan 401 (`AUTH_INVALIDA`) en cuanto intenta renovar su sesión, y `pin-login`
  igual. Nada se escribe en la nube —toda tabla exige un tenant que ya no existe— y la caja no
  entra en bucle: registra el fallo y reintenta en su ciclo normal. Sigue vendiendo en local,
  como cualquier caja sin directivas (ADR 0014: el bloqueo no es una barrera de seguridad); esas
  ventas no suben a ningún lado. Por eso el orden es cancelar (que sí bloquea la caja por
  latido) y eliminar después.
- **Corre dentro del límite de tiempo de una petición.** Pensado para negocios chicos; uno con
  cientos de miles de filas puede agotar el tiempo, y entonces no se borra nada (se ejecuta la
  función desde SQL con el tiempo ampliado).
- **Una tabla nueva sin `tenant_id` que cuelgue de una del negocio** necesita `ON DELETE CASCADE`
  (como `rol_permisos`); si no, la eliminación falla diciendo qué llave estorba. Es el
  comportamiento buscado, pero hay que saberlo al diseñar tablas hijas.
- **Un trigger nuevo que prohíba el DELETE** en una tabla del negocio romperá la eliminación
  hasta que consulte `_eliminando_tenant()`. `smoke_eliminar_tenant.sql` lo caza: llena 42
  tablas y exige cero filas al terminar.
