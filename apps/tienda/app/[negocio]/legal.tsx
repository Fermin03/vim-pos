// Lo que comparten las dos páginas de texto de la tienda (aviso de privacidad y condiciones para
// pedir): los estilos de título y enlace, y la lista de teléfonos del restaurante.
import type { Sucursal } from "../lib/contrato";
import { enlaceTel, formatoTelefono } from "../lib/telefono";

export const TITULO = "mt-8 font-display text-18 font-semibold";
export const ENLACE = "font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Los teléfonos de las sucursales que tienen uno; con varias, cada uno con el nombre de su sucursal. */
export function Telefonos({ sucursales }: { sucursales: Sucursal[] }) {
  if (sucursales.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {sucursales.map((s) => {
        const tel = enlaceTel(s.telefono);
        return (
          <li key={s.id}>
            {sucursales.length > 1 && `${s.nombre}: `}
            {tel ? <a href={tel} className={ENLACE}>{formatoTelefono(s.telefono ?? "")}</a> : s.telefono}
          </li>
        );
      })}
    </ul>
  );
}
