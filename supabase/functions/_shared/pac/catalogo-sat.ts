// Respuesta de GET /Catalogs/ProductsOrServices de Facturama. Su documentación no trae ejemplo
// ("Sample not available"): se aceptan los dos nombres de campo que usan sus otros catálogos.
export type ClaveSat = { clave: string; descripcion: string };

export function normalizarClavesSat(json: unknown): ClaveSat[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const clave = String(o.Value ?? o.Code ?? "").trim();
    const descripcion = String(o.Name ?? o.Description ?? "").trim();
    return /^\d{8}$/.test(clave) ? [{ clave, descripcion }] : [];
  }).slice(0, 30);
}
