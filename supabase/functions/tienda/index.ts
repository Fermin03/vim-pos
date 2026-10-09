// Edge Function: tienda — la puerta de la tienda en línea (entrega 2; cuentas en la 6; diseño §7 y §10).
//
//   POST /functions/v1/tienda     x-vim-tienda: <VIM_TIENDA_SECRET>     x-tienda-ip: <IP del cliente>
//                                 x-tienda-sesion: <token de sesión>    (opcional; solo cuentas y `pedir`)
//   { accion: "negocio" | "menu" | "cotizar" | "pedir" | "seguimiento"
//           | "registrar" | "entrar" | "salir" | "recuperar_pedir" | "recuperar_aplicar" | "cuenta"
//           | "cuenta_guardar" | "cuenta_password" | "direccion_guardar" | "direccion_borrar"
//           | "mis_pedidos" | "eliminar_cuenta", negocio: <slug>, … }
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
// LA SESIÓN DE UNA CUENTA (entrega 6)
//   El token (22 caracteres, 128 bits) nace aquí con `nuevoCodigo()`. A la base va SOLO su huella
//   SHA-256; en claro sale una vez, en el campo `sesion` de la respuesta de `registrar`, `entrar` y
//   `recuperar_aplicar`, que el servidor de la tienda convierte en cookie `HttpOnly` y quita antes
//   de contestarle al navegador. De vuelta llega en `x-tienda-sesion`, nunca en el cuerpo. La cuenta
//   de una acción —y la de un pedido— sale de ahí (`tienda_sesion_cuenta`, acotada al negocio del
//   slug) y de ningún otro sitio. «Sin sesión» y «contraseña incorrecta» son 403 con su código: el
//   401 queda para el secreto.
//
// LO QUE NUNCA SALE NI SE ESCRIBE
//   · En una respuesta: `tenant_id`, el id de una cuenta, los `items` normalizados de la cotización,
//     el texto de un error de la base, el secreto. Las reglas de qué sale están en
//     _shared/tienda/respuesta.ts y cuenta.ts, que sí se prueban; este archivo no (Deno.serve y la base).
//   · En el log: el cuerpo, el código de seguimiento, el secreto, el token del captcha, y de las
//     cuentas NADA: ni contraseña, ni token de sesión o de recuperación, ni correo. (El slug del
//     negocio sí puede ir: no es dato personal.)
//   · El código de seguimiento existe en la respuesta de `pedir` y en el correo. En la base, su huella.
//     La `clave` de un intento de compra (entrega 7) no se guarda en ningún lado ni se escribe en el log.
//   · Si un correo tiene cuenta, en `entrar` y `recuperar_pedir`: `entrar` contesta lo mismo a una
//     contraseña mala, a una cuenta que no existe y a una bloqueada, y `recuperar_pedir` hace el
//     mismo camino exista o no (mismos cupos, mismo antirobot, misma RPC, correo en segundo plano).
//
// LO QUE SÍ SE PUEDE DEDUCIR (aceptado, ADR 0032)
//   `registrar` deja saber si un correo ya es cliente de ESE restaurante: el alta nueva contesta con
//   la cuenta y abre sesión; el correo ya usado contesta `{ ok: true }` a secas. Es consecuencia de
//   entrar de una vez al registrarse, sin confirmar el correo (decisión de producto). Lo acota el
//   antirobot, 5 intentos por hora por IP y 3 por hora por correo; y quien pregunta por un correo que
//   NO era cliente deja una cuenta creada y una bienvenida en ese buzón. Los dos caminos tardan lo
//   mismo (el `crypt()` corre con o sin conflicto), pero la respuesta no es la misma.
//
// LOS CORREOS DE CUENTA NO LLEVAN TEXTO DE QUIEN ESCRIBE
//   Van a una dirección que nadie ha verificado, así que no llevan el nombre que se tecleó en el
//   formulario (ver _shared/tienda/correo-cuenta.ts), y `registrar` y `recuperar_pedir` tienen un
//   tope por destinatario además del de la IP.
//
// El negocio sale SIEMPRE del slug (`tienda_negocio`), nunca de un id que mande quien llama, y toda
// RPC va acotada a ese tenant. La lógica (precios, horario, topes, contraseñas, bloqueo) vive en las
// funciones SQL de 0162 y 0166.
//
// SECRETOS: VIM_TIENDA_SECRET, VIM_TIENDA_URL (base de los enlaces del correo), TURNSTILE_SECRET_KEY,
// TURNSTILE_HOSTNAMES (tiene que incluir el dominio de la tienda), CAPTCHA_OPCIONAL (solo local),
// VIM_SMTP_*.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupos, leerCuerpoAcotado, type ResultadoCupo } from "../_shared/limite.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { type AccionCaptcha, hostnamesPermitidos, verificarTurnstile } from "../_shared/turnstile.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { leerCuerpo, type Peticion, tieneNul } from "../_shared/tienda/validar.ts";
import { codigoDeClave, huellaDe, nuevoCodigo } from "../_shared/tienda/seguimiento.ts";
import { correoDePedido } from "../_shared/tienda/correo-pedido.ts";
import { correoDeBienvenida, correoDeRecuperacion, correoYaTienesCuenta } from "../_shared/tienda/correo-cuenta.ts";
import { CABECERA_SESION, cuentaDe, direccionesPublicas, leerRegistro, leerSesion, pedidosPublicos, type Sesion } from "../_shared/tienda/cuenta.ts";
import { cotizacionPublica, type Cupos, cuposDe, ipDeConfianza, leerNegocio, leerPedido, type Negocio, respuestaDeCaptcha, respuestaDeRpc } from "../_shared/tienda/respuesta.ts";

const MAX_CUERPO = 32_768;

type Admin = ReturnType<typeof clienteAdmin>;
type PeticionDeCuenta = Exclude<Peticion, { accion: "negocio" | "menu" | "cotizar" | "pedir" | "seguimiento" }>;

// Propio, y no el de `servir()`: aquel lleva las cabeceras CORS. `no-store`: la respuesta de
// `pedir` trae el código de seguimiento, y las de cuentas el token de sesión; ningún intermediario
// tiene por qué guardarlas.
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * Una RPC devolvió error. Rechazo de negocio (`CODIGO: detalle`) → 409 con el código (400 si son
 * datos de cuenta que la base no acepta); cualquier otra cosa → 503 y al log. El texto de la base no
 * sale nunca (respuestaDeRpc).
 */
function rechazo(rpc: string, error: { message: string }): Response {
  const r = respuestaDeRpc(error.message);
  if (r.status === 503) registrarError("tienda", rpc, error);
  return json(r.body, r.status);
}

/** Una RPC de cuentas contestó sin error pero con una forma que no es la del contrato: fallo nuestro. */
function inesperada(rpc: string): Response {
  registrarError("tienda", "RPC_FORMA_INESPERADA", rpc);
  return json({ error: "SERVICIO_NO_DISPONIBLE" }, 503);
}

/** Un cupo que no dejó pasar: agotado → 429; el control no respondió (solo cierra en lo que escribe) → 503. */
const sinCupo = (c: ResultadoCupo): Response =>
  c.motivo === "BD_NO_RESPONDE" ? json({ error: "SERVICIO_NO_DISPONIBLE" }, 503) : json({ error: "DEMASIADOS_INTENTOS" }, 429);

const SESION_INVALIDA = (): Response => json({ error: "SESION_INVALIDA" }, 403);

/**
 * El antirobot de `pedir`, `registrar` y `recuperar_pedir`. null = pasó. Mismas variables y el mismo
 * «opcional solo en local» que signup-tenant. Fail-closed: sin TURNSTILE_SECRET_KEY (y sin
 * CAPTCHA_OPCIONAL=1) no pasa nadie (503).
 */
async function antirobot(token: string | null, accion: AccionCaptcha, ip: string): Promise<Response | null> {
  const captcha = await verificarTurnstile({
    secreto: Deno.env.get("TURNSTILE_SECRET_KEY"),
    opcional: Deno.env.get("CAPTCHA_OPCIONAL") === "1",
    token,
    accion,
    hostnames: hostnamesPermitidos(Deno.env.get("TURNSTILE_HOSTNAMES")),
    ip,
  });
  if (!captcha.ok) {
    // El motivo es de una lista cerrada y los códigos son los de Cloudflare: el token no se escribe.
    (captcha.motivo === "NO_CONFIGURADO" ? console.error : console.warn)(
      `[tienda] captcha (${accion}) no pasó: ${captcha.motivo} ${captcha.codigos?.join(",") ?? ""}`,
    );
    const r = respuestaDeCaptcha(captcha.motivo);   // sin configurar → 503; lo demás → 403
    return json(r.body, r.status);
  }
  if (captcha.omitido) console.warn("[tienda] CAPTCHA_OPCIONAL=1 y sin TURNSTILE_SECRET_KEY: captcha NO verificado (solo local).");
  return null;
}

/**
 * La cuenta dueña de la sesión de la cabecera, en ESTE negocio. Sin cabecera, con una que no tiene
 * forma de token, vencida, cerrada o de otro negocio: el mismo 403. La huella se devuelve porque
 * `cuenta_password` la necesita para conservar esta sesión y cerrar las demás.
 */
async function cuentaDeSesion(admin: Admin, p_tenant: string, sesion: Sesion): Promise<{ p_cuenta: string; p_sesion_hash: string } | Response> {
  if (sesion.estado !== "ok") return SESION_INVALIDA();
  const p_sesion_hash = await huellaDe(sesion.token);
  const r = await admin.rpc("tienda_sesion_cuenta", { p_tenant, p_sesion_hash });
  if (r.error) return rechazo("tienda_sesion_cuenta", r.error);
  return typeof r.data === "string" && r.data ? { p_cuenta: r.data, p_sesion_hash } : SESION_INVALIDA();
}

/**
 * Un correo de cuenta: después de responder, y su fallo no cambia nada. En el log no va ni la
 * dirección ni el motivo de SMTP (puede traerla), ni cuál de los correos de registro fue.
 */
function correoDeCuenta(to: string, que: "registro" | "recuperación", armar: (base: string) => { subject: string; html: string }): void {
  const base = (Deno.env.get("VIM_TIENDA_URL") ?? "").replace(/\/+$/, "");
  if (!base || !Deno.env.get("VIM_SMTP_HOST")) {
    console.warn(`[tienda] sin correo de ${que} (falta VIM_TIENDA_URL o VIM_SMTP_*).`);
    return;
  }
  enSegundoPlano((async () => {
    const r = await enviarCorreo({ to, ...armar(base) });
    if (!r.enviado) console.warn(`[tienda] el correo de ${que} no salió.`);
  })().catch(() => console.error(`[tienda] CORREO_CUENTA: el correo de ${que} reventó.`)));
}

/**
 * Las acciones de cuenta. Llegan aquí con el cupo por IP ya gastado y el negocio ya resuelto.
 * Orden en cada una: antirobot donde aplique → (cupo de después del antirobot) → sesión → RPC.
 */
async function cuentas(p: PeticionDeCuenta, c: { admin: Admin; negocio: Negocio; ip: string; sesion: Sesion; cupos: Cupos }): Promise<Response> {
  const { admin, negocio } = c;
  const p_tenant = negocio.tenantId;   // solo para las RPC: no va en ninguna respuesta
  const slug = p.negocio;

  // ── Sin sesión ──────────────────────────────────────────────────────────────────────────────
  if (p.accion === "registrar") {
    const no = await antirobot(p.captcha, "tienda_registro", c.ip);
    if (no) return no;
    // El cupo por correo, solo después del antirobot (ver cuposDe): cada intento manda un correo a
    // una dirección sin verificar. Agotado → 429, como los demás cupos, exista o no la cuenta: no se
    // disfraza de `{ ok: true }` porque esa respuesta ya significa «ese correo tenía cuenta», y la
    // pantalla diría «revisa tu correo» por un correo que no salió.
    const cupoCorreo = await consumirCupos(admin, c.cupos.despuesDelCaptcha, c.cupos.alFallar);
    if (!cupoCorreo.permitido) return sinCupo(cupoCorreo);
    // El token se genera y se resume SIEMPRE, antes de saber si el correo ya tenía cuenta: los dos
    // caminos hacen el mismo trabajo. (El hash de la contraseña se calcula en el SQL en los dos.)
    const sesion = nuevoCodigo();
    const r = await admin.rpc("tienda_cuenta_registrar", {
      p_tenant, p_nombre: p.nombre, p_apellido: p.apellido, p_email: p.email, p_telefono: p.telefono,
      p_password: p.password, p_sesion_hash: await huellaDe(sesion),
    });
    if (r.error) return rechazo("tienda_cuenta_registrar", r.error);
    const reg = leerRegistro(r.data);
    if (!reg) return inesperada("tienda_cuenta_registrar");
    // Ninguno de los dos lleva el nombre que se tecleó: la dirección puede ser de otra persona.
    const { creada } = reg;
    correoDeCuenta(p.email, "registro", (base) => (creada ? correoDeBienvenida : correoYaTienesCuenta)({ negocio: negocio.nombre, slug, base }));
    // Correo ya usado: 200 sin sesión ni cuenta. La pantalla dice «revisa tu correo» y el aviso le
    // llega al dueño de la dirección. Quien mira la respuesta SÍ distingue los dos casos (ver arriba).
    return reg.creada ? json({ ok: true, sesion, cuenta: reg.cuenta }) : json({ ok: true });
  }

  if (p.accion === "entrar") {
    const sesion = nuevoCodigo();
    const r = await admin.rpc("tienda_cuenta_entrar", { p_tenant, p_email: p.email, p_password: p.password, p_sesion_hash: await huellaDe(sesion) });
    if (r.error) return rechazo("tienda_cuenta_entrar", r.error);
    // NULL = contraseña mala, cuenta que no existe o cuenta bloqueada: la base no los distingue y aquí tampoco.
    if (r.data === null) return json({ error: "CREDENCIALES_INVALIDAS" }, 403);
    const cuenta = cuentaDe(r.data);
    return cuenta ? json({ ok: true, sesion, cuenta }) : inesperada("tienda_cuenta_entrar");
  }

  if (p.accion === "recuperar_pedir") {
    const no = await antirobot(p.captcha, "tienda_recuperar", c.ip);
    if (no) return no;
    // El cupo por correo, solo después del antirobot (ver cuposDe). Aplica exista o no la cuenta.
    const cupoCorreo = await consumirCupos(admin, c.cupos.despuesDelCaptcha, c.cupos.alFallar);
    if (!cupoCorreo.permitido) return sinCupo(cupoCorreo);
    const token = nuevoCodigo();
    const r = await admin.rpc("tienda_recuperar_pedir", { p_tenant, p_email: p.email, p_token_hash: await huellaDe(token) });
    if (r.error) return rechazo("tienda_recuperar_pedir", r.error);
    // Con datos = la cuenta existe: sale el correo con el enlace. Sin datos, nada. La respuesta es la misma.
    if (r.data !== null && typeof r.data === "object") {
      correoDeCuenta(p.email, "recuperación", (base) => correoDeRecuperacion({ negocio: negocio.nombre, slug, base, token }));
    }
    return json({ ok: true });
  }

  if (p.accion === "recuperar_aplicar") {
    const sesion = nuevoCodigo();
    const r = await admin.rpc("tienda_recuperar_aplicar", {
      p_tenant, p_token_hash: await huellaDe(p.token), p_password: p.password, p_sesion_hash: await huellaDe(sesion),
    });
    if (r.error) return rechazo("tienda_recuperar_aplicar", r.error);
    if (r.data === null) return json({ error: "ENLACE_INVALIDO" }, 403);   // vencido, usado, inexistente o de otro negocio
    const cuenta = cuentaDe(r.data);
    return cuenta ? json({ ok: true, sesion, cuenta }) : inesperada("tienda_recuperar_aplicar");
  }

  if (p.accion === "salir") {
    // Sin sesión (o con una que no tiene forma de token) no hay nada que cerrar: 200 igual.
    if (c.sesion.estado === "ok") {
      const r = await admin.rpc("tienda_cuenta_salir", { p_tenant, p_sesion_hash: await huellaDe(c.sesion.token) });
      if (r.error) return rechazo("tienda_cuenta_salir", r.error);
    }
    return json({ ok: true });
  }

  // ── Con sesión obligatoria ──────────────────────────────────────────────────────────────────
  const s = await cuentaDeSesion(admin, p_tenant, c.sesion);
  if (s instanceof Response) return s;
  const { p_cuenta, p_sesion_hash } = s;

  switch (p.accion) {
    case "cuenta": {
      const r = await admin.rpc("tienda_cuenta_leer", { p_tenant, p_cuenta });
      if (r.error) return rechazo("tienda_cuenta_leer", r.error);
      if (r.data === null) return SESION_INVALIDA();   // la cuenta dejó de existir entre una llamada y otra
      const cuenta = cuentaDe(r.data), direcciones = direccionesPublicas(r.data);
      return cuenta && direcciones ? json({ cuenta, direcciones }) : inesperada("tienda_cuenta_leer");
    }
    case "cuenta_guardar": {
      const r = await admin.rpc("tienda_cuenta_guardar", {
        p_tenant, p_cuenta, p_nombre: p.nombre, p_apellido: p.apellido, p_telefono: p.telefono, p_fecha_nacimiento: p.fecha_nacimiento,
      });
      if (r.error) return rechazo("tienda_cuenta_guardar", r.error);
      const cuenta = cuentaDe(r.data);
      return cuenta ? json({ cuenta }) : inesperada("tienda_cuenta_guardar");
    }
    case "cuenta_password": {
      // La huella de ESTA sesión: es la que se conserva; las demás se cierran.
      const r = await admin.rpc("tienda_cuenta_password", { p_tenant, p_cuenta, p_actual: p.actual, p_nueva: p.nueva, p_sesion_hash });
      if (r.error) return rechazo("tienda_cuenta_password", r.error);
      return r.data === true ? json({ ok: true }) : json({ error: "CREDENCIALES_INVALIDAS" }, 403);
    }
    case "direccion_guardar": {
      const r = await admin.rpc("tienda_direccion_guardar", { p_tenant, p_cuenta, p_id: p.id, p_etiqueta: p.etiqueta, p_direccion: p.direccion });
      if (r.error) return rechazo("tienda_direccion_guardar", r.error);   // DIRECCIONES_LLENAS → 409
      const direcciones = direccionesPublicas(r.data);
      return direcciones ? json({ direcciones }) : inesperada("tienda_direccion_guardar");
    }
    case "direccion_borrar": {
      const r = await admin.rpc("tienda_direccion_borrar", { p_tenant, p_cuenta, p_id: p.id });
      if (r.error) return rechazo("tienda_direccion_borrar", r.error);
      const direcciones = direccionesPublicas(r.data);
      return direcciones ? json({ direcciones }) : inesperada("tienda_direccion_borrar");
    }
    case "mis_pedidos": {
      const r = await admin.rpc("tienda_mis_pedidos", { p_tenant, p_cuenta });
      if (r.error) return rechazo("tienda_mis_pedidos", r.error);
      const pedidos = pedidosPublicos(r.data);
      return pedidos ? json({ pedidos }) : inesperada("tienda_mis_pedidos");
    }
    case "eliminar_cuenta": {
      const r = await admin.rpc("tienda_cuenta_eliminar", { p_tenant, p_cuenta, p_password: p.password });
      if (r.error) return rechazo("tienda_cuenta_eliminar", r.error);
      return r.data === true ? json({ ok: true }) : json({ error: "CREDENCIALES_INVALIDAS" }, 403);
    }
  }
}

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
  // Un enlace de recuperación mutilado es, para el cliente, lo mismo que uno vencido: 403 ENLACE_INVALIDO.
  if (!leido.ok) return json({ error: leido.error }, leido.error === "ENLACE_INVALIDO" ? 403 : 400);
  const p = leido.valor;

  // ── 2) Cupo por IP (IPv6: por su /64); en `entrar`, además, el tope del restaurante ──────────
  const admin = clienteAdmin();
  const ip = ipDeConfianza(req.headers.get("x-tienda-ip"));
  // La sesión solo se lee de su cabecera (después del secreto: la pone nuestro servidor), nunca del cuerpo.
  const sesion = leerSesion(req.headers.get(CABECERA_SESION));
  // Sin IP, todos los que le piden a ese restaurante comparten un contador de 8 por hora: que quede en el log.
  if (p.accion === "pedir" && ip === "desconocida") registrarError("tienda", "IP_CLIENTE_DESCONOCIDA", p.negocio);
  // El correo no va en claro a la tabla de cupos: su huella, atada al negocio.
  const conCorreo = p.accion === "registrar" || p.accion === "recuperar_pedir";
  const cupos = cuposDe(p.accion, ip, p.negocio, conCorreo ? await huellaDe(`${p.negocio}:${p.email}`) : undefined);
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

  if (p.accion !== "menu" && p.accion !== "cotizar" && p.accion !== "pedir") return cuentas(p, { admin, negocio, ip, sesion, cupos });

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
  // Orden: cupo por IP (arriba) → negocio y sucursal → sesión (si vino) → antirobot → cupo del negocio → alta.
  // Un reintento con la misma `clave` recorre el mismo camino: vuelve a pasar el antirobot y los cupos.
  //
  // La cuenta del pedido sale SOLO de la sesión. Sin cabecera, invitado, como siempre. Con una
  // cabecera que no sirve (mal formada, vencida, cerrada, de otro negocio) el pedido se rechaza: el
  // cliente cree que pide con su cuenta, y degradarlo a invitado en silencio lo dejaría sin verlo en
  // «Mis pedidos». Va antes del antirobot para no gastarle el token ni el cupo del negocio.
  let p_cuenta: string | null = null;
  if (sesion.estado !== "sin") {
    const s = await cuentaDeSesion(admin, p_tenant, sesion);
    if (s instanceof Response) return s;
    p_cuenta = s.p_cuenta;
  }

  const no = await antirobot(p.captcha, "tienda_pedido", ip);
  if (no) return no;

  // El cupo del negocio se gasta solo DESPUÉS del antirobot: sin un token válido nadie le agota la
  // tienda a un restaurante. El slug no es dato personal.
  const cupoNegocio = await consumirCupos(admin, cupos.despuesDelCaptcha, cupos.alFallar);
  if (!cupoNegocio.permitido) {
    if (cupoNegocio.motivo === "AGOTADO") registrarError("tienda", "CUPO_NEGOCIO_AGOTADO", p.negocio);
    return sinCupo(cupoNegocio);
  }

  // El código solo lo tendrá el cliente (esta respuesta y su correo). A la base va la huella.
  // Con `clave` el código se deriva de ella: el reintento del mismo intento de compra da la misma
  // huella, y la base, en vez de crear otro pedido, devuelve el que ya existe (0167). Sin `clave`,
  // al azar, como siempre.
  const codigo = p.clave ? await codigoDeClave(secreto, p.negocio, p.clave) : nuevoCodigo();
  const p_seguimiento_hash = await huellaDe(codigo);
  const alta = await admin.rpc("tienda_crear_pedido", {
    ...carrito,
    p_cliente: p.cliente,
    p_direccion: p.direccion,
    p_pago: p.pago,
    p_paga_con: p.paga_con,
    p_nota: p.nota,
    p_seguimiento_hash,
    p_cuenta,                // de la sesión, o null (invitado); nunca del cuerpo
    p_total_esperado: p.total_esperado,   // lo que el cliente vio; si ya no es ese, 409 TOTAL_CAMBIO con el nuevo
    // Solo si vino: sin `clave` la llamada es, argumento por argumento, la de antes de la 0167.
    ...(p.clave && { p_clave: p.clave }),
  });
  if (alta.error) return rechazo("tienda_crear_pedido", alta.error);
  const pedido = leerPedido(alta.data);
  if (!pedido) {
    // El pedido YA existe: el cliente recibe su código (con él lo sigue) aunque falte lo demás.
    registrarError("tienda", "PEDIDO_FORMA_INESPERADA", "tienda_crear_pedido no devolvió folio, total y vencimiento");
    return json({ codigo, folio_corto: null, total_mxn: null, vence_aceptacion: null });
  }

  // El correo de confirmación: después de responder, y pase lo que pase el pedido ya está creado.
  // ponytail: un reintento con la misma `clave` lo manda otra vez (mismo pedido, mismo enlace): la
  // base no dice si el pedido ya existía. Si molestara, que `tienda_crear_pedido` lo devuelva y se salte aquí.
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
