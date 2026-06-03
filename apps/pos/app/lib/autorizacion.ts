"use client";
import { employeeClient } from "./supabase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type PayloadAutorizacion = {
  accion: string;
  permisoCodigo: string;
  entidadTipo: string;
  entidadId: string | null;
  monto: number | null;
  motivo: string;
  cajaId: string;
  turnoId: string;
};

/** Resultado uniforme de ambos caminos: id de la autorización + quién autorizó. */
export type Autorizacion = { autorizacionPinId: string; autorizoId: string };

function subDeToken(token: string): string {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("TOKEN_INVALIDO");
  const c = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  return c.sub as string;
}

/** Autorización por PIN de supervisor (Edge Function). */
export async function autorizarConPin(token: string, pin: string, p: PayloadAutorizacion): Promise<Autorizacion> {
  const res = await fetch(`${URL}/functions/v1/autorizar-pin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
