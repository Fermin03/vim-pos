"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  actualizarSucursal,
  crearSucursal,
  sucursalSchema,
  type Sucursal,
} from "../lib/configuracion";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export function ModalSucursal({
  sucursal,
  onCerrar,
  onGuardado,
}: {
  sucursal: Sucursal | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const editar = !!sucursal;
  const [codigo, setCodigo] = useState(sucursal?.codigo ?? "");
  const [nombre, setNombre] = useState(sucursal?.nombre ?? "");
  const [calle, setCalle] = useState(sucursal?.direccion_calle ?? "");
  const [ciudad, setCiudad] = useState(sucursal?.ciudad ?? "");
  const [estadoGeo, setEstadoGeo] = useState(sucursal?.estado_geo ?? "");
  const [tel, setTel] = useState(sucursal?.telefono ?? "");
  const [activa, setActiva] = useState(sucursal?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    const parsed = sucursalSchema.safeParse({
      codigo,
      nombre,
      direccion_calle: calle,
      ciudad,
      estado_geo: estadoGeo,
      telefono: tel,
      activa,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarSucursal(sucursal!.id, parsed.data);
      else await crearSucursal(parsed.data);
      onGuardado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar";
      setError(
        /unique|duplicate/i.test(msg)
          ? "Ya existe una sucursal con ese código."
          : msg,
      );
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={editar ? "Editar sucursal" : "Nueva sucursal"}
      hideTitle
      className="w-[520px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {editar ? "Editar sucursal" : "Nueva sucursal"}
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label} htmlFor="s-cod">Código</label>
          <input
            id="s-cod"
            className={input}
            value={codigo}
            maxLength={10}
            autoFocus
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="K, KC"
          />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor="s-nom">Nombre</label>
          <input id="s-nom" className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} placeholder="León Centro" />
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="s-calle">Dirección <span className="text-ink-3">· opcional</span></label>
        <input id="s-calle" className={input} value={calle} maxLength={255} onChange={(e) => setCalle(e.target.value)} placeholder="Av. López Mateos 1234" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="s-ciudad">Ciudad</label>
          <input id="s-ciudad" className={input} value={ciudad} maxLength={100} onChange={(e) => setCiudad(e.target.value)} placeholder="León" />
        </div>
        <div>
          <label className={label} htmlFor="s-estado">Estado</label>
          <input id="s-estado" className={input} value={estadoGeo} maxLength={50} onChange={(e) => setEstadoGeo(e.target.value)} placeholder="Guanajuato" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="s-tel">Teléfono <span className="text-ink-3">· opcional</span></label>
          <input id="s-tel" className={input} value={tel} maxLength={20} onChange={(e) => setTel(e.target.value)} placeholder="477 123 4567" />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
        <span className="text-sm"><span className="font-medium">Sucursal activa</span> <span className="text-ink-3">(operando)</span></span>
      </label>

      {error && (
        <p className="mt-4 text-sm font-medium text-danger" role="alert">{error}</p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear sucursal"}
        </Button>
      </div>
    </Modal>
  );
}
