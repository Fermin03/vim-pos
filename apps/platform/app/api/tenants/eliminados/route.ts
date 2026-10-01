import { NextResponse } from "next/server";
import { autorizar, SYSTEM_ADMIN_ID } from "../../../lib/server";

/**
 * Clientes eliminados (0144, ADR 0023): lo único que queda de ellos. Sin esta lista el archivo
 * existiría pero nadie podría contestar "¿quién era ese negocio que borramos en octubre, y nos
 * había pagado algo?".
 */
export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data, error } = await sb
    .from("tenants_eliminados")
    .select("id, codigo, nombre_comercial, vertical_principal, plan_codigo, fecha_alta, fecha_baja, eliminado_at, eliminado_por, motivo, conteos, pagos_suscripcion, contacto")
    .order("eliminado_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const operadores = new Map<string, string>();
  const { data: ops } = await sb.from("plataforma_operadores").select("usuario_id, nombre");
  for (const o of (ops ?? []) as { usuario_id: string; nombre: string }[]) operadores.set(o.usuario_id, o.nombre);

  type Fila = {
    id: string; codigo: string; nombre_comercial: string; vertical_principal: string; plan_codigo: string | null;
    fecha_alta: string; fecha_baja: string | null; eliminado_at: string; eliminado_por: string; motivo: string;
    conteos: { resumen?: Record<string, number> } | null;
    pagos_suscripcion: { monto_mxn?: number | string; anulado_at?: string | null }[] | null;
    contacto: { nombre?: string; email?: string; telefono?: string } | null;
  };

  return NextResponse.json({
    eliminados: ((data ?? []) as unknown as Fila[]).map((f) => {
      const vigentes = (f.pagos_suscripcion ?? []).filter((p) => !p.anulado_at);
      return {
        id: f.id,
        codigo: f.codigo,
        nombre: f.nombre_comercial,
        vertical: f.vertical_principal,
        plan: f.plan_codigo,
        fechaAlta: f.fecha_alta,
        fechaBaja: f.fecha_baja,
        eliminadoAt: f.eliminado_at,
        quien: f.eliminado_por === SYSTEM_ADMIN_ID ? "Clave compartida" : (operadores.get(f.eliminado_por) ?? "(operador eliminado)"),
        motivo: f.motivo,
        resumen: f.conteos?.resumen ?? {},
        pagos: { cuantos: vigentes.length, total: vigentes.reduce((s, p) => s + Number(p.monto_mxn ?? 0), 0) },
        contacto: f.contacto ?? {},
      };
    }),
  });
}
