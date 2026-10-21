// «Menú de la tienda»: qué categorías y productos enseña cada sucursal en su tienda en línea (0168).
// Lógica pura; la lectura y la escritura viven en tienda.ts. Se guarda LO ESCONDIDO: sin fila, se ve.

export type CategoriaCatalogo = { id: string; nombre: string; orden: number };

export type ProductoCatalogo = {
  id: string; nombre: string; categoriaId: string; orden: number; esCombo: boolean;
  /** El precio en esta sucursal (el suyo si lo tiene; si no, el general). */
  precio: number;
  visibleEnPos: boolean; pausado: boolean;
  /** `productos_sucursal.disponible` de esta sucursal; sin fila, se vende. */
  seVendeAqui: boolean;
};

/** Lo que una sucursal tiene escondido. */
export type Ocultos = { categorias: ReadonlySet<string>; productos: ReadonlySet<string> };

/** Un toque a un interruptor: esconder o volver a mostrar una categoría o un producto. */
export type CambioMenu = { tipo: "categoria" | "producto"; id: string; escondido: boolean };

export type ProductoMenu = {
  id: string; nombre: string; precio: number;
  /** Lo que eligió el dueño. Con la categoría escondida no manda, pero se conserva. */
  escondido: boolean;
  /** Por qué la tienda no lo enseña aunque esté encendido: ahí el interruptor no manda. null = sí lo enseña. */
  nota: string | null;
};

export type CategoriaMenu = {
  id: string; nombre: string; escondida: boolean; productos: ProductoMenu[];
  /** De los que la tienda puede enseñar, cuántos hay y cuántos se ven hoy. */
  total: number; visibles: number;
  /** Productos escondidos uno por uno: lo que deshace «Mostrar todos». */
  escondidos: string[];
};

/** La misma precedencia que `motivo_no_disponible_en_sucursal` (0152), más «no visible en el POS». */
function notaDe(p: ProductoCatalogo): string | null {
  if (!p.visibleEnPos) return "No está visible en el punto de venta";
  if (p.pausado) return "Está pausado";
  if (!p.seVendeAqui) return "No se vende en esta sucursal";
  return null;
}

const porOrden = <T extends { orden: number; nombre: string }>(a: T, b: T) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");

/**
 * El árbol que pinta el bloque: las categorías con sus productos, en el orden del catálogo. Recibe
 * las categorías ACTIVAS y los productos vivos; deja fuera la categoría sin ningún producto que la
 * tienda pueda enseñar (la tienda tampoco la pinta).
 */
export function arbolMenu(categorias: CategoriaCatalogo[], productos: ProductoCatalogo[], ocultos: Ocultos): CategoriaMenu[] {
  const porCategoria = new Map<string, ProductoCatalogo[]>();
  for (const p of productos) {
    const lista = porCategoria.get(p.categoriaId);
    if (lista) lista.push(p); else porCategoria.set(p.categoriaId, [p]);
  }
  return [...categorias].sort(porOrden).flatMap((c) => {
    const suyos = (porCategoria.get(c.id) ?? []).sort(porOrden).map((p) => ({
      id: p.id, nombre: p.nombre, precio: p.precio, escondido: ocultos.productos.has(p.id), nota: notaDe(p),
    }));
    const mostrables = suyos.filter((p) => p.nota === null);
    if (mostrables.length === 0) return [];
    const escondida = ocultos.categorias.has(c.id);
    return [{
      id: c.id, nombre: c.nombre, escondida, productos: suyos,
      total: mostrables.length,
      visibles: escondida ? 0 : mostrables.filter((p) => !p.escondido).length,
      escondidos: suyos.filter((p) => p.escondido).map((p) => p.id),
    }];
  });
}

/** Lo escondido después de un cambio. Sirve para pintarlo al momento y, con el cambio inverso, para deshacerlo. */
export function conCambio(o: Ocultos, c: CambioMenu): Ocultos {
  const clave = c.tipo === "categoria" ? "categorias" : "productos";
  const nuevo = new Set(o[clave]);
  if (c.escondido) nuevo.add(c.id); else nuevo.delete(c.id);
  return { ...o, [clave]: nuevo };
}

export const inverso = (c: CambioMenu): CambioMenu => ({ ...c, escondido: !c.escondido });

/** La fila de `tienda_ocultos` que representa algo escondido: exactamente una de las dos columnas. */
export function filaOculta(tenantId: string, sucursalId: string, c: Pick<CambioMenu, "tipo" | "id">) {
  return {
    tenant_id: tenantId, sucursal_id: sucursalId,
    categoria_id: c.tipo === "categoria" ? c.id : null,
    producto_id: c.tipo === "producto" ? c.id : null,
  };
}

/** «12 de 15 productos visibles», o lo que pasa con la categoría escondida. */
export function resumenCategoria(c: Pick<CategoriaMenu, "escondida" | "total" | "visibles">): string {
  const productos = c.total === 1 ? "1 producto" : `${c.total} productos`;
  if (c.escondida) return c.total === 1 ? "Escondida: su producto no aparece en la tienda" : `Escondida: ninguno de sus ${productos} aparece en la tienda`;
  if (c.total === 1) return c.visibles === 1 ? "1 producto visible" : "Su único producto está escondido";
  return `${c.visibles} de ${productos} visibles`;
}
