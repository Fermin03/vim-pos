"use client";
import { useEffect, useState } from "react";
import { guardarAjustePantalla, leerAjustePantalla, textoEstadoPantalla, type AjustePantalla, type CambioPantalla } from "../lib/pantalla-cliente/ajuste";

/**
 * Apartado «Pantalla del cliente» del modal de impresoras. La pantalla se abre sola al detectar
 * un segundo monitor; esto es solo la salida para quien usa ese monitor en otra cosa, y el
 * selector para quien tiene más de dos.
 *
 * No se pinta si no hay escritorio: en el POS web o en la segunda caja de la LAN no hay ventana
 * que abrir.
 */
export function AjustePantallaCliente() {
  const [ajuste, setAjuste] = useState<AjustePantalla | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerAjustePantalla().then((a) => { if (vivo) setAjuste(a); });
    return () => { vivo = false; };
  }, []);

  if (!ajuste) return null;
  const candidatos = ajuste.monitores.filter((m) => !m.esDeLaCaja);

  async function cambiar(cambio: CambioPantalla) {
    setFallo(false);
    const nuevo = await guardarAjustePantalla(cambio);
    if (nuevo) setAjuste(nuevo); else setFallo(true);
  }

  return (
    <section className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded border border-line p-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-13 font-semibold text-ink">Pantalla del cliente</h3>
        <p className="text-13 text-ink-3">{textoEstadoPantalla(ajuste)}</p>
        {/* El modal que la aloja tiene su botón Guardar, para las impresoras. Esto no lo espera. */}
        <p className="text-13 text-ink-3">Se aplica al momento.</p>
        {fallo && <p className="text-13 text-danger" role="alert">No se pudo guardar el cambio.</p>}
      </div>
      {candidatos.length > 1 && ajuste.modo === "auto" && (
        <select
          aria-label="Monitor de la pantalla del cliente"
          className="h-11 rounded border border-line-strong px-3 text-sm"
          value={ajuste.displayId ?? candidatos[0]!.id}
          onChange={(e) => void cambiar({ modo: "auto", displayId: Number(e.target.value) })}
        >
          {candidatos.map((m) => <option key={m.id} value={m.id}>{m.etiqueta} ({m.ancho}×{m.alto})</option>)}
        </select>
      )}
      <label className="flex h-11 cursor-pointer items-center gap-2 text-13 text-ink-2">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={ajuste.modo === "auto"}
          onChange={(e) => void cambiar({ modo: e.target.checked ? "auto" : "apagada", displayId: ajuste.displayId })}
        />
        Encendida
      </label>
    </section>
  );
}
