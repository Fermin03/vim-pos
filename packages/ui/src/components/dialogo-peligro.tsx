"use client";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { Aviso } from "./aviso";
import { Button } from "./button";
import { Modal } from "./modal";

const ANCHOS = {
  sm: "w-[min(440px,calc(100vw-2rem))]",
  md: "w-[min(480px,calc(100vw-2rem))]",
  lg: "w-[min(560px,calc(100vw-2rem))]",
} as const;

export type DialogoPeligroProps = {
  /** Por defecto abierto: casi siempre se monta solo cuando hace falta. */
  abierto?: boolean;
  /** La acción, dicha como pregunta o como verbo: "¿Eliminar la marca?", "Cancelar ticket". */
  titulo: string;
  /** Sobre qué se actúa, en una línea gris: folio, producto, monto. */
  contexto?: ReactNode;
  /** La CONSECUENCIA: qué deja de pasar y si se puede deshacer. No la pregunta repetida. */
  consecuencia?: ReactNode;
  /** Lo que el diálogo pide antes de dejar pasar: motivo, lista de productos, PIN, nombre. */
  children?: ReactNode;
  error?: string | null;
  /** Una línea justo encima de los botones: qué falta para poder confirmar, o qué se eligió. */
  nota?: ReactNode;
  /** El verbo del botón: "Eliminar", "Cancelar ticket", "Desvincular". Nunca "Aceptar". */
  boton: string;
  ocupado?: boolean;
  /** Lo que dice el botón mientras trabaja: "Eliminando…". */
  textoOcupado?: string;
  deshabilitado?: boolean;
  /** false para lo que pide confirmación sin destruir nada (botón azul). Por defecto, rojo. */
  peligrosa?: boolean;
  ancho?: keyof typeof ANCHOS;
  /** Para abrirlo encima de otra capa (la vista previa del recibo del POS vive en z-[60]). */
  backdropClassName?: string;
  onConfirmar: () => void;
  onCerrar: () => void;
};

/**
 * El diálogo de toda acción peligrosa del producto: cancelar un ticket, eliminar un producto,
 * desvincular una caja, suspender a un cliente.
 *
 * Había tres familias que no se parecían entre sí —`useConfirmar` en el admin, los modales de
 * cancelación de la caja y el `DialogoConfirmar` del panel— y dentro de cada una, variantes: el
 * botón de salida decía "Volver", "Cancelar" o "Cerrar"; el ancho iba de 400 a 520; el aviso de
 * autorización llevaba el borde en hexadecimal (revisión de diseño, sep 2026). Este es el marco;
 * lo que cada uno pide (motivo, PIN, escribir el nombre) va adentro como `children`.
 *
 * Reglas que el marco ya cumple y no hay que repetir:
 *  · La salida dice **Volver**: "Cancelar" choca con "Cancelar ticket" en el botón de al lado.
 *  · Volver va primero. El `Modal` enfoca el primer campo y, si no hay, el primer botón: un Enter
 *    accidental cae en lo que no destruye nada.
 *  · Mientras trabaja no se cierra (ni Volver ni Esc): cerrar a la mitad deja sin saber si pasó.
 *  · El error se pinta aquí adentro, no en la página detrás del velo.
 */
export function DialogoPeligro({
  abierto = true,
  titulo,
  contexto,
  consecuencia,
  children,
  error,
  nota,
  boton,
  ocupado = false,
  textoOcupado = "Aplicando…",
  deshabilitado = false,
  peligrosa = true,
  ancho = "md",
  backdropClassName,
  onConfirmar,
  onCerrar,
}: DialogoPeligroProps) {
  const cerrar = () => {
    if (!ocupado) onCerrar();
  };
  return (
    <Modal
      open={abierto}
      onClose={cerrar}
      title={titulo}
      hideTitle
      backdropClassName={backdropClassName}
      className={cn(ANCHOS[ancho], "rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]")}
    >
      <h2 className="font-display text-20 font-semibold leading-tight tracking-tight text-ink">{titulo}</h2>
      {contexto && <p className="mt-1 text-13 text-ink-3">{contexto}</p>}
      {consecuencia && <div className="mt-3 text-14 leading-snug text-ink-2">{consecuencia}</div>}
      {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
      {error && (
        <Aviso tono="danger" role="alert" className="mt-4">
          {error}
        </Aviso>
      )}
      {nota && (
        <p className="mt-4 text-13 text-ink-2" aria-live="polite">
          {nota}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={cerrar} disabled={ocupado}>
          Volver
        </Button>
        <Button
          variant={peligrosa ? "danger" : "primary"}
          className="flex-1"
          onClick={onConfirmar}
          disabled={ocupado || deshabilitado}
        >
          {ocupado ? textoOcupado : boton}
        </Button>
      </div>
    </Modal>
  );
}
