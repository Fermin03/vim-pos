import type { MetadataRoute } from "next";

// El menú de cada negocio es su vitrina y sí se busca; el seguimiento de un pedido es privado
// (además lleva `noindex` y `X-Robots-Tag`, por si alguien enlaza uno), y las pantallas de cuenta
// (entrar, registro, recuperar, mi cuenta) no son contenido: tampoco se rastrean.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/*/pedido/", "/*/entrar", "/*/registro", "/*/recuperar", "/*/cuenta", "/api/"] } };
}
