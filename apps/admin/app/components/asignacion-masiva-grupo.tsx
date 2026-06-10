"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import { listarProductos, type Producto } from "../lib/catalogo";
import { asignarGrupoEnMasa, quitarGrupoEnMasa, productosConGrupo } from "../lib/modificadores";

/**
 * Asignación EN MASA de un grupo de modificadores: filtra por categoría/búsqueda,
 * selecciona productos (o todos los visibles) y asigna/quita el grupo de un golpe.
 */
export function AsignacionMasivaGrupo({ grupoId, grupoNombre }: { grupoId: string; grupoNombre: string }) {
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [conGrupo, setConGrupo] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<string>("__todas__");
  const [q, setQ] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const [prods, asignados] = await Promise.all([listarProductos(), productosConGrupo(grupoId)]);
      setProductos(prods);
      setConGrupo(new Set(asignados));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grupoId]);

  const categorias = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productos ?? []) m.set(p.categoria_id, p.categoriaNombre);
    return [...m.entries()];
  }, [productos]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (productos ?? []).filter((p) =>
      (cat === "__todas__" || p.categoria_id === cat) &&
      (term === "" || p.nombre.toLowerCase().includes(term)),
    );
  }, [productos, cat, q]);

  const todasVisiblesSel = visibles.length > 0 && visibles.every((p) => sel.has(p.id));

  function toggleTodasVisibles() {
    const n = new Set(sel);
    if (todasVisiblesSel) visibles.forEach((p) => n.delete(p.id));
    else visibles.forEach((p) => n.add(p.id));
    setSel(n);
  }

  async function ejecutar(accion: "asignar" | "quitar") {
    setTrabajando(true);
    setError(null);
    setMsg(null);
    try {
      const ids = [...sel];
      if (accion === "asignar") {
        const n = await asignarGrupoEnMasa(grupoId, ids);
        setMsg(`«${grupoNombre}» asignado a ${n} producto${n === 1 ? "" : "s"} (los demás ya lo tenían).`);
      } else {
        await quitarGrupoEnMasa(grupoId, ids);
        setMsg(`«${grupoNombre}» quitado de ${ids.length} producto${ids.length === 1 ? "" : "s"}.`);
      }
      setSel(new Set());
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-[16px] font-semibold tracking-tight">Asignar a productos</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Selecciona productos (filtra por categoría o busca) y asigna este grupo en masa. Los que ya lo tienen aparecen marcados con la etiqueta.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-10 rounded border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-ink"
        >
          <option value="__todas__">Todas las categorías</option>
          {categorias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto…"
          className="h-10 w-56 rounded border border-line-strong px-3 text-[13px] outline-none focus:border-ink"
        />
        <button type="button" onClick={toggleTodasVisibles} className="rounded border border-line-strong px-3 py-2 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
          {todasVisiblesSel ? "Deseleccionar visibles" : `Seleccionar visibles (${visibles.length})`}
        </button>
        <span className="ml-auto text-[12.5px] font-semibold text-ink-3">{sel.size} seleccionados</span>
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {msg && <p className="mb-3 text-sm font-medium text-success">{msg}</p>}
      {productos === null && !error && <p className="text-sm text-ink-3">Cargando productos…</p>}

      {productos !== null && (
        <div className="max-h-[360px] overflow-y-auto rounded border border-line">
          {visibles.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-ink-3">Sin productos con ese filtro.</p>}
          {visibles.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3.5 py-2 last:border-b-0 hover:bg-hover">
              <input
                type="checkbox"
                checked={sel.has(p.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(p.id); else n.delete(p.id);
                  setSel(n);
                }}
                className="h-4 w-4 accent-ink"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{p.nombre}</span>
              <span className="text-[11.5px] text-ink-3">{p.categoriaNombre}</span>
              {conGrupo.has(p.id) && (
                <span className="rounded-full bg-[#EAF3EE] px-2 py-0.5 text-[10.5px] font-bold text-success">Ya lo tiene</span>
              )}
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => ejecutar("quitar")} disabled={sel.size === 0 || trabajando}>
          Quitar de seleccionados
        </Button>
        <Button onClick={() => ejecutar("asignar")} disabled={sel.size === 0 || trabajando}>
          {trabajando ? "Aplicando…" : `Asignar a ${sel.size || ""} seleccionados`}
        </Button>
      </div>
    </section>
  );
}
