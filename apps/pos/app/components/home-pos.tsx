"use client";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Button } from "@vim/ui/styles";
import {
  ICONOS_POS,
  colorCategoria,
  listarCategoriasPos,
  listarProductosPos,
  type Categoria,
  type Producto,
} from "../lib/catalogo";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { useReloj } from "./topbar-pos";
import { type Empleado } from "../lib/supabase";
import {
  reducerCarrito,
  estadoInicial,
  nuevoClientId,
  type ModoServicio,
  type ModificadorSel,
} from "../lib/carrito";
import { obtenerGruposDeProducto, type GrupoModificadores } from "../lib/modificadores";
import { persistirTicket, type TotalesTicket } from "../lib/cobro";
import { SidebarTicket } from "./sidebar-ticket";
import { ModalModificadores } from "./modal-modificadores";
import { ModalCobro } from "./modal-cobro";

/** Topbar del POS operativo (mockup P-059): marca + sucursal/turno + reloj + cajero + acciones. */
function TopbarOperativa({
  caja,
  turno,
  empleado,
  onCambiarCajero,
  onBloquear,
}: {
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onCambiarCajero: () => void;
  onBloquear: () => void;
}) {
  const ahora = useReloj();
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-6">
      <div className="flex items-center gap-4">
        <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
          <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
          <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight">Knock-Out Burger</div>
          <div className="mt-px text-xs text-ink-3">
            {caja.sucursalNombre} · {caja.nombre} · <span className="text-success">Turno {turno.codigo_turno}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="font-display text-[15px] font-semibold tabular-nums text-ink-2">
          {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover font-display text-[13px] font-semibold text-ink-2">
            {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight">{empleado.nombre}</div>
            <div className="text-[11px] text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onBloquear}
            aria-label="Bloquear"
            className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-3 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </button>
          <button
            type="button"
            onClick={onCambiarCajero}
            aria-label="Cambiar cajero"
            className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-3 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function HomePos({
  empleado,
  caja,
  turno,
  token,
  onBloquear,
  onCambiarCajero,
}: {
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  token: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catSel, setCatSel] = useState<string | null>(null);
  const [carrito, dispatch] = useReducer(reducerCarrito, estadoInicial);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [totalesCobro, setTotalesCobro] = useState<TotalesTicket | null>(null);
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ folio: string | null; cambio: number } | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([listarCategoriasPos(token), listarProductosPos(token)])
      .then(([cs, ps]) => {
        if (!activo) return;
        setCategorias(cs);
        setProductos(ps);
        if (cs.length > 0) setCatSel(cs[0]!.id);
      })
      .catch((e) => {
        if (!activo) return;
        setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      activo = false;
    };
  }, [token]);

  const prodsVisibles = useMemo(
    () => (productos ?? []).filter((p) => !catSel || p.categoria_id === catSel),
    [productos, catSel],
  );

  const onTapProducto = useCallback(
    async (p: Producto) => {
      if (p.agotado) return;
      try {
        const grupos = await obtenerGruposDeProducto(token, p.id);
        if (grupos.length === 0) {
          dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: p, cantidad: 1, modificadores: [], notaCocina: null } });
        } else {
          setModGrupos({ producto: p, grupos });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar modificadores");
      }
    },
    [token],
  );

  const confirmarModificadores = useCallback(
    (mods: ModificadorSel[], nota: string | null) => {
      if (!modGrupos) return;
      dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: modGrupos.producto, cantidad: 1, modificadores: mods, notaCocina: nota } });
      setModGrupos(null);
    },
    [modGrupos],
  );

  const iniciarCobro = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
    setProcesandoCobro(true);
    setError(null);
    try {
      const totales = await persistirTicket(
        { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
        carrito.modoServicio,
        carrito.lineas,
        nuevoClientId(),
      );
      setTotalesCobro(totales);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al abrir el ticket");
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, token, caja.sucursal_id, turno.caja_id, turno.id]);

  return (
    <div className="flex h-screen flex-col">
      <TopbarOperativa caja={caja} turno={turno} empleado={empleado} onCambiarCajero={onCambiarCajero} onBloquear={onBloquear} />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar categorías */}
        <aside className="flex w-[200px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3">
          <div className="px-2 pb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">Categorías</div>
          {categorias === null && <p className="px-2 text-sm text-ink-3">Cargando…</p>}
          {categorias?.map((c, i) => {
            const col = colorCategoria(c, i);
            const active = catSel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatSel(c.id)}
                aria-current={active ? "true" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-hover hover:text-ink",
                ].join(" ")}
              >
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                  style={active ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: col.bg, color: col.ink }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d={ICONOS_POS[c.icono ?? "tag"] ?? ICONOS_POS.tag} />
                  </svg>
                </span>
                <span className="truncate">{c.nombre}</span>
              </button>
            );
          })}
          {categorias?.length === 0 && (
            <p className="px-2 text-xs text-ink-3">Sin categorías. Créalas en el admin.</p>
          )}
        </aside>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto bg-bg p-5">
          {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
          {productos === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
          {productos !== null && prodsVisibles.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-display text-lg font-semibold">Sin productos en esta categoría</p>
              <p className="max-w-md text-sm text-ink-3">Crea productos en el admin para empezar a vender.</p>
            </div>
          )}
          {prodsVisibles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {prodsVisibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.agotado}
                  onClick={() => onTapProducto(p)}
                  className={[
                    "group relative flex flex-col items-stretch gap-2 rounded-lg border bg-surface p-3 text-left transition",
                    p.agotado
                      ? "cursor-not-allowed border-line opacity-50"
                      : "border-line hover:border-ink hover:shadow-sm active:scale-[.98]",
                  ].join(" ")}
                >
                  {p.agotado && (
                    <span className="absolute right-2 top-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                      Agotado
                    </span>
                  )}
                  <div className="flex h-20 items-center justify-center rounded bg-hover">
                    <span className="font-display text-2xl font-bold text-ink-3">
                      {p.nombre.charAt(0)}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-semibold leading-tight">{p.nombre}</div>
                  <div className="mt-auto font-display text-[15px] font-bold tabular-nums">{fmtMxn(p.precio_base_mxn)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <SidebarTicket
          estado={carrito}
          onCantidad={(id, c) => dispatch({ tipo: "cantidad", clientId: id, cantidad: c })}
          onQuitar={(id) => dispatch({ tipo: "quitar", clientId: id })}
          onModo={(m: ModoServicio) => dispatch({ tipo: "modo", modo: m })}
          onCobrar={iniciarCobro}
          procesando={procesandoCobro}
        />
      </div>

      {modGrupos && (
        <ModalModificadores
          producto={modGrupos.producto}
          grupos={modGrupos.grupos}
          onConfirmar={confirmarModificadores}
          onCancelar={() => setModGrupos(null)}
        />
      )}
      {totalesCobro && (
        <ModalCobro
          token={token}
          totalesIniciales={totalesCobro}
          onPagado={(folio, cambio) => {
            setTotalesCobro(null);
            dispatch({ tipo: "limpiar" });
            setConfirmacion({ folio, cambio });
          }}
          onCerrar={() => setTotalesCobro(null)}
        />
      )}
      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">✓</div>
            <div className="font-display text-[18px] font-semibold">Venta cobrada</div>
            {confirmacion.folio && <div className="mt-1 text-[13px] text-ink-3">Folio {confirmacion.folio}</div>}
            {confirmacion.cambio > 0 && <div className="mt-1 text-[14px]">Cambio: <strong className="tabular-nums">{fmtMxn(confirmacion.cambio)}</strong></div>}
            <Button className="mt-4 w-full" onClick={() => setConfirmacion(null)}>Nuevo ticket</Button>
          </div>
        </div>
      )}
    </div>
  );
}
