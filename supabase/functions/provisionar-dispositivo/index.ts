// Edge Function: provisionar-dispositivo — el DUEÑO/ADMIN prepara la vinculación de una caja.
//   · { caja_id, codigo: true } → un código de 6 caracteres que se canjea UNA vez, en 15 minutos,
//     en canjear-codigo-caja. Generarlo no toca la cuenta de la caja: la clave cambia al canjearlo.
//   · { caja_id }               → las credenciales largas (correo sintético + clave), al momento.
//     Las siguen usando las cajas anteriores a la pantalla del código y la pantalla de cocina.
// service_role server-side. Requiere JWT de un DUEÑO/ADMIN del tenant dueño de la caja.

import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { asegurarCuentaDispositivo, generarCodigo } from "../_shared/cuenta-dispositivo.ts";
import { bearerDe, tenantDelToken } from "../_shared/identidad.ts";

const admin = clienteAdmin();

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];
const VIGENCIA_CODIGO_MIN = 15;

servir(async (req, json) => {
  // 1) JWT del admin que llama
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const callerId = userResp.user.id;

  // 2) Body
  let body: { caja_id?: string; codigo?: boolean };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const cajaId = body.caja_id?.trim();
  if (!cajaId || !/^[0-9a-f-]{36}$/i.test(cajaId)) return json({ error: "CAJA_INVALIDA" }, 400);

  // 3) Caller es DUEÑO/ADMIN del tenant DE SU SESIÓN.
  // C2-6: el tenant sale del claim del token ya verificado y el rol se busca en ESE tenant. Antes
  // se tomaba el primer acceso de administrador que apareciera (`.find`), de cualquier negocio.
  const tenantId = tenantDelToken(token);
  if (!tenantId) return json({ error: "SIN_PERMISO" }, 403);
  const { data: accesoCaller, error: accErr } = await admin
    .from("usuarios_acceso").select("tenant_id, rol:roles(codigo)")
    .eq("usuario_id", callerId).eq("tenant_id", tenantId).eq("activo", true);
  if (accErr) { registrarError("provisionar-dispositivo", "DB_ERROR", accErr); return json({ error: "DB_ERROR" }, 500); }
  type Acc = { tenant_id: string; rol: { codigo: string } | null };
  const adm = ((accesoCaller ?? []) as unknown as Acc[]).find((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo));
  if (!adm) return json({ error: "SIN_PERMISO" }, 403);

  // 4) La caja debe ser del tenant del caller
  const { data: caja } = await admin
    .from("cajas").select("sucursal_id, nombre, tenant_id").eq("id", cajaId).maybeSingle();
  if (!caja || (caja as { tenant_id: string }).tenant_id !== tenantId) return json({ error: "CAJA_FORANEA" }, 403);
  const cajaNombre = (caja as { nombre: string }).nombre ?? "Caja";

  // 5a) Código corto: reemplaza al que hubiera para esta caja.
  if (body.codigo === true) {
    const expira = new Date(Date.now() + VIGENCIA_CODIGO_MIN * 60_000).toISOString();
    // Reintenta si el código ya lo tiene otra caja (UNIQUE): con 31^6 combinaciones casi nunca.
    for (let i = 0; i < 3; i++) {
      const codigo = generarCodigo();
      const { error } = await admin.from("codigos_vinculacion_caja").upsert(
        { caja_id: cajaId, tenant_id: tenantId, codigo, creado_por: callerId, expira_en: expira },
        { onConflict: "caja_id" },
      );
      if (!error) return json({ ok: true, codigo, expira_en: expira, caja_nombre: cajaNombre });
      if (error.code !== "23505") { registrarError("provisionar-dispositivo", "DB_ERROR", error); return json({ error: "DB_ERROR" }, 500); }
    }
    return json({ error: "DB_ERROR" }, 500);
  }

  // 5b) Credenciales largas, al momento.
  const r = await asegurarCuentaDispositivo(admin, {
    id: cajaId, tenantId, sucursalId: (caja as { sucursal_id: string }).sucursal_id, nombre: cajaNombre,
  }, callerId);
  if ("error" in r) return json({ error: r.error }, r.status);
  return json({ ok: true, identificador: r.email, clave: r.password, caja_nombre: cajaNombre });
});
