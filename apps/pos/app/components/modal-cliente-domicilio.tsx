"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { buscarClientesDomicilio, registrarClienteDomicilio, type ClienteDomicilio } from "../lib/clientes-domicilio";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1 block text-[12.5px] font-medium text-ink-2";

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

  // formulario registrar
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [calle, setCalle] = useState("");
  const [numero, setNumero] = useState("");
  const [colonia, setColonia] = useState("");
  const [referencias, setReferencias] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (modo !== "buscar") return;
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    debounce.current = setTimeout(async () => {
      try { setRes(await buscarClientesDomicilio(token, q)); setError(null); }
      catch (e) { setError(e instanceof Error ? e.message : "Error al buscar"); }
      finally { setBuscando(false); }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, modo, token]);

  async function registrar() {
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!calle.trim() || !colonia.trim()) { setError("Calle y colonia son obligatorias para domicilio."); return; }
    setGuardando(true);
    try {
      const c = await registrarClienteDomicilio(token, { nombre, telefono, calle, numero, colonia, referencias, tenantId, sucursalId });
      onSeleccionar(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Cliente para domicilio" hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cliente para domicilio</h2>
        <div className="flex gap-1 rounded-lg bg-sel p-0.5">
          {(["buscar", "registrar"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setModo(m); setError(null); }}
              className={["rounded px-3 py-1 text-[12.5px] font-semibold transition", modo === m ? "bg-ink text-white" : "text-ink-2"].join(" ")}>
              {m === "buscar" ? "Buscar" : "Nuevo"}
            </button>
          ))}
        </div>
      </div>

      {modo === "buscar" ? (
        <>
          <input autoFocus className={input} placeholder="Teléfono o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[260px] overflow-y-auto">
            {buscando && <p className="py-3 text-center text-[13px] text-ink-3">Buscando…</p>}
            {!buscando && q.trim().length >= 2 && res.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-[13px] text-ink-3">Sin coincidencias.</p>
                <button type="button" onClick={() => { setNombre(""); setTelefono(q.replace(/\D/g, "").length >= 7 ? q : ""); setModo("registrar"); }}
                  className="mt-1 text-[13px] font-semibold text-accent hover:underline">Registrar cliente nuevo</button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {res.map((c) => (
                <button key={c.clienteId} type="button" onClick={() => onSeleccionar(c)}
                  className="flex flex-col items-start rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition hover:border-ink">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[14px] font-semibold">{c.nombre || "Sin nombre"}</span>
                    {c.telefono && <span className="font-mono text-[12px] text-ink-3">{c.telefono}</span>}
                  </div>
                  <span className="mt-0.5 text-[12px] text-ink-3">{c.direccionPreview ?? "Sin domicilio registrado"}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className={label}>Nombre *</label><input className={input} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} /></div>
            <div><label className={label}>Teléfono</label><input className={input} inputMode="tel" value={telefono} maxLength={20} onChange={(e) => setTelefono(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2.5">
            <div><label className={label}>Calle *</label><input className={input} value={calle} maxLength={255} onChange={(e) => setCalle(e.target.value)} /></div>
            <div><label className={label}>Número</label><input className={input} value={numero} maxLength={20} onChange={(e) => setNumero(e.target.value)} /></div>
          </div>
          <div><label className={label}>Colonia *</label><input className={input} value={colonia} maxLength={150} onChange={(e) => setColonia(e.target.value)} /></div>
          <div><label className={label}>Referencias</label><input className={input} value={referencias} maxLength={200} onChange={(e) => setReferencias(e.target.value)} placeholder="Color de casa, entre calles, timbre…" /></div>
          <p className="text-[11.5px] text-ink-3">CP, ciudad y estado se toman de la sucursal (editable luego en el admin).</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
        {modo === "registrar" && <Button onClick={registrar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar y usar"}</Button>}
      </div>
    </Modal>
  );
}
