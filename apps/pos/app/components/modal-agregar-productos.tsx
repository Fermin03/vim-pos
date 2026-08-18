"use client";
import { useCallback, useState } from "react";
import { Button } from "@vim/ui/styles";
import { CatalogoProductos } from "./catalogo-productos";
import { ModalModificadores } from "./modal-modificadores";
import { RenglonItem } from "./renglon-item";
import { agregarItemAlTicket } from "../lib/cuenta-mesa";
import { obtenerGruposDeProducto } from "../lib/modificadores";
import {
  calcularTotalesDisplay,
  nuevoClientId,
  totalLinea,
  type LineaCarrito,
  type ModificadorSel,
} from "../lib/carrito";
import type { Categoria, Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";
import { fmtMxn } from "../lib/turno";

/**
 * Agregar productos a una cuenta ya abierta.
 *
 * Es una pantalla INDEPENDIENTE: muestra únicamente lo que se está anotando en esta tanda, no lo
 * que la cuenta ya tenía. Mezclarlo obliga al cajero a distinguir a ojo qué es viejo y qué es
 * nuevo, cuando lo único que quiere saber es qué acaba de capturar.
 *
 * Tampoco lleva botón de cobrar: en la pantalla de venta esa es la acción dominante y aquí no
 * viene a cuento — cobrar tiene su propio modal, desde la lista.
 *
 * Cada producto se guarda en la cuenta AL TOCARLO, no al confirmar: si la caja se cierra o falla
 * a media captura, lo anotado ya está en la cuenta. Por eso "Guardar sin mandar" es una salida
 * válida: los renglones quedan pendientes y se mandan después desde la lista.
 */
export function ModalAgregarProductos({
  token,
  ticketId,
  categorias,
  productos,
  onCerrar,
  onEnviarCocina,
}: {
  token: string;
  ticketId: string;
  categorias: Categoria[] | null;
  productos: Producto[] | null;
  /** Cierra. Lo agregado ya quedó en la cuenta. */
  onCerrar: (huboCambios: boolean) => void;
  /** Manda a cocina lo pendiente de la cuenta e imprime su comanda. */
  onEnviarCocina: (ticketId: string) => Promise<void>;
}) {
  // Solo esta tanda. Se usan líneas de carrito para que el precio salga con la misma cuenta que
  // en la pantalla de venta: `totalLinea` suma los modificadores; el precio base del producto no.
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = useCallback(
    async (p: Producto, mods: ModificadorSel[], nota: string | null) => {
      setOcupado(true);
      setError(null);
      try {
        await agregarItemAlTicket(token, { ticketId, productoId: p.id, cantidad: 1, modificadores: mods, nota });
        // Una línea por toque, igual que el carrito normal: no se fusionan las repetidas.
        setLineas((prev) => [
          ...prev,
          { clientId: nuevoClientId(), producto: p, cantidad: 1, modificadores: mods, notaCocina: nota },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar el producto");
      } finally {
        setOcupado(false);
      }
    },
    [token, ticketId],
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

  const nuevos = lineas.reduce((a, l) => a + l.cantidad, 0);
  const totales = calcularTotalesDisplay(lineas);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Agregar productos">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => onCerrar(nuevos > 0)}
          className="flex h-10 flex-shrink-0 items-center gap-2 rounded border border-line-strong px-3 text-[13.5px] font-semibold text-ink transition hover:border-ink hover:bg-hover"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
      </div>

      {error && (
        <p className="flex-shrink-0 bg-[#FBECEA] px-4 py-2 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <CatalogoProductos categorias={categorias} productos={productos} bloqueado={ocupado} onTapProducto={onTap} />

        <aside className="flex w-[clamp(20rem,32vw,26.25rem)] flex-shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex-shrink-0 border-b border-line px-5 pb-3 pt-4">
            <span className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em]">Productos extra</span>
            <div className="mt-1 text-right text-[12.5px] text-ink-3">
              {nuevos === 0 ? "Sin productos" : nuevos === 1 ? "1 producto" : nuevos + " productos"}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {lineas.length === 0 ? (
              <p className="mt-8 text-center text-[13px] text-ink-3">Toca un producto para agregarlo.</p>
            ) : (
              lineas.map((l) => (
                <div key={l.clientId} className="border-b border-line py-3 last:border-0">
                  <RenglonItem
                    cantidad={l.cantidad}
                    nombre={l.producto.nombre}
                    modificadores={l.modificadores.map((m) => m.opcionNombre)}
                    notaCocina={l.notaCocina}
                    totalMxn={totalLinea(l)}
                  />
                </div>
              ))
            )}
          </div>

          <div className="flex-shrink-0 border-t border-line px-5 py-4">
            <div className="mb-1 flex items-baseline justify-between text-[13px] text-ink-3">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmtMxn(totales.subtotal)}</span>
            </div>
            <div className="mb-2 flex items-baseline justify-between text-[13px] text-ink-3">
              <span>IVA (16%)</span>
              <span className="tabular-nums">{fmtMxn(totales.iva)}</span>
            </div>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="font-display text-[15px] font-bold">TOTAL</span>
              <span className="font-display text-[24px] font-bold tabular-nums">{fmtMxn(totales.total)}</span>
            </div>

            {/* Sin cobrar a propósito: aquí solo se agrega. */}
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
