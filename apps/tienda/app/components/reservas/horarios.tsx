"use client";
// La tira de días y los horarios libres de la cadena (`huecos`). La usan «Armar la cita» y «Cambiar
// horario» en la página de la cita (con `codigo`: los tramos de esa cita no tapan horarios).
// Un día sin lugar lo dice; buscar el siguiente día con lugar es a petición (hasta 14 preguntas
// seguidas contra un cupo por IP: no se lanzan solas a cada cambio de la cadena).
import { useEffect, useRef, useState } from "react";
import { Icono, cn } from "@vim/ui/styles";
import { sumarDias } from "@vim/fecha";
import { huecos, type ServicioDeCadena } from "../../lib/api";
import { desdeDe, etiquetaDeDia, fechaLarga, horaDe, mesDe, siguienteDiaConLugar, textoDeFallo, tiraDeDias } from "../../lib/reservas";
import { FOCO } from "../piezas";

type Siguiente = null | "buscando" | "ninguno" | { error: string } | { dia: string };
type Lectura = { tipo: "cargando" } | { tipo: "lista"; huecos: string[] } | { tipo: "error"; texto: string };

const FLECHA = cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink hover:bg-hover disabled:pointer-events-none disabled:opacity-30", FOCO);
const ENLACE = cn("inline-flex min-h-11 items-center gap-1 text-15 font-semibold text-ink underline underline-offset-4", FOCO);
/** Un 429 en la búsqueda: se dice que espere, no que no hay lugar. */
const textoDeBusqueda = (e: { error: string; mensaje?: string }) => (e.error === "DEMASIADOS_INTENTOS" ? "Espera un momento y vuelve a intentar." : textoDeFallo(e));

export function Horarios({ slug, sucursalId, cadena, codigo, hoy, diasReserva, diaInicial, recarga = 0, elegido, alElegir, alCambiarDia }: {
  slug: string; sucursalId: string; cadena: ServicioDeCadena[];
  /** Al cambiar una cita: su código. */
  codigo?: string;
  hoy: string; diasReserva: number;
  /** El día con el que abre (el que se estaba viendo, o el de la cita). Por omisión, hoy. */
  diaInicial?: string;
  /** Subirlo vuelve a pedir los horarios (p. ej. tras «ese horario ya no está disponible»). */
  recarga?: number;
  /** La hora elegida (ISO) o null. */
  elegido: string | null;
  alElegir: (iso: string | null) => void;
  alCambiarDia?: (dia: string) => void;
}) {
  const ultimo = sumarDias(hoy, diasReserva);
  const inicial = diaInicial && diaInicial >= hoy && diaInicial <= ultimo ? diaInicial : hoy;
  const [dia, setDia] = useState(inicial);
  const [desde, setDesde] = useState(() => desdeDe(hoy, inicial));
  const [lectura, setLectura] = useState<Lectura>({ tipo: "cargando" });
  const [siguiente, setSiguiente] = useState<Siguiente>(null);
  const [intento, setIntento] = useState(0);
  /** Una búsqueda del siguiente día que termina después de cambiar de día ya no se pinta. */
  const vuelta = useRef(0);
  const llave = JSON.stringify(cadena);
  const consultar = (d: string, signal?: AbortSignal) => huecos(slug, { sucursal_id: sucursalId, dia: d, servicios: cadena, ...(codigo && { codigo }) }, signal);

  useEffect(() => {
    if (cadena.length === 0) return;
    const corte = new AbortController();
    vuelta.current++;
    setLectura({ tipo: "cargando" }); setSiguiente(null);
    void consultar(dia, corte.signal).then((r) => {
      if (corte.signal.aborted) return;
      setLectura(r.ok ? { tipo: "lista", huecos: r.datos.huecos } : { tipo: "error", texto: textoDeFallo(r) });
    });
    return () => corte.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `llave` resume la cadena
  }, [slug, sucursalId, llave, codigo, dia, intento, recarga]);

  const buscarSiguiente = async () => {
    const mia = ++vuelta.current;
    setSiguiente("buscando");
    const r = await siguienteDiaConLugar(dia, ultimo, (d) => consultar(d));
    if (mia === vuelta.current) setSiguiente(!r.ok ? { error: textoDeBusqueda(r) } : r.datos ? { dia: r.datos.dia } : "ninguno");
  };

  const tira = tiraDeDias(hoy, desde, diasReserva);
  const irA = (d: string) => { setDia(d); setDesde(desdeDe(hoy, d)); alElegir(null); alCambiarDia?.(d); };
  // Los errores se anuncian con su `role="alert"`; aquí solo lo que no es error.
  const anuncio = lectura.tipo === "cargando" ? "Buscando horarios…"
    : lectura.tipo === "error" ? ""
    : lectura.huecos.length > 0 ? `${lectura.huecos.length} horarios el ${fechaLarga(dia)}.`
    : siguiente === "buscando" ? "Buscando el siguiente día con lugar…"
    : siguiente === "ninguno" ? "No encontramos lugar en los próximos días."
    : "No hay horarios este día.";

  return (
    <section aria-labelledby="titulo-horarios" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="titulo-horarios" className="font-display text-18 font-semibold first-letter:uppercase">{mesDe(tira.dias[0] ?? hoy)}</h3>
        <div className="flex">
          <button type="button" className={FLECHA} disabled={tira.anterior === null} aria-label="Días anteriores" onClick={() => tira.anterior !== null && setDesde(tira.anterior)}>
            <Icono nombre="chevron-izquierda" className="h-5 w-5" />
          </button>
          <button type="button" className={FLECHA} disabled={tira.siguiente === null} aria-label="Días siguientes" onClick={() => tira.siguiente !== null && setDesde(tira.siguiente)}>
            <Icono nombre="chevron-derecha" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* La tira se desliza de lado DENTRO del margen; cada día es un botón de 48 × 64. */}
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {tira.dias.map((d) => {
          const e = etiquetaDeDia(d), activo = d === dia;
          return (
            <li key={d} className="snap-start">
              <button type="button" aria-pressed={activo} aria-label={fechaLarga(d, hoy)} onClick={() => irA(d)}
                className={cn(
                  "flex h-16 w-12 flex-col items-center justify-center gap-0.5 rounded-lg border transition-[transform,background-color] duration-150 ease-vim active:scale-[.96]",
                  activo ? "border-transparent bg-accent text-sobre-accent" : "border-line bg-surface text-ink hover:bg-hover", FOCO,
                )}>
                <span className={cn("text-12", activo ? "" : "text-ink-2")}>{e.semana}</span>
                <span className="font-display text-18 font-semibold tabular-nums leading-none">{e.numero}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-14 text-ink-2 first-letter:uppercase">{fechaLarga(dia, hoy)}</p>
      <p aria-live="polite" className="sr-only">{anuncio}</p>

      {lectura.tipo === "cargando" && (
        <div aria-hidden="true" className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-12 rounded bg-hover" />)}
        </div>
      )}
      {lectura.tipo === "error" && (
        <div role="alert" className="flex flex-col items-start gap-2 text-15 text-ink">
          {lectura.texto}
          <button type="button" onClick={() => setIntento((n) => n + 1)} className={ENLACE}>Volver a intentar</button>
        </div>
      )}
      {lectura.tipo === "lista" && lectura.huecos.length > 0 && (
        <ul aria-label={`Horarios del ${fechaLarga(dia)}`} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {lectura.huecos.map((h) => {
            const activo = h === elegido;
            return (
              <li key={h}>
                <button type="button" aria-pressed={activo} onClick={() => alElegir(activo ? null : h)}
                  className={cn(
                    "h-12 w-full rounded border text-15 font-medium tabular-nums transition-[transform,background-color] duration-150 ease-vim active:scale-[.97]",
                    activo ? "border-transparent bg-accent text-sobre-accent" : "border-line-strong bg-surface text-ink hover:bg-hover", FOCO,
                  )}>
                  {horaDe(h)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lectura.tipo === "lista" && lectura.huecos.length === 0 && (
        <div className="flex flex-col items-start gap-1 rounded-lg bg-hover px-4 py-3">
          <p className="text-15 font-medium text-ink">No hay horarios este día.</p>
          {siguiente === null && <button type="button" onClick={() => void buscarSiguiente()} className={ENLACE}>Buscar el siguiente día con lugar</button>}
          {siguiente === "buscando" && <p className="text-14 text-ink-2">Buscando…</p>}
          {siguiente === "ninguno" && <p className="text-14 text-ink-2">No encontramos lugar en los próximos días. Prueba más adelante en la tira.</p>}
          {typeof siguiente === "object" && siguiente !== null && "error" in siguiente && (
            <div role="alert" className="flex flex-col items-start text-14 text-ink">
              {siguiente.error}
              <button type="button" onClick={() => void buscarSiguiente()} className={ENLACE}>Volver a intentar</button>
            </div>
          )}
          {typeof siguiente === "object" && siguiente !== null && "dia" in siguiente && (
            <button type="button" onClick={() => irA(siguiente.dia)} className={ENLACE}>
              Ver el {fechaLarga(siguiente.dia)}
              <Icono nombre="chevron-derecha" className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
