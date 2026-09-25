"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

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
 * "Cancelar" va primero en el DOM a propósito: el `Modal` enfoca el primer control, y un Enter
 * accidental tiene que caer en la opción que no destruye nada.
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
    <Modal
      open
      onClose={() => cerrar(false)}
      title={abierto.titulo}
      hideTitle
      className="w-[min(440px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{abierto.titulo}</h2>
      {abierto.mensaje && <div className="mt-2 text-[14px] leading-snug text-ink-2">{abierto.mensaje}</div>}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => cerrar(false)}>
          Cancelar
        </Button>
        <Button
          variant={abierto.peligrosa === false ? "primary" : "danger"}
          className="flex-1"
          onClick={() => cerrar(true)}
        >
          {abierto.boton}
        </Button>
      </div>
    </Modal>
  ) : null;

  return [confirmar, dialogo];
}
