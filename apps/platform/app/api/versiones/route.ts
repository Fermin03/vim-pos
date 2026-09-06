import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";
import { validarManifiesto } from "../../lib/manifiesto";

/**
 * Versiones del escritorio (ADR 0014, entrega 4).
 *
 * Publicar era compilar, generar el manifiesto, subirlo con curl y crear el release a mano. Tres
 * de esos pasos viven aquí, y de paso queda registro de qué se publicó y cuándo. El actualizador
 * de la caja NO cambia: sigue leyendo el mismo `latest.json` del bucket.
 */

type SbPlataforma = Parameters<typeof auditar>[0];

const MOTIVO_MINIMO = 10;
/**
 * Prefijo EXACTO donde deben vivir los instaladores. Con el repo dentro, no solo el dominio: en
 * `github.com` publica cualquiera. Se puede mover con una variable, sin tocar código.
 */
const PREFIJO_RELEASES =
  process.env.PLATFORM_RELEASES_PREFIX ?? "https://github.com/Fermin03/vim-pos/releases/download/";

/** Compara "0.4.61" con "0.4.9" por número. Como texto, la segunda ganaría. */
function menorQue(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const [versRes, cajasRes, sucRes, tenRes] = await Promise.all([
    sb.from("versiones_caja")
      .select("version, url, sha512, notas, fecha, publicada, es_minima, bloquea_bajo_minima, bloquea_desde, created_at")
      .limit(200),
    sb.from("cajas").select("id, nombre, tenant_id, sucursal_id, version_app, so, ultimo_latido")
      .is("deleted_at", null).eq("activa", true).limit(2000),
    sb.from("sucursales").select("id, nombre").is("deleted_at", null).limit(500),
    sb.from("tenants").select("id, nombre_comercial, estado").is("deleted_at", null).limit(1000),
  ]);
  if (versRes.error) return NextResponse.json({ error: versRes.error.message }, { status: 500 });

  type Version = {
    version: string; url: string; sha512: string; notas: string | null; fecha: string | null;
    publicada: boolean; es_minima: boolean; bloquea_bajo_minima: boolean; bloquea_desde: string | null;
    created_at: string;
  };
  const versiones = ((versRes.data ?? []) as Version[])
    .sort((a, b) => (menorQue(a.version, b.version) ? 1 : -1));
  const minima = versiones.find((v) => v.es_minima)?.version ?? null;

  const nombreSuc = new Map(((sucRes.data ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre]));
  const tenants = (tenRes.data ?? []) as { id: string; nombre_comercial: string; estado: string }[];
  const nombreTen = new Map(tenants.map((t) => [t.id, t.nombre_comercial]));
  const vivos = new Set(tenants.filter((t) => t.estado !== "CANCELADO").map((t) => t.id));

  const cajas = ((cajasRes.data ?? []) as {
    id: string; nombre: string; tenant_id: string; sucursal_id: string;
    version_app: string | null; so: string | null; ultimo_latido: string | null;
  }[])
    .filter((c) => vivos.has(c.tenant_id))
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cliente: nombreTen.get(c.tenant_id) ?? "—",
      tenantId: c.tenant_id,
      sucursal: nombreSuc.get(c.sucursal_id) ?? "—",
      versionApp: c.version_app,
      so: c.so,
      ultimoLatido: c.ultimo_latido,
      // Una caja sin versión es anterior a 0.4.60: no late, y no es lo mismo que estar
      // desactualizada respecto a la mínima. Se cuentan aparte para no mezclar dos problemas.
      sinLatido: c.version_app === null,
      desactualizada: c.version_app !== null && menorQue(c.version_app, minima),
    }));

  return NextResponse.json({ versiones, cajas, minima });
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

  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < MOTIVO_MINIMO) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

  const val = validarManifiesto(String(body.manifiesto ?? ""), PREFIJO_RELEASES);
  if (!val.ok) return NextResponse.json({ error: "MANIFIESTO_INVALIDO", detalle: val.error }, { status: 400 });
  const m = val.manifiesto;

  // Primero el bucket, después el catálogo. El orden importa y no es el intuitivo: lo que las
  // cajas realmente leen para actualizarse es `latest.json`, no esta tabla. Si el bucket falla
  // después de haber guardado la fila, el panel diría "publicada 0.4.62" mientras el CDN sigue
  // sirviendo la anterior, y nada lo delataría. Al revés no hay daño: la caja se actualiza como
  // siempre y basta con repetir el POST (es idempotente) para que quede el registro.
  //
  // El manifiesto se RE-SERIALIZA aquí en vez de reenviar el texto pegado: el script
  // `release-manifest` escribe las notas con los acentos rotos y esto lo arregla de paso.
  //
  // La caché corta es obligatoria: sin ella el CDN sirve el manifiesto anterior hasta un minuto y
  // parece que la publicación no surtió efecto. Pasó en las entregas 2 y 3.
  const cuerpo = JSON.stringify(
    { version: m.version, url: m.url, sha512: m.sha512, notas: m.notas, fecha: m.fecha },
    null, 2,
  ) + "\n";
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const subida = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/actualizaciones/latest.json`,
    {
      method: "PUT",
      headers: {
        // El header `apikey` es obligatorio: con solo Authorization, la clave rotada (que no es
        // un JWT) se rechaza con "Invalid Compact JWS".
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
        "cache-control": "max-age=60",
        "x-upsert": "true",
      },
      body: cuerpo,
    },
  );
  if (!subida.ok) {
    return NextResponse.json(
      { error: "STORAGE_ERROR", detalle: (await subida.text()).slice(0, 300) },
      { status: 502 },
    );
  }

  // `upsert` a propósito: si una publicación se quedó a medias o hay que corregir las notas, se
  // vuelve a pegar el mismo manifiesto y no estalla por clave duplicada.
  const { error } = await sb.from("versiones_caja").upsert({
    version: m.version, url: m.url, sha512: m.sha512, notas: m.notas || null, fecha: m.fecha, publicada: true,
  }, { onConflict: "version" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditarTodos(sb, { accion: "version.publicar", motivo, payload: { version: m.version, url: m.url } });
  return NextResponse.json({ ok: true, version: m.version, avisoCache: true });
}

export async function PATCH(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const version = String(body.version ?? "");
  const accion = String(body.accion ?? "");
  const motivo = String(body.motivo ?? "").trim();
  if (!version) return NextResponse.json({ error: "VERSION_REQUERIDA" }, { status: 400 });
  if (motivo.length < MOTIVO_MINIMO) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

  const extra: Record<string, unknown> = {};

  if (accion === "marcar_minima") {
    // Hay que limpiar la anterior ANTES de marcar la nueva: el índice único solo admite una
    // mínima a la vez y el orden inverso choca. Se excluye la propia versión para que volver a
    // marcar la que ya era mínima no la apague y deje al parque sin ninguna.
    //
    // Al bajar la anterior se le quita también el bloqueo: un `bloquea_bajo_minima = true` que
    // sobrevive en una fila que ya no es la mínima es una bomba de relojería si esa fila se
    // vuelve a marcar meses después.
    const { error: eLimpia } = await sb.from("versiones_caja")
      .update({ es_minima: false, bloquea_bajo_minima: false, bloquea_desde: null })
      .eq("es_minima", true).neq("version", version);
    if (eLimpia) return NextResponse.json({ error: eLimpia.message }, { status: 500 });
    const { error } = await sb.from("versiones_caja").update({ es_minima: true }).eq("version", version);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (accion === "quitar_minima") {
    const { error } = await sb.from("versiones_caja")
      .update({ es_minima: false, bloquea_bajo_minima: false, bloquea_desde: null })
      .eq("version", version);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (accion === "bloquear") {
    // Exigir una mínima que BLOQUEA es lo más agresivo del ADR y lo único que la caja decide
    // localmente, así que necesita una fecha futura: nadie debe poder dejar cajas sin vender ya.
    const desde = String(body.bloquea_desde ?? "");
    const t = new Date(desde).getTime();
    if (Number.isNaN(t)) return NextResponse.json({ error: "FECHA_INVALIDA" }, { status: 400 });
    if (t <= Date.now()) return NextResponse.json({ error: "FECHA_DEBE_SER_FUTURA" }, { status: 400 });
    // Solo la mínima puede bloquear. El `.select()` no es decorativo: sin él, un `update` que no
    // toca ninguna fila responde sin error y la pantalla diría que quedó exigida cuando no.
    const { data, error } = await sb.from("versiones_caja")
      .update({ bloquea_bajo_minima: true, bloquea_desde: new Date(t).toISOString() })
      .eq("version", version).eq("es_minima", true).select("version");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ error: "NO_ES_LA_MINIMA" }, { status: 409 });
    // La fecha va a la bitácora: "desde cuándo dejaron de poder vender" es exactamente lo que se
    // pregunta después si un cliente reclama.
    extra.bloquea_desde = new Date(t).toISOString();
  } else if (accion === "no_bloquear") {
    const { error } = await sb.from("versiones_caja")
      .update({ bloquea_bajo_minima: false, bloquea_desde: null }).eq("version", version);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (accion === "despublicar" || accion === "publicar") {
    if (accion === "despublicar") {
      // Exigir una mínima que ya no se publica dejaría a las cajas viejas sin una versión a la
      // que subir. Se quita primero la mínima y luego se despublica.
      const { data } = await sb.from("versiones_caja").select("es_minima").eq("version", version).maybeSingle();
      if ((data as { es_minima: boolean } | null)?.es_minima) {
        return NextResponse.json({ error: "ES_LA_MINIMA" }, { status: 409 });
      }
    }
    const { error } = await sb.from("versiones_caja")
      .update({ publicada: accion === "publicar" }).eq("version", version);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "ACCION_DESCONOCIDA" }, { status: 400 });
  }

  await auditarTodos(sb, { accion: `version.${accion}`, motivo, payload: { version, ...extra } });
  return NextResponse.json({ ok: true });
}

/**
 * Publicar una versión o exigir una mínima afecta a TODOS los clientes, y
 * `super_admin_accesos.tenant_id` es NOT NULL, así que no cabe en una sola fila. Se asienta una
 * por cliente vivo — igual que los avisos globales — porque la pregunta que se hace después es
 * "¿a quién le llegó esto?".
 */
async function auditarTodos(
  sb: SbPlataforma,
  args: { accion: string; motivo: string; payload: Record<string, unknown> },
): Promise<void> {
  const { data } = await sb.from("tenants").select("id").is("deleted_at", null).neq("estado", "CANCELADO");
  for (const t of (data ?? []) as { id: string }[]) {
    await auditar(sb, { accion: args.accion, tenantId: t.id, motivo: args.motivo, payload: args.payload });
  }
}
