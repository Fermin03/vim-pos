// Lógica pura de la lista paginada de clientes (/admin/clientes, mig. 0118). Va aparte de
// clientes.ts para probarla sin Supabase.

/** Filas por página. El admin es denso a propósito (docs/diseno/admin.md): 50 se leen sin fatiga. */
export const CLIENTES_POR_PAGINA = 50;

/** Rango inclusivo que espera `.range()` de PostgREST para la página `pagina` (desde 1). */
export function rangoPagina(pagina: number, tam: number): { desde: number; hasta: number } {
  const desde = (pagina - 1) * tam;
  return { desde, hasta: desde + tam - 1 };
}

/** Cuántas páginas hay. Una lista vacía sigue siendo la página 1. */
export function paginasTotales(total: number, tam: number): number {
  return Math.max(1, Math.ceil(total / tam));
}

/** "201–222 de 222": el tramo que se está viendo, recortado al total real. */
export function textoRango(pagina: number, tam: number, total: number): string {
  if (total === 0) return "0 de 0";
  const { desde } = rangoPagina(pagina, tam);
  return `${desde + 1}–${Math.min(desde + tam, total)} de ${total}`;
}

/**
 * Filtro `.or()` para buscar en nombre, apellido, teléfono, RFC y correo; `null` si no hay término.
 *
 * Coma, paréntesis, `%`, `*` y `\` se cambian por espacio: dentro de `.or()` una coma o un
 * paréntesis parten el filtro en condiciones que no son las del usuario, y `%`/`*` son comodines.
 */
export function filtroBusqueda(busqueda: string): string | null {
  const b = busqueda.trim().replace(/[,()%*\\]/g, " ");
  if (!b.trim()) return null;
  return ["nombre", "apellido_paterno", "telefono", "rfc", "email"].map((c) => `${c}.ilike.%${b}%`).join(",");
}

/** Ticket promedio del padrón: gasto total entre compras totales; 0 si nadie ha comprado. */
export function ticketPromedio(gastoTotal: number, compras: number): number {
  return compras > 0 ? gastoTotal / compras : 0;
}
