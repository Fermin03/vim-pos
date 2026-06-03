"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { aplicarPago, type MetodoPago, type TotalesTicket } from "../lib/cobro";
import { nuevoClientId } from "../lib/carrito";

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TARJETA_DEBITO", etiqueta: "Débito" },
  { valor: "TARJETA_CREDITO", etiqueta: "Crédito" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "APP_OTRO", etiqueta: "App" },
];

export function ModalCobro({
  token,
  totalesIniciales,
  onPagado,
  onCerrar,
}: {
  token: string;
  totalesIniciales: TotalesTicket;
  onPagado: (folio: string | null, cambio: number) => void;
  onCerrar: () => void;
}) {
  const [totales, setTotales] = useState<TotalesTicket>(totalesIniciales);
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [monto, setMonto] = useState<string>(totalesIniciales.pendiente.toFixed(2));
  const [recibido, setRecibido] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function cobrar() {
    setError(null);
    const m = Number(monto);
    if (!(m > 0)) { setError("Monto inválido"); return; }
    setProcesando(true);
    try {
      const recib = metodo === "EFECTIVO" && recibido ? Number(recibido) : undefined;
      const t = await aplicarPago(token, totales.ticketId, { metodo, monto: m, montoRecibido: recib }, nuevoClientId());
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        onPagado(t.folio, t.cambio);
      } else {
        setMonto(t.pendiente.toFixed(2));
        setRecibido("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cobrar");
    } finally {
      setProcesando(false);
    }
  }

  const cambioPreview = metodo === "EFECTIVO" && recibido ? Math.max(0, Number(recibido) - Number(monto)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-display text-[18px] font-semibold">Cobrar</span>
          <span className="text-[13px] text-ink-3">Pendiente <strong className="tabular-nums text-ink">{fmtMxn(totales.pendiente)}</strong></span>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {METODOS.map((x) => (
            <button key={x.valor} type="button" onClick={() => setMetodo(x.valor)} aria-pressed={metodo === x.valor}
              className={["rounded-lg border px-2 py-2 text-[12.5px] font-semibold transition",
                metodo === x.valor ? "border-ink bg-ink/5" : "border-line hover:border-ink"].join(" ")}>
              {x.etiqueta}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[13px] font-semibold">Monto a aplicar</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm tabular-nums outline-none focus:border-ink" />
        </label>

        {metodo === "EFECTIVO" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] font-semibold">Recibido (efectivo)</span>
            <input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={monto}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm tabular-nums outline-none focus:border-ink" />
            {cambioPreview > 0 && <div className="mt-1 text-[13px] text-success">Cambio: <strong className="tabular-nums">{fmtMxn(cambioPreview)}</strong></div>}
          </label>
        )}

        {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
          <Button className="flex-1" onClick={cobrar} disabled={procesando}>
            {procesando ? "Aplicando…" : "Aplicar pago"}
          </Button>
        </div>
      </div>
    </div>
  );
}
