"use client";
import { LogoVim } from "@vim/ui/styles";

/** Soporte de VIM. Va aquí y no en un env: el cajero necesita verlo aunque no haya red. */
const TELEFONO_SOPORTE = "477 235 8901";

/**
 * Pantalla de bloqueo. Sin salida y antes del PIN: el cajero no puede cobrar.
 *
 * Lo que NO hace: detener la sincronización. Las ventas que ya están en esta computadora se
 * siguen subiendo, para que un cliente que se ponga al corriente no haya perdido nada. Y lo dice
 * en pantalla, porque la primera pregunta de un dueño bloqueado es "¿y mis ventas?".
 */
export function PantallaBloqueada({ mensaje, negocio }: { mensaje: string; negocio?: string }) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-sel px-8 text-center">
      <LogoVim className="h-12 w-12" />
      {negocio && <div className="font-display text-[15px] font-semibold text-ink-2">{negocio}</div>}
      <h1 className="font-display text-[26px] font-bold tracking-tight text-danger">Esta caja no puede vender</h1>
      <p className="max-w-md text-[15px] leading-relaxed text-ink-2">{mensaje}</p>
      <div className="mt-2 rounded-lg border border-line-strong bg-surface px-5 py-3">
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Llama a VIM</div>
        <div className="font-display text-[20px] font-bold tabular-nums">{TELEFONO_SOPORTE}</div>
      </div>
      <p className="max-w-md text-[12.5px] text-ink-3">
        Tus ventas anteriores están a salvo y se siguen respaldando en la nube.
      </p>
    </main>
  );
}
