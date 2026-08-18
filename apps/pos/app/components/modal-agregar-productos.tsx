"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { CatalogoProductos } from "./catalogo-productos";
import { ModalModificadores } from "./modal-modificadores";
import { agregarItemAlTicket } from "../lib/cuenta-mesa";
import { leerRenglonesCuenta, type RenglonCuenta } from "../lib/cuentas-abiertas";
import { RenglonItem } from "./renglon-item";
import { obtenerGruposDeProducto } from "../lib/modificadores";
import type { Categoria, Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";
import type { ModificadorSel } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";

/**
 * Agregar productos a una cuenta YA abierta, sin salir de la lista.
 *
 * Antes esta acción cargaba la cuenta y llevaba a la pantalla de venta completa, donde el botón
 * dominante es "Cobrar" — justo lo que no se quiere al estar anotando una segunda tanda. Aquí
 * solo se puede hacer una cosa: agregar, y mandar lo agregado a cocina.
 *
 * Cada producto se guarda en la cuenta EN EL MOMENTO de tocarlo, no al confirmar: si la caja se
 * cierra o falla a media captura, lo anotado ya está en la cuenta y no se pierde. Por eso cerrar
 * el modal sin mandar a cocina es válido — los renglones quedan pendientes y se pueden mandar
 * después desde la propia lista.
 */
export function ModalAgregarProductos({
  token,
  ticketId,
  folio,
  categorias,
  productos,
  onCerrar,
  onEnviarCocina,
}: {
  token: string;
  ticketId: string;
  folio: string | null;
  categorias: Categoria[] | null;
  productos: Producto[] | null;
  /** Cierra sin mandar. Lo agregado ya quedó en la cuenta. */
  onCerrar: (huboCambios: boolean) => void;
  /** Manda a cocina lo pendiente de la cuenta e imprime su comanda. */
  onEnviarCocina: (ticketId: string) => Promise<void>;
}) {
  // Lo pendiente de mandar se lee de la CUENTA, no de una lista local: así el precio incluye
  // los modificadores (lo calcula la BD) y se ven también los renglones que quedaron pendientes
  // de una captura anterior, que es justo lo que el botón va a mandar.
  const [pendientes, setPendientes] = useState<RenglonCuenta[]>([]);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargarPendientes = useCallback(async () => {
    try {
      setPendientes(await leerRenglonesCuenta(token, ticketId, { soloPendientes: true }));
    } catch {
      /* el catálogo sigue usable; el importe se refresca al siguiente toque */
    }
  }, [token, ticketId]);

  useEffect(() => { recargarPendientes(); }, [recargarPendientes]);

  const agregar = useCallback(
    async (p: Producto, mods: ModificadorSel[], nota: string | null) => {
      setOcupado(true);
      setError(null);
      try {
        await agregarItemAlTicket(token, { ticketId, productoId: p.id, cantidad: 1, modificadores: mods, nota });
        await recargarPendientes();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar el producto");
      } finally {
        setOcupado(false);
      }
    },
    [token, ticketId, recargarPendientes],
  );

  const onTap = useCallback(
    async (p: Producto) => {
      setError(null);
      try {
        const grupos = await obtenerGruposDeProducto(token, p.id);
        if (grupos.length === 0) await agregar(p, [], null);
        else setModGrupos({ producto: p, grupos });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar modificadores");
      }
    },
    [token, agregar],
  );

  const nuevos = pendientes.reduce((a, r) => a + r.cantidad, 0);
  const importe = pendientes.reduce((a, r) => a + r.totalItemMxn, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Agregar productos">
      <header className="flex h-[60px] flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onCerrar(nuevos > 0)}
            className="flex h-10 flex-shrink-0 items-center gap-2 rounded border border-line-strong px-3 text-[13.5px] font-semibold text-ink transition hover:border-ink hover:bg-hover"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Volver
          </button>
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-bold leading-tight">Agregar productos</div>
            {folio && <div className="truncate text-[11.5px] text-ink-3">Cuenta {folio}</div>}
          </div>
        </div>
      </header>

      {error && <p className="flex-shrink-0 bg-[#FBECEA] px-4 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <CatalogoProductos categorias={categorias} productos={productos} bloqueado={ocupado} onTapProducto={onTap} />

        <aside className="flex w-[clamp(18rem,26vw,22rem)] flex-shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex-shrink-0 border-b border-line px-5 py-4">
            <div className="font-display text-[17px] font-semibold">Se agregará</div>
            <div className="text-[12px] text-ink-3">
              {nuevos === 0 ? "Todavía nada" : `${nuevos} ${nuevos === 1 ? "producto" : "productos"}`}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {pendientes.length === 0 ? (
              <p className="mt-6 text-center text-[13px] text-ink-3">Toca un producto para agregarlo a la cuenta.</p>
            ) : (
              pendientes.map((r) => (
                <div key={r.id} className="border-b border-line py-3 last:border-0">
                  <RenglonItem
                    cantidad={r.cantidad}
                    nombre={r.productoNombre}
                    modificadores={r.modificadores}
                    notaCocina={r.notaCocina}
                    totalMxn={r.totalItemMxn}
                  />
                </div>
              ))
            )}
          </div>

          <div className="flex-shrink-0 border-t border-line px-5 py-4">
            {nuevos > 0 && (
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[13px] text-ink-2">Importe agregado</span>
                <span className="font-display text-[18px] font-bold tabular-nums">{fmtMxn(importe)}</span>
              </div>
            )}
            {/* Sin botón de cobrar a propósito: cobrar se hace desde la lista, con su propio modal. */}
            <Button
              className="w-full"
              disabled={nuevos === 0 || ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  await onEnviarCocina(ticketId);
                  onCerrar(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
                } finally {
                  setOcupado(false);
                }
              }}
            >
              Enviar a cocina
            </Button>
            <button
              type="button"
              onClick={() => onCerrar(nuevos > 0)}
              className="mt-2 w-full rounded border border-line-strong px-4 py-2.5 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
            >
              {nuevos > 0 ? "Guardar sin mandar" : "Cerrar"}
            </button>
          </div>
        </aside>
      </div>

      {modGrupos && (
        <ModalModificadores
          producto={modGrupos.producto}
          grupos={modGrupos.grupos}
          onConfirmar={(mods, nota) => {
            const p = modGrupos.producto;
            setModGrupos(null);
            agregar(p, mods, nota);
          }}
          onCancelar={() => setModGrupos(null)}
        />
      )}
    </div>
  );
}
