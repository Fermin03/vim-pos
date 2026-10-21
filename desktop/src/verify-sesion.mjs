// Lo que varios verify hacen antes de empezar, por el gateway local e igual que el POS: entrar
// como la caja del fixture (seed.sql), luego como su cajero, y dejar un turno abierto. Quién es
// esa caja lo dice cada verify: aquí no vive ninguna credencial.

export const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
export const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Sesión de la caja (GoTrue) y de su cajero (pin-login con el PIN del seed). */
export async function entrarComoCajero(gw, { email, password, caja }) {
  const dev = await j(await fetch(`${gw}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  exigir(dev.body.access_token, `device sign-in falló: ${JSON.stringify(dev.body)}`);
  const deviceToken = dev.body.access_token;

  // Los empleados se listan con la sesión de la caja: RLS por tenant, vía /rest/v1.
  const accesos = await j(await fetch(`${gw}/rest/v1/usuarios_acceso?select=usuario_id,rol:roles(codigo)&activo=eq.true`, {
    headers: { Authorization: `Bearer ${deviceToken}`, apikey: "anon" },
  }));
  exigir(accesos.status === 200, `listar accesos falló: ${accesos.status} ${JSON.stringify(accesos.body)}`);
  const cajero = accesos.body.find((a) => a.rol?.codigo === "CAJERO");
  exigir(cajero, "no hay CAJERO en el seed");

  const emp = await j(await fetch(`${gw}/functions/v1/pin-login`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ usuario_id: cajero.usuario_id, pin: "1234", caja_id: caja }),
  }));
  exigir(emp.body.access_token, `pin-login falló: ${emp.status} ${JSON.stringify(emp.body)}`);

  const hdr = { "content-type": "application/json", Authorization: `Bearer ${emp.body.access_token}`, apikey: "anon" };
  return {
    caja, deviceToken, token: emp.body.access_token, hdr,
    tenant: dev.body.user.app_metadata.tenant_id,
    cajeroId: cajero.usuario_id, nombre: emp.body.usuario.nombre, accesos: accesos.body.length,
    /** Una RPC con la sesión del cajero, como `supabase.rpc` en el POS. */
    async rpc(fn, args) {
      const r = await j(await fetch(`${gw}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr, body: JSON.stringify(args) }));
      exigir(r.status < 300, `${fn} → ${r.status} ${JSON.stringify(r.body)}`);
      return r.body;
    },
  };
}

/**
 * Turno nuevo por conexión directa (en la caja lo abre la apertura del POS). Cierra antes los que
 * hubiera abiertos: `codigo_turno` es único por sucursal.
 */
export async function abrirTurno(pool, { tenant, cajeroId, caja }, codigo) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: cajeroId, tenant_id: tenant, role: "authenticated" })]);
    const suc = (await c.query("SELECT sucursal_id FROM cajas WHERE id=$1", [caja])).rows[0].sucursal_id;
    await c.query("UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=$1 AND estado='ABIERTO'", [caja]);
    const turno = (await c.query(
      `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
       VALUES($1,$2,$3,$5,CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [tenant, suc, caja, cajeroId, codigo])).rows[0].id;
    await c.query("COMMIT");
    return { suc, turno };
  } finally {
    c.release();
  }
}
