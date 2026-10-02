/**
 * Lo que la caja le manda a la pantalla del cliente (el segundo monitor).
 *
 * `construirVista` es la ÚNICA puerta entre el estado de la venta y lo que ve el cliente. Arma el
 * mensaje campo por campo en vez de copiar objetos del carrito: el carrito lleva notas de cocina,
 * el nombre y la dirección de quien pide a domicilio, y nada de eso puede acabar en un monitor
 * girado hacia el mostrador porque alguien agregó un campo nuevo al carrito.
 */
import { z } from "zod";
import { calcularTotalesDisplay, totalLinea, type EstadoCarrito, type LineaCarrito, type ModificadorSel } from "../carrito";
import { redondearCentavos } from "../dinero";

const dinero = z.number().finite();

const esquemaRenglon = z.object({
  id: z.string(),
  cantidad: z.number().positive(),
  nombre: z.string(),
  detalle: z.array(z.string()),
  importe: dinero,
});

export const esquemaVista = z.discriminatedUnion("fase", [
  z.object({ fase: z.literal("reposo") }),
  z.object({
    fase: z.literal("cuenta"),
    renglones: z.array(esquemaRenglon),
    envio: z.object({ nombre: z.string(), importe: dinero }).nullable(),
    total: dinero,
  }),
  z.object({ fase: z.literal("cobro"), total: dinero }),
  z.object({ fase: z.literal("pagado"), total: dinero.nullable(), cambio: dinero }),
]);

const esquemaMensaje = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("estado"), v: z.literal(1), vista: esquemaVista }),
  z.object({ tipo: z.literal("negocio"), v: z.literal(1), nombre: z.string(), logoUrl: z.string().nullable() }),
  z.object({ tipo: z.literal("hola"), v: z.literal(1) }),
]);

export type RenglonCliente = z.infer<typeof esquemaRenglon>;
export type VistaCliente = z.infer<typeof esquemaVista>;
export type MensajePantalla = z.infer<typeof esquemaMensaje>;
export type Negocio = { nombre: string; logoUrl: string | null };

/** Valida lo que llega por el canal. Un mensaje que no se entiende se ignora: null. */
export function leerMensaje(dato: unknown): MensajePantalla | null {
  const r = esquemaMensaje.safeParse(dato);
  return r.success ? r.data : null;
}

export type EntradaVista = {
  carrito: EstadoCarrito;
  /** Total de la base cuando la cuenta ya está guardada (trae descuentos y promociones); si no, null. */
  totalAutoritativo: number | null;
  /** El modal de cobro está abierto. */
  cobro: { total: number } | null;
  /** Se acaba de cobrar ("Cobro completado" en pantalla). */
  pagado: { total: number | null; cambio: number } | null;
};

const textoMod = (m: ModificadorSel): string => (m.cantidad > 1 ? `${m.cantidad}× ${m.opcionNombre}` : m.opcionNombre);

function detalleDe(l: LineaCarrito): string[] {
  const propios = l.modificadores.map(textoMod);
  if (!l.combo) return propios;
  const hijos = l.combo.componentes.map((c) => {
    const base = c.cantidad > 1 ? `${c.cantidad}× ${c.producto.nombre}` : c.producto.nombre;
    return c.modificadores.length > 0 ? `${base} (${c.modificadores.map(textoMod).join(", ")})` : base;
  });
  return [...hijos, ...propios];
}

/**
 * `construirVista` para quien la llama DURANTE el render de la venta (`usePublicarPantallaCliente`
 * corre en `HomePos`, en todas las cajas, tengan o no segundo monitor). La pantalla del cliente es
 * opcional: si armar la vista falla, el cliente ve reposo y la venta sigue; nunca al revés.
 */
export function construirVistaSegura(e: EntradaVista): VistaCliente {
  try { return construirVista(e); } catch { return { fase: "reposo" }; }
}

export function construirVista(e: EntradaVista): VistaCliente {
  if (e.pagado) return { fase: "pagado", total: e.pagado.total !== null ? redondearCentavos(e.pagado.total) : null, cambio: redondearCentavos(e.pagado.cambio) };
  if (e.cobro) return { fase: "cobro", total: redondearCentavos(e.cobro.total) };
  const { lineas, envio } = e.carrito;
  if (lineas.length === 0) return { fase: "reposo" };
  const envioMxn = envio?.costoMxn ?? 0;
  return {
    fase: "cuenta",
    renglones: lineas.map((l) => ({ id: l.clientId, cantidad: l.cantidad, nombre: l.producto.nombre, detalle: detalleDe(l), importe: totalLinea(l) })),
    envio: envio ? { nombre: envio.nombre, importe: redondearCentavos(envio.costoMxn) } : null,
    // El mismo número que el cajero ve en el costado (`SidebarTicket`: totalConDescuento ?? totales.total).
    total: e.totalAutoritativo ?? calcularTotalesDisplay(lineas, 16, envioMxn).total,
  };
}
