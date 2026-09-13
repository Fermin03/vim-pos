"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSesion } from "../../lib/sesion";
import { textoActualizado, useRefresco } from "../../lib/refresco";
import { fechaHoraMx, fmtMxn, nombreFase } from "../../lib/formato";
import type { Detalle, Plan } from "../../lib/tipos";
import { Seccion } from "../../components/seccion";
import { TarjetaCifra } from "../../components/tarjeta-cifra";
import { PastillaEstado } from "../../components/pastilla-estado";
import { SaludTenant } from "../../components/salud-tenant";
import { AvisosCliente } from "../../components/avisos-cliente";
import { FichaContrato } from "../../components/ficha-contrato";
import { FichaFacturacion } from "../../components/ficha-facturacion";
import { ModulosLimites } from "../../components/modulos-limites";
import { ZonaPeligrosa } from "../../components/zona-peligrosa";
import { DialogoConfirmar } from "../../components/dialogo-confirmar";

const ANCLAS = [
  ["operacion", "Operación"],
  ["contrato", "Contrato"],
  ["facturacion", "Facturación"],
  ["peligro", "Zona peligrosa"],
] as const;

/**
 * Ficha de cliente. El orden de las secciones es el del trabajo diario: primero saber si está
 * operando, luego qué paga, luego lo que factura, y al final, aparte y con fricción, lo que
 * puede romperle el negocio. La cabecera dice siempre de quién son los datos (platform.md).
 */
export default function FichaCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api } = useSesion();
  const [d, setD] = useState<Detalle | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [impersonando, setImpersonando] = useState(false);
  // Aparte de `error`: `cargar()` lo limpia en cada refresco automático (cada 60 s, useRefresco), y
  // un aviso de "Uber no confirmó la pausa" que dure menos que el tiempo de leerlo no sirve de
  // nada. Este solo lo toca `accion()`, así que sobrevive al refresco hasta la siguiente vez que
  // se dé de baja el add-on (con éxito total, que lo limpia, o con fallos nuevos, que lo reemplazan).
  const [avisoUber, setAvisoUber] = useState<string[] | null>(null);

  const cargar = useCallback(async () => {
    try {
      const det = (await api(`/api/tenants/${id}`)) as unknown as Detalle;
      setD(det);
      setPlanes(((await api("/api/planes")).planes ?? []) as Plan[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api, id]);
  const { hace, recargar } = useRefresco(cargar);

  const accion = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await api(`/api/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await recargar();
      // addon_desactivar puede devolver "listo" con conexiones que no se pudieron avisar a Uber
      // (fallo de red, no se aborta la baja). Va en `avisoUber`, no en `error`: `error` se limpia
      // solo en cada refresco automático, y el operador podría no estar mirando la pantalla en ese
      // momento exacto.
      //
      // `route.ts` devuelve `{ fallos: [] }` en CUALQUIER `addon_desactivar`, no solo el de
      // DELIVERY (p.ej. dar de baja el add-on de CFDI, ficha-contrato.tsx). Sin el filtro por
      // `addon_codigo`, esa baja de otro add-on pisaba el aviso de Uber con un `[]` silencioso —
      // el mismo fallo silencioso que este aviso existe para evitar, solo que por otra puerta.
      if (body.accion === "addon_desactivar" && body.addon_codigo === "DELIVERY") {
        const fallos = r.fallos;
        if (Array.isArray(fallos)) setAvisoUber(fallos.length > 0 ? (fallos as string[]) : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      throw e;
    } finally {
      setBusy(false);
    }
  }, [api, id, recargar]);

  async function impersonar(motivo: string) {
    setBusy(true);
    try {
      const r = await api(`/api/tenants/${id}/impersonar`, { method: "POST", body: JSON.stringify({ motivo }) });
      if (r.link) window.open(String(r.link), "_blank");
      setImpersonando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (error && !d) return <p className="text-sm text-danger" role="alert">{error}</p>;
  if (!d) return <p className="text-sm text-ink-3">Cargando…</p>;

  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const estado = String(t.estado);
  const plan = t.plan as { codigo?: string; precio_mensual_mxn?: number } | null;
  const bloqueoDesde = t.bloqueo_desde ? String(t.bloqueo_desde) : null;

  return (
    <>
      <div className="sticky top-0 z-10 -mx-8 -mt-7 mb-6 border-b border-line bg-bg/95 px-8 pb-3 pt-4 backdrop-blur">
        <button onClick={() => router.push("/clientes")} className="text-[12px] font-semibold text-ink-3 hover:text-ink">← Clientes</button>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[22px] font-bold tracking-tight">{nombre}</h1>
            <PastillaEstado estado={estado} grande />
            <span className="font-mono text-[12px] text-ink-3">{String(t.codigo)} · {String(t.vertical_principal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1">
              {ANCLAS.map(([a, l]) => (
                <a key={a} href={`#${a}`} className={["rounded px-2.5 py-1 text-[12.5px] font-semibold hover:bg-hover", a === "peligro" ? "text-danger" : "text-ink-2"].join(" ")}>
                  {l}
                </a>
              ))}
            </nav>
            <button onClick={() => setImpersonando(true)} disabled={busy} className="btn h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50">
              Entrar como este cliente
            </button>
          </div>
        </div>
        {bloqueoDesde && (
          <p className="mt-2 text-[12.5px] font-semibold text-warning">
            Bloqueo programado: la caja dejará de vender el {fechaHoraMx(bloqueoDesde)} (hora de México).
          </p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
      {avisoUber && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-surface p-3 text-[13px] text-warning" role="alert">
          <p className="font-semibold">
            El add-on de delivery se dio de baja, pero Uber no confirmó la pausa de {avisoUber.length} conexión(es).
            Repórtalo para pausarlas a mano.
          </p>
          <ul className="mt-1 list-disc pl-4 text-[12px]">
            {avisoUber.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <Seccion id="operacion" titulo="Operación" descripcion="Lo que hace este cliente hoy: cajas, sincronización y ventas.">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TarjetaCifra titulo="Plan" valor={plan?.codigo ?? "—"} sub={fmtMxn(Number(plan?.precio_mensual_mxn ?? 0)) + "/mes"} texto />
            <TarjetaCifra titulo="Sucursales" valor={String(d.nSucursales)} />
            <TarjetaCifra titulo="Folios" valor={String(d.foliosSaldo)} sub={d.foliosBase ? `+${Math.max(d.foliosBase.mensuales - d.foliosBase.consumidos, 0)} de base este mes` : undefined} />
            <TarjetaCifra titulo="Fase" valor={nombreFase((t.onboarding as { fase?: string } | null)?.fase)} texto />
          </div>
          <SaludTenant api={api} id={id} />
          <AvisosCliente api={api} tenantId={id} nombre={nombre} />
        </Seccion>

        <Seccion id="contrato" titulo="Contrato" descripcion="Qué paga, qué tiene contratado y qué puede usar.">
          <FichaContrato d={d} planes={planes} accion={accion} busy={busy} />
          <ModulosLimites d={d} nombre={nombre} accion={accion} busy={busy} />
        </Seccion>

        <Seccion id="facturacion" titulo="Facturación" descripcion="Datos fiscales y folios CFDI.">
          <FichaFacturacion d={d} accion={accion} busy={busy} />
        </Seccion>

        <ZonaPeligrosa estado={estado} nombre={nombre} bloqueoDesde={bloqueoDesde} accion={accion} busy={busy} />
      </div>
      <p className="mt-4 text-[11.5px] text-ink-3">{textoActualizado(hace)}</p>

      <DialogoConfirmar
        abierto={impersonando}
        onCerrar={() => setImpersonando(false)}
        titulo="Entrar como este cliente"
        descripcion={<>Vas a abrir el admin de <b>{nombre}</b> con acceso de soporte. Queda en la bitácora con tu motivo.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Abrir su admin"
        ocupado={busy}
        onConfirmar={({ motivo }) => impersonar(motivo)}
      />
    </>
  );
}
