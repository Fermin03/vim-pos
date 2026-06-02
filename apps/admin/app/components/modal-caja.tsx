"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  actualizarCaja,
  cajaSchema,
  crearCaja,
  listarSucursales,
  type Caja,
  type Sucursal,
} from "../lib/configuracion";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export function ModalCaja({
  caja,
  sucursalIdInicial,
  onCerrar,
  onGuardado,
}: {
  caja: Caja | null;
  sucursalIdInicial?: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const editar = !!caja;
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucId, setSucId] = useState(caja?.sucursal_id ?? sucursalIdInicial ?? "");
  const [numero, setNumero] = useState(caja ? String(caja.numero) : "");
  const [nombre, setNombre] = useState(caja?.nombre ?? "");
  const [activa, setActiva] = useState(caja?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarSucursales().then(setSucursales).catch(() => setError("No se pudieron cargar sucursales"));
  }, []);

  async function guardar() {
    setError(null);
    const parsed = cajaSchema.safeParse({
      sucursal_id: sucId,
      numero: Number(numero),
      nombre,
      activa,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarCaja(caja!.id, parsed.data);
      else await crearCaja(parsed.data);
      onGuardado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar";
      setError(
        /unique|duplicate/i.test(msg)
          ? "Ya existe una caja con ese número en esta sucursal."
          : msg,
      );
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title={editar ? "Editar caja" : "Nueva caja"}
      hideTitle
      className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">{editar ? "Editar caja" : "Nueva caja"}</h2>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="c-suc">Sucursal</label>
          <select id="c-suc" className={input} value={sucId} onChange={(e) => setSucId(e.target.value)}>
            <option value="">Elige una sucursal…</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="c-num">Número</label>
            <input id="c-num" className={input} value={numero} inputMode="numeric" onChange={(e) => setNumero(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1" />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="c-nom">Nombre</label>
            <input id="c-nom" className={input} value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} placeholder="Caja 01" />
          </div>
        </div>

        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          <span className="text-sm"><span className="font-medium">Caja activa</span></span>
        </label>

        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editar ? "Guardar" : "Crear caja"}</Button>
      </div>
    </Modal>
  );
}
