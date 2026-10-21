// Manda los correos de estado de los pedidos de la tienda en línea (0176): «en preparación»,
// «listo para recoger» / «en camino», «cancelado» y «te devolvimos tu pago».
//
//   POST /functions/v1/tienda-correos      x-vim-interno: <VIM_INTERNO_SECRET>
//
// SOLO la llama la base: `tienda_correos_barrer` (pg_cron, cada minuto) cuando hay correos por
// mandar, con pg_net y los secretos de Vault, igual que el barrido de pagos llama a
// tienda-webhook-mp. Sin JWT (config.toml) y sin el secreto, 401. Contesta 202 y manda en segundo
// plano: pg_net no espera más de 5 s.
//
// Aquí no se decide nada: qué correo toca, cuántos caben por hora, cuándo caduca uno y cuándo se
// rinde lo decide la base (tienda_correos_tomar / tienda_correo_resultado); qué dice cada uno y
// cuál ya no corresponde, _shared/tienda/correo-estado.ts. El enlace es el mismo del correo de
// confirmación: el código de seguimiento que `tienda` dejó cifrado (_shared/tienda/enlace.ts).
//
// EN EL LOG: el id del renglón de la cola y un código. Nunca el correo del cliente, su nombre, el
// código de seguimiento ni el motivo de SMTP (puede traer la dirección).
//
// SECRETOS: VIM_INTERNO_SECRET, VIM_SMTP_*, VIM_TIENDA_URL y VIM_TIENDA_SECRET (para el enlace; sin
// ellos el correo sale sin botón) y, opcional, VIM_CORREOS_ESTADO_POR_HORA (30 si no está).
import { clienteAdmin } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { type Deps, mandarCorreosDeEstado, type Pendiente, topePorHora } from "../_shared/tienda/correo-estado.ts";
import { descifrarCodigo } from "../_shared/tienda/enlace.ts";

const FN = "tienda-correos";
const admin = clienteAdmin();
const rpc = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
  const r = await admin.rpc(fn, args);
  if (r.error) { registrarError(FN, fn.toUpperCase(), r.error); throw new Error(r.error.message); }
  return r.data;
};

const deps: Deps = {
  tomar: async (max, topeHora) => (await rpc("tienda_correos_tomar", { p_max: max, p_tope_hora: topeHora }) as Pendiente[] | null) ?? [],
  seguimiento: (tenant, huella) => rpc("tienda_seguimiento", { p_tenant: tenant, p_seguimiento_hash: huella }),
  descifrar: (cifrado, huella) => descifrarCodigo((Deno.env.get("VIM_TIENDA_SECRET") ?? "").trim(), cifrado, huella),
  enviar: enviarCorreo,
  resultado: async (id, r) => (await rpc("tienda_correo_resultado", { p_id: id, p_resultado: r })) as string | null,
  alMorir: (id) => registrarError(FN, "CORREO_MUERTO", `renglón ${id} de tienda_correos`),
  base: (Deno.env.get("VIM_TIENDA_URL") ?? "").replace(/\/+$/, ""),
  topeHora: topePorHora(Deno.env.get("VIM_CORREOS_ESTADO_POR_HORA")),
};

Deno.serve((req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const interno = (req.headers.get("x-vim-interno") ?? "").trim();
  if (!secretoInternoValido(interno, (Deno.env.get("VIM_INTERNO_SECRET") ?? "").trim())) return new Response("unauthorized", { status: 401 });
  enSegundoPlano(mandarCorreosDeEstado(deps)
    .then((c) => { if (c.FALLO > 0) console.warn(`[${FN}] ${c.FALLO} correo(s) no salieron; se reintentan.`); })
    .catch((e) => registrarError(FN, "BARRIDO", e)));
  return new Response("", { status: 202 });
});
