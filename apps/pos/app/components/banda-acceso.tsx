"use client";
import { useEffect, useState } from "react";
import { actualizacionPendiente, evaluarAcceso, leerDirectivas, type MotivoBloqueo, type NivelAcceso } from "../lib/directivas";
import { buscarActualizacion } from "../lib/actualizacion";

export type Acceso = {
  nivel: NivelAcceso;
  mensaje: string;
  desde: string | null;
  motivo: MotivoBloqueo;
  /** Módulos de pago que la nube tiene encendidos para este negocio (add-on de delivery). Se
   *  expone aquí para que quien ya lee directivas para la banda de gracia y el bloqueo (p. ej.
   *  `home-pos.tsx`) no tenga que abrir una consulta nueva solo para saber si un módulo está
   *  prendido. */
  modulos: Record<string, boolean>;
  /** Versión nueva publicada que esta caja todavía no instala (solo en la caja de escritorio). */
  actualizacion: string | null;
};

/**
 * Nivel de acceso de esta caja (ADR 0014).
 *
 * Relee cada 60 s. Quien refresca de verdad la directiva es el latido del escritorio, cada 10
 * minutos; esto solo vuelve a mirar el archivo, así que es barato y hace que reactivar a un
 * cliente se note en menos de un minuto desde que llega la directiva nueva.
 */
export function useAcceso(): Acceso {
  const [r, setR] = useState<Acceso>({ nivel: "ok", mensaje: "", desde: null, motivo: "suscripcion", modulos: {}, actualizacion: null });
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      leerDirectivas()
        .then((d) => { if (vivo) setR({ ...evaluarAcceso(d), modulos: d?.modulos ?? {}, actualizacion: actualizacionPendiente(d) }); })
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
      className="flex flex-wrap items-center justify-center gap-x-2 bg-warning-soft px-4 py-2 text-center text-13 font-semibold text-warning"
    >
      <span>{mensaje}</span>
      {f && <span className="font-normal text-ink-2">La caja dejará de vender el {f}.</span>}
    </div>
  );
}

/**
 * Hay versión nueva y esta caja no la tiene. Va en la pantalla de inicio —no donde se cobra— y no
 * estorba: el cajero decide cuándo. El botón abre el mismo diálogo de siempre (descarga, verifica
 * el SHA-512 y pregunta antes de cerrar), así que no hay un segundo camino de instalación.
 */
export function BandaActualizacion({ version }: { version: string }) {
  const [estado, setEstado] = useState<"listo" | "revisando" | "error">("listo");
  async function instalar() {
    setEstado("revisando");
    const r = await buscarActualizacion();
    setEstado(r.estado === "error" ? "error" : "listo");
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-info-soft px-4 py-2 text-center text-13 text-info"
    >
      <span className="font-semibold">Hay una versión nueva de VIM POS ({version}).</span>
      <span className="text-ink-2">
        {estado === "error"
          ? "No se pudo descargar ahora; vuelve a intentarlo en un momento."
          : "Instálala cuando no estés cobrando: tarda un par de minutos y tus ventas se conservan."}
      </span>
      <button
        type="button"
        onClick={() => void instalar()}
        disabled={estado === "revisando"}
        className="h-8 rounded border border-info px-3 text-13 font-semibold text-info transition-transform duration-150 ease-vim active:scale-[.97] disabled:opacity-60"
      >
        {estado === "revisando" ? "Abriendo…" : "Instalar"}
      </button>
    </div>
  );
}
