"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { asignarRepartidor, confirmarSalida, listarRepartidores, type Repartidor } from "../lib/delivery";
import { marcarSalidaDomicilio } from "../lib/cuentas-abiertas";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/**
 * Salida de un pedido a domicilio: quién se lo lleva y cuánto debe traer de vuelta.
 *
 * Antes solo se marcaba "salió", sin dejar rastro de quién. Cuando el repartidor volvía con el
 * dinero no había contra qué cuadrarlo: si faltaba algo, no había forma de saber de qué pedido ni
 * de quién.
 *
 * Se ELIGE de la lista de repartidores dados de alta en el panel; no se teclea el nombre. Teclear
 * en cada salida es lento en hora pico y hace que el mismo "Luis" acabe escrito de cuatro maneras
 * y deje de poder cuadrarse. Tampoco son usuarios del sistema: no entran al POS ni aparecen en la
 * pantalla donde se elige quién opera la caja.
 *
 * Se puede salir sin repartidor: el pedido tiene que poder salir aunque el cajero ande a las
 * prisas. Lo que no se hace es fingir que se registró.
 */
export function ModalSalidaDomicilio({
  token,
  ticketId,
  folio,
  total,
  onListo,
  onCerrar,
}: {
  token: string;
  ticketId: string;
  folio: string | null;
  /** Lo que el repartidor debe traer de vuelta si el cliente paga en la puerta. */
  total: number;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [repartidores, setRepartidores] = useState<Repartidor[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [minutos, setMinutos] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  useEscape(() => { if (!procesando) onCerrar(); });

  useEffect(() => {
    listarRepartidores(token)
      .then((r) => {
        setRepartidores(r);
        // Con un solo repartidor dado de alta no hay nada que decidir: se preselecciona para que
        // la salida sea un toque.
        if (r.length === 1 && r[0]) setElegido(r[0].id);
      })
      .catch(() => setRepartidores([]));
  }, [token]);

  async function confirmar() {
    setProcesando(true);
    setError(null);
    try {
      if (elegido) {
        const asignacionId = await asignarRepartidor(token, {
          ticketId,
          repartidorId: elegido,
          montoALiquidar: total,
          tiempoPromesa: minutos.trim() ? Number(minutos) : null,
        });
        await confirmarSalida(token, asignacionId);
      }
      // La marca de "salió" se mantiene siempre: es la que pinta la tarjeta en la lista, y así la
      // pantalla se comporta igual haya o no repartidor anotado.
      await marcarSalidaDomicilio(token, ticketId);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la salida");
      setProcesando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Salida a domicilio"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">¿Quién se lo lleva?</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {folio ? `${folio} · ` : ""}
        {fmtMxn(total)} a cobrar en la puerta.
      </p>

      <div className="mt-4">
        {repartidores === null && <p className="text-[13px] text-ink-3">Cargando repartidores…</p>}

        {repartidores !== null && repartidores.length === 0 && (
          <p className="rounded border border-line bg-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
            No hay repartidores dados de alta. Se dan de alta una sola vez en el panel, en{" "}
            <span className="font-semibold">Usuarios → Repartidores</span>. El pedido puede salir
            igual, pero al regresar no vas a poder cuadrarle a nadie en particular.
          </p>
        )}

        {repartidores !== null && repartidores.length > 0 && (
          <div className="max-h-[240px] overflow-y-auto rounded border border-line">
            {repartidores.map((r) => {
              const activo = elegido === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setElegido(activo ? null : r.id)}
                  aria-pressed={activo}
                  className={[
                    "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0",
                    activo ? "bg-sel" : "hover:bg-bg",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border",
                      activo ? "border-ink bg-ink text-surface" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  >
                    {activo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{r.nombre}</span>
                    {r.telefono && <span className="block text-[12px] text-ink-3">{r.telefono}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[12.5px] font-semibold text-ink-2" htmlFor="min">
          Tiempo prometido · minutos
        </label>
        <input
          id="min"
          className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          inputMode="numeric"
          value={minutos}
          maxLength={3}
          onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCerrar}
          disabled={procesando}
          className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        <Button className="flex-1" onClick={confirmar} disabled={procesando}>
          {procesando ? "Registrando…" : elegido ? "Marcar salida" : "Salir sin repartidor"}
        </Button>
      </div>
    </Modal>
  );
}
