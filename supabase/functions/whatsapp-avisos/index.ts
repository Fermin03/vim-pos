// Avisos a Fermín por WhatsApp: los pendientes de wa_avisos_fermin (hand-offs del agente) en un solo
// mensaje. El horario (9:00 a 18:00 de México) lo pone la base: `sale_en` ya cae dentro de él.
//
//   POST /functions/v1/whatsapp-avisos   (x-vim-interno)
//        → lo llama pg_cron cada 5 minutos (wa_avisos_cron, migración 0286). La base solo devuelve
//          los avisos cuyo `sale_en` ya pasó. Lee, envía la plantilla `aviso_fermin` y marca los
//          que Meta aceptó. Si Meta rechaza el lote (4xx), reintenta uno por uno y marca también los
//          que rechaza solos (al log, para que uno malo no bloquee la cola). 5xx o red: nada se marca
//          y todo va en la siguiente vuelta (al menos una vez: puede repetir un aviso, nunca perderlo).
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
import { repartirAvisos } from "../_shared/whatsapp/avisos.ts";

const FN = "whatsapp-avisos";
const admin = clienteAdmin();
const texto = (cuerpo: string, status = 200): Response => new Response(cuerpo, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto("método no permitido", 405);

  const secreto = Deno.env.get("VIM_INTERNO_SECRET") ?? "";
  const fermin = (Deno.env.get("WA_NUMERO_FERMIN") ?? "").replace(/\D/g, "");
  if (!secreto || !fermin) return texto("no configurado", 503);
  if (!secretoInternoValido((req.headers.get("x-vim-interno") ?? "").trim(), secreto)) return texto("no autorizado", 401);

  const { data, error } = await admin.rpc("wa_avisos_por_enviar");
  if (error) { registrarError(FN, "LEER", error); return texto("error", 500); }
  const avisos = (data ?? []) as { id: string; conversacion_id: string | null; motivo: string; resumen: string }[];
  if (avisos.length === 0) return texto("sin avisos");

  const panel = (Deno.env.get("PLATFORM_APP_URL") ?? "https://platform.vimpos.com.mx").replace(/\/+$/, "");
  const { enviados, rechazados } = await repartirAvisos(avisos, panel, async (t) => {
    const r = await enviar(cuerpoPlantilla(fermin, "aviso_fermin", [t]));
    if (!r.ok) registrarError(FN, "ENVIAR", `HTTP ${r.status}: ${r.error}`);
    return r;
  });
  for (const id of rechazados) registrarError(FN, "RECHAZADO", `aviso ${id}: Meta lo rechazó; se marca para no bloquear la cola`);
  const ids = [...enviados, ...rechazados];
  if (ids.length === 0) return texto("no enviado", 502);

  const marcado = await admin.rpc("wa_marcar_avisos", { p_ids: ids });
  if (marcado.error) { registrarError(FN, "MARCAR", marcado.error); return texto("enviado, sin marcar", 500); }
  return texto(`enviados ${enviados.length}, rechazados ${rechazados.length}, pendientes ${avisos.length - ids.length}`);
});
