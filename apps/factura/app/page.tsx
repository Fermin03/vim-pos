import { LogoVim } from "@vim/ui/styles";

/**
 * Página de espera del portal de autofactura.
 *
 * Existe antes que el portal a propósito: el subdominio y su certificado tardan en propagarse, y
 * conviene que estén resueltos mucho antes del lanzamiento y no el mismo día. Mientras tanto, quien
 * llegue aquí —hoy nadie, porque el QR del ticket está apagado— encuentra una explicación y una
 * salida, no un 404.
 *
 * NO promete fecha. Ver el §10 del plan del sitio: no se anuncia lo que no está.
 */
export default function Espera() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <LogoVim className="mx-auto h-14 w-14" />

        <h1 className="mt-6 font-display text-[26px] font-semibold leading-tight tracking-tight">
          La factura de tu ticket, muy pronto
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Estamos terminando el portal donde vas a poder facturar tu consumo escaneando el código del
          ticket. Todavía no está listo.
        </p>

        <div className="mt-7 rounded-lg border border-line bg-surface px-5 py-4 text-left">
          <p className="text-[13px] font-semibold text-ink">Mientras tanto</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
            Pide tu factura directamente en el negocio donde consumiste. <strong>Guarda tu ticket</strong>:
            lleva el folio que hace falta para emitirla.
          </p>
        </div>

        <p className="mt-8 text-[12.5px] text-ink-3">
          VIM POS · punto de venta para restaurantes
        </p>
      </div>
    </main>
  );
}
