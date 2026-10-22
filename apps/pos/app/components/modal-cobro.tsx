"use client";
// Cobro a pantalla completa (spec docs/superpowers/specs/2026-10-21-cobro-pantalla-completa-design.md):
// cada paso ocupa toda la caja, del mismo tamaño, con el botón de regresar siempre arriba a la
// izquierda. El orden de los pasos (propina después del método, a dónde lleva regresar) vive en
// `lib/cobro-flujo.ts`; el dinero, en `lib/cobro.ts` y `lib/cobro-pagos.ts`, sin cambios.
import { useEffect, useMemo, useRef, useState } from "react";
import { capaVisible } from "../lib/escape";
import { useEscape } from "../lib/use-escape";
import { Icono } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import {
  aplicarPago,
  establecerPropina,
  leerSugerenciasPropina,
  leerTotales,
  type MetodoPago,
  type SugerenciasPropina,
  type TotalesTicket,
} from "../lib/cobro";
import { nuevoClientId } from "../lib/carrito";
import { aplicarPagosEnOrden, pagoEntroPeseAlError, ventaQuedoPagada, type PagoPorAplicar } from "../lib/cobro-pagos";
import { pagoDeCobro, pedirCobro, propinaDeCobro, terminalDeCaja, type CobroTerminal, type TerminalCaja } from "../lib/terminal";
import { debePreguntarPropina, montosSugeridosEfectivo, vistaAlRegresar, type DestinoMetodo, type VistaCobro } from "../lib/cobro-flujo";
import { VistaTerminal } from "./vista-terminal";
import { aBuffer, aMonto, BotonPrincipal, BotonSecundario, FilaOpcion, Numpad, PantallaCobro } from "./cobro/pantalla-cobro";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import {
  leerCuentaCredito,
  opcionesCredito,
  pagarACredito,
  pagarConSaldoFavor,
  pideAutorizacionCredito,
  type CreditoCliente,
  type CuentaCredito,
} from "../lib/credito";
import { cobroEsperaAnticipo, leerAnticipoVenta, pagarConAnticipo, resumenAnticipoCobro, TEXTO_ANTICIPO, type AnticipoVenta } from "../lib/anticipos";

// ─── Nombres de los métodos ──────────────────────────────────────────────────

const NOMBRE: Partial<Record<MetodoPago, string>> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Débito",
  TARJETA_CREDITO: "Crédito",
  TRANSFERENCIA: "Transferencia",
  CREDITO: "A crédito",
  SALDO_FAVOR: "Saldo a favor",
};

const nombreMetodo = (m: MetodoPago) => NOMBRE[m] ?? m;

/** «A crédito» y «Saldo a favor» en el selector (módulo de crédito); no se combinan en el pago dividido. */
type Extra = { valor: MetodoPago; etiqueta: string; sub: string };

/** Lo que va al centro de la cabecera: «Efectivo · Ticket #A-0142 · Mesa 4». */
function cabecera(partes: (string | null | undefined)[]) {
  return partes.filter(Boolean).join(" · ");
}

const dinero = "font-display font-bold tabular-nums";

// ─── «¿Cómo paga?» (P-069) ───────────────────────────────────────────────────

function VistaSelector({
  totales,
  contexto,
  conTerminal,
  terminalSabida,
  terminalLista,
  extras,
  anticipo,
  onCobrarConAnticipo,
  procesando,
  error,
  onRevisarTerminal,
  onElegir,
  onMas,
  onCerrar,
}: {
  totales: TotalesTicket;
  contexto: string;
  /** La caja tiene terminal ligada: Débito y Crédito se vuelven un solo «Tarjeta» que cobra en ella. */
  conTerminal: boolean;
  /** Ya contestó la nube si el lector está listo (y si pregunta la propina). */
  terminalSabida: boolean;
  terminalLista: boolean;
  extras: Extra[];
  /** Lo que esta venta ya pagó con el anticipo de su cita (belleza): «Anticipo −$X» y «Por cobrar». */
  anticipo: number;
  /** El anticipo cubre todo: en vez de las formas de pago, un solo botón que lo confirma. */
  onCobrarConAnticipo?: () => void;
  procesando: boolean;
  error: string | null;
  /** Vuelve a preguntar por el lector; true si ya puede cobrar. */
  onRevisarTerminal: () => Promise<boolean>;
  onElegir: (d: DestinoMetodo) => void;
  /** «Más»: débito y crédito a mano (solo con terminal). */
  onMas: () => void;
  onCerrar: () => void;
}) {
  const [revisando, setRevisando] = useState(false);
  // Si la cajera ya salió del selector, la respuesta tardía no la regresa a la terminal: mandaría el
  // monto al lector a media venta.
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  async function tarjeta() {
    if (terminalSabida && terminalLista) { onElegir("terminal"); return; }
    if (revisando) return;
    setRevisando(true);
    const lista = await onRevisarTerminal().catch(() => false);
    if (!montado.current) return;
    setRevisando(false);
    // Sin lector listo, el registro a mano (sin internet, terminal descompuesta).
    if (lista) onElegir("terminal");
    else onMas();
  }
  const subTarjeta = revisando || !terminalSabida
    ? "Revisando la terminal…"
    : terminalLista ? "Débito o crédito · se cobra en la terminal" : "Terminal no disponible: enciéndela y abre Clip PinPad";

  return (
    <PantallaCobro
      regresar={{ icono: "cerrar", onClick: onCerrar, disabled: procesando }}
      contexto={contexto}
      derecha={!onCobrarConAnticipo && (
        <button
          type="button"
          onClick={() => onElegir("dividido")}
          className="min-h-[56px] px-2 text-16 font-semibold text-ink underline underline-offset-4"
        >
          Dividir pago
        </button>
      )}
      pie={onCobrarConAnticipo && (
        <BotonPrincipal onClick={() => { if (!procesando) onCobrarConAnticipo(); }} disabled={procesando}>
          {procesando ? "Aplicando…" : `Cobrar con anticipo ${fmtMxn(anticipo)}`}
        </BotonPrincipal>
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className={`${dinero} text-[96px] leading-none text-ink`}>{fmtMxn(totales.pendiente)}</div>
        {anticipo > 0 ? (
          <div className="mt-4 text-18 text-ink-3">
            Total <span className="tabular-nums">{fmtMxn(totales.total)}</span> · {TEXTO_ANTICIPO.lineaCobro}{" "}
            <span className="tabular-nums">−{fmtMxn(anticipo)}</span>
          </div>
        ) : (
          !onCobrarConAnticipo && <div className="mt-3 text-18 text-ink-3">Elige cómo paga el cliente</div>
        )}
        {error && <p className="mt-4 max-w-[640px] text-16 font-medium text-danger" role="alert">{error}</p>}
      </div>
      {!onCobrarConAnticipo && (
        <div className="px-6 pb-6">
          <FilaOpcion titulo="Efectivo" onClick={() => onElegir("EFECTIVO")} />
          {conTerminal ? (
            <FilaOpcion
              titulo="Tarjeta"
              sub={subTarjeta}
              aviso={terminalSabida && !terminalLista && !revisando}
              ocupado={revisando}
              onClick={() => void tarjeta()}
            />
          ) : (
            <>
              <FilaOpcion titulo="Débito" onClick={() => onElegir("TARJETA_DEBITO")} />
              <FilaOpcion titulo="Crédito" onClick={() => onElegir("TARJETA_CREDITO")} />
            </>
          )}
          <FilaOpcion titulo="Transferencia" onClick={() => onElegir("TRANSFERENCIA")} />
          {extras.map((x) => <FilaOpcion key={x.valor} titulo={x.etiqueta} sub={x.sub} onClick={() => onElegir(x.valor)} />)}
          {conTerminal && <FilaOpcion titulo="Más" sub="Débito o crédito a mano" onClick={onMas} />}
        </div>
      )}
    </PantallaCobro>
  );
}

// ─── «Más»: tarjeta cobrada en otra terminal ─────────────────────────────────

function VistaMas({ totales, contexto, onElegir, onRegresar }: {
  totales: TotalesTicket;
  contexto: string;
  onElegir: (m: MetodoPago) => void;
  onRegresar: () => void;
}) {
  return (
    <PantallaCobro regresar={{ icono: "atras", onClick: onRegresar }} contexto={contexto}>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className={`${dinero} text-[96px] leading-none text-ink`}>{fmtMxn(totales.pendiente)}</div>
        <div className="mt-3 text-18 text-ink-3">Otra forma de pago</div>
      </div>
      <div className="px-6 pb-6">
        <FilaOpcion titulo="Débito · a mano" sub="La cobraste en otra terminal" onClick={() => onElegir("TARJETA_DEBITO")} />
        <FilaOpcion titulo="Crédito · a mano" sub="La cobraste en otra terminal" onClick={() => onElegir("TARJETA_CREDITO")} />
      </div>
    </PantallaCobro>
  );
}

// ─── Propina (P-075): después de elegir el método ────────────────────────────

function VistaPropina({ totalBase, contexto, sugerencias, procesando, error, onConfirmar, onRegresar }: {
  totalBase: number;
  contexto: string;
  sugerencias: SugerenciasPropina;
  procesando: boolean;
  error: string | null;
  onConfirmar: (monto: number) => void;
  onRegresar: () => void;
}) {
  const [libre, setLibre] = useState(false);
  const [buffer, setBuffer] = useState("");
  const calcTip = (p: number) => Math.round(totalBase * p) / 100; // totalBase * p/100, a 2 decimales
  const confirmar = (m: number) => { if (!procesando) onConfirmar(m); };

  if (libre) {
    const tip = aMonto(buffer);
    return (
      <PantallaCobro
        regresar={{ icono: "atras", onClick: () => setLibre(false), disabled: procesando }}
        contexto={contexto}
        pie={
          <BotonPrincipal onClick={() => confirmar(tip)} disabled={procesando}>
            {procesando ? "Guardando…" : `Continuar · ${fmtMxn(Math.round((totalBase + tip) * 100) / 100)}`}
          </BotonPrincipal>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
          <div className="text-center">
            <div className="text-16 font-medium text-ink-3">Propina</div>
            <div className={`${dinero} text-[72px] leading-none ${tip > 0 ? "text-ink" : "text-ink-3"}`}>{fmtMxn(tip)}</div>
          </div>
          <div className="w-[360px]">
            <Numpad buffer={buffer} onChange={setBuffer} onEnter={() => confirmar(tip)} compact />
          </div>
          {error && <p className="text-16 font-medium text-danger" role="alert">{error}</p>}
        </div>
      </PantallaCobro>
    );
  }

  return (
    <PantallaCobro
      regresar={{ icono: "atras", onClick: onRegresar, disabled: procesando }}
      contexto={contexto}
      pie={(sugerencias.libre || sugerencias.sin) && (
        <div className={`grid gap-3 ${sugerencias.libre && sugerencias.sin ? "grid-cols-2" : "grid-cols-1"}`}>
          {sugerencias.libre && <BotonSecundario onClick={() => { setBuffer(""); setLibre(true); }} disabled={procesando}>Otro monto</BotonSecundario>}
          {sugerencias.sin && <BotonSecundario onClick={() => confirmar(0)} disabled={procesando}>Sin propina</BotonSecundario>}
        </div>
      )}
    >
      <div className="flex flex-1 flex-col justify-center px-8">
        <div className="mb-10 text-center">
          <h1 className="font-display text-40 font-bold text-ink">¿Agregar propina?</h1>
          <p className="mt-2 text-18 text-ink-3">Sobre <span className={`${dinero} text-ink`}>{fmtMxn(totalBase)}</span></p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {sugerencias.porcentajes.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => confirmar(calcTip(p))}
              disabled={procesando}
              className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.98] disabled:opacity-50"
            >
              <span className="font-display text-32 font-bold text-ink">{p}%</span>
              <span className="font-display text-18 font-semibold tabular-nums text-ink-2">{fmtMxn(calcTip(p))}</span>
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-center text-16 font-medium text-danger" role="alert">{error}</p>}
      </div>
    </PantallaCobro>
  );
}

// ─── Efectivo (P-070) ────────────────────────────────────────────────────────

function VistaEfectivo({ totales, conPropina, procesando, error, onAplicar, onRegresar }: {
  totales: TotalesTicket;
  conPropina: boolean;
  procesando: boolean;
  error: string | null;
  onAplicar: (monto: number, recibido: number) => void;
  onRegresar: () => void;
}) {
  const pendiente = totales.pendiente;
  const [recibBuffer, setRecibBuffer] = useState("");
  const recibido = aMonto(recibBuffer);
  const cambio = Math.round((recibido - pendiente) * 100) / 100;
  const puedeCobrar = recibido >= pendiente && pendiente > 0;
  const falta = recibido > 0 && cambio < 0;

  function cobrar() {
    if (!puedeCobrar || procesando) return;
    onAplicar(pendiente, recibido);
  }

  // El botón dice lo que va a pasar, con el número que la cajera tiene que contar.
  const etiqueta = !puedeCobrar
    ? `Cobrar ${fmtMxn(pendiente)}`
    : cambio > 0 ? `Cobrar y dar ${fmtMxn(cambio)} de cambio` : `Cobrar ${fmtMxn(pendiente)} exacto`;

  const chip = "h-14 rounded-lg border border-line-strong px-5 font-display text-18 font-semibold tabular-nums text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]";

  return (
    <PantallaCobro
      regresar={{ icono: "atras", onClick: onRegresar, disabled: procesando }}
      contexto={<>{conPropina ? "Total con propina" : "Total"} <span className={`${dinero} text-18 text-ink`}>{fmtMxn(pendiente)}</span></>}
      pie={<BotonPrincipal onClick={cobrar} disabled={!puedeCobrar || procesando}><span className="truncate">{etiqueta}</span></BotonPrincipal>}
    >
      <div className="grid flex-1 grid-cols-[1fr_360px] gap-8 px-8 py-6">
        <div className="flex flex-col justify-center gap-7">
          <div>
            <div className="text-15 font-medium text-ink-3">Recibido</div>
            <div className={`${dinero} text-[80px] leading-tight ${recibido > 0 ? "text-ink" : "text-ink-3"}`}>{fmtMxn(recibido)}</div>
          </div>
          <div>
            <div className={`text-15 font-medium ${falta ? "text-warning" : "text-ink-3"}`}>{falta ? "Falta" : "Cambio"}</div>
            <div className={`${dinero} text-[36px] ${falta ? "text-warning" : recibido > 0 ? "text-success" : "text-ink-3"}`}>
              {fmtMxn(recibido > 0 ? Math.abs(cambio) : 0)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${chip} bg-sel`} onClick={() => setRecibBuffer(aBuffer(pendiente))}>Exacto</button>
            {montosSugeridosEfectivo(pendiente).map((m) => (
              <button key={m} type="button" className={`${chip} bg-surface`} onClick={() => setRecibBuffer(aBuffer(m))}>{fmtMxn(m)}</button>
            ))}
          </div>
          {error && <p className="text-16 font-medium text-danger" role="alert">{error}</p>}
        </div>
        <div className="flex flex-col justify-center">
          <Numpad buffer={recibBuffer} onChange={setRecibBuffer} onEnter={cobrar} grande />
        </div>
      </div>
    </PantallaCobro>
  );
}

// ─── Transferencia y tarjeta a mano: se registran por el total ───────────────

function VistaOtro({ totales, metodo, contexto, procesando, error, onAplicar, onRegresar }: {
  totales: TotalesTicket;
  metodo: MetodoPago;
  contexto: string;
  procesando: boolean;
  error: string | null;
  onAplicar: (monto: number) => void;
  onRegresar: () => void;
}) {
  const pendiente = totales.pendiente;
  const transferencia = metodo === "TRANSFERENCIA";
  return (
    <PantallaCobro
      regresar={{ icono: "atras", onClick: onRegresar, disabled: procesando }}
      contexto={contexto}
      pie={
        <BotonPrincipal onClick={() => { if (!procesando && pendiente > 0) onAplicar(pendiente); }} disabled={procesando || !(pendiente > 0)}>
          Registrar {transferencia ? "transferencia" : nombreMetodo(metodo).toLowerCase()} por {fmtMxn(pendiente)}
        </BotonPrincipal>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className={`${dinero} text-[88px] leading-none text-ink`}>{fmtMxn(pendiente)}</div>
        <div className="mt-4 text-18 text-ink-3">
          {transferencia ? "Revisa que la transferencia ya llegó antes de registrarla" : "Registra el pago que cobraste en otra terminal"}
        </div>
        {error && <p className="mt-4 text-16 font-medium text-danger" role="alert">{error}</p>}
      </div>
    </PantallaCobro>
  );
}

// ─── Pago dividido (P-074): una sola pantalla ────────────────────────────────

type OpcionDividida = { metodo: MetodoPago; terminal: boolean; etiqueta: string };

function VistaDividida({ totales, contexto, conTerminal, terminalLista, onRevisarTerminal, procesando, error, onAplicarPagos, onRegresar }: {
  totales: TotalesTicket;
  contexto: string;
  conTerminal: boolean;
  /** Sin lector listo no se ofrece cobrar en la terminal y se dice por qué. */
  terminalLista: boolean;
  onRevisarTerminal: () => Promise<boolean>;
  procesando: boolean;
  error: string | null;
  /** Aplica TODOS los pagos divididos de una (secuencial en el padre, no en paralelo) y devuelve
   *  los `clientId` que entraron, para quitarlos de la lista. */
  onAplicarPagos: (pagos: PagoPorAplicar[]) => Promise<string[]>;
  onRegresar: () => void;
}) {
  const [pagos, setPagos] = useState<PagoPorAplicar[]>([]);
  const pendiente = totales.pendiente;
  const pagado = Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100;
  const restante = Math.max(0, Math.round((pendiente - pagado) * 100) / 100);
  const cubierto = restante <= 0 && pagos.length > 0;
  const pct = Math.min(100, pendiente > 0 ? (pagado / pendiente) * 100 : 0);

  // Con terminal: «Tarjeta» (se cobra en ella) y, aparte, Débito y Crédito a mano.
  const opciones: OpcionDividida[] = conTerminal
    ? [
        { metodo: "EFECTIVO", terminal: false, etiqueta: "Efectivo" },
        { metodo: "TARJETA_CREDITO", terminal: true, etiqueta: "Tarjeta" },
        { metodo: "TRANSFERENCIA", terminal: false, etiqueta: "Transferencia" },
        { metodo: "TARJETA_DEBITO", terminal: false, etiqueta: "Débito · a mano" },
        { metodo: "TARJETA_CREDITO", terminal: false, etiqueta: "Crédito · a mano" },
      ]
    : (["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"] as const).map((m) => ({ metodo: m, terminal: false, etiqueta: nombreMetodo(m) }));
  const [sel, setSel] = useState<OpcionDividida>(opciones[0]!);
  const [buffer, setBuffer] = useState(aBuffer(pendiente));
  const monto = Math.min(aMonto(buffer), restante);
  const terminalNoLista = sel.terminal && !terminalLista;

  function elegir(o: OpcionDividida) {
    setSel(o);
    // Se vuelve a preguntar: si el lector se encendió, la opción queda lista al contestar.
    if (o.terminal && !terminalLista) void onRevisarTerminal().catch(() => false);
  }

  function agregar() {
    if (!(monto > 0) || terminalNoLista) return;
    // El id de idempotencia nace AQUÍ y no cambia entre reintentos (B2-2).
    setPagos((prev) => [...prev, { clientId: nuevoClientId(), metodo: sel.metodo, monto, ...(sel.terminal ? { terminal: true } : {}) }]);
    setBuffer(aBuffer(Math.max(0, Math.round((restante - monto) * 100) / 100)));
  }

  function quitar(p: PagoPorAplicar) {
    setPagos((prev) => prev.filter((x) => x.clientId !== p.clientId));
    setBuffer(aBuffer(Math.round((restante + p.monto) * 100) / 100));
  }

  function completar() {
    if (!cubierto || procesando) return;
    // El padre los aplica SECUENCIALMENTE. Los que entran se quitan de la lista: si uno falla, el
    // reintento manda solo los que faltan (B2-2).
    void onAplicarPagos(pagos).then((aplicados) => {
      if (aplicados.length > 0) setPagos((prev) => prev.filter((p) => !aplicados.includes(p.clientId)));
    });
  }

  return (
    <PantallaCobro
      regresar={{ icono: "atras", onClick: onRegresar, disabled: procesando }}
      contexto={contexto}
      pie={cubierto ? (
        <BotonPrincipal onClick={completar} disabled={procesando}>{procesando ? "Procesando…" : "Completar cobro"}</BotonPrincipal>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <BotonSecundario disabled>Completar cobro</BotonSecundario>
          <BotonPrincipal onClick={agregar} disabled={!(monto > 0) || terminalNoLista || procesando}>
            <span className="truncate">Agregar {fmtMxn(monto)} con {sel.etiqueta.toLowerCase()}</span>
          </BotonPrincipal>
        </div>
      )}
    >
      <div className="grid flex-1 grid-cols-[1fr_380px] gap-8 px-8 py-6">
        <div className="flex min-w-0 flex-col">
          <div className="text-15 font-medium text-ink-3">{cubierto ? "Cubierto" : "Falta por cobrar"}</div>
          <div className={`${dinero} text-[72px] leading-tight ${cubierto ? "text-success" : "text-ink"}`}>{fmtMxn(restante)}</div>
          <div className="mb-1.5 mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-15 text-ink-3">Pagado <span className="tabular-nums">{fmtMxn(pagado)}</span> de <span className="tabular-nums">{fmtMxn(pendiente)}</span></div>
          <div className="mt-7 text-15 font-medium text-ink-3">Pagos</div>
          {pagos.length === 0 ? (
            <p className="mt-2 text-16 text-ink-3">Aún no hay pagos.</p>
          ) : (
            <ul className="mt-2">
              {pagos.map((p) => (
                <li key={p.clientId} className="flex h-14 items-center justify-between gap-3 border-t border-line px-3 last:border-b">
                  <span className="truncate text-[17px] font-semibold text-ink">{p.terminal ? "Tarjeta · en la terminal" : nombreMetodo(p.metodo)}</span>
                  <span className="flex items-center gap-2">
                    <span className={`${dinero} text-18 text-ink`}>{fmtMxn(p.monto)}</span>
                    <button
                      type="button"
                      onClick={() => quitar(p)}
                      disabled={procesando}
                      aria-label="Quitar pago"
                      className="flex h-11 w-11 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-danger"
                    >
                      <Icono nombre="cerrar" className="h-5 w-5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-4 text-16 font-medium text-danger" role="alert">{error}</p>}
        </div>
        <div className={`flex flex-col ${cubierto ? "pointer-events-none opacity-40" : ""}`} aria-disabled={cubierto}>
          <div className="mb-2 text-15 font-medium text-ink-3">Siguiente pago</div>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {opciones.map((o) => {
              const on = o.metodo === sel.metodo && o.terminal === sel.terminal;
              return (
                <button
                  key={`${o.metodo}-${o.terminal}`}
                  type="button"
                  onClick={() => elegir(o)}
                  className={`min-h-[56px] rounded-lg border px-2 text-14 font-semibold leading-tight ${on ? "border-ink bg-sel text-ink ring-1 ring-inset ring-ink" : "border-line-strong bg-surface text-ink-2 hover:bg-hover"}`}
                >
                  {o.etiqueta}
                </button>
              );
            })}
          </div>
          {terminalNoLista && <p className="mb-2 text-14 text-warning" role="status">Terminal no disponible: enciéndela y abre Clip PinPad</p>}
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className={`${dinero} text-[36px] text-ink`}>{fmtMxn(monto)}</span>
            <button
              type="button"
              onClick={() => setBuffer(aBuffer(restante))}
              className="h-11 rounded-lg border border-line-strong px-3 text-14 font-semibold text-ink hover:bg-hover"
            >
              Todo lo que falta
            </button>
          </div>
          <Numpad buffer={buffer} onChange={setBuffer} onEnter={agregar} compact capturarTeclado={!cubierto} />
        </div>
      </div>
    </PantallaCobro>
  );
}

// ─── A crédito / saldo a favor (retail 2, entrega 2) ─────────────────────────

/** Cabecera y pie compartidos por las dos vistas de crédito: mismo molde que el resto del cobro. */
function MarcoCredito({ contexto, cifra, children, error, procesando, etiqueta, onConfirmar, onRegresar }: {
  contexto: string;
  cifra: number;
  children: React.ReactNode;
  error: string | null;
  procesando: boolean;
  etiqueta: string;
  onConfirmar: () => void;
  onRegresar: () => void;
}) {
  return (
    <PantallaCobro
      regresar={{ icono: "atras", onClick: onRegresar, disabled: procesando }}
      contexto={contexto}
      pie={<BotonPrincipal onClick={() => { if (!procesando) onConfirmar(); }} disabled={procesando}>{procesando ? "Aplicando…" : etiqueta}</BotonPrincipal>}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className={`${dinero} text-[88px] leading-none text-ink`}>{fmtMxn(cifra)}</div>
        <div className="mt-8 w-full max-w-[560px] overflow-hidden rounded-lg border border-line">{children}</div>
        {error && <p className="mt-4 text-16 font-medium text-danger" role="alert">{error}</p>}
      </div>
    </PantallaCobro>
  );
}

function Renglon({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5 last:border-b-0">
      <span className="text-16 text-ink-2">{l}</span>
      <span className={`${dinero} text-18 text-ink`}>{v}</span>
    </div>
  );
}

function VistaCredito({ total, credito, contexto, procesando, error, onConfirmar, onRegresar }: {
  total: number;
  credito: CreditoCliente;
  contexto: string;
  procesando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onRegresar: () => void;
}) {
  // La base decide; esto solo avisa antes de tocar el botón que va a pedir el PIN.
  const pasa = Math.round((total - credito.disponible) * 100) / 100;
  const aviso = credito.tieneVencido
    ? "Tiene pagos vencidos. Se pide el PIN de un supervisor."
    : pasa > 0
      ? `Pasa del límite por ${fmtMxn(pasa)}. Se pide el PIN de un supervisor.`
      : null;
  return (
    <MarcoCredito
      contexto={contexto}
      cifra={total}
      error={error}
      procesando={procesando}
      etiqueta={`Vender a crédito ${fmtMxn(total)}`}
      onConfirmar={onConfirmar}
      onRegresar={onRegresar}
    >
      <Renglon l="Ya debe" v={fmtMxn(credito.deuda)} />
      <Renglon l="Disponible" v={fmtMxn(credito.disponible)} />
      {aviso && <p className="border-b border-warning-line bg-warning-soft px-5 py-3 text-15 font-medium text-warning">{aviso}</p>}
      <p className="px-5 py-3 text-14 text-ink-3">Va la venta completa. Paga en {credito.plazoDias} días.</p>
    </MarcoCredito>
  );
}

function VistaSaldoFavor({ pendiente, monto, contexto, procesando, error, onConfirmar, onRegresar }: {
  pendiente: number;
  /** Lo que se usa: el saldo, hasta lo que falta. */
  monto: number;
  contexto: string;
  procesando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onRegresar: () => void;
}) {
  const resto = Math.round((pendiente - monto) * 100) / 100;
  return (
    <MarcoCredito
      contexto={contexto}
      cifra={monto}
      error={error}
      procesando={procesando}
      etiqueta={`Usar ${fmtMxn(monto)}`}
      onConfirmar={onConfirmar}
      onRegresar={onRegresar}
    >
      <Renglon l="Por cobrar" v={fmtMxn(pendiente)} />
      <Renglon l="Se usa del saldo a favor" v={fmtMxn(monto)} />
      {resto > 0 && <p className="px-5 py-3 text-14 text-ink-3">Los {fmtMxn(resto)} que faltan se cobran después con otra forma de pago.</p>}
    </MarcoCredito>
  );
}

// ─── Pantallas de espera ─────────────────────────────────────────────────────

/** Mientras se registra el pago. En efectivo con cambio, el cambio ya se ve para ir contando. */
function PantallaRegistrando({ cambio, recibido }: { cambio: number; recibido: number }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-busy="true">
      <div className="flex h-24 flex-shrink-0 flex-col items-center justify-end">
        {cambio > 0 && (
          <>
            <div className={`${dinero} text-28 text-ink`}>Cambio {fmtMxn(cambio)}</div>
            <div className="text-15 text-ink-3">de {fmtMxn(recibido)}</div>
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center" role="status">
        <span className="mb-6 h-14 w-14 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden />
        <div className="font-display text-32 font-bold text-ink">Registrando pago</div>
      </div>
    </div>
  );
}

function PantallaMensaje({ contexto, onCerrar, children, pie }: { contexto: string; onCerrar: () => void; children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <PantallaCobro regresar={{ icono: "cerrar", onClick: onCerrar }} contexto={contexto} pie={pie}>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">{children}</div>
    </PantallaCobro>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ModalCobro({
  token,
  sucursalId,
  cajaId,
  turnoId,
  ejecutaNombre,
  totalesIniciales,
  contexto: contextoCuenta,
  atajo = null,
  moduloCredito = false,
  conCitas = false,
  onPagado,
  onCerrar,
  onMontoACobrar,
}: {
  token: string;
  sucursalId: string;
  /** Para el cobro con terminal: de qué caja es y quién cobra (lo pide la autorización con PIN). */
  cajaId: string;
  turnoId: string;
  ejecutaNombre: string;
  totalesIniciales: TotalesTicket;
  /** La mesa o el nombre de la cuenta, para la cabecera. Sin él, solo «Ticket #folio». */
  contexto?: string;
  /**
   * Avisa el monto que la cajera tiene a la vista como pendiente de cobrar (con propina y pagos
   * parciales ya aplicados). La pantalla del cliente lo muestra para ver el mismo número que la
   * cajera: el snapshot `totalesIniciales` del padre no se entera de la propina ni de los pagos.
   */
  onMontoACobrar?: (monto: number) => void;
  /**
   * "Efectivo exacto" desde el ticket: cobra el pendiente en efectivo sin pasar por el selector ni
   * el teclado. Si la sucursal pide propina, la pregunta primero; si el cobro falla, cae en la
   * vista de efectivo normal con el error a la vista.
   */
  atajo?: "EFECTIVO_EXACTO" | null;
  /** Módulo de crédito encendido (`modulos.credito`): «A crédito» y «Saldo a favor» para el cliente de la cuenta. */
  moduloCredito?: boolean;
  /** Caja de belleza: si la venta es de una cita con anticipo vigente, se aplica primero (0222). */
  conCitas?: boolean;
  /** `aCredito`: no entró dinero; «Cobro completado» dice «A crédito» y no anuncia un total cobrado. */
  onPagado: (folio: string | null, cambio: number, total: number | null, aCredito?: boolean) => void;
  onCerrar: () => void;
}) {
  const [totales, setTotales] = useState<TotalesTicket>(totalesIniciales);
  const [vista, setVista] = useState<VistaCobro>("selector");
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Propina (P-075): se pregunta DESPUÉS de elegir el método. El "a cobrar" pasa a total + propina.
  // Una propina que ya venía en el ticket se respeta: entra al «a cobrar» y no se vuelve a preguntar.
  const propinaInicial = useRef(totalesIniciales.propina ?? 0);
  const [propina, setPropina] = useState(propinaInicial.current);
  const propinaRef = useRef(propina);
  propinaRef.current = propina;
  const [propinaPreguntada, setPropinaPreguntada] = useState(propinaInicial.current > 0);
  /** Se contestó la pantalla de propina en ESTE cobro: regresar desde el método vuelve a ella. */
  const [preguntoAqui, setPreguntoAqui] = useState(false);
  /** El método elegido; la propina lleva a él al confirmarse. */
  const [trasPropina, setTrasPropina] = useState<DestinoMetodo | null>(null);
  const [sug, setSug] = useState<SugerenciasPropina | null>(null);
  /** Lo que se está registrando en efectivo, para enseñar el cambio mientras tanto. */
  const [enCurso, setEnCurso] = useState<{ cambio: number; recibido: number }>({ cambio: 0, recibido: 0 });

  useEffect(() => {
    let activo = true;
    leerSugerenciasPropina(token, sucursalId)
      .then((s) => { if (activo) setSug(s); })
      .catch(() => { if (activo) setSug({ porcentajes: [10, 15, 20], capturar: false, libre: true, sin: true }); });
    return () => { activo = false; };
  }, [token, sucursalId]);

  // ── Anticipo de la cita (belleza, 0222) ─────────────────────────────────────────────────────
  // Se lee al abrir y se enseña desde el principio («Anticipo −$X», «Por cobrar»), pero se APLICA
  // solo al confirmar el primer pago (asegurarAnticipo), justo antes de cobrar el resto. Salir del
  // cobro no deja nada aplicado. Fuera de belleza no se lee nada.
  const [anticipoVenta, setAnticipoVenta] = useState<AnticipoVenta | null>(null);
  const [anticipoLeido, setAnticipoLeido] = useState(false);
  const anticipoListo = !cobroEsperaAnticipo(conCitas, anticipoLeido);
  /** No se pudo leer: falla cerrado (nunca se cobra el total completo si pudo haber anticipo). */
  const [errorAnticipo, setErrorAnticipo] = useState<string | null>(null);
  const [intentoAnticipo, setIntentoAnticipo] = useState(0);
  useEffect(() => {
    if (!conCitas) return;
    let activo = true;
    setErrorAnticipo(null);
    leerAnticipoVenta(token, totalesIniciales.ticketId)
      .then((a) => { if (activo) { setAnticipoVenta(a); setAnticipoLeido(true); } })
      .catch((e) => { if (activo) setErrorAnticipo(e instanceof Error ? e.message : "error"); });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conCitas, token, intentoAnticipo]);

  // Total autoritativo (BD) + propina capturada en cliente; la propina ya quedó persistida. El
  // pendiente ya descuenta el anticipo por aplicar: todas las vistas cobran solo el resto.
  const anticipoCobro = resumenAnticipoCobro(anticipoVenta, Math.round((totales.pendiente + propina) * 100) / 100);
  const totalesEf: TotalesTicket = {
    ...totales,
    total: Math.round((totales.total + propina) * 100) / 100,
    pendiente: anticipoCobro.porCobrar,
  };

  const pagoAnticipoId = useRef<string | null>(null);
  /**
   * Aplica el anticipo por aplicar (si hay) antes de cobrar el resto; devuelve los totales releídos
   * (null si no había nada que aplicar). El pendiente a la vista no cambia: ya lo descontaba.
   */
  async function asegurarAnticipo(): Promise<TotalesTicket | null> {
    if (!anticipoVenta || anticipoCobro.porAplicar <= 0) return null;
    const aplicado = await pagarConAnticipo(token, totales.ticketId, anticipoVenta.citaId, (pagoAnticipoId.current ??= nuevoClientId()));
    const t = await leerTotales(token, totales.ticketId);
    pagoAnticipoId.current = null;   // hasta aquí: si la relectura falla, el reintento reusa la llave

    // Juntos (mismo render): el pendiente a la vista no brinca.
    setTotales(t);
    setAnticipoVenta((a) => a && {
      ...a,
      vigente: Math.round((a.vigente - aplicado) * 100) / 100,
      aplicado: Math.round((a.aplicado + aplicado) * 100) / 100,
    });
    return t;
  }

  /** El anticipo cubre todo: se confirma y la venta queda pagada solo con ANTICIPO. */
  async function cobrarSoloConAnticipo() {
    setError(null);
    setProcesando(true);
    try {
      const t = await asegurarAnticipo();
      if (ventaQuedoPagada(t)) onPagado(t.folio, 0, t.total);
      else setError("El anticipo no cubrió la venta; cobra el resto con otra forma de pago.");
    } catch (e) {
      await trasFalloDeCobro(e);
    } finally {
      setProcesando(false);
    }
  }

  useEffect(() => {
    onMontoACobrar?.(totalesEf.pendiente);
  }, [totalesEf.pendiente, onMontoACobrar]);

  /**
   * Ya entró dinero con esta propina: queda firme. Regresar ya no la deshace y no se vuelve a
   * preguntar (`propinaPreguntada` ya es true).
   */
  function propinaFirme() {
    propinaInicial.current = propinaRef.current;
    setPreguntoAqui(false);
  }

  /** Quedó saldo por cobrar tras un pago: de vuelta a «¿Cómo paga?» con la propina firme. */
  function quedaPendiente() {
    propinaFirme();
    setVista("selector");
  }

  async function confirmarPropina(monto: number) {
    setError(null);
    setProcesando(true);
    try {
      await establecerPropina(token, totales.ticketId, monto);
      setPropina(monto);
      setPropinaPreguntada(true);
      setPreguntoAqui(true);
      if (trasPropina) irAMetodo(trasPropina);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fijar la propina");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * `client_id_local` del pago suelto en curso (B2-2). Se crea al primer intento y se REUSA en los
   * reintentos: si la RPC sí se aplicó pero la respuesta se perdió, el reintento no cobra dos
   * veces. Se suelta solo cuando el pago entró (éxito, o releído tras el error).
   */
  const pagoUnicoId = useRef<string | null>(null);

  /**
   * Tras un fallo de cobro: relee los totales de la base (en TODO catch, para no quedarse con un
   * pendiente viejo) y, si el ticket ya quedó PAGADO, da la venta por cobrada en vez de mostrar
   * un error que invita a cobrar otra vez (B2-1). Devuelve los totales releídos.
   */
  async function trasFalloDeCobro(e: unknown, aCredito = false): Promise<TotalesTicket | null> {
    const t = await leerTotales(token, totales.ticketId).catch(() => null);
    if (t) setTotales(t);
    if (ventaQuedoPagada(t)) {
      if (aCredito) onPagado(t.folio, 0, null, true);
      else onPagado(t.folio, t.cambio, t.total);
      return t;
    }
    setError(e instanceof Error ? e.message : "Error al cobrar");
    return t;
  }

  async function aplicarUnPago(m: MetodoPago, monto: number, recibido?: number) {
    setError(null);
    if (!(monto > 0)) { setError("Monto inválido"); return; }
    setEnCurso({ cambio: recibido ? Math.round((recibido - monto) * 100) / 100 : 0, recibido: recibido ?? 0 });
    setProcesando(true);
    let antes = totales;
    const clientId = (pagoUnicoId.current ??= nuevoClientId());
    try {
      antes = (await asegurarAnticipo()) ?? antes;
      const t = await aplicarPago(
        token,
        totales.ticketId,
        { metodo: m, monto, montoRecibido: recibido },
        clientId,
      );
      pagoUnicoId.current = null;
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") onPagado(t.folio, t.cambio, t.total);
      else quedaPendiente();
    } catch (e) {
      const t = await trasFalloDeCobro(e);
      if (pagoEntroPeseAlError(antes, t)) pagoUnicoId.current = null;
      // Un atajo que falla no se queda en su pantalla de espera: pasa a la de efectivo, con el
      // error, para que la cajera cobre a mano sin volver a empezar.
      if (!ventaQuedoPagada(t)) setVista((v) => (v === "atajo" ? "efectivo" : v));
    } finally {
      setProcesando(false);
    }
  }

  // Efectivo exacto: se aplica UNA vez al llegar a su vista (después de la propina, si la hubo).
  const atajoAplicado = useRef(false);
  // Con anticipo, el atajo espera a leerlo; si el anticipo cubre todo, se confirma en el selector.
  useEffect(() => {
    if (vista !== "atajo" || atajoAplicado.current || !anticipoListo) return;
    atajoAplicado.current = true;
    if (anticipoCobro.porAplicar > 0 && totalesEf.pendiente <= 0) { setVista("selector"); return; }
    void aplicarUnPago("EFECTIVO", totalesEf.pendiente, totalesEf.pendiente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, anticipoListo]);

  // ── A crédito y saldo a favor (retail 2, entrega 2) ─────────────────────────────────────────
  // Con el módulo apagado no se lee nada: un restaurante cobra exactamente como antes.
  const [cuentaCredito, setCuentaCredito] = useState<CuentaCredito | null>(null);
  useEffect(() => {
    if (!moduloCredito) return;
    let activo = true;
    leerCuentaCredito(token, totales.ticketId)
      .then((c) => { if (activo) setCuentaCredito(c); })
      .catch(() => { /* sin el dato, el cobro de siempre */ });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduloCredito, token, totales.ticketId]);
  const opciones = opcionesCredito({ moduloCredito, cuenta: cuentaCredito, pendiente: totalesEf.pendiente, montoPagado: totales.montoPagado + anticipoCobro.porAplicar });
  const extras: Extra[] = [
    ...(opciones.aCredito ? [{ valor: "CREDITO" as MetodoPago, etiqueta: "A crédito", sub: `Disponible: ${fmtMxn(opciones.aCredito.disponible)}` }] : []),
    ...(opciones.saldoFavor > 0 ? [{ valor: "SALDO_FAVOR" as MetodoPago, etiqueta: "Saldo a favor", sub: `Tiene ${fmtMxn(cuentaCredito?.saldoFavor ?? 0)} a favor` }] : []),
  ];
  /** La base pidió el PIN de `venta.credito_excedido`: su motivo, para el diálogo. */
  const [pinCredito, setPinCredito] = useState<string | null>(null);
  /** `client_id_local` del pago a crédito / con saldo en curso: un reintento no lo duplica (B2-2). */
  const pagoCreditoId = useRef<string | null>(null);

  async function cobrarConCredito(pagar: (clientId: string) => Promise<void>, alQuedarPendiente?: () => void) {
    setError(null);
    setEnCurso({ cambio: 0, recibido: 0 });
    setProcesando(true);
    let antes = totales;
    const clientId = (pagoCreditoId.current ??= nuevoClientId());
    try {
      antes = (await asegurarAnticipo()) ?? antes;
      await pagar(clientId);
      pagoCreditoId.current = null;
      const t = await leerTotales(token, totales.ticketId);
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        if (vista === "credito") onPagado(t.folio, 0, null, true);
        else onPagado(t.folio, t.cambio, t.total);
      }
      else { alQuedarPendiente?.(); quedaPendiente(); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (vista === "credito" && pideAutorizacionCredito(msg)) { setPinCredito(msg); return; }
      // La venta a crédito pudo entrar aunque la respuesta se perdiera: tampoco se anuncia un total cobrado.
      const t = await trasFalloDeCobro(e, vista === "credito");
      if (pagoEntroPeseAlError(antes, t)) pagoCreditoId.current = null;
    } finally {
      setProcesando(false);
    }
  }

  const venderACredito = (autorizacionPinId: string | null) =>
    cobrarConCredito((id) => pagarACredito(token, totales.ticketId, autorizacionPinId, id));
  const usarSaldoFavor = () => {
    const monto = opciones.saldoFavor;
    return cobrarConCredito(
      (id) => pagarConSaldoFavor(token, totales.ticketId, monto, id),
      () => setCuentaCredito((c) => (c ? { ...c, saldoFavor: Math.round((c.saldoFavor - monto) * 100) / 100 } : c)),
    );
  };

  // ── Cobro con terminal (ADR 0033) ──────────────────────────────────────────────────────────
  // Lo último que se supo de esta caja evita que el selector cambie de botones al abrir. Solo se
  // guarda `hay`: `lista` arranca en true y, si el lector no lo está, `crear` responde
  // TERMINAL_NO_DISPONIBLE (seguro) hasta que contesta `disponible`.
  const [terminal, setTerminalEstado] = useState<TerminalCaja>(() => {
    let recuerdo: string | null = null;
    try { recuerdo = sessionStorage.getItem("vimpos.terminal"); } catch { /* sin almacén no hay recuerdo */ }
    return { hay: recuerdo === "1" || recuerdo === "2", lista: true, proveedor: null, propina_en_lector: false };
  });
  // La propina se decide al elegir «Tarjeta», a veces justo después de volver a preguntar por el
  // lector: el ref tiene lo último aunque el render todavía no llegue.
  const terminalRef = useRef(terminal);
  function setTerminal(t: TerminalCaja) { terminalRef.current = t; setTerminalEstado(t); }
  const [terminalSabida, setTerminalSabida] = useState(false);
  const conTerminal = terminal.hay;
  // El cobro va al lector con la propina por elegir solo si VIM no tiene ya una (ni de esta vez ni
  // guardada en el ticket): nunca dos propinas.
  const propinaEnLector = terminal.propina_en_lector && propina === 0 && !propinaPreguntada && !((totales.propina ?? 0) > 0);

  /** Vuelve a preguntar por el lector (la cajera lo encendió con el cobro abierto); true si ya puede cobrar. */
  async function revisarTerminal(): Promise<boolean> {
    const t = await terminalDeCaja(token, cajaId);
    setTerminal(t);
    setTerminalSabida(true);
    return t.hay && t.lista;
  }

  /**
   * La terminal ya cobró: el pago entra al ticket como débito o crédito, con su referencia. El id del
   * cobro es el `client_id_local`, así que repetirlo (caja apagada a medias, doble aviso) no duplica.
   * Si el cliente dejó propina en el lector, primero se fija en el ticket (absoluta: repetirla da lo
   * mismo) y el pago la lleva además del monto; si no se pudo fijar, no se aplica el pago y al volver
   * a abrir se hace todo otra vez. Aceptado a mano con PIN (`autorizoId`): solo el monto.
   */
  async function aplicarCobroTerminal(c: CobroTerminal, autorizoId?: string) {
    setError(null);
    setEnCurso({ cambio: 0, recibido: 0 });
    setProcesando(true);
    const propinaLector = autorizoId ? 0 : propinaDeCobro(c);
    try {
      await asegurarAnticipo();
      if (propinaLector > 0) {
        await establecerPropina(token, totales.ticketId, propinaLector);
        setPropina(propinaLector);
        propinaRef.current = propinaLector;
        setPropinaPreguntada(true);
      }
      const t = await aplicarPago(
        token, totales.ticketId,
        pagoDeCobro(c, propinaLector),
        c.id,
      );
      // Si este aviso no llega, el cobro sigue «sin aplicar» en la nube y se reintenta al abrir el
      // cobro otra vez; aplicar_pago ya lo tiene, así que no pasa nada.
      await pedirCobro(token, cajaId, { accion: "confirmar", cobro_id: c.id, autorizo_id: autorizoId }).catch(() => {});
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") onPagado(t.folio, t.cambio, t.total);
      else quedaPendiente();
    } catch (e) {
      const t = await trasFalloDeCobro(e);
      if (!ventaQuedoPagada(t)) {
        setError("El cobro sí pasó en la terminal, pero no se pudo registrar en el ticket. Cierra el cobro y vuelve a abrirlo: se registra solo.");
        setVista("selector");
      }
    } finally {
      setProcesando(false);
    }
  }

  // Al abrir: ¿la caja tiene terminal?, y si quedó un cobro aprobado de ESTE ticket sin registrar
  // (la caja se apagó o perdió la red a medio cobro), se registra ahora.
  useEffect(() => {
    let activo = true;
    (async () => {
      const t = await terminalDeCaja(token, cajaId);
      if (!activo) return;
      setTerminal(t);
      setTerminalSabida(true);
      try { sessionStorage.setItem("vimpos.terminal", !t.hay ? "0" : t.propina_en_lector ? "2" : "1"); } catch { /* sin almacén no hay recuerdo */ }
      if (!t.hay) return;
      const r = await pedirCobro(token, cajaId, { accion: "pendientes" }).catch(() => null);
      const suyo = r?.cobros?.find((c) => c.ticket_id === totales.ticketId);
      if (activo && suyo) void aplicarCobroTerminal(suyo);
    })().catch(() => { if (activo) setTerminalSabida(true); });
    return () => { activo = false; };
    // Solo al abrir el cobro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** El pago dividido que está esperando a la terminal; al aprobarse o abandonarse se resuelve. */
  const [esperaDividido, setEsperaDividido] = useState<{
    clave: string; monto: number; aprobado: (c: CobroTerminal, autorizoId?: string) => void; abandonar: () => void;
  } | null>(null);

  /** Cobra en la terminal una parte del pago dividido y la registra. Rechaza si la cajera la abandona. */
  function cobrarParteEnTerminal(p: PagoPorAplicar): Promise<TotalesTicket> {
    return new Promise<TotalesTicket>((resolver, rechazar) => {
      setEsperaDividido({
        clave: p.clientId, monto: p.monto,
        abandonar: () => rechazar(new Error("El cobro con tarjeta no se completó. Quita ese pago o vuelve a intentar.")),
        aprobado: (c, autorizoId) => {
          aplicarPago(token, totales.ticketId,
            pagoDeCobro(c), c.id)
            .then(async (t) => {
              await pedirCobro(token, cajaId, { accion: "confirmar", cobro_id: c.id, autorizo_id: autorizoId }).catch(() => {});
              resolver(t);
            })
            .catch(rechazar);
        },
      });
    }).finally(() => setEsperaDividido(null));
  }

  /** Aplica una lista de pagos divididos SECUENCIALMENTE (no en paralelo). Navega solo al final. */
  async function aplicarPagosDivididos(lista: PagoPorAplicar[]): Promise<string[]> {
    setError(null);
    if (lista.length === 0) return [];
    setProcesando(true);
    try {
      try {
        await asegurarAnticipo();
      } catch (e) {
        await trasFalloDeCobro(e);
        return [];
      }
      const ticketId = totales.ticketId;
      const r = await aplicarPagosEnOrden(
        lista,
        (p) => (p.terminal ? cobrarParteEnTerminal(p) : aplicarPago(token, ticketId, { metodo: p.metodo, monto: p.monto }, p.clientId)),
        () => leerTotales(token, ticketId),
      );
      if (r.totales) setTotales(r.totales);
      // PAGADO manda aunque un pago haya fallado: con propina, el primero podía cerrar el ticket y
      // el segundo rebotaba con "estado PAGADO" — la venta estaba cobrada y la pantalla decía error.
      if (ventaQuedoPagada(r.totales)) onPagado(r.totales.folio, r.totales.cambio, r.totales.total);
      else if (r.error !== null) setError(r.error instanceof Error ? r.error.message : "Error al cobrar");
      else setError("Los pagos no cubrieron el total del ticket.");
      if (r.aplicados.length > 0) propinaFirme();
      return r.aplicados;
    } finally {
      setProcesando(false);
    }
  }

  /** Elegir método: la propina va primero si toca preguntarla (spec: siempre después del método). */
  function elegirMetodo(d: DestinoMetodo) {
    setError(null);
    setTrasPropina(d);
    const t = terminalRef.current;
    if (debePreguntarPropina({
      capturar: sug?.capturar ?? false,
      propinaFijada: propinaPreguntada,
      destino: d,
      propinaEnLector: t.hay && t.lista && t.propina_en_lector,
    })) {
      setVista("propina");
      return;
    }
    irAMetodo(d);
  }

  function irAMetodo(d: DestinoMetodo) {
    if (d === "terminal") setVista("terminal");
    else if (d === "atajo") setVista("atajo");
    else if (d === "dividido") setVista("dividido");
    else if (d === "CREDITO") setVista("credito");
    else if (d === "SALDO_FAVOR") setVista("saldo");
    else if (d === "EFECTIVO") { setMetodo(d); setVista("efectivo"); }
    else { setMetodo(d); setVista("otro"); }
  }

  // El atajo «Efectivo exacto» entra como cualquier método, en cuanto se sabe si hay que preguntar
  // la propina.
  const atajoElegido = useRef(false);
  useEffect(() => {
    if (!atajo || !sug || atajoElegido.current) return;
    atajoElegido.current = true;
    elegirMetodo("atajo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sug]);

  /**
   * De vuelta a «¿Cómo paga?». Deshace la propina elegida en este cobro (si cambió): la propina va
   * atada al método con el que se paga, y al elegir otro se pregunta de nuevo.
   */
  async function volverAlSelector() {
    const inicial = propinaInicial.current;
    if (propinaRef.current !== inicial) {
      setProcesando(true);
      try {
        await establecerPropina(token, totales.ticketId, inicial);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo quitar la propina");
        return;
      } finally {
        setProcesando(false);
      }
      setPropina(inicial);
    }
    setPropinaPreguntada(inicial > 0);
    setPreguntoAqui(false);
    setTrasPropina(null);
    setVista("selector");
  }

  /** Regresar: botón de la cabecera y Escape hacen lo mismo. */
  async function regresar() {
    const d = vistaAlRegresar(vista, {
      ocupado: procesando || esperaDividido !== null || pinCredito !== null,
      preguntoPropinaAqui: preguntoAqui,
    });
    if (d === null) return;
    setError(null);
    if (d === "cerrar") onCerrar();
    else if (d === "selector" && vista === "propina") await volverAlSelector();
    else setVista(d);
  }

  /* Escape hace lo mismo que el botón de regresar de la pantalla. Con un pago aplicándose, el
     atajo corriendo o la terminal cobrando no hace nada (`vistaAlRegresar` → null). */
  const regresarRef = useRef(regresar);
  regresarRef.current = regresar;
  const alEscapar = useMemo(
    () => capaVisible([
      [pinCredito !== null, () => {}],
      [true, () => void regresarRef.current()],
    ]),
    [pinCredito],
  );
  useEscape(alEscapar);

  // ── Pantallas ────────────────────────────────────────────────────────────────────────────
  const ticket = `Ticket #${totales.folio ?? totales.ticketId.slice(-6)}`;
  const ctx = (metodoTexto?: string) => cabecera([metodoTexto, ticket, contextoCuenta]);
  const atras = () => void regresar();

  let pantalla: React.ReactNode;
  if (errorAnticipo && (vista === "selector" || vista === "atajo")) {
    pantalla = (
      <PantallaMensaje
        contexto={ctx()}
        onCerrar={onCerrar}
        pie={
          <div className="grid grid-cols-2 gap-3">
            <BotonSecundario onClick={onCerrar}>Volver al ticket</BotonSecundario>
            <BotonPrincipal onClick={() => setIntentoAnticipo((n) => n + 1)}>Reintentar</BotonPrincipal>
          </div>
        }
      >
        <p className="max-w-[560px] text-20 font-medium text-danger" role="alert">
          No se pudo saber si la cita dejó anticipo: {errorAnticipo}. No se cobra hasta saberlo.
        </p>
      </PantallaMensaje>
    );
  } else if (procesando && (vista === "efectivo" || vista === "otro" || vista === "atajo" || vista === "credito" || vista === "saldo")) {
    pantalla = <PantallaRegistrando cambio={enCurso.cambio} recibido={enCurso.recibido} />;
  } else if (vista === "atajo" || (vista === "selector" && (!sug || !anticipoListo))) {
    pantalla = (
      <PantallaMensaje contexto={ctx()} onCerrar={onCerrar}>
        <p className="text-18 text-ink-3" role="status">Cargando…</p>
      </PantallaMensaje>
    );
  } else if (vista === "selector") {
    pantalla = (
      <VistaSelector
        totales={totalesEf}
        contexto={ctx()}
        conTerminal={conTerminal}
        terminalSabida={terminalSabida}
        terminalLista={terminal.lista}
        extras={extras}
        anticipo={anticipoCobro.anticipo}
        onCobrarConAnticipo={anticipoCobro.porAplicar > 0 && totalesEf.pendiente <= 0 ? () => void cobrarSoloConAnticipo() : undefined}
        procesando={procesando}
        error={error}
        onRevisarTerminal={revisarTerminal}
        onElegir={elegirMetodo}
        onMas={() => { setError(null); setVista("mas"); }}
        onCerrar={onCerrar}
      />
    );
  } else if (vista === "mas") {
    pantalla = <VistaMas totales={totalesEf} contexto={ctx()} onElegir={elegirMetodo} onRegresar={atras} />;
  } else if (vista === "propina" && sug) {
    const nombre = trasPropina === "terminal" ? "Tarjeta" : trasPropina === "dividido" ? "Pago dividido" : trasPropina === "atajo" ? "Efectivo exacto" : trasPropina ? nombreMetodo(trasPropina) : undefined;
    pantalla = (
      <VistaPropina
        totalBase={totales.total}
        contexto={ctx(nombre)}
        sugerencias={sug}
        procesando={procesando}
        error={error}
        onConfirmar={(m) => void confirmarPropina(m)}
        onRegresar={atras}
      />
    );
  } else if (vista === "terminal") {
    pantalla = (
      <VistaTerminal
        token={token}
        cajaId={cajaId}
        turnoId={turnoId}
        ejecutaNombre={ejecutaNombre}
        ticketId={totales.ticketId}
        folio={totales.folio}
        monto={totalesEf.pendiente}
        proveedor={terminal.proveedor}
        propinaEnLector={propinaEnLector}
        contexto={ctx("Tarjeta")}
        onAprobado={aplicarCobroTerminal}
        onVolver={() => { setError(null); void volverAlSelector(); }}
      />
    );
  } else if (vista === "credito" && opciones.aCredito) {
    pantalla = (
      <VistaCredito
        total={totalesEf.pendiente}
        credito={opciones.aCredito}
        contexto={ctx("A crédito")}
        procesando={procesando}
        error={error}
        onConfirmar={() => void venderACredito(null)}
        onRegresar={atras}
      />
    );
  } else if (vista === "saldo" && opciones.saldoFavor > 0) {
    pantalla = (
      <VistaSaldoFavor
        pendiente={totalesEf.pendiente}
        monto={opciones.saldoFavor}
        contexto={ctx("Saldo a favor")}
        procesando={procesando}
        error={error}
        onConfirmar={() => void usarSaldoFavor()}
        onRegresar={atras}
      />
    );
  } else if (vista === "efectivo") {
    pantalla = (
      <VistaEfectivo
        totales={totalesEf}
        conPropina={propina > 0}
        procesando={procesando}
        error={error}
        onAplicar={(monto, recibido) => void aplicarUnPago("EFECTIVO", monto, recibido)}
        onRegresar={atras}
      />
    );
  } else if (vista === "otro") {
    pantalla = (
      <VistaOtro
        totales={totalesEf}
        metodo={metodo}
        contexto={ctx(metodo === "TRANSFERENCIA" ? "Transferencia" : `${nombreMetodo(metodo)} · a mano`)}
        procesando={procesando}
        error={error}
        onAplicar={(monto) => void aplicarUnPago(metodo, monto)}
        onRegresar={atras}
      />
    );
  } else if (vista === "dividido") {
    pantalla = (
      <VistaDividida
        totales={totalesEf}
        contexto={ctx("Pago dividido")}
        conTerminal={conTerminal}
        terminalLista={terminal.lista}
        onRevisarTerminal={revisarTerminal}
        procesando={procesando}
        error={error}
        onAplicarPagos={aplicarPagosDivididos}
        onRegresar={atras}
      />
    );
  } else {
    // Una vista sin sus datos (p. ej. «A crédito» que dejó de aplicar): de vuelta al selector.
    pantalla = (
      <PantallaMensaje contexto={ctx()} onCerrar={() => setVista("selector")}>
        <p className="text-18 text-ink-3">Esta forma de pago ya no está disponible.</p>
      </PantallaMensaje>
    );
  }

  return (
    <>
      {pantalla}
      {pinCredito !== null && (
        <ModalAutorizacionPin
          token={token}
          capa="z-[70]"
          payload={{
            accion: "venta_credito_excedido",
            permisoCodigo: "venta.credito_excedido",
            entidadTipo: "ticket",
            entidadId: totales.ticketId,
            monto: totalesEf.pendiente,
            motivo: pinCredito,
            cajaId,
            turnoId,
          }}
          descripcion={`Venta a crédito de ${fmtMxn(totalesEf.pendiente)}: ${pinCredito}`}
          ejecutaNombre={ejecutaNombre}
          onAutorizado={(a) => { setPinCredito(null); void venderACredito(a.autorizacionPinId); }}
          onCancelar={() => setPinCredito(null)}
        />
      )}
      {/* Una parte del pago dividido cobrándose en la terminal: pantalla completa encima. */}
      {esperaDividido && (
        <div className="fixed inset-0 z-[60]">
          <VistaTerminal
            key={esperaDividido.clave}
            token={token}
            cajaId={cajaId}
            turnoId={turnoId}
            ejecutaNombre={ejecutaNombre}
            ticketId={totales.ticketId}
            folio={totales.folio}
            monto={esperaDividido.monto}
            proveedor={terminal.proveedor}
            contexto={ctx("Pago dividido · Tarjeta")}
            onAprobado={esperaDividido.aprobado}
            onVolver={esperaDividido.abandonar}
          />
        </div>
      )}
    </>
  );
}
