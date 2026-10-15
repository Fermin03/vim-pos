"use client";
import { useEffect, useRef, useState } from "react";
import { buscarColonias, normalizarColonia, type Colonia } from "../lib/colonias";
import type { ZonaEnvio } from "../lib/zonas-envio";

const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Colonia con sugerencias del catálogo de la sucursal, como la búsqueda por teléfono: desde 2
 * letras, 300 ms, hasta 8. Elegir una llena zona y CP (lo hace quien lo usa con `onElegir`).
 * Sin catálogo es un campo de texto como siempre.
 */
export function BuscadorColonia({ token, sucursalId, hayCatalogo, zonas, texto, elegida, onTexto, onElegir, className }: {
  token: string; sucursalId: string; hayCatalogo: boolean; zonas: ZonaEnvio[];
  texto: string; /** Ya se eligió una de las sugerencias: no hay nada que avisar. */ elegida: boolean; onTexto: (t: string) => void; onElegir: (c: Colonia) => void; className: string;
}) {
  const [res, setRes] = useState<Colonia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  // Las últimas sugerencias traían una con este mismo nombre: no se agrega otra. Sobrevive al cerrar la lista.
  const [yaEsta, setYaEsta] = useState(false);
  const ultima = useRef(0);

  useEffect(() => {
    if (!hayCatalogo || !abierto || texto.trim().length < 2) { ultima.current++; setRes([]); return; }
    const n = ++ultima.current;
    const t = setTimeout(() => {
      buscarColonias(token, sucursalId, texto, zonas)
        .then((r) => {
          if (n !== ultima.current) return;
          setRes(r); setActivo(-1);
          setYaEsta(r.some((c) => normalizarColonia(c.nombre) === normalizarColonia(texto)));
        })
        .catch(() => { if (n === ultima.current) setRes([]); });   // sin sugerencias: se escribe a mano
    }, 300);
    return () => clearTimeout(t);
  }, [token, sucursalId, texto, zonas, hayCatalogo, abierto]);

  function elegir(c: Colonia) { onElegir(c); setAbierto(false); setRes([]); }

  return (
    <div className="relative">
      <input className={className} value={texto} maxLength={150} role="combobox" aria-expanded={abierto && res.length > 0}
        aria-autocomplete="list" autoComplete="off"
        onChange={(e) => { onTexto(e.target.value); setAbierto(true); setYaEsta(false); }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (!res.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, res.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && activo >= 0) { e.preventDefault(); elegir(res[activo]!); }
        }} />
      {abierto && res.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-line bg-surface shadow-[0_8px_24px_rgba(22,22,26,.12)]">
          {res.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === activo}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(c)}
                className={["flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-13", i === activo ? "bg-hover" : "hover:bg-hover"].join(" ")}>
                <span className="truncate font-medium">{c.nombre}{c.codigoPostal && <span className="ml-1.5 font-mono text-12 text-ink-3">{c.codigoPostal}</span>}</span>
                <span className="shrink-0 text-12 text-ink-3">{c.zona ? `${c.zona.nombre} · ${fmtMxn(c.zona.costoMxn)}` : "Sin zona"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hayCatalogo && texto.trim() && !elegida && (
        <p className="mt-1 text-12 text-ink-3">
          {yaEsta ? `«${texto.trim()}» ya está en el catálogo: elígela de la lista para usar su CP y zona.`
                  : `«${texto.trim()}» se agregará al catálogo de colonias.`}
        </p>
      )}
    </div>
  );
}
