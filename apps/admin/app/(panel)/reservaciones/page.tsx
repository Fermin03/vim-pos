"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import {
  cancelarReservacion,
  CANALES,
  confirmarLlegada,
  crearReservacion,
  labelCanal,
  labelEstadoReserva,
  listarReservaciones,
  marcarNoShow,
  reservacionSchema,
  type CanalReservacion,
  type Reservacion,
  type ReservacionEstado,
} from "../../lib/reservaciones";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const COLOR: Record<ReservacionEstado, string> = {
  CONFIRMADA: "bg-[#EAF0F8] text-[#2C5AA0]", LLEGO: "bg-[#EAF3EE] text-success",
  CANCELADA: "bg-[#F2F2F0] text-ink-3", NO_SHOW: "bg-[#FBECEA] text-danger", TERMINADA: "bg-[#F2F2F0] text-ink-3",
};

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const VACIO = { cliente_nombre: "", cliente_telefono: "", fecha_hora: "", comensales: "2", canal: "TELEFONO" as CanalReservacion, nota: "" };

export default function ReservacionesPage() {
  const [dia, setDia] = useState(hoyISO());
  const [lista, setLista] = useState<Reservacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ ...VACIO });
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async (d: string) => {
    try {
      setLista(await listarReservaciones(d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    recargar(dia);
  }, [dia, recargar]);

  async function guardar() {
    setError(null);
    const parsed = reservacionSchema.safeParse({ ...form, comensales: Number(form.comensales || 0) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await crearReservacion(parsed.data);
      setOkMsg("Reservación creada.");
      setTimeout(() => setOkMsg(null), 2500);
      setCreando(false);
      setForm({ ...VACIO });
      recargar(dia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  }

  async function accion(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      recargar(dia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  return (
    <>
      <PageHeader
        titulo="Reservaciones"
        subtitulo="Agenda del día: confirma llegadas, marca no-shows y cancela."
        right={<Button onClick={() => { setCreando(true); setForm({ ...VACIO, fecha_hora: `${dia}T20:00` }); }}>Nueva reservación</Button>}
      />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !creando && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        <div className="mb-4 flex items-center gap-3">
          <label className="text-[13px] font-medium text-ink-2" htmlFor="dia">Día</label>
          <input id="dia" type="date" className={`${input} w-44`} value={dia} onChange={(e) => setDia(e.target.value)} />
          <span className="text-[13px] text-ink-3">{lista?.length ?? 0} reservaciones</span>
        </div>

        {lista === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {lista && lista.length === 0 && !creando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">Sin reservaciones este día</p>
            <p className="mt-1 text-[13px]">Crea una con el botón de arriba.</p>
          </div>
        )}
        {lista && lista.length > 0 && (
          <div className="flex flex-col gap-2">
            {lista.map((r) => {
              const hora = new Date(r.fechaHora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
              const activa = r.estado === "CONFIRMADA";
              return (
                <div key={r.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                  <div className="text-center">
                    <div className="font-display text-[18px] font-bold tabular-nums">{hora}</div>
                    <div className="text-[11px] text-ink-3">{r.comensales} pers.</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.clienteNombre}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${COLOR[r.estado]}`}>{labelEstadoReserva(r.estado)}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-3">
                      {r.clienteTelefono || "—"} · {labelCanal(r.canal)}{r.nota ? ` · ${r.nota}` : ""}
                    </div>
                  </div>
                  {activa && (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => accion(() => confirmarLlegada(r.id))} className="rounded border border-line-strong px-2.5 py-1.5 text-[12px] font-semibold text-success hover:border-success">Llegó</button>
                      <button type="button" onClick={() => accion(() => marcarNoShow(r.id))} className="rounded border border-line-strong px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:border-ink">No llegó</button>
                      <button type="button" onClick={() => { const m = prompt("Motivo de cancelación:"); if (m) accion(() => cancelarReservacion(r.id, m)); }} className="rounded border border-line-strong px-2.5 py-1.5 text-[12px] font-semibold text-ink-3 hover:text-danger">Cancelar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {creando && (
          <div className="mt-5 max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">Nueva reservación</div>
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="r-nom">Nombre del cliente</label>
                  <input id="r-nom" className={input} value={form.cliente_nombre} maxLength={150} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} placeholder="María López" />
                </div>
                <div>
                  <label className={label} htmlFor="r-tel">Teléfono</label>
                  <input id="r-tel" className={input} value={form.cliente_telefono} maxLength={20} onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value.replace(/[^0-9+ ]/g, "") })} placeholder="477 123 4567" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={label} htmlFor="r-fh">Fecha y hora</label>
                  <input id="r-fh" type="datetime-local" className={input} value={form.fecha_hora} onChange={(e) => setForm({ ...form, fecha_hora: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor="r-com">Comensales</label>
                  <input id="r-com" className={input} value={form.comensales} inputMode="numeric" onChange={(e) => setForm({ ...form, comensales: e.target.value.replace(/\D/g, "") })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="r-canal">Canal</label>
                  <select id="r-canal" className={input} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as CanalReservacion })}>
                    {CANALES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="r-nota">Nota · opcional</label>
                  <input id="r-nota" className={input} value={form.nota} maxLength={300} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Cumpleaños, ventana…" />
                </div>
              </div>
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => setCreando(false)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Crear"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
