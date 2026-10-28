// Revisor nocturno del agente de WhatsApp: lee las conversaciones de las últimas 24 h, le pide a
// Claude Sonnet hasta 5 propuestas de lección y las guarda como PENDIENTE en wa_lecciones. A Fermín
// le llegan a las 9:00 con el aviso «N lecciones nuevas»; nada se usa sin que él lo apruebe.
//
//   POST /functions/v1/whatsapp-aprender   (x-vim-interno)
//        → lo llama pg_cron a las 2:00 de México (wa_aprender_cron, migración 0287), que antes
//          caduca las lecciones sin contestar en 3 días. Responde `propuestas N` en texto plano.
//
// La conversación de Fermín (WA_NUMERO_FERMIN) nunca se revisa. Si el revisor falla, no se inserta
// nada y se responde `propuestas 0`: mañana vuelve a intentarlo con otras 24 h.
//
// Sin JWT (config.toml): la autenticidad la da `x-vim-interno`. Sin VIM_INTERNO_SECRET o sin
// WA_NUMERO_FERMIN, 503.
//
// SECRETOS: VIM_INTERNO_SECRET, WA_NUMERO_FERMIN (solo dígitos, con lada), ANTHROPIC_API_KEY.
import { clienteAdmin } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { CONOCIMIENTO, FUNDADOR } from "../_shared/agente/conocimiento.gen.ts";
import { diez } from "../_shared/agente/turno.ts";
import { bloqueAprendido } from "../_shared/agente/lecciones/bloque.ts";
import { proponer } from "../_shared/agente/lecciones/revisor.ts";

const FN = "whatsapp-aprender";
const admin = clienteAdmin();
const texto = (cuerpo: string, status = 200): Response => new Response(cuerpo, { status });
type Fila = Record<string, string | boolean | null>; // filas de supabase-js sin tipos generados
const filas = (r: { data: unknown }): Fila[] => (r.data ?? []) as Fila[];
const MAX_TEXTO = 120_000; // caracteres de conversaciones que se le mandan al revisor

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto("método no permitido", 405);

  const secreto = Deno.env.get("VIM_INTERNO_SECRET") ?? "";
  const fermin = (Deno.env.get("WA_NUMERO_FERMIN") ?? "").replace(/\D/g, "");
  if (!secreto || !fermin) return texto("no configurado", 503);
  if (!secretoInternoValido((req.headers.get("x-vim-interno") ?? "").trim(), secreto)) return texto("no autorizado", 401);

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [convs, lecciones] = await Promise.all([
    admin.from("wa_conversaciones").select("id, wa_id, estado, resumen").gte("ultimo_mensaje_en", desde).order("ultimo_mensaje_en", { ascending: false }).limit(200),
    admin.from("wa_lecciones").select("tipo, comercial, pregunta, texto, estado, creado_en, decidido_en").in("estado", ["APROBADA", "PENDIENTE", "ENVIADA"]).order("creado_en", { ascending: false }).limit(300),
  ]);
  if (convs.error || lecciones.error) { registrarError(FN, "LEER", convs.error ?? lecciones.error); return texto("error", 500); }

  const ids = filas(convs).filter((c) => diez(c.wa_id as string) !== diez(fermin)).map((c) => c.id as string);
  if (ids.length === 0) return texto("propuestas 0");
  const [msgs, avisos, preguntas] = await Promise.all([
    admin.from("wa_mensajes").select("conversacion_id, autor, texto").in("conversacion_id", ids).gte("creado_en", desde).order("creado_en", { ascending: true }).limit(3000),
    admin.from("wa_avisos_fermin").select("conversacion_id, motivo, resumen").in("conversacion_id", ids).gte("sale_en", desde),
    admin.from("wa_preguntas").select("conversacion_id, pregunta").in("conversacion_id", ids).gte("creado_en", desde),
  ]);
  if (msgs.error || avisos.error || preguntas.error) { registrarError(FN, "LEER", msgs.error ?? avisos.error ?? preguntas.error); return texto("error", 500); }

  // Sin teléfonos ni nombres de perfil: la conversación se identifica solo por su id.
  let conversaciones = "";
  for (const c of filas(convs).filter((c) => ids.includes(c.id as string))) {
    const lineas = filas(msgs).filter((m) => m.conversacion_id === c.id && m.texto).map((m) => `${m.autor}: ${m.texto}`);
    if (lineas.length === 0) continue;
    const pases = filas(avisos).filter((a) => a.conversacion_id === c.id).map((a) => `Pasó a Fermín (${a.motivo}): ${a.resumen}`);
    conversaciones += `\n[${c.id}] estado ${c.estado}\n${[...lineas, ...pases].join("\n")}\n`;
  }
  if (conversaciones.length > MAX_TEXTO) conversaciones = conversaciones.slice(0, MAX_TEXTO);
  const sinResponder = filas(preguntas).map((p) => `[${p.conversacion_id}] ${p.pregunta}`);
  if (!conversaciones.trim()) return texto("propuestas 0");
  conversaciones = `CONVERSACIONES DE LAS ÚLTIMAS 24 HORAS:\n${conversaciones}\nPREGUNTAS SIN RESPONDER:\n${sinResponder.join("\n") || "(ninguna)"}`;

  // Lo aprobado (con su encabezado) más lo ya propuesto y sin decidir, para no repetir.
  const todas = filas(lecciones);
  const pendientes = todas.filter((l) => l.estado !== "APROBADA");
  const aprendido = [
    bloqueAprendido(todas.filter((l) => l.estado === "APROBADA") as unknown as Parameters<typeof bloqueAprendido>[0]),
    pendientes.length ? "YA PROPUESTAS, PENDIENTES DE QUE FERMÍN DECIDA:\n" + pendientes.map((l) => `- ${l.pregunta ?? "Tono"}: ${l.texto}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const propuestas = await proponer(conversaciones, { conocimiento: CONOCIMIENTO + "\n\n" + FUNDADOR, aprendido }, Deno.env.get("ANTHROPIC_API_KEY") ?? "");
  if (propuestas.length === 0) return texto("propuestas 0");

  // Un id inventado por el modelo violaría la llave foránea: solo valen los que se le mostraron.
  const nuevas = propuestas.map((p) => ({ ...p, conversacion_id: p.conversacion_id && ids.includes(p.conversacion_id) ? p.conversacion_id : null }));
  const ins = await admin.from("wa_lecciones").insert(nuevas);
  if (ins.error) { registrarError(FN, "INSERTAR", ins.error); return texto("error", 500); }

  // El aviso de las 9:00, salvo que ya haya lecciones enviadas sin contestar (no se insiste).
  if (!todas.some((l) => l.estado === "ENVIADA")) {
    const horario = await admin.rpc("wa_siguiente_horario", { p_ts: new Date().toISOString() });
    if (horario.error) registrarError(FN, "HORARIO", horario.error);
    const n = nuevas.length;
    const aviso = await admin.from("wa_avisos_fermin").insert({
      conversacion_id: null,
      motivo: "Lecciones",
      resumen: n === 1 ? "1 lección nueva del asistente; responde VER para verla" : `${n} lecciones nuevas del asistente; responde VER para verlas`,
      sale_en: horario.error ? new Date().toISOString() : horario.data,
    });
    if (aviso.error) registrarError(FN, "AVISO", aviso.error);
  }
  return texto(`propuestas ${nuevas.length}`);
});
