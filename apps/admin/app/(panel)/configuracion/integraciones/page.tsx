"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { listarSucursales, type Sucursal } from "../../../lib/configuracion";
import {
  accionConexion, actualizarConexion, etiquetaEstado, iniciarConexionUber, listarConexiones,
  mensajeErrorIntegracion, type ConexionApp, type EstadoConexion, type Verificacion,
} from "../../../lib/integraciones";
import { mensajeError } from "../../../lib/errores";

/** Spec F1b: conexiones de apps de delivery por sucursal. Solo Uber Eats por ahora. */
export default function IntegracionesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);
  const [conexiones, setConexiones] = useState<ConexionApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null); // id de la conexión con acción en curso
  const [desconectar, setDesconectar] = useState<ConexionApp | null>(null);

  async function recargar() {
    setError(null);
    try {
      const [s, c] = await Promise.all([listarSucursales(), listarConexiones()]);
      setSucursales(s);
      setConexiones(c);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
    }
  }
  useEffect(() => { recargar(); }, []);

  const uberDe = (sucursalId: string) => conexiones?.find((c) => c.sucursal_id === sucursalId && c.app === "APP_UBEREATS") ?? null;
  const conectar = () => { window.location.href = iniciarConexionUber(); };

  async function correr(cx: ConexionApp, accion: "pausar" | "reanudar" | "desconectar" | "verificar") {
    setOcupada(cx.id); setError(null); setAviso(null);
    try {
      if (accion === "verificar") {
        const v: Verificacion = await accionConexion("verificar", { conexion_id: cx.id });
        setAviso(v.integracion_activa
          ? `Conexión correcta. La tienda en Uber está ${v.tienda_online ? "en línea" : "fuera de línea" + (v.offline_reason ? ` (${v.offline_reason})` : "")}.`
          : `Hay un problema: ${v.detalle ?? "la integración no está activa en Uber"}.`);
      } else {
        await accionConexion(accion, { conexion_id: cx.id });
        setAviso(accion === "pausar" ? "Integración pausada: los pedidos de Uber no entrarán al POS hasta reanudar."
          : accion === "reanudar" ? "Integración reanudada." : "Tienda desconectada.");
      }
      await recargar();
    } catch (e) {
      setError(mensajeErrorIntegracion(e));
    } finally {
      setOcupada(null);
      setDesconectar(null);
    }
  }

  async function cambiar(cx: ConexionApp, cambios: { auto_aceptar?: boolean; tiempo_prep_min?: number }) {
    setError(null);
    try { await actualizarConexion(cx.id, cambios); await recargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo guardar")); }
  }

  const th = "border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Apps de delivery"
        subtitulo="Conecta tus tiendas de las apps de reparto para que los pedidos entren solos al POS."
        migas={[{ label: "Configuración" }, { label: "Apps de delivery" }]}
        right={<Button onClick={conectar}>Conectar con Uber Eats</Button>}
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {aviso && <p className="mb-4 text-sm font-medium text-success">{aviso}</p>}
        {(sucursales === null || conexiones === null) && !error && <p className="text-sm text-ink-3">Cargando…</p>}

        {sucursales !== null && conexiones !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Sucursal</th>
                  <th className={th}>Uber Eats</th>
                  <th className={`${th} w-[120px]`}>Auto-aceptar</th>
                  <th className={`${th} w-[110px]`}>Prep (min)</th>
                  <th className={`${th} w-[320px]`}></th>
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => {
                  const cx = uberDe(s.id);
                  const conectada = cx !== null && (cx.estado === "ACTIVA" || cx.estado === "PAUSADA" || cx.estado === "ERROR");
                  const trabajando = cx !== null && ocupada === cx.id;
                  return (
                    <tr key={s.id} className="border-b border-line last:border-none">
                      <td className="px-4 py-3.5"><div className="text-[15px] font-semibold">{s.nombre}</div></td>
                      <td className="px-4 py-3.5">
                        <Estado estado={cx?.estado ?? "SIN_CONECTAR"} />
                        {conectada && cx?.tienda_nombre_app && <div className="mt-1 text-[13px] text-ink-2">{cx.tienda_nombre_app}</div>}
                        {cx?.estado === "ERROR" && cx.ultimo_error && <div className="mt-1 text-[12.5px] text-danger">{cx.ultimo_error}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {conectada && cx && (
                          <label className="inline-flex items-center gap-2 text-[13px]">
                            <input type="checkbox" checked={cx.auto_aceptar} onChange={(e) => cambiar(cx, { auto_aceptar: e.target.checked })} className="h-4 w-4 accent-accent" />
                            {cx.auto_aceptar ? "Sí" : "No"}
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {conectada && cx && (
                          <input
                            type="number" min={1} max={180} defaultValue={cx.tiempo_prep_min} aria-label="Minutos de preparación"
                            onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 180 && v !== cx.tiempo_prep_min) cambiar(cx, { tiempo_prep_min: v }); }}
                            className="h-9 w-[76px] rounded border border-line bg-surface px-2 text-right text-[13.5px] tabular-nums"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!conectada && <Button variant="ghost" onClick={conectar}>Conectar</Button>}
                        {conectada && cx && (
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "verificar")}>Comprobar</Button>
                            {cx.estado === "ACTIVA" && <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "pausar")}>Pausar</Button>}
                            {cx.estado === "PAUSADA" && <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "reanudar")}>Reanudar</Button>}
                            <Button variant="ghost" disabled={trabajando} onClick={() => setDesconectar(cx)}>Desconectar</Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sucursales.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-ink-2">Primero crea una sucursal en Configuración › Sucursales.</div>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
          {["DiDi Food", "Rappi"].map((n) => (
            <div key={n} className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
              <span className="font-semibold text-ink-2">{n}</span> · Próximamente
            </div>
          ))}
        </div>
      </PageBody>

      {desconectar && (
        <Modal open onClose={() => setDesconectar(null)} title="Desconectar Uber Eats" className="w-full max-w-[420px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            Los pedidos de Uber Eats de <b className="text-ink">{desconectar.sucursal_nombre}</b> dejarán de llegar al POS.
            La tienda sigue existiendo en Uber y podrás volver a conectarla.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDesconectar(null)} disabled={ocupada !== null}>Cancelar</Button>
            <Button variant="danger" onClick={() => correr(desconectar, "desconectar")} disabled={ocupada !== null}>
              {ocupada ? "Desconectando…" : "Desconectar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Estado({ estado }: { estado: EstadoConexion }) {
  const activa = estado === "ACTIVA";
  const alerta = estado === "ERROR";
  const pausada = estado === "PAUSADA";
  const clase = activa ? "bg-[#EAF3EE] text-success" : alerta ? "bg-[#FBE9E7] text-danger" : pausada ? "bg-[#F6EEDD] text-warning" : "bg-hover text-ink-3";
  const punto = activa ? "bg-success" : alerta ? "bg-danger" : pausada ? "bg-warning" : "bg-ink-3";
  return (
    <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", clase].join(" ")}>
      <span className={["h-1.5 w-1.5 rounded-full", punto].join(" ")} />
      {etiquetaEstado(estado)}
    </span>
  );
}
