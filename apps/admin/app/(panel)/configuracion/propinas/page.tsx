"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  guardarPropinas,
  leerPropinas,
  listarSucursales,
  propinasSchema,
  type Sucursal,
} from "../../../lib/configuracion";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export default function PropinasPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucId, setSucId] = useState<string>("");
  const [capturar, setCapturar] = useState(true);
  const [pcts, setPcts] = useState<string>("10, 15, 20");
  const [libre, setLibre] = useState(true);
  const [sin, setSin] = useState(true);
  const [redondear, setRedondear] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cargandoConfig, setCargandoConfig] = useState(false);

  useEffect(() => {
    listarSucursales()
      .then((ss) => {
        setSucursales(ss);
        if (ss.length > 0) setSucId(ss[0]!.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  useEffect(() => {
    if (!sucId) return;
    setCargandoConfig(true);
    leerPropinas(sucId)
      .then((p) => {
        if (p) {
          setCapturar(p.capturar_propina);
          setPcts(p.porcentajes_sugeridos.join(", "));
          setLibre(p.permitir_monto_libre);
          setSin(p.permitir_sin_propina);
          setRedondear(p.redondear_a_pesos);
        } else {
          // valores default
          setCapturar(true);
          setPcts("10, 15, 20");
          setLibre(true);
          setSin(true);
          setRedondear(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setCargandoConfig(false));
  }, [sucId]);

  function parsePcts(s: string): number[] {
    return s
      .split(/[,\s]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 100);
  }

  async function guardar() {
    setError(null);
    setOkMsg(null);
    const parsed = propinasSchema.safeParse({
      capturar_propina: capturar,
      porcentajes_sugeridos: parsePcts(pcts),
      permitir_monto_libre: libre,
      permitir_sin_propina: sin,
      redondear_a_pesos: redondear,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      await guardarPropinas(sucId, parsed.data);
      setOkMsg("Guardado.");
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Propinas"
        subtitulo="Cómo se sugieren y se cobran las propinas en cada sucursal."
        migas={[{ label: "Configuración" }, { label: "Propinas" }]}
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}

        {sucursales.length === 0 ? (
          <p className="text-sm text-ink-3">No hay sucursales. Crea una primero.</p>
        ) : (
          <div className="max-w-[640px]">
            <div className="mb-5">
              <label className={label} htmlFor="p-suc">Sucursal</label>
              <select id="p-suc" className={input} value={sucId} onChange={(e) => setSucId(e.target.value)}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            {cargandoConfig ? (
              <p className="text-sm text-ink-3">Cargando configuración…</p>
            ) : (
              <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5">
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#16161A]" checked={capturar} onChange={(e) => setCapturar(e.target.checked)} />
                  <div>
                    <div className="text-sm font-medium">Capturar propina en el cobro</div>
                    <div className="text-[12.5px] text-ink-3">Si lo apagas, el POS nunca pide propina.</div>
                  </div>
                </label>

                <div>
                  <label className={label} htmlFor="p-pcts">Porcentajes sugeridos</label>
                  <input id="p-pcts" className={input} value={pcts} onChange={(e) => setPcts(e.target.value)} placeholder="10, 15, 20" />
                  <p className="mt-1 text-[11.5px] text-ink-3">Separados por coma. Hasta 6 valores entre 0 y 100.</p>
                </div>

                <label className="flex items-start gap-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#16161A]" checked={libre} onChange={(e) => setLibre(e.target.checked)} />
                  <div>
                    <div className="text-sm font-medium">Permitir monto libre</div>
                    <div className="text-[12.5px] text-ink-3">El cliente puede teclear una cantidad distinta.</div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#16161A]" checked={sin} onChange={(e) => setSin(e.target.checked)} />
                  <div>
                    <div className="text-sm font-medium">Permitir “Sin propina”</div>
                    <div className="text-[12.5px] text-ink-3">Si lo apagas, hay que elegir al menos una sugerencia.</div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#16161A]" checked={redondear} onChange={(e) => setRedondear(e.target.checked)} />
                  <div>
                    <div className="text-sm font-medium">Redondear a pesos</div>
                    <div className="text-[12.5px] text-ink-3">Quita los centavos al calcular la propina.</div>
                  </div>
                </label>

                {okMsg && <p className="text-sm font-medium text-success">{okMsg}</p>}

                <div className="flex items-center justify-end border-t border-line pt-4">
                  <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
