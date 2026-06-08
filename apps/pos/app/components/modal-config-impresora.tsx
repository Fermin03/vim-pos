"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { EpsonEposAdapter } from "../lib/print/epson-epos-adapter";
import { leerConfigImpresora, guardarConfigImpresora, type TipoImpresora } from "../lib/print/config";

const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

/** C3 — Configura la impresora del dispositivo (Preview en pantalla o Epson de red) + prueba. */
export function ModalConfigImpresora({ onCerrar }: { onCerrar: () => void }) {
  const inicial = leerConfigImpresora();
  const [tipo, setTipo] = useState<TipoImpresora>(inicial.tipo);
  const [ip, setIp] = useState(inicial.ip ?? "");
  const [ancho, setAncho] = useState<58 | 80>(inicial.ancho ?? 80);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  function guardar() {
    guardarConfigImpresora(tipo === "epson" ? { tipo, ip: ip.trim(), ancho } : { tipo: "preview" });
    onCerrar();
  }

  async function probar() {
    if (!ip.trim()) { setPrueba("Indica la IP de la impresora."); return; }
    setProbando(true); setPrueba(null);
    try {
      const estado = await new EpsonEposAdapter(ip.trim(), ancho).estado();
      setPrueba(estado === "LISTO" ? "✓ Impresora lista." : estado === "OFFLINE" ? "✗ Sin conexión (revisa IP/red)." : `Estado: ${estado}`);
    } catch {
      setPrueba("✗ No se pudo contactar la impresora.");
    } finally { setProbando(false); }
  }

  return (
    <Modal open onClose={onCerrar} title="Impresora de esta caja" className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <p className="mb-4 text-[12.5px] text-ink-3">La impresora es por dispositivo: se guarda solo en esta caja.</p>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["preview", "epson"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={["flex-1 rounded border px-3 py-2.5 text-[13px] font-semibold transition", tipo === t ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
              {t === "preview" ? "En pantalla (preview)" : "Epson (red)"}
            </button>
          ))}
        </div>

        {tipo === "epson" && (
          <>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">IP de la impresora</label>
              <input className={input} value={ip} inputMode="decimal" placeholder="192.168.1.50" onChange={(e) => setIp(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Ancho de papel</label>
              <div className="flex gap-2">
                {([80, 58] as const).map((a) => (
                  <button key={a} type="button" onClick={() => setAncho(a)} className={["flex-1 rounded border px-3 py-2 text-[13px] font-semibold transition", ancho === a ? "border-ink bg-sel" : "border-line-strong hover:border-ink"].join(" ")}>{a} mm</button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={probar} disabled={probando}>{probando ? "Probando…" : "Probar conexión"}</Button>
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
