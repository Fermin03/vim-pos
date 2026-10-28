// Avisos a Fermín por WhatsApp: los pendientes de wa_avisos_fermin (hand-offs del agente) en un solo
// mensaje, solo entre 9:00 y 18:00 hora de Ciudad de México.
//
//   POST /functions/v1/whatsapp-avisos   (x-vim-interno)
//        → lo llama pg_cron cada 5 minutos (wa_avisos_cron, migración 0286). La base solo devuelve
//          los avisos cuyo `sale_en` ya pasó. Lee, envía la plantilla `aviso_fermin` y marca como
//          enviados solo si Meta contestó ok; si no, los deja para la siguiente vuelta (al menos una
//          vez: un fallo entre el envío y el marcado puede repetir el aviso, nunca perderlo).
//
// Sin JWT (config.toml): la autenticidad la da `x-vim-interno`. Sin VIM_INTERNO_SECRET o sin
// WA_NUMERO_FERMIN, 503. Respuestas en texto plano.
//
// SECRETOS: VIM_INTERNO_SECRET, WA_NUMERO_FERMIN (solo dígitos, con lada: 5214771234567),
// PLATFORM_APP_URL (base de los enlaces al panel), WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION.
import { clienteAdmin } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { cuerpoPlantilla, enviar } from "../_shared/whatsapp/enviar.ts";
import { enHorario, textoDeAvisos } from "../_shared/whatsapp/avisos.ts";

const FN = "whatsapp-avisos";
const admin = clienteAdmin();
const texto = (cuerpo: string, status = 200): Response => new Response(cuerpo, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto("método no permitido", 405);

  const secreto = Deno.env.get("VIM_INTERNO_SECRET") ?? "";
  const fermin = (Deno.env.get("WA_NUMERO_FERMIN") ?? "").replace(/\D/g, "");
  if (!secreto || !fermin) return texto("no configurado", 503);
  if (!secretoInternoValido((req.headers.get("x-vim-interno") ?? "").trim(), secreto)) return texto("no autorizado", 401);

  if (!enHorario(new Date())) return texto("fuera de horario");

  const { data, error } = await admin.rpc("wa_avisos_por_enviar");
  if (error) { registrarError(FN, "LEER", error); return texto("error", 500); }
  const avisos = (data ?? []) as { id: string; conversacion_id: string | null; motivo: string; resumen: string }[];
  if (avisos.length === 0) return texto("sin avisos");

  const panel = (Deno.env.get("PLATFORM_APP_URL") ?? "https://platform.vimpos.com.mx").replace(/\/+$/, "");
  const r = await enviar(cuerpoPlantilla(fermin, "aviso_fermin", [textoDeAvisos(avisos, panel)]));
  if (!r.ok) { registrarError(FN, "ENVIAR", r.error); return texto("no enviado", 502); }

  const marcado = await admin.rpc("wa_marcar_avisos", { p_ids: avisos.map((a) => a.id) });
  if (marcado.error) { registrarError(FN, "MARCAR", marcado.error); return texto("enviado, sin marcar", 500); }
  return texto(`enviados ${avisos.length}`);
});
