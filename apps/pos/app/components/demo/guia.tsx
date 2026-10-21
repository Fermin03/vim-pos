"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@vim/ui/styles";
import { LLAVE_GUIA } from "../../lib/demo";
import {
  PASOS, REGRESO_AL_INICIO, esDelInicio, estadoDelPaso, pasoActual, puntoDeRetorno, seguirPausa, type Pausa, type Paso,
} from "../../lib/demo-guia";
import { deviceClient, deviceSignOut } from "../../lib/supabase";

type Guardado = { activa: boolean; indice: number; pausa?: Pausa };

type Vista =
  | { tipo: "fin" }
  | { tipo: "pausa" }
  /** Guía apagada (salió o eligió explorar solo): queda a la mano para retomarla o empezar de nuevo. */
  | { tipo: "apagada" }
  | {
      tipo: "paso";
      i: number;
      paso: Paso;
      /** Recuadro a iluminar; null = la persona se fue a otra pantalla (globo en una esquina libre). */
      rect: DOMRect | null;
      /** Se ilumina `abrir` y no el ancla: lo que hay que tocar para llegar. */
      tocalo: boolean;
      /** El ancla está debajo de otro modal: sin oscurecer, el globo se va a la esquina. */
      tapado: boolean;
      /** Se ilumina el botón para regresar al inicio; esta es la instrucción. */
      regreso?: string;
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

const TOCABLE = "button, a, input, textarea, select, [role='button'], [role='switch']";

/** ¿Taparía el globo en (x, y) algo que la persona tenga que tocar? Muestrea una rejilla de 4×3. */
function tapaAlgo(x: number, y: number, ancho: number, alto: number, guia: HTMLElement | null): boolean {
  for (let c = 0; c < 4; c++) {
    for (let f = 0; f < 3; f++) {
      const px = x + (ancho * (c + 0.5)) / 4;
      const py = y + (alto * (f + 0.5)) / 3;
      const debajo = document.elementsFromPoint(px, py).find((el) => !guia?.contains(el));
      if (debajo?.closest(TOCABLE)) return true;
    }
  }
  return false;
}

/**
 * Dónde va el globo: debajo, arriba o a un lado del recuadro, y si no cabe (o la persona se fue
 * a otra pantalla), en una esquina. Gana el primer lugar que no tape un botón ni un campo: en un
 * iPad el globo no cabe junto a los modales grandes y tapaba justo lo que el paso pide tocar.
 */
function lugarDelGlobo(rect: DOMRect | null, ancho: number, alto: number, guia: HTMLElement | null): { x: number; y: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const derecha = W - ancho - MARGEN;
  const abajo = H - alto - MARGEN;
  const lugares: { x: number; y: number }[] = [];
  if (rect) {
    const x = Math.min(Math.max(rect.left, MARGEN), derecha);
    const y = Math.min(Math.max(rect.top, MARGEN), abajo);
    if (rect.bottom + HUECO + alto <= H - MARGEN) lugares.push({ x, y: rect.bottom + HUECO });
    if (rect.top - HUECO - alto >= MARGEN) lugares.push({ x, y: rect.top - HUECO - alto });
    if (rect.right + HUECO + ancho <= W - MARGEN) lugares.push({ x: rect.right + HUECO, y });
    if (rect.left - HUECO - ancho >= MARGEN) lugares.push({ x: rect.left - HUECO - ancho, y });
  }
  lugares.push({ x: MARGEN, y: abajo }, { x: MARGEN, y: MARGEN }, { x: derecha, y: abajo }, { x: derecha, y: MARGEN });
  return lugares.find((l) => !tapaAlgo(l.x, l.y, ancho, alto, guia)) ?? lugares[0]!;
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
    // Sin guardado = bienvenida o demo recién limpiada: ahí no hay nada que retomar.
    if (!g?.activa) return setVista(g ? { tipo: "apagada" } : null);

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
      // «Regresa al inicio» solo no basta: se ilumina el botón que lleva ahí.
      // El primero que se vea: con el ticket del cobro encima, el «Nuevo ticket ahora» de abajo está tapado.
      const seVe = (el: Element) => {
        const r = el.getBoundingClientRect();
        const arriba = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((x) => !raiz.current?.contains(x) && !globo.current?.contains(x));
        return !!arriba && el.contains(arriba);
      };
      const regreso = esDelInicio(paso)
        ? REGRESO_AL_INICIO.flatMap((r) => [...document.querySelectorAll(r.ancla)].map((el) => ({ ...r, el }))).find((r) => seVe(r.el))
        : undefined;
      if (regreso?.el) {
        return setVista({ tipo: "paso", i, paso, rect: regreso.el.getBoundingClientRect(), tocalo: true, tapado: false, regreso: regreso.texto });
      }
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
    const g = leer();
    if (g?.activa && !g.pausa) guardar({ ...g, indice: puntoDeRetorno(PASOS, g.indice) });
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

  if (vista.tipo === "apagada") {
    const caja = globo.current;
    const lugar = lugarDelGlobo(null, caja?.offsetWidth ?? 320, caja?.offsetHeight ?? 52, caja);
    const retomar = () => cambiar((g) => ({ activa: true, indice: puntoDeRetorno(PASOS, g.indice) }));
    // Otro negocio de ejemplo: sin sesión, el arranque de la caja limpia todo y muestra la bienvenida.
    const empezarDeNuevo = async () => {
      if (!window.confirm("¿Empezar de nuevo? Se abre otro negocio de ejemplo y este se descarta.")) return;
      await deviceSignOut();
      try { window.localStorage.removeItem(LLAVE_GUIA); } catch { /* el arranque la borra igual */ }
      window.location.reload();
    };
    return (
      <aside
        ref={globo}
        aria-label="Guía de la demo"
        className="fixed left-0 top-0 z-[100] flex items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-xl"
        style={{ transform: `translate(${lugar.x}px, ${lugar.y}px)` }}
      >
        <Button onClick={retomar}>Retomar la guía</Button>
        <Button variant="ghost" onClick={empezarDeNuevo}>Empezar de nuevo</Button>
      </aside>
    );
  }

  if (vista.tipo === "pausa") {
    return (
      <aside aria-label="Guía de la demo" className="fixed bottom-4 left-4 z-[100] flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 shadow-xl">
        <span className="text-14 text-ink-2">Guía en pausa: cobra tu otra venta y seguimos.</span>
        <Button variant="ghost" onClick={() => cambiar((g) => ({ activa: true, indice: g.indice + 1 }))}>
          Seguir con la guía
        </Button>
        {botonSalir}
      </aside>
    );
  }

  const { i, paso, rect, tocalo, tapado, regreso } = vista;
  const conRecuadro = rect && !tapado;
  const ancho = Math.min(340, window.innerWidth - MARGEN * 2);
  const alto = globo.current?.offsetHeight ?? 200;
  const lugar = lugarDelGlobo(conRecuadro ? rect : null, ancho, alto, raiz.current);
  // Solo lo que pide una acción tiene a dónde regresar; una explicación se lee donde esté.
  const pideRegresar = !rect && (paso.tipo === "hazlo" || paso.abrir !== undefined);
  const regresaA = esDelInicio(paso) ? "al inicio" : "a la pantalla de venta";

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
        {pideRegresar && <p className="text-13 font-semibold text-ink">Regresa {regresaA} para seguir con la guía.</p>}
        {regreso && <p className="text-13 font-semibold text-ink">{regreso}</p>}
        {/* Dos botones y «Salir» no caben en un renglón de 340 px: los del paso 12 van arriba. */}
        {paso.numero === 12 && (
          <div className="mt-1 flex gap-2">
            <Button className="flex-1" onClick={() => cambiar((g) => ({ ...g, indice: i, pausa: "cerrar" }))}>Hacer otra venta</Button>
            <Button className="flex-1" variant="ghost" onClick={siguiente}>Seguir con la guía</Button>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-3">
          {botonSalir}
          {paso.tipo === "explica" && paso.numero !== 12 && !tocalo && <Button onClick={siguiente}>Entendido</Button>}
        </div>
      </section>
    </div>
  );
}
