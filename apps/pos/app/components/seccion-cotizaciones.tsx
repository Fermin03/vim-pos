"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hoyMx } from "@vim/fecha";
import { Icono, Modal } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { fechaCorta } from "../lib/lealtad-reglas";
import { useEscape } from "../lib/use-escape";
import { almacenLocal } from "../lib/lealtad-canje";
import { cantidadRenglon, tipoDesdeSat } from "../lib/unidades";
import {
  cancelarCotizacion,
  estaVencida,
  filtrarCotizaciones,
  listarCotizaciones,
  marcarConvertida,
  marcarPendientes,
  type Cotizacion,
} from "../lib/cotizaciones";

/**
 * Cotizaciones de la tienda (retail 2, entrega 3): las vigentes y vencidas de esta caja. Se abre desde «Más»,
 * como «Créditos».
 */
export function SeccionCotizaciones({ token, cajaId, whatsapp, onReimprimir, onConvertir, onNueva, onVolver }: {
  token: string;
  cajaId: string;
  /** wa.me de la cotización, al teléfono de su cliente si tiene. */
  whatsapp: (c: Cotizacion) => string;
  onReimprimir: (c: Cotizacion) => void;
  /** Arma la venta en el Panel con los precios de hoy. */
  onConvertir: (c: Cotizacion) => void;
  onNueva: () => void;
  onVolver: () => void;
}) {
  const [lista, setLista] = useState<Cotizacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const hoy = hoyMx();

  const cargar = useCallback(() => {
    setError(null);
    // Antes de leer, las que se cobraron y no alcanzaron a marcarse: así no salen como vigentes.
    void marcarPendientes(almacenLocal(), (p) => marcarConvertida(token, p))
      .then(() => listarCotizaciones(token, cajaId))
      .then(setLista)
      .catch((e) => { setLista([]); setError(e instanceof Error ? e.message : "No se pudieron leer las cotizaciones"); });
  }, [token, cajaId]);
  useEffect(cargar, [cargar]);

  const c = lista?.find((x) => x.id === elegida) ?? null;
  useEscape(cancelando ? null : elegida ? () => setElegida(null) : onVolver);
  const visibles = useMemo(() => filtrarCotizaciones(lista ?? [], texto), [lista, texto]);

  const secundario = "h-12 rounded-lg border border-line-strong px-4 text-15 font-semibold text-ink-2 transition-[transform,border-color] duration-150 ease-vim hover:border-ink hover:text-ink active:scale-[.97]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a Más"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition-[transform,border-color] duration-150 ease-vim hover:border-ink hover:text-ink active:scale-[.97]"
        >
          <Icono nombre="chevron-izquierda" className="h-5 w-5" />
        </button>
        <h1 className="flex-1 font-display text-20 font-semibold tracking-tight">Cotizaciones</h1>
        <button type="button" onClick={onNueva} className={secundario}>Nueva cotización</button>
      </div>

      {error && <p className="flex-shrink-0 px-4 py-2.5 text-14 font-medium text-danger" role="alert">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[380px] flex-shrink-0 flex-col border-r border-line">
          <div className="border-b border-line p-3">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por folio o cliente…"
              aria-label="Buscar por folio o cliente"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-line-strong bg-surface px-3 text-16 text-ink outline-none placeholder:text-ink-3 focus:border-ink"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista === null ? (
              <p className="p-4 text-14 text-ink-3">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="p-4 text-14 text-ink-3">{texto ? "Ninguna cotización con ese folio o cliente." : "No hay cotizaciones vigentes en esta caja."}</p>
            ) : (
              visibles.map((x) => {
                const vencida = estaVencida(x.vigenteHasta, hoy);
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setElegida(x.id)}
                    className={[
                      "flex min-h-[64px] w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors",
                      x.id === elegida ? "bg-sel" : "hover:bg-hover",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-15 font-semibold text-ink">{x.folio}</span>
                      <span className="block truncate text-13 text-ink-3">{x.cliente?.nombre ?? "Sin cliente"}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-display text-16 font-semibold tabular-nums text-ink">{fmtMxn(x.total)}</span>
                      {vencida
                        ? <span className="rounded bg-danger/10 px-1.5 py-px text-11 font-bold uppercase tracking-wide text-danger">Vencida</span>
                        : <span className="text-12 text-ink-3">Hasta {fechaCorta(x.vigenteHasta)}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {!c ? (
            <p className="text-15 text-ink-3">Elige una cotización para verla, mandarla o convertirla en venta.</p>
          ) : (
            <div className="mx-auto flex max-w-[640px] flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-24 font-semibold tracking-tight">{c.folio}</h2>
                  <p className="mt-0.5 text-14 text-ink-3">
                    {c.cliente?.nombre ?? "Sin cliente"} · {estaVencida(c.vigenteHasta, hoy) ? `Venció el ${fechaCorta(c.vigenteHasta)}` : `Válida hasta ${fechaCorta(c.vigenteHasta)}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-12 font-bold uppercase tracking-widest text-ink-3">Total</div>
                  <div className="font-display text-32 font-bold tabular-nums text-ink">{fmtMxn(c.total)}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-line">
                {c.items.map((i, idx) => (
                  <div key={idx} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-15 text-ink">
                      <span className="font-semibold tabular-nums">{cantidadRenglon(i.cantidad, tipoDesdeSat(i.unidadSat))}</span> {i.nombre}
                    </span>
                    <span className="font-display text-15 font-semibold tabular-nums text-ink">{fmtMxn(i.total)}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => onReimprimir(c)} className={secundario}>Reimprimir</button>
                <a href={whatsapp(c)} target="_blank" rel="noopener noreferrer" className={`${secundario} flex items-center justify-center`}>Mandar por WhatsApp</a>
              </div>
              <button
                type="button"
                onClick={() => onConvertir(c)}
                className="h-14 w-full rounded-lg bg-accent font-display text-18 font-bold text-white shadow-sm transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98]"
              >
                Convertir en venta
              </button>
              <button
                type="button"
                onClick={() => setCancelando(true)}
                className="h-12 self-start rounded-lg px-4 text-15 font-semibold text-danger transition-colors hover:bg-danger-soft"
              >
                Cancelar cotización
              </button>
            </div>
          )}
        </div>
      </div>

      {cancelando && c && (
        <ModalCancelar
          folio={c.folio}
          onCerrar={() => setCancelando(false)}
          onConfirmar={async () => {
            await cancelarCotizacion(token, c.id);
            setCancelando(false);
            setElegida(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalCancelar({ folio, onCerrar, onConfirmar }: { folio: string; onCerrar: () => void; onConfirmar: () => Promise<void> }) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onCerrar} title="Cancelar cotización" hideTitle className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <h2 className="font-display text-20 font-semibold tracking-tight">¿Cancelar la cotización {folio}?</h2>
      <p className="mt-1 text-14 text-ink-3">Ya no se podrá convertir en venta y su enlace dejará de mostrarla.</p>
      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCerrar} disabled={procesando} className="h-12 rounded-lg border border-line-strong px-5 text-15 font-semibold text-ink-2 hover:border-ink hover:text-ink disabled:opacity-50">
          No
        </button>
        <button
          type="button"
          disabled={procesando}
          onClick={() => {
            setProcesando(true);
            setError(null);
            onConfirmar().catch((e) => { setError(e instanceof Error ? e.message : "No se pudo cancelar"); setProcesando(false); });
          }}
          className="h-12 rounded-lg bg-danger px-6 text-15 font-bold text-white shadow-sm transition-transform duration-150 ease-vim active:scale-[.98] disabled:opacity-60"
        >
          {procesando ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </Modal>
  );
}
