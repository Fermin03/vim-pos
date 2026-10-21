"use client";
// El contenido de la hoja de un producto: foto, descripción, sus grupos de opciones (o los slots de
// un combo) con la regla dicha en palabras, cantidad, nota y «Agregar». Las reglas no viven aquí:
// `validarSeleccion` dice qué falta y `alternar` qué pasa al tocar una opción.
import { useId, useState, type ReactNode } from "react";
import { StatusChip, cn } from "@vim/ui/styles";
import {
  TOPES, estimarSeleccion, modificadoresIniciales, seleccionInicial, validarSeleccion,
  type ComponenteElegido, type ModificadorElegido, type Seleccion,
} from "../lib/carrito";
import type { Grupo, Producto } from "../lib/contrato";
import { aCentavos, formato, formatoMxn } from "../lib/dinero";
import { urlDeFoto } from "../lib/imagen";
import { alternar } from "../lib/pantalla";
import { reglaDeGrupo } from "../lib/textos";
import { CUERPO, PIE } from "./hoja";
import { Foto } from "./menu";
import { Cantidad, PARTE, PRINCIPAL } from "./piezas";

type Opcion = { id: string; nombre: string; extra: string; agotada: boolean; /** Por qué no se puede elegir. */ bloqueo?: string; debajo?: ReactNode };

/** Un grupo de modificadores o un slot de combo: su nombre, su regla y sus opciones. */
function Opciones({ ancla, nombre, minimo, maximo, opciones, elegidas, alTocar, falta }: {
  ancla: string; nombre: string; minimo: number; maximo: number | null; opciones: Opcion[];
  elegidas: Set<string>; alTocar: (id: string) => void; /** Lo que falta aquí, ya con intento de agregar. */ falta?: string;
}) {
  const nombreDeRadio = useId();
  const unica = minimo === 1 && maximo === 1;
  const lleno = maximo !== null && maximo > 1 && opciones.filter((o) => elegidas.has(o.id)).length >= maximo;
  return (
    <fieldset id={ancla} role={unica ? "radiogroup" : "group"} className="min-w-0 scroll-mt-4 pb-2">
      {/* Un <legend> no se deja acomodar con flex en todos los navegadores: el reparto va adentro. Y el
          aire de arriba va en él: el relleno de un <fieldset> cae DEBAJO de su leyenda, no encima. */}
      <legend className="w-full p-0 pt-4">
        <span className="flex items-center justify-between gap-3">
          <span className={cn("min-w-0 font-display text-16 font-semibold leading-snug", PARTE)}>{nombre}</span>
          {/* La regla, en la etiqueta de estado de la casa; en rojo cuando ya se quiso agregar sin cumplirla. */}
          <StatusChip tone={falta ? "danger" : "neutral"} className="flex-shrink-0">{reglaDeGrupo(minimo, maximo)}</StatusChip>
        </span>
      </legend>
      {falta && <p className="mt-1 text-14 font-medium text-danger">{falta}</p>}
      {/* Sin líneas entre opciones: las separa el aire. El renglón entero se toca y responde. */}
      <ul className="mt-1">
        {opciones.map((o) => {
          const marcada = elegidas.has(o.id);
          const fuera = o.agotada || !!o.bloqueo || (lleno && !marcada);
          const extra = aCentavos(o.extra) ?? 0;
          return (
            <li key={o.id}>
              <label className={cn("-mx-4 flex min-h-12 items-center gap-3 px-4 py-2 transition-colors duration-150", fuera ? "text-ink-3" : "cursor-pointer active:bg-hover active:duration-0")}>
                <input type={unica ? "radio" : "checkbox"} name={unica ? nombreDeRadio : undefined} checked={marcada} disabled={fuera}
                  onChange={() => alTocar(o.id)} className="h-6 w-6 flex-shrink-0 accent-ink" />
                <span className={cn("min-w-0 flex-1 text-16 leading-snug", PARTE)}>
                  {o.nombre}
                  {(o.agotada || o.bloqueo) && <span className="block text-13">{o.agotada ? "Agotado" : o.bloqueo}</span>}
                </span>
                {extra > 0 && <span className="flex-shrink-0 font-display text-14 tabular-nums text-ink-2">+{formato(extra)}</span>}
              </label>
              {marcada && o.debajo}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

const deGrupo = (g: Grupo): Opcion[] => g.opciones.map((o) => ({ id: o.id, nombre: o.nombre, extra: o.precio_extra_final_mxn, agotada: o.agotada }));
const tocarModificador = (elegidos: ModificadorElegido[], g: Grupo, opcionId: string): ModificadorElegido[] =>
  alternar(elegidos, (m) => m.opcionId, g.opciones.map((o) => o.id), { opcionId, cantidad: 1 }, g);

export function ProductoPorAgregar({ producto, alAgregar }: {
  producto: Producto;
  /** Devuelve false si el pedido ya no admite otro renglón. */
  alAgregar: (s: Seleccion, cantidad: number, nota: string) => boolean;
}) {
  const [s, setS] = useState<Seleccion>(() => seleccionInicial(producto));
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [intento, setIntento] = useState(false);   // ya quiso agregar con algo pendiente: se marca dónde
  const [lleno, setLleno] = useState(false);
  const idNota = useId(), ancla = useId();

  const faltas = validarSeleccion(producto, s);
  const faltaEn = (id: string) => (intento ? faltas.find((f) => f.donde === id)?.texto : undefined);
  const foto = urlDeFoto(producto.imagen_url);
  const modsElegidos = new Set(s.modificadores.map((m) => m.opcionId));

  const tocarComponente = (slotId: string, productoId: string) => {
    const slot = producto.slots.find((x) => x.id === slotId)!;
    const o = slot.opciones.find((x) => x.producto_id === productoId)!;
    const clave = (c: ComponenteElegido) => `${c.grupoId}:${c.productoId}`;
    setS({ ...s, componentes: alternar(s.componentes, clave, slot.opciones.map((x) => `${slot.id}:${x.producto_id}`),
      { grupoId: slot.id, productoId, cantidad: 1, modificadores: modificadoresIniciales(o.grupos) }, slot) });
  };

  const agregar = () => {
    if (faltas.length > 0) {
      setIntento(true);
      document.getElementById(`${ancla}${faltas[0]!.donde}`)?.scrollIntoView({ block: "center" });
      return;
    }
    if (!alAgregar(s, cantidad, nota)) setLleno(true);
  };

  return (
    <>
      <div className={CUERPO}>
        {foto && <Foto src={foto} alt={`Foto de ${producto.nombre}`} lado={[512, 320]} className="aspect-[8/5] h-auto w-full" />}
        <div className="px-4 pb-4">
          <div className="border-b border-line pb-4 pt-3">
            {producto.descripcion && <p className={cn("text-15 leading-relaxed text-ink-2", PARTE)}>{producto.descripcion}</p>}
            <p className={cn("font-display text-20 font-semibold tabular-nums", producto.descripcion && "mt-2")}>{formatoMxn(producto.precio_final_mxn)}</p>
          </div>
          <div className="divide-y divide-line">
            {producto.grupos.map((g) => (
              <Opciones key={g.id} ancla={`${ancla}${g.id}`} nombre={g.nombre} minimo={g.minimo} maximo={g.maximo} opciones={deGrupo(g)}
                elegidas={modsElegidos} falta={faltaEn(g.id)}
                alTocar={(id) => setS({ ...s, modificadores: tocarModificador(s.modificadores, g, id) })} />
            ))}
            {producto.slots.map((slot) => {
              const mios = s.componentes.filter((c) => c.grupoId === slot.id);
              const enOtro = new Set(s.componentes.filter((c) => c.grupoId !== slot.id).map((c) => c.productoId));
              return (
                <Opciones key={slot.id} ancla={`${ancla}${slot.id}`} nombre={slot.nombre} minimo={slot.minimo} maximo={slot.maximo}
                  elegidas={new Set(mios.map((c) => c.productoId))} falta={faltaEn(slot.id)} alTocar={(id) => tocarComponente(slot.id, id)}
                  opciones={slot.opciones.map((o) => {
                    const elegido = mios.find((c) => c.productoId === o.producto_id);
                    return {
                      id: o.producto_id, nombre: o.nombre, extra: o.precio_extra_final_mxn, agotada: o.agotado,
                      // El mismo producto no puede ir dos veces en un combo, ni en partes distintas.
                      bloqueo: enOtro.has(o.producto_id) ? "Ya lo elegiste en otra parte del combo" : undefined,
                      debajo: elegido && o.grupos.length > 0 && (
                        <div className="mb-2 ml-3 border-l-2 border-line pl-4">
                          {o.grupos.map((g) => (
                            <Opciones key={g.id} ancla={`${ancla}${g.id}`} nombre={g.nombre} minimo={g.minimo} maximo={g.maximo} opciones={deGrupo(g)}
                              elegidas={new Set(elegido.modificadores.map((m) => m.opcionId))} falta={faltaEn(g.id)}
                              alTocar={(id) => setS({ ...s, componentes: s.componentes.map((c) =>
                                (c === elegido ? { ...c, modificadores: tocarModificador(c.modificadores, g, id) } : c)) })} />
                          ))}
                        </div>
                      ),
                    };
                  })} />
              );
            })}
            <div className="py-4">
              <label htmlFor={idNota} className="flex items-center justify-between gap-3">
                <span className="font-display text-16 font-semibold leading-snug">¿Algo que debamos saber?</span>
                <StatusChip className="flex-shrink-0">Opcional</StatusChip>
              </label>
              <textarea id={idNota} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={TOPES.nota} rows={2}
                placeholder="Sin cebolla, salsa aparte…"
                className="mt-2 block w-full resize-none rounded border border-line-strong px-3 py-2 text-16 placeholder:text-ink-3 focus:border-ink focus:outline-none" />
            </div>
          </div>
        </div>
      </div>
      <div className={PIE}>
        <p aria-live="polite" className={cn("pb-2 text-14", lleno || intento ? "font-medium text-danger" : "text-ink-2", !lleno && faltas.length === 0 && "sr-only")}>
          {lleno ? `Tu pedido ya tiene ${TOPES.renglones} productos distintos. Quita alguno para agregar este.` : faltas[0]?.texto ?? ""}
        </p>
        <div className="flex items-center gap-3">
          <Cantidad grande valor={cantidad} max={TOPES.porRenglon} de={producto.nombre} alCambiar={setCantidad} />
          <button type="button" onClick={agregar} aria-disabled={faltas.length > 0 || undefined} className={cn(PRINCIPAL, "h-14 min-w-0 flex-1 justify-between px-5 text-16")}>
            <span>Agregar</span>
            <span className="tabular-nums">{formato(estimarSeleccion(producto, s, cantidad))}</span>
          </button>
        </div>
      </div>
    </>
  );
}
