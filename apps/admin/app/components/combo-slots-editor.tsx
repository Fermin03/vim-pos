"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  MODO_PRECIO,
  actualizarSlot,
  crearSlot,
  eliminarOpcion,
  eliminarSlot,
  guardarOpcion,
  listarOpciones,
  listarSlots,
  reordenarSlots,
  slotSchema,
  type ModoPrecio,
  type Opcion,
  type Slot,
  type SlotInput,
} from "../lib/combos";
import { listarCategoriasOpciones, listarProductos, precioMxn, type CategoriaOpcion, type Producto } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const inputSm =
  "h-9 w-24 rounded border border-line-strong px-2 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const MODO_CORTO: Record<ModoPrecio, string> = {
  DELTA: "Solo el delta",
  SUMA_PRECIO_PRODUCTO: "Suma el precio del producto",
};

function reglaSlot(min: number, max: number): string {
  if (min === max) return `Elige ${min}`;
  if (min === 0) return `Elige hasta ${max}`;
  return `Elige ${min}–${max}`;
}

// Mismo estilo que la insignia "Agotado" de catalogo/productos/page.tsx (BADGE.AGOTADO): un
// producto agotado hoy sigue siendo parte del combo, así que aquí solo se avisa, no se oculta.
function BadgeAgotado() {
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[#FBF1EF] px-2 py-0.5 text-[11px] font-semibold text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" />
      Agotado
    </span>
  );
}

// ── Modal: alta / edición de un slot ────────────────────────────────────────
function ModalSlot({
  slot,
  categorias,
  onCerrar,
  onGuardar,
}: {
  slot: Slot | null;
  categorias: CategoriaOpcion[];
  onCerrar: () => void;
  onGuardar: (input: SlotInput) => Promise<void>;
}) {
  const editar = !!slot;
  const [nombre, setNombre] = useState(slot?.nombre ?? "");
  const [minimo, setMinimo] = useState(slot ? String(slot.minimo_selecciones) : "1");
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>(slot?.modo_precio ?? "DELTA");
  const [fuente, setFuente] = useState<"categoria" | "lista">(slot?.categoria_id ? "categoria" : "lista");
  const [categoriaId, setCategoriaId] = useState(slot?.categoria_id ?? "");
  const [activo, setActivo] = useState(slot?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    if (fuente === "categoria" && !categoriaId) {
      setError("Elige una categoría");
      return;
    }
    const parsed = slotSchema.safeParse({
      nombre,
      minimo_selecciones: Number(minimo),
      // Fijo en 1 mientras la caja no sepa atender un slot múltiple (ver slotSchema en lib/combos).
      maximo_selecciones: 1,
      modo_precio: modoPrecio,
      categoria_id: fuente === "categoria" ? categoriaId : null,
      activo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(parsed.data);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title={editar ? "Editar slot" : "Agregar slot"} className="w-full max-w-[480px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <div className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="slot-nombre">
            Nombre del slot
          </label>
          <input
            id="slot-nombre"
            className={input}
            value={nombre}
            maxLength={80}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Hamburguesa, Acompañamiento, Bebida"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="slot-min">
              Mínimo a elegir
            </label>
            <input id="slot-min" className={input} value={minimo} inputMode="numeric" onChange={(e) => setMinimo(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
          <div>
            <span className={label}>Máximo a elegir</span>
            <p className="flex h-11 items-center text-sm text-ink-2">1 opción</p>
          </div>
        </div>
        <p className="-mt-2 text-[12.5px] text-ink-3">
          Por ahora cada slot deja elegir una sola opción. Los slots de varias opciones (por
          ejemplo “elige 2 acompañamientos”) llegan más adelante: la caja todavía no sabe pedir el
          término de dos hamburguesas dentro del mismo slot.
        </p>
        <div>
          <label className={label} htmlFor="slot-modo">
            Modo de precio
          </label>
          <select id="slot-modo" className={input} value={modoPrecio} onChange={(e) => setModoPrecio(e.target.value as ModoPrecio)}>
            {(Object.keys(MODO_PRECIO) as ModoPrecio[]).map((m) => (
              <option key={m} value={m}>
                {MODO_PRECIO[m]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-ink-3">
            Usa &quot;{MODO_PRECIO.SUMA_PRECIO_PRODUCTO}&quot; en el slot de la hamburguesa (o el producto principal del combo).
          </p>
        </div>
        <div>
          <p className={label}>Fuente de las opciones</p>
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5">
              <input type="radio" name="fuente" className="h-4 w-4 accent-[#16161A]" checked={fuente === "categoria"} onChange={() => setFuente("categoria")} />
              <span className="text-sm">Toda una categoría</span>
            </label>
            {fuente === "categoria" && (
              <select className={input} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Elige una categoría…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2.5">
              <input type="radio" name="fuente" className="h-4 w-4 accent-[#16161A]" checked={fuente === "lista"} onChange={() => setFuente("lista")} />
              <span className="text-sm">Lista de productos elegidos a mano</span>
            </label>
          </div>
        </div>
        {editar && (
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Slot activo</span>
            </span>
          </label>
        )}
        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : editar ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Fila de una opción (delta / default / incluido) ─────────────────────────
type FilaOpcion = { productoId: string; nombre: string; precio: number; agotado: boolean; delta: string; esDefault: boolean; activa: boolean };

function TablaOpciones({
  filas,
  guardando,
  onCambiarDelta,
  onElegirDefault,
  onToggleIncluido,
  onQuitar,
}: {
  filas: FilaOpcion[];
  guardando: string | null;
  onCambiarDelta: (productoId: string, delta: string) => void;
  onElegirDefault: (productoId: string) => void;
  onToggleIncluido: (productoId: string, activa: boolean) => void;
  onQuitar?: (productoId: string) => void;
}) {
  if (filas.length === 0) {
    return <p className="px-4 py-4 text-sm text-ink-3">Sin productos todavía.</p>;
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="border-b border-line px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">Producto</th>
          <th className="w-[90px] border-b border-line px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-ink-3">Precio</th>
          <th className="w-[110px] border-b border-line px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-ink-3">Delta</th>
          <th className="w-[80px] border-b border-line px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-3">Default</th>
          <th className="w-[90px] border-b border-line px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-3">Incluido</th>
          {onQuitar && <th className="w-[56px] border-b border-line px-3 py-2" />}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.productoId} className="border-b border-line last:border-none">
            <td className="px-3 py-2.5 text-[13.5px]">
              {f.nombre}
              {f.agotado && <BadgeAgotado />}
            </td>
            <td className="px-3 py-2.5 text-right font-display text-[13px] tabular-nums text-ink-2">{precioMxn(f.precio)}</td>
            <td className="px-3 py-2.5 text-right">
              {/* No controlado a propósito: si `value` viniera de `filas` cada tecla se
                  pisaría con el estado viejo (que solo cambia tras guardar). Se guarda al
                  salir del campo; la `key` fuerza que se refresque si `filas` cambia por otro
                  lado (recarga, u otra fila que se guardó). */}
              <input
                key={f.productoId + ":" + f.delta}
                className={inputSm + " ml-auto text-right"}
                defaultValue={f.delta}
                inputMode="decimal"
                disabled={guardando === f.productoId}
                onBlur={(e) => onCambiarDelta(f.productoId, e.target.value)}
              />
            </td>
            <td className="px-3 py-2.5 text-center">
              <input
                type="radio"
                name="default"
                className="h-4 w-4 accent-[#16161A]"
                checked={f.esDefault}
                disabled={guardando === f.productoId}
                onChange={() => onElegirDefault(f.productoId)}
              />
            </td>
            <td className="px-3 py-2.5 text-center">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#16161A]"
                checked={f.activa}
                disabled={guardando === f.productoId}
                onChange={(e) => onToggleIncluido(f.productoId, e.target.checked)}
              />
            </td>
            {onQuitar && (
              <td className="px-3 py-2.5 text-right">
                <button type="button" title="Quitar" onClick={() => onQuitar(f.productoId)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Panel de opciones de un slot expandido ──────────────────────────────────
function PanelOpciones({ slot, productos, onCambio }: { slot: Slot; productos: Producto[]; onCambio: () => void }) {
  const [explicitas, setExplicitas] = useState<Opcion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");

  async function recargar() {
    try {
      setExplicitas(await listarOpciones(slot.id));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las opciones"));
    }
  }
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id]);

  const porCategoria = !!slot.categoria_id;

  const filas: FilaOpcion[] = useMemo(() => {
    if (explicitas === null) return [];
    if (porCategoria) {
      return productos
        .filter((p) => p.categoria_id === slot.categoria_id && !p.es_combo)
        .map((p) => {
          const o = explicitas.find((x) => x.producto_id === p.id);
          return {
            productoId: p.id,
            nombre: p.nombre,
            precio: p.precio_base_mxn,
            agotado: p.estado === "AGOTADO",
            delta: String(o?.precio_delta_mxn ?? 0),
            esDefault: o?.es_default ?? false,
            activa: o?.activa ?? true,
          };
        });
    }
    return explicitas.map((o) => ({
      productoId: o.producto_id,
      nombre: o.nombre,
      precio: o.precio,
      agotado: o.estado === "AGOTADO",
      delta: String(o.precio_delta_mxn),
      esDefault: o.es_default,
      activa: o.activa,
    }));
  }, [explicitas, productos, porCategoria, slot.categoria_id]);

  // El input de delta guarda en el blur (para no disparar una escritura por cada tecla); el
  // valor mostrado mientras se escribe vive en el propio DOM (el input no está controlado por
  // `filas`, que solo se refresca tras guardar).
  async function guardarFila(productoId: string, patch: Partial<{ delta: number; esDefault: boolean; activa: boolean }>) {
    const actual = filas.find((f) => f.productoId === productoId);
    if (!actual) return;
    setGuardando(productoId);
    setError(null);
    try {
      await guardarOpcion(slot.id, productoId, {
        precio_delta_mxn: patch.delta ?? (Number(actual.delta) || 0),
        es_default: patch.esDefault ?? actual.esDefault,
        activa: patch.activa ?? actual.activa,
      });
      await recargar();
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(null);
    }
  }

  async function quitar(productoId: string) {
    const o = explicitas?.find((x) => x.producto_id === productoId);
    if (!o) return;
    setGuardando(productoId);
    setError(null);
    try {
      await eliminarOpcion(o.id);
      await recargar();
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo quitar"));
    } finally {
      setGuardando(null);
    }
  }

  async function agregar(productoId: string) {
    setGuardando(productoId);
    setError(null);
    try {
      await guardarOpcion(slot.id, productoId, { precio_delta_mxn: 0, es_default: false, activa: true });
      setBuscar("");
      await recargar();
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo agregar"));
    } finally {
      setGuardando(null);
    }
  }

  const yaAgregados = new Set((explicitas ?? []).map((o) => o.producto_id));
  const sugerencias =
    !porCategoria && buscar.trim().length > 0
      ? productos.filter((p) => !p.es_combo && !yaAgregados.has(p.id) && p.nombre.toLowerCase().includes(buscar.toLowerCase())).slice(0, 8)
      : [];

  return (
    <div className="border-t border-line bg-bg px-4 py-4">
      {error && (
        <p className="mb-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {!porCategoria && (
        <div className="relative mb-3 max-w-[320px]">
          <input
            className={input}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto para agregar…"
          />
          {sugerencias.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              {sugerencias.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] hover:bg-hover"
                  >
                    <span>{p.nombre}</span>
                    <span className="text-ink-3 tabular-nums">{precioMxn(p.precio_base_mxn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {explicitas === null ? (
        <p className="text-sm text-ink-3">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <TablaOpciones
            filas={filas}
            guardando={guardando}
            onCambiarDelta={(productoId, valor) => guardarFila(productoId, { delta: Number(valor.replace(/[^0-9.-]/g, "")) || 0 })}
            onElegirDefault={(productoId) => guardarFila(productoId, { esDefault: true })}
            onToggleIncluido={(productoId, activa) => guardarFila(productoId, { activa })}
            onQuitar={porCategoria ? undefined : quitar}
          />
        </div>
      )}
    </div>
  );
}

// ── Editor de slots ──────────────────────────────────────────────────────────
export function ComboSlotsEditor({ comboId, onCambio }: { comboId: string; onCambio: () => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaOpcion[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ slot: Slot | null } | null>(null);
  const [borrar, setBorrar] = useState<Slot | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  async function recargar() {
    setError(null);
    try {
      setSlots(await listarSlots(comboId));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los slots"));
    }
  }
  useEffect(() => {
    recargar();
    listarCategoriasOpciones().then(setCategorias).catch(() => {/* el selector de fuente se queda solo con "lista" */});
    listarProductos().then(setProductos).catch(() => {/* la tabla de opciones se queda vacía hasta reintentar */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboId]);

  const categoriaNombre = (id: string | null) => (id ? categorias.find((c) => c.id === id)?.nombre ?? "—" : null);

  async function guardarSlot(input: SlotInput) {
    if (modal?.slot) {
      await actualizarSlot(modal.slot.id, input);
    } else {
      await crearSlot(comboId, input);
    }
    setModal(null);
    await recargar();
    onCambio();
  }

  async function mover(slot: Slot, dir: -1 | 1) {
    if (!slots) return;
    const i = slots.findIndex((s) => s.id === slot.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slots.length) return;
    const copia = [...slots];
    const tmp = copia[i]!;
    copia[i] = copia[j]!;
    copia[j] = tmp;
    setSlots(copia); // respuesta inmediata; se corrige con el reload si el guardado falla
    try {
      await reordenarSlots(copia.map((s) => s.id));
      await recargar();
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo reordenar"));
      await recargar();
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarSlot(borrar.id);
      setBorrar(null);
      setBorrando(false);
      if (expandido === borrar.id) setExpandido(null);
      await recargar();
      onCambio();
    } catch (e) {
      setError(mensajeError(e, "No se pudo quitar"));
      setBorrando(false);
    }
  }

  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div>
          <h2 className="font-display text-base font-semibold">Slots del combo</h2>
          <p className="text-[12.5px] text-ink-3">Lo que la caja va preguntando: qué hamburguesa, qué acompañamiento, qué bebida.</p>
        </div>
        <Button variant="ghost" onClick={() => setModal({ slot: null })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[15px] w-[15px]">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agregar slot
        </Button>
      </div>

      {error && (
        <p className="mb-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {slots === null && <p className="text-sm text-ink-3">Cargando…</p>}

      {slots && slots.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-3">
          Sin slots todavía: la caja no puede vender este combo. Agrega el primero (ej. &quot;Hamburguesa&quot;).
        </div>
      )}

      {slots && slots.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {slots.map((s, i) => {
            const abierto = expandido === s.id;
            return (
              <div key={s.id} className="border-b border-line last:border-none">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandido(abierto ? null : s.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                    aria-expanded={abierto}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={"h-4 w-4 flex-shrink-0 text-ink-3 transition-transform " + (abierto ? "rotate-90" : "")}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14.5px] font-semibold">{s.nombre}</span>
                        {!s.activo && <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-semibold text-ink-3">Inactivo</span>}
                      </div>
                      <p className="text-[12.5px] text-ink-3">
                        {reglaSlot(s.minimo_selecciones, s.maximo_selecciones)} · {MODO_CORTO[s.modo_precio]} ·{" "}
                        {s.categoria_id ? `Categoría: ${categoriaNombre(s.categoria_id)}` : "Lista de productos"}
                      </p>
                    </div>
                  </button>
                  <span className="flex flex-shrink-0 gap-1">
                    <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(s, -1)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-hover hover:text-ink disabled:opacity-30">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                    </button>
                    <button type="button" title="Bajar" disabled={i === slots.length - 1} onClick={() => mover(s, 1)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-hover hover:text-ink disabled:opacity-30">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                    </button>
                    <button type="button" title="Editar" onClick={() => setModal({ slot: s })} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-hover hover:text-ink">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button type="button" title="Quitar" onClick={() => setBorrar(s)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  </span>
                </div>
                {abierto && <PanelOpciones slot={s} productos={productos} onCambio={onCambio} />}
              </div>
            );
          })}
        </div>
      )}

      {modal && <ModalSlot slot={modal.slot} categorias={categorias} onCerrar={() => setModal(null)} onGuardar={guardarSlot} />}

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Quitar slot" className="w-full max-w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            ¿Quitar <b className="text-ink">{borrar.nombre}</b>? La caja dejará de pedir este slot; los combos ya vendidos no cambian.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={borrando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarBorrado} disabled={borrando}>
              {borrando ? "Quitando…" : "Quitar"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
