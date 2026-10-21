"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@vim/ui/styles";
import { LLAVE_GUIA } from "../../lib/demo";
import { PASOS, estadoDelPaso, pasoActual, seguirPausa, type Pausa, type Paso } from "../../lib/demo-guia";
import { deviceClient } from "../../lib/supabase";

type Guardado = { activa: boolean; indice: number; pausa?: Pausa };

type Vista =
  | { tipo: "fin" }
  | { tipo: "pausa" }
  | {
      tipo: "paso";
      i: number;
      paso: Paso;
      /** Recuadro a iluminar; null = la persona se fue a otra pantalla (globo al centro). */
      rect: DOMRect | null;
      /** Se ilumina `abrir` y no el ancla: lo que hay que tocar para llegar. */
      tocalo: boolean;
      /** El ancla está debajo de otro modal: sin oscurecer, el globo se va a la esquina. */
      tapado: boolean;
    };

const TOTAL = 17;
const MARGEN = 16;
const HUECO = 12;

function leer(): Guardado | null {
  try {
    const g = JSON.parse(window.localStorage.getItem(LLAVE_GUIA) ?? "null") as Guardado | null;
    return g && typeof g.indice === "number" ? g : null;
  } catch {
    return null;
  }
}

function guardar(g: Guardado) {
  try {
    window.localStorage.setItem(LLAVE_GUIA, JSON.stringify(g));
  } catch { /* sin almacenamiento la guía sigue, solo que no sobrevive a recargar */ }
}

/** Medición mínima (ADR 0044): hasta dónde llegó. Sin esperar y sin que un error estorbe. */
function registrar(numero: number) {
  Promise.resolve(deviceClient.rpc("demo_registrar_paso", { p_paso: numero })).catch(() => {});
}

/** Dónde va el globo: debajo, arriba, a un lado del recuadro o, si no cabe, en la esquina. */
function lugarDelGlobo(rect: DOMRect | null, ancho: number, alto: number): { x: number; y: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!rect) return { x: MARGEN, y: H - alto - MARGEN };
  const x = Math.min(Math.max(rect.left, MARGEN), W - ancho - MARGEN);
  const y = Math.min(Math.max(rect.top, MARGEN), H - alto - MARGEN);
  if (rect.bottom + HUECO + alto <= H - MARGEN) return { x, y: rect.bottom + HUECO };
  if (rect.top - HUECO - alto >= MARGEN) return { x, y: rect.top - HUECO - alto };
  if (rect.right + HUECO + ancho <= W - MARGEN) return { x: rect.right + HUECO, y };
  if (rect.left - HUECO - ancho >= MARGEN) return { x: rect.left - HUECO - ancho, y };
  return { x: MARGEN, y: H - alto - MARGEN };
}

/**
 * Guía «Hazlo tú» (pasos 2–16). No avanza hasta que la persona hace la acción: cada 300 ms lee
 * la pantalla (atributos `data-tour`) y salta al primer paso no cumplido desde el guardado.
 *
 * `fin` es la pantalla del paso 17 (la pone la Task 5); sin ella se muestra un cierre mínimo.
 */
export function Guia({ fin }: { fin?: ReactNode }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const globo = useRef<HTMLElement>(null);

  const revisar = useCallback(() => {
    let g = leer();
    if (!g?.activa) return setVista(null);

    if (g.pausa) {
      const sigue = seguirPausa(g.pausa, document);
      if (sigue) {
        if (sigue !== g.pausa) guardar({ ...g, pausa: sigue });
        return setVista({ tipo: "pausa" });
      }
      g = { activa: true, indice: g.indice + 1 };
      guardar(g);
      registrar(PASOS[g.indice]?.numero ?? TOTAL);
    }

    const i = pasoActual(PASOS, g.indice, document);
    if (i !== g.indice) {
      guardar({ ...g, indice: i });
      registrar(PASOS[i]?.numero ?? TOTAL);
    }
    const paso = PASOS[i];
    if (!paso) return setVista({ tipo: "fin" });

    if (estadoDelPaso(paso, document) === "perdida") {
      return setVista({ tipo: "paso", i, paso, rect: null, tocalo: false, tapado: false });
    }
    const ancla = document.querySelector(paso.ancla);
    const el = ancla ?? document.querySelector(paso.abrir ?? paso.ancla);
    if (!el) return setVista({ tipo: "paso", i, paso, rect: null, tocalo: false, tapado: false });
    const rect = el.getBoundingClientRect();
    // El recuadro y el oscurecido no reciben toques, así que elementFromPoint ve lo que está debajo.
    const encima = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const tapado = !!encima && !el.contains(encima) && !raiz.current?.contains(encima);
    setVista({ tipo: "paso", i, paso, rect, tocalo: !ancla, tapado });
  }, []);

  useEffect(() => {
    revisar();
    const id = setInterval(revisar, 300);
    window.addEventListener("resize", revisar);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", revisar);
    };
  }, [revisar]);

  const cambiar = useCallback((cambio: (g: Guardado) => Guardado) => {
    const g = leer();
    if (!g) return;
    const nuevo = cambio(g);
    guardar(nuevo);
    if (nuevo.activa && !nuevo.pausa && nuevo.indice !== g.indice) registrar(PASOS[nuevo.indice]?.numero ?? TOTAL);
    revisar();
  }, [revisar]);

  const salir = () => cambiar((g) => ({ ...g, activa: false }));
  const siguiente = () => cambiar((g) => ({ ...g, indice: g.indice + 1 }));

  if (!vista) return null;

  const botonSalir = (
    <button type="button" onClick={salir} className="text-13 font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline">
      Salir de la guía
    </button>
  );

  if (vista.tipo === "fin") {
    return (
      fin ?? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/55 p-4">
          <section className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg bg-surface p-6 text-center shadow-xl">
            <h2 className="font-display text-xl font-semibold tracking-tight">Terminaste el recorrido</h2>
            {botonSalir}
          </section>
        </div>
      )
    );
  }

  if (vista.tipo === "pausa") {
    return (
      <aside aria-label="Guía de la demo" className="fixed bottom-4 left-4 z-[100] flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 shadow-xl">
        <span className="text-14 text-ink-2">Guía en pausa: cobra tu otra venta y seguimos.</span>
        {botonSalir}
      </aside>
    );
  }

  const { i, paso, rect, tocalo, tapado } = vista;
  const conRecuadro = rect && !tapado;
  const ancho = Math.min(340, window.innerWidth - MARGEN * 2);
  const alto = globo.current?.offsetHeight ?? 200;
  const lugar = conRecuadro
    ? lugarDelGlobo(rect, ancho, alto)
    : rect
      ? lugarDelGlobo(null, ancho, alto)
      : { x: (window.innerWidth - ancho) / 2, y: (window.innerHeight - alto) / 2 };
  // Solo lo que pide una acción tiene a dónde regresar; una explicación se lee donde esté.
  const pideRegresar = !rect && (paso.tipo === "hazlo" || paso.abrir !== undefined);
  const regresaA = paso.etapa === "Monitor de ventas" || paso.etapa === "Cerrar turno" ? "al inicio" : "a la pantalla de venta";

  return (
    <div ref={raiz} className="pointer-events-none fixed inset-0 z-[100]">
      {conRecuadro && (
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 rounded-xl transition-[transform,width,height] duration-200 ease-vim motion-reduce:transition-none"
          style={{
            width: rect.width + 12,
            height: rect.height + 12,
            transform: `translate(${rect.left - 6}px, ${rect.top - 6}px)`,
            boxShadow: "0 0 0 2px rgb(var(--accent)), 0 0 0 9999px rgb(var(--ink) / .55)",
          }}
        />
      )}
      <section
        ref={globo}
        aria-label="Guía de la demo"
        aria-live="polite"
        className="pointer-events-auto absolute left-0 top-0 flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-xl transition-transform duration-200 ease-vim motion-reduce:transition-none"
        style={{ width: ancho, transform: `translate(${lugar.x}px, ${lugar.y}px)` }}
      >
        <div className="text-12 font-semibold text-ink-3">
          Paso {paso.numero} de {TOTAL} · {paso.etapa}
        </div>
        <h2 className="font-display text-17 font-semibold leading-snug tracking-tight">
          {paso.titulo}
          {tocalo && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-12 font-semibold text-white">Tócalo</span>}
        </h2>
        <p className="text-14 leading-snug text-ink-2">{paso.texto}</p>
        {pideRegresar && <p className="text-13 font-semibold text-ink">Regresa {regresaA} para seguir.</p>}
        <div className="mt-1 flex items-center justify-between gap-3">
          {botonSalir}
          {paso.numero === 12 ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={siguiente}>Saltar</Button>
              <Button onClick={() => cambiar((g) => ({ ...g, indice: i, pausa: "cerrar" }))}>Hacer otra venta</Button>
            </div>
          ) : (
            paso.tipo === "explica" && !tocalo && <Button onClick={siguiente}>Entendido</Button>
          )}
        </div>
      </section>
    </div>
  );
}
