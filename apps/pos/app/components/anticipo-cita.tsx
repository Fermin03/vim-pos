"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { etiquetaMetodoPago } from "@vim/db/metodos-pago";
import {
  METODOS_ANTICIPO, TEXTO_ANTICIPO, anticipoSugerido, devolverAnticipo, pideAutorizacionAnticipo, registrarAnticipo, retenerAnticipo,
  sumaAnticipos, type Anticipo, type DecisionAnticipo, type MetodoAnticipo,
} from "../lib/anticipos";
import { nuevoClientId } from "../lib/carrito";
import { redondearCentavos } from "../lib/dinero";
import { obtenerImpresora } from "../lib/print/adapter";
import { fmtMxn } from "../lib/turno";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const MARCO = "w-[min(480px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]";
const opcion = (activa: boolean) => [
  "min-h-[44px] rounded-lg border px-3 text-14 font-semibold transition-[transform,border-color,background-color] duration-150 ease-vim active:scale-[.97]",
  activa ? "border-ink bg-sel text-ink shadow-[inset_0_0_0_1.5px_#16161A]" : "border-line-strong text-ink-2 hover:border-ink",
].join(" ");

// El efectivo entra o sale del cajón: se abre como al cobrar o abonar (sin el PIN de «Abrir cajón»).
const abrirCajon = () => { obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().catch(() => {}); };

/** «Cobrar anticipo»: el monto sugerido (editable) y cómo paga. `textoSalir` = «Ahora no» al ofrecerlo tras agendar. */
export function ModalCobrarAnticipo({ token, citaId, clienta, cajaId, turnoId, textoSalir = "Volver", onCobrado, onCerrar }: {
  token: string;
  citaId: string;
  clienta: string;
  cajaId: string;
  turnoId: string;
  textoSalir?: string;
  onCobrado: () => void;
  onCerrar: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoAnticipo>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // La llave nace al abrir y se reusa en los reintentos: la base no lo registra dos veces.
  const llave = useRef(nuevoClientId());

  useEffect(() => {
    anticipoSugerido(token, citaId).then((s) => { if (s > 0) setMonto((m) => m || String(s)); }).catch(() => {});
  }, [token, citaId]);

  const valor = redondearCentavos(Number(monto) || 0);

  async function cobrar() {
    if (!(valor > 0) || ocupado) return;
    setError(null);
    setOcupado(true);
    try {
      await registrarAnticipo(token, { citaId, monto: valor, metodo, cajaId, turnoId, clientId: llave.current });
      if (metodo === "EFECTIVO") abrirCajon();
      onCobrado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar el anticipo");
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={() => { if (!ocupado) onCerrar(); }} title={TEXTO_ANTICIPO.cobrar} hideTitle className={MARCO}>
      <h2 className="font-display text-20 font-semibold tracking-tight">{TEXTO_ANTICIPO.cobrar}</h2>
      <p className="mt-0.5 text-14 text-ink-3">{clienta}</p>

      <label className="mt-5 block text-13 font-semibold text-ink-2" htmlFor="monto-anticipo">Monto</label>
      <input
        id="monto-anticipo"
        inputMode="decimal"
        autoFocus
        value={monto}
        onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void cobrar(); } }}
        placeholder="$0.00"
        className="mt-1.5 h-12 w-full rounded-lg border border-line-strong px-3 text-right font-display text-20 font-bold tabular-nums outline-none focus:border-ink"
      />

      <div className="mt-5 text-13 font-semibold text-ink-2">Cómo paga</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {METODOS_ANTICIPO.map((m) => (
          <button key={m} type="button" onClick={() => setMetodo(m)} aria-pressed={metodo === m} className={opcion(metodo === m)}>
            {etiquetaMetodoPago(m)}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-14 font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" className="h-12 flex-1" onClick={onCerrar} disabled={ocupado}>{textoSalir}</Button>
        <Button className="h-12 flex-1" onClick={() => void cobrar()} disabled={!(valor > 0) || ocupado}>
          {ocupado ? "Cobrando…" : valor > 0 ? `Cobrar ${fmtMxn(valor)}` : "Cobrar"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * «¿Qué hacemos con el anticipo de $X?»: Devolver o Retener los anticipos vigentes de una cita ya
 * cancelada o que no llegó. `sugerida` sale de `decisionSugerida`; null = el cajero elige sin pista.
 * Devolver con tarjeta o transferencia pide la referencia; en efectivo, sin permiso, el PIN.
 */
export function DialogoAnticipo({ token, vigentes, sugerida, elegida, cajaId, turnoId, ejecutaNombre, onHecho, onCerrar }: {
  token: string;
  vigentes: Anticipo[];
  sugerida: DecisionAnticipo | null;
  /** Ya elegida (botones del aviso «pendiente»); si no, arranca en la sugerida. */
  elegida?: DecisionAnticipo;
  cajaId: string;
  turnoId: string;
  ejecutaNombre: string;
  onHecho: () => void;
  onCerrar: () => void;
}) {
  const [eleccion, setEleccion] = useState<DecisionAnticipo | null>(elegida ?? sugerida);
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pidePin, setPidePin] = useState<Anticipo | null>(null);

  const total = sumaAnticipos(vigentes);
  const pideReferencia = eleccion === "DEVOLVER" && vigentes.some((a) => a.metodo !== "EFECTIVO");
  const listo = eleccion != null && (!pideReferencia || referencia.trim() !== "");

  /** Resuelve cada anticipo; la base ignora el que ya quedó resuelto, así que reintentar es seguro. */
  async function aplicar(pin?: { anticipoId: string; autorizacionPinId: string }) {
    if (!eleccion) return;
    setError(null);
    setOcupado(true);
    try {
      for (const a of vigentes) {
        if (eleccion === "RETENER") { await retenerAnticipo(token, a.id, turnoId); continue; }
        try {
          await devolverAnticipo(token, {
            anticipoId: a.id, cajaId, turnoId,
            referencia: a.metodo === "EFECTIVO" ? null : referencia.trim(),
            autorizacionPinId: pin?.anticipoId === a.id ? pin.autorizacionPinId : null,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (a.metodo === "EFECTIVO" && pideAutorizacionAnticipo(msg)) { setPidePin(a); return; }
          throw e;
        }
      }
      if (eleccion === "DEVOLVER" && vigentes.some((a) => a.metodo === "EFECTIVO")) abrirCajon();
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  }

  const tarjeta = (d: DecisionAnticipo, detalle: string) => (
    <button type="button" onClick={() => setEleccion(d)} aria-pressed={eleccion === d}
      className={`${opcion(eleccion === d)} flex flex-col items-start gap-0.5 px-4 py-3 text-left`}>
      <span className="flex w-full items-center gap-2 text-15 text-ink">
        {d === "DEVOLVER" ? TEXTO_ANTICIPO.devolver : TEXTO_ANTICIPO.retener}
        {sugerida === d && <span className="ml-auto rounded-full bg-sel px-2 py-0.5 text-12 font-semibold text-ink-2">Sugerido</span>}
      </span>
      <span className="text-13 font-normal text-ink-3">{detalle}</span>
    </button>
  );

  return (
    <>
      <Modal open onClose={() => { if (!ocupado) onCerrar(); }} title={TEXTO_ANTICIPO.pregunta(fmtMxn(total))} hideTitle className={MARCO}>
        <h2 className="font-display text-20 font-semibold leading-tight tracking-tight">{TEXTO_ANTICIPO.pregunta(fmtMxn(total))}</h2>
        <p className="mt-1 text-13 text-ink-3">{[...new Set(vigentes.map((a) => etiquetaMetodoPago(a.metodo)))].join(" · ")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {tarjeta("DEVOLVER", "Se le regresa a la clienta")}
          {tarjeta("RETENER", "Queda como no reembolsable")}
        </div>
        {pideReferencia && (
          <label className="mt-4 flex flex-col gap-1">
            <span className="text-13 font-medium text-ink-2">Referencia de la devolución</span>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Folio de la terminal o del banco"
              className="h-12 w-full rounded border border-line-strong px-3 text-15 outline-none focus:border-ink" />
          </label>
        )}
        {error && <p className="mt-3 text-14 font-medium text-danger" role="alert">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="h-12 flex-1" onClick={onCerrar} disabled={ocupado}>Decidir después</Button>
          <Button className="h-12 flex-1" onClick={() => void aplicar()} disabled={!listo || ocupado}>
            {ocupado ? "Aplicando…" : eleccion === "RETENER" ? `${TEXTO_ANTICIPO.retener} ${fmtMxn(total)}` : `${TEXTO_ANTICIPO.devolver} ${fmtMxn(total)}`}
          </Button>
        </div>
      </Modal>
      {pidePin && (
        <ModalAutorizacionPin
          token={token}
          capa="z-[70]"
          payload={{
            accion: "devolver_anticipo", permisoCodigo: "venta.devolucion", entidadTipo: "anticipo_cita", entidadId: pidePin.id,
            monto: pidePin.monto, motivo: "Devolver anticipo en efectivo", cajaId, turnoId,
          }}
          descripcion={`Devolver ${fmtMxn(pidePin.monto)} de anticipo en efectivo`}
          ejecutaNombre={ejecutaNombre}
          onAutorizado={(a) => { const id = pidePin.id; setPidePin(null); void aplicar({ anticipoId: id, autorizacionPinId: a.autorizacionPinId }); }}
          onCancelar={() => setPidePin(null)}
        />
      )}
    </>
  );
}
