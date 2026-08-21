"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { asignarDelivery, confirmarSalida, leerRepartidores } from "../lib/delivery";
import { marcarSalidaDomicilio } from "../lib/cuentas-abiertas";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/**
 * Salida de un pedido a domicilio: quién se lo lleva y cuánto debe traer de vuelta.
 *
 * Antes solo se marcaba "salió", sin dejar rastro de quién. Cuando el repartidor volvía con el
 * dinero no había contra qué cuadrarlo: si faltaba algo, no había forma de saber de qué pedido ni
 * de quién. Con la asignación, cada entrega queda a nombre de alguien y la liquidación tiene
 * contra qué compararse.
 *
 * Si no hay repartidores dados de alta se puede salir igual, solo marcando la salida como hasta
 * ahora. Bloquear la puerta por un catálogo incompleto detendría el servicio, y el pedido tiene
 * que salir aunque falte un dato administrativo.
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
  const [repartidores, setRepartidores] = useState<{ id: string; nombre: string }[] | null>(null);
  const [elegido, setElegido] = useState<string>("");
  const [minutos, setMinutos] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  useEscape(() => { if (!procesando) onCerrar(); });

  useEffect(() => {
    leerRepartidores(token)
      .then((r) => { setRepartidores(r); if (r.length === 1) setElegido(r[0]!.id); })
      .catch(() => setRepartidores([]));
  }, [token]);

  async function confirmar() {
    setProcesando(true);
    setError(null);
    try {
      if (elegido) {
        const asignacionId = await asignarDelivery(token, {
          ticketId,
          repartidorId: elegido,
          montoALiquidar: total,
          tiempoPromesa: minutos.trim() ? Number(minutos) : null,
        });
        await confirmarSalida(token, asignacionId);
      }
      // La marca de "salió" se mantiene siempre: es la que pinta la tarjeta en la lista, y así
      // la pantalla se comporta igual haya o no repartidor asignado.
      await marcarSalidaDomicilio(token, ticketId);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la salida");
      setProcesando(false);
    }
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

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
        <label className="mb-1 block text-[12.5px] font-semibold text-ink-2" htmlFor="rep">Repartidor</label>
        {repartidores === null ? (
          <p className="text-[13px] text-ink-3">Cargando…</p>
        ) : repartidores.length === 0 ? (
          <p className="rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] leading-snug text-ink-2">
            No hay repartidores dados de alta. El pedido sale igual, pero no se podrá cuadrar por
            persona al regresar. Puedes darlos de alta en el panel, en Usuarios.
          </p>
        ) : (
          <select id="rep" className={input} value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Sin asignar</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {repartidores !== null && repartidores.length > 0 && (
        <div className="mt-3">
          <label className="mb-1 block text-[12.5px] font-semibold text-ink-2" htmlFor="min">
            Tiempo prometido · minutos
          </label>
          <input
            id="min"
            className={input}
            inputMode="numeric"
            value={minutos}
            maxLength={3}
            onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
      )}

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
          {procesando ? "Registrando…" : "Marcar salida"}
        </Button>
      </div>
    </Modal>
  );
}
