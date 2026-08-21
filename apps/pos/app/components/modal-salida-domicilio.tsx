"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { asignarDeliveryPorNombre, confirmarSalida, nombresDeRepartidores } from "../lib/delivery";
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
 * Se pide solo el NOMBRE. Los repartidores no tienen cuenta en el sistema —la app para ellos está
 * por hacerse— y exigir usuario con correo y PIN convertía una anotación de segundos en un
 * trámite; por eso el módulo llevaba meses sin usarse. Los nombres ya usados se ofrecen como
 * sugerencia para que el mismo "Luis" no acabe escrito de cuatro maneras y deje de poder cuadrarse.
 *
 * Se puede salir sin nombre: el pedido tiene que poder salir aunque el cajero ande a las prisas.
 * Lo que no se hace es fingir que se registró.
 */
export function ModalSalidaDomicilio({
  token,
  sucursalId,
  ticketId,
  folio,
  total,
  onListo,
  onCerrar,
}: {
  token: string;
  sucursalId: string;
  ticketId: string;
  folio: string | null;
  /** Lo que el repartidor debe traer de vuelta si el cliente paga en la puerta. */
  total: number;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [minutos, setMinutos] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const campo = useRef<HTMLInputElement | null>(null);
  useEscape(() => { if (!procesando) onCerrar(); });

  useEffect(() => {
    campo.current?.focus();
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    nombresDeRepartidores(token, sucursalId).then(setSugerencias).catch(() => setSugerencias([]));
  }, [token, sucursalId]);

  async function confirmar() {
    setProcesando(true);
    setError(null);
    try {
      const n = nombre.trim();
      if (n) {
        const asignacionId = await asignarDeliveryPorNombre(token, {
          ticketId,
          nombre: n,
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
        <input
          id="rep"
          ref={campo}
          className={input}
          list="repartidores-usados"
          value={nombre}
          maxLength={100}
          placeholder="Nombre del repartidor"
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !procesando) { e.preventDefault(); confirmar(); } }}
        />
        <datalist id="repartidores-usados">
          {sugerencias.map((s) => <option key={s} value={s} />)}
        </datalist>
        {sugerencias.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sugerencias.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNombre(s)}
                className={[
                  "h-8 rounded-full border px-3 text-[12.5px] font-semibold transition",
                  nombre.trim() === s ? "border-ink bg-sel text-ink" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

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

      {!nombre.trim() && (
        <p className="mt-3 text-[12.5px] leading-snug text-ink-3">
          Sin nombre el pedido sale igual, pero al regresar no vas a poder cuadrarle a nadie en
          particular.
        </p>
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
