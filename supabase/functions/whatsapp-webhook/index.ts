// Avisos de WhatsApp (Meta Cloud API) para el agente de ventas y soporte de VIM.
//
//   GET  /functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
//        → verificación de Meta: 200 con el challenge si el token coincide, 403 si no.
//   POST /functions/v1/whatsapp-webhook   (X-Hub-Signature-256)
//        → mensajes del cliente (corre un turno del agente en segundo plano) y ecos de lo que
//          Fermín escribe desde la app del celular (pausan al agente 12 h). Contesta 200 "ok" al
//          instante: Meta reintenta si tarda.
//
// Pública y sin JWT (config.toml). La firma es obligatoria: sin WA_APP_SECRET, 503; firma mala, 401.
// Tope por número: 30/hora y 100/día. Tope de gasto de IA del mes: WA_TOPE_USD (100 por defecto).
//
// SECRETOS: WA_APP_SECRET, WA_VERIFY_TOKEN, WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION,
// WA_TOPE_USD, ANTHROPIC_API_KEY.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupos, leerCuerpoAcotado } from "../_shared/limite.ts";
import { enSegundoPlano } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { firmaMetaValida, leerAviso } from "../_shared/whatsapp/aviso-meta.ts";
import { cuerpoTexto, enviar } from "../_shared/whatsapp/enviar.ts";
import { type Herramientas, responder } from "../_shared/agente/cerebro.ts";
import { atenderMensaje, type DepsTurno } from "../_shared/agente/turno.ts";

const FN = "whatsapp-webhook";
const admin = clienteAdmin();
const texto = (cuerpo: string, status: number): Response => new Response(cuerpo, { status });
const tope = Number(Deno.env.get("WA_TOPE_USD"));
const topeUsd = Number.isFinite(tope) && tope > 0 ? tope : 100; // vacío, no numérico o ≤ 0 → 100

/** Comparación sin atajos por longitud ni por primer byte distinto (token de verificación). */
function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// Lista vigente del CHECK prospectos_giro_check: supabase/migrations/0229_prospectos_belleza.sql.
// Si una migración nueva la amplía, se amplía aquí.
const GIROS = [
  "FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE", "BAR", "CAFETERIA", "TAQUERIA", "RETAIL",
  "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS", "SALON", "SPA", "PELUQUERIA", "BARBERIA", "TATUAJES",
];

// deno-lint-ignore no-explicit-any
const ok = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

function herramientas(conversacionId: string, waId: string): Herramientas {
  return {
    async guardarProspecto(d) {
      const giro = d.giro?.toUpperCase() ?? null;
      const giroValido = giro !== null && GIROS.includes(giro);
      const fila = {
        nombre: d.nombre.trim().slice(0, 120), negocio: d.negocio.trim().slice(0, 150), cajas: d.cajas, sucursales: d.sucursales,
        whatsapp: waId.replace(/\D/g, "").slice(-10), origen: "whatsapp",
        giro: giroValido ? giro : null,
        // Un giro fuera de la lista del CHECK (y la ciudad) viajan en el mensaje.
        mensaje: [d.mensaje, d.giro && !giroValido ? `Giro: ${d.giro}` : null, d.ciudad ? `Ciudad: ${d.ciudad}` : null]
          .filter(Boolean).join(". ").slice(0, 1000) || null,
      };
      const { prospecto_id } = ok(await admin.from("wa_conversaciones").select("prospecto_id").eq("id", conversacionId).single());
      if (prospecto_id) {
        ok(await admin.from("prospectos").update(fila).eq("id", prospecto_id));
      } else {
        const p = ok(await admin.from("prospectos").insert(fila).select("id").single());
        ok(await admin.from("wa_conversaciones").update({ prospecto_id: p.id }).eq("id", conversacionId));
      }
      return "Guardado.";
    },
    async pasarAFermin(d) {
      const sale = ok(await admin.rpc("wa_pasar_a_fermin", { p_conversacion_id: conversacionId, p_estado: d.estado, p_motivo: d.motivo, p_resumen: d.resumen })) as string;
      const hora = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(sale));
      return `Listo, Fermín ya fue avisado; sale a las ${hora}.`;
    },
    async anotarPregunta(pregunta) {
      ok(await admin.from("wa_preguntas").insert({ conversacion_id: conversacionId, pregunta }));
      return "Anotada.";
    },
  };
}

const deps = (waId: string): DepsTurno => ({
  rpc: (fn, args) => admin.rpc(fn, args),
  async leerConversacion(id) {
    const [msgs, conv, cfg] = await Promise.all([
      admin.from("wa_mensajes").select("autor, texto").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(30),
      admin.from("wa_conversaciones").select("modelo").eq("id", id).single(),
      admin.from("wa_config").select("fundador_abierta").single(),
    ]);
    return {
      historial: ok(msgs).reverse().map((m: { autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string | null }) => ({ autor: m.autor, texto: m.texto ?? "" })),
      modelo: ok(conv).modelo,
      fundadorAbierta: ok(cfg).fundador_abierta,
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
  async ferminEscribio(id, desde) {
    const { count, error } = await admin.from("wa_mensajes").select("id", { count: "exact", head: true })
      .eq("conversacion_id", id).eq("autor", "FERMIN").gt("creado_en", desde.toISOString());
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  },
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
  if (!await firmaMetaValida(cuerpo, req.headers.get("x-hub-signature-256"), secreto)) return texto("firma inválida", 401);

  let json: unknown = null;
  try { json = JSON.parse(cuerpo); } catch { /* leerAviso ignora lo que no entiende */ }
  for (const e of leerAviso(json)) {
    if (e.tipo === "eco") {
      enSegundoPlano((async () => {
        const id = ok(await admin.rpc("wa_conversacion_de", { p_wa_id: e.waId })) as string;
        ok(await admin.rpc("wa_registrar_salida", { p_conversacion_id: id, p_wamid: e.wamid, p_autor: "FERMIN", p_texto: e.texto }));
      })().catch((err) => registrarError(FN, "ECO", err)));
    } else {
      enSegundoPlano(atenderMensaje(e, deps(e.waId)).catch((err) => registrarError(FN, "TURNO", err)));
    }
  }
  return texto("ok", 200);
});
