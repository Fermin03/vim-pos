"use client";
import type { ModoServicio } from "../lib/carrito";

const MODOS: { valor: ModoServicio; etiqueta: string }[] = [
  { valor: "COMER_AQUI", etiqueta: "Comer aquí" },
  { valor: "PARA_LLEVAR", etiqueta: "Para llevar" },
  { valor: "DRIVE_THRU", etiqueta: "Drive-thru" },
];

export function SelectorModoServicio({
  valor,
  onCambiar,
}: {
  valor: ModoServicio;
  onCambiar: (m: ModoServicio) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-hover p-1" role="radiogroup" aria-label="Modo de servicio">
      {MODOS.map((m) => {
        const activo = valor === m.valor;
        return (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambiar(m.valor)}
            className={[
              "flex-1 rounded px-2 py-1.5 text-[12.5px] font-semibold transition-colors",
              activo ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {m.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
