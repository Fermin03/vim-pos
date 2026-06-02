"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Oculta el título visible (sigue en aria-label para a11y). */
  hideTitle?: boolean;
  /** Clases de la tarjeta (override de ancho/padding por defecto). */
  className?: string;
  /** Clases del velo de fondo (override del color/blur por defecto). */
  backdropClassName?: string;
}

/** Modal accesible: role=dialog, aria-modal, Esc cierra, foco atrapado. */
export function Modal({
  open,
  onClose,
  title,
  children,
  hideTitle,
  className,
  backdropClassName,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusables = () =>
      node?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [];

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(focusables());
        if (els.length === 0) return;
        const first = els[0]!;
        const last = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-vim-fade",
        backdropClassName,
      )}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-vim-pop",
          className ?? "w-full max-w-md rounded-lg bg-surface p-6 shadow-xl",
        )}
      >
        {hideTitle ? (
          <h2 className="sr-only">{title}</h2>
        ) : (
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
