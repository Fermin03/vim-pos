import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";

/**
 * Avisos que VIM manda a las cajas (ADR 0014, entrega 3).
 *
 * Viajan por el latido, así que aquí solo se escriben y se lee quién los ha visto. El conteo
 * "visto por N de M cajas" es lo que convierte esta pantalla en algo accionable: sin él, mandar
 * un aviso sería gritar al vacío y nunca sabrías si el negocio se enteró.
 */

/** El cliente service_role que devuelve `autorizar`. `lib/server.ts` no exporta el tipo. */
type SbPlataforma = Parameters<typeof auditar>[0];

const NIVELES = ["info", "warning", "danger"];
const CUERPO_MAX = 600;
const MOTIVO_MINIMO = 10;

type Aviso = {
  id: string; tenant_id: string | null; nivel: string; titulo: string; cuerpo: string;
  requiere_confirmacion: boolean; vigente_desde: string; vigente_hasta: string | null;
  created_at: string; deleted_at: string | null;
};

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const [avisosRes, lecturasRes, cajasRes, tenantsRes] = await Promise.all([
    sb.from("avisos_plataforma")
      .select("id, tenant_id, nivel, titulo, cuerpo, requiere_confirmacion, vigente_desde, vigente_hasta, created_at, deleted_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("avisos_lecturas").select("aviso_id, caja_id").limit(5000),
    // Solo cajas activas: el alcance es "a cuántas cajas que operan le puede llegar".
    sb.from("cajas").select("id, tenant_id").is("deleted_at", null).eq("activa", true).limit(2000),
    sb.from("tenants").select("id, nombre_comercial, estado").is("deleted_at", null).limit(1000),
  ]);
  if (avisosRes.error) return NextResponse.json({ error: avisosRes.error.message }, { status: 500 });

  const tenants = (tenantsRes.data ?? []) as { id: string; nombre_comercial: string; estado: string }[];
  const nombreDe = new Map(tenants.map((t) => [t.id, t.nombre_comercial]));
  const vivos = new Set(tenants.filter((t) => t.estado !== "CANCELADO").map((t) => t.id));

  const cajasPorTenant = new Map<string, number>();
  let cajasTotales = 0;
  for (const c of (cajasRes.data ?? []) as { tenant_id: string }[]) {
    if (!vivos.has(c.tenant_id)) continue;
    cajasPorTenant.set(c.tenant_id, (cajasPorTenant.get(c.tenant_id) ?? 0) + 1);
    cajasTotales += 1;
  }

  // El "visto por N de M cajas" cuenta SOLO acuses de caja. Los del POS web van sin caja y se
  // reportan aparte: si se sumaran al mismo número, el numerador podría superar al denominador
  // y, peor, un empleado podría inflarlo llamando a la RPC sin que ninguna caja lo mostrara.
  const vistosPorAviso = new Map<string, number>();
  const vistosWebPorAviso = new Map<string, number>();
  for (const l of (lecturasRes.data ?? []) as { aviso_id: string; caja_id: string | null }[]) {
    const m = l.caja_id ? vistosPorAviso : vistosWebPorAviso;
    m.set(l.aviso_id, (m.get(l.aviso_id) ?? 0) + 1);
  }

  const avisos = ((avisosRes.data ?? []) as Aviso[]).map((a) => ({
    id: a.id,
    tenantId: a.tenant_id,
    tenantNombre: a.tenant_id ? (nombreDe.get(a.tenant_id) ?? "—") : null,
    nivel: a.nivel,
    titulo: a.titulo,
    cuerpo: a.cuerpo,
    requiereConfirmacion: a.requiere_confirmacion,
    vigenteDesde: a.vigente_desde,
    vigenteHasta: a.vigente_hasta,
    createdAt: a.created_at,
    borrado: a.deleted_at !== null,
    vistos: vistosPorAviso.get(a.id) ?? 0,
    vistosWeb: vistosWebPorAviso.get(a.id) ?? 0,
    // Un aviso global alcanza a las cajas de todos los clientes que siguen vivos.
    cajasAlcance: a.tenant_id ? (cajasPorTenant.get(a.tenant_id) ?? 0) : cajasTotales,
  }));

  return NextResponse.json({ avisos });
}

export async function POST(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const nivel = String(body.nivel ?? "");
  const titulo = String(body.titulo ?? "").trim();
  const cuerpo = String(body.cuerpo ?? "").trim();
  const motivo = String(body.motivo ?? "").trim();
  const tenantId = body.tenant_id ? String(body.tenant_id) : null;

  if (!NIVELES.includes(nivel)) return NextResponse.json({ error: "NIVEL_INVALIDO" }, { status: 400 });
  if (titulo.length < 1 || titulo.length > 120) return NextResponse.json({ error: "TITULO_INVALIDO" }, { status: 400 });
  if (cuerpo.length < 1 || cuerpo.length > CUERPO_MAX) return NextResponse.json({ error: "CUERPO_INVALIDO" }, { status: 400 });
  // Se guarda y se renderiza como TEXTO. Rechazar `<` es la forma más simple de que nadie meta
  // marcado por accidente y alguien lo interprete algún día.
  if (/[<>]/.test(titulo) || /[<>]/.test(cuerpo)) return NextResponse.json({ error: "SIN_MARCADO" }, { status: 400 });
  if (motivo.length < MOTIVO_MINIMO) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

  const vigenteHasta = body.vigente_hasta ? String(body.vigente_hasta) : null;
  if (vigenteHasta && Number.isNaN(new Date(vigenteHasta).getTime())) {
    return NextResponse.json({ error: "FECHA_INVALIDA" }, { status: 400 });
  }

  const { data, error } = await sb.from("avisos_plataforma").insert({
    tenant_id: tenantId,
    nivel,
    titulo,
    cuerpo,
    requiere_confirmacion: body.requiere_confirmacion === true,
    vigente_hasta: vigenteHasta,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditarAviso(sb, { avisoId: (data as { id: string }).id, tenantId, accion: "aviso.crear", motivo, payload: { nivel, titulo } });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function DELETE(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const motivo = (url.searchParams.get("motivo") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });
  if (motivo.length < MOTIVO_MINIMO) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

  // Borrado lógico: el acuse de quien ya lo leyó tiene que sobrevivir, y saber qué se mandó y
  // cuándo se retiró es justo lo que hace falta si un cliente pregunta después.
  const { data, error } = await sb.from("avisos_plataforma")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id).is("deleted_at", null)
    .select("tenant_id, titulo").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NO_EXISTE" }, { status: 404 });

  const a = data as { tenant_id: string | null; titulo: string };
  await auditarAviso(sb, { avisoId: id, tenantId: a.tenant_id, accion: "aviso.borrar", motivo, payload: { titulo: a.titulo } });
  return NextResponse.json({ ok: true });
}

/**
 * Auditoría de un aviso.
 *
 * `super_admin_accesos.tenant_id` es NOT NULL, así que un aviso global no cabe en una sola fila.
 * Se asienta UNA FILA POR CLIENTE alcanzado: es lo que permite responder después "¿a quién le
 * llegó esto?", que es justo la pregunta que se hace cuando algo salió mal. Con el número de
 * clientes de hoy es trivial; si algún día son cientos, se cambia por una fila con la lista en
 * el payload.
 */
async function auditarAviso(
  sb: SbPlataforma,
  args: { avisoId: string; tenantId: string | null; accion: string; motivo: string; payload: Record<string, unknown> },
): Promise<void> {
  let destinos: string[];
  if (args.tenantId) {
    destinos = [args.tenantId];
  } else {
    const { data } = await sb.from("tenants").select("id").is("deleted_at", null).neq("estado", "CANCELADO");
    destinos = ((data ?? []) as { id: string }[]).map((t) => t.id);
  }
  for (const tid of destinos) {
    await auditar(sb, {
      accion: args.accion,
      tenantId: tid,
      motivo: args.motivo,
      payload: { ...args.payload, aviso_id: args.avisoId, global: args.tenantId === null },
    });
  }
}
