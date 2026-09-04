"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@vim/ui/styles";
import { useRouter } from "next/navigation";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { listarCompras, type CompraResumen } from "../../../lib/compras";
import { listarProveedores, type Proveedor } from "../../../lib/proveedores";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { mensajeError } from "../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";
const hoy = () => new Date().toISOString().slice(0, 10);
const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

export default function ComprasPage() {
  const router = useRouter();
  const [desde, setDesde] = useState(hace(30));
  const [hasta, setHasta] = useState(hoy());
  const [proveedorId, setProveedorId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [filas, setFilas] = useState<CompraResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangoInvalido = desde > hasta ? "La fecha inicial no puede ser mayor que la final" : hasta > hoy() ? "No puedes elegir fechas futuras" : null;

  async function cargar() {
    if (rangoInvalido) return;
    setError(null);
    try { setFilas(await listarCompras({ desde, hasta, proveedorId: proveedorId || undefined, sucursalId: sucursalId || undefined })); }
    catch (e) { setError(mensajeError(e, "No se pudieron cargar las compras")); setFilas([]); }
  }
  useEffect(() => { cargar(); listarProveedores().then(setProveedores).catch(() => {}); listarSucursalesOpciones().then(setSucursales).catch(() => {}); }, []);

  return (
    <>
      <PageHeader
        titulo="Compras"
        subtitulo="Lo que has recibido de proveedores. Cada compra alimenta existencias y costo promedio."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras" }]}
        right={<div className="flex gap-2"><Link href="/inventario/proveedores" className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-sm font-semibold text-ink-2 hover:bg-hover">Proveedores</Link><Button onClick={() => router.push("/inventario/compras/nueva")}>Nueva compra</Button></div>}
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[12px] text-ink-2">Desde<input type="date" className={input} value={desde} max={hoy()} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] text-ink-2">Hasta<input type="date" className={input} value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] text-ink-2">Proveedor
            <select className={input} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">Todos</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
          {sucursales.length > 1 && (
            <label className="grid gap-1 text-[12px] text-ink-2">Sucursal
              <select className={input} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}><option value="">Todas</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
            </label>
          )}
          <Button variant="ghost" onClick={cargar} disabled={!!rangoInvalido}>Aplicar</Button>
          {rangoInvalido && <span className="text-[12px] text-danger">{rangoInvalido}</span>}
        </div>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={800}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Folio</th>
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 font-semibold">Proveedor</th>
                  <th className="py-2 pr-3 font-semibold">Referencia</th>
                  <th className="py-2 pr-3 font-semibold">Sucursal</th>
                  <th className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id} className="h-10 border-b border-line-soft hover:bg-hover">
                    <td className="pr-3"><Link className="font-mono text-[12.5px] font-medium text-ink underline-offset-2 hover:underline" href={`/inventario/compras/${c.id}`}>{c.folio}</Link></td>
                    <td className="pr-3 tabular-nums text-ink-2">{c.fecha}</td>
                    <td className="pr-3">{c.proveedorNombre}</td>
                    <td className="pr-3 text-ink-2">{c.referencia ?? "—"}{c.origen === "XML" && <span className="ml-2 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">XML</span>}</td>
                    <td className="pr-3 text-ink-2">{c.sucursalNombre}</td>
                    <td className="pr-3 text-right tabular-nums">{fmt(c.total)}</td>
                    <td><span className={`rounded px-2 py-0.5 text-[12px] font-medium ${c.estado === "ANULADA" ? "bg-[#FBECEA] text-danger" : "bg-[#E8F1EC] text-success"}`}>{c.estado === "ANULADA" ? "Anulada" : "Confirmada"}</span></td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sm text-ink-3">No hay compras en este rango.</td></tr>}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </PageBody>
    </>
  );
}
