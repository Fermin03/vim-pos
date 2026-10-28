// Revisor nocturno del agente de WhatsApp: lee las conversaciones de las últimas 24 h, le pide a
// Claude Sonnet hasta 5 propuestas de lección y las guarda como PENDIENTE en wa_lecciones. A Fermín
// le llegan a las 9:00 con el aviso «N lecciones nuevas»; nada se usa sin que él lo apruebe.
//
//   POST /functions/v1/whatsapp-aprender   (x-vim-interno)
//        → lo llama pg_cron a las 2:00 de México (wa_aprender_cron, migración 0287), que antes
//          caduca las lecciones sin contestar en 3 días. Responde `propuestas N` en texto plano.
//
// La conversación de Fermín (WA_NUMERO_FERMIN) nunca se revisa. Si el revisor falla, no se inserta
// nada y se responde `propuestas 0`: mañana vuelve a intentarlo con otras 24 h. Entre corridas del
// mismo día el tope de 5 se comparte: lo creado desde las 00:00 (México) descuenta del cupo.
//
// Sin JWT (config.toml): la autenticidad la da `x-vim-interno`. Sin VIM_INTERNO_SECRET o sin
// WA_NUMERO_FERMIN, 503.
//
// SECRETOS: VIM_INTERNO_SECRET, WA_NUMERO_FERMIN (solo dígitos, con lada), ANTHROPIC_API_KEY.
import { clienteAdmin } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { CONOCIMIENTO, FUNDADOR, REGLAS } from "../_shared/agente/conocimiento.gen.ts";
import { mismoNumero } from "../_shared/agente/turno.ts";
import { inicioDelDiaMX, lineaMensaje, loQueYaSabe, proponer } from "../_shared/agente/lecciones/revisor.ts";

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
  // Tope de 5 por día calendario de México entre corridas: lo propuesto hoy descuenta (la ventana de actividad sí es de 24 h).
  const hoy = await admin.from("wa_lecciones").select("id", { count: "exact", head: true }).gte("creado_en", inicioDelDiaMX());
  if (hoy.error) { registrarError(FN, "LEER", hoy.error); return texto("error", 500); }
  const cupo = 5 - (hoy.count ?? 0);
  if (cupo <= 0) return texto("propuestas 0");

  // Las descartadas y caducadas de los últimos 30 días también, para que no las vuelva a proponer (fecha sola: sin «:» ni «.» en el filtro).
  const hace30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [convs, lecciones] = await Promise.all([
    admin.from("wa_conversaciones").select("id, wa_id, estado").gte("ultimo_mensaje_en", desde).order("ultimo_mensaje_en", { ascending: false }).limit(100),
    admin.from("wa_lecciones").select("tipo, comercial, pregunta, texto, estado, creado_en, decidido_en")
      .or(`estado.in.(APROBADA,PENDIENTE,ENVIADA),and(estado.in.(DESCARTADA,CADUCADA),decidido_en.gte.${hace30})`)
      .order("creado_en", { ascending: false }).limit(300),
  ]);
  if (convs.error || lecciones.error) { registrarError(FN, "LEER", convs.error ?? lecciones.error); return texto("error", 500); }

  const activas = filas(convs).filter((c) => !mismoNumero(c.wa_id as string, fermin));
  const ids = activas.map((c) => c.id as string);
  if (ids.length === 0) return texto("propuestas 0");
  // Los últimos 30 mensajes de cada conversación activa, sea cual sea su fecha (el contexto de una duda puede ser de antier).
  const [hilos, avisos, preguntas] = await Promise.all([
    Promise.all(ids.map((id) => admin.from("wa_mensajes").select("autor, texto").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(30))),
    admin.from("wa_avisos_fermin").select("conversacion_id, motivo, resumen").in("conversacion_id", ids).gte("sale_en", desde),
    admin.from("wa_preguntas").select("conversacion_id, pregunta").in("conversacion_id", ids).gte("creado_en", desde),
  ]);
  const malo = hilos.find((h) => h.error)?.error ?? avisos.error ?? preguntas.error;
  if (malo) { registrarError(FN, "LEER", malo); return texto("error", 500); }

  // Sin teléfonos ni nombres de perfil: la conversación se identifica solo por su id. Todo texto libre
  // va en una sola línea (lineaMensaje): un cliente no puede fingir líneas de Fermín ni encabezados.
  let conversaciones = "";
  activas.forEach((c, i) => {
    const lineas = filas(hilos[i]).reverse().filter((m) => m.texto).map((m) => lineaMensaje(String(m.autor), String(m.texto)));
    if (lineas.length === 0) return;
    const pases = filas(avisos).filter((a) => a.conversacion_id === c.id).map((a) => lineaMensaje(`PASÓ A FERMÍN (${a.motivo})`, String(a.resumen ?? "")));
    conversaciones += `\n[${c.id}] estado ${c.estado}\n${[...lineas, ...pases].join("\n")}\n`;
  });
  if (conversaciones.length > MAX_TEXTO) conversaciones = conversaciones.slice(0, MAX_TEXTO);
  const sinResponder = filas(preguntas).map((p) => lineaMensaje(`[${p.conversacion_id}]`, String(p.pregunta)));
  if (!conversaciones.trim()) return texto("propuestas 0");
  conversaciones = `CONVERSACIONES (últimos mensajes de las que tuvieron actividad en las últimas 24 horas):\n${conversaciones}\nPREGUNTAS SIN RESPONDER:\n${sinResponder.join("\n") || "(ninguna)"}`;

  // Lo aprobado (con su encabezado), lo ya propuesto sin decidir y lo descartado, para no repetir.
  const todas = filas(lecciones);
  const aprendido = loQueYaSabe(todas as unknown as Parameters<typeof loQueYaSabe>[0]);

  const propuestas = await proponer(conversaciones, { conocimiento: CONOCIMIENTO + "\n\n" + FUNDADOR, aprendido, reglas: REGLAS }, Deno.env.get("ANTHROPIC_API_KEY") ?? "", fetch, cupo);
  if (propuestas.length === 0) return texto("propuestas 0");

  // Un id inventado por el modelo violaría la llave foránea: solo valen los que se le mostraron.
  const nuevas = propuestas.map((p) => ({ ...p, conversacion_id: p.conversacion_id && ids.includes(p.conversacion_id) ? p.conversacion_id : null }));
  const ins = await admin.from("wa_lecciones").insert(nuevas);
  if (ins.error) { registrarError(FN, "INSERTAR", ins.error); return texto("error", 500); }

  // El aviso de las 9:00, salvo que ya haya lecciones enviadas sin contestar o un aviso de lecciones sin salir (no se insiste).
  const avisoPuesto = await admin.from("wa_avisos_fermin").select("id").eq("motivo", "Lecciones").is("enviado_en", null).limit(1);
  if (avisoPuesto.error) registrarError(FN, "AVISO", avisoPuesto.error);
  if (!todas.some((l) => l.estado === "ENVIADA") && !avisoPuesto.error && filas(avisoPuesto).length === 0) {
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
