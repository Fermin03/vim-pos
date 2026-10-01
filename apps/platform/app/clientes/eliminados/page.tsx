"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSesion } from "../../lib/sesion";
import { fechaHoraMx, fmtInt, fmtMxn, nombreVertical } from "../../lib/formato";

type Eliminado = {
  id: string;
  codigo: string;
  nombre: string;
  vertical: string;
  plan: string | null;
  fechaAlta: string;
  eliminadoAt: string;
  quien: string;
  motivo: string;
  resumen: Record<string, number>;
  pagos: { cuantos: number; total: number };
  contacto: { nombre?: string; email?: string; telefono?: string };
  /** Archivos de Storage que todavía no se lograron borrar. */
  archivosPendientes: number;
};

/**
 * Lo único que queda de un cliente eliminado (0144, ADR 0023): quién era, cuándo y por qué se
 * borró, cuánto se borró, lo que le pagó a VIM y a quién llamar. De solo lectura — aquí no hay
 * nada que deshacer.
 */
export default function ClientesEliminados() {
  const { api } = useSesion();
  const [filas, setFilas] = useState<Eliminado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setFilas(((await api("/api/tenants/eliminados")).eliminados ?? []) as Eliminado[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Vuelve a pedirle a Storage que borre lo que quedó pendiente de ese cliente. */
  async function reintentar(id: string) {
    setReintentando(id);
    try {
      await api("/api/tenants/eliminados", { method: "POST", body: JSON.stringify({ id }) });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reintentar");
    } finally {
      setReintentando(null);
    }
  }

  return (
    <div>
      <Link href="/clientes" className="text-13 font-semibold text-ink-2 hover:text-ink">← Clientes</Link>
      <h1 className="mt-1 font-display text-18 font-semibold tracking-tight">Clientes eliminados</h1>
      <p className="mb-4 mt-0.5 max-w-prose text-13 text-ink-3">
        Negocios que se borraron por completo. De cada uno queda esta ficha y lo que ya estaba en la bitácora; sus datos
        no se pueden recuperar.
      </p>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
      {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
      {filas && filas.length === 0 && <p className="text-13 text-ink-2">No se ha eliminado a ningún cliente.</p>}

      {filas && filas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[860px] text-13">
            <thead>
              <tr className="border-b border-line bg-sel text-left text-12 font-semibold uppercase tracking-wide text-ink-2">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Eliminado</th>
                <th className="px-4 py-2.5">Motivo</th>
                <th className="px-4 py-2.5">Se borró</th>
                <th className="px-4 py-2.5">Pagó a VIM</th>
                <th className="px-4 py-2.5">Contacto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-ink">{f.nombre}</div>
                    <div className="font-mono text-12 text-ink-2">{f.codigo}</div>
                    <div className="text-12 text-ink-2">{nombreVertical(f.vertical)}{f.plan ? ` · ${f.plan}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    <div className="whitespace-nowrap">{fechaHoraMx(f.eliminadoAt, "corto")}</div>
                    <div className="text-12">{f.quien}</div>
                    <div className="whitespace-nowrap text-12">alta: {fechaHoraMx(f.fechaAlta, "corto")}</div>
                  </td>
                  <td className="max-w-[260px] px-4 py-2.5 text-ink-2">{f.motivo}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-2">
                    <div>{fmtInt(f.resumen.tickets ?? 0)} tickets</div>
                    <div className="text-12">{fmtInt(f.resumen.filas ?? 0)} filas · {fmtInt(f.resumen.cuentas ?? 0)} cuentas</div>
                    {f.archivosPendientes > 0 && (
                      <div className="mt-1.5">
                        <div className="text-12 font-semibold text-warning">
                          {fmtInt(f.archivosPendientes)} {f.archivosPendientes === 1 ? "archivo sin borrar" : "archivos sin borrar"}
                        </div>
                        <button
                          type="button"
                          onClick={() => void reintentar(f.id)}
                          disabled={reintentando !== null}
                          className="btn mt-1 h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink hover:bg-hover disabled:opacity-50"
                        >
                          {reintentando === f.id ? "Borrando…" : "Reintentar"}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-2">
                    {f.pagos.cuantos > 0 ? <>{fmtMxn(f.pagos.total)}<div className="text-12">{fmtInt(f.pagos.cuantos)} {f.pagos.cuantos === 1 ? "pago" : "pagos"}</div></> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {f.contacto.nombre && <div className="text-ink">{f.contacto.nombre}</div>}
                    {f.contacto.email && <div>{f.contacto.email}</div>}
                    {f.contacto.telefono && <div className="tabular-nums">{f.contacto.telefono}</div>}
                    {!f.contacto.nombre && !f.contacto.email && !f.contacto.telefono && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
