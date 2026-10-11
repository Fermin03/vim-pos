// Lo que se hace con un pago en línea de la tienda, paso a paso: cobrarlo, confirmarlo, devolverlo. Es EL camino compartido: el aviso de Mercado Pago (`tienda-webhook-mp`), el respaldo
// desde la página de seguimiento (`tienda`, acción `confirmar_pago`) y el barrido de cada minuto
// pasan por `confirmarPago`, así que los tres deciden lo mismo.
//
// Regla de todo el archivo: lo que llega de fuera (un aviso) es solo una pista.
// La verdad se le pregunta a Mercado Pago con el token del restaurante dueño de ESE pago, y lo que
// mueve el pedido es la base (0172), que es idempotente.
//
// No toca la base ni la red directamente: recibe un puerto (pago-puerto.ts lo arma con supabase-js)
// y el cliente de Mercado Pago. Así se prueba con `node --test` y dobles.
import { esc, soloAscii } from "../correo.ts";
import { type ClienteMpTienda, cuerpoDeCobro, type DatosCobro, decidirPago, type MotivoDeRechazo, motivoDeRechazo, pagosDeBusqueda, pagoVivo, respuestaDeCobro, resumenDeFallo } from "./pago-mp.ts";

export type EstadoPago = "CREADO" | "APROBADO" | "RECHAZADO" | "VENCIDO" | "POR_DEVOLVER" | "DEVUELTO" | "DEVOLUCION_FALLIDA";

/** Un renglón de tienda_pagos con lo de su conexión que hace falta para creerle a un pago. */
export type FilaPago = {
  id: string; conexion_id: string; estado: EstadoPago;
  /** Total + propina, texto con dos decimales. */
  monto: string;
  /** El cobro ya se le mandó a Mercado Pago (tienda_pagos.cobro_pedido_at). */
  cobro_mandado: boolean;
  cuenta_vendedora: string; de_prueba: boolean;
};

export type Aplicado = { estado: string; pedido_estado: string; recien_aprobado: boolean };
export type Tarea = { id: string; tarea: "DEVOLVER" | "CONCILIAR"; conexion_id: string; pago_id_externo: string | null };

export type PuertoPagos = {
  leerPago(pagoId: string): Promise<FilaPago | null>;
  /** El Access Token del restaurante (Vault). null = no hay con qué hablarle a Mercado Pago. */
  token(conexionId: string): Promise<string | null>;
  /** ¿Me toca mandar el cobro? Verdadero UNA sola vez por pago. */
  tomarCobro(pagoId: string): Promise<boolean>;
  descartar(pagoId: string): Promise<boolean>;
  aplicar(pagoId: string, d: { resultado: "APROBADO" | "RECHAZADO" | "DEVUELTO"; pagoIdExterno: string; monto: string;
                               tipoTarjeta: string | null; marca: string | null; detalle: string | null }): Promise<Aplicado>;
  tomar(max: number): Promise<Tarea[]>;
  /** Cómo le fue a la devolución. Devuelve el estado en que queda el pago. */
  devolucion(pagoId: string, ok: boolean, error?: string): Promise<string>;
  /** Cómo le fue a una consulta del barrido. TRUE = es el tercer fallo seguido: hay que avisar a VIM. */
  conciliacion(pagoId: string, ok: boolean): Promise<boolean>;
};

export type Deps = {
  db: PuertoPagos;
  mp: (token: string) => ClienteMpTienda;
  /** Al log, con un código. Nunca lleva tokens ni el cuerpo de una respuesta. */
  registrar: (codigo: string, detalle: string) => void;
};

// ── Cobrar ───────────────────────────────────────────────────────────────────────────────────────

export type Cobro =
  /** El pedido ya está RECIBIDO. `recienAprobado`: se aprobó en esta llamada (toca mandar el correo). */
  | { tipo: "APROBADO"; recienAprobado: boolean }
  /** Mercado Pago dijo que no, seguro. El pedido se descartó: no existe y no se cobró nada. */
  | { tipo: "RECHAZADO"; motivo: MotivoDeRechazo }
  /** No se sabe si se cobró. El pedido queda POR_PAGAR y lo resuelven el aviso, la página y el barrido. */
  | { tipo: "POR_CONFIRMAR" }
  /** No hay con qué cobrar (la cuenta del restaurante se desconectó). El pedido se descartó. */
  | { tipo: "NO_DISPONIBLE" };

/**
 * Cobra el pago de un pedido recién creado y dice cómo quedó. Tres reglas:
 *   · un renglón de tienda_pagos se cobra UNA vez. Si esta llamada no es la primera (un reintento
 *     del mismo intento de compra porque la respuesta se perdió), NO vuelve a cobrar: le pregunta a
 *     Mercado Pago qué pasó con el primer cobro;
 *   · «rechazado» solo se dice con un NO seguro de Mercado Pago (un pago `rejected`, o un 4xx de
 *     validación: no creó ningún pago). Sin respuesta, un 5xx o un estado que no es final nunca son
 *     «rechazado»: quedan POR_CONFIRMAR;
 *   · un pago aprobado se cree después de `decidirPago` (referencia, cuenta vendedora, moneda,
 *     modo) y de que la base compruebe el monto.
 */
export async function cobrarPago(deps: Deps, datos: Omit<DatosCobro, "monto">): Promise<Cobro> {
  const fila = await deps.db.leerPago(datos.pagoId);
  if (!fila) return { tipo: "POR_CONFIRMAR" };
  if (fila.estado === "APROBADO") return { tipo: "APROBADO", recienAprobado: false };
  if (fila.estado !== "CREADO") return { tipo: "POR_CONFIRMAR" };

  /** Un NO seguro: el pedido se va. Si ya no se puede descartar, es que algo lo movió: que lo diga el seguimiento. */
  const descartar = async (resultado: Cobro): Promise<Cobro> => ((await deps.db.descartar(fila.id)) ? resultado : { tipo: "POR_CONFIRMAR" });

  // El token, ANTES de marcar el cobro como mandado: sin él no sale ningún cobro, y el renglón no
  // debe quedar como «mandado» (obligaría al cliente a esperar la conciliación de algo que no existió).
  const token = await deps.db.token(fila.conexion_id);
  if (!token && !fila.cobro_mandado) {
    deps.registrar("SIN_TOKEN", `conexión ${fila.conexion_id}`);
    return descartar({ tipo: "NO_DISPONIBLE" });
  }

  if (!(await deps.db.tomarCobro(fila.id))) {
    // Ya se mandó antes. Se pregunta, no se cobra.
    const c = await confirmarPago(deps, fila.id);
    const ahora = c.ok ? await deps.db.leerPago(fila.id) : null;
    return ahora?.estado === "APROBADO" ? { tipo: "APROBADO", recienAprobado: c.ok && c.recienAprobado } : { tipo: "POR_CONFIRMAR" };
  }

  // (Sin token y con el cobro ya mandado no se llega aquí: `tomarCobro` dio falso arriba.)
  if (!token) return { tipo: "POR_CONFIRMAR" };
  const r = await deps.mp(token).cobrar(cuerpoDeCobro({ ...datos, monto: fila.monto }), `tienda-pago-${fila.id}`, datos.tarjeta.dispositivo);
  const que = respuestaDeCobro(r.status);
  if (que === "SIN_PERMISO") {
    // No se toca la conexión: la comparte la terminal, y un 401 aquí puede ser solo de credenciales de prueba.
    deps.registrar("COBRO_SIN_PERMISO", `conexión ${fila.conexion_id}: ${resumenDeFallo(r)}`);
    return descartar({ tipo: "NO_DISPONIBLE" });
  }
  if (que === "NO_ACEPTADO") {
    deps.registrar("COBRO", resumenDeFallo(r));
    return descartar({ tipo: "RECHAZADO", motivo: "OTRO" });
  }
  if (que === "NO_SE_SABE") {
    deps.registrar("COBRO_SIN_RESPUESTA", `pago ${fila.id}: ${resumenDeFallo(r)}`);
    return { tipo: "POR_CONFIRMAR" };
  }

  const d = decidirPago({ pagoId: fila.id, cuentaVendedora: fila.cuenta_vendedora, dePrueba: fila.de_prueba }, r.cuerpo);
  if (d.tipo === "RECHAZADO") return descartar({ tipo: "RECHAZADO", motivo: motivoDeRechazo(d.detalle) });
  if (d.tipo !== "APROBADO") {
    // Pendiente, ajeno, incidente o ya devuelto: no es un sí ni un no. Lo resuelve la conciliación.
    deps.registrar("COBRO_SIN_RESULTADO", `pago ${fila.id}: ${d.tipo}${"motivo" in d ? ` (${d.motivo})` : ""}`);
    return { tipo: "POR_CONFIRMAR" };
  }
  const a = await deps.db.aplicar(fila.id, {
    resultado: "APROBADO", pagoIdExterno: d.pagoIdExterno, monto: d.monto, tipoTarjeta: d.tipoTarjeta, marca: d.marca, detalle: d.detalle,
  });
  // La base no lo tomó como EL pago del pedido (el monto no era el esperado): ya quedó por devolverse.
  return a.estado === "APROBADO" ? { tipo: "APROBADO", recienAprobado: a.recien_aprobado } : { tipo: "POR_CONFIRMAR" };
}

// ── Confirmar ────────────────────────────────────────────────────────────────────────────────────

export type Confirmacion =
  | { ok: true; aplicados: number; recienAprobado: boolean }
  /**
   * PAGO_DESCONOCIDO y NO_ENCONTRADO: no hay nada que reintentar. SIN_TOKEN y MP_NO_RESPONDE: sí.
   * PAGO_SIN_APLICAR: Mercado Pago tiene un pago VIVO con nuestra referencia (aprobado o pendiente)
   * que no se pudo aplicar. No es «sin pago»: puede haber dinero del cliente. La conciliación no
   * cuenta como buena, el seguimiento sigue «confirmando» y el barrido acaba avisando a VIM.
   */
  | { ok: false; motivo: "PAGO_DESCONOCIDO" | "NO_ENCONTRADO" | "SIN_TOKEN" | "MP_NO_RESPONDE" | "PAGO_SIN_APLICAR" };

/**
 * Le pregunta a Mercado Pago por un pago nuestro y aplica lo que diga. Con `pagoIdExterno` (la
 * pista de un aviso) consulta ESE pago; sin él, busca los que traigan nuestra referencia.
 * Siempre con el token del restaurante dueño del pago, y cada pago pasa por `decidirPago`
 * (referencia, cuenta vendedora, moneda) antes de tocar nada; el monto lo comprueba la base.
 * Repetirla, o correrla dos veces a la vez, deja lo mismo.
 */
export async function confirmarPago(deps: Deps, pagoId: string, pagoIdExterno?: string): Promise<Confirmacion> {
  const fila = await deps.db.leerPago(pagoId);
  if (!fila) return { ok: false, motivo: "PAGO_DESCONOCIDO" };
  const token = await deps.db.token(fila.conexion_id);
  if (!token) {
    deps.registrar("SIN_TOKEN", `conexión ${fila.conexion_id}`);
    return { ok: false, motivo: "SIN_TOKEN" };
  }
  const mp = deps.mp(token);
  const r = pagoIdExterno ? await mp.leerPago(pagoIdExterno) : await mp.buscarPagos(fila.id);
  if (r.status !== 200) {
    // 404 a un pago concreto: ese id no es de esta cuenta (o no existe). No es nuestro.
    if (pagoIdExterno && r.status === 404) return { ok: false, motivo: "NO_ENCONTRADO" };
    deps.registrar("CONSULTAR", resumenDeFallo(r));
    return { ok: false, motivo: "MP_NO_RESPONDE" };
  }

  const esperado = { pagoId: fila.id, cuentaVendedora: fila.cuenta_vendedora, dePrueba: fila.de_prueba };
  let aplicados = 0, recienAprobado = false;
  const pagos = pagoIdExterno ? [r.cuerpo] : pagosDeBusqueda(r.cuerpo);
  const decisiones = pagos.map((pago) => decidirPago(esperado, pago));
  // Un pago vivo que trae NUESTRA referencia y que no se puede aplicar (sin cuenta vendedora, otro
  // modo, sin acreditar, otra moneda, pendiente): se deja dicho con su id y su motivo.
  let sinAplicar = false;
  pagos.forEach((pago, i) => {
    const d = decisiones[i]!;
    const nuestro = (pago as { external_reference?: unknown } | null)?.external_reference === fila.id;
    if ("motivo" in d && nuestro && pagoVivo(pago)) {
      sinAplicar = true;
      if (d.tipo !== "PENDIENTE") deps.registrar("PAGO_SIN_APLICAR", `pago ${fila.id}, id en Mercado Pago ${String((pago as { id?: unknown } | null)?.id ?? "?").slice(0, 30)}: ${d.tipo} (${d.motivo})`);
    }
  });
  // El aprobado va primero: un rechazo cierra el pedido que espera, y un aprobado que se aplicara
  // después de él acabaría devuelto.
  for (const d of [...decisiones.filter((x) => x.tipo === "APROBADO"), ...decisiones.filter((x) => x.tipo !== "APROBADO")]) {
    // Sin resultado que aplicar: pendiente (no hay nada que hacer todavía), ajeno o incidente (al log).
    if ("motivo" in d) {
      if (d.tipo !== "PENDIENTE") deps.registrar(d.tipo, `pago ${fila.id}: ${d.motivo}`);
      continue;
    }
    const a = await deps.db.aplicar(fila.id, {
      resultado: d.tipo, pagoIdExterno: d.pagoIdExterno, monto: d.monto, tipoTarjeta: d.tipoTarjeta, marca: d.marca, detalle: d.detalle,
    });
    aplicados++;
    recienAprobado ||= a.recien_aprobado;
  }
  // Con uno aprobado ya aplicado, el pedido tiene su pago: lo demás no cambia eso.
  if (sinAplicar && !recienAprobado && (await deps.db.leerPago(fila.id))?.estado !== "APROBADO") return { ok: false, motivo: "PAGO_SIN_APLICAR" };
  return { ok: true, aplicados, recienAprobado };
}

/**
 * Qué se le contesta a Mercado Pago tras un aviso. 200 = entendido, no lo repitas (también cuando
 * la referencia o el pago no son nuestros). 503 = no se pudo consultar: que lo reintente.
 */
export function respuestaDeConfirmacion(c: Confirmacion): 200 | 503 {
  // PAGO_SIN_APLICAR: repetir el aviso no lo arregla (lo sigue el barrido): 200.
  return c.ok || c.motivo === "PAGO_DESCONOCIDO" || c.motivo === "NO_ENCONTRADO" || c.motivo === "PAGO_SIN_APLICAR" ? 200 : 503;
}

// ── Devolver ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve completo un pago POR_DEVOLVER. La llave de idempotencia es fija por pago: si el intento
 * anterior sí llegó a Mercado Pago y no nos enteramos, este no devuelve dos veces. Si la devolución
 * falla, se mira el pago: puede que ya esté devuelto (lo hizo el restaurante desde su cuenta).
 * Devuelve el estado en que queda: DEVUELTO, POR_DEVOLVER (se reintentará) o DEVOLUCION_FALLIDA.
 */
export async function devolverPago(deps: Deps, t: Pick<Tarea, "id" | "conexion_id" | "pago_id_externo">): Promise<string> {
  if (!t.pago_id_externo) return deps.db.devolucion(t.id, false, "sin id de pago en Mercado Pago");
  const token = await deps.db.token(t.conexion_id);
  if (!token) return deps.db.devolucion(t.id, false, "sin token de la cuenta del restaurante");
  const mp = deps.mp(token);
  const r = await mp.devolver(t.pago_id_externo, `devolucion-${t.id}`);
  if (r.status === 200 || r.status === 201) return deps.db.devolucion(t.id, true);
  const ahora = await mp.leerPago(t.pago_id_externo);
  if (ahora.status === 200 && (ahora.cuerpo as { status?: unknown } | null)?.status === "refunded") return deps.db.devolucion(t.id, true);
  return deps.db.devolucion(t.id, false, resumenDeFallo(r));
}

/**
 * La pasada de cada minuto: devuelve lo que toca y le pregunta a Mercado Pago una última vez por
 * los pagos que nadie confirmó. Un fallo en una tarea no detiene las demás.
 * `avisar` se llama una vez por cada devolución que se dio por fallida (tercer intento) y una vez
 * por cada pago por el que no se ha podido preguntar tres veces seguidas (cuenta desconectada, token
 * rechazado): ahí puede haber un cobro sin pedido, y nadie más lo va a ver.
 * ponytail: de una en una y hasta 10 por pasada; con el tope de 10 s por llamada cabe en una
 * invocación. Si un día hay cola, subir el tope o repartir en paralelo por conexión.
 */
export async function barrer(deps: Deps, avisar: (t: Tarea, de: "DEVOLUCION" | "CONCILIACION") => Promise<void>): Promise<{ devueltos: number; fallidos: number; conciliados: number; sinConsultar: number }> {
  const cuenta = { devueltos: 0, fallidos: 0, conciliados: 0, sinConsultar: 0 };
  for (const t of await deps.db.tomar(10)) {
    try {
      if (t.tarea === "DEVOLVER") {
        const estado = await devolverPago(deps, t);
        if (estado === "DEVUELTO") cuenta.devueltos++;
        if (estado === "DEVOLUCION_FALLIDA") { cuenta.fallidos++; await avisar(t, "DEVOLUCION"); }
      } else {
        // Solo cuenta si Mercado Pago contestó. Si no, la base lleva la cuenta de los fallos, espacia
        // las consultas y dice cuándo avisar; el seguimiento, mientras, no afirma «sin pago».
        const c = await confirmarPago(deps, t.id);
        if (c.ok) cuenta.conciliados++; else cuenta.sinConsultar++;
        if (await deps.db.conciliacion(t.id, c.ok)) await avisar(t, "CONCILIACION");
      }
    } catch (e) {
      deps.registrar("BARRIDO", `pago ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return cuenta;
}

/** Un tope de `consumirCupo` (misma forma que `Cupo` de _shared/limite.ts). */
type Tope = { clave: string; ventanaSeg: number; max: number };

/**
 * Los topes de un aviso de Mercado Pago, que llega sin autenticar (la firma puede faltar).
 *   · Con una referencia que NO es nuestra: una bolsa aparte. No cuesta ninguna consulta a Mercado
 *     Pago, y agotarla no le quita ni un aviso a los pagos de verdad.
 *   · Con una referencia nuestra: el tope de ESA referencia primero, y solo después el global. La
 *     referencia no es secreta (el comprador la ve en la URL con que Mercado Pago lo regresa), así
 *     que su tope es lo que acota lo que un comprador puede forzar: 40 consultas por hora con el
 *     token de ese restaurante. Como va antes, quien insiste con una referencia agota la suya y
 *     deja de gastar el global.
 */
export function topesDelAviso(ref: string, esNuestra: boolean): Tope[] {
  if (!esNuestra) return [{ clave: "mp-tienda:ref-desconocida", ventanaSeg: 3600, max: 600 }];
  return [
    { clave: `mp-tienda:aviso:${ref.toLowerCase()}`, ventanaSeg: 3600, max: 40 },
    { clave: "mp-tienda:avisos", ventanaSeg: 3600, max: 3000 },
  ];
}

/**
 * El correo interno a VIM cuando no se ha podido preguntar tres veces seguidas a Mercado Pago por un
 * pago que nadie confirmó. Puede haber un cobro hecho y el pedido vencido como si no se hubiera pagado.
 */
export function avisoDeConciliacionFallida(d: { pagoId: string; negocio: string; folio: string; monto: string }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Posible cobro sin pedido: ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>No se ha podido consultar a Mercado Pago tres veces seguidas por un cobro en línea del que no se supo el resultado. <strong>Puede haber un cobro hecho sin pedido.</strong></p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto esperado: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id): ${esc(d.pagoId)}</li></ul>
<p>Lo más probable es que el restaurante desconectó su cuenta de Mercado Pago o que su token fue rechazado. Se seguirá intentando una vez por hora durante 48 horas: si reconecta la cuenta, el cobro se encuentra y se devuelve solo. Si no, hay que buscar en su cuenta de Mercado Pago un pago con esa referencia y devolverlo a mano.</p>
</div>`,
  };
}

/**
 * El correo interno a VIM cuando una devolución falló tres veces. Lleva solo lo nuestro (negocio,
 * folio, monto y el id del pago en tienda_pagos): ni datos del cliente ni de la tarjeta.
 */
export function avisoDeDevolucionFallida(d: { pagoId: string; negocio: string; folio: string; monto: string; error: string }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Devolucion fallida: pedido ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>La devolución automática de un pago en línea falló tres veces y ya no se reintenta sola.</p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id): ${esc(d.pagoId)}</li><li>Último error: ${esc(d.error)}</li></ul>
<p>Lo más probable es que la cuenta de Mercado Pago del restaurante no tenga saldo disponible. Cuando lo tenga, se devuelve desde su cuenta de Mercado Pago, o se vuelve a encolar poniendo el pago en POR_DEVOLVER con intentos en 0.</p>
</div>`,
  };
}
