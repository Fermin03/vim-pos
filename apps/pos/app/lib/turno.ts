"use client";
import { employeeClient } from "./supabase";

export type Turno = {
  id: string;
  codigo_turno: string;
  caja_id: string;
  sucursal_id: string;
  dia_contable: string;
  fondo_inicial_mxn: number;
  fecha_apertura: string;
  estado: "ABIERTO" | "PENDIENTE_VALIDACION" | "CERRADO";
};

/** Turno ABIERTO de una caja (o null). Hay UNIQUE constraint que garantiza ≤1. */
export async function turnoAbiertoDeCaja(token: string, cajaId: string): Promise<Turno | null> {
  const { data, error } = await employeeClient(token)
    .from("turnos")
    .select("id, codigo_turno, caja_id, sucursal_id, dia_contable, fondo_inicial_mxn, fecha_apertura, estado")
    .eq("caja_id", cajaId)
    .eq("estado", "ABIERTO")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, fondo_inicial_mxn: Number(data.fondo_inicial_mxn) } as Turno;
}

export type DatosCaja = {
  tenant_id: string;
  sucursal_id: string;
  numero: number;
  nombre: string;
  sucursalNombre: string;
};

/** Lee datos completos de la caja (caja + sucursal). Usa RLS por tenant. */
export async function leerCaja(token: string, cajaId: string): Promise<DatosCaja> {
  const { data, error } = await employeeClient(token)
    .from("cajas")
    .select("tenant_id, sucursal_id, numero, nombre, sucursal:sucursales(nombre)")
    .eq("id", cajaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Caja no encontrada");
  type Fila = { tenant_id: string; sucursal_id: string; numero: number; nombre: string; sucursal: { nombre: string } | null };
  const f = data as unknown as Fila;
  return {
    tenant_id: f.tenant_id,
    sucursal_id: f.sucursal_id,
    numero: f.numero,
    nombre: f.nombre,
    sucursalNombre: f.sucursal?.nombre ?? "—",
  };
}

/** Día contable hoy. Simplificación: usa el día local del navegador. El backend
 *  refinará el cómputo con la hora de cierre del tenant cuando se migre a RPC. */
function diaContableHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Próximo correlativo del día para la caja (contar turnos abiertos del día). */
async function siguienteCorrelativoDelDia(token: string, cajaId: string, dia: string): Promise<number> {
  const { count, error } = await employeeClient(token)
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("caja_id", cajaId)
    .eq("dia_contable", dia);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

export type AbrirTurnoInput = {
  cajaId: string;
  cajaNumero: number;
  fondoInicial: number;
  notas?: string;
};

/** Abre turno. Devuelve el turno creado. Lanza con motivo si UNIQUE colisiona o si ya hay uno abierto. */
export async function abrirTurno(token: string, input: AbrirTurnoInput): Promise<Turno> {
  if (input.fondoInicial < 0) throw new Error("FONDO_INVALIDO");
  const caja = await leerCaja(token, input.cajaId);
  const tenant_id = caja.tenant_id;
  const sucursal_id = caja.sucursal_id;
  const dia = diaContableHoy();
  const correlativo = await siguienteCorrelativoDelDia(token, input.cajaId, dia);
  const codigo = `${dia}-C${String(input.cajaNumero).padStart(2, "0")}-${String(correlativo).padStart(2, "0")}`;

  const { data, error } = await employeeClient(token)
    .from("turnos")
    .insert({
      tenant_id,
      sucursal_id,
      caja_id: input.cajaId,
      codigo_turno: codigo,
      dia_contable: dia,
      // usuario_apertura_id se infiere del JWT (auth.uid()) en el trigger — pero la columna es NOT NULL.
      // PostgREST no autollena; lo añadimos desde el JWT decodificando.
      usuario_apertura_id: subDeToken(token),
      fondo_inicial_mxn: input.fondoInicial,
      fondo_modo: "TOTAL",
      notas_apertura: input.notas ?? null,
    })
    .select("id, codigo_turno, caja_id, sucursal_id, dia_contable, fondo_inicial_mxn, fecha_apertura, estado")
    .single();
  if (error) {
    if (/unique|duplicate/i.test(error.message)) throw new Error("YA_HAY_TURNO_ABIERTO");
    throw new Error(error.message);
  }
  return { ...data, fondo_inicial_mxn: Number(data.fondo_inicial_mxn) } as Turno;
}

function subDeToken(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error();
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.sub as string;
  } catch {
    throw new Error("TOKEN_INVALIDO");
  }
}

export function fmtMxn(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
