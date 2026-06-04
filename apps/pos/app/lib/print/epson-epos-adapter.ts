import type { PrinterAdapter } from "./adapter";
import type { Bloque, PrintJob, PrintResult } from "./tipos";

/**
 * @sin-verificar — NO se usa en F5.3 (no hay impresora). Listo para enchufar cuando
 * llegue la Epson de red (ePOS-Print). Hace POST del XML ePOS al endpoint del printer.
 * Doc 16 §4.1. Verificar con hardware real antes del go-live (checklist doc 16 §11).
 */
export class EpsonEposAdapter implements PrinterAdapter {
  nombre = "Epson ePOS (red)";
  constructor(private ip: string, private ancho: 58 | 80 = 80) {}

  async imprimir(job: PrintJob): Promise<PrintResult> {
    const xml = jobAEposXml(job);
    try {
      const res = await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
        body: xml,
      });
      if (!res.ok) return { ok: false, motivo: "ERROR" };
      const body = await res.text();
      if (/success="true"/.test(body)) return { ok: true };
      if (/PaperEnd|cover/i.test(body)) return { ok: false, motivo: "SIN_PAPEL" };
      return { ok: false, motivo: "ERROR" };
    } catch {
      return { ok: false, motivo: "OFFLINE" };
    }
  }

  async estado() {
    try {
      const res = await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer`, { method: "GET" });
      return res.ok ? ("LISTO" as const) : ("ERROR" as const);
    } catch {
      return "OFFLINE" as const;
    }
  }

  async abrirCajon() {
    const xml = sobreEpos(`<pulse drawer="drawer1" time="pulse_100" />`);
    await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
      body: xml,
    }).catch(() => {});
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bloqueAEposXml(bl: Bloque): string {
  switch (bl.t) {
    case "texto": {
      const al = bl.align ?? "izq";
      const align = al === "centro" ? "center" : al === "der" ? "right" : "left";
      const w = bl.size === 3 ? 3 : bl.size === 2 ? 2 : 1;
      return `<text align="${align}" width="${w}" height="${w}" em="${bl.bold ? "true" : "false"}">${esc(bl.valor)}&#10;</text>`;
    }
    case "fila": {
      const n = 48;
      const gap = Math.max(1, n - bl.izq.length - bl.der.length);
      return `<text align="left">${esc(bl.izq + " ".repeat(gap) + bl.der)}&#10;</text>`;
    }
    case "separador":
      return `<text align="left">${(bl.estilo === "solido" ? "=" : "-").repeat(48)}&#10;</text>`;
    case "qr":
      return `<symbol type="qrcode_model_2" level="level_m" width="6">${esc(bl.valor)}</symbol>`;
    case "corte":
      return `<feed line="3" /><cut type="feed" />`;
  }
}

function sobreEpos(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${inner}</epos-print></s:Body>
</s:Envelope>`;
}

export function jobAEposXml(job: PrintJob): string {
  return sobreEpos(job.bloques.map(bloqueAEposXml).join(""));
}
