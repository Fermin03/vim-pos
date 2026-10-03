"use client";
import { precioMxn } from "../lib/catalogo";
import { limpiarPrecio } from "../lib/numeros";
import type { FilaFormMenu } from "../lib/menu-sucursal";

/**
 * Por sucursal: si se vende, a qué precio (vacío = el general) y si está agotado. «Por inventario»
 * es de solo lectura: lo pone y lo quita la base cuando un insumo crítico se acaba EN esa sucursal.
 * Solo se muestra con dos o más sucursales; con una, el formulario se ve como siempre.
 */
export function DisponibilidadSucursales({
  filas,
  precioGeneral,
  onCambio,
}: {
  filas: FilaFormMenu[];
  precioGeneral: number | null;
  onCambio: (sucursalId: string, cambio: Partial<FilaFormMenu>) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-13 font-medium text-ink-2">Por sucursal</p>
      <div className="overflow-hidden rounded border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sel text-left text-12 font-bold uppercase tracking-wide text-ink-3">
              <th className="px-3 py-2">Sucursal</th>
              <th className="w-[84px] px-3 py-2">Se vende</th>
              <th className="w-[132px] px-3 py-2 text-right">Precio</th>
              <th className="w-[84px] px-3 py-2">Agotado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.sucursalId} className="border-t border-line">
                <td className="px-3 py-2 font-medium">
                  {f.nombre}
                  {f.agotadoAuto && (
                    <span className="ml-2 rounded-full bg-[#FBF1EF] px-2 py-0.5 text-11 font-semibold text-danger">Agotado por inventario</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-ink"
                    aria-label={`Se vende en ${f.nombre}`}
                    checked={f.disponible}
                    onChange={(e) => onCambio(f.sucursalId, { disponible: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="relative">
                    <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2">$</span>
                    <input
                      className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                      inputMode="decimal"
                      aria-label={`Precio en ${f.nombre}`}
                      value={f.precio}
                      disabled={!f.disponible}
                      placeholder={precioGeneral !== null ? String(precioGeneral) : "General"}
                      onChange={(e) => onCambio(f.sucursalId, { precio: limpiarPrecio(e.target.value) })}
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-ink"
                    aria-label={`Agotado en ${f.nombre}`}
                    checked={f.agotado}
                    disabled={!f.disponible}
                    onChange={(e) => onCambio(f.sucursalId, { agotado: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-13 text-ink-2">
        Precio vacío = el general{precioGeneral !== null ? ` (${precioMxn(precioGeneral)})` : ""}. Lo que se apaga en una sucursal no
        sale en sus cajas ni en su carta de Uber.
      </p>
    </div>
  );
}
