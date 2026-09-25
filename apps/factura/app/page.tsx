"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LogoVim } from "@vim/ui/styles";

/**
 * Entrada del portal sin negocio en la URL.
 *
 * Lo normal es no pasar por aquí: el QR del ticket lleva directo a `/<negocio>?folio=…`. Llega quien
 * escribió la dirección a mano o recortó el enlace. Antes esta página decía "Todavía no está
 * listo" —era la de espera, de antes del lanzamiento— con el portal ya funcionando desde el 3 sep.
 */
export default function Inicio() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col justify-center px-5 py-10">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Factura tu ticket</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        Escanea el código QR de tu ticket con la cámara del celular: te trae aquí con el folio ya
        escrito.
      </p>

      <form
        className="mt-8 rounded-lg border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const c = codigo.trim().toLowerCase();
          if (!/^[a-z0-9-]{2,}$/.test(c)) {
            setError("Escribe el código del negocio, como viene en tu ticket.");
            return;
          }
          router.push(`/${c}`);
        }}
        noValidate
      >
        <label htmlFor="codigo" className="mb-1.5 block text-[15px] font-semibold text-ink">¿No tienes el QR?</label>
        <p className="mb-3 text-[14px] leading-snug text-ink-2">Escribe el código del negocio que viene en tu ticket.</p>
        <input
          id="codigo"
          value={codigo}
          onChange={(e) => { setCodigo(e.target.value); setError(null); }}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "codigo-error" : undefined}
          className={`h-12 w-full rounded-lg border bg-surface px-3.5 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_rgb(var(--accent)/0.3)] ${error ? "border-danger" : "border-line-strong"}`}
        />
        {error && <p id="codigo-error" className="mt-1.5 text-[14px] font-semibold text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="mt-4 h-14 w-full text-[17px]">Continuar</Button>
      </form>

      <p className="mt-6 text-[15px] leading-relaxed text-ink-2">
        Si el negocio no tiene facturación en línea, pídela en el mostrador. <b>Guarda tu ticket</b>:
        lleva el folio que hace falta.
      </p>

      <footer className="mt-10 flex items-center justify-center gap-2 text-[13px] text-ink-2">
        <LogoVim className="h-4 w-4" />
        Facturación por VIM POS
      </footer>
    </main>
  );
}
