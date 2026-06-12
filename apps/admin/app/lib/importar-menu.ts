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

// ── Fase 4 · Migración desde otros POS ───────────────────────────────────────
// Presets de formato: el dueño pega el EXPORT de su POS anterior tal cual; el mapeo
// de columnas se resuelve por encabezados (sinónimos por origen) con autodetección.

export type FormatoOrigen = "AUTO" | "VIM" | "SQUARE" | "TOAST" | "LOYVERSE" | "CLIP";

type MapaCampos = { categoria: string[]; nombre: string[]; precio: string[]; descripcion: string[] };

const MAPEOS: Record<Exclude<FormatoOrigen, "AUTO" | "VIM">, MapaCampos> = {
  SQUARE: {
    categoria: ["category", "categories", "reporting category"],
    nombre: ["item name", "item"],
    precio: ["price", "price point price", "variation price"],
    descripcion: ["description"],
  },
  TOAST: {
    categoria: ["menu group", "group name", "menu"],
    nombre: ["menu item", "item name", "name"],
    precio: ["price", "base price"],
    descripcion: ["description"],
  },
  // CLIP antes que LOYVERSE: los encabezados en español son de Clip; Loyverse exporta en inglés.
  CLIP: {
    categoria: ["categoría", "categoria"],
    nombre: ["nombre", "producto", "artículo", "articulo"],
    precio: ["precio", "precio de venta"],
    descripcion: ["descripción", "descripcion"],
  },
  LOYVERSE: {
    categoria: ["category"],
    nombre: ["name"],
    precio: ["default price", "price"],
    descripcion: ["description"],
  },
};

export const FORMATOS_ORIGEN: { codigo: FormatoOrigen; label: string }[] = [
  { codigo: "AUTO", label: "Detectar automáticamente" },
  { codigo: "VIM", label: "VIM (categoría, producto, precio, descripción)" },
  { codigo: "SQUARE", label: "Square (export de catálogo)" },
  { codigo: "TOAST", label: "Toast (export de menú)" },
  { codigo: "LOYVERSE", label: "Loyverse (export de artículos)" },
  { codigo: "CLIP", label: "Clip (export de productos)" },
];

function indicesPorEncabezado(headers: string[], mapa: MapaCampos): { categoria: number; nombre: number; precio: number; descripcion: number } | null {
  const h = headers.map((x) => x.trim().toLowerCase());
  const buscar = (sins: string[]) => h.findIndex((col) => sins.includes(col));
  const idx = {
    categoria: buscar(mapa.categoria),
    nombre: buscar(mapa.nombre),
    precio: buscar(mapa.precio),
    descripcion: buscar(mapa.descripcion),
  };
  // nombre y precio son indispensables; categoría puede faltar (va a "Importados").
  if (idx.nombre < 0 || idx.precio < 0) return null;
  return idx;
}

/** Detecta el POS de origen por los encabezados de la primera línea. */
export function detectarFormato(texto: string): Exclude<FormatoOrigen, "AUTO"> {
  const primera = texto.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const headers = dividirCSV(primera);
  for (const [codigo, mapa] of Object.entries(MAPEOS) as [Exclude<FormatoOrigen, "AUTO" | "VIM">, MapaCampos][]) {
    if (indicesPorEncabezado(headers, mapa)) return codigo;
  }
  return "VIM";
}

/** Parsea con el preset del POS de origen (o el formato VIM posicional). */
export function parsearConFormato(texto: string, formato: FormatoOrigen): ResultadoParse & { formatoUsado: Exclude<FormatoOrigen, "AUTO"> } {
  const f = formato === "AUTO" ? detectarFormato(texto) : formato;
  if (f === "VIM") return { ...parsearMenu(texto), formatoUsado: "VIM" };

  const mapa = MAPEOS[f];
  const filas: FilaMenu[] = [];
  const errores: ResultadoParse["errores"] = [];
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return { filas, errores, formatoUsado: f };

  const idx = indicesPorEncabezado(dividirCSV(lineas[0]!), mapa);
  if (!idx) {
    errores.push({ linea: 1, texto: lineas[0]!.slice(0, 80), motivo: `Los encabezados no coinciden con el formato ${f}` });
    return { filas, errores, formatoUsado: f };
  }

  lineas.slice(1).forEach((raw, i) => {
    const cols = dividirCSV(raw);
    const nombre = cols[idx.nombre]?.trim();
    const precioRaw = cols[idx.precio]?.trim();
    if (!nombre) return; // filas de variantes/sin nombre (frecuentes en Square) se omiten en silencio
    // "abc" limpiado quedaría "" y Number("")===0: exigir que sobre algo numérico real.
    const limpio = String(precioRaw ?? "").replace(/[^0-9.]/g, "");
    const precio = Number(limpio);
    if (limpio === "" || !Number.isFinite(precio)) {
      errores.push({ linea: i + 2, texto: raw.slice(0, 80), motivo: `Precio inválido: "${precioRaw ?? ""}"` });
      return;
    }
    filas.push({
      categoria: (idx.categoria >= 0 ? cols[idx.categoria]?.trim() : "") || "Importados",
      nombre: nombre.slice(0, 200),
      precio: Math.round(precio * 100) / 100,
      descripcion: (idx.descripcion >= 0 ? (cols[idx.descripcion] ?? "") : "").slice(0, 500),
    });
  });

  return { filas, errores, formatoUsado: f };
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
