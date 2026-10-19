"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import {
  activarServicio, actualizarServicio, camposDe, crearServicio, guardarColaboradoresDeServicio, listarColaboradores, listarServicios,
  listarTiposEspacio, reglaDeCampos, servicioColaboradorSchema, servicioSchema, textoRegla,
  type CamposRegla, type Colaborador, type Servicio, type TipoEspacio,
} from "../../../lib/agenda";
import { BuscadorClaveSat } from "../../../components/buscador-clave-sat";
import { listarCategorias, precioMxn, type Categoria } from "../../../lib/catalogo";
import { listarUsuarios } from "../../../lib/usuarios";
import { limpiarPrecio } from "../../../lib/numeros";
import { mensajeError } from "../../../lib/errores";

const th = "border-b border-line bg-sel px-4 py-[11px] text-left text-12 font-bold uppercase tracking-wide text-ink-3";
const corto = "h-10 w-24 rounded border border-line-strong px-2.5 text-sm tabular-nums outline-none focus:border-ink disabled:opacity-50";

/** Quién lo hace, como se teclea: vacío = lo del servicio. */
type Quien = { precio: string; duracion: string; comision: CamposRegla };
type Editando = {
  id: string | null; nombre: string; categoriaId: string; precio: string; duracion: string; tipoEspacioId: string;
  comision: CamposRegla; anticipo: CamposRegla; claveSat: string;
  quien: Record<string, Quien>;
};

const numeroONulo = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const SIN_REGLA: CamposRegla = { tipo: "", valor: "" };

/** Tipo (ninguno, % o $) y su valor. `sin` es cómo se llama no tener regla. */
function CampoRegla({ id, etiqueta, sin, valor, onCambiar, compacto = false }: {
  id: string; etiqueta: string; sin: string; valor: CamposRegla; onCambiar: (c: CamposRegla) => void; compacto?: boolean;
}) {
  return (
    <div className={compacto ? "flex items-center gap-2" : "flex gap-2"}>
      <select id={id} aria-label={compacto ? etiqueta : undefined} className={compacto ? `${corto} w-auto` : `${input} w-auto flex-shrink-0`}
        value={valor.tipo} onChange={(e) => onCambiar({ tipo: e.target.value as CamposRegla["tipo"], valor: e.target.value === "" ? "" : valor.valor })}>
        <option value="">{sin}</option>
        <option value="PORCENTAJE">Porcentaje (%)</option>
        <option value="MONTO">Monto fijo ($)</option>
      </select>
      {valor.tipo !== "" && (
        <input className={compacto ? corto : `${input} tabular-nums`} inputMode="decimal" aria-label={`${etiqueta}: ${valor.tipo === "PORCENTAJE" ? "porcentaje" : "monto en pesos"}`}
          placeholder={valor.tipo === "PORCENTAJE" ? "40" : "0.00"} value={valor.valor}
          onChange={(e) => onCambiar({ ...valor, valor: limpiarPrecio(e.target.value) })} />
      )}
    </div>
  );
}

/** Los servicios que se agendan: cuánto duran, qué espacio piden y quién los hace (0218). */
export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tipos, setTipos] = useState<TipoEspacio[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Editando | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try {
      const [s, c, t, col, u] = await Promise.all([listarServicios(), listarCategorias(), listarTiposEspacio(), listarColaboradores(), listarUsuarios()]);
      setServicios(s); setCategorias(c.filter((x) => x.activa)); setTipos(t); setColaboradores(col);
      setNombres(new Map(u.map((x) => [x.id, x.nombre])));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron leer los servicios"));
      setServicios((s) => s ?? []);
    }
  }
  useEffect(() => { void recargar(); }, []);

  const activos = colaboradores.filter((c) => c.activo);
  const nombre = (id: string) => nombres.get(id) ?? "—";

  function nuevo() {
    setError(null);
    setEditando({
      id: null, nombre: "", categoriaId: categorias[0]?.id ?? "", precio: "", duracion: "30", tipoEspacioId: "",
      comision: SIN_REGLA, anticipo: SIN_REGLA, claveSat: "", quien: {},
    });
  }
  function editar(s: Servicio) {
    setError(null);
    setEditando({
      id: s.id, nombre: s.nombre, categoriaId: s.categoriaId, precio: String(s.precio), duracion: String(s.duracionMin),
      tipoEspacioId: s.tipoEspacioId ?? "", comision: camposDe(s.comision), anticipo: camposDe(s.anticipo), claveSat: s.claveSat ?? "",
      quien: Object.fromEntries(s.colaboradores.map((c) => [c.usuario_id, {
        precio: c.precio_mxn === null ? "" : String(c.precio_mxn), duracion: c.duracion_min === null ? "" : String(c.duracion_min),
        comision: camposDe(c.comision),
      }])),
    });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const p = servicioSchema.safeParse({
      nombre: editando.nombre, categoria_id: editando.categoriaId, precio_base_mxn: editando.precio.trim() === "" ? NaN : Number(editando.precio),
      duracion_min: Number(editando.duracion), tipo_espacio_id: editando.tipoEspacioId || null,
      comision: reglaDeCampos(editando.comision), anticipo: reglaDeCampos(editando.anticipo), clave_sat: editando.claveSat.trim() || null,
    });
    if (!p.success) {
      const i = p.error.issues[0];
      const campo = i?.path[0] === "comision" ? "Comisión: " : i?.path[0] === "anticipo" ? "Anticipo: " : "";
      return setError(`${campo}${i?.message ?? "Datos inválidos"}`);
    }
    const filas = [];
    for (const [usuario_id, q] of Object.entries(editando.quien)) {
      const f = servicioColaboradorSchema.safeParse({ usuario_id, precio_mxn: numeroONulo(q.precio), duracion_min: numeroONulo(q.duracion), comision: reglaDeCampos(q.comision) });
      if (!f.success) return setError(`${nombre(usuario_id)}: ${f.error.issues[0]?.message ?? "datos inválidos"}`);
      filas.push(f.data);
    }
    setGuardando(true);
    try {
      let id = editando.id;
      if (id) await actualizarServicio(id, p.data);
      else {
        id = await crearServicio(p.data);
        // Si lo que sigue falla, reintentar edita el servicio ya creado en vez de duplicarlo.
        setEditando({ ...editando, id });
      }
      await guardarColaboradoresDeServicio(id, filas);
      setEditando(null);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(s: Servicio) {
    setGuardando(true);
    setError(null);
    try {
      await activarServicio(s.id, !s.activo);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  function marcar(usuarioId: string, hace: boolean) {
    if (!editando) return;
    const quien = { ...editando.quien };
    if (hace) quien[usuarioId] = { precio: "", duracion: "", comision: SIN_REGLA };
    else delete quien[usuarioId];
    setEditando({ ...editando, quien });
  }
  const cambiarQuien = (usuarioId: string, q: Partial<Quien>) =>
    editando && setEditando({ ...editando, quien: { ...editando.quien, [usuarioId]: { ...editando.quien[usuarioId]!, ...q } } });

  const nombreTipo = new Map(tipos.map((t) => [t.id, t.nombre]));

  return (
    <>
      <PageHeader
        titulo="Servicios"
        subtitulo="Lo que se agenda: cuánto dura, qué espacio ocupa y quién lo hace. Cada servicio también se vende en la caja."
        migas={[{ label: "Agenda" }, { label: "Servicios" }]}
        right={<Button onClick={nuevo} disabled={guardando || categorias.length === 0}>Nuevo servicio</Button>}
      />
      <PageBody>
        {error && !editando && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {servicios !== null && categorias.length === 0 && (
          <p className="mb-4 text-sm text-ink-2">
            Para dar de alta un servicio necesitas una categoría. <Link href="/catalogo" className="font-semibold text-ink underline">Crea una en el catálogo</Link>.
          </p>
        )}

        {editando && (
          <div className="mb-5">
            <Tarjeta titulo={editando.id ? "Editar servicio" : "Nuevo servicio"}>
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={label} htmlFor="srv-nombre">Nombre</label>
                    <input id="srv-nombre" className={input} maxLength={200} placeholder="Manicure" autoFocus value={editando.nombre}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-cat">Categoría</label>
                    <select id="srv-cat" className={input} value={editando.categoriaId} onChange={(e) => setEditando({ ...editando, categoriaId: e.target.value })}>
                      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-espacio">Espacio que ocupa</label>
                    <select id="srv-espacio" className={input} value={editando.tipoEspacioId} onChange={(e) => setEditando({ ...editando, tipoEspacioId: e.target.value })}>
                      <option value="">Ninguno en especial</option>
                      {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-precio">Precio</label>
                    <input id="srv-precio" className={`${input} tabular-nums`} inputMode="decimal" placeholder="0.00" value={editando.precio}
                      onChange={(e) => setEditando({ ...editando, precio: limpiarPrecio(e.target.value) })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-duracion">Duración (minutos)</label>
                    <input id="srv-duracion" className={`${input} tabular-nums`} inputMode="numeric" value={editando.duracion}
                      onChange={(e) => setEditando({ ...editando, duracion: e.target.value.replace(/\D/g, "") })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-comision">Comisión de quien lo hace</label>
                    <CampoRegla id="srv-comision" etiqueta="Comisión" sin="Sin comisión" valor={editando.comision}
                      onCambiar={(comision) => setEditando({ ...editando, comision })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="srv-anticipo">Anticipo al apartar</label>
                    <CampoRegla id="srv-anticipo" etiqueta="Anticipo" sin="Sin anticipo" valor={editando.anticipo}
                      onCambiar={(anticipo) => setEditando({ ...editando, anticipo })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label} htmlFor="srv-clave-sat">
                      Clave de producto SAT <span className="font-normal text-ink-2">· opcional</span>
                    </label>
                    <input id="srv-clave-sat" className={`${input} max-w-[200px] tabular-nums`} inputMode="numeric" maxLength={8}
                      value={editando.claveSat} onChange={(e) => setEditando({ ...editando, claveSat: e.target.value.replace(/\D/g, "") })} />
                    <BuscadorClaveSat onElegir={(claveSat) => setEditando({ ...editando, claveSat })} />
                    <p className="mt-1.5 text-13 text-ink-2">La clave del catálogo del SAT que lleva la factura de este servicio. Búscala por su nombre.</p>
                  </div>
                </div>

                <fieldset className="border-t border-line pt-4">
                  <legend className={`${label} pt-4`}>Quién lo hace</legend>
                  {activos.length === 0 ? (
                    <p className="text-13 text-ink-3">
                      Aún no hay colaboradores. <Link href="/agenda/colaboradores" className="font-semibold text-ink-2 underline">Dalos de alta</Link> y vuelve aquí.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-13 text-ink-3">Deja vacíos el precio y la duración propios para usar los del servicio. Su comisión propia gana a la del servicio.</p>
                      <ul className="divide-y divide-line">
                        {activos.map((c) => {
                          const q = editando.quien[c.usuarioId];
                          const n = nombre(c.usuarioId);
                          return (
                            <li key={c.usuarioId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1.5">
                              <label className="flex min-h-[40px] flex-1 cursor-pointer items-center gap-2.5 text-14">
                                <input type="checkbox" className="h-4 w-4 accent-ink" checked={q !== undefined} onChange={(e) => marcar(c.usuarioId, e.target.checked)} />
                                <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: c.color }} />
                                {n}
                              </label>
                              {q && (
                                <div className="flex items-center gap-2 text-13 text-ink-3">
                                  <input className={corto} inputMode="decimal" aria-label={`${n}: precio propio`} placeholder={editando.precio || "Precio"}
                                    value={q.precio} onChange={(e) => cambiarQuien(c.usuarioId, { precio: limpiarPrecio(e.target.value) })} />
                                  <input className={corto} inputMode="numeric" aria-label={`${n}: minutos propios`} placeholder={`${editando.duracion || "—"} min`}
                                    value={q.duracion} onChange={(e) => cambiarQuien(c.usuarioId, { duracion: e.target.value.replace(/\D/g, "") })} />
                                  <CampoRegla compacto id={`srv-com-${c.usuarioId}`} etiqueta={`${n}: comisión propia`} sin="Comisión del servicio"
                                    valor={q.comision} onCambiar={(comision) => cambiarQuien(c.usuarioId, { comision })} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </fieldset>

                {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
                <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                  <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                  <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
                </div>
              </form>
            </Tarjeta>
          </div>
        )}

        {servicios === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {servicios && servicios.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-15 font-semibold text-ink-2">Sin servicios todavía</p>
            <p className="mt-1 text-13">Da de alta lo que se agenda: un corte, un manicure, un masaje.</p>
          </div>
        )}
        {servicios && servicios.length > 0 && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-14">
              <thead>
                <tr>
                  <th className={th}>Servicio</th>
                  <th className={`${th} w-[100px] text-right`}>Duración</th>
                  <th className={`${th} w-[120px] text-right`}>Precio</th>
                  <th className={`${th} w-[100px] text-right`}>Comisión</th>
                  <th className={`${th} w-[100px] text-right`}>Anticipo</th>
                  <th className={th}>Espacio</th>
                  <th className={th}>Quién lo hace</th>
                  <th className={`${th} w-[110px]`}>Estado</th>
                  <th className={`${th} w-[170px]`}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-none hover:bg-hover">
                    <td className="px-4 py-2.5 font-semibold">{s.nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.duracionMin} min</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{precioMxn(s.precio)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{textoRegla(s.comision)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{textoRegla(s.anticipo)}</td>
                    <td className="px-4 py-2.5 text-ink-2">{s.tipoEspacioId ? nombreTipo.get(s.tipoEspacioId) ?? "—" : "—"}</td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {s.colaboradores.length === 0
                        ? <span className="text-warning">Nadie todavía</span>
                        : s.colaboradores.map((c) => {
                          const propio = [c.precio_mxn !== null ? precioMxn(c.precio_mxn) : null, c.duracion_min !== null ? `${c.duracion_min} min` : null, c.comision ? `comisión ${textoRegla(c.comision)}` : null].filter(Boolean).join(", ");
                          return `${nombre(c.usuario_id)}${propio ? ` (${propio})` : ""}`;
                        }).join(" · ")}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.activo ? <span className="text-13 text-ink-2">Activo</span>
                        : <span className="rounded-full bg-hover px-2 py-0.5 text-11 font-bold text-ink-3">Inactivo</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-4">
                        <AccionFila disabled={guardando} onClick={() => editar(s)}>Editar</AccionFila>
                        <AccionFila disabled={guardando} onClick={() => void cambiarActivo(s)}>{s.activo ? "Desactivar" : "Activar"}</AccionFila>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
