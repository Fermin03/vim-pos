import { describe, it, expect, afterEach, vi } from "vitest";
import { RawSocketAdapter } from "../raw-socket-adapter";
import { PreviewAdapter } from "../preview-adapter";

/**
 * abrirCajon() maneja dinero: si la impresora no responde, el cajero DEBE enterarse — antes
 * el resultado del relay se descartaba en silencio y la función siempre "tenía éxito" aunque
 * el pulso nunca llegara al cajón.
 */
describe("abrirCajon devuelve el resultado real (no lo descarta)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("RawSocketAdapter: propaga el fallo cuando el relay dice que no llegó", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: false, motivo: "OFFLINE" }) }));
    const adp = new RawSocketAdapter("192.168.0.21");
    const r = await adp.abrirCajon();
    expect(r).toEqual({ ok: false, motivo: "OFFLINE" });
  });

  it("RawSocketAdapter: propaga el éxito cuando el relay confirma", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));
    const adp = new RawSocketAdapter("192.168.0.21");
    const r = await adp.abrirCajon();
    expect(r).toEqual({ ok: true });
  });

  it("RawSocketAdapter: sin relay (navegador normal) reporta OFFLINE, no éxito silencioso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const adp = new RawSocketAdapter("192.168.0.21");
    const r = await adp.abrirCajon();
    expect(r.ok).toBe(false);
  });

  it("PreviewAdapter: sin impresora configurada, no finge éxito", async () => {
    const adp = new PreviewAdapter(() => {});
    const r = await adp.abrirCajon();
    expect(r.ok).toBe(false);
  });
});
