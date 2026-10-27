// Edge Function: canjear-codigo-caja — la caja (o la tableta) cambia el código de 6 caracteres que
// generó el dueño en el panel por las credenciales de su cuenta de dispositivo.
//
// Pública (verify_jwt = false): quien la llama todavía no tiene sesión. Lo que la protege:
//   · el código sirve UNA vez (se borra al canjearlo, en la misma sentencia que lo valida) y vence
//     a los 15 minutos;
//   · cupo por IP y tope global (`_shared/limite.ts`). Con 31^6 ≈ 887 millones de códigos y unos
//     pocos vivos a la vez, adivinar uno dentro de esos topes no es práctico. "cerrar" si la base
//     no responde: esta función cambia contraseñas de Auth, igual que signup-tenant.
//
// Al canjear, la clave de la caja se genera de nuevo: si ya había otra computadora vinculada a
// esta caja con la clave anterior, deja de sincronizar (el panel lo avisa al generar el código).

import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { asegurarCuentaDispositivo, normalizarCodigo } from "../_shared/cuenta-dispositivo.ts";
import { consumirCupos, ipDeLaPeticion } from "../_shared/limite.ts";

const admin = clienteAdmin();

servir(async (req, json) => {
  const ip = ipDeLaPeticion(req);
  const cupo = await consumirCupos(admin, [
    { clave: `codigo-caja:ip:${ip}`, ventanaSeg: 600, max: 10 },
    { clave: "codigo-caja:global", ventanaSeg: 3600, max: 300 },
  ], "cerrar");
  if (!cupo.permitido) return json({ error: "DEMASIADOS_INTENTOS" }, 429);

  let body: { codigo?: unknown };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const codigo = normalizarCodigo(body.codigo);
  if (!codigo) return json({ error: "CODIGO_INVALIDO" }, 400);

  // Validar y gastar en una sola sentencia: dos canjes simultáneos no pueden llevarse el mismo.
  const { data: fila, error } = await admin.from("codigos_vinculacion_caja")
    .delete().eq("codigo", codigo).gt("expira_en", new Date().toISOString())
    .select("caja_id, tenant_id, creado_por").maybeSingle();
  if (error) { registrarError("canjear-codigo-caja", "DB_ERROR", error); return json({ error: "DB_ERROR" }, 500); }
  if (!fila) return json({ error: "CODIGO_INVALIDO" }, 400);
  const f = fila as { caja_id: string; tenant_id: string; creado_por: string };

  const { data: caja } = await admin.from("cajas").select("sucursal_id, nombre, tenant_id").eq("id", f.caja_id).maybeSingle();
  if (!caja || (caja as { tenant_id: string }).tenant_id !== f.tenant_id) return json({ error: "CODIGO_INVALIDO" }, 400);
  const nombre = (caja as { nombre: string }).nombre ?? "Caja";

  const r = await asegurarCuentaDispositivo(admin, {
    id: f.caja_id, tenantId: f.tenant_id, sucursalId: (caja as { sucursal_id: string }).sucursal_id, nombre,
  }, f.creado_por);
  if ("error" in r) return json({ error: r.error }, r.status);
  return json({ ok: true, identificador: r.email, clave: r.password, caja_nombre: nombre });
});
