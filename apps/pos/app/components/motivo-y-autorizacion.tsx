"use client";
import { Aviso } from "@vim/ui/styles";

/**
 * Las dos piezas que repiten los diálogos de la caja que piden permiso (cancelar, devolver,
 * reimprimir, descontar…). Cada modal tenía su copia, con el borde del aviso en hexadecimal y el
 * motivo como botones en unos y como `<select>` en otro (revisión de diseño, sep 2026).
 */

/** "Dentro de tu rol" o "Requiere PIN": se dice ANTES de tocar el botón, no después. */
export function AvisoAutorizacion({ propia, texto }: { propia: boolean; texto?: string }) {
  return (
    <Aviso tono={propia ? "success" : "warning"}>
      {texto ?? (propia ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor.")}
    </Aviso>
  );
}

/** El motivo como se asienta en la autorización: lo escrito si es "Otro", si no su etiqueta. */
export function etiquetaMotivo(opciones: ReadonlyArray<{ codigo: string; label: string }>, motivo: string, texto: string): string {
  if (motivo === "OTRO") return texto.trim() || "Otro";
  return opciones.find((m) => m.codigo === motivo)?.label ?? motivo;
}

const campo =
  "h-11 w-full rounded border border-line-strong px-3 text-14 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * El motivo como botones grandes, que en pantalla táctil se eligen de un toque. "Otro" abre un
 * campo para escribirlo. El valor `OTRO` es el mismo en todos los catálogos de motivos.
 */
export function MotivoChips<T extends string>({
  titulo = "Motivo",
  opciones,
  valor,
  onCambiar,
  texto,
  onTexto,
  maxLength = 200,
}: {
  titulo?: string;
  opciones: ReadonlyArray<{ codigo: T; label: string }>;
  valor: T;
  onCambiar: (v: T) => void;
  texto: string;
  onTexto: (t: string) => void;
  maxLength?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 text-13 font-medium text-ink-2">{titulo}</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={titulo}>
        {opciones.map((m) => (
          <button
            key={m.codigo}
            type="button"
            role="radio"
            aria-checked={valor === m.codigo}
            onClick={() => onCambiar(m.codigo)}
            className={[
              "rounded-full border px-3 py-1.5 text-13 font-semibold transition",
              valor === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
            ].join(" ")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {valor === "OTRO" && (
        <input
          className={`${campo} mt-2`}
          value={texto}
          maxLength={maxLength}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="Describe el motivo"
          aria-label="Describe el motivo"
        />
      )}
    </div>
  );
}
