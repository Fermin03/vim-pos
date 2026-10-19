"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { capaVisible } from "../lib/escape";
import { useEscape } from "../lib/use-escape";
import { Button, Icono } from "@vim/ui/styles";
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
import { cajaTieneTerminal, pagoDeCobro, pedirCobro, type CobroTerminal } from "../lib/terminal";
import { VistaTerminal } from "./vista-terminal";
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

// ─── Íconos SVG inline (calcan los mockups) ────────────────────────────────

function IcoEfectivo({ cls }: { cls?: string }) {
  return (
    <Icono nombre="billete" className={cls} />
  );
}

function IcoDebito({ cls }: { cls?: string }) {
  return (
    <Icono nombre="tarjeta" className={cls} />
  );
}

function IcoCredito({ cls }: { cls?: string }) {
  return (
    <Icono nombre="tarjeta" className={cls} />
  );
}

function IcoTransferencia({ cls }: { cls?: string }) {
  return (
    <Icono nombre="transferencia" className={cls} />
  );
}

function IcoDividido({ cls }: { cls?: string }) {
  return (
    <Icono nombre="pago-dividido" className={cls} />
  );
}

function IcoBack({ cls }: { cls?: string }) {
  return (
    <Icono nombre="flecha-izquierda" className={cls} />
  );
}

function IcoChevron({ cls }: { cls?: string }) {
  return (
    <Icono nombre="chevron-derecha" className={cls} />
  );
}

function IcoBackspace({ cls }: { cls?: string }) {
  return (
    <Icono nombre="retroceso" className={cls} />
  );
}

function IcoTrash({ cls }: { cls?: string }) {
  return (
    <Icono nombre="eliminar" className={cls} />
  );
}

function IcoPlus({ cls }: { cls?: string }) {
  return (
    <Icono nombre="mas" className={cls} />
  );
}

function IcoClose({ cls }: { cls?: string }) {
  return (
    <Icono nombre="cerrar" className={cls} />
  );
}

// ─── Config de métodos ───────────────────────────────────────────────────────

type MetodoConfig = {
  valor: MetodoPago;
  etiqueta: string;
  sub: string;
  icoFn: (p: { cls?: string }) => React.ReactElement;
  // inline styles para el ícono (colores de paleta no incluidos en tokens)
  icoBg: string;
  icoColor: string;
};

const METODOS: MetodoConfig[] = [
  {
    valor: "EFECTIVO",
    etiqueta: "Efectivo",
    sub: "Captura el monto recibido y calcula el cambio",
    icoFn: IcoEfectivo,
    icoBg: "#E7F2EC",
    icoColor: "#2E7D52",
  },
  {
    valor: "TARJETA_DEBITO",
    etiqueta: "Débito",
    sub: "Se cobra en terminal de pago",
    icoFn: IcoDebito,
    icoBg: "#EAF0F8",
    icoColor: "#2C5AA0",
  },
  {
    valor: "TARJETA_CREDITO",
    etiqueta: "Crédito",
    sub: "Crédito · se cobra en terminal",
    icoFn: IcoCredito,
    icoBg: "#EAF0F8",
    icoColor: "#2C5AA0",
  },
  {
    valor: "TRANSFERENCIA",
    etiqueta: "Transferencia",
    sub: "Captura la referencia y verifica recepción",
    icoFn: IcoTransferencia,
    icoBg: "#E2F0F1",
    icoColor: "#1F7A82",
  },
];

function metodoCfg(v: MetodoPago): MetodoConfig {
  return METODOS.find((m) => m.valor === v) ?? (METODOS[0] as MetodoConfig);
}

// Solo en el selector, y solo con el módulo de crédito (retail): no se combinan en el pago dividido.
const CFG_CREDITO: MetodoConfig = {
  valor: "CREDITO",
  etiqueta: "A crédito",
  sub: "",
  icoFn: ({ cls }) => <Icono nombre="calendario" className={cls} />,
  icoBg: "#F6EFE3",
  icoColor: "#8A5A12",
};
const CFG_SALDO_FAVOR: MetodoConfig = {
  valor: "SALDO_FAVOR",
  etiqueta: "Saldo a favor",
  sub: "",
  icoFn: ({ cls }) => <Icono nombre="moneda" className={cls} />,
  icoBg: "#E7F2EC",
  icoColor: "#2E7D52",
};

// ─── Sub-vistas ──────────────────────────────────────────────────────────────

type Vista = "propina" | "selector" | "efectivo" | "otro" | "dividido" | "atajo" | "terminal" | "credito" | "saldo";

// ─── Tipos locales ───────────────────────────────────────────────────────────

/** Pago dividido capturado. Su `clientId` se fija al agregarlo y viaja a `aplicar_pago` (B2-2). */
type PagoAplicado = PagoPorAplicar;

// El numpad trabaja en CENTAVOS (estándar POS): cada dígito desplaza los decimales, así se
// capturan totales fraccionarios (p.ej. $49.50 tras un % de descuento) sin tecla de punto.
const aMonto = (buf: string) => (buf ? parseInt(buf, 10) : 0) / 100; // buffer de centavos → pesos
const aBuffer = (v: number) => String(Math.round(v * 100));          // pesos → buffer de centavos

// ─── Numpad mini ─────────────────────────────────────────────────────────────

function Numpad({
  buffer,
  onChange,
  compact = false,
  grande = false,
  onEnter,
  capturarTeclado = true,
}: {
  buffer: string;
  onChange: (b: string) => void;
  compact?: boolean;
  /** Teclas de 64px: las del cobro en efectivo, el teclado que más se usa del turno. */
  grande?: boolean;
  /** Enter confirma (p. ej. cobrar). */
  onEnter?: () => void;
  /** Si es false, no escucha el teclado (por si convivieran dos numpads). */
  capturarTeclado?: boolean;
}) {
  const nkBase = grande
    ? "border border-line-strong rounded-lg bg-surface font-display text-2xl font-semibold cursor-pointer h-16 flex items-center justify-center text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97] active:bg-line"
    : compact
    ? "border border-line-strong rounded bg-surface font-display text-xl font-semibold cursor-pointer min-h-[48px] flex items-center justify-center text-ink transition-colors hover:bg-hover active:bg-line"
    : "border border-line-strong rounded bg-surface font-display text-2xl font-semibold cursor-pointer min-h-[56px] flex items-center justify-center text-ink transition-colors hover:bg-hover active:bg-line";

  function press(key: string) {
    if (key === "back") onChange(buffer.slice(0, -1));
    else if (key === "00") onChange((buffer + "00").slice(0, 8));
    else onChange((buffer + key).slice(0, 8));
  }

  // Teclado físico además del táctil: números + Backspace (+ Enter para confirmar). El buffer es en
  // CENTAVOS, así que teclear "4950" = $49.50 igual que tocando; se ignoran '.'/','. Refs para no
  // re-registrar el listener en cada cambio de buffer.
  const onChangeRef = useRef(onChange);
  const bufferRef = useRef(buffer);
  const onEnterRef = useRef(onEnter);
  onChangeRef.current = onChange;
  bufferRef.current = buffer;
  onEnterRef.current = onEnter;
  useEffect(() => {
    if (!capturarTeclado) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); onChangeRef.current((bufferRef.current + e.key).slice(0, 8)); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); onChangeRef.current(bufferRef.current.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); onEnterRef.current?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturarTeclado]);

  const keys = ["1","2","3","4","5","6","7","8","9","00","0","back"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button key={k} type="button" className={nkBase} onClick={() => press(k)} aria-label={k === "back" ? "Borrar" : undefined}>
          {k === "back" ? <IcoBackspace cls="w-6 h-6 text-ink-2" /> : k}
        </button>
      ))}
    </div>
  );
}

// ─── Vista: selector de método (P-069) ──────────────────────────────────────

function VistaSelector({
  totales,
  conTerminal,
  extras = [],
  error,
  onElegir,
  onCerrar,
}: {
  totales: TotalesTicket;
  /** La caja tiene terminal ligada: Débito y Crédito se vuelven un solo «Tarjeta» que cobra en ella. */
  conTerminal: boolean;
  /** «A crédito» y «Saldo a favor», ya con su detalle (módulo de crédito). Vacío = como siempre. */
  extras?: MetodoConfig[];
  error: string | null;
  onElegir: (m: MetodoPago | "dividido" | "terminal") => void;
  onCerrar: () => void;
}) {
  // El registro a mano se queda como salida (sin internet, terminal descompuesta), pero escondido.
  const [aMano, setAMano] = useState(false);
  const filas: { cfg: MetodoConfig; elegir: () => void; clave: string }[] = [];
  for (const m of METODOS) {
    const esTarjeta = m.valor === "TARJETA_DEBITO" || m.valor === "TARJETA_CREDITO";
    if (!conTerminal || !esTarjeta) { filas.push({ cfg: m, elegir: () => onElegir(m.valor), clave: m.valor }); continue; }
    if (m.valor === "TARJETA_DEBITO") {
      filas.push({
        cfg: { ...metodoCfg("TARJETA_CREDITO"), etiqueta: "Tarjeta", sub: "Débito o crédito · se cobra en la terminal" },
        elegir: () => onElegir("terminal"), clave: "terminal",
      });
    }
    if (aMano) {
      filas.push({ cfg: { ...m, etiqueta: `${m.etiqueta} · a mano`, sub: "Ya se cobró en otra terminal" }, elegir: () => onElegir(m.valor), clave: m.valor });
    }
  }
  for (const m of extras) filas.push({ cfg: m, elegir: () => onElegir(m.valor), clave: m.valor });
  return (
    <div className="flex flex-col h-full">
      {/* Total a cobrar */}
      <div className="text-center px-6 py-5 border border-line rounded-lg bg-sel mb-5">
        <div className="text-12 font-bold uppercase tracking-widest text-ink-3 mt-3">Total a cobrar</div>
        <div className="font-display text-40 font-bold tracking-tight text-ink tabular-nums leading-none mt-1 mb-1">
          {fmtMxn(totales.total)}
        </div>
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="text-15 font-semibold text-ink-2 mb-3">¿Cómo paga el cliente?</div>

      {/* Lista de métodos */}
      <div className="border border-line rounded-lg overflow-hidden">
        {filas.map(({ cfg: m, elegir, clave }, i) => (
          <button
            key={clave}
            type="button"
            onClick={elegir}
            className={[
              "w-full flex items-center gap-4 px-[18px] py-[15px] cursor-pointer transition-colors hover:bg-hover text-left",
              i < filas.length - 1 ? "border-b border-line" : "",
            ].join(" ")}
          >
            <span
              className="w-[46px] h-[46px] rounded-[11px] flex items-center justify-center flex-shrink-0"
              style={{ background: m.icoBg, color: m.icoColor }}
            >
              <m.icoFn cls="w-[25px] h-[25px]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-16 font-semibold text-ink">{m.etiqueta}</span>
              <span className="block text-13 text-ink-3 mt-[1px]">{m.sub}</span>
            </span>
            <IcoChevron cls="w-5 h-5 text-ink-3 flex-shrink-0" />
          </button>
        ))}

        {/* Separador dividido */}
        <div className="px-[18px] py-[9px] text-11 font-bold uppercase tracking-widest text-ink-3 bg-sel border-t border-line">
          Combinar formas de pago
        </div>

        <button
          type="button"
          onClick={() => onElegir("dividido")}
          className="w-full flex items-center gap-4 px-[18px] py-[15px] cursor-pointer transition-colors hover:bg-hover text-left"
        >
          <span
            className="w-[46px] h-[46px] rounded-[11px] flex items-center justify-center flex-shrink-0"
            style={{ background: "#EFEAF6", color: "#6B4FA0" }}
          >
            <IcoDividido cls="w-[25px] h-[25px]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-16 font-semibold text-ink">Pago dividido</span>
            <span className="block text-13 text-ink-3 mt-[1px]">Combina efectivo, tarjeta u otros en un mismo ticket</span>
          </span>
          <IcoChevron cls="w-5 h-5 text-ink-3 flex-shrink-0" />
        </button>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex items-center gap-2 text-15 font-semibold text-ink-2 border border-line-strong rounded px-[22px] py-[14px] hover:bg-hover hover:text-ink transition-colors"
        >
          <IcoBack cls="w-4 h-4" />
          Volver al ticket
        </button>
        {conTerminal && !aMano ? (
          <button type="button" onClick={() => setAMano(true)} className="min-h-[44px] px-2 text-13 font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
            La cobré en otra terminal
          </button>
        ) : (
          <span className="text-13 text-ink-3">Efectivo es el más usado</span>
        )}
      </div>
    </div>
  );
}

// ─── Vista: pago efectivo (P-070) ────────────────────────────────────────────

function VistaEfectivo({
  totales,
  procesando,
  error,
  onAplicar,
  onVolver,
}: {
  totales: TotalesTicket;
  procesando: boolean;
  error: string | null;
  onAplicar: (monto: number, recibido: number) => void;
  onVolver: () => void;
}) {
  const pendiente = totales.pendiente;
  const [buffer, setBuffer] = useState<string>(aBuffer(pendiente));
  const [recibBuffer, setRecibBuffer] = useState<string>("");

  // Billetes en pesos. Se SUMAN: $200 + $100 = $300, que es como llega el dinero en la mano. El de
  // $20 faltaba, y es el más común en una cuenta chica.
  const billetes = [20, 50, 100, 200, 500, 1000];
  function addDenom(d: number) {
    const cur = recibBuffer ? parseInt(recibBuffer, 10) : 0;
    setRecibBuffer(String(cur + d * 100));
  }

  const monto = aMonto(buffer);
  const recibido = aMonto(recibBuffer);
  const cambio = recibido > 0 ? recibido - monto : 0;
  const puedeCobrar = recibido >= monto && monto > 0;

  function handleCobrar() {
    if (!puedeCobrar || procesando) return;
    onAplicar(monto, recibido);
  }

  const falta = recibido > 0 && cambio < 0;

  // El botón dice lo que va a pasar, con el número que la cajera tiene que contar: "Cobrar y dar
  // $125.00 de cambio". Antes decía "Cobrar $375.00" pasara lo que pasara.
  const etiquetaCobrar = procesando
    ? "Aplicando…"
    : !puedeCobrar
      ? `Cobrar ${fmtMxn(pendiente)}`
      : cambio > 0
        ? `Cobrar y dar ${fmtMxn(cambio)} de cambio`
        : `Cobrar ${fmtMxn(pendiente)} exacto`;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-24 font-semibold tracking-[-0.02em]">Cobro en efectivo</h1>
        <div className="text-16 font-semibold text-ink-2">
          Total{" "}
          <span className="font-display text-24 font-bold tabular-nums text-ink">{fmtMxn(pendiente)}</span>
        </div>
      </div>

      <div className="flex gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Recibido y cambio ARRIBA y en grande: son los dos números que se miran mientras se
              cuenta el dinero. El cambio iba abajo, lejos de los billetes. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-ink px-4 py-3.5">
            <span className="text-16 font-semibold text-ink-2">Recibido</span>
            <span className={["font-display text-40 font-bold leading-none tracking-[-0.02em] tabular-nums", recibido > 0 ? "text-ink" : "text-ink-3"].join(" ")}>
              {fmtMxn(recibido)}
            </span>
          </div>
          <div
            className={[
              "flex items-center justify-between gap-3 rounded-lg px-4 py-3.5",
              falta ? "bg-warning-soft" : recibido > 0 ? "bg-success-soft" : "bg-hover",
            ].join(" ")}
          >
            <span className={["text-16 font-semibold", falta ? "text-warning" : recibido > 0 ? "text-success" : "text-ink-3"].join(" ")}>
              {falta ? "Falta" : "Entrega de cambio"}
            </span>
            <span
              className={[
                "font-display text-40 font-bold leading-none tracking-[-0.02em] tabular-nums",
                falta ? "text-warning" : recibido > 0 ? "text-success" : "text-ink-3",
              ].join(" ")}
            >
              {fmtMxn(Math.abs(cambio))}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {billetes.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => addDenom(d)}
                className="h-14 rounded-lg border border-line-strong bg-surface font-display text-18 font-bold tabular-nums text-ink transition-[transform,background-color,border-color] duration-150 ease-vim hover:border-ink active:scale-[.97] active:bg-hover"
              >
                ${d >= 1000 ? "1,000" : d}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRecibBuffer(aBuffer(pendiente))}
            className="h-12 rounded-lg border border-line-strong bg-surface text-16 font-bold tabular-nums text-ink transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.98]"
          >
            Pago exacto · {fmtMxn(pendiente)}
          </button>
          {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        </div>

        <div className="w-64 flex-shrink-0">
          <Numpad buffer={recibBuffer} onChange={setRecibBuffer} onEnter={handleCobrar} grande />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="h-14 w-40 flex-shrink-0 rounded-lg border border-line-strong bg-surface text-16 font-semibold text-ink transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.98] disabled:opacity-50"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={handleCobrar}
          disabled={!puedeCobrar || procesando}
          className="h-14 min-w-0 flex-1 rounded-lg bg-accent px-4 font-display text-18 font-bold tabular-nums text-white shadow-sm transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none disabled:active:scale-100"
        >
          <span className="block truncate">{etiquetaCobrar}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Vista: pago otro (tarjeta/transferencia/app) ────────────────────────────

function VistaOtro({
  totales,
  metodo,
  procesando,
  error,
  onAplicar,
  onVolver,
}: {
  totales: TotalesTicket;
  metodo: MetodoPago;
  procesando: boolean;
  error: string | null;
  onAplicar: (monto: number) => void;
  onVolver: () => void;
}) {
  const pendiente = totales.pendiente;
  const [buffer, setBuffer] = useState<string>(aBuffer(pendiente));
  const cfg = metodoCfg(metodo);
  const monto = aMonto(buffer);

  return (
    <div className="flex h-full min-h-0">
      {/* Izquierda: resumen */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-line px-8 py-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: cfg.icoBg, color: cfg.icoColor }}>
            <cfg.icoFn cls="w-[22px] h-[22px]" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">{cfg.etiqueta}</h1>
            <p className="text-13 text-ink-3">Ticket #{totales.ticketId.slice(-6)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between py-3 border-b border-line">
            <span className="text-15 text-ink-2 font-medium">Total pendiente</span>
            <span className="font-display text-24 font-semibold text-ink tabular-nums">{fmtMxn(pendiente)}</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="text-15 text-ink-2 font-medium">A aplicar</span>
            <span className="font-display text-28 font-bold text-ink tabular-nums">
              {monto > 0 ? fmtMxn(monto) : "$0.00"}
            </span>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>

      {/* Derecha: numpad + cobrar */}
      <div className="w-[440px] flex-shrink-0 flex flex-col px-6 py-6">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setBuffer(aBuffer(pendiente))}
            className="w-full py-[13px] border border-dashed border-line-strong bg-surface rounded font-sans text-15 font-semibold text-ink-2 cursor-pointer transition-all hover:text-ink hover:bg-hover tabular-nums"
          >
            Monto exacto · {fmtMxn(pendiente)}
          </button>
        </div>
        <div className="flex-1">
          <Numpad buffer={buffer} onChange={setBuffer} onEnter={() => { if (monto > 0 && !procesando) onAplicar(monto); }} />
        </div>
        <button
          type="button"
          onClick={() => { if (monto > 0 && !procesando) onAplicar(monto); }}
          disabled={monto <= 0 || procesando}
          className="mt-3 w-full font-sans text-18 font-bold text-white bg-accent border-none py-[18px] rounded-lg cursor-pointer transition-colors hover:bg-accent-hover disabled:bg-line-strong disabled:cursor-not-allowed flex items-center justify-center gap-[10px] shadow-sm"
        >
          {procesando ? "Aplicando…" : <>Aplicar pago <span className="font-display tabular-nums opacity-90">{monto > 0 ? fmtMxn(monto) : ""}</span></>}
        </button>
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="mt-2 flex items-center justify-center gap-[7px] font-sans text-14 font-semibold text-ink-3 bg-transparent border-none cursor-pointer py-2 px-3 rounded transition-colors hover:text-ink"
        >
          <IcoBack cls="w-[15px] h-[15px]" />
          Cambiar método de pago
        </button>
      </div>
    </div>
  );
}

// ─── Modal "Agregar pago" (sub-modal de P-074) ───────────────────────────────

function ModalAgregarPago({
  pendiente,
  conTerminal,
  onAgregar,
  onCerrar,
}: {
  pendiente: number;
  conTerminal: boolean;
  onAgregar: (metodo: MetodoPago, monto: number, terminal: boolean) => void;
  onCerrar: () => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [terminal, setTerminal] = useState(false);
  // Con terminal: «Tarjeta» (se cobra en ella) y, aparte, Débito y Crédito a mano.
  const opciones: { cfg: MetodoConfig; terminal: boolean; clave: string }[] = METODOS.flatMap((m) => {
    const esTarjeta = m.valor === "TARJETA_DEBITO" || m.valor === "TARJETA_CREDITO";
    if (!conTerminal || !esTarjeta) return [{ cfg: m, terminal: false, clave: m.valor }];
    const aMano = { cfg: { ...m, etiqueta: `${m.etiqueta} · a mano` }, terminal: false, clave: m.valor };
    return m.valor === "TARJETA_DEBITO"
      ? [{ cfg: { ...metodoCfg("TARJETA_CREDITO"), etiqueta: "Tarjeta" }, terminal: true, clave: "terminal" }, aMano]
      : [aMano];
  });
  const [buffer, setBuffer] = useState<string>("");
  // Se monta encima del cobro, así que queda arriba en la pila: Escape cierra solo este diálogo.
  useEscape(onCerrar);

  const monto = aMonto(buffer);

  function handleAgregar() {
    if (monto <= 0) return;
    onAgregar(metodo, Math.min(monto, pendiente), terminal);
  }

  return (
    <div
      className="fixed inset-0 bg-ink/30 flex items-center justify-center p-6 z-[60] animate-vim-fade"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="w-[440px] max-h-[90vh] bg-surface border border-line rounded-lg shadow-xl flex flex-col animate-vim-pop">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-line">
          <h2 className="font-display text-18 font-semibold">Agregar pago</h2>
          <button type="button" onClick={onCerrar} className="w-[34px] h-[34px] border border-line-strong bg-surface rounded flex items-center justify-center text-ink-2 hover:border-ink hover:text-ink transition-colors">
            <IcoClose cls="w-[17px] h-[17px]" />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto">
          {/* Método */}
          <div className="text-13 font-bold uppercase tracking-widest text-ink-2 mb-3">Método</div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {opciones.map(({ cfg: m, terminal: enTerminal, clave }) => (
              <button
                key={clave}
                type="button"
                onClick={() => { setMetodo(m.valor); setTerminal(enTerminal); }}
                className={[
                  "flex items-center gap-[10px] px-[13px] py-[12px] border rounded cursor-pointer transition-all",
                  metodo === m.valor && terminal === enTerminal
                    ? "border-ink bg-sel shadow-[inset_0_0_0_1.5px_#16161A]"
                    : "border-line bg-surface hover:border-line-strong",
                ].join(" ")}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: m.icoBg, color: m.icoColor }}>
                  <m.icoFn cls="w-[18px] h-[18px]" />
                </span>
                <span className="text-14 font-semibold text-ink">{m.etiqueta}</span>
              </button>
            ))}
          </div>

          {/* Monto */}
          <div className="text-13 font-bold uppercase tracking-widest text-ink-2 mb-3">Monto</div>
          <div className="text-center font-display text-40 font-bold text-ink tabular-nums mb-2">
            {monto > 0 ? fmtMxn(monto) : "$0.00"}
          </div>
          <div className="text-center text-13 text-ink-3 mb-4">
            Restante por cubrir: <span className="tabular-nums">{fmtMxn(pendiente)}</span>
            <button
              type="button"
              onClick={() => setBuffer(aBuffer(pendiente))}
              className="ml-[6px] border-none bg-hover text-ink-2 font-sans text-12 font-semibold px-[11px] py-[4px] rounded-full cursor-pointer hover:bg-line hover:text-ink transition-colors"
            >
              Usar todo el restante
            </button>
          </div>

          <Numpad buffer={buffer} onChange={setBuffer} compact />
        </div>

        <div className="px-5 py-4 border-t border-line">
          <button
            type="button"
            onClick={handleAgregar}
            disabled={monto <= 0}
            className="w-full font-sans text-15 font-bold text-white bg-ink border-none py-[14px] rounded cursor-pointer transition-opacity hover:opacity-90 disabled:bg-line-strong disabled:cursor-not-allowed"
          >
            Agregar pago
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vista: pago dividido (P-074) ────────────────────────────────────────────

function VistaDividida({
  totales,
  conTerminal,
  procesando,
  error,
  onAplicarPagos,
  onVolver,
}: {
  totales: TotalesTicket;
  conTerminal: boolean;
  procesando: boolean;
  error: string | null;
  /** Aplica TODOS los pagos divididos de una (secuencial en el padre, no en paralelo) y devuelve
   *  los `clientId` que entraron, para quitarlos de la lista. */
  onAplicarPagos: (pagos: PagoPorAplicar[]) => Promise<string[]>;
  onVolver: () => void;
}) {
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);

  const pendiente = totales.pendiente;
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  const restante = Math.max(0, +(pendiente - pagado).toFixed(2));
  const cubierto = restante <= 0 && pagos.length > 0;
  const pct = Math.min(100, pendiente > 0 ? (pagado / pendiente) * 100 : 0);

  function agregarPago(metodo: MetodoPago, monto: number, terminal: boolean) {
    // El id de idempotencia nace AQUÍ y no cambia entre reintentos (B2-2).
    setPagos((prev) => [...prev, { clientId: nuevoClientId(), metodo, monto, ...(terminal ? { terminal } : {}) }]);
    setMostrarModal(false);
  }

  function quitarPago(clientId: string) {
    setPagos((prev) => prev.filter((p) => p.clientId !== clientId));
  }

  function completar() {
    if (!cubierto || procesando) return;
    // FIX (auditoría): se enviaban N pagos en paralelo (carrera en la ruta de dinero).
    // Ahora se manda la lista completa y el padre los aplica SECUENCIALMENTE. Los que entran se
    // quitan de la lista: si uno falla, el reintento manda solo los que faltan (B2-2), y el total
    // de arriba ya viene releído de la base con lo cobrado descontado.
    void onAplicarPagos(pagos).then((aplicados) => {
      if (aplicados.length > 0) setPagos((prev) => prev.filter((p) => !aplicados.includes(p.clientId)));
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        {/* Cabecera */}
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: "#EFEAF6", color: "#6B4FA0" }}>
            <IcoDividido cls="w-[22px] h-[22px]" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">Pago dividido</h1>
            <p className="text-13 text-ink-3">Cubre el total con varios métodos</p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="border border-line rounded-lg p-5 mb-5 bg-sel">
          <div className="flex justify-between gap-4">
            <div className="text-center flex-1">
              <div className="text-12 font-bold uppercase tracking-widest text-ink-3">Total</div>
              <div className="font-display text-24 font-semibold text-ink tabular-nums mt-[3px]">{fmtMxn(pendiente)}</div>
            </div>
            <div className="w-px bg-line" />
            <div className="text-center flex-1">
              <div className="text-12 font-bold uppercase tracking-widest text-ink-3">Pagado</div>
              <div className="font-display text-24 font-semibold text-ink tabular-nums mt-[3px]">{fmtMxn(pagado)}</div>
            </div>
            <div className="w-px bg-line" />
            <div className="text-center flex-1">
              <div className={["text-12 font-bold uppercase tracking-widest", cubierto ? "text-success" : "text-accent"].join(" ")}>
                {cubierto ? "Cubierto" : "Restante"}
              </div>
              <div className={["font-display font-bold tabular-nums mt-[3px]", cubierto ? "text-24 text-success" : "text-32 text-accent"].join(" ")}>
                {fmtMxn(restante)}
              </div>
            </div>
          </div>
          {/* barra */}
          <div className="h-2 rounded-full bg-line overflow-hidden mt-4">
            <div
              className={["h-full rounded-full transition-[width] duration-300", cubierto ? "bg-success" : "bg-ink"].join(" ")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Lista de pagos */}
        <div className="text-13 font-bold text-ink mb-3">Pagos agregados</div>
        <div className="flex flex-col gap-2 mb-4">
          {pagos.length === 0 ? (
            <div className="text-center py-5 text-14 text-ink-3 border border-dashed border-line-strong rounded">
              Aún no hay pagos. Toca "Agregar pago" para empezar.
            </div>
          ) : (
            pagos.map((p) => {
              const cfg = metodoCfg(p.metodo);
              return (
                <div key={p.clientId} className="flex items-center gap-3 px-[14px] py-[12px] border border-line rounded animate-vim-fade">
                  <span className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: cfg.icoBg, color: cfg.icoColor }}>
                    <cfg.icoFn cls="w-[19px] h-[19px]" />
                  </span>
                  <span className="flex-1 text-15 font-semibold text-ink">{p.terminal ? "Tarjeta · en la terminal" : cfg.etiqueta}</span>
                  <span className="font-display text-16 font-semibold text-ink tabular-nums">{fmtMxn(p.monto)}</span>
                  <button
                    type="button"
                    onClick={() => quitarPago(p.clientId)}
                    className="w-8 h-8 border-none bg-transparent rounded flex items-center justify-center text-ink-3 hover:bg-hover hover:text-danger transition-colors flex-shrink-0"
                    title="Quitar"
                  >
                    <IcoTrash cls="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={() => setMostrarModal(true)}
          disabled={cubierto}
          className="w-full inline-flex items-center justify-center gap-[9px] font-sans text-15 font-semibold text-ink bg-surface border border-line-strong py-[14px] rounded cursor-pointer transition-all hover:border-ink hover:bg-hover disabled:opacity-45 disabled:cursor-default"
        >
          <IcoPlus cls="w-[17px] h-[17px]" />
          Agregar pago
        </button>

        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-4 border-t border-line bg-surface">
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="inline-flex items-center gap-2 text-15 font-semibold text-ink-2 border border-line-strong rounded px-[20px] py-[14px] hover:bg-hover hover:text-ink transition-colors disabled:opacity-50"
        >
          <IcoBack cls="w-4 h-4" />
          Cambiar método
        </button>
        <span className="flex-1" />
        <Button
          onClick={completar}
          disabled={!cubierto || procesando}
          size="lg"
          className="px-[30px]"
        >
          {procesando ? "Procesando…" : "Completar cobro"}
        </Button>
      </div>

      {mostrarModal && (
        <ModalAgregarPago
          pendiente={restante}
          conTerminal={conTerminal}
          onAgregar={agregarPago}
          onCerrar={() => setMostrarModal(false)}
        />
      )}
    </div>
  );
}

// ─── Vista: propina (P-075) ──────────────────────────────────────────────────

function VistaPropina({
  totalBase,
  ticketId,
  sugerencias,
  procesando,
  error,
  onConfirmar,
  onAtras,
}: {
  totalBase: number;
  ticketId: string;
  sugerencias: SugerenciasPropina;
  procesando: boolean;
  error: string | null;
  onConfirmar: (monto: number) => void;
  onAtras: () => void;
}) {
  const [mode, setMode] = useState<"none" | "pct" | "free">(sugerencias.sin ? "none" : "pct");
  const [pctSel, setPctSel] = useState<number>(sugerencias.porcentajes[0] ?? 10);
  const [freeBuffer, setFreeBuffer] = useState<string>("");

  const calcTip = (p: number) => Math.round(totalBase * p) / 100; // totalBase * p/100, a 2 decimales
  const tip =
    mode === "pct" ? calcTip(pctSel) : mode === "free" ? (aMonto(freeBuffer)) : 0;
  const grand = Math.round((totalBase + tip) * 100) / 100;

  const altBase =
    "inline-flex items-center justify-center gap-2 px-[13px] py-[13px] border rounded text-15 font-semibold cursor-pointer transition-all";
  const altOn = "border-ink bg-sel text-ink shadow-[inset_0_0_0_1.5px_#16161A]";
  const altOff = "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink";

  return (
    <div className="flex flex-col">
      {/* Prompt */}
      <div className="mb-5 text-center">
        <div className="mb-1.5 text-12 font-bold uppercase tracking-[0.07em] text-ink-3">
          Cobro · Ticket #{ticketId.slice(-6)}
        </div>
        <h1 className="font-display text-24 font-semibold tracking-tight">¿Agregar propina?</h1>
        <p className="mt-1 text-14 text-ink-2">Se calcula sobre el total de {fmtMxn(totalBase)}</p>
      </div>

      {/* Porcentajes sugeridos */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        {sugerencias.porcentajes.map((p) => {
          const on = mode === "pct" && pctSel === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => { setMode("pct"); setPctSel(p); }}
              className={[
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-[18px] transition-all",
                on ? "border-ink bg-sel shadow-[inset_0_0_0_1.5px_#16161A]" : "border-line bg-surface hover:border-line-strong",
              ].join(" ")}
            >
              <span className="font-display text-24 font-bold text-ink">{p}%</span>
              <span className={["text-13 font-semibold tabular-nums", on ? "text-ink-2" : "text-ink-3"].join(" ")}>
                {fmtMxn(calcTip(p))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Monto libre / Sin propina */}
      {(sugerencias.libre || sugerencias.sin) && (
        <div className={["mb-5 grid gap-3", sugerencias.libre && sugerencias.sin ? "grid-cols-2" : "grid-cols-1"].join(" ")}>
          {sugerencias.libre && (
            <button
              type="button"
              onClick={() => { setMode("free"); setFreeBuffer(""); }}
              className={[altBase, mode === "free" ? altOn : altOff].join(" ")}
            >
              <IcoEfectivo cls="w-4 h-4" />
              Monto libre
            </button>
          )}
          {sugerencias.sin && (
            <button
              type="button"
              onClick={() => setMode("none")}
              className={[altBase, mode === "none" ? altOn : altOff].join(" ")}
            >
              <Icono nombre="menos" className="h-4 w-4" />
              Sin propina
            </button>
          )}
        </div>
      )}

      {/* Numpad de monto libre */}
      {mode === "free" && (
        <div className="mb-5">
          <div className="mb-3 text-center font-display text-32 font-bold tabular-nums text-ink">
            {fmtMxn(aMonto(freeBuffer))}
          </div>
          <div className="mx-auto max-w-[300px]">
            <Numpad buffer={freeBuffer} onChange={setFreeBuffer} compact />
          </div>
        </div>
      )}

      {/* Resumen */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line px-[18px] py-[13px]">
          <span className="text-15 text-ink-2">Total del ticket</span>
          <span className="font-display text-16 font-semibold tabular-nums text-ink">{fmtMxn(totalBase)}</span>
        </div>
        <div className="flex items-center justify-between border-b border-line px-[18px] py-[13px]">
          <span className="text-15 font-semibold text-success">Propina</span>
          <span className="font-display text-16 font-semibold tabular-nums text-success">{fmtMxn(tip)}</span>
        </div>
        <div className="flex items-center justify-between bg-sel px-[18px] py-[13px]">
          <span className="text-15 font-bold uppercase tracking-[0.03em] text-ink">Total a cobrar</span>
          <span className="font-display text-28 font-bold tabular-nums tracking-[-0.02em] text-ink">{fmtMxn(grand)}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAtras}
          disabled={procesando}
          className="inline-flex items-center gap-2 rounded border border-line-strong px-[20px] py-[14px] text-15 font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <IcoBack cls="w-4 h-4" />
          Atrás
        </button>
        <button
          type="button"
          onClick={() => { if (!procesando) onConfirmar(tip); }}
          disabled={procesando}
          className="inline-flex items-center gap-[9px] rounded bg-accent px-[30px] py-[14px] text-15 font-bold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {procesando ? "Guardando…" : <>Confirmar <span className="font-display tabular-nums opacity-90">{fmtMxn(grand)}</span></>}
        </button>
      </div>
    </div>
  );
}

// ─── Vista: a crédito / saldo a favor (retail 2, entrega 2) ─────────────────

/** Cabecera y pie compartidos por las dos vistas de crédito: mismo molde que el resto del cobro. */
function MarcoCredito({ cfg, children, error, procesando, etiqueta, onConfirmar, onVolver }: {
  cfg: MetodoConfig;
  children: React.ReactNode;
  error: string | null;
  procesando: boolean;
  etiqueta: React.ReactNode;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px]" style={{ background: cfg.icoBg, color: cfg.icoColor }}>
          <cfg.icoFn cls="w-[22px] h-[22px]" />
        </span>
        <h1 className="font-display text-xl font-semibold tracking-tight">{cfg.etiqueta}</h1>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">{children}</div>
      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="inline-flex min-h-[44px] items-center gap-2 rounded border border-line-strong px-[20px] py-[14px] text-15 font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <IcoBack cls="w-4 h-4" />
          Cambiar método
        </button>
        <button
          type="button"
          onClick={() => { if (!procesando) onConfirmar(); }}
          disabled={procesando}
          className="inline-flex min-h-[44px] items-center gap-[9px] rounded bg-accent px-[30px] py-[14px] text-15 font-bold text-white shadow-sm transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {procesando ? "Aplicando…" : etiqueta}
        </button>
      </div>
    </div>
  );
}

function Renglon({ l, v, tono }: { l: string; v: string; tono?: "fuerte" }) {
  return (
    <div className={["flex items-center justify-between border-b border-line px-[18px] py-[13px] last:border-b-0", tono ? "bg-sel" : ""].join(" ")}>
      <span className={tono ? "text-15 font-bold text-ink" : "text-15 text-ink-2"}>{l}</span>
      <span className={["font-display tabular-nums text-ink", tono ? "text-24 font-bold" : "text-16 font-semibold"].join(" ")}>{v}</span>
    </div>
  );
}

function VistaCredito({ total, credito, procesando, error, onConfirmar, onVolver }: {
  total: number;
  credito: CreditoCliente;
  procesando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onVolver: () => void;
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
      cfg={CFG_CREDITO}
      error={error}
      procesando={procesando}
      etiqueta={<>Vender a crédito <span className="font-display tabular-nums opacity-90">{fmtMxn(total)}</span></>}
      onConfirmar={onConfirmar}
      onVolver={onVolver}
    >
      <Renglon l="Ya debe" v={fmtMxn(credito.deuda)} />
      <Renglon l="Disponible" v={fmtMxn(credito.disponible)} />
      <Renglon l="Esta venta" v={fmtMxn(total)} tono="fuerte" />
      {aviso && <p className="border-t border-warning-line bg-warning-soft px-[18px] py-3 text-14 font-medium text-warning">{aviso}</p>}
      <p className="border-t border-line px-[18px] py-3 text-13 text-ink-3">Va la venta completa. Paga en {credito.plazoDias} días.</p>
    </MarcoCredito>
  );
}

function VistaSaldoFavor({ pendiente, monto, procesando, error, onConfirmar, onVolver }: {
  pendiente: number;
  /** Lo que se usa: el saldo, hasta lo que falta. */
  monto: number;
  procesando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const resto = Math.round((pendiente - monto) * 100) / 100;
  return (
    <MarcoCredito
      cfg={CFG_SALDO_FAVOR}
      error={error}
      procesando={procesando}
      etiqueta={<>Usar <span className="font-display tabular-nums opacity-90">{fmtMxn(monto)}</span></>}
      onConfirmar={onConfirmar}
      onVolver={onVolver}
    >
      <Renglon l="Por cobrar" v={fmtMxn(pendiente)} />
      <Renglon l="Se usa del saldo a favor" v={fmtMxn(monto)} tono="fuerte" />
      {resto > 0 && <p className="border-t border-line px-[18px] py-3 text-13 text-ink-3">Los {fmtMxn(resto)} que faltan se cobran después con otra forma de pago.</p>}
    </MarcoCredito>
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
  atajo = null,
  moduloCredito = false,
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
  /** `aCredito`: no entró dinero; «Cobro completado» dice «A crédito» y no anuncia un total cobrado. */
  onPagado: (folio: string | null, cambio: number, total: number | null, aCredito?: boolean) => void;
  onCerrar: () => void;
}) {
  const [totales, setTotales] = useState<TotalesTicket>(totalesIniciales);
  const [vista, setVista] = useState<Vista>("propina");
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Propina (P-075): se captura antes de elegir método. El "a cobrar" pasa a total + propina.
  const [propina, setPropina] = useState(0);
  const [sug, setSug] = useState<SugerenciasPropina | null>(null);

  useEffect(() => {
    let activo = true;
    leerSugerenciasPropina(token, sucursalId)
      .then((s) => {
        if (!activo) return;
        setSug(s);
        if (!s.capturar) setVista(atajo ? "atajo" : "selector"); // sucursal sin propina → salta el paso
      })
      .catch(() => {
        if (!activo) return;
        setSug({ porcentajes: [10, 15, 20], capturar: false, libre: true, sin: true });
        setVista(atajo ? "atajo" : "selector");
      });
    return () => { activo = false; };
    // El atajo se fija al abrir el modal y no cambia mientras está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sucursalId]);

  // Total autoritativo (BD) + propina capturada en cliente; la propina ya quedó persistida.
  const totalesEf: TotalesTicket = {
    ...totales,
    total: Math.round((totales.total + propina) * 100) / 100,
    pendiente: Math.round((totales.pendiente + propina) * 100) / 100,
  };

  useEffect(() => {
    onMontoACobrar?.(totalesEf.pendiente);
  }, [totalesEf.pendiente, onMontoACobrar]);

  async function confirmarPropina(monto: number) {
    setError(null);
    setProcesando(true);
    try {
      await establecerPropina(token, totales.ticketId, monto);
      setPropina(monto);
      setVista(atajo ? "atajo" : "selector");
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
    setProcesando(true);
    const antes = totales;
    const clientId = (pagoUnicoId.current ??= nuevoClientId());
    try {
      const t = await aplicarPago(
        token,
        totales.ticketId,
        { metodo: m, monto, montoRecibido: recibido },
        clientId,
      );
      pagoUnicoId.current = null;
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        onPagado(t.folio, t.cambio, t.total);
      } else {
        // queda pendiente: resetea a selector para siguiente pago
        setVista("selector");
      }
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
  useEffect(() => {
    if (vista !== "atajo" || atajoAplicado.current) return;
    atajoAplicado.current = true;
    void aplicarUnPago("EFECTIVO", totalesEf.pendiente, totalesEf.pendiente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

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
  const opciones = opcionesCredito({ moduloCredito, cuenta: cuentaCredito, pendiente: totalesEf.pendiente, montoPagado: totales.montoPagado });
  const extras: MetodoConfig[] = [
    ...(opciones.aCredito ? [{ ...CFG_CREDITO, sub: `Disponible: ${fmtMxn(opciones.aCredito.disponible)}` }] : []),
    ...(opciones.saldoFavor > 0 ? [{ ...CFG_SALDO_FAVOR, sub: `Tiene ${fmtMxn(cuentaCredito?.saldoFavor ?? 0)} a favor` }] : []),
  ];
  /** La base pidió el PIN de `venta.credito_excedido`: su motivo, para el diálogo. */
  const [pinCredito, setPinCredito] = useState<string | null>(null);
  /** `client_id_local` del pago a crédito / con saldo en curso: un reintento no lo duplica (B2-2). */
  const pagoCreditoId = useRef<string | null>(null);

  async function cobrarConCredito(pagar: (clientId: string) => Promise<void>, alQuedarPendiente?: () => void) {
    setError(null);
    setProcesando(true);
    const antes = totales;
    const clientId = (pagoCreditoId.current ??= nuevoClientId());
    try {
      await pagar(clientId);
      pagoCreditoId.current = null;
      const t = await leerTotales(token, totales.ticketId);
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        if (vista === "credito") onPagado(t.folio, 0, null, true);
        else onPagado(t.folio, t.cambio, t.total);
      }
      else { alQuedarPendiente?.(); setVista("selector"); }
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
  // Lo último que se supo de esta caja evita que el selector cambie de botones al abrir.
  const [conTerminal, setConTerminal] = useState(() => {
    try { return sessionStorage.getItem("vimpos.terminal") === "1"; } catch { return false; }
  });

  /**
   * La terminal ya cobró: el pago entra al ticket como débito o crédito, con su referencia. El id del
   * cobro es el `client_id_local`, así que repetirlo (caja apagada a medias, doble aviso) no duplica.
   */
  async function aplicarCobroTerminal(c: CobroTerminal, autorizoId?: string) {
    setError(null);
    setProcesando(true);
    try {
      const t = await aplicarPago(
        token, totales.ticketId,
        pagoDeCobro(c),
        c.id,
      );
      // Si este aviso no llega, el cobro sigue «sin aplicar» en la nube y se reintenta al abrir el
      // cobro otra vez; aplicar_pago ya lo tiene, así que no pasa nada.
      await pedirCobro(token, cajaId, { accion: "confirmar", cobro_id: c.id, autorizo_id: autorizoId }).catch(() => {});
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") onPagado(t.folio, t.cambio, t.total);
      else setVista("selector");
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
      const tiene = await cajaTieneTerminal(token, cajaId);
      if (!activo) return;
      setConTerminal(tiene);
      try { sessionStorage.setItem("vimpos.terminal", tiene ? "1" : "0"); } catch { /* sin almacén no hay recuerdo */ }
      if (!tiene) return;
      const r = await pedirCobro(token, cajaId, { accion: "pendientes" }).catch(() => null);
      const suyo = r?.cobros?.find((c) => c.ticket_id === totales.ticketId);
      if (activo && suyo) void aplicarCobroTerminal(suyo);
    })();
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
      return r.aplicados;
    } finally {
      setProcesando(false);
    }
  }

  function elegirMetodo(m: MetodoPago | "dividido" | "terminal") {
    setError(null);
    if (m === "terminal") {
      setVista("terminal");
    } else if (m === "dividido") {
      setVista("dividido");
    } else if (m === "CREDITO") {
      setVista("credito");
    } else if (m === "SALDO_FAVOR") {
      setVista("saldo");
    } else if (m === "EFECTIVO") {
      setMetodo(m);
      setVista("efectivo");
    } else {
      setMetodo(m);
      setVista("otro");
    }
  }

  /* Escape hace lo que el botón de salida de la vista que está en pantalla: «Volver» en efectivo,
     tarjeta o dividido regresa al selector; en la propina y el selector cierra el cobro. Con un
     pago aplicándose (o el atajo de efectivo exacto corriendo) no hace nada: interrumpir a media
     aplicación de pago es justo lo que no debe poder hacerse por reflejo. */
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const alEscapar = useMemo(
    () => capaVisible([
      // Con el cobro en la terminal tampoco: de ahí se sale cancelándolo, no por reflejo.
      [procesando || pinCredito !== null || vista === "atajo" || vista === "terminal", () => {}],
      [vista === "efectivo" || vista === "otro" || vista === "dividido" || vista === "credito" || vista === "saldo", () => { setError(null); setVista("selector"); }],
      [true, () => cerrarRef.current()],
    ]),
    [procesando, vista, pinCredito],
  );
  useEscape(alEscapar);

  // Tamaño del modal según la vista activa. El efectivo mide lo que su contenido (80 % de la
  // pantalla con tope de 960px): al 80 % de 1920 mediría 1536 y los números quedarían perdidos.
  const esFullscreen = vista === "otro" || vista === "dividido";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={[
          "bg-surface rounded-lg shadow-xl overflow-hidden flex flex-col",
          vista === "efectivo"
            ? "w-[min(960px,80vw)] max-h-full overflow-y-auto"
            : esFullscreen
              ? "w-full max-w-[920px] h-full max-h-[700px]"
              : "w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-6",
        ].join(" ")}
      >
        {vista === "propina" && (
          sug ? (
            <VistaPropina
              totalBase={totales.total}
              ticketId={totales.ticketId}
              sugerencias={sug}
              procesando={procesando}
              error={error}
              onConfirmar={confirmarPropina}
              onAtras={onCerrar}
            />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-ink-3">Cargando…</div>
          )
        )}
        {vista === "atajo" && (
          <div className="flex flex-col items-center gap-2 py-10 text-center" role="status">
            <div className="font-display text-24 font-semibold">Cobrando en efectivo exacto…</div>
            <div className="font-display text-32 font-bold tabular-nums">{fmtMxn(totalesEf.pendiente)}</div>
          </div>
        )}
        {vista === "selector" && (
          <VistaSelector
            totales={totalesEf}
            conTerminal={conTerminal}
            extras={extras}
            error={error}
            onElegir={elegirMetodo}
            onCerrar={onCerrar}
          />
        )}
        {vista === "terminal" && (
          <VistaTerminal
            token={token}
            cajaId={cajaId}
            turnoId={turnoId}
            ejecutaNombre={ejecutaNombre}
            ticketId={totales.ticketId}
            folio={totales.folio}
            monto={totalesEf.pendiente}
            onAprobado={aplicarCobroTerminal}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
        {vista === "credito" && opciones.aCredito && (
          <VistaCredito
            total={totalesEf.pendiente}
            credito={opciones.aCredito}
            procesando={procesando}
            error={error}
            onConfirmar={() => void venderACredito(null)}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
        {vista === "saldo" && opciones.saldoFavor > 0 && (
          <VistaSaldoFavor
            pendiente={totalesEf.pendiente}
            monto={opciones.saldoFavor}
            procesando={procesando}
            error={error}
            onConfirmar={() => void usarSaldoFavor()}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
        {vista === "efectivo" && (
          <VistaEfectivo
            totales={totalesEf}
            procesando={procesando}
            error={error}
            onAplicar={(monto, recibido) => aplicarUnPago("EFECTIVO", monto, recibido)}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
        {vista === "otro" && (
          <VistaOtro
            totales={totalesEf}
            metodo={metodo}
            procesando={procesando}
            error={error}
            onAplicar={(monto) => aplicarUnPago(metodo, monto)}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
        {vista === "dividido" && (
          <VistaDividida
            totales={totalesEf}
            conTerminal={conTerminal}
            procesando={procesando}
            error={error}
            onAplicarPagos={aplicarPagosDivididos}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
      </div>
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
      {esperaDividido && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-[560px] rounded-lg bg-surface p-6 shadow-xl">
            <VistaTerminal
              key={esperaDividido.clave}
              token={token}
              cajaId={cajaId}
              turnoId={turnoId}
              ejecutaNombre={ejecutaNombre}
              ticketId={totales.ticketId}
              folio={totales.folio}
              monto={esperaDividido.monto}
              onAprobado={esperaDividido.aprobado}
              onVolver={esperaDividido.abandonar}
            />
          </div>
        </div>
      )}
    </div>
  );
}
