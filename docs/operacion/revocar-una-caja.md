# Cómo cortarle el acceso a una caja

**La palanca de siempre es `cajas.activa = false`.** Desde el 9 sep 2026 corta en las tres
funciones que importan; antes solo cortaba en el espejo de delivery.

## Qué corta y en cuánto tiempo

| Acción | Efecto |
|---|---|
| **`cajas.activa = false`** (o `deleted_at`) | **Inmediato**, en la siguiente llamada de la caja |
| Borrar o banear el usuario en `auth.users` | **Inmediato**: las funciones validan el token contra GoTrue en cada llamada |
| Regenerar la clave del dispositivo | **NO corta al instante.** Solo impide *nuevos* logins; el token que la caja ya tenga sigue sirviendo hasta que expire (≤1 h) |

Esa tercera fila es la que engaña, y no es nueva: `getUser` comprueba que el usuario siga vivo,
no que su contraseña siga siendo la misma. En el incidente de Knock-Out del 8 sep se regeneró la
clave del dispositivo; lo que resolvió aquello fue que la caja volviera a entrar con la clave
nueva, no que a la vieja se le cortara el paso.

## El procedimiento

1. **Desactiva la caja.** En `/platform`, o directo:
   ```sql
   UPDATE cajas SET activa = false WHERE id = '<caja_id>';
   ```
   Con eso, `delivery-espejo`, `sync-push` y `sync-pull` le contestan 403 en la siguiente vuelta:
   deja de subir ventas, de bajar el catálogo y de ver pedidos de apps.

   Hasta el 9 sep 2026 **`sync-push` y `sync-pull` no comprobaban esto**: una caja desactivada
   seguía subiendo ventas y bajando el catálogo completo del tenant. Si operas una versión
   anterior de esas funciones, desactivar no basta.

2. **Si además sospechas de la credencial**, regenera la clave del dispositivo. Impide que vuelva
   a entrar; no expulsa al que ya está dentro.

3. **Si hay que expulsar YA a alguien con un token robado**, borra o banea el usuario del
   dispositivo en `auth.users`. Eso sí surte efecto en la siguiente llamada.

## Al revés: reactivar

`activa = true` la devuelve al aire en la siguiente vuelta (≤5 min si no tiene delivery, ≤30 s si
lo tiene). Ojo con el límite del plan: `activa` es lo que cuenta para el máximo de cajas por
sucursal (migración 0103), así que reactivar una caja puede chocar con el límite si entretanto se
dio de alta otra.

Una caja desactivada **conserva sus ventas locales**: no se pierden, se suben cuando vuelva a
estar activa.
