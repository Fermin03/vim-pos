# Cómo cortarle el acceso a una caja

**La palanca es `cajas.activa = false`. Regenerar la clave del dispositivo YA NO corta al instante.**

Esto cambió el 9 sep 2026, cuando las funciones que la caja llama en bucle dejaron de preguntarle
a GoTrue en cada llamada y pasaron a verificar la firma del token ellas mismas
(`supabase/functions/_shared/auth-dispositivo.ts`). Importa saberlo porque en el incidente de
Knock-Out del 8 sep se usó justo la palanca que ahora es la lenta.

## Qué corta y en cuánto tiempo

| Acción | Efecto |
|---|---|
| **`cajas.activa = false`** (o `deleted_at`) | **Inmediato**, en la siguiente llamada de la caja |
| Regenerar la clave del dispositivo | Solo impide **nuevos** logins. El token que ya tenga sigue sirviendo hasta que expire |
| Borrar o banear el usuario en `auth.users` | Igual: hasta que expire el token que ya tenga |

La ventana de esos dos últimos es el `exp` del token: **una hora como mucho** con el TTL por
defecto del proyecto. No hay lista de revocación ni forma de acortarla salvo bajar el JWT expiry
en Supabase, cosa que afecta a todas las sesiones.

## El procedimiento

1. **Desactiva la caja.** En `/platform`, o directo:
   ```sql
   UPDATE cajas SET activa = false WHERE id = '<caja_id>';
   ```
   Con eso, `delivery-espejo`, `sync-push` y `sync-pull` le contestan 403 en la siguiente vuelta:
   deja de subir ventas, de bajar el catálogo y de ver pedidos de apps.

2. **Solo si además sospechas de la credencial**, regenera la clave del dispositivo. Eso impide
   que vuelva a entrar; no expulsa al que ya está dentro.

3. Si de verdad hay que expulsar YA a alguien con un token robado y no basta con el paso 1,
   la única salida es rotar el JWT secret del proyecto — que invalida **todas** las sesiones de
   todos los clientes. Es la opción nuclear y tiene su propia nota:
   el secreto no se rotó en agosto justamente por eso.

## Al revés: reactivar

`activa = true` la devuelve al aire en la siguiente vuelta (≤5 min si no tiene delivery, ≤30 s si
lo tiene). Ojo con el límite del plan: `activa` es lo que cuenta para el máximo de cajas por
sucursal (migración 0103), así que reactivar una caja puede chocar con el límite si entretanto se
dio de alta otra.

Una caja desactivada **conserva sus ventas locales**: no se pierden, se suben cuando vuelva a
estar activa.
