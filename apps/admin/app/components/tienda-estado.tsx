"use client";
import Link from "next/link";
import { Aviso } from "@vim/ui/styles";
import { Interruptor } from "./interruptor";
import { Tarjeta } from "./tarjeta";
import { puedeEncender, type Revision } from "../lib/tienda-reglas";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";

/** Bloque 1: el interruptor de la tienda y lo que falta para poder encenderla. */
export function TiendaEstado({
  encendida,
  enPlan,
  revision,
  ocupado,
  soloLectura,
  mensaje,
  onCambiar,
}: {
  /** Lo que ve el dueño: el interruptor Y el complemento vigente. */
  encendida: boolean;
  /** false = el complemento venció: se ve apagada y no se puede encender. */
  enPlan: boolean;
  revision: Revision[];
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onCambiar: (encender: boolean) => void;
}) {
  // Apagar siempre se puede; encender, solo sin bloqueos y con el complemento vigente.
  const faltaAlgo = !encendida && !puedeEncender(revision);
  const ayuda = !enPlan
    ? "Tu plan ya no incluye la tienda en línea."
    : faltaAlgo
      ? "Resuelve lo de abajo para poder encenderla."
      : null;

  return (
    <Tarjeta titulo="Estado">
      <Interruptor
        etiqueta="Tienda en línea"
        encendido={encendida}
        deshabilitado={ocupado || soloLectura || !enPlan || faltaAlgo}
        onCambiar={onCambiar}
        descripcion={
          <>
            <span role="status">{encendida ? "Encendida: tus clientes ya pueden pedir." : "Apagada: nadie puede verla."}</span>
            {ayuda && <span className="mt-0.5 block text-ink-3">{ayuda}</span>}
          </>
        }
      />
      <LineaMensaje mensaje={mensaje} className="mt-3" />

      {revision.length === 0 ? (
        <p className="mt-4 text-13 font-medium text-success">Todo listo para recibir pedidos.</p>
      ) : (
        <ul aria-label="Pendientes de tu tienda" className="mt-4 flex flex-col gap-2">
          {revision.map((r) => (
            <li key={r.texto}>
              <Aviso tono={r.nivel === "bloquea" ? "warning" : "info"}>
                {r.texto}
                {r.enlace && (
                  <>
                    {" "}
                    <Link href={r.enlace.href} className="whitespace-nowrap font-semibold underline underline-offset-2">
                      {r.enlace.etiqueta}
                    </Link>
                  </>
                )}
              </Aviso>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 border-t border-line pt-4 text-13 leading-relaxed text-ink-2">
        Tu tienda solo recibe pedidos cuando la caja de la sucursal tiene turno abierto y conexión.
      </p>
    </Tarjeta>
  );
}
