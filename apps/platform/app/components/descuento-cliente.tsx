"use client";
import { useState } from "react";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { descuentoVigente, textoDescuento } from "@vim/db/cobro";
import { fmtMxn, input, label } from "../lib/formato";
import { leerDescuento } from "../lib/promocion";
import type { Api, SuscripcionLista } from "../lib/tipos";
import { DialogoConfirmar } from "./dialogo-confirmar";

const fmt = { fecha: fechaLegible, mxn: fmtMxn };

/**
 * El descuento al cobro final de un cliente (0289), en su fila de Clientes: lo que tiene hoy y el
 * botón para ponerlo, cambiarlo o quitarlo. Porcentaje o importe, por N cobros, por fechas o sin fin.
 * Las reglas son las de `leerDescuento`, la misma función que valida en el servidor.
 */
export function DescuentoCliente({ api, tenantId, nombre, s, onCambio }: {
  api: Api; tenantId: string; nombre: string; s: SuscripcionLista | null; onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState<"fijar" | "quitar" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipo, setTipo] = useState<"PORCENTAJE" | "IMPORTE">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<"COBROS" | "RANGO" | "INDEFINIDO">("COBROS");
  const [cobros, setCobros] = useState("1");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const hoy = hoyMx();
  if (!s) return <span className="text-12 text-ink-3">sin cobro activo</span>;
  // El que vale hoy o el que ya está programado para después.
  const actual = descuentoVigente(s, hoy) ?? (s.descuento_desde && s.descuento_desde > hoy ? descuentoVigente(s, s.descuento_desde) : null);

  const cuerpo = { tipo, valor, forma, cobros: Number(cobros), desde: desde || undefined, hasta };
  const previa = leerDescuento(cuerpo, s, hoy);

  async function enviar(accion: "descuento_fijar" | "descuento_quitar", motivo: string) {
    setOcupado(true);
    try {
      await api(`/api/tenants/${tenantId}`, { method: "PATCH", body: JSON.stringify({ accion, motivo, ...(accion === "descuento_fijar" ? cuerpo : {}) }) });
      setAbierto(null);
      onCambio();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="leading-tight">
      {actual ? (
        <div className="text-13 font-semibold text-success">
          {textoDescuento(actual, fmt)}
          {actual.desde > hoy && <div className="text-12 font-normal text-ink-2">empieza el {fechaLegible(actual.desde)}</div>}
        </div>
      ) : null}
      <div className="flex gap-1">
        <button type="button" onClick={() => setAbierto("fijar")} className="btn -ml-2 h-8 rounded px-2 text-13 font-semibold text-ink-2 hover:bg-hover">
          {actual ? "Cambiar" : "Descuento"}
        </button>
        {actual && (
          <button type="button" onClick={() => setAbierto("quitar")} className="btn h-8 rounded px-2 text-13 font-semibold text-ink-2 hover:bg-hover">Quitar</button>
        )}
      </div>

      <DialogoConfirmar
        abierto={abierto === "fijar"}
        onCerrar={() => setAbierto(null)}
        titulo={`Descuento para ${nombre}`}
        descripcion="Se rebaja del total de cada cobro (plan con promoción y extras). El dueño lo ve en Plan y pagos. Si ya tenía uno, este lo reemplaza."
        nombreEsperado={nombre}
        sinNombre
        listo={{ ok: previa.ok, falta: "un descuento válido" }}
        etiquetaBoton="Guardar descuento"
        textoOcupado="Guardando…"
        ocupado={ocupado}
        onConfirmar={({ motivo }) => enviar("descuento_fijar", motivo)}
        detalle={
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-40">
                <label className={label} htmlFor="dsc-tipo">Tipo</label>
                <select id="dsc-tipo" className={input} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                  <option value="PORCENTAJE">Porcentaje</option>
                  <option value="IMPORTE">Importe</option>
                </select>
              </div>
              <div className="w-32">
                <label className={label} htmlFor="dsc-valor">{tipo === "PORCENTAJE" ? "%" : "Pesos"}</label>
                <input id="dsc-valor" className={input} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "PORCENTAJE" ? "20" : "100.00"} />
              </div>
            </div>

            <fieldset>
              <legend className={label}>¿Cuánto dura?</legend>
              {([["COBROS", "Por número de cobros"], ["RANGO", "Por fechas"], ["INDEFINIDO", "Sin fecha de fin"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-14">
                  <input type="radio" name="dsc-forma" className="h-4 w-4" checked={forma === v} onChange={() => setForma(v)} />
                  {l}
                </label>
              ))}
            </fieldset>

            {forma === "COBROS" && (
              <div className="w-32">
                <label className={label} htmlFor="dsc-cobros">Cobros</label>
                <input id="dsc-cobros" className={input} inputMode="numeric" value={cobros} onChange={(e) => setCobros(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>
            )}
            {forma !== "COBROS" && (
              <div className="flex gap-3">
                <div>
                  <label className={label} htmlFor="dsc-desde">Desde</label>
                  <input id="dsc-desde" type="date" className={input} value={desde || hoy} onChange={(e) => setDesde(e.target.value)} />
                </div>
                {forma === "RANGO" && (
                  <div>
                    <label className={label} htmlFor="dsc-hasta">Hasta</label>
                    <input id="dsc-hasta" type="date" className={input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <p className={`text-13 ${previa.ok ? "text-ink-2" : "text-warning"}`} role="status">
              {previa.ok
                ? `${textoDescuento(previa.descuento, fmt)}, a los cobros desde el ${fechaLegible(previa.descuento.desde)}.`
                : previa.detalle}
            </p>
          </div>
        }
      />

      <DialogoConfirmar
        abierto={abierto === "quitar"}
        onCerrar={() => setAbierto(null)}
        titulo={`Quitar el descuento de ${nombre}`}
        descripcion="Desde hoy cada cobro vuelve a ser el total completo."
        nombreEsperado={nombre}
        sinNombre
        etiquetaBoton="Quitar descuento"
        textoOcupado="Quitando…"
        ocupado={ocupado}
        onConfirmar={({ motivo }) => enviar("descuento_quitar", motivo)}
      />
    </div>
  );
}
