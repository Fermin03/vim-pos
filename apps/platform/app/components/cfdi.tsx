"use client";
import { useCallback, useEffect, useState } from "react";
import type { Api } from "../lib/tipos";
import { hace } from "../lib/tipos";

/**
 * Cartera de facturación electrónica: quién tiene el add-on CFDI y cuántos folios le quedan.
 *
 * LA PANTALLA ESTÁ ORDENADA POR URGENCIA, NO POR NOMBRE
 *
 * Quedarse sin folios no se arregla en el momento: el cliente avisa, paga, y alguien de VIM tiene
 * que acreditar. Mientras tanto no puede darle factura a su comensal, que es de las pocas cosas
 * que un restaurante no puede posponer. Así que arriba va siempre quien no puede facturar hoy, y
 * el orden alfabético —que es lo cómodo de programar— aquí sería justo lo contrario de lo útil.
 *
 * Recargar y dar de baja se hacen desde la misma fila. Obligar a saltar al detalle de la empresa
 * para acreditar un paquete convierte una tarea de diez segundos en una de dos minutos, y es la
 * razón por la que este tipo de tablero se deja de usar.
 */

type Recarga = { fecha: string; tipo: string; cantidad: number };
type Cliente = {
  tenantId: string;
  codigo: string;
  nombre: string;
  estadoTenant: string;
  fechaInicio: string;
  precioMensual: number;
  paquetes: number;
  baseMensual: number;
  baseConsumidos: number;
  baseRestante: number;
  disponibles: number;
  periodo: string | null;
  umbral: number;
  nivel: "agotado" | "pocos" | "ok";
  ultimaRecarga: Recarga | null;
  sinFilaDeSaldo: boolean;
};
type Paquete = { id: string; codigo: string; nombre: string; cantidad_folios: number; precio_mxn: number };
type Totales = { clientes: number; agotados: number; pocos: number; foliosDisponibles: number; mrr: number };

const fmtMxn = (v: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v || 0);
const fmtInt = (v: number) => new Intl.NumberFormat("es-MX").format(v || 0);

/** Fecha corta y legible. Las de contrato son `date` (sin hora), así que se parte el ISO en vez de
 *  pasarlo por `new Date`, que interpretaría "2026-08-26" como UTC y en México restaría un día. */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  if (!a || !m || !d) return "—";
  return `${d}/${m}/${a}`;
}

const NIVEL: Record<Cliente["nivel"], { pastilla: string; texto: string }> = {
  agotado: { pastilla: "bg-[#FBECEA] text-danger", texto: "Sin folios" },
  pocos: { pastilla: "bg-[#FCF3E6] text-warning", texto: "Van pocos" },
  ok: { pastilla: "bg-[#EAF3EE] text-success", texto: "Con folios" },
};

export function Cfdi({ api, onAbrirEmpresa }: { api: Api; onAbrirEmpresa: (id: string) => void }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const d = await api("/api/cfdi");
      setClientes((d.clientes ?? []) as Cliente[]);
      setPaquetes((d.paquetes ?? []) as Paquete[]);
      setTotales((d.totales ?? null) as Totales | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!clientes) return <p className="text-[13px] text-ink-3">Cargando…</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight">Facturación electrónica</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Clientes con el add-on CFDI contratado. Ordenados por quién necesita folios antes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="h-9 rounded border border-line-strong px-3 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
        >
          Actualizar
        </button>
      </div>

      {totales && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato titulo="Clientes con CFDI" valor={fmtInt(totales.clientes)} />
          <Dato
            titulo="Sin folios"
            valor={fmtInt(totales.agotados)}
            alerta={totales.agotados > 0}
            sub={totales.agotados > 0 ? "no pueden facturar" : "ninguno"}
          />
          <Dato titulo="Folios en la cartera" valor={fmtInt(totales.foliosDisponibles)} sub="base + paquetes" />
          <Dato titulo="Ingreso del add-on" valor={fmtMxn(totales.mrr)} sub="al mes" />
        </div>
      )}

      {clientes.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center">
          <div className="font-display text-[17px] font-semibold">Todavía nadie tiene CFDI contratado</div>
          <p className="mt-1 text-[13px] text-ink-3">
            El add-on se da de alta desde el detalle de cada empresa, en Empresas.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-bg text-[11.5px] uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold">Cliente</th>
                <th className="px-4 py-2.5 text-right font-bold">Folios</th>
                <th className="px-4 py-2.5 text-left font-bold">Desde</th>
                <th className="px-4 py-2.5 text-left font-bold">Última recarga</th>
                <th className="px-4 py-2.5 text-right font-bold">Add-on</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <FilaCliente
                  key={c.tenantId}
                  c={c}
                  paquetes={paquetes}
                  api={api}
                  abierta={abierta === c.tenantId}
                  onAlternar={() => setAbierta(abierta === c.tenantId ? null : c.tenantId)}
                  onCambio={() => void cargar()}
                  onAbrirEmpresa={onAbrirEmpresa}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PerfilPac />
    </div>
  );
}

function Dato({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={["rounded-lg border bg-surface p-4", alerta ? "border-danger/30" : "border-line"].join(" ")}>
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className={["font-display mt-1 text-[24px] font-bold tabular-nums", alerta ? "text-danger" : ""].join(" ")}>
        {valor}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

function FilaCliente({
  c,
  paquetes,
  api,
  abierta,
  onAlternar,
  onCambio,
  onAbrirEmpresa,
}: {
  c: Cliente;
  paquetes: Paquete[];
  api: Api;
  abierta: boolean;
  onAlternar: () => void;
  onCambio: () => void;
  onAbrirEmpresa: (id: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [paqueteId, setPaqueteId] = useState("");
  const [manual, setManual] = useState("");
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  const nivel = NIVEL[c.nivel];

  async function accion(body: Record<string, unknown>, exito: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await api(`/api/tenants/${c.tenantId}`, { method: "PATCH", body: JSON.stringify(body) });
      setAviso(exito);
      onCambio();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => onAbrirEmpresa(c.tenantId)}
            className="text-left font-semibold hover:underline"
          >
            {c.nombre}
          </button>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
            <span>{c.codigo}</span>
            {c.estadoTenant !== "ACTIVO" && (
              <span className="rounded bg-sel px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">{c.estadoTenant}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="font-display text-[17px] font-bold tabular-nums">{fmtInt(c.disponibles)}</span>
            <span className={["rounded px-1.5 py-0.5 text-[11px] font-semibold", nivel.pastilla].join(" ")}>
              {nivel.texto}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] tabular-nums text-ink-3">
            {fmtInt(c.baseRestante)} del plan · {fmtInt(c.paquetes)} prepagados
          </div>
        </td>
        <td className="px-4 py-3 tabular-nums text-ink-2">{fechaCorta(c.fechaInicio)}</td>
        <td className="px-4 py-3 text-ink-2">
          {c.ultimaRecarga ? (
            <>
              <div className="tabular-nums">{fechaCorta(c.ultimaRecarga.fecha)}</div>
              <div className="text-[12px] text-ink-3">
                +{fmtInt(c.ultimaRecarga.cantidad)} · {hace(c.ultimaRecarga.fecha)}
              </div>
            </>
          ) : (
            <span className="text-ink-3">Nunca</span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-ink-2">{fmtMxn(c.precioMensual)}</td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onAlternar}
            className="h-8 rounded border border-line-strong px-2.5 text-[12px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            {abierta ? "Cerrar" : "Gestionar"}
          </button>
        </td>
      </tr>

      {c.sinFilaDeSaldo && (
        <tr className="border-b border-line">
          <td colSpan={6} className="bg-[#FBECEA] px-4 py-2 text-[12.5px] text-danger">
            Este cliente paga el add-on pero no tiene registro de saldo de folios, así que no puede
            timbrar nada. Acredítale un paquete aquí para crearlo.
          </td>
        </tr>
      )}

      {abierta && (
        <tr className="border-b border-line last:border-0">
          <td colSpan={6} className="bg-bg px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Acreditar folios</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={paqueteId}
                    onChange={(e) => setPaqueteId(e.target.value)}
                    className="h-9 rounded border border-line-strong px-2 text-[12.5px] outline-none focus:border-ink"
                  >
                    <option value="">Elige un paquete…</option>
                    {paquetes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} — {fmtInt(p.cantidad_folios)} folios · {fmtMxn(Number(p.precio_mxn))}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!paqueteId || ocupado}
                    onClick={() => {
                      const p = paquetes.find((x) => x.id === paqueteId);
                      void accion(
                        { accion: "acreditar_paquete", paquete_id: paqueteId },
                        `Acreditado: ${p?.nombre ?? "paquete"}.`,
                      );
                      setPaqueteId("");
                    }}
                    className="h-9 rounded bg-ink px-3 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Acreditar
                  </button>
                </div>
                {/* El ajuste manual va aparte y con etiqueta propia: acreditar un paquete es una
                    venta y queda con su precio en el ledger; el ajuste es una cortesía o una
                    corrección. Mezclarlos en un solo campo hace que el histórico deje de
                    distinguir lo que se cobró de lo que se regaló. */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="text-[12px] text-ink-3">Ajuste manual</span>
                  <input
                    type="number"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="ej. 50"
                    className="h-9 w-28 rounded border border-line-strong px-2 text-[12.5px] tabular-nums outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={!manual || Number(manual) === 0 || ocupado}
                    onClick={() => {
                      void accion(
                        { accion: "ajustar_folios", cantidad: Number(manual), motivo: "Ajuste desde el tablero CFDI" },
                        `Ajuste de ${manual} folios aplicado.`,
                      );
                      setManual("");
                    }}
                    className="h-9 rounded border border-line-strong px-3 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar
                  </button>
                  <span className="text-[12px] text-ink-3">En negativo, resta.</span>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado del servicio</div>
                <dl className="mt-3 space-y-1.5 text-[12.5px]">
                  <Renglon k="Base del plan" v={`${fmtInt(c.baseConsumidos)} de ${fmtInt(c.baseMensual)} usados`} />
                  <Renglon k="Periodo" v={c.periodo ?? "—"} />
                  <Renglon k="Avisa cuando queden" v={`${fmtInt(c.umbral)} folios`} />
                </dl>
                {/* La baja pide confirmación porque deja al cliente sin poder facturar, y desde una
                    tabla con un botón por fila es fácil pulsar la de al lado. */}
                <div className="mt-4 border-t border-line pt-3">
                  {confirmarBaja ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-medium text-danger">
                        ¿Dar de baja el CFDI de {c.nombre}? Dejará de poder facturar.
                      </span>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          void accion({ accion: "addon_desactivar", addon_codigo: "CFDI" }, "Add-on CFDI dado de baja.");
                          setConfirmarBaja(false);
                        }}
                        className="h-8 rounded bg-danger px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                      >
                        Sí, dar de baja
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmarBaja(false)}
                        className="h-8 rounded border border-line-strong px-3 text-[12px] font-semibold text-ink-2"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmarBaja(true)}
                      className="h-8 rounded border border-danger/40 px-3 text-[12px] font-semibold text-danger transition hover:bg-[#FBECEA]"
                    >
                      Desactivar facturación
                    </button>
                  )}
                </div>
              </div>
            </div>
            {aviso && <p className="mt-3 text-[12.5px] font-medium text-ink-2">{aviso}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function Renglon({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

/**
 * Timbres que le quedan a VIM en su propia cuenta del PAC.
 *
 * Es un dato distinto de todo lo de arriba: la tabla mide lo que cada CLIENTE tiene comprado; esto
 * mide el inventario del que VIM sirve a todos. Se puede vender folios con la tabla llena y aun así
 * no poder timbrar ninguno porque la cuenta del PAC se agotó.
 *
 * Todavía no se lee automáticamente y no se finge que sí: la cuenta Multiemisor no está activada
 * con Facturama, y no tiene sentido inventar un endpoint que no se ha podido verificar contra la
 * cuenta real. Enseñar un número aquí que no venga del PAC sería peor que no enseñar ninguno —
 * es justo el dato que se mira para decidir si hay que recargar.
 */
function PerfilPac() {
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Timbres en la cuenta del PAC</div>
      <p className="mt-2 max-w-[70ch] text-[13px] text-ink-2">
        Este es el inventario propio de VIM, del que salen los folios de todos los clientes de
        arriba. Queda por conectar: la cuenta Multiemisor con Facturama todavía no está activada, y
        hasta poder comprobarlo contra la cuenta real no se pone aquí un número — es justo el dato
        con el que se decide si hay que recargar, y uno inventado sería peor que ninguno.
      </p>
      <p className="mt-2 text-[12.5px] text-ink-3">Mientras tanto, se consulta en el portal de Facturama.</p>
    </div>
  );
}
