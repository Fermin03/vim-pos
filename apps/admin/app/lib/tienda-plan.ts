// La tienda en línea es un complemento que VIM concede (add-on TIENDA) y el dueño enciende. Lógica
// pura de qué enseña el admin; el candado de verdad está en la base (`configuracion_tenant_tienda_guardia`, 0163).
import { mensajeAyudaAdmin } from "@vim/db/soporte";
import { conAgenda } from "./operacion";

export type ModulosLeidos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> };
export type EstadoTienda = "cargando" | "permitida" | "sin_contratar";

/** Qué pantalla toca. Si la lectura de módulos falló se enseña la sección: la base igual impide encender lo que no se contrató. */
export function estadoTienda(m: ModulosLeidos | "error" | null): EstadoTienda {
  if (m === null) return "cargando";
  if (m === "error") return "permitida";
  return m.permitidos.tienda === true ? "permitida" : "sin_contratar";
}

/**
 * La foto del producto solo le sirve a quien tiene la tienda: sin el complemento concedido, la ficha
 * de producto queda como siempre. Mientras los módulos cargan o si no se pudieron leer, tampoco se
 * ofrece (al revés que `estadoTienda`: aquí lo prudente es no enseñar nada de más).
 */
export function ofreceFotoDeProducto(m: ModulosLeidos | "error" | null): boolean {
  return m !== null && m !== "error" && m.permitidos.tienda === true;
}

/** Lo que la tienda hace, para la tarjeta de quien todavía no la tiene. */
export const TIENDA_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Tu menú, siempre al día", detalle: "El mismo que vendes en caja, con sus precios y lo agotado." },
  { titulo: "Pago al recibir", detalle: "Efectivo o tarjeta, como tú decidas." },
  { titulo: "Tus horarios", detalle: "Solo recibe pedidos cuando tu caja está abierta." },
  { titulo: "Sin comisión", detalle: "Una cuota fija, no un porcentaje de cada venta." },
];

/**
 * El cierre y el botón de la invitación mientras VIM no ha activado el complemento TIENDA en su
 * catálogo (`addons.activo = false`): no se puede conceder, así que no promete activarla; pide que le
 * avisen. Es también lo que se enseña si no se pudo leer el catálogo.
 */
export const TIENDA_INVITACION = {
  cierre: "Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.",
  boton: "Avísenme cuando esté lista",
} as const;

type Quien = { usuario?: string | null; negocio?: string | null; codigo?: string | null };
const mensajeCon = (pide: string) => (d: Quien): string => mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, pide);

/** El mensaje de WhatsApp ya escrito: quién es, de qué negocio y qué quiere. */
export const mensajeQuieroTienda = mensajeCon("Quiero la tienda en línea. Avísenme cuando esté lista.");
const mensajeActivarTienda = mensajeCon("Quiero activar la tienda en línea.");

/** Lo que el catálogo de VIM y el plan del negocio dicen de la tienda. */
export type OfertaTienda = {
  /** `addons.activo` de TIENDA: VIM ya la ofrece. */
  activo: boolean;
  /** `planes.features_incluidos.tienda_incluida` del plan del negocio. */
  planLaIncluye: boolean;
  /** `addons.precio_mensual_mxn`; null si no se pudo leer como número. */
  precio: number | null;
};

/** De las filas tal como llegan de la base. Sin fila del complemento no hay oferta que contar. */
export function ofertaTienda(addon: unknown, banderasDelPlan: unknown): OfertaTienda | null {
  if (typeof addon !== "object" || addon === null) return null;
  const a = addon as Record<string, unknown>;
  const banderas = typeof banderasDelPlan === "object" && banderasDelPlan !== null ? (banderasDelPlan as Record<string, unknown>) : {};
  const precio = a.precio_mensual_mxn == null ? Number.NaN : Number(a.precio_mensual_mxn);
  return { activo: a.activo === true, planLaIncluye: banderas.tienda_incluida === true, precio: Number.isFinite(precio) ? precio : null };
}

const enPesos = (n: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

/**
 * El cierre, el botón y el mensaje de la invitación. Tres casos:
 *  - VIM todavía no la ofrece (o no se pudo leer): lo de siempre, «avísenme».
 *  - La ofrece y el plan del negocio la incluye, pero aún no se le concedió: «escríbenos para activarla».
 *  - La ofrece y el plan no la incluye: el precio del catálogo y «escríbenos para contratarla».
 * La acción es la misma en los tres: escribir por WhatsApp. Nadie contrata con un clic.
 */
export function invitacionTienda(o: OfertaTienda | null): { cierre: string; boton: string; mensaje: (d: Quien) => string } {
  if (!o?.activo) return { ...TIENDA_INVITACION, mensaje: mensajeQuieroTienda };
  const cierre = o.planLaIncluye
    ? "Tu plan incluye la tienda en línea. Escríbenos para activarla."
    : o.precio !== null && o.precio > 0
      ? `La tienda en línea cuesta ${enPesos(o.precio)} al mes en tu plan. Escríbenos para contratarla.`
      : "La tienda en línea se contrata aparte en tu plan. Escríbenos para contratarla.";
  return { cierre, boton: "Quiero mi tienda en línea", mensaje: mensajeActivarTienda };
}

/** Lo que traen las reservas en línea, para la tarjeta de quien todavía no tiene el complemento. TEXTOS PROVISIONALES (James). */
export const RESERVAS_INCLUYE: { titulo: string; detalle: string }[] = [
  { titulo: "Abierto a toda hora", detalle: "Tus clientas apartan aunque el negocio esté cerrado." },
  { titulo: "Solo horarios libres", detalle: "Respeta el horario de cada colaborador y las citas que ya tienes." },
  { titulo: "Anticipo en línea", detalle: "Si cobras anticipo, lo pagan con Mercado Pago al apartar." },
  { titulo: "Sin comisión", detalle: "Una cuota fija, no un porcentaje de cada cita." },
];

/** El nombre del complemento TIENDA para el dueño: desde las reservas (belleza, entrega 3) cubre las dos cosas. */
export const NOMBRE_ADDON_TIENDA = "En línea (tienda y reservas)";
/** El nombre de un add-on como lo ve el dueño; solo TIENDA cambia, el plan y el cobro no. */
export const nombreDeAddon = (codigo: string, nombre: string): string => (codigo === "TIENDA" ? NOMBRE_ADDON_TIENDA : nombre);

export type SeccionEnLinea = {
  /** Negocio con agenda (belleza): la sección lleva las reservas. */
  agenda: boolean;
  titulo: string;
  subtitulo: string;
  pestanas: { label: string; href: string }[];
  /** La pestaña de pagos enseña también cómo entran los pedidos (vende en línea, o es restaurante/tienda). */
  conPedidos: boolean;
};

/**
 * Cómo se llama la sección y qué pestañas tiene. Restaurantes y tiendas: exactamente lo de antes.
 * Con agenda (belleza): «En línea», con Reservas; los pedidos y el Menú solo si además vende en línea
 * (la tienda encendida).
 */
export function seccionEnLinea(m: ModulosLeidos | "error" | null): SeccionEnLinea {
  if (!conAgenda(m) || m === null || m === "error") {
    return {
      agenda: false, titulo: "Tienda en línea", subtitulo: "Recibe los pedidos de tus clientes en tu caja.", conPedidos: true,
      pestanas: [
        { label: "General", href: "/tienda" },
        { label: "Pedidos y pagos", href: "/tienda/pedidos" },
        { label: "Sucursales y horarios", href: "/tienda/sucursales" },
        { label: "Menú", href: "/tienda/menu" },
      ],
    };
  }
  const vende = m.efectivos.tienda === true;
  return {
    agenda: true, titulo: "En línea", subtitulo: "Tus clientas reservan desde su teléfono y la cita cae en tu agenda.", conPedidos: vende,
    pestanas: [
      { label: "General", href: "/tienda" },
      { label: "Reservas", href: "/tienda/reservas" },
      { label: vende ? "Pedidos y pagos" : "Pagos", href: "/tienda/pedidos" },
      { label: "Sucursales", href: "/tienda/sucursales" },
      ...(vende ? [{ label: "Menú", href: "/tienda/menu" }] : []),
    ],
  };
}
