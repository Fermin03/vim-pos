"use client";
import type { FilaFormMenu } from "../lib/menu-sucursal";

/**
 * «Agotado hoy» por sucursal (0155). Lo único que es de la sucursal y no del menú: el precio y si
 * se vende se editan en el menú elegido. «Agotado por inventario» es de solo lectura: lo pone y lo
 * quita la base cuando un insumo crítico se acaba EN esa sucursal. Solo se muestra con dos o más
 * sucursales; con una, el agotado va en el selector «En la caja» y el formulario se ve como siempre.
 * El área de toque de la casilla es la etiqueta (44 px en táctil, 40 en escritorio); la casilla sigue en 20.
 */
export function DisponibilidadSucursales({
  filas,
  onCambio,
}: {
  filas: FilaFormMenu[];
  onCambio: (sucursalId: string, cambio: Partial<FilaFormMenu>) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-13 font-medium text-ink-2">Agotado hoy</p>
      <div className="overflow-hidden rounded border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sel text-left text-12 font-bold uppercase tracking-wide text-ink-3">
              <th className="px-3 py-2">Sucursal</th>
              <th className="w-[110px] px-3 py-2 text-center">Agotado hoy</th>
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
                <td className="px-1 py-0">
                  <label className="mx-auto flex h-11 w-11 cursor-pointer items-center justify-center lg:h-10 lg:w-10">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-ink"
                      aria-label={`Agotado hoy en ${f.nombre}`}
                      checked={f.agotado}
                      onChange={(e) => onCambio(f.sucursalId, { agotado: e.target.checked })}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-13 text-ink-2">El agotado es de la sucursal y del día: no cambia el menú.</p>
    </div>
  );
}
