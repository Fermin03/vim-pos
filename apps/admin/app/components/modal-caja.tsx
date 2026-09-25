"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  actualizarCaja,
  cajaSchema,
  crearCaja,
  crearSucursal,
  listarSucursales,
  type Caja,
  type Sucursal,
} from "../lib/configuracion";
import { mensajeError } from "../lib/errores";

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
  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);
  // Un negocio recién registrado no tiene sucursal y la caja la exige: antes el select salía vacío
  // y no había forma de seguir desde aquí. La primera caja crea su sucursal al vuelo.
  const [nombreSucursal, setNombreSucursal] = useState("Matriz");
  const primeraCaja = !editar && sucursales !== null && sucursales.length === 0;
  const [sucId, setSucId] = useState(caja?.sucursal_id ?? sucursalIdInicial ?? "");
  const [numero, setNumero] = useState(caja ? String(caja.numero) : "");
  const [nombre, setNombre] = useState(caja?.nombre ?? "");
  const [activa, setActiva] = useState(caja?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarSucursales()
      .then((lista) => {
        setSucursales(lista);
        if (!editar && lista.length === 0) {
          setNumero((n) => n || "1");
          setNombre((n) => n || "Caja 1");
        }
        // Con una sola sucursal no hay nada que elegir.
        if (!editar && lista.length === 1) setSucId((id) => id || lista[0]!.id);
      })
      .catch(() => setError("No se pudieron cargar las sucursales"));
  }, [editar]);

  async function sucursalParaLaCaja(): Promise<string> {
    if (!primeraCaja) return sucId;
    const datos = { nombre: nombreSucursal.trim() || "Matriz", direccion_calle: "", ciudad: "", estado_geo: "", telefono: "", activa: true };
    let id: string;
    try {
      id = await crearSucursal({ ...datos, codigo: "MATRIZ" });
    } catch (e) {
      // El código es único por negocio y puede quedar ocupado por una sucursal borrada.
      if (!/unique|duplicate/i.test(mensajeError(e, ""))) throw e;
      id = await crearSucursal({ ...datos, codigo: `SUC${Date.now().toString(36).slice(-5).toUpperCase()}` });
    }
    // Si luego falla la caja, reintentar no debe crear otra sucursal.
    setSucursales([{ ...datos, id, codigo: "", nCajas: 0, nAreas: 0 }]);
    setSucId(id);
    return id;
  }

  async function guardar() {
    setError(null);
    if (sucursales === null) return;
    if (primeraCaja && !nombreSucursal.trim()) {
      setError("Ponle nombre a tu sucursal.");
      return;
    }
    const parsed = cajaSchema.safeParse({
      // La sucursal de la primera caja todavía no existe; se valida lo demás y se crea al guardar.
      sucursal_id: primeraCaja ? "00000000-0000-4000-8000-000000000000" : sucId,
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
      else await crearCaja({ ...parsed.data, sucursal_id: await sucursalParaLaCaja() });
      onGuardado();
    } catch (e) {
      const msg = mensajeError(e, "No se pudo guardar");
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
      className="w-full max-w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">{editar ? "Editar caja" : "Nueva caja"}</h2>
      </div>

      <div className="flex flex-col gap-4">
        {primeraCaja ? (
          <div>
            <label className={label} htmlFor="c-suc-nueva">Sucursal</label>
            <input id="c-suc-nueva" className={input} value={nombreSucursal} maxLength={150} onChange={(e) => setNombreSucursal(e.target.value)} />
            <p className="mt-1.5 text-[12.5px] text-ink-2">Es tu primera caja: con ella se crea tu sucursal. Si tienes más de una, las agregas después en Sucursales.</p>
          </div>
        ) : (
          <div>
            <label className={label} htmlFor="c-suc">Sucursal</label>
            <select id="c-suc" className={input} value={sucId} onChange={(e) => setSucId(e.target.value)} disabled={sucursales === null}>
              <option value="">{sucursales === null ? "Cargando…" : "Elige una sucursal…"}</option>
              {(sucursales ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="c-num">Número</label>
            <input id="c-num" className={input} value={numero} inputMode="numeric" onChange={(e) => setNumero(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-nom">Nombre</label>
            <input id="c-nom" className={input} value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} placeholder="Caja 01" />
          </div>
        </div>

        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          <span className="text-sm"><span className="font-medium">Caja activa</span></span>
        </label>

        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando || sucursales === null}>{guardando ? "Guardando…" : editar ? "Guardar" : "Crear caja"}</Button>
      </div>
    </Modal>
  );
}
