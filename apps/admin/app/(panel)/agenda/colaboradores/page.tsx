"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, cn, useConfirmar } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import {
  DIAS_AGENDA, actualizarColaborador, altaColaborador, ausenciaSchema, borrarAusencia, crearAusencia, guardarHorarios,
  guardarServiciosDeColaborador, horarioSchema, listarColaboradores, listarServicios, siguienteColor, sueldoValido,
  type Colaborador, type HorarioInput, type Servicio,
} from "../../../lib/agenda";
import { COLORES } from "../../../lib/catalogo";
import { listarSucursales, type Sucursal } from "../../../lib/configuracion";
import { listarUsuarios, type Usuario } from "../../../lib/usuarios";
import { mensajeError } from "../../../lib/errores";
import { limpiarPrecio } from "../../../lib/numeros";
import { botonAcceso, darAccesoCelular, enlaceMiAgenda, listarAccesos, type AccesoColaborador } from "../../../lib/acceso-celular";

const hora = "h-10 w-[7.5rem] rounded border border-line-strong px-2.5 text-sm tabular-nums outline-none focus:border-ink";

/** `2026-11-02` → «2 nov 2026». Mediodía local: la fecha no se recorre por la zona. */
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** Un día como se edita: sin `trabaja` el día no se guarda (ese día no atiende). */
type DiaEditado = { trabaja: boolean; inicia: string; termina: string; comida: boolean; comidaInicia: string; comidaTermina: string };
type Detalle = { sucursalId: string; color: string; sueldo: string; dias: Record<number, DiaEditado>; servicios: Set<string> };

const diaDe = (h?: HorarioInput): DiaEditado => h
  ? { trabaja: true, inicia: h.inicia, termina: h.termina, comida: h.comida_inicia !== null, comidaInicia: h.comida_inicia ?? "14:00", comidaTermina: h.comida_termina ?? "15:00" }
  : { trabaja: false, inicia: "10:00", termina: "19:00", comida: false, comidaInicia: "14:00", comidaTermina: "15:00" };

/** El color del colaborador en el calendario: la paleta funcional, uno por botón. */
function ElegirColor({ valor, onCambiar, id }: { valor: string; onCambiar: (hex: string) => void; id: string }) {
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
      {COLORES.map((c) => {
        const elegido = c.hex.toUpperCase() === valor.toUpperCase();
        return (
          <button key={c.hex} type="button" role="radio" aria-checked={elegido} aria-label={c.hex} onClick={() => onCambiar(c.hex)}
            className={cn("h-9 w-9 rounded-full border-2 transition-transform active:scale-[.97]", elegido ? "border-ink" : "border-transparent")}>
            <span className="block h-full w-full rounded-full border-2 border-surface" style={{ background: c.hex }} />
          </button>
        );
      })}
    </div>
  );
}

/** Quién atiende en la agenda: su sucursal, su color, su horario, sus ausencias y sus servicios (0218). */
export default function ColaboradoresPage() {
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [colaboradores, setColaboradores] = useState<Colaborador[] | null>(null);
  const [empleados, setEmpleados] = useState<Usuario[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [alta, setAlta] = useState<{ usuarioId: string; sucursalId: string; color: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [ausencia, setAusencia] = useState({ desde: "", hasta: "", motivo: "" });
  const [accesos, setAccesos] = useState<Map<string, AccesoColaborador> | null>(null);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  async function recargar() {
    try {
      const [c, u, s, sv] = await Promise.all([listarColaboradores(), listarUsuarios(), listarSucursales(), listarServicios()]);
      setColaboradores(c); setEmpleados(u.filter((x) => x.activo)); setSucursales(s.filter((x) => x.activa)); setServicios(sv);
      // Sin los accesos (o sin permiso para verlos) la página sirve igual, sin el bloque del celular.
      listarAccesos().then(setAccesos, () => setAccesos(null));
      return { c, sv };
    } catch (e) {
      setError(mensajeError(e, "No se pudieron leer los colaboradores"));
      setColaboradores((c) => c ?? []);
      return null;
    }
  }
  useEffect(() => { void recargar(); }, []);

  const nombres = new Map(empleados.map((u) => [u.id, u.nombre]));
  const nombre = (id: string) => nombres.get(id) ?? "Empleado dado de baja";
  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const disponibles = empleados.filter((u) => !colaboradores?.some((c) => c.usuarioId === u.id && c.activo));

  /** Una escritura a la vez; al terminar se vuelve a leer todo. */
  async function escribir(f: () => Promise<void>, aviso: string): Promise<boolean> {
    setGuardando(true);
    setError(null);
    try {
      await f();
      setOkMsg(aviso);
      setTimeout(() => setOkMsg(null), 2500);
      await recargar();
      return true;
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
      return false;
    } finally {
      setGuardando(false);
    }
  }

  function abrirAlta() {
    setError(null);
    setSel(null);
    setAlta({ usuarioId: disponibles[0]?.id ?? "", sucursalId: sucursales[0]?.id ?? "", color: siguienteColor((colaboradores ?? []).filter((c) => c.activo).map((c) => c.color)) });
  }

  async function darDeAlta() {
    if (!alta?.usuarioId || !alta.sucursalId) return setError("Elige al empleado y su sucursal.");
    const { usuarioId, sucursalId, color } = alta;
    const orden = Math.max(0, ...(colaboradores ?? []).map((c) => c.orden)) + 1;
    if (await escribir(() => altaColaborador({ usuarioId, sucursalId, color, orden }), "Colaborador dado de alta.")) {
      setAlta(null);
      const r = await recargar();
      const c = r?.c.find((x) => x.usuarioId === usuarioId);
      if (c && r) abrir(c, r.sv);
    }
  }

  function abrir(c: Colaborador, sv = servicios) {
    setError(null);
    setAlta(null);
    setSel(c.usuarioId);
    setAusencia({ desde: "", hasta: "", motivo: "" });
    setDetalle({
      sucursalId: c.sucursalId, color: c.color, sueldo: String(c.sueldo),
      dias: Object.fromEntries(DIAS_AGENDA.map(({ dia }) => [dia, diaDe(c.horarios.find((h) => h.dia_semana === dia))])),
      servicios: new Set(sv.filter((s) => s.colaboradores.some((x) => x.usuario_id === c.usuarioId)).map((s) => s.id)),
    });
  }

  function guardarHorario() {
    if (!sel || !detalle) return;
    const horarios: HorarioInput[] = [];
    for (const { dia, nombre: n } of DIAS_AGENDA) {
      const d = detalle.dias[dia]!;
      if (!d.trabaja) continue;
      const p = horarioSchema.safeParse({
        dia_semana: dia, inicia: d.inicia, termina: d.termina,
        comida_inicia: d.comida ? d.comidaInicia : null, comida_termina: d.comida ? d.comidaTermina : null,
      });
      if (!p.success) return setError(`${n}: ${p.error.issues[0]?.message ?? "horario inválido"}`);
      horarios.push(p.data);
    }
    void escribir(() => guardarHorarios(sel, horarios), "Horario guardado.");
  }

  function agregarAusencia() {
    if (!sel) return;
    const p = ausenciaSchema.safeParse(ausencia);
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Fechas inválidas");
    void escribir(() => crearAusencia(sel, p.data), "Ausencia agregada.").then((ok) => ok && setAusencia({ desde: "", hasta: "", motivo: "" }));
  }

  async function cambiarActivo(c: Colaborador) {
    if (c.activo && !(await confirmar({
      titulo: `¿Quitar a ${nombre(c.usuarioId)} de la agenda?`,
      mensaje: "Ya no se le podrán agendar citas. Sus citas ya agendadas se conservan, y puedes volver a activarlo después.",
      boton: "Quitar de la agenda",
    }))) return;
    void escribir(() => actualizarColaborador(c.usuarioId, { activo: !c.activo }), c.activo ? "Quitado de la agenda." : "De vuelta en la agenda.");
  }

  async function darAcceso(usuarioId: string, email: string) {
    if (await escribir(() => darAccesoCelular(email), `Le mandamos un correo a ${email} para que ponga su contraseña.`)) {
      setEnviados((e) => new Set(e).add(usuarioId));
    }
  }

  const cambiarDia = (dia: number, cambio: Partial<DiaEditado>) =>
    detalle && setDetalle({ ...detalle, dias: { ...detalle.dias, [dia]: { ...detalle.dias[dia]!, ...cambio } } });

  const actual = colaboradores?.find((c) => c.usuarioId === sel) ?? null;
  const sueldoOk = !detalle || sueldoValido(detalle.sueldo);
  const accesoActual = actual ? accesos?.get(actual.usuarioId) : undefined;
  const boton = actual && accesos ? botonAcceso(actual.activo, accesoActual, enviados.has(actual.usuarioId)) : null;

  return (
    <>
      {dialogoConfirmar}
      <PageHeader
        titulo="Colaboradores"
        subtitulo="Quién atiende en la agenda, en qué horario y qué servicios hace. Se eligen de los empleados del negocio."
        migas={[{ label: "Agenda" }, { label: "Colaboradores" }]}
        right={<Button onClick={abrirAlta} disabled={guardando || disponibles.length === 0 || sucursales.length === 0}>Agregar colaborador</Button>}
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {okMsg && <p className="mb-4 text-sm font-medium text-success">{okMsg}</p>}
        {colaboradores !== null && disponibles.length === 0 && !alta && (
          <p className="mb-4 text-13 text-ink-3">
            Todos tus empleados ya están en la agenda. Para sumar a alguien más, <Link href="/usuarios" className="font-semibold text-ink-2 underline">dalo de alta en Usuarios</Link>.
          </p>
        )}

        {alta && (
          <div className="mb-5">
            <Tarjeta titulo="Agregar colaborador">
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void darDeAlta(); }}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="col-empleado">Empleado</label>
                    <select id="col-empleado" className={input} value={alta.usuarioId} onChange={(e) => setAlta({ ...alta, usuarioId: e.target.value })}>
                      {disponibles.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="col-suc">Sucursal</label>
                    <select id="col-suc" className={input} value={alta.sucursalId} onChange={(e) => setAlta({ ...alta, sucursalId: e.target.value })}>
                      {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <span id="col-color" className={label}>Color en el calendario</span>
                  <ElegirColor id="col-color" valor={alta.color} onCambiar={(color) => setAlta({ ...alta, color })} />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                  <Button variant="ghost" onClick={() => setAlta(null)} disabled={guardando}>Cancelar</Button>
                  <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Agregar"}</Button>
                </div>
              </form>
            </Tarjeta>
          </div>
        )}

        {colaboradores === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {colaboradores && colaboradores.length === 0 && !alta && (
          <div className="max-w-[720px] rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-15 font-semibold text-ink-2">Nadie en la agenda todavía</p>
            <p className="mt-1 text-13">Agrega a quienes atienden: cada uno tendrá su columna y su color en el calendario.</p>
          </div>
        )}

        {colaboradores && colaboradores.length > 0 && (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-surface lg:w-[280px] lg:flex-shrink-0">
              {colaboradores.map((c) => (
                <li key={c.usuarioId}>
                  <button type="button" onClick={() => abrir(c)} aria-current={sel === c.usuarioId ? "true" : undefined}
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", sel === c.usuarioId ? "bg-sel" : "hover:bg-hover")}>
                    <span aria-hidden="true" className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-14 font-semibold", !c.activo && "text-ink-3")}>{nombre(c.usuarioId)}</span>
                      <span className="block text-12 text-ink-3">
                        {nombreSucursal.get(c.sucursalId) ?? "—"} · {c.horarios.length === 0 ? "sin horario" : `${c.horarios.length} ${c.horarios.length === 1 ? "día" : "días"}`}
                      </span>
                    </span>
                    {!c.activo && <span className="rounded-full bg-hover px-2 py-0.5 text-11 font-bold text-ink-3">Inactivo</span>}
                  </button>
                </li>
              ))}
            </ul>

            {actual && detalle ? (
              <div className="flex min-w-0 flex-1 flex-col gap-5">
                <Tarjeta titulo={nombre(actual.usuarioId)} descripcion={actual.activo ? undefined : "No está en la agenda: no se le pueden agendar citas."}>
                  <div className="flex flex-col gap-4">
                    <div className="max-w-[320px]">
                      <label className={label} htmlFor="det-suc">Sucursal</label>
                      <select id="det-suc" className={input} value={detalle.sucursalId} onChange={(e) => setDetalle({ ...detalle, sucursalId: e.target.value })}>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <span id="det-color" className={label}>Color en el calendario</span>
                      <ElegirColor id="det-color" valor={detalle.color} onCambiar={(color) => setDetalle({ ...detalle, color })} />
                    </div>
                    <div className="max-w-[320px]">
                      <label className={label} htmlFor="det-sueldo">Sueldo por periodo</label>
                      <input id="det-sueldo" className={`${input} tabular-nums`} inputMode="decimal" placeholder="0.00" value={detalle.sueldo}
                        onChange={(e) => setDetalle({ ...detalle, sueldo: limpiarPrecio(e.target.value) })} aria-invalid={!sueldoOk} />
                      <p className="mt-1.5 text-13 text-ink-2">
                        Lo fijo de cada periodo de comisiones (semanal o quincenal, en <Link href="/configuracion/agenda" className="font-semibold text-ink underline">Configuración</Link>). 0 si solo gana comisión.
                      </p>
                    </div>
                    {boton?.visible && (
                      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-14 font-semibold">Su agenda en el celular</p>
                          <p className="text-13 text-ink-2">
                            Le llega un correo para poner su contraseña y entra en <span className="break-all font-medium text-ink">{enlaceMiAgenda(typeof window === "undefined" ? "" : window.location.hostname)}</span>. Ve solo sus citas.
                          </p>
                          <p className="mt-1 text-12 text-ink-3">{boton.ultimo}</p>
                        </div>
                        <Button variant="ghost" disabled={guardando || !boton.habilitado}
                          onClick={() => accesoActual && void darAcceso(actual.usuarioId, accesoActual.email)}>
                          {boton.texto}
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 border-t border-line pt-4">
                      <AccionFila peligro={actual.activo} disabled={guardando} onClick={() => void cambiarActivo(actual)}>
                        {actual.activo ? "Quitar de la agenda" : "Volver a la agenda"}
                      </AccionFila>
                      <Button className="ml-auto" disabled={guardando || !sueldoOk || (detalle.sucursalId === actual.sucursalId && detalle.color === actual.color && Number(detalle.sueldo) === actual.sueldo)}
                        onClick={() => void escribir(() => actualizarColaborador(actual.usuarioId, { sucursalId: detalle.sucursalId, color: detalle.color, sueldo: Number(detalle.sueldo) }), "Datos guardados.")}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                </Tarjeta>

                <Tarjeta titulo="Horario" descripcion="Los días que no marques no atiende. La comida no se puede agendar.">
                  <ul className="divide-y divide-line">
                    {DIAS_AGENDA.map(({ dia, nombre: n }) => {
                      const d = detalle.dias[dia]!;
                      return (
                        <li key={dia} className="flex flex-col gap-x-4 gap-y-2 py-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-14 sm:w-36">
                            <input type="checkbox" className="h-4 w-4 accent-ink" checked={d.trabaja} onChange={(e) => cambiarDia(dia, { trabaja: e.target.checked })} />
                            <span className="font-medium">{n}</span>
                          </label>
                          {d.trabaja && (
                            <>
                              <div className="flex items-center gap-2">
                                <input type="time" className={hora} aria-label={`${n}: entrada`} value={d.inicia} onChange={(e) => cambiarDia(dia, { inicia: e.target.value })} />
                                <span className="text-13 text-ink-3" aria-hidden="true">a</span>
                                <input type="time" className={hora} aria-label={`${n}: salida`} value={d.termina} onChange={(e) => cambiarDia(dia, { termina: e.target.value })} />
                              </div>
                              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-13 text-ink-2">
                                <input type="checkbox" className="h-4 w-4 accent-ink" checked={d.comida} onChange={(e) => cambiarDia(dia, { comida: e.target.checked })} />
                                Comida
                              </label>
                              {d.comida && (
                                <div className="flex items-center gap-2">
                                  <input type="time" className={hora} aria-label={`${n}: sale a comer`} value={d.comidaInicia} onChange={(e) => cambiarDia(dia, { comidaInicia: e.target.value })} />
                                  <span className="text-13 text-ink-3" aria-hidden="true">a</span>
                                  <input type="time" className={hora} aria-label={`${n}: regresa de comer`} value={d.comidaTermina} onChange={(e) => cambiarDia(dia, { comidaTermina: e.target.value })} />
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex justify-end border-t border-line pt-4">
                    <Button disabled={guardando} onClick={guardarHorario}>Guardar horario</Button>
                  </div>
                </Tarjeta>

                <Tarjeta titulo="Ausencias" descripcion="Vacaciones, incapacidad o un día libre. Esos días no se le agendan citas.">
                  {actual.ausencias.length > 0 && (
                    <ul className="mb-4 divide-y divide-line border-y border-line">
                      {actual.ausencias.map((a) => (
                        <li key={a.id} className="flex min-h-[40px] items-center gap-3 py-1.5 text-14">
                          <span className="tabular-nums">{a.desde === a.hasta ? fecha(a.desde) : `${fecha(a.desde)} al ${fecha(a.hasta)}`}</span>
                          <span className="flex-1 truncate text-ink-3">{a.motivo}</span>
                          <AccionFila peligro disabled={guardando} onClick={() => void escribir(() => borrarAusencia(a.id), "Ausencia eliminada.")}>Eliminar</AccionFila>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_auto_1fr_auto]" onSubmit={(e) => { e.preventDefault(); agregarAusencia(); }}>
                    <div>
                      <label className={label} htmlFor="aus-desde">Desde</label>
                      <input id="aus-desde" type="date" className={input} value={ausencia.desde}
                        onChange={(e) => setAusencia({ ...ausencia, desde: e.target.value, hasta: ausencia.hasta || e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor="aus-hasta">Hasta</label>
                      <input id="aus-hasta" type="date" className={input} min={ausencia.desde || undefined} value={ausencia.hasta} onChange={(e) => setAusencia({ ...ausencia, hasta: e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor="aus-motivo">Motivo · <span className="text-ink-3">opcional</span></label>
                      <input id="aus-motivo" className={input} maxLength={200} placeholder="Vacaciones" value={ausencia.motivo} onChange={(e) => setAusencia({ ...ausencia, motivo: e.target.value })} />
                    </div>
                    <Button type="submit" variant="ghost" disabled={guardando || !ausencia.desde}>Agregar</Button>
                  </form>
                </Tarjeta>

                <Tarjeta titulo="Servicios que hace" descripcion="El precio y la duración propios de cada servicio se ajustan en Servicios.">
                  {servicios.length === 0 ? (
                    <p className="text-13 text-ink-3">
                      Aún no hay servicios. <Link href="/agenda/servicios" className="font-semibold text-ink-2 underline">Dalos de alta</Link>.
                    </p>
                  ) : (
                    <>
                      <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        {servicios.map((s) => (
                          <li key={s.id}>
                            <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-14">
                              <input type="checkbox" className="h-4 w-4 accent-ink" checked={detalle.servicios.has(s.id)}
                                onChange={(e) => {
                                  const sv = new Set(detalle.servicios);
                                  if (e.target.checked) sv.add(s.id); else sv.delete(s.id);
                                  setDetalle({ ...detalle, servicios: sv });
                                }} />
                              <span className={cn(!s.activo && "text-ink-3")}>{s.nombre}</span>
                              <span className="text-12 tabular-nums text-ink-3">{s.duracionMin} min</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex justify-end border-t border-line pt-4">
                        <Button disabled={guardando} onClick={() => void escribir(() => guardarServiciosDeColaborador(actual.usuarioId, [...detalle.servicios]), "Servicios guardados.")}>
                          Guardar servicios
                        </Button>
                      </div>
                    </>
                  )}
                </Tarjeta>
              </div>
            ) : (
              !alta && <p className="text-13 text-ink-3 lg:pt-3">Elige a un colaborador para ver su horario y sus servicios.</p>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
