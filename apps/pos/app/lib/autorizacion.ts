"use client";
import { employeeClient, encabezadosFuncion, urlFuncion } from "./supabase";

export type PayloadAutorizacion = {
  accion: string;
  permisoCodigo: string;
  entidadTipo: string;
  entidadId: string | null;
  monto: number | null;
  motivo: string;
  cajaId: string;
  turnoId: string | null;
};

/** Resultado uniforme de ambos caminos: id de la autorización + quién autorizó. */
export type Autorizacion = { autorizacionPinId: string; autorizoId: string };

/** El `sub` (usuario) del token de empleado. Cualquier token ilegible es TOKEN_INVALIDO. */
export function subDeToken(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error();
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.sub as string;
  } catch {
    throw new Error("TOKEN_INVALIDO");
  }
}

/** Autorización por PIN de supervisor (Edge Function). */
export async function autorizarConPin(token: string, pin: string, p: PayloadAutorizacion): Promise<Autorizacion> {
  const res = await fetch(urlFuncion("autorizar-pin"), {
    method: "POST",
    headers: encabezadosFuncion(token),
    body: JSON.stringify({
      pin,
      accion: p.accion,
      permiso_codigo: p.permisoCodigo,
      entidad_tipo: p.entidadTipo,
      entidad_id: p.entidadId,
      monto: p.monto,
      motivo: p.motivo,
      caja_id: p.cajaId,
      turno_id: p.turnoId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return { autorizacionPinId: data.autorizacion_pin_id as string, autorizoId: data.autorizo_id as string };
}

/** Autorización propia (operador con el permiso) vía RPC. autorizoId = el propio operador. */
export async function autorizacionPropia(token: string, p: PayloadAutorizacion): Promise<Autorizacion> {
  const { data, error } = await employeeClient(token).rpc("registrar_autorizacion_propia", {
    p_accion: p.accion,
    p_permiso_codigo: p.permisoCodigo,
    p_entidad_tipo: p.entidadTipo,
    p_entidad_id: p.entidadId,
    p_monto: p.monto,
    p_motivo: p.motivo,
    p_caja_id: p.cajaId,
    p_turno_id: p.turnoId,
  });
  if (error) throw new Error(error.message);
  if (!(data as { ok?: boolean })?.ok) throw new Error((data as { motivo?: string })?.motivo ?? "SIN_PERMISO");
  return {
    autorizacionPinId: (data as { autorizacion_pin_id: string }).autorizacion_pin_id,
    autorizoId: subDeToken(token),
  };
}
