"use client";
import { useEffect, useState } from "react";
import { slotsConOpciones, slotsEnMenu, vistaPrevia, type SlotConOpciones } from "../lib/combos";
import { precioMxn } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";
import { leerFilasDeMenu, type FilaDeMenu, type MenuId } from "../lib/menus";

/** El menú desde el que se mira el combo. `null` = el negocio no tiene menús que elegir. */
export type MenuDeVistaPrevia = { id: MenuId; nombre: string; esGeneral: boolean } | null;
/** Lo calculado, y para qué menú propio (`null` = con los precios del General). */
type Vista = { slots: SlotConOpciones[]; de: MenuId | null; combo: FilaDeMenu | null; omitidas: number };

/**
 * Vista previa de precio del combo, en vivo. `refreshToken` sube cada vez que el editor de
 * slots cambia algo (agregar/editar/quitar slot u opción): eso es lo que dispara el refetch,
 * no un timer ni un polling.
 *
 * Con un menú PROPIO elegido (ADR 0029) la cuenta se hace con ESE menú: el precio del combo y el de
 * cada componente salen de sus filas, y lo que ese menú no vende no se ofrece — es lo que cobra la
 * caja de sus sucursales. Antes se calculaba siempre con el General, y junto a «Precio · en Menú
 * Norte» eso era un total falso para Norte. `base` es el precio del combo en el General.
 */
export function ComboPreview({ comboId, base, refreshToken, menu = null }: { comboId: string; base: number; refreshToken: number; menu?: MenuDeVistaPrevia }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const propio = menu && !menu.esGeneral ? menu.id : null;

  useEffect(() => {
    let cancelado = false;
    setError(null);
    Promise.all([slotsConOpciones(comboId), propio ? leerFilasDeMenu(propio) : Promise.resolve(null)])
      .then(([s, filas]) => {
        if (cancelado) return;
        if (!filas) {
          setVista({ slots: s, de: null, combo: null, omitidas: 0 });
          return;
        }
        const combo = filas.get(comboId);
        if (!combo) {
          setError("Este combo no está en este menú. Recarga la página.");
          return;
        }
        const enMenu = slotsEnMenu(s, filas);
        const cuenta = (ss: SlotConOpciones[]) => ss.reduce((n, x) => n + x.opciones.length, 0);
        setVista({ slots: enMenu, de: propio, combo, omitidas: cuenta(s) - cuenta(enMenu) });
      })
      .catch((e) => { if (!cancelado) setError(mensajeError(e, "No se pudo calcular la vista previa")); });
    return () => {
      cancelado = true;
    };
  }, [comboId, refreshToken, propio]);

  if (error) {
    return (
      <p className="rounded-lg border border-line bg-surface p-4 text-sm font-medium text-danger" role="alert">
        {error}
      </p>
    );
  }
  // Lo calculado para otro menú no se enseña: al cambiar de menú se espera a la cuenta nueva.
  if (vista === null || vista.de !== propio) {
    return <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">Calculando el precio…</p>;
  }

  const slots = vista.slots;
  const { principales, deltas } = vistaPrevia(vista.combo ? vista.combo.precio_mxn : base, slots);
  const primero = slots[0];
  // Si el primer slot no suma el precio del producto, todas sus opciones cuestan lo mismo dentro
  // del combo (el precio del producto elegido nunca entra a la cuenta): casi siempre es un error
  // de configuración, así que se avisa en vez de mostrarlo como si nada.
  const avisoPrimerSlot = !!primero && primero.modo_precio !== "SUMA_PRECIO_PRODUCTO";

  return (
    <div className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
      <h2 className="font-display text-base font-semibold">Cuánto va a pagar el cliente</h2>
      <p className="mb-3 text-13 text-ink-2">
        {menu ? (
          <>
            En <b className="font-semibold text-ink">{menu.nombre}</b>, tal como lo calcula la caja.
          </>
        ) : (
          "Tal como lo calcula la caja."
        )}{" "}
        Se actualiza con cada cambio.
      </p>

      {menu && vista.combo && !vista.combo.disponible && (
        <p className="mb-3 rounded border border-line bg-hover px-3 py-2 text-13 text-ink-2">Este combo no se vende en {menu.nombre}.</p>
      )}
      {menu && vista.omitidas > 0 && (
        <p className="mb-3 text-13 text-ink-2">
          {vista.omitidas === 1 ? "No se cuenta una opción que" : `No se cuentan ${vista.omitidas} opciones que`} {menu.nombre} no vende.
        </p>
      )}

      {avisoPrimerSlot && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-13 font-medium text-warning">
          El primer paso ({primero.nombre}) no cobra el producto elegido: todas sus opciones costarán lo mismo dentro
          del combo. Si es la hamburguesa (o el producto principal), elige «Se cobra el precio del producto elegido».
        </p>
      )}

      {slots.length === 0 && <p className="text-sm text-ink-2">Agrega pasos para ver el precio.</p>}

      {/* Un renglón por opción principal: en línea, con varias hamburguesas, era un párrafo. */}
      {principales.length > 0 && (
        <ul className="flex flex-col gap-1">
          {principales.map((p) => (
            <li key={p.nombre} className="flex items-baseline justify-between gap-3 font-display text-15 tabular-nums">
              <span className="font-sans text-14">Con {p.nombre}</span>
              <span className="font-semibold">{precioMxn(p.precio)}</span>
            </li>
          ))}
        </ul>
      )}

      {deltas.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-13 font-medium text-ink-2">Cambios que cuestan distinto</p>
          <ul className="flex flex-col gap-0.5 text-14 tabular-nums text-ink-2">
            {deltas.map((d) => (
              <li key={d.slot + d.nombre} className="flex justify-between gap-3">
                <span>{d.nombre}</span>
                <span>
                  {d.delta > 0 ? "+" : ""}
                  {precioMxn(d.delta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
