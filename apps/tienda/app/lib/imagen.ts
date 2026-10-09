// Las únicas imágenes que la tienda pinta: las del almacén público `productos` de Supabase.
//
// `productos.imagen_url` es texto libre que un administrador puede escribir por la API: se usa SOLO
// si tiene la forma exacta que produce el admin al subir una foto, y solo como `src` de <img>. Lo
// demás (otro origen, `..`, parámetros, `javascript:`) se queda sin foto. La CSP de la app permite
// imágenes de ese mismo origen y de ninguno más (next.config.mjs).

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const ALMACEN = "/storage/v1/object/public/productos/";
const U = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** `<carpeta del negocio>/<archivo>.(jpg|png|webp)`: lo que sube el admin y lo que la base le exige al logo (0163). */
const RUTA = new RegExp(`^${U}/${U}\\.(jpg|png|webp)$`);

const prefijo = (base: string): string | null => {
  const b = base.replace(/\/+$/, "");
  return /^https?:\/\/[^/?#\s]+$/.test(b) ? b + ALMACEN : null;
};

/** La foto de un producto, o null si `imagen_url` no es exactamente una del almacén. */
export function urlDeFoto(imagenUrl: string | null, base: string = BASE): string | null {
  const p = prefijo(base);
  return p && imagenUrl && imagenUrl.startsWith(p) && RUTA.test(imagenUrl.slice(p.length)) ? imagenUrl : null;
}

/** El logo: `logo_ruta` (una ruta, no una URL) → su URL pública, o null. */
export function urlDeLogo(logoRuta: string | null, base: string = BASE): string | null {
  const p = prefijo(base);
  return p && logoRuta && RUTA.test(logoRuta) ? p + logoRuta : null;
}
