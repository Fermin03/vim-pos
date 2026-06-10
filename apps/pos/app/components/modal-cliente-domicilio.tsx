"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  buscarClientesDomicilio, registrarClienteDomicilio, agregarDireccionCliente, conDireccion,
  ETIQUETAS_DIRECCION, type ClienteDomicilio, type DireccionInput,
} from "../lib/clientes-domicilio";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1 block text-[12.5px] font-medium text-ink-2";

const DIR_VACIA: DireccionInput = { etiqueta: "Casa", calle: "", numero: "", colonia: "", referencias: "" };

/** Campos de una dirección (compartidos entre "cliente nuevo" y "agregar dirección"). */
function CamposDireccion({ dir, onCambio }: { dir: DireccionInput; onCambio: (d: DireccionInput) => void }) {
  return (
    <>
      <div>
        <span className={label}>Etiqueta</span>
        <div className="flex gap-1.5">
          {ETIQUETAS_DIRECCION.map((e) => (
            <button key={e} type="button" onClick={() => onCambio({ ...dir, etiqueta: e })}
              className={["rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition", dir.etiqueta === e ? "bg-ink text-white" : "bg-sel text-ink-2 hover:bg-hover"].join(" ")}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_90px] gap-2.5">
        <div><span className={label}>Calle *</span><input className={input} value={dir.calle} maxLength={255} onChange={(e) => onCambio({ ...dir, calle: e.target.value })} /></div>
        <div><span className={label}>Número</span><input className={input} value={dir.numero} maxLength={20} onChange={(e) => onCambio({ ...dir, numero: e.target.value })} /></div>
      </div>
      <div><span className={label}>Colonia *</span><input className={input} value={dir.colonia} maxLength={150} onChange={(e) => onCambio({ ...dir, colonia: e.target.value })} /></div>
      <div><span className={label}>Referencias</span><input className={input} value={dir.referencias} maxLength={200} onChange={(e) => onCambio({ ...dir, referencias: e.target.value })} placeholder="Color de casa, entre calles, timbre…" /></div>
    </>
  );
}

export function ModalClienteDomicilio({
  token, tenantId, sucursalId, onSeleccionar, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  onSeleccionar: (c: ClienteDomicilio) => void;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"buscar" | "registrar">("buscar");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ClienteDomicilio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // formulario cliente nuevo
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dir, setDir] = useState<DireccionInput>(DIR_VACIA);
  const [guardando, setGuardando] = useState(false);

  // agregar dirección a un cliente existente
  const [agregandoA, setAgregandoA] = useState<ClienteDomicilio | null>(null);
  const [dirNueva, setDirNueva] = useState<DireccionInput>(DIR_VACIA);

  useEffect(() => {
    if (modo !== "buscar" || agregandoA) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    debounce.current = setTimeout(async () => {
      try { setRes(await buscarClientesDomicilio(token, q)); setError(null); }
      catch (e) { setError(e instanceof Error ? e.message : "Error al buscar"); }
      finally { setBuscando(false); }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, modo, token, agregandoA]);

  function validarDir(d: DireccionInput): string | null {
    if (!d.calle.trim() || !d.colonia.trim()) return "Calle y colonia son obligatorias para domicilio.";
    return null;
  }

  async function registrar() {
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const v = validarDir(dir);
    if (v) { setError(v); return; }
    setGuardando(true);
    try {
      const c = await registrarClienteDomicilio(token, { nombre, telefono, tenantId, sucursalId, dir });
      onSeleccionar(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  async function agregarDireccion() {
    if (!agregandoA) return;
    setError(null);
    const v = validarDir(dirNueva);
    if (v) { setError(v); return; }
    setGuardando(true);
    try {
      const d = await agregarDireccionCliente(token, { clienteId: agregandoA.clienteId, tenantId, sucursalId, dir: dirNueva });
      onSeleccionar(conDireccion({ ...agregandoA, direcciones: [...agregandoA.direcciones, d] }, d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la dirección");
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Cliente para domicilio" hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {agregandoA ? `Nueva dirección · ${agregandoA.nombre}` : "Cliente para domicilio"}
        </h2>
        {!agregandoA && (
          <div className="flex gap-1 rounded-lg bg-sel p-0.5">
            {(["buscar", "registrar"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setModo(m); setError(null); }}
                className={["rounded px-3 py-1 text-[12.5px] font-semibold transition", modo === m ? "bg-ink text-white" : "text-ink-2"].join(" ")}>
                {m === "buscar" ? "Buscar" : "Nuevo"}
              </button>
            ))}
          </div>
        )}
      </div>

      {agregandoA ? (
        /* ── Agregar dirección alterna a un cliente existente ── */
        <div className="flex flex-col gap-2.5">
          <CamposDireccion dir={dirNueva} onCambio={setDirNueva} />
          <p className="text-[11.5px] text-ink-3">CP, ciudad y estado se toman de la sucursal (editable luego en el admin).</p>
        </div>
      ) : modo === "buscar" ? (
        <>
          <input autoFocus className={input} placeholder="Teléfono o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[300px] overflow-y-auto">
            {buscando && <p className="py-3 text-center text-[13px] text-ink-3">Buscando…</p>}
            {!buscando && q.trim().length >= 2 && res.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-[13px] text-ink-3">Sin coincidencias.</p>
                <button type="button" onClick={() => { setNombre(""); setTelefono(q.replace(/\D/g, "").length >= 7 ? q : ""); setModo("registrar"); }}
                  className="mt-1 text-[13px] font-semibold text-accent hover:underline">Registrar cliente nuevo</button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {res.map((c) => (
                <div key={c.clienteId} className="rounded-lg border border-line bg-surface px-3 py-2.5">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[14px] font-semibold">{c.nombre || "Sin nombre"}</span>
                    {c.telefono && <span className="font-mono text-[12px] text-ink-3">{c.telefono}</span>}
                  </div>
                  {/* Direcciones del cliente: tocar una la elige para este pedido */}
                  <div className="mt-1.5 flex flex-col gap-1">
                    {c.direcciones.length === 0 && <span className="text-[12px] text-ink-3">Sin domicilio registrado</span>}
                    {c.direcciones.map((d) => (
                      <button key={d.id} type="button" onClick={() => onSeleccionar(conDireccion(c, d))}
                        className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 text-left transition hover:border-ink">
                        <span className="rounded-full bg-sel px-2 py-0.5 text-[10.5px] font-bold text-ink-2">{d.etiqueta}</span>
                        <span className="truncate text-[12.5px] text-ink-2">{d.preview}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => { setAgregandoA(c); setDirNueva({ ...DIR_VACIA, etiqueta: "Oficina" }); setError(null); }}
                      className="self-start text-[12px] font-semibold text-accent hover:underline">
                      + Agregar otra dirección
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* ── Cliente nuevo ── */
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div><span className={label}>Nombre *</span><input className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} /></div>
            <div><span className={label}>Teléfono</span><input className={input} inputMode="tel" value={telefono} maxLength={20} onChange={(e) => setTelefono(e.target.value)} /></div>
          </div>
          <CamposDireccion dir={dir} onCambio={setDir} />
          <p className="text-[11.5px] text-ink-3">CP, ciudad y estado se toman de la sucursal. Podrás agregarle más direcciones después (Casa, Oficina…).</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        {agregandoA ? (
          <button type="button" onClick={() => { setAgregandoA(null); setError(null); }} className="text-[13px] font-medium text-ink-3 hover:text-ink-2">← Volver a la búsqueda</button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          {agregandoA && <Button onClick={agregarDireccion} disabled={guardando}>{guardando ? "Guardando…" : "Guardar y usar"}</Button>}
          {!agregandoA && modo === "registrar" && <Button onClick={registrar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar y usar"}</Button>}
        </div>
      </div>
    </Modal>
  );
}
