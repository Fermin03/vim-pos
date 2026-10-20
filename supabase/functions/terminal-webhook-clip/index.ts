// Avisos de Clip PinPad. Pública y sin JWT, y Clip no firma: el aviso solo dice «algo cambió»
// (`{ id, origin, event_type }`). Por eso nunca se cree lo que trae: el cobro se toma de `?c=` (lo
// puso terminal-cobro en la `webhook_url`) y su estado se pregunta SIEMPRE a Clip con la credencial
// de la conexión. Un aviso falso solo cuesta una consulta, con tope por cobro.
//
// Respuestas: 200 en todo lo que se ignora (Clip no tiene nada que reintentar) y 500 solo si falla
// nuestra base. SIN VERIFICAR: que Clip reintente ante un 500, cuántas veces y qué espera de vuelta.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupo, leerCuerpoAcotado } from "../_shared/limite.ts";
import { registrarError } from "../_shared/errores.ts";
import { clienteClip, datosDeIntencion } from "../_shared/terminal/clip.ts";
import { aceptaCambio, cambiosDeCobro, type EstadoCobro, obj, txt } from "../_shared/terminal/comun.ts";
import { ESPERA_CLIP } from "../_shared/terminal/proveedor.ts";

const admin = clienteAdmin();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = () => new Response("", { status: 200 });

type Cobro = { estado: EstadoCobro; conexion_id: string; orden_id_externo: string | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const texto = await leerCuerpoAcotado(req, 64 * 1024);
  if (texto === null) return new Response("payload too large", { status: 413 });
  const c = new URL(req.url).searchParams.get("c");
  if (!c || !UUID.test(c)) return ok();
  const cobroId = c.toLowerCase();

  // Del cuerpo solo se guardan el id y el tipo de evento, recortados.
  let aviso: Record<string, unknown> = {};
  try { aviso = obj(JSON.parse(texto)); } catch { /* cuerpo no JSON: igual se consulta */ }
  const evento = { id: txt(aviso.id)?.slice(0, 100) ?? null, event_type: txt(aviso.event_type)?.slice(0, 64) ?? null };

  let error: string | null = null;
  let ordenId: string | null = null;
  try {
    const { data: fila, error: eCobro } = await admin.from("terminal_cobros").select("estado, conexion_id, orden_id_externo")
      .eq("id", cobroId).maybeSingle();
    if (eCobro) throw eCobro;
    const cobro = fila as Cobro | null;
    if (!cobro?.orden_id_externo) return ok();
    const { data: cx, error: eCx } = await admin.from("terminal_conexiones").select("proveedor").eq("id", cobro.conexion_id).maybeSingle();
    if (eCx) throw eCx;
    if ((cx as { proveedor: string } | null)?.proveedor !== "CLIP") return ok();
    ordenId = cobro.orden_id_externo;

    const cupo = await consumirCupo(admin, { clave: `clip:aviso:${cobroId}`, ventanaSeg: 60, max: 20 }, "cerrar");
    if (!cupo.permitido) return ok();

    const { data: tk, error: eTk } = await admin.rpc("terminal_leer_tokens", { p_conexion: cobro.conexion_id });
    if (eTk) throw eTk;
    const t = (tk as { access_token: string | null; refresh_token: string | null }[] | null)?.[0];
    if (!t?.access_token || !t.refresh_token) error = "conexión sin credencial";
    else {
      const r = await clienteClip(t.access_token, t.refresh_token, fetch, ESPERA_CLIP.resto).consultar(ordenId);
      const d = r.status === 200 ? datosDeIntencion(r.cuerpo) : null;
      if (!d) {
        registrarError("terminal-webhook-clip", "CONSULTAR", `HTTP ${r.status} ${r.codigo ?? ""}`);
        error = "la consulta a Clip falló";
      } else if (d.cobro_id?.toLowerCase() !== cobroId || d.orden_id_externo !== ordenId) error = "la intención no es de este cobro";
      else if (!aceptaCambio(cobro.estado, d.estado)) error = "llegó tarde: el cobro ya tenía un estado final";
      else {
        const { error: eUp } = await admin.from("terminal_cobros").update(cambiosDeCobro(d)).eq("id", cobroId);
        if (eUp) throw eUp;
      }
    }
  } catch (causa) {
    registrarError("terminal-webhook-clip", "ERROR_INTERNO", causa);
    return new Response("error", { status: 500 }); // SIN VERIFICAR que Clip reintente
  }

  await admin.from("terminal_eventos").insert({
    orden_id_externo: ordenId, accion: evento.event_type ?? "aviso_clip", cobro_id: cobroId, payload: evento,
    procesado_at: error ? null : new Date().toISOString(), error,
  });
  return ok();
});
