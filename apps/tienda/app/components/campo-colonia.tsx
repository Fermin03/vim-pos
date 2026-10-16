"use client";
// El campo Colonia cuando la sucursal tiene catálogo (0187): al escribir sugiere las colonias de la
// sucursal (desde 2 letras, tras 300 ms, hasta 8). Elegir una se lo dice a quien lo usa (`alElegir`),
// que llena colonia y CP; escribir encima es solo texto otra vez (`alEscribir`). Cualquier error de la
// búsqueda (corta, larga, sin red) es «sin sugerencias»: el campo sigue sirviendo como texto libre.
// Teclado: ↑↓ recorren la lista, Enter elige, Escape la cierra (combobox ARIA 1.2, la lista en el flujo).
import { useEffect, useState } from "react";
import { cn } from "@vim/ui/styles";
import { colonias } from "../lib/api";
import type { ColoniaSugerida } from "../lib/contrato";
import { CampoDeTexto } from "./campo";

const ESPERA_MS = 300;
const TOPE = 8;

export function CampoColonia({ negocio, sucursalId, valor, alEscribir, alElegir, id, etiqueta = "Colonia", error, maxLength, alSalir }: {
  negocio: string; sucursalId: string; valor: string;
  alEscribir: (v: string) => void; alElegir: (c: ColoniaSugerida) => void;
  id: string; etiqueta?: string; error?: string; maxLength?: number; alSalir: () => void;
}) {
  /** Lo que el cliente escribió (no lo que llenó una sugerencia): eso es lo que se busca. */
  const [consulta, setConsulta] = useState<string | null>(null);
  const [lista, setLista] = useState<ColoniaSugerida[]>([]);
  const [activa, setActiva] = useState(-1);
  const idDeLista = `${id}-sugerencias`;

  useEffect(() => {
    const q = consulta?.trim() ?? "";
    if (q.length < 2) { setLista([]); return; }
    const corte = new AbortController();
    const reloj = setTimeout(async () => {
      const r = await colonias(negocio, sucursalId, q, corte.signal);
      if (corte.signal.aborted) return;
      setLista(r.ok ? r.datos.slice(0, TOPE) : []);
      setActiva(-1);
    }, ESPERA_MS);
    return () => { clearTimeout(reloj); corte.abort(); };
  }, [consulta, negocio, sucursalId]);

  const abierta = lista.length > 0;
  // La lista va bajo el campo, en la parte que el teclado del teléfono suele tapar: al abrirse se trae a la vista.
  useEffect(() => {
    if (abierta) document.getElementById(idDeLista)?.scrollIntoView({ block: "nearest" });
  }, [abierta, idDeLista]);
  const cerrar = () => { setLista([]); setActiva(-1); setConsulta(null); };
  const elegir = (c: ColoniaSugerida) => { cerrar(); alElegir(c); };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <CampoDeTexto id={id} etiqueta={etiqueta} value={valor} error={error} maxLength={maxLength}
        // Sin el autollenado de dirección del navegador: Safari llenaba la colonia de golpe con la de la
        // tarjeta de contacto, sin pasar por la lista del catálogo.
        autoComplete="off"
        role="combobox" aria-expanded={abierta} aria-controls={idDeLista} aria-autocomplete="list"
        aria-activedescendant={activa >= 0 ? `${idDeLista}-${activa}` : undefined}
        alCambiar={(v) => { alEscribir(v); setConsulta(v); }}
        alSalir={() => { cerrar(); alSalir(); }}
        onKeyDown={(e) => {
          if (!abierta) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const paso = e.key === "ArrowDown" ? 1 : -1;
            setActiva((a) => (a + paso + lista.length) % lista.length);
          } else if (e.key === "Enter" && activa >= 0) {
            // Enter elige; sin una resaltada sigue siendo el Enter del formulario.
            e.preventDefault();
            elegir(lista[activa]!);
          } else if (e.key === "Escape") {
            // Cierra la lista, no la hoja.
            e.preventDefault(); e.stopPropagation();
            cerrar();
          }
        }} />
      <ul id={idDeLista} role="listbox" aria-label={etiqueta}
        className={cn(abierta ? "flex" : "hidden", "flex-col overflow-hidden rounded border border-line-strong bg-surface")}>
        {lista.map((c, i) => (
          <li key={c.id} id={`${idDeLista}-${i}`} role="option" aria-selected={i === activa}
            // Sin perder el foco del campo: si no, salir del campo cerraría la lista antes del clic.
            onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(c)}
            className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-16 [overflow-wrap:anywhere]", i === activa ? "bg-sel" : "hover:bg-hover")}>
            <span className="min-w-0">{c.nombre}</span>
            {c.codigo_postal && <span className="flex-shrink-0 text-14 tabular-nums text-ink-2">{c.codigo_postal}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
