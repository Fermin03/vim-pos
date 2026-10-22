"use client";
import { Button, Icono, type NombreIcono } from "@vim/ui/styles";

/**
 * «Pedidos» de la caja de comida rápida: lo que no se cobra al momento, junto en un solo lugar. Cada
 * tarjeta abre la pantalla que ya existía (la lista de espera, las cuentas de Para llevar, Pick-up,
 * Domicilio, Pedidos en línea y las cuentas de mesa que quedaron abiertas); aquí solo se cuenta y se
 * entra. «Nuevo para recoger» y «Nuevo a domicilio» abren la cuenta nueva de esas mismas pantallas.
 */
export function SeccionPedidos({
  domicilio, enLinea, barra, expiradosEnLinea,
  nEnEspera, nParaLlevar, nPickup, nDomicilio, nEnLinea, nMesa, nBarra,
  onEnEspera, onParaLlevar, onPickup, onDomicilio, onEnLinea, onMesa, onBarra, onNuevoRecoger, onNuevoDomicilio,
}: {
  /** Módulo `domicilio`. Sin él, la tarjeta sigue mientras quede alguna cuenta suya abierta. */
  domicilio: boolean;
  /** Tienda en línea o apps de delivery encendidas. */
  enLinea: boolean;
  /** Módulo `cuentas_barra`. Sin él, la tarjeta sigue mientras quede alguna cuenta de barra abierta. */
  barra: boolean;
  /** Pedidos en línea vencidos sin aceptar que nadie ha visto (el aviso rojo del inicio). */
  expiradosEnLinea: number;
  nEnEspera: number;
  nParaLlevar: number;
  nPickup: number;
  nDomicilio: number;
  nEnLinea: number;
  /** Cuentas de comedor abiertas (de antes de pasar a comida rápida): solo se cobran, no se abren nuevas. */
  nMesa: number;
  nBarra: number;
  onEnEspera: () => void;
  onParaLlevar: () => void;
  onPickup: () => void;
  onDomicilio: () => void;
  onEnLinea: () => void;
  onMesa: () => void;
  onBarra: () => void;
  onNuevoRecoger: () => void;
  onNuevoDomicilio: () => void;
}) {
  const tarjetas = tarjetasPedidos({ domicilio, enLinea, barra, nEnEspera, nParaLlevar, nPickup, nDomicilio, nEnLinea, nMesa, nBarra, onEnEspera, onParaLlevar, onPickup, onDomicilio, onEnLinea, onMesa, onBarra });
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
      {enLinea && expiradosEnLinea > 0 && <AvisoVencidos n={expiradosEnLinea} onClick={onEnLinea} className="mx-4 mt-3" />}
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

export type TarjetaPedidos = { etiqueta: string; icono: NombreIcono; n: number; onClick: () => void };

/** Las tarjetas de «Pedidos»; la cafetería, que no tiene esa sección, las pinta en «Más». */
export function tarjetasPedidos(p: {
  domicilio: boolean; enLinea: boolean; barra: boolean;
  nEnEspera: number; nParaLlevar: number; nPickup: number; nDomicilio: number; nEnLinea: number; nMesa: number; nBarra: number;
  onEnEspera: () => void; onParaLlevar: () => void; onPickup: () => void; onDomicilio: () => void; onEnLinea: () => void; onMesa: () => void; onBarra: () => void;
}): TarjetaPedidos[] {
  return [
    { etiqueta: "En espera", icono: "reloj", n: p.nEnEspera, onClick: p.onEnEspera },
    { etiqueta: "Para llevar abiertas", icono: "recibo", n: p.nParaLlevar, onClick: p.onParaLlevar },
    { etiqueta: "Pick-up", icono: "bolsa", n: p.nPickup, onClick: p.onPickup },
    ...(p.domicilio || p.nDomicilio > 0 ? [{ etiqueta: "Domicilio", icono: "moto" as const, n: p.nDomicilio, onClick: p.onDomicilio }] : []),
    ...(p.enLinea ? [{ etiqueta: "En línea", icono: "celular" as const, n: p.nEnLinea, onClick: p.onEnLinea }] : []),
    ...(p.barra || p.nBarra > 0 ? [{ etiqueta: "Barra", icono: "vaso" as const, n: p.nBarra, onClick: p.onBarra }] : []),
    ...(p.nMesa > 0 ? [{ etiqueta: "Cuentas de mesa", icono: "mesa" as const, n: p.nMesa, onClick: p.onMesa }] : []),
  ];
}

/** El aviso rojo de pedidos en línea vencidos sin aceptar: lleva a En línea. */
export function AvisoVencidos({ n, onClick, className = "" }: { n: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="alert"
      className={`flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded border border-danger bg-danger-soft px-3 py-2.5 text-left text-14 font-semibold text-danger ${className}`}
    >
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-danger" />
      {n === 1 ? "Se venció 1 pedido en línea sin aceptar." : `Se vencieron ${n} pedidos en línea sin aceptar.`} Toca para verlos.
    </button>
  );
}
