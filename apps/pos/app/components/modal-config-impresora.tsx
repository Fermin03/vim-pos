"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { EpsonEposAdapter } from "../lib/print/epson-epos-adapter";
import { RawSocketAdapter } from "../lib/print/raw-socket-adapter";
import {
  leerConfigImpresoras,
  guardarConfigImpresoras,
  PUERTO_RAW,
  ESTACIONES,
  NOMBRE_ESTACION,
  type TipoImpresora,
  type ConfigImpresora,
  type ConfigImpresoras,
  type IdEstacion,
  type Destino,
} from "../lib/print/config";
import type { PrintJob } from "../lib/print/tipos";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/** Ticket corto para la prueba física (sale papel: confirma corte y alineación). */
function jobPrueba(ancho: 58 | 80, estacion: string): PrintJob {
  return {
    tipo: "TICKET",
    ancho,
    destino: "CAJA",
    bloques: [
      { t: "texto", valor: "VIM POS", align: "centro", size: 2, bold: true },
      { t: "texto", valor: `Prueba de impresora · ${estacion}`, align: "centro" },
      { t: "separador", estilo: "punteado" },
      { t: "fila", izq: "Estado", der: "OK" },
      { t: "fila", izq: "Ancho", der: `${ancho} mm` },
      { t: "texto", valor: "Si lees esto, la impresora quedo lista.", align: "centro" },
      { t: "corte" },
    ],
  };
}

/** C3 — Configura las 2 estaciones de impresión del dispositivo (Preview / Epson red / Genérica
 *  RAW 9100) + a qué estación va cada tipo de documento (caja o cocina) + prueba física. */
export function ModalConfigImpresora({ onCerrar }: { onCerrar: () => void }) {
  const inicial = leerConfigImpresoras();
  const [cfg, setCfg] = useState<ConfigImpresoras>(inicial);
  const [estacionActiva, setEstacionActiva] = useState<IdEstacion>("estacion1");
  const [prueba, setPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  const actual = cfg.estaciones[estacionActiva];
  const esRed = actual.tipo === "epson" || actual.tipo === "generica";

  function actualizarEstacion(patch: Partial<ConfigImpresora>) {
    setCfg((c) => ({ ...c, estaciones: { ...c.estaciones, [estacionActiva]: { ...c.estaciones[estacionActiva], ...patch } } }));
    setPrueba(null);
  }

  function asignar(destino: Destino, estacion: IdEstacion) {
    setCfg((c) => ({ ...c, asignacion: { ...c.asignacion, [destino]: estacion } }));
  }

  function guardar() {
    guardarConfigImpresoras(cfg);
    onCerrar();
  }

  async function probar() {
    const ip = (actual.ip ?? "").trim();
    const ancho = actual.ancho ?? 80;
    if (esRed && !ip) { setPrueba("Indica la IP de la impresora."); return; }
    setProbando(true); setPrueba(null);
    try {
      if (actual.tipo === "generica") {
        // Prueba real: imprime un ticket. Es la única forma fiable de saber si el 9100 responde.
        const imp = new RawSocketAdapter(ip, actual.puerto ?? PUERTO_RAW, ancho);
        const r = await imp.imprimir(jobPrueba(ancho, NOMBRE_ESTACION[estacionActiva]));
        setPrueba(r.ok ? "✓ Enviado. Revisa que haya salido el ticket de prueba." : r.motivo === "OFFLINE" ? "✗ No se pudo conectar (revisa IP, puerto y que esté en la misma red)." : "✗ Error al imprimir.");
      } else if (actual.tipo === "epson") {
        const estado = await new EpsonEposAdapter(ip, ancho).estado();
        setPrueba(estado === "LISTO" ? "✓ Impresora lista." : estado === "OFFLINE" ? "✗ Sin conexión (revisa IP/red)." : `Estado: ${estado}`);
      }
    } catch {
      setPrueba("✗ No se pudo contactar la impresora.");
    } finally { setProbando(false); }
  }

  return (
    <Modal open onClose={onCerrar} title="Impresoras de esta caja" className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <p className="mb-4 text-[12.5px] text-ink-3">Las impresoras son por dispositivo: se guardan solo en esta caja.</p>

      {/* Selector de estación a configurar */}
      <div className="mb-3 flex gap-2">
        {ESTACIONES.map((e) => (
          <button key={e} type="button" onClick={() => { setEstacionActiva(e); setPrueba(null); }} className={["flex-1 rounded border px-2 py-2.5 text-[12.5px] font-semibold transition", estacionActiva === e ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {NOMBRE_ESTACION[e]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["preview", "generica", "epson"] as const).map((t: TipoImpresora) => (
            <button key={t} type="button" onClick={() => actualizarEstacion({ tipo: t })} className={["flex-1 rounded border px-2 py-2.5 text-[12.5px] font-semibold transition", actual.tipo === t ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
              {t === "preview" ? "En pantalla" : t === "generica" ? "Genérica (red)" : "Epson (red)"}
            </button>
          ))}
        </div>

        {actual.tipo === "generica" && (
          <p className="rounded border border-line bg-hover px-3 py-2 text-[12px] text-ink-2">
            Impresora ESC/POS de red por el puerto 9100 (Soluciones MyPOS, Xprinter, 3nStar, etc.). La IP y el puerto salen del <b>self-test</b> de la impresora.
          </p>
        )}

        {esRed && (
          <>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">IP de la impresora</label>
              <input className={input} value={actual.ip ?? ""} inputMode="decimal" placeholder="192.168.0.21" onChange={(e) => actualizarEstacion({ ip: e.target.value.replace(/[^0-9.]/g, "") })} />
            </div>
            {actual.tipo === "generica" && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Puerto</label>
                <input className={input} value={String(actual.puerto ?? PUERTO_RAW)} inputMode="numeric" placeholder="9100" onChange={(e) => actualizarEstacion({ puerto: Number(e.target.value.replace(/[^0-9]/g, "")) || PUERTO_RAW })} />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Ancho de papel</label>
              <div className="flex gap-2">
                {([80, 58] as const).map((a) => (
                  <button key={a} type="button" onClick={() => actualizarEstacion({ ancho: a })} className={["flex-1 rounded border px-3 py-2 text-[13px] font-semibold transition", (actual.ancho ?? 80) === a ? "border-ink bg-sel" : "border-line-strong hover:border-ink"].join(" ")}>{a} mm</button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={probar} disabled={probando}>{probando ? "Probando…" : actual.tipo === "generica" ? "Imprimir prueba" : "Probar conexión"}</Button>
            {prueba && <p className={`text-[13px] font-medium ${prueba.startsWith("✓") ? "text-success" : "text-danger"}`}>{prueba}</p>}
          </>
        )}

        {/* Qué imprime cada estación */}
        <div className="mt-1 rounded border border-line p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-2">¿Qué imprime cada estación?</p>
          <AsignacionRow label="Tickets y cortes (caja)" destino="CAJA" valor={cfg.asignacion.CAJA} onCambiar={(e) => asignar("CAJA", e)} />
          <AsignacionRow label="Comandas (cocina)" destino="COCINA" valor={cfg.asignacion.COCINA} onCambiar={(e) => asignar("COCINA", e)} />
          {cfg.asignacion.CAJA === cfg.asignacion.COCINA && (
            <p className="mt-2 text-[11.5px] text-ink-3">Con la misma estación para ambos, la comanda no se manda sola al cobrar (evita duplicar en el mismo papel); se imprime solo si la pides manualmente.</p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}

function AsignacionRow({ label, valor, onCambiar }: { label: string; destino: Destino; valor: IdEstacion; onCambiar: (e: IdEstacion) => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 last:mb-0">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <div className="flex gap-1">
        {ESTACIONES.map((e) => (
          <button key={e} type="button" onClick={() => onCambiar(e)} className={["rounded border px-2 py-1 text-[11.5px] font-semibold transition", valor === e ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {NOMBRE_ESTACION[e]}
          </button>
        ))}
      </div>
    </div>
  );
}
