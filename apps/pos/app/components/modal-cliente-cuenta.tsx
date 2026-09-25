"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import {
  TelefonoDuplicado, buscarClientesCuenta, registrarClienteCuenta, validarRegistro,
  type ClienteCuenta, type DatosRegistro,
} from "../lib/clientes-cuenta";
import type { DireccionInput } from "../lib/clientes-domicilio";
import { listarZonas, type ZonaEnvio } from "../lib/zonas-envio";
import { CamposDireccion, DIR_VACIA } from "./modal-cliente-domicilio";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1 block text-[12.5px] font-medium text-ink-2";

const REGISTRO_VACIO: DatosRegistro = { nombre: "", apellido: "", telefono: "", email: "", notas: "" };

/** Persona con "+": asignar cliente. Con cliente ya asignado se usa la palomita (`IconoClienteAsignado`). */
export function IconoAsignarCliente({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6M16 11h6" />
    </svg>
  );
}

export function IconoClienteAsignado({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="m16 11 2 2 4-4" />
    </svg>
  );
}

/**
 * Cliente de una cuenta de Comedor, Para llevar o Pick-up: buscarlo, registrarlo o quitarlo.
 *
 * Todo es opcional: cerrar sin elegir no cambia nada. Quien llama decide qué significa asignar
 * (`onAsignar`): en la barra de captura puede ser solo el carrito, en la lista de cuentas es la
 * venta ya guardada. Si `onAsignar` falla, el error se queda aquí y el modal sigue abierto.
 */
export function ModalClienteCuenta({
  token, tenantId, sucursalId, cajaId, turnoId, empleadoNombre, actual, onAsignar, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  /** Los pide el selector de zona del domicilio opcional (repreciar pide PIN). */
  cajaId: string;
  turnoId: string;
  empleadoNombre: string;
  /** Cliente que la cuenta ya tiene; habilita "Quitar". */
  actual: ClienteCuenta | null;
  onAsignar: (c: ClienteCuenta | null) => Promise<void>;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"buscar" | "registrar">("buscar");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ClienteCuenta[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campoBusqueda = useRef<HTMLInputElement | null>(null);
  const campoNombre = useRef<HTMLInputElement | null>(null);
  // Solo la respuesta de la última búsqueda pinta resultados: una vieja que tarda más no pisa a la nueva.
  const ultimaBusqueda = useRef(0);

  const [datos, setDatos] = useState<DatosRegistro>(REGISTRO_VACIO);
  const [conDomicilio, setConDomicilio] = useState(false);
  const [dir, setDir] = useState<DireccionInput>(DIR_VACIA);
  const [zonas, setZonas] = useState<ZonaEnvio[]>([]);
  const [duplicado, setDuplicado] = useState<ClienteCuenta | null>(null);

  useEffect(() => {
    // Foco al campo con el que se empieza: la búsqueda, o el nombre al registrar (si ya se trae
    // el teléfono de la búsqueda, lo que falta es el nombre).
    const id = requestAnimationFrame(() => (modo === "buscar" ? campoBusqueda : campoNombre).current?.focus());
    return () => cancelAnimationFrame(id);
  }, [modo]);

  useEffect(() => {
    if (modo !== "buscar") return;
    const n = ++ultimaBusqueda.current;
    if (q.trim().length < 2) { setRes([]); setBuscando(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarClientesCuenta(token, q);
        if (n === ultimaBusqueda.current) { setRes(r); setError(null); }
      } catch (e) {
        if (n === ultimaBusqueda.current) setError(e instanceof Error ? e.message : "Error al buscar");
      } finally {
        if (n === ultimaBusqueda.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, modo, token]);

  // Las zonas solo hacen falta si se va a capturar domicilio; se cargan al pedirlo, no al abrir.
  useEffect(() => {
    if (!conDomicilio) return;
    listarZonas(token, sucursalId).then(setZonas).catch(() => setZonas([]));
  }, [conDomicilio, token, sucursalId]);

  async function asignar(c: ClienteCuenta | null) {
    setError(null);
    setGuardando(true);
    try {
      await onAsignar(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el cliente");
      setGuardando(false);
    }
  }

  function irARegistrar() {
    // Lo que se tecleó en la búsqueda se aprovecha: dígitos → teléfono, texto → nombre.
    const t = q.trim();
    const esTelefono = t.replace(/\D/g, "").length >= 7;
    setDatos({ ...REGISTRO_VACIO, telefono: esTelefono ? t : "", nombre: esTelefono ? "" : t });
    setDuplicado(null);
    setError(null);
    setModo("registrar");
  }

  async function registrar() {
    setError(null);
    setDuplicado(null);
    const v = validarRegistro(datos);
    if (v) { setError(v); return; }
    if (conDomicilio) {
      if (!dir.calle.trim() || !dir.colonia.trim()) { setError("Calle y colonia son obligatorias para el domicilio."); return; }
      if (zonas.length > 0 && !dir.zona) { setError("Elige la zona de reparto del domicilio."); return; }
    }
    setGuardando(true);
    try {
      const c = await registrarClienteCuenta(token, { ...datos, tenantId, sucursalId, dir: conDomicilio ? dir : null });
      await onAsignar(c);
    } catch (e) {
      if (e instanceof TelefonoDuplicado) setDuplicado(e.cliente);
      else setError(e instanceof Error ? e.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  // Al corregir un campo se borra el error: dejar "El nombre es obligatorio" mientras se escribe
  // el nombre hace pensar que no se está tomando.
  const set = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => { setDatos((d) => ({ ...d, [k]: v })); setError(null); };

  return (
    <Modal open onClose={onCerrar} title="Cliente de la cuenta" hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cliente de la cuenta</h2>
        <div className="flex gap-1 rounded-lg bg-sel p-0.5">
          {(["buscar", "registrar"] as const).map((m) => (
            <button key={m} type="button" onClick={() => (m === "registrar" ? irARegistrar() : (setModo("buscar"), setError(null)))}
              className={["rounded px-3 py-1 text-[12.5px] font-semibold transition", modo === m ? "bg-ink text-white" : "text-ink-2"].join(" ")}>
              {m === "buscar" ? "Buscar" : "Nuevo"}
            </button>
          ))}
        </div>
      </div>

      {actual && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-hover px-3 py-2.5">
          <IconoClienteAsignado className="h-5 w-5 flex-shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{actual.nombre}</div>
            {actual.telefono && <div className="font-mono text-[12px] text-ink-3">{actual.telefono}</div>}
          </div>
          <button type="button" disabled={guardando} onClick={() => void asignar(null)}
            className="text-[13px] font-semibold text-ink-3 transition hover:text-danger disabled:opacity-50">
            Quitar
          </button>
        </div>
      )}

      {modo === "buscar" ? (
        <>
          <input ref={campoBusqueda} aria-label="Buscar cliente por teléfono o nombre" className={input} placeholder="Teléfono o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[300px] overflow-y-auto">
            {buscando && <p className="py-3 text-center text-[13px] text-ink-3">Buscando…</p>}
            {!buscando && q.trim().length >= 2 && res.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-[13px] text-ink-3">Sin coincidencias.</p>
                <button type="button" onClick={irARegistrar} className="mt-1 text-[13px] font-semibold text-accent hover:underline">
                  Registrar cliente nuevo
                </button>
              </div>
            )}
            {!buscando && q.trim().length < 2 && (
              <p className="py-3 text-center text-[12.5px] text-ink-3">Escribe al menos 2 letras o números.</p>
            )}
            <div className="flex flex-col gap-1.5">
              {res.map((c) => {
                const esActual = c.clienteId === actual?.clienteId;
                return (
                  <button key={c.clienteId} type="button" disabled={guardando || c.bloqueado || esActual}
                    onClick={() => void asignar(c)}
                    className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left transition hover:border-ink disabled:cursor-default disabled:hover:border-line">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{c.nombre || "Sin nombre"}</span>
                      {c.bloqueado && <span className="text-[11.5px] font-bold text-danger">Bloqueado desde el panel</span>}
                      {esActual && <span className="text-[11.5px] font-semibold text-ink-3">Ya asignado</span>}
                    </span>
                    {c.telefono && <span className="flex-shrink-0 font-mono text-[12px] text-ink-3">{c.telefono}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            <div><label htmlFor="cc-nombre" className={label}>Nombre *</label><input id="cc-nombre" ref={campoNombre} className={input} value={datos.nombre} maxLength={150} onChange={(e) => set("nombre", e.target.value)} /></div>
            <div><label htmlFor="cc-apellido" className={label}>Apellido</label><input id="cc-apellido" className={input} value={datos.apellido} maxLength={100} onChange={(e) => set("apellido", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label htmlFor="cc-telefono" className={label}>Teléfono *</label><input id="cc-telefono" className={input} inputMode="tel" value={datos.telefono} maxLength={20} onChange={(e) => { set("telefono", e.target.value); setDuplicado(null); }} placeholder="477 123 4567" /></div>
            <div><label htmlFor="cc-correo" className={label}>Correo</label><input id="cc-correo" className={input} inputMode="email" value={datos.email} maxLength={150} onChange={(e) => set("email", e.target.value)} /></div>
          </div>
          <div><label htmlFor="cc-notas" className={label}>Notas</label><input id="cc-notas" className={input} value={datos.notas} maxLength={300} onChange={(e) => set("notas", e.target.value)} placeholder="Alergias, preferencias…" /></div>

          {duplicado && (
            <div className="flex items-center justify-between gap-3 rounded border border-[#E8DCC0] bg-warning-soft px-3 py-2.5" role="alert">
              <span className="text-[12.5px] font-medium text-warning">Ese teléfono ya es de <b>{duplicado.nombre}</b>.</span>
              {!duplicado.bloqueado && (
                <button type="button" disabled={guardando} onClick={() => void asignar(duplicado)}
                  className="flex-shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
                  Asignar a {duplicado.nombre.split(" ")[0]}
                </button>
              )}
            </div>
          )}

          {conDomicilio ? (
            <div className="flex flex-col gap-2.5 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">Domicilio</span>
                <button type="button" onClick={() => { setConDomicilio(false); setDir(DIR_VACIA); }} className="text-[12.5px] font-semibold text-ink-3 hover:text-ink">Quitar domicilio</button>
              </div>
              <CamposDireccion
                dir={dir} onCambio={setDir}
                token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
                empleadoNombre={empleadoNombre} zonas={zonas}
                onZonaSincronizada={(z) => setZonas((zs) => (zs.some((x) => x.id === z.id) ? zs.map((x) => (x.id === z.id ? z : x)) : [...zs, z]))}
              />
              <p className="text-[11.5px] text-ink-3">Solo se guarda en la ficha del cliente: este pedido no se convierte en domicilio.</p>
            </div>
          ) : (
            <button type="button" onClick={() => setConDomicilio(true)} className="self-start text-[13px] font-semibold text-accent hover:underline">
              + Agregar domicilio
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
        {modo === "registrar" && <Button onClick={registrar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar y asignar"}</Button>}
      </div>
    </Modal>
  );
}
