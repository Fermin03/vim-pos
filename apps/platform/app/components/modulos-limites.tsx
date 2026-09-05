"use client";
import { useEffect, useState } from "react";
import { MODULOS, type CodigoModulo } from "@vim/db/modulos";
import type { Detalle, LimitesTrio } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";

type Accion = (b: Record<string, unknown>) => Promise<void>;
type Campos = Record<keyof LimitesTrio, string>;
type Pendiente =
  | { tipo: "permitir" | "quitar"; codigo: CodigoModulo; nombre: string }
  | { tipo: "limites"; valores: Campos }
  | null;

const NOMBRE_LIMITE: Record<keyof LimitesTrio, string> = {
  max_sucursales: "Sucursales",
  max_cajas_por_sucursal: "Cajas por sucursal",
  max_usuarios: "Usuarios",
};
const CLAVES: (keyof LimitesTrio)[] = ["max_sucursales", "max_cajas_por_sucursal", "max_usuarios"];

const aCampos = (d: Detalle): Campos => ({
  max_sucursales: d.limites?.excepcion.max_sucursales?.toString() ?? "",
  max_cajas_por_sucursal: d.limites?.excepcion.max_cajas_por_sucursal?.toString() ?? "",
  max_usuarios: d.limites?.excepcion.max_usuarios?.toString() ?? "",
});

/**
 * Dos capas (spec §5.4): VIM permite, el dueño enciende. Aquí solo se mueve la primera; la
 * segunda se ve en gris para entender por qué un módulo permitido puede no estar en uso.
 * Cambiar cualquier cosa pide motivo y el nombre del cliente: son excepciones al contrato.
 */
export function ModulosLimites({ d, nombre, accion, busy }: { d: Detalle; nombre: string; accion: Accion; busy: boolean }) {
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [f, setF] = useState<Campos>(() => aCampos(d));
  useEffect(() => { setF(aCampos(d)); }, [d]);
  const lim = d.limites;

  const origen = (codigo: string): { texto: string; clase: string } => {
    const ex = d.modulos.excepciones.find((e) => e.codigo === codigo);
    if (ex) {
      return ex.activado
        ? { texto: `Permitido por excepción · ${ex.motivo ?? "sin motivo"}`, clase: "text-[#0063A8]" }
        : { texto: `Negado por excepción · ${ex.motivo ?? "sin motivo"}`, clase: "text-warning" };
    }
    return d.modulos.permitidos[codigo]
      ? { texto: "Incluido en el plan", clase: "text-success" }
      : { texto: "No incluido en el plan", clase: "text-ink-3" };
  };

  const titulo = pendiente?.tipo === "limites" ? "Cambiar límites"
    : pendiente?.tipo === "quitar" ? `Quitar ${pendiente.nombre}`
    : pendiente?.tipo === "permitir" ? `Permitir ${pendiente.nombre}` : "";

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className={label}>Módulos que puede usar</label>
          <ul className="flex flex-col gap-2">
            {MODULOS.map((m) => {
              const permitido = Boolean(d.modulos.permitidos[m.codigo]);
              const efectivo = Boolean(d.modulos.efectivos[m.codigo]);
              const o = origen(m.codigo);
              const tieneExcepcion = d.modulos.excepciones.some((e) => e.codigo === m.codigo);
              return (
                <li key={m.codigo} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">{m.nombre}</div>
                    <div className={["text-[11.5px]", m.porAddon ? (permitido ? "text-success" : "text-ink-3") : o.clase].join(" ")}>
                      {m.porAddon ? (permitido ? "Por el add-on CFDI" : "Sin add-on CFDI · se activa arriba, en Add-ons") : o.texto}
                    </div>
                    {permitido && !efectivo && m.interruptorDueno && (
                      <div className="text-[11.5px] text-ink-3">Permitido, pero el dueño no lo ha encendido en su admin.</div>
                    )}
                  </div>
                  {!m.porAddon && (
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {tieneExcepcion && (
                        <button
                          onClick={() => void accion({ accion: "modulo_segun_plan", codigo: m.codigo })}
                          disabled={busy}
                          className="btn h-8 rounded px-2 text-[12px] font-semibold text-ink-3 hover:bg-hover disabled:opacity-50"
                        >
                          Según plan
                        </button>
                      )}
                      <button
                        onClick={() => setPendiente({ tipo: permitido ? "quitar" : "permitir", codigo: m.codigo, nombre: m.nombre })}
                        disabled={busy}
                        className={["btn h-8 rounded px-3 text-[12.5px] font-semibold disabled:opacity-50", permitido ? "border border-line-strong hover:bg-hover" : "bg-ink text-white"].join(" ")}
                      >
                        {permitido ? "Quitar" : "Permitir"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label className={label}>Límites</label>
          <p className="mb-2 text-[12px] text-ink-3">En gris, lo que da el plan. Escribe un número para hacer una excepción; vacío = según plan.</p>
          {CLAVES.map((k) => {
            const delPlan = lim?.del_plan[k];
            return (
              <div key={k} className="mb-2 flex items-center gap-3">
                <label className="w-36 text-[13px]" htmlFor={`lim-${k}`}>{NOMBRE_LIMITE[k]}</label>
                <span className="w-24 text-[12px] text-ink-3">plan: {delPlan ?? "sin límite"}</span>
                <input
                  id={`lim-${k}`}
                  className={`${input} w-24`}
                  inputMode="numeric"
                  placeholder="—"
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^0-9]/g, "") })}
                />
              </div>
            );
          })}
          <button
            onClick={() => setPendiente({ tipo: "limites", valores: f })}
            disabled={busy || CLAVES.every((k) => f[k] === (lim?.excepcion[k]?.toString() ?? ""))}
            className="btn mt-1 h-9 rounded border border-line-strong px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-50"
          >
            Guardar límites
          </button>
          {lim?.excepcion.motivo && CLAVES.some((k) => lim.excepcion[k] !== null) && (
            <p className="mt-2 text-[11.5px] text-ink-3">Excepción vigente: {lim.excepcion.motivo}</p>
          )}
        </div>
      </div>

      <DialogoConfirmar
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={titulo}
        descripcion={
          pendiente?.tipo === "limites"
            ? <>Los límites de <b>{nombre}</b> dejarán de seguir su plan. Se aplican al dar de alta cajas, sucursales y usuarios.</>
            : pendiente?.tipo === "quitar"
              ? <>El módulo dejará de estar disponible para <b>{nombre}</b> aunque su plan lo incluya. La caja lo obedecerá cuando reciba directivas (entrega 2).</>
              : <>Se le permite a <b>{nombre}</b> un módulo que su plan no incluye. Queda como excepción con tu motivo.</>
        }
        nombreEsperado={nombre}
        etiquetaBoton={pendiente?.tipo === "limites" ? "Guardar" : pendiente?.tipo === "quitar" ? "Quitar módulo" : "Permitir módulo"}
        peligroso={pendiente?.tipo === "quitar"}
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          if (!pendiente) return;
          if (pendiente.tipo === "limites") await accion({ accion: "limites", ...pendiente.valores, motivo });
          else await accion({ accion: pendiente.tipo === "quitar" ? "modulo_quitar" : "modulo_permitir", codigo: pendiente.codigo, motivo });
          setPendiente(null);
        }}
      />
    </div>
  );
}
