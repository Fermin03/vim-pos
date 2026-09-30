"use client";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Modal, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { ETIQUETA_METODO_COBRO, estadoCobro, textoEstadoCobro, type EstadoCobro, type MetodoCobro } from "@vim/db/cobro";
import type { Api } from "../lib/tipos";
import { fmtMxn, input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Pago = {
  id: string;
  monto_mxn: number;
  metodo: MetodoCobro;
  referencia: string | null;
  pagado_el: string;
  cubre_desde: string;
  cubre_hasta: string;
  notas: string | null;
  anulado_at: string | null;
  anulado_motivo: string | null;
};

type Suscripcion = { estado: string; precio_mensual_mxn: number; proxima_fecha_cobro: string | null; ciclo_facturacion?: string };

export const TONO_COBRO: Record<EstadoCobro["tipo"], TonoEstado> = {
  SIN_COBRO: "neutral", AL_CORRIENTE: "success", POR_VENCER: "warning", HOY: "warning", VENCIDO: "danger",
};

const bloque = "rounded-lg border border-line p-3";
const subTitulo = "text-12 font-semibold uppercase tracking-wide text-ink-2";

/**
 * Pagos del cliente (0130). Registrar un pago recorre la fecha de cobro; el periodo lo pone la
 * base desde la fecha que tocaba, así que aquí solo se dice cuánto, cómo, cuándo y cuántos meses.
 */
export function FichaPagos({ api, tenantId, suscripcion, onCambio }: { api: Api; tenantId: string; suscripcion: Suscripcion | null; onCambio: () => Promise<void> | void }) {
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [anulando, setAnulando] = useState<Pago | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPagos(((await api(`/api/tenants/${tenantId}/pagos`)).pagos ?? []) as Pago[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api, tenantId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const estado = estadoCobro(suscripcion?.proxima_fecha_cobro, hoyMx());
  const ultimoVigente = pagos?.find((p) => !p.anulado_at) ?? null;

  async function anular({ motivo }: { motivo: string }) {
    if (!anulando) return;
    setOcupado(true);
    try {
      await api(`/api/tenants/${tenantId}/pagos`, { method: "PATCH", body: JSON.stringify({ pago_id: anulando.id, motivo }) });
      setAnulando(null);
      await Promise.all([cargar(), onCambio()]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={`${bloque} mt-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={subTitulo}>Pagos</span>
        {suscripcion && <StatusChip tone={TONO_COBRO[estado.tipo]} punto>{textoEstadoCobro(estado)}</StatusChip>}
      </div>

      {!suscripcion ? (
        <p className="text-13 text-ink-2">Activa el cobro para poder registrar pagos.</p>
      ) : (
        <button onClick={() => setRegistrando(true)} className="btn mb-3 h-9 rounded bg-ink px-3 text-13 font-semibold text-white hover:opacity-90">
          Registrar pago…
        </button>
      )}

      {error && <Aviso tono="danger" role="alert">{error}</Aviso>}
      {pagos && pagos.length === 0 && suscripcion && <p className="text-13 text-ink-3">Todavía no hay pagos registrados.</p>}
      {pagos && pagos.length > 0 && (
        <ul className="divide-y divide-line">
          {pagos.slice(0, 12).map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
              <div className={p.anulado_at ? "text-ink-3 line-through" : ""}>
                <span className="font-semibold tabular-nums">{fmtMxn(Number(p.monto_mxn))}</span>
                <span className="text-13 text-ink-2"> · {ETIQUETA_METODO_COBRO[p.metodo] ?? p.metodo}{p.referencia ? ` ${p.referencia}` : ""}</span>
                <div className="text-12 text-ink-3">
                  Del {fechaLegible(p.cubre_desde)} al {fechaLegible(p.cubre_hasta)} · pagado el {fechaLegible(p.pagado_el)}
                </div>
              </div>
              {p.anulado_at ? (
                <span className="text-12 text-ink-3" title={p.anulado_motivo ?? ""}>Anulado: {p.anulado_motivo}</span>
              ) : p.id === ultimoVigente?.id ? (
                <button onClick={() => setAnulando(p)} className="text-12 font-semibold text-danger underline-offset-2 hover:underline">Anular…</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {registrando && suscripcion && (
        <RegistrarPago
          api={api}
          tenantId={tenantId}
          suscripcion={suscripcion}
          onCerrar={() => setRegistrando(false)}
          onListo={async () => { setRegistrando(false); await Promise.all([cargar(), onCambio()]); }}
        />
      )}

      <DialogoConfirmar
        abierto={anulando !== null}
        onCerrar={() => setAnulando(null)}
        titulo="¿Anular este pago?"
        descripcion={anulando ? `El pago de ${fmtMxn(Number(anulando.monto_mxn))} queda tachado en el historial y la fecha de cobro regresa al ${fechaLegible(anulando.cubre_desde)}.` : ""}
        nombreEsperado=""
        sinNombre
        etiquetaBoton="Anular pago"
        peligroso
        ocupado={ocupado}
        onConfirmar={anular}
      />
    </div>
  );
}

const METODOS: MetodoCobro[] = ["TRANSFERENCIA", "EFECTIVO", "DEPOSITO", "TARJETA", "OTRO"];

function RegistrarPago({ api, tenantId, suscripcion, onCerrar, onListo }: {
  api: Api; tenantId: string; suscripcion: Suscripcion; onCerrar: () => void; onListo: () => Promise<void>;
}) {
  const anual = suscripcion.ciclo_facturacion === "ANUAL";
  // El precio de la suscripción es mensual aun en el ciclo anual; un periodo anual son doce.
  const precioPeriodo = Number(suscripcion.precio_mensual_mxn) * (anual ? 12 : 1);
  const [periodos, setPeriodos] = useState(1);
  const [monto, setMonto] = useState(String(precioPeriodo));
  const [metodo, setMetodo] = useState<MetodoCobro>("TRANSFERENCIA");
  const [fecha, setFecha] = useState(hoyMx());
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cambiarPeriodos(n: number) {
    setPeriodos(n);
    setMonto(String(Math.round(precioPeriodo * n * 100) / 100));
  }

  async function guardar() {
    setError(null);
    setOcupado(true);
    try {
      await api(`/api/tenants/${tenantId}/pagos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(monto), metodo, pagado_el: fecha, periodos, referencia, notas }),
      });
      await onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setOcupado(false);
    }
  }

  const unidad = anual ? (periodos === 1 ? "año" : "años") : (periodos === 1 ? "mes" : "meses");

  return (
    <Modal open onClose={onCerrar} title="Registrar pago" hideTitle className="w-[min(480px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <h2 className="font-display text-20 font-semibold tracking-tight">Registrar pago</h2>
      <p className="mt-1 text-13 text-ink-2">
        Cubre {periodos} {unidad} desde el {fechaLegible(suscripcion.proxima_fecha_cobro)}, la fecha que tocaba cobrar.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pg-periodos">{anual ? "Años" : "Meses"}</label>
          <select id="pg-periodos" className={input} value={periodos} onChange={(e) => cambiarPeriodos(Number(e.target.value))}>
            {Array.from({ length: anual ? 3 : 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="pg-monto">Monto (MXN)</label>
          <input id="pg-monto" className={`${input} tabular-nums`} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div>
          <label className={label} htmlFor="pg-metodo">Cómo pagó</label>
          <select id="pg-metodo" className={input} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoCobro)}>
            {METODOS.map((m) => <option key={m} value={m}>{ETIQUETA_METODO_COBRO[m]}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="pg-fecha">Fecha del pago</label>
          <input id="pg-fecha" type="date" className={input} value={fecha} max={hoyMx()} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <label className={`${label} mt-3`} htmlFor="pg-ref">Referencia (opcional)</label>
      <input id="pg-ref" className={input} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} placeholder="Clave de rastreo SPEI, folio del depósito…" />
      <label className={`${label} mt-3`} htmlFor="pg-notas">Notas (opcional)</label>
      <input id="pg-notas" className={input} value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      {Number(monto) > 0 && Math.abs(Number(monto) - precioPeriodo * periodos) >= 0.01 && (
        <Aviso tono="info" className="mt-3">
          El precio acordado es {fmtMxn(precioPeriodo * periodos)}. Se registra lo que escribiste; la fecha de cobro avanza igual.
        </Aviso>
      )}
      {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
      <div className="mt-5 flex gap-2">
        <button onClick={onCerrar} disabled={ocupado} className="btn h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 hover:bg-hover">Volver</button>
        <button onClick={() => void guardar()} disabled={ocupado || !(Number(monto) > 0)} className="btn h-11 flex-1 rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {ocupado ? "Registrando…" : "Registrar pago"}
        </button>
      </div>
    </Modal>
  );
}
