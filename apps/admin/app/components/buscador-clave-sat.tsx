"use client";
import { useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { input } from "./campos";
import { buscarClavesSat, type ClaveSat } from "../lib/clave-sat";
import { mensajeError } from "../lib/errores";

/** Busca en el catálogo del SAT y llena la clave al elegir. La clave se puede seguir escribiendo a mano. */
export function BuscadorClaveSat({ onElegir }: { onElegir: (clave: string) => void }) {
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<ClaveSat[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);
  async function buscar() {
    const n = ++ultima.current; // solo cuenta la búsqueda más reciente
    setBuscando(true); setError(null);
    try { const r = await buscarClavesSat(texto); if (n === ultima.current) setRes(r); }
    catch (e) { if (n === ultima.current) { setError(mensajeError(e, "No se pudo buscar")); setRes(null); } }
    finally { if (n === ultima.current) setBuscando(false); }
  }
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input aria-label="Buscar clave en el catálogo del SAT" className={input} value={texto} placeholder="Buscar: camisa, pantalón, tenis…"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(); } }} />
        <Button type="button" variant="ghost" disabled={buscando || texto.trim().length < 3} onClick={() => void buscar()}>{buscando ? "Buscando…" : "Buscar"}</Button>
      </div>
      {error && <p className="mt-1 text-13 text-danger" role="alert">{error}</p>}
      {res && res.length === 0 && <p className="mt-1 text-13 text-ink-2">Sin resultados. Prueba con otra palabra.</p>}
      {res && res.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-line">
          {res.map((c) => (
            <li key={c.clave}>
              <button type="button" className="flex w-full gap-3 px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { onElegir(c.clave); setRes(null); }}>
                <span className="font-mono text-13">{c.clave}</span><span className="text-ink-2">{c.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
