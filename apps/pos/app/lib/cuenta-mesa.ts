"use client";
import { employeeClient } from "./supabase";
import type { Producto } from "./catalogo";
import type { LineaCarrito, ModificadorSel, ModoServicio } from "./carrito";
import type { ComboDef, ComponenteSel } from "./combos";

// T2 keystone — Cuenta por mesa (Full Service). El POS de QS construye el carrito local y persiste
// al cobrar. Full Service necesita: abrir la cuenta al sentar (ticket MESA abierto) + agregar
// items incrementales + reconstruir el carrito desde el ticket persistido para seguir editando.
// Esto es ADITIVO: el flujo QS no cambia (sólo se activa cuando hay un ticket persistido).

function clientIdLocal(): string {
  // UUID real para idempotencia robusta (un contador en memoria se reinicia al recargar y colisiona).
  return typeof crypto !== "undefined" && crypto.randomUUID ? `cuenta-${crypto.randomUUID()}` : `cuenta-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** Renglón de `ticket_items` tal como lo devuelve PostgREST, con sus modificadores anidados. */
export type FilaItemPersistido = {
  id: string;
  client_id_local: string | null;
  producto_id: string;
  cantidad: number | string;
  nota_cocina: string | null;
  cancelado: boolean;
  parent_item_id: string | null;
  combo_rol: "PADRE" | "HIJO" | null;
  combo_grupo_nombre_snapshot: string | null;
  precio_unitario_snapshot: number | string;
  ticket_item_modificadores: { opcion_modificador_id: string; grupo_nombre_snapshot: string | null; opcion_nombre_snapshot: string | null; precio_extra_snapshot: number | string | null; cantidad: number | null }[] | null;
};

function modsDe(r: FilaItemPersistido): ModificadorSel[] {
  return (r.ticket_item_modificadores ?? []).map((m) => ({
    opcionId: String(m.opcion_modificador_id),
    grupoNombre: String(m.grupo_nombre_snapshot ?? ""),
    opcionNombre: String(m.opcion_nombre_snapshot ?? ""),
    precioExtra: Number(m.precio_extra_snapshot ?? 0),
    cantidad: Number(m.cantidad ?? 1),
  }));
}

/**
 * Renglones persistidos → líneas del carrito. Los PADRE se vuelven líneas con `combo` y sus HIJOS
 * los componentes (el grupo se resuelve por nombre contra la definición del combo: el ticket solo
 * guarda el nombre del slot). Cancelados, productos fuera de catálogo y huérfanos se omiten.
 */
export function agruparPadresHijos(filas: FilaItemPersistido[], porId: Map<string, Producto>, combos: ComboDef[]): LineaCarrito[] {
  const vivas = filas.filter((r) => !r.cancelado);
  const hijosPorPadre = new Map<string, FilaItemPersistido[]>();
  for (const r of vivas) if (r.combo_rol === "HIJO" && r.parent_item_id) hijosPorPadre.set(r.parent_item_id, [...(hijosPorPadre.get(r.parent_item_id) ?? []), r]);

  const lineas: LineaCarrito[] = [];
  for (const r of vivas) {
    if (r.combo_rol === "HIJO") continue; // los hijos no son líneas propias: van dentro del combo de su padre
    const prod = porId.get(String(r.producto_id));
    if (!prod) continue; // producto ya no en catálogo: se omite del carrito editable
    const base: LineaCarrito = {
      clientId: r.client_id_local ?? r.id,
      producto: prod,
      cantidad: Number(r.cantidad),
      modificadores: modsDe(r),
      notaCocina: r.nota_cocina ?? null,
    };
    if (r.combo_rol !== "PADRE") { lineas.push(base); continue; }
    const def = combos.find((c) => c.producto.id === prod.id) ?? { producto: prod, slots: [] };
    const componentes: ComponenteSel[] = [];
    for (const h of hijosPorPadre.get(r.id) ?? []) {
      const ph = porId.get(String(h.producto_id));
      if (!ph) continue; // componente ya no en catálogo: se omite (huérfano de catálogo)
      const slot = def.slots.find((s) => s.nombre === h.combo_grupo_nombre_snapshot);
      componentes.push({
        grupoId: slot?.id ?? "",
        grupoNombre: h.combo_grupo_nombre_snapshot ?? slot?.nombre ?? "",
        producto: ph,
        // El hijo persiste cantidad × cantidad_del_padre (así lo escribe agregar_combo_a_ticket);
        // se divide de vuelta para recuperar la cantidad POR UNIDAD de combo.
        cantidad: Math.max(1, Math.round(Number(h.cantidad) / Math.max(1, Number(r.cantidad)))),
        modificadores: modsDe(h),
        notaCocina: h.nota_cocina ?? null,
        clientId: h.client_id_local ?? h.id,
      });
    }
    // precioUnitario viene del snapshot (lo que REALMENTE se cobró), nunca se recalcula del catálogo.
    lineas.push({ ...base, combo: { def, componentes, precioUnitario: Number(r.precio_unitario_snapshot) } });
  }
  return lineas;
}

/**
 * Reconstruye las líneas del carrito desde un ticket persistido, casando producto_id con el
 * catálogo cargado. Items cancelados se omiten. Devuelve también el modo de servicio.
 */
export async function reconstruirCarrito(
  token: string,
  ticketId: string,
  productos: Producto[],
  combos: ComboDef[] = [],
): Promise<{ lineas: LineaCarrito[]; modoServicio: ModoServicio }> {
  const sb = employeeClient(token);
  const { data: ticket } = await sb.from("tickets").select("modo_servicio").eq("id", ticketId).maybeSingle();
  const modo = mapearModo((ticket?.modo_servicio as string) ?? "MESA");

  const { data, error } = await sb
    .from("ticket_items")
    .select("id, client_id_local, producto_id, cantidad, nota_cocina, cancelado, parent_item_id, combo_rol, combo_grupo_nombre_snapshot, precio_unitario_snapshot, ticket_item_modificadores(opcion_modificador_id, grupo_nombre_snapshot, opcion_nombre_snapshot, precio_extra_snapshot, cantidad)")
    .eq("ticket_id", ticketId)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);

  const porId = new Map(productos.map((p) => [p.id, p]));
  return { lineas: agruparPadresHijos((data ?? []) as unknown as FilaItemPersistido[], porId, combos), modoServicio: modo };
}

/** Agrega un combo a un ticket abierto (cuenta de mesa). Idempotente por los client ids de la línea. */
export async function agregarComboAlTicket(token: string, args: { ticketId: string; linea: LineaCarrito }): Promise<void> {
  const l = args.linea;
  if (!l.combo) throw new Error("La línea no es un combo");
  const { error } = await employeeClient(token).rpc("agregar_combo_a_ticket", {
    p_ticket_id: args.ticketId,
    p_combo_producto_id: l.producto.id,
    p_cantidad: l.cantidad,
    p_componentes: componentesJsonb(l.combo.componentes),
    p_modificadores: l.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad })),
    p_nota_cocina: l.notaCocina,
    p_client_id_local: l.clientId,
  });
  if (error) throw new Error(error.message);
}

/** Traduce los componentes seleccionados de un combo al JSON que espera `agregar_combo_a_ticket`. */
export function componentesJsonb(componentes: ComponenteSel[]) {
  return componentes.map((c) => ({
    grupo_id: c.grupoId,
    producto_id: c.producto.id,
    cantidad: c.cantidad,
    modificadores: c.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad })),
    nota_cocina: c.notaCocina,
    client_id_local: c.clientId,
  }));
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

/**
 * Agrega un ítem a un ticket abierto (incremental). El trigger recalcula totales.
 *
 * `clientId` es opcional pero importa cuando se guarda una tanda completa de golpe: la RPC es
 * idempotente por `client_id_local`, así que si el guardado se corta a la mitad, reintentarlo
 * vuelve a mandar todo sin duplicar lo que ya entró. Sin él, cada intento inventa un id nuevo y
 * el reintento cobraría dos veces los renglones que sí habían pasado.
 */
export async function agregarItemAlTicket(
  token: string,
  args: { ticketId: string; productoId: string; cantidad: number; modificadores: ModificadorSel[]; nota: string | null; clientId?: string },
): Promise<void> {
  const mods = args.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad }));
  const { error } = await employeeClient(token).rpc("agregar_item_a_ticket", {
    p_ticket_id: args.ticketId,
    p_producto_id: args.productoId,
    p_cantidad: args.cantidad,
    p_nota_cocina: args.nota,
    p_modificadores: mods,
    p_client_id_local: args.clientId ?? clientIdLocal(),
  });
  if (error) throw new Error(error.message);
}
