# Edge Functions — VIM POS

## `pin-login` (doc 1F §5)

Verifica el PIN de un empleado (RPC `verificar_pin_login`, migración 0006) y acuña
un **JWT de empleado** firmado HS256 con el JWT secret del proyecto. El RLS lo acepta
porque va firmado con el mismo secreto que usa GoTrue.

### Probar el esqueleto de autenticación (local)

Necesitas el stack local arriba con el fixture de dev cargado:

```powershell
cd "D:\...\vim-pos"
supabase start
supabase db reset            # carga seed.sql, incluido el fixture DEV (María, PIN 1234)
```

El fixture crea (UUIDs fijos):
- Cajero **María** = `99999999-0000-0000-0000-000000000001`, PIN **1234**
- Caja = `99999999-0000-0000-0000-0000000000cc` (tenant Knock-Out)

Sirve la función (en otra terminal). `--no-verify-jwt` permite llamarla sin sesión de
dispositivo durante la prueba:

```powershell
supabase functions serve pin-login --env-file supabase/functions/.env --no-verify-jwt
```

Toma el **anon key** local de `supabase status` (campo "anon key") y guárdalo:

```powershell
$ANON = "<anon key local de supabase status>"
$base = "http://127.0.0.1:54321"
```

**1) Login con PIN correcto** → debe devolver `access_token`:

```powershell
$r = Invoke-RestMethod -Method Post -Uri "$base/functions/v1/pin-login" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $ANON" } `
  -ContentType "application/json" `
  -Body '{"usuario_id":"99999999-0000-0000-0000-000000000001","pin":"1234","caja_id":"99999999-0000-0000-0000-0000000000cc"}'
$r | ConvertTo-Json
$TOKEN = $r.access_token
```

**2) El JWT acuñado respeta RLS** → con ese token, listar sucursales debe devolver
SOLO la de Knock-Out (aislamiento por tenant funcionando con el token de pin-login):

```powershell
Invoke-RestMethod -Method Get -Uri "$base/rest/v1/sucursales?select=codigo,nombre" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $TOKEN" }
# Esperado: [ { "codigo": "KC", "nombre": "León Centro" } ]
```

**3) PIN incorrecto** → debe devolver 401:

```powershell
Invoke-RestMethod -Method Post -Uri "$base/functions/v1/pin-login" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $ANON" } `
  -ContentType "application/json" `
  -Body '{"usuario_id":"99999999-0000-0000-0000-000000000001","pin":"0000","caja_id":"99999999-0000-0000-0000-0000000000cc"}'
# Esperado: error 401 PIN_INCORRECTO (y a los 3 intentos: bloqueo 5 min)
```

Si el paso 2 devuelve solo la sucursal de Knock-Out, **la cadena de auth está validada**:
PIN → JWT de empleado → RLS por tenant. 🎉
