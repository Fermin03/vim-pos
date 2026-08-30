"use client";
import { useCallback, useState } from "react";
import { CatalogoProductos } from "./catalogo-productos";
import { ModalModificadores } from "./modal-modificadores";
import { SidebarTicket } from "./sidebar-ticket";
import { agregarItemAlTicket } from "../lib/cuenta-mesa";
import { obtenerGruposDeProducto } from "../lib/modificadores";
import { nuevoClientId, type LineaCarrito, type ModificadorSel, type ModoServicio } from "../lib/carrito";
import type { Categoria, Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";

/**
 * Agregar productos a una cuenta ya abierta.
 *
 * Muestra únicamente lo que se está anotando en ESTA tanda, no lo que la cuenta ya tenía:
 * mezclarlo obliga al cajero a distinguir a ojo qué es viejo y qué es nuevo, cuando lo único que
 * quiere saber es qué acaba de capturar. Por lo mismo no lleva botón de cobrar — eso vive en la
 * lista de cuentas.
 *
 * PERO SE CAPTURA IGUAL QUE UN TICKET NUEVO
 *
 * Antes esta pantalla era una lista de solo lectura: cada producto se guardaba en la cuenta al
 * tocarlo, y a cambio no había forma de cambiar una cantidad, escribir una nota ni quitar un
 * renglón. Un doble toque solo se deshacía saliendo de aquí y cancelando el producto desde el
 * detalle de la cuenta —con motivo, y con PIN de supervisor si ya iba en cocina—. Por un dedazo
 * de tres segundos. Y el mismo gesto se comportaba distinto en dos pantallas casi idénticas, que
 * es lo que traiciona al cajero en la hora pico.
 *
 * Ahora la tanda vive en la pantalla hasta que se manda, exactamente como un ticket nuevo, y se
 * guarda completa al confirmar. El carrito no es una copia parecida: es el MISMO componente
 * (`SidebarTicket`), así que no pueden volver a separarse.
 *
 * Lo que se cambió a cambio: si la caja se cierra a media captura, esa tanda se pierde. Antes
 * quedaba guardada renglón por renglón. Es la decisión que hace posible corregir sin pedirle
 * permiso a la base de datos en cada toque.
 */
export function ModalAgregarProductos({
  token,
  ticketId,
  modo,
  categorias,
  productos,
  onCerrar,
  onEnviarCocina,
}: {
  token: string;
  ticketId: string;
  /** Modo de la cuenta a la que se le agrega; se muestra igual que en la pantalla de venta. */
  modo: ModoServicio;
  categorias: Categoria[] | null;
  productos: Producto[] | null;
  /** Cierra. `huboCambios` = se guardó algo en la cuenta (la lista tiene que releerse). */
  onCerrar: (huboCambios: boolean) => void;
  /** Manda a cocina lo pendiente de la cuenta e imprime su comanda. */
  onEnviarCocina: (ticketId: string) => Promise<void>;
}) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = useCallback((p: Producto, mods: ModificadorSel[], nota: string | null) => {
    // Una línea por toque, igual que el carrito normal: no se fusionan las repetidas.
    setLineas((prev) => [
      ...prev,
      { clientId: nuevoClientId(), producto: p, cantidad: 1, modificadores: mods, notaCocina: nota },
    ]);
  }, []);

  const onTap = useCallback(
    async (p: Producto) => {
      setError(null);
      try {
        const grupos = await obtenerGruposDeProducto(token, p.id);
        if (grupos.length === 0) agregar(p, [], null);
        else setModGrupos({ producto: p, grupos });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar modificadores");
      }
    },
    [token, agregar],
  );

  /**
   * Guarda la tanda completa en la cuenta.
   *
   * En orden y una por una: la RPC asigna `orden_visualizacion` leyendo el máximo actual, así que
   * mandarlas en paralelo las dejaría barajadas y la comanda saldría en un orden que no es el que
   * el cajero capturó. Cada línea viaja con su `clientId`, que hace la operación idempotente: si
   * esto se corta a la mitad, reintentar no duplica lo que ya entró.
   */
  const guardar = useCallback(async () => {
    for (const l of lineas) {
      await agregarItemAlTicket(token, {
        ticketId,
        productoId: l.producto.id,
        cantidad: l.cantidad,
        modificadores: l.modificadores,
        nota: l.notaCocina,
        clientId: l.clientId,
      });
    }
  }, [lineas, token, ticketId]);

  const guardarSinMandar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      await guardar();
      onCerrar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los productos");
    } finally {
      setOcupado(false);
    }
  }, [guardar, onCerrar]);

  const enviarACocina = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      await guardar();
      await onEnviarCocina(ticketId);
      onCerrar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
    } finally {
      setOcupado(false);
    }
  }, [guardar, onEnviarCocina, ticketId, onCerrar]);

  const hayLineas = lineas.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Agregar productos">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2">
        {/* Volver DESCARTA la tanda: nada se ha guardado todavía. Es el mismo trato que en un
            ticket nuevo, que también se pierde al salir sin mandarlo. */}
        <button
          type="button"
          onClick={() => onCerrar(false)}
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

        <SidebarTicket
          estado={{ modoServicio: modo, lineas }}
          titulo="Productos extra"
          onCantidad={(clientId, cantidad) =>
            setLineas((prev) =>
              prev.map((l) => (l.clientId === clientId ? { ...l, cantidad } : l)).filter((l) => l.cantidad > 0),
            )
          }
          onQuitar={(clientId) => setLineas((prev) => prev.filter((l) => l.clientId !== clientId))}
          onNotaLinea={(clientId, nota) =>
            setLineas((prev) => prev.map((l) => (l.clientId === clientId ? { ...l, notaCocina: nota } : l)))
          }
          onLimpiar={() => setLineas([])}
          // Mandar a cocina es la acción principal, igual que en pick-up y domicilio: deja la
          // cuenta abierta y se cobra después desde la lista.
          onEnviarCocinaAbierto={enviarACocina}
          accionSecundaria={{
            etiqueta: hayLineas ? "Guardar sin mandar" : "Cerrar",
            onClick: () => (hayLineas ? guardarSinMandar() : onCerrar(false)),
          }}
          procesando={ocupado}
        />
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
