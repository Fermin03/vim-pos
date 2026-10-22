"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, useConfirmar } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../../components/page-header";
import { ExistenciasTabs } from "../../../components/existencias-tabs";
import { SelectorSucursal, useSucursalReporte } from "../../../components/selector-sucursal";
import { CapturaProductos } from "../../../components/captura-productos";
import { AccionFila } from "../../../components/controles";
import { input } from "../../../components/campos";
import { useConsulta, type Rango } from "../../../components/reporte";
import { mensajeError } from "../../../lib/errores";
import { formatear } from "../../../lib/reporte-tabla";
import {
  avisoRenglon,
  diferenciasConteo,
  listarExistencias,
  registrarConteo,
  type Capturable,
  type DiferenciaConteo,
} from "../../../lib/existencias";

const SIN_RANGO: Rango = { desde: "", hasta: "" };

type Renglon = { producto: Capturable; contado: string };

const soloNumero = (v: string) => v.replace(/[^0-9.]/g, "");
const productos = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

export default function ConteoPage() {
  const sucursal = useSucursalReporte();
  const enTodas = sucursal.id === null;
  // Sin sucursal no hay contra qué contar: no se consulta nada.
  const consulta = useConsulta(() => listarExistencias(sucursal.id), sucursal.listo && !enTodas ? SIN_RANGO : null, sucursal.clave);

  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [confirmar, dialogoConfirmar] = useConfirmar();
  // Cambiar de sucursal con algo contado pregunta antes; si no, la sucursal no cambia.
  const selector = {
    ...sucursal,
    cambiar: async (id: string | null) => {
      const n = renglones.length;
      if (n > 0 && !(await confirmar({
        titulo: "¿Descartar el conteo?",
        mensaje: `Llevas ${productos(n)} ${n === 1 ? "capturado" : "capturados"}.`,
        boton: "Descartar",
      }))) return;
      sucursal.cambiar(id);
    },
  };
  const [revision, setRevision] = useState<DiferenciaConteo[] | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  // Lo contado es de una sucursal: si cambia, se empieza de nuevo.
  useEffect(() => {
    setRenglones([]);
    setListo(null);
    setError(null);
  }, [sucursal.clave]);

  const capturables = useMemo<Capturable[]>(
    () =>
      (consulta.datos ?? []).map((f) => ({
        id: f.producto_id,
        nombre: f.nombre_completo || f.producto_nombre,
        codigo_interno: f.codigo_interno,
        codigo_barras: f.codigo_barras,
      })),
    [consulta.datos],
  );

  // Cada escaneo suma 1 al contado de ese producto.
  function agregar(p: Capturable) {
    setListo(null);
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.id === p.id);
      if (i < 0) return [...rs, { producto: p, contado: "1" }];
      const contado = avisoRenglon(rs[i]!.contado, "", true) ? "1" : String(Math.round((Number(rs[i]!.contado) + 1) * 1000) / 1000);
      return rs.map((r, j) => (j === i ? { ...r, contado } : r));
    });
  }

  const avisos = renglones.map((r) => avisoRenglon(r.contado, "", true));
  const sePuede = !enTodas && renglones.length > 0 && avisos.every((a) => a === null) && !revisando;

  // Se vuelve a leer la existencia al revisar: mientras se contaba pudo venderse algo.
  async function revisar() {
    if (!sePuede || !sucursal.id) return;
    setRevisando(true);
    setError(null);
    try {
      const filas = await listarExistencias(sucursal.id);
      const nombres = new Map(renglones.map((r) => [r.producto.id, r.producto.nombre]));
      setRevision(
        diferenciasConteo(renglones.map((r) => ({ producto_id: r.producto.id, contado: Number(r.contado) })), filas).map((d) => ({
          ...d,
          nombre: d.nombre || nombres.get(d.producto_id) || "",
        })),
      );
    } catch (e) {
      setError(mensajeError(e, "No se pudo leer la existencia"));
    } finally {
      setRevisando(false);
    }
  }

  function confirmado(ajustados: number) {
    setRevision(null);
    setRenglones([]);
    setListo(`Listo: ${ajustados === 1 ? "se ajustó" : "se ajustaron"} ${productos(ajustados)}.`);
    consulta.reintentar();
  }

  return (
    <>
      <PageHeader titulo="Conteo físico" subtitulo="Cuenta lo que hay en el anaquel y corrige la existencia." />
      <ExistenciasTabs />
      <PageBody>
        <SelectorSucursal sucursal={selector} className="mb-5 w-full lg:w-auto" />
        {enTodas && sucursal.listo && <p className="mb-5 text-13 text-ink-2">Elige una sucursal para contar.</p>}

        {consulta.error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-14 font-medium text-danger">{consulta.error}</p>
            <Button variant="ghost" onClick={consulta.reintentar} disabled={consulta.cargando}>
              {consulta.cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )}

        {!enTodas && consulta.datos === null && !consulta.error && <p className="text-14 text-ink-2">Cargando…</p>}

        {!enTodas && consulta.datos !== null && (
          <div className="max-w-3xl">
            <p className="mb-4 text-13 text-ink-2">Solo se cuentan los productos que captures. Lo que no captures no se toca.</p>
            {capturables.length === 0 ? (
              <p className="text-14 text-ink-2">Todavía no hay productos que lleven existencias.</p>
            ) : (
              <CapturaProductos productos={capturables} alAgregar={agregar} />
            )}

            {renglones.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-13 text-ink-2">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Producto</th>
                      <th className="pr-2 font-medium">Contado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {renglones.map((r, i) => (
                      <tr key={r.producto.id} className="border-t border-line align-top">
                        <td className="py-2 pr-2">
                          <span className="block pt-2 font-medium">{r.producto.nombre}</span>
                          {avisos[i] && <span className="block text-13 font-medium text-danger" role="alert">{avisos[i]}</span>}
                        </td>
                        <td className="py-2 pr-2">
                          <input aria-label="Contado" className={`${input} h-9 w-24`} inputMode="decimal" value={r.contado}
                            onChange={(e) => setRenglones((rs) => rs.map((x) => (x.producto.id === r.producto.id ? { ...x, contado: soloNumero(e.target.value) } : x)))} />
                        </td>
                        <td className="py-2 pt-4 text-right">
                          <AccionFila peligro onClick={() => setRenglones((rs) => rs.filter((x) => x.producto.id !== r.producto.id))}>Quitar</AccionFila>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <p className="mt-4 text-sm font-medium text-danger" role="alert">{error}</p>}
            {listo && <p className="mt-4 text-sm font-medium text-success" role="status">{listo}</p>}

            <div className="mt-5 flex justify-end">
              <Button onClick={() => void revisar()} disabled={!sePuede}>
                {revisando ? "Revisando…" : "Revisar diferencias"}
              </Button>
            </div>
          </div>
        )}

        {revision && sucursal.id && (
          <ModalRevision
            sucursalId={sucursal.id}
            sucursalNombre={sucursal.nombre}
            filas={revision}
            onHecho={confirmado}
            onCerrar={() => setRevision(null)}
          />
        )}
        {dialogoConfirmar}
      </PageBody>
    </>
  );
}

const firmado = (v: number) => (v > 0 ? `+${formatear(v, "cantidad")}` : formatear(v, "cantidad"));
const colorDiferencia = (v: number) => (v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-ink-3");

function ModalRevision({
  sucursalId,
  sucursalNombre,
  filas,
  onHecho,
  onCerrar,
}: {
  sucursalId: string;
  sucursalNombre: string | null;
  filas: DiferenciaConteo[];
  onHecho: (ajustados: number) => void;
  onCerrar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  const [error, setError] = useState<string | null>(null);

  let sobran = 0, faltan = 0;
  for (const f of filas) {
    if (f.diferencia > 0) sobran += f.diferencia;
    else faltan -= f.diferencia;
  }

  async function confirmar() {
    if (enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    setError(null);
    try {
      // Todos los renglones, también los que salen igual: el conteo queda registrado completo.
      const r = await registrarConteo(sucursalId, filas.map((f) => ({ producto_id: f.producto_id, contado: f.contado })));
      onHecho(r.ajustados);
    } catch (e) {
      setError(mensajeError(e, "No se pudo registrar el conteo"));
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal open hideTitle onClose={guardando ? () => {} : onCerrar} title="Revisar diferencias"
      className="w-full max-w-[640px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4">
        <p aria-hidden="true" className="font-display text-xl font-semibold tracking-tight">Revisar diferencias</p>
        <p className="mt-0.5 text-13 text-ink-3">
          {sucursalNombre ? `${sucursalNombre} · ` : ""}sobran {formatear(sobran, "cantidad")} · faltan {formatear(faltan, "cantidad")}
        </p>
      </div>
      <div className="mb-4 max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-13 text-ink-2">
            <tr>
              <th className="py-2 pr-2 font-medium">Producto</th>
              <th className="pr-2 text-right font-medium">Sistema</th>
              <th className="pr-2 text-right font-medium">Contado</th>
              <th className="text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto_id} className="border-t border-line">
                <td className="py-2 pr-2 font-medium">{f.nombre}</td>
                <td className="pr-2 text-right tabular-nums text-ink-2">{formatear(f.sistema, "cantidad")}</td>
                <td className="pr-2 text-right tabular-nums">{formatear(f.contado, "cantidad")}</td>
                <td className={`text-right font-semibold tabular-nums ${colorDiferencia(f.diferencia)}`}>{firmado(f.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Seguir contando</Button>
        <Button onClick={() => void confirmar()} disabled={guardando}>{guardando ? "Guardando…" : "Confirmar conteo"}</Button>
      </div>
    </Modal>
  );
}
