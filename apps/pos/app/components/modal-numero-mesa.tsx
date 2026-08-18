"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { buscarMesaPorNumero, crearMesaConNumero } from "../lib/mesas-numero";

const input =
  "h-14 w-full rounded border border-line-strong px-3 text-center font-display text-[28px] font-bold tabular-nums outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/**
 * Abrir cuenta de comedor escribiendo el número de mesa.
 *
 * Antes había que buscar la mesa en el mapa. Escribir "4" y Enter es más rápido en hora pico, y
 * deja el mapa como consulta opcional en vez de paso obligatorio.
 *
 * La mesa DEBE existir: `asignar_mesa_a_ticket` la exige, y de ahí salen el estado ocupada/libre
 * y los reportes por mesa. Si el número no existe se ofrece crearla en el momento —un local que
 * acomoda una mesa nueva no debería ir al panel— pero se pide confirmación, para que un dedazo
 * no llene el catálogo de mesas fantasma.
 */
export function ModalNumeroMesa({
  token,
  tenantId,
  sucursalId,
  onMesaElegida,
  onVerMesas,
  onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  /** Mesa resuelta (existente o recién creada), lista para abrirle cuenta. */
  onMesaElegida: (mesaId: string, numero: string) => void;
  /** Abre el mapa de mesas. Opcional: si no se pasa, no se muestra el botón. */
  onVerMesas?: () => void;
  onCerrar: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ofrecerCrear, setOfrecerCrear] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  // Foco por ref y no con `autoFocus`: el modal se monta junto con un cambio de pantalla y en
  // esa transición el navegador puede dar el foco a otro elemento.
  //
  // Se intenta YA y otra vez en el siguiente frame. Solo con rAF no bastaba: no dispara cuando
  // la ventana no está compositando (minimizada, o en una pestaña de fondo), y entonces el
  // cajero encontraría el campo sin foco justo al volver a la caja.
  useEffect(() => {
    campo.current?.focus();
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const confirmar = useCallback(async () => {
    const n = numero.trim();
    if (!n) return;
    setBuscando(true);
    setError(null);
    setOfrecerCrear(null);
    try {
      const mesa = await buscarMesaPorNumero(token, sucursalId, n);
      if (!mesa) {
        setOfrecerCrear(n);
        return;
      }
      if (mesa.estado === "OCUPADA") {
        // Retomar una cuenta ya abierta se hace desde la lista, no abriendo otra: dos cuentas
        // en la misma mesa es justo el enredo que se paga al cobrar.
        setError(`La mesa ${n} ya está ocupada. Búscala en la lista para agregarle productos.`);
        return;
      }
      onMesaElegida(mesa.id, mesa.numero);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar la mesa");
    } finally {
      setBuscando(false);
    }
  }, [numero, token, sucursalId, onMesaElegida]);

  const crear = useCallback(async () => {
    if (!ofrecerCrear) return;
    setBuscando(true);
    setError(null);
    try {
      const mesa = await crearMesaConNumero(token, { tenantId, sucursalId, numero: ofrecerCrear });
      onMesaElegida(mesa.id, mesa.numero);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la mesa");
    } finally {
      setBuscando(false);
    }
  }, [ofrecerCrear, token, tenantId, sucursalId, onMesaElegida]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px] rounded-lg bg-surface p-5 shadow-lg">
        <h2 className="font-display text-[17px] font-bold">¿Qué mesa?</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Escribe el número y presiona Enter.</p>

        <input
          ref={campo}
          className={`${input} mt-3`}
          inputMode="numeric"
          placeholder="0"
          value={numero}
          maxLength={10}
          onChange={(e) => {
            setNumero(e.target.value);
            setOfrecerCrear(null);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (ofrecerCrear) crear(); else confirmar(); }
            if (e.key === "Escape") { e.preventDefault(); onCerrar(); }
          }}
        />

        {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

        {ofrecerCrear && (
          <div className="mt-3 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2.5">
            <p className="text-[13px] font-medium text-warning">
              La mesa {ofrecerCrear} no existe todavía.
            </p>
            <button
              type="button"
              onClick={crear}
              disabled={buscando}
              className="mt-2 h-9 rounded bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Crearla y abrir cuenta
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {onVerMesas ? (
            <button
              type="button"
              onClick={onVerMesas}
              className="h-10 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
            >
              Ver mesas
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="h-10 rounded border border-line-strong px-4 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
            >
              Cancelar
            </button>
            <Button onClick={confirmar} disabled={numero.trim().length === 0 || buscando || ofrecerCrear !== null}>
              {buscando ? "Buscando…" : "Abrir cuenta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
