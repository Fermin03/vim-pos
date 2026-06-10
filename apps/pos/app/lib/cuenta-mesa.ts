"use client";
import { employeeClient } from "./supabase";
import type { Producto } from "./catalogo";
import type { LineaCarrito, ModificadorSel, ModoServicio } from "./carrito";

// T2 keystone — Cuenta por mesa (Full Service). El POS de QS construye el carrito local y persiste
// al cobrar. Full Service necesita: abrir la cuenta al sentar (ticket MESA abierto) + agregar
// items incrementales + reconstruir el carrito desde el ticket persistido para seguir editando.
// Esto es ADITIVO: el flujo QS no cambia (sólo se activa cuando hay un ticket persistido).

function clientIdLocal(): string {
  // UUID real para idempotencia robusta (un contador en memoria se reinicia al recargar y colisiona).
  return typeof crypto !== "undefined" && crypto.randomUUID ? `cuenta-${crypto.randomUUID()}` : `cuenta-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/**
 * Reconstruye las líneas del carrito desde un ticket persistido, casando producto_id con el
 * catálogo cargado. Items cancelados se omiten. Devuelve también el modo de servicio.
 */
export async function reconstruirCarrito(
  token: string,
  ticketId: string,
  productos: Producto[],
): Promise<{ lineas: LineaCarrito[]; modoServicio: ModoServicio }> {
  const sb = employeeClient(token);
  const { data: ticket } = await sb.from("tickets").select("modo_servicio").eq("id", ticketId).maybeSingle();
  const modo = mapearModo((ticket?.modo_servicio as string) ?? "MESA");

  const { data, error } = await sb
    .from("ticket_items")
    .select("id, client_id_local, producto_id, cantidad, nota_cocina, cancelado, ticket_item_modificadores(opcion_modificador_id, grupo_nombre_snapshot, opcion_nombre_snapshot, precio_extra_snapshot, cantidad)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas: LineaCarrito[] = [];
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    if (r.cancelado) continue;
    const prod = porId.get(String(r.producto_id));
    if (!prod) continue; // producto ya no en catálogo: se omite del carrito editable
    const mods: ModificadorSel[] = (((r.ticket_item_modificadores as Record<string, unknown>[]) ?? [])).map((m) => ({
      opcionId: String(m.opcion_modificador_id),
      grupoNombre: String(m.grupo_nombre_snapshot ?? ""),
      opcionNombre: String(m.opcion_nombre_snapshot ?? ""),
      precioExtra: Number(m.precio_extra_snapshot ?? 0),
      cantidad: Number(m.cantidad ?? 1),
    }));
    lineas.push({
      // clientId = client_id_local para alinear con leerItemsPersistidos (cancelar/descuento por ítem).
      clientId: (r.client_id_local as string) ?? String(r.id),
      producto: prod,
      cantidad: Number(r.cantidad),
      modificadores: mods,
      notaCocina: (r.nota_cocina as string) ?? null,
    });
  }
  return { lineas, modoServicio: modo };
}

function mapearModo(m: string): ModoServicio {
  if (m === "PARA_LLEVAR") return "PARA_LLEVAR";
  if (m === "DRIVE_THRU") return "DRIVE_THRU";
  if (m === "DELIVERY_PROPIO") return "DELIVERY_PROPIO";
  return "COMER_AQUI"; // MESA/BARRA/etc. se muestran como COMER_AQUI en el selector QS
}

/** Abre una cuenta en una mesa: crea un ticket MESA abierto y le asigna la mesa. Devuelve ticketId. */
export async function abrirCuentaEnMesa(
  token: string,
  args: { sucursalId: string; cajaId: string; turnoId: string; mesaId: string; usuarioId: string },
): Promise<string> {
  const sb = employeeClient(token);
  const { data: ticketId, error: e1 } = await sb.rpc("abrir_ticket", {
    p_sucursal_id: args.sucursalId,
    p_caja_id: args.cajaId,
    p_turno_id: args.turnoId,
    p_modo_servicio: "MESA",
    p_cliente_id: null,
    p_marca_virtual_id: null,
    p_client_id_local: clientIdLocal(),
    p_usuario_id: args.usuarioId,
  });
  if (e1) throw new Error(e1.message);
  const tId = String(ticketId);
  const { error: e2 } = await sb.rpc("asignar_mesa_a_ticket", {
    p_ticket_id: tId,
    p_mesa_id: args.mesaId,
    p_es_principal: true,
    p_client_id_local: clientIdLocal(),
  });
  if (e2) throw new Error(e2.message);
  return tId;
}

/** Agrega un ítem a un ticket abierto (incremental). El trigger recalcula totales. */
export async function agregarItemAlTicket(
  token: string,
  args: { ticketId: string; productoId: string; cantidad: number; modificadores: ModificadorSel[]; nota: string | null },
): Promise<void> {
  const mods = args.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad }));
  const { error } = await employeeClient(token).rpc("agregar_item_a_ticket", {
    p_ticket_id: args.ticketId,
    p_producto_id: args.productoId,
    p_cantidad: args.cantidad,
    p_nota_cocina: args.nota,
    p_modificadores: mods,
    p_client_id_local: clientIdLocal(),
  });
  if (error) throw new Error(error.message);
}
