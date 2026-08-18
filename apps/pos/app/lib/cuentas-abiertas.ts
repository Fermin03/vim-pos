"use client";
import { employeeClient } from "./supabase";
import type { ModoServicio } from "./carrito";

// Cuentas ABIERTAS por modo de servicio: tickets comprometidos (BORRADOR/ABIERTO) que NO están en
// espera ni pagados. Se usan en "Ver cuentas" de cada pestaña: Pick-up (por recolectar) y Domicilio
// (pedidos activos). El modelo ya trae todo lo necesario — sin migración:
//   comanda_impresa_at → marca de "salió/impreso" (etapa de entrega en domicilio).
export type CuentaAbierta = {
  ticketId: string;
  folio: string | null;
  total: number;
  pendiente: number;
  nItems: number;
  desdeIso: string | null;        // fecha_apertura
  estadoCocina: string;           // SIN_ENVIAR | EN_COCINA | LISTO | ENTREGADO…
  impresaAt: string | null;       // comanda_impresa_at → ya salió/se imprimió
  cliente: string | null;         // nombre del cliente (domicilio) o nombre suelto (Pick-up)
  mesa: string | null;            // número de mesa (comedor), desde tickets_mesas
};

/** Cuentas abiertas de un modo en la SUCURSAL (Pick-up: DRIVE_THRU, Domicilio: DELIVERY_PROPIO).
 *  Sucursal-wide para que cualquier caja pueda completarlas. */
/**
 * Cuentas abiertas de uno o varios modos.
 *
 * Comedor pasa DOS modos: los tickets nacen como `MESA` cuando se abren desde una mesa, pero
 * hay `COMER_AQUI` de la ruta de mostrador. Filtrar por uno solo escondería cuentas abiertas
 * —y una cuenta que no se ve es una que no se cobra.
 */
export async function listarCuentasAbiertas(
  token: string,
  sucursalId: string,
  modo: ModoServicio | readonly string[],
): Promise<CuentaAbierta[]> {
  const modos = typeof modo === "string" ? [modo] : [...modo];
  const { data, error } = await employeeClient(token)
    .from("tickets")
    // `mesas!mesa_id` NO es opcional: tickets_mesas tiene DOS llaves foráneas a mesas
    // (`mesa_id` y `mesa_anterior_id`, esta última para transferencias). Sin la pista,
    // PostgREST no sabe cuál seguir y rechaza la consulta entera con "more than one
    // relationship was found" — dejando sin lista a los TRES modos, no solo a comedor.
    .select("id, folio_completo, total_mxn, monto_pendiente_mxn, fecha_apertura, estado_cocina, comanda_impresa_at, nombre_cliente, cliente:clientes(nombre), tickets_mesas(fecha_liberacion, mesas!mesa_id(numero)), ticket_items(cantidad, cancelado)")
    .eq("sucursal_id", sucursalId)
    .in("modo_servicio", modos)
    .is("deleted_at", null)
    .eq("en_espera", false)
    .in("estado_fiscal", ["BORRADOR", "ABIERTO"])
    .order("fecha_apertura", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    ticketId: String(t.id),
    folio: (t.folio_completo as string) ?? null,
    total: Number(t.total_mxn ?? 0),
    pendiente: Number(t.monto_pendiente_mxn ?? 0),
    nItems: (((t.ticket_items as { cantidad: number; cancelado: boolean }[]) ?? [])
      .filter((i) => !i.cancelado)
      .reduce((a, i) => a + Number(i.cantidad), 0)),
    desdeIso: (t.fecha_apertura as string) ?? null,
    estadoCocina: String(t.estado_cocina ?? "SIN_ENVIAR"),
    impresaAt: (t.comanda_impresa_at as string) ?? null,
    // Cliente registrado (domicilio) manda; si no, el nombre suelto de Pick-up.
    cliente: ((t.cliente as { nombre?: string } | null)?.nombre) ?? ((t.nombre_cliente as string) ?? null),
    // Solo la asignación viva: una mesa liberada (cuenta transferida) no debe seguir rotulando.
    mesa: (((t.tickets_mesas as { fecha_liberacion: string | null; mesas: { numero: string } | null }[] | null) ?? [])
      .find((m) => m.fecha_liberacion === null)?.mesas?.numero) ?? null,
  }));
}

/** Domicilio: marca que la orden SALIÓ (imprime la comanda). Pasa de "En preparación" a "En
 *  entrega". Usa comanda_impresa_at; el UPDATE a tickets lo permite el RLS del tenant. */
export async function marcarSalidaDomicilio(token: string, ticketId: string): Promise<void> {
  const { error } = await employeeClient(token)
    .from("tickets")
    .update({ comanda_impresa_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
}

/** Minutos desde que se abrió la cuenta (para la lista). Puro. */
export function minutosAbierta(desdeIso: string | null, ahora: Date = new Date()): number {
  if (!desdeIso) return 0;
  const d = new Date(desdeIso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - d) / 60000));
}

/** Renglón de una cuenta con TODO lo que el cajero necesita ver antes de cobrar. */
export type RenglonCuenta = {
  id: string;
  productoNombre: string;
  cantidad: number;
  totalItemMxn: number;
  estadoCocina: string | null;
  modificadores: string[];
  notaCocina: string | null;
};

/**
 * Detalle de los renglones de una cuenta abierta.
 *
 * `leerItemsPersistidos` (cancelacion.ts) trae lo mínimo para poder cancelar un renglón; aquí
 * se agregan modificadores y nota de cocina, porque el panel de detalle sirve para VERIFICAR
 * el pedido con el cliente delante ("¿pidió la hamburguesa sin cebolla?") y sin eso hay que
 * abrir la cuenta en el carrito para saberlo.
 */
export async function leerRenglonesCuenta(token: string, ticketId: string): Promise<RenglonCuenta[]> {
  const { data, error } = await employeeClient(token)
    .from("ticket_items")
    .select("id, producto_nombre_snapshot, cantidad, total_item_mxn, nota_cocina, ticket_item_modificadores(opcion_nombre_snapshot)")
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  type Fila = {
    id: string; producto_nombre_snapshot: string; cantidad: number | string;
    total_item_mxn: number | string; nota_cocina: string | null;
    ticket_item_modificadores: { opcion_nombre_snapshot: string }[] | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => ({
    id: r.id,
    productoNombre: r.producto_nombre_snapshot,
    cantidad: Number(r.cantidad),
    totalItemMxn: Number(r.total_item_mxn),
    estadoCocina: null, // vive en el ticket, no en el renglón; lo aporta quien llama
    modificadores: (r.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
    notaCocina: r.nota_cocina,
  }));
}

/**
 * Borra una cuenta que quedó VACÍA (mesa equivocada, nombre mal escrito, orden abierta por error).
 *
 * Distinta de cancelar: cancelar deja un folio CANCELADO en los reportes, con su motivo y su
 * autorización, porque hubo una venta que se echó atrás. Una cuenta sin un solo producto no es
 * una venta cancelada, es un error de captura; ensuciar el corte con ella no ayuda a nadie.
 *
 * NO se destruye la fila: se marca `deleted_at`. Sale de la lista operativa pero queda para
 * auditar quién la borró y cuándo — que es justo lo que se querría revisar si alguien empezara
 * a borrar cuentas de más.
 *
 * Se revalida que esté vacía aquí y no solo en el botón: entre que la pantalla se pintó y el
 * cajero pulsó, otra caja pudo haberle agregado productos a la misma cuenta.
 */
export async function borrarCuentaVacia(
  token: string,
  ticketId: string,
  usuarioId: string,
): Promise<void> {
  const sb = employeeClient(token);

  const { count, error: eCount } = await sb
    .from("ticket_items")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("cancelado", false);
  if (eCount) throw new Error(eCount.message);
  if ((count ?? 0) > 0) {
    throw new Error("La cuenta ya tiene productos. Cancélalos primero o cancela la cuenta.");
  }

  // Liberar la mesa ANTES de borrar: el trigger que la pone LIBRE escucha a `tickets_mesas`, no
  // al borrado del ticket. Sin esto, borrar una cuenta de comedor dejaba la mesa ocupada para
  // siempre y sin forma de volver a usarla.
  const { error: eMesa } = await sb
    .from("tickets_mesas")
    .update({ fecha_liberacion: new Date().toISOString(), motivo_liberacion: "CUENTA_BORRADA" })
    .eq("ticket_id", ticketId)
    .is("fecha_liberacion", null);
  if (eMesa) throw new Error(eMesa.message);

  const { error } = await sb
    .from("tickets")
    .update({ deleted_at: new Date().toISOString(), deleted_by: usuarioId })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
}
