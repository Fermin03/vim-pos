"use client";
import type { Caja } from "../lib/configuracion";

/**
 * Una caja de escritorio sin actualizar ignora el menú por sucursal y vende todo al precio general
 * (spec 2026-10-02 §7.3). Se nombra cada una: el dueño necesita saber a cuál ir.
 */
export function AvisoCajasMenu({ cajas }: { cajas: Pick<Caja, "id" | "nombre" | "sucursalNombre" | "versionApp">[] }) {
  if (cajas.length === 0) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">
        {cajas.length === 1 ? "Una caja todavía no respeta el menú por sucursal" : `${cajas.length} cajas todavía no respetan el menú por sucursal`}
      </p>
      <ul className="mt-1 text-ink-2">
        {cajas.map((c) => (
          <li key={c.id}>
            {c.nombre} ({c.sucursalNombre}) tiene la versión {c.versionApp ?? "anterior a 0.4.60"}: hasta que se actualice vende todo
            al precio general y muestra todos los productos.
          </li>
        ))}
      </ul>
    </div>
  );
}
