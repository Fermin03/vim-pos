// Edge Function: tienda — la puerta de la tienda en línea (entrega 2; diseño §7 y §10).
//
//   POST /functions/v1/tienda     x-vim-tienda: <VIM_TIENDA_SECRET>     x-tienda-ip: <IP del cliente>
//   { accion: "negocio" | "menu" | "cotizar" | "pedir" | "seguimiento", negocio: <slug>, … }
//
// QUIÉN LA LLAMA
//   Solo el servidor de la tienda (pedidos.vimpos.com.mx). El navegador del cliente, nunca.
//
// POR QUÉ NO HAY CORS
//   Porque ningún navegador tiene que llegar aquí. No se usa `servir()` de _shared/http.ts (añade
//   las cabeceras CORS de las apps y no atrapa excepciones): `OPTIONS` es un método más y recibe el
//   mismo 405 que un GET, sin `Access-Control-Allow-*`, así que un preflight no pasa desde ningún origen.
//
// POR QUÉ EXIGE EL SECRETO
//   Esta función usa service_role y crea pedidos sin sesión. Sin el secreto, cualquiera con la URL
//   podría recorrer menús y llenar de pedidos a un negocio escribiendo la IP que quisiera en
//   `x-tienda-ip` (que es de donde salen los cupos y lo que se le dice a Turnstile). El secreto
//   prueba que quien llama es nuestro servidor, el único que conoce la IP real; por eso esa cabecera
//   se lee DESPUÉS de comprobarlo y nunca de `x-forwarded-for`. Sin `VIM_TIENDA_SECRET` configurado
//   todo es 401: una función abierta por un secreto que se cayó sería peor que una caída.
//
// LO QUE NUNCA SALE NI SE ESCRIBE
//   · En una respuesta: `tenant_id`, los `items` normalizados de la cotización, el texto de un
//     error de la base, el secreto. Las reglas de qué sale están en _shared/tienda/respuesta.ts,
//     que sí se prueba; este archivo no (Deno.serve y la base).
//   · En el log: el cuerpo, el código de seguimiento, el secreto, el token del captcha. (El slug
//     del negocio sí puede ir: no es dato personal.)
//   · El código de seguimiento existe en la respuesta de `pedir` y en el correo. En la base, su huella.
//
// El negocio sale SIEMPRE del slug (`tienda_negocio`), nunca de un id que mande quien llama, y toda
// RPC va acotada a ese tenant. La lógica (precios, horario, topes) vive en las funciones SQL de 0162.
//
// SECRETOS: VIM_TIENDA_SECRET, VIM_TIENDA_URL (base de los enlaces del correo), TURNSTILE_SECRET_KEY,
// TURNSTILE_HOSTNAMES (tiene que incluir el dominio de la tienda), CAPTCHA_OPCIONAL (solo local),
// VIM_SMTP_*.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupos, leerCuerpoAcotado, type ResultadoCupo } from "../_shared/limite.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { hostnamesPermitidos, verificarTurnstile } from "../_shared/turnstile.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { leerCuerpo, tieneNul } from "../_shared/tienda/validar.ts";
import { huellaDe, nuevoCodigo } from "../_shared/tienda/seguimiento.ts";
import { correoDePedido } from "../_shared/tienda/correo-pedido.ts";
import { cotizacionPublica, cuposDe, ipDeConfianza, leerNegocio, leerPedido, respuestaDeCaptcha, respuestaDeRpc } from "../_shared/tienda/respuesta.ts";

const MAX_CUERPO = 32_768;

// Propio, y no el de `servir()`: aquel lleva las cabeceras CORS. `no-store`: la respuesta de
// `pedir` trae el código de seguimiento y ningún intermediario tiene por qué guardarla.
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * Una RPC devolvió error. Rechazo de negocio (`CODIGO: detalle`) → 409 con el código; cualquier
 * otra cosa → 503 y al log. El texto de la base no sale nunca (respuestaDeRpc).
 */
function rechazo(rpc: string, error: { message: string }): Response {
  const r = respuestaDeRpc(error.message);
  if (r.status === 503) registrarError("tienda", rpc, error);
  return json(r.body, r.status);
}

/** Un cupo que no dejó pasar: agotado → 429; el control no respondió (solo cierra en `pedir`) → 503. */
const sinCupo = (c: ResultadoCupo): Response =>
  c.motivo === "BD_NO_RESPONDE" ? json({ error: "SERVICIO_NO_DISPONIBLE" }, 503) : json({ error: "DEMASIADOS_INTENTOS" }, 429);

async function atender(req: Request): Promise<Response> {
  // ── 1) Método, secreto y cuerpo ─────────────────────────────────────────────────────────────
  if (req.method !== "POST") return json({ error: "METODO_NO_PERMITIDO" }, 405);
  // Un secreto vacío (o solo espacios) no está configurado: `secretoInternoValido` lo da por inválido.
  const secreto = (Deno.env.get("VIM_TIENDA_SECRET") ?? "").trim();
  if (!secretoInternoValido(req.headers.get("x-vim-tienda") ?? "", secreto)) return json({ error: "NO_AUTORIZADO" }, 401);

  const crudo = await leerCuerpoAcotado(req, MAX_CUERPO);
  if (crudo === null) return json({ error: "CUERPO_DEMASIADO_GRANDE" }, 413);
  // Un NUL (literal o escapado) no cabe en un jsonb de Postgres: fuera antes de tocar la base.
  if (tieneNul(crudo)) return json({ error: "CUERPO_INVALIDO" }, 400);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return json({ error: "CUERPO_INVALIDO" }, 400);
  }
  const leido = leerCuerpo(cuerpo);
  if (!leido.ok) return json({ error: leido.error }, 400);
  const p = leido.valor;

  // ── 2) Cupo por IP (IPv6: por su /64) ───────────────────────────────────────────────────────
  const admin = clienteAdmin();
  const ip = ipDeConfianza(req.headers.get("x-tienda-ip"));
  // Sin IP, todos los que piden comparten un contador de 5 por hora: que quede en el log.
  if (p.accion === "pedir" && ip === "desconocida") registrarError("tienda", "IP_CLIENTE_DESCONOCIDA", p.negocio);
  const cupos = cuposDe(p.accion, ip, p.negocio);
  const cupoIp = await consumirCupos(admin, cupos.antes, cupos.alFallar);
  if (!cupoIp.permitido) return sinCupo(cupoIp);

  // ── 3) El negocio, por su slug ──────────────────────────────────────────────────────────────
  // No existe, está de baja o bloqueado, o no tiene el módulo: la misma respuesta en los tres.
  const neg = await admin.rpc("tienda_negocio", { p_slug: p.negocio });
  if (neg.error) return rechazo("tienda_negocio", neg.error);
  const negocio = leerNegocio(neg.data);
  if (!negocio) return json({ error: "TIENDA_NO_DISPONIBLE" }, 404);
  const p_tenant = negocio.tenantId;   // solo para las RPC: no va en ninguna respuesta

  // ── 4) Por acción ───────────────────────────────────────────────────────────────────────────
  if (p.accion === "negocio") return json(negocio.publico);

  if (p.accion === "seguimiento") {
    const seg = await admin.rpc("tienda_seguimiento", { p_tenant, p_seguimiento_hash: await huellaDe(p.codigo) });
    if (seg.error) return rechazo("tienda_seguimiento", seg.error);
    return seg.data ? json(seg.data) : json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);
  }

  // menu, cotizar y pedir: la sucursal tiene que ser una de las que la tienda enseña.
  const p_sucursal = p.sucursal_id.toLowerCase();
  if (!negocio.sucursales.includes(p_sucursal)) return json({ error: "TIENDA_NO_DISPONIBLE" }, 404);

  if (p.accion === "menu") {
    const menu = await admin.rpc("tienda_menu", { p_tenant, p_sucursal });
    return menu.error ? rechazo("tienda_menu", menu.error) : json(menu.data);
  }

  const carrito = { p_tenant, p_sucursal, p_modo: p.modo, p_zona: p.zona_id, p_items: p.items };

  if (p.accion === "cotizar") {
    const q = await admin.rpc("tienda_cotizar", carrito);
    if (q.error) return rechazo("tienda_cotizar", q.error);
    const publica = cotizacionPublica(q.data);
    if (!publica) throw new Error("tienda_cotizar no devolvió un objeto");
    return json(publica);
  }

  // ── pedir ───────────────────────────────────────────────────────────────────────────────────
  // Orden: cupo por IP (arriba) → negocio y sucursal → antirobot → cupo del negocio → alta.
  // Mismas variables y el mismo «opcional solo en local» que signup-tenant. Fail-closed: sin
  // TURNSTILE_SECRET_KEY (y sin CAPTCHA_OPCIONAL=1) no se crea ningún pedido (503).
  const captcha = await verificarTurnstile({
    secreto: Deno.env.get("TURNSTILE_SECRET_KEY"),
    opcional: Deno.env.get("CAPTCHA_OPCIONAL") === "1",
    token: p.captcha,
    accion: "tienda_pedido",
    hostnames: hostnamesPermitidos(Deno.env.get("TURNSTILE_HOSTNAMES")),
    ip,
  });
  if (!captcha.ok) {
    // El motivo es de una lista cerrada y los códigos son los de Cloudflare: el token no se escribe.
    (captcha.motivo === "NO_CONFIGURADO" ? console.error : console.warn)(
      `[tienda] captcha no pasó: ${captcha.motivo} ${captcha.codigos?.join(",") ?? ""}`,
    );
    const r = respuestaDeCaptcha(captcha.motivo);   // sin configurar → 503; lo demás → 403
    return json(r.body, r.status);
  }
  if (captcha.omitido) console.warn("[tienda] CAPTCHA_OPCIONAL=1 y sin TURNSTILE_SECRET_KEY: captcha NO verificado (solo local).");

  // El cupo del negocio se gasta solo DESPUÉS del antirobot: sin un token válido nadie le agota la
  // tienda a un restaurante. El slug no es dato personal.
  const cupoNegocio = await consumirCupos(admin, cupos.despuesDelCaptcha, cupos.alFallar);
  if (!cupoNegocio.permitido) {
    if (cupoNegocio.motivo === "AGOTADO") registrarError("tienda", "CUPO_NEGOCIO_AGOTADO", p.negocio);
    return sinCupo(cupoNegocio);
  }

  // El código solo lo tendrá el cliente (esta respuesta y su correo). A la base va la huella.
  const codigo = nuevoCodigo();
  const p_seguimiento_hash = await huellaDe(codigo);
  const alta = await admin.rpc("tienda_crear_pedido", {
    ...carrito,
    p_cliente: p.cliente,
    p_direccion: p.direccion,
    p_pago: p.pago,
    p_paga_con: p.paga_con,
    p_nota: p.nota,
    p_seguimiento_hash,
    p_cuenta: null,          // las cuentas de cliente llegan en la entrega 6
    p_total_esperado: p.total_esperado,   // lo que el cliente vio; si ya no es ese, 409 TOTAL_CAMBIO con el nuevo
  });
  if (alta.error) return rechazo("tienda_crear_pedido", alta.error);
  const pedido = leerPedido(alta.data);
  if (!pedido) {
    // El pedido YA existe: el cliente recibe su código (con él lo sigue) aunque falte lo demás.
    registrarError("tienda", "PEDIDO_FORMA_INESPERADA", "tienda_crear_pedido no devolvió folio, total y vencimiento");
    return json({ codigo, folio_corto: null, total_mxn: null, vence_aceptacion: null });
  }

  // El correo de confirmación: después de responder, y pase lo que pase el pedido ya está creado.
  const email = p.cliente.email;
  const base = (Deno.env.get("VIM_TIENDA_URL") ?? "").replace(/\/+$/, "");
  const modo = p.modo, slug = p.negocio;
  if (email && base && Deno.env.get("VIM_SMTP_HOST")) {
    enSegundoPlano((async () => {
      // Los renglones, ya listos para enseñar, los trae el seguimiento del propio pedido.
      const seg = await admin.rpc("tienda_seguimiento", { p_tenant, p_seguimiento_hash });
      if (seg.error) return registrarError("tienda", "CORREO_PEDIDO", seg.error);
      const renglones = (seg.data as { renglones?: { nombre: string; cantidad: number; detalle: string | null }[] } | null)?.renglones ?? [];
      const { subject, html } = correoDePedido({
        negocio: negocio.nombre, folio: pedido.folio_corto, total: pedido.total_mxn, modo, renglones,
        enlace: `${base}/${slug}/pedido/${codigo}`,
      });
      const r = await enviarCorreo({ to: email, subject, html });
      // Sin el motivo de SMTP: puede traer la dirección del cliente.
      if (!r.enviado) console.warn(`[tienda] pedido ${pedido.folio_corto}: el correo de confirmación no salió.`);
    })().catch((e) => registrarError("tienda", "CORREO_PEDIDO", e)));
  } else if (email) {
    console.warn(`[tienda] pedido ${pedido.folio_corto}: sin correo de confirmación (falta VIM_TIENDA_URL o VIM_SMTP_*).`);
  }

  return json({ codigo, ...pedido });
}

Deno.serve(async (req) => {
  try {
    return await atender(req);
  } catch (e) {
    // Al log, el error; al cliente, nada de él.
    registrarError("tienda", "ERROR_INTERNO", e);
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
