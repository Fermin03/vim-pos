// Edge Function: tienda — la puerta de la tienda en línea (entrega 2; cuentas en la 6; diseño §7 y §10).
//
//   POST /functions/v1/tienda     x-vim-tienda: <VIM_TIENDA_SECRET>     x-tienda-ip: <IP del cliente>
//                                 x-tienda-sesion: <token de sesión>    (opcional; solo cuentas y `pedir`)
//   { accion: "negocio" | "menu" | "colonias" | "cotizar" | "pedir" | "seguimiento" | "confirmar_pago" | "verificacion" | "intento"
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
// PAGO EN LÍNEA (Orders API de Mercado Pago; 0173 y _shared/tienda/pago-*.ts)
//   `pedir` con `pago: "EN_LINEA"` (`propina_pct`: 0, 10, 15 o 20, o en su lugar `propina_mxn`: «otro
//   monto» en pesos, de hasta el subtotal de los productos; `tarjeta`: el TOKEN que dio
//   MercadoPago.js, su marca y si es crédito o débito; y correo obligatorio) crea el pedido
//   POR_PAGAR, que no existe para la caja, y lo cobra en la misma petición con el token de la
//   conexión de la tienda del restaurante (`POST /v1/orders`). El monto lo pone la base; del
//   cliente solo se acepta la propina (el porcentaje o el monto). Finales:
//     · aprobado y verificado → el pedido queda RECIBIDO, sale el correo y se contesta lo de
//       siempre más `propina_mxn`, `total_a_pagar_mxn` y `pago: { estado: "PAGADO" }`;
//     · rechazado → 409 PAGO_RECHAZADO con `detalle`: la familia del motivo (FONDOS, DATOS,
//       LLAMAR_BANCO, TARJETA_DESHABILITADA u OTRO). El pedido se descartó;
//     · Mercado Pago pide que el cliente confirme con su banco (3D Secure) → 200 con
//       `pago: { estado: "VERIFICACION", url }`: no se ha cobrado nada, el pedido sigue POR_PAGAR con
//       10 minutos de plazo, y `url` es la página del reto (de Mercado Pago, ya validada), que la
//       tienda abre en un marco. Esa dirección lleva un token del cliente: viaja en ESTA respuesta
//       y en la de `verificacion`, y no se guarda ni se escribe en ningún lado;
//     · no se supo (Mercado Pago no contestó, o dejó el cobro en revisión) → 200 con
//       `pago: { estado: "POR_CONFIRMAR" }`: el pedido sigue POR_PAGAR y lo resuelven el aviso,
//       `confirmar_pago` y el barrido. Nunca se contesta «rechazado» sin un no seguro de Mercado Pago;
//     · 409 PAGO_NO_PROCESADO: el cobro no se pudo procesar y no fue cosa del banco (Mercado Pago no
//       aceptó la petición y se comprobó que no hay orden, o el token de la tarjeta no existe o ya se
//       usó). El pedido se descartó y no se cobró nada; no cuenta como tarjeta rechazada del negocio;
//     · 409 PAGO_NO_DISPONIBLE: la cuenta del restaurante no deja cobrar (pedido descartado). Si fue
//       un 401 de Mercado Pago, el pago en línea de esa sucursal queda en pausa una hora y se avisa a VIM.
//   Contra la prueba masiva de tarjetas (rechazos.ts): una IP con 5 rechazos en la hora recibe 429
//   DEMASIADOS_INTENTOS al intentar otro pago en línea; desde el 4.º rechazo su `detalle` es OTRO;
//   y con 20 rechazos de tarjetas reales en una hora, desde al menos 8 IP distintas, el pago en línea
//   del negocio se pausa una hora (aviso a VIM).
//   `confirmar_pago` ({negocio, codigo}) es el respaldo del aviso desde la página del pedido: le
//   pregunta a Mercado Pago y contesta el seguimiento.
//   `verificacion` ({negocio, codigo, cancelar?}) es lo que la pantalla de la tarjeta pregunta mientras
//   el cliente contesta el reto de su banco. Consulta la orden (a lo sumo cada 3 s por pago) y contesta:
//     · 200 `pago: { estado: "VERIFICACION", url? }`: el reto sigue vivo (con su dirección, si se consultó);
//     · 200 `pago: { estado: "PAGADO" }`: aprobado y verificado; el pedido ya está RECIBIDO (y sale el correo);
//     · 200 `pago: { estado: "POR_CONFIRMAR" }`: ya no espera el reto y todavía no hay resultado: lo
//       dice la página del pedido;
//     · 409 PAGO_RECHAZADO con `detalle` (VERIFICACION: el banco no lo confirmó; SIN_VERIFICAR: el
//       reto se dejó —lo canceló el cliente o pasó el plazo—; o la familia de siempre): no se cobró
//       nada y el cliente puede pagar otra vez, igual que tras un rechazo directo.
//   Con `cancelar: true` el cliente deja el reto. Mercado Pago NO deja cancelar una orden que espera
//   el reto (VERIFICADO: 422), así que se deja de NUESTRO lado: el pedido se cierra sin pago, se
//   contesta 409 SIN_VERIFICAR en el acto, y el pago queda ABANDONADO y vigilado; si su orden acaba
//   cobrada (el cliente lo contestó después), se devuelve sola. Solo se deja con la orden a la vista
//   y todavía en el reto: si ya salió de él y se está cobrando, se contesta POR_CONFIRMAR; y si
//   Mercado Pago no contesta, VERIFICACION (la tienda vuelve a pedirlo). Pasado el plazo (10 minutos) el
//   barrido de la base hace lo mismo. Ese pedido NO se descarta: su renglón es el que vigila la orden.
//   De la tarjeta aquí solo pasa el token, que es de un solo uso y no se escribe en ningún log.
//
//   EL FRENO TRAS UN RECHAZO POR RIESGO (0178; rechazos.ts). Cuando el motivo es RIESGO (`high_risk`: el
//   antifraude de Mercado Pago, no el banco), ese cliente —su teléfono Y su IP a la vez— no puede repetir
//   el cobro en línea en ese negocio durante 30 minutos: el 409 PAGO_RECHAZADO trae `hasta`, y mientras
//   dure, `pedir` con pago en línea contesta 409 PAGO_EN_PAUSA con `hasta` SIN crear el pedido ni llamar a
//   Mercado Pago (y sin contar como rechazo). Se mira DESPUÉS del antirobot: no sirve para preguntar si
//   un teléfono tuvo un rechazo. Sin IP conocida no hay freno. Puede seguir pidiendo para pagar al recibir.
//   La clave del freno es un HMAC (llave derivada de VIM_TIENDA_SECRET) y es lo único que llega a la base;
//   el pago la guarda al nacer para que un rechazo que llega tarde frene al mismo cliente.
//
//   MODO DE PRUEBA (0178). Un negocio con `tienda_config.pago_de_prueba` cobra contra el ambiente de
//   prueba de Mercado Pago, con su conexión de prueba, por este mismo código. Lo único distinto:
//     · a Mercado Pago se le manda como pagador el usuario de prueba (MP_TIENDA_PAGADOR_DE_PRUEBA); el
//       correo que escribió el cliente sigue siendo el de nuestros correos;
//     · no cuentan los topes de tarjetas rechazadas (ni el motivo se esconde, ni la IP se bloquea, ni el
//       negocio se pausa, ni sale correo a VIM), ni los cupos de `pedir` por IP y restaurante y por
//       negocio: ahí se prueba una y otra vez. Siguen el antirobot, el cupo de 40 por hora por IP y el freno.
//
// SECRETOS: VIM_TIENDA_SECRET, VIM_TIENDA_URL (base de los enlaces del correo; https),
// TURNSTILE_SECRET_KEY, TURNSTILE_HOSTNAMES (tiene que incluir el dominio de la tienda),
// CAPTCHA_OPCIONAL (solo local), VIM_SMTP_*, VIM_AVISOS_A (a dónde van los avisos internos),
// MP_TIENDA_PAGADOR_DE_PRUEBA (opcional: el usuario de prueba que paga en modo de prueba). Los
// tokens de Mercado Pago no son secretos de la función: son de cada restaurante y viven en Vault
// (`tienda:<conexion>:access`, 0173).
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupo, consumirCupos, leerCuerpoAcotado, type ResultadoCupo } from "../_shared/limite.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { type AccionCaptcha, hostnamesPermitidos, verificarTurnstile } from "../_shared/turnstile.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { leerCuerpo, type Peticion, tieneNul } from "../_shared/tienda/validar.ts";
import { codigoDeClave, huellaDe, nuevoCodigo } from "../_shared/tienda/seguimiento.ts";
import { correoDePedido } from "../_shared/tienda/correo-pedido.ts";
import { cifrarCodigo } from "../_shared/tienda/enlace.ts";
import { correoDeBienvenida, correoDeRecuperacion, correoYaTienesCuenta } from "../_shared/tienda/correo-cuenta.ts";
import { CABECERA_SESION, cuentaDe, direccionesPublicas, leerRegistro, leerSesion, pedidosPublicos, type Sesion } from "../_shared/tienda/cuenta.ts";
import { cotizacionPublica, type Cupos, cuposDe, esTopeDeEntradas, ipDeConfianza, leerNegocio, leerPedido, leerPedidoEnLinea, type Negocio, respuestaDeCaptcha, respuestaDeRpc, yaExistia } from "../_shared/tienda/respuesta.ts";
import { cobrarPago, confirmarPago } from "../_shared/tienda/pago-flujo.ts";
import { type MotivoDeRechazo, motivoDeRechazo, partesDeCotizacion } from "../_shared/tienda/pago-mp.ts";
import { depsDePagos } from "../_shared/tienda/pago-puerto.ts";
import { anotarRechazo, avisoDePagoPausado, claveDeFreno, ipSinPagoEnLinea, pagoFrenado, respuestaDeRechazo } from "../_shared/tienda/rechazos.ts";

const MAX_CUERPO = 32_768;

type Admin = ReturnType<typeof clienteAdmin>;
type PeticionDeCuenta = Exclude<Peticion, { accion: "negocio" | "menu" | "colonias" | "cotizar" | "pedir" | "seguimiento" | "confirmar_pago" | "verificacion" | "intento" }>;

/**
 * El correo que confirma un pedido: después de responder, y pase lo que pase el pedido ya existe.
 * Los renglones, ya listos para enseñar, los trae el seguimiento del propio pedido.
 */
function correoDeConfirmacion(admin: Admin, d: {
  p_tenant: string; p_seguimiento_hash: string; email: string | null; negocio: string; slug: string; codigo: string; pagado: boolean;
}): void {
  const base = (Deno.env.get("VIM_TIENDA_URL") ?? "").replace(/\/+$/, "");
  if (!d.email) return;
  if (!base || !Deno.env.get("VIM_SMTP_HOST")) {
    console.warn("[tienda] sin correo de confirmación (falta VIM_TIENDA_URL o VIM_SMTP_*).");
    return;
  }
  const to = d.email;
  enSegundoPlano((async () => {
    const seg = await admin.rpc("tienda_seguimiento", { p_tenant: d.p_tenant, p_seguimiento_hash: d.p_seguimiento_hash });
    if (seg.error) return registrarError("tienda", "CORREO_PEDIDO", seg.error);
    const s = seg.data as { folio_corto?: string; modo?: "RECOGER" | "DOMICILIO"; total_mxn?: string; total_a_pagar_mxn?: string; propina_mxn?: string;
                            renglones?: { nombre: string; cantidad: number; detalle: string | null }[] } | null;
    if (!s?.folio_corto || !s.total_mxn) return;
    const { subject, html } = correoDePedido({
      negocio: d.negocio, folio: s.folio_corto, total: (d.pagado ? s.total_a_pagar_mxn : null) ?? s.total_mxn,
      modo: s.modo === "DOMICILIO" ? "DOMICILIO" : "RECOGER", renglones: s.renglones ?? [],
      enlace: `${base}/${d.slug}/pedido/${d.codigo}`, pagado: d.pagado,
      ...(d.pagado && { totalPedido: s.total_mxn, propina: s.propina_mxn ?? null }),
    });
    const r = await enviarCorreo({ to, subject, html });
    // Sin el motivo de SMTP: puede traer la dirección del cliente.
    if (!r.enviado) console.warn(`[tienda] pedido ${s.folio_corto}: el correo de confirmación no salió.`);
  })().catch((e) => registrarError("tienda", "CORREO_PEDIDO", e)));
}

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
 * El correo de confirmación de un pedido pagado en línea: una sola vez por pago, lo pida quien lo
 * pida (el cobro recién aprobado, o la página del pedido cuando el cobro se confirmó después).
 */
async function correoDePagado(admin: Admin, pagoId: string, d: { p_tenant: string; p_seguimiento_hash: string; email: string | null; negocio: string; slug: string; codigo: string }): Promise<void> {
  const turno = await admin.rpc("tienda_pago_tomar_correo", { p_pago: pagoId });
  if (turno.error) registrarError("tienda", "CORREO_PEDIDO", turno.error);
  else if (turno.data === true) correoDeConfirmacion(admin, { ...d, pagado: true });
}

/**
 * Pone en pausa una hora el pago en línea (de una sucursal, o de todo el negocio con `sucursal`
 * null) y avisa a VIM. El aviso sale una vez por pausa: `tienda_pago_pausar` solo da verdadero a
 * quien la pone. Nada de esto cambia lo que se le contesta al cliente.
 */
async function pausarPagoEnLinea(admin: Admin, d: { p_tenant: string; sucursal: string | null; negocio: string; slug: string; por: "RECHAZOS" | "SIN_PERMISO" }): Promise<void> {
  const r = await admin.rpc("tienda_pago_pausar", { p_tenant: d.p_tenant, p_sucursal: d.sucursal, p_minutos: 60 });
  if (r.error) return registrarError("tienda", "PAUSAR_PAGO", r.error);
  if (r.data !== true) return;
  registrarError("tienda", d.por === "RECHAZOS" ? "PAGO_PAUSADO_POR_RECHAZOS" : "PAGO_PAUSADO_SIN_PERMISO", d.slug);
  enSegundoPlano((async () => {
    let sucursal: string | null = null;
    if (d.sucursal) {
      const s = await admin.from("sucursales").select("nombre").eq("id", d.sucursal).eq("tenant_id", d.p_tenant).maybeSingle();
      sucursal = (s.data as { nombre: string } | null)?.nombre ?? null;
    }
    const c = await enviarCorreo({ to: Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx", ...avisoDePagoPausado({ negocio: d.negocio, slug: d.slug, sucursal, por: d.por }) });
    if (!c.enviado) registrarError("tienda", "AVISO_NO_SALIO", `pago en pausa: ${d.slug}`);
  })().catch((e) => registrarError("tienda", "AVISO_NO_SALIO", e)));
}

/**
 * Un cobro que no pasó, ya con su motivo: se contesta 409 PAGO_RECHAZADO. Qué se cuenta, qué motivo
 * se dice, el freno tras un rechazo por riesgo y lo que cambia en modo de prueba lo decide
 * `respuestaDeRechazo` (rechazos.ts, que sí se prueba); aquí solo se pausa al negocio si lo pide.
 */
async function rechazoDePago(admin: Admin, d: { negocio: Negocio; ip: string; slug: string; motivo: MotivoDeRechazo; /** La clave de freno de ese cliente, o null. */ frenoClave: string | null }): Promise<Response> {
  const p_tenant = d.negocio.tenantId;
  const r = await respuestaDeRechazo(admin, { slug: d.slug, ip: d.ip, motivo: d.motivo, frenoClave: d.frenoClave, dePrueba: d.negocio.dePrueba });
  if (r.pausar) await pausarPagoEnLinea(admin, { p_tenant, sucursal: null, negocio: d.negocio.nombre, slug: d.slug, por: "RECHAZOS" });
  return json(r.cuerpo, 409);
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
      const r = await admin.rpc("tienda_direccion_guardar", { p_tenant, p_cuenta, p_id: p.id, p_etiqueta: p.etiqueta, p_direccion: p.direccion, ...(p.punto && { p_punto: p.punto }) });
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
  // Un pedido que se paga en línea gasta de sus propias bolsas: sus intentos rechazados no le quitan
  // cupo a los pedidos al recibir.
  const cupos = cuposDe(p.accion, ip, p.negocio, conCorreo ? await huellaDe(`${p.negocio}:${p.email}`) : undefined,
                        p.accion === "pedir" && p.pago === "EN_LINEA");
  // De uno en uno y en orden (lo mismo que `consumirCupos`), para saber CUÁL no dejó pasar: que se
  // agote el tope de entradas de un restaurante es un ataque o un fallo, y se deja en el log. Solo
  // el slug, que no es dato personal.
  for (const cupo of cupos.antes) {
    const r = await consumirCupo(admin, cupo, cupos.alFallar);
    if (r.permitido) continue;
    if (r.motivo === "AGOTADO" && esTopeDeEntradas(cupo.clave)) registrarError("tienda", "CUPO_ENTRADAS_AGOTADO", p.negocio);
    return sinCupo(r);
  }

  // ── 3) El negocio, por su slug ──────────────────────────────────────────────────────────────
  // No existe, está de baja o bloqueado, o no tiene el módulo: la misma respuesta en los tres.
  const neg = await admin.rpc("tienda_negocio", { p_slug: p.negocio });
  if (neg.error) return rechazo("tienda_negocio", neg.error);
  const negocio = leerNegocio(neg.data);
  if (!negocio) return json({ error: "TIENDA_NO_DISPONIBLE" }, 404);
  const p_tenant = negocio.tenantId;   // solo para las RPC: no va en ninguna respuesta
  // Un pago en línea en un negocio en MODO DE PRUEBA (0178): ahí se prueba el pago una y otra vez.
  const pagoDePrueba = negocio.dePrueba && p.accion === "pedir" && p.pago === "EN_LINEA";
  // El cupo por IP y restaurante de un pago en línea (ver cuposDe): el de siempre, pero ya se sabe
  // qué negocio es, y uno en modo de prueba no lo gasta.
  if (cupos.conNegocio && !pagoDePrueba) {
    const r = await consumirCupos(admin, cupos.conNegocio, cupos.alFallar);
    if (!r.permitido) return sinCupo(r);
  }

  // ── 4) Por acción ───────────────────────────────────────────────────────────────────────────
  if (p.accion === "negocio") return json(negocio.publico);

  if (p.accion === "seguimiento") {
    const seg = await admin.rpc("tienda_seguimiento", { p_tenant, p_seguimiento_hash: await huellaDe(p.codigo) });
    if (seg.error) return rechazo("tienda_seguimiento", seg.error);
    return seg.data ? json(seg.data) : json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);
  }

  // ── intento ─────────────────────────────────────────────────────────────────────────────────
  // ¿Hay ya un pedido para esta clave de intento? No crea ni cobra nada: deriva el código igual que
  // `pedir` y mira si existe. La tienda lo pregunta cuando mandó un pago en línea y no supo qué pasó;
  // mientras no lo sepa, no emite otra clave (otra clave sería otro pedido y otro cobro). El código
  // solo se le da a quien trae la clave, que es quien hizo el intento.
  if (p.accion === "intento") {
    const codigo = await codigoDeClave(secreto, p.negocio, p.clave);
    const r = await admin.from("delivery_pedidos").select("id")
      .eq("seguimiento_hash", await huellaDe(codigo)).eq("tenant_id", p_tenant).eq("canal", "TIENDA").maybeSingle();
    if (r.error) return rechazo("intento", r.error);
    return json(r.data ? { existe: true, codigo } : { existe: false });
  }

  // ── confirmar_pago ──────────────────────────────────────────────────────────────────────────
  // El respaldo del aviso de Mercado Pago, desde la página del pedido: el cobro se mandó y no se
  // supo el resultado. Hace lo MISMO que el aviso (pago-flujo.ts): le pregunta a Mercado Pago con el
  // token del restaurante y aplica lo que diga. De quien llama solo se usa el código del pedido.
  // Contesta el seguimiento.
  if (p.accion === "confirmar_pago") {
    const p_seguimiento_hash = await huellaDe(p.codigo);
    const ped = await admin.from("delivery_pedidos").select("id, cliente_email, pago_al_recibir")
      .eq("seguimiento_hash", p_seguimiento_hash).eq("tenant_id", p_tenant).eq("canal", "TIENDA").maybeSingle();
    if (ped.error) return rechazo("confirmar_pago", ped.error);
    const pedido = ped.data as { id: string; cliente_email: string | null; pago_al_recibir: string | null } | null;
    if (!pedido) return json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);

    if (pedido.pago_al_recibir === "EN_LINEA") {
      const pg = await admin.from("tienda_pagos").select("id, estado, conciliado_at")
        .eq("pedido_id", pedido.id).eq("extra", false).maybeSingle();
      if (pg.error) return rechazo("confirmar_pago", pg.error);
      const pago = pg.data as { id: string; estado: string; conciliado_at: string | null } | null;
      if (pago) {
        const sinResolver = pago.estado === "CREADO" || (pago.estado === "VENCIDO" && !pago.conciliado_at);
        // A lo sumo una consulta a Mercado Pago cada 10 s por pago, por mucho que insista la página.
        // Ya vencido (se espera la segunda conciliación, que tarda una hora), cada 5 minutos.
        if (sinResolver) {
          const turno = await admin.rpc("tienda_pago_tomar_consulta", { p_pago: pago.id, p_segundos: pago.estado === "VENCIDO" ? 300 : 10 });
          if (turno.error) return rechazo("tienda_pago_tomar_consulta", turno.error);
          // Si Mercado Pago no contesta no es un error para el cliente: ve su pedido como está y la página reintenta.
          if (turno.data === true) await confirmarPago(depsDePagos(admin, "tienda"), pago.id);
        }
        // El correo de un pedido cuyo cobro se confirmó después (por el aviso o el barrido) sale aquí:
        // es quien tiene el código del enlace. Una sola vez; si ya salió al cobrar, no se repite.
        await correoDePagado(admin, pago.id, { p_tenant, p_seguimiento_hash, email: pedido.cliente_email, negocio: negocio.nombre, slug: p.negocio, codigo: p.codigo });
      }
    }
    const seg = await admin.rpc("tienda_seguimiento", { p_tenant, p_seguimiento_hash });
    if (seg.error) return rechazo("tienda_seguimiento", seg.error);
    return seg.data ? json(seg.data) : json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);
  }

  // ── verificacion ────────────────────────────────────────────────────────────────────────────
  // La pantalla de la tarjeta, mientras el cliente contesta el reto de su banco (3D Secure). Es el
  // mismo camino que el aviso y que `confirmar_pago` (pago-flujo.ts): la verdad sale de consultar la
  // orden con el token del restaurante. De quien llama solo se usa el código del pedido y si quiere
  // cancelar. La dirección del reto sale de esa consulta y viaja solo en esta respuesta.
  if (p.accion === "verificacion") {
    const p_seguimiento_hash = await huellaDe(p.codigo);
    const ped = await admin.from("delivery_pedidos").select("id, cliente_email, pago_al_recibir")
      .eq("seguimiento_hash", p_seguimiento_hash).eq("tenant_id", p_tenant).eq("canal", "TIENDA").maybeSingle();
    if (ped.error) return rechazo("verificacion", ped.error);
    const pedido = ped.data as { id: string; cliente_email: string | null; pago_al_recibir: string | null } | null;
    if (!pedido) return json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);
    const leerPago = async () => {
      // `freno_clave`: si el pago acaba rechazado por riesgo, es la clave de a quién se frena (la del
      // cliente que hizo ESE pedido: su teléfono y la IP con la que pidió), no la de quien pregunta ahora.
      const g = await admin.from("tienda_pagos").select("id, estado, detalle, verificacion_at, orden_id_externo, freno_clave").eq("pedido_id", pedido.id).eq("extra", false).maybeSingle();
      if (g.error) throw new Error(g.error.message);
      return g.data as { id: string; estado: string; detalle: string | null; verificacion_at: string | null; orden_id_externo: string | null; freno_clave: string | null } | null;
    };
    let pago = pedido.pago_al_recibir === "EN_LINEA" ? await leerPago() : null;
    // Sin pago en línea no hay nada que verificar: la página del pedido dice cómo va.
    if (!pago) return json({ pago: { estado: "POR_CONFIRMAR" } });

    const reto: { url: string | null } = { url: null };
    const deps = depsDePagos(admin, "tienda");
    let consulta: Awaited<ReturnType<typeof confirmarPago>> | null = null;
    if (pago.estado === "CREADO") {
      // A lo sumo una consulta a Mercado Pago cada 3 s por pago (la pantalla pregunta cada 10 s, y en
      // cuanto la página del reto avisa que terminó). Cancelar no espera turno: lo pidió el cliente, una vez.
      const turno = p.cancelar ? { data: true, error: null } : await admin.rpc("tienda_pago_tomar_consulta", { p_pago: pago.id, p_segundos: 3 });
      if (turno.error) return rechazo("tienda_pago_tomar_consulta", turno.error);
      if (turno.data === true) {
        // Con `cancelar`, dejar el reto lo decide ESTA consulta, con la orden a la vista
        // (pago-flujo.ts): se abandona solo si sigue esperando el reto. Si el cliente ya lo había
        // contestado está cobrada (se le da su pedido) o cobrándose (`processing`, `in_review`: no se
        // deja; lo dirá la página del pedido). Si Mercado Pago no contesta, tampoco se deja a ciegas.
        consulta = await confirmarPago(deps, pago.id, undefined, false, { cancelar: p.cancelar, alReto: (url) => { reto.url = url; } });
        pago = await leerPago() ?? pago;
      }
    }
    if (pago.estado === "APROBADO") {
      await correoDePagado(admin, pago.id, { p_tenant, p_seguimiento_hash, email: pedido.cliente_email, negocio: negocio.nombre, slug: p.negocio, codigo: p.codigo });
      return json({ pago: { estado: "PAGADO" } });
    }
    if (pago.estado === "RECHAZADO") {
      // Mercado Pago dijo que no (o la orden quedó cancelada): es el mismo no que un rechazo directo.
      // El pedido se descarta y el cliente puede pagar otra vez sin perder su carrito. Si ya no se
      // puede descartar es que algo lo movió: que lo diga la página del pedido.
      const motivo = motivoDeRechazo(pago.detalle);
      if (!await deps.db.descartar(pago.id)) return json({ pago: { estado: "POR_CONFIRMAR" } });
      return rechazoDePago(admin, { negocio, ip, slug: p.negocio, motivo, frenoClave: pago.freno_clave });
    }
    // El reto se dejó (lo canceló el cliente, o pasó el plazo): el pedido ya está cerrado sin pago y
    // se puede pagar otra vez. No se descarta ni cuenta como tarjeta rechazada.
    if (pago.estado === "ABANDONADO") return rechazoDePago(admin, { negocio, ip, slug: p.negocio, motivo: "SIN_VERIFICAR", frenoClave: pago.freno_clave });
    // Sigue esperando el reto: lo dijo Mercado Pago ahora, o (sin turno para preguntar, o sin
    // respuesta) es lo último que se supo. Cualquier otra cosa ya no es de esta pantalla.
    const sigue = pago.estado === "CREADO" && (consulta?.ok ? consulta.enVerificacion : consulta === null || consulta.motivo === "MP_NO_RESPONDE" || consulta.motivo === "SIN_TOKEN" ? pago.verificacion_at !== null : false);
    return json({ pago: sigue ? { estado: "VERIFICACION", ...(reto.url && { url: reto.url }) } : { estado: "POR_CONFIRMAR" } });
  }

  if (p.accion !== "menu" && p.accion !== "colonias" && p.accion !== "cotizar" && p.accion !== "pedir") return cuentas(p, { admin, negocio, ip, sesion, cupos });

  // menu, colonias, cotizar y pedir: la sucursal tiene que ser una de las que la tienda enseña.
  const p_sucursal = p.sucursal_id.toLowerCase();
  if (!negocio.sucursales.includes(p_sucursal)) return json({ error: "TIENDA_NO_DISPONIBLE" }, 404);

  if (p.accion === "menu") {
    const menu = await admin.rpc("tienda_menu", { p_tenant, p_sucursal });
    return menu.error ? rechazo("tienda_menu", menu.error) : json(menu.data);
  }

  // Las colonias de la sucursal que se parecen al texto: [{ id, nombre, codigo_postal, con_zona }]. Sin zona_id.
  if (p.accion === "colonias") {
    const r = await admin.rpc("tienda_colonias", { p_tenant, p_sucursal, p_q: p.q });
    return r.error ? rechazo("tienda_colonias", r.error) : json(r.data);
  }

  // El pin (0185) solo si vino: sin él, la llamada es, argumento por argumento, la de antes. El envío
  // por distancia lo calcula la base con este punto; ningún importe del cliente cuenta.
  const carrito = { p_tenant, p_sucursal, p_modo: p.modo, p_zona: p.zona_id, p_items: p.items, ...(p.punto && { p_punto: p.punto }), ...(p.colonia_id && { p_colonia: p.colonia_id }) };

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

  // Una IP que ya juntó sus tarjetas rechazadas de la hora no intenta otro pago en línea (puede
  // seguir pidiendo para pagar al recibir). Antes del antirobot: no le gasta el token ni el cupo.
  // En modo de prueba los rechazos no se cuentan, así que tampoco hay nada que mirar.
  const enLinea = p.pago === "EN_LINEA";
  if (enLinea && !pagoDePrueba && await ipSinPagoEnLinea(admin, ip, p.negocio)) return json({ error: "DEMASIADOS_INTENTOS" }, 429);

  const no = await antirobot(p.captcha, "tienda_pedido", ip);
  if (no) return no;

  // EL FRENO (0178): a este MISMO cliente —este teléfono desde esta IP— el antifraude de Mercado Pago
  // le rechazó un cobro por riesgo aquí hace menos de 30 minutos. No se crea el pedido ni se llama a
  // Mercado Pago: repetirlo enseguida empeora la puntuación del restaurante. No cuenta como rechazo
  // ni gasta el cupo del negocio. Va DESPUÉS del antirobot: antes serviría para preguntar, sin
  // costo, si un teléfono tuvo un rechazo. Sin IP conocida no hay clave ni freno. Puede pedir para
  // pagar al recibir. La tienda, si tenía un intento en duda con esta clave de intento, pregunta por
  // él (`intento`): esta respuesta no dice nada de aquel.
  const frenoClave = enLinea ? await claveDeFreno(secreto, p_tenant, p.cliente.telefono, ip) : null;
  const frenadoHasta = await pagoFrenado(admin, frenoClave);
  if (frenadoHasta) return json({ error: "PAGO_EN_PAUSA", hasta: frenadoHasta }, 409);

  // El cupo del negocio se gasta solo DESPUÉS del antirobot: sin un token válido nadie le agota la
  // tienda a un restaurante. El slug no es dato personal.
  // (Un pago en línea de un negocio en modo de prueba no lo gasta: ver arriba.)
  const cupoNegocio = pagoDePrueba ? { permitido: true, motivo: "OK" as const } : await consumirCupos(admin, cupos.despuesDelCaptcha, cupos.alFallar);
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
    // Solo en línea: un pedido al recibir llama, argumento por argumento, como antes de la 0173.
    // «Otro monto» (0174) va EN LUGAR del porcentaje: sin él la llamada es, argumento por argumento, la de la 0173.
    ...(enLinea && (p.propina_mxn !== null ? { p_propina_mxn: p.propina_mxn } : { p_propina_pct: p.propina_pct ?? 0 })),
  });
  if (alta.error) return rechazo("tienda_crear_pedido", alta.error);

  // Para que los correos de estado (0176) lleven este mismo enlace: el código, cifrado con una llave
  // que la base no tiene. Solo si dejó correo. Si falla, el pedido sigue y esos correos salen sin botón.
  if (p.cliente.email) {
    try {
      const g = await admin.rpc("tienda_enlace_guardar", { p_tenant, p_seguimiento_hash, p_cifrado: await cifrarCodigo(secreto, codigo, p_seguimiento_hash) });
      if (g.error) registrarError("tienda", "ENLACE_DE_CORREO", g.error);
    } catch (e) { registrarError("tienda", "ENLACE_DE_CORREO", e); }
  }

  // ── Pago en línea: el pedido nació POR_PAGAR y se cobra AHORA, en esta misma petición ─────────
  // Lo decide lo que devolvió la base y no lo que pidió quien llama: un reintento con la misma
  // `clave` devuelve el pedido que YA existe, se haya pedido ahora con la forma de pago que sea.
  // (Si el pedido que existe es de pago al recibir, sigue por el camino de siempre, más abajo.)
  const porPagar = leerPedidoEnLinea(alta.data);
  if (porPagar) {
    // El pago guarda la clave de freno de su cliente (nunca el teléfono ni la IP): si el rechazo por
    // riesgo llega tarde —por el aviso, la página del pedido o el barrido—, la base frena con ella.
    // Solo la primera vez (un reintento no la cambia). Si falla, el pedido sigue: ese pago no frenará tarde.
    if (frenoClave) {
      const g = await admin.from("tienda_pagos").update({ freno_clave: frenoClave }).eq("id", porPagar.pagoId).is("freno_clave", null);
      if (g.error) registrarError("tienda", "FRENO_CLAVE", g.error);
    }
    // Sin tarjeta o sin correo en ESTA petición (el pedido existía de un intento en línea y este
    // reintento vino de otra forma): no se cobra nada; el seguimiento dirá cómo va.
    // Lo que se le cuenta a Mercado Pago del pedido (su antifraude lo pide, y su correo al comprador
    // deja de decir «Producto sin nombre»). Los renglones salen de cotizar ESTE carrito otra vez: si
    // no se puede, o si ya no suman lo que se cobra (un reintento con otro carrito), va un solo
    // artículo con el total (`articulosDeOrden`). Son datos del cliente: no van a ningún log.
    const cobro = !p.tarjeta || !p.cliente.email ? { tipo: "POR_CONFIRMAR" as const } : await cobrarPago(depsDePagos(admin, "tienda"), {
      pagoId: porPagar.pagoId, email: p.cliente.email, tarjeta: p.tarjeta,
      detalle: {
        descripcion: `Pedido ${porPagar.publico.folio_corto} en ${negocio.nombre}`,
        ...partesDeCotizacion((await admin.rpc("tienda_cotizar", carrito)).data),
        propina: porPagar.publico.propina_mxn,
        pagador: {
          nombre: p.cliente.nombre, telefono: p.cliente.telefono,
          direccion: p.direccion && { calle: p.direccion.calle, numero_exterior: p.direccion.numero_exterior, codigo_postal: p.direccion.codigo_postal, ciudad: p.direccion.ciudad, estado: p.direccion.estado },
        },
      },
    });
    if (cobro.tipo === "RECHAZADO") return rechazoDePago(admin, { negocio, ip, slug: p.negocio, motivo: cobro.motivo, frenoClave });
    if (cobro.tipo === "NO_PROCESADO") {
      // No fue el banco ni una tarjeta: no cuenta como tarjeta rechazada del negocio. Un token
      // inventado o usado sí cuenta para la IP que lo mandó (y solo para ella). En modo de prueba, nada.
      if (cobro.contarIp && !negocio.dePrueba) await anotarRechazo(admin, ip, p.negocio, "OTRO", true);
      return json({ error: "PAGO_NO_PROCESADO" }, 409);
    }
    if (cobro.tipo === "NO_DISPONIBLE") {
      // Mercado Pago rechazó las credenciales de la cuenta: seguir ofreciendo el pago ahí solo junta
      // clientes que no pueden pagar. Se pausa esa sucursal y se avisa a VIM. En modo de prueba no se
      // pausa ni se manda correo (el token de prueba se corrige a mano y se vuelve a probar): queda en el log.
      if (cobro.sinPermiso && negocio.dePrueba) registrarError("tienda", "PAGO_DE_PRUEBA_SIN_PERMISO", p.negocio);
      else if (cobro.sinPermiso) await pausarPagoEnLinea(admin, { p_tenant, sucursal: p_sucursal, negocio: negocio.nombre, slug: p.negocio, por: "SIN_PERMISO" });
      return json({ error: "PAGO_NO_DISPONIBLE" }, 409);
    }
    if (cobro.tipo === "POR_CONFIRMAR") return json({ codigo, ...porPagar.publico, pago: { estado: "POR_CONFIRMAR" } });
    // El banco quiere confirmar con el cliente: nada cobrado todavía. La dirección del reto va solo aquí.
    if (cobro.tipo === "VERIFICACION") return json({ codigo, ...porPagar.publico, pago: { estado: "VERIFICACION", url: cobro.url } });
    // Aprobado: el pedido ya está con el restaurante y su ventana de aceptación ya corre.
    const ya = await admin.from("delivery_pedidos").select("vence_aceptacion").eq("seguimiento_hash", p_seguimiento_hash).eq("tenant_id", p_tenant).maybeSingle();
    await correoDePagado(admin, porPagar.pagoId, { p_tenant, p_seguimiento_hash, email: p.cliente.email, negocio: negocio.nombre, slug: p.negocio, codigo });
    return json({
      codigo, ...porPagar.publico,
      vence_aceptacion: (ya.data as { vence_aceptacion: string | null } | null)?.vence_aceptacion ?? null,
      pago: { estado: "PAGADO" },
    });
  }

  const pedido = leerPedido(alta.data);
  if (!pedido) {
    // El pedido YA existe: el cliente recibe su código (con él lo sigue) aunque falte lo demás.
    registrarError("tienda", "PEDIDO_FORMA_INESPERADA", "tienda_crear_pedido no devolvió folio, total y vencimiento");
    return json({ codigo, folio_corto: null, total_mxn: null, vence_aceptacion: null });
  }

  // El correo de confirmación: después de responder, y pase lo que pase el pedido ya está creado.
  // Un reintento con la misma `clave` no lo repite (auditoría, B3): el pedido ya existía y su correo
  // salió con el primer envío; mandarlo otra vez —a la dirección que traiga el reintento, que puede
  // ser otra— sería correo nuestro en el buzón de quien no pidió nada.
  correoDeConfirmacion(admin, {
    p_tenant, p_seguimiento_hash, email: yaExistia(alta.data) ? null : p.cliente.email,
    negocio: negocio.nombre, slug: p.negocio, codigo, pagado: false,
  });

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
