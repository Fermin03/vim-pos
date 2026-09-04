"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader, TablaScroll } from "../../../../components/page-header";
import { leerCfdiRecibido, type CfdiRecibido } from "../../../../lib/cfdi-recibido";
import { buscarCompraPorUuid, factorSugerido, listarAliases, registrarCompra, resolverLinea, totales, type Alias, type LineaCaptura } from "../../../../lib/compras";
import { buscarProveedorPorRfc, crearProveedor, listarProveedores, type Proveedor } from "../../../../lib/proveedores";
import { listarConversiones, listarInsumosOpciones, listarUnidadesDetalle, type Conversion, type InsumoOpcion, type UnidadDetalle } from "../../../../lib/recetas";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../../lib/inventario";
import { supabase } from "../../../../lib/supabase";
import { mensajeError } from "../../../../lib/errores";
import { hoyISO } from "../../../../lib/fechas";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const input = "h-10 w-full rounded border border-line-strong px-2 text-sm outline-none focus:border-ink";
const label = "mb-1 block text-[12px] font-medium text-ink-2";

/** Fila tal como se edita en pantalla (texto), más lo que vino del XML. */
type Fila = {
  descripcionOrigen: string | null; claveOrigen: string | null; emparejado: boolean;
  insumoId: string; cantidadTexto: string; unidadId: string; factorTexto: string; importeTexto: string; omitir: boolean;
};
const filaVacia = (): Fila => ({ descripcionOrigen: null, claveOrigen: null, emparejado: false, insumoId: "", cantidadTexto: "", unidadId: "", factorTexto: "1", importeTexto: "", omitir: false });

/** Unidad del sistema que corresponde a la ClaveUnidad del SAT más común; si no, la del insumo. */
const CLAVE_SAT_A_CODIGO: Record<string, string> = { KGM: "KG", GRM: "G", LTR: "L", MLT: "ML", ONZ: "OZ", H87: "PZA", XBX: "CAJ", XPK: "PAQ", XBO: "BOT" };

export default function NuevaCompraPage() {
  const router = useRouter();
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [conversiones, setConversiones] = useState<Conversion[]>([]);
  const [rfcNegocio, setRfcNegocio] = useState<string | null>(null);

  const [sucursalId, setSucursalId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [cfdi, setCfdi] = useState<CfdiRecibido | null>(null);
  const [proveedorSugerido, setProveedorSugerido] = useState<{ rfc: string; nombre: string } | null>(null);
  const [duplicada, setDuplicada] = useState<{ id: string; folio: string } | null>(null);
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [avisoArchivo, setAvisoArchivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([listarSucursalesOpciones(), listarProveedores(), listarInsumosOpciones(), listarUnidadesDetalle(), listarConversiones()])
      .then(([s, p, i, u, c]) => { setSucursales(s); setProveedores(p); setInsumos(i); setUnidades(u); setConversiones(c); if (s.length === 1) setSucursalId(s[0]!.id); })
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar los catálogos")));
    supabase.from("tenants").select("rfc").maybeSingle().then(({ data }) => setRfcNegocio(((data as { rfc?: string | null } | null)?.rfc) ?? null));
  }, []);

  const insumoDe = (id: string) => insumos.find((i) => i.id === id);
  const unidadDe = (id: string) => unidades.find((u) => u.id === id);
  const unidadPorCodigo = (codigo: string) => unidades.find((u) => u.codigo === codigo);

  async function leerArchivo(archivo: File) {
    setAvisoArchivo(null); setError(null); setDuplicada(null); setProveedorSugerido(null);
    const r = leerCfdiRecibido(await archivo.text());
    if (!r.ok) { setAvisoArchivo(r.motivo); return; }
    const c = r.cfdi;
    setCfdi(c);
    setFecha(c.fecha || hoyISO());
    setReferencia([c.serie, c.folio].filter(Boolean).join(" "));
    const avisos = [...c.avisos];
    if (rfcNegocio && c.receptorRfc && c.receptorRfc !== rfcNegocio) avisos.push("Esta factura no está a nombre de tu negocio");
    setAvisoArchivo(avisos.length ? avisos.join(". ") : null);

    const dup = await buscarCompraPorUuid(c.uuid);
    if (dup) { setDuplicada(dup); }

    const prov = c.emisor.rfc ? await buscarProveedorPorRfc(c.emisor.rfc) : null;
    if (prov) setProveedorId(prov.id);
    else { setProveedorId(""); setProveedorSugerido({ rfc: c.emisor.rfc, nombre: c.emisor.nombre }); }

    // Se piden los alias del proveedor recién resuelto (no del estado, que puede ir retrasado)
    // para emparejar las filas del XML desde el primer render, aunque sea la misma factura
    // que ya se leyó antes sin recargar la página.
    const alias = prov ? await listarAliases(prov.id).catch(() => [] as Alias[]) : [];
    setFilas(c.conceptos.map((con) => {
      const a = alias.find((x) => x.claveOrigen === con.claveOrigen);
      const unidadProv = unidadPorCodigo(CLAVE_SAT_A_CODIGO[con.claveUnidad] ?? "");
      return {
        descripcionOrigen: con.descripcion, claveOrigen: con.claveOrigen, emparejado: !!a,
        insumoId: a?.insumoId ?? "", cantidadTexto: String(con.cantidad),
        unidadId: a?.unidadId ?? unidadProv?.id ?? "", factorTexto: a ? String(a.factor) : "1",
        importeTexto: String(con.importeSinIva), omitir: false,
      };
    }));
  }

  async function crearProveedorSugerido() {
    if (!proveedorSugerido) return;
    try {
      const id = await crearProveedor({ nombre: proveedorSugerido.nombre || proveedorSugerido.rfc, rfc: proveedorSugerido.rfc });
      setProveedores(await listarProveedores());
      setProveedorId(id);
      setProveedorSugerido(null);
    } catch (e) { setError(mensajeError(e, "No se pudo crear el proveedor")); }
  }

  function set(i: number, patch: Partial<Fila>) { setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...patch } : f))); }
  function elegirInsumo(i: number, insumoId: string) {
    const f = filas[i]!;
    const insumo = insumoDe(insumoId);
    const unidadId = f.unidadId || insumo?.unidadId || "";
    const sugerido = factorSugerido(unidadDe(unidadId), insumo ? unidadDe(insumo.unidadId) : undefined, conversiones);
    set(i, { insumoId, unidadId, factorTexto: sugerido == null ? f.factorTexto : String(sugerido), emparejado: false });
  }
  function elegirUnidad(i: number, unidadId: string) {
    const f = filas[i]!;
    const insumo = insumoDe(f.insumoId);
    const sugerido = factorSugerido(unidadDe(unidadId), insumo ? unidadDe(insumo.unidadId) : undefined, conversiones);
    set(i, { unidadId, factorTexto: sugerido == null ? f.factorTexto : String(sugerido), emparejado: false });
  }

  const capturas: (LineaCaptura | null)[] = filas.map((f) => {
    if (f.omitir) return null;
    return {
      insumoId: f.insumoId, descripcionOrigen: f.descripcionOrigen, cantidadCapturada: Number(f.cantidadTexto), unidadCapturadaId: f.unidadId,
      factor: Number(f.factorTexto), importeSinIva: Number(f.importeTexto), claveOrigen: f.claveOrigen, omitir: false,
    };
  });
  const errores = filas.map((f, i) => {
    const c = capturas[i];
    if (!c) return null;
    if (!c.insumoId) return "Elige un insumo";
    if (!(c.cantidadCapturada > 0)) return "Cantidad mayor que cero";
    if (!c.unidadCapturadaId) return "Elige la unidad";
    if (!(c.factor > 0)) return "Factor mayor que cero";
    if (!(c.importeSinIva >= 0)) return "Importe inválido";
    return null;
  });
  const resueltas = useMemo(() => capturas.filter((c): c is LineaCaptura => !!c && !!c.insumoId && c.cantidadCapturada > 0 && c.factor > 0).map(resolverLinea), [filas]);
  const tot = totales(resueltas, cfdi ? cfdi.iva : null);
  const descuadre = cfdi ? Math.round((cfdi.total - tot.total) * 100) / 100 : 0;
  const puedeGuardar = !!sucursalId && !!proveedorId && resueltas.length > 0 && errores.every((e) => e === null) && !duplicada;

  async function registrar() {
    setError(null);
    if (!puedeGuardar) { setError("Revisa proveedor, sucursal y las filas marcadas."); return; }
    setGuardando(true);
    try {
      const nuevosAlias: Alias[] = filas
        .filter((f) => !f.omitir && f.claveOrigen && f.insumoId && !f.emparejado)
        .map((f) => ({ claveOrigen: f.claveOrigen as string, descripcionOrigen: f.descripcionOrigen, insumoId: f.insumoId, unidadId: f.unidadId, factor: Number(f.factorTexto) }));
      const id = await registrarCompra({
        sucursalId, proveedorId, fecha, referencia: referencia.trim() || null, cfdiUuid: cfdi?.uuid ?? null,
        origen: cfdi ? "XML" : "MANUAL", notas: notas.trim() || null, ivaXml: cfdi ? cfdi.iva : null, lineas: resueltas, aliases: nuevosAlias,
      });
      router.push(`/inventario/compras/${id}`);
    } catch (e) {
      setError(mensajeError(e, "No se pudo registrar la compra"));
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Nueva compra"
        subtitulo="Arrastra el XML de la factura o captura los insumos a mano. Nada se guarda hasta que registres la compra."
        migas={[{ label: "Inventario", href: "/inventario" }, { label: "Compras", href: "/inventario/compras" }, { label: "Nueva" }]}
        right={<Button variant="ghost" onClick={() => router.push("/inventario/compras")}>Cancelar</Button>}
      />
      <PageBody>
        <div className="grid gap-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong p-6 text-center text-sm text-ink-2 hover:bg-hover"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) leerArchivo(f); }}>
            <span className="font-medium text-ink">Arrastra el XML de la factura o haz clic</span>
            <span className="text-[12px] text-ink-3">CFDI 4.0 de ingreso, en pesos</span>
            <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = ""; }} />
          </label>
          {avisoArchivo && <p role="alert" className="text-sm font-medium text-warning">{avisoArchivo}</p>}
          {cfdi && <p className="text-[12px] text-ink-3">Factura {cfdi.uuid} de {cfdi.emisor.nombre} ({cfdi.emisor.rfc}), total {fmt(cfdi.total)}.</p>}
          {duplicada && <p role="alert" className="text-sm font-medium text-danger">Esta factura ya está registrada como la compra <Link className="underline" href={`/inventario/compras/${duplicada.id}`}>{duplicada.folio}</Link>.</p>}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={label} htmlFor="prov">Proveedor</label>
              <select id="prov" className={input} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {proveedorSugerido && !proveedorId && (
                <button type="button" className="mt-1 text-[12px] font-medium text-accent hover:underline" onClick={crearProveedorSugerido}>Crear proveedor "{proveedorSugerido.nombre || proveedorSugerido.rfc}"</button>
              )}
            </div>
            {sucursales.length > 1 && (
              <div><label className={label} htmlFor="suc">Sucursal que recibe</label>
                <select id="suc" className={input} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}><option value="">Elige…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
            )}
            <div><label className={label} htmlFor="fecha">Fecha</label><input id="fecha" type="date" className={input} value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><label className={label} htmlFor="ref">Factura o nota</label><input id="ref" className={input} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="A 1234" /></div>
          </div>

          <TablaScroll min={1000}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  {cfdi && <th className="py-2 pr-2 font-semibold">En la factura</th>}
                  <th className="py-2 pr-2 font-semibold">Insumo</th>
                  <th className="py-2 pr-2 text-right font-semibold">Cantidad</th>
                  <th className="py-2 pr-2 font-semibold">Unidad</th>
                  <th className="py-2 pr-2 text-right font-semibold">Factor</th>
                  <th className="py-2 pr-2 text-right font-semibold">En unidad del insumo</th>
                  <th className="py-2 pr-2 text-right font-semibold">Importe sin IVA</th>
                  <th className="py-2 pr-2 text-right font-semibold">Costo unitario</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const insumo = insumoDe(f.insumoId);
                  const c = capturas[i];
                  const res = c && c.insumoId && c.cantidadCapturada > 0 && c.factor > 0 ? resolverLinea(c) : null;
                  return (
                    <tr key={i} className={`border-b border-line-soft align-top ${f.omitir ? "opacity-50" : ""}`}>
                      {cfdi && <td className="max-w-[220px] py-2 pr-2 text-[12px] text-ink-2">{f.descripcionOrigen}{f.emparejado && <span className="ml-1 rounded bg-[#E8F1EC] px-1 text-[10.5px] font-medium text-success">Emparejado</span>}</td>}
                      <td className="py-1.5 pr-2">
                        <select className={input} value={f.insumoId} disabled={f.omitir} onChange={(e) => elegirInsumo(i, e.target.value)} aria-label="Insumo">
                          <option value="">Elige…</option>{insumos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                        </select>
                        {!f.omitir && errores[i] && <p className="mt-1 text-[11.5px] text-danger">{errores[i]}</p>}
                      </td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.cantidadTexto} onChange={(e) => set(i, { cantidadTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Cantidad" /></td>
                      <td className="py-1.5 pr-2">
                        <select className={input} value={f.unidadId} disabled={f.omitir} onChange={(e) => elegirUnidad(i, e.target.value)} aria-label="Unidad del proveedor">
                          <option value="">…</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.simbolo}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.factorTexto} onChange={(e) => set(i, { factorTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Factor a unidad del insumo" title="Cuántas unidades del insumo trae una unidad del proveedor" /></td>
                      <td className="py-3 pr-2 text-right tabular-nums text-ink-2">{res && insumo ? `${res.cantidad} ${unidadDe(insumo.unidadId)?.simbolo ?? ""}` : "—"}</td>
                      <td className="py-1.5 pr-2"><input className={`${input} text-right tabular-nums`} inputMode="decimal" disabled={f.omitir} value={f.importeTexto} onChange={(e) => set(i, { importeTexto: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Importe sin IVA" /></td>
                      <td className="py-3 pr-2 text-right tabular-nums">{res ? fmt(res.costoUnitario) : "—"}</td>
                      <td className="py-1.5 text-right">
                        {cfdi
                          ? <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => set(i, { omitir: !f.omitir })}>{f.omitir ? "Incluir" : "Omitir"}</button>
                          : <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => setFilas((p) => p.filter((_, k) => k !== i))}>Quitar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={cfdi ? 7 : 6} className="py-1 pr-2 text-right text-ink-2">Subtotal</td><td className="py-1 pr-2 text-right tabular-nums">{fmt(tot.subtotal)}</td><td></td></tr>
                <tr><td colSpan={cfdi ? 7 : 6} className="py-1 pr-2 text-right text-ink-2">IVA {cfdi ? "(de la factura)" : "16 %"}</td><td className="py-1 pr-2 text-right tabular-nums">{fmt(tot.iva)}</td><td></td></tr>
                <tr className="border-t border-line font-semibold"><td colSpan={cfdi ? 7 : 6} className="py-2 pr-2 text-right">Total</td><td className="py-2 pr-2 text-right tabular-nums">{fmt(tot.total)}</td><td></td></tr>
              </tfoot>
            </table>
          </TablaScroll>
          {cfdi && Math.abs(descuadre) > 0.05 && <p className="text-sm text-warning">El total no cuadra con la factura por {fmt(descuadre)}; revisa las filas omitidas.</p>}
          {!cfdi && <div><Button variant="ghost" onClick={() => setFilas((p) => [...p, filaVacia()])}>Agregar insumo</Button></div>}

          <div><label className={label} htmlFor="notas">Notas</label><textarea id="notas" className="min-h-[60px] w-full rounded border border-line-strong p-2 text-sm" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={registrar} disabled={!puedeGuardar || guardando}>{guardando ? "Registrando…" : "Registrar compra"}</Button>
          </div>
          <p className="text-[12px] text-ink-3">El factor dice cuántas unidades del insumo trae una unidad del proveedor: una caja de 12 piezas es factor 12. Se recuerda para la próxima factura del mismo proveedor.</p>
        </div>
      </PageBody>
    </>
  );
}
