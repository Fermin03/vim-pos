"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../cn";

export interface PinKeypadProps {
  /** Longitud del PIN (4–6). */
  length?: number;
  /** Se llama cuando el PIN alcanza `length` (salvo `autoSubmit={false}`). */
  onComplete: (pin: string) => void;
  /** Notifica cada cambio del PIN (para habilitar un botón externo "Continuar"). */
  onChange?: (pin: string) => void;
  /** Mensaje de error a mostrar bajo los puntos (ej. "PIN incorrecto"). */
  error?: string | null;
  /** Estado visual de los puntos: error (rojo + shake) u ok (verde). */
  status?: "idle" | "error" | "ok";
  /** Deshabilita el teclado (mientras valida). */
  disabled?: boolean;
  /** Si es false, NO auto-envía al llegar a `length` (el padre envía con un botón). */
  autoSubmit?: boolean;
  /** Al cambiar este número, limpia el PIN (para reintentos tras error). */
  clearSignal?: number;
  /** Clases extra del contenedor (p. ej. ancho del teclado). */
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** Teclado numérico para PIN — táctil, accesible, igual a los mockups (P-002/010/012). */
export function PinKeypad({
  length = 4,
  onComplete,
  onChange,
  error,
  status = "idle",
  disabled,
  autoSubmit = true,
  clearSignal,
  className,
}: PinKeypadProps) {
  const [pin, setPin] = useState("");

  // Callbacks vía refs: los efectos no se re-disparan si el padre pasa funciones inline.
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (clearSignal === undefined) return;
    setPin("");
  }, [clearSignal]);

  // Side effects FUERA del updater de setState (evita "setState durante render") y
  // basados en el valor real de `pin` (robusto ante pulsaciones síncronas rápidas).
  useEffect(() => {
    onChangeRef.current?.(pin);
    if (pin.length === length && autoSubmit) {
      onCompleteRef.current(pin);
      setPin("");
    }
  }, [pin, length, autoSubmit]);

  const press = useCallback(
    (k: string) => {
      if (disabled) return;
      setPin((p) => {
        if (k === "del") return p.slice(0, -1);
        if (p.length >= length) return p;
        return p + k;
      });
    },
    [disabled, length],
  );

  // Teclado físico: además del táctil, se puede teclear con números y Backspace (P-002/010/012).
  // Útil en caja con teclado; en tablet el táctil sigue igual. Ignora si el foco está en un input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); press("del"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, disabled]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Puntos del PIN */}
      <div
        className={cn("flex gap-3", status === "error" && "animate-vim-shake")}
        role="status"
        aria-label={`PIN: ${pin.length} de ${length} dígitos`}
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <span
              key={i}
              className={cn(
                "h-3 w-3 rounded-full border-[1.5px] transition-colors",
                status === "error"
                  ? filled
                    ? "border-danger bg-danger"
                    : "border-danger"
                  : status === "ok"
                    ? "border-success bg-success"
                    : filled
                      ? "border-ink bg-ink"
                      : "border-line-strong",
              )}
            />
          );
        })}
      </div>

      <p className="min-h-[17px] text-center text-[12.5px] font-medium text-danger" role="alert">
        {error ?? ""}
      </p>

      {/* Teclado */}
      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => press(k)}
              aria-label={k === "del" ? "Borrar" : k}
              className={cn(
                "flex aspect-square items-center justify-center rounded font-display text-[22px] font-semibold",
                "select-none border border-line-strong text-ink",
                "transition-colors hover:bg-hover active:border-ink active:bg-hover",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink",
                "disabled:opacity-40",
              )}
            >
              {k === "del" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[22px] w-[22px] text-ink-2"
                  aria-hidden="true"
                >
                  <path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
                  <path d="m15 9-4 4M11 9l4 4" />
                </svg>
              ) : (
                k
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
