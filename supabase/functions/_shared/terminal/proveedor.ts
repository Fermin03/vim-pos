// La terminal de una conexión, sea del proveedor que sea. terminal-cobro solo habla con esta interfaz.
// Módulo puro (node --test): la base y Deno.env los pone quien llama.
//
// El adaptador de Mercado Pago hace exactamente las mismas peticiones y lee las respuestas igual que
// terminal-cobro antes de esta interfaz (proveedor.test.ts lo fija). Knock-Out cobra con él a diario.
import { registrarError } from "../errores.ts";
import { clienteClip, codigoDeErrorClip, datosDeIntencion, lectoresDe } from "./clip.ts";
import type { DatosCobro } from "./comun.ts";
import { clienteMp, datosDeOrden } from "./mercado-pago.ts";

export type NombreProveedor = "MERCADO_PAGO" | "CLIP";
/** Lo que guarda Vault. Clip: la API key en `access_token` y la clave secreta en `refresh_token`. */
export type Credencial = { access_token: string | null; refresh_token: string | null };
export type ResultadoCrear = { ok: true; datos: DatosCobro } | { ok: false; codigo: string; sinRespuesta?: boolean };
/** HECHA trae lo que dijo el proveedor del cobro cancelado, para aplicarlo ya. */
export type ResultadoCancelar = { cancelacion: "HECHA" | "PEDIDA" | "FALLO"; datos: DatosCobro | null };

export interface Proveedor {
  /** `propinas`: solo Clip, los porcentajes que el lector ofrece (null = no pregunta propina). Mercado Pago lo ignora. */
  crear(c: { cobroId: string; monto: string; terminal: string; folio: string | null; esperaSeg: number; imprime: boolean; propinas?: number[] | null }): Promise<ResultadoCrear>;
  /** null si el proveedor no contestó bien (queda en el log). */
  consultar(ordenId: string): Promise<DatosCobro | null>;
  cancelar(ordenId: string): Promise<ResultadoCancelar>;
  reembolsar(c: { ordenId: string; pagoId: string | null; monto: string }): Promise<{ ok: true } | { ok: false; motivo: string }>;
  /** ¿El lector de esa caja puede recibir un cobro ahora? Mercado Pago: siempre true. */
  lectorListo(terminal: string): Promise<boolean>;
}

const log = (codigo: string, r: { status: number; codigo: string | null }) =>
  registrarError("terminal-cobro", codigo, `HTTP ${r.status} ${r.codigo ?? ""}`);

function mercadoPago(token: string, pedir: typeof fetch): Proveedor {
  const mp = clienteMp(token, pedir);
  return {
    async crear(c) {
      const r = await mp.crearOrden({
        cobroId: c.cobroId, monto: c.monto, terminalId: c.terminal,
        descripcion: c.folio ? `Ticket ${c.folio}` : "Cobro en caja",
        esperaSeg: c.esperaSeg, imprime: c.imprime,
      });
      if (r.status === 201 || r.status === 200) return { ok: true, datos: datosDeOrden(r.cuerpo) };
      const codigo = r.status === 401 ? "CONEXION_INVALIDA"
        : r.codigo?.startsWith("already_queued_order") ? "TERMINAL_OCUPADA" // real: …_on_terminal; la referencia dice …_for_terminal
        : r.codigo === "forbidden_checking_terminal_owner" ? "TERMINAL_AJENA" : "NO_SE_PUDO_CREAR";
      log(codigo, r);
      return { ok: false, codigo };
    },
    async consultar(ordenId) {
      const r = await mp.consultarOrden(ordenId);
      if (r.status === 200) return datosDeOrden(r.cuerpo, ordenId);
      log("CONSULTAR", r);
      return null;
    },
    async cancelar(ordenId) {
      const r = await mp.cancelarOrden(ordenId);
      // 202 = pedido, no hecho: el estado sigue EN_TERMINAL hasta el aviso (o el respaldo).
      if (r.status === 200) return { cancelacion: "HECHA", datos: datosDeOrden(r.cuerpo, ordenId) };
      if (r.status === 202) return { cancelacion: "PEDIDA", datos: null };
      log("CANCELAR", r);
      return { cancelacion: "FALLO", datos: null };
    },
    async reembolsar(c) {
      const r = await mp.reembolsarOrden(c.ordenId);
      if (r.status === 201 || r.status === 200) return { ok: true };
      return { ok: false, motivo: r.status === 401 ? "CONEXION_INVALIDA" : (r.codigo ?? `HTTP_${r.status}`) };
    },
    lectorListo: () => Promise.resolve(true),
  };
}

/**
 * Esperas de Clip (ms). El puente de la caja instalada corta terminal-cobro a los 25 s
 * (desktop/src/gateway.mjs): crear + cancelar por serie tiene que caber de sobra, o la caja
 * reintenta con otro id mientras el primero queda en REVISAR.
 */
export const ESPERA_CLIP = { crear: 10_000, cancelarPorSerie: 8_000, lectores: 5_000, resto: 15_000 };

function clip(apiKey: string, secreto: string, base: string, pedir: typeof fetch): Proveedor {
  const con = (ms: number) => clienteClip(apiKey, secreto, pedir, ms);
  const api = con(ESPERA_CLIP.resto);
  return {
    async crear(c) {
      // La espera no va por cobro: es el `timeout_seg` del lector, que se manda al guardar la configuración.
      const r = await con(ESPERA_CLIP.crear).crearIntencion({
        cobroId: c.cobroId, monto: c.monto, serie: c.terminal, imprime: c.imprime, propinas: c.propinas,
        webhookUrl: `${base}/functions/v1/terminal-webhook-clip?c=${encodeURIComponent(c.cobroId)}`,
      });
      const datos = datosDeIntencion(r.cuerpo);
      // Sin respuesta no se sabe si Clip la recibió y no hay llave de idempotencia: se cancela lo que
      // tenga el lector. Solo si Clip confirma la cancelación el cobro se cierra (reintentar = otro
      // cobro con otro id). Si no, el lector quizá aún lo muestra y reintentar podría cobrar dos
      // veces: queda en REVISAR y la caja pide mirar la terminal (y el PIN para darlo por bueno).
      // Un 5xx es igual de ambiguo (la pasarela pudo cortar después de que Clip la creara), y un 200
      // sin `pinpad_request_id` tampoco se puede seguir: mismo trato. SIN VERIFICAR que ocurran.
      const sinRespuesta = r.status === 0 || r.status >= 500;
      if (sinRespuesta || ((r.status === 200 || r.status === 201) && !datos.orden_id_externo)) {
        const codigo = sinRespuesta ? "SIN_RESPUESTA" : "NO_SE_PUDO_CREAR";
        if (r.status === 0) registrarError("terminal-cobro", codigo, "Clip no contestó al crear");
        else log(codigo, r);
        const x = await con(ESPERA_CLIP.cancelarPorSerie).cancelarPorSerie(c.terminal);
        if (x.status >= 200 && x.status < 300) return { ok: false, codigo, ...(sinRespuesta ? { sinRespuesta: true } : {}) };
        log("CANCELAR_POR_SERIE", x);
        return { ok: true, datos: { ...datosDeIntencion(null), estado: "REVISAR", detalle: codigo } };
      }
      // La respuesta solo trae el id y la referencia: el cobro queda esperando en el lector.
      if (r.status === 200 || r.status === 201) return { ok: true, datos: { ...datos, estado: "EN_TERMINAL" } };
      const codigo = codigoDeErrorClip(r);
      log(codigo, r);
      return { ok: false, codigo };
    },
    async consultar(ordenId) {
      const r = await api.consultar(ordenId);
      if (r.status === 200) return datosDeIntencion(r.cuerpo);
      log("CONSULTAR", r);
      return null;
    },
    async cancelar(ordenId) {
      const r = await api.cancelar(ordenId);
      // SIN VERIFICAR con el lector: la documentación dice que el 200 es «Pago cancelado
      // exitosamente». Si el cliente ya había pagado, aceptaCambio deja que el aviso o el respaldo
      // lo pasen a APROBADO.
      if (r.status === 200) {
        return { cancelacion: "HECHA", datos: { ...datosDeIntencion(r.cuerpo), estado: "CANCELADO", detalle: "cancelado_desde_caja" } };
      }
      log("CANCELAR", r);
      return { cancelacion: "FALLO", datos: null };
    },
    async reembolsar(c) {
      if (!c.pagoId) return { ok: false, motivo: "SIN_PAGO" };
      const r = await api.reembolsar(c.pagoId, c.monto);
      // SIN VERIFICAR: la referencia de /refunds solo documenta 200; se acepta también 201.
      if (r.status === 200 || r.status === 201) return { ok: true };
      return { ok: false, motivo: r.status === 401 ? "CONEXION_INVALIDA" : (r.codigo ?? `HTTP_${r.status}`) };
    },
    async lectorListo(terminal) {
      // Si la consulta falla, o el lector no sale en la lista, no se tapa la terminal por un
      // tropiezo: el error al crear lo dirá.
      const r = await con(ESPERA_CLIP.lectores).estadoLectores(terminal);
      if (r.status !== 200) return true;
      const lector = lectoresDe(r.cuerpo).find((l) => l.serie === terminal);
      return lector ? lector.estado === "active" : true;
    },
  };
}

/** `base` es SUPABASE_URL (para la dirección del aviso de Clip). null si falta la credencial. */
export function proveedorDe(nombre: NombreProveedor, cred: Credencial, base: string, pedir: typeof fetch = fetch): Proveedor | null {
  if (nombre === "MERCADO_PAGO") return cred.access_token ? mercadoPago(cred.access_token, pedir) : null;
  return cred.access_token && cred.refresh_token ? clip(cred.access_token, cred.refresh_token, base, pedir) : null;
}
