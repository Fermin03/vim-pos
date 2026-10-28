// Avisos de WhatsApp (Meta Cloud API) para el agente de ventas y soporte de VIM.
//
//   GET  /functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
//        → verificación de Meta: 200 con el challenge si el token coincide, 403 si no.
//   POST /functions/v1/whatsapp-webhook   (X-Hub-Signature-256)
//        → mensajes del cliente y ecos de lo que Fermín escribe desde la app del celular (pausan al
//          agente 12 h). Ambos se REGISTRAN antes de contestar: si la base falla, 500 y Meta
//          reintenta (el wamid lo hace idempotente). Solo el turno (Claude y envío) va en segundo
//          plano; Meta reintenta si tarda.
//
// Pública y sin JWT (config.toml). La firma es obligatoria: sin WA_APP_SECRET, 503; firma mala, 401.
// Directo de Meta (X-Hub-Signature-256, WA_APP_SECRET = clave secreta de la app) o reenviado por Kapso
// en modo «Meta webhook» (X-Webhook-Signature, WA_APP_SECRET = el secret_key de ese webhook).
// Tope por número: 30/hora y 100/día. Tope de gasto de IA del mes: WA_TOPE_USD (100 por defecto).
// Con WA_PHONE_NUMBER_ID se ignoran avisos de otro número; lo que escribe WA_NUMERO_FERMIN no se contesta.
//
// SECRETOS: WA_APP_SECRET, WA_VERIFY_TOKEN, WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION,
// WA_TOPE_USD, WA_NUMERO_FERMIN, ANTHROPIC_API_KEY; con Kapso, WA_KAPSO_API_KEY (y sobran WA_TOKEN
// y WA_VERIFY_TOKEN).
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupos, leerCuerpoAcotado } from "../_shared/limite.ts";
import { enSegundoPlano } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { firmaMetaValida, leerAviso } from "../_shared/whatsapp/aviso-meta.ts";
import { cuerpoTexto, enviar } from "../_shared/whatsapp/enviar.ts";
import { type Herramientas, responder } from "../_shared/agente/cerebro.ts";
import { atenderMensaje, type DepsTurno } from "../_shared/agente/turno.ts";
import { filaProspecto, sinNulos } from "../_shared/agente/prospecto.ts";

const FN = "whatsapp-webhook";
const admin = clienteAdmin();
const texto = (cuerpo: string, status: number): Response => new Response(cuerpo, { status });
const tope = Number(Deno.env.get("WA_TOPE_USD"));
const topeUsd = Number.isFinite(tope) && tope > 0 ? tope : 100; // vacío, no numérico o ≤ 0 → 100
const numeroFermin = Deno.env.get("WA_NUMERO_FERMIN") ?? "";
const numeroId = Deno.env.get("WA_PHONE_NUMBER_ID") || undefined;

/** Comparación sin atajos por longitud ni por primer byte distinto (token de verificación). */
function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// deno-lint-ignore no-explicit-any
const ok = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

function herramientas(conversacionId: string, waId: string): Herramientas {
  return {
    async guardarProspecto(d) {
      const fila = filaProspecto(d, waId);
      const { prospecto_id } = ok(await admin.from("wa_conversaciones").select("prospecto_id").eq("id", conversacionId).single());
      if (prospecto_id) {
        ok(await admin.from("prospectos").update(sinNulos(fila)).eq("id", prospecto_id));
      } else {
        const p = ok(await admin.from("prospectos").insert(fila).select("id").single());
        ok(await admin.from("wa_conversaciones").update({ prospecto_id: p.id }).eq("id", conversacionId));
      }
      return "Guardado.";
    },
    async pasarAFermin(d) {
      const sale = ok(await admin.rpc("wa_pasar_a_fermin", { p_conversacion_id: conversacionId, p_estado: d.estado, p_motivo: d.motivo, p_resumen: d.resumen })) as string;
      const hora = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(sale));
      return `Listo, un agente fue avisado; lo verá a partir de las ${hora}.`;
    },
    async anotarPregunta(pregunta) {
      ok(await admin.from("wa_preguntas").insert({ conversacion_id: conversacionId, pregunta }));
      return "Anotada.";
    },
  };
}

/** Cuántos mensajes de `autor` hay en la conversación (después de `desde`, si se da). */
async function contar(id: string, autor: "CLIENTE" | "AGENTE" | "FERMIN", desde?: string): Promise<number> {
  let q = admin.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", id).eq("autor", autor);
  if (desde) q = q.gt("creado_en", desde);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const deps = (waId: string): DepsTurno => ({
  rpc: (fn, args) => admin.rpc(fn, args),
  async leerConversacion(id) {
    const [msgs, conv, cfg, delAgente] = await Promise.all([
      admin.from("wa_mensajes").select("autor, texto").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(30),
      admin.from("wa_conversaciones").select("modelo").eq("id", id).single(),
      admin.from("wa_config").select("fundador_abierta").single(),
      contar(id, "AGENTE"),
    ]);
    return {
      historial: ok(msgs).reverse().map((m: { autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string | null }) => ({ autor: m.autor, texto: m.texto ?? "" })),
      modelo: ok(conv).modelo,
      fundadorAbierta: ok(cfg).fundador_abierta,
      nueva: delAgente === 0,
    };
  },
  responder,
  enviar: (to, t) => enviar(cuerpoTexto(to, t)),
  async cupo(to) {
    const r = await consumirCupos(admin, [
      { clave: "wa:h:" + to, ventanaSeg: 3600, max: 30 },
      { clave: "wa:d:" + to, ventanaSeg: 86400, max: 100 },
    ], "abrir");
    return r.permitido;
  },
  ferminEscribio: async (id, desde) => await contar(id, "FERMIN", desde.toISOString()) > 0,
  async hayMasNuevo(id, wamid) {
    const este = ok(await admin.from("wa_mensajes").select("creado_en").eq("wamid", wamid).single());
    return await contar(id, "CLIENTE", este.creado_en) > 0;
  },
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  numeroFermin,
  async guardarModelo(id, modelo) {
    ok(await admin.from("wa_conversaciones").update({ modelo }).eq("id", id));
  },
  herramientas: (id) => herramientas(id, waId),
  topeUsd,
});

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const token = Deno.env.get("WA_VERIFY_TOKEN") ?? "";
    if (!token) return texto("no configurado", 503);
    const q = new URL(req.url).searchParams;
    return q.get("hub.mode") === "subscribe" && iguales(q.get("hub.verify_token") ?? "", token)
      ? texto(q.get("hub.challenge") ?? "", 200)
      : texto("prohibido", 403);
  }
  if (req.method !== "POST") return texto("método no permitido", 405);

  const secreto = Deno.env.get("WA_APP_SECRET") ?? "";
  if (!secreto) return texto("no configurado", 503);
  const cuerpo = await leerCuerpoAcotado(req, 256_000);
  if (cuerpo === null) return texto("cuerpo demasiado grande", 413);
  // Meta firma en X-Hub-Signature-256 («sha256=<hex>»); Kapso reenvía el mismo aviso y firma el cuerpo
  // crudo en X-Webhook-Signature (el hex, sin prefijo) con el secreto que le pusimos.
  const kapso = req.headers.get("x-webhook-signature");
  const firma = req.headers.get("x-hub-signature-256") ?? (kapso ? `sha256=${kapso}` : null);
  if (!await firmaMetaValida(cuerpo, firma, secreto)) return texto("firma inválida", 401);

  let json: unknown = null;
  try { json = JSON.parse(cuerpo); } catch { /* leerAviso ignora lo que no entiende */ }
  // Registrar va ANTES del 200: si la base falla, 500 y Meta reintenta todo el aviso (los wamid ya
  // guardados vuelven como duplicados y no se contestan dos veces). Un eco con el wamid de algo que
  // ya mandó el agente no se registra ni pausa (wa_registrar_salida devuelve false).
  try {
    for (const e of leerAviso(json, numeroId)) {
      if (e.tipo === "eco") {
        const id = ok(await admin.rpc("wa_conversacion_de", { p_wa_id: e.waId })) as string;
        ok(await admin.rpc("wa_registrar_salida", { p_conversacion_id: id, p_wamid: e.wamid, p_autor: "FERMIN", p_texto: e.texto }));
      } else {
        const r = ok(await admin.rpc("wa_registrar_entrante", { p_wa_id: e.waId, p_wamid: e.wamid, p_nombre: e.nombre, p_texto: e.texto }));
        enSegundoPlano(atenderMensaje(e, r, deps(e.waId)).catch((err) => registrarError(FN, "TURNO", err)));
      }
    }
  } catch (err) {
    registrarError(FN, "REGISTRO", err);
    return texto("error", 500);
  }
  return texto("ok", 200);
});
