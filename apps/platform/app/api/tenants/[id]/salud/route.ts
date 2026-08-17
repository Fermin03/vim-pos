import { NextResponse } from "next/server";
import { autorizar } from "../../../../lib/server";

/**
 * Salud operativa de una empresa: ¿está usando el producto?
 *
 * El plan y el estado dicen lo que el cliente CONTRATÓ; esto dice lo que hace. Un tenant
 * ACTIVO cuya última sincronización fue hace dos semanas está a un paso de cancelar y nadie se
 * entera hasta que llega el correo. Es la única vista que distingue un cliente sano de uno
 * zombi, y en soporte responde la primera pregunta de siempre: "¿le llegan sus ventas?".
 */

const DIA = 24 * 3600 * 1000;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  const [sucRes, cajasRes, syncRes, ventaRes, turnoRes] = await Promise.all([
    sb.from("sucursales").select("id, nombre, activa").eq("tenant_id", id).is("deleted_at", null).limit(200),
    sb.from("cajas")
      .select("id, nombre, sucursal_id, activa, bloqueada, bloqueo_motivo, ultima_conexion, ultima_ip")
      .eq("tenant_id", id).is("deleted_at", null).limit(500),
    // Últimas sincronizaciones: sirven para ver si además de conectarse, los datos SUBEN.
    sb.from("sync_eventos")
      .select("id, created_at, operaciones_total, operaciones_exitosas, operaciones_error, operaciones_conflicto, dispositivo_descripcion, duracion_ms")
      .eq("tenant_id", id).order("created_at", { ascending: false }).limit(20),
    // Señal REAL de vida: el último ticket que llegó a la nube. `cajas.ultima_conexion` nunca
    // se escribe (declarada en la mig. 0003 y sin ningún writer) y `sync_eventos` no lo llena
    // el push del escritorio, así que la venta es lo único que prueba que la caja opera Y sube.
    sb.from("tickets").select("id, created_at, total_mxn, caja_id")
      .eq("tenant_id", id).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1),
    sb.from("turnos").select("id, created_at, caja_id, estado")
      .eq("tenant_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const ultimaVenta = ((ventaRes.data ?? [])[0] ?? null) as { created_at: string; total_mxn: number | null; caja_id: string | null } | null;
  const ultimoTurno = ((turnoRes.data ?? [])[0] ?? null) as { created_at: string; estado: string | null } | null;

  const sucursales = (sucRes.data ?? []) as { id: string; nombre: string; activa: boolean }[];
  const nombreSuc = new Map(sucursales.map((s) => [s.id, s.nombre]));

  const cajas = ((cajasRes.data ?? []) as {
    id: string; nombre: string; sucursal_id: string; activa: boolean;
    bloqueada: boolean; bloqueo_motivo: string | null; ultima_conexion: string | null; ultima_ip: string | null;
  }[]).map((c) => {
    const t = c.ultima_conexion ? new Date(c.ultima_conexion).getTime() : NaN;
    const horas = Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 3600_000);
    return {
      id: c.id,
      nombre: c.nombre,
      sucursal: nombreSuc.get(c.sucursal_id) ?? "—",
      activa: c.activa,
      bloqueada: c.bloqueada,
      bloqueoMotivo: c.bloqueo_motivo,
      ultimaConexion: c.ultima_conexion,
      ultimaIp: c.ultima_ip,
      horasSinConexion: horas,
      // Semáforo: el mismo criterio que usa la bandeja de alertas, para que no se contradigan.
      estado: c.bloqueada ? "bloqueada" : !c.activa ? "inactiva"
        : horas === null ? "nunca"
        : horas >= 72 ? "caida" : horas >= 24 ? "tibia" : "ok",
    };
  });

  const sync = ((syncRes.data ?? []) as {
    id: string; created_at: string; operaciones_total: number | null; operaciones_exitosas: number | null;
    operaciones_error: number | null; operaciones_conflicto: number | null;
    dispositivo_descripcion: string | null; duracion_ms: number | null;
  }[]).map((s) => ({
    id: s.id,
    fecha: s.created_at,
    total: Number(s.operaciones_total ?? 0),
    exitosas: Number(s.operaciones_exitosas ?? 0),
    errores: Number(s.operaciones_error ?? 0),
    conflictos: Number(s.operaciones_conflicto ?? 0),
    dispositivo: s.dispositivo_descripcion,
    duracionMs: Number(s.duracion_ms ?? 0),
  }));

  const ultimaSync = sync[0]?.fecha ?? null;
  const diasSinSync = ultimaSync ? Math.floor((Date.now() - new Date(ultimaSync).getTime()) / DIA) : null;

  const diasSinVender = ultimaVenta
    ? Math.floor((Date.now() - new Date(ultimaVenta.created_at).getTime()) / DIA)
    : null;

  return NextResponse.json({
    ultimaVenta: ultimaVenta?.created_at ?? null,
    ultimaVentaMxn: ultimaVenta ? Number(ultimaVenta.total_mxn ?? 0) : null,
    diasSinVender,
    ultimoTurno: ultimoTurno?.created_at ?? null,
    turnoAbierto: ultimoTurno?.estado === "ABIERTO",
    sucursales: sucursales.length,
    sucursalesActivas: sucursales.filter((s) => s.activa).length,
    cajas,
    sync,
    ultimaSync,
    diasSinSync,
    // Errores acumulados de los últimos envíos: si esto no es 0, algo se está quedando en tierra.
    erroresRecientes: sync.reduce((a, s) => a + s.errores, 0),
    conflictosRecientes: sync.reduce((a, s) => a + s.conflictos, 0),
  });
}
