// Sube a la nube la bitácora de errores que la caja acumuló localmente (`errores_app`).
//
// Va por su propio camino y NO dentro del snapshot de ventas a propósito: ese push mueve dinero
// y no se toca por una bitácora. Aquí, si algo falla, se calla y se reintenta al siguiente ciclo.
//
// Se escribe directo contra PostgREST con el token del dispositivo (RLS permite INSERT del
// propio tenant), sin Edge Function: desplegar funciones exige el access token del CLI, que en
// la laptop de trabajo no funciona, y esto tiene que poder salir con una migración y ya.

const LOTE = 50; // suficiente para vaciar un día malo sin mandar una petición enorme

async function asegurarTabla(pool) {
  // Marca local de "ya subido". Misma idea que `_vim_push_ok` para las ventas: el servidor no
  // puede decirnos qué error ya tenía, así que el device lleva la cuenta.
  await pool.query(
    "CREATE TABLE IF NOT EXISTS _vim_errores_ok (error_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())",
  );
}

/** Errores locales que aún no se han subido. */
export async function erroresPendientes(pool, limite = LOTE) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(
    `SELECT id, tenant_id, app, version, mensaje, stack, contexto, sucursal_id, caja_id, usuario_id, created_at
       FROM errores_app
      WHERE id NOT IN (SELECT error_id FROM _vim_errores_ok)
      ORDER BY created_at
      LIMIT $1`,
    [limite],
  );
  return rows;
}

export async function marcarSubidos(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_errores_ok(error_id) SELECT unnest($1::uuid[]) ON CONFLICT (error_id) DO NOTHING",
    [ids],
  );
}

/**
 * Sube los errores pendientes. Best-effort: devuelve cuántos subió.
 * Solo marca como subidos si el servidor confirmó, para no perderlos ante un fallo de red.
 */
export async function subirErrores(pool, { cloudUrl, anonKey, deviceToken }, log = () => {}) {
  const filas = await erroresPendientes(pool);
  if (filas.length === 0) return { subidos: 0 };

  const res = await fetch(`${cloudUrl}/rest/v1/errores_app`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
      // La caja pudo haber subido ya este id en un intento anterior que se cortó al confirmar.
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`errores_app HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  await marcarSubidos(pool, filas.map((f) => f.id));
  log(`${filas.length} error(es) reportados a la nube`);
  return { subidos: filas.length };
}

/**
 * Ruido conocido y benigno que NO debe llegar al panel.
 *
 * Una bitácora que se llena de lo mismo todos los días deja de leerse, y entonces no sirve para
 * lo que se hizo. `done is not a function` viene del hook de salida de embedded-postgres y está
 * documentado como inofensivo en main.mjs; registrarlo cada arranque enterraría lo que sí
 * importa. Si algún día deja de ser benigno, se quita de aquí.
 */
const RUIDO_CONOCIDO = [/done is not a function/i];

export function esRuidoConocido(mensaje) {
  const t = String(mensaje ?? "");
  return RUIDO_CONOCIDO.some((r) => r.test(t));
}

/** Registra un error del PROPIO escritorio (proceso principal) en la base local. */
export async function registrarErrorLocal(pool, { tenantId, mensaje, stack, contexto = {}, version = null }) {
  if (esRuidoConocido(mensaje)) return;
  try {
    // Sin tenant explícito se toma el de esta caja: su base local tiene exactamente uno.
    if (!tenantId) {
      const { rows } = await pool.query("SELECT id FROM tenants LIMIT 1");
      tenantId = rows[0]?.id ?? null;
    }
    if (!tenantId) return; // sin tenant, RLS lo rechazaría al subir
    await pool.query(
      `INSERT INTO errores_app (tenant_id, app, version, mensaje, stack, contexto)
       VALUES ($1, 'caja', $2, $3, $4, $5::jsonb)`,
      [tenantId, version, String(mensaje).slice(0, 500), stack ? String(stack).slice(0, 4000) : null, JSON.stringify(contexto)],
    );
  } catch {
    // Estamos manejando un fallo; no provocar otro.
  }
}
