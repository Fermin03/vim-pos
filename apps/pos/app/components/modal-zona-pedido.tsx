"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { listarZonas, type ZonaEnvio } from "../lib/zonas-envio";
import type { EnvioCarrito } from "../lib/carrito";
import { SelectorZona } from "./selector-zona";

/**
 * Cambiar la zona de reparto de ESTE pedido, desde el renglón de envío del ticket lateral.
 *
 * Decisión de Task 7 (el brief hablaba de "el modal de domicilio en el paso de zona", que no
 * existe: `ModalClienteDomicilio` no tiene un paso separado para la zona, la captura junto con
 * la dirección). Este modal es la superficie mínima: carga el catálogo de zonas de la sucursal
 * (igual que hace `ModalClienteDomicilio`, porque `SelectorZona` es presentacional y no las carga
 * por su cuenta) y, al elegir, avisa hacia arriba con la zona elegida.
 *
 * A propósito NO toca `direcciones_cliente`: cambiar aquí es "para este pedido nada más". La
 * próxima vez que se elija este cliente, su dirección sigue apuntando a la zona que tenía
 * guardada — para cambiar esa hay que hacerlo desde `ModalClienteDomicilio`.
 */
export function ModalZonaPedido({
  token, tenantId, sucursalId, cajaId, turnoId, empleadoNombre, valor, onElegir, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  /** Los pide `ModalAutorizacionPin` si se repreciar una zona desde aquí. */
  cajaId: string;
  turnoId: string;
  empleadoNombre: string;
  /** Id de la zona actual del pedido (para resaltarla en el selector). */
  valor: string | null;
  /** Se llama al elegir (o quitar, con `null`) una zona. El caller despacha `{ tipo: "zona", envio }`
   *  y cierra el modal. */
  onElegir: (envio: EnvioCarrito | null) => void;
  onCerrar: () => void;
}) {
  const [zonas, setZonas] = useState<ZonaEnvio[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    listarZonas(token, sucursalId)
      .then(setZonas)
      .catch(() => setError("No se pudieron cargar las zonas de reparto. Revisa la conexión e inténtalo de nuevo."));
  }, [token, sucursalId]);

  /** Alta o repreciado: upsert por id en el catálogo local (mismo patrón que `ModalClienteDomicilio`). */
  function onZonaSincronizada(z: ZonaEnvio) {
    setZonas((zs) => {
      const existe = zs.some((x) => x.id === z.id);
      return existe ? zs.map((x) => (x.id === z.id ? z : x)) : [...zs, z];
    });
  }

  function onCambio(z: ZonaEnvio | null) {
    onElegir(z ? { zonaId: z.id, nombre: z.nombre, costoMxn: z.costoMxn } : null);
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Zona de reparto de este pedido"
      className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="mb-1 font-display text-xl font-semibold tracking-tight">Zona de reparto</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">Cambia el envío de este pedido. No cambia la zona guardada del cliente.</p>
      <SelectorZona
        token={token}
        tenantId={tenantId}
        sucursalId={sucursalId}
        cajaId={cajaId}
        turnoId={turnoId}
        empleadoNombre={empleadoNombre}
        zonas={zonas}
        valor={valor}
        onCambio={onCambio}
        onZonaSincronizada={onZonaSincronizada}
      />
      {error && <p className="mt-3 text-[12.5px] font-medium text-danger" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
      </div>
    </Modal>
  );
}
