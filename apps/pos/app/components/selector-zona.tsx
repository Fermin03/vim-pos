"use client";
import { useState } from "react";
import { crearZona, cambiarCostoZona, type ZonaEnvio } from "../lib/zonas-envio";
import { fmtMxn } from "../lib/turno";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const chip = "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition";
const mini = "h-9 rounded border border-line-strong px-2 text-[13px] outline-none focus:border-ink";

const pesos = (n: number) => (n === 0 ? "$0" : `$${n.toFixed(0)}`);

/**
 * Zonas de reparto: elegir, dar de alta en el acto, y repreciar con PIN.
 *
 * Presentacional: el catálogo de zonas lo carga y posee `ModalClienteDomicilio` (UNA vez, en su
 * propio useEffect) porque `validarDir` necesita saber si el negocio tiene zonas, y este
 * componente se monta dos veces por modal (alta de cliente y alta de dirección alterna) — cargar
 * aquí adentro lo duplicaría. Cuando el catálogo cambia (alta o repreciar), este componente avisa
 * hacia arriba con `onZonaCreada` para que el modal lo refleje en su lista.
 *
 * Crear es libre y repreciar no: dar de alta "Las Joyas $40" no toca ninguna venta anterior, pero
 * bajarle el precio a la zona que usa el 80% de los pedidos sí es dinero del negocio.
 *
 * Un negocio sin zonas no ve más que el ＋: la caja sigue trabajando como antes de esta entrega.
 */
export function SelectorZona({
  token, tenantId, sucursalId, cajaId, turnoId, empleadoNombre, zonas, valor, onCambio, onZonaCreada,
}: {
  token: string; tenantId: string; sucursalId: string; cajaId: string; turnoId: string;
  /** Quien opera la caja: lo pide `ModalAutorizacionPin` para mostrar "lo ejecuta fulano". */
  empleadoNombre: string;
  /** Catálogo de zonas activas de la sucursal, provisto por el modal dueño. */
  zonas: ZonaEnvio[];
  valor: string | null;
  onCambio: (z: ZonaEnvio | null) => void;
  /** Alta o repreciado: el modal dueño debe reflejar la zona (nueva o actualizada) en su lista. */
  onZonaCreada: (z: ZonaEnvio) => void;
}) {
  const [alta, setAlta] = useState<{ nombre: string; costo: string } | null>(null);
  const [repreciando, setRepreciando] = useState<{ zona: ZonaEnvio; costo: string } | null>(null);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardarAlta() {
    if (!alta) return;
    const costo = Number(alta.costo || 0);
    if (!alta.nombre.trim()) { setError("Escribe el nombre de la zona."); return; }
    if (!Number.isFinite(costo) || costo < 0) { setError("El costo no puede ser negativo."); return; }
    try {
      const z = await crearZona(token, { tenantId, sucursalId, nombre: alta.nombre, costoMxn: costo });
      onZonaCreada(z);
      setAlta(null);
      setError(null);
      onCambio(z);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la zona");
    }
  }

  async function aplicarNuevoCosto() {
    if (!repreciando) return;
    const costo = Number(repreciando.costo || 0);
    if (!Number.isFinite(costo) || costo < 0) { setError("El costo no puede ser negativo."); return; }
    try {
      await cambiarCostoZona(token, repreciando.zona.id, costo);
      const actualizada: ZonaEnvio = { ...repreciando.zona, costoMxn: costo };
      // Mismo callback que el alta: para el modal dueño, "una zona cambió" se resuelve igual
      // creándola o repreciándola (upsert por id).
      onZonaCreada(actualizada);
      if (valor === actualizada.id) onCambio(actualizada);
      setRepreciando(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el costo");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {zonas.map((z) => (
          <span key={z.id} className="inline-flex items-center gap-1">
            <button type="button"
              onClick={() => onCambio(valor === z.id ? null : z)}
              className={[chip, valor === z.id ? "bg-ink text-white" : "bg-sel text-ink-2 hover:bg-hover"].join(" ")}>
              {z.nombre} · {pesos(z.costoMxn)}
            </button>
            <button type="button" title="Cambiar el costo (pide PIN)"
              onClick={() => { setRepreciando({ zona: z, costo: String(z.costoMxn) }); setPinAbierto(true); setError(null); }}
              className="text-[11px] text-ink-3 hover:text-ink">✎</button>
          </span>
        ))}
        {!alta && (
          <button type="button" onClick={() => { setAlta({ nombre: "", costo: "" }); setError(null); }}
            className={[chip, "border border-dashed border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {zonas.length === 0 ? "＋ Crear la primera zona" : "＋"}
          </button>
        )}
      </div>

      {alta && (
        <div className="flex items-center gap-1.5">
          <input className={`${mini} flex-1`} placeholder="Nombre (Las Joyas…)" maxLength={60}
            value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
          <input className={`${mini} w-24`} placeholder="Costo" inputMode="decimal"
            value={alta.costo} onChange={(e) => setAlta({ ...alta, costo: e.target.value })} />
          <button type="button" onClick={() => void guardarAlta()} className={[chip, "bg-ink text-white"].join(" ")}>Guardar</button>
          <button type="button" onClick={() => { setAlta(null); setError(null); }}
            className="text-[12px] text-ink-3 hover:text-ink-2">Cancelar</button>
        </div>
      )}

      {repreciando && !pinAbierto && (
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-ink-2">{repreciando.zona.nombre}</span>
          <input className={`${mini} w-24`} inputMode="decimal" autoFocus
            value={repreciando.costo} onChange={(e) => setRepreciando({ ...repreciando, costo: e.target.value })} />
          <button type="button" onClick={() => void aplicarNuevoCosto()} className={[chip, "bg-ink text-white"].join(" ")}>Aplicar</button>
          <button type="button" onClick={() => setRepreciando(null)}
            className="text-[12px] text-ink-3 hover:text-ink-2">Cancelar</button>
        </div>
      )}

      {error && <p className="text-[12px] font-medium text-danger" role="alert">{error}</p>}

      {pinAbierto && repreciando && (
        <ModalAutorizacionPin
          token={token}
          accion="editar_zona_envio"
          permisoCodigo="descuento.override_precio"
          descripcion={`Cambiar el costo de ${repreciando.zona.nombre} a ${fmtMxn(Number(repreciando.costo || 0))}`}
          ejecutaNombre={empleadoNombre}
          monto={Number(repreciando.costo || 0)}
          entidadTipo="zona_envio"
          entidadId={repreciando.zona.id}
          motivo={`Cambio de costo de la zona ${repreciando.zona.nombre}`}
          cajaId={cajaId}
          turnoId={turnoId}
          onAutorizado={() => setPinAbierto(false)}
          onCancelar={() => { setPinAbierto(false); setRepreciando(null); }}
        />
      )}
    </div>
  );
}
