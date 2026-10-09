import { cn } from "@vim/ui/styles";

/** Lo que la página le dice a un bloque después de guardar: junto a lo que se guardó, sin toasts. */
export type MensajeTienda = { tipo: "error" | "ok"; texto: string };

export function LineaMensaje({ mensaje, className }: { mensaje: MensajeTienda | null; className?: string }) {
  if (!mensaje) return null;
  const error = mensaje.tipo === "error";
  return (
    <p role={error ? "alert" : "status"} className={cn("text-sm font-medium", error ? "text-danger" : "text-success", className)}>
      {mensaje.texto}
    </p>
  );
}
