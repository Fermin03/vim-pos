"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import {
  aplicarPago,
  establecerPropina,
  leerSugerenciasPropina,
  type MetodoPago,
  type SugerenciasPropina,
  type TotalesTicket,
} from "../lib/cobro";
import { nuevoClientId } from "../lib/carrito";

// ─── Íconos SVG inline (calcan los mockups) ────────────────────────────────

function IcoEfectivo({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <circle cx="12" cy="12" r="2.5"/>
      <path d="M6 12h.01M18 12h.01"/>
    </svg>
  );
}

function IcoDebito({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
      <path d="M7 15h2M14 15h3"/>
    </svg>
  );
}

function IcoCredito({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>
  );
}

function IcoTransferencia({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h14l-3-3M21 16H7l3 3"/>
    </svg>
  );
}

function IcoApp({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h3v3M21 21v.01M21 14v.01M17 21v.01"/>
    </svg>
  );
}

function IcoDividido({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18"/>
      <path d="M7 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M17 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/>
    </svg>
  );
}

function IcoBack({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function IcoChevron({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function IcoBackspace({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/>
      <path d="m15 9-4 4M11 9l4 4"/>
    </svg>
  );
}

function IcoTrash({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    </svg>
  );
}

function IcoPlus({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IcoClose({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
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
  {
    valor: "APP_OTRO",
    etiqueta: "App externa",
    sub: "Rappi · Uber · DiDi — la app cobra al cliente",
    icoFn: IcoApp,
    icoBg: "#EAF0F8",
    icoColor: "#2C5AA0",
  },
];

function metodoCfg(v: MetodoPago): MetodoConfig {
  return METODOS.find((m) => m.valor === v) ?? (METODOS[0] as MetodoConfig);
}

// ─── Sub-vistas ──────────────────────────────────────────────────────────────

type Vista = "propina" | "selector" | "efectivo" | "otro" | "dividido";

// ─── Tipos locales ───────────────────────────────────────────────────────────

type PagoAplicado = {
  id: number;
  metodo: MetodoPago;
  monto: number;
};

// ─── Numpad mini ─────────────────────────────────────────────────────────────

function Numpad({
  buffer,
  onChange,
  compact = false,
}: {
  buffer: string;
  onChange: (b: string) => void;
  compact?: boolean;
}) {
  const nkBase = compact
    ? "border border-line-strong rounded bg-surface font-display text-xl font-semibold cursor-pointer min-h-[48px] flex items-center justify-center text-ink transition-colors hover:bg-hover active:bg-line"
    : "border border-line-strong rounded bg-surface font-display text-2xl font-semibold cursor-pointer min-h-[56px] flex items-center justify-center text-ink transition-colors hover:bg-hover active:bg-line";

  function press(key: string) {
    if (key === "back") onChange(buffer.slice(0, -1));
    else if (key === "00") onChange((buffer + "00").slice(0, 7));
    else onChange((buffer + key).slice(0, 7));
  }

  const keys = ["1","2","3","4","5","6","7","8","9","00","0","back"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button key={k} type="button" className={nkBase} onClick={() => press(k)}>
          {k === "back" ? <IcoBackspace cls="w-6 h-6 text-ink-2" /> : k}
        </button>
      ))}
    </div>
  );
}

// ─── Vista: selector de método (P-069) ──────────────────────────────────────

function VistaSelector({
  totales,
  onElegir,
  onCerrar,
}: {
  totales: TotalesTicket;
  onElegir: (m: MetodoPago | "dividido") => void;
  onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Total a cobrar */}
      <div className="text-center px-6 py-5 border border-line rounded-lg bg-sel mb-5">
        <div className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mt-3">Total a cobrar</div>
        <div className="font-display text-[46px] font-bold tracking-tight text-ink tabular-nums leading-none mt-1 mb-1">
          {fmtMxn(totales.total)}
        </div>
      </div>

      <div className="text-[14.5px] font-semibold text-ink-2 mb-3">¿Cómo paga el cliente?</div>

      {/* Lista de métodos */}
      <div className="border border-line rounded-lg overflow-hidden">
        {METODOS.map((m, i) => (
          <button
            key={m.valor}
            type="button"
            onClick={() => onElegir(m.valor)}
            className={[
              "w-full flex items-center gap-4 px-[18px] py-[15px] cursor-pointer transition-colors hover:bg-hover text-left",
              i < METODOS.length - 1 ? "border-b border-line" : "",
            ].join(" ")}
          >
            <span
              className="w-[46px] h-[46px] rounded-[11px] flex items-center justify-center flex-shrink-0"
              style={{ background: m.icoBg, color: m.icoColor }}
            >
              <m.icoFn cls="w-[25px] h-[25px]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16.5px] font-semibold text-ink">{m.etiqueta}</span>
              <span className="block text-[12.5px] text-ink-3 mt-[1px]">{m.sub}</span>
            </span>
            <IcoChevron cls="w-5 h-5 text-ink-3 flex-shrink-0" />
          </button>
        ))}

        {/* Separador dividido */}
        <div className="px-[18px] py-[9px] text-[11px] font-bold uppercase tracking-widest text-ink-3 bg-sel border-t border-line">
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
            <span className="block text-[16.5px] font-semibold text-ink">Pago dividido</span>
            <span className="block text-[12.5px] text-ink-3 mt-[1px]">Combina efectivo, tarjeta u otros en un mismo ticket</span>
          </span>
          <IcoChevron cls="w-5 h-5 text-ink-3 flex-shrink-0" />
        </button>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink-2 border border-line-strong rounded px-[22px] py-[14px] hover:bg-hover hover:text-ink transition-colors"
        >
          <IcoBack cls="w-4 h-4" />
          Volver al ticket
        </button>
        <span className="text-[12.5px] text-ink-3">Efectivo es el más usado</span>
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
  const [buffer, setBuffer] = useState<string>(String(Math.round(pendiente)));
  const [recibBuffer, setRecibBuffer] = useState<string>("");

  // Atajos de denominación
  const denominaciones = [50, 100, 200, 500, 1000];
  function addDenom(d: number) {
    const cur = recibBuffer ? parseInt(recibBuffer, 10) : 0;
    setRecibBuffer(String(cur + d));
  }

  const monto = buffer ? parseInt(buffer, 10) : 0;
  const recibido = recibBuffer ? parseInt(recibBuffer, 10) : 0;
  const cambio = recibido > 0 ? recibido - monto : 0;
  const puedeCobrar = recibido >= monto && monto > 0;

  function handleCobrar() {
    if (!puedeCobrar || procesando) return;
    onAplicar(monto, recibido);
  }

  let changeState: "idle" | "ready" | "short" = "idle";
  if (recibido > 0 && cambio >= 0) changeState = "ready";
  else if (recibido > 0 && cambio < 0) changeState = "short";

  return (
    <div className="flex h-full min-h-0">
      {/* Columna izquierda */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-line px-8 py-6">
        {/* Cabecera */}
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: "#E7F2EC", color: "#2E7D52" }}>
            <IcoEfectivo cls="w-[22px] h-[22px]" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">Pago en efectivo</h1>
            <p className="text-[12.5px] text-ink-3">Ticket #{totales.ticketId.slice(-6)}</p>
          </div>
        </div>

        {/* Filas totales */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between py-3 border-b border-line">
            <span className="text-[15px] text-ink-2 font-medium">Total a cobrar</span>
            <span className="font-display text-[22px] font-semibold text-ink tabular-nums">{fmtMxn(pendiente)}</span>
          </div>
          <div className={["flex items-baseline justify-between py-3", recibido <= 0 ? "opacity-50" : ""].join(" ")}>
            <span className="text-[15px] text-ink-2 font-medium">Efectivo recibido</span>
            <span className="font-display text-[22px] font-semibold text-ink tabular-nums">
              {recibido > 0 ? fmtMxn(recibido) : "$0.00"}
            </span>
          </div>
        </div>

        {/* Cambio prominente */}
        <div
          className={[
            "mt-auto border rounded-lg p-6 text-center transition-all",
            changeState === "ready"
              ? "bg-[#E7F2EC] border-[#BFE0CC]"
              : changeState === "short"
                ? "bg-[#FCF6E8] border-[#EEDFB8]"
                : "border-line",
          ].join(" ")}
        >
          <div
            className={[
              "text-[13px] font-bold uppercase tracking-widest",
              changeState === "ready" ? "text-success" : changeState === "short" ? "text-warning" : "text-ink-3",
            ].join(" ")}
          >
            {changeState === "short" ? "Falta" : "Cambio"}
          </div>
          <div
            className={[
              "font-display font-bold tabular-nums leading-none mt-[6px]",
              changeState === "ready"
                ? "text-[60px] text-success"
                : changeState === "short"
                  ? "text-[30px] text-warning"
                  : "text-[60px] text-ink-3",
            ].join(" ")}
          >
            {changeState === "short"
              ? fmtMxn(Math.abs(cambio))
              : fmtMxn(Math.max(0, cambio))}
          </div>
          <div
            className={[
              "text-[13px] mt-2 tabular-nums",
              changeState === "ready" ? "text-success" : changeState === "short" ? "text-warning font-semibold" : "text-ink-3",
            ].join(" ")}
          >
            {changeState === "short"
              ? "El efectivo recibido es menor al total"
              : changeState === "ready" && cambio === 0
                ? "Pago exacto, sin cambio"
                : changeState === "ready"
                  ? "Entrega este cambio al cliente"
                  : "Captura el efectivo que entrega el cliente"}
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>

      {/* Columna derecha: atajos + numpad + cobrar */}
      <div className="w-[440px] flex-shrink-0 flex flex-col px-6 py-6">
        {/* Atajos de denominación */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {denominaciones.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addDenom(d)}
              className="py-[13px] border border-line-strong bg-surface rounded font-sans text-[15px] font-semibold text-ink cursor-pointer transition-all hover:border-ink hover:bg-hover active:scale-[.97] tabular-nums"
            >
              ${d >= 1000 ? "1,000" : d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setRecibBuffer(String(Math.round(pendiente))); }}
            className="col-span-3 py-[13px] border border-dashed border-line-strong bg-surface rounded font-sans text-[15px] font-semibold text-ink-2 cursor-pointer transition-all hover:text-ink hover:bg-hover tabular-nums"
          >
            Pago exacto · {fmtMxn(pendiente)}
          </button>
        </div>

        {/* Numpad recibido */}
        <div className="flex-1">
          <Numpad buffer={recibBuffer} onChange={setRecibBuffer} />
        </div>

        {/* Botón cobrar */}
        <button
          type="button"
          onClick={handleCobrar}
          disabled={!puedeCobrar || procesando}
          className="mt-3 w-full font-sans text-[18px] font-bold text-white bg-accent border-none py-[18px] rounded-lg cursor-pointer transition-colors hover:bg-accent-hover disabled:bg-line-strong disabled:cursor-not-allowed flex items-center justify-center gap-[10px] shadow-sm"
        >
          {procesando ? "Aplicando…" : <>Cobrar <span className="font-display tabular-nums opacity-90">{fmtMxn(pendiente)}</span></>}
        </button>
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="mt-2 flex items-center justify-center gap-[7px] font-sans text-[13.5px] font-semibold text-ink-3 bg-transparent border-none cursor-pointer py-2 px-3 rounded transition-colors hover:text-ink"
        >
          <IcoBack cls="w-[15px] h-[15px]" />
          Cambiar método de pago
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
  const [buffer, setBuffer] = useState<string>(String(Math.round(pendiente)));
  const cfg = metodoCfg(metodo);
  const monto = buffer ? parseInt(buffer, 10) : 0;

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
            <p className="text-[12.5px] text-ink-3">Ticket #{totales.ticketId.slice(-6)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between py-3 border-b border-line">
            <span className="text-[15px] text-ink-2 font-medium">Total pendiente</span>
            <span className="font-display text-[22px] font-semibold text-ink tabular-nums">{fmtMxn(pendiente)}</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="text-[15px] text-ink-2 font-medium">A aplicar</span>
            <span className="font-display text-[28px] font-bold text-ink tabular-nums">
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
            onClick={() => setBuffer(String(Math.round(pendiente)))}
            className="w-full py-[13px] border border-dashed border-line-strong bg-surface rounded font-sans text-[15px] font-semibold text-ink-2 cursor-pointer transition-all hover:text-ink hover:bg-hover tabular-nums"
          >
            Monto exacto · {fmtMxn(pendiente)}
          </button>
        </div>
        <div className="flex-1">
          <Numpad buffer={buffer} onChange={setBuffer} />
        </div>
        <button
          type="button"
          onClick={() => { if (monto > 0 && !procesando) onAplicar(monto); }}
          disabled={monto <= 0 || procesando}
          className="mt-3 w-full font-sans text-[18px] font-bold text-white bg-accent border-none py-[18px] rounded-lg cursor-pointer transition-colors hover:bg-accent-hover disabled:bg-line-strong disabled:cursor-not-allowed flex items-center justify-center gap-[10px] shadow-sm"
        >
          {procesando ? "Aplicando…" : <>Aplicar pago <span className="font-display tabular-nums opacity-90">{monto > 0 ? fmtMxn(monto) : ""}</span></>}
        </button>
        <button
          type="button"
          onClick={onVolver}
          disabled={procesando}
          className="mt-2 flex items-center justify-center gap-[7px] font-sans text-[13.5px] font-semibold text-ink-3 bg-transparent border-none cursor-pointer py-2 px-3 rounded transition-colors hover:text-ink"
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
  onAgregar,
  onCerrar,
}: {
  pendiente: number;
  onAgregar: (metodo: MetodoPago, monto: number) => void;
  onCerrar: () => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [buffer, setBuffer] = useState<string>("");

  const monto = buffer ? parseInt(buffer, 10) : 0;

  function handleAgregar() {
    if (monto <= 0) return;
    onAgregar(metodo, Math.min(monto, pendiente));
  }

  return (
    <div
      className="fixed inset-0 bg-ink/30 flex items-center justify-center p-6 z-[60] animate-vim-fade"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="w-[440px] max-h-[90vh] bg-surface border border-line rounded-lg shadow-xl flex flex-col animate-vim-pop">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-line">
          <h2 className="font-display text-[18px] font-semibold">Agregar pago</h2>
          <button type="button" onClick={onCerrar} className="w-[34px] h-[34px] border border-line-strong bg-surface rounded flex items-center justify-center text-ink-2 hover:border-ink hover:text-ink transition-colors">
            <IcoClose cls="w-[17px] h-[17px]" />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto">
          {/* Método */}
          <div className="text-[12.5px] font-bold uppercase tracking-widest text-ink-2 mb-3">Método</div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {METODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setMetodo(m.valor)}
                className={[
                  "flex items-center gap-[10px] px-[13px] py-[12px] border rounded cursor-pointer transition-all",
                  metodo === m.valor
                    ? "border-ink bg-sel shadow-[inset_0_0_0_1.5px_#16161A]"
                    : "border-line bg-surface hover:border-line-strong",
                ].join(" ")}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: m.icoBg, color: m.icoColor }}>
                  <m.icoFn cls="w-[18px] h-[18px]" />
                </span>
                <span className="text-[14px] font-semibold text-ink">{m.etiqueta}</span>
              </button>
            ))}
          </div>

          {/* Monto */}
          <div className="text-[12.5px] font-bold uppercase tracking-widest text-ink-2 mb-3">Monto</div>
          <div className="text-center font-display text-[38px] font-bold text-ink tabular-nums mb-2">
            {monto > 0 ? fmtMxn(monto) : "$0.00"}
          </div>
          <div className="text-center text-[12.5px] text-ink-3 mb-4">
            Restante por cubrir: <span className="tabular-nums">{fmtMxn(pendiente)}</span>
            <button
              type="button"
              onClick={() => setBuffer(String(Math.round(pendiente)))}
              className="ml-[6px] border-none bg-hover text-ink-2 font-sans text-[12px] font-semibold px-[11px] py-[4px] rounded-full cursor-pointer hover:bg-line hover:text-ink transition-colors"
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
            className="w-full font-sans text-[15px] font-bold text-white bg-ink border-none py-[14px] rounded cursor-pointer transition-opacity hover:opacity-90 disabled:bg-line-strong disabled:cursor-not-allowed"
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
  procesando,
  error,
  onAplicarPagos,
  onVolver,
}: {
  totales: TotalesTicket;
  procesando: boolean;
  error: string | null;
  /** Aplica TODOS los pagos divididos de una (secuencial en el padre, no en paralelo). */
  onAplicarPagos: (pagos: { metodo: MetodoPago; monto: number }[]) => void | Promise<void>;
  onVolver: () => void;
}) {
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [seq, setSeq] = useState(0);
  const [mostrarModal, setMostrarModal] = useState(false);

  const pendiente = totales.pendiente;
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  const restante = Math.max(0, +(pendiente - pagado).toFixed(2));
  const cubierto = restante <= 0 && pagos.length > 0;
  const pct = Math.min(100, pendiente > 0 ? (pagado / pendiente) * 100 : 0);

  function agregarPago(metodo: MetodoPago, monto: number) {
    const id = seq + 1;
    setSeq(id);
    setPagos((prev) => [...prev, { id, metodo, monto }]);
    setMostrarModal(false);
  }

  function quitarPago(id: number) {
    setPagos((prev) => prev.filter((p) => p.id !== id));
  }

  function completar() {
    if (!cubierto || procesando) return;
    // FIX (auditoría): se enviaban N pagos en paralelo (carrera en la ruta de dinero).
    // Ahora se manda la lista completa y el padre los aplica SECUENCIALMENTE.
    void onAplicarPagos(pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })));
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
            <p className="text-[12.5px] text-ink-3">Cubre el total con varios métodos</p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="border border-line rounded-lg p-5 mb-5 bg-sel">
          <div className="flex justify-between gap-4">
            <div className="text-center flex-1">
              <div className="text-[11.5px] font-bold uppercase tracking-widest text-ink-3">Total</div>
              <div className="font-display text-[24px] font-semibold text-ink tabular-nums mt-[3px]">{fmtMxn(pendiente)}</div>
            </div>
            <div className="w-px bg-line" />
            <div className="text-center flex-1">
              <div className="text-[11.5px] font-bold uppercase tracking-widest text-ink-3">Pagado</div>
              <div className="font-display text-[24px] font-semibold text-ink tabular-nums mt-[3px]">{fmtMxn(pagado)}</div>
            </div>
            <div className="w-px bg-line" />
            <div className="text-center flex-1">
              <div className={["text-[11.5px] font-bold uppercase tracking-widest", cubierto ? "text-success" : "text-accent"].join(" ")}>
                {cubierto ? "Cubierto" : "Restante"}
              </div>
              <div className={["font-display font-bold tabular-nums mt-[3px]", cubierto ? "text-[24px] text-success" : "text-[30px] text-accent"].join(" ")}>
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
        <div className="text-[13px] font-bold text-ink mb-3">Pagos agregados</div>
        <div className="flex flex-col gap-2 mb-4">
          {pagos.length === 0 ? (
            <div className="text-center py-5 text-[13.5px] text-ink-3 border border-dashed border-line-strong rounded">
              Aún no hay pagos. Toca "Agregar pago" para empezar.
            </div>
          ) : (
            pagos.map((p) => {
              const cfg = metodoCfg(p.metodo);
              return (
                <div key={p.id} className="flex items-center gap-3 px-[14px] py-[12px] border border-line rounded animate-vim-fade">
                  <span className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: cfg.icoBg, color: cfg.icoColor }}>
                    <cfg.icoFn cls="w-[19px] h-[19px]" />
                  </span>
                  <span className="flex-1 text-[14.5px] font-semibold text-ink">{cfg.etiqueta}</span>
                  <span className="font-display text-[16px] font-semibold text-ink tabular-nums">{fmtMxn(p.monto)}</span>
                  <button
                    type="button"
                    onClick={() => quitarPago(p.id)}
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
          className="w-full inline-flex items-center justify-center gap-[9px] font-sans text-[14.5px] font-semibold text-ink bg-surface border border-line-strong py-[14px] rounded cursor-pointer transition-all hover:border-ink hover:bg-hover disabled:opacity-45 disabled:cursor-default"
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
          className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink-2 border border-line-strong rounded px-[20px] py-[14px] hover:bg-hover hover:text-ink transition-colors disabled:opacity-50"
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
    mode === "pct" ? calcTip(pctSel) : mode === "free" ? (freeBuffer ? parseInt(freeBuffer, 10) : 0) : 0;
  const grand = Math.round((totalBase + tip) * 100) / 100;

  const altBase =
    "inline-flex items-center justify-center gap-2 px-[13px] py-[13px] border rounded text-[14.5px] font-semibold cursor-pointer transition-all";
  const altOn = "border-ink bg-sel text-ink shadow-[inset_0_0_0_1.5px_#16161A]";
  const altOff = "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink";

  return (
    <div className="flex flex-col">
      {/* Prompt */}
      <div className="mb-5 text-center">
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.07em] text-ink-3">
          Cobro · Ticket #{ticketId.slice(-6)}
        </div>
        <h1 className="font-display text-[25px] font-semibold tracking-tight">¿Agregar propina?</h1>
        <p className="mt-1 text-[14px] text-ink-2">Se calcula sobre el total de {fmtMxn(totalBase)}</p>
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
              <span className="font-display text-[24px] font-bold text-ink">{p}%</span>
              <span className={["text-[13px] font-semibold tabular-nums", on ? "text-ink-2" : "text-ink-3"].join(" ")}>
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
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Sin propina
            </button>
          )}
        </div>
      )}

      {/* Numpad de monto libre */}
      {mode === "free" && (
        <div className="mb-5">
          <div className="mb-3 text-center font-display text-[34px] font-bold tabular-nums text-ink">
            {fmtMxn(freeBuffer ? parseInt(freeBuffer, 10) : 0)}
          </div>
          <div className="mx-auto max-w-[300px]">
            <Numpad buffer={freeBuffer} onChange={setFreeBuffer} compact />
          </div>
        </div>
      )}

      {/* Resumen */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line px-[18px] py-[13px]">
          <span className="text-[14.5px] text-ink-2">Total del ticket</span>
          <span className="font-display text-[16px] font-semibold tabular-nums text-ink">{fmtMxn(totalBase)}</span>
        </div>
        <div className="flex items-center justify-between border-b border-line px-[18px] py-[13px]">
          <span className="text-[14.5px] font-semibold text-success">Propina</span>
          <span className="font-display text-[16px] font-semibold tabular-nums text-success">{fmtMxn(tip)}</span>
        </div>
        <div className="flex items-center justify-between bg-sel px-[18px] py-[13px]">
          <span className="text-[15px] font-bold uppercase tracking-[0.03em] text-ink">Total a cobrar</span>
          <span className="font-display text-[28px] font-bold tabular-nums tracking-[-0.02em] text-ink">{fmtMxn(grand)}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAtras}
          disabled={procesando}
          className="inline-flex items-center gap-2 rounded border border-line-strong px-[20px] py-[14px] text-[15px] font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <IcoBack cls="w-4 h-4" />
          Atrás
        </button>
        <button
          type="button"
          onClick={() => { if (!procesando) onConfirmar(tip); }}
          disabled={procesando}
          className="inline-flex items-center gap-[9px] rounded bg-accent px-[30px] py-[14px] text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {procesando ? "Guardando…" : <>Confirmar <span className="font-display tabular-nums opacity-90">{fmtMxn(grand)}</span></>}
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ModalCobro({
  token,
  sucursalId,
  totalesIniciales,
  onPagado,
  onCerrar,
}: {
  token: string;
  sucursalId: string;
  totalesIniciales: TotalesTicket;
  onPagado: (folio: string | null, cambio: number) => void;
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
        if (!s.capturar) setVista("selector"); // sucursal sin propina → salta el paso
      })
      .catch(() => {
        if (!activo) return;
        setSug({ porcentajes: [10, 15, 20], capturar: false, libre: true, sin: true });
        setVista("selector");
      });
    return () => { activo = false; };
  }, [token, sucursalId]);

  // Total autoritativo (BD) + propina capturada en cliente; la propina ya quedó persistida.
  const totalesEf: TotalesTicket = {
    ...totales,
    total: Math.round((totales.total + propina) * 100) / 100,
    pendiente: Math.round((totales.pendiente + propina) * 100) / 100,
  };

  async function confirmarPropina(monto: number) {
    setError(null);
    setProcesando(true);
    try {
      await establecerPropina(token, totales.ticketId, monto);
      setPropina(monto);
      setVista("selector");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fijar la propina");
    } finally {
      setProcesando(false);
    }
  }

  async function aplicarUnPago(m: MetodoPago, monto: number, recibido?: number) {
    setError(null);
    if (!(monto > 0)) { setError("Monto inválido"); return; }
    setProcesando(true);
    try {
      const t = await aplicarPago(
        token,
        totales.ticketId,
        { metodo: m, monto, montoRecibido: recibido },
        nuevoClientId(),
      );
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") {
        onPagado(t.folio, t.cambio);
      } else {
        // queda pendiente: resetea a selector para siguiente pago
        setVista("selector");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cobrar");
    } finally {
      setProcesando(false);
    }
  }

  /** Aplica una lista de pagos divididos SECUENCIALMENTE (no en paralelo). Navega solo al final. */
  async function aplicarPagosDivididos(lista: { metodo: MetodoPago; monto: number }[]) {
    setError(null);
    if (lista.length === 0) return;
    setProcesando(true);
    try {
      let t = totales;
      for (const p of lista) {
        if (!(p.monto > 0)) continue;
        t = await aplicarPago(token, totales.ticketId, { metodo: p.metodo, monto: p.monto }, nuevoClientId());
      }
      setTotales(t);
      if (t.estadoFiscal === "PAGADO") onPagado(t.folio, t.cambio);
      else setError("Los pagos no cubrieron el total del ticket.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cobrar");
    } finally {
      setProcesando(false);
    }
  }

  function elegirMetodo(m: MetodoPago | "dividido") {
    setError(null);
    if (m === "dividido") {
      setVista("dividido");
    } else if (m === "EFECTIVO") {
      setMetodo(m);
      setVista("efectivo");
    } else {
      setMetodo(m);
      setVista("otro");
    }
  }

  // Tamaño del modal según la vista activa
  const esFullscreen = vista === "efectivo" || vista === "otro" || vista === "dividido";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={[
          "bg-surface rounded-lg shadow-xl overflow-hidden flex flex-col",
          esFullscreen
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
        {vista === "selector" && (
          <VistaSelector
            totales={totalesEf}
            onElegir={elegirMetodo}
            onCerrar={onCerrar}
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
            procesando={procesando}
            error={error}
            onAplicarPagos={aplicarPagosDivididos}
            onVolver={() => { setError(null); setVista("selector"); }}
          />
        )}
      </div>
    </div>
  );
}
