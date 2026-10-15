"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DialogoPeligro, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { EnviosPestanas } from "../../../../components/envios-pestanas";
import { listarSucursales, type Sucursal } from "../../../../lib/configuracion";
import { listarZonas, type Zona } from "../../../../lib/zonas-envio";
import {
  PAGINA,
  asignarZona,
  coloniaSchema,
  contarColonias,
  crearColonia,
  eliminarColonia,
  listarColonias,
  mensajeSiembra,
  municipioDeSucursal,
  sembrarColonias,
  type ColoniaAdmin,
} from "../../../../lib/colonias";
import { mensajeError } from "../../../../lib/errores";
import { input, label } from "../../../../components/campos";

const BOTON = "h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50";

/** Catálogo de colonias de la sucursal: cargar las oficiales, ver cuáles ya tienen zona y asignar el resto. */
export default function ColoniasPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucId, setSucId] = useState("");
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [conteo, setConteo] = useState<{ total: number; sinZona: number } | null>(null);
  const [filas, setFilas] = useState<ColoniaAdmin[]>([]);
  const [totalFiltrado, setTotalFiltrado] = useState(0);
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [sinZona, setSinZona] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [zonaLote, setZonaLote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nueva, setNueva] = useState<{ nombre: string; codigoPostal: string; zonaId: string } | null>(null);
  const [borrar, setBorrar] = useState<ColoniaAdmin | null>(null);

  useEffect(() => {
    listarSucursales()
      .then((ss) => {
        setSucursales(ss);
        if (ss[0]) setSucId(ss[0].id);
      })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar las sucursales")));
  }, []);

  // Buscador con 300 ms de espera.
  useEffect(() => {
    const t = setTimeout(() => { setBusca(q); setPagina(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const recargar = useCallback(async () => {
    if (!sucId) return;
    try {
      const [c, l] = await Promise.all([contarColonias(sucId), listarColonias(sucId, { q: busca, sinZona, pagina })]);
      setConteo(c);
      setFilas(l.filas);
      setTotalFiltrado(l.total);
      setSel(new Set());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las colonias"));
      setConteo({ total: 0, sinZona: 0 });
    }
  }, [sucId, busca, sinZona, pagina]);
  useEffect(() => { recargar(); }, [recargar]);

  useEffect(() => {
    if (!sucId) return;
    setConteo(null);
    setAviso(null);
    setZonaLote("");
    setPagina(0);
    listarZonas(sucId).then(setZonas).catch((e) => setError(mensajeError(e, "No se pudieron cargar las zonas")));
    municipioDeSucursal(sucId).then(setMunicipio).catch(() => setMunicipio(null));
  }, [sucId]);

  async function accion(fn: () => Promise<void>, falla: string) {
    setError(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setError(mensajeError(e, falla));
    } finally {
      setOcupado(false);
    }
  }

  const cargar = () => accion(async () => {
    setAviso(mensajeSiembra(await sembrarColonias(sucId)));
    await recargar();
  }, "No se pudieron cargar las colonias");

  const cambiarZona = (id: string, zonaId: string) => accion(async () => {
    await asignarZona([id], zonaId || null);
    await recargar();
  }, "No se pudo asignar la zona");

  const aplicarLote = () => accion(async () => {
    await asignarZona([...sel], zonaLote || null);
    await recargar();
  }, "No se pudo asignar la zona");

  const guardarNueva = () => {
    if (!nueva) return;
    const p = coloniaSchema.safeParse(nueva);
    if (!p.success) { setError(p.error.issues[0]?.message ?? "Datos inválidos"); return; }
    return accion(async () => {
      await crearColonia(sucId, { nombre: p.data.nombre, codigoPostal: p.data.codigoPostal, zonaId: nueva.zonaId || null });
      setNueva(null);
      await recargar();
    }, "No se pudo guardar");
  };

  const confirmarBorrado = () => borrar && accion(async () => {
    await eliminarColonia(borrar.id);
    setBorrar(null);
    await recargar();
  }, "No se pudo eliminar");

  function alternar(id: string) {
    const s = new Set(sel);
    if (!s.delete(id)) s.add(id);
    setSel(s);
  }

  const sucursal = sucursales.find((s) => s.id === sucId);
  const vacio = conteo !== null && conteo.total === 0;
  const hayFiltro = busca.trim() !== "" || sinZona;
  const selectZona = (id: string, valor: string, onChange: (v: string) => void, extra = "") => (
    <select id={id} aria-label="Zona" className={`${input} ${extra}`} value={valor} onChange={(e) => onChange(e.target.value)} disabled={ocupado}>
      <option value="">Sin zona</option>
      {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        titulo="Colonias"
        subtitulo="Las colonias a las que reparte esta sucursal y la zona de envío de cada una."
        migas={[{ label: "Configuración" }, { label: "Envíos" }, { label: "Colonias" }]}
        right={sucId && !vacio ? <Button onClick={() => { setError(null); setNueva({ nombre: "", codigoPostal: "", zonaId: "" }); }}>Agregar colonia</Button> : undefined}
      />
      <PageBody>
        <EnviosPestanas />
        {sucursales.length === 0 ? (
          <p className="text-sm text-ink-3">No hay sucursales. Crea una primero.</p>
        ) : (
          <>
            <div className="mb-5 max-w-[320px]">
              <label className={label} htmlFor="c-suc">Sucursal</label>
              <select id="c-suc" className={input} value={sucId} onChange={(e) => setSucId(e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>

            {error && !nueva && !borrar && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
            {aviso && <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-13 text-ink-2" role="status">{aviso}</p>}
            {conteo === null && <p className="text-sm text-ink-3">Cargando…</p>}

            {vacio && (
              <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay colonias en {sucursal?.nombre}.</p>
                <p className="mt-1 text-sm text-ink-2">Carga las colonias oficiales y asígnales su zona de envío.</p>
                <div className="mt-4">
                  <Button onClick={cargar} disabled={ocupado}>
                    {ocupado ? "Cargando…" : municipio ? `Cargar colonias de ${municipio}` : "Cargar colonias"}
                  </Button>
                </div>
              </div>
            )}

            {conteo && !vacio && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <input
                    className={`${input} max-w-[280px]`}
                    placeholder="Buscar colonia"
                    aria-label="Buscar colonia"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-13 font-medium text-ink-2">
                    <input type="checkbox" checked={sinZona} onChange={(e) => { setSinZona(e.target.checked); setPagina(0); }} />
                    Solo sin zona
                  </label>
                  <span className="text-13 tabular-nums text-ink-3">{conteo.total} colonias · {conteo.sinZona} sin zona</span>
                </div>

                {sel.size > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                    <span className="text-13 font-semibold text-ink">{sel.size} {sel.size === 1 ? "seleccionada" : "seleccionadas"}</span>
                    <span className="text-13 text-ink-2">Asignar zona</span>
                    {selectZona("c-lote", zonaLote, setZonaLote, "!w-auto min-w-[200px]")}
                    <Button onClick={aplicarLote} disabled={ocupado}>Aplicar</Button>
                  </div>
                )}

                {filas.length === 0 ? (
                  <p className="text-sm text-ink-3">{hayFiltro ? "Ninguna colonia coincide." : "No hay colonias."}</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line bg-bg text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                          <th className="w-10 px-4 py-2.5">
                            <input
                              type="checkbox"
                              aria-label="Seleccionar todas las de esta página"
                              checked={sel.size === filas.length}
                              onChange={(e) => setSel(e.target.checked ? new Set(filas.map((f) => f.id)) : new Set())}
                            />
                          </th>
                          <th className="px-4 py-2.5">Nombre</th>
                          <th className="px-4 py-2.5">CP</th>
                          <th className="px-4 py-2.5">Origen</th>
                          <th className="px-4 py-2.5">Zona</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f) => (
                          <tr key={f.id} className="border-b border-line last:border-b-0">
                            <td className="px-4 py-2">
                              <input type="checkbox" aria-label={`Seleccionar ${f.nombre}`} checked={sel.has(f.id)} onChange={() => alternar(f.id)} />
                            </td>
                            <td className="px-4 py-2 font-semibold text-ink">{f.nombre}</td>
                            <td className="px-4 py-2 tabular-nums text-ink-2">{f.codigoPostal ?? "—"}</td>
                            <td className="px-4 py-2 text-ink-2">{f.origen === "SEPOMEX" ? "Oficial" : "Capturada"}</td>
                            <td className="px-4 py-2">{selectZona(`c-${f.id}`, f.zonaId ?? "", (v) => cambiarZona(f.id, v), "!h-9 min-w-[180px]")}</td>
                            <td className="px-4 py-2">
                              <div className="flex justify-end">
                                <button type="button" onClick={() => { setError(null); setBorrar(f); }} className={`${BOTON} !text-danger hover:!border-danger`}>
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <button type="button" className={BOTON} disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anteriores</button>
                  <span className="text-13 tabular-nums text-ink-3">
                    {totalFiltrado === 0 ? 0 : pagina * PAGINA + 1}–{pagina * PAGINA + filas.length} de {totalFiltrado}
                  </span>
                  <button type="button" className={BOTON} disabled={(pagina + 1) * PAGINA >= totalFiltrado} onClick={() => setPagina(pagina + 1)}>Siguientes</button>
                </div>
              </>
            )}
          </>
        )}
      </PageBody>

      {nueva && (
        <Modal
          open
          onClose={() => setNueva(null)}
          title="Agregar colonia"
          className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
        >
          <div className="mt-4">
            <label className={label} htmlFor="n-nombre">Nombre</label>
            <input id="n-nombre" className={input} value={nueva.nombre} maxLength={150} autoFocus onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="n-cp">Código postal (opcional)</label>
            <input id="n-cp" className={input} inputMode="numeric" maxLength={5} value={nueva.codigoPostal} onChange={(e) => setNueva({ ...nueva, codigoPostal: e.target.value })} />
          </div>
          <div className="mt-3">
            <label className={label} htmlFor="n-zona">Zona</label>
            {selectZona("n-zona", nueva.zonaId, (v) => setNueva({ ...nueva, zonaId: v }))}
          </div>

          {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setNueva(null)} disabled={ocupado} className="h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50">
              Cancelar
            </button>
            <Button className="flex-1" onClick={guardarNueva} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</Button>
          </div>
        </Modal>
      )}

      {borrar && (
        <DialogoPeligro
          titulo="¿Eliminar esta colonia?"
          consecuencia={<>Se quita <strong>{borrar.nombre}</strong> del catálogo. Los domicilios de clientes y los pedidos ya hechos no cambian.</>}
          error={error}
          boton="Eliminar"
          ocupado={ocupado}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
