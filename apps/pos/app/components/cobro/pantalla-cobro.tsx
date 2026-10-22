"use client";
// Marco común del cobro a pantalla completa (spec 2026-10-21): cabecera de 72 px con el botón de
// regresar SIEMPRE en el mismo sitio, cuerpo y pie. Sin animación entre pasos: el cobro se usa
// cientos de veces al día (tokens.css, regla de frecuencia).
import { useEffect, useRef, useState } from "react";
import { Icono } from "@vim/ui/styles";

// El numpad trabaja en CENTAVOS (estándar POS): cada dígito desplaza los decimales, así se
// capturan totales fraccionarios (p.ej. $49.50 tras un % de descuento) sin tecla de punto.
export const aMonto = (buf: string) => (buf ? parseInt(buf, 10) : 0) / 100; // buffer de centavos → pesos
export const aBuffer = (v: number) => String(Math.round(v * 100));          // pesos → buffer de centavos

const presion = "transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.98]";

export function PantallaCobro({ regresar, contexto, derecha, children, pie }: {
  /** null = sin botón (la terminal cobrando: de ahí se sale con «Cancelar cobro»). */
  regresar: { icono: "cerrar" | "atras"; onClick: () => void; disabled?: boolean } | null;
  contexto: React.ReactNode;
  derecha?: React.ReactNode;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  // Cada paso tapa toda la caja, y sus botones quedan justo donde estaba lo que se tocó para llegar
  // («Cobrar» abajo a la derecha → «Más»). El clic que trae a este paso, o un doble toque, no debe
  // caer en él: los primeros 250 ms no se reciben toques.
  const [recibe, setRecibe] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRecibe(true), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-surface ${recibe ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label="Cobro">
      <header className="grid h-[72px] flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line px-6">
        <div>
          {regresar && (
            <button
              type="button"
              onClick={regresar.onClick}
              disabled={regresar.disabled}
              aria-label={regresar.icono === "cerrar" ? "Cerrar cobro" : "Regresar"}
              className={`flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-hover disabled:opacity-40 ${presion}`}
            >
              <Icono nombre={regresar.icono === "cerrar" ? "cerrar" : "flecha-izquierda"} className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="truncate text-center text-15 text-ink-3">{contexto}</div>
        <div className="flex justify-end">{derecha}</div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      {pie && <footer className="flex-shrink-0 px-8 pb-6 pt-3">{pie}</footer>}
    </div>
  );
}

type PropsBoton = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function BotonPrincipal({ className = "", ...p }: PropsBoton) {
  return (
    <button
      type="button"
      {...p}
      className={`flex h-[72px] w-full items-center justify-center rounded-lg bg-accent px-6 text-20 font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:active:scale-100 ${presion} ${className}`}
    />
  );
}

export function BotonSecundario({ className = "", ...p }: PropsBoton) {
  return (
    <button
      type="button"
      {...p}
      className={`flex h-[72px] w-full items-center justify-center rounded-lg border border-line-strong bg-surface px-6 text-20 font-semibold text-ink hover:bg-hover disabled:cursor-not-allowed disabled:bg-hover disabled:text-ink-3 disabled:active:scale-100 ${presion} ${className}`}
    />
  );
}

/** Fila de 72 px con chevron: la lista de formas de pago («¿Cómo paga?», «Más»). */
export function FilaOpcion({ titulo, sub, aviso = false, ocupado = false, onClick }: {
  titulo: string;
  sub?: React.ReactNode;
  /** El subtítulo es un aviso (terminal no disponible). */
  aviso?: boolean;
  ocupado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={ocupado || undefined}
      className="flex min-h-[72px] w-full items-center justify-between gap-4 border-t border-line px-2 py-3 text-left transition-colors last:border-b hover:bg-hover"
    >
      <span className="min-w-0">
        <span className="block text-20 font-semibold text-ink">{titulo}</span>
        {sub && <span className={`mt-0.5 block text-14 ${aviso ? "text-warning" : "text-ink-3"}`} role={aviso ? "status" : undefined}>{sub}</span>}
      </span>
      <Icono nombre="chevron-derecha" className="h-6 w-6 flex-shrink-0 text-ink-3" />
    </button>
  );
}

export function Numpad({
  buffer,
  onChange,
  compact = false,
  grande = false,
  onEnter,
  capturarTeclado = true,
}: {
  buffer: string;
  onChange: (b: string) => void;
  /** Teclas de 60 px: el teclado de la columna del pago dividido. */
  compact?: boolean;
  /** Teclas de 76 px: las del cobro en efectivo, el teclado que más se usa del turno. */
  grande?: boolean;
  /** Enter confirma (p. ej. cobrar). */
  onEnter?: () => void;
  /** Si es false, no escucha el teclado (por si convivieran dos numpads). */
  capturarTeclado?: boolean;
}) {
  const alto = grande ? "h-[76px] text-[26px]" : compact ? "h-[60px] text-[22px]" : "h-16 text-24";

  function press(key: string) {
    if (key === "back") onChange(buffer.slice(0, -1));
    else if (key === "00") onChange((buffer + "00").slice(0, 8));
    else onChange((buffer + key).slice(0, 8));
  }

  // Teclado físico además del táctil: números + Backspace (+ Enter para confirmar). El buffer es en
  // CENTAVOS, así que teclear "4950" = $49.50 igual que tocando; se ignoran '.'/','. Refs para no
  // re-registrar el listener en cada cambio de buffer.
  const onChangeRef = useRef(onChange);
  const bufferRef = useRef(buffer);
  const onEnterRef = useRef(onEnter);
  onChangeRef.current = onChange;
  bufferRef.current = buffer;
  onEnterRef.current = onEnter;
  useEffect(() => {
    if (!capturarTeclado) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // El ref se adelanta al render: teclas seguidas (o un lector de códigos) parten del último
      // valor, no del que alcanzó a pintarse; si no, se comían dígitos.
      const poner = (b: string) => { bufferRef.current = b; onChangeRef.current(b); };
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); poner((bufferRef.current + e.key).slice(0, 8)); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); poner(bufferRef.current.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); onEnterRef.current?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturarTeclado]);

  const keys = ["1","2","3","4","5","6","7","8","9","00","0","back"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          aria-label={k === "back" ? "Borrar" : undefined}
          className={`flex items-center justify-center rounded-lg bg-hover font-display font-semibold text-ink active:bg-line ${presion} ${alto}`}
        >
          {k === "back" ? <Icono nombre="retroceso" className="h-7 w-7 text-ink-2" /> : k}
        </button>
      ))}
    </div>
  );
}
