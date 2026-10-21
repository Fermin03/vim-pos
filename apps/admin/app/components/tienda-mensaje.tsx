import { cn } from "@vim/ui/styles";

/**
 * Lo que la página le dice a un bloque después de guardar: junto a lo que se guardó, sin toasts.
 * `aviso` = se guardó, pero algo quedó pendiente (volver a leer); trae su «Reintentar».
 */
export type MensajeTienda = { tipo: "error" | "ok" | "aviso"; texto: string; onReintentar?: () => void };

const TONO = { error: "text-danger", ok: "text-success", aviso: "text-warning" } as const;

export function LineaMensaje({ mensaje, className }: { mensaje: MensajeTienda | null; className?: string }) {
  if (!mensaje) return null;
  return (
    <p
      role={mensaje.tipo === "ok" ? "status" : "alert"}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium", TONO[mensaje.tipo], className)}
    >
      <span className="min-w-0">{mensaje.texto}</span>
      {mensaje.onReintentar && (
        <button
          type="button"
          onClick={mensaje.onReintentar}
          className="h-11 flex-shrink-0 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Reintentar
        </button>
      )}
    </p>
  );
}
