"use client";
import { useState } from "react";
import { GIROS, OPERACION, moduloActivo, nombreGiro, type CodigoOperacion } from "@vim/db/operacion";
import type { Detalle } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;
type Pendiente =
  | { tipo: "modulo"; codigo: CodigoOperacion; nombre: string; encender: boolean }
  | { tipo: "giro"; giro: string; reaplicar: boolean }
  | null;

/**
 * Qué usa este negocio (ADR 0034). Solo VIM lo cambia: encender o apagar es reversible y pide
 * motivo; cambiar el giro y volver a aplicar sus módulos puede apagar varios a la vez, así que pide
 * además el nombre. La caja lo obedece en su siguiente conexión.
 */
export function OperacionGiro({ d, nombre, accion, busy }: { d: Detalle; nombre: string; accion: Accion; busy: boolean }) {
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const giroActual = String(d.tenant.vertical_principal ?? "");
  const [giro, setGiro] = useState(giroActual);
  const [reaplicar, setReaplicar] = useState(true);
  const ef = d.modulos.efectivos;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <label className={label}>Cómo vende</label>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <select className={input} value={giro} onChange={(e) => setGiro(e.target.value)} aria-label="Giro">
          {GIROS.filter((g) => g.ofrecido || g.codigo === giroActual).map((g) => <option key={g.codigo} value={g.codigo}>{g.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-13 text-ink-2">
          <input type="checkbox" checked={reaplicar} onChange={(e) => setReaplicar(e.target.checked)} />
          Volver a aplicar sus módulos
        </label>
        <button type="button" disabled={busy || giro === giroActual}
          className="btn h-8 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50"
          onClick={() => setPendiente({ tipo: "giro", giro, reaplicar })}>Cambiar giro</button>
      </div>
      <ul className="flex flex-col gap-2">
        {OPERACION.map((m) => {
          const activo = moduloActivo(ef, m.codigo);
          return (
            <li key={m.codigo} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
              <div className="min-w-0">
                <div className="text-13 font-semibold">{m.nombre} <span className={activo ? "text-success" : "text-ink-3"}>· {activo ? "encendido" : "apagado"}</span></div>
                <div className="text-12 text-ink-3">{m.descripcion}{m.requiere ? ` Necesita ${OPERACION.find((x) => x.codigo === m.requiere)?.nombre}.` : ""}</div>
              </div>
              <button type="button" disabled={busy}
                className={["btn h-8 flex-shrink-0 rounded px-3 text-13 font-semibold disabled:opacity-50", activo ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"].join(" ")}
                onClick={() => setPendiente({ tipo: "modulo", codigo: m.codigo, nombre: m.nombre, encender: !activo })}>
                {activo ? "Apagar" : "Encender"}
              </button>
            </li>
          );
        })}
      </ul>

      <DialogoConfirmar
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={pendiente?.tipo === "giro" ? `Cambiar giro a ${nombreGiro(pendiente.giro)}` : pendiente ? `${pendiente.encender ? "Encender" : "Apagar"} ${pendiente.nombre}` : ""}
        descripcion={pendiente?.tipo === "giro"
          ? <>El giro de <b>{nombre}</b> cambia a <b>{nombreGiro(pendiente.giro)}</b>.{pendiente.reaplicar ? " Sus módulos vuelven a los de ese giro: lo que no use se esconde en su caja y su panel (no se borra nada)." : " Sus módulos se quedan como están."}</>
          : <>La caja y el panel de <b>{nombre}</b> lo reflejan en su siguiente conexión. Apagar solo esconde: no se borra nada.</>}
        nombreEsperado={nombre}
        sinNombre={pendiente?.tipo === "modulo"}
        etiquetaBoton={pendiente?.tipo === "giro" ? "Cambiar giro" : pendiente?.encender ? "Encender" : "Apagar"}
        peligroso={pendiente?.tipo === "giro" ? pendiente.reaplicar : pendiente?.encender === false}
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          if (!pendiente) return;
          if (pendiente.tipo === "giro") await accion({ accion: "cambiar_giro", giro: pendiente.giro, reaplicar: pendiente.reaplicar, motivo });
          else await accion({ accion: "operacion", cambios: { [pendiente.codigo]: pendiente.encender }, motivo });
          setPendiente(null);
        }}
      />
    </div>
  );
}
