// Clip PinPad (API de PinPad) para el cobro con terminal.
// Fuente: docs/integraciones/clip-pinpad/ (capturada el 8 oct 2026). NADA de esto está verificado
// contra un lector real: todo es lo que dice la documentación. Lo que además no confirma ni la
// documentación va marcado SIN VERIFICAR; se confirma con el lector (no hay simulador ni modo de prueba).
//
// Diferencias con Mercado Pago que importan aquí:
//   · No hay llave de idempotencia al crear: una petición sin respuesta NO se reintenta (quien llama
//     cancela por número de serie). Por eso un timeout o fallo de red no lanza: devuelve status 0.
//   · El aviso del webhook no trae firma ni datos: solo dice «algo cambió». Siempre se confirma con `consultar`.
//   · La propina llega en `tip_amount`, y `paid_amount`/`amount_paid` YA la incluyen (VERIFICADO 21 oct:
//     amount 1, tip_amount 0.2, paid_amount 1.2). `amount` es el monto sin propina.
//
// Confirmado por Clip por correo (Amilcar Navarro, 21 oct 2026): los estados de la intención, que
// `amount` va como número, el filtro `serial_number` de devices/status, que /refunds acepta cobros de
// PinPad, que el aviso no se puede firmar y que se reintenta (5 veces en 1–5 s, luego cada 2–3 min).
import { aceptaCambio, type DatosCobro, type EstadoCobro, montoTexto, obj, txt } from "./comun.ts";

const API = "https://api.payclip.io/f2f/pinpad/v1";
const API_REEMBOLSOS = "https://api.payclip.com/refunds"; // otro dominio (.com), según post_refunds.md

/**
 * Estados de la intención según Clip (sin kiosco ni pago dividido): PENDING, IN_PROCESS, CANCELED
 * (en el lector o por API), REJECTED (falló, o el operador lo canceló en el lector) y APPROVED.
 * COMPLETED sale en el ejemplo de la documentación y se trata igual que APPROVED. Uno desconocido,
 * o un aprobado sin ninguna transacción aprobada, nunca es APROBADO: es REVISAR.
 */
export function estadoDeIntencion(status: unknown, aprobadas: number): EstadoCobro {
  switch (status) {
    case "APPROVED": case "COMPLETED": return aprobadas > 0 ? "APROBADO" : "REVISAR";
    case "PENDING": case "IN_PROCESS": return "EN_TERMINAL";
    case "CANCELED": return "CANCELADO";
    case "REJECTED": return "RECHAZADO";
    default: return "REVISAR";
  }
}

/**
 * Para el aviso de Clip: como aceptaCambio, y además un cobro ya cerrado (RECHAZADO, CANCELADO,
 * VENCIDO) solo se reabre si Clip dice que se pagó. Un estado desconocido tras cancelar desde la
 * caja (→ REVISAR) no lo reabre. Mercado Pago sigue con aceptaCambio tal cual.
 */
export function aceptaCambioClip(actual: EstadoCobro, nuevo: EstadoCobro): boolean {
  if (actual === "RECHAZADO" || actual === "CANCELADO" || actual === "VENCIDO") return nuevo === "APROBADO";
  return aceptaCambio(actual, nuevo);
}

/** La documentación muestra los montos de `detail.results[]` como número y como texto: se aceptan los dos. */
const centavos = (v: unknown): number => Math.round(Number(montoTexto(v) ?? 0) * 100);
const dinero = (c: number): string | null => (c > 0 ? (c / 100).toFixed(2) : null);

/** Lo que guardamos de una intención (consulta con `Pinpad-Include-Detail: true`). */
export function datosDeIntencion(intencion: unknown): DatosCobro {
  const i = obj(intencion);
  const resultados = obj(i.detail).results;
  const aprobados = (Array.isArray(resultados) ? resultados : []).map(obj).filter((r) => String(r.status).toLowerCase() === "approved"); // SIN VERIFICAR: en minúsculas en la documentación
  const p = aprobados[0] ?? {};
  const medio = obj(p.payment_method);
  const suma = (k: string) => dinero(aprobados.reduce((s, r) => s + centavos(r[k]), 0));
  const ultimos4 = String(obj(medio.card).last_digits ?? "");
  return {
    estado: estadoDeIntencion(i.status, aprobados.length),
    // VERIFICADO (21 oct): un REJECTED trae el motivo en `error.code` (CD-PROCESS-AS-CHIP,
    // TX-CANCELLED-BY-PAUSE); la caja lo traduce para la cajera.
    detalle: txt(obj(i.error).code) ?? txt(i.status),
    cobro_id: txt(i.reference),
    orden_id_externo: txt(i.pinpad_request_id),
    pago_id_externo: txt(p.transaction_id),
    tipo_tarjeta: txt(medio.type),
    marca: txt(medio.id),
    mensualidades: Number.isInteger(p.installments) ? p.installments as number : null,
    // VERIFICADO con un cobro real (21 oct): la autorización del banco viene en
    // `private_data.psp_data.authorization_id` («000154»); si falta, el recibo de Clip.
    referencia: txt(obj(obj(p.private_data).psp_data).authorization_id) ?? txt(p.receipt_no) ?? txt(p.transaction_id),
    pagado_mxn: suma("paid_amount"),
    reembolsado_mxn: suma("amount_refunded"),
    propina_mxn: suma("tip_amount"),
    tarjeta_ultimos4: /^\d{4}$/.test(ultimos4) ? ultimos4 : null,
  };
}

export type RespuestaClip = { status: number; cuerpo: unknown; codigo: string | null };

/** 401 = clave mala; ERR10_04 y PINPAD_TERMINAL_TIMEOUT_EXCEPTION = lector apagado, sin internet o con la app cerrada. */
export function codigoDeErrorClip(r: RespuestaClip): "CONEXION_INVALIDA" | "TERMINAL_NO_DISPONIBLE" | "NO_SE_PUDO_CREAR" {
  if (r.status === 401) return "CONEXION_INVALIDA";
  const c = r.codigo ?? txt(obj(r.cuerpo).code) ?? txt(obj(r.cuerpo).error_code);
  return c === "ERR10_04" || c === "PINPAD_TERMINAL_TIMEOUT_EXCEPTION" ? "TERMINAL_NO_DISPONIBLE" : "NO_SE_PUDO_CREAR";
}

/** Los lectores de `devices/status`: un arreglo (lo documentado) o, por si acaso, `{ devices: [...] }`. */
export function lectoresDe(cuerpo: unknown): { serie: string; estado: string }[] {
  const lista = Array.isArray(cuerpo) ? cuerpo : obj(cuerpo).devices;
  return (Array.isArray(lista) ? lista : []).map(obj)
    .map((d) => ({ serie: txt(d.serial_number), estado: txt(d.status) }))
    .filter((d): d is { serie: string; estado: string } => d.serie !== null && d.estado !== null);
}

/** Cliente mínimo. `apiKey` y `secreto` son las del Panel de Desarrollador de Clip del restaurante. */
export function clienteClip(apiKey: string, secreto: string, pedir: typeof fetch = fetch, esperaMs = 15000) {
  const autorizacion = `Basic ${btoa(`${apiKey}:${secreto}`)}`;
  const llamar = async (metodo: string, url: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<RespuestaClip> => {
    try {
      const r = await pedir(url, {
        method: metodo,
        headers: { Authorization: autorizacion, "Content-Type": "application/json", ...extra },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(esperaMs),
      });
      const texto = await r.text();
      let json: unknown = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* cuerpo no JSON */ }
      return { status: r.status, cuerpo: json, codigo: txt(obj(json).code) ?? txt(obj(json).error_code) };
    } catch {
      return { status: 0, cuerpo: null, codigo: null }; // sin respuesta: no se sabe si Clip la recibió
    }
  };
  const ruta = (r: string) => API + r;

  return {
    /**
     * Responde `pinpad_request_id`. Una `reference` repetida no se rechaza y confunde los estados
     * (Clip): cada intento lleva un id de cobro nuevo. `amount` va como número (Clip).
     * `propinas`: los porcentajes que el lector le ofrece al cliente; sin ellos no pregunta propina.
     */
    crearIntencion: (c: { cobroId: string; monto: string; serie: string; webhookUrl: string; imprime: boolean; propinas?: number[] | null }) =>
      llamar("POST", ruta("/payment"), {
        amount: Number(c.monto),
        reference: c.cobroId,
        serial_number_pos: c.serie,
        webhook_url: c.webhookUrl,
        preferences: {
          ...(c.propinas?.length ? { is_tip_enabled: true, tip_options: c.propinas } : { is_tip_enabled: false }),
          is_msi_enabled: false, is_mci_enabled: false, is_dcc_enabled: false,
          is_retry_enabled: true, is_split_payment_enabled: false, is_share_enabled: false,
          is_auto_return_enabled: true, is_auto_print_receipt_enabled: c.imprime,
        },
      }),

    consultar: (pinpadId: string) =>
      llamar("GET", ruta(`/payment?pinpadRequestId=${encodeURIComponent(pinpadId)}`), undefined, { "Pinpad-Include-Detail": "true" }),

    /** Solo mientras el lector no haya tomado el cobro; después se cancela en el lector. */
    cancelar: (pinpadId: string) => llamar("DELETE", ruta(`/payment/${encodeURIComponent(pinpadId)}`)),

    /** Cancela lo que tenga ese lector (para una creación sin respuesta, cuando no se conoce el id). */
    cancelarPorSerie: (serie: string) => llamar("DELETE", ruta(`/payment/serial-number/${encodeURIComponent(serie)}`)),

    /** Arreglo de lectores con `serial_number` y `status` (active, inactive, expired, unknown). Ver `lectoresDe`. Con `serie`, solo ese lector. */
    estadoLectores: (serie?: string) =>
      llamar("GET", ruta(`/devices/status${serie ? `?serial_number=${encodeURIComponent(serie)}` : ""}`)),

    /** Hasta 25 lectores por petición. `timeoutSeg: null` desactiva el timeout de inactividad. SIN VERIFICAR: que baste mandar solo `timeout_seg`. */
    configurarLectores: (series: string[], timeoutSeg: number | null) =>
      llamar("POST", ruta("/devices"), { devices: series, preferences: { timeout_seg: timeoutSeg } }),

    /**
     * Total o parcial, hasta 180 días. Acepta cobros de PinPad. VERIFICADO (21 oct, $1 real):
     * con `transaction_id` responde 201 `approved` («Cancelled» el mismo día); con el `id` del
     * resultado responde 404 CL1301. La llave dura
     * 1 minuto. Requiere «balance» del día en la cuenta Clip.
     */
    reembolsar: (transactionId: string, monto: string) =>
      llamar("POST", API_REEMBOLSOS, { reference: { type: "transaction", id: transactionId }, amount: Number(monto) },
        { "idempotency-key": `reembolso-${transactionId}` }),
  };
}
