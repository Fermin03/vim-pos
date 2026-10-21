"use client";
import { Button, Icono, type NombreIcono } from "@vim/ui/styles";

/**
 * «Pedidos» de la caja de comida rápida: lo que no se cobra al momento, junto en un solo lugar. Cada
 * tarjeta abre la pantalla que ya existía (la lista de espera, las cuentas de Para llevar, Pick-up,
 * Domicilio, Pedidos en línea y las cuentas de mesa que quedaron abiertas); aquí solo se cuenta y se
 * entra. «Nuevo para recoger» y «Nuevo a domicilio» abren la cuenta nueva de esas mismas pantallas.
 */
export function SeccionPedidos({
  domicilio, enLinea, expiradosEnLinea,
  nEnEspera, nParaLlevar, nPickup, nDomicilio, nEnLinea, nMesa,
  onEnEspera, onParaLlevar, onPickup, onDomicilio, onEnLinea, onMesa, onNuevoRecoger, onNuevoDomicilio,
}: {
  /** Módulo `domicilio`. Sin él, la tarjeta sigue mientras quede alguna cuenta suya abierta. */
  domicilio: boolean;
  /** Tienda en línea o apps de delivery encendidas. */
  enLinea: boolean;
  /** Pedidos en línea vencidos sin aceptar que nadie ha visto (el aviso rojo del inicio). */
  expiradosEnLinea: number;
  nEnEspera: number;
  nParaLlevar: number;
  nPickup: number;
  nDomicilio: number;
  nEnLinea: number;
  /** Cuentas de comedor abiertas (de antes de pasar a comida rápida): solo se cobran, no se abren nuevas. */
  nMesa: number;
  onEnEspera: () => void;
  onParaLlevar: () => void;
  onPickup: () => void;
  onDomicilio: () => void;
  onEnLinea: () => void;
  onMesa: () => void;
  onNuevoRecoger: () => void;
  onNuevoDomicilio: () => void;
}) {
  const tarjetas: { etiqueta: string; icono: NombreIcono; n: number; onClick: () => void }[] = [
    { etiqueta: "En espera", icono: "reloj", n: nEnEspera, onClick: onEnEspera },
    { etiqueta: "Para llevar abiertas", icono: "recibo", n: nParaLlevar, onClick: onParaLlevar },
    { etiqueta: "Pick-up", icono: "bolsa", n: nPickup, onClick: onPickup },
    ...(domicilio || nDomicilio > 0 ? [{ etiqueta: "Domicilio", icono: "moto" as const, n: nDomicilio, onClick: onDomicilio }] : []),
    ...(enLinea ? [{ etiqueta: "En línea", icono: "celular" as const, n: nEnLinea, onClick: onEnLinea }] : []),
    ...(nMesa > 0 ? [{ etiqueta: "Cuentas de mesa", icono: "mesa" as const, n: nMesa, onClick: onMesa }] : []),
  ];
  return (
    <section aria-label="Pedidos" className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="mr-auto font-display text-20 font-semibold tracking-tight">Pedidos</h1>
        <Button className="h-11" onClick={onNuevoRecoger} data-nuevo="Nuevo para recoger">
          <Icono nombre="mas" className="h-4 w-4" />
          Nuevo para recoger
        </Button>
        {domicilio && (
          <Button variant="ghost" className="h-11" onClick={onNuevoDomicilio} data-nuevo="Nuevo a domicilio">
            <Icono nombre="mas" className="h-4 w-4" />
            Nuevo a domicilio
          </Button>
        )}
      </div>
      {enLinea && expiradosEnLinea > 0 && (
        <button
          type="button"
          onClick={onEnLinea}
          role="alert"
          className="mx-4 mt-3 flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded border border-danger bg-danger-soft px-3 py-2.5 text-left text-14 font-semibold text-danger"
        >
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-danger" />
          {expiradosEnLinea === 1 ? "Se venció 1 pedido en línea sin aceptar." : `Se vencieron ${expiradosEnLinea} pedidos en línea sin aceptar.`} Toca para verlos.
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {tarjetas.map((t) => (
            <button
              key={t.etiqueta}
              type="button"
              onClick={t.onClick}
              data-tarjeta={t.etiqueta}
              className={[
                "flex min-h-[112px] flex-col justify-between rounded-lg border bg-surface px-4 py-3 text-left transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.99]",
                t.n > 0 ? "border-line-strong" : "border-line",
              ].join(" ")}
            >
              <span className="flex w-full items-start gap-2">
                <Icono nombre={t.icono} className={`h-6 w-6 flex-shrink-0 ${t.n > 0 ? "text-accent" : "text-ink-3"}`} />
                <span className={`ml-auto font-display text-32 font-bold leading-none tabular-nums ${t.n > 0 ? "text-ink" : "text-ink-3"}`}><span data-conteo="">{t.n}</span></span>
              </span>
              <span className="text-15 font-semibold text-ink">{t.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
