"use client";
import { useRef, useState } from "react";
import { input } from "./campos";
import { buscarCapturable, type Capturable } from "../lib/existencias";

/**
 * Captura de renglones para Recibir, Conteo y Traspasos. El escáner es un teclado que escribe el
 * código y Enter: con código exacto agrega y limpia; si no, enseña hasta 8 por nombre. Nada aquí
 * envía un formulario.
 */
export function CapturaProductos<P extends Capturable>({
  productos,
  alAgregar,
  placeholder = "Escanea o escribe nombre, SKU o código",
}: {
  productos: P[];
  alAgregar: (producto: P) => void;
  placeholder?: string;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{ buscado: string; coincidencias: P[] } | null>(null);

  function agregar(p: P) {
    alAgregar(p);
    setTexto("");
    setResultado(null);
    campo.current?.focus();
  }

  function buscar() {
    const { exacto, coincidencias } = buscarCapturable(productos, texto);
    if (exacto) agregar(exacto);
    else setResultado(texto.trim() ? { buscado: texto.trim(), coincidencias } : null);
  }

  return (
    <div>
      <label className="sr-only" htmlFor="captura">Agregar producto</label>
      <input
        id="captura"
        ref={campo}
        autoFocus
        autoComplete="off"
        className={input}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          buscar();
        }}
      />
      {resultado && resultado.coincidencias.length === 0 && (
        <p className="mt-2 text-13 text-ink-2" role="status">No se encontró «{resultado.buscado}».</p>
      )}
      {resultado && resultado.coincidencias.length > 0 && (
        <ul className="mt-2 rounded border border-line">
          {resultado.coincidencias.map((p) => (
            <li key={p.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                onClick={() => agregar(p)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-sm transition-colors hover:bg-hover lg:min-h-[36px]"
              >
                <span className="font-medium">{p.nombre}</span>
                {(p.codigo_interno || p.codigo_barras) && <span className="text-13 text-ink-3">{p.codigo_interno || p.codigo_barras}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
