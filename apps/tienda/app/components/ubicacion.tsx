"use client";
// «Tu ubicación», en «¿Quién recibe?», cuando la sucursal cobra el envío por distancia (0179). El
// cliente usa la ubicación de su teléfono o pone el pin a mano; al moverlo se ve en vivo a cuántos km
// está y cuánto cuesta el envío (la cuenta de lib/distancia.ts, la misma de la base). Lo que cobra
// es la cotización de la base, que llega al soltar el pin y reemplaza el número de aquí.
// El mapa se carga solo aquí: quien pide para recoger, o en una sucursal por zonas, no lo descarga.
import { useState } from "react";
import { botonClases, cn } from "@vim/ui/styles";
import { MapaConPin } from "@vim/ui/mapa";
import type { Cotizacion, Tramo } from "../lib/contrato";
import { decimasDeKm, kmDeDecimas, puntoValido, tramoDe, type Punto } from "../lib/distancia";
import { UBICACION, lineaDeDistancia } from "../lib/textos";
import { FOCO } from "./piezas";

/** Qué se le dice del pin, sin pintar nada. `fuera`: no se entrega ahí. Puro, para probarlo. */
export function estadoDelPin(d: {
  sucursal: Punto; tramos: readonly Tramo[]; pin: Punto | null;
  /** Mientras se arrastra: el punto de ese instante. */
  enVivo: Punto | null;
  /** La cotización de la base para el pin de ahora, si ya llegó: manda sobre la cuenta de aquí. */
  cotizacion: Pick<Cotizacion, "distancia_km" | "envio_total_mxn"> | null;
}): { texto: string; fuera: boolean } | null {
  const p = d.enVivo ?? d.pin;
  if (!p) return null;
  if (!d.enVivo && d.cotizacion?.distancia_km) {
    return { texto: lineaDeDistancia(d.cotizacion.distancia_km, d.cotizacion.envio_total_mxn), fuera: false };
  }
  const decimas = decimasDeKm(d.sucursal, p);
  const tramo = tramoDe(d.tramos, decimas);
  return tramo ? { texto: lineaDeDistancia(kmDeDecimas(decimas), tramo.costo_mxn), fuera: false } : { texto: UBICACION.fuera, fuera: true };
}

export function UbicacionDeEntrega({ id, sucursal, tramos, punto, alCambiar, cotizacion, puedeRecoger, alRecoger, error, deshabilitado }: {
  id: string; sucursal: Punto; tramos: readonly Tramo[];
  punto: Punto | null; alCambiar: (p: Punto) => void;
  cotizacion: Cotizacion | null;
  puedeRecoger: boolean; alRecoger: () => void;
  /** Lo que falta o lo que rechazó el servidor; se dice abajo, en rojo. */
  error: string | undefined;
  deshabilitado: boolean;
}) {
  const [mapa, setMapa] = useState(punto !== null);
  const [buscando, setBuscando] = useState(false);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [enVivo, setEnVivo] = useState<Punto | null>(null);
  const estado = estadoDelPin({ sucursal, tramos, pin: punto, enVivo, cotizacion });
  const idError = `${id}-ubicacion-error`;

  const soltar = (p: Punto) => {
    setEnVivo(null);
    const v = puntoValido(p);
    if (v) alCambiar(v);
  };

  const usarMiUbicacion = () => {
    if (!("geolocation" in navigator)) { setSinPermiso(true); setMapa(true); return; }
    setBuscando(true); setSinPermiso(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBuscando(false); setMapa(true); soltar({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      // Sin permiso, sin señal o tardó: el mapa abre en el restaurante y el pin se pone a mano.
      () => { setBuscando(false); setSinPermiso(true); setMapa(true); },
      // maximumAge 0: quien toca el botón quiere dónde está AHORA, no la de hace un minuto.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  return (
    <section id={`${id}-ubicacion`} tabIndex={-1} aria-labelledby={`${id}-ubicacion-titulo`} aria-describedby={error ? idError : undefined}
      className="flex flex-col gap-3 outline-none">
      <div>
        <h4 id={`${id}-ubicacion-titulo`} className="text-15 font-semibold">{UBICACION.titulo}</h4>
        <p className="mt-1 text-14 text-ink-2">{UBICACION.apoyo}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={usarMiUbicacion} disabled={deshabilitado || buscando} aria-busy={buscando}
          className={cn(botonClases({ variant: "ghost" }), "h-12")}>
          {buscando ? UBICACION.buscando : UBICACION.usar}
        </button>
        {!mapa && (
          <button type="button" onClick={() => setMapa(true)} disabled={deshabilitado}
            className={cn("inline-flex min-h-11 items-center text-15 font-medium text-ink underline underline-offset-4", FOCO)}>
            {UBICACION.aMano}
          </button>
        )}
      </div>
      {sinPermiso && <p className="text-14 text-ink-2">{UBICACION.sinPermiso}</p>}
      {mapa && (
        <MapaConPin centro={punto ?? sucursal} pin={punto} referencia={sucursal} zoom={punto ? 15 : 14}
          alMover={soltar} alArrastrar={setEnVivo}
          etiqueta={UBICACION.mapa} textoCentro={UBICACION.centro}
          textoFallo={UBICACION.sinMapa} textoReintentar={UBICACION.reintentarMapa} />
      )}
      {/* Siempre ocupa su renglón cuando hay pin: el precio cambia en su lugar, sin brincar. */}
      <p aria-live="polite" className={cn("text-15 font-medium tabular-nums", mapa && "min-h-6", estado?.fuera ? "text-danger" : "text-ink")}>
        {estado?.texto ?? ""}
      </p>
      {estado?.fuera && puedeRecoger && (
        <button type="button" onClick={alRecoger} disabled={deshabilitado} className={cn(botonClases({ variant: "ghost" }), "h-12 self-start")}>
          {UBICACION.aRecoger}
        </button>
      )}
      {error && <p id={idError} role="alert" className="text-14 font-medium text-danger">{error}</p>}
    </section>
  );
}
