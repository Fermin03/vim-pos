"use client";
import { useState, useCallback } from "react";
import { cn } from "../cn";

export interface PinKeypadProps {
  /** Longitud del PIN (4–6). */
  length?: number;
  /** Se llama cuando el PIN alcanza `length`. */
  onComplete: (pin: string) => void;
  /** Mensaje de error a mostrar bajo los puntos (ej. "PIN incorrecto"). */
  error?: string | null;
  /** Deshabilita el teclado (mientras valida). */
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** Teclado numérico para PIN — táctil, accesible, sin dependencias. */
export function PinKeypad({ length = 4, onComplete, error, disabled }: PinKeypadProps) {
  const [pin, setPin] = useState("");

  const press = useCallback(
    (k: string) => {
      if (disabled) return;
      if (k === "del") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      setPin((p) => {
        if (p.length >= length) return p;
        const next = p + k;
        if (next.length === length) {
          // Difiere el callback para no setState durante render del padre.
          queueMicrotask(() => {
            onComplete(next);
            setPin("");
          });
        }
        return next;
      });
    },
    [disabled, length, onComplete],
  );

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Puntos del PIN */}
      <div className="flex gap-3" role="status" aria-label={`PIN: ${pin.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 transition-colors",
              i < pin.length ? "border-ink bg-ink" : "border-line-strong",
            )}
          />
        ))}
      </div>

      {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3">
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
                "h-16 w-16 rounded-lg font-display text-2xl font-semibold",
                "flex items-center justify-center select-none",
                "border border-line-strong text-ink active:bg-hover",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink",
                "disabled:opacity-40",
              )}
            >
              {k === "del" ? "⌫" : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
