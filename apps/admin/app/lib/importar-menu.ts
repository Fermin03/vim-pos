"use client";
import { crearCategoria, crearProducto, listarCategoriasOpciones } from "./catalogo";

// Tier1 — Importador de menú. La fricción #1 del alta de un cliente nuevo es capturar el menú.
// El dueño pega un CSV (categoría, producto, precio[, descripción]) y se crean categorías faltantes
// + productos en lote. Parser puro (testeable) separado de la orquestación (que toca Supabase).

export type FilaMenu = { categoria: string; nombre: string; precio: number; descripcion: string };
export type ResultadoParse = { filas: FilaMenu[]; errores: { linea: number; texto: string; motivo: string }[] };

const HEADERS = new Set(["categoria", "categoría", "producto", "nombre", "precio", "precio_base"]);

/** Divide una línea CSV respetando comillas dobles. */
function dividirCSV(linea: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if ((c === "," || c === ";" || c === "\t") && !enComillas) {
      out.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/**
 * Parsea texto CSV a filas de menú. Columnas: categoría, producto, precio, [descripción].
 * Ignora una fila de encabezado si la detecta. Reporta errores por línea sin abortar el resto.
 */
export function parsearMenu(texto: string): ResultadoParse {
  const filas: FilaMenu[] = [];
  const errores: ResultadoParse["errores"] = [];
  const lineas = texto.split(/\r?\n/);

  lineas.forEach((raw, idx) => {
    const linea = raw.trim();
    if (!linea) return;
    const cols = dividirCSV(linea);
    // Detectar y saltar encabezado.
    if (idx === 0 && cols.slice(0, 2).every((c) => HEADERS.has(c.toLowerCase()))) return;

    const [categoria, nombre, precioRaw, descripcion] = cols;
    if (!categoria || !nombre || precioRaw == null || precioRaw === "") {
      errores.push({ linea: idx + 1, texto: linea, motivo: "Faltan columnas (categoría, producto, precio)" });
      return;
    }
    const precio = Number(String(precioRaw).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(precio) || precio < 0) {
      errores.push({ linea: idx + 1, texto: linea, motivo: `Precio inválido: "${precioRaw}"` });
      return;
    }
    filas.push({
      categoria: categoria.slice(0, 40),
      nombre: nombre.slice(0, 200),
      precio: Math.round(precio * 100) / 100,
      descripcion: (descripcion ?? "").slice(0, 500),
    });
  });

  return { filas, errores };
}

export type ResultadoImport = { categoriasCreadas: number; productosCreados: number; fallos: { nombre: string; motivo: string }[] };

/** Crea categorías faltantes + productos en lote. La BD es la autoridad (RLS + validaciones). */
export async function importarMenu(filas: FilaMenu[]): Promise<ResultadoImport> {
  // Mapa nombre(min)→id de categorías existentes.
  const existentes = await listarCategoriasOpciones();
  const mapa = new Map<string, string>(existentes.map((c) => [c.nombre.trim().toLowerCase(), c.id]));

  // Crear categorías faltantes (únicas, en orden de aparición).
  let categoriasCreadas = 0;
  const nuevas = [...new Set(filas.map((f) => f.categoria.trim()))].filter((n) => !mapa.has(n.toLowerCase()));
  for (const nombre of nuevas) {
    await crearCategoria({ nombre, descripcion: "", color_hex: null, icono: null, activa: true });
    categoriasCreadas++;
  }
  // Re-leer para obtener los ids de las recién creadas.
  if (categoriasCreadas > 0) {
    const refrescadas = await listarCategoriasOpciones();
    for (const c of refrescadas) mapa.set(c.nombre.trim().toLowerCase(), c.id);
  }

  let productosCreados = 0;
  const fallos: ResultadoImport["fallos"] = [];
  for (const f of filas) {
    const categoriaId = mapa.get(f.categoria.trim().toLowerCase());
    if (!categoriaId) {
      fallos.push({ nombre: f.nombre, motivo: `No se pudo resolver la categoría "${f.categoria}"` });
      continue;
    }
    try {
      await crearProducto({
        nombre: f.nombre,
        categoria_id: categoriaId,
        precio_base_mxn: f.precio,
        descripcion: f.descripcion,
        codigo_interno: "",
        estado: "ACTIVO",
        agotado: false,
        visible_en_pos: true,
        marca_virtual_id: "",
      });
      productosCreados++;
    } catch (e) {
      fallos.push({ nombre: f.nombre, motivo: e instanceof Error ? e.message : "Error" });
    }
  }

  return { categoriasCreadas, productosCreados, fallos };
}
