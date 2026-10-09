// El marco de todas las páginas de un negocio: SU marca arriba (logo o inicial, y nombre), su color
// en las variables de las que salen los botones principales, y VIM discreto al pie. Si el negocio no
// se pudo leer, el marco queda neutro y la página dice qué pasó.
import type { CSSProperties } from "react";
import Link from "next/link";
import { LogoVim } from "@vim/ui/styles";
import { variablesDeColor } from "../lib/color";
import { urlDeLogo } from "../lib/imagen";
import { negocioDeLaPeticion } from "../lib/servidor/funcion";

export default async function MarcoDelNegocio({ children, params }: { children: React.ReactNode; params: Promise<{ negocio: string }> }) {
  const leido = await negocioDeLaPeticion((await params).negocio);
  const negocio = leido.estado === "ok" ? leido.datos : null;
  const logo = negocio && urlDeLogo(negocio.logo_ruta);
  return (
    <div style={negocio ? (variablesDeColor(negocio.color) as CSSProperties) : undefined} className="mx-auto flex min-h-full max-w-2xl flex-col">
      {negocio && (
        <header className="px-4 pb-4 pt-5">
          <Link href={`/${negocio.slug}`} className="inline-flex max-w-full items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
            {logo ? (
              // Sin `loading="lazy"`: es lo primero que se ve. El tamaño va reservado para que nada brinque.
              <img src={logo} alt={`Logo de ${negocio.nombre}`} width={56} height={56} decoding="async" className="h-14 w-14 flex-shrink-0 rounded-lg bg-hover object-contain" />
            ) : (
              <span aria-hidden="true" className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-accent font-display text-24 font-semibold text-sobre-accent shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.12)]">
                {Array.from(negocio.nombre.trim())[0]?.toUpperCase() ?? ""}
              </span>
            )}
            <span className="min-w-0 font-display text-24 font-semibold leading-tight">{negocio.nombre}</span>
          </Link>
        </header>
      )}
      <div className="flex-1">{children}</div>
      <footer className="flex flex-col items-center gap-1 px-4 py-8 text-12 text-ink-3">
        <span className="flex items-center gap-2">
          <LogoVim className="h-4 w-4" titulo="" />
          Pedidos con VIM POS
        </span>
        {negocio && (
          <Link href={`/${negocio.slug}/privacidad`} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
            Aviso de privacidad
          </Link>
        )}
      </footer>
    </div>
  );
}
