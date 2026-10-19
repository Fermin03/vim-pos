import type { Metadata } from "next";
import { buscarCotizacion, fechaDia } from "../../lib/cotizacion";
import { BotonImprimir } from "./boton-imprimir";

/**
 * La cotización que le llega al cliente por WhatsApp (`/c/<token>`). Se pinta en el servidor: sin
 * sesión, sin cookies y sin rastreo. Lo de `print:` deja en el PDF solo la cotización.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default async function PaginaCotizacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await buscarCotizacion(token);

  if (!c) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col justify-center px-5 py-10">
        <h1 className="font-display text-24 font-semibold leading-tight">Esta cotización no existe o ya no está disponible.</h1>
        <p className="mt-2 text-16 leading-relaxed text-ink-2">Pide a tu vendedor que te mande el enlace otra vez.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-10 pt-6 print:max-w-none print:px-0 print:pt-0">
      <header className="text-center">
        <h1 className="font-display text-24 font-semibold leading-tight">{c.negocio}</h1>
        {c.sucursal.direccion && <p className="mt-1 text-15 text-ink-2">{c.sucursal.direccion}</p>}
        {c.sucursal.telefono && <p className="text-15 text-ink-2">Tel. {c.sucursal.telefono}</p>}
      </header>

      <h2 className="mt-6 border-y border-line-strong py-2 text-center font-display text-18 font-bold tracking-wide">COTIZACIÓN</h2>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-16">
        <dt className="text-ink-2">Folio</dt><dd className="text-right font-semibold">{c.folio}</dd>
        <dt className="text-ink-2">Fecha</dt><dd className="text-right">{fechaDia(c.fecha)}</dd>
        <dt className="text-ink-2">Válida hasta</dt><dd className="text-right">{fechaDia(c.vigenteHasta)}</dd>
        {c.cliente && <><dt className="text-ink-2">Cliente</dt><dd className="text-right">{c.cliente}</dd></>}
      </dl>

      <ul className="mt-5 divide-y divide-line border-y border-line-strong">
        {c.renglones.map((r, i) => (
          <li key={i} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-16 font-semibold leading-snug">{r.cantidad} {r.nombre}</div>
              <div className="text-14 text-ink-2">{r.sku ? `${r.sku} · ` : ""}{mxn(r.precio)}{r.precioUnidad || " c/u"}</div>
            </div>
            <div className="flex-shrink-0 text-16 font-semibold tabular-nums">{mxn(r.total)}</div>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 text-16 tabular-nums">
        <dt className="text-ink-2">Subtotal</dt><dd className="text-right">{mxn(c.subtotal)}</dd>
        <dt className="text-ink-2">IVA</dt><dd className="text-right">{mxn(c.iva)}</dd>
        <dt className="pt-1 font-display text-20 font-bold">TOTAL</dt>
        <dd className="pt-1 text-right font-display text-20 font-bold">{mxn(c.total)}</dd>
      </dl>

      <p className="mt-6 text-center text-14 text-ink-2">Precios sujetos a cambio después de la vigencia.</p>

      <div className="mt-8 print:hidden">
        <BotonImprimir />
      </div>
    </main>
  );
}
