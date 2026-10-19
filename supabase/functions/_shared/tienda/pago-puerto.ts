// El puerto de pago-flujo.ts sobre supabase-js (service_role). Solo corre en Deno: importa el
// cliente, así que no se prueba con Node; por eso aquí no hay ninguna decisión, solo las llamadas.
// Las funciones SQL son las de la migración 0173 (y la 0175: la verificación del banco). Un error de la base se lanza: quien llama decide.
// Un pago de cita (0225) pasa por las mismas llamadas: todo va por el id del pago.
import type { clienteAdmin } from "../http.ts";
import { registrarError } from "../errores.ts";
import { montoTexto } from "../terminal/mercado-pago.ts";
import { clienteMpTienda, pagadorDePrueba } from "./pago-mp.ts";
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
        .select("id, conexion_id, estado, monto_mxn, cobro_pedido_at, orden_id_externo, detalle, created_at, verificacion_at, conciliaciones, freno_clave, conexion:tienda_conexiones(cuenta_id_externo, de_prueba)")
        .eq("id", pagoId).eq("extra", false).maybeSingle()) as
        | { id: string; conexion_id: string; estado: EstadoPago; monto_mxn: number | string; cobro_pedido_at: string | null;
            orden_id_externo: string | null; detalle: string | null; created_at: string; verificacion_at: string | null; conciliaciones: number; freno_clave: string | null; conexion: { cuenta_id_externo: string; de_prueba: boolean } | null }
        | null;
      const monto = f ? montoTexto(f.monto_mxn) : null;
      if (!f || !f.conexion || !monto) return null;
      const fila: FilaPago = {
        id: f.id, conexion_id: f.conexion_id, estado: f.estado, monto, cobro_mandado: f.cobro_pedido_at !== null,
        orden_id_externo: f.orden_id_externo, detalle: f.detalle, creado: f.created_at, en_verificacion: f.verificacion_at !== null, conciliaciones: Number(f.conciliaciones) || 0, cuenta_vendedora: String(f.conexion.cuenta_id_externo),
        // Solo un `true` de la conexión: cualquier otra cosa es un pago real.
        de_prueba: f.conexion.de_prueba === true,
        freno_clave: typeof f.freno_clave === "string" && f.freno_clave !== "" ? f.freno_clave : null,
      };
      return fila;
    },
    async token(conexionId) {
      // Los tokens de la conexión DE LA TIENDA (Vault, `tienda:<id>:access`). Nunca los de la terminal.
      const filas = await rpc("tienda_leer_tokens", { p_conexion: conexionId }) as { access_token: string | null }[] | null;
      return filas?.[0]?.access_token ?? null;
    },
    tomarCobro: async (pagoId) => (await rpc("tienda_pago_tomar_cobro", { p_pago: pagoId })) === true,
    descartar: async (pagoId) => (await rpc("tienda_pago_descartar", { p_pago: pagoId })) === true,
    aplicar: async (pagoId, d) => await rpc("tienda_pago_aplicar", {
      p_pago: pagoId, p_resultado: d.resultado, p_orden_id_externo: d.ordenIdExterno, p_monto: d.monto,
      p_tipo: d.tipoTarjeta, p_marca: d.marca, p_detalle: d.detalle, p_pago_id_externo: d.pagoIdExterno,
    }) as Aplicado,
    anotar: async (pagoId, d) => {
      if (d.ordenIdExterno || d.error) await rpc("tienda_pago_anotar", { p_pago: pagoId, p_orden: d.ordenIdExterno ?? null, p_error: d.error ?? null });
    },
    verificar: async (pagoId, ordenIdExterno) => { await rpc("tienda_pago_verificacion", { p_pago: pagoId, p_orden: ordenIdExterno }); },
    abandonar: async (pagoId, ordenIdExterno) => (await rpc("tienda_pago_abandonar", { p_pago: pagoId, p_orden: ordenIdExterno })) === true,
    tomar: async (max) => (await rpc("tienda_pagos_tomar", { p_max: max }) as Tarea[] | null) ?? [],
    devolucion: async (pagoId, ok, error) =>
      String(await rpc("tienda_pago_devolucion", { p_pago: pagoId, p_ok: ok, p_error: error ?? null })),
    conciliacion: async (pagoId, ok) => (await rpc("tienda_pago_conciliacion", { p_pago: pagoId, p_ok: ok })) === true,
  };
}

/** Las dependencias de pago-flujo.ts para una función: la base, Mercado Pago de verdad y el log. */
export const depsDePagos = (admin: Admin, funcion: string): Deps => ({
  db: puertoDePagos(admin),
  mp: (token) => clienteMpTienda(token),
  // Solo se usa en un pago de prueba (modo de prueba, 0178). No es secreto de nadie: es un usuario de prueba.
  pagadorDePrueba: pagadorDePrueba((globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("MP_TIENDA_PAGADOR_DE_PRUEBA")),
  // Al log de la función y, para poder leerlo sin entrar al panel, a tienda_eventos. Nunca tokens ni
  // datos de tarjeta: quien llama solo pasa ids nuestros y el motivo que da Mercado Pago.
  registrar: (codigo, detalle) => {
    registrarError(funcion, codigo, detalle);
    void admin.from("tienda_eventos").insert({ accion: `cobro:${codigo}`.slice(0, 80), error: String(detalle).slice(0, 300) }).then(() => {}, () => {});
  },
});
