"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { DialogoPeligro } from "./dialogo-peligro";

export type OpcionesConfirmar = {
  /** La pregunta: "¿Eliminar la marca Tacos Doña Mary?". */
  titulo: string;
  /** La CONSECUENCIA, no la pregunta repetida: qué deja de pasar y si se puede deshacer. */
  mensaje?: ReactNode;
  /** El verbo del botón: "Eliminar", "Dar de baja", "Retirar sello". Nunca "Aceptar". */
  boton: string;
  /** false para una confirmación que no destruye nada (botón azul). Por defecto es peligrosa. */
  peligrosa?: boolean;
};

/**
 * Confirmación de la casa, en lugar de `window.confirm()`.
 *
 * El panel tenía cinco formas de preguntar antes de borrar: el `confirm()` del navegador (sin
 * estilo, con "Aceptar" como verbo y que en móvil tapa la pantalla), `prompt()`, diálogos hechos a
 * mano sin Esc ni foco atrapado, el `Modal` y, en un par de lugares, ninguna (revisión de diseño,
 * sep 2026). Esta es la única.
 *
 * Se usa como una promesa, para que cambiar un `confirm()` sea cambiar una línea:
 *
 *   const [confirmar, dialogoConfirmar] = useConfirmar();
 *   if (!(await confirmar({ titulo: "¿Eliminar…?", mensaje: "…", boton: "Eliminar" }))) return;
 *   …
 *   return <>{…}{dialogoConfirmar}</>;
 *
 * Dibuja con `DialogoPeligro`, el mismo marco que la caja y el panel. Para lo que además pide
 * motivo, espera una respuesta o muestra un error, se usa `DialogoPeligro` directamente.
 */
export function useConfirmar(): [(o: OpcionesConfirmar) => Promise<boolean>, ReactNode] {
  const [abierto, setAbierto] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback((o: OpcionesConfirmar) => {
    // Si quedaba una pregunta pendiente (doble clic), se da por cancelada.
    resolver.current?.(false);
    setAbierto(o);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const cerrar = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAbierto(null);
  }, []);

  const dialogo = abierto ? (
    <DialogoPeligro
      titulo={abierto.titulo}
      consecuencia={abierto.mensaje}
      boton={abierto.boton}
      peligrosa={abierto.peligrosa !== false}
      ancho="sm"
      onConfirmar={() => cerrar(true)}
      onCerrar={() => cerrar(false)}
    />
  ) : null;

  return [confirmar, dialogo];
}
