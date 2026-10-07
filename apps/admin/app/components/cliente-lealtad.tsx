"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { leerProgramaAdmin, mensajeLealtad } from "../lib/lealtad";
import { ajustarSaldo, ajusteSchema, etiquetaTipo, historialCliente, type MovimientoLibro } from "../lib/lealtad-libro";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDia = (dia: string) => { const [a, m, d] = dia.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };

/**
 * La lealtad de un cliente: su saldo, cuándo vence, sus últimos movimientos y el ajuste manual
 * (spec §7). El ajuste queda en el libro con quién lo hizo y por qué; no hay forma de borrarlo.
 */
export function ClienteLealtad({
  cliente,
  onCerrar,
  onCambio,
}: {
  cliente: { id: string; nombre: string; saldo: number; venceEl: string | null };
  onCerrar: () => void;
  /** El saldo cambió: la lista de clientes debe releerse. */
  onCambio: () => void;
}) {
  const [mecanica, setMecanica] = useState<Mecanica>("PUNTOS_DINERO");
  const [saldo, setSaldo] = useState(cliente.saldo);
  const [historial, setHistorial] = useState<MovimientoLibro[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [puntos, setPuntos] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    leerProgramaAdmin().then((p) => { if (vivo && p) setMecanica(p.mecanica); }).catch(() => {});
    historialCliente(cliente.id)
      .then((h) => { if (vivo) { setHistorial(h); setErrorHistorial(null); } })
      .catch((e) => { if (vivo) setErrorHistorial(mensajeLealtad(e, "No se pudo leer el historial")); });
    return () => { vivo = false; };
  }, [cliente.id]);

  async function ajustar() {
    setError(null);
    setOk(null);
    const v = ajusteSchema.safeParse({ puntos, motivo });
    if (!v.success) { setError(v.error.issues[0]?.message ?? "Revisa el ajuste."); return; }
    setGuardando(true);
    try {
      const nuevo = await ajustarSaldo(cliente.id, Number(v.data.puntos), v.data.motivo);
      setSaldo(nuevo);
      setPuntos("");
      setMotivo("");
      setOk("Ajuste guardado.");
      onCambio();
      // El ajuste ya quedó guardado: si releer el historial falla, se conserva el que se veía y se avisa.
      try {
        setHistorial(await historialCliente(cliente.id));
        setErrorHistorial(null);
      } catch (e) {
        setErrorHistorial(mensajeLealtad(e, "El ajuste se guardó, pero no se pudo actualizar el historial"));
      }
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo ajustar el saldo"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!guardando) onCerrar(); }}
      title={`Lealtad de ${cliente.nombre}`}
      className="w-[560px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-24 font-semibold tabular-nums text-ink">{cantidad(mecanica, saldo)}</span>
        <span className="text-13 text-ink-3">{cliente.venceEl ? `Vence el ${fmtDia(cliente.venceEl)} si no vuelve` : "Sin fecha de vencimiento"}</span>
      </div>

      <h3 className="mb-2 mt-5 text-12 font-bold uppercase tracking-wide text-ink-3">Últimos movimientos</h3>
      <div className="max-h-[220px] overflow-y-auto rounded border border-line">
        {historial === null ? (
          errorHistorial
            ? <p className="p-3 text-13 font-medium text-danger" role="alert">{errorHistorial}</p>
            : <p className="p-3 text-13 text-ink-3">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="p-3 text-13 text-ink-3">Todavía no tiene movimientos.</p>
        ) : (
          <ul>
            {historial.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-13 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-ink">{etiquetaTipo(m.tipo)}{m.folio ? ` · ${m.folio}` : ""}</span>
                  <span className="block text-12 text-ink-3">{fmtFecha(m.fecha)}{m.usuario ? ` · ${m.usuario}` : ""}{m.motivo ? ` · ${m.motivo}` : ""}</span>
                </span>
                <span className={`flex-shrink-0 font-semibold tabular-nums ${m.puntos < 0 ? "text-danger" : "text-ink"}`}>
                  {m.puntos > 0 ? "+" : "−"}{Math.abs(m.puntos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {historial !== null && errorHistorial && <p className="mt-2 text-13 font-medium text-danger" role="alert">{errorHistorial}</p>}

      <h3 className="mb-2 mt-5 text-12 font-bold uppercase tracking-wide text-ink-3">Ajuste a mano</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <label className={label} htmlFor="aj-puntos">Cantidad</label>
          <input id="aj-puntos" className={input} inputMode="numeric" value={puntos} placeholder="10 o -10"
            onChange={(e) => { setPuntos(e.target.value.replace(/[^0-9-]/g, "")); setError(null); setOk(null); }} />
        </div>
        <div>
          <label className={label} htmlFor="aj-motivo">Motivo</label>
          <input id="aj-motivo" className={input} value={motivo} maxLength={200} placeholder="Por qué se suma o se quita"
            onChange={(e) => { setMotivo(e.target.value); setError(null); setOk(null); }} />
        </div>
      </div>
      <p className="mt-1.5 text-12 text-ink-3">Con signo menos para quitar. Queda guardado con tu nombre y no se puede borrar.</p>

      {error && <p className="mt-3 text-13 font-medium text-danger" role="alert">{error}</p>}
      {ok && <p className="mt-3 text-13 font-medium text-success" role="status">{ok}</p>}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cerrar</Button>
        <Button onClick={() => void ajustar()} disabled={guardando}>{guardando ? "Guardando…" : "Guardar ajuste"}</Button>
      </div>
    </Modal>
  );
}
