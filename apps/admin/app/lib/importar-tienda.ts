"use client";
import { supabase } from "./supabase";
import { dividirCSV } from "./importar-menu";

export type FilaImport = {
  linea: number; categoria: string; producto: string; ejes: string[]; valores: Record<string, string>;
  sku: string; codigo_barras: string; generar_codigo: boolean; precio: number; costo: number | null; existencia: number | null;
};
export type ParseTienda = { filas: FilaImport[]; errores: { linea: number; motivo: string }[] };

export const PLANTILLA_TIENDA = `Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia
Playeras,Playera Polo,Talla|Color,M|Negra,POL-M-NEG,,349,150,5
Playeras,Playera Polo,Talla|Color,G|Negra,POL-G-NEG,,349,150,3
Accesorios,Gorra,,,GOR-001,,249,90,10`;

const numero = (s: string): number | null => {
  const t = s.replace(/[$\s,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Columnas: categoría, producto, ejes (Talla|Color), valores (M|Negra), SKU, código de barras, precio, costo, existencia. */
export function parsearCsvTienda(texto: string, generarFaltantes: boolean): ParseTienda {
  const filas: FilaImport[] = [];
  const errores: ParseTienda["errores"] = [];
  const skus = new Set<string>();
  texto.split(/\r?\n/).forEach((raw, i) => {
    const linea = i + 1;
    if (!raw.trim()) return;
    const c = dividirCSV(raw);
    if (i === 0 && /categor/i.test(c[0] ?? "")) return;
    const [categoria = "", producto = "", ejesTxt = "", valoresTxt = "", sku = "", barras = "", precioTxt = "", costoTxt = "", existTxt = ""] = c;
    const mal = (motivo: string) => errores.push({ linea, motivo });
    if (!categoria || !producto || !sku) return void mal("Faltan categoría, producto o SKU");
    const ejes = ejesTxt ? ejesTxt.split("|").map((s) => s.trim()) : [];
    const vals = valoresTxt ? valoresTxt.split("|").map((s) => s.trim()) : [];
    if (ejes.length !== vals.length || ejes.some((e) => !e) || vals.some((v) => !v)) {
      return void mal("Los valores no cuadran con los ejes (ej.: Talla|Color y M|Negra)");
    }
    const precio = numero(precioTxt);
    const costo = numero(costoTxt);
    const existencia = numero(existTxt);
    if (precio == null || Number.isNaN(precio) || precio < 0) return void mal(`Precio inválido: "${precioTxt}"`);
    if (Number.isNaN(costo) || (costo ?? 0) < 0 || Number.isNaN(existencia) || (existencia ?? 0) < 0) {
      return void mal("Costo o existencia inválidos");
    }
    if (skus.has(sku.toLowerCase())) return void mal(`El SKU ${sku} viene dos veces`);
    skus.add(sku.toLowerCase());
    filas.push({
      linea, categoria, producto, ejes, valores: Object.fromEntries(ejes.map((e, k) => [e, vals[k]!])),
      sku, codigo_barras: barras, generar_codigo: generarFaltantes && !barras, precio, costo, existencia,
    });
  });
  return { filas, errores };
}

export type ResultadoImportTienda = { categorias: number; productos: number; variantes_creadas: number; actualizados: number };

export async function importarCatalogoTienda(filas: FilaImport[], sucursalId: string | null): Promise<ResultadoImportTienda> {
  const { data, error } = await supabase.rpc("importar_catalogo_tienda", { p_filas: filas, p_sucursal: sucursalId });
  if (error) throw new Error(error.message);
  return data as ResultadoImportTienda;
}
