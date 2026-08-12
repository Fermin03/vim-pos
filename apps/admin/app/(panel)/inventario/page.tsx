"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import {
  actualizarInsumo,
  CATEGORIAS_INSUMO,
  crearInsumo,
  eliminarInsumo,
  insumoSchema,
  LABEL_CATEGORIA,
  listarInsumos,
  listarSucursalesOpciones,
  listarUnidades,
  registrarMovimiento,
  TIPOS_MOV,
  type Insumo,
  type SucursalOpcion,
  type TipoMovimientoUI,
  type Unidad,
} from "../../lib/inventario";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

type FormDatos = { nombre: string; unidad_medida_id: string; categoria: (typeof CATEGORIAS_INSUMO)[number]; costo: string; stockMin: string };
const VACIO: FormDatos = { nombre: "", unidad_medida_id: "", categoria: "OTROS", costo: "", stockMin: "" };

const POR_PAGINA = 12;

/** Estado de existencias de un insumo (P-143): agotado / bajo el mínimo / en nivel. */
type EstadoStock = "AGOTADO" | "BAJO" | "EN_NIVEL";
function estadoDe(i: Insumo): EstadoStock {
  if (i.stockActual <= 0) return "AGOTADO";
  if (i.alerta || (i.stockMinimo > 0 && i.stockActual < i.stockMinimo)) return "BAJO";
  return "EN_NIVEL";
}

const BADGE: Record<EstadoStock, { texto: string; clase: string }> = {
  AGOTADO: { texto: "Agotado", clase: "bg-[#FBECEA] text-danger" },
  BAJO: { texto: "Stock bajo", clase: "bg-[#FDF3E2] text-warning" },
  EN_NIVEL: { texto: "En nivel", clase: "bg-[#E8F1EC] text-success" },
};

function KpiInsumos({ label: etiqueta, valor, pie }: { label: string; valor: number; pie: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{etiqueta}</div>
      <div className="mt-1 font-display text-[26px] font-bold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-3">{pie}</div>
    </div>
  );
}

export default function InventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [moviendo, setMoviendo] = useState<Insumo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | EstadoStock>("TODOS");
  const [pagina, setPagina] = useState(1);

  async function recargar() {
    try {
      setInsumos(await listarInsumos());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setInsumos([]);
    }
  }
  useEffect(() => {
    recargar();
    listarUnidades().then(setUnidades).catch(() => {});
    listarSucursalesOpciones().then(setSucursales).catch(() => {});
  }, []);

  function nuevo() {
    setError(null);
    setEditando({ id: null, datos: { ...VACIO, unidad_medida_id: unidades[0]?.id ?? "" } });
  }
  function editar(i: Insumo) {
    setError(null);
    setEditando({
      id: i.id,
      datos: { nombre: i.nombre, unidad_medida_id: i.unidadId, categoria: (i.categoria as FormDatos["categoria"]) || "OTROS", costo: String(i.costoUnitario), stockMin: String(i.stockMinimo) },
    });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = insumoSchema.safeParse({
      nombre: editando.datos.nombre,
      unidad_medida_id: editando.datos.unidad_medida_id,
      categoria: editando.datos.categoria,
      costo_unitario_mxn: Number(editando.datos.costo || 0),
      stock_minimo_global: Number(editando.datos.stockMin || 0),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editando.id) await actualizarInsumo(editando.id, parsed.data);
      else await crearInsumo(parsed.data);
      setOkMsg("Insumo guardado.");
      setTimeout(() => setOkMsg(null), 2500);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(i: Insumo) {
    if (!confirm(`¿Eliminar el insumo "${i.nombre}"?`)) return;
    try {
      await eliminarInsumo(i.id);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  function set<K extends keyof FormDatos>(k: K, v: FormDatos[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  const todos = insumos ?? [];
  const conteo = {
    total: todos.length,
    enNivel: todos.filter((i) => estadoDe(i) === "EN_NIVEL").length,
    bajo: todos.filter((i) => estadoDe(i) === "BAJO").length,
    agotado: todos.filter((i) => estadoDe(i) === "AGOTADO").length,
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = todos.filter((i) => {
    if (filtro !== "TODOS" && estadoDe(i) !== filtro) return false;
    return q === "" || i.nombre.toLowerCase().includes(q);
  });
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  const TABS: { v: "TODOS" | EstadoStock; l: string }[] = [
    { v: "TODOS", l: "Todos" },
    { v: "EN_NIVEL", l: "En nivel" },
    { v: "BAJO", l: "Stock bajo" },
    { v: "AGOTADO", l: "Agotados" },
  ];

  return (
    <>
      <PageHeader
        titulo="Stock actual"
        subtitulo="Existencias de ingredientes y productos. El stock baja solo al vender."
        migas={[{ label: "Inventario" }, { label: "Stock actual" }]}
        right={<Button onClick={nuevo} disabled={unidades.length === 0}>Nuevo insumo</Button>}
      />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !editando && !moviendo && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        {insumos === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {insumos && insumos.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiInsumos label="Total de insumos" valor={conteo.total} pie="ingredientes y productos" />
            <KpiInsumos label="En nivel" valor={conteo.enNivel} pie="por encima del mínimo" />
            <KpiInsumos label="Stock bajo" valor={conteo.bajo} pie="conviene reabastecer" />
            <KpiInsumos label="Agotados" valor={conteo.agotado} pie="sin existencias" />
          </div>
        )}

        {insumos && insumos.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">Sin insumos todavía</p>
            <p className="mt-1 text-[13px]">Agrega los insumos que compras para controlar existencias y mermas.</p>
          </div>
        )}

        {insumos && insumos.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {/* Filtros por estado + búsqueda */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
                {TABS.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => { setFiltro(t.v); setPagina(1); }}
                    className={["rounded-[4px] px-3 py-1.5 text-[12.5px] font-semibold transition", filtro === t.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"].join(" ")}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              <input
                className="h-9 w-[220px] rounded border border-line-strong px-3 text-[13px] outline-none focus:border-ink"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                placeholder="Buscar insumo…"
                aria-label="Buscar insumo"
              />
            </div>

            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sel text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-semibold">Insumo</th>
                  <th className="px-4 py-2.5 font-semibold">Categoría</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Stock actual</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Mínimo</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Costo</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((i) => {
                  const est = estadoDe(i);
                  return (
                    <tr key={i.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{i.nombre}</td>
                      <td className="px-4 py-2.5 text-ink-2">{LABEL_CATEGORIA[i.categoria as keyof typeof LABEL_CATEGORIA] ?? (i.categoria || "—")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={est === "AGOTADO" ? "font-bold text-danger" : est === "BAJO" ? "font-bold text-warning" : ""}>
                          {i.stockActual} {i.unidadSimbolo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{i.stockMinimo} {i.unidadSimbolo}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[est].clase}`}>{BADGE[est].texto}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmt(i.costoUnitario)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setMoviendo(i)} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">Movimiento</button>
                        <button type="button" onClick={() => editar(i)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-ink">Editar</button>
                        <button type="button" onClick={() => borrar(i)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-danger">Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <p className="text-[14px] font-semibold text-ink-2">Sin resultados</p>
                      <p className="mt-1 text-[12.5px] text-ink-3">No hay insumos que coincidan con tu búsqueda o filtro.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span className="text-[12.5px] text-ink-3">Mostrando {visibles.length} de {filtrados.length} insumos</span>
              {totalPaginas > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaActual === 1}
                    className="rounded border border-line-strong px-2.5 py-1 text-[13px] font-semibold text-ink-2 transition hover:border-ink disabled:opacity-40 disabled:hover:border-line-strong">‹</button>
                  <span className="px-2 text-[12.5px] font-semibold tabular-nums">{paginaActual} / {totalPaginas}</span>
                  <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                    className="rounded border border-line-strong px-2.5 py-1 text-[13px] font-semibold text-ink-2 transition hover:border-ink disabled:opacity-40 disabled:hover:border-line-strong">›</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Editor de insumo */}
        {editando && (
          <div className="mt-5 max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">{editando.id ? "Editar insumo" : "Nuevo insumo"}</div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className={label} htmlFor="i-nombre">Nombre</label>
                <input id="i-nombre" className={input} value={editando.datos.nombre} maxLength={150} onChange={(e) => set("nombre", e.target.value)} placeholder="Carne molida" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="i-cat">Categoría</label>
                  <select id="i-cat" className={input} value={editando.datos.categoria} onChange={(e) => set("categoria", e.target.value as FormDatos["categoria"])}>
                    {CATEGORIAS_INSUMO.map((c) => <option key={c} value={c}>{LABEL_CATEGORIA[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="i-uni">Unidad</label>
                  <select id="i-uni" className={input} value={editando.datos.unidad_medida_id} onChange={(e) => set("unidad_medida_id", e.target.value)}>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.simbolo})</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="i-costo">Costo por unidad</label>
                  <input id="i-costo" className={input} value={editando.datos.costo} inputMode="decimal" onChange={(e) => set("costo", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
                </div>
                <div>
                  <label className={label} htmlFor="i-min">Stock mínimo</label>
                  <input id="i-min" className={input} value={editando.datos.stockMin} inputMode="decimal" onChange={(e) => set("stockMin", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
                </div>
              </div>
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}

        {moviendo && (
          <ModalMovimiento
            insumo={moviendo}
            sucursales={sucursales}
            onHecho={() => {
              setMoviendo(null);
              recargar();
            }}
            onCerrar={() => setMoviendo(null)}
          />
        )}
      </PageBody>
    </>
  );
}

function ModalMovimiento({
  insumo,
  sucursales,
  onHecho,
  onCerrar,
}: {
  insumo: Insumo;
  sucursales: SucursalOpcion[];
  onHecho: () => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimientoUI>("ENTRADA_COMPRA");
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState(String(insumo.costoUnitario || ""));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function confirmar() {
    setError(null);
    const cant = Number(cantidad || 0);
    if (cant <= 0) {
      setError("Indica una cantidad mayor a 0");
      return;
    }
    if (!sucursalId) {
      setError("Elige la sucursal");
      return;
    }
    setProcesando(true);
    try {
      await registrarMovimiento({
        sucursalId,
        insumoId: insumo.id,
        tipo,
        cantidad: cant,
        costoUnitario: tipo === "ENTRADA_COMPRA" ? Number(costo || 0) || null : null,
        motivo: motivo.trim() || undefined,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog">
      <div className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Movimiento de inventario</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{insumo.nombre} · stock {insumo.stockActual} {insumo.unidadSimbolo}</p>
        </div>

        <div className="mb-3 inline-flex w-full gap-0.5 rounded border border-line bg-hover p-[3px]">
          {TIPOS_MOV.map((t) => (
            <button key={t.v} type="button" onClick={() => setTipo(t.v)}
              className={["flex-1 rounded-[4px] px-2 py-2 text-[11.5px] font-semibold transition", tipo === t.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"].join(" ")}>
              {t.l}
            </button>
          ))}
        </div>

        {sucursales.length > 1 && (
          <div className="mb-3">
            <label className={label} htmlFor="m-suc">Sucursal</label>
            <select id="m-suc" className={input} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="m-cant">Cantidad ({insumo.unidadSimbolo})</label>
            <input id="m-cant" className={input} value={cantidad} inputMode="decimal" autoFocus onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
          </div>
          {tipo === "ENTRADA_COMPRA" && (
            <div>
              <label className={label} htmlFor="m-costo">Costo unitario</label>
              <input id="m-costo" className={input} value={costo} inputMode="decimal" onChange={(e) => setCosto(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className={label} htmlFor="m-mot">Motivo · opcional</label>
          <input id="m-mot" className={input} value={motivo} maxLength={150} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. compra del día, producto echado a perder" />
        </div>

        {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={procesando}>{procesando ? "Registrando…" : "Registrar"}</Button>
        </div>
      </div>
    </div>
  );
}
