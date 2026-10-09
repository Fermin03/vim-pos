"use client";
// Los campos de todos los formularios de la tienda («Tus datos», entrar, registro, «Mi cuenta») y lo
// poco que comparten al comportarse: el error aparece al salir del campo, al enviar con errores se
// marcan todos y el foco va al primero, y un segundo toque mientras se envía no hace nada.
// Las REGLAS de cada campo no viven aquí: llegan como función (lib/cliente.ts, lib/cuenta.ts).
import { useId, useRef, useState, type InputHTMLAttributes } from "react";
import { StatusChip, cn } from "@vim/ui/styles";
import { FOCO } from "./piezas";

export const CAJA = "block w-full rounded border bg-surface px-3 text-16 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

type PropsDeCampo = {
  id: string; etiqueta: string; opcional?: boolean; ayuda?: string; error?: string; multilinea?: boolean;
  alCambiar: (v: string) => void; alSalir: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "onBlur">;

/** Un campo: etiqueta visible, ayuda, y el error junto a él (enlazado para quien no ve la pantalla). */
export function CampoDeTexto({ id, etiqueta, opcional, ayuda, error, multilinea, alCambiar, alSalir, className, children, ...resto }: PropsDeCampo) {
  const describe = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const borde = error ? "border-danger" : "border-line-strong";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-14 font-medium text-ink">
        {etiqueta}
        {opcional && <StatusChip className="flex-shrink-0">Opcional</StatusChip>}
      </label>
      {multilinea ? (
        <textarea id={id} rows={2} value={resto.value} maxLength={resto.maxLength} autoComplete={resto.autoComplete}
          aria-invalid={!!error} aria-describedby={describe}
          onChange={(e) => alCambiar(e.target.value)} onBlur={alSalir} className={cn(CAJA, borde, "resize-none py-2")} />
      ) : (
        <div className="relative">
          <input id={id} type="text" {...resto} aria-invalid={!!error} aria-describedby={describe}
            onChange={(e) => alCambiar(e.target.value)} onBlur={alSalir} className={cn(CAJA, borde, "h-12", children ? "pr-24" : "")} />
          {children}
        </div>
      )}
      {ayuda && !error && <p id={`${id}-ayuda`} className="text-13 text-ink-2">{ayuda}</p>}
      {error && <p id={`${id}-error`} className="text-14 font-medium text-danger">{error}</p>}
    </div>
  );
}

/**
 * Una contraseña, con «Mostrar» para revisar lo escrito en un teclado de teléfono. El botón dice lo
 * que hace con palabras, no con un ojo, y no entra al orden del formulario antes que el campo.
 * `nueva`: se está eligiendo (el navegador ofrece generarla y guardarla); si no, se está comprobando.
 */
export function CampoDePassword({ nueva = false, ...resto }: Omit<PropsDeCampo, "type" | "autoComplete" | "multilinea" | "children"> & { nueva?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <CampoDeTexto {...resto} type={visible ? "text" : "password"} autoComplete={nueva ? "new-password" : "current-password"}
      autoCapitalize="none" autoCorrect="off" spellCheck={false}>
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${resto.etiqueta.toLowerCase()}`}
        className={cn("absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded px-3 text-14 font-medium text-ink-2 hover:text-ink", FOCO)}>
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </CampoDeTexto>
  );
}

/**
 * El estado de un formulario: lo escrito, qué campos ya se tocaron y lo que el servidor rechazó de
 * alguno. `de(campo)` son las props que le faltan a su `CampoDeTexto`.
 */
export function useCampos<C extends string>(campos: readonly C[], inicial: Record<C, string>, erroresDe: (f: Record<C, string>) => Partial<Record<C, string>>) {
  const id = useId();
  const [f, setF] = useState(inicial);
  const [tocados, setTocados] = useState<ReadonlySet<C>>(new Set());
  const [rechazo, setRechazo] = useState<Partial<Record<C, string>>>({});
  const errores = erroresDe(f);
  const enfocar = (c: C) => setTimeout(() => document.getElementById(`${id}-${c}`)?.focus(), 0);
  return {
    f,
    de: (c: C) => ({
      id: `${id}-${c}`, value: f[c], error: rechazo[c] ?? (tocados.has(c) ? errores[c] : undefined),
      alCambiar: (v: string) => { setF((a) => ({ ...a, [c]: v })); setRechazo((r) => ({ ...r, [c]: undefined })); },
      alSalir: () => setTocados((t) => new Set(t).add(c)),
    }),
    /** ¿Se puede enviar? Si no, marca todos los errores y lleva el foco al primero. */
    revisar(): boolean {
      const primero = campos.find((c) => errores[c]);
      if (!primero) return true;
      setTocados(new Set(campos));
      enfocar(primero);
      return false;
    },
    /** Lo que el servidor rechazó de un campo: se dice ahí, con el foco, hasta que el cliente lo cambie. */
    rechazar(c: C, texto: string) { setRechazo({ [c]: texto } as Partial<Record<C, string>>); enfocar(c); },
  };
}

/**
 * Una acción que va al servidor: mientras corre, otra no arranca (el candado es una referencia: el
 * estado de React llega un render tarde para un doble toque). `correr` recibe la acción, que devuelve
 * el texto de lo que salió mal o null; ese texto queda en `error` hasta el siguiente intento.
 */
export function useAccion() {
  const enVuelo = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    ocupado, error,
    async correr(accion: () => Promise<string | null | void>): Promise<void> {
      if (enVuelo.current) return;
      enVuelo.current = true; setOcupado(true); setError(null);
      try { setError((await accion()) ?? null); } finally { enVuelo.current = false; setOcupado(false); }
    },
  };
}
