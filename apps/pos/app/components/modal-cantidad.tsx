"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Icono, Modal } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import { precioConUnidad, unidadDeVenta, type TipoVenta } from "../lib/unidades";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/** Una tecla sobre lo tecleado: dígitos, un solo punto (la coma cuenta como punto) y borrar. */
export function teclear(texto: string, tecla: string): string {
  if (tecla === "Backspace") return texto.slice(0, -1);
  if (tecla === "." || tecla === ",") return texto.includes(".") ? texto : `${texto || "0"}.`;
  if (/^[0-9]$/.test(tecla)) return texto.length < 9 ? texto + tecla : texto;
  return texto;
}

/** La cantidad si es mayor a 0 y no trae más decimales de los de su unidad; si no, null. */
export function leerCantidad(texto: string, t: TipoVenta | null | undefined): number | null {
  const { decimales } = unidadDeVenta(t);
  if (!new RegExp(`^\\d*(\\.\\d{0,${decimales}})?$`).test(texto)) return null;
  const n = Number(texto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const TECLAS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "Backspace"];
const TECLA =
  "flex h-16 items-center justify-center rounded-lg border border-line-strong bg-surface font-display text-24 font-semibold text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97] active:bg-line";

/**
 * Ventana de cantidad de la tienda (diseño retail 2): un producto por kilo, metro o litro pide su
 * cantidad antes de entrar al ticket. Teclado en pantalla y físico (números, punto, Backspace,
 * Enter, Escape). Sin campo de texto a propósito: en la pantalla táctil abriría el teclado del sistema.
 */
export function ModalCantidad({ producto, onConfirmar, onCerrar }: { producto: Producto; onConfirmar: (cantidad: number) => void; onCerrar: () => void }) {
  const u = unidadDeVenta(producto.tipoVenta);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState(false);
  useEscape(onCerrar);

  const confirmar = () => {
    const n = leerCantidad(texto, producto.tipoVenta);
    if (n === null) setError(true);
    else onConfirmar(n);
  };
  const pulsar = (tecla: string) => { setError(false); setTexto((t) => teclear(t, tecla)); };

  // Teclado físico. Refs para no volver a colgar el oyente en cada tecla.
  const confirmarRef = useRef(confirmar);
  confirmarRef.current = confirmar;
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); confirmarRef.current(); return; }
      if (/^[0-9.,]$/.test(e.key) || e.key === "Backspace") { e.preventDefault(); setError(false); setTexto((t) => teclear(t, e.key)); }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <Modal open onClose={onCerrar} title={producto.nombre} hideTitle className="w-full max-w-sm rounded-lg bg-surface shadow-xl">
      <div className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-20 font-bold leading-tight text-ink">{producto.nombre}</p>
          <p className="mt-1 font-display text-18 font-bold tabular-nums text-ink">{precioConUnidad(fmtMxn(producto.precio_base_mxn), producto.tipoVenta)}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]"
        >
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>

      <div className="px-6 py-4">
        <p className="text-13 font-semibold text-ink-2">{u.titulo} · {u.abrev}</p>
        <output
          aria-live="polite"
          className={`mt-1.5 flex h-16 items-center justify-end gap-2 rounded-lg border px-4 font-display text-32 font-bold tabular-nums ${error ? "border-danger" : "border-line-strong"}`}
        >
          <span className={texto ? "text-ink" : "text-ink-3"}>{texto || (0).toFixed(u.decimales)}</span>
          <span className="text-20 font-semibold text-ink-2">{u.abrev}</span>
        </output>
        {error && <p className="mt-1.5 text-13 font-medium text-danger" role="alert">Escribe una cantidad mayor a 0</p>}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {TECLAS.map((k) => (
            <button key={k} type="button" className={TECLA} onClick={() => pulsar(k)} aria-label={k === "Backspace" ? "Borrar" : undefined}>
              {k === "Backspace" ? <Icono nombre="retroceso" className="h-6 w-6 text-ink-2" /> : k}
            </button>
          ))}
        </div>
        <Button onClick={confirmar} size="lg" className="mt-4 w-full">Agregar</Button>
      </div>
    </Modal>
  );
}
