"use client";
import { LogoVim } from "@vim/ui/styles";
import { useCallback, useEffect, useState } from "react";
import { BotonVolver } from "./boton-volver";
import { type DatosCaja } from "../lib/turno";
import { leerMesas, type MesaVista } from "../lib/mesas";
import {
  CANALES,
  asignarMesa,
  cancelarReservacion,
  crearReservacion,
  horaDe,
  hoyLocal,
  labelCanal,
  labelEstado,
  leerReservacionesDelDia,
  marcarNoShow,
  modificarReservacion,
  nuevaReservaSchema,
  type CanalReservacion,
  type Reservacion,
  type ReservacionEstado,
} from "../lib/reservaciones";

/**
 * Reservaciones del día, desde Comedor.
 *
 * ES UNA PANTALLA DISTINTA A LA DEL PANEL, A PROPÓSITO
 *
 * Misma tabla, uso opuesto: el dueño planea la semana desde una computadora; el
 * cajero resuelve la noche con una fila esperando y los dedos en una pantalla
 * táctil. Por eso aquí manda UN día —el que se está trabajando—, la hora es lo
 * más grande de cada renglón, y las acciones son botones de dedo, no un menú.
 *
 * ORDEN DE LAS ACCIONES
 *
 * «Sentar» va primero y es el único botón sólido de la fila. Es lo que se hace
 * cincuenta veces por noche; las otras tres son excepciones. Poner las cuatro
 * con el mismo peso obliga a leer cada vez, y leer es justo lo que no hay tiempo
 * de hacer cuando el cliente ya está parado enfrente.
 */

const ESTILO_ESTADO: Record<ReservacionEstado, { bg: string; text: string }> = {
  CONFIRMADA: { bg: "#EAF0F8", text: "#2C5AA0" },
  LLEGO: { bg: "#EAF4EE", text: "#2E7D52" },
  NO_SHOW: { bg: "#FBECEA", text: "#C0392B" },
  CANCELADA: { bg: "#F2F2F0", text: "#6E6E73" },
  TERMINADA: { bg: "#F2F2F0", text: "#6E6E73" },
};

const inputCls =
  "h-11 w-full rounded border border-line-strong px-3 text-[14px] outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const labelCls = "mb-1.5 block text-[13px] font-medium text-ink-2";

type Modo =
  | { t: "lista" }
  | { t: "nueva" }
  | { t: "editar"; r: Reservacion }
  | { t: "mesa"; r: Reservacion }
  | { t: "cancelar"; r: Reservacion };

export function PantallaReservaciones({
  token,
  caja,
  onSalir,
}: {
  token: string;
  caja: DatosCaja;
  onSalir: () => void;
}) {
  const [dia, setDia] = useState(hoyLocal());
  const [lista, setLista] = useState<Reservacion[] | null>(null);
  const [mesas, setMesas] = useState<MesaVista[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>({ t: "lista" });
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    setError(null);
    try {
      const [r, m] = await Promise.all([
        leerReservacionesDelDia(token, caja.sucursal_id, dia),
        leerMesas(token, caja.sucursal_id).catch(() => [] as MesaVista[]),
      ]);
      setLista(r);
      setMesas(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las reservaciones");
      setLista([]);
    }
  }, [token, caja.sucursal_id, dia]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  async function ejecutar(fn: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      setModo({ t: "lista" });
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setOcupado(false);
    }
  }

  const pendientes = (lista ?? []).filter((r) => r.estado === "CONFIRMADA").length;
  const llegaron = (lista ?? []).filter((r) => r.estado === "LLEGO").length;
  const comensales = (lista ?? [])
    .filter((r) => r.estado === "CONFIRMADA" || r.estado === "LLEGO")
    .reduce((s, r) => s + r.comensales, 0);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-3.5">
        <BotonVolver onClick={onSalir} />
        <div className="mr-auto flex items-center gap-3">
          <LogoVim className="h-8 w-8" />
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Reservaciones</div>
            <div className="text-[11.5px] text-ink-3">
              {pendientes} por llegar · <span className="text-success">{llegaron} sentadas</span> · {comensales} personas
            </div>
          </div>
        </div>
        <input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="h-10 rounded border border-line-strong px-2.5 text-[13px] outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={() => setModo({ t: "nueva" })}
          className="h-10 rounded bg-ink px-4 text-[13.5px] font-semibold text-white transition hover:opacity-90"
        >
          Nueva reservación
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {lista === null && <p className="text-center text-ink-3">Cargando…</p>}

        {lista !== null && lista.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 10h18M8 2v4M16 2v4" />
            </svg>
            <p className="text-[17px] font-semibold text-ink-2">Sin reservaciones este día</p>
            <p className="text-[13px]">Con «Nueva reservación» la agendas en el momento, por teléfono o en la puerta.</p>
          </div>
        )}

        {lista !== null && lista.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {lista.map((r) => (
              <Fila key={r.id} r={r} onModo={setModo} onNoShow={() => void ejecutar(() => marcarNoShow(token, r.id))} ocupado={ocupado} />
            ))}
          </div>
        )}
      </div>

      {modo.t === "nueva" && (
        <ModalNueva
          ocupado={ocupado}
          onCerrar={() => setModo({ t: "lista" })}
          onGuardar={(input) => void ejecutar(() => crearReservacion(token, caja.sucursal_id, input))}
        />
      )}
      {modo.t === "editar" && (
        <ModalEditar
          r={modo.r}
          ocupado={ocupado}
          onCerrar={() => setModo({ t: "lista" })}
          onGuardar={(cambios) => void ejecutar(() => modificarReservacion(token, modo.r.id, cambios))}
        />
      )}
      {modo.t === "mesa" && (
        <ModalMesa
          r={modo.r}
          mesas={mesas}
          ocupado={ocupado}
          onCerrar={() => setModo({ t: "lista" })}
          onElegir={(mesaId) => void ejecutar(() => asignarMesa(token, modo.r.id, mesaId))}
        />
      )}
      {modo.t === "cancelar" && (
        <ModalCancelar
          r={modo.r}
          ocupado={ocupado}
          onCerrar={() => setModo({ t: "lista" })}
          onConfirmar={(motivo) => void ejecutar(() => cancelarReservacion(token, modo.r.id, motivo))}
        />
      )}
    </div>
  );
}

function Fila({
  r,
  onModo,
  onNoShow,
  ocupado,
}: {
  r: Reservacion;
  onModo: (m: Modo) => void;
  onNoShow: () => void;
  ocupado: boolean;
}) {
  const st = ESTILO_ESTADO[r.estado];
  const viva = r.estado === "CONFIRMADA";
  const btn =
    "h-10 rounded border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-4">
      {/* La hora es lo que se busca al mirar la lista, así que es lo más grande. */}
      <div className="w-[92px] flex-shrink-0">
        <div className="font-display text-[21px] font-bold leading-none tabular-nums">{horaDe(r.fechaHora)}</div>
        <div className="mt-1 text-[11.5px] text-ink-3">{r.folio}</div>
      </div>

      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{r.clienteNombre}</span>
          <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: st.bg, color: st.text }}>
            {labelEstado(r.estado)}
          </span>
          {r.mesaNumero != null && (
            <span className="rounded bg-sel px-1.5 py-0.5 text-[11px] font-bold text-ink-2">Mesa {r.mesaNumero}</span>
          )}
        </div>
        <div className="mt-0.5 text-[12.5px] text-ink-3">
          {r.comensales} {r.comensales === 1 ? "persona" : "personas"} · {labelCanal(r.canal)}
          {r.clienteTelefono && ` · ${r.clienteTelefono}`}
        </div>
        {r.nota && <div className="mt-1 text-[12.5px] font-medium text-warning">{r.nota}</div>}
      </div>

      {viva && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onModo({ t: "mesa", r })}
            className="h-10 rounded bg-ink px-4 text-[13.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Asignar mesa
          </button>
          <button type="button" disabled={ocupado} onClick={() => onModo({ t: "editar", r })} className={btn}>
            Modificar
          </button>
          <button type="button" disabled={ocupado} onClick={onNoShow} className={btn}>
            No llegó
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onModo({ t: "cancelar", r })}
            className="h-10 rounded border border-danger/40 px-3 text-[13px] font-semibold text-danger transition hover:bg-[#FBECEA] disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

/** Marco común de los cuatro diálogos. Táctil: ancho generoso y cierre grande. */
function Dialogo({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(22,22,26,.45)] p-4">
      <div className="max-h-[88vh] w-[520px] overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
        <div className="mb-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">{titulo}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Pie({
  ocupado,
  onCerrar,
  onOk,
  okLabel,
  peligro,
}: {
  ocupado: boolean;
  onCerrar: () => void;
  onOk: () => void;
  okLabel: string;
  peligro?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCerrar}
        className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
      >
        Cerrar
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={onOk}
        className={[
          "h-11 rounded px-5 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40",
          peligro ? "bg-danger" : "bg-ink",
        ].join(" ")}
      >
        {okLabel}
      </button>
    </div>
  );
}

function ModalNueva({
  ocupado,
  onCerrar,
  onGuardar,
}: {
  ocupado: boolean;
  onCerrar: () => void;
  onGuardar: (i: {
    clienteNombre: string;
    clienteTelefono: string;
    fechaHora: string;
    comensales: number;
    canal: CanalReservacion;
    nota: string;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  // Arranca en dentro de dos horas, redondeado: es lo más común al tomar una
  // reserva por teléfono, y evita teclear la fecha entera en una pantalla táctil.
  const [cuando, setCuando] = useState(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() >= 30 ? 30 : 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [personas, setPersonas] = useState("2");
  const [canal, setCanal] = useState<CanalReservacion>("TELEFONO");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function guardar() {
    const datos = {
      clienteNombre: nombre,
      clienteTelefono: tel,
      fechaHora: cuando,
      comensales: Number(personas || 0),
      canal,
      nota,
    };
    const ok = nuevaReservaSchema.safeParse(datos);
    if (!ok.success) {
      setErr(ok.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }
    setErr(null);
    onGuardar(datos);
  }

  return (
    <Dialogo titulo="Nueva reservación" sub="A nombre de quién, cuándo y cuántos.">
      <div className="flex flex-col gap-3.5">
        <div>
          <label className={labelCls} htmlFor="r-nombre">A nombre de</label>
          <input id="r-nombre" className={inputCls} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="r-tel">Teléfono · opcional</label>
            <input id="r-tel" className={inputCls} value={tel} maxLength={20} inputMode="tel" onChange={(e) => setTel(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="r-pers">Personas</label>
            <input id="r-pers" className={inputCls} value={personas} inputMode="numeric" onChange={(e) => setPersonas(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="r-cuando">Día y hora</label>
          <input id="r-cuando" type="datetime-local" className={inputCls} value={cuando} onChange={(e) => setCuando(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Cómo la pidió</label>
          <div className="flex flex-wrap gap-1.5">
            {CANALES.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setCanal(c.v)}
                className={[
                  "h-10 rounded border px-3 text-[13px] font-semibold transition",
                  canal === c.v ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
                ].join(" ")}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="r-nota">Nota · opcional</label>
          <input id="r-nota" className={inputCls} value={nota} maxLength={300} placeholder="Cumpleaños, alergia, mesa junto a la ventana…" onChange={(e) => setNota(e.target.value)} />
        </div>
        {err && <p className="text-[13px] font-medium text-danger" role="alert">{err}</p>}
      </div>
      <Pie ocupado={ocupado} onCerrar={onCerrar} onOk={guardar} okLabel="Guardar reservación" />
    </Dialogo>
  );
}

function ModalEditar({
  r,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  r: Reservacion;
  ocupado: boolean;
  onCerrar: () => void;
  onGuardar: (c: { clienteNombre: string; clienteTelefono: string; fechaHora: string; comensales: number; nota: string }) => void;
}) {
  const paraInput = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [nombre, setNombre] = useState(r.clienteNombre);
  const [tel, setTel] = useState(r.clienteTelefono);
  const [cuando, setCuando] = useState(paraInput(r.fechaHora));
  const [personas, setPersonas] = useState(String(r.comensales));
  const [nota, setNota] = useState(r.nota);
  const [err, setErr] = useState<string | null>(null);

  function guardar() {
    const n = Number(personas || 0);
    if (!nombre.trim()) { setErr("El nombre no puede quedar vacío"); return; }
    if (n < 1) { setErr("Mínimo 1 persona"); return; }
    setErr(null);
    onGuardar({ clienteNombre: nombre, clienteTelefono: tel, fechaHora: cuando, comensales: n, nota });
  }

  return (
    <Dialogo titulo="Modificar reservación" sub={`${r.folio} · a nombre de ${r.clienteNombre}`}>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className={labelCls} htmlFor="e-nombre">A nombre de</label>
          <input id="e-nombre" className={inputCls} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="e-tel">Teléfono</label>
            <input id="e-tel" className={inputCls} value={tel} maxLength={20} inputMode="tel" onChange={(e) => setTel(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="e-pers">Personas</label>
            <input id="e-pers" className={inputCls} value={personas} inputMode="numeric" onChange={(e) => setPersonas(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="e-cuando">Día y hora</label>
          <input id="e-cuando" type="datetime-local" className={inputCls} value={cuando} onChange={(e) => setCuando(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="e-nota">Nota</label>
          <input id="e-nota" className={inputCls} value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
        </div>
        {err && <p className="text-[13px] font-medium text-danger" role="alert">{err}</p>}
      </div>
      <Pie ocupado={ocupado} onCerrar={onCerrar} onOk={guardar} okLabel="Guardar cambios" />
    </Dialogo>
  );
}

function ModalMesa({
  r,
  mesas,
  ocupado,
  onCerrar,
  onElegir,
}: {
  r: Reservacion;
  mesas: MesaVista[];
  ocupado: boolean;
  onCerrar: () => void;
  onElegir: (mesaId: string) => void;
}) {
  /* Solo se ofrecen las libres: sentar a alguien en una mesa ocupada no es una
     opción que el cajero deba poder tocar por error. Las que no alcanzan para el
     grupo se muestran igual pero avisadas — a veces se juntan dos mesas, y
     esconderlas sería decidir por el cajero algo que él ve mejor que el sistema. */
  const libres = mesas.filter((m) => m.estado === "LIBRE");

  return (
    <Dialogo
      titulo="Asignar mesa"
      sub={`${r.clienteNombre} · ${r.comensales} ${r.comensales === 1 ? "persona" : "personas"} · ${horaDe(r.fechaHora)}`}
    >
      {libres.length === 0 ? (
        <p className="rounded border border-line bg-sel p-5 text-center text-[13.5px] text-ink-2">
          Ahora mismo no hay mesas libres. En cuanto se cobre una cuenta, la mesa aparece aquí.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
          {libres.map((m) => {
            const chica = m.capacidad < r.comensales;
            return (
              <button
                key={m.mesaId}
                type="button"
                disabled={ocupado}
                onClick={() => onElegir(m.mesaId)}
                className="flex flex-col items-start gap-0.5 rounded border border-[#BFE0CC] bg-[#EAF4EE] p-3 text-left transition hover:shadow-[0_4px_14px_rgba(22,22,26,.08)] disabled:opacity-40"
              >
                <span className="font-display text-[20px] font-extrabold tabular-nums text-[#2E7D52]">{m.numero}</span>
                <span className="text-[11.5px] font-medium text-ink-3">
                  {m.capacidad} {m.capacidad === 1 ? "lugar" : "lugares"}
                </span>
                {chica && <span className="text-[11px] font-bold text-warning">Quedan chicos</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-3">
        Al asignarla, la reservación queda como <b>llegó</b> y la mesa deja de aparecer libre en el mapa. La cuenta se
        abre desde Comedor, como siempre.
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onCerrar}
          className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
        >
          Cerrar
        </button>
      </div>
    </Dialogo>
  );
}

function ModalCancelar({
  r,
  ocupado,
  onCerrar,
  onConfirmar,
}: {
  r: Reservacion;
  ocupado: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  /* Motivos de un toque para lo que pasa de verdad, y campo libre para el resto.
     El motivo es obligatorio en la base; obligar a teclearlo en cada cancelación
     acabaría produciendo un "x" repetido que no le sirve a nadie. */
  const MOTIVOS = ["El cliente canceló", "No contesta", "Se pasó la hora", "El restaurante no puede"];
  const [motivo, setMotivo] = useState(MOTIVOS[0]!);
  const [otro, setOtro] = useState("");
  const usarOtro = motivo === "__otro";
  const texto = usarOtro ? otro.trim() : motivo;

  return (
    <Dialogo titulo="Cancelar reservación" sub={`${r.folio} · ${r.clienteNombre} · ${horaDe(r.fechaHora)}`}>
      <div className="flex flex-col gap-1.5">
        {[...MOTIVOS, "__otro"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={[
              "h-11 rounded border px-3 text-left text-[14px] font-semibold transition",
              motivo === m ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
            ].join(" ")}
          >
            {m === "__otro" ? "Otro motivo…" : m}
          </button>
        ))}
        {usarOtro && (
          <input
            className={`${inputCls} mt-1.5`}
            value={otro}
            maxLength={200}
            placeholder="¿Qué pasó?"
            onChange={(e) => setOtro(e.target.value)}
            autoFocus
          />
        )}
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">
        Si tenía mesa apartada, se libera. La reservación no se borra: queda cancelada con su motivo.
      </p>
      <Pie
        ocupado={ocupado || texto.length === 0}
        onCerrar={onCerrar}
        onOk={() => onConfirmar(texto)}
        okLabel="Sí, cancelar"
        peligro
      />
    </Dialogo>
  );
}
