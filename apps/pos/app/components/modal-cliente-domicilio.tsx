"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, Icono } from "@vim/ui/styles";
import {
  buscarClientesDomicilio, registrarClienteDomicilio, agregarDireccionCliente, conDireccion,
  editarDireccionCliente, leerClienteDomicilio,
  fijarZonaDireccion, ETIQUETAS_DIRECCION,
  planColonia, type ClienteDomicilio, type DireccionCliente, type DireccionInput,
} from "../lib/clientes-domicilio";
import { listarZonas, zonaVigente, type ZonaEnvio } from "../lib/zonas-envio";
import { hayColonias, coloniaExacta, crearColonia, asignarZonaColonia } from "../lib/colonias";
import { SelectorZona } from "./selector-zona";
import { BuscadorColonia } from "./buscador-colonia";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1 block text-13 font-medium text-ink-2";

export const DIR_VACIA: DireccionInput = { etiqueta: "Casa", calle: "", numero: "", colonia: "", referencias: "", zona: null, coloniaCatalogo: null, codigoPostal: null, guardarZonaEnColonia: false };

/** Campos de una dirección (compartidos entre "cliente nuevo" y "agregar dirección"). */
export function CamposDireccion({
  dir, onCambio, token, tenantId, sucursalId, cajaId, turnoId, empleadoNombre, zonas, onZonaSincronizada, hayCatalogo = false,
}: {
  dir: DireccionInput;
  onCambio: (d: DireccionInput) => void;
  token: string; tenantId: string; sucursalId: string; cajaId: string; turnoId: string;
  empleadoNombre: string;
  zonas: ZonaEnvio[];
  onZonaSincronizada: (z: ZonaEnvio) => void;
  /** La sucursal tiene catálogo de colonias: la colonia sugiere y fija zona y CP. */
  hayCatalogo?: boolean;
}) {
  return (
    <>
      <div>
        <span className={label}>Etiqueta</span>
        <div className="flex gap-1.5">
          {ETIQUETAS_DIRECCION.map((e) => (
            <button key={e} type="button" onClick={() => onCambio({ ...dir, etiqueta: e })}
              className={["rounded-full px-3.5 py-1.5 text-13 font-semibold transition", dir.etiqueta === e ? "bg-ink text-white" : "bg-sel text-ink-2 hover:bg-hover"].join(" ")}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_90px] gap-2.5">
        <div><span className={label}>Calle *</span><input className={input} value={dir.calle} maxLength={255} onChange={(e) => onCambio({ ...dir, calle: e.target.value })} /></div>
        <div><span className={label}>Número</span><input className={input} value={dir.numero} maxLength={20} onChange={(e) => onCambio({ ...dir, numero: e.target.value })} /></div>
      </div>
      <div>
        <span className={label}>Colonia *</span>
        <BuscadorColonia token={token} sucursalId={sucursalId} hayCatalogo={hayCatalogo} zonas={zonas} className={input}
          texto={dir.colonia} elegida={!!dir.coloniaCatalogo}
          onTexto={(t) => onCambio({ ...dir, colonia: t, coloniaCatalogo: null, codigoPostal: null, guardarZonaEnColonia: false })}
          onElegir={(c) => onCambio({ ...dir, colonia: c.nombre, coloniaCatalogo: c, codigoPostal: c.codigoPostal, zona: c.zona ?? dir.zona, guardarZonaEnColonia: false })} />
      </div>
      <div><span className={label}>Referencias</span><input className={input} value={dir.referencias} maxLength={200} onChange={(e) => onCambio({ ...dir, referencias: e.target.value })} placeholder="Color de casa, entre calles, timbre…" /></div>
      <div>
        <span className={label}>Zona</span>
        <SelectorZona
          token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
          empleadoNombre={empleadoNombre}
          zonas={zonas}
          valor={dir.zona?.id ?? null}
          onCambio={(z) => onCambio({ ...dir, zona: z })}
          onZonaSincronizada={onZonaSincronizada}
        />
        {dir.coloniaCatalogo?.zona && dir.zona && dir.zona.id !== dir.coloniaCatalogo.zona.id && (
          <label className="mt-2 flex items-center gap-2 text-13 text-ink-2">
            <input type="checkbox" checked={dir.guardarZonaEnColonia} onChange={(e) => onCambio({ ...dir, guardarZonaEnColonia: e.target.checked })} />
            Guardar {dir.zona.nombre} para {dir.coloniaCatalogo.nombre} (pide PIN)
          </label>
        )}
      </div>
    </>
  );
}

export function ModalClienteDomicilio({
  token, tenantId, sucursalId, cajaId, turnoId, empleadoNombre, clienteInicialId, onSeleccionar, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  /** Los pide `ModalAutorizacionPin` al repreciar una zona. */
  cajaId: string;
  turnoId: string;
  empleadoNombre: string;
  /** Cambiar la entrega de un pedido ya abierto: el modal arranca mostrando a su cliente. */
  clienteInicialId?: string | null;
  onSeleccionar: (c: ClienteDomicilio) => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"buscar" | "registrar">("buscar");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ClienteDomicilio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campoBusqueda = useRef<HTMLInputElement | null>(null);

  // Foco al buscador en cuanto aparece. `autoFocus` no basta: este modal se abre a la vez que
  // se entra al catálogo (botón "Nueva orden"), y en esa transición el navegador puede dar el
  // foco a otro elemento. Con el frame de espera el cajero teclea el teléfono sin tocar nada.
  useEffect(() => {
    if (modo !== "buscar") return;
    const id = requestAnimationFrame(() => campoBusqueda.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [modo]);

  // formulario cliente nuevo
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dir, setDir] = useState<DireccionInput>(DIR_VACIA);
  const [guardando, setGuardando] = useState(false);

  /** `onSeleccionar` puede guardar (cambiar la entrega de un pedido): si falla, el error se ve aquí y el modal sigue abierto. */
  async function seleccionar(c: ClienteDomicilio) {
    try {
      await onSeleccionar(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  // agregar (o editar, con `editando`) una dirección de un cliente existente
  const [agregandoA, setAgregandoA] = useState<ClienteDomicilio | null>(null);
  const [editando, setEditando] = useState<DireccionCliente | null>(null);
  const [dirNueva, setDirNueva] = useState<DireccionInput>(DIR_VACIA);

  // El cliente del pedido, a la vista mientras no se busque a otro.
  const [inicial, setInicial] = useState<ClienteDomicilio | null>(null);
  useEffect(() => {
    if (!clienteInicialId) return;
    leerClienteDomicilio(token, clienteInicialId).then(setInicial).catch(() => setInicial(null));
  }, [token, clienteInicialId]);
  const lista = q.trim().length >= 2 ? res : inicial ? [inicial] : [];

  // Elegir zona de una dirección guardada que no traía ninguna (de antes de esta entrega).
  const [zonaPendiente, setZonaPendiente] = useState<{ cliente: ClienteDomicilio; direccion: DireccionCliente } | null>(null);

  // Catálogo de zonas de la sucursal: se carga UNA vez aquí (no dentro de SelectorZona) porque
  // `validarDir` necesita saber si el negocio tiene zonas, y este modal monta el selector dos
  // veces (cliente nuevo y dirección alterna) — cargarlo adentro lo duplicaría.
  const [zonas, setZonas] = useState<ZonaEnvio[]>([]);
  // Si `listarZonas` falla, fallamos abierto (no bloquear el CRM de domicilio por un problema de
  // red) pero NO en silencio: sin este aviso, `zonas` se queda en [] y `validarDir` concluye que
  // el negocio no tiene zonas, así que el pedido saldría sin cargo de envío sin que nadie se entere.
  const [avisoZonas, setAvisoZonas] = useState<string | null>(null);
  useEffect(() => {
    setAvisoZonas(null);
    listarZonas(token, sucursalId)
      .then(setZonas)
      .catch(() => setAvisoZonas("No se pudieron cargar las zonas de reparto. Si el negocio ya tiene zonas, revisa la conexión antes de continuar."));
  }, [token, sucursalId]);

  /** Alta o repreciado de zona: upsert por id en el catálogo local del modal. Sin reordenar: la
   *  carga inicial ya viene en el orden que configuró el dueño (orden, luego nombre); resortear
   *  aquí lo perdería en la primera alta o repreciado de la sesión. */
  function onZonaSincronizada(z: ZonaEnvio) {
    setZonas((zs) => {
      const existe = zs.some((x) => x.id === z.id);
      return existe ? zs.map((x) => (x.id === z.id ? z : x)) : [...zs, z];
    });
  }

  // Catálogo de colonias de la sucursal: si no hay (o falla), la colonia es texto libre como antes.
  const [hayCatalogo, setHayCatalogo] = useState(false);
  const [avisoColonia, setAvisoColonia] = useState<{ texto: string; seguir: () => void } | null>(null);
  // Cambiar la zona ya asignada a una colonia pide PIN; `fin` entrega la autorización (null = canceló).
  const [pinColonia, setPinColonia] = useState<{ coloniaId: string; d: DireccionInput; fin: (id: string | null) => void } | null>(null);
  useEffect(() => {
    hayColonias(token, sucursalId).then(setHayCatalogo).catch(() => setHayCatalogo(false));
  }, [token, sucursalId]);

  /** Aplica `planColonia` al catálogo DESPUÉS de guardar el domicilio. Un fallo no frena el pedido. */
  async function aplicarColonia(d: DireccionInput): Promise<string | null> {
    const plan = planColonia(d, hayCatalogo);
    try {
      if (plan.tipo === "crear") await crearColonia(token, { tenantId, sucursalId, nombre: d.colonia, codigoPostal: null, zonaId: d.zona?.id ?? null });
      if (plan.tipo === "asignar") await asignarZonaColonia(token, plan.coloniaId, d.zona!.id, null);
      if (plan.tipo === "cambiar") {
        const pinId = await new Promise<string | null>((fin) => setPinColonia({ coloniaId: plan.coloniaId, d, fin }));
        setPinColonia(null);
        // Sin PIN la zona vale solo para este pedido.
        if (pinId) await asignarZonaColonia(token, plan.coloniaId, d.zona!.id, pinId);
      }
      return null;
    } catch (e) {
      // El domicilio ya quedó guardado: quien llama muestra el aviso y deja "Continuar" (no guarda de nuevo).
      return e instanceof Error ? e.message : "No se pudo actualizar el catálogo de colonias";
    }
  }

  /** Una colonia escrita igual a una del catálogo cuenta como elegida (CP y zona). Si la consulta falla, sigue como se escribió. */
  async function resolverColonia(d: DireccionInput): Promise<DireccionInput> {
    if (!hayCatalogo || d.coloniaCatalogo || !d.colonia.trim()) return d;
    const hit = await coloniaExacta(token, sucursalId, d.colonia, zonas).catch(() => ({ tipo: "ninguna" }) as const);
    if (hit.tipo === "varias") return { ...d, coloniaAmbigua: true };   // se guarda como se escribió, con la zona elegida
    return hit.tipo === "una" ? { ...d, coloniaCatalogo: hit.colonia, codigoPostal: hit.colonia.codigoPostal, zona: d.zona ?? hit.colonia.zona } : d;
  }

  /** Cierra el guardado: si el catálogo falló, avisa y espera "Continuar"; si no, selecciona. */
  async function terminar(d: DireccionInput, seleccionar: () => void) {
    const fallo = await aplicarColonia(d);
    if (fallo) setAvisoColonia({ texto: fallo, seguir: seleccionar });
    else seleccionar();
  }

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
    if (zonas.length > 0 && !d.zona) return "Elige la zona de reparto.";
    return null;
  }

  async function registrar() {
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const v = validarDir(dir);
    if (v) { setError(v); return; }
    setGuardando(true);
    try {
      const d = await resolverColonia(dir);
      const c = await registrarClienteDomicilio(token, { nombre, telefono, tenantId, sucursalId, dir: d });
      await terminar(d, () => void seleccionar(c));
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
      const dn = await resolverColonia(dirNueva);
      const d = editando
        ? await editarDireccionCliente(token, editando, dn)
        : await agregarDireccionCliente(token, { clienteId: agregandoA.clienteId, tenantId, sucursalId, dir: dn });
      const direcciones = editando ? agregandoA.direcciones.map((x) => (x.id === d.id ? d : x)) : [...agregandoA.direcciones, d];
      await terminar(dn, () => void seleccionar(conDireccion({ ...agregandoA, direcciones }, d)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la dirección");
      setGuardando(false);
    }
  }

  /** Elegir una dirección guardada: si el negocio tiene zonas y ella no trae ninguna, primero se
   *  la pedimos (y la dejamos guardada para la próxima vez) antes de seleccionarla. */
  async function elegirDireccion(c: ClienteDomicilio, d: DireccionCliente) {
    // La zona guardada solo vale si sigue en el catálogo vigente (activa y sin borrar), y con SU
    // precio de hoy: una zona desactivada cuenta como "sin zona" y se vuelve a pedir.
    const vigente = zonaVigente(d.zona, zonas);
    if (zonas.length > 0 && !vigente) {
      setError(null);
      // Antes de pedirla, la colonia del catálogo puede traerla.
      const hit = hayCatalogo ? await coloniaExacta(token, sucursalId, d.colonia, zonas).catch(() => null) : null;
      const delCatalogo = hit?.tipo === "una" ? hit.colonia : null;
      if (delCatalogo?.zona) {
        try {
          await fijarZonaDireccion(token, d.id, delCatalogo.zona.id);
          void seleccionar(conDireccion(c, { ...d, zona: delCatalogo.zona }));
          return;
        } catch { /* no se pudo fijar: se pide la zona a mano */ }
      }
      setZonaPendiente({ cliente: c, direccion: { ...d, zona: null } });
      return;
    }
    void seleccionar(conDireccion(c, { ...d, zona: vigente }));
  }

  async function confirmarZonaPendiente(z: ZonaEnvio) {
    if (!zonaPendiente) return;
    setError(null);
    try {
      await fijarZonaDireccion(token, zonaPendiente.direccion.id, z.id);
      const dirConZona: DireccionCliente = { ...zonaPendiente.direccion, zona: z };
      void seleccionar(conDireccion(zonaPendiente.cliente, dirConZona));
      setZonaPendiente(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la zona");
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Cliente para domicilio" hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {zonaPendiente ? "Elige la zona de reparto" : agregandoA ? `${editando ? "Editar" : "Nueva"} dirección · ${agregandoA.nombre}` : "Cliente para domicilio"}
        </h2>
        {!agregandoA && !zonaPendiente && (
          <div className="flex gap-1 rounded-lg bg-sel p-0.5">
            {(["buscar", "registrar"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setModo(m); setError(null); }}
                className={["rounded px-3 py-1 text-13 font-semibold transition", modo === m ? "bg-ink text-white" : "text-ink-2"].join(" ")}>
                {m === "buscar" ? "Buscar" : "Nuevo"}
              </button>
            ))}
          </div>
        )}
      </div>

      {avisoZonas && (
        <div className="mb-3 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning" role="alert">
          {avisoZonas}
        </div>
      )}

      {avisoColonia && (
        <div className="mb-3 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning" role="alert">
          {avisoColonia.texto}
        </div>
      )}

      {zonaPendiente ? (
        /* ── Esta dirección es de antes de las zonas: se le asigna una antes de continuar ── */
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-line bg-hover px-3 py-2.5">
            <span className="rounded-full bg-sel px-2 py-0.5 text-11 font-bold text-ink-2">{zonaPendiente.direccion.etiqueta}</span>
            <span className="ml-2 text-13 text-ink-2">{zonaPendiente.direccion.preview}</span>
          </div>
          <p className="text-13 text-ink-3">Esta dirección no tiene zona de reparto asignada. Elígela para continuar.</p>
          <SelectorZona
            token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
            empleadoNombre={empleadoNombre}
            zonas={zonas}
            valor={null}
            onCambio={(z) => { if (z) void confirmarZonaPendiente(z); }}
            onZonaSincronizada={onZonaSincronizada}
          />
        </div>
      ) : agregandoA ? (
        /* ── Agregar dirección alterna a un cliente existente ── */
        <div className="flex flex-col gap-2.5">
          <CamposDireccion
            dir={dirNueva} onCambio={setDirNueva}
            token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
            empleadoNombre={empleadoNombre} zonas={zonas} onZonaSincronizada={onZonaSincronizada} hayCatalogo={hayCatalogo}
          />
          <p className="text-12 text-ink-3">{hayCatalogo ? "El CP sale de la colonia; ciudad y estado, de la sucursal." : "CP, ciudad y estado se toman de la sucursal (editable luego en el admin)."}</p>
        </div>
      ) : modo === "buscar" ? (
        <>
          <input ref={campoBusqueda} className={input} placeholder="Teléfono o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[300px] overflow-y-auto">
            {buscando && <p className="py-3 text-center text-13 text-ink-3">Buscando…</p>}
            {!buscando && q.trim().length >= 2 && res.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-13 text-ink-3">Sin coincidencias.</p>
                <button type="button" onClick={() => { setNombre(""); setTelefono(q.replace(/\D/g, "").length >= 7 ? q : ""); setModo("registrar"); }}
                  className="mt-1 text-13 font-semibold text-accent hover:underline">Registrar cliente nuevo</button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {lista.map((c) => (
                <div key={c.clienteId} className="rounded-lg border border-line bg-surface px-3 py-2.5">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-14 font-semibold">{c.nombre || "Sin nombre"}</span>
                    {c.telefono && <span className="font-mono text-12 text-ink-3">{c.telefono}</span>}
                  </div>
                  {/* Direcciones del cliente: tocar una la elige para este pedido */}
                  <div className="mt-1.5 flex flex-col gap-1">
                    {c.direcciones.length === 0 && <span className="text-12 text-ink-3">Sin domicilio registrado</span>}
                    {c.direcciones.map((d) => (
                      <div key={d.id} className="flex items-stretch gap-1.5">
                        <button type="button" onClick={() => void elegirDireccion(c, d)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded border border-line px-2.5 py-1.5 text-left transition hover:border-ink">
                          <span className="rounded-full bg-sel px-2 py-0.5 text-11 font-bold text-ink-2">{d.etiqueta}</span>
                          <span className="truncate text-13 text-ink-2">{d.preview}</span>
                        </button>
                        <button type="button" aria-label={`Editar ${d.etiqueta}: ${d.preview}`}
                          onClick={() => {
                            setAgregandoA(c); setEditando(d); setError(null);
                            setDirNueva({ ...DIR_VACIA, etiqueta: d.etiqueta, calle: d.calle, numero: d.numero, colonia: d.colonia, referencias: d.referencias ?? "", zona: zonaVigente(d.zona, zonas) });
                          }}
                          className="flex-shrink-0 rounded border border-line px-2.5 text-12 font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
                          Editar
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => { setAgregandoA(c); setEditando(null); setDirNueva({ ...DIR_VACIA, etiqueta: "Oficina" }); setError(null); }}
                      className="self-start text-12 font-semibold text-accent hover:underline">
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
          <CamposDireccion
            dir={dir} onCambio={setDir}
            token={token} tenantId={tenantId} sucursalId={sucursalId} cajaId={cajaId} turnoId={turnoId}
            empleadoNombre={empleadoNombre} zonas={zonas} onZonaSincronizada={onZonaSincronizada} hayCatalogo={hayCatalogo}
          />
          <p className="text-12 text-ink-3">{hayCatalogo ? "El CP sale de la colonia; ciudad y estado, de la sucursal." : "CP, ciudad y estado se toman de la sucursal."} Podrás agregarle más direcciones después (Casa, Oficina…).</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        {zonaPendiente ? (
          <button type="button" onClick={() => setZonaPendiente(null)} className="inline-flex items-center gap-1 text-13 font-medium text-ink-3 hover:text-ink-2"><Icono nombre="flecha-izquierda" className="h-4 w-4 flex-shrink-0" />Cancelar</button>
        ) : agregandoA ? (
          <button type="button" onClick={() => { setAgregandoA(null); setEditando(null); setError(null); }} className="inline-flex items-center gap-1 text-13 font-medium text-ink-3 hover:text-ink-2"><Icono nombre="flecha-izquierda" className="h-4 w-4 flex-shrink-0" />Volver a la búsqueda</button>
        ) : <span />}
        <div className="flex items-center gap-2">
          {avisoColonia ? (
            /* El domicilio ya está guardado: solo queda seguir con el pedido. */
            <Button onClick={avisoColonia.seguir}>Continuar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
              {agregandoA && !zonaPendiente && <Button onClick={agregarDireccion} disabled={guardando}>{guardando ? "Guardando…" : "Guardar y usar"}</Button>}
              {!agregandoA && !zonaPendiente && modo === "registrar" && <Button onClick={registrar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar y usar"}</Button>}
            </>
          )}
        </div>
      </div>

      {pinColonia && (
        <ModalAutorizacionPin
          token={token}
          payload={{ accion: "editar_zona_colonia", permisoCodigo: "descuento.override_precio", entidadTipo: "colonia", entidadId: pinColonia.coloniaId, monto: 0, motivo: `Zona de ${pinColonia.d.colonia}: de ${pinColonia.d.coloniaCatalogo!.zona!.nombre} a ${pinColonia.d.zona!.nombre}`, cajaId, turnoId }}
          descripcion={`Cambiar la zona de ${pinColonia.d.colonia} de ${pinColonia.d.coloniaCatalogo!.zona!.nombre} a ${pinColonia.d.zona!.nombre}`}
          ejecutaNombre={empleadoNombre}
          onAutorizado={(a) => pinColonia.fin(a.autorizacionPinId)}
          onCancelar={() => pinColonia.fin(null)}
        />
      )}
    </Modal>
  );
}
