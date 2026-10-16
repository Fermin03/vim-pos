import { moduloActivo, type CodigoOperacion } from "@vim/db/operacion";
import { mensajeAyudaAdmin } from "@vim/db/soporte";
import type { ModulosLeidos } from "./inventario-plan";

/** Pantalla del admin → el módulo de operación que la gobierna (ADR 0034). */
const RUTA_DE_MODULO: readonly [string, CodigoOperacion][] = [
  ["/configuracion/mesas", "comedor"],
  ["/reportes/ventas-mesero", "meseros"],
  ["/configuracion/envios", "domicilio"],
  ["/usuarios/repartidores", "repartidores"],
  ["/reservaciones", "reservaciones"],
  ["/configuracion/marcas", "marcas"],
  ["/catalogo/importar-tienda", "existencias"],
  ["/catalogo/etiquetas", "existencias"],
  ["/existencias", "existencias"],
  ["/reportes/ventas-variantes", "existencias"],
];

/**
 * Las rutas que este negocio no usa. Mientras carga o si la lectura falló no se esconde nada de lo
 * de restaurante: un menú que se encoge un segundo después de abrir salta a la vista, y esconder no
 * es un candado (eso lo decide VIM con el módulo, no el admin). Lo de tienda va al revés: solo
 * aparece con el módulo leído y encendido, para que un restaurante nunca lo vea.
 */
export function rutasOcultas(m: ModulosLeidos | "error" | null): ReadonlySet<string> {
  const leidos = m !== null && m !== "error";
  return new Set(
    RUTA_DE_MODULO.filter(([, codigo]) =>
      codigo === "existencias" ? !conExistencias(m) : leidos && !moduloActivo(m.efectivos, codigo),
    ).map(([ruta]) => ruta),
  );
}

export function filtrarSecciones<T extends { items: { href: string }[] }>(secciones: readonly T[], ocultas: ReadonlySet<string>): T[] {
  return secciones
    .map((s) => ({ ...s, items: s.items.filter((it) => !ocultas.has(it.href)) }))
    .filter((s) => s.items.length > 0);
}

/** El WhatsApp ya escrito para pedir que VIM cambie los módulos. */
export const mensajeCambiarModulos = (d: { usuario?: string | null; negocio?: string | null; codigo?: string | null }): string =>
  mensajeAyudaAdmin(d).replace(/Necesito ayuda con VIM POS\.$/, "Quiero cambiar lo que mi negocio usa en VIM POS.");

/** ¿Se enseña lo de tienda? Solo con el módulo efectivo: mientras carga o si falló, un restaurante no ve nada nuevo. */
export const conExistencias = (m: ModulosLeidos | "error" | null): boolean =>
  m !== null && m !== "error" && moduloActivo(m.efectivos, "existencias");
