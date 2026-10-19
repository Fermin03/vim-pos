"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icono, Modal } from "@vim/ui/styles";
import { horaCorta, tramosEncadenados } from "@vim/db/agenda";
import {
  agregarEnEspera, colaboradoresDelDia, motivoBloqueo, duracionCon, entradaCita, guardarCita, horaSeFijaAlGuardar, precioCon, serviciosAgenda,
  type CitaDia, type ColaboradorDia, type RenglonCita, type ServicioAgenda,
} from "../lib/agenda";
import { TelefonoDuplicado, buscarClientesCuenta, normalizarTelefono, registrarClienteCuenta, type ClienteCuenta } from "../lib/clientes-cuenta";
import { fmtMxn } from "../lib/turno";
import { nuevoClientId } from "../lib/carrito";

/** Cómo se abre: nueva (desde un hueco, el botón o la ficha de una clienta), en edición o para la espera. */
export type AbrirCita = { cita?: CitaDia; inicio?: Date; usuarioId?: string; cliente?: ClienteCuenta; espera?: boolean };

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-15 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const etiqueta = "mb-1 block text-13 font-medium text-ink-2";

/** «YYYY-MM-DDTHH:MM» de un instante en México (UTC−6 fijo, como `inicioDiaMx`). */
const enMx = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 16);
/** El siguiente cuarto de hora. */
const proximoCuarto = () => new Date(Math.ceil(Date.now() / 900_000) * 900_000);

type Clienta = { id: string | null; nombre: string; telefono: string; email: string };
const SIN_CLIENTA: Clienta = { id: null, nombre: "", telefono: "", email: "" };

/**
 * Nueva cita, mover una (edición) o agregar a la espera. Muestra los tramos encadenados antes de
 * guardar; la base es la que rechaza un empalme y su motivo se pinta aquí.
 */
export function ModalCita({ token, tenantId, sucursalId, abrir, onGuardada, onCerrar }: {
  token: string;
  tenantId: string;
  sucursalId: string;
  abrir: AbrirCita;
  onGuardada: () => void;
  onCerrar: () => void;
}) {
  const { cita, espera } = abrir;
  const inicial = enMx(abrir.inicio ?? cita?.inicia ?? proximoCuarto());
  const [dia, setDia] = useState(inicial.slice(0, 10));
  const [hora, setHora] = useState(inicial.slice(11, 16));
  const [clienta, setClienta] = useState<Clienta>(() =>
    cita ? { id: cita.clienteId, nombre: cita.clienteNombre, telefono: cita.clienteTelefono ?? "", email: cita.clienteEmail ?? "" }
      : abrir.cliente ? { id: abrir.cliente.clienteId, nombre: abrir.cliente.nombre, telefono: abrir.cliente.telefono ?? "", email: "" }
        : SIN_CLIENTA);
  const [elegida, setElegida] = useState(!!cita || !!abrir.cliente);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteCuenta[]>([]);
  const [renglones, setRenglones] = useState<RenglonCita[]>(() =>
    cita ? cita.tramos.map((t) => ({ productoId: t.productoId, usuarioId: t.usuarioId })) : [{ productoId: "", usuarioId: abrir.usuarioId ?? null }]);
  const [nota, setNota] = useState(cita?.nota ?? "");
  const [servicios, setServicios] = useState<ServicioAgenda[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorDia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Un doble toque o un reintento no agenda dos veces: la base es idempotente por esta clave.
  const clave = useRef(nuevoClientId());

  useEffect(() => {
    serviciosAgenda(token).then(setServicios).catch((e) => setError(e instanceof Error ? e.message : "No se pudieron leer los servicios"));
  }, [token]);
  useEffect(() => {
    colaboradoresDelDia(token, sucursalId, dia).then(setColaboradores).catch(() => setColaboradores([]));
  }, [token, sucursalId, dia]);

  // Búsqueda de clienta (nombre o teléfono), con la misma consulta que el cliente de una cuenta.
  useEffect(() => {
    if (elegida || q.trim().length < 2) { setResultados([]); return; }
    let vivo = true;
    const t = setTimeout(() => {
      buscarClientesCuenta(token, q).then((r) => { if (vivo) setResultados(r); }).catch(() => {});
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, elegida, token]);

  const nombreDe = (id: string | null) => (id
    ? colaboradores.find((c) => c.usuarioId === id)?.nombre ?? cita?.tramos.find((t) => t.usuarioId === id)?.colaborador ?? "Colaborador"
    : "Quien esté libre");
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(dia) && /^\d{2}:\d{2}$/.test(hora) ? new Date(`${dia}T${hora}:00-06:00`) : null;

  const completos = renglones.every((r) => r.productoId) && renglones.length > 0;
  const previa = useMemo(() => {
    if (!completos || servicios.length === 0) return [];
    const filas = renglones.map((r) => ({ r, s: servicios.find((x) => x.productoId === r.productoId)! })).filter((x) => x.s);
    const tramos = inicio && !espera ? tramosEncadenados(inicio, filas.map(({ r, s }) => duracionCon(s, r.usuarioId))) : [];
    return filas.map(({ r, s }, i) => ({ r, s, tramo: tramos[i] ?? null, precio: precioCon(s, r.usuarioId) }));
  }, [completos, renglones, servicios, inicio, espera]);
  const total = previa.reduce((a, p) => a + p.precio, 0);

  const cambiar = (i: number, r: Partial<RenglonCita>) => {
    setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, ...r } : x)));
    setError(null);
  };

  async function guardar() {
    setError(null);
    if (!elegida && !clienta.nombre.trim()) { setError("Escribe el nombre de la clienta."); return; }
    if (!completos) { setError("Elige el servicio de cada renglón."); return; }
    if (!espera && !inicio) { setError("Elige el día y la hora."); return; }
    const tel = normalizarTelefono(clienta.telefono);
    if (!elegida && tel && tel.length !== 10) { setError("El teléfono debe tener 10 dígitos."); return; }
    if (!elegida && clienta.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienta.email.trim())) { setError("El correo no es válido."); return; }
    setGuardando(true);
    try {
      let c = clienta;
      // Una clienta nueva con teléfono queda registrada (su ficha junta visitas y faltas); si el
      // teléfono ya era de alguien, se usa a esa clienta en vez de duplicarla.
      if (!elegida && tel) {
        try {
          const nueva = await registrarClienteCuenta(token, {
            nombre: clienta.nombre, apellido: "", telefono: tel, email: clienta.email, notas: "", tenantId, sucursalId, dir: null,
          });
          c = { ...clienta, id: nueva.clienteId };
        } catch (e) {
          if (!(e instanceof TelefonoDuplicado)) throw e;
          // Como en la búsqueda: a una clienta bloqueada desde el panel no se le agenda.
          if (e.cliente.bloqueado) {
            const m = await motivoBloqueo(token, e.cliente.clienteId).catch(() => null);
            throw new Error(`Ese teléfono es de ${e.cliente.nombre}, bloqueada desde el panel${m ? `: ${m}` : "."}`);
          }
          c = { ...clienta, id: e.cliente.clienteId, nombre: e.cliente.nombre };
        }
        setClienta(c);
        setElegida(true);
      }
      const p = entradaCita({
        id: cita?.id, sucursalId, cliente: c, inicia: espera ? null : inicio, nota, renglones,
        clientIdLocal: cita ? undefined : clave.current,
      });
      if (espera) await agregarEnEspera(token, p);
      else await guardarCita(token, p);
      onGuardada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la cita");
      setGuardando(false);
    }
  }

  const titulo = espera ? "Agregar a la espera" : cita ? "Mover de horario" : "Nueva cita";

  return (
    <Modal open onClose={() => { if (!guardando) onCerrar(); }} title={titulo} hideTitle
      className="flex h-[80vh] w-[80vw] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_60px_rgba(22,22,26,.18)]">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97]">
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
        <h2 className="font-display text-20 font-semibold tracking-tight">{titulo}</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex flex-col gap-6 p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {/* Clienta */}
          <section>
            <h3 className="mb-2 font-display text-15 font-semibold">Clienta</h3>
            {elegida ? (
              <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-15 font-semibold">{clienta.nombre}</p>
                  {clienta.telefono && <p className="text-13 tabular-nums text-ink-2">{clienta.telefono}</p>}
                </div>
                {!cita && (
                  <Button variant="ghost" onClick={() => { setElegida(false); setClienta(SIN_CLIENTA); setQ(""); }}>Cambiar</Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input className={input} placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar clienta" />
                {resultados.length > 0 && (
                  <ul className="overflow-hidden rounded-lg border border-line">
                    {resultados.map((r) => (
                      <li key={r.clienteId} className="border-b border-line last:border-b-0">
                        <button type="button" disabled={r.bloqueado}
                          onClick={() => { setClienta({ id: r.clienteId, nombre: r.nombre, telefono: r.telefono ?? "", email: "" }); setElegida(true); setError(null); }}
                          className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-hover disabled:opacity-50">
                          <span className="min-w-0 flex-1 truncate text-15 font-medium">{r.nombre}</span>
                          <span className="text-13 tabular-nums text-ink-3">{r.bloqueado ? "Bloqueada" : r.telefono}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-13 text-ink-3">¿Es nueva? Escribe sus datos; con teléfono queda registrada.</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className={etiqueta}>Nombre</span>
                    <input className={input} value={clienta.nombre} onChange={(e) => { setClienta({ ...clienta, nombre: e.target.value }); setError(null); }} /></label>
                  <label><span className={etiqueta}>Teléfono</span>
                    <input className={input} inputMode="tel" value={clienta.telefono} onChange={(e) => { setClienta({ ...clienta, telefono: e.target.value }); setError(null); }} /></label>
                  <label><span className={etiqueta}>Correo</span>
                    <input className={input} type="email" value={clienta.email} onChange={(e) => { setClienta({ ...clienta, email: e.target.value }); setError(null); }} /></label>
                </div>
              </div>
            )}
          </section>

          {/* Servicios */}
          <section>
            <h3 className="mb-2 font-display text-15 font-semibold">Servicios</h3>
            <div className="flex flex-col gap-2">
              {renglones.map((r, i) => {
                const s = servicios.find((x) => x.productoId === r.productoId);
                const quienes = (s ? colaboradores.filter((c) => s.colaboradores.some((x) => x.usuarioId === c.usuarioId)) : colaboradores)
                  .map((c) => ({ usuarioId: c.usuarioId, nombre: c.nombre }));
                // Quien ya estaba elegido sigue en la lista aunque ese día no salga o no tenga el servicio:
                // lo que se ve es lo que se guarda.
                if (r.usuarioId && !quienes.some((c) => c.usuarioId === r.usuarioId)) quienes.unshift({ usuarioId: r.usuarioId, nombre: nombreDe(r.usuarioId) });
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select className={input} value={r.productoId} aria-label={`Servicio ${i + 1}`}
                      onChange={(e) => {
                        const nuevo = servicios.find((x) => x.productoId === e.target.value);
                        // Si quien estaba elegido no hace el servicio nuevo, queda «Quien esté libre».
                        cambiar(i, { productoId: e.target.value, usuarioId: nuevo?.colaboradores.some((x) => x.usuarioId === r.usuarioId) ? r.usuarioId : null });
                      }}>
                      <option value="">Elige un servicio</option>
                      {servicios.map((x) => <option key={x.productoId} value={x.productoId}>{x.nombre}</option>)}
                    </select>
                    <select className={input} value={r.usuarioId ?? ""} aria-label={`Quién atiende el servicio ${i + 1}`}
                      onChange={(e) => cambiar(i, { usuarioId: e.target.value || null })}>
                      <option value="">{espera ? "Sin preferencia" : "Quien esté libre"}</option>
                      {quienes.map((c) => <option key={c.usuarioId} value={c.usuarioId}>{c.nombre}</option>)}
                    </select>
                    <button type="button" aria-label={`Quitar el servicio ${i + 1}`} disabled={renglones.length === 1}
                      onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-ink-2 transition-transform duration-150 ease-vim hover:bg-hover hover:text-danger active:scale-[.97] disabled:opacity-30">
                      <Icono nombre="cerrar" className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <Button variant="ghost" className="self-start" onClick={() => setRenglones((rs) => [...rs, { productoId: "", usuarioId: null }])}>
                <Icono nombre="mas" className="h-4 w-4" />
                Agregar servicio
              </Button>
            </div>
          </section>

          {!espera && (
            <section className="grid gap-3 md:grid-cols-2">
              <label><span className={etiqueta}>Día</span>
                <input className={input} type="date" value={dia} onChange={(e) => { setDia(e.target.value); setError(null); }} /></label>
              <label><span className={etiqueta}>Hora</span>
                <input className={input} type="time" step={900} value={hora} onChange={(e) => { setHora(e.target.value); setError(null); }} /></label>
            </section>
          )}

          <label><span className={etiqueta}>Nota</span>
            <textarea className={`${input} h-20 py-2`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Alergias, preferencias…" /></label>
        </div>

        {/* Así queda: los tramos encadenados, antes de guardar. */}
        <aside className="flex flex-shrink-0 flex-col gap-3 border-t border-line bg-sel p-6 lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <h3 className="font-display text-15 font-semibold">{espera ? "Espera" : "Así queda"}</h3>
          {previa.length === 0 ? (
            <p className="text-14 text-ink-3">Elige los servicios para ver el horario.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {previa.map(({ r, s, tramo, precio }, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface px-3 py-2.5">
                  <p className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-15 font-semibold">{s.nombre}</span>
                    <span className="text-14 font-semibold tabular-nums">{fmtMxn(precio)}</span>
                  </p>
                  <p className="text-13 tabular-nums text-ink-2">
                    {tramo ? `${horaCorta(tramo.inicia)} – ${horaCorta(tramo.termina)} · ` : ""}{nombreDe(r.usuarioId)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {previa.length > 0 && !espera && horaSeFijaAlGuardar(renglones, servicios) && (
            <p className="text-13 text-ink-3">Con «Quien esté libre» la hora final se fija al guardar: depende de quién atienda.</p>
          )}
          {previa.length > 0 && (
            <p className="flex items-baseline justify-between border-t border-line pt-3 text-15 font-semibold">
              <span>Total</span><span className="tabular-nums">{fmtMxn(total)}</span>
            </p>
          )}
        </aside>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 border-t border-line px-6 py-3">
        <p className="min-w-0 flex-1 text-14 font-medium text-danger" role="alert">{error}</p>
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Volver</Button>
        <Button onClick={() => void guardar()} disabled={guardando} className="min-w-[160px]">
          {guardando ? "Guardando…" : espera ? "Agregar a la espera" : "Guardar cita"}
        </Button>
      </div>
    </Modal>
  );
}
