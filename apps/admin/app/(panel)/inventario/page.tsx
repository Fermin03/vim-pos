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

export default function InventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: FormDatos } | null>(null);
  const [moviendo, setMoviendo] = useState<Insumo | null>(null);
  const [guardando, setGuardando] = useState(false);

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

  return (
    <>
      <PageHeader
        titulo="Inventario"
        subtitulo="Insumos, existencias por sucursal y movimientos (entradas, mermas, ajustes)."
        right={<Button onClick={nuevo} disabled={unidades.length === 0}>Nuevo insumo</Button>}
      />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !editando && !moviendo && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        {insumos === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {insumos && insumos.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">Sin insumos todavía</p>
            <p className="mt-1 text-[13px]">Agrega los insumos que compras para controlar existencias y mermas.</p>
          </div>
        )}
        {insumos && insumos.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sel text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-semibold">Insumo</th>
                  <th className="px-4 py-2.5 font-semibold">Categoría</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Costo</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{i.nombre}</td>
                    <td className="px-4 py-2.5 text-ink-2">{LABEL_CATEGORIA[i.categoria as keyof typeof LABEL_CATEGORIA] ?? (i.categoria || "—")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={i.alerta ? "font-bold text-danger" : ""}>{i.stockActual} {i.unidadSimbolo}</span>
                      {i.alerta && <span className="ml-1.5 rounded-full bg-[#FBECEA] px-1.5 py-0.5 text-[10px] font-bold text-danger">bajo</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmt(i.costoUnitario)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => setMoviendo(i)} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">Movimiento</button>
                      <button type="button" onClick={() => editar(i)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-ink">Editar</button>
                      <button type="button" onClick={() => borrar(i)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-danger">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
