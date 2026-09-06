"use client";
import { useEffect, useState } from "react";
import { evaluarAcceso, leerDirectivas, type NivelAcceso } from "../lib/directivas";

export type Acceso = { nivel: NivelAcceso; mensaje: string; desde: string | null };

/**
 * Nivel de acceso de esta caja (ADR 0014).
 *
 * Relee cada 60 s. Quien refresca de verdad la directiva es el latido del escritorio, cada 10
 * minutos; esto solo vuelve a mirar el archivo, así que es barato y hace que reactivar a un
 * cliente se note en menos de un minuto desde que llega la directiva nueva.
 */
export function useAcceso(): Acceso {
  const [r, setR] = useState<Acceso>({ nivel: "ok", mensaje: "", desde: null });
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      leerDirectivas()
        .then((d) => { if (vivo) setR(evaluarAcceso(d)); })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  return r;
}

/** Fecha larga en hora de México: al cajero le sirve el día, no una marca ISO. */
function dia(iso: string | null): string {
  if (!iso) return "";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(f);
}

/**
 * Banda de gracia: avisa sin estorbar. El cajero puede seguir cobrando, que es justo el punto de
 * la gracia — el aviso es para que el dueño lo resuelva antes de la fecha.
 */
export function BandaAcceso({ mensaje, desde }: { mensaje: string; desde: string | null }) {
  const f = dia(desde);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 bg-[#F6EEDD] px-4 py-2 text-center text-[13px] font-semibold text-warning"
    >
      <span>{mensaje}</span>
      {f && <span className="font-normal text-ink-2">La caja dejará de vender el {f}.</span>}
    </div>
  );
}
