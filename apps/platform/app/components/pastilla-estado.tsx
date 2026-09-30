import { COLOR_ESTADO, NOMBRE_ESTADO } from "../lib/formato";

export function PastillaEstado({ estado, grande }: { estado: string; grande?: boolean }) {
  return (
    <span className={["rounded-full font-semibold", grande ? "px-2.5 py-1 text-12" : "px-2 py-0.5 text-11", COLOR_ESTADO[estado] ?? "bg-sel text-ink-3"].join(" ")}>
      {NOMBRE_ESTADO[estado] ?? estado}
    </span>
  );
}
