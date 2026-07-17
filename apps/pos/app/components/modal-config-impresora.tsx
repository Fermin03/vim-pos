"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { EpsonEposAdapter } from "../lib/print/epson-epos-adapter";
import { RawSocketAdapter } from "../lib/print/raw-socket-adapter";
import { leerConfigImpresora, guardarConfigImpresora, PUERTO_RAW, type TipoImpresora } from "../lib/print/config";
import type { PrintJob } from "../lib/print/tipos";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/** Ticket corto para la prueba física (sale papel: confirma corte y alineación). */
function jobPrueba(ancho: 58 | 80): PrintJob {
  return {
    tipo: "TICKET",
    ancho,
    destino: "CAJA",
    bloques: [
      { t: "texto", valor: "VIM POS", align: "centro", size: 2, bold: true },
      { t: "texto", valor: "Prueba de impresora", align: "centro" },
      { t: "separador", estilo: "punteado" },
      { t: "fila", izq: "Estado", der: "OK" },
      { t: "fila", izq: "Ancho", der: `${ancho} mm` },
      { t: "texto", valor: "Si lees esto, la impresora quedo lista.", align: "centro" },
      { t: "corte" },
    ],
  };
}

/** C3 — Configura la impresora del dispositivo (Preview / Epson red / Genérica RAW 9100) + prueba. */
export function ModalConfigImpresora({ onCerrar }: { onCerrar: () => void }) {
  const inicial = leerConfigImpresora();
  const [tipo, setTipo] = useState<TipoImpresora>(inicial.tipo);
  const [ip, setIp] = useState(inicial.ip ?? "");
  const [puerto, setPuerto] = useState(String(inicial.puerto ?? PUERTO_RAW));
  const [ancho, setAncho] = useState<58 | 80>(inicial.ancho ?? 80);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  const esRed = tipo === "epson" || tipo === "generica";

  function guardar() {
    if (tipo === "epson") guardarConfigImpresora({ tipo, ip: ip.trim(), ancho });
    else if (tipo === "generica") guardarConfigImpresora({ tipo, ip: ip.trim(), puerto: Number(puerto) || PUERTO_RAW, ancho });
    else guardarConfigImpresora({ tipo: "preview" });
    onCerrar();
  }

  async function probar() {
    if (!ip.trim()) { setPrueba("Indica la IP de la impresora."); return; }
    setProbando(true); setPrueba(null);
    try {
      if (tipo === "generica") {
        // Prueba real: imprime un ticket. Es la única forma fiable de saber si el 9100 responde.
        const imp = new RawSocketAdapter(ip.trim(), Number(puerto) || PUERTO_RAW, ancho);
        const r = await imp.imprimir(jobPrueba(ancho));
        setPrueba(r.ok ? "✓ Enviado. Revisa que haya salido el ticket de prueba." : r.motivo === "OFFLINE" ? "✗ No se pudo conectar (revisa IP, puerto y que esté en la misma red)." : "✗ Error al imprimir.");
      } else {
        const estado = await new EpsonEposAdapter(ip.trim(), ancho).estado();
        setPrueba(estado === "LISTO" ? "✓ Impresora lista." : estado === "OFFLINE" ? "✗ Sin conexión (revisa IP/red)." : `Estado: ${estado}`);
      }
    } catch {
      setPrueba("✗ No se pudo contactar la impresora.");
    } finally { setProbando(false); }
  }

  return (
    <Modal open onClose={onCerrar} title="Impresora de esta caja" className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <p className="mb-4 text-[12.5px] text-ink-3">La impresora es por dispositivo: se guarda solo en esta caja.</p>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["preview", "generica", "epson"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setTipo(t); setPrueba(null); }} className={["flex-1 rounded border px-2 py-2.5 text-[12.5px] font-semibold transition", tipo === t ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
              {t === "preview" ? "En pantalla" : t === "generica" ? "Genérica (red)" : "Epson (red)"}
            </button>
          ))}
        </div>

        {tipo === "generica" && (
          <p className="rounded border border-line bg-hover px-3 py-2 text-[12px] text-ink-2">
            Impresora ESC/POS de red por el puerto 9100 (Soluciones MyPOS, Xprinter, 3nStar, etc.). La IP y el puerto salen del <b>self-test</b> de la impresora.
          </p>
        )}

        {esRed && (
          <>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">IP de la impresora</label>
              <input className={input} value={ip} inputMode="decimal" placeholder="192.168.0.21" onChange={(e) => setIp(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            {tipo === "generica" && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Puerto</label>
                <input className={input} value={puerto} inputMode="numeric" placeholder="9100" onChange={(e) => setPuerto(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Ancho de papel</label>
              <div className="flex gap-2">
                {([80, 58] as const).map((a) => (
                  <button key={a} type="button" onClick={() => setAncho(a)} className={["flex-1 rounded border px-3 py-2 text-[13px] font-semibold transition", ancho === a ? "border-ink bg-sel" : "border-line-strong hover:border-ink"].join(" ")}>{a} mm</button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={probar} disabled={probando}>{probando ? "Probando…" : tipo === "generica" ? "Imprimir prueba" : "Probar conexión"}</Button>
            {prueba && <p className={`text-[13px] font-medium ${prueba.startsWith("✓") ? "text-success" : "text-danger"}`}>{prueba}</p>}
          </>
        )}

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
