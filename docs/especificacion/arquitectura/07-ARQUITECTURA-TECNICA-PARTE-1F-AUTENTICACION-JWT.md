# 07 — ARQUITECTURA TÉCNICA — Parte 1F: Autenticación, Sesiones y JWT

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** sexta entrega de la arquitectura técnica — modelo de autenticación, sesiones y emisión de JWT que habilita el RLS de toda la arquitectura
> **Depende de:** Parte 1A (tenants, sucursales, cajas, `usuarios_perfil`, `usuarios_acceso`, `roles`, `pin_intentos`), doc 09 (matriz de roles y helpers `current_user_*`), doc 10 (provisión de cuentas en setup)
> **Cierra:** el hueco crítico "¿cómo llega `tenant_id` al JWT?" del que dependen TODAS las políticas RLS de las Partes 1A–1E
> **Stack:** Supabase Auth (GoTrue) + Custom Access Token Hook (Postgres) + Edge Function (Deno) + PostgreSQL 15 RLS

---

## 📋 Tabla de contenidos

- [0. Introducción y propósito](#0-introducción-y-propósito)
- [1. Las tres identidades del sistema](#1-las-tres-identidades-del-sistema)
- [2. Modelo de sesión y flujo PIN → sesión (online)](#2-modelo-de-sesión-y-flujo-pin--sesión-online)
- [3. Custom Access Token Hook](#3-custom-access-token-hook)
- [4. Qué va en el JWT y qué NO](#4-qué-va-en-el-jwt-y-qué-no)
- [5. Edge Function `pin-login`](#5-edge-function-pin-login)
- [6. Comportamiento offline](#6-comportamiento-offline)
- [7. Configuración de Supabase](#7-configuración-de-supabase)
- [8. Decisiones de diseño (D67–D75)](#8-decisiones-de-diseño-d67d75)
- [9. Edge cases documentados](#9-edge-cases-documentados)
- [10. Checklist de validación](#10-checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Introducción y propósito

### 0.1 El problema que cierra este documento

Toda la arquitectura (Partes 1A–1E) construye su aislamiento multi-tenant sobre esta expresión, repetida en cientos de políticas RLS:

```sql
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
```

Pero **nada en las Partes 1A–1E describe cómo el claim `tenant_id` llega al JWT.** La decisión D13 lo da por hecho ("Supabase Auth lo mete en cada request"), sin especificar el mecanismo. Sin ese mecanismo, el claim no existe, `auth.jwt() ->> 'tenant_id'` devuelve `NULL`, y **el RLS bloquea o filtra incorrectamente todas las tablas.** Es el cimiento invisible de todo el sistema.

Este documento especifica ese mecanismo de punta a punta: cómo se autentica una tablet, cómo un cajero entra con PIN, qué claims se inyectan, cómo, y qué pasa cuando no hay internet.

### 0.2 Alcance

**Este documento cubre:**

- ✅ Las tres identidades de Supabase Auth (dispositivo, empleado operativo, admin web) y cómo se relacionan
- ✅ El flujo PIN → sesión en línea (Edge Function `pin-login`)
- ✅ El Custom Access Token Hook que inyecta `tenant_id` en el JWT
- ✅ La frontera de claims: qué va en el JWT (estable) vs. qué se resuelve en vivo (cambiante)
- ✅ El comportamiento offline de la autenticación y la atribución del operador
- ✅ La configuración de Supabase para registrar el hook y los TTL de token

**Lo que NO cubre (intencional):**

- ❌ El esquema de `usuarios_perfil`, `usuarios_acceso`, `roles`, `pin_intentos` (definido en Parte 1A §5)
- ❌ Los helpers `current_user_tiene_rol()` / `current_user_puede_operar_en_sucursal()` (definidos en doc 09 §8)
- ❌ La provisión inicial de la cuenta de dispositivo (definida en doc 10 setup)
- ❌ La mecánica de sincronización offline de datos operativos (Parte 1C.2 §10)

### 0.3 Principio rector

> **El JWT carga solo lo estable e inmutable durante una sesión (`tenant_id`). Todo lo que puede cambiar a media jornada (roles, sucursales asignadas, permisos) se resuelve consultando la base de datos en vivo.**

Esto evita el bug clásico de los sistemas que meten roles en el token: "le revoqué el permiso al cajero pero su token de hace 6 horas todavía lo deja entrar". En VIM POS, revocar un acceso surte efecto en la siguiente operación, no en el siguiente refresco de token.

---

## 1. Las tres identidades del sistema

VIM POS distingue **tres tipos de identidad** sobre Supabase Auth. Las tres son filas en `auth.users`, pero juegan papeles distintos.

| Identidad | Qué representa | Cómo se autentica | `auth.uid()` resuelve a | Provisión |
|---|---|---|---|---|
| **Dispositivo** | Una caja/estación POS física | email + password (cacheados de forma segura en el dispositivo) | la cuenta de dispositivo | En setup (doc 10), una por caja |
| **Empleado operativo** | El cajero/mesero/cocina real que opera | PIN 4–6 dígitos sobre la sesión de dispositivo → Edge Function `pin-login` | el empleado individual | Al crear el usuario (doc 09 §10) |
| **Admin web** | Dueño / Admin en el panel de configuración y reportes | email + password (+ 2FA opcional), flujo nativo de Supabase | el admin individual | Al invitar al usuario |

### 1.1 Por qué una cuenta de dispositivo

El flujo de caja (core §3.2) muestra un **selector de empleados** y cada uno entra con PIN, sin teclear correo ni contraseña larga. Para que eso funcione, **algo** tiene que tener una sesión válida antes de que el cajero toque su nombre: esa es la **cuenta de dispositivo**.

La cuenta de dispositivo tiene poderes mínimos:

- Arrancar la app y cargar el catálogo de la sucursal (lectura).
- Invocar la Edge Function `pin-login` para que un empleado se autentique.
- **No** puede operar ventas, ni cerrar turnos, ni nada operativo por sí misma. Es solo el "cascarón" que sostiene la app hasta que un humano entra con PIN.

> **Implementación:** la cuenta de dispositivo es una `auth.users` con email sintético (ej. `caja-{caja_id}@dispositivos.vimpos.mx`) y `usuarios_acceso` con un rol de sistema reservado `DISPOSITIVO` (jerarquía 0, sin permisos operativos). Sus credenciales se generan en setup y se guardan en el almacenamiento seguro del dispositivo (no en código, no en localStorage plano).

### 1.2 La regla de un tenant por cuenta

**Cada fila de `auth.users` pertenece a exactamente un tenant para efectos del JWT.**

- Una cuenta de dispositivo pertenece al tenant de su sucursal.
- Un empleado pertenece al tenant donde trabaja.
- Un admin web pertenece a su tenant.

La tabla `usuarios_acceso` (Parte 1A §5.8) permite *modelar* que un usuario tenga filas en varios tenants (preparación futura), pero **en MVP esa capacidad no se ejercita**: si una misma persona trabajara en dos negocios VIM distintos, se le crean dos cuentas separadas.

**Justificación:** mantiene `tenant_id` como un valor escalar único en el JWT, hace el RLS trivial (`= (jwt->>'tenant_id')`), y evita el problema irresoluble de "¿cuál tenant es el activo para este INSERT?" cuando un token cargara varios tenants. Ver **D67**.

### 1.3 La excepción: `service_role`

El backend administrativo de VIM (gestión de suscripciones, alta de tenants, soporte) usa la `service_role` key, que **ignora el RLS por completo**. Nunca corre en el cliente: solo en funciones server-side controladas por VIM (Parte 1A §3). La Edge Function `pin-login` también usa `service_role` para verificar PINs, pero **no devuelve** esa key al cliente — devuelve un JWT acotado al empleado (ver §5).

---

## 2. Modelo de sesión y flujo PIN → sesión (online)

### 2.1 Diagrama del flujo completo

```
┌─ ARRANQUE DEL DISPOSITIVO ────────────────────────────────────┐
│ 1. App lee credenciales de dispositivo del almacén seguro     │
│ 2. supabase.auth.signInWithPassword(device_email, device_pwd) │
│    → GoTrue emite JWT del dispositivo                          │
│    → Custom Access Token Hook inyecta tenant_id (§3)          │
│ 3. App descarga catálogo + pin_hash de empleados (para offline)│
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ INICIO DE JORNADA DEL EMPLEADO (core §3.2) ──────────────────┐
│ 4. Selector de empleados de la sucursal                       │
│ 5. Cajero toca su nombre → teclado de PIN                     │
│ 6. App invoca Edge Function:                                  │
│       POST /functions/v1/pin-login                            │
│       { usuario_id, pin, caja_id }                            │
│    (autenticada con el JWT del dispositivo)                   │
│ 7. La Edge Function (service_role):                           │
│       ├─ SELECT pin_hash FROM usuarios_perfil WHERE id=...    │
│       ├─ verifica crypt(pin, pin_hash)                        │
│       ├─ valida usuarios_acceso (activo, esta sucursal)       │
│       ├─ valida estado != BLOQUEADO_* y bloqueado_hasta       │
│       ├─ INSERT pin_intentos (éxito/fallo)                    │
│       ├─ aplica política 3 fallos→5min / 6→bloqueo admin      │
│       └─ si OK: firma JWT de empleado (sub=usuario_id,        │
│                 tenant_id, exp=TTL turno) con JWT secret      │
│ 8. App: supabase.auth.setSession({ access_token })            │
│    → a partir de aquí auth.uid() = el cajero                  │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ CAMBIO DE CAJERO / RE-ACUÑACIÓN (core §8) ───────────────────┐
│ 9. Al cambiar de operador o al acercarse el vencimiento:      │
│    se repite el paso 6 con el nuevo (o el mismo) usuario_id.   │
│    El token de empleado NO se refresca por GoTrue: se RE-ACUÑA │
│    llamando de nuevo a pin-login (ver D70).                    │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Por qué la Edge Function y no login nativo por empleado

Se evaluó usar el PIN como contraseña nativa de Supabase (email sintético + password = PIN). Se descartó (**D68**) porque:

- Un PIN de 4–6 dígitos es una contraseña débil; volverla la credencial primaria de Supabase expone la cuenta a fuerza bruta directa contra GoTrue.
- Duplicaría el concepto de PIN (uno para GoTrue, otro para autorizaciones en `pin_intentos`).
- La Edge Function permite aplicar la política anti-fuerza-bruta de VIM (3→5min, 6→admin) y la auditoría en `pin_intentos` **antes** de emitir cualquier token, con `service_role` controlado.

### 2.3 Vida del token de empleado

| Aspecto | Valor | Decisión |
|---|---|---|
| TTL del token de empleado | Duración del turno, tope **12 h** | D70 |
| Refresco | **No** vía GoTrue. Re-acuñación llamando a `pin-login` | D70 |
| Re-acuñación silenciosa | Cuando faltan < 30 min para expirar y hay actividad | D70 |
| Cierre de sesión de empleado | "Bloquear" (lock screen P-010) o cambio de cajero descarta el token y vuelve a la sesión de dispositivo | D71 |

---

## 3. Custom Access Token Hook

Supabase llama a este hook **cada vez que GoTrue emite o refresca un token** por sus flujos nativos (login de dispositivo con password, login de admin web, refresh). Su trabajo es inyectar los claims que el RLS necesita.

> **Importante:** el token de **empleado** NO pasa por este hook, porque no lo emite GoTrue sino la Edge Function `pin-login` (la Edge Function inyecta los mismos claims directamente, ver §5.3). El hook cubre las identidades de **dispositivo** y **admin web**. Ambos caminos producen un JWT con el mismo conjunto de claims — esa es la invariante.

### 3.1 La función del hook

```sql
-- ============================================================
-- Custom Access Token Hook
-- Inyecta tenant_id y tipo_identidad en el JWT de cada usuario.
-- Lo invoca GoTrue (rol supabase_auth_admin) en cada emisión/refresh.
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id    uuid := (event ->> 'user_id')::uuid;
  v_claims     jsonb := event -> 'claims';
  v_tenant_id  uuid;
  v_tipo       text;
BEGIN
  -- Resolver el único acceso activo del usuario (D67: un tenant por cuenta).
  -- Si tuviera varios (no debería en MVP), gana el más reciente sin sucursal
  -- específica, o el más reciente a secas.
  SELECT ua.tenant_id,
         CASE
           WHEN r.codigo = 'DISPOSITIVO' THEN 'DISPOSITIVO'
           WHEN r.codigo IN ('DUENO','ADMIN') THEN 'ADMIN_WEB'
           ELSE 'EMPLEADO'
         END
    INTO v_tenant_id, v_tipo
    FROM usuarios_acceso ua
    JOIN roles r ON r.id = ua.rol_id
   WHERE ua.usuario_id = v_user_id
     AND ua.activo = true
     AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
   ORDER BY (ua.sucursal_id IS NULL) DESC, ua.created_at DESC
   LIMIT 1;

  -- Si el usuario no tiene acceso activo, se emite token SIN tenant_id.
  -- El RLS lo dejará sin ver nada (comportamiento seguro por defecto).
  IF v_tenant_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    v_claims := jsonb_set(v_claims, '{tipo_identidad}', to_jsonb(v_tipo));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Hook de GoTrue. Inyecta tenant_id y tipo_identidad en el JWT. Parte 1F §3.';
```

### 3.2 Permisos del hook

El hook corre como el rol `supabase_auth_admin`. Hay que otorgarle ejecución y lectura de la tabla que consulta, y **revocar** el acceso al resto de roles para que nadie más lo invoque.

```sql
-- Permitir que GoTrue ejecute el hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- GoTrue necesita leer usuarios_acceso y roles para resolver el tenant
GRANT SELECT ON public.usuarios_acceso TO supabase_auth_admin;
GRANT SELECT ON public.roles TO supabase_auth_admin;

-- El hook lee estas tablas saltándose RLS porque supabase_auth_admin es
-- un rol privilegiado; aun así limitamos a SELECT.
```

### 3.3 Registro del hook

El hook se activa en la configuración de Auth del proyecto (ver §7.1). En `config.toml` (Supabase CLI):

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

---

## 4. Qué va en el JWT y qué NO

Esta es la decisión de diseño más importante del documento (**D69**).

### 4.1 SÍ va en el JWT (estable durante la sesión)

| Claim | Origen | Por qué |
|---|---|---|
| `sub` | `auth.users.id` | Identidad del usuario (nativo) |
| `tenant_id` | hook / Edge Function | Aislamiento multi-tenant. Un usuario pertenece a un solo tenant (D67); no cambia en una sesión |
| `tipo_identidad` | hook / Edge Function | `DISPOSITIVO` / `EMPLEADO` / `ADMIN_WEB`. Permite gates gruesos de UI sin query |
| `role` | nativo Supabase | `authenticated` (PostgREST) |
| `exp`, `iat`, `aud` | nativo | Vida del token |

### 4.2 NO va en el JWT (cambiante a media jornada)

| Dato | Dónde se resuelve | Por qué NO en el JWT |
|---|---|---|
| Roles del usuario | `current_user_tiene_rol()` (doc 09 §8.2) en vivo | Un admin puede reasignar el rol a media jornada; el token no se refresca al instante |
| Sucursales asignadas | `current_user_puede_operar_en_sucursal()` (doc 09 §8.3) en vivo | Un cajero puede ser movido de sucursal sin re-loguearse |
| Subtipo de Personal | consulta `usuarios_acceso` en vivo | Igual que roles |
| Permisos / overrides | `rol_permisos` + `overrides_permisos` en vivo | La revocación debe surtir efecto inmediato |

### 4.3 Consecuencia operativa

Revocar un acceso (`usuarios_acceso.activo = false`) o cambiar un rol surte efecto en **la siguiente operación**, no en el siguiente refresco de token. El JWT sigue siendo válido como *identidad* (`sub`, `tenant_id`), pero cada acción consulta los permisos vigentes. Esto es deliberado y es la postura de seguridad correcta para un POS multi-usuario.

---

## 5. Edge Function `pin-login`

### 5.1 Contrato

```
POST /functions/v1/pin-login
Authorization: Bearer <JWT del dispositivo>
Content-Type: application/json

Request:
{
  "usuario_id": "uuid",      // el empleado que toca su nombre
  "pin": "1234",             // 4-6 dígitos
  "caja_id": "uuid"          // caja desde la que entra
}

Response 200 (éxito):
{
  "access_token": "eyJ...",  // JWT de empleado firmado, listo para setSession
  "expires_at": 1735689600,  // epoch del exp
  "usuario": { "id": "...", "nombre": "María G.", "tipo_identidad": "EMPLEADO" }
}

Response 401 (PIN incorrecto):
{ "error": "PIN_INCORRECTO", "intentos_restantes": 2 }

Response 423 (bloqueado):
{ "error": "USUARIO_BLOQUEADO", "bloqueado_hasta": "2026-05-29T18:05:00Z" }

Response 403 (sin acceso a esta sucursal):
{ "error": "SIN_ACCESO_SUCURSAL" }
```

### 5.2 Lógica (Deno / TypeScript)

```ts
// supabase/functions/pin-login/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { create as signJWT } from "https://deno.land/x/djwt/mod.ts";

Deno.serve(async (req) => {
  const { usuario_id, pin, caja_id } = await req.json();

  // Cliente con service_role: corre del lado servidor, nunca expuesto.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Verificación de PIN + validaciones + política anti-fuerza-bruta,
  //    todo dentro de una función SQL atómica (ver §5.4).
  const { data, error } = await admin.rpc("verificar_pin_login", {
    p_usuario_id: usuario_id,
    p_pin: pin,
    p_caja_id: caja_id,
  });

  if (error || !data?.ok) {
    return respuestaDeError(data); // 401 / 403 / 423 según data.motivo
  }

  // 2. Firmar el JWT de empleado con el JWT secret del proyecto.
  const exp = Math.floor(Date.now() / 1000) + data.ttl_segundos; // tope 12h
  const access_token = await signJWT(
    { alg: "HS256", typ: "JWT" },
    {
      sub: usuario_id,
      aud: "authenticated",
      role: "authenticated",
      tenant_id: data.tenant_id,          // mismo claim que el hook (§3)
      tipo_identidad: "EMPLEADO",
      iat: Math.floor(Date.now() / 1000),
      exp,
    },
    await jwtKey(), // derivada de VIM_JWT_SECRET
  );

  return new Response(JSON.stringify({
    access_token, expires_at: exp,
    usuario: { id: usuario_id, nombre: data.nombre, tipo_identidad: "EMPLEADO" },
  }), { headers: { "Content-Type": "application/json" } });
});
```

### 5.3 Por qué la Edge Function inyecta los claims (no el hook)

El token de empleado lo firma la Edge Function, no GoTrue, así que **no pasa por `custom_access_token_hook`**. Por eso la Edge Function inyecta `tenant_id` y `tipo_identidad` ella misma. La invariante: **todo JWT válido del sistema lleva `tenant_id`**, sin importar quién lo firmó. PostgREST/RLS aceptan el token porque está firmado con el mismo `VIM_JWT_SECRET` y tiene `aud=authenticated`.

### 5.4 Función SQL `verificar_pin_login`

La verificación vive en SQL (no en la Edge Function) para que sea atómica y reutilice las tablas existentes:

```sql
CREATE OR REPLACE FUNCTION verificar_pin_login(
  p_usuario_id uuid,
  p_pin        text,
  p_caja_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_perfil    usuarios_perfil%ROWTYPE;
  v_sucursal  uuid;
  v_tenant    uuid;
  v_acceso_ok boolean;
BEGIN
  SELECT * INTO v_perfil FROM usuarios_perfil WHERE id = p_usuario_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO pin_intentos(usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (p_usuario_id, p_caja_id, false, 'USUARIO_INEXISTENTE');
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO');
  END IF;

  -- Bloqueos
  IF v_perfil.estado IN ('BLOQUEADO_ADMIN','DESACTIVADO') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_BLOQUEADO');
  END IF;
  IF v_perfil.bloqueado_hasta IS NOT NULL AND v_perfil.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_BLOQUEADO',
                              'bloqueado_hasta', v_perfil.bloqueado_hasta);
  END IF;

  -- Verificación del PIN (bcrypt vía pgcrypto)
  IF v_perfil.pin_hash IS NULL OR crypt(p_pin, v_perfil.pin_hash) <> v_perfil.pin_hash THEN
    UPDATE usuarios_perfil
       SET intentos_pin_fallidos = intentos_pin_fallidos + 1,
           bloqueado_hasta = CASE
             WHEN intentos_pin_fallidos + 1 >= 6 THEN NULL
             WHEN intentos_pin_fallidos + 1 >= 3 THEN now() + interval '5 minutes'
             ELSE bloqueado_hasta END,
           estado = CASE WHEN intentos_pin_fallidos + 1 >= 6
                         THEN 'BLOQUEADO_ADMIN'::usuario_estado ELSE estado END
     WHERE id = p_usuario_id;
    INSERT INTO pin_intentos(usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (p_usuario_id, p_caja_id, false, 'PIN_INCORRECTO');
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO',
                              'intentos_restantes', GREATEST(0, 3 - (v_perfil.intentos_pin_fallidos + 1)));
  END IF;

  -- Resolver sucursal de la caja y validar acceso
  SELECT sucursal_id INTO v_sucursal FROM cajas WHERE id = p_caja_id;
  SELECT ua.tenant_id,
         bool_or(ua.sucursal_id IS NULL OR ua.sucursal_id = v_sucursal)
    INTO v_tenant, v_acceso_ok
    FROM usuarios_acceso ua
   WHERE ua.usuario_id = p_usuario_id AND ua.activo = true
     AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
   GROUP BY ua.tenant_id;

  IF NOT COALESCE(v_acceso_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_ACCESO_SUCURSAL');
  END IF;

  -- Éxito: resetear contador, registrar, devolver datos
  UPDATE usuarios_perfil
     SET intentos_pin_fallidos = 0, bloqueado_hasta = NULL,
         fecha_ultimo_login_pin = now()
   WHERE id = p_usuario_id;
  INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso)
  VALUES (v_tenant, p_usuario_id, p_caja_id, true);

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'nombre', v_perfil.nombre,
    'ttl_segundos', 12 * 3600
  );
END;
$$;

COMMENT ON FUNCTION verificar_pin_login IS
  'Verifica PIN, aplica política anti-fuerza-bruta y devuelve datos para acuñar JWT. Parte 1F §5.4. Solo invocable con service_role desde la Edge Function pin-login.';

-- Nadie del lado cliente puede invocarla directamente
REVOKE EXECUTE ON FUNCTION verificar_pin_login FROM authenticated, anon, public;
```

---

## 6. Comportamiento offline

Offline no hay Edge Function ni GoTrue alcanzables. La autenticación se degrada con gracia.

### 6.1 Qué sigue funcionando sin internet

| Pieza | Offline |
|---|---|
| Sesión de dispositivo | Sigue válida localmente (no hay llamadas al server que validar; Dexie es local) |
| Cambio de empleado | El PIN se verifica **localmente** contra los `pin_hash` descargados de la sucursal en el último sync |
| Operador activo | Estado local de la app (qué empleado está operando) |
| Operaciones (ventas, etc.) | Se encolan en Dexie con `created_by = usuario_id` del operador en el payload |

### 6.2 Verificación de PIN offline

En el arranque online (paso 3 del §2.1), el dispositivo descarga los `pin_hash` de los empleados activos de su sucursal (vía una función que solo expone el hash a la cuenta de dispositivo, nunca el PIN). Offline, el cambio de cajero hace `crypt(pin, pin_hash_cacheado)` en el cliente (con una lib bcrypt local).

> **Nota de seguridad (D72):** cachear `pin_hash` en el dispositivo es aceptable porque (a) son hashes bcrypt, no PINs en claro; (b) el dispositivo ya es un punto físico de confianza en la sucursal; (c) la lista se limita a los empleados de **esa** sucursal y se purga al cerrar sesión de dispositivo. La política anti-fuerza-bruta offline se replica en el cliente (3→bloqueo local) y se re-sincroniza a `pin_intentos` al reconectar.

### 6.3 Atribución del operador al sincronizar

Esta es la pieza sutil: offline, `auth.uid()` durante el sync NO es necesariamente el empleado que creó cada ticket (puede ser otro turno, otro dispositivo empujando).

**Por eso la atribución del operador viaja como dato, no como identidad:**

- Cada fila offline lleva `created_by = usuario_id` del operador real, dentro del payload (Parte 1C.2 §10).
- `sync_procesar_push` (Parte 1C.2 §10.5) corre bajo la sesión que empuja, pero **persiste el `created_by` del payload**, no `auth.uid()`.
- El server valida que ese `created_by` sea un usuario válido del tenant (regla R9 de FK, Parte 1C.2 §10.4). Si el `usuario_id` referenciado no existe en el tenant → conflicto `ENTIDAD_REFERENCIA_NO_EXISTE`.

**Resultado:**

| Modo | Cómo se atribuye el operador | Fortaleza |
|---|---|---|
| Online | `auth.uid()` = empleado real (token acuñado por `pin-login`) | Atribución criptográfica fuerte |
| Offline → sync | `created_by` del payload, validado contra `usuarios_acceso` | Atribución por dato validado |

Ambas rutas terminan con el `usuario_id` correcto en la fila. Ver **D73**.

---

## 7. Configuración de Supabase

### 7.1 Activar el hook

En el dashboard: **Authentication → Hooks → Custom Access Token** → apuntar a `public.custom_access_token_hook`. O vía `config.toml` (§3.3) para que viaje en las migraciones del CLI.

### 7.2 Secrets de la Edge Function

```bash
supabase secrets set VIM_JWT_SECRET="<el JWT secret del proyecto>"
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente
```

> ⚠️ **El secreto NO puede llamarse `SUPABASE_JWT_SECRET`.** Las Edge Functions **rechazan** cualquier env var con prefijo `SUPABASE_` (reservado) — se omite silenciosamente y la función falla con "Key length is zero". Por eso se nombra **`VIM_JWT_SECRET`**. (Validado contra el runtime local.) Su valor es el **JWT secret del proyecto** (en stacks con llaves nuevas `sb_*`, es el "Legacy JWT secret", que sigue disponible).

> **D74:** la Edge Function firma con el **mismo** JWT secret que usa GoTrue (en la env var `VIM_JWT_SECRET`). Es lo que hace que PostgREST acepte el token de empleado como si lo hubiera emitido GoTrue. Rotar ese secret invalida todos los tokens (dispositivo, empleado y admin) — planearlo como evento de mantenimiento.

### 7.3 TTL de tokens nativos

| Token | TTL | Refresh |
|---|---|---|
| Dispositivo (GoTrue) | 1 h access, refresh largo | Nativo (refresh token) |
| Admin web (GoTrue) | 1 h access, refresh nativo | Nativo |
| Empleado (Edge Function) | hasta 12 h | Re-acuñación vía `pin-login` (D70) |

---

## 8. Decisiones de diseño (D67–D75)

Continúan la secuencia de las Partes 1A–1E (última: D66).

| # | Decisión | Justificación |
|---|---|---|
| **D67** | Un tenant por cuenta `auth.users` para efectos del JWT. Persona en 2 negocios VIM = 2 cuentas | `tenant_id` escalar único en el JWT, RLS trivial, sin ambigüedad de "tenant activo" en INSERT. `usuarios_acceso` multi-tenant queda como preparación futura |
| **D68** | PIN verificado vía Edge Function `pin-login`, NO como password nativo de Supabase | PIN 4-6 dígitos es contraseña débil; la Edge Function aplica anti-fuerza-bruta y auditoría antes de emitir token; un solo concepto de PIN |
| **D69** | JWT carga solo `tenant_id` + `tipo_identidad`; roles/sucursales/permisos se resuelven en vivo | Revocación inmediata; evita "token viejo con permiso revocado"; reutiliza los helpers `current_user_*` del doc 09 |
| **D70** | Token de empleado con TTL = turno (tope 12 h), sin refresh GoTrue; se RE-ACUÑA llamando a `pin-login` | Un token hand-signed no tiene refresh token de GoTrue; re-acuñar es más simple y permite re-validar acceso cada vez |
| **D71** | "Bloquear"/cambio de cajero descarta el token de empleado y vuelve a la sesión de dispositivo | El dispositivo siempre tiene una sesión base; el empleado es una capa encima |
| **D72** | `pin_hash` (bcrypt) se cachea en el dispositivo para verificación de PIN offline, acotado a la sucursal y purgado al cerrar sesión de dispositivo | Habilita cambio de cajero offline sin exponer PINs en claro; el dispositivo ya es punto físico de confianza |
| **D73** | Atribución del operador: online vía `auth.uid()`, offline vía `created_by` del payload validado | Las dos rutas convergen al `usuario_id` correcto; el sync no puede depender de `auth.uid()` del empuje |
| **D74** | Edge Function firma con el mismo `VIM_JWT_SECRET` que GoTrue | PostgREST acepta el token de empleado sin distinción; rotar el secret es evento de mantenimiento global |
| **D75** | Cuenta de dispositivo = `auth.users` con rol de sistema `DISPOSITIVO` (jerarquía 0, sin permisos operativos) | Sostiene la app antes del PIN; no puede operar por sí misma; aislada del resto de roles |

---

## 9. Edge cases documentados

| Caso | Comportamiento |
|---|---|
| Usuario sin acceso activo intenta loguear | El hook emite token sin `tenant_id` → RLS no le muestra nada (seguro por defecto). La UI muestra "Sin acceso, contacta al admin" |
| Token de empleado expira a media venta (rush) | Re-acuñación silenciosa al detectar < 30 min de vida + actividad. Si falla (offline), se mantiene el operador local y se sincroniza después |
| Admin revoca acceso del cajero mientras opera | La siguiente operación falla en el helper de permisos (consulta en vivo); el token sigue siendo identidad válida pero sin autorización |
| Dispositivo pierde sus credenciales / se reinstala | Re-provisión desde el panel admin (doc 10): genera nuevas credenciales de dispositivo |
| Empleado bloqueado por 6 PINs fallidos offline | El bloqueo local impide más intentos; al reconectar se sincroniza el bloqueo a `pin_intentos` + `usuarios_perfil` |
| Dos dispositivos con el mismo empleado activo simultáneamente | Permitido (un cajero puede estar en dos cajas). Cada token es independiente; la atribución por `usuario_id` es correcta en ambos |
| `VIM_JWT_SECRET` rotado | Todos los tokens (dispositivo, empleado, admin) se invalidan; requiere re-login. Planear como mantenimiento anunciado |
| PIN reseteado por supervisor (core §3.3) | `pin_hash` se actualiza; los `pin_hash` cacheados en dispositivos se refrescan en el siguiente sync; el PIN temporal obliga cambio en primer login |

---

## 10. Checklist de validación

- [ ] `custom_access_token_hook` creado y registrado en Auth → Hooks
- [ ] `GRANT EXECUTE` a `supabase_auth_admin`, `REVOKE` a `authenticated/anon/public`
- [ ] `supabase_auth_admin` tiene `SELECT` sobre `usuarios_acceso` y `roles`
- [ ] Login de dispositivo → JWT contiene `tenant_id` y `tipo_identidad='DISPOSITIVO'`
- [ ] Login de admin web → JWT contiene `tenant_id` y `tipo_identidad='ADMIN_WEB'`
- [ ] Edge Function `pin-login` desplegada con `VIM_JWT_SECRET` configurado
- [ ] `verificar_pin_login` con `REVOKE EXECUTE` a roles cliente
- [ ] PIN correcto → token de empleado con `auth.uid()` = empleado y `tenant_id` correcto
- [ ] PIN incorrecto 3 veces → bloqueo 5 min; 6 veces → `BLOQUEADO_ADMIN`
- [ ] Empleado sin acceso a la sucursal de la caja → `SIN_ACCESO_SUCURSAL`
- [ ] Token de empleado aceptado por PostgREST y filtrado correctamente por RLS
- [ ] Rol de sistema `DISPOSITIVO` sembrado (jerarquía 0, sin permisos operativos)
- [ ] Offline: cambio de cajero verifica PIN contra `pin_hash` cacheado
- [ ] Offline: operaciones encoladas llevan `created_by` del operador en el payload
- [ ] Sync: `created_by` del payload se persiste (no `auth.uid()` del empuje) y se valida contra `usuarios_acceso`
- [ ] Revocar `usuarios_acceso.activo` bloquea la siguiente operación sin esperar refresh de token
- [ ] Test cross-tenant: token del tenant A no puede leer filas del tenant B en ninguna tabla

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Cierra el hueco "¿cómo llega `tenant_id` al JWT?". Define las 3 identidades, el flujo PIN→sesión, el Custom Access Token Hook, la Edge Function `pin-login`, el comportamiento offline y las decisiones D67–D75. |
