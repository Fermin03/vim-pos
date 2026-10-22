"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { Tarjeta } from "../../../components/tarjeta";
import { Interruptor } from "../../../components/interruptor";
import { input, label } from "../../../components/campos";
import { leerPropinas, type Caja, type Sucursal } from "../../../lib/configuracion";
import { accionTerminal, mensajeErrorTerminal, type ConfigSucursal, type EstadoTerminal } from "../../../lib/terminal";

export const ESPERAS = [[60, "1 minuto"], [180, "3 minutos"], [300, "5 minutos"], [600, "10 minutos"]] as const;

export type Correr = (
  cuerpo: Parameters<typeof accionTerminal>[0],
  hecho: string | ((r: Record<string, unknown>) => string),
  funcion?: "terminal-clip-conexion",
) => Promise<Record<string, unknown> | null>;
type Lector = { serie: string; estado: string };

/** Formulario para conectar Clip. Las claves viven solo en este estado y se borran al guardar, salga como salga. */
export function ConectarClip({ ocupado, onConectar, onCerrar }: {
  ocupado: boolean; onConectar: (apiKey: string, secreto: string) => Promise<void>; onCerrar: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [secreto, setSecreto] = useState("");
  async function guardar() {
    const k = apiKey.trim(), s = secreto.trim();
    setApiKey(""); setSecreto("");
    await onConectar(k, s);
  }
  return (
    <Tarjeta titulo="Conectar Clip" descripcion="VIM POS cobra con tu lector Clip PinPad. El dinero cae directo en tu cuenta de Clip.">
      <ol className="mb-4 list-decimal pl-5 text-13 text-ink-2">
        <li>Entra a tu cuenta de Clip y abre <b className="text-ink">Panel de Desarrollador &gt; Credenciales</b>.</li>
        <li>Crea una credencial nueva solo para VIM POS.</li>
        <li>Copia la API key y la clave secreta. La clave secreta solo se muestra una vez: pégala aquí antes de cerrar esa página.</li>
      </ol>
      <form className="flex flex-col gap-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <div>
          <label className={label} htmlFor="clip-api-key">API key</label>
          <input id="clip-api-key" className={input} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="clip-secreto">Clave secreta</label>
          <input id="clip-secreto" className={input} type="password" autoComplete="off" value={secreto} onChange={(e) => setSecreto(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={ocupado || apiKey.trim() === "" || secreto.trim() === ""}>{ocupado ? "Conectando…" : "Conectar Clip"}</Button>
          <Button type="button" variant="ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</Button>
        </div>
      </form>
    </Tarjeta>
  );
}

/** Una sucursal que cobra con Clip: espera, impresión, propinas y el lector de cada caja. Sin coordenadas. */
export function ClipSucursal({ sucursal, cajas, cfg, t, ocupado, correr, setError }: {
  sucursal: Sucursal; cajas: Caja[]; cfg: ConfigSucursal; t: EstadoTerminal; ocupado: boolean;
  correr: Correr; setError: (e: string | null) => void;
}) {
  const [lectores, setLectores] = useState<Lector[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [elegido, setElegido] = useState<Record<string, string>>({});
  const [propinas, setPropinas] = useState<string[]>(() => [0, 1, 2].map((i) => String(cfg.propina_opciones?.[i] ?? "")));
  // Lo que se guardó desde Mercado Pago puede traer el interruptor sin porcentajes: eso es apagado.
  const enLector = cfg.propina_en_terminal && Boolean(cfg.propina_opciones?.length);
  const sinGuardadas = !cfg.propina_opciones?.length;

  // Sin porcentajes guardados para el lector se proponen los de la propina de la caja (hasta tres).
  useEffect(() => {
    if (!sinGuardadas) return;
    let vivo = true;
    leerPropinas(sucursal.id)
      .then((p) => {
        const sug = (p?.porcentajes_sugeridos ?? [10, 15, 20]).filter((n) => Number.isInteger(n) && n >= 1 && n <= 100).slice(0, 3);
        if (vivo && sug.length) setPropinas((act) => (act.every((x) => x.trim() === "") ? [0, 1, 2].map((i) => String(sug[i] ?? "")) : act));
      })
      .catch(() => { /* sin propuesta: los campos quedan vacíos */ });
    return () => { vivo = false; };
  }, [sinGuardadas, sucursal.id]);

  useEffect(() => {
    let vivo = true;
    accionTerminal({ accion: "lectores", conexion_id: cfg.conexion_id }, "terminal-clip-conexion")
      .then((r) => { if (vivo) setLectores(Array.isArray(r.lectores) ? (r.lectores as Lector[]) : []); })
      .catch((e) => { if (vivo) { setLectores([]); setFallo(true); setError(mensajeErrorTerminal(e)); } });
    return () => { vivo = false; };
  }, [cfg.conexion_id, setError]);

  const configurar = (cambios: Partial<Pick<ConfigSucursal, "imprime_terminal" | "espera_segundos" | "propina_opciones" | "propina_en_terminal">>) => correr({
    accion: "configurar", sucursal_id: sucursal.id, imprime_terminal: cfg.imprime_terminal,
    // Lo guardado puede venir de Mercado Pago (desde 30 s); Clip pide al menos 60.
    espera_segundos: Math.max(60, cfg.espera_segundos), propina_opciones: cfg.propina_opciones, propina_en_terminal: enLector, ...cambios,
  }, (r) => r.aviso === "LECTORES_SIN_CONFIGURAR" ? "Guardado, pero Clip no recibió el tiempo de espera en los lectores. Vuelve a guardar en un momento." : "Guardado.", "terminal-clip-conexion");

  /** Los porcentajes escritos, o null (con el error a la vista) si alguno no vale o, con el lector encendido, no hay ninguno. */
  function porcentajes(conLector: boolean): number[] | null {
    const nums = propinas.map((p) => p.trim()).filter((p) => p !== "").map(Number);
    const error = nums.some((n) => !Number.isInteger(n) || n < 1 || n > 100) ? "PROPINA_INVALIDA"
      : conLector && nums.length === 0 ? "PROPINA_SIN_PORCENTAJES" : null;
    if (error) { setError(mensajeErrorTerminal(error)); return null; }
    return nums;
  }

  function guardarPropinas() {
    const nums = porcentajes(enLector);
    if (nums) void configurar({ propina_opciones: nums.length ? nums : null });
  }

  function cambiarPropinaEnLector(v: boolean) {
    if (!v) { void configurar({ propina_en_terminal: false }); return; }
    // Al encender se guardan también los porcentajes a la vista (pueden ser los propuestos).
    const nums = porcentajes(true);
    if (nums) void configurar({ propina_en_terminal: true, propina_opciones: nums });
  }

  const cuenta = t.conexiones.find((c) => c.id === cfg.conexion_id);
  return (
    <Tarjeta titulo={sucursal.nombre} descripcion={<>Cobra en <b className="text-ink">{cuenta?.cuenta_nombre ?? "tu cuenta de Clip"}</b>.</>}>
      <div className="flex flex-col gap-4">
        <Interruptor
          etiqueta="El lector imprime su comprobante"
          descripcion={cfg.imprime_terminal ? "Imprime su comprobante después de cada cobro." : "No imprime nada; el ticket lo da la caja."}
          encendido={cfg.imprime_terminal} ocupado={ocupado}
          onCambiar={(v) => void configurar({ imprime_terminal: v })}
        />
        <div className="max-w-[260px]">
          <label className={label} htmlFor={`espera-${sucursal.id}`}>Tiempo para pagar en el lector</label>
          <select
            id={`espera-${sucursal.id}`} className={input} value={Math.max(60, cfg.espera_segundos)} disabled={ocupado}
            onChange={(e) => void configurar({ espera_segundos: Number(e.target.value) })}
          >
            {ESPERAS.map(([seg, texto]) => <option key={seg} value={seg}>{texto}</option>)}
            {cfg.espera_segundos > 60 && !ESPERAS.some(([seg]) => seg === cfg.espera_segundos) && <option value={cfg.espera_segundos}>{cfg.espera_segundos} segundos</option>}
          </select>
          <p className="mt-1.5 text-13 text-ink-3">Si el cliente no paga en ese tiempo, el cobro se cancela solo.</p>
        </div>

        <Interruptor
          etiqueta="El cliente elige la propina en la terminal"
          descripcion={enLector ? "Al pagar con tarjeta, el lector le ofrece estos porcentajes. La caja ya no la pregunta." : "El lector no pregunta la propina."}
          encendido={enLector} ocupado={ocupado}
          onCambiar={cambiarPropinaEnLector}
        />
        <div>
          <span className={label}>Porcentajes de propina</span>
          <div className="flex flex-wrap items-center gap-2">
            {propinas.map((p, i) => (
              <input
                key={i} className={`${input} !w-20`} type="number" inputMode="numeric" min={1} max={100} step={1}
                aria-label={`Porcentaje de propina ${i + 1}`} value={p} disabled={ocupado}
                onChange={(e) => setPropinas(propinas.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
            <Button variant="ghost" disabled={ocupado} onClick={guardarPropinas}>Guardar</Button>
          </div>
          <p className="mt-1.5 text-13 text-ink-3">
            {sinGuardadas ? "Propuestos a partir de las propinas de la caja. Hasta tres, del 1 al 100." : "Hasta tres, del 1 al 100."}
          </p>
        </div>

        <div>
          <h3 className="mb-1 text-13 font-bold uppercase tracking-wide text-ink-3">Cajas</h3>
          {lectores?.length === 0 && !fallo && (
            <p className="mb-2 text-sm text-ink-2">Falta que Clip instale la app PinPad en tu lector: escribe a sdk@payclip.com con el número de serie.</p>
          )}
          {cajas.length === 0 && <p className="text-sm text-ink-2">Esta sucursal no tiene cajas activas.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {cajas.map((c) => {
              // Si la sucursal venía de Mercado Pago, la caja aún tiene su terminal (inactiva): no es un lector de Clip.
              const actual = t.dispositivos.find((x) => x.caja_id === c.id && x.conexion_id === cfg.conexion_id)?.terminal_id_externo ?? null;
              const serie = elegido[c.id] ?? "";
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-15 font-semibold">{c.nombre}</div>
                    <div className="text-13 text-ink-2">
                      {actual ? <>Lector {actual} · <span className="font-semibold text-success">La caja le manda el cobro</span></> : "Sin lector."}
                    </div>
                  </div>
                  {lectores && lectores.length > 0 && (
                    <>
                      <select
                        className={`${input} !w-auto min-w-[200px]`} aria-label={`Lector de ${c.nombre}`} value={serie} disabled={ocupado}
                        onChange={(e) => setElegido({ ...elegido, [c.id]: e.target.value })}
                      >
                        <option value="">Elige un lector</option>
                        {lectores.map((l) => <option key={l.serie} value={l.serie}>{l.serie} · {l.estado === "active" ? "activo" : "no activo"}</option>)}
                      </select>
                      <Button variant="ghost" disabled={ocupado || serie === "" || serie === actual}
                        onClick={() => void correr({ accion: "caja", caja_id: c.id, serie }, `${c.nombre} cobrará con el lector ${serie}.`, "terminal-clip-conexion")}>
                        Usar este lector
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Tarjeta>
  );
}
