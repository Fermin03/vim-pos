"use client";
// La tira de días y los horarios libres de la cadena (`huecos`). La usan «Armar la cita» y «Cambiar
// horario» en la página de la cita (con `codigo`: los tramos de esa cita no tapan horarios).
// Un día sin lugar lo dice y busca solo el siguiente que tenga (lib/reservas.ts).
import { useEffect, useState } from "react";
import { Icono, cn } from "@vim/ui/styles";
import { sumarDias } from "@vim/fecha";
import { huecos, type ServicioDeCadena } from "../../lib/api";
import { desdeDe, etiquetaDeDia, fechaLarga, horaDe, mesDe, siguienteDiaConLugar, textoDeFallo, tiraDeDias } from "../../lib/reservas";
import { FOCO } from "../piezas";

type Lectura =
  | { tipo: "cargando" }
  | { tipo: "lista"; huecos: string[]; siguiente: { dia: string; huecos: string[] } | null | "buscando" }
  | { tipo: "error"; texto: string };

const FLECHA = cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink hover:bg-hover disabled:pointer-events-none disabled:opacity-30", FOCO);

export function Horarios({ slug, sucursalId, cadena, codigo, hoy, diasReserva, elegido, alElegir }: {
  slug: string; sucursalId: string; cadena: ServicioDeCadena[];
  /** Al cambiar una cita: su código. */
  codigo?: string;
  hoy: string; diasReserva: number;
  /** La hora elegida (ISO) o null. */
  elegido: string | null;
  alElegir: (iso: string | null) => void;
}) {
  const [dia, setDia] = useState(hoy);
  const [desde, setDesde] = useState(0);
  const [lectura, setLectura] = useState<Lectura>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const ultimo = sumarDias(hoy, diasReserva);
  const llave = JSON.stringify(cadena);

  useEffect(() => {
    if (cadena.length === 0) return;
    const corte = new AbortController();
    const consultar = (d: string) => huecos(slug, { sucursal_id: sucursalId, dia: d, servicios: cadena, ...(codigo && { codigo }) }, corte.signal);
    setLectura({ tipo: "cargando" });
    void (async () => {
      const r = await consultar(dia);
      if (corte.signal.aborted) return;
      if (!r.ok) { setLectura({ tipo: "error", texto: textoDeFallo(r) }); return; }
      if (r.datos.huecos.length > 0) { setLectura({ tipo: "lista", huecos: r.datos.huecos, siguiente: null }); return; }
      setLectura({ tipo: "lista", huecos: [], siguiente: "buscando" });
      const s = await siguienteDiaConLugar(dia, ultimo, consultar);
      if (!corte.signal.aborted) setLectura({ tipo: "lista", huecos: [], siguiente: s });
    })();
    return () => corte.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `llave` resume la cadena
  }, [slug, sucursalId, llave, codigo, dia, ultimo, intento]);

  const tira = tiraDeDias(hoy, desde, diasReserva);
  const irA = (d: string) => { setDia(d); setDesde(desdeDe(hoy, d)); alElegir(null); };
  const anuncio = lectura.tipo === "cargando" ? "Buscando horarios…"
    : lectura.tipo === "error" ? lectura.texto
    : lectura.huecos.length > 0 ? `${lectura.huecos.length} horarios el ${fechaLarga(dia)}.`
    : lectura.siguiente === "buscando" ? "No hay horarios este día. Buscando el siguiente día con lugar…"
    : "No hay horarios este día.";

  return (
    <section aria-labelledby="titulo-horarios" className="flex flex-col gap-3">
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

      {/* La tira se desliza de lado en el teléfono; cada día es un botón de 48 × 64. */}
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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
          <button type="button" onClick={() => setIntento((n) => n + 1)} className={cn("inline-flex min-h-11 items-center font-semibold underline underline-offset-4", FOCO)}>Volver a intentar</button>
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
        <div className="flex flex-col items-start gap-2 rounded-lg bg-hover px-4 py-4">
          <p className="text-15 font-medium text-ink">No hay horarios este día.</p>
          {lectura.siguiente === "buscando" && <p className="text-14 text-ink-2">Buscando el siguiente día con lugar…</p>}
          {lectura.siguiente && lectura.siguiente !== "buscando" && (
            <button type="button" onClick={() => irA((lectura.siguiente as { dia: string }).dia)}
              className={cn("inline-flex min-h-11 items-center gap-1 text-15 font-semibold text-ink underline underline-offset-4", FOCO)}>
              Ver el {fechaLarga(lectura.siguiente.dia)}
              <Icono nombre="chevron-derecha" className="h-4 w-4" />
            </button>
          )}
          {lectura.siguiente === null && <p className="text-14 text-ink-2">Prueba con otro día.</p>}
        </div>
      )}
    </section>
  );
}
