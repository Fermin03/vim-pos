// El inventario viene desde el plan Negocio (0148, ADR 0025). Lógica pura de lo que enseña el
// panel; el candado de verdad está en la base (`inventario_permitido`, los triggers de 0148).
//
// El módulo se llama `recetas` en la base —"Recetas e inventario" (@vim/db/modulos)— y lo permite
// el plan o una excepción de VIM. Aquí solo se decide qué pantalla ver.
import { mensajeAyudaAdmin } from "@vim/db/soporte";

export type ModulosLeidos = { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> };

export type EstadoInventario = "cargando" | "permitido" | "no_incluido";

/**
 * Qué enseñar en Inventario. `null` = todavía leyendo; `"error"` = la consulta falló.
 *
 * Solo se enseña la explicación cuando la base dijo EXPLÍCITAMENTE que no (`recetas: false`). Si la
 * consulta falla o viene vacía se dejan las pantallas: ponerle "viene desde el plan Negocio" a un
 * cliente que sí lo paga, por un fallo de red, es peor que dejarlo entrar — y si de verdad no lo
 * tiene, la base rechaza lo que intente guardar, con este mismo mensaje.
 */
export function estadoInventario(m: ModulosLeidos | "error" | null): EstadoInventario {
  if (m === null) return "cargando";
  if (m === "error") return "permitido";
  return m.permitidos.recetas === false ? "no_incluido" : "permitido";
}

/** Las pantallas que cubre el módulo: la sección Inventario y las recetas del catálogo. */
export function rutaEsDeInventario(ruta: string): boolean {
  return ["/inventario", "/catalogo/recetas"].some((p) => ruta === p || ruta.startsWith(p + "/"));
}

/** Lo que trae el módulo, en palabras de restaurantero. Lo mismo que promete la página de precios. */
export const INVENTARIO_INCLUYE: readonly { titulo: string; detalle: string }[] = [
  { titulo: "Insumos y existencias", detalle: "Lo que tienes en la bodega de cada sucursal, con aviso cuando algo baja de su mínimo." },
  { titulo: "Recetas que descuentan solas", detalle: "Cada venta resta sus insumos; un producto sin insumos se marca agotado en la caja." },
  { titulo: "Compras y proveedores", detalle: "Registras lo que llega y se actualiza la existencia y el costo." },
  { titulo: "Mermas y ajustes", detalle: "Lo que se echó a perder o no cuadró al contar, con su motivo." },
  { titulo: "Costo de ventas y margen", detalle: "Cuánto te cuesta cada producto y cuánto te deja." },
];

/**
 * El mensaje que ya va escrito al pedir el cambio por WhatsApp. Reusa el saludo del botón de ayuda
 * (quién, negocio y código) para que soporte no tenga que preguntar con quién habla.
 */
export function mensajeQuieroInventario(d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string {
  return mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero pasar al plan Negocio para usar el inventario.");
}
