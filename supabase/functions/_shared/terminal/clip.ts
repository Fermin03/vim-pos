// Clip PinPad (API de PinPad) para el cobro con terminal.
// Fuente: docs/integraciones/clip-pinpad/ (capturada el 8 oct 2026). NADA de esto está verificado
// contra un lector real: todo es lo que dice la documentación. Lo que además no confirma ni la
// documentación va marcado SIN VERIFICAR; se confirma con el lector (no hay simulador ni modo de prueba).
//
// Diferencias con Mercado Pago que importan aquí:
//   · No hay llave de idempotencia al crear: una petición sin respuesta NO se reintenta (quien llama
//     cancela por número de serie). Por eso un timeout o fallo de red no lanza: devuelve status 0.
//   · El aviso del webhook no trae firma ni datos: solo dice «algo cambió». Siempre se confirma con `consultar`.
//   · La propina puede venir aparte en `tip_amount` (SIN VERIFICAR si `paid_amount` la incluye).
import { aceptaCambio, type DatosCobro, type EstadoCobro, montoTexto, obj, txt } from "./comun.ts";

const API = "https://api.payclip.io/f2f/pinpad/v1";
const API_REEMBOLSOS = "https://api.payclip.com/refunds"; // otro dominio (.com), según post_refunds.md

/**
 * Los estados de la intención no están enumerados en la documentación: solo aparecen COMPLETED,
 * PENDING, PAYMENT_PENDING y FAILED. Todo menos COMPLETED es SIN VERIFICAR (cómo se ve un cobro
 * cancelado o pagado a medias, no se sabe). Uno desconocido, o un COMPLETED sin ninguna transacción
 * aprobada, nunca es APROBADO: es REVISAR.
 */
export function estadoDeIntencion(status: unknown, aprobadas: number): EstadoCobro {
  switch (status) {
    case "COMPLETED": return aprobadas > 0 ? "APROBADO" : "REVISAR";
    case "PENDING": case "PAYMENT_PENDING": return "EN_TERMINAL"; // SIN VERIFICAR
    case "FAILED": return "RECHAZADO"; // SIN VERIFICAR
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
  const aprobados = (Array.isArray(resultados) ? resultados : []).map(obj).filter((r) => r.status === "approved");
  const p = aprobados[0] ?? {};
  const medio = obj(p.payment_method);
  const suma = (k: string) => dinero(aprobados.reduce((s, r) => s + centavos(r[k]), 0));
  const ultimos4 = String(obj(medio.card).last_digits ?? "");
  return {
    estado: estadoDeIntencion(i.status, aprobados.length),
    detalle: txt(i.status),
    cobro_id: txt(i.reference),
    orden_id_externo: txt(i.pinpad_request_id),
    pago_id_externo: txt(p.transaction_id),
    tipo_tarjeta: txt(medio.type),
    marca: txt(medio.id),
    mensualidades: Number.isInteger(p.installments) ? p.installments as number : null,
    // SIN VERIFICAR: la intención no trae número de autorización; `receipt_no` es el de conciliación
    // de Clip y no sale en este ejemplo, así que se cae al id de la transacción.
    referencia: txt(p.receipt_no) ?? txt(p.transaction_id),
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
    /** Responde `pinpad_request_id`. SIN VERIFICAR: qué pasa con una `reference` repetida. */
    crearIntencion: (c: { cobroId: string; monto: string; serie: string; webhookUrl: string; imprime: boolean }) =>
      llamar("POST", ruta("/payment"), {
        amount: c.monto,
        reference: c.cobroId,
        serial_number_pos: c.serie,
        webhook_url: c.webhookUrl,
        preferences: {
          is_tip_enabled: false, is_msi_enabled: false, is_mci_enabled: false, is_dcc_enabled: false,
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

    /** Arreglo de lectores con `serial_number` y `status` (active, inactive, expired, unknown). Ver `lectoresDe`. */
    estadoLectores: () => llamar("GET", ruta("/devices/status")),

    /** Hasta 25 lectores por petición. `timeoutSeg: null` desactiva el timeout de inactividad. SIN VERIFICAR: que baste mandar solo `timeout_seg`. */
    configurarLectores: (series: string[], timeoutSeg: number | null) =>
      llamar("POST", ruta("/devices"), { devices: series, preferences: { timeout_seg: timeoutSeg } }),

    /**
     * Total o parcial, hasta 180 días. SIN VERIFICAR: que aplique a cobros de PinPad y que baste el
     * `transaction_id`. La llave dura 1 minuto. Requiere «balance» del día en la cuenta Clip.
     */
    reembolsar: (transactionId: string, monto: string) =>
      llamar("POST", API_REEMBOLSOS, { reference: { type: "transaction", id: transactionId }, amount: Number(monto) },
        { "idempotency-key": `reembolso-${transactionId}` }),
  };
}
