"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import {
  actualizarProveedor, crearProveedor, eliminarProveedor, listarProveedores, proveedorSchema, type Proveedor,
} from "../../../lib/proveedores";
import { mensajeError } from "../../../lib/errores";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type Form = { nombre: string; rfc: string; telefono: string; email: string; notas: string };
const VACIO: Form = { nombre: "", rfc: "", telefono: "", email: "", notas: "" };

export default function ProveedoresPage() {
  const [filas, setFilas] = useState<Proveedor[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: Form } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    try { setFilas(await listarProveedores()); }
    catch (e) { setError(mensajeError(e, "No se pudieron cargar los proveedores")); setFilas([]); }
  }
  useEffect(() => { recargar(); }, []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = proveedorSchema.safeParse(editando.datos);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; }
    setGuardando(true);
    try {
      if (editando.id) await actualizarProveedor(editando.id, parsed.data);
      else await crearProveedor(parsed.data);
      setOkMsg("Proveedor guardado.");
      setTimeout(() => setOkMsg(null), 2500);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el proveedor"));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(p: Proveedor) {
    if (!confirm(`¿Dar de baja a "${p.nombre}"? No podrás registrarle compras; las anteriores se conservan.`)) return;
    try { await eliminarProveedor(p.id); recargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo dar de baja")); }
  }

  return (
    <>
      <PageHeader
        titulo="Proveedores"
        subtitulo="A quién le compras. El RFC sirve para reconocer sus facturas al registrar una compra."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Proveedores" }]}
        right={<div className="flex gap-2"><Link href="/inventario/compras" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Compras</Link><Button onClick={() => { setError(null); setEditando({ id: null, datos: VACIO }); }}>Nuevo proveedor</Button></div>}
      />
      <PageBody>
        {error && !editando && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={720}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Nombre</th>
                  <th className="py-2 pr-3 font-semibold">RFC</th>
                  <th className="py-2 pr-3 font-semibold">Teléfono</th>
                  <th className="py-2 pr-3 text-right font-semibold">Compras</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="h-10 border-b border-line-soft hover:bg-hover">
                    <td className="pr-3 font-medium">{p.nombre}</td>
                    <td className="pr-3 font-mono text-[12.5px] text-ink-2">{p.rfc ?? "—"}</td>
                    <td className="pr-3 text-ink-2">{p.telefono ?? "—"}</td>
                    <td className="pr-3 text-right tabular-nums">{p.compras}</td>
                    <td className="text-right">
                      <button className="mr-3 text-sm text-ink-2 hover:text-ink" onClick={() => { setError(null); setEditando({ id: p.id, datos: { nombre: p.nombre, rfc: p.rfc ?? "", telefono: p.telefono ?? "", email: p.email ?? "", notas: p.notas ?? "" } }); }}>Editar</button>
                      <button className="text-sm text-danger" onClick={() => borrar(p)}>Dar de baja</button>
                    </td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-ink-3">Aún no tienes proveedores.</td></tr>}
              </tbody>
            </table>
          </TablaScroll>
        )}

        {editando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
            <div role="dialog" aria-modal="true" aria-label={editando.id ? "Editar proveedor" : "Nuevo proveedor"} className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl">
              <h2 className="mb-4 font-display text-lg font-bold">{editando.id ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <div className="grid gap-3">
                <div><label className={label} htmlFor="p-nombre">Nombre</label><input id="p-nombre" className={input} value={editando.datos.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
                <div><label className={label} htmlFor="p-rfc">RFC (opcional)</label><input id="p-rfc" className={`${input} uppercase`} value={editando.datos.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} maxLength={13} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label} htmlFor="p-tel">Teléfono</label><input id="p-tel" className={input} value={editando.datos.telefono} onChange={(e) => set("telefono", e.target.value)} /></div>
                  <div><label className={label} htmlFor="p-email">Correo</label><input id="p-email" className={input} value={editando.datos.email} onChange={(e) => set("email", e.target.value)} /></div>
                </div>
                <div><label className={label} htmlFor="p-notas">Notas</label><textarea id="p-notas" className="min-h-[60px] w-full rounded border border-line-strong p-2 text-sm" value={editando.datos.notas} onChange={(e) => set("notas", e.target.value)} /></div>
                {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
