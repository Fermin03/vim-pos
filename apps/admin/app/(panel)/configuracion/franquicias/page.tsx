"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ConfigSideNav } from "../../../components/config-sidenav";
import {
  asignarFranquicia, crearFranquicia, eliminarFranquicia, listarFranquicias,
  listarSucursalesConFranquicia, type Franquicia, type SucursalFranquicia,
} from "../../../lib/franquicias";

/** Fase 5 · Franquicias: agrupa sucursales para el reporteo central (consolidado por franquicia). */
export default function FranquiciasPage() {
  const [franquicias, setFranquicias] = useState<Franquicia[] | null>(null);
  const [sucursales, setSucursales] = useState<SucursalFranquicia[]>([]);
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const [fs, ss] = await Promise.all([listarFranquicias(), listarSucursalesConFranquicia()]);
      setFranquicias(fs);
      setSucursales(ss);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => { cargar(); }, []);

  async function correr(fn: () => Promise<void>) {
    setTrabajando(true); setError(null);
    try { await fn(); await cargar(); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setTrabajando(false); }
  }

  return (
    <>
      <PageHeader titulo="Franquicias" subtitulo="Agrupa sucursales por franquiciatario para el reporteo central." migas={[{ label: "Configuración" }, { label: "Franquicias" }]} />
      <div className="flex">
        <ConfigSideNav />
        <PageBody>
          {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

          {/* Crear */}
          <div className="mb-5 flex items-center gap-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={150}
              placeholder="Nombre de la franquicia, p.ej. Franquicia Bajío"
              className="h-11 w-80 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
              onKeyDown={(e) => { if (e.key === "Enter" && nombre.trim()) correr(async () => { await crearFranquicia(nombre); setNombre(""); }); }}
            />
            <Button onClick={() => correr(async () => { await crearFranquicia(nombre); setNombre(""); })} disabled={!nombre.trim() || trabajando}>
              Crear franquicia
            </Button>
          </div>

          {/* Lista */}
          {franquicias === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
          {franquicias !== null && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Franquicias</div>
                {franquicias.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-ink-3">Sin franquicias aún. La operación propia no necesita una.</p>}
                {franquicias.map((f) => (
                  <div key={f.id} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0">
                    <div>
                      <div className="text-[14px] font-semibold">{f.nombre}</div>
                      <div className="text-[12px] text-ink-3">{f.nSucursales} sucursal{f.nSucursales === 1 ? "" : "es"}</div>
                    </div>
                    <button type="button" disabled={trabajando} onClick={() => correr(() => eliminarFranquicia(f.id))}
                      className="rounded px-2 py-1 text-[12.5px] font-semibold text-ink-3 transition hover:bg-hover hover:text-danger">
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>

              {/* Asignación de sucursales */}
              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Sucursales</div>
                {sucursales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="min-w-0 truncate text-[13.5px] font-medium">{s.nombre}</span>
                    <select
                      value={s.franquiciaId ?? ""}
                      disabled={trabajando}
                      onChange={(e) => correr(() => asignarFranquicia(s.id, e.target.value || null))}
                      className="h-9 rounded border border-line-strong bg-surface px-2 text-[12.5px] outline-none focus:border-ink"
                    >
                      <option value="">Operación propia</option>
                      {(franquicias ?? []).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 max-w-2xl text-[12px] text-ink-3">
            El acceso del franquiciatario se da en <b>Usuarios</b>: invítalo con rol Admin/Supervisor asignado a sus sucursales.
            El reporte <b>Consolidado</b> puede agruparse por franquicia.
          </p>
        </PageBody>
      </div>
    </>
  );
}
