// El puerto de pago-flujo.ts sobre supabase-js (service_role). Solo corre en Deno: importa el
// cliente, así que no se prueba con Node; por eso aquí no hay ninguna decisión, solo las llamadas.
// Las funciones SQL son las de la migración 0172. Un error de la base se lanza: quien llama decide.
import type { clienteAdmin } from "../http.ts";
import { registrarError } from "../errores.ts";
import { montoTexto } from "../terminal/mercado-pago.ts";
import { clienteMpTienda } from "./pago-mp.ts";
import type { Aplicado, Deps, EstadoPago, FilaPago, PuertoPagos, Tarea } from "./pago-flujo.ts";

type Admin = ReturnType<typeof clienteAdmin>;

const exigir = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export function puertoDePagos(admin: Admin): PuertoPagos {
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<unknown> => exigir(await admin.rpc(fn, args));
  return {
    async leerPago(pagoId) {
      const f = exigir(await admin.from("tienda_pagos")
        .select("id, conexion_id, estado, monto_mxn, init_point, vence_at, conexion:terminal_conexiones(cuenta_id_externo, de_prueba)")
        .eq("id", pagoId).eq("extra", false).maybeSingle()) as
        | { id: string; conexion_id: string; estado: EstadoPago; monto_mxn: number | string; init_point: string | null; vence_at: string;
            conexion: { cuenta_id_externo: string; de_prueba: boolean } | null }
        | null;
      const monto = f ? montoTexto(f.monto_mxn) : null;
      if (!f || !f.conexion || !monto) return null;
      const fila: FilaPago = {
        id: f.id, conexion_id: f.conexion_id, estado: f.estado, monto, init_point: f.init_point, vence_at: f.vence_at,
        cuenta_vendedora: f.conexion.cuenta_id_externo, de_prueba: f.conexion.de_prueba === true,
      };
      return fila;
    },
    async token(conexionId) {
      const filas = await rpc("terminal_leer_tokens", { p_conexion: conexionId }) as { access_token: string | null }[] | null;
      return filas?.[0]?.access_token ?? null;
    },
    async conexionEnError(conexionId) {
      exigir(await admin.from("terminal_conexiones").update({ estado: "ERROR", ultimo_error: "Mercado Pago rechazó el token" })
        .eq("id", conexionId).eq("estado", "ACTIVA"));
    },
    tomarPreferencia: async (pagoId) => (await rpc("tienda_pago_tomar_preferencia", { p_pago: pagoId })) === true,
    async guardarPreferencia(pagoId, preferenciaId, initPoint) {
      exigir(await admin.from("tienda_pagos").update({ preferencia_id: preferenciaId, init_point: initPoint })
        .eq("id", pagoId).is("init_point", null));
    },
    descartar: async (pagoId) => (await rpc("tienda_pago_descartar", { p_pago: pagoId })) === true,
    aplicar: async (pagoId, d) => await rpc("tienda_pago_aplicar", {
      p_pago: pagoId, p_resultado: d.resultado, p_pago_id_externo: d.pagoIdExterno, p_monto: d.monto,
      p_tipo: d.tipoTarjeta, p_marca: d.marca, p_detalle: d.detalle,
    }) as Aplicado,
    tomar: async (max) => (await rpc("tienda_pagos_tomar", { p_max: max }) as Tarea[] | null) ?? [],
    devolucion: async (pagoId, ok, error) =>
      String(await rpc("tienda_pago_devolucion", { p_pago: pagoId, p_ok: ok, p_error: error ?? null })),
    async conciliado(pagoId) {
      // Solo el que ya venció: mientras el pedido siga esperando pago se le vuelve a preguntar.
      exigir(await admin.from("tienda_pagos").update({ conciliado_at: new Date().toISOString() })
        .eq("id", pagoId).eq("estado", "VENCIDO"));
    },
  };
}

/** Las dependencias de pago-flujo.ts para una función: la base, Mercado Pago de verdad y el log. */
export const depsDePagos = (admin: Admin, funcion: string): Deps => ({
  db: puertoDePagos(admin),
  mp: (token) => clienteMpTienda(token),
  registrar: (codigo, detalle) => registrarError(funcion, codigo, detalle),
});
