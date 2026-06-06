"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  cfdiEmisorSchema,
  guardarCfdiEmisor,
  leerCfdiEmisor,
  PROVEEDORES_PAC,
  type CfdiEmisor,
} from "../../../lib/configuracion";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const PAC_LABEL: Record<string, string> = {
  FACTURAPI: "Facturapi",
  SOLUCIONFACTIBLE: "Solución Factible",
  FINKOK: "Finkok",
  EDICOM: "EDICOM",
  PRODIGIA: "Prodigia",
  OTRO: "Otro",
};
const ESTADOS = [
  { v: "PRUEBA", l: "Pruebas (sandbox)" },
  { v: "ACTIVO", l: "Activo (producción)" },
  { v: "INACTIVO", l: "Inactivo" },
] as const;

export default function CfdiPage() {
  const [emisor, setEmisor] = useState<CfdiEmisor | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [rfc, setRfc] = useState("");
  const [pac, setPac] = useState("FACTURAPI");
  const [ref, setRef] = useState("");
  const [vig, setVig] = useState("");
  const [estado, setEstado] = useState("PRUEBA");

  async function recargar() {
    try {
      const e = await leerCfdiEmisor();
      setEmisor(e);
      setRfc(e.rfc);
      setPac(e.proveedor_pac);
      setRef(e.facturama_issuer_ref ?? "");
      setVig(e.csd_vigencia_hasta ?? "");
      setEstado(e.estado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setEmisor(null);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function guardar() {
    setError(null);
    setOkMsg(null);
    const parsed = cfdiEmisorSchema.safeParse({
      rfc,
      proveedor_pac: pac,
      facturama_issuer_ref: ref,
      csd_vigencia_hasta: vig,
      estado,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await guardarCfdiEmisor(parsed.data);
      setOkMsg("Configuración CFDI guardada.");
      setTimeout(() => setOkMsg(null), 2500);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="CFDI / PAC"
        subtitulo="Proveedor de timbrado (PAC) y emisor con el que se certifican tus facturas ante el SAT."
        migas={[{ label: "Configuración" }, { label: "CFDI / PAC" }]}
      />
      <PageBody>
        {emisor === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {emisor === null && error && <p className="text-sm font-medium text-danger">{error}</p>}
        {emisor && (
          <div className="max-w-[680px]">
            <div className="mb-5 rounded-lg border border-[#CDE0F0] bg-[#EEF5FC] px-4 py-3 text-[12.5px] font-medium text-info">
              Mientras no haya credenciales de PAC configuradas en el servidor, el timbrado usa un
              <b> emisor de pruebas</b> (no genera CFDI válidos ante el SAT). Para producción se carga el CSD
              y la API key del PAC del lado del servidor.
            </div>

            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">Emisor</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="c-rfc">RFC emisor *</label>
                  <input id="c-rfc" className={input} value={rfc} maxLength={13}
                    onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, ""))} />
                </div>
                <div>
                  <label className={label} htmlFor="c-estado">Modo</label>
                  <select id="c-estado" className={input} value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADOS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-line bg-surface p-5">
              <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">Proveedor de timbrado (PAC)</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="c-pac">PAC</label>
                  <select id="c-pac" className={input} value={pac} onChange={(e) => setPac(e.target.value)}>
                    {PROVEEDORES_PAC.map((p) => <option key={p} value={p}>{PAC_LABEL[p] ?? p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="c-vig">Vigencia del CSD</label>
                  <input id="c-vig" type="date" className={input} value={vig} onChange={(e) => setVig(e.target.value)} />
                </div>
              </div>
              <div className="mt-4">
                <label className={label} htmlFor="c-ref">Referencia del emisor en el PAC</label>
                <input id="c-ref" className={input} value={ref} maxLength={100}
                  onChange={(e) => setRef(e.target.value)} placeholder="ID del emisor en el PAC (se asigna al subir el CSD)" />
                <p className="mt-1.5 text-[11.5px] text-ink-3">Opcional · se completa cuando el PAC provisiona el emisor con tu CSD.</p>
              </div>
            </div>

            {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}
            {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
              <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
