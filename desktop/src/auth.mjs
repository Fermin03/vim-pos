// Fase 1 · Auth local (reemplaza GoTrue + Edge pin-login, sin nube).
// - deviceSignIn: valida email/clave del dispositivo (bcrypt vía pgcrypto) y acuña el JWT
//   de dispositivo con los MISMOS claims que el hook de Supabase (tenant_id, tipo_identidad).
// - pinLogin: valida el PIN del empleado con la RPC verificar_pin_login (idéntica a la nube)
//   y acuña el JWT de empleado. Todos los JWT se firman con el secreto local (= el de PostgREST).
import jwt from "jsonwebtoken";

const ahora = () => Math.floor(Date.now() / 1000);

function mintAccess(secret, { sub, tenant_id, tipo_identidad, ttl = 12 * 3600, sucursal_id = null }) {
  const iat = ahora();
  const payload = { sub, aud: "authenticated", role: "authenticated", tenant_id, tipo_identidad, iat, exp: iat + ttl };
  if (sucursal_id) payload.sucursal_id = sucursal_id;
  return { token: jwt.sign(payload, secret, { algorithm: "HS256" }), iat, ttl };
}

function goTrueUser(row) {
  return {
    id: row.id, aud: "authenticated", role: "authenticated", email: row.email,
    app_metadata: { provider: "email", tenant_id: row.tenant_id, tipo_identidad: row.tipo_identidad },
    user_metadata: {}, identities: [], created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
  };
}

/** Login del DISPOSITIVO (lo que hace supabase.auth.signInWithPassword contra GoTrue). */
export async function deviceSignIn(pool, secret, { email, password }) {
  if (!email || !password) return { error: 400, body: { error: "invalid_request", error_description: "Faltan credenciales" } };
  const { rows } = await pool.query(
    `SELECT u.id, u.email, ua.tenant_id, ua.sucursal_id, r.codigo AS rol
       FROM auth.users u
       JOIN usuarios_acceso ua ON ua.usuario_id = u.id AND ua.activo = true
       LEFT JOIN roles r ON r.id = ua.rol_id
      WHERE lower(u.email) = lower($1)
        AND u.encrypted_password = crypt($2, u.encrypted_password)
      LIMIT 1`, [email, password]);
  if (rows.length === 0) return { error: 400, body: { error: "invalid_grant", error_description: "Credenciales inválidas" } };
  const row = rows[0];
  const tipo = row.rol === "DISPOSITIVO" ? "DISPOSITIVO" : "EMPLEADO";
  const { token, iat, ttl } = mintAccess(secret, { sub: row.id, tenant_id: row.tenant_id, tipo_identidad: tipo, sucursal_id: row.sucursal_id, ttl: 12 * 3600 });
  const refresh = jwt.sign({ sub: row.id, typ: "refresh" }, secret, { algorithm: "HS256", expiresIn: "30d" });
  return {
    body: {
      access_token: token, token_type: "bearer", expires_in: ttl, expires_at: iat + ttl,
      refresh_token: refresh, user: goTrueUser({ ...row, tipo_identidad: tipo }),
    },
  };
}

/** Refresco de sesión del dispositivo (supabase-js lo llama solo). */
export async function refreshSession(pool, secret, refresh_token) {
  let dec;
  try { dec = jwt.verify(refresh_token, secret); } catch { return { error: 400, body: { error: "invalid_grant", error_description: "refresh inválido" } }; }
  const { rows } = await pool.query(
    `SELECT u.id, u.email, ua.tenant_id, ua.sucursal_id, r.codigo AS rol
       FROM auth.users u JOIN usuarios_acceso ua ON ua.usuario_id=u.id AND ua.activo=true
       LEFT JOIN roles r ON r.id=ua.rol_id WHERE u.id=$1 LIMIT 1`, [dec.sub]);
  if (rows.length === 0) return { error: 400, body: { error: "invalid_grant", error_description: "usuario no existe" } };
  const row = rows[0];
  const tipo = row.rol === "DISPOSITIVO" ? "DISPOSITIVO" : "EMPLEADO";
  const { token, iat, ttl } = mintAccess(secret, { sub: row.id, tenant_id: row.tenant_id, tipo_identidad: tipo, sucursal_id: row.sucursal_id });
  return {
    body: {
      access_token: token, token_type: "bearer", expires_in: ttl, expires_at: iat + ttl,
      refresh_token, user: goTrueUser({ ...row, tipo_identidad: tipo }),
    },
  };
}

/** Devuelve el user desde un access_token (supabase.auth.getUser). */
export async function getUser(pool, secret, token) {
  let dec;
  try { dec = jwt.verify(token, secret); } catch { return { error: 401, body: { error: "invalid_token" } }; }
  const { rows } = await pool.query(
    `SELECT u.id, u.email, ua.tenant_id, r.codigo AS rol FROM auth.users u
       JOIN usuarios_acceso ua ON ua.usuario_id=u.id AND ua.activo=true
       LEFT JOIN roles r ON r.id=ua.rol_id WHERE u.id=$1 LIMIT 1`, [dec.sub]);
  if (rows.length === 0) return { error: 404, body: { error: "user_not_found" } };
  const row = rows[0];
  return { body: goTrueUser({ ...row, tipo_identidad: row.rol === "DISPOSITIVO" ? "DISPOSITIVO" : "EMPLEADO" }) };
}

/** Autorización por PIN de un superior (reemplaza la Edge autorizar-pin). El solicitante sale
 *  del JWT del empleado; la RPC valida el PIN del autorizante y su permiso/jerarquía. */
export async function autorizarPin(pool, secret, token, body) {
  let dec;
  try { dec = jwt.verify(token, secret); } catch { return { error: 401, body: { error: "AUTH_INVALIDA" } }; }
  const { pin, accion, permiso_codigo, entidad_tipo, entidad_id, monto, motivo, caja_id, turno_id } = body ?? {};
  if (!pin || !accion || !permiso_codigo || !caja_id) return { error: 400, body: { error: "FALTAN_CAMPOS" } };
  if (!/^\d{4,6}$/.test(String(pin))) return { error: 400, body: { error: "PIN_INVALIDO" } };
  const { rows } = await pool.query("SELECT verificar_autorizacion_pin($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS r", [
    String(pin), accion, permiso_codigo, entidad_tipo ?? null, entidad_id ?? null,
    monto ?? null, motivo ?? "", caja_id, turno_id ?? null, dec.sub,
  ]);
  const r = rows[0].r;
  if (!r?.ok) {
    const motivoR = r?.motivo ?? "PIN_INCORRECTO";
    const status = motivoR === "USUARIO_BLOQUEADO" ? 423 : motivoR === "SIN_PERMISO" ? 403 : 401;
    return { error: status, body: { error: motivoR } };
  }
  return { body: { ok: true, autorizacion_pin_id: r.autorizacion_pin_id, autorizo_id: r.autorizo_id } };
}

/** Login del EMPLEADO por PIN (reemplaza la Edge Function pin-login). */
export async function pinLogin(pool, secret, { usuario_id, pin, caja_id }) {
  if (!usuario_id || !pin || !caja_id) return { error: 400, body: { error: "FALTAN_CAMPOS" } };
  const { rows } = await pool.query("SELECT verificar_pin_login($1,$2,$3) AS r", [usuario_id, pin, caja_id]);
  const r = rows[0].r;
  if (!r?.ok) {
    const motivo = r?.motivo ?? "PIN_INCORRECTO";
    const status = motivo === "USUARIO_BLOQUEADO" ? 423 : motivo === "SIN_ACCESO_SUCURSAL" ? 403 : 401;
    return { error: status, body: { error: motivo, intentos_restantes: r?.intentos_restantes, bloqueado_hasta: r?.bloqueado_hasta } };
  }
  const ttl = Number(r.ttl_segundos ?? 12 * 3600);
  const { token, iat } = mintAccess(secret, { sub: usuario_id, tenant_id: r.tenant_id, tipo_identidad: "EMPLEADO", ttl });
  return { body: { access_token: token, expires_at: iat + ttl, usuario: { id: usuario_id, nombre: r.nombre, tipo_identidad: "EMPLEADO" } } };
}
