"use client";
import { useState } from "react";
import { fechaHoraMx } from "../lib/formato";
import { Seccion } from "./seccion";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;
type Modo = "suspender" | "cancelar" | "reactivar" | null;

/**
 * Siempre al final, separada, en danger (docs/diseno/platform.md). Nada de aquí comparte fila
 * con lo cotidiano, y cada botón abre un diálogo que dice a quién afecta y desde cuándo.
 *
 * Suspender y cancelar llevan gracia (spec §3): la caja avisa esos días y bloquea después. Para
 * un bloqueo "ya", se escribe 1: entra a las 06:00 de mañana, que es lo más inmediato que se
 * puede hacer sin dejar a un cajero a media jornada.
 */
export function ZonaPeligrosa({ estado, nombre, bloqueoDesde, accion, busy }: { estado: string; nombre: string; bloqueoDesde: string | null; accion: Accion; busy: boolean }) {
  const [modo, setModo] = useState<Modo>(null);
  const boton = "btn h-10 rounded px-4 text-[13px] font-semibold text-white disabled:opacity-50";
  const cerrar = () => setModo(null);

  return (
    <Seccion id="peligro" titulo="Zona peligrosa" descripcion="Lo que puede dejar a este negocio sin sistema. Cada acción pide motivo y el nombre del cliente." peligrosa>
      <div className="flex flex-wrap gap-2">
        {estado !== "SUSPENDIDO" && estado !== "CANCELADO" && (
          <button onClick={() => setModo("suspender")} disabled={busy} className={`${boton} bg-warning`}>Suspender con gracia…</button>
        )}
        {estado !== "CANCELADO" && (
          <button onClick={() => setModo("cancelar")} disabled={busy} className={`${boton} bg-danger`}>Cancelar cliente…</button>
        )}
        {(estado === "SUSPENDIDO" || estado === "CANCELADO") && (
          <button onClick={() => setModo("reactivar")} disabled={busy} className={`${boton} bg-success`}>Reactivar…</button>
        )}
      </div>
      {bloqueoDesde && (
        <p className="mt-3 text-[12.5px] text-ink-2">
          Bloqueo programado: {fechaHoraMx(bloqueoDesde)} (hora de México). Reactivar lo cancela.
        </p>
      )}

      <DialogoConfirmar
        abierto={modo === "suspender"}
        onCerrar={cerrar}
        titulo="Suspender con gracia"
        descripcion={<><b>{nombre}</b> pasa a SUSPENDIDO hoy. Su caja seguirá vendiendo durante los días de gracia con un aviso, y a partir de la fecha indicada dejará de vender (cuando la caja reciba directivas, entrega 2).</>}
        nombreEsperado={nombre}
        etiquetaBoton="Suspender"
        peligroso
        conGracia
        conMensaje
        ocupado={busy}
        onConfirmar={async ({ motivo, graciaDias, mensaje }) => {
          await accion({ accion: "cambiar_estado", estado: "SUSPENDIDO", motivo, gracia_dias: graciaDias, mensaje });
          cerrar();
        }}
      />
      <DialogoConfirmar
        abierto={modo === "cancelar"}
        onCerrar={cerrar}
        titulo="Cancelar cliente"
        descripcion={<><b>{nombre}</b> pasa a CANCELADO. Con 1 día de gracia el bloqueo entra mañana a las 6:00. Su historial no se borra y se puede reactivar después.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Cancelar cliente"
        peligroso
        conGracia
        conEntiendo="Entiendo que el cliente dejará de poder vender."
        ocupado={busy}
        onConfirmar={async ({ motivo, graciaDias }) => {
          await accion({ accion: "cambiar_estado", estado: "CANCELADO", motivo, gracia_dias: graciaDias });
          cerrar();
        }}
      />
      <DialogoConfirmar
        abierto={modo === "reactivar"}
        onCerrar={cerrar}
        titulo="Reactivar"
        descripcion={<><b>{nombre}</b> vuelve a ACTIVO y se cancela cualquier bloqueo programado.</>}
        nombreEsperado={nombre}
        etiquetaBoton="Reactivar"
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          await accion({ accion: "cambiar_estado", estado: "ACTIVO", motivo });
          cerrar();
        }}
      />
    </Seccion>
  );
}
