"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icono, Modal, Cargando } from "@vim/ui/styles";
import { etiquetaMetodoPago } from "@vim/db/metodos-pago";
import { fmtMxn } from "../lib/turno";
import { fechaCorta } from "../lib/lealtad-reglas";
import { nuevoClientId } from "../lib/carrito";
import { redondearCentavos } from "../lib/dinero";
import { useEscape } from "../lib/use-escape";
import { obtenerImpresora } from "../lib/print/adapter";
import {
  avisoAbono,
  filtrarDeudores,
  leerVentasConSaldo,
  listarDeudores,
  registrarAbono,
  type Deudor,
  type MetodoAbono,
  type VentaConSaldo,
} from "../lib/credito";

const METODOS_ABONO: MetodoAbono[] = ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"];

/**
 * Créditos de la tienda (retail 2, entrega 2): quién debe y registrar abonos. Se abre desde «Más». Se abona a las ventas que `registrar_abono` ve en
 * esta base (en la caja instalada, las suyas): lo que se debe en otra caja se dice aparte.
 */
export function SeccionCreditos({ token, cajaId, turnoId, onVolver }: {
  token: string;
  cajaId: string;
  turnoId: string;
  onVolver: () => void;
}) {
  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [ventas, setVentas] = useState<VentaConSaldo[] | null>(null);
  const [abonando, setAbonando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setError(null);
    listarDeudores(token)
      .then(setDeudores)
      .catch((e) => { setDeudores([]); setError(e instanceof Error ? e.message : "No se pudo leer quién debe"); });
  }, [token]);
  useEffect(cargar, [cargar]);

  const cliente = deudores?.find((d) => d.clienteId === elegido) ?? null;
  useEffect(() => {
    if (!cliente) { setVentas(null); return; }
    let vivo = true;
    setVentas(null);
    leerVentasConSaldo(token, cliente.clienteId, cliente.plazoDias)
      .then((v) => { if (vivo) setVentas(v); })
      .catch(() => { if (vivo) setVentas([]); });
    return () => { vivo = false; };
    // Se relee al cambiar de cliente o tras un abono (la deuda cambia).
  }, [token, cliente?.clienteId, cliente?.deuda, cliente?.plazoDias]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape: del cliente a la lista, de la lista al menú. Con el abono abierto lo atiende su diálogo.
  useEscape(abonando ? null : elegido ? () => setElegido(null) : onVolver);

  const lista = useMemo(() => filtrarDeudores(deudores ?? [], texto), [deudores, texto]);
  const deudaAqui = cliente ? redondearCentavos(cliente.deuda - cliente.deudaOtrasCajas) : 0;

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
        <h1 className="font-display text-20 font-semibold tracking-tight">Créditos</h1>
      </div>

      {aviso && (
        <p className="flex flex-shrink-0 items-center justify-between gap-3 bg-success-soft px-4 py-2.5 text-14 font-semibold text-success" role="status">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="flex h-11 w-11 items-center justify-center rounded text-success hover:bg-success/10">
            <Icono nombre="cerrar" className="h-4 w-4" />
          </button>
        </p>
      )}
      {error && <p className="flex-shrink-0 px-4 py-2.5 text-14 font-medium text-danger" role="alert">{error}</p>}

      <div className="flex min-h-0 flex-1">
        {/* Quién debe */}
        <div className="flex w-[380px] flex-shrink-0 flex-col border-r border-line">
          <div className="border-b border-line p-3">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              aria-label="Buscar por nombre o teléfono"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-line-strong bg-surface px-3 text-16 text-ink outline-none placeholder:text-ink-3 focus:border-ink"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {deudores === null ? (
              <Cargando />
            ) : lista.length === 0 ? (
              <p className="p-4 text-14 text-ink-3">{texto ? "Nadie con ese nombre o teléfono debe." : "Nadie debe nada."}</p>
            ) : (
              lista.map((d) => (
                <button
                  key={d.clienteId}
                  type="button"
                  onClick={() => setElegido(d.clienteId)}
                  className={[
                    "flex min-h-[64px] w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors",
                    d.clienteId === elegido ? "bg-sel" : "hover:bg-hover",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-15 font-semibold text-ink">{d.nombre}</span>
                    {d.telefono && <span className="block text-13 tabular-nums text-ink-3">{d.telefono}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-display text-16 font-semibold tabular-nums text-ink">{fmtMxn(d.deuda)}</span>
                    {d.tieneVencido && <span className="rounded bg-danger/10 px-1.5 py-px text-11 font-bold uppercase tracking-wide text-danger">Vencido</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sus ventas y el abono */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {!cliente ? (
            <p className="text-15 text-ink-3">Elige a un cliente para ver sus ventas y registrar un abono.</p>
          ) : (
            <div className="mx-auto flex max-w-[640px] flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-24 font-semibold tracking-tight">{cliente.nombre}</h2>
                  <p className="mt-0.5 text-14 text-ink-3">
                    Límite {fmtMxn(cliente.limite)} · Disponible {fmtMxn(cliente.disponible)} · Plazo {cliente.plazoDias} días
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-12 font-bold uppercase tracking-widest text-ink-3">Debe</div>
                  <div className={["font-display text-32 font-bold tabular-nums", cliente.tieneVencido ? "text-danger" : "text-ink"].join(" ")}>{fmtMxn(cliente.deuda)}</div>
                </div>
              </div>

              {cliente.deudaOtrasCajas > 0 && (
                <p className="rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-14 font-medium text-warning">
                  Además debe {fmtMxn(cliente.deudaOtrasCajas)} de otras cajas: se abona allá o en el panel.
                </p>
              )}

              <div className="overflow-hidden rounded-lg border border-line">
                <div className="border-b border-line bg-sel px-4 py-2.5 text-12 font-bold uppercase tracking-widest text-ink-3">Ventas con saldo que se abonan aquí</div>
                {ventas === null ? (
                  <Cargando en="linea" className="px-4 py-3" />
                ) : ventas.length === 0 ? (
                  <p className="px-4 py-3 text-14 text-ink-3">No hay ventas con saldo que se abonen aquí.</p>
                ) : (
                  ventas.map((v) => (
                    <div key={v.ticketId} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-15 font-semibold text-ink">{v.folio ?? "Sin folio"}</span>
                        <span className={["block text-13", v.vencida ? "font-semibold text-danger" : "text-ink-3"].join(" ")}>
                          {v.vencida ? "Vencida" : "Paga"} el {fechaCorta(v.fechaLimite)}
                        </span>
                      </span>
                      <span className="font-display text-16 font-semibold tabular-nums text-ink">{fmtMxn(v.saldo)}</span>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setAbonando(true)}
                disabled={deudaAqui <= 0}
                className="h-14 w-full rounded-lg bg-accent font-display text-18 font-bold text-white shadow-sm transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none"
              >
                Registrar abono
              </button>
            </div>
          )}
        </div>
      </div>

      {abonando && cliente && (
        <ModalAbono
          key={cliente.clienteId}
          token={token}
          cajaId={cajaId}
          turnoId={turnoId}
          cliente={cliente}
          maximo={deudaAqui}
          onCerrar={() => setAbonando(false)}
          onAbonado={(texto) => { setAbonando(false); setAviso(texto); cargar(); }}
        />
      )}
    </div>
  );
}

function ModalAbono({ token, cajaId, turnoId, cliente, maximo, onCerrar, onAbonado }: {
  token: string;
  cajaId: string;
  turnoId: string;
  cliente: Deudor;
  /** Lo que se puede abonar aquí: lo que debe en esta caja. */
  maximo: number;
  onCerrar: () => void;
  onAbonado: (aviso: string) => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoAbono>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // La llave del abono nace al abrir y se reusa en los reintentos: la base no lo registra dos veces.
  const llave = useRef(nuevoClientId());

  const valor = redondearCentavos(Number(monto) || 0);
  const valido = valor > 0 && valor <= maximo;

  async function registrar() {
    if (!valido || procesando) return;
    setError(null);
    setProcesando(true);
    try {
      const r = await registrarAbono(token, { clienteId: cliente.clienteId, monto: valor, metodo, cajaId, turnoId, clientId: llave.current });
      // El efectivo del abono va al cajón: se abre como al cobrar (sin el PIN de «Abrir cajón»).
      if (metodo === "EFECTIVO") obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().catch(() => {});
      onAbonado(avisoAbono(r.abonado, r.deudaRestante, cliente.deudaOtrasCajas));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el abono");
      setProcesando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Registrar abono" hideTitle className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <h2 className="font-display text-20 font-semibold tracking-tight">Registrar abono</h2>
      <p className="mt-0.5 text-14 text-ink-3">{cliente.nombre} · debe aquí {fmtMxn(maximo)}</p>

      <label className="mt-5 block text-13 font-semibold text-ink-2" htmlFor="monto-abono">Monto</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="monto-abono"
          inputMode="decimal"
          autoFocus
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void registrar(); } }}
          placeholder="$0.00"
          className="h-12 min-w-0 flex-1 rounded-lg border border-line-strong px-3 text-right font-display text-20 font-bold tabular-nums outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={() => setMonto(String(maximo))}
          className="h-12 flex-shrink-0 rounded-lg border border-line-strong px-4 text-14 font-semibold text-ink-2 transition-[transform,border-color] duration-150 ease-vim hover:border-ink hover:text-ink active:scale-[.97]"
        >
          Todo
        </button>
      </div>
      {valor > maximo && <p className="mt-1.5 text-13 font-medium text-danger">No puede pasar de {fmtMxn(maximo)}.</p>}

      <div className="mt-5 text-13 font-semibold text-ink-2">Cómo paga</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {METODOS_ABONO.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetodo(m)}
            aria-pressed={metodo === m}
            className={[
              "min-h-[44px] rounded-lg border px-3 text-14 font-semibold transition-[transform,border-color,background-color] duration-150 ease-vim active:scale-[.97]",
              metodo === m ? "border-ink bg-sel text-ink shadow-[inset_0_0_0_1.5px_#16161A]" : "border-line-strong text-ink-2 hover:border-ink",
            ].join(" ")}
          >
            {etiquetaMetodoPago(m)}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCerrar} disabled={procesando} className="h-12 rounded-lg border border-line-strong px-5 text-15 font-semibold text-ink-2 hover:border-ink hover:text-ink disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void registrar()}
          disabled={!valido || procesando}
          className="h-12 rounded-lg bg-accent px-6 text-15 font-bold text-white shadow-sm transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none"
        >
          {procesando ? "Registrando…" : valido ? `Abonar ${fmtMxn(valor)}` : "Abonar"}
        </button>
      </div>
    </Modal>
  );
}
